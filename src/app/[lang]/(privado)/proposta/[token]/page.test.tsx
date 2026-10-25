// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A PÁGINA ONDE O CASAL DECIDE.
 *
 * O PDF da proposta seguia em anexo no email e mais nada: quem arquivasse a
 * mensagem, ou abrisse o link no telemóvel de outra pessoa, tinha de decidir
 * gastar milhares de euros a olhar para um total e um IVA. O botão para rever
 * o documento vive agora aqui — e só pode existir porque o documento passou a
 * ser GUARDADO com a proposta (coluna `proposals.doc`).
 *
 * O que se prende: com documento, o botão aponta para o PDF desta proposta;
 * sem documento (propostas anteriores à coluna, propostas de linhas do back
 * office) a página abre exatamente como abria, sem botão nenhum e sem partir.
 */
const db = vi.hoisted(() => ({ proposal: null as Record<string, unknown> | null }));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: vi.fn((t: string) => (t === "bom" ? { proposalId: "p1" } : null)),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async () => db.proposal),
  /**
   * O link do casal passou a seguir o PEDIDO e não a linha (ver
   * `proposta-do-link.ts`), portanto a resolução lista as irmãs. Sem este
   * duplo, a chamada rebentava, o `try` do resolvedor engolia a avaria e estes
   * testes passavam a exercitar o caminho de recurso — verdes pela razão
   * errada. Uma lista vazia é o que este ficheiro quer: aqui só há uma
   * proposta, e o que se testa é a página.
   */
  listProposalsForQuote: vi.fn(async () => (db.proposal ? [db.proposal] : [])),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
vi.mock("next/image", () => ({ default: () => null }));
// O bloco de resposta é um Client Component com estado próprio e testes seus;
// aqui interessa a página, por isso entra como um marcador.
/**
 * O dicionário do duplo DEPENDE da língua, ao contrário do que estava aqui
 * antes (devolvia sempre o português). Sem isso, um teste sobre «esta página
 * segue a língua da proposta» passava sem a página fazer nada: as duas línguas
 * eram a mesma folha de texto.
 */
vi.mock("@/lib/i18n", () => ({
  normalizeLocale: (l: string) => (l === "en" ? "en" : "pt"),
  htmlLang: (l: string) => (l === "en" ? "en" : "pt-PT"),
  getDictionary: (locale: string) => ({
    proposta:
      locale === "en"
        ? {
            linkInvalidTitle: "Invalid link",
            linkInvalidBody: "…",
            notFoundTitle: "Not found",
            notFoundBody: "…",
            eyebrow: "Proposal",
            greeting: "Hello",
            intro: "…",
            tableDescricao: "Description",
            tableQt: "Qty",
            tableValor: "Amount",
            subtotal: "Subtotal",
            iva: "VAT",
            total: "Total",
            validoAte: "Valid until",
            versaoNumero: "Version",
            atualizadaEm: "Updated on",
            verPdf: "View the full proposal (PDF)",
            footerNote: "…",
            respostaComo: "Let us know by email or by phone whether you would like to go ahead.",
            respostaExpirada: "This proposal is past its validity date.",
            dateLocale: "en-GB",
          }
        : {
            linkInvalidTitle: "Link inválido",
            linkInvalidBody: "…",
            notFoundTitle: "Não encontrada",
            notFoundBody: "…",
            eyebrow: "Proposta",
            greeting: "Olá",
            intro: "…",
            tableDescricao: "Descrição",
            tableQt: "Qt",
            tableValor: "Valor",
            subtotal: "Subtotal",
            iva: "IVA",
            total: "Total",
            validoAte: "Válida até",
            versaoNumero: "Versão",
            atualizadaEm: "Atualizada a",
            verPdf: "Ver a proposta completa (PDF)",
            footerNote: "…",
            respostaComo: "Diga-nos por e-mail ou por telefone se quer avançar com esta proposta.",
            respostaExpirada: "O prazo de validade desta proposta já passou.",
            dateLocale: "pt-PT",
          },
  }),
}));

import ProposalPage, * as pagina from "./page";

const proposta = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  quoteId: "LIQ-AAA-1",
  clientName: "Ana Dias",
  clientEmail: "ana@exemplo.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 10000,
  vat: 2300,
  total: 12300,
  status: "enviada",
  createdAt: "2026-03-01T09:00:00.000Z",
  validUntil: "2099-12-31",
  ...over,
});

async function abrir(token = "bom", lang = "pt") {
  render(await ProposalPage({ params: Promise.resolve({ lang, token }) }));
}

beforeEach(() => {
  db.proposal = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("página pública da proposta — o botão do PDF", () => {
  it("mostra o botão quando a proposta tem documento guardado", async () => {
    db.proposal = proposta({ doc: { ref: "PO Decoração" } });
    await abrir();
    const botao = screen.getByRole("link", { name: /proposta completa \(PDF\)/i });
    expect(botao).toHaveAttribute("href", "/api/proposta/bom/pdf");
    // Abre noutro separador: quem está a meio de aceitar não perde a página.
    expect(botao).toHaveAttribute("target", "_blank");
    expect(botao).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("NÃO mostra botão nenhum numa proposta sem documento (as antigas)", async () => {
    db.proposal = proposta();
    await abrir();
    expect(screen.queryByRole("link", { name: /PDF/i })).toBeNull();
    // E a página continua a servir para o que serve: rever o valor e saber como
    // responder — por email ou por telefone, que é a única forma que há.
    expect(screen.getByText(/por e-mail ou por telefone/i)).toBeTruthy();
  });

  it("um token inválido não chega sequer a mostrar uma proposta", async () => {
    await abrir("mau");
    expect(screen.queryByRole("link", { name: /PDF/i })).toBeNull();
    expect(screen.getByText("Link inválido")).toBeTruthy();
  });
});

/**
 * ESTA PÁGINA NÃO PODE SER CONGELADA NUM CACHE.
 *
 * `[token]` não tem `generateStaticParams`, e nada aqui usa uma API de pedido
 * (o idioma vem do segmento da rota, de propósito — ver o cabeçalho de
 * src/proxy.ts). Para o Next isso é uma rota ESTÁTICA: renderiza à primeira
 * visita e guarda o HTML no Full Route Cache, sem revalidação nenhuma, até ao
 * próximo deploy.
 *
 * O que isso fazia, em concreto, com o estado que esta página lê da base de
 * dados a cada visita:
 *
 *   · o casal aceita, volta ao link (reencaminham-no, reabrem-no do email) e
 *     encontra outra vez o formulário de aceitar, como se nada tivesse
 *     acontecido — e o «Já tínhamos registado a sua resposta» nunca aparece;
 *   · a proposta expira ou o estúdio retira-a, e a página continua a oferecer
 *     um aceite que a rota vai recusar com um 409/410;
 *   · a validade (`expired`) é calculada uma única vez, no dia da primeira
 *     visita, e fica congelada nesse dia.
 *
 * O cabeçalho é `private, no-cache` desde 22/10 (`next.config.ts`): o
 * `private` — o que importa numa página cujo URL é a própria credencial —
 * fica, e o `no-store` que tirava a proposta da cache de «voltar atrás» sai.
 */
describe("página pública da proposta — nunca servida de um cache", () => {
  it("é renderizada a pedido, a cada visita", () => {
    expect((pagina as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA SEGUE A LÍNGUA DA PROPOSTA, NÃO A DO VISITANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta página é servida no segmento `[lang]`, e a língua desse segmento vem do
 * COOKIE de quem visita (ver src/proxy.ts): um casal inglês que carregue no
 * botão do email a partir de um computador onde alguém leu o site em português
 * caía numa página portuguesa — para responder a uma proposta inglesa.
 *
 * O contrário também: quem tenha o site em inglês e receba uma proposta
 * portuguesa via a moldura inglesa por cima de um documento português.
 *
 * A proposta é que manda. Não se redirecciona (o português canónico é o
 * caminho SEM prefixo, que volta a ser reescrito pelo cookie — seria um ciclo):
 * escolhe-se o dicionário e marca-se a língua no elemento, para quem lê com um
 * leitor de ecrã ouvir o texto com a pronúncia certa.
 */
describe("página pública da proposta — a língua é a da proposta", () => {
  it("uma proposta INGLESA abre em inglês, mesmo num visitante português", async () => {
    db.proposal = proposta({ idioma: "en", doc: { ref: "PO" } });
    await abrir("bom", "pt");
    expect(screen.getByText(/Hello/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /View the full proposal/i })).toBeTruthy();
    expect(screen.queryByText(/Olá/)).toBeNull();
  });

  it("uma proposta PORTUGUESA abre em português, mesmo num visitante inglês", async () => {
    db.proposal = proposta({ idioma: "pt", doc: { ref: "PO" } });
    await abrir("bom", "en");
    expect(screen.getByText(/Olá/)).toBeTruthy();
    expect(screen.queryByText(/Hello/)).toBeNull();
  });

  it("uma proposta ANTIGA (sem língua) é portuguesa", async () => {
    db.proposal = proposta({ doc: { ref: "PO" } });
    await abrir("bom", "en");
    expect(screen.getByText(/Olá/)).toBeTruthy();
  });

  it("marca a língua no elemento, para quem ouve a página", async () => {
    db.proposal = proposta({ idioma: "en", doc: { ref: "PO" } });
    const { container } = render(
      await ProposalPage({ params: Promise.resolve({ lang: "pt", token: "bom" }) }),
    );
    expect(container.querySelector("[lang]")?.getAttribute("lang")).toBe("en");
  });

  it("sem proposta nenhuma, é o visitante que manda — não há outra língua a seguir", async () => {
    // Um token forjado ou uma proposta apagada: aqui não há proposta de onde
    // tirar língua nenhuma, e a página de erro é para quem está a olhar.
    await abrir("mau", "en");
    expect(screen.getByText("Invalid link")).toBeTruthy();
  });
});

/**
 * O TÍTULO DO SEPARADOR TAMBÉM É O DA PROPOSTA.
 *
 * É o que aparece na lista de separadores e no histórico do navegador. Um
 * casal inglês com «A sua proposta | Líquen Events» no separador está a ler a
 * primeira coisa do produto na língua errada.
 *
 * O TÍTULO É `{ absolute }` E NÃO TEXTO SIMPLES, e a diferença não é de forma:
 * entregue como texto simples, o layout de raiz aplicava-lhe por cima o seu
 * `template: "%s | Líquen Events"` e a marca saía DUAS VEZES no separador
 * («A sua proposta | Líquen Events | Líquen Events» — medido num Chromium).
 * Estas asserções passam a ler o valor pelo que ele é. Ver
 * `src/app/[lang]/(site)/titulos-do-cliente.test.ts`, que prende as quatro
 * combinações de página e idioma.
 */
describe("página pública da proposta — o título do separador", () => {
  it("segue a língua da proposta", async () => {
    db.proposal = proposta({ idioma: "en" });
    const meta = await pagina.generateMetadata({
      params: Promise.resolve({ lang: "pt", token: "bom" }),
    });
    expect(meta.title).toEqual({ absolute: "Your proposal | Líquen Events" });
  });

  it("e continua a não ser indexado, em língua nenhuma", async () => {
    db.proposal = proposta({ idioma: "en" });
    const meta = await pagina.generateMetadata({
      params: Promise.resolve({ lang: "pt", token: "bom" }),
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("com os nomes do casal, o separador diz quem é (pedido dela, 25/10)", async () => {
    db.proposal = proposta({ idioma: "pt" });
    db.proposal.doc = { ...(db.proposal.doc ?? {}), clientNames: "Ana  &  João" };
    const meta = await pagina.generateMetadata({
      params: Promise.resolve({ lang: "pt", token: "bom" }),
    });
    expect(meta.title).toEqual({ absolute: "Ana & João · Líquen Events" });
    // As etiquetas de partilha ficam sem nomes: um link reencaminhado não
    // espalha quem se casa para a pré-visualização de outra aplicação.
    expect(JSON.stringify(meta.openGraph)).not.toContain("Ana");
    expect(JSON.stringify(meta.twitter)).not.toContain("Ana");
  });

  it("sem proposta, cai na língua do visitante", async () => {
    db.proposal = null;
    const meta = await pagina.generateMetadata({
      params: Promise.resolve({ lang: "en", token: "mau" }),
    });
    expect(meta.title).toEqual({ absolute: "Your proposal | Líquen Events" });
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * «OLÁ, .» — O TÍTULO DA PÁGINA ONDE O CASAL DECIDE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O título era escrito a seco: `{t.greeting}, {proposal.clientName.split(" ")[0]}.`
 *
 * Com o nome do cliente vazio — uma linha em que `client_name` ficou a `null`,
 * que o `fromRow` de `proposals-store` traduz para `""` — a primeira coisa que
 * o casal lia ao abrir o link do email, em Playfair a 52 px, era «Olá, .».
 * Medido no browser (390×844, a página servida em dev), antes da correcção:
 *
 *     H1 = "Olá, ."
 *
 * E com o campo AUSENTE de todo, o `.split` de `undefined` atirava — a página
 * rebentava e o casal apanhava o ecrã «Ocorreu um erro inesperado» em vez da
 * proposta que veio ver. Também medido, no registo do servidor:
 *
 *     TypeError: Cannot read properties of undefined (reading 'split')
 *       at ProposalPage (page.tsx:229:48)
 *
 * Sem nome cumprimenta-se na mesma — «Olá.» é uma frase inteira e não denuncia
 * que falta um dado. Com nome, nada muda: continua a ser o primeiro nome.
 */
describe("página pública da proposta — o cumprimento", () => {
  it("cumprimenta pelo PRIMEIRO nome", async () => {
    db.proposal = proposta({ clientName: "Ana Dias" });
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Ana.");
  });

  /**
   * ── E CUMPRIMENTAM-SE OS DOIS ────────────────────────────────────────────
   *
   * Palavras dela: «em vez de dizer Olá x diga o nome dos dois noivos».
   *
   * O `clientName` é o de QUEM PEDIU o orçamento — uma pessoa. Numa proposta de
   * casamento há duas, e cumprimentar só uma delas na primeira linha que o
   * casal lê é dizer-lhes que o documento é para um deles.
   *
   * O `doc.clientNames` é o campo que ela escreve no estúdio, e que o documento
   * já mostra mais abaixo como «NOIVOS»: «Lola e João», na forma que ela
   * escolheu. Usa-se o texto dela em vez de se inventar uma junção.
   */
  it("cumprimenta os DOIS noivos quando o documento os nomeia", async () => {
    db.proposal = proposta({ clientName: "Lola Ferreira" });
    db.proposal.doc = { ...(db.proposal.doc ?? {}), clientNames: "Lola e João" };
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Lola e João.");
  });

  it("e o nome dos dois manda sobre o de quem pediu o orçamento", async () => {
    // Sem isto, uma proposta com os dois nomes preenchidos continuava a
    // cumprimentar só quem submeteu o formulário.
    db.proposal = proposta({ clientName: "Ana Dias" });
    db.proposal.doc = { ...(db.proposal.doc ?? {}), clientNames: "Ana e Rui" };
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Ana e Rui.");
  });

  it("com o campo dos dois vazio, cai para o primeiro nome de quem pediu", async () => {
    // A cascata mantém-se: as propostas antigas, criadas antes de este campo
    // ser exigido, continuam a cumprimentar como sempre cumprimentaram.
    db.proposal = proposta({ clientName: "Ana Dias" });
    db.proposal.doc = { ...(db.proposal.doc ?? {}), clientNames: "   " };
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Ana.");
  });

  it("sem nome nenhum, escreve «Olá.» — nunca «Olá, .»", async () => {
    db.proposal = proposta({ clientName: "" });
    await abrir();
    const titulo = screen.getByRole("heading", { level: 1 }).textContent ?? "";
    expect(titulo).toBe("Olá.");
    expect(titulo, "a vírgula pendurada é o defeito").not.toContain(", .");
  });

  it("um nome só de espaços conta como nome nenhum", async () => {
    db.proposal = proposta({ clientName: "   " });
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá.");
  });

  it("sem o campo de todo, a página abre em vez de rebentar", async () => {
    db.proposal = proposta({ clientName: undefined });
    await abrir();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá.");
    // E continua a ser a página da proposta, não uma página de erro.
    expect(screen.getByText(/por e-mail ou por telefone/i)).toBeTruthy();
  });

  it("em inglês, a mesma regra", async () => {
    db.proposal = proposta({ clientName: "", idioma: "en" });
    await abrir("bom", "en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello.");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ABERTURA É O NOME DELES — E AS PROPOSTAS ANTIGAS NÃO A ESTRAGAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aqui viveu uma «frase de intenção»: um parágrafo escrito no Estúdio, por
 * proposta, que a página desenhava debaixo do nome do casal. Saiu por decisão
 * dela — mandou a fotografia do parágrafo e escreveu «nao quero estes textos
 * na proposta»; perguntei se era aquele texto ou o campo, e a resposta foi
 * «não quero o campo, ponto final».
 *
 * ── PORQUE É QUE APAGAR O CÓDIGO NÃO CHEGA ────────────────────────────────
 *
 * O campo foi apagado do Estúdio e da página, mas o VALOR não desaparece de
 * lado nenhum: vive dentro do `doc` (jsonb `proposals.doc`) de todas as
 * propostas em que alguém o escreveu, e essas propostas continuam a abrir-se
 * pelo link que o casal tem no email. Se um dia alguém voltar a passar o `doc`
 * por um componente que desenhe o que não conhece, a frase volta — numa
 * proposta que já foi enviada, por baixo de quem já a leu.
 *
 * É por isso que este teste dá à página uma proposta COM a frase guardada, e
 * não uma sem ela: a ausência que interessa provar é a do desenho, não a do
 * dado.
 */
describe("a frase de intenção não volta pelas propostas que já a têm guardada", () => {
  const FRASE = "Pensámos o vosso dia em branco e verde, com a serenidade do Alentejo.";

  it("uma proposta com a frase guardada abre sem a desenhar", async () => {
    db.proposal = proposta({
      clientName: "Ana Dias",
      doc: { ref: "PO Decoração", intencao: FRASE, intencaoEn: "We imagined your day…" },
    });
    await abrir();
    // CONTROLO POSITIVO: a página abriu mesmo, e é a da proposta.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Olá, Ana.");
    expect(screen.queryByText(FRASE), "a frase de intenção foi desenhada").toBeNull();
  });

  it("e em inglês também não — nem a caixa inglesa, nem o recurso ao português", async () => {
    // A regra antiga caía para o português quando a caixa inglesa estava
    // vazia. Se alguém a repuser sem pensar, é por aqui que ela reaparece.
    db.proposal = proposta({
      clientName: "Ana Dias",
      idioma: "en",
      doc: { ref: "PO Decoração", intencao: FRASE, intencaoEn: "" },
    });
    await abrir("bom", "en");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Hello, Ana.");
    expect(screen.queryByText(FRASE)).toBeNull();
  });

  it("a abertura tem UM título e mais nada por baixo dele", async () => {
    /**
     * O teste acima procura a frase que conhecemos. Este não conhece frase
     * nenhuma: mede o que a abertura CONTÉM. Um campo novo de prosa que
     * alguém acrescente amanhã ao cabeçalho — outro nome, outra frase —
     * aparece aqui sem ninguém ter de se lembrar de o vir escrever.
     */
    db.proposal = proposta({
      clientName: "Ana Dias",
      doc: { ref: "PO Decoração", intencao: FRASE },
    });
    await abrir();
    const titulo = screen.getByRole("heading", { level: 1 });
    const cabecalho = titulo.closest("header");
    expect(cabecalho, "o cumprimento devia viver num <header>").not.toBeNull();
    expect(cabecalho!.textContent?.trim()).toBe("Olá, Ana.");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUMA IMAGEM DE PARTILHA — E O CONTROLO POSITIVO QUE PROVA QUE HERDAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A afirmação é uma AUSÊNCIA, e uma ausência afirma-se mal: um `openGraph`
 * simplesmente não declarado também não tem imagens NESTE objecto — e sai com
 * imagem à mesma, porque o layout de raiz define as dela e o Next herda-as.
 *
 * Por isso o teste tem duas metades: a página tem de DECLARAR os dois blocos
 * (é o que substitui os do layout), e o layout de raiz tem de continuar a
 * declarar imagens (é o que torna a declaração daqui necessária). O dia em que
 * o layout deixar de as ter, a segunda metade falha e alguém relê isto.
 */
describe("a proposta nunca leva imagem de partilha", () => {
  it("declara `openGraph` e `twitter` SEM imagens", async () => {
    db.proposal = proposta({ doc: { ref: "PO Decoração" } });
    const meta = await pagina.generateMetadata({
      params: Promise.resolve({ lang: "pt", token: "bom" }),
    });
    expect(meta.openGraph).toBeDefined();
    expect(meta.openGraph?.images).toEqual([]);
    expect(meta.twitter).toBeDefined();
    expect(meta.twitter?.images).toEqual([]);
  });

  it("CONTROLO POSITIVO: sem esta declaração, herdaria as do layout de raiz", async () => {
    const fonte = readFileSync(join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    // O layout de raiz continua a dar imagem de partilha a quem não a recusa.
    expect(fonte).toMatch(/openGraph:[\s\S]{0,600}images:/);
    expect(fonte).toMatch(/twitter:[\s\S]{0,300}images:/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE VERSÃO É ESTA, E DE QUE DIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O link passou a mostrar sempre a versão ATUAL (ver `proposta-do-link.ts`).
 * Isso resolve o problema de fundo — ela ajusta o preço e o casal vê o preço
 * novo sem reenvio nenhum — e cria outro: o casal volta ao link meses depois e
 * não tem como saber se está a olhar para o mesmo papel que leu.
 *
 * A linha responde a isso e a mais nada. É sobre o DOCUMENTO: a data em que
 * ELA mexeu, que já estava gravada do lado do estúdio. Não se regista que a
 * proposta foi aberta, nem quando, nem por quem.
 */
describe("página pública da proposta — a versão", () => {
  it("não diz nada na versão 1: dizer «Versão 1» a quem abre pela primeira vez é ruído", async () => {
    db.proposal = proposta({ versaoNumero: 1, versaoEm: "2026-03-01T09:00:00.000Z" });
    await abrir();
    expect(screen.queryByText(/Versão/)).toBeNull();
  });

  it("nada também quando a proposta é anterior às colunas de versão", async () => {
    db.proposal = proposta();
    await abrir();
    expect(screen.queryByText(/Versão/)).toBeNull();
  });

  it("a partir da versão 2 diz o número e o dia em que o conteúdo mudou", async () => {
    db.proposal = proposta({ versaoNumero: 2, versaoEm: "2026-03-15T09:00:00.000Z" });
    await abrir();
    expect(screen.getByText(/Versão 2/)).toBeTruthy();
    expect(screen.getByText(/Atualizada a 15 de março de 2026/)).toBeTruthy();
  });

  it("na língua da proposta, e não na do visitante", async () => {
    db.proposal = proposta({ idioma: "en", versaoNumero: 2, versaoEm: "2026-03-15T09:00:00.000Z" });
    await abrir("bom", "pt");
    expect(screen.getByText(/Version 2/)).toBeTruthy();
    expect(screen.getByText(/Updated on 15 March 2026/)).toBeTruthy();
  });

  it("o número aparece mesmo sem data gravada", async () => {
    db.proposal = proposta({ versaoNumero: 3 });
    await abrir();
    expect(screen.getByText(/Versão 3/)).toBeTruthy();
    expect(screen.queryByText(/Atualizada a/)).toBeNull();
  });
});
