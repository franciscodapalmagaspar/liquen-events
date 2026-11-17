import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

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

/** Os campos do painel tal e qual como estão escritos (o preço já lido). */
export interface PainelPorGravar {
  estado: QuoteStatus;
  /** O preço lido do campo; `undefined` se vazio ou ilegível. */
  preco: number | undefined;
  notas: string;
  responsavel: string;
  motivoDePerda: string;
  data: string;
  /** O que está ESCRITO no campo dos convidados, por ler. */
  convidados: string;
  local: string;
  nome: string;
  email: string;
  telefone: string;
}

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

export function oQueFaltaGravar(antes: Quote | null, e: PainelPorGravar): OQueFaltaGravar {
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
    // APARADOS DOS DOIS LADOS, como o corpo do PATCH os compara: um espaço a
    // mais no fim — o que acontece a quem cola de um email — não é uma
    // alteração dela (achado F-08 de uma auditoria em produção).
    e.local.trim() !== (antes.location ?? "").trim() ||
    e.nome.trim() !== (antes.name ?? "").trim() ||
    e.email.trim() !== (antes.email ?? "").trim() ||
    e.telefone.trim() !== (antes.phone ?? "").trim();
  const porEscrever =
    e.notas !== (antes.adminNotes ?? "") || (!motivoVaiComADecisao && motivoMudou);
  return { motivoVaiComADecisao, porConfirmar, porEscrever };
}
