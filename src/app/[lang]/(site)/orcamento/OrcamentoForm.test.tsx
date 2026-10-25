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

const enviar = () => fireEvent.submit(document.querySelector("form")!);

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
 * ══════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO RECUSAVA PEDIDOS QUE A CASA ACEITA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A regra do negócio está escrita no servidor (`quoteFormSchema`, em
 * src/lib/validation.ts) e é "email OU telemóvel": um pedido com telemóvel e
 * sem email PASSA a validação, é gravado, e a equipa responde por WhatsApp.
 * O back office tem código e comentários inteiros sobre pedidos nascidos de um
 * telefonema, e a rota da confirmação já sabe que pode não haver para onde
 * mandar email (`NadaParaConfirmar`).
 *
 * O formulário do site não sabia nada disso: sem email dava «E-mail inválido»,
 * levava o foco ao campo e o pedido não chegava a sair. Quem só queria deixar o
 * telemóvel não conseguia pedir orçamento, e o site perdia o lead inteiro em
 * silêncio, na única página que paga a casa.
 *
 * O que muda é só isto: a AUSÊNCIA de email passa a ser aceite quando há
 * telemóvel. Um email MAL ESCRITO continua a ser recusado no próprio campo,
 * e o telemóvel segue a mesma regra pelo mesmo motivo: o que se aceita é não
 * o ter, não é tê-lo escrito pela metade.
 */
describe("OrcamentoForm — o contacto é email OU telemóvel, como no servidor", () => {
  /** O resto do pedido, para o servidor poder julgar só o par de contactos. */
  const semContacto = { name: "Ana Dias", location: "Sintra", notes: "Um jardim." };
  const servidorAceita = (contacto: { email: string; phone: string }) =>
    quoteFormSchema.safeParse({ ...semContacto, ...contacto }).success;

  /**
   * Um pedido completo com o contacto à escolha. Os dois campos são sempre
   * VISITADOS, mesmo quando ficam vazios: é assim que se atravessa um
   * formulário na vida real, e é o que faz aparecer (ou não) cada aviso.
   */
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

  /** O `form` que saiu no corpo do POST. */
  async function formEnviado() {
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return (
      JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string) as {
        form: Record<string, unknown>;
      }
    ).form;
  }

  it("só com telemóvel, o pedido sai — e o servidor aceita-o", async () => {
    // O oráculo é o servidor, não uma expectativa escrita à mão.
    expect(servidorAceita({ email: "", phone: "912345678" })).toBe(true);

    await preencherComContacto({ telefone: "912345678" });
    expect(screen.queryByText(to.errEmail)).toBeNull();
    expect(screen.queryByText(to.errContacto)).toBeNull();

    enviar();
    const form = await formEnviado();
    expect(form.email).toBe("");
    expect(form.phone).toBe("912345678");
    expect(quoteFormSchema.safeParse(form).success).toBe(true);
  });

  it("só com email, o pedido sai — e o servidor aceita-o", async () => {
    expect(servidorAceita({ email: "ana@exemplo.pt", phone: "" })).toBe(true);

    await preencherComContacto({ email: "ana@exemplo.pt" });
    expect(screen.queryByText(to.errTelefone)).toBeNull();
    expect(screen.queryByText(to.errContacto)).toBeNull();

    enviar();
    const form = await formEnviado();
    expect(form.email).toBe("ana@exemplo.pt");
    expect(form.phone).toBe("");
    expect(quoteFormSchema.safeParse(form).success).toBe(true);
  });

  it("sem nenhum dos dois, recusa — e com a frase que o servidor usa", async () => {
    expect(servidorAceita({ email: "", phone: "" })).toBe(false);

    await preencherComContacto({});
    enviar();

    // Uma frase, e a mesma que a rota devolveria: diz o que falta e porquê.
    expect(await screen.findByText(to.errContacto)).toBeInTheDocument();
    // E não a acusação errada, que era dizer que o email estava mal escrito
    // quando o que se passava é que não havia nenhum.
    expect(screen.queryByText(to.errEmail)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
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

  it("um telemóvel curto de mais e sem email é recusado", async () => {
    // O servidor também o recusa: sem email, o telefone tem de ter 9 dígitos.
    expect(servidorAceita({ email: "", phone: "91234" })).toBe(false);

    await preencherComContacto({ telefone: "91234" });
    enviar();

    expect(await screen.findByText(to.errTelefone)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("o email não deixa de ser pedido: a dica continua ao lado do campo", async () => {
    montar();
    expect(screen.getByText(to.hintEmail)).toBeInTheDocument();
    // E a chave dos campos obrigatórios deixa de dizer o que já não é verdade.
    expect(screen.getByText(to.requiredNote)).toBeInTheDocument();
  });

  it("quem vai enviar sem email é avisado de que não recebe a confirmação", async () => {
    // Antes de enviar, e não depois: a confirmação automática vai por email, e
    // sem email não vai a lado nenhum.
    await preencherComContacto({ telefone: "912345678" });
    expect(await screen.findByText(to.avisoSemEmail)).toBeInTheDocument();
  });

  it("e quem deixa email não lê um aviso que não lhe diz respeito", async () => {
    await preencherComContacto({ email: "ana@exemplo.pt", telefone: "912345678" });
    expect(screen.queryByText(to.avisoSemEmail)).toBeNull();
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
