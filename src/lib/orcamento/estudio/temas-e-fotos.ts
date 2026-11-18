/*
 * O que tirar um tema, ou as suas fotografias, faz às páginas do PDF.
 *
 * Saiu tal e qual do `ProposalStudio.tsx` (fase 1 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
import { grupoNoCasamento } from "@/lib/pdf-editorial/grupos";
import { rubricasDosServicos, temasQueSaemComAsLinhas } from "@/lib/proposal-ordem";
import { eCasamento } from "@/lib/proposal-evento";
import { mapImagePaths, type StudioDoc } from "./documento-inicial";
import { marcarLimpas } from "./escrever-o-documento";

/**
 * Os mood boards que saem com as linhas/grupos APAGADOS entre `d` e `next`
 * (pelo id: renomear não conta). Ver `temasQueSaemComAsLinhas`.
 */
export function temasLevadosPelasLinhas(d: StudioDoc, next: StudioDoc["serviceGroups"]): number[] {
  if (next === d.serviceGroups || !d.moodBoards.length) return [];
  const gruposQueFicam = new Set(next.map((g) => g.id).filter(Boolean));
  const linhasQueFicam = new Set(next.flatMap((g) => g.items.map((it) => it.id)).filter(Boolean));
  const tiradas: string[] = [];
  for (const g of d.serviceGroups) {
    if (g.id && !gruposQueFicam.has(g.id)) tiradas.push(g.title ?? "");
    for (const it of g.items) if (it.id && !linhasQueFicam.has(it.id)) tiradas.push(it.label ?? "");
  }
  if (!tiradas.length) return [];
  return temasQueSaemComAsLinhas(tiradas, rubricasDosServicos(next), d.moodBoards);
}

/**
 * ── TIRAR UM TEMA TIRA-O DO PDF TODO (pedido de 12/11) ──────────────────────
 *
 * «Os noivos não querem cocktail; ela tirou o mood board, e o cocktail
 * continuou no PDF.» As fotografias que ela escolheu para as páginas
 * (`fotosDasPaginas`: índice, notas, separadores, paleta…) guardam-se à parte
 * do tema — e ficavam lá depois de o tema sair. Agora, as do tema apagado que
 * não estão em mais nenhum tema saem dessas páginas também, e cada lugar que
 * fica vazio volta a escolher sozinho, entre os temas que ficaram. A capa não
 * se toca: é escolhida à parte, à vista, na «Fotografia da capa».
 */
export function semOTema(d: StudioDoc, bi: number): StudioDoc {
  const sai = d.moodBoards[bi];
  const moodBoards = d.moodBoards.filter((_, i) => i !== bi);
  if (!sai) return { ...d, moodBoards };
  return semSeparadoresSemCapitulo(semAsFotosNasPaginas({ ...d, moodBoards }, sai.images));
}

/**
 * Num casamento, o separador de um capítulo que deixou de existir
 * («separador:cocktail» sem tema de cocktail) sai das escolhas — senão, se ela
 * voltasse a pôr um cocktail, a foto antiga reaparecia sem ninguém a ter
 * escolhido outra vez (auditoria de 12/11, n.º 9).
 */
function semSeparadoresSemCapitulo(d: StudioDoc): StudioDoc {
  const fp = d.fotosDasPaginas;
  if (!fp || !eCasamento(d.eventType)) return d;
  const ficam = new Set<string>(d.moodBoards.map((b) => grupoNoCasamento(b, d.moodBoards)));
  let mudou = false;
  const novas: NonNullable<StudioDoc["fotosDasPaginas"]> = {};
  for (const [chave, e] of Object.entries(fp)) {
    const grupo = /^separador:(cerimonia|cocktail|jantar|complementos|ambiente)(:\d+)?$/.exec(
      chave,
    )?.[1];
    if (grupo && !ficam.has(grupo)) {
      mudou = true;
      continue;
    }
    novas[chave] = e;
  }
  return mudou ? { ...d, fotosDasPaginas: marcarLimpas(novas) } : d;
}

/**
 * As fotografias `saem` deixam as páginas escolhidas (`fotosDasPaginas`) —
 * salvo as que ainda estão nalgum tema de `d`. Cada lugar que fica vazio
 * volta ao automático. É o que tirar uma foto de um tema (ou o tema inteiro)
 * faz às páginas onde ela a tinha posto (auditoria de 12/11, n.º 2).
 */
export function semAsFotosNasPaginas(d: StudioDoc, saem: readonly string[]): StudioDoc {
  if (!d.fotosDasPaginas || !saem.length) return d;
  const ficam = new Set(d.moodBoards.flatMap((b) => b.images));
  const tirar = new Set(saem.filter((p) => p && !ficam.has(p)));
  if (!tirar.size) return d;
  const limpo = mapImagePaths({ ...d, moodBoards: [], coverImages: [] }, (p) =>
    tirar.has(p) ? null : p,
  );
  return { ...d, fotosDasPaginas: marcarLimpas(limpo.fotosDasPaginas) };
}
