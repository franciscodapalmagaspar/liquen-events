"use client";

import { useSyncExternalStore } from "react";
import type { ThemeImage } from "@/lib/theme-types";

/**
 * O ESTADO DAS IMPORTAÇÕES DO SELETOR — os trabalhos, o que está a caminho, o
 * que ficou por entrar, e o contador que faz o React redesenhar.
 *
 * Vive no módulo (sobrevive a fechar o diálogo). Saiu do `ThemePicker.tsx` tal
 * e qual (júri das fases 7 e 8, ponto 3); quem o MEXE é `importacoes.tsx`.
 *
 * Uma só costura nova: o `emit` chamava a pastilha (`syncOverlay`) pelo nome.
 * A pastilha vive em `importacoes.tsx`, que importa este ficheiro — chamá-la
 * daqui fazia um ciclo. Passa a ser `aoMudar`, que `importacoes.tsx` liga ao
 * carregar (`quandoMudar`), e corre exactamente onde o `syncOverlay` corria.
 */

let aoMudar: () => void = () => {};
/** Liga o que tem de correr depois de cada mudança (a pastilha no ecrã). */
export function quandoMudar(f: () => void): void {
  aoMudar = f;
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

/** O que ficou por entrar, por proposta: reabrir o seletor traz a seleção de
 *  volta em vez de a obrigar a escolher tudo outra vez. */
export const failedByQuote = new Map<string, string[]>();

/** As fotos da biblioteca que JÁ foram copiadas para cada proposta nesta
 *  sessão — a marca "já nesta proposta" aparece sem esperar pelo estúdio. */
export const importedByQuote = new Map<string, Set<string>>();

// ───────────────────────────────────────────────────────────────────────────
// A cópia, em segundo plano (fora do React, para sobreviver ao diálogo)
// ───────────────────────────────────────────────────────────────────────────

/** Fotos por pedido de importação.
 *
 *  A rota aceita as 40 de uma assentada, mas isso são ~10 s de silêncio e um
 *  "falhou" que não diz quais. Em lotes de 8 o que falha fica circunscrito ao
 *  lote (as outras já entraram), as primeiras fotos aparecem no estúdio muito
 *  antes das últimas, e a ordem por que a Catarina tocou nas fotos mantém-se —
 *  os lotes são enviados em sequência e cada um preserva a ordem que lhe deram. */
export const IMPORT_CHUNK = 8;

/**
 * A partir de quantas fotos é que a pastilha mostra uma BARRA.
 *
 * Abaixo disto a barra mentiria: um lote de 5 fotos é um pedido só, portanto
 * teria dois estados (0 % e 100 %). Acima disto há lotes que cheguem para a
 * barra andar de verdade — e um lote grande demora o suficiente para valer a
 * pena dizer por onde vai.
 */
export const BIG_BATCH = 16;

/** Quanto tempo a pastilha fica no ecrã depois de correr tudo bem. O suficiente
 *  para se ler "8 fotos adicionadas", pouco para não virar mobília. */
export const DONE_LINGER_MS = 4000;

export const jobs: ImportJob[] = [];
/** `quoteId\npath` de tudo o que está em voo — a rede contra o duplo clique. */
export const inFlight = new Set<string>();

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

export const flightKey = (quoteId: string, path: string) => `${quoteId}\n${path}`;

// Um contador de versão como estado externo: quem depende disto (a pastilha e
// o próprio diálogo) volta a desenhar; a informação verdadeira lê-se de `jobs`.
let version = 0;
const listeners = new Set<() => void>();
export function emit(): void {
  version += 1;
  for (const l of Array.from(listeners)) l();
  aoMudar();
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

/** Esquece os trabalhos e o que ficou por entrar (ver `limparImportacoes`). */
export function limparEstadoDasImportacoes(): void {
  failedByQuote.clear();
  importedByQuote.clear();
  jobs.length = 0;
  inFlight.clear();
}
