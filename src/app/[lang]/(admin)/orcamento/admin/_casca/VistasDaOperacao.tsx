"use client";

import type { MudancasDosPedidos } from "@/lib/orcamento/pedidos/lista-de-pedidos";
import { type Dispatch, type SetStateAction } from "react";
import { type LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { type Quote } from "@/lib/orcamento/types";
import ComPropostasParaContas from "../ComPropostasParaContas";
import {
  Acompanhamento,
  Contratos,
  DefinicoesProposta,
  EmailTemplates,
  FechosMeta,
  Fornecedores,
  Guioes,
  Inventario,
  MapaDeMesas,
  Material,
  Reciclagem,
  Servicos,
  StatsDashboard,
  Tarefas,
  Temas,
} from "../lazy";
import { type View } from "../nav";
import { type PedidoDaPaleta } from "../procura-em-tudo";
import { VIEW_WRAP } from "./moldura-da-vista";

/**
 * As vistas do dia-a-dia da operação: serviços, definições, reciclagem,
 * acompanhamento, tarefas, fornecedores, estatísticas, inventário, material,
 * temas, timelines, mapa de mesas, propostas aceites e modelos de email.
 * (Saíram das `Vistas` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface VistasDaOperacaoProps {
  userName: string;
  quotes: Quote[];
  pedidos: MudancasDosPedidos;
  nomesDosPedidos: Map<string, string>;
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  pedidoPara: (v: View) => PedidoDaPaleta | undefined;
  comPedidoInteiro: (q: Quote) => Promise<LeituraDoPedido>;
  abrirCliente: (pedido: Quote) => void;
  activeQuotes: Quote[];
  pedidoDeNovaTarefa: number;
}

export function VistasDaOperacao({
  userName,
  quotes,
  pedidos,
  nomesDosPedidos,
  view,
  setView,
  pedidoPara,
  comPedidoInteiro,
  abrirCliente,
  activeQuotes,
  pedidoDeNovaTarefa,
}: VistasDaOperacaoProps) {
  return (
    <>
      {/* ── Biblioteca de serviços ── */}
      {view === "servicos" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Servicos />
        </div>
      )}

      {/* ── Definições: combustível, custo por km, margem mínima ── */}
      {view === "definicoes" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <DefinicoesProposta onAbrirReciclagem={() => setView("reciclagem")} />
        </div>
      )}

      {/* ── Reciclagem: o que se apagou, 30 dias (fase R3) ── */}
      {view === "reciclagem" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Reciclagem />
        </div>
      )}

      {/* ── Acompanhamento: o que ficou à espera de resposta ── */}
      {view === "acompanhamento" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Acompanhamento
            quotes={quotes}
            onOpenQuote={abrirCliente}
            onFazerProposta={() => setView("fazer-proposta")}
            onQuoteAtualizado={(q) => {
              pedidos.substituir(q);
            }}
          />
        </div>
      )}

      {/* ── Tarefas ── */}
      {view === "tarefas" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Tarefas
            defaultAssignee={userName}
            pedidoDeNova={pedidoDeNovaTarefa}
            pedidoDaPaleta={pedidoPara("tarefas")}
            nomesDosPedidos={nomesDosPedidos}
          />
        </div>
      )}

      {/* ── Fornecedores ── */}
      {view === "fornecedores" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Fornecedores pedidoDaPaleta={pedidoPara("fornecedores")} />
        </div>
      )}

      {/* ── Estatísticas ── */}
      {view === "estatisticas" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <ComPropostasParaContas>
            {(propostas) => <StatsDashboard quotes={activeQuotes} propostas={propostas} />}
          </ComPropostasParaContas>
          {/* Os casamentos fechados que têm de voltar à Meta. Vive aqui e
              não nas Definições porque é uma leitura de desempenho, e
              porque é neste ecrã que ela olha para o que a publicidade
              trouxe — ver o cabeçalho de `FechosMeta`. */}
          <div className="mt-4 sm:mt-6">
            <FechosMeta />
          </div>
        </div>
      )}

      {/* ── Inventário ── */}
      {view === "inventario" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Inventario />
        </div>
      )}

      {/* ── Material de logística ── */}
      {view === "material" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Material pedidoDaPaleta={pedidoPara("material")} />
        </div>
      )}

      {/* ── Biblioteca de temas ── */}
      {view === "temas" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Temas pedidoDaPaleta={pedidoPara("temas")} />
        </div>
      )}

      {/* ── Timelines ──
          A vista recebe o `comPedidoInteiro` e não faz a leitura sozinha,
          e é de propósito: essa função sabe que a rota do pedido responde
          200 com uma versão CURTA quando a sessão caiu, e que só o
          cabeçalho `x-pedido: completo` distingue as duas (ver
          `lerPedidoInteiro`). Uma segunda leitura escrita lá dentro herdava
          o defeito — e este é o ecrã onde o guião se GRAVA. */}
      {view === "guioes" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Guioes
            carregarPedido={async (id) => {
              const actual = quotes.find((q) => q.id === id);
              if (!actual) {
                return {
                  ok: false as const,
                  porque: "Este evento já não está na lista de pedidos. Recarrega a página.",
                };
              }
              const r = await comPedidoInteiro(actual);
              return r.ok
                ? { ok: true as const, quote: r.quote }
                : { ok: false as const, porque: r.porque };
            }}
            onQuoteAtualizado={(q) => {
              pedidos.substituir(q);
            }}
          />
        </div>
      )}

      {/* ── Mapa de mesas ──
          O mesmo caminho das Timelines: a vista recebe o `comPedidoInteiro`
          (a lista só tem resumos, e o mapa e os convidados vivem no pedido
          inteiro) e devolve o pedido gravado para a lista ficar em dia. */}
      {view === "mesas" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <MapaDeMesas
            carregarPedido={async (id) => {
              const actual = quotes.find((q) => q.id === id);
              if (!actual) {
                return {
                  ok: false as const,
                  porque: "Este evento já não está na lista de pedidos. Recarrega a página.",
                };
              }
              const r = await comPedidoInteiro(actual);
              return r.ok
                ? { ok: true as const, quote: r.quote }
                : { ok: false as const, porque: r.porque };
            }}
            onQuoteAtualizado={(q) => {
              pedidos.substituir(q);
            }}
          />
        </div>
      )}

      {/* ── Contratos ── */}
      {view === "contratos" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <Contratos
            quotes={quotes}
            onOpenQuote={abrirCliente}
            pedidoDaPaleta={pedidoPara("contratos")}
          />
        </div>
      )}

      {/* ── Modelos de email ── */}
      {view === "modelos-email" && (
        <div className={`${VIEW_WRAP} view-in`}>
          <EmailTemplates />
        </div>
      )}
    </>
  );
}
