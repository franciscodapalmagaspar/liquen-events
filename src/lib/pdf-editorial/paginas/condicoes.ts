import "server-only";
import type { PDFPage } from "pdf-lib";
import { desenharColuna, type Peca } from "../colunas";
import type { Foto } from "../fotos";
import { BRILHO, LADO_PAGINA } from "../imagens";
import {
  FOLHA,
  cabecalho,
  fotoNaCaixa,
  fundoArrastado,
  medirCabecalho,
  novaPagina,
  rodape,
  rotuloEValor,
  type CaixaPx,
  type Contexto,
} from "../moldura";
import { FOLHA_PX_H, FOLHA_PX_W, MARGEM } from "../paleta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE TEXTO EM COLUNAS (§6.9) — condições, pagamento, cronograma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fundo arrastado muito escuro (brilho 0,30), uma fotografia nítida a toda a
 * altura à direita (374 px) e o texto em duas ou três colunas com 29 px entre
 * elas. O conteúdo vem já repartido (`colunas.ts`): esta página só desenha o
 * que lhe calhou.
 */

/** A fotografia à direita: 374 px, a toda a altura. */
const FOTO_DAS_CONDICOES_X = FOLHA_PX_W - 374;
export const FOTO_DAS_CONDICOES: CaixaPx = {
  x: FOTO_DAS_CONDICOES_X,
  y: 0,
  w: 374,
  h: FOLHA_PX_H,
};
/** Onde acaba o texto (medido no modelo: 705 px). */
export const FIM_DO_TEXTO = 705;
export const LARGURA_DO_TEXTO = FIM_DO_TEXTO - MARGEM;
/** O intervalo entre colunas (§6.9). */
export const VAO_DAS_COLUNAS = 29;
/** Até onde descem as colunas: o fundo do conteúdo, 40 px acima do rodapé. */
const FUNDO_DAS_COLUNAS = 716;
/**
 * O título pode passar o fim das colunas, até 16 px da fotografia: no modelo,
 * «PAGAMENTO E CANCELAMENTO» vai até aos ~717 px numa linha só.
 */
const LARGURA_DO_TITULO = FOTO_DAS_CONDICOES_X - 16 - MARGEM;
/**
 * Do fim do título ao topo das colunas. No modelo são 75 px (o título assenta
 * a 141 e o primeiro h3 a 228); aqui 60, porque os textos da casa são mais
 * compridos do que os do modelo e assim cabem nas três páginas dele.
 */
const AR_ATE_AS_COLUNAS = 60;
/**
 * Os contactos (§6.9): «em linhas de rótulo + valor, como na página "A
 * proposta"» — e como lá, lado a lado, numa faixa de 77 px por baixo das
 * colunas, com o último fio a 704 px. Os 30 px de cima são o ar até às
 * colunas.
 */
const FAIXA_DOS_CONTACTOS = { topo: 627, altura: 77, ar: 30 } as const;

export interface DadosDaPaginaDeColunas {
  sobretitulo: string;
  titulo: string;
  colunas: readonly (readonly Peca[])[];
  /**
   * Em quantas colunas foi repartido o texto — a última página de um texto
   * corrido pode levar menos, e as colunas não podem alargar.
   */
  numeroDeColunas: number;
  /** O tamanho do texto: 14, ou menos se só assim o texto coube (`colunas.ts`). */
  tam?: number;
  /** O e-mail e o telefone, na faixa de baixo — só na última página do pagamento. */
  contactos?: readonly { rotulo: string; valor: string }[];
  faixa: Foto | null;
  pagina: number;
}

/** A largura de cada coluna, para `n` colunas. */
export const larguraDaColuna = (n: number) => (LARGURA_DO_TEXTO - VAO_DAS_COLUNAS * (n - 1)) / n;

const topoDasColunas = (ctx: Contexto, titulo: string) => {
  const m = medirCabecalho(ctx, { titulo, largura: LARGURA_DO_TITULO });
  return m.bases[m.bases.length - 1] + AR_ATE_AS_COLUNAS;
};

/**
 * A altura que sobra para as colunas, depois do cabeçalho — e antes da faixa
 * dos contactos, quando a página a leva.
 */
export function alturaDasColunas(ctx: Contexto, titulo: string, comContactos = false): number {
  const fundo = comContactos
    ? FAIXA_DOS_CONTACTOS.topo - FAIXA_DOS_CONTACTOS.ar
    : FUNDO_DAS_COLUNAS;
  return fundo - topoDasColunas(ctx, titulo);
}

export async function paginaDeColunas(ctx: Contexto, d: DadosDaPaginaDeColunas): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoArrastado(ctx, p, d.faixa, d.pagina, BRILHO.condicoes, FOLHA);
  await fotoNaCaixa(ctx, p, d.faixa, FOTO_DAS_CONDICOES, {}, LADO_PAGINA);
  cabecalho(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.titulo,
    x: MARGEM,
    largura: LARGURA_DO_TITULO,
  });
  const topo = topoDasColunas(ctx, d.titulo);
  const col = larguraDaColuna(Math.max(1, d.numeroDeColunas));
  d.colunas.forEach((pecas, i) => {
    desenharColuna(ctx, p, pecas, MARGEM + i * (col + VAO_DAS_COLUNAS), topo, col, d.tam);
  });
  const metade = larguraDaColuna(2);
  (d.contactos ?? []).forEach((c, i) =>
    rotuloEValor(ctx, p, {
      rotulo: c.rotulo,
      valor: c.valor,
      x: MARGEM + i * (metade + VAO_DAS_COLUNAS),
      topo: FAIXA_DOS_CONTACTOS.topo,
      largura: metade,
      altura: FAIXA_DOS_CONTACTOS.altura,
      tam: 16,
      baseDoValor: 51,
    }),
  );
  // O logótipo do rodapé ficava por cima da fotografia: não entra.
  rodape(ctx, p, d.pagina, { x1: FIM_DO_TEXTO, logo: false });
  return p;
}

/**
 * Um título de secção da casa sem os dois pontos — «Incluído na proposta:» →
 * «Incluído na proposta». As PALAVRAS são as do dicionário; a caixa é desenho
 * (os h3 saem em maiúsculas espaçadas).
 */
export function comoTitulo(texto: string): string {
  return texto.trim().replace(/:$/, "");
}
