/**
 * Que fotografia vai para cada lugar de cada página do PDF editorial — a
 * resposta de `fotosDoEditorial` (em `montar.ts`), que o estúdio pede pela rota
 * `fotos-do-pdf` para as miniaturas mostrarem o que o PDF mostra.
 *
 * Só tipos: vive à parte de `montar.ts` (que é só do servidor) para o estúdio
 * os poder ler.
 */

/** O enquadramento à mão, em fracções (como o `focoDaCapa`). */
export interface FocoNaPagina {
  x: number;
  y: number;
}

/** Uma fotografia num lugar de uma página: o caminho e o enquadramento. */
export interface FotoNaPagina {
  ref: string | null;
  foco?: FocoNaPagina;
  /**
   * A foto que ELA escolheu para este lugar e que já não existe (14/11): o PDF
   * deixa o lugar vazio, e o estúdio tem de mostrar o mesmo — um lugar vazio
   * com aviso, nunca uma miniatura partida.
   */
  emFalta?: true;
}

/**
 * As fotografias de cada página, pela chave da página (`chavesDasPaginas`).
 * Os lugares por página: um na maior parte; um ou dois no separador; os
 * cartões em «O que propomos»; na paleta, a fila nos seis primeiros e o painel
 * no sétimo; numa página de tema, as fotos dela (ou o painel, sem fotos).
 */
export type FotosDoPdf = Record<string, FotoNaPagina[]>;

/** As medidas de uma fotografia, como o álbum as compara. */
export interface Medida {
  w: number;
  h: number;
}
