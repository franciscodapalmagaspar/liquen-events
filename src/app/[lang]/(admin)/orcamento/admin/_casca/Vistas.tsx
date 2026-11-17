"use client";

import { textoDoPreco } from "@/lib/orcamento/pedidos/textos-do-pedido";
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
import { VIEW_WRAP } from "./moldura-da-vista";
import { VistasDaOperacao } from "./VistasDaOperacao";
import { type PedidosDasVistas, type NavegacaoDasVistas } from "./grupos-das-vistas";

/**
 * AS VISTAS DO BACK OFFICE — uma de cada vez, conforme o destino escolhido
 * (`view`). Cada vista vem do `lazy.tsx`, para só descarregar a que se abre.
 * A lista de Pedidos não está aqui: fica sempre montada (escondida quando não
 * é a vista), para não perder a posição nem os filtros ao ir e voltar.
 *
 * Saiu tal e qual do `AdminClient.tsx` (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export interface VistasProps {
  pedidos: PedidosDasVistas;
  navegacao: NavegacaoDasVistas;
  userName: string;
}

export function Vistas({ pedidos, navegacao, userName }: VistasProps) {
  const {
    falhaDosPedidos,
    quotes,
    substituirPedido,
    alterarPedido,
    setEditPrice,
    selectedRef,
    marcarDesfecho,
    abrirCliente,
    openQuote,
    revalidarPedidos,
    refletirEstadoDoEstudio,
    archivedCount,
    verArquivados,
    activeQuotes,
  } = pedidos;
  const { view, setView, pedidoPara, irComPedido, propostaPara, setPropostaPara, setNewQuoteOpen } =
    navegacao;
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
                  alterarPedido(id, { status });
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
              substituirPedido(q);
              // A MESMA guarda de id das duas linhas de cima. Sem ela, o
              // estúdio a gravar o preço do pedido B escrevia-o no campo do
              // pedido A que está aberto no painel — e o «Guardar tudo» do
              // cabeçalho mandava-o para A.
              if (q.id === selectedRef.current?.id) setEditPrice(textoDoPreco(q));
            }}
            onEstadoDoPedido={(q, status) => refletirEstadoDoEstudio(q.id, status)}
            onSent={(q) => {
              alterarPedido(q.id, { status: "cotado" });
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
              substituirPedido(q);
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
              substituirPedido(q);
            }}
          />
        </div>
      )}

      <VistasDaOperacao pedidos={pedidos} navegacao={navegacao} userName={userName} />
    </>
  );
}
