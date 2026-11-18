/**
 * Uma tarefa ligada a um pedido que já não existe (P5, 17/11).
 *
 * A chave estrangeira `tasks.quote_id → quotes` é `on delete cascade`: a
 * tarefa segue o pedido. Gravar uma tarefa para um pedido apagado entretanto
 * (noutro ecrã, ou pela retenção) é recusado pela base com 23503 — e a regra é
 * a mesma em todo o lado: não fica uma tarefa solta com o nome de um casal cujo
 * pedido foi apagado. As rotas respondem 409 com {@link MENSAGEM_PEDIDO_APAGADO}
 * em vez de um «Erro interno».
 */
export const MENSAGEM_PEDIDO_APAGADO = "O pedido desta tarefa já foi apagado.";

/** O nome da restrição; um teste prende-o ao db/schema.sql. */
export const RESTRICAO_DA_TAREFA_AO_PEDIDO = "tasks_quote_id_fkey";

export function eTarefaDeUmPedidoApagado(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  return (
    e.code === "23503" &&
    `${String(e.message ?? "")} ${String(e.details ?? "")}`.includes(RESTRICAO_DA_TAREFA_AO_PEDIDO)
  );
}
