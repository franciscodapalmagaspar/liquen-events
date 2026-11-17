"use client";

import { plural } from "@/lib/plural";
import { Button } from "../../ui";
import { PROGRESSO } from "../../ui/movimento";

/**
 * A PASTILHA DE UMA IMPORTAÇÃO — as fotos a caminho da proposta, no canto do
 * ecrã: miniaturas, o que já entrou, a barra (nos lotes grandes) e os botões
 * Repetir · Descartar · Parar.
 *
 * Saiu do `ThemePicker.tsx` (júri das fases 7 e 8, ponto 3). O «runtime» das
 * importações — a fila, os trabalhos, as caches de módulo — continua lá; isto
 * é só o desenho de UM trabalho, e recebe as acções pelo nome.
 */

/** O que a pastilha precisa de saber de uma fotografia a caminho. */
export interface FotoAImportar {
  path: string;
  thumb?: string;
  state: "pending" | "done" | "failed";
}

/** O que a pastilha precisa de saber de um trabalho de importação. */
export interface ImportacaoVisivel {
  photos: readonly FotoAImportar[];
  running: boolean;
  stopped: boolean;
  error: string | null;
}

export interface PastilhaDaImportacaoProps {
  job: ImportacaoVisivel;
  /** A partir de quantas fotos o lote mostra a barra de progresso. */
  loteGrande: number;
  onRepetir: () => void;
  onDescartar: () => void;
  onParar: () => void;
}

export function PastilhaDaImportacao({
  job,
  loteGrande,
  onRepetir,
  onDescartar,
  onParar,
}: PastilhaDaImportacaoProps) {
  const total = job.photos.length;
  const done = job.photos.filter((p) => p.state === "done").length;
  const failed = job.photos.filter((p) => p.state === "failed").length;
  const settled = !job.running;
  const withBar = total > loteGrande && job.running;

  const message = job.running
    ? `A adicionar ${plural(total, "foto", "fotos")} à proposta…`
    : failed === 0
      ? `${plural(done, "foto adicionada", "fotos adicionadas")} à proposta.`
      : job.stopped
        ? `Parou — ${plural(failed, "foto ficou", "fotos ficaram")} por adicionar.`
        : `${plural(failed, "foto não entrou", "fotos não entraram")} na proposta.`;

  return (
    <div
      role="group"
      aria-label="Fotos a caminho da proposta"
      className={`pointer-events-auto rounded-xl border bg-[var(--bo-surface)] px-4 py-3 shadow-[var(--bo-sombra-suspensa)] ${
        settled && failed > 0
          ? "border-[var(--bo-perigo)]/25"
          : "border-[var(--bo-hairline-strong)]"
      }`}
    >
      <div className="flex items-center gap-3">
        {/* As mesmas miniaturas que a grelha desenhou: já estão na cache do
            browser, portanto vê-las aqui não custa um pedido novo. */}
        <div className="flex shrink-0 -space-x-2" aria-hidden="true">
          {job.photos.slice(0, 4).map((p) => (
            <span
              key={p.path}
              className={`block h-7 w-7 overflow-hidden rounded-md border-2 border-white bg-[var(--bo-tinta-6)] ${
                p.state === "pending" ? "opacity-55" : ""
              } ${p.state === "failed" ? "ring-2 ring-[var(--bo-perigo)]/60" : ""}`}
            >
              {p.thumb && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" decoding="async" className="h-full w-full object-cover" />
              )}
            </span>
          ))}
          {total > 4 && (
            <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-white bg-[var(--bo-tinta-10)] text-[10px] text-[var(--bo-tinta-72)]">
              +{total - 4}
            </span>
          )}
        </div>
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 text-sm text-[var(--bo-text)]"
        >
          {message}
        </p>
      </div>

      {withBar && (
        <div
          role="progressbar"
          aria-label="Progresso da importação"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done + failed}
          className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
        >
          {/* Era `duration-elemento`: PEDE 250 ms e não gera regra nenhuma —
              o Tailwind v4 lê `--transition-duration-*` para os utilitários
              `duration-*` e a casa declarou `--duration-*` (ponto 3 de
              `ui/movimento.ts`). Na prática a barra corria nos 150 ms de
              omissão. O `PROGRESSO` escreve os mesmos 250 ms numa classe que
              o Tailwind compila mesmo. */}
          <div
            className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
            style={{ transform: `scaleX(${Math.round(((done + failed) / total) * 100) / 100})` }}
          />
        </div>
      )}

      {settled && failed > 0 && (
        <>
          <p className="bo-text-muted mt-1 text-xs">
            {done > 0 ? `${done} entraram. ` : ""}
            {job.error && !job.stopped ? job.error : "Continuam por adicionar — podes repetir."}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onRepetir}>
              Repetir
            </Button>
            <Button size="sm" variant="ghost" onClick={onDescartar}>
              Descartar
            </Button>
          </div>
        </>
      )}

      {job.running && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onParar}>
            Parar
          </Button>
        </div>
      )}
    </div>
  );
}

/** A página seguinte, pedida antes de ela a pedir. Guarda o tema e o offset com
 *  que foi buscada: só encaixa onde foi pedida. */
