import type { LeituraDeNumero } from "@/lib/numero-escrito";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { textoDoPreco } from "./textos-do-pedido";

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

/**
 * O texto de um campo mudou? APARADO DOS DOIS LADOS: um espaço a mais no fim —
 * o que acontece a quem cola de um email, ou o que veio de uma importação —
 * não é uma alteração dela (achado F-08 de uma auditoria em produção). A mesma
 * pergunta para o «o que falta gravar» e para o corpo do «Guardar»: eram duas
 * respostas, e um nome importado com um espaço no fim era reescrito no
 * servidor, com uma linha no histórico, sem ela lhe ter tocado (júri, 17/11).
 */
export function textoMudou(escrito: string, gravado: string | null | undefined): boolean {
  return escrito.trim() !== (gravado ?? "").trim();
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO VOLTOU DO SERVIDOR — QUE CAMPOS DO PAINEL O SEGUEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra é uma só, e vale para todas as respostas que mudam o pedido aberto
 * por trás (o estúdio, um lote, um envio): o campo que ela NÃO mexeu — ainda
 * mostra o que o pedido tinha antes — segue o servidor; o que ela mexeu fica,
 * porque é trabalho dela à espera de «Guardar».
 */
export function seguirOServidor<T extends string>(noEcra: T, antes: T, depois: T): T {
  // «Não mexeu» é a mesma pergunta do «o que falta gravar»: `textoMudou`.
  return textoMudou(noEcra, antes) ? noEcra : depois;
}

/** Os campos do painel que seguem o servidor, como o painel os escreve. */
export interface CamposQueSeguemOServidor {
  status: QuoteStatus;
  preco: string;
  responsavel: string;
  data: string;
  convidados: string;
  local: string;
  nome: string;
  email: string;
  telefone: string;
}

/** O que o painel mostra de um pedido, campo a campo. */
export function camposNoPainel(q: Quote): CamposQueSeguemOServidor {
  return {
    status: q.status,
    preco: textoDoPreco(q),
    responsavel: q.assignedTo ?? "",
    data: q.date ?? "",
    convidados: String(q.guests ?? ""),
    local: q.location ?? "",
    nome: q.name ?? "",
    email: q.email ?? "",
    telefone: q.phone ?? "",
  };
}
