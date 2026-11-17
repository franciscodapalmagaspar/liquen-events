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
