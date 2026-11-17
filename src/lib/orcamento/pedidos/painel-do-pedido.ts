import type { LeituraDeNumero } from "@/lib/numero-escrito";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * O QUE ESTÁ ESCRITO NO PAINEL DO PEDIDO — uma forma só.
 *
 * Havia duas (`PainelPorGravar` para «o que falta gravar?» e `PainelEscrito`
 * para o «Guardar alterações»), com os mesmos onze campos, montadas à mão,
 * campo a campo, em dois sítios a partir dos mesmos `editX` — o sítio clássico
 * onde um campo novo fica esquecido num deles (júri das fases 7 e 8, ponto 4).
 * Passa a haver esta, que o `useEdicaoDoPedido` monta uma vez, e a
 * `painelParaGravar`, que dela tira o que a gravação manda.
 */
export interface PainelDoPedido {
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

/** O painel já pronto para gravar: os convidados resolvidos para um número. */
export type PainelEscrito = Omit<PainelDoPedido, "convidados"> & { convidados: number };

/**
 * O painel como a gravação o manda.
 *
 * Um número de convidados que não serve (ou um campo em branco) NÃO é uma
 * alteração: fica o que está gravado, e por isso nem vai no corpo nem se
 * anuncia no histórico. É assim que o email escrito na mesma gravação deixa de
 * ser arrastado abaixo por um sinal a menos.
 */
export function painelParaGravar(
  painel: PainelDoPedido,
  convidadosLidos: LeituraDeNumero,
  pedido: Pick<Quote, "guests">,
): PainelEscrito {
  return {
    ...painel,
    convidados:
      convidadosLidos.ok && convidadosLidos.valor !== null ? convidadosLidos.valor : pedido.guests,
  };
}
