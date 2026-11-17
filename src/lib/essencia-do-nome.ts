/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ISTO LÊ-SE COMO AQUILO?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Reduz um nome ao que o distingue de outro: sem acentos, sem maiúsculas, sem
 * pontuação, sem as palavras que o olho salta, sem repetições e por ordem
 * alfabética. Dois nomes com a MESMA essência são o mesmo nome dito de outra
 * maneira.
 *
 *   «Complementos Dos Noivos»  →  «complementos noivos»
 *   «Complementos Noivos»      →  «complementos noivos»
 *   «Itália»  e  «  ITALIA  »  →  «italia»
 *
 * ── O que NÃO se perde ────────────────────────────────────────────────────
 *
 * Os números. «Mesa 1» e «Mesa 2» ficam `mesa 1` e `mesa 2` — nomes diferentes,
 * como devem ser. É por isso que a pontuação vira ESPAÇO e não nada: «Mesas—1»
 * tem de virar «mesas 1» e não «mesas1».
 *
 * ── Quem usa isto ─────────────────────────────────────────────────────────
 *
 * Os títulos das páginas de inspiração de uma proposta
 * (`proposal-titulos-parecidos.ts`) e os nomes dos temas da biblioteca
 * (`temas-parecidos.ts`). São a mesma pergunta sobre coisas diferentes, e por
 * isso a resposta vive aqui — num módulo que não importa nada, para os dois
 * lados da aplicação o poderem ler sem arrastar o outro atrás.
 */

/**
 * As palavras que não distinguem um nome de outro.
 *
 * Artigos, preposições e as suas contracções — o que uma pessoa salta ao ler um
 * índice. Deliberadamente curta: cada palavra a mais nesta lista é um par de
 * nomes que se passa a acusar sem razão.
 */
const VAZIAS = new Set([
  "a",
  "as",
  "o",
  "os",
  "de",
  "do",
  "dos",
  "da",
  "das",
  "e",
  "em",
  "no",
  "nos",
  "na",
  "nas",
  "para",
  "com",
  "the",
  "of",
  "and",
]);

/** O que sobra de um nome depois de tirar o que não o distingue. */
export function essenciaDoNome(nome: string): string {
  const palavras = nome
    .normalize("NFD")
    // Os acentos saem: «Cerimónia» e «Cerimonia» são o mesmo nome escrito com
    // e sem o dedo no acento.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // A pontuação vira espaço, e não nada: «Mesas—1» tem de virar «mesas 1» e
    // não «mesas1», senão os números colavam-se às palavras.
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p && !VAZIAS.has(p));
  // ORDENADAS: «Noivos Complementos» e «Complementos Noivos» são o mesmo nome
  // dito ao contrário, e no índice lêem-se como um só.
  return [...new Set(palavras)].sort().join(" ");
}
