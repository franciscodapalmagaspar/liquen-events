import { CHEGADA_MS, molaEmLinear } from "./tokens";

/**
 * A ESCOLHA ASSENTA COM MOLA (as pastilhas do pedido de orçamento).
 *
 * Pedido dela (22/10): dar vida ao pedido de orçamento. Os campos já entravam
 * a subir (`.orc-reveal`) e o ✓ da confirmação já se desenhava; faltava a
 * resposta ao escolher. Uma pastilha que passa a escolhida cresce de 0,92 com
 * a mola da casa (`MOLA_CHEGADA`, 240 ms), passa ligeiramente e assenta.
 *
 * Porque é pelo browser (Web Animations) e não pelo CSS: no CSS, a mola
 * (`--bo-mola-chegada`) é da folha e do diálogo do back office e de mais nada
 * — ver `movimento-da-casa.test.ts`. Aqui é o site público e um gesto pedido
 * por ela; a curva é a MESMA (`molaEmLinear`), sem tocar nessa regra. É o
 * mesmo caminho do `MolaAoLargar.tsx`. Só `scale`, e nada com movimento
 * reduzido.
 */
const CURVA = molaEmLinear();

export function assentarComMola(el: HTMLElement): void {
  if (typeof el.animate !== "function") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate([{ scale: "0.92" }, { scale: "1" }], { duration: CHEGADA_MS, easing: CURVA });
}
