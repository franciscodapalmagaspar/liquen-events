/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA TINTA EM TODOS OS LOGÓTIPOS DOS CLIENTES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (9/11), com a captura da fita: «a barra ainda não tem os logos todos […]
 * com a mesma cor». Os logótipos eram pintados de preto com `brightness-0`, que
 * escurece a cor mas DEIXA a transparência: um logótipo que vem meio
 * transparente (o Convento com 0,60 de opacidade média, a Clínica e o Palácio
 * com 0,69 — medido nos ficheiros de `/_img/l/`) saía cinzento ao lado de uma
 * Deloitte preta.
 *
 * Este filtro põe a cor a preto E puxa a transparência para cima (×3): o que
 * tinha um terço de tinta passa a ter tinta inteira, e só as bordas finas,
 * as do anti-serrilhado, continuam suaves. Os logótipos ficam todos do mesmo
 * preto.
 *
 * Um `<svg>` vazio, de tamanho zero, com o filtro, e o `filter: url(#…)` em
 * cada `<img>`. Sem JavaScript e sem rede: o custo é o do `brightness-0` que
 * substitui.
 */
export const ID_DA_TINTA = "tinta-dos-logotipos";
export const FILTRO_DA_TINTA = `url(#${ID_DA_TINTA})`;

export function TintaDosLogotipos() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <filter id={ID_DA_TINTA} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3 0" />
      </filter>
    </svg>
  );
}
