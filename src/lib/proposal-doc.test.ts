import { describe, it, expect } from "vitest";
import {
  DEFAULT_VALID_DAYS,
  DEFAULT_VAT_RATE,
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_NOTAS_IMPORTANTES,
  COVER_SLOTS,
  countPendingImages,
  detectVatMode,
  isPendingImage,
  stripPendingImages,
  normaliseCoverImages,
  parseMoneyText,
  resolveProposalMoney,
  resolveValidUntil,
  diasDeValidade,
  diasDeValidadePeloEvento,
  diaDoEvento,
  withProposalDefaults,
  type ProposalDoc,
} from "./proposal-doc";
import { round2, montantesEmIngles, eur } from "./money";

describe("proposal-doc — parseMoneyText (pt-PT free text)", () => {
  it("extracts a euro amount with '+ IVA' trailing", () => {
    expect(parseMoneyText("3.000,00 € + IVA")).toBe(3000);
  });

  it("handles thousands dots and decimal comma", () => {
    expect(parseMoneyText("14.700,00 €")).toBe(14700);
    expect(parseMoneyText("1.234.567,89 €")).toBe(1234567.89);
  });

  it("handles a space thousands separator", () => {
    expect(parseMoneyText("1 500,00")).toBe(1500);
  });

  it("handles a bare integer and cents-only value", () => {
    expect(parseMoneyText("3000")).toBe(3000);
    expect(parseMoneyText("0,50 €")).toBe(0.5);
  });

  it("returns 0 for undefined, empty, or non-numeric text", () => {
    expect(parseMoneyText(undefined)).toBe(0);
    expect(parseMoneyText("")).toBe(0);
    expect(parseMoneyText("sob consulta")).toBe(0);
  });

  it("reads the first number when several appear", () => {
    expect(parseMoneyText("Decor 3.000,00 € + extras 500,00 €")).toBe(3000);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O CÍRCULO FECHADO: A CASA ESCREVE EM INGLÊS E TINHA DE SABER RELER
   * ════════════════════════════════════════════════════════════════════════
   *
   * O `montantesEmIngles` (money.ts) troca os separadores quando a proposta
   * sai na versão inglesa, e o leitor de PDF (`proposta-de-pdf/campos.ts`)
   * volta a passar esse texto por aqui. Com o leitor antigo, só de português:
   *
   *     3.000,00 €     → «€3,000.00»     → 3
   *     14.700,00 €    → «€14,700.00»    → 14,7
   *     1.234.567,89 € → «€1,234,567.89» → 1,23
   *     850,50 €       → «€850.50»       → 85 050   ← cem vezes MAIS
   *
   * O último é o que assusta: três euros salta à vista, oitenta e cinco mil
   * tem o ar de um número a sério. Este teste é o círculo: escreve-se em
   * inglês com a função da casa e relê-se com esta, e tem de voltar o mesmo
   * número.
   */
  it("lê a escrita inglesa que a própria casa produz, e devolve o mesmo número", () => {
    for (const n of [3000, 14700, 1234567.89, 850.5, 0.5, 99999.99]) {
      expect(parseMoneyText(montantesEmIngles(`${eur(n)}`))).toBe(n);
    }
  });

  it("decide o separador decimal pela forma, não pela língua", () => {
    // Os dois sinais: manda o último.
    expect(parseMoneyText("1.234.567,89")).toBe(1234567.89);
    expect(parseMoneyText("1,234,567.89")).toBe(1234567.89);
    // Um só, a separar grupos de três até ao fim: são milhares. Dinheiro tem
    // no máximo dois decimais, portanto três dígitos nunca são cêntimos.
    expect(parseMoneyText("3.000")).toBe(3000);
    expect(parseMoneyText("3,000")).toBe(3000);
    // Um só, com um ou dois dígitos a seguir: é o decimal.
    expect(parseMoneyText("3355.98")).toBe(3355.98);
    expect(parseMoneyText("3355,98")).toBe(3355.98);
    expect(parseMoneyText("2.5")).toBe(2.5);
    // Espaços são sempre milhares, nas duas línguas.
    expect(parseMoneyText("1 234 567,89")).toBe(1234567.89);
  });
});

describe("proposal-doc — detectVatMode", () => {
  it("defaults to 'incluido' for absent/plain text", () => {
    expect(detectVatMode(undefined)).toBe("incluido");
    expect(detectVatMode("3.000,00 €")).toBe("incluido");
    expect(detectVatMode("IVA incluído")).toBe("incluido");
  });

  it("detects the net-value annotations as 'acrescer'", () => {
    expect(detectVatMode("3.000,00 € + IVA")).toBe("acrescer");
    expect(detectVatMode("3000 mais IVA")).toBe("acrescer");
    expect(detectVatMode("ao valor acresce o IVA")).toBe("acrescer");
    expect(detectVatMode("valor com IVA não incluído")).toBe("acrescer");
    expect(detectVatMode("iva nao incluido")).toBe("acrescer"); // no accents
  });

  it("is case-insensitive", () => {
    expect(detectVatMode("3000 + iva")).toBe("acrescer");
    expect(detectVatMode("3000 + IVA")).toBe("acrescer");
  });
});

describe("proposal-doc — resolveProposalMoney", () => {
  // resolveProposalMoney types `totalText` as required (mirroring ProposalDoc)
  // yet handles it being falsy at runtime; default it to "" so partial inputs
  // stay type-clean without changing behavior (empty text → parseMoneyText 0).
  type MoneyInput = Parameters<typeof resolveProposalMoney>[0];
  const money = (d: Partial<MoneyInput> = {}) => resolveProposalMoney({ totalText: "", ...d });

  it("keeps base + vat === gross in 'acrescer' mode", () => {
    const m = money({ totalAmount: 3000, totalVatMode: "acrescer" });
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
    expect(round2(m.base + m.vat)).toBe(m.gross);
  });

  it("keeps base + vat === gross in 'incluido' mode", () => {
    const m = money({ totalAmount: 3690, totalVatMode: "incluido" });
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
    expect(round2(m.base + m.vat)).toBe(m.gross);
  });

  it("maintains the base+vat===gross invariant for awkward rounding values (both modes)", () => {
    for (const amount of [100, 99.99, 12345.67, 1, 0.03, 777.77]) {
      const inc = money({ totalAmount: amount, totalVatMode: "incluido" });
      expect(round2(inc.base + inc.vat)).toBe(inc.gross);
      expect(inc.gross).toBe(round2(amount));

      const acr = money({ totalAmount: amount, totalVatMode: "acrescer" });
      expect(round2(acr.base + acr.vat)).toBe(acr.gross);
      expect(acr.base).toBe(round2(amount));
    }
  });

  it("prefers the STRUCTURED amount over free text", () => {
    const m = money({
      totalAmount: 5000,
      totalVatMode: "acrescer",
      totalText: "9.999,00 €",
    });
    expect(m.base).toBe(5000);
  });

  it("falls back to free text when totalAmount is absent, detecting the mode from text", () => {
    const m = money({ totalText: "3.000,00 € + IVA" });
    expect(m.mode).toBe("acrescer");
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
  });

  it("falls back to totalEstimatedText when totalText is missing", () => {
    const m = money({ totalEstimatedText: "12.500,00 €" });
    expect(m.gross).toBe(12500);
    expect(m.mode).toBe("incluido");
  });

  it("treats non-positive totalAmount as absent and uses text instead", () => {
    expect(money({ totalAmount: 0, totalText: "1.000,00 €" }).gross).toBe(1000);
    expect(money({ totalAmount: -5, totalText: "1.000,00 €" }).gross).toBe(1000);
  });

  it("returns an all-zero, coherent result when there is no amount at all", () => {
    const m = money({});
    expect(m).toMatchObject({ base: 0, vat: 0, gross: 0 });
    expect(m.vatRate).toBe(DEFAULT_VAT_RATE);
  });

  it("honours a custom vatRate and rejects a negative one (falls back to default)", () => {
    expect(money({ totalAmount: 1000, totalVatMode: "acrescer", vatRate: 0.06 }).vat).toBe(60);
    expect(money({ totalAmount: 1230, totalVatMode: "incluido", vatRate: -1 }).base).toBe(1000);
  });

  it("supports a 0% vat rate (base === gross, vat 0)", () => {
    const m = money({ totalAmount: 1000, totalVatMode: "acrescer", vatRate: 0 });
    expect(m).toMatchObject({ base: 1000, vat: 0, gross: 1000, vatRate: 0 });
  });

  it("lets an explicit totalVatMode override the text heuristic", () => {
    // Text says "+ IVA" (would detect acrescer) but structured mode wins.
    const m = money({
      totalAmount: 1230,
      totalVatMode: "incluido",
      totalText: "1.230,00 € + IVA",
    });
    expect(m.mode).toBe("incluido");
    expect(m.base).toBe(1000);
  });
});

describe("proposal-doc — resolveValidUntil", () => {
  const from = new Date("2026-07-20T00:00:00Z");
  const addDays = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  };

  it("honours an explicit yyyy-mm-dd validUntil verbatim", () => {
    expect(resolveValidUntil({ validUntil: "2026-12-31" }, from)).toBe("2026-12-31");
  });

  it("ignores a malformed validUntil and uses the day count", () => {
    expect(resolveValidUntil({ validUntil: "31/12/2026", validUntilDays: 10 }, from)).toBe(
      addDays(from, 10),
    );
  });

  it("defaults to DEFAULT_VALID_DAYS after 'from' when nothing is set", () => {
    expect(resolveValidUntil({}, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
  });

  it("honours a positive validUntilDays and floors a fractional one", () => {
    expect(resolveValidUntil({ validUntilDays: 7 }, from)).toBe(addDays(from, 7));
    expect(resolveValidUntil({ validUntilDays: 7.9 }, from)).toBe(addDays(from, 7));
  });

  it("falls back to the default for zero or negative day counts", () => {
    expect(resolveValidUntil({ validUntilDays: 0 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
    expect(resolveValidUntil({ validUntilDays: -5 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
  });

  it("rolls the month over correctly at a boundary", () => {
    expect(resolveValidUntil({ validUntilDays: 20 }, new Date("2026-01-20T00:00:00Z"))).toBe(
      "2026-02-09",
    );
  });

  /**
   * ── OS DIAS CONTAM-SE A PARTIR DO DIA DE QUEM ENVIA ──────────────────────
   *
   * A validade é um DIA DO CALENDÁRIO, e o calendário do estúdio é o de
   * Portugal. Entre a meia-noite e a 01:00 do Verão, Lisboa já virou o dia e
   * Greenwich ainda não — e a conta partia do dia de Greenwich, portanto de
   * ONTEM. A proposta enviada às 00:30 de 13 de Agosto saía «válida até 11 de
   * Outubro» em vez de 12: um dia a menos do que os 60 prometidos, e o dia que
   * falta é o último, que é justamente aquele em que os casais decidem.
   *
   * As datas destes testes são instantes ABSOLUTOS de propósito: o resultado
   * tem de ser o mesmo com o processo em UTC (é onde correm os servidores e o
   * runner) ou em Lisboa.
   */
  it("conta os dias a partir do dia civil PORTUGUÊS e não do de Greenwich", () => {
    // 13/08/2026 00:30 em Lisboa (WEST, UTC+1) — ainda 12/08 em UTC.
    const madrugadaDeVerao = new Date("2026-08-12T23:30:00Z");
    expect(resolveValidUntil({ validUntilDays: 60 }, madrugadaDeVerao)).toBe("2026-10-12");
    expect(resolveValidUntil({}, madrugadaDeVerao)).toBe("2026-10-12");
  });

  it("no Inverno (Lisboa == UTC) a mesma hora dá o mesmo dia de sempre", () => {
    // 12/01/2026 23:30 em Lisboa (WET, UTC+0): aqui os dois calendários batem
    // certo, e o resultado não pode mudar com a correcção acima.
    const madrugadaDeInverno = new Date("2026-01-12T23:30:00Z");
    expect(resolveValidUntil({ validUntilDays: 60 }, madrugadaDeInverno)).toBe("2026-03-13");
  });
});

describe("proposal-doc — withProposalDefaults", () => {
  const base = (over: Partial<ProposalDoc> = {}): Parameters<typeof withProposalDefaults>[0] => ({
    ref: "PO Test",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalLabel: "Total",
    totalText: "3.000,00 € + IVA",
    coverImages: [],
    ...over,
  });

  it("fills every boilerplate section when the doc omits them", () => {
    const doc = withProposalDefaults(base());
    expect(doc.notasImportantes).toEqual(DEFAULT_NOTAS_IMPORTANTES);
    expect(doc.incluido.length).toBeGreaterThan(0);
    expect(doc.naoIncluido.length).toBeGreaterThan(0);
    expect(doc.observacoesGerais.length).toBeGreaterThan(0);
    expect(doc.faseamento.length).toBeGreaterThan(0);
    expect(doc.cancelamento.length).toBeGreaterThan(0);
  });

  it("BUG-GUARD: coerces missing variable arrays to [] so the PDF renderer never crashes", () => {
    // A corrupt/old localStorage draft can omit serviceGroups/budgetItems/etc.;
    // the renderer iterates them directly, so an undefined would throw
    // "undefined is not iterable" → generic 500 "erro ao gerar a proposta".
    const partial = {
      ref: "PO Test",
      clientNames: "Maria",
      eventType: "Casamento",
      eventDate: "",
      location: "",
      guests: "",
      totalLabel: "Total",
      totalText: "",
    } as Parameters<typeof withProposalDefaults>[0];
    const doc = withProposalDefaults(partial);
    expect(doc.serviceGroups).toEqual([]);
    expect(doc.moodBoards).toEqual([]);
    expect(doc.cronograma).toEqual([]);
    expect(doc.budgetItems).toEqual([]);
    expect(doc.budgetExtras).toEqual([]);
    expect(doc.budgetRows).toEqual([]);
    // A capa sai sempre com as duas POSIÇÕES, vazias mas presentes.
    expect(doc.coverImages).toEqual(["", ""]);
  });

  it("BUG-GUARD: os ids dos serviços vêm da POSIÇÃO, nunca sorteados", () => {
    // Isto corre a cada pré-visualização e a cada envio. Um id sorteado aqui
    // faria o MESMO documento serializar diferente de cada vez — rascunho a
    // "mudar" sozinho, gravações e comparações a acordar sem motivo.
    const partida = base({
      serviceGroups: [{ letter: "a)", title: "Decoração", items: [{ label: "Cerimónia" }] }],
    });
    const uma = withProposalDefaults(partida);
    const outra = withProposalDefaults(partida);
    expect(JSON.stringify(uma.serviceGroups)).toBe(JSON.stringify(outra.serviceGroups));
    expect(uma.serviceGroups[0].id).toBe("g0");
    expect(uma.serviceGroups[0].items[0].id).toBe("g0~i0");
  });

  it("respeita os ids que o editor já atribuiu (e desempata repetidos)", () => {
    const doc = withProposalDefaults(
      base({
        serviceGroups: [
          { id: "sA", title: "Um", items: [{ id: "sX", label: "L" }] },
          { id: "sA", title: "Dois", items: [] },
        ],
      }),
    );
    expect(doc.serviceGroups[0].id).toBe("sA");
    expect(doc.serviceGroups[0].items[0].id).toBe("sX");
    // Um rascunho estragado com o id repetido não pode dar duas chaves iguais.
    expect(doc.serviceGroups[1].id).toBe("sA_2");
  });

  it("substitutes {DATA} and {CONVIDADOS} in the general conditions", () => {
    const doc = withProposalDefaults(base());
    const joined = doc.condicoesGerais.join("\n");
    expect(joined).toContain("3 de julho de 2027");
    expect(joined).toContain("150 pax");
    // No leftover placeholders anywhere.
    expect(joined).not.toContain("{DATA}");
    expect(joined).not.toContain("{CONVIDADOS}");
  });

  /**
   * ── SEM DATA E SEM NÚMERO, A CLÁUSULA CONTINUA A SER UMA FRASE ────────────
   *
   * «Data flexível» é o caso NORMAL de quem ainda anda a escolher o dia — o
   * formulário grava `date: ""` e o estúdio semeia `eventDate: ""`. O que o
   * casal lia nas Condições Gerais era «Esta proposta só é válida para o evento
   * a realizar no dia —.»: um marcador de folha de cálculo no meio de uma
   * CLÁUSULA CONTRATUAL, que é a folha que ganha uma discussão meses depois.
   *
   * O padrão certo é o do email de confirmação, que no mesmo caso escreve «Data:
   * ainda a definir» — palavras, não símbolos.
   */
  it("sem data e sem número, as Condições Gerais continuam frases inteiras", () => {
    const doc = withProposalDefaults(base({ eventDate: "", guests: "" }));
    const joined = doc.condicoesGerais.join("\n");
    expect(joined).not.toContain("{DATA}");
    expect(joined).not.toContain("{CONVIDADOS}");
    // Nem marcador, nem o travessão que lá estava a fazer de data.
    expect(joined).not.toContain("—");
    expect(joined).toContain(
      "Esta proposta só é válida para a data do evento que vier a ser confirmada por escrito.",
    );
    expect(joined).toContain(
      "O orçamento é válido para o número de convidados que vier a ser confirmado por escrito;" +
        " abaixo ou acima desse número o valor da proposta terá de ser revisto.",
    );
  });

  it("com data mas sem número, só a cláusula do número é reescrita", () => {
    const doc = withProposalDefaults(base({ guests: "" }));
    const joined = doc.condicoesGerais.join("\n");
    expect(joined).toContain("a realizar no dia 3 de julho de 2027.");
    expect(joined).toContain("o número de convidados que vier a ser confirmado por escrito");
    expect(joined).not.toContain("—");
  });

  /**
   * `String.replace` com uma string troca só a PRIMEIRA ocorrência: uma condição
   * editada à mão com o marcador repetido saía com o segundo literal — «{DATA}»
   * impresso no PDF do cliente.
   */
  it("uma condição editada à mão com o marcador REPETIDO fica toda preenchida", () => {
    const doc = withProposalDefaults(
      base({
        condicoesGerais: ["De {DATA} a {DATA}, para {CONVIDADOS} e não mais de {CONVIDADOS}."],
      }),
    );
    expect(doc.condicoesGerais[0]).toBe(
      "De 3 de julho de 2027 a 3 de julho de 2027, para 150 pax e não mais de 150 pax.",
    );
  });

  it("still runs token substitution over a CUSTOM condicoesGerais array", () => {
    const doc = withProposalDefaults(
      base({ condicoesGerais: ["Evento em {DATA} para {CONVIDADOS}."] }),
    );
    expect(doc.condicoesGerais).toEqual(["Evento em 3 de julho de 2027 para 150 pax."]);
  });

  it("does not overwrite explicitly-provided boilerplate", () => {
    const custom = ["A minha nota"];
    const doc = withProposalDefaults(base({ notasImportantes: custom }));
    expect(doc.notasImportantes).toEqual(custom);
  });

  it("does not mutate the shared DEFAULT_CONDICOES_GERAIS constant", () => {
    const snapshot = [...DEFAULT_CONDICOES_GERAIS];
    withProposalDefaults(base());
    expect(DEFAULT_CONDICOES_GERAIS).toEqual(snapshot);
    // The template still carries the raw tokens for the next caller.
    expect(DEFAULT_CONDICOES_GERAIS.some((s) => s.includes("{DATA}"))).toBe(true);
  });

  it("as condições cobram deslocação E alojamento — são custos diferentes", () => {
    // A deslocação já lá estava. O ALOJAMENTO não: um casamento a quatro horas
    // de Évora obriga a equipa a dormir lá, e esse custo não era dito ao
    // cliente nem cobrado — ficava com a Líquen.
    const doc = withProposalDefaults(base());
    const texto = doc.condicoesGerais.join("\n");
    expect(texto).toMatch(/deslocação/i);
    expect(texto).toMatch(/pernoitar/i);
    expect(texto).toMatch(/alojamento/i);
  });

  it("uma proposta já gravada NÃO é reescrita pelas condições novas", () => {
    // A regra que torna seguro afinar os textos: mudar o modelo não pode
    // alterar o que já foi enviado a um cliente, porque isso mudava um
    // documento que ele já tem na mão.
    const proprias = ["Só isto foi acordado com este cliente."];
    const doc = withProposalDefaults(base({ condicoesGerais: proprias }));
    expect(doc.condicoesGerais).toEqual(proprias);
  });

  it("BUG-GUARD: normalises the cover to two POSITIONS so a right-slot photo stays right", () => {
    // Draft antigo com um buraco à esquerda: a foto tem de continuar na posição 1.
    const doc = withProposalDefaults(
      base({ coverImages: [null, "storage/direita.jpg"] as unknown as string[] }),
    );
    expect(doc.coverImages).toEqual(["", "storage/direita.jpg"]);
  });
});

describe("proposal-doc — normaliseCoverImages", () => {
  it("always emits exactly COVER_SLOTS positions", () => {
    expect(COVER_SLOTS).toBe(2);
    expect(normaliseCoverImages()).toEqual(["", ""]);
    expect(normaliseCoverImages(null)).toEqual(["", ""]);
    expect(normaliseCoverImages([])).toEqual(["", ""]);
    expect(normaliseCoverImages(["a", "b"])).toEqual(["a", "b"]);
  });

  it("keeps legacy sparse / short drafts on the side they were chosen for", () => {
    // `[null, "b"]` e `[undefined, "b"]` — o que ficava no localStorage depois
    // de escolher só a capa da direita, ou de remover a da esquerda.
    expect(normaliseCoverImages([null, "b"])).toEqual(["", "b"]);
    expect(normaliseCoverImages([undefined, "b"])).toEqual(["", "b"]);
    // Curto: só a esquerda estava preenchida.
    expect(normaliseCoverImages(["a"])).toEqual(["a", ""]);
  });

  it("ignores anything past the two slots and never returns a hole", () => {
    expect(normaliseCoverImages(["a", "b", "c"])).toEqual(["a", "b"]);
    expect(normaliseCoverImages(["a", "b"]).every((s) => typeof s === "string")).toBe(true);
  });

  it("returns a fresh array (callers write into it)", () => {
    const input = ["a", "b"];
    const out = normaliseCoverImages(input);
    out[0] = "z";
    expect(input[0]).toBe("a");
  });
});

describe("proposal-doc — marcadores provisórios de foto", () => {
  const doc = {
    coverImages: ["pending:a", "capa/direita.jpg"],
    moodBoards: [
      { title: "Cerimónia", images: ["b/1.jpg", "pending:b", "b/2.jpg"] },
      { title: "Copo", images: ["b/3.jpg"] },
    ],
  };

  it("reconhece o marcador e nunca confunde um caminho com ele", () => {
    expect(isPendingImage("pending:abc")).toBe(true);
    // Um caminho de Storage é `<uuid>/<ficheiro>` — nunca tem o prefixo.
    expect(isPendingImage("LQ-001/pending-foto.jpg")).toBe(false);
    expect(isPendingImage("")).toBe(false);
    expect(isPendingImage(undefined)).toBe(false);
  });

  it("conta as fotos que ainda são promessas, nas capas e nos mood boards", () => {
    expect(countPendingImages(doc)).toBe(2);
    expect(countPendingImages({})).toBe(0);
  });

  it("na CAPA o marcador vira vazio e a posição não encolhe", () => {
    // Compactar aqui mandava a foto da direita imprimir à esquerda.
    expect(stripPendingImages(doc).coverImages).toEqual(["", "capa/direita.jpg"]);
  });

  it("no mood board o marcador sai da lista, sem mexer na ordem das outras", () => {
    expect(stripPendingImages(doc).moodBoards[0].images).toEqual(["b/1.jpg", "b/2.jpg"]);
    // O board que não tinha nenhum sai intacto (a MESMA referência).
    expect(stripPendingImages(doc).moodBoards[1]).toBe(doc.moodBoards[1]);
  });

  it("numa página escolhida, a foto a caminho deixa o SEU lugar vazio (o 6.º da paleta é o painel)", () => {
    const comPagina = {
      fotosDasPaginas: {
        ambiente: {
          fotos: ["pending:x", "a.jpg", "", "", "", "painel.jpg"],
          focos: [null, { x: 0.2, y: 0.3 }, null, null, null, null],
        },
        indice: { fotos: ["pending:y"] },
      },
    };
    const limpo = stripPendingImages(comPagina).fotosDasPaginas!;
    expect(limpo.ambiente.fotos).toEqual(["", "a.jpg", "", "", "", "painel.jpg"]);
    expect(limpo.ambiente.focos?.[1]).toEqual({ x: 0.2, y: 0.3 });
    // Uma página que só tinha a que vem a caminho volta ao automático.
    expect(limpo.indice).toBeUndefined();
  });

  it("devolve o MESMO objeto quando não há nada a filtrar", () => {
    const limpo = { coverImages: ["a", "b"], moodBoards: [{ title: "t", images: ["c"] }] };
    expect(stripPendingImages(limpo)).toBe(limpo);
  });
});

/**
 * A VALIDADE DEPENDE DO EVENTO (14/10). Palavras dela: «não faz sentido dizer
 * que a validade da proposta é 90 dias e eles mandam uma proposta para o
 * evento que é para a semana». A regra: mais de 90 dias → 60; 30–90 → 30, sem
 * passar da véspera; menos de 30 → até à véspera, no máximo 7 e nunca menos
 * de 5.
 */
describe("proposal-doc — a validade pelo evento", () => {
  const hoje = "2026-10-14";
  const em = (dias: number) => {
    const d = new Date(Date.UTC(2026, 9, 14 + dias));
    return d.toISOString().slice(0, 10);
  };

  it("cada escalão da regra", () => {
    expect(diasDeValidadePeloEvento(hoje, null)).toBe(60);
    expect(diasDeValidadePeloEvento(hoje, em(200))).toBe(60);
    expect(diasDeValidadePeloEvento(hoje, em(91))).toBe(60);
    expect(diasDeValidadePeloEvento(hoje, em(90))).toBe(30);
    expect(diasDeValidadePeloEvento(hoje, em(31))).toBe(30);
    expect(diasDeValidadePeloEvento(hoje, em(30))).toBe(29); // a véspera
    expect(diasDeValidadePeloEvento(hoje, em(20))).toBe(7);
    expect(diasDeValidadePeloEvento(hoje, em(7))).toBe(6); // a véspera
    expect(diasDeValidadePeloEvento(hoje, em(5))).toBe(5); // nunca menos de 5
    expect(diasDeValidadePeloEvento(hoje, em(2))).toBe(5);
    // Uma data que já passou é um erro da data (a Conferência aponta-o).
    expect(diasDeValidadePeloEvento(hoje, em(-3))).toBe(60);
  });

  it("lê a data como o estúdio a escreve", () => {
    expect(diaDoEvento("21 de outubro de 2026")).toBe("2026-10-21");
    expect(diaDoEvento("3 de Março de 2027")).toBe("2027-03-03");
    expect(diaDoEvento("2026-10-21")).toBe("2026-10-21");
    expect(diaDoEvento("Outubro")).toBeNull();
    expect(diaDoEvento(undefined)).toBeNull();
  });

  it("uma proposta para a semana que vem não sai «válida 60 dias»", () => {
    const meioDia = new Date("2026-10-14T11:00:00Z");
    // O estúdio escrevia os 60 das preferências em todos os rascunhos.
    const doc = { validUntilDays: 60, eventDate: "21 de outubro de 2026" };
    expect(resolveValidUntil(doc, meioDia)).toBe("2026-10-20"); // a véspera
    expect(resolveValidUntil({ eventDate: "21 de outubro de 2026" }, meioDia)).toBe("2026-10-20");
  });

  it("com o evento longe, os dias escritos à mão mandam", () => {
    const meioDia = new Date("2026-10-14T11:00:00Z");
    const doc = { validUntilDays: 90, eventDate: "20 de maio de 2027" };
    expect(resolveValidUntil(doc, meioDia)).toBe("2027-01-12");
  });

  it("dias escritos abaixo da regra ficam; uma data fixada fica sempre", () => {
    const meioDia = new Date("2026-10-14T11:00:00Z");
    expect(
      resolveValidUntil({ validUntilDays: 3, eventDate: "21 de outubro de 2026" }, meioDia),
    ).toBe("2026-10-17");
    expect(
      resolveValidUntil({ validUntil: "2026-12-01", eventDate: "21 de outubro de 2026" }, meioDia),
    ).toBe("2026-12-01");
  });

  it("os dias de `diasDeValidade` são os da data", () => {
    expect(diasDeValidade({ eventDate: "13 de novembro de 2026" }, hoje)).toBe(29);
  });
});
