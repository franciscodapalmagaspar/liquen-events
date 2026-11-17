"use client";

import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { type SeparadorDoPedido } from "@/lib/orcamento/pedidos/proxima-accao";
import { type ActivityEntry, type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { type Gaveta } from "../../ui/gaveta";
import { type DetailTab } from "../separadores-do-painel";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";
import { SeparadorDeProducao } from "./SeparadorDeProducao";
import { SeparadorFinanceiro } from "./SeparadorFinanceiro";
import { SeparadorDaProposta } from "./SeparadorDaProposta";
import { SeparadoresDoPedido } from "./SeparadoresDoPedido";

/**
 * AS FERRAMENTAS DO PEDIDO — os três separadores (Produção, Financeiro, Fazer
 * proposta) e o que cada um monta. Cada separador só monta a primeira vez que
 * é aberto, e nunca mais desmonta (ver `detailTabsVisitados`, no
 * `AdminClient.tsx`). Saiu do painel na fase 7 da estrutura do código, tal e qual.
 */
export interface FerramentasDoPedidoProps {
  edicao: EdicaoDoPedido;
  userName: string;
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  selected: Quote;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  detailTab: SeparadorDoPedido;
  detailTabsVisitados: Set<SeparadorDoPedido>;
  abrirDetailTab: (tab: DetailTab) => void;
  toolsRef: RefObject<HTMLDivElement | null>;
  gavetaDoPlano: Gaveta;
  gavetaDoHistorico: Gaveta;
  appendActivity: (quoteId: string, entries: ActivityEntry[], oQue?: string) => Promise<boolean>;
  refletirEstadoDoEstudio: (id: string, status: QuoteStatus) => void;
  activeQuotes: Quote[];
}

export function FerramentasDoPedido({
  edicao,
  userName,
  setQuotes,
  selected,
  setSelected,
  detailTab,
  detailTabsVisitados,
  abrirDetailTab,
  toolsRef,
  gavetaDoPlano,
  gavetaDoHistorico,
  appendActivity,
  refletirEstadoDoEstudio,
  activeQuotes,
}: FerramentasDoPedidoProps) {
  return (
    <>
      {/* ── Ferramentas — sempre visíveis, organizadas em três
        separadores (a gestão já está acima, sempre presente). */}
      <div
        id="detail-tools"
        ref={toolsRef}
        className="flex scroll-mt-24 flex-col gap-[var(--bo-gap-vista)] border-t border-[var(--bo-hairline)] pt-5 sm:pt-8"
      >
        {/* Section header — the command centre of the pedido. */}
        <div className="flex flex-col gap-1.5">
          <p className="bo-eyebrow">Ferramentas do pedido</p>
          <p className="text-xs leading-relaxed text-[var(--bo-text-muted)]">
            Tudo o que precisa para preparar, cobrar e propor — num só lugar.
          </p>
        </div>

        <SeparadoresDoPedido
          selected={selected}
          detailTab={detailTab}
          abrirDetailTab={abrirDetailTab}
        />

        {/* Coluna única — as ferramentas do separador ativo */}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-6">
          {/* Cada painel só monta as suas ferramentas na PRIMEIRA vez
            que se abre (`detailTabsVisitados`, ver a nota onde é
            declarado) — depois disso fica sempre montado e só
            escondido (`hidden`), para nunca se perder trabalho a
            meio (mensagem por enviar, proposta em edição) ao trocar
            de separador. */}
          {/* ── O SEPARADOR QUE CHEGA APRESENTA-SE ──────
              Os três painéis trocavam com `hidden`: o que
              sai desaparece e o que entra aparece no mesmo
              fotograma. É a `.view-in` da casa — 240 ms,
              oito píxeis —, que é a classe escrita para
              «o cromado não sai do sítio, muda o conteúdo
              dentro dele».

              A classe entra e sai com o separador, e não vem
              de um `key`: um `key` remontaria as ferramentas
              todas a cada troca, e elas ficam montadas de
              propósito (ver `detailTabsVisitados`) para o
              rascunho de uma mensagem sobreviver a uma ida à
              Produção e volta. */}
          <div
            role="tabpanel"
            id="detail-panel-producao"
            aria-labelledby="detail-tab-producao"
            tabIndex={0}
            hidden={detailTab !== "producao"}
            className={`flex flex-col gap-4 focus:outline-none sm:gap-6 ${
              detailTab === "producao" ? "view-in" : ""
            }`}
          >
            {detailTabsVisitados.has("producao") && (
              <SeparadorDeProducao
                userName={userName}
                setQuotes={setQuotes}
                selected={selected}
                setSelected={setSelected}
                gavetaDoPlano={gavetaDoPlano}
              />
            )}
          </div>

          <div
            role="tabpanel"
            id="detail-panel-financeiro"
            aria-labelledby="detail-tab-financeiro"
            tabIndex={0}
            hidden={detailTab !== "financeiro"}
            className={`flex flex-col gap-4 focus:outline-none sm:gap-6 ${
              detailTab === "financeiro" ? "view-in" : ""
            }`}
          >
            {detailTabsVisitados.has("financeiro") && (
              <SeparadorFinanceiro
                setQuotes={setQuotes}
                selected={selected}
                setSelected={setSelected}
              />
            )}
          </div>

          <div
            role="tabpanel"
            id="detail-panel-comunicacao"
            aria-labelledby="detail-tab-comunicacao"
            tabIndex={0}
            hidden={detailTab !== "comunicacao"}
            className={`flex flex-col gap-4 focus:outline-none sm:gap-6 ${
              detailTab === "comunicacao" ? "view-in" : ""
            }`}
          >
            {detailTabsVisitados.has("comunicacao") && (
              <SeparadorDaProposta
                edicao={edicao}
                userName={userName}
                setQuotes={setQuotes}
                selected={selected}
                setSelected={setSelected}
                gavetaDoHistorico={gavetaDoHistorico}
                appendActivity={appendActivity}
                refletirEstadoDoEstudio={refletirEstadoDoEstudio}
                activeQuotes={activeQuotes}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
