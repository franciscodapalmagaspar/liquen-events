import { useSyncExternalStore } from "react";
import { idUnico } from "@/lib/id-unico";
import { PENDING_IMAGE_PREFIX } from "@/lib/proposal-doc";
import { type ThemeImage } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS IMPORTAÇÕES EM CURSO — o estado que sobrevive a fechar o seletor
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Saiu do topo do `ThemePicker.tsx` (fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`),
 * tal e qual: os lotes, o que está em voo, o que ficou por entrar e o que já
 * entrou em cada proposta, e a maneira de o React ouvir isto
 * (`useImportRuntime`). Correr um lote está em `lotes-de-importacao.ts`; a
 * pastilha que o mostra, em `PastilhaDasImportacoes.tsx`.
 *
 * A pastilha é avisada a cada mudança, DEPOIS dos ouvintes do React — como
 * antes, quando o `emit` chamava o `syncOverlay` directamente. Liga-se aqui por
 * `ligarAPastilha` em vez de ser importada: a pastilha lê este estado, e
 * importá-la daqui fazia um ciclo.
 */

let aoMudarAPastilha: () => void = () => {};

/** Chamado pela pastilha (`ligarAPastilhaDasImportacoes`, ao montar o `ThemePicker`). */
export function ligarAPastilha(sincronizar: () => void): void {
  aoMudarAPastilha = sincronizar;
}

/**
 * Uma foto importada, com o caminho de ORIGEM na biblioteca.
 *
 * A cópia para a proposta nasce com um uuid novo, por isso o caminho de
 * destino não diz de onde veio. É este `sourcePath` que o estúdio guarda para
 * poder marcar "já nesta proposta" da próxima vez que o seletor abrir — sem
 * mexer na arrumação do Storage. Vem em falta quando não se consegue
 * emparelhar com segurança; nesse caso perde-se a marca, nada mais.
 */
export interface ImportedImage extends ThemeImage {
  sourcePath?: string;
  /**
   * O marcador provisório que esta cópia vem substituir, quando houve um.
   *
   * Com ele, o estúdio troca o marcador pelo caminho definitivo NO LUGAR (a
   * mesma célula, a mesma ordem); sem ele — quem não reservou nada — a imagem
   * é acrescentada, como sempre foi.
   */
  marcador?: string;
}

/** Uma foto RESERVADA: o lugar já é dela no documento, o caminho ainda não
 *  existe. É o que `onReserve` entrega no instante do clique. */
export interface ReservedImage {
  /** `pending:<uuid>` — nunca um caminho de Storage. */
  marcador: string;
  /** A miniatura que a grelha JÁ desenhou: mostrá-la não custa pedido nenhum. */
  thumbUrl?: string;
  /** A foto da BIBLIOTECA de onde esta vem — é o que deixa marcar "já nesta
   *  proposta" enquanto a cópia ainda vai a caminho. */
  sourcePath: string;
}

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
export function novoMarcador(): string {
  return `${PENDING_IMAGE_PREFIX}${idUnico()}`;
}

/** O que ficou por entrar, por proposta: reabrir o seletor traz a seleção de
 *  volta em vez de a obrigar a escolher tudo outra vez. */
export const failedByQuote = new Map<string, string[]>();

/** As fotos da biblioteca que JÁ foram copiadas para cada proposta nesta
 *  sessão — a marca "já nesta proposta" aparece sem esperar pelo estúdio. */
export const importedByQuote = new Map<string, Set<string>>();

// ───────────────────────────────────────────────────────────────────────────
// A cópia, em segundo plano (fora do React, para sobreviver ao diálogo)
// ───────────────────────────────────────────────────────────────────────────

export type PhotoState = "pending" | "done" | "failed";

export interface JobPhoto {
  /** Caminho na BIBLIOTECA. */
  path: string;
  /** A imagem que a pastilha mostra — a miniatura que a grelha já desenhou,
   *  portanto já está na cache do browser: vê-la não custa pedido nenhum. */
  thumb?: string;
  /** O lugar que esta foto já ocupa no documento (`pending:<uuid>`). Uma
   *  segunda tentativa ganha um marcador NOVO: o anterior já saiu do
   *  documento quando esta foto falhou. */
  marcador: string;
  state: PhotoState;
}

export interface ImportJob {
  id: number;
  quoteId: string;
  photos: JobPhoto[];
  /** Onde entregar cada lote que chega. É o `onPicked` tal como estava no
   *  instante do clique — e é isso que faz as fotos irem parar ao mood board
   *  (ou à capa) de onde o diálogo foi aberto, mesmo já com ele fechado. */
  deliver: (images: ImportedImage[]) => void;
  /** Guardar o lugar no documento, no instante do clique. Opcional: quem não
   *  o passa recebe as fotos só quando a cópia confirmar, como antes. */
  reserve?: (reservas: ReservedImage[]) => void;
  /** Estes marcadores já não vão ter foto — tira-os do documento. */
  drop?: (marcadores: string[]) => void;
  running: boolean;
  /** Pediram para parar: o que ainda não saiu não sai. */
  stopping: boolean;
  stopped: boolean;
  /** O pedido que está em voo AGORA, para o "Parar" o poder cortar.
   *
   *  Verificar `stopping` só ENTRE lotes não chegava: com `IMPORT_CHUNK` fotos
   *  ou menos há um lote só, portanto a verificação já tinha passado quando o
   *  botão aparecia, e carregar nele não fazia rigorosamente nada. Era
   *  decorativo exactamente no caso mais comum. */
  emVoo: AbortController | null;
  /** A primeira mensagem de erro do servidor, para se poder dizer porquê. */
  error: string | null;
}

export const jobs: ImportJob[] = [];

/** `quoteId\npath` de tudo o que está em voo — a rede contra o duplo clique. */
export const inFlight = new Set<string>();

export const flightKey = (quoteId: string, path: string) => `${quoteId}\n${path}`;

// Um contador de versão como estado externo: quem depende disto (a pastilha e
// o próprio diálogo) volta a desenhar; a informação verdadeira lê-se de `jobs`.
let version = 0;

const listeners = new Set<() => void>();

export function emit(): void {
  version += 1;
  for (const l of Array.from(listeners)) l();
  aoMudarAPastilha();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const snapshot = () => version;

export function useImportRuntime(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** As fotos desta proposta que estão a ser copiadas AGORA. */
export function pendingSources(quoteId: string): Set<string> {
  const out = new Set<string>();
  for (const job of jobs) {
    if (job.quoteId !== quoteId) continue;
    for (const p of job.photos) if (p.state === "pending") out.add(p.path);
  }
  return out;
}

/** As fotos desta proposta que já foram copiadas nesta sessão. */
export function importedSources(quoteId: string): ReadonlySet<string> {
  return importedByQuote.get(quoteId) ?? new Set<string>();
}

/** O que ficou por entrar nesta proposta, à espera de uma segunda tentativa. */
export function failedFor(quoteId: string): string[] {
  return failedByQuote.get(quoteId) ?? [];
}

export function clearFailed(quoteId: string): void {
  if (failedByQuote.delete(quoteId)) emit();
}

export function rememberImported(quoteId: string, path: string): void {
  const set = importedByQuote.get(quoteId) ?? new Set<string>();
  set.add(path);
  importedByQuote.set(quoteId, set);
}

export function mark(job: ImportJob, path: string, state: PhotoState): void {
  const photo = job.photos.find((p) => p.path === path);
  if (photo) photo.state = state;
}

/** Esquece os lotes e o que ficou de cada proposta. Só para testes (ver
 *  `__resetThemePickerState`). */
export function esquecerImportacoes(): void {
  failedByQuote.clear();
  importedByQuote.clear();
  jobs.length = 0;
  inFlight.clear();
}
