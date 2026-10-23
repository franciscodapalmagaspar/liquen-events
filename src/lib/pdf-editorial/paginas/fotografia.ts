import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { BRILHO, LADO_PAGINA } from "../imagens";
import {
  FOLHA,
  blocoDeTitulo,
  fotoDeLeitura,
  fotoNaCaixa,
  fundoArrastado,
  logotipoNoCanto,
  moldura,
  nota,
  novaPagina,
  type CaixaPx,
  type Contexto,
} from "../moldura";
import { MARGEM } from "../paleta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE FOTOGRAFIA SEM RODAPÉ — separador (§6.6a) e citação (§6.7)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * São as pausas do documento: o logótipo no canto de cima, o bloco de título
 * em baixo à esquerda, e nada de rodapé.
 */

/** A fotografia nítida do separador, com a moldura afastada à volta. */
export const FOTO_DO_SEPARADOR: CaixaPx = { x: 696, y: 101, w: 346, h: 430 };

export interface DadosDoSeparador {
  /** «inspiração · 01». */
  sobretitulo: string;
  /** «Decoração e decor floral do jantar». */
  titulo: string;
  /** A linha pequena — o subtítulo do tema que abre o capítulo. */
  linha: string;
  /**
   * As fotografias: a primeira é a nítida, emoldurada; a segunda, se houver,
   * é o fundo arrastado. Com uma só, o fundo é a mesma — o documento deixa.
   */
  fotos: readonly Foto[];
  /** O número da página (dá o ângulo do arrastado). */
  numero: number;
  /**
   * A nota do tema, quando a página dele não tem onde a dizer (as metades e o
   * tríptico fora de um casamento, em que o capítulo é o próprio tema).
   */
  nota?: string;
}

export async function separador(ctx: Contexto, d: DadosDoSeparador): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const [nitida, fundo] = [d.fotos[0] ?? null, d.fotos[1] ?? d.fotos[0] ?? null];
  await fundoArrastado(ctx, p, fundo, d.numero, BRILHO.separador);
  if (nitida && (await fotoNaCaixa(ctx, p, nitida, FOTO_DO_SEPARADOR))) {
    moldura(p, FOTO_DO_SEPARADOR);
  }
  logotipoNoCanto(ctx, p);
  const fim = blocoDeTitulo(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.titulo,
    linha: d.linha,
  });
  if (d.nota?.trim()) {
    nota(ctx, p, {
      texto: d.nota,
      x: MARGEM,
      topo: fim + 10,
      largura: 600,
      maxLinhas: 2,
      onde: `Separador «${d.titulo}» · nota`,
    });
  }
  return p;
}

/* ── Citação ─────────────────────────────────────────────────────────────── */

export interface DadosDaCitacao {
  /** «a nossa forma de ver». */
  sobretitulo: string;
  /** «Decoramos eventos, eternizamos memórias.» */
  frase: string;
  /** «Líquen Events». */
  assinatura: string;
  foto: Foto;
}

export async function citacao(ctx: Contexto, d: DadosDaCitacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoDeLeitura(ctx, p, d.foto, FOLHA, LADO_PAGINA);
  logotipoNoCanto(ctx, p);
  blocoDeTitulo(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.frase.replace(/[.!]+$/u, ""),
    linha: d.assinatura,
  });
  return p;
}
