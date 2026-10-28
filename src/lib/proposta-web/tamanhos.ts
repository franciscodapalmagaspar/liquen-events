/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTOS PIXÉIS CADA ESPAÇO PEDE — para nenhuma fotografia parecer «comida»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): «há aqui muitas fotos que parece que estão comidas… a resolução
 * não é a ideal para este local». O browser escolhe o ficheiro do `srcset`
 * pelo que o `sizes` lhe diz e pelas larguras ao lado de cada endereço. As
 * duas estavam erradas:
 *
 *   · as larguras eram as do LADO MAIOR (400 / 1200): numa fotografia ao alto
 *     a «1200w» tem 800 de largura, e o browser julgava-a maior do que é;
 *   · o `sizes` dizia só a largura do espaço. Com `object-fit: cover`, num
 *     espaço alto (a capa, a citação, os cartões dos serviços, a paleta) a
 *     fotografia é desenhada pela ALTURA — uma deitada na capa do telemóvel
 *     fica com três vezes a largura do ecrã, e o browser pedia a de 400.
 *
 * Aqui fazem-se as duas contas, puras e testadas.
 */

/** A largura real de uma derivada que cabe num quadrado de `lado` (sem ampliar). */
export function larguraDaDerivada(
  largura: number | undefined,
  altura: number | undefined,
  lado: number,
): number {
  if (!largura || !altura) return lado;
  const escala = Math.min(1, lado / Math.max(largura, altura));
  return Math.max(1, Math.round(largura * escala));
}

/**
 * Um `srcset` com as larguras verdadeiras. Duas entradas com a mesma largura
 * (uma foto pequena, em que a «1200» é o próprio original) ficam uma só — a
 * primeira, que é a mais leve.
 */
export function srcSetComLarguras(passos: readonly { url?: string; largura: number }[]): string {
  const vistas = new Set<number>();
  const partes: string[] = [];
  for (const p of passos) {
    if (!p.url || vistas.has(p.largura)) continue;
    vistas.add(p.largura);
    partes.push(`${p.url} ${p.largura}w`);
  }
  return partes.join(", ");
}

/**
 * Um espaço onde a foto se recorta (`object-fit: cover`), medido em fracções do
 * ecrã: `vw` da largura e `vh` da altura, a partir de `desde` px de largura.
 */
export interface EspacoDoEcra {
  desde?: number;
  vw: number;
  vh: number;
}

const razao = (x: number) => `${Math.max(1, Math.round(x * 1000))}/1000`;
const n = (x: number) => Number(x.toFixed(2));

/**
 * O `sizes` de uma fotografia com esta forma num espaço que ocupa parte do
 * ecrã. A fotografia desenhada tem `max(largura do espaço, altura × forma)`:
 * quando o ecrã é mais alto do que `forma × vh ÷ vw`, manda a altura.
 * `folga` cobre um zoom por cima (a capa cresce 9% ao entrar).
 *
 * Os espaços vão do ecrã mais largo para o mais estreito; o último sem `desde`.
 */
export function sizesParaCobrir(
  aspecto: number,
  espacos: readonly EspacoDoEcra[],
  folga = 1,
): string {
  const a = aspecto > 0 ? aspecto : 1.5;
  const partes: string[] = [];
  for (const e of espacos) {
    const quando = e.desde ? `(min-width: ${e.desde}px)` : "";
    // Manda a altura quando vw/vh < a·kh/kw.
    const limite = razao((a * e.vh) / e.vw);
    const pelaAltura = `calc(${n(a * e.vh * 100 * folga)}vh)`;
    const pelaLargura = `${n(e.vw * 100 * folga)}vw`;
    partes.push(`${quando ? `${quando} and ` : ""}(max-aspect-ratio: ${limite}) ${pelaAltura}`);
    partes.push(quando ? `${quando} ${pelaLargura}` : pelaLargura);
  }
  return partes.join(", ");
}

/**
 * Quantas vezes a largura de uma célula a fotografia precisa de ter para a
 * cobrir: 1 quando a foto é mais «alta» do que a célula, mais quando é mais
 * deitada (é a altura que manda).
 */
export function fatorParaCobrir(aspectoDaFoto: number, aspectoDaCelula: number): number {
  if (!(aspectoDaFoto > 0) || !(aspectoDaCelula > 0)) return 1;
  return Math.max(1, aspectoDaFoto / aspectoDaCelula);
}
