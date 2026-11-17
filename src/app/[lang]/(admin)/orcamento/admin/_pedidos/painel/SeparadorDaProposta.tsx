"use client";

import { textoDoPreco } from "@/lib/orcamento/pedidos/textos-do-pedido";
import { resumoDoEnvio } from "../../envio-da-mensagem";
import { ActivityLog, ClientMessenger, ProposalStudio } from "../../lazy";
import { SETA_DA_GAVETA, type Gaveta } from "../../ui/gaveta";
import { ESTADO, PRESSAO } from "../../ui/movimento";
import { randomId } from "../../util";
import { usePedidoAberto } from "./pedido-aberto";

/** O separador «Fazer proposta» do pedido: o estúdio, as mensagens ao
 *  cliente e o histórico. (Saiu das ferramentas do pedido na fase 7 da
 *  estrutura do código, tal e qual.) */
export interface SeparadorDaPropostaProps {
  gavetaDoHistorico: Gaveta;
}

export function SeparadorDaProposta({ gavetaDoHistorico }: SeparadorDaPropostaProps) {
  const {
    selected,
    edicao,
    userName,
    appendActivity,
    refletirEstadoDoEstudio,
    activeQuotes,
    alterarOAberto,
    substituirPedido,
  } = usePedidoAberto();
  const { setEditPrice, setEditStatus } = edicao;
  return (
    <>
      {/* Passo 1 — a proposta. Uma ferramenta só, o estúdio:
      a «tabela de preços simples» que havia ao lado saiu
      a 5/11, a pedido dela — enviava propostas sem o
      artigo do Moloni de cada serviço, e o estúdio já não
      deixa. */}
      <p className="bo-eyebrow text-foreground/45">1 · A proposta</p>
      <>
        <ProposalStudio
          key={`studio-${selected.id}`}
          quote={selected}
          quotes={activeQuotes}
          // O valor é um só: o estúdio grava-o no
          // pedido, e o "Preço final" aqui ao lado tem
          // de mostrar o mesmo número sem ser preciso
          // recarregar nada.
          onQuoteUpdated={(q) => {
            substituirPedido(q);
            // `textoDoPreco` e não a verdade do valor:
            // um total de ZERO é um preço escrito, e
            // lido como «sem preço» deixava o campo
            // vazio sobre um pedido que tem 0 — a barra
            // a pedir para gravar o que o estúdio
            // acabou de gravar.
            setEditPrice(textoDoPreco(q));
          }}
          onEstadoDoPedido={(status) => refletirEstadoDoEstudio(selected.id, status)}
          onSent={() => {
            alterarOAberto({ status: "cotado" });
            setEditStatus("cotado");
            // A proposta JÁ seguiu — o que pode
            // falhar aqui é a linha do histórico, e a
            // frase tem de dizer isso e não o
            // contrário.
            void appendActivity(
              selected.id,
              [
                {
                  id: randomId(),
                  at: new Date().toISOString(),
                  kind: "proposal_sent",
                  actor: userName,
                  summary: "Proposta enviada ao cliente (Studio)",
                },
              ],
              "escrever no histórico que a proposta seguiu",
            );
          }}
        />
      </>

      {/* Step 2 — talk to the client. */}
      <p className="bo-eyebrow border-t border-[var(--bo-hairline-strong)] pt-6 text-foreground/45">
        2 · Falar com o cliente
      </p>
      <ClientMessenger
        key={selected.id}
        quote={selected}
        onSent={(messages, envio) => {
          const prev_count = selected.messages?.length ?? 0;
          alterarOAberto({ messages });
          if (messages.length > prev_count) {
            // A mensagem JÁ saiu; o que pode falhar
            // aqui é a linha do histórico.
            void appendActivity(
              selected.id,
              [
                {
                  id: randomId(),
                  at: new Date().toISOString(),
                  kind: "message_sent",
                  actor: userName,
                  /**
                   * O QUE ACONTECEU, E NÃO O QUE SE QUIS FAZER.
                   *
                   * Um pedido que entrou por telefonema não tem
                   * email. A rota grava a mensagem à mesma e
                   * responde que o email NÃO saiu; o mensageiro
                   * diz-o a vermelho, mas o histórico ficava com
                   * «Mensagem enviada ao cliente» — e o histórico
                   * é o que se lê meses depois para saber o que se
                   * disse a quem. Mesma frase que a zona de
                   * comunicações do dossiê já usa.
                   */
                  summary: resumoDoEnvio(envio),
                },
              ],
              "escrever no histórico que a mensagem saiu",
            );
          }
        }}
      />

      {/* Activity history — de-emphasised, collapsed by default. */}
      <details
        className="group border-t border-[var(--bo-hairline-strong)] pt-4"
        onToggle={gavetaDoHistorico.aoAlternar}
      >
        <summary
          onClick={gavetaDoHistorico.aoTocarNoResumo}
          className={`alvo-toque !justify-start flex list-none items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--bo-text-muted)] marker:content-none [&::-webkit-details-marker]:hidden hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
        >
          <svg
            className={`shrink-0 text-foreground/40 group-open:rotate-90 ${SETA_DA_GAVETA}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Histórico de atividade
        </summary>
        <div className={`pt-4 sm:pt-6 ${gavetaDoHistorico.corpo}`}>
          <ActivityLog
            quote={selected}
            actor={userName}
            onAddEntry={(entry) =>
              appendActivity(
                selected.id,
                [entry],
                entry.kind === "call_logged" ? "guardar o registo da chamada" : "guardar a nota",
              )
            }
          />
        </div>
      </details>
    </>
  );
}
