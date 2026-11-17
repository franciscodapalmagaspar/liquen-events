/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PRÓXIMA ACÇÃO DE UM PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A única «próxima acção» que o painel do pedido mostra, tirada do sítio onde
 * o pedido está no seu ciclo de vida — para quem chega pela primeira vez ver
 * sempre a coisa sensata a fazer a seguir. Leva a um separador de ferramentas,
 * ou ao formulário de gestão («gestao»), que está sempre à vista, quando o
 * passo seguinte é editar um campo (por exemplo, reabrir).
 *
 * Saiu do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`). Recebe o
 * ciclo JÁ derivado, e não o pedido: quem o deriva é o `LifecycleStepper`, que
 * é interface, e a lógica pura não importa interface (§1.2 do mesmo documento).
 */

/** Os separadores de ferramentas do painel do pedido. */
export type SeparadorDoPedido = "producao" | "financeiro" | "comunicacao";

/** Para onde a próxima acção leva: um separador, ou o formulário de gestão. */
export type DestinoDaAccao = SeparadorDoPedido | "gestao";

/** O que a próxima acção precisa de saber do ciclo de vida do pedido. */
export interface CicloDoPedido {
  perdido: boolean;
  currentIndex: number;
  allDone: boolean;
}

export interface ProximaAccao {
  label: string;
  hint: string;
  tab: DestinoDaAccao;
}

export function proximaAccaoDoPedido({
  perdido,
  currentIndex,
  allDone,
}: CicloDoPedido): ProximaAccao {
  if (perdido)
    return { label: "Reabrir pedido", hint: "Voltar a colocar em revisão", tab: "gestao" };
  if (allDone)
    return {
      label: "Rever produção do evento",
      hint: "Guião, checklist e convidados",
      tab: "producao",
    };
  switch (currentIndex) {
    case 0:
      return {
        label: "Enviar proposta",
        hint: "Criar e enviar a proposta ao cliente",
        tab: "comunicacao",
      };
    case 1:
      return {
        label: "Acompanhar proposta",
        hint: "Mensagens e registo de atividade",
        tab: "comunicacao",
      };
    case 2:
      return {
        label: "Registar pagamento",
        hint: "Sinal, saldo e custos do evento",
        tab: "financeiro",
      };
    case 3:
      return {
        label: "Planear produção",
        hint: "Checklist, plano de decoração e guião",
        tab: "producao",
      };
    default:
      return {
        label: "Preparar o dia do evento",
        hint: "Timeline, convidados e checklist",
        tab: "producao",
      };
  }
}
