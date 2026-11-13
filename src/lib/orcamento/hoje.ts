import type { Quote, Task } from "./types";
import { cobrancaDoPedido, entraNasCobrancas, type PropostaParaCobrar } from "./cobrancas";
import { diaDoPrazo } from "@/lib/tarefas/prazo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «HOJE» — O QUE PRECISA DELA HOJE (10/11, escolha dela)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um bloco no topo da Visão Geral, e não um ecrã novo: a Visão Geral já tinha
 * metade disto espalhado («Lembretes» e «Agenda», dentro do «Mais do painel»
 * fechado). Aqui junta-se só o que é de HOJE, com as regras que já existem:
 *
 *   · eventos de hoje e de amanhã — aceites ou com proposta enviada, a mesma
 *     regra do «Próximo evento»;
 *   · pagamentos em atraso, a vencer hoje ou amanhã — as regras do quadro dos
 *     Pagamentos (`cobrancaDoPedido`), e não outras;
 *   · tarefas por fazer com prazo até hoje — a regra dos «Lembretes»;
 *   · seguimentos marcados para hoje ou já passados — idem;
 *   · o que o CASAL escolheu na proposta nas últimas 48 horas — é a única
 *     resposta escrita pelo próprio cliente que fica gravada;
 *   · propostas enviadas há {@link DIAS_SEM_RESPOSTA} dias ou mais sem notícias
 *     (13/11, pedido do Francisco: «a proposta da Maria & João foi enviada há
 *     5 dias e não teve resposta»). É um aviso PARA ELA — nada sai sozinho
 *     para o casal.
 *
 * Fica de fora, e está dito no PR: os emails devolvidos. Saber se um email
 * voltou obriga a ir à caixa de correio por cada pedido enviado, e isso só se
 * faz hoje com o pedido aberto — trazê-lo para aqui era gastar servidor a cada
 * entrada. Também não há «a proposta foi vista»: não se regista.
 *
 * Função pura, sem pedidos à rede: lê o que a Visão Geral já tem.
 */

export type EventoDeHoje = { quoteId: string; nome: string; quando: "hoje" | "amanha" };
export type PagamentoDeHoje = {
  quoteId: string;
  nome: string;
  tipo: "sinal" | "saldo";
  valor: number;
  /** Dias até ao prazo: negativo = em atraso, 0 = hoje, 1 = amanhã. */
  dias: number;
};
export type TarefaDeHoje = { id: string; titulo: string; atrasada: boolean; quoteId?: string };
export type SeguimentoDeHoje = { quoteId: string; nome: string; atrasado: boolean };
export type RespostaDeHoje = { quoteId: string; nome: string; escolhas: number; em: string };
export type SemRespostaDeHoje = { quoteId: string; nome: string; dias: number };

export interface Hoje {
  eventos: EventoDeHoje[];
  pagamentos: PagamentoDeHoje[];
  tarefas: TarefaDeHoje[];
  seguimentos: SeguimentoDeHoje[];
  respostas: RespostaDeHoje[];
  semResposta: SemRespostaDeHoje[];
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Ao fim de quantos dias sem notícias uma proposta enviada aparece no «Hoje».
 * Conta desde o ÚLTIMO contacto conhecido — o envio, uma mensagem, uma chamada
 * registada ou uma escolha do casal —, e não desde o primeiro envio: quem
 * ligou ontem já sabe em que pé está. Um seguimento marcado para mais tarde
 * também a tira daqui (é a mesma decisão, já tomada).
 */
export const DIAS_SEM_RESPOSTA = 5;

/** O último contacto conhecido com o casal de uma proposta enviada (ms), ou null. */
export function ultimoContacto(q: Pick<Quote, "activityLog" | "escolhasDoCasal">): number | null {
  const tempos = [
    ...(q.activityLog ?? [])
      .filter(
        (a) => a.kind === "proposal_sent" || a.kind === "message_sent" || a.kind === "call_logged",
      )
      .map((a) => Date.parse(a.at)),
    ...(q.escolhasDoCasal ?? []).map((r) => Date.parse(r.em)),
  ].filter((t) => !Number.isNaN(t));
  return tempos.length ? Math.max(...tempos) : null;
}

/** As escolhas do casal contam como «de hoje» durante este tempo. */
export const HORAS_DAS_RESPOSTAS = 48;

export function oQueHaHoje(
  quotes: readonly Quote[],
  propostas: readonly PropostaParaCobrar[],
  tarefas: readonly Task[],
  hoje: string,
  agora: Date = new Date(),
): Hoje {
  const amanha = somarDias(hoje, 1);

  const eventos: EventoDeHoje[] = [];
  const pagamentos: PagamentoDeHoje[] = [];
  const seguimentos: SeguimentoDeHoje[] = [];
  const respostas: RespostaDeHoje[] = [];
  const semResposta: SemRespostaDeHoje[] = [];
  const desde = agora.getTime() - HORAS_DAS_RESPOSTAS * 3_600_000;

  for (const q of quotes) {
    if (q.archived) continue;
    const confirmado = q.status === "aceite" || q.status === "cotado";
    if (confirmado && (q.date === hoje || q.date === amanha)) {
      eventos.push({ quoteId: q.id, nome: q.name, quando: q.date === hoje ? "hoje" : "amanha" });
    }

    if (entraNasCobrancas(q)) {
      const c = cobrancaDoPedido(q, propostas, hoje);
      if (
        c.fase !== "pago" &&
        c.proximo &&
        c.diasParaOPrazo !== null &&
        (c.atraso || c.diasParaOPrazo <= 1)
      ) {
        pagamentos.push({
          quoteId: q.id,
          nome: q.name,
          tipo: c.proximo.tipo,
          valor: c.proximo.valor,
          dias: c.diasParaOPrazo,
        });
      }
    }

    if (
      q.followUpAt &&
      DIA.test(q.followUpAt) &&
      q.followUpAt <= hoje &&
      q.status !== "aceite" &&
      q.status !== "rejeitado"
    ) {
      seguimentos.push({ quoteId: q.id, nome: q.name, atrasado: q.followUpAt < hoje });
    }

    if (q.status === "cotado" && !(q.followUpAt && DIA.test(q.followUpAt) && q.followUpAt > hoje)) {
      const ultimo = ultimoContacto(q);
      if (ultimo !== null) {
        const dias = Math.floor((agora.getTime() - ultimo) / 86_400_000);
        if (dias >= DIAS_SEM_RESPOSTA) semResposta.push({ quoteId: q.id, nome: q.name, dias });
      }
    }

    const recentes = (q.escolhasDoCasal ?? []).filter((r) => {
      const t = Date.parse(r.em);
      return !Number.isNaN(t) && t >= desde;
    });
    if (recentes.length > 0) {
      const em = recentes
        .map((r) => r.em)
        .sort()
        .at(-1)!;
      respostas.push({ quoteId: q.id, nome: q.name, escolhas: recentes.length, em });
    }
  }

  // O prazo lê-se como DIA: uma tarefa antiga gravada com hora agarrada
  // («2026-11-13T10:00») também é de hoje (ver `lib/tarefas/prazo.ts`).
  const deHoje: TarefaDeHoje[] = tarefas
    .filter((t) => !t.done && DIA.test(diaDoPrazo(t.dueDate)) && diaDoPrazo(t.dueDate) <= hoje)
    .map((t) => ({
      id: t.id,
      titulo: t.title,
      atrasada: diaDoPrazo(t.dueDate) < hoje,
      ...(t.quoteId ? { quoteId: t.quoteId } : {}),
    }));

  return {
    eventos: eventos.sort((a, b) =>
      a.quando === b.quando ? a.nome.localeCompare(b.nome) : a.quando === "hoje" ? -1 : 1,
    ),
    // O mais atrasado primeiro.
    pagamentos: pagamentos.sort((a, b) => a.dias - b.dias),
    tarefas: deHoje.sort((a, b) => Number(b.atrasada) - Number(a.atrasada)),
    seguimentos: seguimentos.sort((a, b) => Number(b.atrasado) - Number(a.atrasado)),
    respostas: respostas.sort((a, b) => b.em.localeCompare(a.em)),
    // A mais esquecida primeiro.
    semResposta: semResposta.sort((a, b) => b.dias - a.dias),
  };
}

/** Quantas coisas há, ao todo — para o título dizer «3 coisas para hoje». */
export function quantasHoje(h: Hoje): number {
  return (
    h.eventos.length +
    h.pagamentos.length +
    h.tarefas.length +
    h.seguimentos.length +
    h.respostas.length +
    h.semResposta.length
  );
}
