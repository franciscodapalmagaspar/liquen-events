/*
 * Duas operações sobre as listas do documento: mover um elemento uma casa, e
 * saber que ids saíram. Saíram do `ProposalStudio.tsx` tal e qual (fase 3 de
 * `docs/ESTRUTURA-DO-CODIGO.md`).
 */

import type { StudioDoc } from "./documento-inicial";

export function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/** Os ids das linhas e grupos que estavam em `antes` e não estão em `next`. */
export function idsTirados(
  antes: StudioDoc["serviceGroups"],
  next: StudioDoc["serviceGroups"],
): string[] {
  const ficam = new Set(next.flatMap((g) => [g.id, ...g.items.map((it) => it.id)]));
  return antes
    .flatMap((g) => [g.id, ...g.items.map((it) => it.id)])
    .filter((id): id is string => !!id && !ficam.has(id));
}
