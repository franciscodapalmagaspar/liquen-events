"use client";

import { useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import {
  diaPorExtenso,
  mensagemDeLembrete,
  quadroDeCobrancas,
  type Cobranca,
  type FaseDaCobranca,
  type PropostaParaCobrar,
} from "@/lib/orcamento/cobrancas";
import { eur, eur0 } from "@/lib/money";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";
import { randomId, todayKey } from "./util";
import { useCachedList } from "./useCachedList";
import { useToast } from "./Toast";
import { useRelogio } from "./relogio";
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";
import { EmptyState } from "./ui/EmptyState";
import { FolhaOuDialogo } from "./ui/FolhaOuDialogo";
import { BotaoWhatsApp } from "./ui/BotaoWhatsApp";
import { Button } from "./ui/Button";
import PaymentsPanel from "./PaymentsPanel";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PAGAMENTOS — OS CLIENTES QUE JÁ ACEITARAM, E O QUE FALTA RECEBER DE CADA UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «uma área só para gerir pagamentos de clientes, só para os que já
 * aceitaram, e agora temos de organizar o que já foi pago, o que não foi. E
 * metemos lá ao lado das propostas». Escolheu o QUADRO POR FASES e o botão
 * «Lembrar» com a mensagem pronta a copiar.
 *
 * ── O QUE SE VÊ ─────────────────────────────────────────────────────────────
 *  · Em cima, as três respostas: quanto falta receber, quanto está em atraso
 *    (e de quantos clientes), quanto já entrou.
 *  · Três colunas que cada cliente atravessa: «Sinal por receber» → «Saldo
 *    por receber» → «Tudo pago». Os atrasados vêm à cabeça de cada coluna, e
 *    dizem-no com cor, ícone e a palavra (nunca só pela cor).
 *  · Tocar num cliente abre o painel de Pagamentos dele ali mesmo — o MESMO
 *    painel do pedido, sem segunda maneira de registar dinheiro — e a
 *    mensagem do lembrete, para copiar ou mandar pelo WhatsApp.
 *
 * As contas vivem em `lib/orcamento/cobrancas.ts` (puras, testadas). Este
 * ficheiro só desenha.
 *
 * ── CUSTO (regra 7 do `GASTAR-POUCO-DESDE-O-INICIO.md`) ─────────────────────
 * Nenhum pedido novo: os pedidos já estão no ecrã (a lista resumida, com os
 * pagamentos), e as propostas vêm da MESMA lista leve, em cache, que o painel
 * de Pagamentos e as contas da Visão Geral já pedem. Só o «Lembrar» grava uma
 * linha no histórico do pedido.
 */

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bo-marca)]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const COLUNAS: { fase: FaseDaCobranca; titulo: string; ajuda: string }[] = [
  {
    fase: "sinal",
    titulo: "Sinal por receber",
    ajuda: "Aceitaram a proposta e ainda falta o sinal.",
  },
  {
    fase: "saldo",
    titulo: "Saldo por receber",
    ajuda: "O sinal entrou. O saldo vence um mês antes do evento.",
  },
  {
    fase: "pago",
    titulo: "Tudo pago",
    ajuda: "Não falta receber nada.",
  },
];

interface Props {
  quotes: Quote[];
  userName?: string;
  onOpenQuote?: (q: Quote) => void;
  onQuoteUpdated?: (q: Quote) => void;
}

export default function Pagamentos({ quotes, userName, onOpenQuote, onQuoteUpdated }: Props) {
  const { data: propostas } = useCachedList<PropostaParaCobrar[]>(
    "propostas-leves",
    "/api/propostas?semDoc=1",
  );
  // O dia muda à meia-noite com o ecrã aberto: os atrasos têm de mudar com ele.
  useRelogio();
  const hoje = todayKey();
  const quadro = useMemo(
    () => quadroDeCobrancas(quotes, Array.isArray(propostas) ? propostas : [], hoje),
    [quotes, propostas, hoje],
  );
  const [aberto, setAberto] = useState<string | null>(null);
  const cobrancaAberta = useMemo(() => {
    if (!aberto) return null;
    return (
      [...quadro.sinal, ...quadro.saldo, ...quadro.pago].find((c) => c.quoteId === aberto) ?? null
    );
  }, [aberto, quadro]);
  const quoteAberto = aberto ? (quotes.find((q) => q.id === aberto) ?? null) : null;

  const total = quadro.sinal.length + quadro.saldo.length + quadro.pago.length;

  if (total === 0) {
    return (
      <EmptyState
        title="Ainda não há clientes com a proposta aceite"
        description="Quando um cliente aceitar uma proposta (ou um pedido for marcado como Ganho), aparece aqui com o sinal e o saldo a receber."
      />
    );
  }

  return (
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* ── As três respostas ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Numero rotulo="Por receber" valor={eur0(quadro.porReceber)} />
        <Numero
          rotulo={
            quadro.emAtraso.clientes === 1
              ? "Em atraso · 1 cliente"
              : `Em atraso · ${quadro.emAtraso.clientes} clientes`
          }
          valor={eur0(quadro.emAtraso.valor)}
          alerta={quadro.emAtraso.clientes > 0}
        />
        <Numero rotulo="Recebido" valor={eur0(quadro.recebido)} sucesso />
      </div>

      {/* ── O quadro ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = quadro[col.fase];
          const soma = lista.reduce(
            (s, c) => s + (col.fase === "pago" ? c.total : (c.proximo?.valor ?? 0)),
            0,
          );
          return (
            <section
              key={col.fase}
              aria-labelledby={`cobrancas-${col.fase}`}
              className="flex min-w-0 flex-col gap-2.5 rounded-[var(--bo-radius-lg)] border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-3"
            >
              <header className="flex items-baseline justify-between gap-3 px-1">
                <h3
                  id={`cobrancas-${col.fase}`}
                  className="text-sm font-semibold text-[var(--bo-text)]"
                >
                  {col.titulo}
                  <span className="ml-2 rounded-full bg-[var(--bo-tinta-6)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--bo-text-muted)]">
                    {lista.length}
                  </span>
                </h3>
                {lista.length > 0 && (
                  <span className="text-xs tabular-nums text-[var(--bo-text-muted)]">
                    {eur0(soma)}
                  </span>
                )}
              </header>
              <p className="px-1 text-[11px] leading-snug text-[var(--bo-text-faint)]">
                {col.ajuda}
              </p>
              {lista.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--bo-hairline)] px-3 py-6 text-center text-xs text-[var(--bo-text-faint)]">
                  Ninguém nesta fase.
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lista.map((c) => (
                    <li key={c.quoteId}>
                      <Cartao cobranca={c} onAbrir={() => setAberto(c.quoteId)} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {cobrancaAberta && quoteAberto && (
        <Detalhe
          cobranca={cobrancaAberta}
          quote={quoteAberto}
          hoje={hoje}
          userName={userName}
          onFechar={() => setAberto(null)}
          onOpenQuote={onOpenQuote}
          onQuoteUpdated={onQuoteUpdated}
        />
      )}
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  alerta,
  sucesso,
}: {
  rotulo: string;
  valor: string;
  alerta?: boolean;
  sucesso?: boolean;
}) {
  return (
    <div className="bo-card flex flex-col gap-1 p-[var(--bo-p-cartao)]">
      <p
        className={`text-2xl font-light leading-none tabular-nums ${
          alerta ? "text-[var(--bo-perigo)]" : sucesso ? "text-sage-600" : "text-[var(--bo-text)]"
        }`}
      >
        {valor}
      </p>
      <p className="bo-eyebrow inline-flex items-center gap-1.5 text-foreground/45">
        {alerta && <IconeAlerta />}
        {rotulo}
      </p>
    </div>
  );
}

/** O que o cartão diz do prazo: sempre palavra (e, no atraso, ícone e cor). */
function prazoEmPalavras(c: Cobranca): string | null {
  const d = c.diasParaOPrazo;
  if (d === null) return c.fase === "pago" ? null : "sem prazo";
  if (d < 0) return d === -1 ? "em atraso · 1 dia" : `em atraso · ${-d} dias`;
  if (d === 0) return "vence hoje";
  if (d === 1) return "vence amanhã";
  if (d <= 30) return `vence em ${d} dias`;
  return `vence a ${diaPorExtenso(c.proximo!.prazo!)}`;
}

function Cartao({ cobranca: c, onAbrir }: { cobranca: Cobranca; onAbrir: () => void }) {
  const prazo = prazoEmPalavras(c);
  const fraccao = fraccaoDaBarra(c.pago, c.total);
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`w-full rounded-2xl border bg-[var(--bo-surface)] p-3.5 text-left hover:border-[var(--bo-hairline-strong)] ${
        c.atraso ? "border-[var(--bo-perigo)]/40" : "border-[var(--bo-hairline)]"
      } ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-[var(--bo-text)]">
          {c.nome || "Sem nome"}
        </span>
        {c.fase === "pago" ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-sage-600">
            <IconeVisto /> Pago
          </span>
        ) : (
          prazo && (
            <span
              className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${
                c.atraso
                  ? "text-[var(--bo-perigo)]"
                  : (c.diasParaOPrazo ?? 99) <= 7
                    ? "text-[var(--bo-aviso)]"
                    : "text-[var(--bo-text-muted)]"
              }`}
            >
              {c.atraso ? <IconeAlerta /> : <IconeRelogio />}
              {prazo}
            </span>
          )
        )}
      </span>

      <span className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-[var(--bo-text-muted)]">
          {c.proximo ? (c.proximo.tipo === "sinal" ? `Sinal ${c.pctSinal}%` : "Saldo") : "Total"}
          {c.dataDoEvento ? ` · evento a ${diaPorExtenso(c.dataDoEvento)}` : ""}
        </span>
        <span className="font-semibold tabular-nums text-[var(--bo-text)]">
          {eur(c.proximo ? c.proximo.valor : c.total)}
        </span>
      </span>

      <span
        className="mt-2.5 block h-1.5 overflow-hidden rounded-full bg-[var(--bo-tinta-6)]"
        role="progressbar"
        aria-label="Recebido do total"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraccao * 100)}
        aria-valuetext={`${eur(c.pago)} recebido de ${eur(c.total)}`}
      >
        <span
          className={`block h-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
          style={{ transform: `scaleX(${fraccao})` }}
        />
      </span>
      <span className="mt-1 block text-[11px] tabular-nums text-[var(--bo-text-faint)]">
        {eur(c.pago)} de {eur(c.total)}
        {c.daPropostaAceite ? "" : " · valor do pedido"}
      </span>
    </button>
  );
}

function Detalhe({
  cobranca: c,
  quote,
  hoje,
  userName,
  onFechar,
  onOpenQuote,
  onQuoteUpdated,
}: {
  cobranca: Cobranca;
  quote: Quote;
  hoje: string;
  userName?: string;
  onFechar: () => void;
  onOpenQuote?: (q: Quote) => void;
  onQuoteUpdated?: (q: Quote) => void;
}) {
  const { toast } = useToast();
  const mensagem = mensagemDeLembrete(c, hoje);
  const [registado, setRegistado] = useState(false);

  /**
   * Fica no histórico do pedido que alguém preparou o lembrete — não que ele
   * seguiu: quem o envia é a pessoa, e o sistema não sabe se carregou em
   * enviar. Uma vez por abertura do painel, para dois cliques não serem duas
   * linhas.
   */
  async function registarLembrete(como: string) {
    if (registado || !c.proximo) return;
    setRegistado(true);
    const entrada = {
      id: randomId(),
      at: new Date().toISOString(),
      kind: "message_sent" as const,
      ...(userName ? { actor: userName } : {}),
      summary: `Lembrete de pagamento preparado (${como}): ${
        c.proximo.tipo === "sinal" ? `sinal de ${c.pctSinal}%` : "saldo"
      } de ${eur(c.proximo.valor)}${c.proximo.prazo ? `, prazo ${diaPorExtenso(c.proximo.prazo)}` : ""}.`,
    };
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(quote.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityLogAppend: [entrada] }),
      });
      if (res.ok) {
        onQuoteUpdated?.({ ...quote, activityLog: [...(quote.activityLog ?? []), entrada] });
      }
    } catch {
      // O lembrete já está na mão dela; o histórico é um extra.
    }
  }

  async function copiar() {
    if (!mensagem) return;
    try {
      await navigator.clipboard.writeText(mensagem);
      toast("Mensagem copiada — cola no WhatsApp ou no email.", "success");
      void registarLembrete("copiado");
    } catch {
      toast("Não deu para copiar. Seleciona o texto e copia à mão.", "error");
    }
  }

  return (
    <FolhaOuDialogo
      aberto
      onFechar={onFechar}
      sobretitulo="Pagamentos"
      titulo={c.nome || "Sem nome"}
      descricao={`Total ${eur(c.total)}${
        c.daPropostaAceite ? " (proposta aceite)" : " (valor do pedido)"
      }${c.dataDoEvento ? ` · evento a ${diaPorExtenso(c.dataDoEvento)}` : ""}`}
      largura="lg"
      accoes={
        <>
          {onOpenQuote && (
            <Button variant="secondary" size="sm" onClick={() => onOpenQuote(quote)}>
              Abrir o pedido
            </Button>
          )}
          <Button size="sm" onClick={onFechar}>
            Feito
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {mensagem && (
          <section aria-labelledby="lembrete-titulo" className="flex flex-col gap-2">
            <h4 id="lembrete-titulo" className="bo-eyebrow text-foreground/45">
              Lembrar o cliente
            </h4>
            <textarea
              readOnly
              value={mensagem}
              rows={9}
              aria-label="Mensagem do lembrete"
              className="bo-input w-full resize-none px-3 py-2 text-sm leading-relaxed text-[var(--bo-tinta-72)]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => void copiar()}>
                Copiar mensagem
              </Button>
              <span onClickCapture={() => void registarLembrete("WhatsApp")}>
                <BotaoWhatsApp texto={mensagem} />
              </span>
            </div>
            <p className="text-[11px] leading-snug text-[var(--bo-text-faint)]">
              Nada é enviado sozinho. Fica no histórico do pedido que o lembrete foi preparado.
            </p>
          </section>
        )}
        <PaymentsPanel
          key={`cob-${quote.id}`}
          quote={quote}
          onChange={(payments) => onQuoteUpdated?.({ ...quote, payments })}
        />
      </div>
    </FolhaOuDialogo>
  );
}

/* Ícones (traços da Lucide, como manda o §8.1 do sistema de design). */
function IconeAlerta() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function IconeRelogio() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function IconeVisto() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
