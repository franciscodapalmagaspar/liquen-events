"use client";

import { createRoot, type Root } from "react-dom/client";
import { Button } from "../../ui";
import { PROGRESSO } from "../../ui/movimento";
import { plural } from "@/lib/plural";
import { jobs, ligarAPastilha, useImportRuntime, type ImportJob } from "./importacoes";
import { dismissJob, retryJob, stopJob } from "./lotes-de-importacao";

/**
 * A partir de quantas fotos é que a pastilha mostra uma BARRA.
 *
 * Abaixo disto a barra mentiria: um lote de 5 fotos é um pedido só, portanto
 * teria dois estados (0 % e 100 %). Acima disto há lotes que cheguem para a
 * barra andar de verdade — e um lote grande demora o suficiente para valer a
 * pena dizer por onde vai.
 */
const BIG_BATCH = 16;

// ── A pastilha, na proposta e fora do diálogo ──────────────────────────────
//
// Vive na sua própria raiz de React, colada ao `body`: é o que lhe permite
// continuar no ecrã depois de o diálogo (que é quem a manda começar)
// desaparecer da árvore. Fixa no canto, sem fundo por cima de nada — não
// bloqueia o estúdio nem o diálogo.

let overlayRoot: Root | null = null;

let overlayHost: HTMLElement | null = null;

let overlayTeardown = 0;

function syncOverlay(): void {
  if (typeof document === "undefined" || !document.body) return;
  if (jobs.length > 0) {
    if (overlayTeardown) {
      window.clearTimeout(overlayTeardown);
      overlayTeardown = 0;
    }
    if (overlayRoot) return;
    overlayHost = document.createElement("div");
    overlayHost.setAttribute("data-importacoes", "");
    document.body.appendChild(overlayHost);
    overlayRoot = createRoot(overlayHost);
    overlayRoot.render(<ImportOverlay />);
    return;
  }
  if (!overlayRoot || overlayTeardown) return;
  // Desmontar uma raiz a partir de dentro de uma renderização é proibido —
  // isto chega sempre de um `emit()`, que pode vir de um evento. Sai do caminho.
  overlayTeardown = window.setTimeout(() => {
    overlayTeardown = 0;
    if (jobs.length > 0) return;
    overlayRoot?.unmount();
    overlayRoot = null;
    overlayHost?.remove();
    overlayHost = null;
  }, 0);
}

function ImportOverlay() {
  useImportRuntime();
  if (jobs.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-6 z-[70] flex max-w-[calc(100vw-3rem)] flex-col gap-2 sm:max-w-sm">
      {jobs.map((job) => (
        <ImportChip key={job.id} job={job} />
      ))}
    </div>
  );
}

function ImportChip({ job }: { job: ImportJob }) {
  const total = job.photos.length;
  const done = job.photos.filter((p) => p.state === "done").length;
  const failed = job.photos.filter((p) => p.state === "failed").length;
  const settled = !job.running;
  const withBar = total > BIG_BATCH && job.running;

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
            <Button size="sm" variant="secondary" onClick={() => retryJob(job.id)}>
              Repetir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismissJob(job.id)}>
              Descartar
            </Button>
          </div>
        </>
      )}

      {job.running && (
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => stopJob(job.id)}>
            Parar
          </Button>
        </div>
      )}
    </div>
  );
}

ligarAPastilha(syncOverlay);

/** Tira a pastilha do ecrã já. Só para testes (ver `__resetThemePickerState`). */
export function desmontarPastilha(): void {
  if (overlayTeardown) {
    clearTimeout(overlayTeardown);
    overlayTeardown = 0;
  }
  overlayRoot?.unmount();
  overlayRoot = null;
  overlayHost?.remove();
  overlayHost = null;
}
