import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Contexto } from "./moldura";
import { COR, LETRA, px } from "./paleta";
import {
  baseDaLinha,
  escrever,
  largura,
  limpo,
  maiusculas,
  quebrar,
  yDoTopo,
  type Estilo,
} from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEXTO EM COLUNAS QUE CONTINUA NA PÁGINA SEGUINTE — as condições
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As condições são texto contratual: saem SEMPRE, inteiras, palavra por
 * palavra. Por isso aqui não há corte nenhum — o que não cabe numa coluna
 * passa para a página seguinte, com o título da secção repetido e «(cont.)».
 *
 * Uma página é um conjunto de colunas; cada coluna é uma lista de peças
 * (títulos `h3` e pontos `li`). As peças medem-se antes de se
 * desenhar, para a repartição ser decidida inteira — um título nunca fica
 * sozinho no fundo de uma coluna sem o primeiro ponto por baixo.
 *
 * O desenho é o do documento de 23/10 (§6.9): os h3 em maiúsculas espaçadas
 * no Linho, e os pontos em Jost 14 SEM fios entre eles (10 px de ar). Os
 * contactos não são peças: são uma faixa por baixo das colunas
 * (`paginas/condicoes.ts`).
 */

export type Peca =
  | { tipo: "h3"; texto: string }
  /** Um ponto da lista; `forte` é o princípio («Sinal 30% · 1.350,54 €»), na Cal. */
  | { tipo: "item"; texto: string; forte?: string };

const ITEM = LETRA.item;
const H3 = LETRA.h3;
/**
 * Medido no modelo: do último ponto ao h3 seguinte, 51 px de base a base; do
 * h3 ao primeiro ponto, 39.
 */
const AR_ANTES_DO_H3 = 24;
const AR_DEPOIS_DO_H3 = 20;

/**
 * O texto das condições é contratual: não se corta — encolhe. Quem pagina
 * experimenta o tamanho do documento (14) e, só se o texto não couber nas
 * páginas dele, um pouco menos, até {@link TAM_MINIMO} (`montar.ts`).
 */
export const TAM_MINIMO = 12.5;

const estilos = (ctx: Contexto, tam: number = ITEM.tam) => ({
  h3: {
    letra: ctx.letras.jost,
    tam: H3.tam,
    cor: COR.linho,
    espaco: H3.espaco,
  } satisfies Estilo,
  item: { letra: ctx.letras.jost, tam, cor: COR.papel } satisfies Estilo,
  forte: { letra: ctx.letras.jost, tam, cor: COR.cal } satisfies Estilo,
});

/** Uma linha de texto feita de corridas em letras diferentes. */
type Corrida = { texto: string; estilo: Estilo };

/**
 * Parte um ponto com princípio a negro em linhas, palavra a palavra, sem
 * perder qual palavra vai a negro.
 */
function linhasDoItem(
  ctx: Contexto,
  p: Extract<Peca, { tipo: "item" }>,
  max: number,
  tam: number,
): Corrida[][] {
  const e = estilos(ctx, tam);
  const palavras: Corrida[] = [
    ...(p.forte ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ texto: w, estilo: e.forte })),
    ...p.texto
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ texto: w, estilo: e.item })),
  ];
  if (!p.forte) return quebrar(e.item, p.texto, max).map((l) => [{ texto: l, estilo: e.item }]);
  const linhas: Corrida[][] = [];
  let atual: Corrida[] = [];
  let usado = 0;
  for (const w of palavras) {
    const espaco = atual.length ? largura(w.estilo, " ") : 0;
    const lw = largura(w.estilo, w.texto);
    if (atual.length && usado + espaco + lw > max) {
      linhas.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(w);
    usado += (atual.length > 1 ? espaco : 0) + lw;
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}

/**
 * A altura de uma peça, em píxeis da grelha. `anterior` é a peça de cima na
 * mesma coluna (`null` no topo): o ar antes de um h3 só conta a meio da
 * coluna.
 */
export function alturaDaPeca(
  ctx: Contexto,
  p: Peca,
  larguraPx: number,
  anterior: Peca | null,
  tam: number = ITEM.tam,
): number {
  const e = estilos(ctx, tam);
  if (p.tipo === "h3") {
    const n = quebrar(e.h3, maiusculas(p.texto), px(larguraPx)).length;
    return (anterior ? AR_ANTES_DO_H3 : 0) + n * H3.tam * H3.entrelinha + AR_DEPOIS_DO_H3;
  }
  const n = linhasDoItem(ctx, p, px(larguraPx), tam).length;
  return n * tam * ITEM.entrelinha + ITEM.entreItens;
}

/**
 * Reparte uma lista de peças em pedaços que cabem em `altura`.
 *
 * Um título nunca fica no fim de um pedaço sem o ponto seguinte. Quando uma
 * secção continua no pedaço seguinte, o pedaço abre com o título dela e
 * «(cont.)», para quem vira a página saber o que está a ler.
 */
export function repartir(
  ctx: Contexto,
  pecas: readonly Peca[],
  larguraPx: number,
  altura: number,
  /** Quantos pedaços vão numa página: o «(cont.)» só abre uma página nova. */
  porPagina = 1,
  tam: number = ITEM.tam,
): Peca[][] {
  const pedacos: Peca[][] = [];
  let atual: Peca[] = [];
  let usado = 0;
  let tituloAtual: string | null = null;
  const fecha = () => {
    pedacos.push(atual);
    atual = [];
    usado = 0;
  };
  const fila = [...pecas];
  for (let i = 0; i < fila.length; i++) {
    let p = fila[i];
    if (p.tipo === "h3") tituloAtual = p.texto;
    let h = alturaDaPeca(ctx, p, larguraPx, atual[atual.length - 1] ?? null, tam);
    // Um título leva consigo o primeiro ponto.
    const seguinte = fila[i + 1];
    const precisa =
      p.tipo === "h3" && seguinte && seguinte.tipo !== "h3"
        ? h + alturaDaPeca(ctx, seguinte, larguraPx, p, tam)
        : h;
    if (atual.length && usado + precisa > altura) {
      // Um ponto comprido parte-se entre linhas, palavra a palavra, em vez de
      // passar inteiro e deixar o fundo da coluna vazio — com pelo menos duas
      // linhas antes do corte. Nenhuma palavra se perde.
      const partes = p.tipo === "item" ? partirItem(ctx, p, larguraPx, altura - usado, tam) : null;
      if (partes) {
        atual.push(partes[0]);
        p = partes[1];
        fila[i] = p;
      }
      fecha();
      if (p.tipo !== "h3" && tituloAtual && pedacos.length % porPagina === 0) {
        const cont: Peca = { tipo: "h3", texto: `${tituloAtual} ${ctx.te.continuacao}` };
        atual.push(cont);
        usado += alturaDaPeca(ctx, cont, larguraPx, null, tam);
      }
      h = alturaDaPeca(ctx, p, larguraPx, atual[atual.length - 1] ?? null, tam);
    }
    atual.push(p);
    usado += h;
  }
  if (atual.length) pedacos.push(atual);
  return pedacos;
}

/**
 * Parte um ponto em dois: as linhas que cabem em `livre` px e o resto — ou
 * `null`, se não cabem duas linhas. O corte é entre palavras, e cada metade
 * guarda o seu texto tal como estava escrito.
 */
function partirItem(
  ctx: Contexto,
  p: Extract<Peca, { tipo: "item" }>,
  larguraPx: number,
  livre: number,
  tam: number,
): [Extract<Peca, { tipo: "item" }>, Extract<Peca, { tipo: "item" }>] | null {
  const linhas = linhasDoItem(ctx, p, px(larguraPx), tam);
  const cabem = Math.floor((livre - ITEM.entreItens) / (tam * ITEM.entrelinha));
  if (cabem < 2 || linhas.length <= cabem) return null;
  const palavras = linhas
    .slice(0, cabem)
    .flat()
    .reduce((n, c) => n + c.texto.split(/\s+/).filter(Boolean).length, 0);
  const forte = (p.forte ?? "").split(/\s+/).filter(Boolean);
  if (palavras <= forte.length) return null;
  const depois = palavras - forte.length;
  // O índice, no texto original, onde acaba a `depois`-ésima palavra.
  const fim = [...p.texto.matchAll(/\S+/g)][depois - 1];
  if (!fim || fim.index === undefined) return null;
  const corte = fim.index + fim[0].length;
  return [
    { ...p, texto: p.texto.slice(0, corte).trimEnd() },
    { tipo: "item", texto: p.texto.slice(corte).trimStart() },
  ];
}

/**
 * Colunas FIXAS: cada coluna tem o seu conteúdo e continua na mesma coluna da
 * página seguinte. Devolve as páginas, cada uma com as suas colunas.
 */
export function paginarColunasFixas(
  ctx: Contexto,
  colunas: readonly (readonly Peca[])[],
  larguraPx: number,
  altura: number,
  tam: number = ITEM.tam,
): Peca[][][] {
  const pedacos = colunas.map((c) => repartir(ctx, c, larguraPx, altura, 1, tam));
  const paginas = Math.max(1, ...pedacos.map((p) => p.length));
  return Array.from({ length: paginas }, (_, i) => pedacos.map((p) => p[i] ?? []));
}

/**
 * Uma lista CORRIDA por `n` colunas: enche a primeira, depois a segunda, e só
 * depois passa à página seguinte.
 */
export function paginarCorrido(
  ctx: Contexto,
  pecas: readonly Peca[],
  n: number,
  larguraPx: number,
  altura: number,
  tam: number = ITEM.tam,
): Peca[][][] {
  const pedacos = repartir(ctx, pecas, larguraPx, altura, n, tam);
  const paginas: Peca[][][] = [];
  for (let i = 0; i < pedacos.length; i += n) paginas.push(pedacos.slice(i, i + n));
  return paginas.length ? paginas : [[]];
}

/**
 * Para duas colunas de uma lista que cabe numa página só: reparte-a ao meio
 * pela ALTURA, e não pela contagem — a coluna da direita não fica com metade
 * dos pontos e um terço do texto.
 */
export function aoMeio(
  ctx: Contexto,
  pecas: readonly Peca[],
  larguraPx: number,
  tam: number = ITEM.tam,
): number {
  const alturas = pecas.map((p, i) => alturaDaPeca(ctx, p, larguraPx, pecas[i - 1] ?? null, tam));
  const total = alturas.reduce((s, h) => s + h, 0);
  let acc = 0;
  for (let i = 0; i < alturas.length; i++) {
    acc += alturas[i];
    if (acc >= total / 2) return Math.max(1, i + 1);
  }
  return pecas.length;
}

/** Desenha uma coluna a partir de `topo`. Devolve onde acabou. */
export function desenharColuna(
  ctx: Contexto,
  pagina: PDFPage,
  pecas: readonly Peca[],
  x: number,
  topo: number,
  larguraPx: number,
  tam: number = ITEM.tam,
): number {
  const e = estilos(ctx, tam);
  for (const [i, p] of pecas.entries()) {
    if (p.tipo === "h3") {
      if (i > 0) topo += AR_ANTES_DO_H3;
      for (const l of quebrar(e.h3, maiusculas(p.texto), px(larguraPx))) {
        escrever(pagina, e.h3, l, px(x), yDoTopo(topo) - baseDaLinha(e.h3, H3.entrelinha));
        topo += H3.tam * H3.entrelinha;
      }
      topo += AR_DEPOIS_DO_H3;
      continue;
    }
    for (const corridas of linhasDoItem(ctx, p, px(larguraPx), tam)) {
      const y = yDoTopo(topo) - baseDaLinha(e.item, ITEM.entrelinha);
      let cx = px(x);
      for (const [k, c] of corridas.entries()) {
        if (k) cx += largura(c.estilo, " ");
        escrever(pagina, c.estilo, c.texto, cx, y);
        cx += largura(c.estilo, limpo(c.estilo.letra, c.texto));
      }
      topo += tam * ITEM.entrelinha;
    }
    topo += ITEM.entreItens;
  }
  return topo;
}
