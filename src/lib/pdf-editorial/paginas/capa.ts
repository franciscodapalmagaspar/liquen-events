import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA } from "../imagens";
import {
  FOLHA,
  blocoDeTitulo,
  fotoDeLeitura,
  logotipoNoCanto,
  novaPagina,
  type Contexto,
} from "../moldura";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CAPA E CONTRACAPA — a fotografia nítida a toda a página (§6.1, §6.10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A fotografia com o escurecimento de leitura (fundido na JPEG), o logótipo no
 * canto de cima e o bloco de título em baixo à esquerda. A capa abre com o
 * cliente — ou «NOME & NOME», com o «&» em Bodoni itálico —; a contracapa
 * fecha com o agradecimento e os contactos.
 *
 * A fotografia é a que ela escolheu se servir para a página inteira (≥ 1 200 px
 * no lado maior, deitada — `regra-da-capa.ts`); senão, a deitada de maior
 * resolução da inspiração. Quem escolhe é o `montar.ts`.
 */

export interface DadosDaCapa {
  /** «proposta de decoração». */
  sobretitulo: string;
  /** «Claudia Cruz», «Mafalda Santos & João Barros e Cunha». */
  nomes: string;
  /** «JANTAR DE EMPRESA · 11.12.2026 · PALÁCIO PESTANA PALACE». */
  linha: string;
  fundo: Foto | null;
}

export async function capa(ctx: Contexto, d: DadosDaCapa): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoDeLeitura(ctx, p, d.fundo, FOLHA, LADO_PAGINA);
  logotipoNoCanto(ctx, p);
  blocoDeTitulo(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.nomes,
    linha: d.linha,
    eComercial: true,
  });
  return p;
}

export interface DadosDaContracapa {
  /** «obrigada». */
  sobretitulo: string;
  /** «Por nos deixarem fazer parte deste momento». */
  agradecimento: string;
  /** «E-MAIL · TELEFONE · VÁLIDA ATÉ 03.11.2026». */
  linha: string;
  fundo: Foto | null;
}

export async function contracapa(ctx: Contexto, d: DadosDaContracapa): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoDeLeitura(ctx, p, d.fundo, FOLHA, LADO_PAGINA);
  logotipoNoCanto(ctx, p);
  blocoDeTitulo(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.agradecimento.replace(/[.!]+$/u, ""),
    linha: d.linha,
  });
  return p;
}
