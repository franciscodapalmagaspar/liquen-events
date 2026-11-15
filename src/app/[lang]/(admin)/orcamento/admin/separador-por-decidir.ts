/**
 * ── O SEPARADOR ESCOLHIDO ANTES DE SE SABER A PROPOSTA (revisão de 14/11) ──
 *
 * Abrir um pedido escolhe o separador pela fase, e a fase precisa da lista
 * leve de propostas. Se ela ainda não tinha chegado, a escolha foi feita sem
 * a proposta. Quando chega, volta-se a escolher — mas só se ela ainda está no
 * MESMO pedido, no MESMO separador, e há pouco tempo: não se lhe tira o ecrã
 * de baixo dos dedos a meio de escrever.
 *
 * Puro, para se testar sem montar o AdminClient.
 */
export interface SeparadorPorDecidir<T extends string> {
  quoteId: string;
  tab: T;
  desde: number;
}

/** Quanto tempo depois de abrir o pedido ainda se pode corrigir o separador. */
export const SEPARADOR_A_DECIDIR_MS = 4000;

/**
 * O separador para onde ir agora que a proposta se sabe, ou `null` para ficar
 * onde está.
 */
export function separadorQuandoAPropostaChega<T extends string>(
  porDecidir: SeparadorPorDecidir<T>,
  agora: { quoteId: string; tab: T; em: number },
  alvo: T,
): T | null {
  if (agora.quoteId !== porDecidir.quoteId) return null;
  if (agora.tab !== porDecidir.tab) return null; // ela já mexeu
  if (agora.em - porDecidir.desde > SEPARADOR_A_DECIDIR_MS) return null;
  return alvo === porDecidir.tab ? null : alvo;
}
