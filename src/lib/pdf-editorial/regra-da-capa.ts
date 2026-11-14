import { isPendingImage } from "@/lib/proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA DA CAPA — quando é que a dela serve
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O desenho novo tem UMA fotografia de capa, a cobrir a folha deitada inteira
 * (1123 × 794). Ela escolheu: «Usa a minha, com aviso» — o PDF usa sempre a
 * que ela escolher, a não ser que não sirva para uma página inteira; aí usa a
 * melhor fotografia deitada dos temas, e o estúdio diz-lho ANTES, ao lado da
 * fotografia, com o porquê.
 *
 * Puro de propósito: o servidor (`montar.ts`) e o estúdio (o aviso) fazem a
 * MESMA pergunta, e não podem responder coisas diferentes — o aviso a dizer
 * «serve» e o PDF a trocá-la era o pior dos dois mundos.
 */

/**
 * O lado maior a partir do qual uma fotografia enche a capa sem se ver o grão.
 * A folha tem 1123 px de largura no exemplo; 1200 é a folha inteira com um
 * pouco de folga para o recorte.
 */
export const LADO_MINIMO_DA_CAPA = 1200;

/** A forma da folha do desenho novo — deitada. */
export const ASPETO_DA_FOLHA = 1123 / 794;

export type ProblemaDaCapa = "ao-alto" | "pequena";

/**
 * Porque é que esta fotografia NÃO serve para a capa — ou `null` se serve.
 *
 * Ao alto primeiro: uma fotografia vertical numa folha deitada perde mais de
 * metade da altura, seja qual for o tamanho. Quadrada conta como deitada.
 */
export function problemaDaCapa(w: number, h: number): ProblemaDaCapa | null {
  if (!(w > 0) || !(h > 0)) return null;
  if (w < h) return "ao-alto";
  if (Math.max(w, h) < LADO_MINIMO_DA_CAPA) return "pequena";
  return null;
}

/**
 * A fotografia DELA vai mesmo para a capa do PDF? Sim, se servir para a página
 * inteira, ou se ela disse para a usar na mesma (`capaMesmoAssim`). Sem medida
 * não se sabe — e conta como sim.
 *
 * É a pergunta do desenho (`montar.ts`) e a do travão do envio
 * (`proposta-fotos-verificacao.ts`, revisão de 14/11, n.º 3): uma capa em
 * falta só trava se o PDF a fosse usar. Uma regra, dois sítios.
 */
export function aCapaDelaVaiNoPdf(
  medida: { w: number; h: number } | null | undefined,
  mesmoAssim: boolean | undefined,
): boolean {
  if (!medida) return true;
  return !!mesmoAssim || !problemaDaCapa(medida.w, medida.h);
}

/**
 * Há na inspiração (os mood boards) alguma fotografia que o PDF possa pôr na
 * capa no lugar da dela? `falta` diz as que se sabe que já não existem; as
 * ainda a copiar (`pending:`) também não servem.
 *
 * É o «senão, a melhor deitada da inspiração» do desenho (`montar.ts`): o
 * álbum escolhe entre as fotos da inspiração e, faltando a deitada, leva a que
 * houver — por isso basta UMA que exista.
 */
export function haFotoNaInspiracao(
  doc: { moodBoards?: readonly ({ images?: readonly (string | null | undefined)[] } | null)[] },
  falta: (ref: string) => boolean,
): boolean {
  return (doc.moodBoards ?? []).some((b) =>
    (b?.images ?? []).some(
      (r) => typeof r === "string" && r.trim() !== "" && !isPendingImage(r) && !falta(r),
    ),
  );
}

/**
 * A capa DELA que se sabe que falta trava o envio (e deixa o PDF incompleto)?
 *
 * Sim, se o PDF a fosse usar (`aCapaDelaVaiNoPdf`) — o lugar sairia com outra.
 * E sim TAMBÉM quando não ia, mas a inspiração não tem nenhuma para pôr no
 * lugar dela: aí o desenho fica sem fotografia de capa nenhuma (revisão de
 * 14/11, 2.ª, importante n.º 3 — uma capa ao alto em falta, com a inspiração
 * vazia, dava um PDF sem capa e o envio não travava).
 *
 * Uma regra, três sítios: a verificação do armazenamento (o travão do envio),
 * o desenho do PDF (`proposal-doc-render.ts`, se o PDF sai completo) e o
 * desenho da capa (`montar.ts`, que faz a mesma escolha).
 */
export function aFaltaDaCapaTrava(
  medida: { w: number; h: number } | null | undefined,
  mesmoAssim: boolean | undefined,
  haOutraNaInspiracao: boolean,
): boolean {
  return aCapaDelaVaiNoPdf(medida, mesmoAssim) || !haOutraNaInspiracao;
}

/**
 * Que parte da fotografia fica de fora da folha (0 a 1), pelo recorte que
 * cobre a página inteira.
 */
export function perdaNaFolha(aspeto: number): number {
  if (!(aspeto > 0)) return 0;
  return aspeto > ASPETO_DA_FOLHA ? 1 - ASPETO_DA_FOLHA / aspeto : 1 - aspeto / ASPETO_DA_FOLHA;
}
