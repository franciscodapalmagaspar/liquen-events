/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS COMPOSIÇÕES DOS TEMAS — ESCOLHIDAS PELO NÚMERO DE FOTOGRAFIAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O quadro do documento dela de 23/10 (`docs/PDF-DESIGN-NOVO.md` §6.6b),
 * mosaico de ponta a ponta, sem margens, com 6 px de intervalo:
 *
 *   0       uma página só de texto
 *   1       uma fotografia a página inteira, com o bloco de título
 *   2       duas metades verticais
 *   3       três colunas a toda a altura (tríptico)
 *   4–5     a célula de texto + as fotografias em duas filas
 *   6–12    a célula de texto + mosaico de duas filas
 *   > 12    várias páginas, a alternar mosaico e tríptico
 *
 * A CÉLULA DE TEXTO é uma célula do mosaico com o fundo Tinta: 346 px de
 * largura, metade da altura, no canto de CIMA — à esquerda nos temas ímpares,
 * à direita nos pares. Dentro de uma fila cada fotografia cresce em largura
 * na proporção do seu formato (o `flex: <aspecto>`), por isso cada célula tem
 * quase a forma da sua fotografia; nas de 4–5, a grelha é a do modelo, com as
 * colunas de baixo alinhadas com as de cima.
 *
 * Este ficheiro não sabe nada de PDF: recebe formas e devolve caixas, para se
 * poder testar sem desenhar — e o estúdio desenha as miniaturas com ele.
 *
 * ── A DISPOSIÇÃO À ESCOLHA (15/10) ──────────────────────────────────────────
 * O quadro de cima é a AUTOMÁTICA. As disposições de `DISPOSICOES` são as que
 * ela pode escolher num tema; seguem as mesmas regras de intervalo e de célula
 * (§6.6b). As que têm a coluna de texto a toda a altura (uma fila, três filas,
 * destaque, grelha, texto e imagem) mantêm-na: partir essa coluna ao meio
 * deixava um buraco por baixo da célula — está dito na Parte −1.
 */

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largura e altura da folha do exemplo. */
const W = 1123;
const H = 794;
/** O intervalo entre células (§4). */
export const VAO = 6;
/** A largura da célula de texto (§6.6b). */
export const LARGURA_DO_MOSAICO = 346;
/** O máximo de fotografias numa página de tema. */
export const MAXIMO_POR_PAGINA = 12;

export type Composicao =
  | { tipo: "texto" }
  | { tipo: "inteira"; celulas: Caixa[] }
  | { tipo: "metades"; celulas: Caixa[] }
  | { tipo: "triptico"; celulas: Caixa[] }
  | { tipo: "fila"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "tijolo"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "desalinhadas"; celulas: Caixa[] }
  | { tipo: "mosaico"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "filas"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "destaque"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "grelha"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "texto-e-imagem"; mosaico: Caixa; celulas: Caixa[] };

/** As disposições que ela pode escolher num tema (sem escolha: a automática). */
export const DISPOSICOES = [
  "uma-fila",
  "duas-filas",
  "tres-filas",
  "soltas",
  "destaque",
  "grelha",
  "texto-e-imagem",
] as const;
export type Disposicao = (typeof DISPOSICOES)[number];

export const eDisposicao = (v: unknown): v is Disposicao =>
  typeof v === "string" && (DISPOSICOES as readonly string[]).includes(v);

/** Quantas fotografias cabem numa página de cada disposição. */
export const FOTOS_DA_DISPOSICAO: Record<Disposicao, { min: number; max: number }> = {
  "uma-fila": { min: 2, max: 5 },
  "duas-filas": { min: 3, max: 12 },
  "tres-filas": { min: 6, max: 12 },
  soltas: { min: 3, max: 6 },
  destaque: { min: 3, max: 7 },
  grelha: { min: 3, max: 10 },
  "texto-e-imagem": { min: 1, max: 4 },
};

/** Os nomes que ela lê no estúdio. */
export const NOME_DA_DISPOSICAO: Record<Disposicao, string> = {
  "uma-fila": "Uma fila",
  "duas-filas": "Duas filas",
  "tres-filas": "Três filas",
  soltas: "Soltas",
  destaque: "Destaque",
  grelha: "Grelha",
  "texto-e-imagem": "Texto e imagem",
};

/** A disposição gravada num tema, ou `null` (a automática) se não for válida. */
export const disposicaoDoTema = (b: { disposicao?: unknown } | null | undefined) =>
  eDisposicao(b?.disposicao) ? b.disposicao : null;

/** A disposição serve para `n` fotografias (numa página ou repartidas)? */
export const disposicaoServe = (d: Disposicao, n: number) => n >= FOTOS_DA_DISPOSICAO[d].min;

/**
 * Formas muito extremas (uma panorâmica 4:1, uma tira 1:4) dariam células que
 * são uma risca; ficam presas a um intervalo que ainda se lê como fotografia.
 */
const aspectoUtil = (a: number) =>
  Math.min(2.2, Math.max(0.45, Number.isFinite(a) && a > 0 ? a : 1));

/**
 * Uma fila de fotografias a ocupar `w` de largura, cada uma com largura
 * proporcional ao seu aspecto. A última célula leva o arredondamento, para a
 * fila acabar exactamente na borda.
 */
export function fila(
  aspectos: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
): Caixa[] {
  if (!aspectos.length) return [];
  const pesos = aspectos.map(aspectoUtil);
  const soma = pesos.reduce((s, p) => s + p, 0);
  const livre = w - VAO * (aspectos.length - 1);
  const caixas: Caixa[] = [];
  let cx = x;
  pesos.forEach((p, i) => {
    const ultima = i === pesos.length - 1;
    const cw = ultima ? x + w - cx : Math.round((livre * p) / soma);
    caixas.push({ x: cx, y, w: cw, h });
    cx += cw + VAO;
  });
  return caixas;
}

/**
 * Quantas páginas leva um tema, e quantas fotografias em cada uma.
 *
 * Na automática, até doze, uma; acima disso, páginas que ALTERNAM entre o
 * mosaico (nove) e o tríptico (três), como o documento dela pede — 13 dá
 * 9 + 4, 25 dá 9 + 3 + 9 + 4. Numa disposição escolhida, reparte-se o mais
 * por igual possível pelo máximo dela.
 */
export function repartir(n: number, d?: Disposicao | null): number[] {
  if (d && disposicaoServe(d, n)) {
    const maximo = FOTOS_DA_DISPOSICAO[d].max;
    if (n <= maximo) return [n];
    const paginas = Math.ceil(n / maximo);
    const base = Math.floor(n / paginas);
    const resto = n % paginas;
    return Array.from({ length: paginas }, (_, i) => base + (i < resto ? 1 : 0));
  }
  if (n <= MAXIMO_POR_PAGINA) return [n];
  const paginas: number[] = [];
  let falta = n;
  let mosaico = true;
  while (falta > MAXIMO_POR_PAGINA) {
    const leva = mosaico ? 9 : 3;
    paginas.push(leva);
    falta -= leva;
    mosaico = !mosaico;
  }
  paginas.push(falta);
  return paginas;
}

/**
 * A composição de uma página de tema.
 *
 * `aspectos` vem pela ordem em que ela arrumou as fotografias (com a
 * «principal» à frente — `ordemDasFotos`), e as células saem pela mesma
 * ordem: a célula `i` é a da fotografia `i`.
 *
 * `par` é a vez do tema na proposta (1.º, 2.º…): os pares levam o mosaico de
 * texto em baixo à direita.
 */
export function composicao(
  aspectos: readonly number[],
  vezPar: boolean,
  disposicao?: Disposicao | null,
): Composicao {
  const n = aspectos.length;
  const d =
    disposicao &&
    n >= FOTOS_DA_DISPOSICAO[disposicao].min &&
    n <= FOTOS_DA_DISPOSICAO[disposicao].max
      ? disposicao
      : null;
  if (d === "uma-fila") return umaFila(aspectos, vezPar);
  if (d === "duas-filas") return duasFilas(aspectos, vezPar);
  if (d === "tres-filas") return tresFilas(aspectos, vezPar);
  if (d === "soltas") return soltas(n);
  if (d === "destaque") return destaque(aspectos, vezPar);
  if (d === "grelha") return grelha(n, vezPar);
  if (d === "texto-e-imagem") return textoEImagem(n, vezPar);

  if (n === 0) return { tipo: "texto" };
  if (n === 1) return { tipo: "inteira", celulas: [{ x: 0, y: 0, w: W, h: H }] };
  if (n === 2) return { tipo: "metades", celulas: colunasIguais(2) };
  if (n === 3) return { tipo: "triptico", celulas: colunasIguais(3) };
  if (n <= 5) return tijolo(n, vezPar);
  return duasFilas(aspectos, vezPar);
}

/** `n` colunas de largura igual, a toda a altura (as metades, o tríptico). */
function colunasIguais(n: number): Caixa[] {
  const w = (W - VAO * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: i * (w + VAO), y: 0, w, h: H }));
}

/** A célula de texto: metade da altura, no canto de cima do lado da vez. */
const celulaDeTexto = (par: boolean): Caixa => ({
  x: par ? W - LARGURA_DO_MOSAICO : 0,
  y: 0,
  w: LARGURA_DO_MOSAICO,
  h: (H - VAO) / 2,
});

/**
 * Quatro ou cinco fotografias: a célula de texto, duas fotografias ao lado
 * dela, e as restantes na fila de baixo — com cinco, as três colunas de baixo
 * alinham com as de cima, como no modelo dela.
 */
function tijolo(n: number, par: boolean): Composicao {
  const hFila = (H - VAO) / 2;
  const mosaico = celulaDeTexto(par);
  const wCima = (W - LARGURA_DO_MOSAICO - 2 * VAO) / 2;
  const xCima = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  const cima: Caixa[] = [0, 1].map((i) => ({
    x: xCima + i * (wCima + VAO),
    y: 0,
    w: wCima,
    h: hFila,
  }));
  const yBaixo = hFila + VAO;
  const baixo: Caixa[] =
    n - 2 === 3
      ? par
        ? [
            { x: 0, y: yBaixo, w: wCima, h: hFila },
            { x: wCima + VAO, y: yBaixo, w: wCima, h: hFila },
            { x: W - LARGURA_DO_MOSAICO, y: yBaixo, w: LARGURA_DO_MOSAICO, h: hFila },
          ]
        : [
            { x: 0, y: yBaixo, w: LARGURA_DO_MOSAICO, h: hFila },
            { x: LARGURA_DO_MOSAICO + VAO, y: yBaixo, w: wCima, h: hFila },
            { x: LARGURA_DO_MOSAICO + 2 * VAO + wCima, y: yBaixo, w: wCima, h: hFila },
          ]
      : [0, 1].map((i) => ({
          x: i * ((W - VAO) / 2 + VAO),
          y: yBaixo,
          w: (W - VAO) / 2,
          h: hFila,
        }));
  return { tipo: "tijolo", mosaico, celulas: [...cima, ...baixo] };
}

/** A largura que sobra ao lado do mosaico de texto. */
const AO_LADO = W - LARGURA_DO_MOSAICO - VAO;

/** O mosaico de texto a toda a altura, do lado da vez. */
const mosaicoAlto = (par: boolean, largura = LARGURA_DO_MOSAICO): Caixa => ({
  x: par ? W - largura : 0,
  y: 0,
  w: largura,
  h: H,
});

/** Uma fila a toda a altura; o mosaico do lado da vez. */
function umaFila(aspectos: readonly number[], par: boolean): Composicao {
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  return { tipo: "fila", mosaico: mosaicoAlto(par), celulas: fila(aspectos, x0, 0, AO_LADO, H) };
}

/**
 * Soltas: ao alto, lado a lado, desalinhadas em altura. Com cinco são as do
 * exemplo, tal e qual — 174 × 270 a partir da margem de 98, com as alturas
 * (40, 96, 10, 120, 60); com outro número, a mesma forma e o mesmo vão,
 * centradas, sem passar de 220 de largura.
 */
function soltas(n: number): Composicao {
  const desvios = [40, 96, 10, 120, 60, 30];
  const margem = 98;
  const vao = 14;
  const util = W - 2 * margem;
  const w = Math.min(220, Math.floor((util - vao * (n - 1)) / n));
  const h = Math.round((w * 270) / 174);
  const x0 = margem + Math.floor((util - (n * w + vao * (n - 1))) / 2);
  return {
    tipo: "desalinhadas",
    celulas: Array.from({ length: n }, (_, i) => ({
      x: x0 + i * (w + vao),
      y: desvios[i % desvios.length],
      w,
      h,
    })),
  };
}

/** Reparte `n` por `k` filas, as primeiras com a mais. */
function porFilas(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

/**
 * Três filas de altura igual ao lado do mosaico de texto, que fica a toda a
 * altura do lado da vez (as «filas» do PDF antigo, nesta folha).
 */
function tresFilas(aspectos: readonly number[], par: boolean): Composicao {
  const h = (H - 2 * VAO) / 3;
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  const celulas: Caixa[] = [];
  let i = 0;
  porFilas(aspectos.length, 3).forEach((q, r) => {
    celulas.push(...fila(aspectos.slice(i, i + q), x0, r * (h + VAO), AO_LADO, h));
    i += q;
  });
  return { tipo: "filas", mosaico: mosaicoAlto(par), celulas };
}

/**
 * Destaque: o mosaico de texto, a primeira fotografia (a ★) grande a toda a
 * altura, e as outras numa coluna — uma ao lado da outra em duas colunas
 * quando são mais de três.
 */
function destaque(aspectos: readonly number[], par: boolean): Composicao {
  const resto = aspectos.length - 1;
  const larguraGrande = Math.round(AO_LADO * 0.55);
  const larguraColuna = AO_LADO - larguraGrande - VAO;
  const xTexto = par ? W - LARGURA_DO_MOSAICO : 0;
  // Ímpar: texto | grande | coluna. Par: coluna | grande | texto.
  const xGrande = par ? larguraColuna + VAO : LARGURA_DO_MOSAICO + VAO;
  const xColuna = par ? 0 : xGrande + larguraGrande + VAO;
  const grande: Caixa = { x: xGrande, y: 0, w: larguraGrande, h: H };
  const colunas = resto > 3 ? 2 : 1;
  const linhas = Math.ceil(resto / colunas);
  const hLinha = (H - VAO * (linhas - 1)) / linhas;
  const wCol = (larguraColuna - VAO * (colunas - 1)) / colunas;
  const pequenas: Caixa[] = [];
  for (let k = 0; k < resto; k++) {
    const linha = Math.floor(k / colunas);
    const col = k % colunas;
    // A última linha, se tiver uma só, ocupa a largura toda da coluna.
    const sozinha = colunas === 2 && col === 0 && k === resto - 1;
    pequenas.push({
      x: xColuna + col * (wCol + VAO),
      y: linha * (hLinha + VAO),
      w: sozinha ? larguraColuna : wCol,
      h: hLinha,
    });
  }
  return {
    tipo: "destaque",
    mosaico: { x: xTexto, y: 0, w: LARGURA_DO_MOSAICO, h: H },
    celulas: [grande, ...pequenas],
  };
}

/**
 * Grelha: o «mosaico» do PDF antigo — cortes sucessivos de um rectângulo numa
 * grelha fina de 8 × 8, partindo sempre o maior pedaço pelo lado mais comprido,
 * numa proporção de uma lista fixa. Tamanhos todos diferentes, arestas sempre
 * alinhadas, sem buracos nem sobreposições, e o mesmo número de fotografias dá
 * sempre a mesma página. A maior célula vai para a frente (é a da ★).
 */
const PROPORCOES_DA_GRELHA = [0.58, 0.45, 0.62, 0.5, 0.4, 0.55, 0.48, 0.6, 0.42, 0.52];
const CELULAS_DA_GRELHA = 8;

function grelha(n: number, par: boolean): Composicao {
  let pedacos = [{ cx: 0, cy: 0, cw: CELULAS_DA_GRELHA, ch: CELULAS_DA_GRELHA }];
  let corte = 0;
  while (pedacos.length < n) {
    let iMaior = 0;
    for (let k = 1; k < pedacos.length; k++) {
      if (pedacos[k].cw * pedacos[k].ch > pedacos[iMaior].cw * pedacos[iMaior].ch) iMaior = k;
    }
    const p = pedacos[iMaior];
    const naVertical = p.cw >= p.ch;
    const total = naVertical ? p.cw : p.ch;
    if (total < 2) break;
    const razao = PROPORCOES_DA_GRELHA[corte % PROPORCOES_DA_GRELHA.length];
    corte++;
    const primeiro = Math.min(total - 1, Math.max(1, Math.round(total * razao)));
    const a1 = naVertical
      ? { cx: p.cx, cy: p.cy, cw: primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy, cw: p.cw, ch: primeiro };
    const a2 = naVertical
      ? { cx: p.cx + primeiro, cy: p.cy, cw: p.cw - primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy + primeiro, cw: p.cw, ch: p.ch - primeiro };
    pedacos = [...pedacos.slice(0, iMaior), a1, a2, ...pedacos.slice(iMaior + 1)];
  }
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  const passoX = (AO_LADO + VAO) / CELULAS_DA_GRELHA;
  const passoY = (H + VAO) / CELULAS_DA_GRELHA;
  const celulas = pedacos.slice(0, n).map((p) => ({
    x: x0 + p.cx * passoX,
    y: p.cy * passoY,
    w: p.cw * passoX - VAO,
    h: p.ch * passoY - VAO,
  }));
  const area = (c: Caixa) => c.w * c.h;
  let iMaior = 0;
  celulas.forEach((c, k) => {
    if (area(c) > area(celulas[iMaior])) iMaior = k;
  });
  [celulas[0], celulas[iMaior]] = [celulas[iMaior], celulas[0]];
  return { tipo: "grelha", mosaico: mosaicoAlto(par), celulas };
}

/**
 * Texto e imagem: o mosaico de texto mais largo (45% da folha), e as
 * fotografias umas por cima das outras do outro lado.
 */
function textoEImagem(n: number, par: boolean): Composicao {
  const larguraTexto = Math.round(W * 0.45);
  const larguraFotos = W - larguraTexto - VAO;
  const x0 = par ? 0 : larguraTexto + VAO;
  const h = (H - VAO * (n - 1)) / n;
  return {
    tipo: "texto-e-imagem",
    mosaico: mosaicoAlto(par, larguraTexto),
    celulas: Array.from({ length: n }, (_, i) => ({ x: x0, y: i * (h + VAO), w: larguraFotos, h })),
  };
}

/**
 * Duas filas de altura igual, a célula de texto no canto de cima do lado da
 * vez — o mosaico automático de 6 a 12 fotografias, e a disposição «duas
 * filas». A fila de cima (ao lado da célula) leva ~40% das fotografias.
 */
function duasFilas(aspectos: readonly number[], par: boolean): Composicao {
  const n = aspectos.length;
  const alturaFila = (H - VAO) / 2;
  const naFilaDoMosaico = Math.max(1, Math.min(n - 1, Math.round(n * 0.4)));
  const mosaico = celulaDeTexto(par);
  const cima = fila(
    aspectos.slice(0, naFilaDoMosaico),
    par ? 0 : LARGURA_DO_MOSAICO + VAO,
    0,
    W - LARGURA_DO_MOSAICO - VAO,
    alturaFila,
  );
  const baixo = fila(aspectos.slice(naFilaDoMosaico), 0, alturaFila + VAO, W, alturaFila);
  return { tipo: "mosaico", mosaico, celulas: [...cima, ...baixo] };
}

/**
 * As metades e o tríptico não têm texto (§6.6b). Num casamento, a primeira
 * página do tema leva o bloco de título por cima — senão o nome do tema
 * perdia-se, porque o separador diz o do capítulo («Jantar»); fora dele, o
 * separador que vem antes é o próprio tema (`montar.ts` põe lá a nota). As
 * soltas levam-no sempre na primeira página: não têm célula de texto.
 */
export function levaBloco(tipo: string, primeira: boolean, casamento: boolean): boolean {
  if (!primeira) return false;
  if (tipo === "desalinhadas") return true;
  return (tipo === "metades" || tipo === "triptico") && casamento;
}

/** A primeira página de um tema diz o título e a nota dele? */
export function temaDizONome(
  aspectos: readonly number[],
  numero: number,
  disposicao: Disposicao | null | undefined,
  casamento: boolean,
): boolean {
  const c = composicao(aspectos, numero % 2 === 0, disposicao);
  if (c.tipo === "metades" || c.tipo === "triptico") return levaBloco(c.tipo, true, casamento);
  return true;
}
