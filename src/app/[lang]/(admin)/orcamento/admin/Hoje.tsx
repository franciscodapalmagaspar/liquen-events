"use client";

import { memo, useMemo } from "react";
import type { Quote, Task } from "@/lib/orcamento/types";
import type { PropostaParaCobrar } from "@/lib/orcamento/cobrancas";
import { oQueHaHoje, quantasHoje } from "@/lib/orcamento/hoje";
import { eur0 as eur } from "@/lib/money";
import { useCachedList } from "./useCachedList";
import { useDiaDeHoje } from "./useDiaDeHoje";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * O bloco «Hoje» do topo da Visão Geral (10/11, escolha dela). As regras vivem
 * em `lib/orcamento/hoje.ts`; aqui só se desenha. Lê o que a Visão Geral já
 * tem — os pedidos, as propostas e as tarefas pela chave partilhada
 * `"tarefas"` (a mesma dos Lembretes e da Agenda): nenhum pedido novo à rede.
 */

type Destino = "tarefas" | "pagamentos";

interface Props {
  quotes: readonly Quote[];
  propostas: readonly PropostaParaCobrar[];
  onOpen: (q: Quote) => void;
  onGo: (view: Destino) => void;
}

function diasDoPagamento(dias: number): string {
  if (dias < 0) return dias === -1 ? "em atraso há 1 dia" : `em atraso há ${-dias} dias`;
  return dias === 0 ? "vence hoje" : "vence amanhã";
}

type Linha = {
  chave: string;
  tom: "urgente" | "normal" | "bom";
  rotulo: string;
  texto: string;
  aoCarregar: () => void;
};

const COR_DO_TOM: Record<Linha["tom"], string> = {
  urgente: "bg-[var(--bo-perigo)]",
  normal: "bg-[var(--bo-aviso-tom)]",
  bom: "bg-sage-600",
};

function Hoje({ quotes, propostas, onOpen, onGo }: Props) {
  const { data: tarefas = [] } = useCachedList<Task[]>("tarefas", "/api/tarefas");
  // Muda à meia-noite e ao voltar ao separador (ver `useDiaDeHoje`).
  const hoje = useDiaDeHoje();
  const h = useMemo(
    () => oQueHaHoje(quotes, propostas, tarefas, hoje),
    [quotes, propostas, tarefas, hoje],
  );
  const total = quantasHoje(h);

  const linhas = useMemo(() => {
    const porId = new Map(quotes.map((q) => [q.id, q]));
    const abrir = (id: string) => () => {
      const q = porId.get(id);
      if (q) onOpen(q);
    };
    const l: Linha[] = [];
    for (const e of h.eventos) {
      l.push({
        chave: `evento:${e.quoteId}`,
        tom: e.quando === "hoje" ? "urgente" : "normal",
        rotulo: e.quando === "hoje" ? "Evento hoje" : "Evento amanhã",
        texto: e.nome,
        aoCarregar: abrir(e.quoteId),
      });
    }
    for (const p of h.pagamentos) {
      l.push({
        chave: `pagamento:${p.quoteId}`,
        tom: p.dias < 0 ? "urgente" : "normal",
        rotulo: `${p.tipo === "sinal" ? "Sinal" : "Saldo"} ${diasDoPagamento(p.dias)}`,
        texto: `${p.nome} · ${eur(p.valor)}`,
        aoCarregar: () => onGo("pagamentos"),
      });
    }
    for (const r of h.respostas) {
      l.push({
        chave: `resposta:${r.quoteId}`,
        tom: "bom",
        rotulo: "O casal respondeu",
        texto: `${r.nome} · ${r.escolhas === 1 ? "1 escolha na proposta" : `${r.escolhas} escolhas na proposta`}`,
        aoCarregar: abrir(r.quoteId),
      });
    }
    for (const s of h.semResposta) {
      l.push({
        chave: `sem-resposta:${s.quoteId}`,
        tom: "normal",
        rotulo: `Proposta sem resposta há ${s.dias} dias`,
        texto: s.nome,
        aoCarregar: abrir(s.quoteId),
      });
    }
    for (const s of h.seguimentos) {
      l.push({
        chave: `seguimento:${s.quoteId}`,
        tom: s.atrasado ? "urgente" : "normal",
        rotulo: s.atrasado ? "Seguimento em atraso" : "Seguimento hoje",
        texto: s.nome,
        aoCarregar: abrir(s.quoteId),
      });
    }
    for (const t of h.tarefas) {
      l.push({
        chave: `tarefa:${t.id}`,
        tom: t.atrasada ? "urgente" : "normal",
        rotulo: t.atrasada ? "Tarefa em atraso" : "Tarefa para hoje",
        texto: t.titulo,
        aoCarregar: () => onGo("tarefas"),
      });
    }
    return l;
  }, [h, quotes, onOpen, onGo]);

  return (
    <section aria-labelledby="hoje-titulo" className="bo-card overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--bo-hairline)] px-5 py-4">
        <h3 id="hoje-titulo" className="bo-eyebrow">
          Hoje
        </h3>
        <p className="text-xs text-[var(--bo-text-muted)] tabular-nums">
          {total === 0 ? "Nada urgente" : total === 1 ? "1 coisa" : `${total} coisas`}
        </p>
      </div>
      {total === 0 ? (
        <p className="px-5 py-4 text-sm text-[var(--bo-text-muted)]">
          Não há eventos, pagamentos, propostas por responder, seguimentos nem tarefas para hoje.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--bo-hairline)]">
          {linhas.map((x) => (
            <li key={x.chave}>
              <button
                type="button"
                onClick={x.aoCarregar}
                className={`alvo-toque flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-[var(--bo-tinta-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sage-600/45 ${ESTADO} ${PRESSAO}`}
              >
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 shrink-0 rounded-full ${COR_DO_TOM[x.tom]}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-medium tracking-[0.04em] text-[var(--bo-tinta-72)]">
                    {x.rotulo}
                  </span>
                  <span className="block truncate text-sm text-[var(--bo-text)]">{x.texto}</span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-[var(--bo-text-muted)]">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default memo(Hoje);
