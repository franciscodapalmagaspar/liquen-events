/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MAPA DE MESAS — AS REGRAS, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10), com a captura de um «Mapa de Mesas»: «de acordo com a
 * disposição que o cliente ou que nós colaboradores queremos colocar, fazia-se
 * um visual e nós conseguíamos adaptar ao número de lugares e colocar cada
 * pessoa… e depois que desse para imprimir… interativo, que desse para mexer as
 * cadeiras, as mesas». E sobre as famílias: «uma família pode ter mais que 4
 * lugares. Deixa o sistema super inteligente e adaptável a cada contexto».
 *
 * Tudo o que o ecrã (`MapaDeMesas.tsx`), a vista em lista e o PDF precisam de
 * saber vive aqui, sem React e sem rede: as cadeiras de cada forma, quem está
 * por sentar, sentar um grupo inteiro, sentar automaticamente, as contas. Os
 * três sítios lêem as MESMAS funções — o PDF não pode desenhar uma cadeira onde
 * o ecrã não a mostrou.
 *
 * ── AS MEDIDAS SÃO DA SALA, EM CENTÍMETROS ────────────────────────────────
 * Uma mesa redonda de 8 tem ~150 cm, uma cadeira ~45 cm. O ecrã e o PDF
 * escalam isto para o espaço que têm; os dados nunca sabem de píxeis.
 *
 * ── AS PESSOAS VÊM DA LISTA DE CONVIDADOS DO PEDIDO ───────────────────────
 * Uma linha da lista (`Guest`) é uma pessoa ou um grupo («Família Silva · 7»).
 * Um grupo de N pessoas tem N lugares — «Silva 1/7»… «Silva 7/7» —, seja qual
 * for o N; em cada lugar pode escrever-se o nome da pessoa. Os recusados não
 * entram. O mapa guarda só quem está onde (`lugares`): se a lista mudar, o
 * mapa acompanha-a em `reconciliar`, sem perder ninguém em silêncio.
 */
import type { Guest } from "./types";

export type FormaDaMesa = "redonda" | "comprida" | "quadrada";
export type TipoDeElemento = "noivos" | "pista" | "palco" | "buffet" | "bar" | "outro";

export interface Mesa {
  id: string;
  nome: string;
  forma: FormaDaMesa;
  /** Centro da mesa, em cm de sala. */
  x: number;
  y: number;
  /** Comprida e quadrada: deitada (false) ou ao alto (true). */
  rodada?: boolean;
  lugares: number;
}

export interface Elemento {
  id: string;
  tipo: TipoDeElemento;
  nome: string;
  /** Centro, em cm de sala. */
  x: number;
  y: number;
  largura: number;
  altura: number;
}

/** Quem está sentado num lugar. `n` é a pessoa do grupo (1…party). */
export interface Ocupante {
  convidadoId: string;
  n: number;
  /** O nome desta pessoa, quando se sabe — senão mostra-se o do grupo. */
  nome?: string;
}

export interface MapaDeMesas {
  versao: 1;
  mesas: Mesa[];
  elementos: Elemento[];
  /** `«mesaId:lugar»` (lugar a contar de 0) → quem lá está. */
  lugares: Record<string, Ocupante>;
}

/** Uma pessoa da lista, já desdobrada do seu grupo. */
export interface Pessoa {
  convidadoId: string;
  n: number;
  /** Quantas pessoas tem o grupo dela. */
  de: number;
  grupo: string;
  rsvp: Guest["rsvp"];
}

export const TECTOS = { mesas: 150, lugaresPorMesa: 40, elementos: 40 } as const;
export const GRELHA = 10;
/** Diâmetro desenhado de uma cadeira, em cm. */
export const CADEIRA = 44;
/** O que cada lugar ocupa à volta da mesa, em cm. */
const POR_LUGAR = 62;

export const ROTULO_DA_FORMA: Record<FormaDaMesa, string> = {
  redonda: "Redonda",
  comprida: "Comprida",
  quadrada: "Quadrada",
};

export const ELEMENTOS: Record<TipoDeElemento, { nome: string; largura: number; altura: number }> =
  {
    noivos: { nome: "Mesa dos noivos", largura: 320, altura: 90 },
    pista: { nome: "Pista de dança", largura: 500, altura: 400 },
    palco: { nome: "Palco", largura: 400, altura: 200 },
    buffet: { nome: "Buffet", largura: 300, altura: 90 },
    bar: { nome: "Bar", largura: 240, altura: 80 },
    outro: { nome: "Elemento", largura: 200, altura: 120 },
  };

export function mapaVazio(): MapaDeMesas {
  return { versao: 1, mesas: [], elementos: [], lugares: {} };
}

export const chaveDoLugar = (mesaId: string, lugar: number) => `${mesaId}:${lugar}`;

export function lerChave(chave: string): { mesaId: string; lugar: number } {
  const i = chave.lastIndexOf(":");
  return { mesaId: chave.slice(0, i), lugar: Number(chave.slice(i + 1)) };
}

const ajustar = (v: number) => Math.round(v / GRELHA) * GRELHA;
const limitar = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

// ─── GEOMETRIA ──────────────────────────────────────────────────────────────

/**
 * O tamanho da mesa cresce com os lugares: uma redonda de 12 não é uma de 8
 * com mais cadeiras apertadas, e uma comprida de 20 é mais comprida.
 */
export function dimensoes(mesa: Pick<Mesa, "forma" | "lugares" | "rodada">): {
  largura: number;
  altura: number;
} {
  const n = Math.max(1, mesa.lugares);
  if (mesa.forma === "redonda") {
    const d = Math.max(90, Math.round((n * POR_LUGAR) / Math.PI));
    return { largura: d, altura: d };
  }
  if (mesa.forma === "quadrada") {
    const lado = Math.max(90, Math.ceil(n / 4) * POR_LUGAR);
    return { largura: lado, altura: lado };
  }
  const comprimento = Math.max(120, Math.ceil(n / 2) * POR_LUGAR);
  const fundo = 90;
  return mesa.rodada
    ? { largura: fundo, altura: comprimento }
    : { largura: comprimento, altura: fundo };
}

/**
 * Onde fica cada cadeira, em cm de sala, pela ordem dos lugares (0, 1, …).
 * Redonda: à volta, a começar em cima. Comprida: os lugares pares de um lado e
 * os ímpares do outro, frente a frente. Quadrada: pelos quatro lados, à vez.
 */
export function cadeiras(mesa: Mesa): { lugar: number; x: number; y: number }[] {
  const { largura, altura } = dimensoes(mesa);
  const n = Math.max(0, mesa.lugares);
  const folga = CADEIRA / 2 + 6;
  const saida: { lugar: number; x: number; y: number }[] = [];
  if (mesa.forma === "redonda") {
    const r = largura / 2 + folga;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      saida.push({ lugar: i, x: mesa.x + r * Math.cos(a), y: mesa.y + r * Math.sin(a) });
    }
    return saida;
  }
  if (mesa.forma === "comprida") {
    const porLado = Math.ceil(n / 2);
    const comprimento = mesa.rodada ? altura : largura;
    const fundo = mesa.rodada ? largura : altura;
    for (let i = 0; i < n; i++) {
      const lado = i % 2 === 0 ? -1 : 1;
      const k = Math.floor(i / 2);
      const noLado = lado < 0 ? porLado : n - porLado;
      const passo = comprimento / Math.max(1, noLado);
      const ao = -comprimento / 2 + passo * (k + 0.5);
      const fora = lado * (fundo / 2 + folga);
      saida.push(
        mesa.rodada
          ? { lugar: i, x: mesa.x + fora, y: mesa.y + ao }
          : { lugar: i, x: mesa.x + ao, y: mesa.y + fora },
      );
    }
    return saida;
  }
  // Quadrada: cima, direita, baixo, esquerda, à vez.
  const porLado = [0, 0, 0, 0];
  for (let i = 0; i < n; i++) porLado[i % 4]++;
  const visto = [0, 0, 0, 0];
  const lado = largura;
  for (let i = 0; i < n; i++) {
    const s = i % 4;
    const k = visto[s]++;
    const passo = lado / porLado[s];
    const ao = -lado / 2 + passo * (k + 0.5);
    const fora = lado / 2 + folga;
    const [dx, dy] =
      s === 0 ? [ao, -fora] : s === 1 ? [fora, ao] : s === 2 ? [-ao, fora] : [-fora, -ao];
    saida.push({ lugar: i, x: mesa.x + dx, y: mesa.y + dy });
  }
  return saida;
}

/**
 * A caixa que contém tudo, com margem — é a sala que o ecrã e o PDF mostram.
 *
 * Encaixa no que EXISTE: medido a 390 px, uma caixa mínima de 12 × 8 m deixava
 * três mesas a ocupar um canto do ecrã, com cadeiras de 13 px. Só uma sala
 * vazia tem um tamanho por omissão — o de uma sala pequena, para a primeira
 * mesa não nascer gigante.
 */
export function caixaDaSala(mapa: MapaDeMesas): {
  x: number;
  y: number;
  largura: number;
  altura: number;
} {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const m of mapa.mesas) {
    const { largura, altura } = dimensoes(m);
    const meio = Math.max(largura, altura) / 2 + CADEIRA + 10;
    x0 = Math.min(x0, m.x - meio);
    y0 = Math.min(y0, m.y - meio);
    x1 = Math.max(x1, m.x + meio);
    y1 = Math.max(y1, m.y + meio);
  }
  for (const e of mapa.elementos) {
    x0 = Math.min(x0, e.x - e.largura / 2);
    y0 = Math.min(y0, e.y - e.altura / 2);
    x1 = Math.max(x1, e.x + e.largura / 2);
    y1 = Math.max(y1, e.y + e.altura / 2);
  }
  if (!Number.isFinite(x0)) {
    x0 = 0;
    y0 = 0;
    x1 = 1200;
    y1 = 800;
  }
  // Nunca mais estreita do que uma mesa com folga, para uma mesa sozinha não
  // encher o ecrã de ponta a ponta.
  const minimo = 500;
  if (x1 - x0 < minimo) {
    const c = (x0 + x1) / 2;
    x0 = c - minimo / 2;
    x1 = c + minimo / 2;
  }
  if (y1 - y0 < minimo * 0.6) {
    const c = (y0 + y1) / 2;
    y0 = c - minimo * 0.3;
    y1 = c + minimo * 0.3;
  }
  const m = 60;
  return { x: x0 - m, y: y0 - m, largura: x1 - x0 + 2 * m, altura: y1 - y0 + 2 * m };
}

/**
 * A sala com pelo menos `largura` × `altura` cm, crescida à volta do centro.
 *
 * Pedido dela (14/10): «quando adicionamos pela primeira vez uma mesa fica
 * estranho porque a mesa fica enorme para o espaço super pequeno… coloca como
 * predefinido já um espaço grande». A caixa continua a encaixar no que existe
 * (`caixaDaSala`); quem a desenha é que decide o tamanho mínimo da sala que
 * se vê, pela escala máxima a que uma mesa pode aparecer — no ecrã, pelo
 * tamanho do quadro; no PDF, pelo da folha.
 */
/**
 * A caixa que contém as duas. É o que faz a sala do ecrã ficar PARADA: um chão
 * fixo, ancorado no canto (0,0) onde as mesas novas nascem (`sitioLivre`),
 * unido ao que existe. Pôr ou mover uma mesa lá dentro não muda nada; só uma
 * mesa levada para fora o faz crescer, e para o lado dela (14/10, no site:
 * «cada vez que eu adiciono uma mesa, a sala aumenta… não dá para arrastar»).
 */
export function unirCaixas<C extends { x: number; y: number; largura: number; altura: number }>(
  a: C,
  b: { x: number; y: number; largura: number; altura: number },
): C {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x1 = Math.max(a.x + a.largura, b.x + b.largura);
  const y1 = Math.max(a.y + a.altura, b.y + b.altura);
  if (x === a.x && y === a.y && x1 === a.x + a.largura && y1 === a.y + a.altura) return a;
  return { ...a, x, y, largura: x1 - x, altura: y1 - y };
}

/** O chão por omissão, a partir do canto onde as mesas nascem: 12 × 8 m. */
export const SALA_MINIMA = { largura: 1200, altura: 800 };

export function alargarSala<C extends { x: number; y: number; largura: number; altura: number }>(
  caixa: C,
  largura: number,
  altura: number,
): C {
  const w = Math.max(caixa.largura, largura);
  const h = Math.max(caixa.altura, altura);
  if (w === caixa.largura && h === caixa.altura) return caixa;
  return {
    ...caixa,
    x: caixa.x - (w - caixa.largura) / 2,
    y: caixa.y - (h - caixa.altura) / 2,
    largura: w,
    altura: h,
  };
}

// ─── AS PESSOAS ─────────────────────────────────────────────────────────────

/** Toda a gente da lista, desdobrada, sem os recusados. */
export function pessoasDaLista(lista: readonly Guest[] | undefined): Pessoa[] {
  const saida: Pessoa[] = [];
  for (const g of lista ?? []) {
    if (g.rsvp === "recusado") continue;
    const de = Math.max(1, Math.floor(g.party || 1));
    for (let n = 1; n <= de; n++) {
      saida.push({ convidadoId: g.id, n, de, grupo: g.name, rsvp: g.rsvp });
    }
  }
  return saida;
}

/** O nome que o lugar mostra: o da pessoa, se o escreveram; senão o do grupo. */
export function nomeDoLugar(oc: Ocupante, lista: readonly Guest[] | undefined): string {
  if (oc.nome?.trim()) return oc.nome.trim();
  const g = (lista ?? []).find((x) => x.id === oc.convidadoId);
  if (!g) return "—";
  const de = Math.max(1, g.party || 1);
  return de > 1 ? `${g.name} ${oc.n}/${de}` : g.name;
}

/**
 * As letras da cadeira (a captura dela: «MA», «JO»). Duas letras: a primeira
 * do primeiro e do último nome, ou as duas primeiras de um nome só. «Família»
 * e companhia não contam — «Família Silva» é «SI».
 */
export function iniciais(nome: string): string {
  const palavras = nome
    .replace(/\d+\/\d+$/, "")
    .split(/[\s&,+]+/)
    .map((p) => p.trim())
    .filter(
      (p) => p && !/^(fam[ií]lia|fam\.|sr\.?|sra\.?|dr\.?|dra\.?|e|de|da|do|dos|das)$/i.test(p),
    );
  if (palavras.length === 0) return "?";
  if (palavras.length === 1) return palavras[0].slice(0, 2).toUpperCase();
  return (palavras[0][0] + palavras[palavras.length - 1][0]).toUpperCase();
}

const mesmaPessoa = (
  a: Pick<Ocupante, "convidadoId" | "n">,
  b: Pick<Ocupante, "convidadoId" | "n">,
) => a.convidadoId === b.convidadoId && a.n === b.n;

/** Onde está sentada esta pessoa (a chave do lugar), ou `null`. */
export function ondeEsta(mapa: MapaDeMesas, p: Pick<Ocupante, "convidadoId" | "n">): string | null {
  for (const [chave, oc] of Object.entries(mapa.lugares)) if (mesmaPessoa(oc, p)) return chave;
  return null;
}

/**
 * O mapa acompanha a lista de convidados. Fica livre o lugar de quem saiu da
 * lista, de quem passou a recusado, de quem já não cabe no grupo (o grupo
 * encolheu) e de uma mesa que já não existe ou que tem menos lugares. Quem
 * entrou de novo (ou o grupo que cresceu) aparece por sentar.
 *
 * Devolve o MESMO objecto quando não há nada a mudar — para quem chama não
 * gravar à toa.
 */
export function reconciliar(mapa: MapaDeMesas, lista: readonly Guest[] | undefined): MapaDeMesas {
  const porId = new Map((lista ?? []).map((g) => [g.id, g]));
  const mesas = new Map(mapa.mesas.map((m) => [m.id, m]));
  const vistos = new Set<string>();
  const lugares: Record<string, Ocupante> = {};
  let mudou = false;
  for (const [chave, oc] of Object.entries(mapa.lugares)) {
    const g = porId.get(oc.convidadoId);
    const { mesaId, lugar } = lerChave(chave);
    const mesa = mesas.get(mesaId);
    const pessoa = `${oc.convidadoId}#${oc.n}`;
    const valido =
      g &&
      g.rsvp !== "recusado" &&
      oc.n >= 1 &&
      oc.n <= Math.max(1, g.party || 1) &&
      mesa &&
      lugar >= 0 &&
      lugar < mesa.lugares &&
      !vistos.has(pessoa);
    if (valido) {
      lugares[chave] = oc;
      vistos.add(pessoa);
    } else mudou = true;
  }
  return mudou ? { ...mapa, lugares } : mapa;
}

/** Quem está por sentar, pela ordem da lista. */
export function porSentar(mapa: MapaDeMesas, lista: readonly Guest[] | undefined): Pessoa[] {
  const sentados = new Set(Object.values(mapa.lugares).map((o) => `${o.convidadoId}#${o.n}`));
  return pessoasDaLista(lista).filter((p) => !sentados.has(`${p.convidadoId}#${p.n}`));
}

export function contas(mapa: MapaDeMesas, lista: readonly Guest[] | undefined) {
  const pessoas = pessoasDaLista(lista);
  const sentados = Object.keys(reconciliar(mapa, lista).lugares).length;
  const lugares = mapa.mesas.reduce((s, m) => s + m.lugares, 0);
  return { sentados, total: pessoas.length, lugares, livres: lugares - sentados };
}

/** Os lugares livres desta mesa, pela ordem. */
export function livresDaMesa(mapa: MapaDeMesas, mesa: Mesa): number[] {
  const saida: number[] = [];
  for (let i = 0; i < mesa.lugares; i++) if (!mapa.lugares[chaveDoLugar(mesa.id, i)]) saida.push(i);
  return saida;
}

// ─── SENTAR ─────────────────────────────────────────────────────────────────

/**
 * Sentar UMA pessoa num lugar. Se ela já estava sentada, muda de lugar. Se o
 * lugar estava ocupado, os dois trocam — quem lá estava vai para o lugar de
 * onde ela veio, ou fica por sentar se ela vinha da lista de espera.
 */
export function sentar(
  mapa: MapaDeMesas,
  chave: string,
  pessoa: Pick<Ocupante, "convidadoId" | "n">,
): MapaDeMesas {
  const lugares = { ...mapa.lugares };
  const deOnde = ondeEsta(mapa, pessoa);
  if (deOnde === chave) return mapa;
  const quemLaEsta = lugares[chave];
  const ela: Ocupante = deOnde ? lugares[deOnde] : { convidadoId: pessoa.convidadoId, n: pessoa.n };
  if (deOnde) delete lugares[deOnde];
  if (quemLaEsta && deOnde) lugares[deOnde] = quemLaEsta;
  lugares[chave] = ela;
  return { ...mapa, lugares };
}

export function levantar(mapa: MapaDeMesas, chave: string): MapaDeMesas {
  if (!mapa.lugares[chave]) return mapa;
  const lugares = { ...mapa.lugares };
  delete lugares[chave];
  return { ...mapa, lugares };
}

export function nomearLugar(mapa: MapaDeMesas, chave: string, nome: string): MapaDeMesas {
  const oc = mapa.lugares[chave];
  if (!oc) return mapa;
  const limpo = nome.trim().slice(0, 120);
  const novo: Ocupante = limpo ? { ...oc, nome: limpo } : { convidadoId: oc.convidadoId, n: oc.n };
  return { ...mapa, lugares: { ...mapa.lugares, [chave]: novo } };
}

/**
 * Sentar um GRUPO numa mesa: quem do grupo ainda está por sentar ocupa os
 * lugares livres da mesa, seguidos, a começar em `aPartirDe` (o lugar onde ela
 * tocou) ou no primeiro livre. Devolve também quantos ficaram de fora — é com
 * esse número que o ecrã oferece as duas saídas: acrescentar lugares, ou
 * sentar o resto na mesa mais próxima com lugar.
 */
export function sentarGrupo(
  mapa: MapaDeMesas,
  lista: readonly Guest[] | undefined,
  convidadoId: string,
  mesaId: string,
  aPartirDe?: number,
): { mapa: MapaDeMesas; ficaram: number } {
  const mesa = mapa.mesas.find((m) => m.id === mesaId);
  const aSentar = porSentar(mapa, lista).filter((p) => p.convidadoId === convidadoId);
  if (!mesa || aSentar.length === 0) return { mapa, ficaram: aSentar.length };
  const livres = livresDaMesa(mapa, mesa);
  const inicio = aPartirDe !== undefined ? Math.max(0, livres.indexOf(aPartirDe)) : 0;
  const ordem = [...livres.slice(inicio), ...livres.slice(0, inicio)];
  const lugares = { ...mapa.lugares };
  let i = 0;
  for (; i < aSentar.length && i < ordem.length; i++) {
    lugares[chaveDoLugar(mesa.id, ordem[i])] = { convidadoId, n: aSentar[i].n };
  }
  return { mapa: { ...mapa, lugares }, ficaram: aSentar.length - i };
}

/** Mais lugares numa mesa, até ao tecto. Devolve quantos acrescentou. */
export function acrescentarLugares(
  mapa: MapaDeMesas,
  mesaId: string,
  quantos: number,
): { mapa: MapaDeMesas; acrescentados: number } {
  const mesa = mapa.mesas.find((m) => m.id === mesaId);
  if (!mesa) return { mapa, acrescentados: 0 };
  const novos = limitar(mesa.lugares + quantos, 1, TECTOS.lugaresPorMesa);
  return {
    mapa: mudarMesa(mapa, mesaId, { lugares: novos }),
    acrescentados: novos - mesa.lugares,
  };
}

/** A mesa com lugar mais próxima desta (para o resto de um grupo que não coube). */
export function maisProximaComLugar(mapa: MapaDeMesas, mesaId: string): Mesa | null {
  const daqui = mapa.mesas.find((m) => m.id === mesaId);
  if (!daqui) return null;
  let melhor: Mesa | null = null;
  let dist = Infinity;
  for (const m of mapa.mesas) {
    if (m.id === mesaId || livresDaMesa(mapa, m).length === 0) continue;
    const d = Math.hypot(m.x - daqui.x, m.y - daqui.y);
    if (d < dist) {
      dist = d;
      melhor = m;
    }
  }
  return melhor;
}

/**
 * Sentar o resto de um grupo que não coube: mesa a mesa, pela mais próxima,
 * até não sobrar ninguém ou não haver lugar.
 */
export function sentarResto(
  mapa: MapaDeMesas,
  lista: readonly Guest[] | undefined,
  convidadoId: string,
  mesaId: string,
): { mapa: MapaDeMesas; ficaram: number } {
  let atual = mapa;
  let ficaram = porSentar(atual, lista).filter((p) => p.convidadoId === convidadoId).length;
  let origem = mesaId;
  while (ficaram > 0) {
    const proxima = maisProximaComLugar(atual, origem);
    if (!proxima) break;
    const r = sentarGrupo(atual, lista, convidadoId, proxima.id);
    atual = r.mapa;
    ficaram = r.ficaram;
    origem = proxima.id;
  }
  return { mapa: atual, ficaram };
}

/**
 * «Sentar automaticamente». Os grupos por sentar, do maior para o menor (os
 * confirmados primeiro), vão para a mesa onde cabem INTEIROS com menos folga;
 * só se nenhuma mesa os levar inteiros é que se partem, pelas que têm mais
 * lugares livres. Nunca mexe em quem já está sentado — só preenche o que está
 * livre — e por isso pode correr as vezes que for preciso.
 */
export function sentarAutomaticamente(
  mapa: MapaDeMesas,
  lista: readonly Guest[] | undefined,
): { mapa: MapaDeMesas; sentados: number } {
  let atual = reconciliar(mapa, lista);
  const grupos = new Map<string, Pessoa[]>();
  for (const p of porSentar(atual, lista)) {
    const g = grupos.get(p.convidadoId) ?? [];
    g.push(p);
    grupos.set(p.convidadoId, g);
  }
  const ordem = [...grupos.values()].sort(
    (a, b) =>
      Number(b[0].rsvp === "confirmado") - Number(a[0].rsvp === "confirmado") ||
      b.length - a.length,
  );
  let sentados = 0;
  for (const g of ordem) {
    const id = g[0].convidadoId;
    const livres = atual.mesas.map((m) => ({ m, livres: livresDaMesa(atual, m).length }));
    const cabe = livres.filter((x) => x.livres >= g.length).sort((a, b) => a.livres - b.livres)[0];
    if (cabe) {
      atual = sentarGrupo(atual, lista, id, cabe.m.id).mapa;
      sentados += g.length;
      continue;
    }
    let falta = g.length;
    for (const x of livres.filter((y) => y.livres > 0).sort((a, b) => b.livres - a.livres)) {
      if (falta === 0) break;
      const r = sentarGrupo(atual, lista, id, x.m.id);
      sentados += falta - r.ficaram;
      falta = r.ficaram;
      atual = r.mapa;
    }
  }
  return { mapa: atual, sentados };
}

/** Os grupos que ficaram em mais do que uma mesa — um aviso com acção. */
export function gruposPartidos(mapa: MapaDeMesas): string[] {
  const mesasDe = new Map<string, Set<string>>();
  for (const [chave, oc] of Object.entries(mapa.lugares)) {
    const s = mesasDe.get(oc.convidadoId) ?? new Set<string>();
    s.add(lerChave(chave).mesaId);
    mesasDe.set(oc.convidadoId, s);
  }
  return [...mesasDe.entries()].filter(([, s]) => s.size > 1).map(([id]) => id);
}

// ─── MESAS E ELEMENTOS ──────────────────────────────────────────────────────

function proximoNome(mapa: MapaDeMesas): string {
  const usados = new Set(
    mapa.mesas
      .map((m) => /^Mesa (\d+)$/.exec(m.nome)?.[1])
      .filter(Boolean)
      .map(Number),
  );
  let n = 1;
  while (usados.has(n)) n++;
  return `Mesa ${n}`;
}

/**
 * Um sítio livre para uma peça nova: varre a sala em linhas, da esquerda para
 * a direita, e fica no primeiro lugar onde não toca em nada. Uma mesa nova não
 * nasce por cima de outra.
 */
function sitioLivre(mapa: MapaDeMesas, largura: number, altura: number): { x: number; y: number } {
  const ocupado = [
    ...mapa.mesas.map((m) => {
      const d = dimensoes(m);
      const meio = Math.max(d.largura, d.altura) / 2 + CADEIRA;
      return { x: m.x, y: m.y, w: meio * 2, h: meio * 2 };
    }),
    ...mapa.elementos.map((e) => ({ x: e.x, y: e.y, w: e.largura, h: e.altura })),
  ];
  const w = largura + 2 * CADEIRA + 20;
  const h = altura + 2 * CADEIRA + 20;
  for (let y = h / 2 + 20; y < 6000; y += 50) {
    for (let x = w / 2 + 20; x < 1800; x += 50) {
      const toca = ocupado.some(
        (o) => Math.abs(o.x - x) < (o.w + w) / 2 && Math.abs(o.y - y) < (o.h + h) / 2,
      );
      if (!toca) return { x: ajustar(x), y: ajustar(y) };
    }
  }
  return { x: 300, y: 300 };
}

export function novaMesa(
  mapa: MapaDeMesas,
  forma: FormaDaMesa,
  id: string,
): { mapa: MapaDeMesas; mesa: Mesa | null } {
  if (mapa.mesas.length >= TECTOS.mesas) return { mapa, mesa: null };
  const lugares = forma === "comprida" ? 10 : 8;
  const d = dimensoes({ forma, lugares });
  const { x, y } = sitioLivre(mapa, d.largura, d.altura);
  const mesa: Mesa = { id, nome: proximoNome(mapa), forma, x, y, lugares };
  return { mapa: { ...mapa, mesas: [...mapa.mesas, mesa] }, mesa };
}

/**
 * Uma cópia da mesa — a forma, os lugares e a rotação, sem ninguém sentado —
 * no sítio livre mais próximo. É o gesto de quem monta vinte mesas iguais.
 */
export function duplicarMesa(
  mapa: MapaDeMesas,
  mesaId: string,
  id: string,
): { mapa: MapaDeMesas; mesa: Mesa | null } {
  const original = mapa.mesas.find((m) => m.id === mesaId);
  if (!original || mapa.mesas.length >= TECTOS.mesas) return { mapa, mesa: null };
  const d = dimensoes(original);
  const passo = Math.max(d.largura, d.altura) + 2 * CADEIRA + 40;
  const ocupado = (x: number, y: number) =>
    [...mapa.mesas, ...mapa.elementos].some((o) => {
      const od =
        "forma" in o
          ? dimensoes(o)
          : { largura: (o as Elemento).largura, altura: (o as Elemento).altura };
      const meio = (Math.max(od.largura, od.altura) + passo) / 2;
      return Math.abs(o.x - x) < meio && Math.abs(o.y - y) < meio;
    });
  // Primeiro à direita, depois em baixo, à esquerda e em cima; só depois o
  // varrimento da sala inteira.
  const candidatos = [1, 2, 3].flatMap((k) => [
    { x: original.x + passo * k, y: original.y },
    { x: original.x, y: original.y + passo * k },
    { x: original.x - passo * k, y: original.y },
    { x: original.x, y: original.y - passo * k },
  ]);
  const perto = candidatos.find((c) => c.x > 0 && c.y > 0 && !ocupado(c.x, c.y));
  const { x, y } = perto
    ? { x: ajustar(perto.x), y: ajustar(perto.y) }
    : sitioLivre(mapa, d.largura, d.altura);
  const mesa: Mesa = {
    id,
    nome: proximoNome(mapa),
    forma: original.forma,
    x,
    y,
    lugares: original.lugares,
    ...(original.rodada ? { rodada: true } : {}),
  };
  return { mapa: { ...mapa, mesas: [...mapa.mesas, mesa] }, mesa };
}

/** Quantos cm de distância ainda contam como «alinhado» ao arrastar. */
export const IMAN_CM = 14;

/**
 * As guias de alinhamento de uma peça que está a ser arrastada: se o centro
 * dela fica a menos de {@link IMAN_CM} do centro de outra (em X ou em Y),
 * encaixa nessa linha, e o ecrã desenha a guia. Devolve a posição já
 * encaixada e as linhas a desenhar.
 */
export function alinhar(
  mapa: MapaDeMesas,
  quem: { tipo: "mesa" | "elemento"; id: string },
  x: number,
  y: number,
): { x: number; y: number; guiaX: number | null; guiaY: number | null } {
  const outros = [
    ...mapa.mesas.filter((m) => !(quem.tipo === "mesa" && m.id === quem.id)),
    ...mapa.elementos.filter((e) => !(quem.tipo === "elemento" && e.id === quem.id)),
  ];
  let guiaX: number | null = null;
  let guiaY: number | null = null;
  let melhorX = IMAN_CM;
  let melhorY = IMAN_CM;
  for (const o of outros) {
    const dx = Math.abs(o.x - x);
    const dy = Math.abs(o.y - y);
    if (dx <= melhorX) {
      melhorX = dx;
      guiaX = o.x;
    }
    if (dy <= melhorY) {
      melhorY = dy;
      guiaY = o.y;
    }
  }
  return { x: guiaX ?? x, y: guiaY ?? y, guiaX, guiaY };
}

// ─── ANULAR E REFAZER ───────────────────────────────────────────────────────

/** Quantos passos se guardam para trás. */
export const PASSOS_PARA_TRAS = 50;

export interface Historico {
  /** Os mapas de antes, o mais recente no fim. */
  passado: MapaDeMesas[];
  /** Os mapas desfeitos, o mais recente no fim. */
  futuro: MapaDeMesas[];
}

export const historicoVazio = (): Historico => ({ passado: [], futuro: [] });

/** Um gesto novo: o mapa de antes vai para trás, e o que estava desfeito perde-se. */
export function registar(h: Historico, antes: MapaDeMesas): Historico {
  const passado = [...h.passado, antes];
  return { passado: passado.slice(-PASSOS_PARA_TRAS), futuro: [] };
}

export function desfazer(
  h: Historico,
  actual: MapaDeMesas,
): { historico: Historico; mapa: MapaDeMesas } | null {
  const anterior = h.passado[h.passado.length - 1];
  if (!anterior) return null;
  return {
    historico: { passado: h.passado.slice(0, -1), futuro: [...h.futuro, actual] },
    mapa: anterior,
  };
}

export function refazer(
  h: Historico,
  actual: MapaDeMesas,
): { historico: Historico; mapa: MapaDeMesas } | null {
  const seguinte = h.futuro[h.futuro.length - 1];
  if (!seguinte) return null;
  return {
    historico: { passado: [...h.passado, actual], futuro: h.futuro.slice(0, -1) },
    mapa: seguinte,
  };
}

// ─── O GESTO QUE SÓ LEVA O QUE MUDOU ─────────────────────────────────────────
//
// Anular, refazer e o «Anular» de um gesto grande repunham um MAPA INTEIRO
// (`() => antes`). Isso basta enquanto ninguém mais mexe no mapa — mas quando a
// gravação dá conflito (outra pessoa gravou entretanto) os gestos por gravar
// voltam a aplicar-se por cima do mapa dela, e um gesto «constante» devolvia o
// mapa antigo inteiro: apagava tudo o que a outra pessoa tinha feito
// (auditoria 6, n.º 17). Este é o gesto que só leva a DIFERENÇA.

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function porId<T extends { id: string }>(
  base: readonly T[],
  de: readonly T[],
  para: readonly T[],
): T[] {
  const antes = new Map(de.map((x) => [x.id, x]));
  const depois = new Map(para.map((x) => [x.id, x]));
  const mudou = new Set<string>();
  for (const id of new Set([...antes.keys(), ...depois.keys()])) {
    if (!igual(antes.get(id), depois.get(id))) mudou.add(id);
  }
  if (mudou.size === 0) return base as T[];
  const saida: T[] = [];
  const vistos = new Set<string>();
  for (const x of base) {
    vistos.add(x.id);
    if (!mudou.has(x.id)) saida.push(x);
    else if (depois.has(x.id)) saida.push(depois.get(x.id)!);
    // e se saiu em `para`, sai também daqui
  }
  for (const x of para) {
    if (mudou.has(x.id) && !vistos.has(x.id)) saida.push(x);
  }
  return saida;
}

/**
 * O gesto que leva `de` a `para`, aplicado a outro mapa qualquer: só as mesas,
 * os elementos e os lugares que mudaram entre os dois tocam no mapa de base;
 * o resto da base — o que outra pessoa fez entretanto — fica como está.
 * Aplicado ao próprio `de`, dá `para`.
 */
export function gestoDaDiferenca(
  de: MapaDeMesas,
  para: MapaDeMesas,
): (base: MapaDeMesas) => MapaDeMesas {
  return (base) => {
    const mesas = porId(base.mesas, de.mesas, para.mesas);
    const elementos = porId(base.elementos, de.elementos, para.elementos);
    let lugares = base.lugares;
    for (const k of new Set([...Object.keys(de.lugares), ...Object.keys(para.lugares)])) {
      if (igual(de.lugares[k], para.lugares[k])) continue;
      if (lugares === base.lugares) lugares = { ...base.lugares };
      if (para.lugares[k]) lugares[k] = para.lugares[k];
      else delete lugares[k];
    }
    if (mesas === base.mesas && elementos === base.elementos && lugares === base.lugares) {
      return base;
    }
    return { ...base, mesas, elementos, lugares };
  };
}

/**
 * O histórico depois de uma junção: cada mapa guardado para trás (e para a
 * frente) passa a ter também o que a outra pessoa fez. Sem isto, anular a
 * seguir a uma junção repunha um mapa de ANTES dela — e gravava-o sem conflito
 * nenhum, por cima do trabalho da outra pessoa.
 */
export function historicoDepoisDaJuncao(
  h: Historico,
  base: MapaDeMesas,
  doServidor: MapaDeMesas,
): Historico {
  const deles = gestoDaDiferenca(base, doServidor);
  return { passado: h.passado.map(deles), futuro: h.futuro.map(deles) };
}

/**
 * O nome curto que se escreve debaixo da cadeira, de perto: o primeiro nome de
 * quem foi escrito à mão («Maria»), ou o apelido do grupo com o número da
 * pessoa («Silva 2») — com as mesmas palavras que as iniciais deixam cair.
 */
export function nomeCurto(nome: string): string {
  const numero = /(\d+)\/\d+$/.exec(nome.trim())?.[1];
  const palavras = nome
    .replace(/\d+\/\d+$/, "")
    .split(/[\s&,+]+/)
    .map((p) => p.trim())
    .filter(
      (p) => p && !/^(fam[ií]lia|fam\.|sr\.?|sra\.?|dr\.?|dra\.?|e|de|da|do|dos|das)$/i.test(p),
    );
  if (palavras.length === 0) return "";
  const palavra = numero ? palavras[palavras.length - 1] : palavras[0];
  const curta = palavra.length > 10 ? `${palavra.slice(0, 9)}…` : palavra;
  return numero ? `${curta} ${numero}` : curta;
}

export function novoElemento(
  mapa: MapaDeMesas,
  tipo: TipoDeElemento,
  id: string,
): { mapa: MapaDeMesas; elemento: Elemento | null } {
  if (mapa.elementos.length >= TECTOS.elementos) return { mapa, elemento: null };
  const base = ELEMENTOS[tipo];
  const { x, y } = sitioLivre(mapa, base.largura, base.altura);
  const elemento: Elemento = {
    id,
    tipo,
    nome: base.nome,
    x,
    y,
    largura: base.largura,
    altura: base.altura,
  };
  return { mapa: { ...mapa, elementos: [...mapa.elementos, elemento] }, elemento };
}

/**
 * Mudar uma mesa. Com menos lugares, quem fica de fora volta à lista de espera
 * (e o ecrã di-lo, com «Anular»).
 */
export function mudarMesa(
  mapa: MapaDeMesas,
  mesaId: string,
  mudanca: Partial<Omit<Mesa, "id">>,
): MapaDeMesas {
  const mesas = mapa.mesas.map((m) => {
    if (m.id !== mesaId) return m;
    const nova = { ...m, ...mudanca };
    if (mudanca.lugares !== undefined)
      nova.lugares = limitar(Math.round(mudanca.lugares), 1, TECTOS.lugaresPorMesa);
    if (mudanca.x !== undefined) nova.x = ajustar(mudanca.x);
    if (mudanca.y !== undefined) nova.y = ajustar(mudanca.y);
    if (mudanca.nome !== undefined) nova.nome = mudanca.nome.slice(0, 60);
    return nova;
  });
  const lugares = { ...mapa.lugares };
  const nova = mesas.find((m) => m.id === mesaId);
  if (nova) {
    for (const chave of Object.keys(lugares)) {
      const { mesaId: id, lugar } = lerChave(chave);
      if (id === mesaId && lugar >= nova.lugares) delete lugares[chave];
    }
  }
  return { ...mapa, mesas, lugares };
}

export function apagarMesa(mapa: MapaDeMesas, mesaId: string): MapaDeMesas {
  const lugares = Object.fromEntries(
    Object.entries(mapa.lugares).filter(([chave]) => lerChave(chave).mesaId !== mesaId),
  );
  return { ...mapa, mesas: mapa.mesas.filter((m) => m.id !== mesaId), lugares };
}

export function mudarElemento(
  mapa: MapaDeMesas,
  id: string,
  mudanca: Partial<Omit<Elemento, "id" | "tipo">>,
): MapaDeMesas {
  return {
    ...mapa,
    elementos: mapa.elementos.map((e) => {
      if (e.id !== id) return e;
      const novo = { ...e, ...mudanca };
      if (mudanca.x !== undefined) novo.x = ajustar(mudanca.x);
      if (mudanca.y !== undefined) novo.y = ajustar(mudanca.y);
      if (mudanca.largura !== undefined) novo.largura = limitar(ajustar(mudanca.largura), 60, 2000);
      if (mudanca.altura !== undefined) novo.altura = limitar(ajustar(mudanca.altura), 40, 2000);
      if (mudanca.nome !== undefined) novo.nome = mudanca.nome.slice(0, 60);
      return novo;
    }),
  };
}

export function apagarElemento(mapa: MapaDeMesas, id: string): MapaDeMesas {
  return { ...mapa, elementos: mapa.elementos.filter((e) => e.id !== id) };
}

/** A ordem das mesas nas listas: «Mesa 2» antes de «Mesa 10». */
export const porNomeDaMesa = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, "pt", { numeric: true, sensitivity: "base" });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO DE CADA LUGAR — ÚNICO NA SALA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (15/10): «há mais do que uma Mariana ou mais do que uma
 * Mafalda. Nós não sabemos qual é que é naquele lugar, porque aparece só MA ou
 * MB… coloca em cada lugar, para além do nome, o número. Para depois, na lista
 * de baixo, sabermos que aquele número é para aquela pessoa.» E escolheu um
 * número ÚNICO (1, 2, 3… até ao fim da sala), e não um que recomeça em cada
 * mesa.
 *
 * As mesas pela ordem do nome (a das listas), os lugares de cada uma pela
 * ordem das cadeiras (`cadeiras`). Os livres também contam: assim o número de
 * quem está sentado não muda por alguém se sentar ao lado. O PDF e o ecrã leem
 * daqui — nunca dois números para o mesmo lugar.
 */
export function numerosDosLugares(mapa: MapaDeMesas): Map<string, number> {
  const numeros = new Map<string, number>();
  let n = 0;
  for (const mesa of [...mapa.mesas].sort(porNomeDaMesa)) {
    for (let lugar = 0; lugar < mesa.lugares; lugar++) {
      numeros.set(chaveDoLugar(mesa.id, lugar), ++n);
    }
  }
  return numeros;
}

/** As pessoas de uma mesa, pela ordem dos lugares — a lista por mesa e o PDF. */
export function quemEstaNaMesa(
  mapa: MapaDeMesas,
  mesa: Mesa,
): { lugar: number; chave: string; ocupante: Ocupante | null }[] {
  return Array.from({ length: mesa.lugares }, (_, lugar) => {
    const chave = chaveDoLugar(mesa.id, lugar);
    return { lugar, chave, ocupante: mapa.lugares[chave] ?? null };
  });
}

/** O mapa que vem do servidor pode faltar ou vir de uma versão antiga. */
export function lerMapa(valor: unknown): MapaDeMesas {
  if (!valor || typeof valor !== "object") return mapaVazio();
  const v = valor as Partial<MapaDeMesas>;
  return {
    versao: 1,
    mesas: Array.isArray(v.mesas) ? v.mesas : [],
    elementos: Array.isArray(v.elementos) ? v.elementos : [],
    lugares: v.lugares && typeof v.lugares === "object" ? v.lugares : {},
  };
}
