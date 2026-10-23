import {
  depositPercentOf,
  withProposalDefaults,
  type MoodBoard,
  type ProposalDoc,
} from "@/lib/proposal-doc";
import { blocosFixosNaLingua, textosDaProposta } from "@/lib/proposal-doc-textos";
import { totaisDaProposta } from "@/lib/proposal-budget";
import { chaveDeRubrica, ordemDeSaida } from "@/lib/proposal-ordem";
import { capitulos as capitulosDaInspiracao, grupoDoTema } from "./grupos";
import { eCasamento } from "../proposal-evento";
import {
  FOTOS_DA_DISPOSICAO,
  MAXIMO_POR_PAGINA,
  NOME_DA_DISPOSICAO,
  disposicaoDoTema,
  repartir as repartirFotos,
  type Disposicao,
} from "./mosaico";
import { textosEditoriais } from "./textos";

export { MAXIMO_POR_PAGINA };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DO PDF NOVO, SEM DESENHAR O PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A mesma sequência de `montar.ts` — capa, índice, a proposta, o que propomos,
 * paleta e ambiente, os capítulos de inspiração com os seus temas, a citação,
 * o investimento, as condições e a contracapa —, calculada só a partir do
 * documento, sem fotografias e sem letras. É o que o estúdio usa para contar
 * as páginas («PDF com cerca de N»), para a «Vista de conjunto» e para o
 * painel «O que vai sair»: as três passam a mostrar as páginas do desenho
 * NOVO, e não as do antigo.
 *
 * Puro de propósito: corre no navegador, sem `pdf-lib` e sem `sharp`.
 *
 * ── O QUE É EXACTO E O QUE É ESTIMADO ─────────────────────────────────────
 * Exacto: que páginas existem, por que ordem, os capítulos, quantas páginas
 * leva cada tema e que fotografias vão em cada uma. São as MESMAS funções do
 * gerador (`ordemDeSaida`, `agrupar`, `grupoDoTema`, `repartir`,
 * `ordemDoDesenho`), e um teste prende a paridade contra o PDF desenhado.
 *
 * Estimado: as páginas que se partem pelo comprimento do TEXTO — o quadro do
 * orçamento e as condições. Partir texto pede as larguras das letras, que só o
 * servidor tem; aqui conta-se por caracteres, com as medidas das colunas do
 * gerador. Uma condição reescrita muito comprida pode dar uma página a mais
 * do que o plano diz. É o «cerca de» da frase.
 *
 * Uma diferença de entrada, e só uma: o gerador conta as fotografias que
 * CHEGARAM (uma que falhe no armazenamento sai da conta); o plano conta as que
 * estão no documento.
 */

/** Uma página do PDF novo. */
export type PaginaDoPlano =
  | { tipo: "capa" }
  | { tipo: "indice" }
  | { tipo: "proposta" }
  | { tipo: "servicos"; servicos: readonly string[]; primeiro: number; continuacao: boolean }
  | { tipo: "ambiente" }
  | { tipo: "cronograma"; continuacao: boolean }
  /**
   * O separador de um capítulo de inspiração. O `grupo` é a CHAVE do capítulo
   * — o grupo do dia num casamento («cocktail»), `tema-<n>` fora dele (ver
   * `capitulos`, em `grupos.ts`). O desenho de 23/10 deixou de ter o separador
   * do investimento (`grupo` a `null`); o tipo guarda-o para as propostas
   * gravadas com fotografias escolhidas para ele, que deixam de ter onde ir.
   */
  | { tipo: "separador"; titulo: string; grupo: string | null; numero: number }
  | {
      tipo: "tema";
      /** O índice REAL em `doc.moodBoards`. */
      bi: number;
      /** A vez do tema na proposta (1.º, 2.º…): decide o lado do mosaico. */
      vez: number;
      /** A chave do capítulo do tema (a mesma do separador que o abre). */
      grupo: string;
      titulo: string;
      /** Que página deste tema é (0 = a primeira), e quantas leva. */
      parte: number;
      partes: number;
      /** As fotografias desta página, pela ordem de desenho (índices de `images`). */
      fotos: readonly number[];
      /** A disposição que ela escolheu (`null` = a automática). */
      disposicao: Disposicao | null;
    }
  | { tipo: "citacao" }
  | { tipo: "orcamento"; linhas: number; continuacao: boolean }
  | { tipo: "total" }
  | { tipo: "condicoes"; qual: "notas" | "gerais" | "pagamento"; continuacao: boolean }
  | { tipo: "contracapa" };

/** A página, com o que o estúdio precisa para a mostrar. */
export type EntradaDoPlano = PaginaDoPlano & {
  /** Como se chama no índice e por baixo da miniatura. */
  nome: string;
  /** A secção do formulário que a produz (os ids de `estadoDasSeccoes`). */
  seccao: string;
};

const temTexto = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * A ordem por que as fotografias de um tema são DESENHADAS no PDF novo: a
 * «principal» à frente, sempre. É a foto do cartão em «O que propomos» e a
 * primeira do mosaico — ela escolheu-o («Passa a ser a foto do cartão»).
 *
 * No desenho antigo a principal só ia à frente nas disposições com lugar de
 * destaque (`ordemDasFotos`); no novo não há disposição a escolher.
 */
export function ordemDoDesenho(board: Pick<MoodBoard, "images" | "principal">): number[] {
  const n = board.images?.length ?? 0;
  const comoEstao = Array.from({ length: n }, (_, i) => i);
  const p = board.principal;
  if (typeof p !== "number" || !Number.isInteger(p) || p <= 0 || p >= n) return comoEstao;
  return [p, ...comoEstao.filter((i) => i !== p)];
}

/**
 * Os serviços do documento, para os cartões de «O que propomos».
 *
 * São os ITENS dos grupos de serviços. Um grupo sem itens conta pelo seu
 * título. A chave (em português, que é o que ela escreveu) serve para casar o
 * serviço com o seu tema de inspiração.
 */
export function servicosDoDocumento(original: ProposalDoc, doc: ProposalDoc = original) {
  const lista: { nome: string; descricao: string; chave: string }[] = [];
  (original.serviceGroups ?? []).forEach((g, gi) => {
    const gl = doc.serviceGroups?.[gi] ?? g;
    const itens = (g.items ?? []).map((it, ii) => ({ pt: it, naLingua: gl.items?.[ii] ?? it }));
    const comNome = itens.filter((x) => (x.pt.label ?? "").trim());
    if (comNome.length) {
      for (const x of comNome) {
        lista.push({
          nome: x.naLingua.label.trim(),
          descricao: (x.naLingua.desc ?? "").trim(),
          chave: chaveDeRubrica(x.pt.label),
        });
      }
    } else if ((g.title ?? "").trim()) {
      lista.push({ nome: gl.title.trim(), descricao: "", chave: chaveDeRubrica(g.title) });
    }
  });
  return lista;
}

/**
 * Quantos cartões de serviço cabem numa página: três, lado a lado (§6.4 —
 * «2 cartões: 486 × 504; 3 cartões: dividir igual»). O desenho importa-o
 * daqui, para o plano e o PDF nunca discordarem.
 */
export const CARTOES_POR_PAGINA = 3;

/**
 * Os cartões repartidos pelas páginas, por igual: quatro serviços são duas
 * páginas de dois (486 × 504, o tamanho do documento), e não três e um — um
 * cartão sozinho a toda a largura. Devolve o primeiro índice e quantos leva
 * cada página.
 */
export function cartoesPorPagina(n: number): { de: number; quantos: number }[] {
  const paginas = Math.ceil(n / CARTOES_POR_PAGINA);
  const saida: { de: number; quantos: number }[] = [];
  let de = 0;
  for (let k = 0; k < paginas; k++) {
    const quantos = Math.ceil((n - de) / (paginas - k));
    saida.push({ de, quantos });
    de += quantos;
  }
  return saida;
}

/** As fotografias de um tema que contam: as que têm referência. */
const fotosDoTema = (b: MoodBoard) => ordemDoDesenho(b).filter((i) => temTexto(b.images[i]));

/**
 * Os temas que têm página: com fotografias, ou só com texto. Um tema sem
 * fotografias E sem texto não tem nada para mostrar.
 */
export function temasComPagina(doc: ProposalDoc): number[] {
  const boards = doc.moodBoards ?? [];
  return ordemDeSaida(doc, boards, (b) => b.title ?? "").filter((bi) => {
    const b = boards[bi];
    return (
      !!b &&
      (fotosDoTema(b).length > 0 ||
        temTexto(b.title) ||
        temTexto(b.subtitulo) ||
        temTexto(b.annotation))
    );
  });
}

/* ── As estimativas do texto ─────────────────────────────────────────────── */

/**
 * As medidas das colunas do gerador (`paginas/condicoes.ts`, `colunas.ts`), em
 * píxeis da grelha. A largura média de um carácter da Jost a 14 px mede ~7 px
 * no texto das condições; arredonda-se para cima, porque a quebra de linha por
 * palavras gasta mais do que a conta por letras.
 */
const COLUNAS = {
  /** Do topo das colunas (o título numa linha a ~141 px + 60) até 716. */
  altura: 716 - (141 + 60),
  /** A faixa dos contactos do pagamento: as colunas param 30 px acima dos 627. */
  alturaComContactos: 627 - 30 - (141 + 60),
  /** `LARGURA_DO_TEXTO` = 705 − 72. */
  largura: 633,
  vao: 29,
  /** A largura média de um carácter a 14 px; a outro tamanho, na proporção. */
  carater: 7.4,
  item: { tam: 14, entrelinha: 1.15, entreItens: 10 },
  /** O texto encolhe até aqui antes de passar à página seguinte (`colunas.TAM_MINIMO`). */
  minimo: 12.5,
  h3: { tam: 12.5, entrelinha: 1.3, antes: 24, depois: 20, carater: 11.3 },
};

const linhasDe = (texto: string, larguraPx: number, carater: number) =>
  Math.max(1, Math.ceil(texto.length / Math.max(1, Math.floor(larguraPx / carater))));

type PecaDeTexto = { h3: boolean; texto: string };

function alturaDaPeca(
  p: PecaDeTexto,
  larguraPx: number,
  anterior: PecaDeTexto | null,
  tam: number,
): number {
  if (p.h3) {
    const H = COLUNAS.h3;
    return (
      (anterior ? H.antes : 0) +
      linhasDe(p.texto, larguraPx, H.carater) * H.tam * H.entrelinha +
      H.depois
    );
  }
  const I = COLUNAS.item;
  const carater = (COLUNAS.carater * tam) / I.tam;
  return linhasDe(p.texto, larguraPx, carater) * tam * I.entrelinha + I.entreItens;
}

/** Quantos pedaços de `altura` leva uma coluna de peças (como `colunas.repartir`). */
function pedacosDaColuna(
  pecas: readonly PecaDeTexto[],
  larguraPx: number,
  altura: number,
  tam: number,
): number {
  let pedacos = 0;
  let usado = 0;
  let anterior: PecaDeTexto | null = null;
  const I = COLUNAS.item;
  const linha = tam * I.entrelinha;
  for (const p of pecas) {
    let h = alturaDaPeca(p, larguraPx, anterior, tam);
    if (anterior && usado + h > altura) {
      // Um ponto comprido parte-se entre colunas, com duas linhas antes do
      // corte (`colunas.partirItem`).
      const n = p.h3 ? 0 : linhasDe(p.texto, larguraPx, (COLUNAS.carater * tam) / I.tam);
      const cabem = Math.floor((altura - usado - I.entreItens) / linha);
      pedacos++;
      usado = 0;
      anterior = null;
      if (!p.h3 && cabem >= 2 && n > cabem) {
        usado = (n - cabem) * linha + I.entreItens;
        anterior = p;
        continue;
      }
      h = alturaDaPeca(p, larguraPx, null, tam);
    }
    usado += h;
    anterior = p;
  }
  return pedacos + (anterior ? 1 : 0);
}

const larguraDaColuna = (n: number) => (COLUNAS.largura - COLUNAS.vao * (n - 1)) / n;

/**
 * As páginas de uma secção, com a regra do gerador (`montar.numaPagina`): se
 * não couber numa a 14 px, a letra desce meio píxel de cada vez até ao mínimo;
 * se nem assim, fica nos 14 e continua.
 */
function numaPagina(paginas: (tam: number) => number): number {
  for (let tam = COLUNAS.item.tam; tam >= COLUNAS.minimo; tam -= 0.5) {
    const n = paginas(tam);
    if (n <= 1) return n;
  }
  return paginas(COLUNAS.item.tam);
}

/** Colunas fixas: cada uma continua na mesma coluna da página seguinte. */
function paginasDeColunasFixas(
  colunas: readonly (readonly PecaDeTexto[])[],
  altura: number = COLUNAS.altura,
): number {
  const cols = colunas.filter((c) => c.length);
  if (!cols.length) return 0;
  const largura = larguraDaColuna(cols.length);
  return numaPagina((tam) =>
    Math.max(...cols.map((c) => pedacosDaColuna(c, largura, altura, tam))),
  );
}

/** Uma lista corrida em `n` colunas. */
function paginasDeColunasCorridas(pecas: readonly PecaDeTexto[], n = 2): number {
  if (!pecas.length) return 0;
  return numaPagina((tam) =>
    Math.max(1, Math.ceil(pedacosDaColuna(pecas, larguraDaColuna(n), COLUNAS.altura, tam) / n)),
  );
}

const lista = (titulo: string, itens: readonly string[]): PecaDeTexto[] =>
  itens.length
    ? [{ h3: true, texto: titulo }, ...itens.map((texto) => ({ h3: false as const, texto }))]
    : [];

/**
 * As linhas do quadro do orçamento numa página (`paginas/orcamento.ts`): linhas
 * de 43 px a partir do primeiro fio, a 235 px, até 700 — onze de uma linha
 * só, menos quando o nome parte (~75 caracteres por linha).
 */
function paginasDoOrcamento(nomes: readonly string[]): number[] {
  const cabe = 716 - 16 - 235;
  const paginas: number[] = [];
  let usado = 0;
  let nestaPagina = 0;
  for (const nome of nomes) {
    const h = 43 + (linhasDe(nome, 590, 7.9) - 1) * 16 * 1.3;
    if (nestaPagina && usado + h > cabe) {
      paginas.push(nestaPagina);
      usado = 0;
      nestaPagina = 0;
    }
    usado += h;
    nestaPagina++;
  }
  if (nestaPagina) paginas.push(nestaPagina);
  return paginas;
}

/* ── O plano ─────────────────────────────────────────────────────────────── */

/**
 * As páginas do PDF novo, pela ordem em que saem.
 *
 * Recebe o documento como o estúdio o tem (em português). As contas são as do
 * gerador; o texto que transborda é estimado (ver o cabeçalho).
 */
export function planoDaProposta(doc: ProposalDoc): EntradaDoPlano[] {
  const t = textosDaProposta("pt");
  const te = textosEditoriais("pt");
  const org = doc.template === "organizacao";
  const fixos = blocosFixosNaLingua(doc, "pt");
  const paginas: EntradaDoPlano[] = [];
  const boards = doc.moodBoards ?? [];

  paginas.push({ tipo: "capa", nome: "Capa", seccao: "capas" });
  paginas.push({ tipo: "indice", nome: te.indice, seccao: "evento" });
  paginas.push({ tipo: "proposta", nome: te.aProposta, seccao: "evento" });

  // ── O que propomos ──
  const servicos = servicosDoDocumento(doc);
  for (const { de: i, quantos } of cartoesPorPagina(servicos.length)) {
    paginas.push({
      tipo: "servicos",
      servicos: servicos.slice(i, i + quantos).map((s) => s.nome),
      primeiro: i + 1,
      continuacao: i > 0,
      nome: i ? `${t.sobretituloServicos} ${te.continuacao}` : t.sobretituloServicos,
      seccao: "servicos",
    });
  }

  // ── Paleta e ambiente: só com fotografias de inspiração ──
  const comPagina = temasComPagina(doc);
  const haFotos = comPagina.some((bi) => fotosDoTema(boards[bi]).length > 0);
  if (haFotos) paginas.push({ tipo: "ambiente", nome: "Paleta e ambiente", seccao: "moodboards" });

  // ── Cronograma (modelo Organização) ──
  if (org) {
    const pecas: PecaDeTexto[] = (doc.cronograma ?? [])
      .filter((f) => temTexto(f.title) || f.items?.some((i) => temTexto(i)))
      .flatMap((f) => [
        { h3: true as const, texto: f.title.trim() },
        ...f.items.filter((i) => temTexto(i)).map((i) => ({ h3: false as const, texto: i })),
      ]);
    const n = paginasDeColunasCorridas(pecas);
    for (let k = 0; k < n; k++) {
      paginas.push({
        tipo: "cronograma",
        continuacao: k > 0,
        nome: k ? `${t.tituloCronograma} ${te.continuacao}` : t.tituloCronograma,
        seccao: "cronograma",
      });
    }
  }

  // ── Os capítulos de inspiração ──
  const capitulos = capitulosDaInspiracao(comPagina, (bi) => boards[bi], eCasamento(doc.eventType));
  let vez = 0;
  let separadores = 0;
  capitulos.forEach((c) => {
    const nome = c.grupo
      ? te.grupos[c.grupo]
      : (boards[c.itens[0]].title ?? "").trim() || te.inspiracao;
    separadores++;
    paginas.push({
      tipo: "separador",
      titulo: nome,
      grupo: c.chave,
      numero: separadores,
      nome: `${te.inspiracao} · ${nome}`,
      seccao: "moodboards",
    });
    for (const bi of c.itens) {
      vez++;
      const b = boards[bi];
      const fotos = fotosDoTema(b);
      const disposicao = disposicaoDoTema(b);
      const porPagina = fotos.length ? repartirFotos(fotos.length, disposicao) : [0];
      let feitas = 0;
      porPagina.forEach((quantas, parte) => {
        paginas.push({
          tipo: "tema",
          bi,
          vez,
          grupo: c.chave,
          titulo: (b.title ?? "").trim(),
          parte,
          partes: porPagina.length,
          fotos: fotos.slice(feitas, feitas + quantas),
          disposicao,
          nome: parte
            ? `${(b.title ?? "").trim() || `Tema ${vez}`} · ${te.maisIdeias}`
            : (b.title ?? "").trim() || `Tema ${vez}`,
          seccao: "moodboards",
        });
        feitas += quantas;
      });
    }
  });
  // A citação, depois da inspiração (§6.7).
  if (capitulos.length && haFotos) {
    paginas.push({ tipo: "citacao", nome: "Citação", seccao: "moodboards" });
  }

  // ── Investimento ──
  const totais = totaisDaProposta(doc, depositPercentOf(doc));
  const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v);
  const totalStr = semMarcador(org ? (doc.totalEstimatedText ?? "") : (doc.totalText ?? ""));
  const nomes = org
    ? (doc.budgetRows ?? []).filter((r) => temTexto(r.item)).map((r) => r.item)
    : ordemDeSaida(doc, doc.budgetItems ?? [], (s) => s)
        .map((i) => doc.budgetItems[i] ?? "")
        .filter((s) => s.trim());
  if (nomes.length > 0 || totais.aPagar > 0 || totalStr.trim()) {
    // O total primeiro — é a página «Investimento» do índice (§6.8).
    paginas.push({ tipo: "total", nome: te.investimento, seccao: "total" });
    paginasDoOrcamento(nomes).forEach((linhas, k) => {
      paginas.push({
        tipo: "orcamento",
        linhas,
        continuacao: k > 0,
        nome: k ? `${te.tituloOrcamento} ${te.continuacao}` : te.tituloOrcamento,
        seccao: "orcamento",
      });
    });
  }

  // ── Condições — sempre ──
  const notas = paginasDeColunasCorridas(
    [
      [
        ...lista(t.notasImportantes, fixos.notasImportantes ?? []),
        ...lista(t.proximosPassos, [t.passoAceitar, t.passoSinal, t.passoValidade("31/12/2099")]),
      ],
      [
        ...lista(t.incluidoNaProposta, fixos.incluido ?? []),
        ...lista(t.naoIncluidoNoOrcamento, fixos.naoIncluido ?? []),
      ],
      lista(t.observacoesGerais, fixos.observacoesGerais ?? []),
    ].flat(),
    3,
  );
  const gerais = paginasDeColunasCorridas(
    (fixos.condicoesGerais ?? []).map((texto) => ({ h3: false as const, texto })),
  );
  const pagamento = Math.max(
    1,
    paginasDeColunasFixas(
      [
        [
          ...lista(t.faseamentoDoPagamento, fixos.faseamento ?? []),
          ...(totais.aPagar > 0
            ? [
                { h3: false as const, texto: `${t.sinal(30)} · 0,00 € ${t.quandoSinal}` },
                { h3: false as const, texto: `${t.saldo(70)} · 0,00 € ${t.quandoSaldo}` },
                { h3: false as const, texto: t.baseDoCalculo("0,00 €") },
              ]
            : []),
        ],
        lista(t.cancelamento, fixos.cancelamento ?? []),
      ],
      COLUNAS.alturaComContactos,
    ),
  );
  const condicoes: [PaginaDoPlano & { tipo: "condicoes" }, number, string][] = [
    [{ tipo: "condicoes", qual: "notas", continuacao: false }, notas, te.tituloNotas],
    [{ tipo: "condicoes", qual: "gerais", continuacao: false }, gerais, te.tituloCondicoesGerais],
    [{ tipo: "condicoes", qual: "pagamento", continuacao: false }, pagamento, te.tituloPagamento],
  ];
  for (const [p, n, titulo] of condicoes) {
    for (let k = 0; k < n; k++) {
      paginas.push({
        ...p,
        continuacao: k > 0,
        nome: k ? `${titulo} ${te.continuacao}` : titulo,
        seccao: "total",
      });
    }
  }

  paginas.push({ tipo: "contracapa", nome: "Contracapa", seccao: "capas" });
  return paginas;
}

/**
 * As listas fixas que NÃO saem no PDF novo por estarem vazias.
 *
 * O desenho antigo imprimia a folha das condições gerais e a das observações
 * mesmo vazias — com o cabeçalho e nada por baixo, e foi assim que uma proposta
 * seguiu com duas folhas em branco (achado F-13). O novo não imprime uma secção
 * sem conteúdo: a folha não sai. O que pode faltar é o TEXTO, e é isso que a
 * conferência passa a dizer.
 */
export function listasQueNaoSaem(
  doc: ProposalDoc,
): { id: "condicoes" | "observacoes"; nome: string; seccao: string }[] {
  // Com os textos da casa por omissão, como o PDF os lê: uma lista AUSENTE no
  // rascunho quer dizer «as da casa», e sai — só uma lista vazia não sai.
  const fixos = blocosFixosNaLingua(withProposalDefaults(doc), "pt");
  const t = textosDaProposta("pt");
  const faltam: { id: "condicoes" | "observacoes"; nome: string; seccao: string }[] = [];
  if (!(fixos.condicoesGerais ?? []).some((l) => temTexto(l)))
    faltam.push({ id: "condicoes", nome: t.tituloCondicoes, seccao: "total" });
  if (!(fixos.observacoesGerais ?? []).some((l) => temTexto(l)))
    faltam.push({ id: "observacoes", nome: t.observacoesGerais, seccao: "total" });
  return faltam;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CHAVE DE CADA PÁGINA — o nome que o PDF e o estúdio dão à mesma folha
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É por ela que as fotografias que ela escolheu (`fotosDasPaginas`) chegam à
 * página certa do PDF, e que a miniatura do estúdio sabe que fotografias o PDF
 * pôs em cada página (`fotosDoEditorial`). Estável de propósito: não depende
 * do número da página, que muda quando se acrescenta um serviço ou uma
 * condição. A primeira de cada tipo leva o nome sozinho (`orcamento`); as que
 * continuam levam o número (`orcamento:1`, `orcamento:2`).
 *
 * `montar.ts` dá a mesma chave a cada página que desenha (`chaveDoTipo` +
 * {@link Chaves}); um teste prende as duas listas uma à outra.
 */
export function chaveDoTipo(p: PaginaDoPlano): string {
  switch (p.tipo) {
    case "separador":
      return p.grupo ? `separador:${p.grupo}` : "investimento";
    case "tema":
      return `tema:${p.bi}`;
    case "condicoes":
      return `condicoes:${p.qual}`;
    default:
      return p.tipo;
  }
}

/** Dá a chave a cada página, pela ordem: a 2.ª do mesmo tipo leva `:1`. */
export class Chaves {
  private readonly vistas = new Map<string, number>();
  nova(base: string): string {
    const n = this.vistas.get(base) ?? 0;
    this.vistas.set(base, n + 1);
    return n ? `${base}:${n}` : base;
  }
}

/** As chaves das páginas de um plano, pela mesma ordem. */
export function chavesDasPaginas(plano: readonly PaginaDoPlano[]): string[] {
  const chaves = new Chaves();
  return plano.map((p) => chaves.nova(chaveDoTipo(p)));
}

/**
 * As páginas onde ela pode escolher a fotografia, e quantas leva cada uma.
 *
 * Fica de fora o que JÁ é escolha dela noutro sítio: as páginas de um tema com
 * fotografias (são as do mood board, pela ordem dela) e os cartões de «O que
 * propomos» (a foto ★ de cada tema). O separador leva uma ou duas.
 */
export function lugaresDaPagina(p: PaginaDoPlano): { min: number; max: number } | null {
  switch (p.tipo) {
    case "separador":
      return { min: 1, max: 2 };
    case "tema":
      return p.fotos.length ? null : { min: 1, max: 1 };
    case "servicos":
    case "ambiente":
      return null;
    default:
      return { min: 1, max: 1 };
  }
}

/** Quantas páginas, pelo plano. */
export const paginasDoPlano = (doc: ProposalDoc) => planoDaProposta(doc).length;

/**
 * A composição que o PDF dá a um tema com `n` fotografias, por palavras — o
 * quadro de `mosaico.ts`. Sem `disposicao` é a automática, pelo número de
 * fotografias; com ela, o nome da que ela escolheu (e em quantas páginas).
 */
export function composicaoEmPalavras(n: number, disposicao?: Disposicao | null): string {
  if (disposicao && n >= FOTOS_DA_DISPOSICAO[disposicao].min) {
    const paginas = repartirFotos(n, disposicao).length;
    const nome = NOME_DA_DISPOSICAO[disposicao];
    return paginas > 1 ? `${nome}, em ${paginas} páginas` : nome;
  }
  if (n <= 0) return "Só texto, com uma fotografia de outro tema ao lado";
  if (n === 1) return "Uma fotografia a página inteira";
  if (n === 2) return "Duas metades a toda a altura";
  if (n === 3) return "Tríptico a toda a altura";
  if (n <= 5) return "O texto num canto e as fotografias em duas filas";
  const paginas = repartirFotos(n).length;
  return paginas > 1
    ? `Mosaico e tríptico alternados, em ${paginas} páginas`
    : "Mosaico de duas filas, com o texto num canto";
}

/**
 * O capítulo de inspiração de um tema. Num casamento, o do dia («Jantar»),
 * pelo nome — `grupos.ts`; fora dele, cada mood board é o seu capítulo, e o
 * nome é o título dele.
 */
export function capituloDoTema(
  b: Pick<MoodBoard, "title" | "subtitulo">,
  casamento = true,
): string {
  const te = textosEditoriais("pt");
  if (!casamento) return (b.title ?? "").trim() || te.inspiracao;
  return te.grupos[grupoDoTema(b.title ?? "", b.subtitulo ?? "")];
}

/** Quantas páginas um tema ocupa no PDF (0 fotos é uma página de texto). */
export const paginasDoTema = (n: number, disposicao?: Disposicao | null) =>
  n > 0 ? repartirFotos(n, disposicao).length : 1;
