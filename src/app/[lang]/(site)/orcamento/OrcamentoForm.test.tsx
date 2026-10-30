// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";
import { quoteFormSchema } from "@/lib/validation";
import OrcamentoForm from "./OrcamentoForm";

/**
 * O FORMULÁRIO COMPLETO — três defeitos que só se veem em uso real:
 *
 *  1. o `min` do campo da data vinha do BUILD (a página é pré-gerada), a
 *     hidratação divergia e ficava a data do servidor: escolher o mês passado
 *     passava a ser possível;
 *  2. o rascunho guardava treze campos e esquecia os nomes do casal — quem saía
 *     para ler a política de privacidade e voltava perdia-os;
 *  3. o link do WhatsApp não reagia à ordem de grandeza dos convidados, e
 *     levava «Ainda a definir» depois de ela já ter escolhido «100 a 150».
 *
 * E mais três, encontrados depois — todos no mesmo sítio: entre carregar em
 * Enviar e o pedido chegar (ou não) à casa.
 *
 *  4. a data mínima era calculada em UTC. Em Lisboa, no Verão, entre a
 *     meia-noite e a 01:00 dava ONTEM; a oeste de Greenwich, ao fim do dia,
 *     dava AMANHÃ — e o dia de hoje passava a ser recusado sem saída;
 *  5. o e-mail passava num teste do ecrã mais frouxo do que o do servidor:
 *     `ana@exemplo.p` ficava com a linha verde de campo válido e morria
 *     depois, num aviso lá em baixo que não diz qual o campo;
 *  6. com a rede em baixo, o que se lia era o «Failed to fetch» do browser, em
 *     inglês, em vez da frase do site — a única que diz que há WhatsApp.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));

const dict = getDictionary("pt");
const to = dict.orcamento;
const BLUR = "data:image/webp;base64,AAAA";

function Formulario() {
  return (
    <LocaleProvider locale="pt" dict={pickChromeDict(dict)}>
      <OrcamentoForm panelBlur={BLUR} orcamento={to} />
    </LocaleProvider>
  );
}

const montar = () => render(<Formulario />);

/**
 * O dia de hoje e um dia já passado, no formato do campo — no fuso de quem
 * está a preencher. Escritos com os leitores LOCAIS de propósito: um
 * `toISOString()` aqui mediria o mesmo engano que estes testes prendem.
 */
const emCampo = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hoje = () => emCampo(new Date());
const ontem = () => emCampo(new Date(Date.now() - 864e5));

/** Um pedido completo, pronto a enviar — tudo menos carregar em Enviar. */
async function preencherPedido() {
  montar();
  await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[0] }));
  fireEvent.change(screen.getByLabelText(new RegExp(to.labelData, "i")), {
    target: { value: hoje() },
  });
  await userEvent.type(screen.getByLabelText(new RegExp(to.labelPessoas, "i")), "80");
  await userEvent.type(screen.getByLabelText(new RegExp(to.labelLocal, "i")), "Sintra");
  await userEvent.type(screen.getByLabelText(new RegExp(`^${to.labelNome}`, "i")), "Ana");
  await userEvent.type(screen.getByLabelText(new RegExp(to.labelEmail, "i")), "ana@exemplo.pt");
  await userEvent.type(screen.getByLabelText(new RegExp(to.labelTelefone, "i")), "912345678");
  await userEvent.type(
    screen.getByLabelText(new RegExp(to.labelMensagem, "i")),
    "Um jardim, ao fim da tarde.",
  );
}

/**
 * Carregar em Enviar — e, se o formulário estiver pronto, confirmar os
 * contactos no painel que aparece (28/10: o envio a sério é o «Está certo,
 * enviar»). Sem o painel (pedido incompleto) fica só a primeira parte.
 */
const enviar = () => {
  fireEvent.submit(document.querySelector("form")!);
  const ok = screen.queryByRole("button", { name: new RegExp(to.confirmarEnviar, "i") });
  if (ok) fireEvent.click(ok);
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ id: "LIQ-AAA-1" }) })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("OrcamentoForm — a data mínima numa página pré-gerada", () => {
  it("o HTML pré-gerado não leva `min` nenhum (é o que divergia na hidratação)", () => {
    const html = renderToStaticMarkup(<Formulario />);
    expect(html).toContain('type="date"');
    expect(html).not.toContain('min="');
  });

  it("já no browser, o campo passa a ter a data de HOJE como mínimo", async () => {
    montar();
    await waitFor(() =>
      expect(screen.getByLabelText(new RegExp(to.labelData, "i"))).toHaveAttribute("min", hoje()),
    );
  });

  it("uma data já passada é recusada no envio, e não só pelo atributo `min`", async () => {
    montar();
    const campo = screen.getByLabelText(new RegExp(to.labelData, "i"));
    await waitFor(() => expect(campo).toHaveAttribute("min", hoje()));
    // O `min` é uma sugestão que se contorna a escrever; aqui escreve-se.
    fireEvent.change(campo, { target: { value: ontem() } });
    fireEvent.blur(campo);

    expect(await screen.findByText(to.errData)).toBeInTheDocument();
    // E o pedido impossível não chega a sair.
    fireEvent.submit(document.querySelector("form")!);
    expect(fetch).not.toHaveBeenCalled();

    // A data de hoje, essa, passa.
    fireEvent.change(campo, { target: { value: hoje() } });
    await waitFor(() => expect(screen.queryByText(to.errData)).toBeNull());
  });
});

describe("OrcamentoForm — o rascunho e os nomes do casal", () => {
  async function escreverNomes() {
    montar();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[0] }));
    await userEvent.type(screen.getByLabelText(new RegExp(`^${to.labelNome}`, "i")), "Ana");
    await userEvent.type(screen.getByLabelText(to.ariaNoivoA), "Ana Dias");
    await userEvent.type(screen.getByLabelText(to.ariaNoivoB), "Rui Sousa");
    // O que acontece quando ela sai da página para ler a política de privacidade.
    window.dispatchEvent(new Event("pagehide"));
  }

  it("o rascunho guarda `noivo` e `noiva`", async () => {
    await escreverNomes();
    const guardado = JSON.parse(sessionStorage.getItem("liquen-orcamento-draft")!) as Record<
      string,
      string
    >;
    expect(guardado.noivo).toBe("Ana Dias");
    expect(guardado.noiva).toBe("Rui Sousa");
  });

  it("e devolve-os quando ela volta", async () => {
    await escreverNomes();
    cleanup();

    montar();
    await waitFor(() => expect(screen.getByLabelText(to.ariaNoivoA)).toHaveValue("Ana Dias"));
    expect(screen.getByLabelText(to.ariaNoivoB)).toHaveValue("Rui Sousa");
  });
});

describe("OrcamentoForm — o link do WhatsApp", () => {
  it("acompanha a ordem de grandeza escolhida depois de «ainda a definir»", async () => {
    montar();
    const link = () => screen.getByRole("link", { name: new RegExp(to.ouWhatsApp, "i") });

    await userEvent.click(screen.getByLabelText(to.guestsFlexibleLabel));
    expect(decodeURIComponent(link().getAttribute("href")!)).toContain(to.guestsFlexibleLabel);

    await userEvent.click(screen.getByRole("button", { name: "100 a 150" }));
    const mensagem = decodeURIComponent(link().getAttribute("href")!);
    expect(mensagem).toContain("~100 a 150");
    // Deixou de mandar para o WhatsApp uma coisa que já não é verdade.
    expect(mensagem).not.toContain(`${to.labelPessoas}: ${to.guestsFlexibleLabel}`);
  });
});

/**
 * A DATA MÍNIMA É A DE QUEM PREENCHE, E NÃO A DE GREENWICH.
 *
 * `new Date().toISOString()` é sempre UTC, e o dia que dele sai não é o dia
 * que está no relógio de quem está a preencher. São dois enganos, e o segundo
 * é o que custa o pedido.
 *
 * Os dois testes mexem no `TZ` do processo — o Node relê-o a cada `Date` — e
 * param o relógio numa hora escolhida para que o dia local e o dia UTC sejam
 * mesmo diferentes. É a única forma de medir isto num runner que corre em UTC,
 * onde o defeito não aparece nunca.
 */
describe("OrcamentoForm — a data mínima, à meia-noite e do outro lado do mar", () => {
  const fusoOriginal = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = fusoOriginal;
  });
  // Só o relógio é falso; os temporizadores continuam verdadeiros para o
  // `waitFor` e o `userEvent` não ficarem à espera de si próprios.
  const parar = (fuso: string, instante: string) => {
    process.env.TZ = fuso;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instante));
  };

  it("a oeste, ao fim do dia, o dia de hoje continua a poder ser escolhido", async () => {
    // 13 de agosto, 22:30, em São Paulo. Em UTC já é dia 14.
    parar("America/Sao_Paulo", "2026-08-14T01:30:00Z");
    montar();
    const campo = screen.getByLabelText(new RegExp(to.labelData, "i"));
    await waitFor(() => expect(campo).toHaveAttribute("min", "2026-08-13"));

    // O dia que ela vê no calendário do telemóvel — e que era recusado sem
    // explicação nem saída, porque o formulário estava um dia à frente dela.
    fireEvent.change(campo, { target: { value: "2026-08-13" } });
    fireEvent.blur(campo);
    expect(screen.queryByText(to.errData)).toBeNull();
  });

  it("em Lisboa, passada a meia-noite, o dia de ontem deixa de passar", async () => {
    // 14 de agosto, 00:30, em Lisboa. Em UTC ainda é dia 13.
    parar("Europe/Lisbon", "2026-08-13T23:30:00Z");
    montar();
    const campo = screen.getByLabelText(new RegExp(to.labelData, "i"));
    await waitFor(() => expect(campo).toHaveAttribute("min", "2026-08-14"));

    fireEvent.change(campo, { target: { value: "2026-08-13" } });
    fireEvent.blur(campo);
    expect(await screen.findByText(to.errData)).toBeInTheDocument();
  });
});

/**
 * O E-MAIL QUE O ECRÃ DAVA POR BOM E O SERVIDOR RECUSAVA.
 *
 * Cada um destes endereços é um engano de dedo de quem escreve depressa no
 * telemóvel. O campo ficava com a linha verde de válido, o pedido saía, e o
 * que voltava era um aviso lá no fundo da página que não diz qual o campo —
 * com o campo do e-mail, ali em cima, ainda a dizer que estava bem.
 */
describe("OrcamentoForm — o e-mail, no campo e não depois do envio", () => {
  const enganos = ["ana@exemplo.p", "ana.@exemplo.pt", "ana@exemplo.pt.", "ana@@exemplo.pt"];

  it.each(enganos)("o servidor recusa «%s» — logo o ecrã também tem de recusar", (endereco) => {
    const r = quoteFormSchema.safeParse({
      name: "Ana Dias",
      email: endereco,
      phone: "912345678",
      location: "Sintra",
      notes: "Um jardim.",
    });
    expect(r.success).toBe(false);
  });

  it.each(enganos)(
    "«%s» é assinalado no próprio campo, e o pedido não chega a sair",
    async (endereco) => {
      montar();
      const campo = screen.getByLabelText(new RegExp(to.labelEmail, "i"));
      await userEvent.type(campo, endereco);
      fireEvent.blur(campo);

      expect(await screen.findByText(to.errEmail)).toBeInTheDocument();
      expect(campo).toHaveAttribute("aria-invalid", "true");
      enviar();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  // O outro lado da regra, que é o que impede a correcção de ir longe de mais:
  // recusar um endereço verdadeiro custa o lead inteiro, e em silêncio.
  it("e os endereços verdadeiros continuam a passar — nos dois lados", async () => {
    const bons = ["ana@exemplo.pt", "ana.dias+casamento@mail.exemplo.co.uk", "a@b.co"];
    montar();
    const campo = screen.getByLabelText(new RegExp(to.labelEmail, "i"));
    for (const bom of bons) {
      await userEvent.clear(campo);
      await userEvent.type(campo, bom);
      fireEvent.blur(campo);
      expect(screen.queryByText(to.errEmail)).toBeNull();
      expect(
        quoteFormSchema.safeParse({
          name: "Ana Dias",
          email: bom,
          phone: "912345678",
          location: "Sintra",
          notes: "Um jardim.",
        }).success,
      ).toBe(true);
    }
  });
});

/**
 * O QUE SE LÊ QUANDO A REDE FALHA.
 *
 * O `fetch` rejeita com um `TypeError` do browser — «Failed to fetch» no
 * Chrome, «Load failed» no Safari — e essa frase saía tal e qual no ecrã de
 * quem está a pedir um orçamento de casamento em português. A frase do site
 * não é só mais bonita: é a única que diz que há um WhatsApp do outro lado.
 */
describe("OrcamentoForm — quando o envio falha", () => {
  it("com a rede em baixo lê-se a frase do site, e não a do browser", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await preencherPedido();
    enviar();

    expect(await screen.findByText(to.error)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Failed to fetch");
  });

  it("mas a explicação do servidor, essa, continua a chegar inteira", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: "Demasiados pedidos. Tente novamente dentro de momentos." }),
      })),
    );
    await preencherPedido();
    enviar();

    expect(
      await screen.findByText("Demasiados pedidos. Tente novamente dentro de momentos."),
    ).toBeInTheDocument();
  });

  it("e o botão destranca para ela poder tentar outra vez", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await preencherPedido();
    enviar();
    await screen.findByText(to.error);

    const botao = screen.getByRole("button", { name: new RegExp(to.enviar, "i") });
    expect(botao).toHaveAttribute("aria-disabled", "false");
  });
});

/**
 * A MENSAGEM MAIS LONGA QUE O CAMPO ACEITA TEM DE CABER NO QUE O SERVIDOR GRAVA.
 *
 * O texto que ela escreve não viaja sozinho: leva à frente as marcas de «data
 * ainda a definir» e «nº de pessoas ainda a definir». O campo não tinha limite
 * nenhum e o servidor recusa acima de 4000 caracteres — e o que voltava era um
 * «Too big: expected string to have <=4000 characters», em inglês, a quem
 * acabara de escrever a página inteira que a proposta pedia.
 */
describe("OrcamentoForm — o limite da mensagem", () => {
  it("o campo trava onde o servidor trava, contando já com as marcas", async () => {
    await preencherPedido();
    // As duas marcas ao mesmo tempo: é o pedido em que sobra menos espaço.
    await userEvent.click(screen.getByLabelText(to.dateFlexibleLabel));
    await userEvent.click(screen.getByLabelText(to.guestsFlexibleLabel));

    const campo = screen.getByLabelText(new RegExp(to.labelMensagem, "i")) as HTMLTextAreaElement;
    expect(campo.maxLength).toBeGreaterThan(0);
    fireEvent.change(campo, { target: { value: "a".repeat(campo.maxLength) } });

    enviar();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const enviado = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    ) as { form: unknown };
    expect(quoteFormSchema.safeParse(enviado.form).success).toBe(true);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O `eventName` É UM NOME, NÃO O RÓTULO DA LISTA QUE A PESSOA CARREGOU
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O formulário gravava em `eventName` o rótulo canónico PORTUGUÊS da opção
 * escolhida — «Casamento», «Batizado / Comunhão», «Outro» — mesmo quando o
 * visitante tinha lido a página inteira em inglês. Daí para a frente esse
 * rótulo era tratado como sendo a palavra do cliente e ia parar dentro de
 * frases: «para o batizado / comunhão de 3 de maio», «Event: Casamento».
 *
 * A escolha já viaja no `eventType`, que é um identificador estável e que se
 * traduz na leitura. O `eventName` fica para o que ele diz ser: um nome que o
 * cliente dá ao evento dele — coisa que este formulário nunca chega a
 * perguntar, e por isso vai vazio.
 */
describe("OrcamentoForm — a escolha viaja como tipo, não como nome", () => {
  async function enviado() {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return (
      JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as {
        form: { eventType: string | null; category: string | null; eventName: string };
      }
    ).form;
  }

  it("o rótulo da lista não é gravado como nome do evento", async () => {
    await preencherPedido();
    enviar();
    const form = await enviado();
    expect(form.eventType).toBe("casamentos");
    expect(form.eventName).toBe("");
  });

  it("«Outro» também não — não há nome nenhum a inventar", async () => {
    montar();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[5] }));
    fireEvent.change(screen.getByLabelText(new RegExp(to.labelData, "i")), {
      target: { value: hoje() },
    });
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelPessoas, "i")), "40");
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelLocal, "i")), "Guimarães");
    await userEvent.type(screen.getByLabelText(new RegExp(`^${to.labelNome}`, "i")), "Ana");
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelEmail, "i")), "ana@exemplo.pt");
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelTelefone, "i")), "912345678");
    await userEvent.type(
      screen.getByLabelText(new RegExp(to.labelMensagem, "i")),
      "Uma festa de família.",
    );
    enviar();
    const form = await enviado();
    expect(form.eventType).toBeNull();
    expect(form.category).toBeNull();
    expect(form.eventName).toBe("");
  });
});

/**
 * ── O CONTACTO: O EMAIL É OBRIGATÓRIO (decisão dela, 28/10) ───────────────
 *
 * Chegou um pedido com o email mal escrito e sem telemóvel: a confirmação não
 * chegou a ninguém e não havia por onde responder. No formulário completo o
 * email passa a ser obrigatório; o telemóvel não («o email é obrigatório mas o
 * telemóvel não é»), mas quando vem tem de parecer completo. Antes de sair,
 * mostram-se os contactos para confirmar. O oráculo continua a ser o
 * servidor (`quoteFormSchema` com `origem: "completo"`).
 */
describe("OrcamentoForm — o email é obrigatório, o telemóvel não", () => {
  const semContacto = {
    name: "Ana Dias",
    location: "Sintra",
    notes: "Um jardim.",
    origem: "completo",
  };
  const servidorAceita = (contacto: { email: string; phone: string }) =>
    quoteFormSchema.safeParse({ ...semContacto, ...contacto }).success;

  async function preencherComContacto(contacto: { email?: string; telefone?: string }) {
    montar();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[0] }));
    fireEvent.change(screen.getByLabelText(new RegExp(to.labelData, "i")), {
      target: { value: hoje() },
    });
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelPessoas, "i")), "80");
    await userEvent.type(screen.getByLabelText(new RegExp(to.labelLocal, "i")), "Sintra");
    await userEvent.type(screen.getByLabelText(new RegExp(`^${to.labelNome}`, "i")), "Ana");
    const campoEmail = screen.getByLabelText(new RegExp(to.labelEmail, "i"));
    const campoTelefone = screen.getByLabelText(new RegExp(to.labelTelefone, "i"));
    if (contacto.email) await userEvent.type(campoEmail, contacto.email);
    fireEvent.blur(campoEmail);
    if (contacto.telefone) await userEvent.type(campoTelefone, contacto.telefone);
    fireEvent.blur(campoTelefone);
    await userEvent.type(
      screen.getByLabelText(new RegExp(to.labelMensagem, "i")),
      "Um jardim, ao fim da tarde.",
    );
  }

  async function formEnviado() {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return (
      JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as {
        form: Record<string, unknown>;
      }
    ).form;
  }

  it("com os dois, mostra-os para confirmar ANTES de enviar — e só sai no «Está certo»", async () => {
    expect(servidorAceita({ email: "ana@exemplo.pt", phone: "912345678" })).toBe(true);
    await preencherComContacto({ email: "ana@exemplo.pt", telefone: "912 345 678" });

    fireEvent.submit(document.querySelector("form")!);
    const painel = await screen.findByRole("region", { name: to.confirmarTitulo });
    expect(painel).toHaveTextContent("ana@exemplo.pt");
    expect(painel).toHaveTextContent("912 345 678");
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: new RegExp(to.confirmarEnviar, "i") }));
    const form = await formEnviado();
    expect(form.origem).toBe("completo");
    expect(form.idioma).toBe("pt");
    expect(quoteFormSchema.safeParse(form).success).toBe(true);
  });

  it("«Corrigir» fecha o painel, não envia, e leva ao email", async () => {
    await preencherComContacto({ email: "ana@exemplo.pt", telefone: "912345678" });
    fireEvent.submit(document.querySelector("form")!);
    fireEvent.click(
      await screen.findByRole("button", { name: new RegExp(`^${to.confirmarCorrigir}$`, "i") }),
    );
    expect(screen.queryByRole("region", { name: to.confirmarTitulo })).toBeNull();
    expect(screen.getByLabelText(new RegExp(to.labelEmail, "i"))).toHaveFocus();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("só com telemóvel, recusa — falta o email", async () => {
    expect(servidorAceita({ email: "", phone: "912345678" })).toBe(false);
    await preencherComContacto({ telefone: "912345678" });
    enviar();
    expect(await screen.findByText(to.errEmailObrigatorio)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("só com email, sai — e o painel mostra só o email", async () => {
    expect(servidorAceita({ email: "ana@exemplo.pt", phone: "" })).toBe(true);
    await preencherComContacto({ email: "ana@exemplo.pt" });
    fireEvent.submit(document.querySelector("form")!);
    const painel = await screen.findByRole("region", { name: to.confirmarTitulo });
    expect(painel).toHaveTextContent("ana@exemplo.pt");
    expect(painel).not.toHaveTextContent(to.confirmarTelefone);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(to.confirmarEnviar, "i") }));
    const form = await formEnviado();
    expect(form.phone).toBe("");
    expect(quoteFormSchema.safeParse(form).success).toBe(true);
  });

  it("um email mal escrito continua a ser recusado, mesmo com o telemóvel bom", async () => {
    await preencherComContacto({ email: "ana@exemplo.p", telefone: "912345678" });
    expect(await screen.findByText(to.errEmail)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(to.labelEmail, "i"))).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    enviar();
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["91234", "8123456789", "1234567890"])(
    "um telemóvel que não parece completo (%s) é recusado — como no servidor",
    async (numero) => {
      expect(servidorAceita({ email: "ana@exemplo.pt", phone: numero })).toBe(false);
      await preencherComContacto({ email: "ana@exemplo.pt", telefone: numero });
      enviar();
      // A frase é a do campo, que sabe o país da bandeira (30/10).
      expect(
        await screen.findByText("Este número não é válido para Portugal (+351)."),
      ).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  // Desde 30/10 o «+44» muda a bandeira e o número segue as regras de lá; o
  // que vai para o servidor é o E.164. (O exemplo era «+44 7700 900123», que é
  // da gama de números de FICÇÃO do Reino Unido — e as regras novas sabem-no.)
  it("um número estrangeiro com indicativo passa, em E.164", async () => {
    expect(servidorAceita({ email: "ana@exemplo.pt", phone: "+44 20 7946 0958" })).toBe(true);
    await preencherComContacto({ email: "ana@exemplo.pt", telefone: "+44 20 7946 0958" });
    enviar();
    expect((await formEnviado()).phone).toBe("+442079460958");
  });

  it("um domínio mal escrito leva uma sugestão, que se aceita com um toque", async () => {
    await preencherComContacto({ email: "ana@gmial.com", telefone: "912345678" });
    expect(screen.getByText("ana@gmail.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: to.sugestaoEmailUsar }));
    expect(screen.getByLabelText(new RegExp(to.labelEmail, "i"))).toHaveValue("ana@gmail.com");
  });

  it("o email diz que é obrigatório, o telemóvel não — e a chave do topo também", () => {
    montar();
    expect(screen.getByLabelText(new RegExp(to.labelEmail, "i"))).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText(new RegExp(to.labelTelefone, "i"))).not.toHaveAttribute(
      "aria-required",
    );
    expect(screen.getByText(to.hintEmail)).toBeInTheDocument();
    expect(screen.getByText(to.requiredNote)).toBeInTheDocument();
  });

  it("o servidor recusa o domínio: a frase aparece e o foco volta ao email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: to.errDominioDoEmail, campo: "email" }),
      })),
    );
    await preencherComContacto({ email: "ana@naoexiste.pt", telefone: "912345678" });
    enviar();
    expect(await screen.findByText(to.errDominioDoEmail)).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(to.labelEmail, "i"))).toHaveFocus();
  });
});

/**
 * MEDIDO a 375 px com toque emulado (Chromium, `hasTouch: true`): o link de
 * voltar ao início e o link do WhatsApp mediam 72×17 e 177×17 px — bem abaixo
 * dos 44×44 das Human Interface Guidelines, e nenhum dos dois é palavra a meio
 * de uma frase (o primeiro é o único caminho de volta ao sítio no telemóvel;
 * o segundo é a acção alternativa ao lado do botão de enviar). `.alvo-toque`
 * (globals.css) já é o mecanismo da casa para isto — este teste só verifica
 * que os dois continuam a declará-lo, porque o jsdom não faz disposição e não
 * mede pixels; quem mede é `alvos-de-toque-do-sitio.test.tsx` + o guião
 * Playwright, não este ficheiro.
 */
describe("OrcamentoForm — alvos de toque no telemóvel", () => {
  it("o link de volta ao início declara alvo de 44 px", () => {
    montar();
    const links = screen.getAllByRole("link", { name: new RegExp(to.back, "i") });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.className).toMatch(/\balvo-toque\b/);
    }
  });

  it("o link do WhatsApp, ao lado do botão de enviar, declara alvo de 44 px", () => {
    montar();
    const link = screen.getByRole("link", { name: new RegExp(to.ouWhatsApp, "i") });
    expect(link.className).toMatch(/\balvo-toque\b/);
  });
});

/**
 * A COORDENAÇÃO DO DIA (pedido dela, 25/10): uma pastilha só, em TODOS os tipos
 * de evento, que viaja como `dayCoordination` e se pode desmarcar.
 */
describe("OrcamentoForm — a coordenação do dia", () => {
  const pastilha = () => screen.getByRole("button", { name: "Coordenação do dia" });
  async function enviado() {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return (
      JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as {
        form: { dayCoordination?: boolean };
      }
    ).form;
  }

  it("aparece no casamento e num evento que não é casamento", async () => {
    montar();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[0] }));
    expect(pastilha()).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: to.eventTypeLabels[5] }));
    expect(pastilha()).toBeTruthy();
    expect(screen.getByText(to.labelCoordenacao)).toBeTruthy();
  });

  it("marcada, o pedido leva `dayCoordination: true`", async () => {
    await preencherPedido();
    await userEvent.click(pastilha());
    expect(pastilha().getAttribute("aria-pressed")).toBe("true");
    enviar();
    expect((await enviado()).dayCoordination).toBe(true);
  });

  it("desmarcada (ou nunca tocada), leva `false`", async () => {
    await preencherPedido();
    await userEvent.click(pastilha());
    await userEvent.click(pastilha());
    expect(pastilha().getAttribute("aria-pressed")).toBe("false");
    enviar();
    expect((await enviado()).dayCoordination).toBe(false);
  });

  it("o esquema do servidor aceita-a", () => {
    const r = quoteFormSchema.safeParse({
      name: "Ana",
      email: "ana@exemplo.pt",
      dayCoordination: true,
    });
    expect(r.success && r.data.dayCoordination).toBe(true);
  });
});
