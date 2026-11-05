"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Payment, Quote } from "@/lib/orcamento/types";
import {
  comORecebido,
  diaPorExtenso,
  diasDesdeOLembrete,
  mensagemDeLembrete,
  mesCurto,
  PREFIXO_DO_LEMBRETE,
  precisaDeMim,
  previsaoDeEntradas,
  quadroDeCobrancas,
  type Cobranca,
  type FaseDaCobranca,
  type PropostaParaCobrar,
} from "@/lib/orcamento/cobrancas";
import { MEIOS_HABITUAIS } from "@/lib/orcamento/meios-de-pagamento";
import { eur, eur0 } from "@/lib/money";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";
import { parseMoney, randomId, todayKey } from "./util";
import { useCachedList } from "./useCachedList";
import { useToast } from "./Toast";
import { useRelogio } from "./relogio";
import { ESTADO, PRESSAO, PROGRESSO } from "./ui/movimento";
import { useAnular } from "./ui/anular";
import { EmptyState } from "./ui/EmptyState";
import { FolhaOuDialogo } from "./ui/FolhaOuDialogo";
import { BotaoWhatsApp } from "./ui/BotaoWhatsApp";
import { Button } from "./ui/Button";
import { Segmented } from "./ui/Segmented";
import { IconeDoMeio } from "./ui/IconeDoMeio";
import PaymentsPanel from "./PaymentsPanel";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PAGAMENTOS — OS CLIENTES QUE JÁ ACEITARAM, E O QUE FALTA RECEBER DE CADA UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (5/11): «uma área só para gerir pagamentos de clientes, só para os que já
 * aceitaram, e agora temos de organizar o que já foi pago, o que não foi. E
 * metemos lá ao lado das propostas». Escolheu o QUADRO POR FASES e o botão
 * «Lembrar» com a mensagem pronta a copiar. E depois: «quero mesmo que isto
 * esteja um workflow, um design, uma forma de trabalhar incrível».
 *
 * ── O DIA DE QUEM COBRA, NUM ECRÃ ───────────────────────────────────────────
 *  · Em cima, as três respostas (por receber · em atraso · recebido) e a
 *    PREVISÃO dos próximos meses: quanto vai entrar, e quando.
 *  · «Precisa de mim» filtra o quadro para os atrasados e os que vencem esta
 *    semana — a lista do dia. A procura encontra um cliente pelo nome.
 *  · Três colunas que cada cliente atravessa: «Sinal por receber» → «Saldo
 *    por receber» → «Tudo pago». Os atrasados à cabeça, com cor, ícone e a
 *    palavra (nunca só cor).
 *  · Cada cartão resolve-se ALI: «Recebido» regista o próximo pagamento com o
 *    valor já escrito e o meio num toque (com «Anular»), e «Lembrar» abre a
 *    mensagem pronta. O cartão diz quando foi o último lembrete, para ninguém
 *    lembrar o mesmo cliente duas vezes sem saber.
 *  · Tocar no nome abre o painel de Pagamentos inteiro do pedido — o MESMO do
 *    pedido, sem segunda maneira de registar dinheiro.
 *
 * As contas vivem em `lib/orcamento/cobrancas.ts` (puras, testadas). Este
 * ficheiro desenha e grava.
 *
 * ── CUSTO (regra 7 do `GASTAR-POUCO-DESDE-O-INICIO.md`) ─────────────────────
 * Nenhuma rota nova. Os pedidos já estão no ecrã (o resumo traz os
 * pagamentos), e as propostas vêm da MESMA lista leve, em cache, que o painel
 * de Pagamentos e a Visão Geral já pedem. Só gravam o «Recebido» (o PATCH de
 * sempre, com a `base`) e o «Lembrar» (uma linha de histórico).
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

type Filtro = "tudo" | "precisa";

interface Props {
  quotes: Quote[];
  userName?: string;
  onOpenQuote?: (q: Quote) => void;
  onQuoteUpdated?: (q: Quote) => void;
}

/** Sem acentos e em minúsculas, para a procura: «ines» encontra «Inês». */
function semAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  const previsao = useMemo(() => previsaoDeEntradas(quadro, hoje, 6), [quadro, hoje]);
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [procura, setProcura] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [aReceber, setAReceber] = useState<string | null>(null);

  const todas = useMemo(() => [...quadro.sinal, ...quadro.saldo, ...quadro.pago], [quadro]);
  const quantasPrecisam = useMemo(() => todas.filter(precisaDeMim).length, [todas]);
  const quoteDe = (id: string | null) => (id ? (quotes.find((q) => q.id === id) ?? null) : null);
  const cobrancaDe = (id: string | null) =>
    id ? (todas.find((c) => c.quoteId === id) ?? null) : null;

  const visivel = (c: Cobranca) => {
    if (filtro === "precisa" && !precisaDeMim(c)) return false;
    const p = semAcentos(procura.trim());
    return !p || semAcentos(c.nome).includes(p);
  };

  if (todas.length === 0) {
    return (
      <EmptyState
        title="Ainda não há clientes com a proposta aceite"
        description="Quando um cliente aceitar uma proposta (ou um pedido for marcado como Ganho), aparece aqui com o sinal e o saldo a receber."
      />
    );
  }

  const maxPrevisao = Math.max(1, ...previsao.map((m) => m.valor));

  return (
    <div className="flex flex-col gap-[var(--bo-gap-vista)]">
      {/* ── As três respostas, e a previsão ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_1.6fr]">
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
        <section
          aria-labelledby="previsao-titulo"
          className="bo-card flex flex-col gap-2 p-[var(--bo-p-cartao)] sm:col-span-3 lg:col-span-1"
        >
          <h3 id="previsao-titulo" className="bo-eyebrow text-foreground/45">
            Vai entrar
          </h3>
          <ol className="grid grid-cols-6 items-end gap-2" aria-label="Previsão por mês">
            {previsao.map((m, i) => (
              <li key={m.mes} className="flex min-w-0 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-[var(--bo-text-muted)]">
                  {m.valor > 0 ? eur0(m.valor) : "—"}
                </span>
                <span
                  className="flex h-12 w-full items-end overflow-hidden rounded-md bg-[var(--bo-tinta-6)]"
                  aria-hidden="true"
                >
                  <span
                    className={`block w-full origin-bottom rounded-md ${
                      i === 0 && quadro.emAtraso.clientes > 0
                        ? "bg-[var(--bo-perigo)]/70"
                        : "bg-sage-600"
                    } ${PROGRESSO}`}
                    style={{ height: "100%", transform: `scaleY(${m.valor / maxPrevisao})` }}
                  />
                </span>
                {/* O ano numa linha só dele (vazia no ano corrente): «jan 2027»
                    partia em duas no telemóvel e desalinhava as barras. */}
                <span className="flex flex-col items-center text-[11px] leading-tight text-[var(--bo-text-faint)]">
                  <span>{mesCurto(m.mes, hoje).split(" ")[0]}</span>
                  <span>{mesCurto(m.mes, hoje).split(" ")[1] ?? "\u00a0"}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* ── Filtro e procura ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented<Filtro>
          ariaLabel="Que clientes mostrar"
          value={filtro}
          onChange={setFiltro}
          options={[
            { value: "tudo", label: `Todos · ${todas.length}` },
            { value: "precisa", label: `Precisa de mim · ${quantasPrecisam}` },
          ]}
        />
        <input
          type="search"
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar cliente"
          aria-label="Procurar cliente"
          className="bo-input w-full px-3 py-2 text-sm sm:w-64"
        />
      </div>

      {filtro === "precisa" && quantasPrecisam === 0 && (
        <p className="rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-4 py-5 text-center text-sm text-[var(--bo-text-muted)]">
          <span className="inline-flex items-center gap-2 text-sage-600">
            <IconeVisto /> Ninguém em atraso, e nada a vencer esta semana.
          </span>
        </p>
      )}

      {/* ── O quadro ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUNAS.map((col) => {
          const lista = quadro[col.fase].filter(visivel);
          if (filtro === "precisa" && col.fase === "pago") return null;
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
                  {procura.trim() ? "Ninguém com esse nome nesta fase." : "Ninguém nesta fase."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lista.map((c) => (
                    <li key={c.quoteId}>
                      <Cartao
                        cobranca={c}
                        lembrado={diasDesdeOLembrete(quoteDe(c.quoteId) ?? ({} as Quote), hoje)}
                        onAbrir={() => setAberto(c.quoteId)}
                        onRecebido={() => setAReceber(c.quoteId)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {aberto && cobrancaDe(aberto) && quoteDe(aberto) && (
        <Detalhe
          cobranca={cobrancaDe(aberto)!}
          quote={quoteDe(aberto)!}
          hoje={hoje}
          userName={userName}
          onFechar={() => setAberto(null)}
          onOpenQuote={onOpenQuote}
          onQuoteUpdated={onQuoteUpdated}
        />
      )}

      {aReceber && cobrancaDe(aReceber) && quoteDe(aReceber) && (
        <Recebido
          cobranca={cobrancaDe(aReceber)!}
          quote={quoteDe(aReceber)!}
          hoje={hoje}
          onFechar={() => setAReceber(null)}
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
    <div className="bo-card flex flex-col justify-between gap-1 p-[var(--bo-p-cartao)]">
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

function lembradoEmPalavras(dias: number): string {
  if (dias === 0) return "lembrado hoje";
  if (dias === 1) return "lembrado ontem";
  return `lembrado há ${dias} dias`;
}

function Cartao({
  cobranca: c,
  lembrado,
  onAbrir,
  onRecebido,
}: {
  cobranca: Cobranca;
  lembrado: number | null;
  onAbrir: () => void;
  onRecebido: () => void;
}) {
  const prazo = prazoEmPalavras(c);
  const fraccao = fraccaoDaBarra(c.pago, c.total);
  const accao =
    "alvo-toque inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium";
  return (
    <article
      aria-label={c.nome || "Sem nome"}
      className={`rounded-2xl border bg-[var(--bo-surface)] ${
        c.atraso ? "border-[var(--bo-perigo)]/40" : "border-[var(--bo-hairline)]"
      } ${ESTADO}`}
    >
      <button
        type="button"
        onClick={onAbrir}
        aria-label={`Abrir os pagamentos de ${c.nome || "Sem nome"}`}
        className={`block w-full rounded-2xl p-3.5 text-left hover:bg-[var(--bo-tinta-3)] ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
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

      {c.proximo && c.proximo.valor > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--bo-hairline)] px-3.5 py-2.5">
          <button
            type="button"
            onClick={onRecebido}
            className={`${accao} bg-sage-600 text-white hover:bg-[var(--bo-accent-hover)] ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
          >
            <IconeVisto /> Recebido
          </button>
          <button
            type="button"
            onClick={onAbrir}
            className={`${accao} border border-[var(--bo-hairline-strong)] text-[var(--bo-tinta-72)] hover:border-sage-600/50 hover:text-sage-600 ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
          >
            <IconeSino /> {lembrado === null ? "Lembrar" : "Lembrar outra vez"}
          </button>
          {lembrado !== null && (
            <span className="ml-auto text-[11px] text-[var(--bo-text-faint)]">
              {lembradoEmPalavras(lembrado)}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

/**
 * «Recebido» num toque: o próximo pagamento do cartão, com o valor já escrito,
 * o meio (com o ícone de cada um) e o dia de hoje. Grava pelo PATCH de sempre,
 * com a `base` (se alguém mexeu entretanto, recusa e mostra a versão
 * guardada), e oferece «Anular».
 */
function Recebido({
  cobranca: c,
  quote,
  hoje,
  onFechar,
  onQuoteUpdated,
}: {
  cobranca: Cobranca;
  quote: Quote;
  hoje: string;
  onFechar: () => void;
  onQuoteUpdated?: (q: Quote) => void;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  const p = c.proximo!;
  const [valor, setValor] = useState(String(p.valor).replace(".", ","));
  const [meio, setMeio] = useState("");
  const [dia, setDia] = useState(hoje);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const qual = p.tipo === "sinal" ? `o sinal de ${c.pctSinal}%` : "o saldo";

  async function gravar(
    lista: Payment[],
    antes: Payment[],
  ): Promise<Payment[] | "conflito" | null> {
    try {
      const res = await fetch(`/api/orcamento/${encodeURIComponent(quote.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payments: lista, base: { payments: antes } }),
      });
      if (res.status === 409) {
        const corpo = (await res.json().catch(() => null)) as {
          current?: { payments?: Payment[] };
        } | null;
        const doServidor = corpo?.current?.payments;
        if (doServidor) onQuoteUpdated?.({ ...quote, payments: doServidor });
        return "conflito";
      }
      return res.ok ? lista : null;
    } catch {
      return null;
    }
  }

  async function confirmar() {
    const n = parseMoney(valor);
    if (n === undefined || !(n > 0)) {
      setErro("Escreve o valor que entrou, maior do que zero.");
      return;
    }
    setErro(null);
    setAGravar(true);
    const antes = quote.payments ?? [];
    const lista = comORecebido(quote, c, { valor: n, dia, meio, novoId: randomId() });
    const r = await gravar(lista, antes);
    setAGravar(false);
    if (r === "conflito") {
      toast(
        "Os pagamentos deste cliente mudaram noutro sítio. Abre-o para ver a versão guardada.",
        "error",
      );
      onFechar();
      return;
    }
    if (!r) {
      setErro("Não foi possível gravar agora. Verifica a ligação e tenta outra vez.");
      return;
    }
    onQuoteUpdated?.({ ...quote, payments: r });
    onFechar();
    anular(`${eur(n)} de ${c.nome} registado como recebido.`, async () => {
      const volta = await gravar(antes, r);
      if (volta === "conflito" || !volta)
        throw new Error("Não foi possível anular: o registo mudou.");
      onQuoteUpdated?.({ ...quote, payments: antes });
    });
  }

  return (
    <FolhaOuDialogo
      aberto
      onFechar={onFechar}
      sobretitulo={c.nome || "Sem nome"}
      titulo={p.tipo === "sinal" ? "Recebido o sinal" : "Recebido o saldo"}
      descricao={`Regista ${qual}. Podes acertar o valor se entrou uma parte.`}
      largura="sm"
      bloqueado={aGravar}
      accoes={
        <>
          <Button variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => void confirmar()} disabled={aGravar}>
            {aGravar ? "A gravar…" : "Registar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--bo-text-muted)]">Valor recebido</span>
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            // Enter no valor regista, como no botão.
            onKeyDown={(e) => {
              if (e.key === "Enter" && !aGravar) {
                e.preventDefault();
                void confirmar();
              }
            }}
            aria-invalid={erro ? true : undefined}
            className="bo-input px-3 py-2.5 text-right text-lg tabular-nums text-[var(--bo-text)]"
          />
        </label>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-xs font-medium text-[var(--bo-text-muted)]">
            Como pagou
          </legend>
          <div className="flex flex-wrap gap-2">
            {MEIOS_HABITUAIS.map(({ meio: m, nome }) => (
              <button
                key={m}
                type="button"
                aria-pressed={meio === nome}
                onClick={() => setMeio(meio === nome ? "" : nome)}
                className={`alvo-toque inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${
                  meio === nome
                    ? "border-sage-600 bg-sage-600/10 text-sage-600"
                    : "border-[var(--bo-hairline-strong)] text-[var(--bo-tinta-72)] hover:border-sage-600/50"
                } ${FOCUS_RING} ${ESTADO} ${PRESSAO}`}
              >
                <IconeDoMeio meio={m} />
                {nome}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--bo-text-muted)]">Dia</span>
          <input
            type="date"
            value={dia}
            onChange={(e) => setDia(e.target.value || hoje)}
            className="bo-input px-3 py-2 text-sm text-[var(--bo-tinta-72)]"
          />
        </label>
        {erro && (
          <p role="alert" className="text-xs text-[var(--bo-perigo)]">
            {erro}
          </p>
        )}
      </div>
    </FolhaOuDialogo>
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
  const lembrado = diasDesdeOLembrete(quote, hoje);

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
      summary: `${PREFIXO_DO_LEMBRETE} (${como}): ${
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
            <h4
              id="lembrete-titulo"
              className="bo-eyebrow flex items-center justify-between gap-2 text-foreground/45"
            >
              <span>Lembrar o cliente</span>
              {lembrado !== null && (
                <span className="normal-case tracking-normal text-[11px] text-[var(--bo-text-faint)]">
                  {lembradoEmPalavras(lembrado)}
                </span>
              )}
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
function Icone({ children }: { children: ReactNode }) {
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
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

function IconeAlerta() {
  return (
    <Icone>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4M12 17h.01" />
    </Icone>
  );
}

function IconeRelogio() {
  return (
    <Icone>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icone>
  );
}

function IconeVisto() {
  return (
    <Icone>
      <path d="M20 6 9 17l-5-5" />
    </Icone>
  );
}

function IconeSino() {
  return (
    <Icone>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icone>
  );
}
