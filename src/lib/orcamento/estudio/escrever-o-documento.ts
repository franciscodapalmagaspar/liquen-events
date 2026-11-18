/*
 * A escrita do documento do estúdio (o redutor do `setDoc`).
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`);
 * o componente reexporta o que já exportava, para nenhum chamador mudar.
 */
import type { ProposalDoc } from "@/lib/proposal-doc";
import { realinharChavesDosTemas } from "@/lib/pdf-editorial/plano";
import type { StudioDoc } from "./documento-inicial";

/**
 * As `fotosDasPaginas` que só foram LIMPAS a partir do estado anterior (as
 * chaves continuam nas posições dele) — ver o `setDoc` do estúdio.
 */
const fotosLimpasDoAnterior = new WeakSet<object>();
/** Cada `fotosDasPaginas` com os temas com que ficou gravada. */
const paresGravados = new WeakMap<object, readonly unknown[]>();
export function marcarLimpas<T extends object | undefined>(fp: T): T {
  if (fp) fotosLimpasDoAnterior.add(fp);
  return fp;
}

/**
 * A escrita do documento do estúdio. Só se realinham as chaves das fotos das
 * páginas quando ainda estão nas posições do estado anterior: o gesto não lhes
 * tocou, ou só as limpou (`fotosLimpasDoAnterior`). Um par (temas, fotos) que
 * já esteve gravado junto — o que um «Anular» repõe — passa direito.
 */
/** O que um `setDoc` recebe: o documento novo, ou como o tirar do anterior
 *  (a mesma forma do `SetStateAction` do React, sem o importar). */
export type EscritaDoDocumento = StudioDoc | ((anterior: StudioDoc) => StudioDoc);

export function escreverODocumento(prev: StudioDoc, u: EscritaDoDocumento): StudioDoc {
  const next = typeof u === "function" ? u(prev) : u;
  if (next === prev) return prev;
  const fp = next.fotosDasPaginas;
  const jaCoerente = !!fp && paresGravados.get(fp) === next.moodBoards;
  const nasPosicoesDeAntes =
    !jaCoerente && (fp === prev.fotosDasPaginas || (!!fp && fotosLimpasDoAnterior.has(fp)));
  const final = nasPosicoesDeAntes
    ? (realinharChavesDosTemas(prev as ProposalDoc, next as ProposalDoc) as StudioDoc)
    : next;
  if (final.fotosDasPaginas) paresGravados.set(final.fotosDasPaginas, final.moodBoards);
  return final;
}
