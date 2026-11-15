import type { MoodBoard, ProposalDoc } from "@/lib/proposal-doc";
import { marcaDepoisDeMexer } from "@/lib/proposal-moodboard";
import { eFotoEmFalta, marcaDeFotoEmFalta } from "./embutir";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO SEM AS FOTOGRAFIAS QUE SE SABE QUE FALTAM — UMA REGRA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Revisão de 14/11, importante n.º 1. Uma foto levada para a Reciclagem sai da
 * pasta, mas a linha dela na `biblioteca_fotos` FICA (com as medidas — é com
 * elas que volta). Resultado, com o mesmo documento:
 *
 *   · o PDF não lhe conseguia ir buscar os bytes, e escolhia OUTRAS (a capa e
 *     os separadores caíam para a melhor da inspiração; o mosaico saía sem ela);
 *   · o plano do estúdio (`planoDoEditorial`, sem bytes) tinha a medida, e
 *     punha-a na capa, na contracapa, na citação, num separador;
 *   · a página do casal (`conteudoDoEditorial`) também a tinha, e só a
 *     filtrava DEPOIS do motor — escolhia outras ainda, e a capa ficava sem
 *     fundo.
 *
 * Três ecrãs a discordar sobre a mesma proposta. A correção é dar ao motor o
 * MESMO documento nos três: antes de correr, tiram-se as que se sabe que
 * faltam (`refsQueJaNaoExistem`, a mesma fonte nos três), EXACTAMENTE como a
 * resolução do PDF (`resolveImages`) as deixa quando os bytes não vêm:
 *
 *   · capa: o lugar fica `""` na sua posição (não se compacta — a segunda
 *     posição não passa para a primeira);
 *   · mood boards: a foto SAI da lista, e a «principal» é reindexada
 *     (`marcaDepoisDeMexer`, a mesma função);
 *   · `fotosDasPaginas`: o lugar fica marcado `em-falta:<caminho>` — o desenho
 *     deixa-o vazio e o automático não o enche com outra (`embutir.ts`).
 *
 * Um teste prende os três ao mesmo resultado (`proposal-doc-render.fotos.test.ts`,
 * «plano, PDF e página do casal escolhem as mesmas fotos»).
 *
 * Puro. Sem nada a faltar, devolve o MESMO objecto (as chaves dos guardados
 * não mudam para as propostas que estão bem).
 */
export function semAsQueFaltam(doc: ProposalDoc, faltam: ReadonlySet<string>): ProposalDoc {
  if (faltam.size === 0) return doc;
  const falta = (r: string | null | undefined) => !!r && faltam.has(r);
  const usa =
    (doc.coverImages ?? []).some(falta) ||
    (doc.moodBoards ?? []).some((b) => (b?.images ?? []).some(falta)) ||
    Object.values(doc.fotosDasPaginas ?? {}).some((e) => (e?.fotos ?? []).some(falta));
  if (!usa) return doc;

  const moodBoards = (doc.moodBoards ?? []).map((mb): MoodBoard => {
    const imagens = mb?.images ?? [];
    if (!imagens.some(falta)) return mb;
    let n = 0;
    const paraOndeFoi = imagens.map((r) => (falta(r) ? null : n++));
    return {
      ...mb,
      images: imagens.filter((r) => !falta(r)),
      principal: marcaDepoisDeMexer(mb, (antigo) => paraOndeFoi[antigo] ?? null),
    };
  });

  const fotosDasPaginas = doc.fotosDasPaginas
    ? Object.fromEntries(
        Object.entries(doc.fotosDasPaginas).map(([chave, e]) =>
          e && (e.fotos ?? []).some(falta)
            ? [
                chave,
                {
                  ...e,
                  fotos: e.fotos.map((r) =>
                    falta(r) && !eFotoEmFalta(r) ? marcaDeFotoEmFalta(r) : r,
                  ),
                },
              ]
            : [chave, e],
        ),
      )
    : doc.fotosDasPaginas;

  return {
    ...doc,
    coverImages: (doc.coverImages ?? []).map((r) => (falta(r) ? "" : r)),
    moodBoards,
    ...(fotosDasPaginas ? { fotosDasPaginas } : {}),
  };
}
