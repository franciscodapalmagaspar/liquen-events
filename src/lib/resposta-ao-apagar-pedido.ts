import type { ResultadoDoApagamento } from "./apagar-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE RESPONDE QUANDO UM PEDIDO NÃO SAIU — uma regra, para dois sítios
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A Reciclagem (`reciclagem.ts`) transforma uma recusa do apagar num
 * `NaoDeuParaApagar` com uma frase e um estado HTTP; a rota
 * `DELETE /api/orcamento/[id]` devolve-os. Os dois decidiam isto ramo a ramo,
 * cada um no seu ficheiro (júri de 18/11, 9.ª e 10.ª voltas). Agora é aqui.
 *
 * As frases são as de sempre — nenhuma é nova (um texto próprio para a fatura
 * é decisão do dono):
 *
 *  · `nao-existe` → 404, «Não encontrado»;
 *  · `tem-contrato` → 409, a frase do registo fiscal;
 *  · `tem-fatura` → 409 (conflito, não avaria), com a frase genérica;
 *  · o resto (não verificado, ou parou a meio) → 500, com a frase genérica.
 *
 * `comRelatorio` diz se a resposta leva a lista do que ficou por apagar: as
 * duas primeiras nunca a levaram (nada saiu, e não há nada a contar).
 */
export interface RespostaAoApagarPedido {
  estado: 404 | 409 | 500;
  frase: string;
  comRelatorio: boolean;
}

export const FRASE_DO_CONTRATO =
  "Este pedido deu origem a contrato, e um contrato é um registo fiscal que tem de ser conservado. Nada foi apagado.";
export const FRASE_GENERICA = "Não consegui apagar este pedido.";

/** Puro. */
export function respostaAoApagarPedido(
  r: Pick<ResultadoDoApagamento, "motivo">,
): RespostaAoApagarPedido {
  switch (r.motivo) {
    case "nao-existe":
      return { estado: 404, frase: "Não encontrado", comRelatorio: false };
    case "tem-contrato":
      return { estado: 409, frase: FRASE_DO_CONTRATO, comRelatorio: false };
    case "tem-fatura":
      return { estado: 409, frase: FRASE_GENERICA, comRelatorio: true };
    default:
      return { estado: 500, frase: FRASE_GENERICA, comRelatorio: true };
  }
}
