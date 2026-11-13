"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  type DossierData,
  type EventStage,
  type EventMetrics,
  type NextAction,
} from "@/lib/orcamento/dossier";
import { eventTagLabel } from "@/lib/orcamento/data";
import { downloadEventIcs, printEventDossier, printRunSheet } from "../../export";
import { Button } from "../../ui";
import { useDesceu } from "../../ui/adaptativo";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/** yyyy-mm-dd (ou ISO) → "12 set 2026"; null se ausente/inválida. */
function fmtDate(v?: string | null): string | null {
  if (!v) return null;
  const dt = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/** Datas a fixar sob cada marco do stepper, quando existirem. */
function stageDates(d: DossierData): Partial<Record<EventStage, string>> {
  // As datas do sinal e do saldo vêm das linhas de pagamento — era o livro de
  // faturas que as dava (a `paidAt` da factura), e ele saiu com a facturação.
  // A linha de pagamento traz a data do dia em que o dinheiro entrou, que é
  // precisamente o que estes marcos querem fixar.
  const pagos = (d.quote.payments ?? []).filter((p) => p.paid);
  const sinal = pagos.find((p) => p.kind === "sinal");
  const saldo = pagos.find((p) => p.kind === "saldo");
  return {
    lead: d.quote.submittedAt,
    proposta_enviada: d.proposal?.sentAt,
    aceite: d.contract?.acceptedAt ?? d.proposal?.respondedAt,
    sinal_pago: sinal?.date,
    concluido: saldo?.date ?? d.quote.date,
  };
}

interface Props {
  data: DossierData;
  stage: EventStage;
  metrics: EventMetrics;
  next: NextAction;
  lang: Locale;
  onScrollTo: (id: string) => void;
}

export default function DossierHeader({ data, stage, next, lang, onScrollTo }: Props) {
  const { quote } = data;
  const stepRef = useRef<HTMLDivElement>(null);

  /**
   * ── O CABEÇALHO ENCOLHE ASSIM QUE ELA COMEÇA A DESCER ──────────────────
   *
   * MEDIDO a 375×667 (iPhone SE), somando as classes: este cabeçalho gastava
   * 513 px — 77% do ecrã — e ficava lá, colado (`sticky top-0`), enquanto ela
   * rolava o dossier inteiro. Dos 513, 315 são gente que só se lê UMA vez: o
   * link de voltar com o rótulo «Pedidos» (44 de alvo + 12 de folga), o eyebrow
   * «Dossier do Evento» (23), a linha de factos por baixo do nome (26) e o
   * cartão de «Próxima ação» (190, mais os 20 de folga acima dele).
   *
   * Depois desta mudança: 485 px em repouso (a escala do espaço aperta o
   * enchimento) e 178 px assim que ela começa a descer — de 77% do ecrã para
   * 27%.
   *
   * O que NÃO pode sair, porque é o que dá contexto a quem já rolou: o NOME do
   * evento (senão a faixa colada deixa de dizer de que evento se trata) e a
   * FILA DE ACÇÕES (partilhar, imprimir, .ics — é o que se vai buscar a meio de
   * uma montagem).
   *
   * E a SAÍDA fica sempre. O dossier vive em `evento/[id]`, fora do
   * `AdminClient`: não há aqui barra de baixo nem gaveta, e este link é o único
   * caminho de volta ao back office. Esconder o único caminho de volta atrás de
   * «rola até cima outra vez» era trocar altura por uma pessoa presa num ecrã;
   * o que sai é só a PALAVRA «Pedidos», e a seta sobe para a linha do nome —
   * a linha já tem 44 px de alto por causa do alvo de toque, portanto os 56 px
   * da linha própria devolvem-se quase inteiros.
   *
   * Sem transição nenhuma, de propósito: o que muda aqui é geometria (linhas
   * que saem da árvore), e animar geometria é recalcular layout a cada frame no
   * meio do scroll — exactamente o que o `Fluidez.contrato.test.ts` existe para
   * travar. Ver a nota do `useDesceu` para a histerese (encolhe aos 24 px,
   * volta a crescer aos 8) que impede a faixa de piscar com o dedo pousado.
   */
  const desceu = useDesceu();

  // Confirmação inline da cópia — a árvore do Dossier não está dentro do
  // ToastProvider (só a raiz de administração está), por isso mostramos um
  // "Copiado ✓" transitório no próprio botão em vez de um toast.

  const dates = stageDates(data);
  const reachedIdx = stage === "perdido" ? -1 : STAGE_ORDER.indexOf(stage);

  // Facts do título: cliente · evento · data · local.
  const titleBits = [
    // A etiqueta do evento: o nome que o cliente deu, ou o tipo no singular
    // (o formulário público já não grava o rótulo da lista no `eventName`).
    eventTagLabel(quote, "pt") || null,
    fmtDate(quote.date),
    quote.location?.trim() || null,
  ].filter(Boolean);

  // Onde a próxima ação aponta: cada uma navega para a zona respetiva; arquivar
  // fica como marcador (fase de quick-actions). O portal do cliente, que abria
  // um link, saiu — achado n.º 37, decisão dela.
  function zoneFor(kind: NextAction["kind"]): string | null {
    switch (kind) {
      case "proposta":
        return "zone-comunicacao";
      case "sinal":
      case "saldo":
        return "zone-financeiro";
      case "producao":
      case "runsheet":
        return "zone-producao";
      default:
        return null;
    }
  }
  const zone = zoneFor(next.kind);

  return (
    <header className="sticky top-0 z-20 bg-[var(--bo-surface)]/97 border-b border-[var(--bo-hairline)]">
      <div
        className={`px-4 sm:px-6 lg:px-10 flex flex-col ${
          desceu ? "py-2 gap-2" : "py-[var(--bo-p-vista)] gap-[var(--bo-gap-vista)]"
        }`}
      >
        {/* Linha 1 — voltar + título + próxima ação */}
        <div
          className={`flex flex-col lg:flex-row lg:items-start ${
            desceu ? "gap-2" : "gap-[var(--bo-gap-vista)]"
          }`}
        >
          <div className="min-w-0 flex-1">
            {/* A LINHA DE IDENTIDADE. Ao descer vira uma linha só — seta +
                nome —; em repouso o `div` não tem classe nenhuma e os três
                filhos empilham-se em fluxo normal, exactamente como antes.
                Um só `<Link>` e um só `<h1>`: montar duas cópias com
                `hidden`/`sm:hidden` dava dois títulos de nível 1 na página e
                dois estados a viver ao mesmo tempo (ver `useMedida.ts`). */}
            <div className={desceu ? "flex items-center gap-2 min-w-0" : undefined}>
              {/* A ÚNICA SAÍDA DESTE ECRÃ, e media 65×16 px.
                O dossier vive numa rota própria (`evento/[id]`), fora do
                `AdminClient`: aqui não há barra de baixo nem gaveta — medido,
                as duas dão `false`. Este link é o único caminho de volta ao
                back office, e tinha 16 px de altura, pouco mais de um terço do
                mínimo, encostado ao topo do ecrã.

                Um alvo falhado noutro sítio custa um toque repetido; falhado
                aqui, custa procurar como se sai de um ecrã que não tem outra
                porta. `alvo-toque` dá-lhe 44 px de altura sem lhe mexer na
                letra nem na cor. */}
              <Link
                href={`/${lang}/orcamento/admin`}
                className={`alvo-toque !justify-start inline-flex items-center gap-1.5 text-foreground/45 text-xs font-medium hover:text-sage-600 ${ESTADO} ${PRESSAO} ${
                  desceu ? "shrink-0" : "mb-3"
                }`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {/* A palavra sai do ECRÃ, não da acessibilidade: `sr-only`
                    mantém o nome do link igual nos dois estados, e um leitor de
                    ecrã continua a anunciar «Pedidos». (`hidden` estava fora de
                    questão — o `.alvo-toque` põe `display:inline-flex` sob
                    ponteiro grosso e ressuscitava-a.) */}
                <span className={desceu ? "sr-only" : undefined}>Pedidos</span>
              </Link>
              {/* «Dossier do Evento» por cima do nome do evento diz o que o
                  ecrã inteiro já diz. Fica para quem chega; sai para quem já
                  desceu. */}
              {!desceu && <p className="bo-eyebrow mb-1.5">Dossier do Evento</p>}
              <h1
                className="font-display text-[var(--bo-text)] font-medium leading-tight truncate min-w-0"
                style={{ fontSize: "clamp(22px, 2.6vw, 32px)" }}
              >
                {quote.name}
              </h1>
            </div>
            {/* Tipo · data · local. É a ficha do evento, lê-se à chegada, e
                está toda outra vez na coluna lateral. */}
            {!desceu && titleBits.length > 0 && (
              <p className="text-[var(--bo-text-muted)] text-sm mt-1.5 truncate">
                {titleBits.join(" · ")}
              </p>
            )}

            {/* Barra de ações — partilha / impressão / calendário. Só
                ferramentas seguras e client-safe (export.ts + APIs do browser);
                nada que gere dinheiro (sinal/saldo são emitidos noutro lado).
                Ícones sempre visíveis, rótulos escondidos em ecrãs pequenos,
                tal como o cabeçalho da administração. */}
            {/* MEDIDO a 375 px: os quatro botões desta barra ficam sem rótulo
                (`hidden sm:inline`) e mediam 38 px de largura, a 6 px uns dos
                outros — quatro alvos abaixo do mínimo, encostados, e três
                deles IMPRIMEM ou descarregam. Falhar o toque aqui manda um
                dossier inteiro para a impressora.

                O `alvo-toque` de cada botão dá-lhes os 44 px de largura; este
                `pointer-coarse:gap-2` dá os 8 px de folga entre eles. Somados,
                os cinco alvos e as folgas ocupam ~269 dos 343 px da coluna,
                portanto continua tudo numa linha só — o `flex-wrap` não chega
                a ser preciso. Com rato fica exactamente como estava. */}
            <div className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2 mt-4">
              <Button
                variant="ghost"
                size="sm"
                className="alvo-toque"
                onClick={() => printEventDossier(quote)}
                title="Imprimir o dossier completo: contactos, financeiro, cronograma e convidados"
                // Os ícones estavam trocados (auditoria de 13/11, n.º 14): a
                // impressora é a do «Imprimir Dossier», e o documento com
                // linhas é o da timeline. E no telemóvel o rótulo some
                // (`hidden sm:inline` é `display: none`, que também o tira ao
                // leitor de ecrã): o nome vai no `aria-label`.
                aria-label="Imprimir Dossier"
                iconLeft={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect x="6" y="14" width="12" height="7" rx="1" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Imprimir Dossier</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="alvo-toque"
                onClick={() => printRunSheet(quote)}
                title="Imprimir o cronograma e a checklist do evento"
                aria-label="Imprimir o cronograma"
                iconLeft={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Cronograma</span>
              </Button>

              {/* .ics — só quando o evento tem data (buildEventIcs devolve null
                  sem data, por isso o botão não teria efeito). */}
              {quote.date && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="alvo-toque"
                  onClick={() => downloadEventIcs(quote)}
                  title="Descarregar .ics para adicionar ao calendário (Google/Apple/Outlook)"
                  aria-label="Descarregar .ics para o calendário"
                  iconLeft={
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                      <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                    </svg>
                  }
                >
                  <span className="hidden sm:inline">.ics</span>
                </Button>
              )}
            </div>
          </div>

          {/* ── O CARTÃO DE «PRÓXIMA AÇÃO», E PORQUE É ELE O MAIOR CORTE ──────
              MEDIDO a 375 px: 191 px de altura com a folga acima — mais de um
              quarto do ecrã. Diz o que fazer a seguir, que é a primeira coisa
              a ler ao abrir o dossier e a menos útil quando já se está a meio
              dele. Sai ao descer; o botão que ele oferece leva a uma zona que a
              essa altura já está debaixo do dedo.
              O enchimento passa a ler `--bo-p-cartao` (14 no telemóvel, 24 a
              partir de 640) em vez dos 20 fixos que vinham de um monitor. */}
          {!desceu && (
            <div className="shrink-0 lg:max-w-xs w-full lg:w-auto bg-sage-600/[0.06] border border-sage-600/20 rounded-2xl p-[var(--bo-p-cartao)]">
              <p className="text-sage-600/70 text-[10px] tracking-[0.16em] uppercase font-semibold mb-2">
                Próxima ação
              </p>
              <p className="text-[var(--bo-text)] text-sm font-medium leading-snug mb-1.5">
                {next.label}
              </p>
              <p className="text-[var(--bo-text-muted)] text-xs leading-relaxed mb-4">
                {next.hint}
              </p>
              {/* O botão da próxima acção media 148×40 — quatro píxeis abaixo do
                  mínimo, e é o alvo que este cartão inteiro existe para oferecer.
                  `pointer-coarse:h-11` é o mesmo degrau que o `ui/Button.tsx` já
                  dá aos tamanhos `sm` e `md`; estes três estão escritos à mão e
                  por isso ficaram de fora. Os estados (zona e
                  desactivado) sobem juntos: um cartão onde a altura do botão
                  muda com o estado lê-se como um salto. */}
              {zone ? (
                <button
                  type="button"
                  onClick={() => onScrollTo(zone)}
                  /* ── O AFUNDAR ESTAVA ESCRITO E NÃO ACONTECIA ──────────────
                     Tinha `motion-safe:active:scale-[0.98]` — e a lista ao lado
                     era `transition-colors`, que no Tailwind v4 sai como
                     `color, background-color, border-color, outline-color,
                     text-decoration-color, fill, stroke`. `scale` não está lá.
                     O botão encolhia na mesma, mas a CORTE SECO, 0 ms — e os
                     `duration-150` do lado (o valor de omissão do Tailwind
                     copiado à mão, que ninguém escolheu) não lhe tocavam. É a
                     mesma avaria que o `ui/movimento.ts` conta ter apanhado no
                     `Button`, viva neste ficheiro.
                     O `ESTADO` traz a lista certa (com `scale`) e o degrau da
                     casa; o `PRESSAO` traz os 20 ms do toque. */
                  className={`inline-flex items-center gap-2 h-10 pointer-coarse:h-11 px-4 bg-sage-600 hover:bg-[var(--bo-marca)] text-white/95 text-sm font-medium rounded-full ${ESTADO} ${PRESSAO}`}
                >
                  {next.label}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : (
                // arquivar / none — ainda por ligar (fase de quick-actions).
                <button
                  type="button"
                  disabled
                  title="Disponível na fase de ações rápidas"
                  className={`inline-flex items-center gap-2 h-10 pointer-coarse:h-11 px-4 bg-[var(--bo-surface)]/10 text-white/45 text-sm font-medium rounded-xl cursor-not-allowed ${ESTADO} ${PRESSAO}`}
                >
                  {next.label}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Linha 2 — stepper de fases (roving tabindex, setas navegam) */}
        <div
          ref={stepRef}
          role="group"
          aria-label="Fase do evento"
          className="flex items-stretch gap-0 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {stage === "perdido" ? (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bo-perigo)]/12 text-[var(--bo-perigo)] text-[11px] tracking-[0.12em] uppercase font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--bo-perigo)]" />
              Negócio perdido
            </span>
          ) : (
            STAGE_ORDER.map((s, i, arr) => {
              const reached = i <= reachedIdx;
              const current = s === stage;
              const when = fmtDate(dates[s]);
              return (
                <div key={s} className="flex items-center shrink-0">
                  <button
                    tabIndex={current ? 0 : -1}
                    aria-current={current ? "step" : undefined}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const dir = e.key === "ArrowRight" ? 1 : -1;
                      const btns =
                        stepRef.current?.querySelectorAll<HTMLButtonElement>("button[data-step]");
                      btns?.[(i + dir + arr.length) % arr.length]?.focus();
                    }}
                    data-step
                    className={`group flex flex-col items-center gap-1 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/40 rounded-lg ${ESTADO} ${PRESSAO}`}
                    title={when ? `${STAGE_LABELS[s]} · ${when}` : STAGE_LABELS[s]}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full border ${ESTADO} ${
                        current
                          ? "bg-sage-600 border-sage-600 ring-4 ring-sage-600/15"
                          : reached
                            ? "bg-sage-600 border-sage-600"
                            : "bg-transparent border-foreground/25"
                      }`}
                    />
                    <span
                      className={`text-[9px] tracking-[0.08em] uppercase whitespace-nowrap ${ESTADO} ${
                        current
                          ? "text-[var(--bo-text)] font-semibold"
                          : reached
                            ? "text-[var(--bo-text-muted)]"
                            : "text-foreground/30"
                      }`}
                    >
                      {STAGE_LABELS[s]}
                    </span>
                    <span className="text-foreground/25 text-[8px] tabular-nums h-3">
                      {when ?? ""}
                    </span>
                  </button>
                  {i < arr.length - 1 && (
                    <span
                      aria-hidden
                      className={`w-6 sm:w-10 h-px mt-[-14px] ${i < reachedIdx ? "bg-sage-600/50" : "bg-foreground/15"}`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </header>
  );
}
