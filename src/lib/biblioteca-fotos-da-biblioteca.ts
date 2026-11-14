import "server-only";
import { listFotos } from "./biblioteca-fotos-store";
import { listThemes } from "./themes-store";
import { themeFolder } from "./theme-storage";
import { soDaBiblioteca } from "./biblioteca-consulta";
import type { Foto } from "./biblioteca-types";

/**
 * As linhas de `biblioteca_fotos` que SÃO da Biblioteca: as das pastas de
 * temas que existem em `proposal_themes`. As das propostas (que a tabela
 * também guarda, pelas medidas e pela cor) ficam de fora — ver
 * `soDaBiblioteca`.
 *
 * Quem quer a tabela INTEIRA (a cópia de segurança, a reposição) continua a
 * usar `listFotos`; quem mostra ou trata a Biblioteca usa esta.
 *
 * Custo: mais uma leitura da tabela dos temas (umas dezenas de linhas), em
 * paralelo com a das fotos. Nenhuma ida ao Storage.
 */
export async function listFotosDaBiblioteca(): Promise<Foto[]> {
  const [fotos, temas] = await Promise.all([listFotos(), listThemes()]);
  const pastas = new Set(temas.map((t) => themeFolder(t.id)).filter(Boolean));
  return soDaBiblioteca(fotos, pastas);
}
