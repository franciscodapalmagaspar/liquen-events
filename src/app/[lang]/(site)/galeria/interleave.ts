import type { PhotoSrc } from "./photos-data";
import { collectionFor } from "./collections";
import EM_DESTAQUE_JSON from "./em-destaque.json";

/**
 * ── AS FOTOGRAFIAS EM DESTAQUE (3/11, pedido dela) ─────────────────────────
 *
 * Ela: «veem-se poucas fotos deste casamento na galeria». As 30 estavam lá,
 * mas espalhadas pelas ~900 — uma em cada trinta. Escolheu «destacar no
 * início»: as fotografias desta lista (`em-destaque.json`) ficam nas primeiras
 * filas, nos {@link LUGARES_EM_DESTAQUE} — a 2.ª da fila do topo e depois de
 * quatro em quatro, para nunca ficarem duas seguidas. A ordem ENTRE elas muda
 * com a visita (a mesma semente do resto), e o resto da galeria fica como
 * estava. Trocar as do destaque é editar o JSON.
 */
export const EM_DESTAQUE: readonly string[] = EM_DESTAQUE_JSON as string[];
export const LUGARES_EM_DESTAQUE: readonly number[] = [1, 5, 9, 13];

/**
 * Photo enriched server-side with its real aspect ratio and (for the tiles that
 * paint first) a blur placeholder. `blurDataURL` is OPTIONAL: to keep the
 * gallery's initial payload small we only ship blur data for the first screenful
 * (see galeria/page.tsx) — the rest gracefully fall back to the gallery's near-
 * black background while their image decodes. `aspectRatio` is present on every
 * photo because the masonry layout needs it up front.
 *
 * This module is deliberately framework-neutral (no "use client") so the server
 * page can compute the exact first-paint order and enrich only those photos.
 */
export interface Photo extends PhotoSrc {
  blurDataURL?: string;
  aspectRatio: string;
  /**
   * Cor média da fotografia (`#rrggbb`), gerada no build por
   * scripts/pregen-gallery.mjs para tile-colors.json. Vai em TODAS as fotos: é
   * o que garante que um mosaico à espera da imagem mostra uma cor sua e não o
   * fundo liso da página, por ~7 caracteres cada (o blur, que só vai na
   * primeira janela, custa 151 bytes cada).
   */
  color?: string;
  /**
   * O que a galeria «vê» na fotografia (gallery-meta.json, gerado no build por
   * scripts/galeria-analise.mjs). Só vem quando há — a maioria das fotos não
   * tem cena nem é a preto e branco, e não paga um byte por isso.
   *
   *  · `cena` — fotos com a mesma cena são o mesmo momento: a ordem afasta-as;
   *  · `pb` — a preto e branco: nunca duas seguidas;
   *  · `destaque` — serve para o mosaico grande do topo;
   *  · `foco` — o ponto de interesse (`"x% y%"`), para onde se recorta.
   */
  cena?: string;
  pb?: boolean;
  destaque?: boolean;
  foco?: string;
}

/**
 * O evento a que a foto pertence: o casal, quando tem nome (`collections.json`);
 * senão a PUBLICAÇÃO do Instagram de onde veio (`galeria-instagram-<n>-…`, uma
 * publicação é um casamento ou um evento); senão a categoria.
 *
 * Sem a publicação, as 436 fotos do Instagram caíam todas em «Casamento» ou
 * «Evento», e nada impedia três fotos do mesmo casamento de ficarem lado a lado.
 */
const PUBLICACAO = /\/galeria-instagram-(\d+)-/;
export function bucketKey(p: Photo): string {
  const casal = collectionFor(p.src);
  if (casal) return casal;
  const publicacao = PUBLICACAO.exec(p.src);
  return publicacao ? `ig:${publicacao[1]}` : `cat:${p.label}`;
}

// Stable per-string hash → [0,1). Deterministic (same on server + client, so
// no hydration mismatch) and independent of array position, so it seeds a
// reproducible "shuffle" without any global RNG state. FNV-1a.
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Spread photos so the grid feels genuinely shuffled — no two consecutive
 * photos from the same event, every collection appearing throughout (not
 * bunched), AND no rigid repeating pattern.
 *
 * Method: within its own bucket each photo gets an evenly-stepped position
 * `(j + 0.5) / size`, so a big shoot's frames land ~1/frequency apart across
 * the whole list (never bunched). Crucially, each bucket is then rotated by its
 * OWN random phase (`hashUnit(key)`, wrapped into [0,1)) — so the shoots don't
 * all start at 0 and fall into a mechanical A,B,C,A,B,C rotation; they
 * interleave at different offsets, reading as a real shuffle. A small per-photo
 * jitter breaks any residual lock-step. Fully deterministic (same on SSR +
 * client — no hydration mismatch). A final de-adjacency pass removes the rare
 * same-event neighbour.
 *
 * `seed` re-rolls the arrangement per visit: mixed into every hash input so the
 * per-bucket phase, jitter and tiebreak all shift together — a genuinely
 * different (but still well-spread, no-bunching) order each time. Empty seed on
 * the server + first client render keeps SSR and hydration identical; the client
 * swaps in a random seed once mounted (see `orderSeed`), so each entry differs
 * while the order stays fixed for the whole visit (never reshuffles mid-scroll).
 */
export function interleaveByCollection(
  todas: Photo[],
  seed = "",
  emDestaque: readonly string[] = EM_DESTAQUE,
): Photo[] {
  const fixas = new Set(emDestaque);
  const presas = todas
    .filter((p) => fixas.has(p.src))
    .sort((a, b) => hashUnit(a.src + seed) - hashUnit(b.src + seed))
    .slice(0, LUGARES_EM_DESTAQUE.length);
  if (!presas.length) return intercalar(todas, seed);
  const usadas = new Set(presas.map((p) => p.src));
  const ordem = intercalar(
    todas.filter((p) => !usadas.has(p.src)),
    seed,
    new Set(presas.map(bucketKey)),
  );
  // Até onde as fixadas mandam: a última, mais a janela do evento. Nesse
  // princípio não pode haver outra do MESMO evento (ficava ao lado de uma
  // fixada); essas descem para logo a seguir.
  const ate = LUGARES_EM_DESTAQUE[presas.length - 1] + JANELA_EVENTO + 1;
  const eventos = new Set(presas.map(bucketKey));
  const cabeca: Photo[] = [];
  const afastadas: Photo[] = [];
  let k = 0;
  for (; k < ordem.length && cabeca.length + presas.length < ate; k++) {
    (eventos.has(bucketKey(ordem[k])) ? afastadas : cabeca).push(ordem[k]);
  }
  const out = [...cabeca, ...afastadas, ...ordem.slice(k)];
  presas.forEach((p, i) => out.splice(Math.min(LUGARES_EM_DESTAQUE[i], out.length), 0, p));
  // Tirar e pôr mexe nos vizinhos: a mesma passagem de sempre volta a pôr a
  // lista de acordo com as regras (as fixadas cumprem-nas, por isso ficam).
  return deAdjacent(out, 1);
}

function intercalar(list: Photo[], seed: string, evitarNoTopo?: Set<string>): Photo[] {
  const buckets = new Map<string, Photo[]>();
  const order: string[] = [];
  for (const p of list) {
    const key = bucketKey(p);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
      order.push(key);
    }
    arr.push(p);
  }
  const ranked: { p: Photo; rank: number }[] = [];
  for (const key of order) {
    const arr = buckets.get(key)!;
    const phase = hashUnit(key + seed); // per-bucket rotation → staggered interleave
    for (let j = 0; j < arr.length; j++) {
      const jitter = (hashUnit(arr[j].src + seed) - 0.5) * 0.12;
      let rank = (j + 0.5) / arr.length + phase + jitter;
      rank -= Math.floor(rank); // wrap into [0,1)
      ranked.push({ p: arr[j], rank });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || hashUnit(a.p.src + seed) - hashUnit(b.p.src + seed));
  return comMosaico(deAdjacent(ranked.map((r) => r.p)), evitarNoTopo);
}

/** Quantos lugares separam duas fotos do mesmo evento, e da mesma cena. */
export const JANELA_EVENTO = 3;
/** ~4 filas de 3 colunas: «mostra todas, afastadas», nas palavras dela. */
export const JANELA_CENA = 12;

/**
 * A foto `p` pode ficar logo a seguir a `antes` (as que já estão na lista)?
 *  · o mesmo evento não se repete nas `JANELA_EVENTO` anteriores;
 *  · a mesma cena não se repete nas `JANELA_CENA` anteriores;
 *  · duas fotos a preto e branco nunca ficam seguidas.
 */
function cabeAqui(antes: Photo[], i: number, p: Photo): boolean {
  const evento = bucketKey(p);
  for (let k = Math.max(0, i - JANELA_EVENTO); k < i; k++) {
    if (bucketKey(antes[k]) === evento) return false;
  }
  if (p.cena) {
    for (let k = Math.max(0, i - JANELA_CENA); k < i; k++) {
      if (antes[k].cena === p.cena) return false;
    }
  }
  if (p.pb && i > 0 && antes[i - 1].pb) return false;
  return true;
}

/**
 * Final safety pass. For each position that breaks a rule (`cabeAqui`), it
 * pulls forward the nearest later photo that fits there. When none fits (the
 * tail, or a category that is a single shoot) it's left as-is — best effort.
 */
function deAdjacent(list: Photo[], desde = 1): Photo[] {
  const out = [...list];
  for (let i = desde; i < out.length; i++) {
    if (cabeAqui(out, i, out[i])) continue;
    for (let j = i + 1; j < out.length; j++) {
      if (cabeAqui(out, i, out[j])) {
        const [moved] = out.splice(j, 1);
        out.splice(i, 0, moved);
        break;
      }
    }
  }
  return out;
}

/** Largura ÷ altura, do `aspectRatio` (`"w / h"`) que vem em todas as fotos. */
export function razaoDe(aspectRatio: string): number {
  const [w, h] = aspectRatio.split("/").map((n) => parseFloat(n));
  return w > 0 && h > 0 ? w / h : 1;
}

/** O índice da foto mais deitada (a de maior razão); -1 numa lista vazia. */
function maisDeitada(list: Photo[]): number {
  let melhor = -1;
  for (let i = 0; i < list.length; i++) {
    if (melhor < 0 || razaoDe(list[i].aspectRatio) > razaoDe(list[melhor].aspectRatio)) melhor = i;
  }
  return melhor;
}

/** Até onde se procura a foto do mosaico grande: as primeiras desta ordem,
 *  para o destaque mudar de visita para visita como o resto. */
const PROCURA_DESTAQUE = 24;

/**
 * O MOSAICO DO TOPO ESCOLHE A MELHOR.
 *
 * As primeiras da ordem são a fila do topo (`GaleriaClient`, `FotoDaFila`): a
 * 0 é o destaque, a maior; as seguintes entram conforme a largura do ecrã. Até
 * aqui calhava lá o que a sorte mandasse — uma foto ao alto, a preto e branco
 * ou tremida no maior lugar da página.
 *
 *  · para o destaque vem a primeira, entre as `PROCURA_DESTAQUE` primeiras, que
 *    serve de destaque (deitada, a cores, nítida — `serveParaDestaque`);
 *  · para as outras quatro, as primeiras que não são da mesma cena nem do mesmo
 *    evento que o destaque, e no máximo uma a preto e branco.
 *
 * Só reordena o princípio: o resto da lista fica como estava.
 *
 * O DESTAQUE É SEMPRE DEITADO (15/10, a pedido dela: «as fotos têm que ser
 * apresentadas de acordo com as suas dimensões»). Medido em 400 ordens, em 10
 * não havia destaque nas primeiras 24 e ficava a primeira que calhasse — numa
 * delas uma foto ao alto, na maior caixa da página. Agora:
 *  · procura-se primeiro nas `PROCURA_DESTAQUE` primeiras (para variar);
 *  · se lá não houver, na lista inteira;
 *  · sem dados de análise (`destaque` em nenhuma), fica a mais deitada das
 *    primeiras `PROCURA_DESTAQUE`.
 */
function comMosaico(list: Photo[], evitar?: Set<string>): Photo[] {
  const limite = Math.min(list.length, PROCURA_DESTAQUE);
  // O evento das fotografias em destaque não dá o mosaico grande: elas já
  // estão no topo, e a 2.ª da fila é uma delas.
  const podeSer = (p: Photo) => p.destaque && !evitar?.has(bucketKey(p));
  let iDestaque = list.slice(0, limite).findIndex(podeSer);
  if (iDestaque < 0) iDestaque = list.findIndex(podeSer);
  if (iDestaque < 0) iDestaque = maisDeitada(list.slice(0, limite));
  if (iDestaque < 0) return list;
  const resto = [...list];
  const [grande] = resto.splice(iDestaque, 1);
  const satelites: Photo[] = [];
  const eventos = new Set([bucketKey(grande), ...(evitar ?? [])]);
  const cenas = new Set(grande.cena ? [grande.cena] : []);
  let pb = grande.pb ? 1 : 0;
  for (let j = 0; j < resto.length && satelites.length < 4; ) {
    const p = resto[j];
    const serve =
      !eventos.has(bucketKey(p)) && !(p.cena && cenas.has(p.cena)) && !(p.pb && pb >= 1);
    if (!serve) {
      j++;
      continue;
    }
    resto.splice(j, 1);
    satelites.push(p);
    eventos.add(bucketKey(p));
    if (p.cena) cenas.add(p.cena);
    if (p.pb) pb++;
  }
  // Tirar cinco do princípio mexe nos vizinhos do resto: a mesma passagem de
  // há pouco, a partir da sexta, volta a pô-los de acordo com as regras.
  return deAdjacent([grande, ...satelites, ...resto], 1 + satelites.length);
}
