/** (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`; vive em `ui/` porque é teclado, não temas.) */

/** A tecla que pede o menu de contexto: a tecla de menu, ou Shift+F10. */
export function teclaDeMenu(e: React.KeyboardEvent): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}
