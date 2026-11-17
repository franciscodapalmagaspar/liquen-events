import { useCallback, useState } from "react";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O PEDIDO DE «NOVA TAREFA», QUE PODE CHEGAR ANTES DO ECRÃ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * O botão «Nova tarefa» da barra e o ⌘N só existem com as Tarefas à frente,
 * mas a vista `Tarefas` carrega a pedido (`lazy.tsx`): enquanto o código dela
 * não chega, quem está no ecrã é o esqueleto, e um toque nesse intervalo sobe
 * o contador sem haver ninguém a ouvi-lo. (Visto a 17/11 num passeio do
 * telemóvel, com o `next dev` a frio.)
 *
 * Por isso o contrato tem duas metades, uma de cada lado:
 *
 *   · aqui, o contador volta a 0 quando se sai das Tarefas — um pedido não
 *     sobrevive à vista para que foi feito;
 *   · e o `Tarefas` serve o valor com que monta, se for diferente de zero:
 *     só pode ser um pedido feito com a vista ainda a carregar.
 *
 * Sair e voltar mais tarde não reabre a linha, porque o contador voltou a 0.
 *
 * Um contador e não um booleano: carregar duas vezes seguidas tem de pedir
 * duas vezes — um booleano ficava preso a `true` e o segundo toque não fazia
 * nada.
 */
export function usePedidoDeNovaTarefa(vista: string): { pedido: number; pedir: () => void } {
  const [pedido, setPedido] = useState(0);
  const pedir = useCallback(() => setPedido((n) => n + 1), []);
  /* Acerta-se durante o desenho, e não num efeito: no mesmo desenho em que a
     vista deixa de ser as Tarefas, o contador já é 0 — não há um fotograma em
     que volte a montar com o valor antigo. */
  if (vista !== "tarefas" && pedido !== 0) setPedido(0);
  return { pedido, pedir };
}
