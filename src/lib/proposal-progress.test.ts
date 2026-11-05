import { describe, it, expect } from "vitest";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "./proposal-progress";
import type { ProposalDoc } from "./proposal-doc";
import { eur } from "./money";

/** O documento tal como o estúdio o ABRE: a estrutura montada, nada escrito. */
const RECEM_ABERTO = {
  template: "decoracao",
  ref: "",
  clientNames: "",
  eventType: "Casamento",
  eventDate: "",
  location: "",
  guests: "",
  serviceGroups: [{ letter: "a)", title: "", items: [{ label: "", desc: "" }] }],
  moodBoards: [],
  budgetItems: [],
  coverImages: ["", ""],
  totalLabel: "Valor Total Decoração",
  totalText: "",
} as unknown as ProposalDoc;

const COMPLETO = {
  ...RECEM_ABERTO,
  ref: "Decoração Casamento Irina e Hugo",
  clientNames: "Irina e Hugo",
  eventDate: "10 de junho de 2027",
  location: "Herdade da Maridona",
  serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
  moodBoards: [{ title: "Cerimónia", images: ["a.jpg"] }],
  budgetItems: ["Decor Cerimónia", "Decor Jantar"],
  budgetAmounts: [900, 2350],
  // O artigo do Moloni de cada linha passou a ser obrigatório (5/11).
  budgetArtigos: ["flores", "flores"],
  coverImages: ["capa.jpg", ""],
  totalAmount: 3250,
  // «+ IVA», como as propostas reais: com o modo calado lia-se «IVA incluído»,
  // e as linhas (sempre sem IVA) deixavam de somar o total.
  totalVatMode: "acrescer",
} as unknown as ProposalDoc;

describe("estadoDasSeccoes", () => {
  /**
   * A ARMADILHA DESTE INDICADOR.
   *
   * O estúdio abre com um grupo de serviços já lá — com o título vazio e um
   * item vazio. Contar a estrutura em vez do conteúdo punha um visto verde
   * numa secção onde não há nada escrito, e um indicador que mente uma vez
   * deixa de ser lido.
   */
  it("um grupo vazio não conta como serviços preenchidos", () => {
    const s = estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "servicos");
    expect(s?.preenchida).toBe(false);
    expect(s?.resumo).toBe("por preencher");
  });

  it("um grupo com título conta", () => {
    const s = estadoDasSeccoes(COMPLETO).find((x) => x.id === "servicos");
    expect(s?.preenchida).toBe(true);
    expect(s?.resumo).toBe("1 grupo");
  });

  it("uma posição de capa vazia não conta como foto", () => {
    // O array das capas tem SEMPRE duas posições; uma vazia é `""`.
    expect(estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "capas")?.resumo).toBe("sem fotos");
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "capas")?.resumo).toBe("1 foto");
  });

  it("o evento só está feito com nome, data e local", () => {
    expect(estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "evento")?.preenchida).toBe(false);
    const semLocal = { ...COMPLETO, location: "" } as unknown as ProposalDoc;
    expect(estadoDasSeccoes(semLocal).find((x) => x.id === "evento")?.preenchida).toBe(false);
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "evento")?.preenchida).toBe(true);
  });

  it("o singular e o plural estão certos", () => {
    // Um indicador que diz "1 linhas" faz duvidar de tudo o resto que diz.
    const uma = { ...COMPLETO, budgetItems: ["Só uma"] } as unknown as ProposalDoc;
    expect(estadoDasSeccoes(uma).find((x) => x.id === "orcamento")?.resumo).toContain("1 linha");
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "orcamento")?.resumo).toContain(
      "2 linhas",
    );
  });

  /**
   * ── O ÍNDICE CONTAVA LINHAS ONDE O QUE INTERESSA É O VALOR ───────────────
   *
   * Palavras dela: «o Orçamento conta linhas e não o total».
   *
   * As duas perguntas que se fazem a um índice num relance são «está feito?» e
   * «quanto é?». Ele respondia mal às duas: dava um visto verde a um orçamento
   * de zero euros com três linhas, e o número que mostrava era o das linhas.
   */
  it("o orçamento diz o valor, e não só quantas linhas tem", () => {
    const s = estadoDasSeccoes(COMPLETO).find((x) => x.id === "orcamento");
    // O formato é o da casa, e é por isso que a afirmação passa por `eur`: o
    // que se prende é que o VALOR aparece, não como o pt-PT agrupa milhares.
    expect(s?.resumo).toBe(`2 linhas · ${eur(3997.5)}`);
    expect(s?.preenchida).toBe(true);
  });

  it("linhas sem valor nenhum não são um orçamento feito", () => {
    const semValor = { ...COMPLETO, totalAmount: 0 } as unknown as ProposalDoc;
    const s = estadoDasSeccoes(semValor).find((x) => x.id === "orcamento");
    expect(s?.preenchida).toBe(false);
    expect(s?.resumo).toBe("2 linhas · sem valor");
  });

  it("e o total diz o número, e não a palavra «definido»", () => {
    // «Definido» diz que existe um número sem dizer qual, e obrigava a ir lá
    // abaixo confirmar — que é exactamente o que um índice existe para evitar.
    const s = estadoDasSeccoes(COMPLETO).find((x) => x.id === "total");
    expect(s?.resumo).toBe(eur(3997.5));
    expect(estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "total")?.resumo).toBe(
      "por definir",
    );
  });

  it("o valor é o MESMO do quadro: com IVA e com adicionais", () => {
    // Uma segunda soma aqui discordaria do orçamento um dia — e o sítio onde
    // ela repara nisso é a folha que já seguiu para o casal.
    const comIva = {
      ...COMPLETO,
      totalAmount: 1000,
      totalVatMode: "acrescer",
      vatRate: 0.23,
    } as unknown as ProposalDoc;
    expect(estadoDasSeccoes(comIva).find((x) => x.id === "total")?.resumo).toBe(eur(1230));
  });

  it("no modelo de Organização mostra o cronograma, não os mood boards", () => {
    const org = { ...COMPLETO, template: "organizacao" } as unknown as ProposalDoc;
    const ids = estadoDasSeccoes(org).map((s) => s.id);
    expect(ids).toContain("cronograma");
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("capas");
  });
});

describe("oQueFaltaParaEnviar", () => {
  it("numa proposta vazia, trava o nome, o título, o valor, a data e os serviços", () => {
    const travam = oQueFaltaParaEnviar(RECEM_ABERTO, 0)
      .filter((f) => f.trava)
      .map((f) => f.texto);
    expect(travam).toEqual([
      "Falta o nome dos clientes",
      "Falta o título interno",
      "Falta o valor",
      "Falta a data do evento",
      "A secção Serviços está vazia",
      "O orçamento não tem serviços: escreve cada serviço com o seu valor",
    ]);
  });

  it("sem nenhum serviço no orçamento não sai — só um total escrito não chega (5/11)", () => {
    const d = {
      ...COMPLETO,
      budgetItems: [],
      budgetAmounts: [],
      budgetArtigos: [],
    } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(d, 3997.5).find((x) => x.id === "linhas-do-orcamento");
    expect(f).toMatchObject({ trava: true, seccao: "orcamento" });
    expect(podeEnviar(d, 3997.5)).toBe(false);
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A LINHA QUE DEIXOU SAIR UMA PROPOSTA VAZIA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Foi enviada uma proposta com a secção de Serviços em branco. O índice
   * lateral dizia «Serviços · por preencher» — estava certo, e era a única
   * coisa no ecrã a dizer a verdade —, e o botão verde ao lado deixou passar,
   * porque isto estava escrito como conselho.
   *
   * O critério dela: se o cliente receber algo que parece um erro, bloqueia.
   */
  it("uma proposta sem serviços não sai, por muito completa que esteja o resto", () => {
    const semServicos = { ...COMPLETO, serviceGroups: [] } as unknown as ProposalDoc;
    expect(podeEnviar(semServicos, 3997.5)).toBe(false);
  });

  it("nem com os grupos montados e vazios, que é como o estúdio abre", () => {
    const soAEstrutura = {
      ...COMPLETO,
      serviceGroups: [{ title: "", items: [{ label: "" }] }],
    } as unknown as ProposalDoc;
    expect(podeEnviar(soAEstrutura, 3997.5)).toBe(false);
  });

  it("numa proposta completa não trava nada", () => {
    expect(oQueFaltaParaEnviar(COMPLETO, 3997.5).filter((f) => f.trava)).toEqual([]);
  });

  it("cada falta sabe a que secção pertence, para o link lá saltar", () => {
    for (const f of oQueFaltaParaEnviar(RECEM_ABERTO, 0)) {
      expect(f.seccao).toBeTruthy();
      expect(estadoDasSeccoes(RECEM_ABERTO).map((s) => s.id)).toContain(f.seccao);
    }
  });

  it("os conselhos não travam", () => {
    // Uma proposta sem mood boards pode ser enviada. Provavelmente não devia,
    // e é isso que a diferença entre travar e aconselhar diz.
    const semBoards = { ...COMPLETO, moodBoards: [] } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(semBoards, 3997.5);
    expect(f.some((x) => x.texto === "Sem mood boards")).toBe(true);
    expect(f.every((x) => !x.trava)).toBe(true);
    expect(podeEnviar(semBoards, 3997.5)).toBe(true);
  });

  it("avisa quando o total não bate com a soma das linhas — e passou a travar (5/11)", () => {
    const torto = { ...COMPLETO, totalAmount: 4000 } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(torto, 4920);
    expect(f.find((x) => x.texto.includes("não bate"))?.trava).toBe(true);
  });

  /**
   * O PREÇO E O ARTIGO DO MOLONI DE CADA LINHA (5/11). Ela: «não deixar enviar
   * as propostas sem estabelecer um valor para cada coisa … para depois no
   * Moloni estar tudo registado». Só para a casa: o cliente não vê nada disto.
   */
  it("uma linha sem preço trava, e diz qual", () => {
    const d = { ...COMPLETO, budgetAmounts: [900, null] } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(d, 3997.5).find((x) => x.id === "precos-das-linhas");
    expect(f).toMatchObject({ trava: true, seccao: "orcamento", campo: "budgetPreco:1" });
    expect(f?.texto).toMatch(/«Decor Jantar» não tem preço/);
    expect(podeEnviar(d, 3997.5)).toBe(false);
  });

  it("uma linha sem artigo do Moloni trava, e diz qual", () => {
    const d = { ...COMPLETO, budgetArtigos: ["flores", null] } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(d, 3997.5).find((x) => x.id === "artigos-moloni");
    expect(f).toMatchObject({ trava: true, campo: "budgetArtigo:1" });
    expect(f?.texto).toMatch(/«Decor Jantar» não tem artigo do Moloni/);
  });

  it("um valor adicional com número também precisa de artigo; um «a definir» não", () => {
    const comNumero = {
      ...COMPLETO,
      budgetExtras: [{ label: "Deslocação", valueText: "150,00 € + IVA" }],
      totalAmount: 3400,
    } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(comNumero, 4182).find((x) => x.id === "artigos-moloni");
    expect(f).toMatchObject({ trava: true, campo: "extraArtigo:0" });
    const aDefinir = {
      ...COMPLETO,
      budgetExtras: [{ label: "Alojamento", valueText: "a definir" }],
    } as unknown as ProposalDoc;
    expect(oQueFaltaParaEnviar(aDefinir, 3997.5).some((x) => x.id === "artigos-moloni")).toBe(
      false,
    );
  });

  /**
   * O AVISO QUE TOCAVA EM TODAS AS PROPOSTAS COM «IVA INCLUÍDO».
   *
   * Os preços das linhas são LÍQUIDOS — é a base, sem IVA, que se soma. O
   * `totalAmount`, esse, só é a base em modo "acrescer"; em "incluído" é o
   * BRUTO. Comparar a soma líquida com o total bruto dava, numa proposta
   * perfeitamente certa de 10.000 € de base, uma diferença de 2.300 € — e o
   * painel «O que falta para enviar» dizia «O total não bate com a soma das
   * linhas» em TODAS as propostas com IVA incluído, sempre. Ao lado das linhas
   * (que compara base com base) não aparecia aviso nenhum, portanto os dois
   * ecrãs discordavam um do outro.
   *
   * Um aviso que toca sempre é um aviso que se deixa de ler — e a seguir passa
   * despercebido o dia em que o total está mesmo errado.
   */
  it("com IVA incluído, não inventa um desalinhamento de 23%", () => {
    const comIvaIncluido = {
      ...COMPLETO,
      budgetItems: ["Decor Cerimónia", "Decor Jantar"],
      budgetAmounts: [8000, 2000],
      // A base é 10.000 €; com o IVA lá dentro, o documento guarda 12.300 €.
      totalAmount: 12_300,
      totalVatMode: "incluido",
    } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(comIvaIncluido, 12_300);
    expect(f.map((x) => x.texto)).not.toContain("O total não bate com a soma das linhas");
  });

  it("com IVA incluído, continua a apanhar um total mesmo errado", () => {
    // A mesma proposta com a base a 9.000 € (11.070 € com IVA) e as linhas a
    // somar 10.000 €: aí o aviso TEM de aparecer.
    const torto = {
      ...COMPLETO,
      budgetItems: ["Decor Cerimónia", "Decor Jantar"],
      budgetAmounts: [8000, 2000],
      totalAmount: 11_070,
      totalVatMode: "incluido",
    } as unknown as ProposalDoc;
    expect(oQueFaltaParaEnviar(torto, 11_070).map((x) => x.texto)).toContain(
      "O total não bate com a soma das linhas",
    );
  });

  /**
   * A RAZÃO DE ISTO SER UM MÓDULO.
   *
   * A mesma verdade é precisa na navegação, no aviso e no botão. Se
   * divergirem, o aviso diz que falta o valor e o botão deixa enviar na
   * mesma. `podeEnviar` lê a MESMA lista.
   */
  it("o botão e o aviso nunca podem discordar", () => {
    for (const [doc, total] of [
      [RECEM_ABERTO, 0],
      [COMPLETO, 3997.5],
      [{ ...COMPLETO, clientNames: "" }, 3997.5],
      [{ ...COMPLETO, ref: "" }, 3997.5],
      [COMPLETO, 0],
    ] as [ProposalDoc, number][]) {
      const travam = oQueFaltaParaEnviar(doc, total).some((f) => f.trava);
      expect(podeEnviar(doc, total)).toBe(!travam);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE NÃO PODE CHEGAR A UM CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O critério dela, e é o único: se o cliente receber algo que parece um erro,
 * bloqueia. Cada um destes saiu de uma coisa que aconteceu ou que estava a um
 * passo de acontecer — e o que se prende é a REGRA, não a frase.
 */
describe("os bloqueios que impedem um erro de sair", () => {
  it("um tema com título e sem fotos é AVISO, e diz qual — no desenho novo não sai em branco", () => {
    // Travava quando a folha saía em branco. O desenho novo dá-lhe uma página
    // de texto com uma fotografia de outro tema; o documento dela (B1) põe-no
    // entre os avisos.
    const comBoardVazio = {
      ...COMPLETO,
      moodBoards: [{ title: "Bouquets", images: [] }],
    } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(comBoardVazio, 3997.5).find((x) => x.id === "moodboard-vazio");
    expect(f?.trava).toBe(false);
    expect(f?.texto, "diz QUAL tema, senão não se sabe onde ir").toContain("Bouquets");
    expect(f?.campo, "o salto leva ao título desse tema").toBe("boardTitulo:0");
  });

  it("mas uma página sem título e sem fotos é só uma página por começar", () => {
    const porComecar = {
      ...COMPLETO,
      moodBoards: [{ title: "", images: [] }],
    } as unknown as ProposalDoc;
    expect(oQueFaltaParaEnviar(porComecar, 3997.5).some((x) => x.id === "moodboard-vazio")).toBe(
      false,
    );
  });

  /**
   * A REDE DAS CHAVETAS.
   *
   * O email já tem três camadas a impedir um `{{marcador}}` de sair (ver
   * `frase-que-nao-parte.test.ts`). O PDF não tem nenhuma: o que ela escrever
   * à mão num campo vai para lá tal e qual.
   */
  it("um marcador por resolver escrito à mão num campo não sai", () => {
    const comMarcador = { ...COMPLETO, ref: "Proposta {{nome}}" } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(comMarcador, 3997.5).find((x) => x.id === "chavetas");
    expect(f?.trava).toBe(true);
  });

  it("e o texto normal com chavetas simples passa — não é um marcador", () => {
    const normal = { ...COMPLETO, ref: "Proposta {2026}" } as unknown as ProposalDoc;
    expect(oQueFaltaParaEnviar(normal, 3997.5).some((x) => x.id === "chavetas")).toBe(false);
  });

  it("uma fotografia que não carrega não sai — o PDF ficaria com um buraco", () => {
    const f = oQueFaltaParaEnviar(COMPLETO, 3997.5, {
      imagensQueFaltam: ["tema/foto.jpg"],
    }).find((x) => x.id === "imagens");
    expect(f?.trava).toBe(true);
  });

  it("sem fotos em falta, não há nada a dizer", () => {
    expect(
      oQueFaltaParaEnviar(COMPLETO, 3997.5, { imagensQueFaltam: [] }).some(
        (x) => x.id === "imagens",
      ),
    ).toBe(false);
  });

  /**
   * O INGLÊS NÃO É UM AVISO — É UMA PROPOSTA QUE O CASAL NÃO PERCEBE.
   *
   * A regra de o que conta como traduzido não se escreve aqui: vive no
   * `proposal-doc-bilingue`, que sabe distinguir «por traduzir» de «traduzido
   * e depois o português mudou».
   */
  it("proposta em inglês com campos por traduzir não sai", () => {
    const semIngles = {
      ...COMPLETO,
      /* Um campo de PROSA dela qualquer serve: o que se prova é a regra, não
         o campo. Era a «frase de intenção», que entretanto saiu da proposta a
         pedido dela — e a regra não saiu com ela. */
      budgetNote: "Uma frase escrita em português",
      budgetNoteEn: "",
    } as unknown as ProposalDoc;
    expect(podeEnviar(semIngles, 3997.5, { idioma: "en" })).toBe(false);
  });

  it("e a mesma proposta em português sai sem problema nenhum", () => {
    const semIngles = {
      ...COMPLETO,
      /* Um campo de PROSA dela qualquer serve: o que se prova é a regra, não
         o campo. Era a «frase de intenção», que entretanto saiu da proposta a
         pedido dela — e a regra não saiu com ela. */
      budgetNote: "Uma frase escrita em português",
      budgetNoteEn: "",
    } as unknown as ProposalDoc;
    expect(podeEnviar(semIngles, 3997.5, { idioma: "pt" })).toBe(true);
  });

  it("sem contexto nenhum, o gate comporta-se como se comportava", () => {
    // Quem chamar com dois argumentos — e há chamadas assim — não passa a ver
    // bloqueios que não pode resolver.
    expect(podeEnviar(COMPLETO, 3997.5)).toBe(true);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * B1 — OS ERROS QUE O DOCUMENTO DELA ACRESCENTOU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Já saiu um PDF sem orçamento e sem condições, e nada no ecrã o impediu.»
 * Cada regra nova tem aqui o caso que trava e o caso que deixa passar.
 */
describe("B1: os erros novos", () => {
  const travaPor = (doc: ProposalDoc, total: number, ctx = {}) =>
    oQueFaltaParaEnviar(doc, total, ctx)
      .filter((f) => f.trava)
      .map((f) => f.id);

  it("sem data do evento não sai; «a definir» é texto e passa", () => {
    expect(travaPor({ ...COMPLETO, eventDate: "" } as ProposalDoc, 3997.5)).toContain("data");
    expect(travaPor({ ...COMPLETO, eventDate: "a definir" } as ProposalDoc, 3997.5)).not.toContain(
      "data",
    );
  });

  it("uma validade fixada que já passou trava, e diz o dia", () => {
    const expirada = { ...COMPLETO, validUntil: "2026-08-19" } as ProposalDoc;
    const f = oQueFaltaParaEnviar(expirada, 3997.5, { hoje: "2026-10-09" }).find(
      (x) => x.id === "validade",
    );
    expect(f?.trava).toBe(true);
    expect(f?.texto).toContain("19/08/2026");
    expect(f?.campo, "o salto leva ao campo dos dias").toBe("validUntilDays");
  });

  it("a validade que acaba HOJE ainda vale, e sem data fixada conta-se a partir do envio", () => {
    expect(
      travaPor({ ...COMPLETO, validUntil: "2026-10-09" } as ProposalDoc, 3997.5, {
        hoje: "2026-10-09",
      }),
    ).not.toContain("validade");
    expect(travaPor(COMPLETO, 3997.5, { hoje: "2030-01-01" })).not.toContain("validade");
  });

  it("sem email, uma proposta por email não sai; por WhatsApp sai", () => {
    expect(travaPor(COMPLETO, 3997.5, { canal: "email", emailDoCliente: "" })).toContain("email");
    expect(travaPor(COMPLETO, 3997.5, { canal: "ambos", emailDoCliente: "sem-arroba" })).toContain(
      "email",
    );
    expect(travaPor(COMPLETO, 3997.5, { canal: "whatsapp", emailDoCliente: "" })).not.toContain(
      "email",
    );
    expect(
      travaPor(COMPLETO, 3997.5, { canal: "email", emailDoCliente: "casal@example.com" }),
    ).not.toContain("email");
  });

  it("sem canal dito, o email não se verifica — quem chama assim não está a enviar", () => {
    expect(travaPor(COMPLETO, 3997.5, { emailDoCliente: "" })).not.toContain("email");
  });

  it("condições gerais vazias travam; ausentes são as da casa e passam", () => {
    expect(travaPor({ ...COMPLETO, condicoesGerais: [] } as ProposalDoc, 3997.5)).toContain(
      "condicoes",
    );
    expect(travaPor({ ...COMPLETO, condicoesGerais: ["  "] } as ProposalDoc, 3997.5)).toContain(
      "condicoes",
    );
    expect(travaPor(COMPLETO, 3997.5)).not.toContain("condicoes");
  });

  it("total a zero continua a travar (é o «orçamento vazio» do documento dela)", () => {
    expect(travaPor(COMPLETO, 0)).toContain("valor");
  });
});

describe("B1: os avisos novos", () => {
  const avisos = (doc: ProposalDoc) => oQueFaltaParaEnviar(doc, 3997.5).filter((f) => !f.trava);

  it("um tema com fotografias e sem título é aviso, e leva a esse tema", () => {
    const doc = {
      ...COMPLETO,
      moodBoards: [
        { title: "Cerimónia", annotation: "x", images: ["a.jpg"] },
        { title: "", images: ["b.jpg"] },
      ],
    } as unknown as ProposalDoc;
    const f = avisos(doc).find((x) => x.id === "tema-sem-titulo");
    expect(f?.campo).toBe("boardTitulo:1");
  });

  it("um tema com título e sem nota é aviso, e diz qual", () => {
    const doc = {
      ...COMPLETO,
      moodBoards: [{ title: "Jantar", images: ["a.jpg"] }],
    } as unknown as ProposalDoc;
    const f = avisos(doc).find((x) => x.id === "tema-sem-nota");
    expect(f?.texto).toContain("Jantar");
    expect(f?.campo).toBe("boardNota:0");
  });

  it("nenhum aviso destes trava o envio", () => {
    const doc = {
      ...COMPLETO,
      moodBoards: [
        { title: "Jantar", images: [] },
        { title: "", images: ["b.jpg"] },
      ],
    } as unknown as ProposalDoc;
    expect(podeEnviar(doc, 3997.5)).toBe(true);
  });
});

describe("ver o PDF final antes de enviar (14/10)", () => {
  const ids = (ctx: Parameters<typeof oQueFaltaParaEnviar>[2]) =>
    oQueFaltaParaEnviar(COMPLETO, 3997.5, ctx)
      .filter((f) => f.trava)
      .map((f) => f.id);

  it("sem o PDF visto, trava — e é a única coisa que falta numa proposta completa", () => {
    expect(ids({ pdfVisto: false })).toEqual(["visto"]);
    expect(podeEnviar(COMPLETO, 3997.5, { pdfVisto: false })).toBe(false);
  });

  it("visto e confirmado, segue; quem não pergunta (a Conferência, os testes antigos) não vê a regra", () => {
    expect(ids({ pdfVisto: true })).toEqual([]);
    expect(ids({})).toEqual([]);
  });

  it("vale mesmo quando há outros erros — a rota só confere uma parte deles", () => {
    const semValor = oQueFaltaParaEnviar(COMPLETO, 0, { pdfVisto: false }).map((f) => f.id);
    expect(semValor).toContain("valor");
    expect(semValor).toContain("visto");
  });
});
