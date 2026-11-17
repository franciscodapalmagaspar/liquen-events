/**
 * A tecla que pede o menu de contexto — é teclado, não é dos temas: serve a
 * qualquer lista com menu de contexto. (Saiu do `Temas.tsx` na fase 8.)
 */
export function teclaDeMenu(e: React.KeyboardEvent): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}
