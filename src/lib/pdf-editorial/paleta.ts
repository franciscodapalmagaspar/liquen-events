import { rgb, type RGB } from "pdf-lib";
import { PAGINA_W } from "@/lib/proposal-geometria";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MEDIDAS E AS CORES DO PDF DA PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O desenho é o do documento dela de 23/10 (`docs/PDF-DESIGN-NOVO.md`), com o
 * modelo «Claudia Cruz» como alvo. Todas as medidas estão em PÍXEIS DA GRELHA
 * de 1123 × 794 (o A4 deitado) e passam a pontos do PDF por {@link px}: cada
 * número aqui compara-se de olho com o documento, sem contas de cabeça.
 *
 * O A4 do PDF é o mesmo do gerador antigo (`proposal-geometria.ts`):
 * 841,89 × 595,28 pt. 1123 px × 0,7497 = 841,89 pt.
 */

/** Largura da folha, em píxeis da grelha. */
export const FOLHA_PX_W = 1123;
/** Altura da folha, em píxeis da grelha. */
export const FOLHA_PX_H = 794;

/** Pontos do PDF por píxel da grelha. */
export const PT_POR_PX = PAGINA_W / FOLHA_PX_W;

/** Píxeis da grelha → pontos do PDF. */
export const px = (n: number): number => n * PT_POR_PX;

/** Margem lateral (§4). */
export const MARGEM = 72;
/** O topo dos títulos das páginas de texto (§4): é onde começa o sobretítulo. */
export const TOPO_DO_TITULO = 67;

/** O rodapé: a linha de base a 38 px do fundo (§4). */
export const RODAPE = { fundo: 38, tamanho: 10.7 } as const;

/* ── Cores (§2) ──────────────────────────────────────────────────────────── */

export type Hex = `#${string}`;

export function hexParaRgb(hex: Hex): RGB {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/**
 * As cinco cores do documento, pelo nome que ele lhes dá.
 *
 * Não há cor de destaque: «a hierarquia faz-se com dois tipos de letra, não com
 * cor». O contraste de 4,5:1 garante-se ESCURECENDO as fotografias de fundo
 * (os brilhos de `imagens.ts`), não com caixas por trás do texto; sobre o fundo
 * de recurso (a Tinta) o Linho mede 10,5:1 e a Cal 15:1 — `paleta.test.ts`.
 */
export const HEX = {
  /** Fundo de recurso, o mosaico de texto dos temas, sombras. */
  tinta: "#2A2620",
  /** Texto principal sobre fotografia. */
  cal: "#FBFAF6",
  /** Texto suave. */
  papel: "#F4EFE6",
  /** Texto secundário, rótulos, números de página. */
  linho: "#D8D0C2",
  /** Fios e linhas finas, a 1 px. */
  pedra: "#8C877C",
} as const satisfies Record<string, Hex>;

export const COR = {
  tinta: hexParaRgb(HEX.tinta),
  cal: hexParaRgb(HEX.cal),
  papel: hexParaRgb(HEX.papel),
  linho: hexParaRgb(HEX.linho),
  pedra: hexParaRgb(HEX.pedra),
} as const;

/* ── Letra (§3) ──────────────────────────────────────────────────────────── */

/**
 * Os tamanhos do documento, em píxeis da grelha, com o espaçamento entre
 * letras em `em` (0,10 é «0,10 em»).
 *
 * As entrelinhas das notas em Bodoni são as do MODELO (≈1,45), e não o 1,2 da
 * tabela: medido no PDF dela, as linhas de 17 px vão de 25 em 25 px. O mesmo
 * nos itens das condições (≈1,4, e não 1,15). Está dito na Parte −1.
 */
export const LETRA = {
  /** Sobretítulo das páginas de texto — Bodoni itálico, minúsculas. */
  sobretitulo: { tam: 24, entrelinha: 1.2, abaixo: 8 },
  /** Sobretítulo das páginas de fotografia (capa, separadores, citação, fecho). */
  sobretituloFoto: { tam: 29, entrelinha: 1.2 },
  /** Título de página — Jost em maiúsculas. */
  titulo: { tam: 37, espaco: 0.1, entrelinha: 1.15, minimo: 26 },
  /** Título das páginas de fotografia. */
  tituloFoto: { tam: 48, espaco: 0.08, entrelinha: 1.15, minimo: 30 },
  /** A linha pequena por baixo do filete. */
  linhaPequena: { tam: 12.5, espaco: 0.4 },
  /** Rótulo (CLIENTE, DATA…). */
  rotulo: { tam: 11, espaco: 0.3 },
  /** Valor por baixo do rótulo. */
  valor: { tam: 19, entrelinha: 1.25 },
  /** Índice. */
  indiceNumero: { tam: 21 },
  indiceItem: { tam: 17 },
  indicePagina: { tam: 13 },
  /** Nota descritiva (temas, «a proposta») — Bodoni itálico, Linho. */
  nota: { tam: 17, entrelinha: 1.45, minimo: 12 },
  /** O título do mosaico de texto dos temas. */
  tituloDoTema: { tam: 24, espaco: 0.1, entrelinha: 1.2, minimo: 16 },
  /** Cartões de serviço. */
  cartaoNumero: { tam: 21 },
  cartaoNome: { tam: 14, espaco: 0.2, entrelinha: 1.3 },
  cartaoDescricao: { tam: 14.5, entrelinha: 1.4 },
  /** Investimento. */
  preco: { tam: 85, minimo: 44 },
  linhaOrcamento: { tam: 16 },
  marco: { tam: 32 },
  marcoTexto: { tam: 13, entrelinha: 1.2 },
  /** «Com IVA incluído.» e as notas do total. */
  notaPequena: { tam: 13, entrelinha: 1.5 },
  /** Condições. */
  h3: { tam: 12.5, espaco: 0.3, entrelinha: 1.3 },
  item: { tam: 14, entrelinha: 1.15, entreItens: 10 },
  /** Rodapé. */
  rodape: { tam: 10.7, espaco: 0.05 },
  /** O código hex por baixo de cada cor da paleta. */
  hex: { tam: 10.5, espaco: 0.2 },
} as const;
