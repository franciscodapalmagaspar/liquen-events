import type { Quote } from "@/lib/orcamento/types";

/**
 * Os textos que o ecrã dos pedidos escreve a partir de um pedido — puros, sem
 * React. Saíram tal e qual do `AdminClient.tsx` (fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`); os nomes ficam os de lá, porque mudar o nome
 * no mesmo passo em que se muda a casa é o diff que não se revê (regra 3 da
 * §3.0 desse documento).
 */

/**
 * A forma curta e legível do id interno, para mostrar (por exemplo,
 * "LIQ-MRR1L78R-438B649E86343C27" → "LIQ-MRR1L78R…C27"). O id inteiro continua
 * no `title`; isto é só o que se desenha.
 */
export function shortRef(id: string): string {
  const parts = id.split("-");
  const last4 = id.slice(-4);
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}…${last4}`;
  return id.length > 10 ? `${id.slice(0, 8)}…${last4}` : id;
}

/** "2027-05" → "maio de 2027", para o filtro dos meses ser legível. */
export function mesLegivel(yyyymm: string): string {
  const d = new Date(`${yyyymm}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return yyyymm;
  return d.toLocaleDateString("pt-PT", { month: "long", year: "numeric" });
}

/** O preço como o campo o mostra — para saber se o que lá está veio do pedido
 *  ou foi escrito por ela. */
export function textoDoPreco(q: Quote): string {
  // `!= null` e não a verdade do valor: um preço de ZERO é um preço escrito (a
  // criação manual chega a gravá-lo, ao aparar um valor negativo). Lido como
  // «sem preço», o campo abria vazio, a comparação com `undefined` dava
  // diferente, e o pedido nascia com «alterações por guardar» sem ninguém lhe
  // ter tocado — com o aviso de saída da página a travar o fecho do separador.
  return q.quotedPrice != null ? String(q.quotedPrice) : "";
}

/**
 * O que desaparece com um pedido — em linhas, com números.
 *
 * Só o que EXISTE entra na lista: uma pergunta com «0 pagamentos» a meio é
 * ruído, e ruído numa pergunta destrutiva é o que ensina a saltá-la. Um pedido
 * sem nada por baixo dá uma lista vazia, e aí a `PerguntaDestrutiva` mostra só
 * o título e o aviso — que continua a ser melhor do que «tens a certeza».
 */
export function oQueSePerdeComOPedido(q: Quote | null): string[] {
  if (!q) return [];
  const linhas: string[] = [];
  const conta = (n: number, um: string, muitos: string) =>
    n > 0 ? linhas.push(`${n} ${n === 1 ? um : muitos}`) : undefined;
  conta(q.messages?.length ?? 0, "mensagem trocada", "mensagens trocadas");
  conta(q.payments?.length ?? 0, "pagamento registado", "pagamentos registados");
  conta(q.guestList?.length ?? 0, "convidado", "convidados");
  conta(q.checklist?.length ?? 0, "linha da checklist", "linhas da checklist");
  conta(q.productionPlan?.length ?? 0, "tarefa de produção", "tarefas de produção");
  conta(q.activityLog?.length ?? 0, "entrada no histórico", "entradas no histórico");
  if (q.quotedPrice) {
    linhas.push(
      `o valor combinado, ${q.quotedPrice.toLocaleString("pt-PT", {
        useGrouping: "always",
        style: "currency",
        currency: "EUR",
      })}`,
    );
  }
  return linhas;
}
