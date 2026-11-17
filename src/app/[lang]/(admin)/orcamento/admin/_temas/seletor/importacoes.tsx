"use client";

import { createRoot, type Root } from "react-dom/client";
import { idUnico } from "@/lib/id-unico";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { PENDING_IMAGE_PREFIX } from "@/lib/proposal-doc";
import type { ThemeImage } from "@/lib/theme-types";
import { PastilhaDaImportacao } from "./PastilhaDaImportacao";

import {
  BIG_BATCH,
  DONE_LINGER_MS,
  IMPORT_CHUNK,
  emit,
  failedByQuote,
  failedFor,
  useImportRuntime,
  flightKey,
  inFlight,
  jobs,
  mark,
  quandoMudar,
  rememberImported,
  limparEstadoDasImportacoes,
  type ImportJob,
  type ImportedImage,
  type JobPhoto,
  type ReservedImage,
} from "./estado-das-importacoes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS IMPORTAÇÕES DO SELETOR — o «runtime» que vive fora do React
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu do `ThemePicker.tsx` tal e qual (júri das fases 7 e 8, ponto 3): os
 * trabalhos de cópia de fotos para a proposta, a fila, o que ficou por entrar
 * e a pastilha no canto do ecrã. Vive no MÓDULO de propósito — sobrevive a
 * fechar o diálogo, que é o que deixa a cópia acabar em segundo plano.
 *
 * O estado de módulo tem agora UMA porta para o esquecer:
 * `limparImportacoes()`, que o `__resetThemePickerState` dos testes chama.
 */

/**
 * Um marcador novo. Não é um segredo, só tem de ser único — mas o gerador vive
 * em `id-unico.ts` e não tem `Math.random()` nenhum lá dentro.
 *
 * ── PORQUE É QUE ISTO DEIXOU DE SE CHAMAR «TOKEN» ─────────────────────────
 * Chamava-se, e o resto do ficheiro chamava-lhe marcador — dois nomes para a
 * mesma coisa, que é o género de deriva que faz o próximo leitor procurar duas
 * coisas onde só há uma.
 *
 * E tinha custo a sério: a análise de segurança do GitHub trata um campo
 * chamado `token` como informação sensível, e via-o a ser gravado no
 * `localStorage` junto com o rascunho — «clear text storage of sensitive
 * information», severidade alta. O rascunho já filtra TODOS os marcadores antes
 * de gravar (`semProvisorios`), portanto o achado era falso; mas um aviso alto
 * que se explica de cada vez que aparece é um aviso que um dia se ignora quando
 * for verdadeiro. O nome passou a dizer o que a coisa é.
 */
function novoMarcador(): string {
  return `${PENDING_IMAGE_PREFIX}${idUnico()}`;
}

let jobSeq = 0;

/**
 * Põe a copiar as fotos escolhidas e devolve o número do lote (0 = não havia
 * nada por copiar).
 *
 * Tudo o que já vai a caminho é descartado aqui, em silêncio e de forma
 * síncrona — é isto que faz do duplo clique (ou do segundo clique numa rede
 * lenta) um não-acontecimento em vez de uma importação a dobrar.
 */
export function startImport(opts: {
  quoteId: string;
  images: readonly ThemeImage[];
  deliver: (images: ImportedImage[]) => void;
  reserve?: (reservas: ReservedImage[]) => void;
  drop?: (marcadores: string[]) => void;
}): number {
  const photos: JobPhoto[] = [];
  const seen = new Set<string>();
  for (const im of opts.images) {
    if (seen.has(im.path)) continue;
    seen.add(im.path);
    const key = flightKey(opts.quoteId, im.path);
    if (inFlight.has(key)) continue;
    inFlight.add(key);
    photos.push({
      path: im.path,
      thumb: im.thumbUrl || im.url || undefined,
      marcador: novoMarcador(),
      state: "pending",
    });
  }
  if (photos.length === 0) return 0;

  const job: ImportJob = {
    id: ++jobSeq,
    quoteId: opts.quoteId,
    photos,
    deliver: opts.deliver,
    reserve: opts.reserve,
    drop: opts.drop,
    running: true,
    stopping: false,
    stopped: false,
    emVoo: null,
    error: null,
  };
  jobs.push(job);
  // O lugar é guardado AQUI, antes de qualquer viagem à rede: é isto que faz a
  // foto aparecer no mood board no mesmo gesto em que o diálogo fecha.
  reservePhotos(job, photos);
  emit();
  void runJob(job);
  return job.id;
}

/** Anuncia os lugares destas fotos a quem abriu o seletor. */
function reservePhotos(job: ImportJob, photos: readonly JobPhoto[]): void {
  if (!job.reserve || photos.length === 0) return;
  job.reserve(photos.map((p) => ({ marcador: p.marcador, thumbUrl: p.thumb, sourcePath: p.path })));
}

/**
 * Uma recusa do SERVIDOR com a frase já escolhida.
 *
 * Distingue-se do que a rede atira sozinha (um `TypeError: Failed to fetch`,
 * que é inglês de browser e não diz nada a ninguém): o que sai daqui vai
 * direito à pastilha, e o resto passa pelo `porqueRebentou`.
 */
class RecusaDoLote extends Error {}

async function runJob(job: ImportJob): Promise<void> {
  job.running = true;
  job.error = null;
  job.stopped = false;

  const queue = job.photos.filter((p) => p.state === "pending").map((p) => p.path);
  /** O marcador que uma foto da biblioteca ocupa neste lote. */
  const marcadorDe = (path: string) => job.photos.find((p) => p.path === path)?.marcador;
  /** Estes lugares ficaram sem foto: saem do documento (a pastilha é que
   *  avisa; aqui só se desocupa o sítio). */
  const largar = (paths: readonly string[]) => {
    if (!job.drop) return;
    const marcadores = paths.map(marcadorDe).filter((t): t is string => !!t);
    if (marcadores.length > 0) job.drop(marcadores);
  };

  for (let i = 0; i < queue.length; i += IMPORT_CHUNK) {
    if (job.stopping) {
      job.stopped = true;
      break;
    }
    const chunk = queue.slice(i, i + IMPORT_CHUNK);
    try {
      job.emVoo = new AbortController();
      const res = await fetch(`/api/orcamento/${job.quoteId}/assets/importar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths: chunk }),
        signal: job.emVoo.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        /**
         * A FRASE DO SERVIDOR GANHA AQUI, INCLUSIVE NUM 500.
         *
         * Esta rota não devolve rastos de pilha: devolve queixas escritas para
         * ela ler («Não foi possível copiar as fotos», o tema que sumiu, o
         * espaço que acabou). É a única coisa na resposta que diz o que se
         * passou com ESTE lote. Quando não vem nenhuma, entra a classificação
         * do `porqueFalhou` — que ao menos separa a sessão expirada (onde
         * repetir não pode funcionar) do servidor em baixo.
         */
        const doServidor = typeof data?.error === "string" ? data.error.trim() : "";
        throw new RecusaDoLote(
          doServidor ||
            porqueFalhou(
              `adicionar ${chunk.length === 1 ? "1 foto" : `${chunk.length} fotos`} ao mood board`,
              res,
              data,
            ).mensagem,
        );
      }
      const copied: ImportedImage[] = Array.isArray(data?.images) ? data.images : [];
      const failedHere: string[] = Array.isArray(data?.failed) ? data.failed : [];
      // A ORIGEM de cada foto vem agora NA RESPOSTA (`sourcePath`), desde que a rota deixou de
      // copiar bytes e passou a devolver referências à biblioteca: ela sabe-a de certeza e nós
      // deixámos de a ter de deduzir pela posição.
      //
      // O emparelhamento posicional fica como plano B, para uma resposta antiga
      // (um separador aberto durante um deploy) que chegue sem o campo. Se nem
      // isso bater certo, prefere-se ficar sem a marca "já nesta proposta" a
      // inventar uma origem errada.
      const sources = chunk.filter((p) => !failedHere.includes(p));
      const daResposta = copied.length > 0 && copied.every((im) => !!im.sourcePath);
      const aligned = daResposta || sources.length === copied.length;
      // Sem emparelhamento seguro não há troca no lugar: as fotos entram na
      // mesma, pelo caminho de acrescentar, e os lugares reservados saem. Uma
      // foto no fim do mood board é um contratempo; uma foto trocada com outra
      // é uma proposta errada.
      const picked: ImportedImage[] = copied.map((im, k) => {
        const origem = im.sourcePath ?? sources[k];
        return aligned && origem
          ? { ...im, sourcePath: origem, marcador: marcadorDe(origem) }
          : { ...im };
      });
      for (const p of sources) {
        mark(job, p, "done");
        if (aligned) rememberImported(job.quoteId, p);
      }
      for (const p of failedHere) mark(job, p, "failed");
      largar(aligned ? failedHere : chunk);
      if (picked.length > 0) job.deliver(picked);
    } catch (err) {
      // Um lote cortado pelo "Parar" não é uma avaria: ela mandou-o parar. Sem
      // esta distinção a pastilha mostrava "The user aborted a request" como se
      // fosse o servidor a queixar-se.
      const abortado = err instanceof DOMException && err.name === "AbortError";
      if (!job.error && !abortado) {
        // Só a recusa do servidor traz frase pronta. Tudo o resto que rebenta
        // aqui é a rede (ou um corpo ilegível), e aí o que importa dizer é que
        // nada se perdeu e que repetir resolve — não «Failed to fetch».
        job.error =
          err instanceof RecusaDoLote
            ? err.message
            : porqueRebentou(
                `adicionar ${chunk.length === 1 ? "1 foto" : `${chunk.length} fotos`} ao mood board`,
              ).mensagem;
      }
      for (const p of chunk) mark(job, p, "failed");
      largar(chunk);
      // O `finally` faz a limpeza à mesma — sair daqui não a salta.
      if (abortado) {
        job.stopped = true;
        break;
      }
    } finally {
      for (const p of chunk) inFlight.delete(flightKey(job.quoteId, p));
      job.emVoo = null;
    }
    emit();
  }

  // Parar é parar o que falta E o que ia a caminho (ver `stopJob`). O que aqui
  // sobra são as fotos que nunca chegaram a sair: saem do documento pelo
  // `largar`, senão ficavam lugares reservados à espera de uma foto que já
  // ninguém foi buscar.
  const abandonadas: string[] = [];
  for (const p of job.photos) {
    if (p.state !== "pending") continue;
    p.state = "failed";
    abandonadas.push(p.path);
    inFlight.delete(flightKey(job.quoteId, p.path));
  }
  largar(abandonadas);

  job.running = false;
  // O que este lote deixou por entrar junta-se ao que já estava à espera (pode
  // haver mais do que um lote a caminho da mesma proposta) e tira de lá o que
  // este conseguiu.
  const failed = job.photos.filter((p) => p.state === "failed").map((p) => p.path);
  const done = new Set(job.photos.filter((p) => p.state === "done").map((p) => p.path));
  const carried = failedFor(job.quoteId).filter((p) => !done.has(p) && !failed.includes(p));
  const next = [...carried, ...failed];
  if (next.length > 0) failedByQuote.set(job.quoteId, next);
  else failedByQuote.delete(job.quoteId);
  emit();

  if (failed.length === 0) {
    window.setTimeout(() => dismissJob(job.id), DONE_LINGER_MS);
  }
}

function stopJob(id: number): void {
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  job.stopping = true;
  // Corta o pedido que está a decorrer, não só o lote seguinte — senão, no caso
  // de um lote único, o "Parar" não parava nada. O servidor pode já ter copiado
  // alguma coisa: essas fotos ficam no bucket sem entrar na proposta, que é
  // exactamente o que acontece a qualquer falha de rede, e é preferível a
  // deixá-la a olhar para um pedido que ela mandou parar.
  job.emVoo?.abort();
  emit();
}

function retryJob(id: number): void {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.running) return;
  job.stopping = false;
  job.stopped = false;
  const outra_vez: JobPhoto[] = [];
  for (const p of job.photos) {
    if (p.state !== "failed") continue;
    p.state = "pending";
    // Marcador NOVO: o de que esta foto era dona já saiu do documento quando
    // ela falhou. Reaproveitá-lo seria pedir ao estúdio para trocar um lugar
    // que já não existe.
    p.marcador = novoMarcador();
    outra_vez.push(p);
    inFlight.add(flightKey(job.quoteId, p.path));
  }
  reservePhotos(job, outra_vez);
  emit();
  void runJob(job);
}

function dismissJob(id: number): void {
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return;
  const [job] = jobs.splice(i, 1);
  // Descartar esta pastilha esquece o que ELA tinha por entrar — nunca o que
  // ficou de outro lote da mesma proposta.
  const gone = new Set(job.photos.map((p) => p.path));
  const rest = failedFor(job.quoteId).filter((p) => !gone.has(p));
  if (rest.length > 0) failedByQuote.set(job.quoteId, rest);
  else failedByQuote.delete(job.quoteId);
  emit();
}

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
        <PastilhaDaImportacao
          key={job.id}
          job={job}
          loteGrande={BIG_BATCH}
          onRepetir={() => retryJob(job.id)}
          onDescartar={() => dismissJob(job.id)}
          onParar={() => stopJob(job.id)}
        />
      ))}
    </div>
  );
}

/** Esquece os trabalhos, o que ficou por entrar e a pastilha. Só para testes
 *  (via `__resetThemePickerState`): em produção é isto que deixa a cópia
 *  acabar depois de o diálogo fechar. */
export function limparImportacoes(): void {
  limparEstadoDasImportacoes();
  if (overlayTeardown) {
    clearTimeout(overlayTeardown);
    overlayTeardown = 0;
  }
  overlayRoot?.unmount();
  overlayRoot = null;
  overlayHost?.remove();
  overlayHost = null;
}

quandoMudar(syncOverlay);
