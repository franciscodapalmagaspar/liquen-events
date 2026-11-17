"use client";

import type { MudancasDosPedidos } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { type LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { textoDoPreco } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import ComPropostasParaContas from "../ComPropostasParaContas";
import {
  Calendario,
  Clientes,
  FazerProposta,
  Kanban,
  Overview,
  Pagamentos,
  Propostas,
} from "../lazy";
import { type View } from "../nav";
import { type PedidoDaPaleta } from "../procura-em-tudo";
import { VIEW_WRAP } from "./moldura-da-vista";
import { VistasDaOperacao } from "./VistasDaOperacao";

/**
 * AS VISTAS DO BACK OFFICE — uma de cada vez, conforme o destino escolhido
 * (`view`). Cada vista vem do `lazy.tsx`, para só descarregar a que se abre.
 * A lista de Pedidos não está aqui: fica sempre montada (escondida quando não
 * é a vista), para não perder a posição nem os filtros ao ir e voltar.
 *
 * Saiu tal e qual do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export interface VistasProps {
  userName: string;
  falhaDosPedidos: LeituraFalhada | null;
  quotes: Quote[];
  pedidos: MudancasDosPedidos;
  nomesDosPedidos: Map<string, string>;
  setEditPrice: Dispatch<SetStateAction<string>>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  pedidoPara: (v: View) => PedidoDaPaleta | undefined;
  irComPedido: (vista: View, pedido: PedidoDaPaleta) => void;
  propostaPara: string | null;
  setPropostaPara: Dispatch<SetStateAction<string | null>>;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  selectedRef: RefObject<Quote | null>;
  marcarDesfecho: (actualizado: Quote) => void;
  comPedidoInteiro: (q: Quote) => Promise<LeituraDoPedido>;
  abrirCliente: (pedido: Quote) => void;
  openQuote: (pedido: Quote) => Promise<void>;
  revalidarPedidos: (forcar?: boolean) => Promise<void>;
  refletirEstadoDoEstudio: (id: string, status: QuoteStatus) => void;
  archivedCount: number;
  verArquivados: () => void;
  activeQuotes: Quote[];
  pedidoDeNovaTarefa: number;
}

export function Vistas({
  userName,
  falhaDosPedidos,
  quotes,
  pedidos,
  nomesDosPedidos,
  setEditPrice,
  view,
  setView,
  pedidoPara,
  irComPedido,
  propostaPara,
  setPropostaPara,
  setNewQuoteOpen,
  selectedRef,
  marcarDesfecho,
  comPedidoInteiro,
  abrirCliente,
  openQuote,
  revalidarPedidos,
  refletirEstadoDoEstudio,
  archivedCount,
  verArquivados,
  activeQuotes,
  pedidoDeNovaTarefa,
}: VistasProps) {
  return (
    <>
      {/* ── Overview ── */}
      {view === "overview" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <ComPropostasParaContas>
            {(propostas) => (
              <Overview
                quotes={activeQuotes}
                propostas={propostas}
                userName={userName}
                onOpen={abrirCliente}
                onGoStats={() => setView("estatisticas")}
                onGo={(v) => setView(v)}
                onNew={() => setNewQuoteOpen(true)}
                // Marcar «Ganho» na lista «à espera de resposta» da Visão Geral
                // grava no servidor; sem isto, a lista continuava a mostrar o
                // pedido pendurado e o ecrã ficava a dizer o contrário.
                onQuoteAtualizado={marcarDesfecho}
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
                arquivados={archivedCount}
                onVerArquivados={verArquivados}
              />
            )}
          </ComPropostasParaContas>
        </div>
      )}

      {/* ── Pipeline (Kanban) ── */}
      {view === "kanban" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <ComPropostasParaContas>
            {(propostas) => (
              <Kanban
                quotes={activeQuotes}
                propostas={propostas}
                onOpen={abrirCliente}
                userName={userName}
                onStatusChange={(id, status) => {
                  pedidos.mudar(id, { status });
                }}
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
                onNovoPedido={() => setNewQuoteOpen(true)}
                arquivados={archivedCount}
                onVerArquivados={verArquivados}
              />
            )}
          </ComPropostasParaContas>
        </div>
      )}

      {/* ── Clientes ── */}
      {view === "clientes" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <ComPropostasParaContas>
            {(propostas) => (
              <Clientes
                quotes={activeQuotes}
                propostas={propostas}
                onOpen={abrirCliente}
                /* Só quando a lista está mesmo vazia: com pedidos no ecrã, uma
                   falha da leitura INICIAL já não é o que se está a ver. */
                falhaDeLeitura={quotes.length === 0 ? falhaDosPedidos : null}
                aoTentarDeNovo={() => void revalidarPedidos()}
              />
            )}
          </ComPropostasParaContas>
        </div>
      )}

      {/* ── Calendário ── */}
      {view === "calendario" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Calendario
            quotes={activeQuotes}
            onOpen={abrirCliente}
            onFazerProposta={abrirCliente}
            pedidoDaPaleta={pedidoPara("calendario")}
          />
        </div>
      )}

      {/* ── Fazer proposta ── */}
      {view === "fazer-proposta" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <FazerProposta
            quotes={activeQuotes}
            selectedId={propostaPara}
            onSelect={setPropostaPara}
            // Volta ao painel do pedido — que é onde vivem a Produção, o
            // Financeiro e as mensagens. O `openQuote` já muda a vista para
            // Pedidos e trata da espera com nome.
            onAbrirPedido={openQuote}
            // «Abrir esse», no aviso de possível duplicado: o OUTRO pedido,
            // pela mesma porta de todos (não o painel).
            onAbrirOutro={abrirCliente}
            // As propostas já feitas não estão nesta lista — estão lá.
            onIrParaPropostas={(procura) => irComPedido("propostas", { procura: procura ?? "" })}
            onNovoPedido={() => setNewQuoteOpen(true)}
            onQuoteUpdated={(q) => {
              pedidos.substituir(q);
              // A MESMA guarda de id das duas linhas de cima. Sem ela, o
              // estúdio a gravar o preço do pedido B escrevia-o no campo do
              // pedido A que está aberto no painel — e o «Guardar tudo» do
              // cabeçalho mandava-o para A.
              if (q.id === selectedRef.current?.id) setEditPrice(textoDoPreco(q));
            }}
            onEstadoDoPedido={(q, status) => refletirEstadoDoEstudio(q.id, status)}
            onSent={(q) => {
              pedidos.mudar(q.id, { status: "cotado" });
            }}
          />
        </div>
      )}

      {/* ── Propostas ── */}
      {view === "propostas" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Propostas
            quotes={quotes}
            userName={userName}
            pedidoDaPaleta={pedidoPara("propostas")}
            onOpenQuote={abrirCliente}
            onQuoteUpdated={(q) => {
              pedidos.substituir(q);
            }}
          />
        </div>
      )}

      {view === "pagamentos" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Pagamentos
            quotes={quotes}
            userName={userName}
            onOpenQuote={abrirCliente}
            onQuoteUpdated={(q) => {
              pedidos.substituir(q);
            }}
          />
        </div>
      )}

      <VistasDaOperacao
        userName={userName}
        quotes={quotes}
        pedidos={pedidos}
        nomesDosPedidos={nomesDosPedidos}
        view={view}
        setView={setView}
        pedidoPara={pedidoPara}
        comPedidoInteiro={comPedidoInteiro}
        abrirCliente={abrirCliente}
        activeQuotes={activeQuotes}
        pedidoDeNovaTarefa={pedidoDeNovaTarefa}
      />
    </>
  );
}
