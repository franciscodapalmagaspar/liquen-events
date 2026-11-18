/**
 * O tamanho de cada janela de impressão (`export.ts`). Vive à parte para quem
 * abre a janela no instante do clique — antes de o código da impressão chegar
 * (`imprimir-a-pedido.ts`) — a abrir com o mesmo tamanho, sem o importar.
 */
export const JANELA_DA_TIMELINE = "width=820,height=1000";
export const JANELA_DOS_CONVIDADOS = "width=820,height=1000";
export const JANELA_DO_DOSSIER = "width=900,height=1100";

/** Abre a janela vazia onde a folha vai ser escrita. `null` se o browser a bloqueou. */
export function abrirJanelaDeImpressao(tamanho: string): Window | null {
  return window.open("", "_blank", tamanho);
}
