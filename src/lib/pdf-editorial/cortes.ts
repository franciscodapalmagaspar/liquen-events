/**
 * Uma perda por COMPOSIÇÃO: o conteúdo chegou inteiro ao gerador e o desenho
 * não o conseguiu pôr todo na folha (fotos a mais para uma página, linhas a
 * mais para uma caixa). O PDF sai na mesma, e quem o pediu fica a saber o que
 * ficou de fora — no relatório da rota e nos registos.
 *
 * Vivia no gerador antigo (`proposal-doc-pdf.ts`, apagado a 18/11); o editorial
 * produz o mesmo relatório, e o estúdio e as rotas leem-no com esta forma.
 */
export interface DocTruncation {
  /** Onde, em pt-PT, como aparece ao utilizador: `Mood board «Cerimónia»`. */
  where: string;
  /** Quantas unidades ficaram por desenhar (nunca 0 — o que cabe não se anota). */
  dropped: number;
  /** O que se perdeu, para a frase concordar em número e género. */
  unit: "fotos" | "linhas";
}
