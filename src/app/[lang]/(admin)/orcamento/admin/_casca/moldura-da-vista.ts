/**
 * A moldura de cada vista do back office. (Saiu do `AdminClient.tsx` na fase 7
 * de `docs/ESTRUTURA-DO-CODIGO.md`.)
 */
// Shared content shell for the main column: a comfortable centred max-width with
// consistent horizontal padding + vertical rhythm, so screens stay readable
// instead of sprawling edge-to-edge on wide monitors. The top bar aligns to the
// same measure. `view-in` (the enter animation) is appended per view.
// O respiro vertical é o token da escala do espaço (`globals.css`): 12 px
// abaixo de 640, 24 a partir daí, os 40 de sempre no portátil. Eram 24 px fixos
// em ~15 vistas, antes de qualquer conteúdo — e num iPhone SE são 24 dos 667 que
// já tinham perdido 137 para o cabeçalho fixo e para a barra de baixo.
export const VIEW_WRAP =
  "mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-10 py-[var(--bo-p-vista)] lg:py-10";
