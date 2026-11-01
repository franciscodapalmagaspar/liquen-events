"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import { diasDesde, eventCountdown, randomId, todayKey } from "./util";
import { useAnular } from "./ui/anular";
import { reporEstadoDoPedido } from "./anular-estado";
import { eur0 as eur } from "@/lib/money";
import type { ActivityEntry } from "@/lib/orcamento/types";
import {
  propostasPorPedido,
  valorDoPedido,
  type PropostaParaContas,
} from "@/lib/orcamento/dinheiro-dos-pedidos";
import { Card, EmptyState } from "./ui";
import { porqueFalhou, porqueRebentou, type Falha } from "@/lib/porque-falhou";
import type { LeituraFalhada } from "@/lib/porque-nao-leu";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { ESTADO, PRESSAO } from "./ui/movimento";

const COLUMNS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novo", color: "#8a8a82" },
  { id: "em_revisao", label: "Aguardar resposta", color: "#9aa36a" },
  { id: "cotado", label: "Proposta enviada", color: "#7c854b" },
  { id: "aceite", label: "Ganho", color: "#525a2f" },
  { id: "rejeitado", label: "Perdido", color: "#5a5a55" },
];
const LAST_COLUMN = COLUMNS.length - 1;
const COLUMN_INDEX = new Map(COLUMNS.map((c, i) => [c.id, i]));

/**
 * O rótulo do tipo de evento resolvido UMA vez por combinação.
 *
 * Era um `.find()` linear sobre o catálogo por cada cartão, por cada render —
 * e num arrasto há muitos renders. O catálogo é constante durante toda a
 * sessão, portanto a resposta também é: guarda-se num mapa.
 */
const labelCache = new Map<string, string>();
function eventTypeLabel(q: Quote): string {
  const key = `${q.category ?? ""}|${q.eventType ?? ""}`;
  const hit = labelCache.get(key);
  if (hit !== undefined) return hit;
  let label: string | undefined;
  if (q.category && q.eventType) {
    label = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)?.label;
  }
  label ??= CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
  labelCache.set(key, label);
  return label;
}

interface CardProps {
  q: Quote;
  colColor: string;
  colLabel: string;
  colIndex: number;
  dragging: boolean;
  /**
   * Este é o cartão que acabou de mudar de coluna — e por isso tem de aterrar.
   *
   * É um booleano e não um contador porque o cartão MONTA-SE de novo ao mudar
   * de coluna (muda de pai na árvore), e uma animação de montagem não precisa
   * de ser reiniciada: basta a classe estar lá no primeiro fotograma.
   */
  aterrar: boolean;
  /** A aterragem acabou; o quadro pode esquecer qual foi o cartão. */
  aoAterrar: () => void;
  todayKey: string;
  /** O valor do pedido, com IVA, já feito pela conta única (`valorDoPedido`). */
  valor: number;
  onOpen: (q: Quote) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (q: Quote, dir: -1 | 1) => void;
}

/**
 * ── Porque é que o cartão é um componente `memo()` ────────────────────────
 *
 * Medido numa compilação de produção com 300 pedidos: arrastar um cartão pelas
 * cinco colunas (120 eventos `dragover`, ~2 s) custava 428 ms de JavaScript e
 * deixava cair 8 fotogramas em 119 (o pior de 50 ms). O arrasto "colava".
 *
 * A causa: cada `dragover` chamava `setOverCol`, e cada mudança de coluna
 * voltava a desenhar o quadro INTEIRO — os 300 cartões, com o seu `Date.now()`,
 * o seu `new Date(...)`, o seu `toLocaleDateString` e a procura linear do
 * rótulo do tipo de evento. Nada disso muda enquanto se arrasta: o que muda é
 * qual a coluna realçada, e se este cartão é o que vai a voar.
 *
 * Com o cartão isolado atrás de `memo()`, um `dragover` volta a desenhar as
 * colunas (é preciso: é o realce) e nenhum cartão. O `nowMs` também passou a
 * ser calculado uma vez por render do quadro em vez de uma vez por cartão.
 */
const KanbanCard = memo(function KanbanCard({
  q,
  colColor,
  colLabel,
  colIndex,
  dragging,
  aterrar,
  aoAterrar,
  todayKey,
  valor,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: CardProps) {
  // Conta-se a partir do `todayKey` que o quadro já passa (uma cadeia que só
  // muda à meia-noite, e por isso não desfaz o `memo()`), e não do relógio
  // lido no desenho.
  const daysSinceUpdate = diasDesde(q.lastUpdated ?? q.submittedAt, todayKey);
  const staleProposal = q.status === "cotado" && daysSinceUpdate >= 7;
  const cd = q.date ? eventCountdown(q.date) : null;
  const soon = cd && (cd.tone === "soon" || cd.tone === "today");
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={`${q.name}, ${eventTypeLabel(q)}, ${q.guests} pessoas. Coluna ${colLabel}. Enter para abrir; setas esquerda/direita para mover de coluna.`}
      onDragStart={() => onDragStart(q.id)}
      onDragEnd={onDragEnd}
      onAnimationEnd={aterrar ? aoAterrar : undefined}
      onClick={() => onOpen(q)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(q);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onMove(q, -1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onMove(q, 1);
        }
      }}
      /* `transition-all` obrigava o browser a considerar TODAS as propriedades
         animáveis do cartão a cada realce; só a sombra e a moldura mudam.

         A lista fica escrita à mão e não usa o `ESTADO` de `ui/movimento.ts`,
         porque o cartão apanhado inclina-se e o `ESTADO` não cobre inclinação
         nenhuma. A DURAÇÃO é a de lá: 120 ms, o degrau de estado desta casa —
         sem ela isto caía nos 150 ms de omissão do Tailwind, um número que
         ninguém escolheu. Escrita por extenso (e não interpolada da constante)
         porque o Tailwind só gera a regra para classes que encontra LITERAIS
         na fonte.

         ── `rotate`, E NÃO `transform` ────────────────────────────────────
         A lista dizia `transform`, e o comentário que aqui estava garantia que
         era ele «que dá o `rotate-1` ao cartão apanhado». Não é, e é o mesmo
         engano que o `ui/movimento.ts` já conta sobre o `scale-[0.98]` do
         `Button`: no Tailwind v4 estas classes emitem a PROPRIEDADE AUTÓNOMA,
         não a composta. Compilado nesta casa (Tailwind 4.3.0) para ter a
         certeza: `.rotate-1 { rotate: 1deg }` — e `transform` não cobre
         `rotate`.

         Resultado medido no CSS: o cartão apagava-se para 40% ao longo de
         120 ms e a inclinação entrava a CORTE SECO, 0 ms, no mesmo gesto. Duas
         velocidades no mesmo cartão, uma delas escolhida e a outra não. O
         `transform` sai da lista porque não havia mais nada a usá-lo — vigiá-lo
         era pedir ao browser que olhasse para uma propriedade que este cartão
         nunca muda. */
      className={`group cursor-grab active:cursor-grabbing rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-3.5 motion-safe:transition-[box-shadow,border-color,opacity,rotate,scale] motion-safe:duration-[120ms] hover:border-[var(--bo-hairline-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bo-marca)]/60 ${
        aterrar ? "bo-entrada " : ""
      }${dragging ? "opacity-40 motion-safe:rotate-1" : ""} ${PRESSAO}`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 w-1 h-8 rounded-full shrink-0" style={{ background: colColor }} />
        <div className="min-w-0 flex-1">
          <p className="text-[var(--bo-text)] text-sm font-semibold truncate">{q.name}</p>
          <p className="text-foreground/45 text-[11px] truncate mt-0.5">
            {eventTypeLabel(q)} · {q.guests} convidados
          </p>
        </div>
        {q.followUpAt && q.followUpAt <= todayKey && (
          <span
            className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] tracking-[0.1em] uppercase font-semibold ${
              q.followUpAt < todayKey
                ? "bg-[var(--bo-perigo)]/15 text-[var(--bo-perigo)]"
                : "bg-[var(--bo-marca)]/15 text-sage-600"
            }`}
            title={q.followUpAt < todayKey ? "Seguimento em atraso" : "Seguimento hoje"}
          >
            <span className="w-1 h-1 rounded-full bg-current" />
            Seguir
          </span>
        )}
      </div>
      {q.tags && q.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {q.tags.slice(0, 3).map((t) => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded-full bg-sage-600/10 text-sage-600 text-[8px] font-medium tracking-wide"
            >
              {t}
            </span>
          ))}
        </div>
      )}
      {staleProposal && (
        <div className="mt-2">
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] tracking-[0.1em] uppercase font-semibold bg-amber-500/10 text-amber-600"
            title={`Proposta enviada há ${daysSinceUpdate} dias sem resposta`}
          >
            <span className="w-1 h-1 rounded-full bg-current" />
            {daysSinceUpdate}d sem resposta
          </span>
        </div>
      )}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[var(--bo-hairline)]">
        {valor > 0 ? (
          // Com IVA, para bater com o «Total» da coluna e os KPIs do topo —
          // o mesmo cartão não pode mostrar um número numa unidade e a coluna
          // que o soma noutra. Vem de cima, já feito pela conta única
          // (`valorDoPedido`), para o cartão e a coluna nunca se separarem.
          <span className="text-sage-600 text-xs font-semibold">{eur(valor)}</span>
        ) : (
          <span className="text-foreground/40 text-[10px]">Sem valor</span>
        )}
        <div className="flex items-center gap-2">
          {q.date && (
            <span
              className={`text-[10px] ${soon ? "text-[var(--bo-perigo)] font-medium" : "text-foreground/30"}`}
              title={cd ? cd.label : undefined}
            >
              {new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {/* Touch fallback for drag-and-drop: HTML5 drag events don't
              fire on touch screens, so phones get ‹ › buttons to move
              the card between columns. Hidden on desktop (drag + arrow
              keys cover it there). */}
          {/* ── `alvo-toque` NOS DOIS, E A FOLGA ENTRE ELES ─────────────────
              MEDIDO a 375×667 e a 320×667, com toque emulado: cada um destes
              botões dava **36×36 px** — oito abaixo do mínimo de 44 —, com
              4 px a separá-los nas colunas do meio, onde aparecem os dois.

              Não é um botão qualquer a ficar pequeno: ISTO É a única forma de
              mover um cartão num telemóvel. O arrasto HTML5 não dispara em
              ecrã táctil — é o que este comentário aqui em cima já diz —,
              portanto quem tem o dedo tem estes dois botões e mais nada. Eram
              o alvo mais pequeno de uma vista inteira, e o mais necessário.

              `alvo-toque` (globals.css) leva-os a 44×44 SÓ com dedo: o
              `min-width`/`min-height` ganha ao `w-9 h-9`, e com rato as
              medidas de 36 px — que são a densidade calma do quadro no
              portátil — ficam exactamente como estavam. A folga sobe a 8 px
              pelo mesmo caminho e pela mesma razão: dois alvos de 44 px a
              4 px um do outro são um alvo de 92 px com uma fronteira
              invisível a meio, e enganar-se aqui manda o pedido para a coluna
              errada. Cabe: a linha do cartão tem 228 px e a barra passa de
              76 para 96. */}
          <div className="flex items-center gap-1 pointer-coarse:gap-2 lg:hidden">
            {colIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(q, -1);
                }}
                aria-label="Mover para a coluna anterior"
                className={`alvo-toque w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--bo-tinta-6)] text-foreground/40 active:bg-[var(--bo-tinta-10)] ${ESTADO} ${PRESSAO}`}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
            {colIndex < LAST_COLUMN && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(q, 1);
                }}
                aria-label="Mover para a coluna seguinte"
                className={`alvo-toque w-9 h-9 rounded-lg flex items-center justify-center bg-sage-600/10 text-sage-600 active:bg-sage-600/20 ${ESTADO} ${PRESSAO}`}
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

interface Props {
  quotes: Quote[];
  /**
   * As propostas, para a conta do dinheiro (`dinheiro-dos-pedidos.ts`): a taxa
   * de IVA que o cliente viu. Sem elas, conta-se como antes.
   */
  propostas?: PropostaParaContas[];
  onOpen: (q: Quote) => void;
  onStatusChange: (id: string, status: QuoteStatus) => void;
  userName?: string;
  /**
   * A leitura dos pedidos não voltou.
   *
   * O quadro não lê nada: recebe os pedidos já lidos pelo AdminClient, e o
   * desenho do servidor engole a falha e devolve uma lista vazia. Vista daqui,
   * uma leitura que rebentou é indistinguível de um estúdio sem trabalho — e
   * cinco colunas a zero, com um «Ganho: 0 €» por cima, é uma afirmação sobre
   * o negócio dela que ninguém pôde verificar. A distinção só pode vir de quem
   * fez a leitura; sem ela, o quadro comporta-se como antes.
   */
  falhaDeLeitura?: LeituraFalhada | null;
  /** Volta a pedir a lista de pedidos, quando quem lê sabe repeti-la. */
  aoTentarDeNovo?: () => void;
  /** Abre o formulário de pedido novo — o primeiro passo de um quadro vazio. */
  onNovoPedido?: () => void;
  /**
   * Quantos pedidos existem mas estão arquivados.
   *
   * O quadro recebe só os activos. Com tudo arquivado ficava exactamente igual
   * a um back office acabado de instalar, e a frase de boas-vindas era falsa:
   * o trabalho existe, está noutra gaveta.
   */
  arquivados?: number;
  /** Leva à lista de pedidos já com os arquivados à vista. */
  onVerArquivados?: () => void;
}

export default function Kanban({
  quotes,
  propostas,
  onOpen,
  onStatusChange,
  userName,
  falhaDeLeitura,
  aoTentarDeNovo,
  onNovoPedido,
  arquivados = 0,
  onVerArquivados,
}: Props) {
  const { toast } = useToast();
  const anular = useAnular();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<QuoteStatus | null>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CARTÃO ATERRAVA SEM ATERRAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Um cartão que muda de coluna MONTA-SE DE NOVO: as colunas são cinco listas
   * irmãs, e mudar de coluna é mudar de pai na árvore. React desmonta o cartão
   * de uma e monta-o na outra — e uma `transition` não anima uma montagem.
   * Resultado, com estes olhos: o cartão desaparecia de uma coluna e aparecia
   * na outra, a 100% de opacidade, no mesmo fotograma. Teleporte.
   *
   * Isto lê-se pior do que parece, porque o gesto é optimista: quando o
   * servidor recusa, o cartão volta — e volta exactamente da mesma maneira. Um
   * salto e um regresso indistinguíveis um do outro, os dois sem movimento
   * nenhum, num quadro onde o resto (o realce da coluna, a opacidade de quem
   * vai a voar) se move.
   *
   * ── PORQUE É QUE SÓ UM CARTÃO ATERRA ──────────────────────────────────────
   *
   * Guarda-se o ID de UM cartão e não uma classe na lista toda, e a razão é a
   * regra da escada: cinquenta cartões a chegar um a um é lentidão, não
   * elegância. Aqui não há sequer cascata para tectar — há um cartão, o que a
   * pessoa acabou de mover, e mais nenhum. No primeiro desenho do quadro isto é
   * `null`, portanto os trezentos cartões continuam a aparecer de uma vez.
   *
   * ── E PORQUE É QUE NÃO É A MOLA ───────────────────────────────────────────
   *
   * A casa tem uma (`lib/motion/mola.ts`) e ela não serve aqui. Uma mola come
   * um DESLOCAMENTO e uma VELOCIDADE, e é isso que a distingue de uma duração
   * fixa. Este gesto não tem nem uma nem outra: o arrasto é a API do HTML5, que
   * desenha o seu próprio fantasma, não dá coordenadas de largada úteis e não
   * dá velocidade nenhuma; e o sítio onde o cartão assenta é decidido pela
   * disposição da coluna de destino, não pelo dedo. Uma mola a partir de um
   * deslocamento inventado com velocidade zero é uma curva lenta com um ciclo
   * de `requestAnimationFrame` a pagá-la — o custo da física sem a física. A
   * mola tem sítio, e é onde há mesmo um dedo a largar: a `CuradoriaDeFotos`.
   *
   * O que serve aqui é o que a casa usa para o que APRESENTA: a `.bo-entrada`
   * do `globals.css` — 240 ms, `cubic-bezier(0, 0, 0.2, 1)` (só desacelera),
   * quatro píxeis, só `transform` e `opacity`, e desligada por
   * `prefers-reduced-motion` na própria regra. Quatro píxeis e não doze: o
   * cartão já está no sítio e clicável desde o primeiro fotograma — isto é uma
   * aterragem, não uma chegada de longe. E é o mesmo número do resto do back
   * office, em vez de um quinto número parecido.
   *
   * Nota sobre o `transform` da animação: a `.bo-entrada` não tem
   * `animation-fill-mode`, portanto larga o elemento no fim e não deixa
   * `transform` pendurado — que criaria um bloco contentor e partiria qualquer
   * `position: fixed` cá dentro. Não há nenhum hoje; é para continuar a não
   * haver problema quando houver.
   */
  const [aterrouId, setAterrouId] = useState<string | null>(null);
  const esqueceAterragem = useCallback(() => setAterrouId(null), []);

  // O `AdminClient` passa `onOpen`/`onStatusChange` recriados a cada render
  // dele. Guardá-los numa ref e expor callbacks estáveis é o que permite ao
  // `memo()` dos cartões acertar — sem isso, cada render do pai desfazia-o.
  const latest = useRef({ onOpen, onStatusChange, userName, quotes });
  useEffect(() => {
    latest.current = { onOpen, onStatusChange, userName, quotes };
  });

  const byStatus = useMemo(() => {
    const map: Record<string, Quote[]> = {};
    for (const c of COLUMNS) map[c.id] = [];
    for (const q of quotes) (map[q.status] ??= []).push(q);
    return map;
  }, [quotes]);

  // O dia LOCAL (`todayKey()` do `util.ts`), nunca o de `toISOString()`, que é
  // UTC: à meia-noite e meia de Verão em Portugal a data UTC ainda é a de
  // ontem, e o selo de seguimento passava de «hoje» a «em atraso» nos cartões.
  const chaveDeHoje = todayKey();

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CARTÃO QUE SALTA PARA TRÁS SOZINHO — E UM AVISO QUE NÃO O DIZIA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Shared by drag-and-drop and keyboard moves: optimistic update + PATCH,
   * reverting (and toasting) on failure.
   *
   * O movimento é optimista: o cartão muda de coluna no instante do gesto e o
   * servidor só é ouvido depois. Quando ele recusa, o cartão VOLTA — à frente
   * dos olhos de quem está a olhar para ele — e o aviso dizia «Não foi possível
   * atualizar». Três palavras que não dizem o pedido, não dizem porquê, não
   * dizem o que fazer, e sobretudo não dizem que aquilo que acabou de saltar no
   * ecrã foi este aviso a acontecer.
   *
   * Num quadro com trezentos cartões, um cartão a recuar em silêncio lê-se como
   * um defeito do ecrã, e o gesto seguinte é arrastá-lo outra vez — que com a
   * sessão expirada não pode funcionar nunca. Agora a frase nomeia o pedido, a
   * coluna para onde ia, o motivo, e a coluna para onde o cartão voltou.
   */
  const changeStatus = useCallback(
    async function changeStatus(q: Quote, status: QuoteStatus) {
      const { onStatusChange, userName } = latest.current;
      if (q.status === status) return;
      onStatusChange(q.id, status); // optimistic
      setAterrouId(q.id);
      const fromLabel = COLUMNS.find((c) => c.id === q.status)?.label ?? q.status;
      const toLabel = COLUMNS.find((c) => c.id === status)?.label ?? status;
      const oQue = `mover «${q.name}» para «${toLabel}»`;
      /** Repõe a coluna de origem e conta as duas coisas na mesma frase. */
      const reverter = (falha: Falha) => {
        onStatusChange(q.id, q.status); // revert
        // O regresso aterra como a ida. Uma fotografia que salta de volta
        // parece um erro do ecrã; uma que regressa parece uma recusa — e é
        // esse o movimento que acompanha a frase do aviso, em vez de a
        // desmentir.
        setAterrouId(q.id);
        toast(`${falha.mensagem} O cartão voltou para «${fromLabel}».`, "error");
      };
      const entry: ActivityEntry = {
        id: randomId(),
        at: new Date().toISOString(),
        kind: "status_change",
        actor: userName,
        summary: `${fromLabel} → ${toLabel}`,
      };
      let res: Response;
      try {
        /**
         * ACRESCENTAR, e não reescrever o registo inteiro.
         *
         * Gravar `activityLog` completo escreve o retrato que ESTE ecrã tem
         * mais a linha nova — e apaga tudo o que outra ferramenta escreveu
         * entretanto. Num quadro que fica aberto o dia todo, isso é o normal e
         * não o excepcional. O servidor já tinha o caminho seguro, que junta ao
         * registo fresco; a gaveta do back office já o usava, este ecrã não.
         */
        res = await fetch(`/api/orcamento/${q.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, activityLogAppend: [entry] }),
        });
      } catch {
        reverter(porqueRebentou(oQue));
        return;
      }
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        reverter(porqueFalhou(oQue, res, corpo));
        return;
      }
      // Propagate the updated activityLog back via onStatusChange-like mechanism.
      // We reuse onStatusChange only for status; for the full updated quote we
      // call it once and the parent syncs state (activityLog will be on next open).
      onStatusChange(q.id, (corpo as { status?: QuoteStatus } | null)?.status ?? status);
      // Com volta atrás: «Anular» repõe a coluna de onde veio (e, se foi para
      // Ganho, o contrato e a proposta que isso arrastou). Ver `anular-estado.ts`.
      anular(`${q.name} → ${toLabel}`, async () => {
        await reporEstadoDoPedido({ quoteId: q.id, de: q.status, para: status, actor: userName });
        latest.current.onStatusChange(q.id, q.status);
        setAterrouId(q.id);
      });
    },
    [toast, anular],
  );

  // O id arrastado vive também numa ref: `drop` é chamado a partir da coluna e
  // precisa do valor actual sem voltar a criar o callback a cada arrasto.
  const dragIdRef = useRef<string | null>(null);

  const drop = useCallback(
    async (status: QuoteStatus) => {
      setOverCol(null);
      const id = dragIdRef.current;
      dragIdRef.current = null;
      setDragId(null);
      if (!id) return;
      const q = latest.current.quotes.find((x) => x.id === id);
      if (q) changeStatus(q, status);
    },
    [changeStatus],
  );

  // Keyboard equivalent of dragging: move a focused card to the adjacent column.
  const moveByKeyboard = useCallback(
    (q: Quote, dir: -1 | 1) => {
      const idx = COLUMN_INDEX.get(q.status);
      const next = idx === undefined ? undefined : COLUMNS[idx + dir];
      if (next) changeStatus(q, next.id);
    },
    [changeStatus],
  );

  const handleOpen = useCallback((q: Quote) => latest.current.onOpen(q), []);
  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
    setDragId(id);
  }, []);
  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setOverCol(null);
  }, []);

  /**
   * O valor de cada pedido, com IVA — a conta única de `dinheiro-dos-pedidos.ts`,
   * a mesma da Visão Geral e das Propostas. Feito uma vez por mudança de
   * pedidos, e lido pelo cartão, pela coluna e pelo resumo, para os três nunca
   * se desencontrarem.
   */
  const valores = useMemo(() => {
    const porPedido = propostasPorPedido(propostas);
    return new Map(quotes.map((q) => [q.id, valorDoPedido(q, porPedido.get(q.id)).comIva]));
  }, [quotes, propostas]);

  const summary = useMemo(() => {
    let proposta = 0;
    let ganho = 0;
    let active = 0;
    let accepted = 0;
    let rejected = 0;
    for (const q of quotes) {
      /**
       * ── OS DOIS RAMOS NÃO ESTÃO NA MESMA UNIDADE ─────────────────────────
       * `q.quotedPrice` é o campo «Preço final (SEM IVA)» do ecrã. Somá-lo
       * directo e comparar com «Receita contratada» das Estatísticas (sempre
       * COM IVA, via `computeEventMetrics().contracted`) mostrava dois números
       * do mesmo negócio ~23% desencontrados — o IVA inteiro. Mesma cascata já
       * usada em `Reminders.tsx`, `PaymentsPanel.tsx`, `Overview.tsx` e
       * `StatsDashboard.tsx` — desde 14/10, a conta única de
       * `dinheiro-dos-pedidos.ts` (`valores`, acima).
       */
      const contratado = valores.get(q.id) ?? 0;
      if (q.status === "cotado") proposta += contratado;
      if (q.status === "aceite") {
        ganho += contratado;
        accepted++;
      }
      if (q.status === "rejeitado") rejected++;
      if (q.status === "pendente" || q.status === "em_revisao" || q.status === "cotado") active++;
    }
    const decided = accepted + rejected;
    return {
      proposta,
      ganho,
      active,
      winRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
    };
  }, [quotes, valores]);

  const quadroVazio = quotes.length === 0;
  // Com a leitura em baixo, os quatro números do topo são zeros inventados: a
  // conta correu sobre uma lista que nunca chegou. Um travessão é o que se
  // sabe. (Com pedidos no ecrã já não é a leitura inicial que se está a ver, e
  // os números voltam a ser os de sempre.)
  const semNumeros = quadroVazio && Boolean(falhaDeLeitura);

  return (
    <div className="flex flex-col gap-6">
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: semNumeros ? "—" : String(summary.active), l: "Pedidos ativos" },
          { v: semNumeros ? "—" : eur(summary.proposta), l: "Em proposta (com IVA)" },
          { v: semNumeros ? "—" : eur(summary.ganho), l: "Ganho (com IVA)" },
          { v: semNumeros ? "—" : `${summary.winRate}%`, l: "Taxa de conversão" },
        ].map((k) => (
          <Card key={k.l} padding="sm" className="p-4 sm:p-5">
            <p
              className="font-light leading-none mb-2 text-[var(--bo-text)] tabular-nums"
              style={{ fontSize: "clamp(20px, 2vw, 28px)" }}
            >
              {k.v}
            </p>
            <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/40">{k.l}</p>
          </Card>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          O QUADRO INTEIRO VAZIO — CINCO CAIXAS E NEM UMA PALAVRA
          ══════════════════════════════════════════════════════════════════
          Do inventário: quem abre o back office pela primeira vez, ou quem tem
          tudo arquivado, via cinco colunas com «Arrasta para aqui» e nada que
          dissesse em que estado é que o quadro está. Cinco instruções para um
          gesto sem objecto não são um estado vazio — são um ecrã por acabar.

          Aqui diz-se as três coisas: que está vazio, PORQUÊ (nunca houve
          pedidos, estão todos arquivados, ou a leitura não voltou) e qual é o
          passo a dar, no mesmo sítio onde se lê o problema. As colunas ficam
          onde estavam — é este quadro, não outro —, mas calam a instrução que
          ninguém pode cumprir. */}
      {quadroVazio &&
        (falhaDeLeitura ? (
          <AvisoDeFalha
            titulo="Não foi possível ler os pedidos"
            falha={falhaDeLeitura}
            aoTentarDeNovo={aoTentarDeNovo}
          />
        ) : (
          <Card padding="none">
            <EmptyState
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="4" height="16" rx="1" />
                  <rect x="10" y="4" width="4" height="11" rx="1" />
                  <rect x="17" y="4" width="4" height="7" rx="1" />
                </svg>
              }
              title={
                arquivados > 0
                  ? "O quadro está vazio — está tudo arquivado"
                  : "O quadro ainda não tem pedidos"
              }
              description={
                arquivados > 0
                  ? `Não há nenhum pedido activo. ${arquivados === 1 ? "O único que existe está arquivado" : `Os ${arquivados} que existem estão arquivados`}, e os arquivados não entram no quadro — por isso as colunas estão a zero.`
                  : "As cinco colunas são as fases por que um pedido passa, do primeiro contacto ao ganho ou perdido. Cada pedido entra em «Novo» e vai andando; enquanto não houver nenhum, ficam assim — e isso é o normal numa primeira semana."
              }
              action={
                arquivados > 0 && onVerArquivados
                  ? {
                      label: `Ver os ${arquivados} arquivados`,
                      onClick: onVerArquivados,
                    }
                  : onNovoPedido
                    ? { label: "Criar o primeiro pedido", onClick: onNovoPedido }
                    : undefined
              }
              secondaryAction={
                arquivados > 0 && onVerArquivados && onNovoPedido
                  ? { label: "Criar um pedido", onClick: onNovoPedido }
                  : undefined
              }
            />
          </Card>
        ))}

      {/* A faixa das colunas rola de lado. Com colunas vazias não há cartão
          nenhum por onde o teclado entre, e as da direita ficavam fora de
          alcance (axe: scrollable-region-focusable, 31/10). Com nome e um lugar
          na ordem do teclado, as setas fazem-na andar. */}
      <div
        role="region"
        aria-label="Colunas do quadro"
        tabIndex={0}
        className="flex gap-3.5 overflow-x-auto pb-4 scroll-hide"
      >
        {COLUMNS.map((col, colIndex) => {
          const items = byStatus[col.id] ?? [];
          // Mesma cascata do resumo acima — total da coluna COM IVA, não o
          // «Preço final (sem IVA)» somado directo.
          const value = items.reduce((s, q) => s + (valores.get(q.id) ?? 0), 0);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                // `dragover` dispara ~60×/s POR COLUNA. Só actualizamos o
                // estado quando a coluna realçada muda mesmo — caso contrário
                // era uma actualização por evento, só para chegar ao mesmo
                // valor.
                setOverCol((c) => (c === col.id ? c : col.id));
              }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => drop(col.id)}
              /* Só mudam a cor de fundo, a cor da moldura e o anel (uma sombra):
                 `transition-all` punha o browser a vigiar tudo o resto. */
              className={`flex-shrink-0 w-[276px] rounded-2xl border motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200 ${
                overCol === col.id
                  ? "border-[var(--bo-marca)]/50 bg-[var(--bo-marca)]/[0.05] ring-2 ring-[var(--bo-marca)]/20"
                  : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]"
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                  <span className="text-[var(--bo-text-muted)] text-[11px] tracking-[0.1em] uppercase font-medium">
                    {col.label}
                  </span>
                </div>
                <span className="text-foreground/35 text-[10px] tabular-nums bg-[var(--bo-tinta-6)] rounded-full px-2 py-0.5 min-w-[20px] text-center">
                  {items.length}
                </span>
              </div>

              <div className="px-2 pb-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100dvh-18rem)] overflow-y-auto overscroll-contain">
                {items.map((q) => (
                  <KanbanCard
                    key={q.id}
                    q={q}
                    colColor={col.color}
                    colLabel={col.label}
                    colIndex={colIndex}
                    dragging={dragId === q.id}
                    aterrar={aterrouId === q.id}
                    aoAterrar={esqueceAterragem}
                    todayKey={chaveDeHoje}
                    valor={valores.get(q.id) ?? 0}
                    onOpen={handleOpen}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onMove={moveByKeyboard}
                  />
                ))}
                {/* Só quando HÁ cartões noutras colunas. Com o quadro todo
                    vazio não há nada para arrastar, e cinco vezes a mesma
                    instrução impossível era o que tapava o estado do quadro —
                    que agora está dito uma vez, aqui em cima. */}
                {items.length === 0 && !quadroVazio && (
                  <div className="flex flex-col items-center justify-center py-8 text-foreground/30">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="mb-1.5"
                    >
                      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                    </svg>
                    {/* ── UMA INSTRUÇÃO QUE O ECRÃ NÃO CUMPRE ────────────────
                        Do registo do audit: «a coluna vazia dá a instrução
                        "Arrasta para aqui" a quem não pode arrastar». O arrasto
                        é a API do HTML5, e no Safari do iOS ela não dispara com
                        o dedo — não há `dragstart`, não há `drop`.

                        O gesto do dedo existe e está no CARTÃO: as setas de
                        44 px que só aparecem abaixo de `lg`. O que faltava era
                        a coluna vazia dizer isso em vez de prometer o outro. */}
                    <p className="px-2 text-center text-[10px] lg:hidden">
                      Move um cartão para aqui com as setas dele
                    </p>
                    <p className="hidden px-2 text-center text-[10px] lg:block">
                      Arrasta para aqui
                    </p>
                  </div>
                )}
              </div>

              {value > 0 && (
                <div className="px-4 py-2.5 border-t border-[var(--bo-hairline)] flex items-center justify-between">
                  <span className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase">
                    Total (com IVA)
                  </span>
                  <span className="text-[var(--bo-text-muted)] text-[11px] font-semibold tabular-nums">
                    {eur(value)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
