/**
 * As quatro chaves do rascunho do estúdio de um pedido (antes de passarem por
 * `draftKey`): o documento do estúdio, a tabela de linhas da ferramenta
 * antiga, e as duas gavetas de resgate. Um rascunho esquecido tem lá dentro o
 * mesmo documento que a proposta tinha — por isso o apagar limpa as quatro, e
 * a Reciclagem guarda as quatro. Uma lista só, para os dois. Puro.
 */
export const chavesDoRascunhoDoPedido = (pedidoId: string): string[] => [
  pedidoId,
  `${pedidoId}--orcamento-linhas`,
  `${pedidoId}--sobreposto`,
  `${pedidoId}--orcamento-linhas--sobreposto`,
];
