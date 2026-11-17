import type { ThemeImage } from "@/lib/theme-types";

/**
 * Listas de fotografias: repor no sítio, juntar páginas e mudar de lugar —
 * puras. (Correr trabalho com tecto está em `lib/concorrencia.ts`.)
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/**
 * O retrato de uma ação em bloco a decorrer, para o `EmCurso` da barra de
 * seleção. Transferir 40 fotos e remover 40 fotos são 40 coisas cada uma: há
 * sempre contagem, por isso a barra diz a verdade e nunca é uma estimativa.
 */
export type AccaoEmBloco = { tipo: "transferir" | "remover"; feito: number; total: number };

/**
 * Repõe fotos numa lista, cada uma no índice onde estava (puro — testado).
 *
 * É o que uma remoção falhada precisa: repor a lista inteira (o "snapshot" de
 * antes) deitava fora as fotos que um lote a decorrer tivesse entretanto
 * acrescentado. Insere-se de trás para a frente para que os índices guardados
 * continuem a valer à medida que a lista cresce.
 */
export function reinsertAt(
  list: ThemeImage[],
  items: ThemeImage[],
  positions: Map<string, number>,
): ThemeImage[] {
  const next = [...list];
  const ordered = [...items].sort(
    (a, b) => (positions.get(b.path) ?? 0) - (positions.get(a.path) ?? 0),
  );
  for (const im of ordered) {
    if (next.some((x) => x.path === im.path)) continue;
    next.splice(Math.min(positions.get(im.path) ?? next.length, next.length), 0, im);
  }
  return next;
}

/** Junta uma página nova ao que já está, sem duplicar (puro — testado).
 *  A ordem do servidor desloca-se enquanto se carregam fotos; a defesa é a
 *  chave estável (`path`), não a aritmética de offsets. */
export function mergePage(prev: ThemeImage[], page: ThemeImage[]): ThemeImage[] {
  const seen = new Set(prev.map((i) => i.path));
  return [...prev, ...page.filter((i) => i.path && !seen.has(i.path))];
}

/**
 * Move um item de `from` para `to` (puro — testado).
 *
 * É a operação por trás do arrasto e das setas: tirar a foto de onde está e
 * enfiá-la onde deve ficar, sem perder nem duplicar nada. Índices fora da
 * lista devolvem-na intacta.
 */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
