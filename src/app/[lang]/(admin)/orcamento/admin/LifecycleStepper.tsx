/**
 * LifecycleStepper — mostra, de forma compacta e horizontal, em que ponto do
 * ciclo de vida está o pedido selecionado: Pedido → Proposta → Contrato →
 * Pagamento → Evento.
 *
 * O quarto passo chamou-se «Fatura» enquanto a casa facturava aqui dentro. O
 * que ele sempre mediu, porém, foi o SINAL ter entrado (`sinal_pago`) — e é
 * isso que continua a medir, agora que a factura é emitida noutro sítio e esta
 * aplicação não sabe se saiu. Chamar-lhe «Fatura» passaria a prometer um
 * documento que este ecrã não tem como conhecer.
 *
 * É uma vista SIMPLIFICADA (5 passos) do modelo de 7 fases do Dossier
 * (`EventStage` em `@/lib/orcamento/dossier`). Mantém o vocabulário coerente:
 * cada passo grosso agrupa uma ou mais fases finas do Dossier —
 *   proposta_enviada → Proposta, aceite → Contrato,
 *   sinal_pago/em_producao → Pagamento, semana_evento/concluido → Evento.
 *
 * Client-safe: só depende de tipos e de funções puras do Dossier. Nunca importa
 * nenhum `*-store.ts` nem `server-only`.
 */
import type { Quote } from "@/lib/orcamento/types";
import { faseDoPedido, type EventStage, type PropostaParaAFase } from "@/lib/orcamento/dossier";
/* Só `ESTADO`, e sem `PRESSAO`: a escada é um INDICADOR, não um comando —
   nada aqui recebe um toque (os passos vivem dentro de um `<div>`, não de um
   botão), e um `active:scale` num sítio onde não se carrega seria movimento
   que ninguém provocou. Ver `ui/movimento.ts`. */
import { ESTADO } from "./ui/movimento";

type StageId = "pedido" | "proposta" | "contrato" | "pagamento" | "evento";
type StageState = "feito" | "atual" | "por_fazer";

const STEPS: { id: StageId; label: string }[] = [
  { id: "pedido", label: "Pedido" },
  { id: "proposta", label: "Proposta" },
  { id: "contrato", label: "Contrato" },
  { id: "pagamento", label: "Pagamento" },
  { id: "evento", label: "Evento" },
];

const STATE_HINT: Record<StageState, string> = {
  feito: "concluído",
  atual: "fase atual",
  por_fazer: "por fazer",
};

/** Em que passo grosso do stepper cai cada fase fina do Dossier. */
const STAGE_STEP: Record<Exclude<EventStage, "perdido">, number> = {
  lead: 0,
  proposta_enviada: 1,
  aceite: 2,
  sinal_pago: 3,
  em_producao: 3,
  semana_evento: 4,
  concluido: 4,
};

/**
 * Em que passo do ciclo está o pedido e se o ciclo já foi todo cumprido.
 *
 * É uma PROJEÇÃO de `deriveStage` (o Dossier), não uma segunda derivação. Tinha
 * a sua própria, e as duas discordavam no sítio que mais custa dinheiro: aqui,
 * `if (eventPassed) return { allDone: true }` pintava os cinco passos de verde
 * assim que a data do casamento ficava para trás — sem olhar para um cêntimo.
 * O Dossier só chega a `concluido` com o evento passado E o saldo liquidado
 * (ver `paidTotal`); é ele que está certo. O estúdio corria a lista, via tudo
 * verde e um "Rever produção do evento" em casamentos com o saldo por receber.
 *
 * O dinheiro recebido vive todo em `quote.payments`, que a lista já tem à
 * mão; o que ela NÃO tinha era o total a receber. Chamava o Dossier sem
 * proposta, e o Dossier comparava o recebido com a ESTIMATIVA do formulário —
 * ou bastava-lhe uma linha de saldo recebida, de 1 € que fosse. Um casamento
 * aceite por 30 000 €, estimado em 8 000 €, com 9 000 € pagos e a data
 * passada, saía «Concluído» aqui e «Em produção» no dossiê (auditoria de
 * 14/11). Agora recebe a proposta que conta, da lista leve
 * (`/api/propostas?semDoc=1`, já em cache — nenhum pedido por linha), e passa
 * pela MESMA função do dossiê (`faseDoPedido`). `undefined` = a lista ainda
 * não chegou: nunca «concluído» às cegas.
 */
export function deriveRequestLifecycle(
  quote: Quote,
  proposta: PropostaParaAFase | null | undefined,
  today: Date = new Date(),
): { perdido: boolean; currentIndex: number; allDone: boolean } {
  const stage = faseDoPedido(quote, proposta, null, today);
  if (stage === "perdido") return { perdido: true, currentIndex: 0, allDone: false };
  return { perdido: false, currentIndex: STAGE_STEP[stage], allDone: stage === "concluido" };
}

function CheckIcon() {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LifecycleStepper({
  quote,
  proposta,
}: {
  quote: Quote;
  /** A proposta que conta (ver `deriveRequestLifecycle`); `undefined` = por saber. */
  proposta: PropostaParaAFase | null | undefined;
}) {
  const { perdido, currentIndex, allDone } = deriveRequestLifecycle(quote, proposta, new Date());

  if (perdido) {
    return (
      <div className="pt-3" aria-label="Fase do pedido">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bo-perigo)]/12 text-[var(--bo-perigo)] text-[10px] tracking-[0.12em] uppercase font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--bo-perigo)]" aria-hidden />
          Negócio perdido
        </span>
      </div>
    );
  }

  return (
    <ol
      aria-label="Fase do pedido"
      className="flex items-stretch gap-0 overflow-x-auto pt-3 pb-1 -mx-1 px-1"
    >
      {STEPS.map((step, i, arr) => {
        const state: StageState = allDone
          ? "feito"
          : i < currentIndex
            ? "feito"
            : i === currentIndex
              ? "atual"
              : "por_fazer";
        return (
          <li key={step.id} className="flex items-center shrink-0">
            <div
              aria-current={state === "atual" ? "step" : undefined}
              className="flex flex-col items-center gap-1 px-2"
              title={`${step.label} · ${STATE_HINT[state]}`}
            >
              <span
                className={`flex items-center justify-center w-4 h-4 rounded-full border ${ESTADO} text-white ${
                  state === "atual"
                    ? "bg-sage-600 border-sage-600 ring-4 ring-sage-600/15"
                    : state === "feito"
                      ? "bg-sage-600 border-sage-600"
                      : "bg-transparent border-foreground/25"
                }`}
              >
                {state === "feito" ? (
                  <CheckIcon />
                ) : state === "atual" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--bo-surface)]" aria-hidden />
                ) : null}
              </span>
              <span
                className={`text-[9px] tracking-[0.08em] uppercase whitespace-nowrap ${ESTADO} ${
                  state === "atual"
                    ? "text-[var(--bo-text)] font-semibold"
                    : state === "feito"
                      ? "text-[var(--bo-text-muted)]"
                      : "text-foreground/30"
                }`}
              >
                {step.label}
              </span>
              {/* Estado textual (não só cor) para leitores de ecrã. */}
              <span className="sr-only">{STATE_HINT[state]}</span>
            </div>
            {i < arr.length - 1 && (
              <span
                aria-hidden
                className={`w-6 sm:w-10 h-px mt-[-14px] ${
                  i < currentIndex ? "bg-sage-600/50" : "bg-foreground/15"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
