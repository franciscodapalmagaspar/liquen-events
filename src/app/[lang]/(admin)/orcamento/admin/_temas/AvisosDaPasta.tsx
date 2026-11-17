"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type ThemeCopyMode, type ThemeSummary } from "@/lib/theme-types";
import { type ThemeCopyOutcome } from "../ThemeCopyDialog";
import { Button, Card } from "../ui";
import { PROGRESSO } from "../ui/movimento";
import { SKIPPED_PREVIEWS, SkippedThumb } from "./FotoDaGrelha";
import type { Failure, Skipped, ThumbJob } from "./tipos-da-pasta";
import { plural } from "@/lib/plural";

/** Os avisos da pasta: a verificar, a carregar, miniaturas em falta, o que
 *  falhou, o que já lá estava, e o que não foi levado para outro tema. (Saíram
 *  da pasta do tema na fase 8 da estrutura do código, tal e qual.) */
export interface AvisosDaPastaProps {
  theme: ThemeSummary;
  progress: { done: number; total: number } | null;
  failed: Failure[];
  setFailed: Dispatch<SetStateAction<Failure[]>>;
  skipped: Skipped[];
  setSkipped: Dispatch<SetStateAction<Skipped[]>>;
  legacyPhotos: boolean;
  partialCheck: boolean;
  verifying: { done: number; total: number } | null;
  setCopyOpen: Dispatch<SetStateAction<boolean>>;
  setCopyMode: Dispatch<SetStateAction<ThemeCopyMode>>;
  copyReport: ThemeCopyOutcome | null;
  setCopyReport: Dispatch<SetStateAction<ThemeCopyOutcome | null>>;
  thumbJob: ThumbJob | null;
  /** Pede à geração de miniaturas que pare (no fim do lote que vai a meio). */
  pararMiniaturas: () => void;
  trackUrl: (file: File) => string | undefined;
  runThumbJob: () => Promise<void>;
  retryFailed: () => void;
  addSkippedAnyway: () => void;
  unreadable: boolean;
  selectedCount: number;
  pct: number;
  missingThumbs: boolean;
  thumbPct: number;
}

export function AvisosDaPasta({
  theme,
  progress,
  failed,
  setFailed,
  skipped,
  setSkipped,
  legacyPhotos,
  partialCheck,
  verifying,
  setCopyOpen,
  setCopyMode,
  copyReport,
  setCopyReport,
  thumbJob,
  pararMiniaturas,
  trackUrl,
  runThumbJob,
  retryFailed,
  addSkippedAnyway,
  unreadable,
  selectedCount,
  pct,
  missingThumbs,
  thumbPct,
}: AvisosDaPastaProps) {
  return (
    <>
      {/* A VERIFICAR — a fase que acontece ANTES de preparar seja o que for.
          Curta (medido: ~16 ms por foto, quatro em voo) mas não pode ser
          silenciosa: sem isto, um arrasto de 300 fotos ficava um segundo e
          meio aparentemente parado antes de a primeira entrar na grelha. */}
      {verifying && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-[var(--bo-text)]">
            A verificar {plural(verifying.total, "foto", "fotos")} — {verifying.done} de{" "}
            {verifying.total}…
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            A ver quais já estão neste tema, para não as carregar outra vez.
          </p>
        </Card>
      )}

      {progress && (
        <Card padding="sm" className="mb-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-[var(--bo-text)]">
              A carregar <strong className="font-medium">{progress.done}</strong> de{" "}
              {plural(progress.total, "foto", "fotos")}…
            </p>
            <span className="bo-text-muted text-xs">{pct}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Progresso do carregamento"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.done}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
          >
            {/* Era `duration-elemento`, que PEDE 250 ms e não gera regra
                nenhuma: o espaço de nomes que o Tailwind v4 lê para os
                utilitários `duration-*` é `--transition-duration-*`, e a casa
                declarou `--duration-*` (ponto 3 de `ui/movimento.ts`). A barra
                corria, na prática, nos 150 ms de omissão. O `PROGRESSO` escreve
                os mesmos 250 ms num utilitário que compila mesmo. */}
            <div
              className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
              style={{ transform: `scaleX(${pct / 100})` }}
            />
          </div>
          <p className="bo-text-muted mt-2 text-xs">
            Podes ir fazer outra coisa — enquanto este separador ficar aberto, as fotos continuam a
            subir e vão aparecendo aqui.
          </p>
        </Card>
      )}

      {/* MINIATURAS EM FALTA — só aparece quando há mesmo fotos a ser
          mostradas a partir do original, e desaparece quando deixa de haver. */}
      {(missingThumbs || thumbJob) && !unreadable && (
        <Card padding="sm" className="mb-4">
          {thumbJob?.running ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-[var(--bo-text)]">
                  A gerar miniaturas —{" "}
                  <strong className="font-medium">
                    {plural(thumbJob.generated, "criada", "criadas")}
                  </strong>{" "}
                  em {thumbJob.scanned} fotos vistas
                  {thumbJob.total ? ` de ${thumbJob.total}` : ""}…
                </p>
                <span className="bo-text-muted text-xs">{thumbPct}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Progresso da geração de miniaturas"
                aria-valuemin={0}
                aria-valuemax={thumbJob.total ?? undefined}
                aria-valuenow={thumbJob.cursor}
                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bo-tinta-10)]"
              >
                <div
                  className={`h-full w-full origin-left rounded-full bg-sage-600 ${PROGRESSO}`}
                  style={{ transform: `scaleX(${thumbPct / 100})` }}
                />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Button size="sm" variant="secondary" onClick={pararMiniaturas}>
                  Parar
                </Button>
                <span className="bo-text-muted text-xs">
                  Podes continuar a trabalhar — e parar a meio não perde nada: da próxima vez
                  continua de onde ficou.
                </span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--bo-text)]">
                {missingThumbs
                  ? "Há fotos antigas sem miniatura — a grelha está a mostrar as fotos em tamanho real (uns 2,6 MB cada), e é por isso que este tema demora a abrir."
                  : "As miniaturas deste tema estão feitas."}
              </p>
              {thumbJob && (
                <p className="bo-text-muted mt-1 text-xs">
                  {plural(thumbJob.generated, "miniatura criada", "miniaturas criadas")} ·{" "}
                  {thumbJob.scanned} fotos vistas
                  {thumbJob.failed > 0
                    ? ` · ${plural(thumbJob.failed, "foto sem miniatura", "fotos sem miniatura")}`
                    : ""}
                  {thumbJob.complete ? " · concluído" : " · parado a meio"}
                </p>
              )}
              {missingThumbs && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button size="sm" variant="secondary" onClick={() => void runThumbJob()}>
                    {thumbJob ? "Continuar a gerar miniaturas" : "Gerar miniaturas em falta"}
                  </Button>
                  <span className="bo-text-muted text-xs">
                    As fotos originais não são alteradas.
                  </span>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {failed.length > 0 && (
        <Card
          padding="sm"
          className="mb-4 border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/40"
        >
          <p className="text-sm text-[var(--bo-text)]">
            {plural(failed.length, "foto não subiu", "fotos não subiram")}. Os ficheiros ficaram
            guardados — não é preciso voltar a escolhê-los.
          </p>
          <p className="bo-text-muted mt-1 text-xs">{failed[0].message}</p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={retryFailed}>
              Tentar novamente
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setFailed([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* JÁ ESTAVAM NO TEMA — a caixa tem a forma da do "tentar novamente", mas
          NEUTRA: isto não é uma avaria, é o que ela pediu a acontecer. Um só
          botão, e por LOTE: nunca uma pergunta foto a foto. */}
      {skipped.length > 0 && (
        <Card padding="sm" className="mb-4">
          <p className="text-sm text-[var(--bo-text)]">
            {plural(skipped.length, "foto não foi adicionada", "fotos não foram adicionadas")} —{" "}
            {skipped.some((s) => s.reason === "no-tema") &&
            skipped.some((s) => s.reason === "no-lote")
              ? "já estavam neste tema ou vinham repetidas no mesmo arrasto"
              : skipped[0].reason === "no-lote"
                ? "vinham repetidas dentro do mesmo arrasto"
                : `já ${skipped.length === 1 ? "estava" : "estavam"} em “${theme.name}”`}
            .
          </p>
          {legacyPhotos && (
            <p className="bo-text-muted mt-1 text-xs">
              As fotos carregadas antes desta funcionalidade nem sempre podem ser reconhecidas.
            </p>
          )}
          {partialCheck && (
            <p className="bo-text-muted mt-1 text-xs">
              Não foi possível ver a pasta toda desta vez — pode ter escapado alguma repetida.
            </p>
          )}
          <ul className="mt-3 flex flex-wrap gap-2">
            {skipped.slice(0, SKIPPED_PREVIEWS).map((s, i) => (
              <li
                key={`${s.file.name}-${i}`}
                title={`${s.file.name} — ${
                  s.reason === "no-lote" ? "repetida neste arrasto" : "já estava no tema"
                }`}
                className="h-14 w-14 overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
              >
                <SkippedThumb file={s.file} track={trackUrl} />
              </li>
            ))}
          </ul>
          {skipped.length > SKIPPED_PREVIEWS && (
            <p className="bo-text-muted mt-2 text-xs">
              …e mais {skipped.length - SKIPPED_PREVIEWS}.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={addSkippedAnyway}>
              Adicionar mesmo assim
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSkipped([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}

      {/* O QUE NÃO FOI LEVADO para outro tema. Vermelho e persistente: é um
          número em que ela tem de agir, e as fotos continuam aqui. */}
      {copyReport && (
        <Card
          padding="sm"
          className="mb-4 border-[var(--bo-perigo)]/25 bg-[var(--bo-perigo-lavagem)]/40"
        >
          <p className="text-sm text-[var(--bo-text)]">
            {copyReport.failed.length > 0
              ? `${copyReport.failed.length} de ${
                  copyReport.copied.length + copyReport.existing.length + copyReport.failed.length
                } ${
                  copyReport.failed.length === 1
                    ? copyReport.mode === "copiar"
                      ? "não foi copiada"
                      : "não foi movida"
                    : copyReport.mode === "copiar"
                      ? "não foram copiadas"
                      : "não foram movidas"
                } para “${copyReport.destName}”.`
              : `Parou a meio — ${plural(copyReport.copied.length, "foto foi", "fotos foram")} para “${copyReport.destName}”.`}
          </p>
          <p className="bo-text-muted mt-1 text-xs">
            {copyReport.failed.length > 0
              ? "Continuam neste tema e ficaram selecionadas — podes tentar outra vez sem as escolher de novo."
              : "As que faltavam continuam neste tema e ficaram selecionadas — podes retomar sem as escolher de novo."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  // Repetir é repetir O MESMO: um lote de «mover» parado a
                  // meio não pode ser retomado como cópia.
                  setCopyMode(copyReport.mode);
                  setCopyOpen(true);
                }}
              >
                Tentar novamente
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setCopyReport(null)}>
              Descartar
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
