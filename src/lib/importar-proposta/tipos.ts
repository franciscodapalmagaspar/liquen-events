/**
 * O que se leu de um documento antigo, ANTES de se decidir o que cada coisa é.
 *
 * O Word e o PowerPoint chegam aqui na mesma forma: secções com um título,
 * blocos de texto pela ordem, e as fotografias que estavam nessa secção. É o
 * `mapear.ts` que depois decide o que é o nome do casal, o que é um serviço e
 * o que é o total.
 */

export type FormatoImportado = "docx" | "pptx";

export type Bloco =
  | { tipo: "paragrafo"; texto: string; negrito?: boolean; tamanho?: number }
  | { tipo: "item"; texto: string; nivel: number }
  | { tipo: "tabela"; linhas: string[][] };

export interface Seccao {
  /** O título (um cabeçalho no Word, o título do diapositivo no PowerPoint). */
  titulo: string;
  blocos: Bloco[];
  /** Os caminhos, dentro do ficheiro, das imagens desta secção, pela ordem. */
  imagens: string[];
  /** «Diapositivo 3» / «Secção 2» — para os avisos dizerem onde. */
  origem: string;
}

export interface ConteudoImportado {
  formato: FormatoImportado;
  seccoes: Seccao[];
  /** O que o leitor deixou de fora e ela deve saber. */
  avisos: string[];
}
