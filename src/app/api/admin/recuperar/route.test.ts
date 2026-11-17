import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RESPOSTA DO PEDIDO DE RECUPERAÇÃO NÃO PODE DIZER QUEM EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um formulário que responde «não temos esse email» é um verificador de
 * endereços grátis para quem esteja a montar uma campanha de phishing contra a
 * equipa — e o primeiro passo de quem quer entrar é sempre saber que
 * identificadores são válidos.
 *
 * O que se prende aqui: mesmo código de estado, mesmo corpo, e o email a sair
 * SÓ no caso verdadeiro. Mais o caso que o enunciado exige em separado: sem
 * sítio onde gravar, a rota DIZ que não conseguiu em vez de fingir que enviou.
 */

const rl = vi.hoisted(() => ({
  porChave: new Map<string, { ok: boolean; retryAfter?: number }>(),
  chamadas: [] as string[],
  contagens: new Map<string, number>(),
}));
vi.mock("@/lib/rate-limit", () => ({
  // Conta a sério, com o tecto que a rota passar; `porChave` força um resultado.
  rateLimit: vi.fn(async (key: string, limit: number) => {
    rl.chamadas.push(key);
    const forcado = rl.porChave.get(key);
    if (forcado) return forcado;
    const n = (rl.contagens.get(key) ?? 0) + 1;
    rl.contagens.set(key, n);
    return n > limit ? { ok: false, retryAfter: 3600 } : { ok: true };
  }),
  // Devolve uma reserva que não chegou a dar um email.
  devolverTentativa: vi.fn(async (key: string) => {
    const n = rl.contagens.get(key) ?? 0;
    if (n > 0) rl.contagens.set(key, n - 1);
  }),
  // Só pergunta, sem contar.
  limiteEsgotado: vi.fn(async (key: string, limit: number) => {
    const forcado = rl.porChave.get(key);
    if (forcado) return forcado;
    return (rl.contagens.get(key) ?? 0) >= limit ? { ok: false, retryAfter: 3600 } : { ok: true };
  }),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

const correio = vi.hoisted(() => ({
  enviados: [] as { to?: string; subject: string; text?: string }[],
  resultado: { sent: true },
  rebenta: false,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async (args: { to?: string; subject: string; text?: string }) => {
    if (correio.rebenta) throw new Error("SMTP em baixo");
    correio.enviados.push(args);
    return correio.resultado;
  }),
  esc: (v: unknown) => String(v ?? ""),
}));

/**
 * O `after` do Next atira fora de um contexto de pedido, por isso é substituído
 * por um que GUARDA as tarefas em vez de as correr. Não é conveniência: é o que
 * permite provar que o envio do email ficou mesmo DE FORA da resposta — antes
 * de `correrDepois()` nada foi enviado, e é essa a propriedade que fecha o
 * oráculo de tempo. O resto do `next/server` (NextResponse) fica o verdadeiro.
 */
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[] }));
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return { ...real, after: (fn: () => unknown) => depois.tarefas.push(fn) };
});
async function correrDepois() {
  const pendentes = depois.tarefas.splice(0);
  for (const t of pendentes) await t();
}

const estado = vi.hoisted(() => ({
  mapa: new Map<string, unknown>(),
  recusaEscrita: false,
}));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined ? null : JSON.parse(JSON.stringify(v));
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    if (estado.recusaEscrita) {
      return { gravado: false, duradouro: false, onde: "nenhures", motivo: "escrita-recusada" };
    }
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
  // A recuperação grava com escrita condicional (n.º 4 de 16/11).
  lerEstadoComVersao: vi.fn(async (k: string) => {
    const v = estado.mapa.get(k);
    return v === undefined
      ? { valor: null, versao: null }
      : { valor: JSON.parse(JSON.stringify(v)), versao: JSON.stringify(v) };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (k: string, v: unknown, versao: string | null) => {
    const atual = estado.mapa.get(k);
    if ((atual === undefined ? null : JSON.stringify(atual)) !== versao) return "conflito";
    if (estado.recusaEscrita) return "falhou";
    estado.mapa.set(k, JSON.parse(JSON.stringify(v)));
    return "gravado";
  }),
}));

import { POST } from "./route";

function pedido(body: unknown): NextRequest {
  return new Request("https://liquen-events.com/api/admin/recuperar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** Quantos envios estão contados para esta conta (a chave é a da rota). */
function contaDaConta(email: string): number {
  const chave = [...rl.contagens.keys()].find(
    (k) => k.startsWith("recuperar-conta:") && rl.chamadas.includes(k) && k.includes(email),
  );
  return chave ? (rl.contagens.get(chave) ?? 0) : 0;
}

const KEYS = ["ADMIN_USERS", "SESSION_SECRET"];
const guardado: Record<string, string | undefined> = {};

beforeEach(() => {
  rl.porChave.clear();
  rl.chamadas = [];
  rl.contagens.clear();
  depois.tarefas = [];
  correio.enviados = [];
  correio.resultado = { sent: true };
  correio.rebenta = false;
  estado.mapa.clear();
  estado.recusaEscrita = false;
  for (const k of KEYS) guardado[k] = process.env[k];
  process.env.SESSION_SECRET = "recuperar-rota-secret-1234567890"; // gitleaks:allow — segredo de teste, gerado aqui e sem valor fora daqui
  process.env.ADMIN_USERS = JSON.stringify([
    {
      name: "Catarina",
      email: "catarina@liquen-events.com",
      passwordHash: bcrypt.hashSync("cat-pass", 10),
    },
  ]);
});
afterEach(() => {
  for (const k of KEYS) {
    if (guardado[k] === undefined) delete process.env[k];
    else process.env[k] = guardado[k];
  }
});

describe("POST /api/admin/recuperar — a resposta é indistinguível", () => {
  it("conta existente e endereço desconhecido devolvem o MESMO estado e o MESMO corpo", async () => {
    const existe = await POST(pedido({ email: "catarina@liquen-events.com" }));
    const naoExiste = await POST(pedido({ email: "ninguem@exemplo.pt" }));

    expect(existe.status).toBe(200);
    expect(naoExiste.status).toBe(200);
    expect(await existe.json()).toEqual(await naoExiste.json());
  });

  it("o email só sai no caso verdadeiro, e só para o endereço da conta", async () => {
    await POST(pedido({ email: "ninguem@exemplo.pt" }));
    await correrDepois();
    expect(correio.enviados).toHaveLength(0);

    await POST(pedido({ email: "catarina@liquen-events.com" }));
    await correrDepois();
    expect(correio.enviados).toHaveLength(1);
    // O destino vem do ADMIN_USERS, nunca do corpo do pedido.
    expect(correio.enviados[0].to).toBe("catarina@liquen-events.com");
  });

  it("O ENVIO FICA DE FORA DA RESPOSTA — é o que fecha o oráculo de tempo", async () => {
    // Um SMTP a sério leva 0,5–2 s. Enquanto era esperado aqui dentro, a conta
    // que EXISTE respondia um segundo mais devagar do que a que não existe, e
    // essa diferença lê-se com o cronómetro do próprio browser. Se algum dia
    // alguém voltar a pôr um `await` no envio, é este teste que o apanha.
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    expect(correio.enviados).toHaveLength(0);
    expect(depois.tarefas).toHaveLength(1);

    await correrDepois();
    expect(correio.enviados).toHaveLength(1);
  });

  it("a ligação aponta para o domínio do código, não para o Host do pedido", async () => {
    // Montar o endereço a partir do cabeçalho `Host` é o erro clássico desta
    // rota: o email sai para a caixa de correio verdadeira com uma ligação para
    // o servidor de quem atacou, e a pessoa entrega-lhe o token na mão.
    await POST(pedido({ email: "catarina@liquen-events.com" }));
    await correrDepois();
    expect(correio.enviados[0].text).toContain(
      "https://liquen-events.com/orcamento/admin/recuperar?token=",
    );
  });

  it("SMTP por configurar não rebenta nem muda a resposta", async () => {
    correio.resultado = { sent: false };
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    // E a tarefa adiada também não pode atirar: fora da resposta não há para
    // onde a excepção subir.
    await expect(correrDepois()).resolves.toBeUndefined();
  });

  it("um servidor de correio em baixo também não muda a resposta", async () => {
    correio.rebenta = true;
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    await expect(correrDepois()).resolves.toBeUndefined();
  });
});

describe("POST /api/admin/recuperar — tectos", () => {
  it("trava por endereço de origem", async () => {
    rl.porChave.set("recuperar-ip:test-ip", { ok: false, retryAfter: 1800 });
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("1800");
    expect(correio.enviados).toHaveLength(0);
  });

  /**
   * O tecto POR CONTA (3 por hora) conta só os emails que saem, e acima dele a
   * resposta continua a neutra: um 429 dizia a quem perguntasse que a conta
   * existe e, pior, deixava um estranho fechar à dona o pedido da ligação.
   */
  it("acima de 3 envios por hora: resposta neutra, nenhum email, e a última ligação continua a servir", async () => {
    const respostas = [];
    for (let i = 0; i < 4; i++) {
      respostas.push(await POST(pedido({ email: "Catarina@Liquen-Events.com" })));
      await correrDepois();
    }
    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    expect(await respostas[3].json()).toEqual(await respostas[0].json());
    expect(correio.enviados).toHaveLength(3);
    // A 4.ª não emitiu ligação nova: a do 3.º email continua a ser a que vale.
    const ultima = correio.enviados[2].text!.match(/token=([^\s&"]+)/)![1];
    const { definirPalavraPasseComToken } = await import("@/lib/admin-auth");
    expect(
      (await definirPalavraPasseComToken(decodeURIComponent(ultima), "frase-nova-comprida")).estado,
    ).toBe("definida");
    // A chave é a da conta, sem o endereço de origem. O 4.º pedido também
    // incrementa (a reserva é atómica: é o INCR que diz que já não cabe).
    expect(rl.contagens.get("recuperar-conta:catarina@liquen-events.com")).toBe(4);
    expect([...rl.contagens.keys()].some((k) => k.includes("recuperar-conta:test-ip"))).toBe(false);
  });

  it("pedidos sem envio (endereço que não existe) não gastam o tecto de conta nenhuma", async () => {
    for (let i = 0; i < 5; i++) await POST(pedido({ email: "ninguem@exemplo.pt" }));
    expect(rl.contagens.has("recuperar-conta:ninguem@exemplo.pt")).toBe(false);
  });

  it("SMTP por configurar, ou em baixo: nada saiu, nada se conta", async () => {
    correio.resultado = { sent: false };
    for (let i = 0; i < 4; i++) {
      await POST(pedido({ email: "catarina@liquen-events.com" }));
      await correrDepois();
    }
    correio.resultado = { sent: true };
    correio.rebenta = true;
    await POST(pedido({ email: "catarina@liquen-events.com" }));
    await correrDepois();
    expect(contaDaConta("catarina@liquen-events.com")).toBe(0);
  });

  it("três falhas do Supabase não deixam a conta uma hora sem ligação (revisão de 16/11, n.º 2)", async () => {
    estado.recusaEscrita = true;
    for (let i = 0; i < 3; i++) {
      expect((await POST(pedido({ email: "catarina@liquen-events.com" }))).status).toBe(503);
    }
    estado.recusaEscrita = false;
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(200);
    await correrDepois();
    expect(correio.enviados).toHaveLength(1);
  });

  it("uma rajada AO MESMO TEMPO não passa do tecto: 3 emails, e só 3 ligações emitidas", async () => {
    // A conta conta-se no momento da decisão, de forma atómica — e não depois
    // do SMTP: senão N pedidos simultâneos passavam todos a pergunta, e cada um
    // emitia uma ligação nova (que mata a anterior) e mandava um email.
    const respostas = await Promise.all(
      Array.from({ length: 5 }, () => POST(pedido({ email: "catarina@liquen-events.com" }))),
    );
    expect(respostas.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(depois.tarefas).toHaveLength(3);
    await correrDepois();
    expect(correio.enviados).toHaveLength(3);
    // As duas de fora não tocaram no registo da conta: a ligação guardada é a
    // de um dos três emails que saíram.
    const guardado = estado.mapa.get("admin-recuperacao") as {
      pedidos: Record<string, { resumo: string }>;
    };
    const { createHash } = await import("node:crypto");
    const resumos = correio.enviados.map((m) =>
      createHash("sha256")
        .update(decodeURIComponent(m.text!.match(/token=([^\s&"]+)/)![1]), "utf8")
        .digest("hex"),
    );
    expect(resumos).toContain(guardado.pedidos["catarina@liquen-events.com"].resumo);
  });
});

describe("POST /api/admin/recuperar — sem sítio onde gravar, diz-se", () => {
  it("responde 503 em vez de prometer um email que não abriria nada", async () => {
    estado.recusaEscrita = true;
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("Nada foi enviado") });
    expect(correio.enviados).toHaveLength(0);
  });

  it("e responde o mesmo 503 a um endereço que não existe — a recusa não denuncia ninguém", async () => {
    estado.recusaEscrita = true;
    const existe = await POST(pedido({ email: "catarina@liquen-events.com" }));
    const naoExiste = await POST(pedido({ email: "ninguem@exemplo.pt" }));
    expect(naoExiste.status).toBe(existe.status);
    expect(await naoExiste.json()).toEqual(await existe.json());
  });

  it("sem contas com email configuradas, diz que a recuperação não está montada", async () => {
    process.env.ADMIN_USERS = JSON.stringify([
      { name: "Catarina", passwordHash: bcrypt.hashSync("cat-pass", 10) },
    ]);
    const res = await POST(pedido({ email: "catarina@liquen-events.com" }));
    expect(res.status).toBe(503);
    const { error } = (await res.json()) as { error: string };

    /**
     * ── O QUE ESTE TESTE MEDE MUDOU, E DE PROPÓSITO ──────────────────────
     *
     * Media que a frase continha «não está configurada». Passava — e a frase
     * que passava mandava a pessoa «falar com quem o gere», sendo que quem lê
     * isto É quem o gere: é a dona da empresa, sozinha. Mandou a fotografia
     * do aviso a dizer que não funcionava bem, e o teste verde não a protegeu
     * de nada, porque estava a medir uma palavra em vez de uma utilidade.
     *
     * Agora mede as duas coisas que a mensagem tem MESMO de trazer: uma saída
     * que funciona já, e a razão de a recuperação não estar de pé. Uma frase
     * que perca qualquer delas fica vermelha, mesmo que seja bem escrita.
     */
    expect(error, "a mensagem tem de dizer o que se pode fazer AGORA").toMatch(
      /chave de acesso|palavra-passe/i,
    );
    expect(error, "e porque é que a recuperação não responde").toMatch(/configurar|ligada/i);

    /**
     * E não conta a quem passa o nome da variável que falta. Esta rota
     * responde a qualquer pedido da internet; o detalhe da instalação fica no
     * `log.error`, que só quem gere o servidor lê.
     */
    expect(error, "detalhes da instalação não vão na resposta pública").not.toMatch(
      /ADMIN_USERS|ENTRADA\.md|env/i,
    );
  });
});
