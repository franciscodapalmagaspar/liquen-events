import { type ThemeImage } from "@/lib/theme-types";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import {
  emit,
  failedByQuote,
  failedFor,
  flightKey,
  inFlight,
  jobs,
  mark,
  novoMarcador,
  rememberImported,
  type ImportedImage,
  type ImportJob,
  type JobPhoto,
  type ReservedImage,
} from "./importacoes";

/**
 * Correr um lote de importação: começar, reservar os lugares, copiar aos
 * bocados, parar, repetir e descartar. Saiu do topo do `ThemePicker.tsx`
 * (fase 8), tal e qual; o estado que estas funções mudam vive em
 * `importacoes.ts`.
 */

/** Fotos por pedido de importação.
 *
 *  A rota aceita as 40 de uma assentada, mas isso são ~10 s de silêncio e um
 *  "falhou" que não diz quais. Em lotes de 8 o que falha fica circunscrito ao
 *  lote (as outras já entraram), as primeiras fotos aparecem no estúdio muito
 *  antes das últimas, e a ordem por que a Catarina tocou nas fotos mantém-se —
 *  os lotes são enviados em sequência e cada um preserva a ordem que lhe deram. */
const IMPORT_CHUNK = 8;

/** Quanto tempo a pastilha fica no ecrã depois de correr tudo bem. O suficiente
 *  para se ler "8 fotos adicionadas", pouco para não virar mobília. */
const DONE_LINGER_MS = 4000;

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
      // A ORIGEM de cada foto vem agora NA RESPOSTA (`sourcePath`), desde que a
      // rota deixou de copiar bytes e passou a devolver referências à
      // biblioteca: ela sabe-a de certeza e nós deixámos de a ter de deduzir
      // pela posição.
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

export function stopJob(id: number): void {
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

export function retryJob(id: number): void {
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

export function dismissJob(id: number): void {
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
