/**
 * Avisa o seletor da Biblioteca de Temas que o que ele tem em cache deixou de
 * corresponder à realidade.
 *
 * O seletor (ThemePicker) guarda temas e páginas de miniaturas em cache de
 * módulo, para reabrir sem disparar um pedido. Essa cache só é invalidada por
 * este evento — sem ele, acrescentar ou remover uma foto aqui deixava o
 * seletor a mostrar a biblioteca velha até a aba ser recarregada. Um evento em
 * `window` (e não um import) mantém os dois ecrãs sem se conhecerem.
 *
 * O mesmo evento muda a GERAÇÃO das fotos da pré-visualização real
 * (`usePaginaReal`, `fotosMudaram`): as páginas à vista pedem-se outra vez, e o
 * primeiro pedido de cada uma vai `fresco`.
 */
export function bibliotecaAlterada(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("liquen:biblioteca-alterada"));
}

/** Quanto se espera pela foto seguinte de um lote antes de avisar. */
export const ESPERA_DO_LOTE_MS = 1_000;

let relogio: ReturnType<typeof setTimeout> | null = null;

/**
 * {@link bibliotecaAlterada}, agrupado: carregar 40 fotos dava 40 avisos — 40
 * gerações das fotos, cada uma a pedir de novo as páginas à vista da
 * pré-visualização (revisão de 14/11, menor n.º 5). Avisa UMA vez, quando o
 * lote pára por {@link ESPERA_DO_LOTE_MS}.
 */
export function bibliotecaAlteradaEmLote(): void {
  if (typeof window === "undefined") return;
  if (relogio) clearTimeout(relogio);
  relogio = setTimeout(() => {
    relogio = null;
    bibliotecaAlterada();
  }, ESPERA_DO_LOTE_MS);
}
