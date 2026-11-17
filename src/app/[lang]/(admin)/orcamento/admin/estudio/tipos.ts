/** Os tipos que o estúdio e as suas peças partilham. */

import { type Passo } from "@/lib/orcamento/passos-do-estudio";

/**
 * Passos do fluxo guiado do estúdio — os cinco do documento dela (A2). O que
 * vive em cada passo, e o estado de cada um, está em `passos-do-estudio.ts`.
 */
export type Step = Passo;

/**
 * Em que pé está a leitura dos URL das fotografias.
 *
 * Três estados e não um booleano, porque a diferença entre «vem a caminho» e
 * «não veio» é a diferença entre esperar e agir — e era exactamente essa que o
 * ecrã não tinha (ver `estadoDosUrls`).
 */
export type EstadoDosUrls = "a-caminho" | "pronto" | "falhou";

/**
 * Para onde vai a fotografia que se escolher na biblioteca de temas.
 *
 * `substituir` é a posição a TROCAR no lugar: a foto escolhida entra ali em
 * vez de ir para o fim. Sem isto, trocar uma foto era removê-la, escolher
 * outra, e arrastá-la de volta ao sítio onde a primeira estava.
 */
export type DestinoDaFoto =
  | { kind: "board"; bi: number; substituir?: number }
  | { kind: "cover"; idx: number }
  /** Uma página do PDF (`fotosDasPaginas`): a foto vai para o lugar `lugar`. */
  | { kind: "pagina"; chave: string; lugar: number; max: number };
