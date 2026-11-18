import type { Quote } from "@/lib/orcamento/types";
import { textoMudou, type PainelDoPedido } from "./painel-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O PAINEL DO PEDIDO AINDA TEM POR GRAVAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três perguntas que o painel faz a cada desenho — e que viviam no corpo do
 * `AdminClient.tsx` como uma condição de dezassete termos (fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`). A regra é a de lá, sem mudar um termo; a
 * divisão entre o que grava sozinho e o que pede um clique está explicada em
 * `notas-automaticas.ts`.
 */

export interface OQueFaltaGravar {
  /**
   * O motivo de perda acompanha a decisão do estado? Enquanto houver uma
   * mudança de estado por confirmar, o motivo faz parte dela e vai com ela no
   * clique; sem nenhuma, é prosa como as notas — e grava-se sozinho.
   */
  motivoVaiComADecisao: boolean;
  /** Alterações que esperam por um clique (os campos que NÃO gravam sozinhos). */
  porConfirmar: boolean;
  /** O que se escreve e ainda não está igual ao que o servidor tem. */
  porEscrever: boolean;
}

const NADA: OQueFaltaGravar = {
  motivoVaiComADecisao: false,
  porConfirmar: false,
  porEscrever: false,
};

export function oQueFaltaGravar(antes: Quote | null, e: PainelDoPedido): OQueFaltaGravar {
  if (!antes) return NADA;
  const motivoVaiComADecisao = e.estado !== antes.status;
  const motivoMudou = e.motivoDePerda !== (antes.lostReason ?? "");
  const porConfirmar =
    e.estado !== antes.status ||
    // Valores LIDOS, não o texto: «1500,50» e «1500.5» não são uma edição.
    e.preco !== (antes.quotedPrice ?? undefined) ||
    e.responsavel !== (antes.assignedTo ?? "") ||
    (motivoVaiComADecisao && motivoMudou) ||
    e.data !== (antes.date ?? "") ||
    e.convidados !== String(antes.guests ?? "") ||
    // Aparados dos dois lados, como o corpo do PATCH os compara (`textoMudou`).
    textoMudou(e.local, antes.location) ||
    textoMudou(e.nome, antes.name) ||
    textoMudou(e.email, antes.email) ||
    textoMudou(e.telefone, antes.phone);
  const porEscrever =
    e.notas !== (antes.adminNotes ?? "") || (!motivoVaiComADecisao && motivoMudou);
  return { motivoVaiComADecisao, porConfirmar, porEscrever };
}
