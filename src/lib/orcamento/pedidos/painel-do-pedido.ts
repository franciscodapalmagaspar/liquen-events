import type { LeituraDeNumero } from "@/lib/numero-escrito";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DO PEDIDO — uma forma só, e a leitura dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os onze campos editáveis do painel tinham DUAS formas escritas à mão, iguais
 * menos nos convidados: uma para perguntar «o que falta gravar?» (com os
 * convidados como estão escritos) e outra para gravar (com os convidados já
 * lidos). O hook da edição montava a primeira e o «Guardar» montava a segunda,
 * campo a campo — e um campo novo ficava esquecido num dos dois sítios.
 *
 * Agora há a forma que o painel TEM (`PainelDoPedido`, montada num sítio só,
 * no `useEdicaoDoPedido`) e a função que a LÊ para gravar (`lerPainel`).
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

/** O painel como se grava: os convidados já lidos como número. */
export interface PainelEscrito extends Omit<PainelDoPedido, "convidados"> {
  convidados: number;
}

/**
 * O painel pronto a gravar.
 *
 * Um número de convidados que não serve NÃO é uma alteração: fica o que está
 * gravado — e, por isso, nem vai no corpo nem se anuncia no histórico. É assim
 * que o email escrito na mesma gravação deixa de ser arrastado abaixo por um
 * sinal a menos. Um campo vazio que se pode deixar vazio também fica o gravado.
 */
export function lerPainel(
  painel: PainelDoPedido,
  convidados: LeituraDeNumero,
  guardado: Pick<Quote, "guests">,
): PainelEscrito {
  return {
    ...painel,
    convidados: convidados.ok && convidados.valor !== null ? convidados.valor : guardado.guests,
  };
}
