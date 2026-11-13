/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CINCO CORES DA PROPOSTA — as cores que SE VÊEM nas fotografias
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O documento dela (23/10): «Cinco cores extraídas automaticamente das
 * fotografias de inspiração dessa proposta (quantização das imagens,
 * descartando os tons quase pretos e quase brancos e as cores demasiado
 * parecidas entre si)», e as cores são as do que está POUSADO nas mesas —
 * flores, velas, toalhas, louça —, e não da sala, do chão nem do céu.
 *
 * ── O QUE UM CLIENTE DISSE (13/11) ─────────────────────────────────────────
 *
 * «As paletas não batem com as cores das flores nem das fotografias que se
 * apresentam.» Tinha razão, por três motivos, e os três estão corrigidos:
 *
 *   1. As cores saíam de OUTRAS fotografias. A página mostra seis (a fila de
 *      cinco e a grande), e a paleta lia até quarenta, de todos os temas das
 *      mesas — e a proposta online lia doze. Agora a paleta lê as MESMAS
 *      fotografias que a página mostra, no PDF e na proposta online
 *      (`montar.ts`, `fotosDaPaleta`).
 *
 *   2. Cada cor era uma MÉDIA. A média de um ramo de rosas cor-de-rosa, de
 *      folhas verdes e de pétalas brancas é um bege-acinzentado que não está
 *      em fotografia nenhuma. Agora cada cor é uma cor que EXISTE nas
 *      fotografias: a mais típica do seu grupo (a do meio em claridade e em
 *      intensidade, no tom do grupo), e não a média dos extremos.
 *
 *   3. As contas eram em RGB, onde a distância entre duas cores não é a que o
 *      olho vê. Agora fazem-se em Oklab, o espaço de cor feito para isso: duas
 *      cores «parecidas» são as que o olho acha parecidas.
 *
 * ── COMO SE FAZ ────────────────────────────────────────────────────────────
 *
 *   1. cada fotografia é lida INTEIRA (como o cliente a vê, sem recortes),
 *      reduzida a {@link LADO} píxeis no lado maior; o meio e o terço de baixo
 *      — onde está a mesa — pesam mais do que o topo e os cantos, mas nada
 *      fica de fora;
 *   2. cada fotografia pesa O MESMO no total: uma fotografia grande e cheia
 *      de parede não abafa as outras;
 *   3. descartam-se os quase pretos e os brancos estourados; o creme, o
 *      marfim e o branco-pérola das flores e das toalhas ficam;
 *   4. um píxel com cor (o cor-de-rosa, o bordeaux, o verde das folhas) pesa
 *      até três vezes mais do que um neutro, e um escuro baço (madeira,
 *      sombra, sala) pesa um quarto — a decisão dela de 23/10: «vai buscar
 *      cores que não são… os castanhos»;
 *   5. as cores agrupam-se por k-médias em Oklab (início determinístico: a
 *      mais pesada, depois sempre a mais afastada) em {@link GRUPOS} grupos;
 *   6. de cada grupo, a cor que o representa é uma cor REAL das fotografias —
 *      a mais próxima do «típico» do grupo;
 *   7. ficam as cinco mais pesadas que não sejam parecidas entre si, com no
 *      máximo duas neutras (para as flores terem lugar), e ordenam-se da mais
 *      clara para a mais escura, como no exemplo.
 *
 * Este ficheiro não tem dependências: corre no servidor (o PDF e a proposta
 * online, por `pdf-editorial/paleta-das-fotos.ts`) e no navegador (as
 * sugestões e o conta-gotas do «Fazer proposta») — a MESMA regra nos três.
 *
 * Não há sorteio em lado nenhum: as mesmas fotografias dão sempre as mesmas
 * cinco cores, e a proposta reenviada não muda de paleta.
 */

export type Rgb = readonly [number, number, number];
/** Uma cor em Oklab: claridade (0–1), e os dois eixos de cor. */
export type Lab = readonly [number, number, number];

/** O lado maior a que cada fotografia é reduzida. */
export const LADO = 160;
const QUANTAS = 5;
/** Abaixo disto em Oklab, duas cores contam como «a mesma» para a paleta. */
const PARECIDAS = 0.085;
/** Croma abaixo do qual uma cor é neutra (creme, cinzento, bege). */
const NEUTRA = 0.03;
/** Neutras na paleta, no máximo. */
const MAX_NEUTRAS = 2;

/* ── Oklab (Björn Ottosson, 2020) ─────────────────────────────────────────── */

const linear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const gama = (v: number) => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** Tabela das 256 conversões sRGB → linear, para não repetir a potência por píxel. */
const LINEAR = Float64Array.from({ length: 256 }, (_, i) => linear(i));

export function paraOklab([r, g, b]: Rgb): Lab {
  const lr = LINEAR[r];
  const lg = LINEAR[g];
  const lb = LINEAR[b];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function deOklab([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    gama(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    gama(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    gama(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const croma = (c: Lab) => Math.hypot(c[1], c[2]);
const distancia = (x: Lab, y: Lab) => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);

/* ── O peso de cada píxel ────────────────────────────────────────────────── */

/**
 * O peso do sítio (passo 1): a mesa e a decoração costumam estar no meio e no
 * terço de baixo. Pesa 1 aí e desce suavemente até 0,35 nos cantos de cima —
 * a fotografia vê-se inteira, e uma cor que só está no topo conta menos, mas
 * conta.
 */
export function pesoDoSitio(x: number, y: number): number {
  const dx = (x - 0.5) / 0.55;
  const dy = (y - 0.62) / 0.5;
  return Math.max(0.35, Math.min(1, 1.25 - (dx * dx + dy * dy)));
}

/**
 * O peso da cor (passo 4). A paleta é sobretudo a das FLORES («tem muito a
 * ver com as cores das flores», 13/11): uma flor ocupa pouco da fotografia e
 * é a primeira coisa que se vê, por isso um píxel com cor viva pesa até onze
 * vezes mais do que um neutro. A madeira, a sombra e a sala — castanhos
 * escuros e baços — pesam um quinto.
 */
export function pesoDaCor(c: Lab): number {
  const k = croma(c);
  const peso = 1 + 10 * Math.min(1, k / 0.14) ** 1.5;
  return eTerroso(c) ? peso * 0.2 : peso;
}

/** Castanho de madeira, de sombra ou de sala: quente, escuro e pouco intenso. */
function eTerroso(c: Lab): boolean {
  const k = croma(c);
  const tom = tomDe(c);
  // Escuro e quente: madeira, mesa, sombra, cadeiras. Uma pétala laranja ou
  // cor de pêssego é mais clara (ou muito mais intensa) do que isto.
  return tom > 20 && tom < 110 && ((c[0] < 0.55 && k < 0.11) || (c[0] < 0.48 && k < 0.15));
}

/** O tom, em graus (0–360): 0 rosa/vermelho, ~70 laranja/amarelo, ~140 verde, ~260 azul. */
function tomDe(c: Lab): number {
  const t = (Math.atan2(c[2], c[1]) * 180) / Math.PI;
  return t < 0 ? t + 360 : t;
}

/** A diferença entre os tons de duas cores, em graus (0–180). */
function diferencaDeTom(x: Lab, y: Lab): number {
  const d = Math.abs(tomDe(x) - tomDe(y));
  return Math.min(d, 360 - d);
}

/**
 * Verde de folhagem (não de pétala): tom entre 115° e 170°, ou o verde-oliva
 * mais escuro de 100° a 115°. Um amarelo CLARO no mesmo tom (o mimosa, o
 * girassol, o limão) é pétala, não folha.
 */
function eFolhagem(c: Lab): boolean {
  const t = tomDe(c);
  if (croma(c) < NEUTRA) return false;
  return (t >= 115 && t < 170) || (t > 100 && t < 115 && c[0] < 0.7);
}

/** Fica de fora (passo 3): o quase preto e o branco estourado. */
export function descartada(c: Lab): boolean {
  if (c[0] < 0.25) return true;
  return c[0] > 0.965 && croma(c) < 0.018;
}

/* ── As fotografias ──────────────────────────────────────────────────────── */

/** Um píxel pronto a agrupar: a cor em Oklab e o peso. */
/**
 * `y` é a altura média a que a cor está na fotografia (0 em cima, 1 em baixo),
 * e `borda` quanto dela está na faixa junto aos bordos (0 a 1).
 */
export type Ponto = { lab: Lab; peso: number; y: number; borda: number };

/**
 * Os píxeis de UMA fotografia, com os pesos já normalizados para a fotografia
 * somar 1 (passo 2). Os píxeis iguais juntam-se num só, com o peso somado.
 */
export function pontosDaFoto(
  data: Uint8Array | Uint8ClampedArray,
  w: number,
  h: number,
  /** 3 no servidor (`sharp`, sem alfa), 4 no navegador (`ImageData`). */
  canais: 3 | 4 = 3,
): Ponto[] {
  const porCor = new Map<number, Ponto>();
  let total = 0;
  for (let i = 0, k = 0; i + 2 < data.length; i += canais, k++) {
    // Juntar os vizinhos quase iguais (5 bits por canal) poupa o grosso das
    // contas sem mudar a cor que se vê.
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lab = paraOklab([r, g, b]);
    if (descartada(lab)) continue;
    const x = ((k % w) + 0.5) / w;
    const y = (Math.floor(k / w) + 0.5) / h;
    const noBordo = x < 0.07 || x > 0.93 || y < 0.07 ? 1 : 0;
    const peso = pesoDoSitio(x, y) * pesoDaCor(lab);
    total += peso;
    const chave = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const ja = porCor.get(chave);
    if (ja) {
      // A cor do grupo de píxeis é a do primeiro: a diferença é de 8 em 255.
      ja.y = (ja.y * ja.peso + y * peso) / (ja.peso + peso);
      ja.borda = (ja.borda * ja.peso + noBordo * peso) / (ja.peso + peso);
      ja.peso += peso;
    } else {
      porCor.set(chave, { lab, peso, y, borda: noBordo });
    }
  }
  if (!total) return [];
  return [...porCor.values()].map((p) => ({ ...p, peso: p.peso / total }));
}

/* ── O agrupamento e a escolha ───────────────────────────────────────────── */

/** O k-médias e a escolha — separado para se poder testar sem imagens. */
export function escolher(pontos: readonly Ponto[]): string[] {
  return escolherDosGrupos(agruparPorFamilias(pontos), QUANTAS);
}

/**
 * As cores agrupam-se em TRÊS famílias, cada uma à parte (13/11):
 *
 *   · as PÉTALAS — tudo o que tem cor e não é folhagem nem madeira: rosas,
 *     lilases, pêssegos, laranjas, bordeaux, amarelos;
 *   · a FOLHAGEM — os verdes;
 *   · o RESTO — o linho, a toalha, o vidro, as flores brancas, a madeira.
 *
 * Porquê à parte: um rosa ocupa poucos píxeis de uma fotografia de mesa, e
 * agrupado com tudo era engolido pelos grandes grupos de bege — a paleta
 * saía sem a cor das flores. Agrupado só entre as pétalas, cada flor ganha o
 * seu grupo, por pequena que seja.
 */
function agruparPorFamilias(pontos: readonly Ponto[]): Grupo[] {
  const total = pontos.reduce((s, p) => s + p.peso, 0);
  const petalas: Ponto[] = [];
  const folhagem: Ponto[] = [];
  const resto: Ponto[] = [];
  for (const p of pontos) {
    // Um azul pálido e fraco é céu, vidro, ou um branco à sombra — base.
    const palidoFrio =
      p.lab[0] > 0.72 && croma(p.lab) < 0.05 && tomDe(p.lab) > 180 && tomDe(p.lab) < 290;
    if (eBase(p.lab) || palidoFrio) resto.push(p);
    else if (eFolhagem(p.lab)) folhagem.push(p);
    else petalas.push(p);
  }
  return [
    ...agrupar(petalas, 10, total, false),
    ...agrupar(folhagem, 4, total, false),
    ...agrupar(resto, 8, total, true),
  ];
}

/**
 * As cores que o «Fazer proposta» SUGERE para ela trocar uma da paleta: as
 * da paleta automática primeiro, e depois as outras cores com presença nas
 * fotografias — até `quantas`, nenhuma parecida com outra.
 */
export function sugestoes(pontos: readonly Ponto[], quantas = 12): string[] {
  const grupos = agruparPorFamilias(pontos);
  const ja = escolherDosGrupos(grupos, QUANTAS);
  const vistas: Lab[] = ja.map((h) => paraOklab(deHex(h)));
  const resto = [...grupos]
    .filter((g) => g.peso >= 0.003)
    .map((g) => ({ ...g, ordem: g.base ? g.peso : Math.sqrt(g.peso) * (croma(g.cor) / 0.08) }))
    .sort((a, b) => b.ordem - a.ordem);
  const mais: string[] = [];
  for (const g of resto) {
    if (ja.length + mais.length >= quantas) break;
    if (vistas.some((v) => distancia(v, g.cor) < PARECIDAS * 0.6)) continue;
    vistas.push(g.cor);
    mais.push(hex(deOklab(g.cor)));
  }
  return [...ja, ...mais];
}

/** `#RRGGBB` → [r, g, b]. */
export function deHex(h: string): Rgb {
  const n = Number.parseInt(h.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Uma cor escrita como `#RRGGBB` (o que o documento aceita). */
export const eHex = (h: unknown): h is string =>
  typeof h === "string" && /^#[0-9A-Fa-f]{6}$/.test(h);

/** `deFundo`: a cor está sobretudo à volta (parede, céu) — nunca entra só para encher. */
type Grupo = { cor: Lab; peso: number; bruto: number; base: boolean; deFundo: boolean };

/** O k-médias (passos 5 e 6): os grupos de cor, cada um com a sua cor real e o peso. */
function agrupar(
  pontos: readonly Ponto[],
  k: number,
  /** O peso de TODAS as fotografias: os pesos dos grupos são partes dele. */
  total: number,
  base: boolean,
): Grupo[] {
  if (!pontos.length || !total) return [];
  const centros = inicio(pontos, Math.min(k, pontos.length));
  let donos = new Int32Array(pontos.length);
  for (let volta = 0; volta < 16; volta++) {
    const novos = new Int32Array(pontos.length);
    let mudou = false;
    pontos.forEach((p, i) => {
      let melhor = 0;
      let d = Infinity;
      centros.forEach((c, j) => {
        const e = distancia(p.lab, c);
        if (e < d) {
          d = e;
          melhor = j;
        }
      });
      novos[i] = melhor;
      if (volta === 0 || novos[i] !== donos[i]) mudou = true;
    });
    donos = novos;
    centros.forEach((_, j) => {
      let s = 0;
      const soma = [0, 0, 0];
      pontos.forEach((p, i) => {
        if (donos[i] !== j) return;
        s += p.peso;
        soma[0] += p.lab[0] * p.peso;
        soma[1] += p.lab[1] * p.peso;
        soma[2] += p.lab[2] * p.peso;
      });
      if (s) centros[j] = [soma[0] / s, soma[1] / s, soma[2] / s];
    });
    if (!mudou) break;
  }

  const grupos = centros
    .map((_, j) => {
      const meus = pontos.filter((_, i) => donos[i] === j);
      const bruto = meus.reduce((s, p) => s + p.peso, 0);
      // Uma cor que vive no ALTO das fotografias — o céu, o tecto, a parede —
      // não é da mesa: o peso desce com a altura média a que está.
      const alto = bruto ? meus.reduce((s, p) => s + p.y * p.peso, 0) / bruto : 0.6;
      // A família decide (`agruparPorFamilias`): uma pétala pálida é pétala.
      // E uma cor com COR que enche os bordos de cima e dos lados — uma
      // parede pintada, o céu, um pano de fundo — é o que está à volta da
      // mesa, e não em cima dela. As flores raramente tocam no bordo.
      const borda = bruto ? meus.reduce((s, p) => s + p.borda * p.peso, 0) / bruto : 0;
      const fundo = base ? 1 : Math.min(1, Math.max(0.08, 1 - (borda - 0.1) * 5));
      const daAltura = Math.min(1, Math.max(0.1, (alto - 0.25) / 0.3));
      const peso = (bruto / total) * daAltura * fundo;
      const deFundo = fundo * daAltura < 0.35;
      return { cor: tipica(meus, base ? 0.5 : 0.7), peso, bruto: bruto / total, base, deFundo };
    })
    .filter((g): g is Grupo => !!g.cor && g.peso > 0);
  return grupos;
}

/**
 * A escolha (passo 7), como um florista a faria — as PÉTALAS mandam (13/11:
 * «quero é que as paletas tenham a ver com a cor das flores»):
 *
 *   1. até três cores de pétala, de tons DIFERENTES (dois laranjas não fazem
 *      paleta; um laranja e um rosa sim), pela presença e pela intensidade;
 *   2. uma folhagem, se a houver;
 *   3. uma base — o linho, a toalha, as flores brancas;
 *   4. se ainda houver lugar: mais pétalas, depois mais bases, depois o resto.
 *
 * Da mais clara para a mais escura no fim, como no exemplo. Se as fotografias
 * não tiverem cores para cinco, a paleta fica mais curta — não se inventam.
 */
function escolherDosGrupos(grupos: readonly Grupo[], quantas: number): string[] {
  // O que é de FUNDO (a parede, o céu) não entra — nem os tons da mesma
  // família, que são a mesma parede com outra luz.
  // Só um fundo a sério (1 % das fotografias, pelo menos) afasta a sua
  // família: um pedaço de céu entre as folhas não apaga as flores lilases.
  const fundos = grupos.filter((g) => g.deFundo && !g.base && g.bruto >= 0.01).map((g) => g.cor);
  const naoEFundo = (g: Grupo) =>
    g.base ||
    (!g.deFundo &&
      !fundos.some(
        (f) =>
          // As árvores ao fundo não apagam as folhas que estão na mesa: são o
          // mesmo verde, e a árvore já fica de fora por ser de fundo.
          !(eFolhagem(f) && eFolhagem(g.cor)) &&
          (distancia(f, g.cor) < 0.06 ||
            (diferencaDeTom(f, g.cor) < 25 && Math.abs(f[0] - g.cor[0]) < 0.25)),
      ));
  const saliencia = (g: Grupo) => Math.sqrt(g.peso) * Math.min(2, croma(g.cor) / 0.08);
  const porSaliencia = (l: Grupo[]) => [...l].sort((a, b) => saliencia(b) - saliencia(a));

  // Uma pétala precisa de ser vista: 0,4 % do peso, e pelo menos um oitavo
  // da força da flor principal. Menos do que isso é um reflexo, uma etiqueta.
  const petalas = porSaliencia(
    grupos.filter((g) => !g.base && !eFolhagem(g.cor) && g.peso >= 0.004 && naoEFundo(g)),
  );
  const maisForte = petalas.length ? saliencia(petalas[0]) : 0;
  const boasPetalas = petalas.filter((g) => saliencia(g) >= maisForte / 8);
  const folhas = porSaliencia(
    grupos.filter((g) => !g.base && eFolhagem(g.cor) && g.peso >= 0.006 && naoEFundo(g)),
  );
  const bases = grupos.filter((g) => g.base && g.peso >= 0.01).sort((a, b) => b.peso - a.peso);

  const escolhidas: Lab[] = [];
  const distinta = (cor: Lab) =>
    escolhidas.every((e) => distancia(e, cor) >= PARECIDAS && !mesmoTom(e, cor));
  const juntar = (l: readonly Grupo[], ate: number) => {
    for (const g of l) {
      if (escolhidas.length >= Math.min(ate, quantas)) return;
      if (distinta(g.cor)) escolhidas.push(g.cor);
    }
  };
  juntar(boasPetalas, 3);
  juntar(folhas.slice(0, 1), escolhidas.length + 1);
  juntar(bases.slice(0, MAX_NEUTRAS), escolhidas.length + 1);
  juntar(boasPetalas, quantas);
  juntar(bases.slice(0, MAX_NEUTRAS), quantas);
  // Fotografias com poucas flores (uma sala, um jardim): o que lá está, pela
  // ordem — mais bases, mais folhagem, as pétalas mais fracas.
  juntar(bases, quantas);
  juntar(folhas, quantas);
  juntar(petalas, quantas);
  return escolhidas.sort((a, b) => b[0] - a[0]).map((c) => hex(deOklab(c)));
}

/**
 * Uma cor de BASE: neutra (creme, cinzento), ou terrosa (bege, linho,
 * madeira, sombra) — o que está por baixo e à volta das flores.
 */
function eBase(c: Lab): boolean {
  const k = croma(c);
  if (k < NEUTRA) return true;
  // Terroso: pouco intenso e QUENTE (de 20° a 110°) — o bege do linho, a
  // madeira, a pedra, a sombra. Um lilás ou um azul acinzentados, com a
  // mesma intensidade, são cor de guardanapo ou de flor, e contam como
  // destaque.
  const tom = tomDe(c);
  return (k < 0.07 && tom > 20 && tom < 110) || eTerroso(c);
}

/**
 * Duas cores com cor a sério no mesmo tom (menos de 35° de diferença) e
 * claridade parecida contam como a mesma cor (um vermelho e um bordeaux são
 * duas flores e ficam as duas): dois castanhos-
 * -alaranjados não fazem uma paleta — e o lugar que ocupavam passa a uma flor
 * de outra cor.
 */
function mesmoTom(x: Lab, y: Lab): boolean {
  if (croma(x) < 0.06 || croma(y) < 0.06) return false;
  const h = Math.abs(Math.atan2(x[2], x[1]) - Math.atan2(y[2], y[1]));
  const dh = Math.min(h, 2 * Math.PI - h);
  return dh < (35 * Math.PI) / 180 && Math.abs(x[0] - y[0]) < 0.14;
}

/**
 * O início do k-médias, sem sorteio: o primeiro centro é o ponto mais pesado;
 * cada um dos seguintes é o que está mais longe dos que já há, pesado pelo
 * peso que tem (o «k-médias++» sem dados).
 */
function inicio(pontos: readonly Ponto[], k: number): Lab[] {
  const centros: Lab[] = [pontos.reduce((m, p) => (p.peso > m.peso ? p : m)).lab];
  const longe = pontos.map((p) => distancia(p.lab, centros[0]));
  while (centros.length < k) {
    let melhor = -1;
    let valor = -1;
    pontos.forEach((p, i) => {
      const v = longe[i] * longe[i] * p.peso;
      if (v > valor) {
        valor = v;
        melhor = i;
      }
    });
    if (melhor < 0 || valor <= 0) break;
    const c = pontos[melhor].lab;
    centros.push(c);
    pontos.forEach((p, i) => {
      longe[i] = Math.min(longe[i], distancia(p.lab, c));
    });
  }
  return centros;
}

/**
 * A cor que representa um grupo (passo 6): uma cor que EXISTE nas fotografias.
 *
 * O alvo é o «típico» do grupo — a claridade e a intensidade medianas (pelo
 * peso), no tom médio do grupo —, e escolhe-se o píxel real mais perto dele.
 * A média simples fazia o contrário: num grupo de rosas claras e escuras dava
 * uma rosa mais cinzenta do que qualquer uma das duas, porque tons diferentes
 * somados anulam-se e a cor perde intensidade.
 */
function tipica(meus: readonly Ponto[], quantilDaCroma: number): Lab | null {
  if (!meus.length) return null;
  const mediana = (valor: (p: Ponto) => number, q = 0.5) => {
    const ord = [...meus].sort((a, b) => valor(a) - valor(b));
    const metade = ord.reduce((s, p) => s + p.peso, 0) * q;
    let acc = 0;
    for (const p of ord) {
      acc += p.peso;
      if (acc >= metade) return valor(p);
    }
    return valor(ord[ord.length - 1]);
  };
  const L = mediana((p) => p.lab[0]);
  const C = mediana((p) => croma(p.lab), quantilDaCroma);
  // O tom: a direção média (pesada pela intensidade de cada um, que um quase
  // cinzento não tem tom que se diga).
  let sa = 0;
  let sb = 0;
  for (const p of meus) {
    sa += p.lab[1] * p.peso;
    sb += p.lab[2] * p.peso;
  }
  const n = Math.hypot(sa, sb) || 1;
  const alvo: Lab = [L, (sa / n) * C, (sb / n) * C];
  return meus.reduce((m, p) => (distancia(p.lab, alvo) < distancia(m.lab, alvo) ? p : m)).lab;
}

export const hex = (c: Rgb) =>
  `#${c
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
