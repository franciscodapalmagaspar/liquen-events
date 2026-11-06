"use client";

import type { Quote, QuoteMessage, ActivityEntry } from "@/lib/orcamento/types";
import { resumoDoEnvio, type EnvioDaMensagem } from "../../envio-da-mensagem";
import { randomId } from "../../util";
import { ProposalStudio, ClientMessenger } from "../../lazy";
import EnviarModelo, { type EnvioDoModelo } from "./EnviarModelo";

/**
 * Zona de Comunicação — Proposal Studio (desenhar/enviar a proposta) e o
 * mensageiro do cliente. Cada ferramenta trata do seu envio/PATCH; aqui só
 * espelhamos o estado (status → cotado, mensagens) e registamos a atividade,
 * exatamente como o drawer.
 */
interface Props {
  quote: Quote;
  userName: string;
  onQuoteChange: (patch: Partial<Quote>) => void;
  /** Devolve se ficou gravada — ver `ActivityLog`, que só limpa a caixa
   *  quando ficou. */
  onAddEntry: (entry: ActivityEntry) => Promise<boolean>;
}

/** A moldura desta zona sai abaixo de 640 e fica um risco no lugar dela — a
 *  conta está no cabeçalho do `FinanceZone`, que tem a mesma linha. */
export default function CommsZone({ quote, userName, onQuoteChange, onAddEntry }: Props) {
  return (
    <section
      id="zone-comunicacao"
      className="scroll-mt-40 flex flex-col gap-[var(--bo-gap-vista)] border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]"
    >
      <p className="bo-eyebrow">Comunicação</p>

      <ProposalStudio
        key={`studio-${quote.id}`}
        quote={quote}
        // O valor da proposta é o "Preço final" do pedido — um número só. O
        // estúdio já o gravou no servidor; aqui só se actualiza a cópia local
        // para o resto do Dossier (financeiro, faturas) mostrar o mesmo.
        onQuoteUpdated={(q) => onQuoteChange({ quotedPrice: q.quotedPrice })}
        // O primeiro rascunho põe o pedido em «A preparar proposta» (6/11).
        onEstadoDoPedido={(status) => onQuoteChange({ status })}
        onSent={() => {
          onQuoteChange({ status: "cotado" });
          onAddEntry({
            id: randomId(),
            at: new Date().toISOString(),
            kind: "proposal_sent",
            actor: userName,
            summary: "Proposta enviada ao cliente (Studio)",
          });
        }}
      />

      <ClientMessenger
        key={`msg-${quote.id}`}
        quote={quote}
        onSent={(messages: QuoteMessage[], envio: EnvioDaMensagem) => {
          const prevCount = quote.messages?.length ?? 0;
          onQuoteChange({ messages });
          if (messages.length > prevCount) {
            onAddEntry({
              id: randomId(),
              at: new Date().toISOString(),
              kind: "message_sent",
              actor: userName,
              /**
               * A mensagem fica SEMPRE registada; o e-mail é que pode não sair
               * — um pedido que entrou por telefonema não tem email, e a rota
               * devolve `emailed: false`. O aviso vermelho do mensageiro dura o
               * tempo do ecrã aberto; esta linha dura para sempre, e era ela
               * que jurava «enviada ao cliente» sobre uma que ninguém recebeu.
               *
               * O histórico é o que se lê meses depois para saber o que se
               * disse a quem: tem de dizer o que aconteceu de facto. A razão
               * (`envio.emailError`) fica de fora de propósito — é uma frase de
               * duas linhas com instruções para AGORA, e o que aqui interessa é
               * o facto, curto e legível numa lista.
               */
              summary: resumoDoEnvio(envio),
            });
          }
        }}
      />

      {/**
       * Os modelos de email que ela envia à ordem — sinal recebido, falta uma
       * semana, agradecimento. Aqui, e não na gaveta do pedido, porque são
       * momentos de um EVENTO já fechado e é o Dossier que tem o que eles
       * dizem (o sinal pago, a data, o local, o portal). A razão inteira está
       * no cabeçalho do `EnviarModelo`.
       */}
      <EnviarModelo
        key={`modelos-${quote.id}`}
        quote={quote}
        onEnviado={(nome: string, envio: EnvioDoModelo) =>
          onAddEntry({
            id: randomId(),
            at: new Date().toISOString(),
            kind: "message_sent",
            actor: userName,
            /**
             * A linha diz o que ACONTECEU e NOMEIA o modelo — meses depois, o
             * que se quer saber é se o agradecimento chegou a sair, não que
             * «foi enviado um email». Um envio que não saiu (um pedido sem
             * endereço) não pode passar por enviado: é a mesma regra que o
             * `resumoDoEnvio` já segura para o mensageiro.
             */
            summary: envio.emailed
              ? `Modelo «${nome}» enviado ao cliente`
              : `Modelo «${nome}» — o e-mail não saiu, o cliente não recebeu`,
          })
        }
      />
    </section>
  );
}
