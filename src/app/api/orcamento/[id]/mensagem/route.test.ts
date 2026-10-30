import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  estado: "pendente" as string,
  /** O nome do cliente no pedido. Um pedido criado a partir de um telefonema
   *  pode não ter nenhum — e é aí que o `{nome}` fica sem por onde se resolver. */
  nome: "Ana Silva" as string,
  /** A língua do pedido (`quote.locale`), gravada quando o formulário público
   *  foi submetido — ausente nos pedidos anteriores a esse campo. */
  locale: undefined as string | undefined,
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          name: store.nome,
          email: "ana@x.pt",
          status: store.estado,
          locale: store.locale,
          messages: [{ at: "t0", body: "old" }],
        }
      : null,
  ),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
/** Quem tem a sessão iniciada, tal como o token assinado a traria. */
const sessao = vi.hoisted(() => ({
  nome: "" as string,
  /** O que o perfil da conta diz — vazio quando não há `ADMIN_USERS`. */
  perfil: {} as { nome?: string; cargo?: string },
}));
vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => authed.ok,
  ADMIN_COOKIE: "liquen_admin",
  readSession: (token: string | undefined) => (token ? { name: sessao.nome } : null),
  /** A assinatura ESCRITA no perfil da conta (`assina` no `ADMIN_USERS`).
   *  Vazio = assina a casa, que é o comportamento certo sem contas
   *  configuradas — e o que impede um nome adivinhado a partir de um endereço
   *  de email de ir parar ao fundo de uma proposta. */
  assinaturaConfigurada: () => sessao.perfil,
}));
vi.mock("@/lib/quotes-store", () => ({ getQuote: store.get, updateQuote: store.update }));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  store.nome = "Ana Silva";
  store.locale = undefined;
  sessao.nome = "";
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/mensagem", () => {
  it("rejects the unauthenticated with 401 and sends nothing", async () => {
    const res = await POST(req({ message: "Olá" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.get).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown quote", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Olá" }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(mail.send).not.toHaveBeenCalled();
  });

  /**
   * O ecrã diz «erro ao enviar» a um 500, e isso lê-se como «o correio
   * avariou» — leva a carregar outra vez em Enviar. Um corpo que não é JSON é
   * um pedido errado, e tem de o dizer.
   */
  it("answers 400 (not 500) to a malformed or non-object body, and não envia nada", async () => {
    authed.ok = true;
    const cru = (corpo: string) =>
      new Request("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
      }) as unknown as NextRequest;
    for (const corpo of ["{ isto não é JSON", "null", '"uma string"', "[]"]) {
      const res = await POST(cru(corpo), ctx("LIQ-1"));
      expect(res.status, corpo).toBe(400);
    }
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) message with 400", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "   " }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("emails the client and appends the message to the quote's log", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Nova mensagem" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "ana@x.pt" });
    // The existing message is preserved and the new one appended (not clobbered).
    // `objectContaining` e não igualdade exacta: responder passou também a subir
    // o estado para «Aguardar resposta» (ver o bloco no fim deste ficheiro). O
    // que ESTE teste guarda é o histórico — que a mensagem antiga sobrevive e a
    // nova é acrescentada, nunca substituída.
    expect(store.update).toHaveBeenCalledWith(
      "LIQ-1",
      expect.objectContaining({
        messages: [{ at: "t0", body: "old" }, expect.objectContaining({ body: "Nova mensagem" })],
      }),
    );
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RESPONDER PÕE O PEDIDO EM «AGUARDAR RESPOSTA»
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Enviar uma mensagem só acrescentava uma linha ao histórico: na lista, o pedido
 * continuava em «Novo», indistinguível de um a que ninguém tinha tocado. A única
 * forma de saber que já se tinha respondido era abrir e ler.
 *
 * O que estes testes guardam não é o valor do campo — é a REGRA: a bola passa
 * para o lado do cliente quando lhe respondemos, e nunca anda para trás.
 */
describe("POST /api/orcamento/[id]/mensagem — o estado segue a conversa", () => {
  it("um pedido novo passa a «Aguardar resposta» quando lhe respondemos", async () => {
    authed.ok = true;
    store.estado = "pendente";
    const res = await POST(req({ message: "Olá! Já vos respondo com a proposta." }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith(
      "LIQ-1",
      expect.objectContaining({ status: "em_revisao" }),
    );
  });

  /**
   * Um estado que anda para trás sozinho é a maneira mais rápida de ela deixar
   * de confiar na coluna. Mandar uma nota a um casamento já fechado não o
   * desfecha.
   */
  for (const estado of ["cotado", "aceite", "rejeitado"]) {
    it(`não faz recuar um pedido que já está em «${estado}»`, async () => {
      authed.ok = true;
      store.estado = estado;
      await POST(req({ message: "Uma nota rápida." }), ctx("LIQ-1"));
      const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(patch, "o estado nem sequer é tocado").not.toHaveProperty("status");
    });
  }

  it("não reescreve o estado de quem já está a aguardar resposta", async () => {
    authed.ok = true;
    store.estado = "em_revisao";
    await POST(req({ message: "Segue o link das fotografias." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("status");
  });

  /**
   * A mudança passou a deixar rasto. Antes, a coluna mudava e não havia onde ir
   * ver porquê — e uma coluna que muda sem explicação é pior do que uma parada.
   * A entrada é assinada pelo «Sistema» para se distinguir, na mesma lista, do
   * que foi ela a mudar à mão.
   */
  it("deixa no histórico a linha que explica a mudança automática", async () => {
    authed.ok = true;
    store.estado = "pendente";
    await POST(req({ message: "Olá! Já vos respondo com a proposta." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as {
      activityLog?: { actor?: string; summary: string }[];
    };
    expect(patch.activityLog).toHaveLength(1);
    expect(patch.activityLog![0].actor).toBe("Sistema");
    expect(patch.activityLog![0].summary).toBe("Novo → Aguardar resposta · respondemos ao cliente");
  });

  it("sem mudança de estado não escreve linha nenhuma — a lista dela já é longa", async () => {
    authed.ok = true;
    store.estado = "cotado";
    await POST(req({ message: "Uma nota rápida." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("activityLog");
  });

  it("a mensagem continua a ser guardada em qualquer dos casos", async () => {
    authed.ok = true;
    store.estado = "aceite";
    await POST(req({ message: "Confirmado para as 15h." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: unknown[] };
    expect(patch.messages).toHaveLength(2);
  });
});

/**
 * A ASSINATURA DA CASA — a mesma em todo o correio que sai para um cliente.
 *
 * Esta rota escrevia o seu próprio rodapé («Líquen Events · email · telefone»),
 * uma de cinco cópias da mesma linha espalhadas por cinco ficheiros. Passa a
 * vir do `email-assinatura`, que é o único sítio onde os contactos existem.
 */
describe("POST /api/orcamento/[id]/mensagem — assinatura", () => {
  it("assina a mensagem ao cliente, no HTML e no texto simples", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá! Já vos respondo." }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as {
      html: string;
      text: string;
      attachments?: { cid?: string }[];
    };
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain("+351 919 259 820");
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain("+351 919 259 820");
    // O logótipo viaja com a mensagem: nada de imagens remotas.
    // A faixa da casa viaja COM a mensagem — nada de imagens remotas.
    expect(env.attachments?.some((a) => a.cid === "liquen-banner")).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("deixou de escrever o rodapé à mão", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá!" }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string };
    expect(env.html).not.toContain("Líquen Events · ");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O `{nome}` ESCRITO À MÃO NÃO PODE CHEGAR CRU AO CLIENTE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O `{nome}` era substituído no CLIQUE do modelo, no ecrã, e mais lado nenhum.
 * Só que o mesmo back office tem um ecrã «Modelos de email» que lhe ensina —
 * com botões que o inserem — que `{nome}` é um campo de fusão. Quem aprende
 * isso ali escreve-o também aqui, à mão, e o cliente recebia «Olá {nome},».
 *
 * Passa a resolver-se no ENVIO, que é o único momento em que a mensagem existe
 * por inteiro: vale para o que veio do modelo, para o que ela escreveu, e para
 * o que uma versão futura do ecrã mandar. E o histórico guarda o que o cliente
 * LEU — senão a conversa gravada fica diferente da que aconteceu.
 */
describe("POST /api/orcamento/[id]/mensagem — o campo de fusão {nome}", () => {
  const enviado = () => mail.send.mock.calls.at(-1)![0] as { html: string; text: string };

  it("substitui o {nome} escrito à mão pelo primeiro nome do cliente", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá {nome},\n\nFicamos à espera." }), ctx("LIQ-1"));
    const env = enviado();
    expect(env.text).toContain("Olá Ana,");
    expect(env.text, "o marcador seguiu cru para o cliente").not.toContain("{nome}");
    expect(env.html).not.toContain("{nome}");
  });

  it("o histórico guarda o que o cliente leu, não o marcador por preencher", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá {nome}, obrigada!" }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: { body: string }[] };
    expect(patch.messages?.at(-1)?.body).toBe("Olá Ana, obrigada!");
  });

  /** Um pedido que entrou por telefonema pode não ter nome. Aí o marcador não
   *  tem por onde se resolver — o que não pode é seguir à vista do cliente. */
  it("sem nome no pedido, o marcador desaparece em vez de seguir", async () => {
    authed.ok = true;
    store.nome = "";
    await POST(req({ message: "Olá {nome}, obrigada!" }), ctx("LIQ-1"));
    expect(enviado().text).not.toContain("{nome}");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * UM ENVIO QUE FALHA NÃO PODE LEVAR A MENSAGEM DELA COM ELE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Esta rota já sabia que um pedido SEM email não podia engolir a mensagem (ver o
 * bloco na rota). Faltava-lhe a outra metade, e é a mais provável: um endereço
 * bom e o servidor de correio a recusar.
 *
 * O `sendMail` só promete não atirar quando o SMTP está POR CONFIGURAR
 * («Resolves with { sent: false } (never throws)», em `mail.ts`). Tudo o resto
 * ATIRA: a ligação a expirar (o `mail.ts` corta aos 8 s), as credenciais
 * recusadas, a caixa do cliente cheia, o servidor em baixo. A excepção subia ao
 * `catch` de topo, a rota respondia 500, e o `updateQuote` — que vem DEPOIS do
 * envio — nunca corria.
 *
 * O que ela via, medido antes da correcção:
 *
 *     STATUS: 500  BODY: {"error":"Erro ao enviar a mensagem"}
 *     updateQuote chamado? 0
 *
 * Ou seja: escrevia a resposta, carregava em Enviar, lia «erro ao enviar» — e o
 * histórico do pedido continuava vazio. O texto que ela tinha escrito só existia
 * naquela caixa, e desaparecia com ela. É exactamente o defeito que já se tinha
 * corrigido para os pedidos sem email, a entrar pela porta do lado.
 */
describe("POST /api/orcamento/[id]/mensagem — o correio falha, o registo não", () => {
  it("com o servidor de correio a atirar, a mensagem fica GRAVADA na mesma", async () => {
    authed.ok = true;
    store.estado = "pendente";
    mail.send.mockRejectedValueOnce(new Error("connect ETIMEDOUT 1.2.3.4:465"));

    const res = await POST(req({ message: "Segue o link das fotografias." }), ctx("LIQ-1"));

    expect(res.status, "um envio falhado não é uma avaria da rota").toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    // A frase que o painel mostra a vermelho: diz o que aconteceu e o que fazer.
    expect(String(body.emailError)).toMatch(/correio/i);
    expect(String(body.emailError), "tem de dizer que o cliente NÃO recebeu").toMatch(/NÃO/);

    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: { body: string }[] };
    expect(store.update, "sem isto, o que ela escreveu perde-se").toHaveBeenCalled();
    expect(patch.messages?.at(-1)?.body).toBe("Segue o link das fotografias.");
  });

  it("com o SMTP por configurar, o mesmo — gravada, e a dizer que não saiu", async () => {
    authed.ok = true;
    mail.send.mockResolvedValueOnce({ sent: false });
    const res = await POST(req({ message: "Confirmado para as 15h." }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(String(body.emailError)).toMatch(/não está configurado/i);
    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: { body: string }[] };
    expect(patch.messages?.at(-1)?.body).toBe("Confirmado para as 15h.");
  });

  it("quando sai mesmo, não inventa erro nenhum", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Olá!" }), ctx("LIQ-1"));
    const body = await res.json();
    expect(body.emailed).toBe(true);
    expect(body).not.toHaveProperty("emailError");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * «OLÁ ,» — TIRAR O MARCADOR É METADE DO TRABALHO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Os modelos de resposta rápida do painel começam todos por «Olá {nome},». Num
 * pedido sem nome — os que entram por telefonema — o marcador era substituído
 * por vazio e o cliente lia, medido antes da correcção:
 *
 *     "Olá , obrigada pelo vosso contacto!"
 *
 * Que não é melhor do que o marcador cru: é só um erro diferente, e igualmente
 * à vista. O buraco sai com o marcador.
 */
describe("POST /api/orcamento/[id]/mensagem — sem nome, sem buraco", () => {
  const texto = () => (mail.send.mock.calls.at(-1)![0] as { text: string }).text;

  it("«Olá {nome}, …» sem nome vira «Olá, …» — não «Olá , …»", async () => {
    authed.ok = true;
    store.nome = "";
    await POST(req({ message: "Olá {nome}, obrigada pelo vosso contacto!" }), ctx("LIQ-1"));
    expect(texto()).toContain("Olá, obrigada pelo vosso contacto!");
    expect(texto()).not.toContain("Olá ,");
    expect(texto()).not.toContain("{nome}");
  });

  it("o marcador a abrir a linha leva a vírgula que ficaria pendurada", async () => {
    authed.ok = true;
    store.nome = "";
    await POST(req({ message: "{nome}, bom dia." }), ctx("LIQ-1"));
    expect(texto().split("\n")[0]).toBe("bom dia.");
  });

  it("no meio de uma frase não deixa dois espaços colados", async () => {
    authed.ok = true;
    store.nome = "";
    await POST(req({ message: "Falamos com {nome} amanhã." }), ctx("LIQ-1"));
    expect(texto()).toContain("Falamos com amanhã.");
    expect(texto(), "dois espaços a meio de uma frase").not.toMatch(/\w {2}\w/);
  });

  it("e o histórico guarda exactamente o que o cliente leu", async () => {
    authed.ok = true;
    store.nome = "";
    await POST(req({ message: "Olá {nome}, obrigada!" }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: { body: string }[] };
    expect(patch.messages?.at(-1)?.body).toBe("Olá, obrigada!");
  });

  it("com nome, nada disto corre: é a substituição de sempre", async () => {
    authed.ok = true;
    store.nome = "Ana Silva";
    await POST(req({ message: "Olá {nome}, obrigada!" }), ctx("LIQ-1"));
    expect(texto()).toContain("Olá Ana, obrigada!");
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O ASSUNTO SEGUE A LÍNGUA DO PEDIDO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A linha de assunto era escrita à mão, sempre em português, mesmo quando o
 * pedido é inglês (`quote.locale === "en"`). O corpo é sempre o que ela
 * escreveu — não se traduz, é dela — mas o assunto é fixo, e passa a existir
 * nas duas línguas.
 */
describe("POST /api/orcamento/[id]/mensagem — o assunto segue a língua do pedido", () => {
  const assunto = () => (mail.send.mock.calls.at(-1)![0] as { subject: string }).subject;

  it("um pedido português leva o assunto de sempre", async () => {
    authed.ok = true;
    store.locale = "pt";
    await POST(req({ message: "Olá!" }), ctx("LIQ-1"));
    expect(assunto()).toBe("Líquen Events — sobre o seu pedido (LIQ-1)");
  });

  it("um pedido inglês leva o assunto em inglês", async () => {
    authed.ok = true;
    store.locale = "en";
    await POST(req({ message: "Hello!" }), ctx("LIQ-1"));
    expect(assunto()).toBe("Líquen Events — about your enquiry (LIQ-1)");
  });

  it("sem língua gravada (pedido anterior ao campo), cai no português", async () => {
    authed.ok = true;
    store.locale = undefined;
    await POST(req({ message: "Olá!" }), ctx("LIQ-1"));
    expect(assunto()).toBe("Líquen Events — sobre o seu pedido (LIQ-1)");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ASSINATURA É DE QUEM ESCREVEU — E NUNCA DE QUEM RECEBE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O fecho vem todo do `emailAoCliente` (ver `email-assinatura.ts`); o que se
 * mede aqui é a única coisa que esta rota decide — QUEM lhe passa como
 * assinante e como destinatário. Sem estas duas linhas certas, a assinatura
 * certa não serve de nada.
 */
describe("POST /api/orcamento/[id]/mensagem — quem assina", () => {
  /** Um pedido a sério, com cookies — o `req()` acima é um `Request` nu. */
  function pedidoComSessao(mensagem: string): NextRequest {
    const r = new NextRequest("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: mensagem }),
    });
    r.cookies.set("liquen_admin", "um-token-qualquer");
    return r;
  }

  const enviado = () => mail.send.mock.calls[0][0] as { html: string; text: string };

  /**
   * ── A REGRA MUDOU, E A RAZÃO ESTÁ NUM EMAIL REAL ────────────────────────
   *
   * Isto exigia que o nome DA SESSÃO assinasse o email. Parecia certo e
   * produziu, numa proposta enviada a uma cliente, a assinatura
   * **«Liquen Alentejo»** — que ninguém escreveu em lado nenhum: foi derivada
   * do endereço de entrada (`liquen.alentejo@gmail.com` → `nomeVisivel` troca
   * os pontos por espaços e capitaliza) e seguiu para o `sub` da sessão.
   *
   * A regra passa a ser: **só assina o que estiver escrito no perfil da
   * conta.** Um nome adivinhado a partir de um endereço nunca assina nada.
   */
  it("assina com o nome ESCRITO no perfil da conta", async () => {
    authed.ok = true;
    sessao.nome = "rui.belo@liquen.pt";
    sessao.perfil = { nome: "Rui Belo", cargo: "Produção" };
    await POST(pedidoComSessao("Olá!"), ctx("LIQ-1"));
    expect(enviado().html).toContain("Rui Belo");
    expect(enviado().text).toContain("Rui Belo");
    expect(enviado().html).toContain("Produção");
    expect(enviado().html).not.toContain("Catarina Gaspar");
  });

  it("sem perfil, assina a CASA — e nunca o nome tirado do endereço", async () => {
    authed.ok = true;
    // Exactamente o caso real: entrada com a palavra-passe partilhada, e o
    // nome da sessão derivado do endereço da conta de Gmail.
    sessao.nome = "Liquen Alentejo";
    sessao.perfil = {};
    await POST(pedidoComSessao("Olá!"), ctx("LIQ-1"));
    expect(enviado().html).toContain("Catarina Gaspar");
    expect(enviado().html).not.toContain("Liquen Alentejo");
    expect(enviado().text).not.toContain("Liquen Alentejo");
  });

  /**
   * A protecção, vista de ponta a ponta: uma conta chamada como a cliente não
   * pode fazer sair um email onde ela se assina a si própria.
   */
  it("com o nome igual ao do cliente, assina a casa", async () => {
    authed.ok = true;
    store.nome = "Ana Silva";
    sessao.nome = "ana.silva@liquen.pt";
    sessao.perfil = { nome: "ana  silva" };
    await POST(pedidoComSessao("Olá!"), ctx("LIQ-1"));
    expect(enviado().html).toContain("Catarina Gaspar");
    expect(enviado().html).not.toMatch(/>ana {2}silva</i);
  });
});

/**
 * O DOMÍNIO DO EMAIL TEM DE RECEBER CORREIO (pedido dela, 30/10: «não deixe
 * enviar emails que não existem»). Um pedido gravado com «gmial.con» seguia
 * para o servidor de correio e morria lá; o ecrã dizia «enviado».
 */
describe("POST /api/orcamento/[id]/mensagem — o domínio do email", () => {
  it("um domínio que não recebe correio dá 422 com a frase, e não envia nem regista nada", async () => {
    authed.ok = true;
    vi.mocked(dominioRecebeEmail).mockResolvedValueOnce(false);
    const res = await POST(req({ message: "Olá" }), ctx("LIQ-1"));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "O email do cliente não parece existir (o domínio «x.pt» não recebe email). Corrija-o no pedido antes de enviar.",
      campo: "email",
    });
    expect(mail.send).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });
});
