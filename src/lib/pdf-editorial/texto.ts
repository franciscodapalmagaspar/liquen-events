import {
  popGraphicsState,
  pushGraphicsState,
  setCharacterSpacing,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { textoParaFonte } from "@/lib/pdf-text";
import { PAGINA_H } from "@/lib/proposal-geometria";
import { BODONI_PRECO_TTF_B64, JOST_400_TTF_B64 } from "./letras";
import { px } from "./paleta";

/** As duas letras do desenho (`docs/PDF-DESIGN-NOVO.md` §3 e Parte −1). */
export interface Letras {
  /**
   * Jost 400 — tudo menos o preço: títulos (em maiúsculas), sobretítulos,
   * notas, números, valores, rótulos, rodapé. Ela escolheu «letra simples»
   * para os sobretítulos e as notas (23/10).
   */
  jost: PDFFont;
  /** Bodoni Moda (opsz 6, peso 500) — só o preço total. */
  bodoni: PDFFont;
}

/** Embute as duas letras, em subconjunto (só os glifos desenhados entram). */
export async function embutirLetras(pdf: PDFDocument): Promise<Letras> {
  pdf.registerFontkit(fontkit);
  const embutir = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const [jost, bodoni] = await Promise.all([
    embutir(JOST_400_TTF_B64),
    embutir(BODONI_PRECO_TTF_B64),
  ]);
  return { jost, bodoni };
}

/**
 * Uma corrida de texto, toda em píxeis do exemplo.
 *
 * `espaco` é o `letter-spacing` em `em`, como no CSS — 0,2 é «.2em».
 */
export interface Estilo {
  letra: PDFFont;
  /** Tamanho em píxeis do exemplo. */
  tam: number;
  cor: RGB;
  espaco?: number;
}

/** O espaçamento entre letras em pontos do PDF. */
const espacoPt = (e: Estilo) => px(e.tam * (e.espaco ?? 0));

/** O texto pronto a desenhar nesta letra: sem os caracteres que ela não tem. */
export const limpo = (letra: PDFFont, texto: string) => textoParaFonte(letra, texto);

/**
 * Largura do texto em PONTOS, contando o espaçamento entre letras.
 *
 * O espaçamento conta-se entre letras — `n − 1` vezes —, porque é a tinta que
 * interessa para alinhar à direita ou centrar. É a mesma conta do gerador
 * antigo (`larguraEspacada`).
 */
export function largura(e: Estilo, texto: string): number {
  const t = limpo(e.letra, texto);
  const n = [...t].length;
  return e.letra.widthOfTextAtSize(t, px(e.tam)) + espacoPt(e) * Math.max(0, n - 1);
}

/**
 * Parte `texto` em linhas que caibam em `max` pontos.
 *
 * As quebras de linha que ela escreveu (`\n`) são respeitadas. Uma palavra
 * sozinha mais larga do que a coluna fica na sua linha — cortá-la a meio seria
 * pior do que deixá-la sair um pouco; quem chama decide se encolhe a letra.
 */
export function quebrar(e: Estilo, texto: string, max: number): string[] {
  const t = limpo(e.letra, texto);
  const linhas: string[] = [];
  for (const paragrafo of t.split("\n")) {
    const palavras = paragrafo.split(/\s+/).filter(Boolean);
    let linha = "";
    for (const p of palavras) {
      const teste = linha ? `${linha} ${p}` : p;
      if (linha && largura(e, teste) > max) {
        linhas.push(linha);
        linha = p;
      } else {
        linha = teste;
      }
    }
    linhas.push(linha);
  }
  return linhas;
}

/** A linha mais larga, em pontos. */
export function maisLarga(e: Estilo, linhas: readonly string[]): number {
  return Math.max(0, ...linhas.map((l) => largura(e, l)));
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ENCOLHER ATÉ CABER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O CSS não sabe fazer isto e o exemplo dela não precisa (os nomes de lá cabem).
 * Os casais reais trazem apelidos compostos: «Maria Inês Albuquerque de Sousa
 * Coutinho & …». Em vez de deixar os nomes sair da página, desce-se a letra de
 * meio em meio píxel até caberem em `maxLinhas`, sem nunca passar do `minimo`.
 *
 * Se nem no mínimo couber, a última linha leva «…» e `cortado` diz quantas
 * linhas ficaram de fora — o relatório do PDF conta-as, como no gerador antigo:
 * cortar em silêncio é o defeito, não a solução.
 */
export function caber(
  e: Estilo,
  texto: string,
  max: number,
  maxLinhas: number,
  minimo: number,
): { estilo: Estilo; linhas: string[]; cortado: number } {
  for (let tam = e.tam; tam >= minimo; tam -= 0.5) {
    const estilo = { ...e, tam };
    const linhas = quebrar(estilo, texto, max);
    if (linhas.length <= maxLinhas && maisLarga(estilo, linhas) <= max) {
      return { estilo, linhas, cortado: 0 };
    }
  }
  const estilo = { ...e, tam: minimo };
  const todas = quebrar(estilo, texto, max);
  if (todas.length <= maxLinhas) return { estilo, linhas: todas, cortado: 0 };
  const linhas = todas.slice(0, maxLinhas);
  let ultima = `${linhas[maxLinhas - 1]} ${todas.slice(maxLinhas).join(" ")}`;
  while (ultima.length > 1 && largura(estilo, `${ultima}…`) > max) ultima = ultima.slice(0, -1);
  linhas[maxLinhas - 1] = `${ultima.replace(/[\s.,;:·—–-]+$/u, "")}…`;
  return { estilo, linhas, cortado: todas.length - maxLinhas };
}

/* ── Posição vertical ────────────────────────────────────────────────────── */

/**
 * Onde fica a linha de base de uma linha de texto, a partir do TOPO da caixa
 * de linha, em pontos.
 *
 * É a conta do CSS: a caixa tem `entrelinha × tamanho` de altura, o corpo da
 * letra (ascendente + descendente) fica centrado nela, e a base está à altura
 * do ascendente a partir do topo do corpo. Sem isto cada título ficava uns
 * pontos acima ou abaixo de onde está no exemplo, e as réguas deixavam de
 * coincidir.
 */
export function baseDaLinha(e: Estilo, entrelinha: number): number {
  const tam = px(e.tam);
  const corpo = e.letra.heightAtSize(tam);
  const sobe = e.letra.heightAtSize(tam, { descender: false });
  return (entrelinha * tam - corpo) / 2 + sobe;
}

/** Pixels do exemplo, medidos do TOPO da folha → `y` do PDF (medido do fundo). */
export const yDoTopo = (topoPx: number) => PAGINA_H - px(topoPx);

/* ── Desenho ─────────────────────────────────────────────────────────────── */

/**
 * Desenha uma linha com a base em `yBase` (pontos do PDF) e a esquerda em `x`.
 *
 * O espaçamento entre letras vai como operador `Tc` à volta da corrida — uma
 * só corrida de texto, que se selecciona e copia inteira no leitor.
 */
export function escrever(
  pagina: PDFPage,
  e: Estilo,
  texto: string,
  x: number,
  yBase: number,
): void {
  const t = limpo(e.letra, texto);
  if (!t) return;
  const tc = espacoPt(e);
  if (tc) pagina.pushOperators(pushGraphicsState(), setCharacterSpacing(tc));
  pagina.drawText(t, { x, y: yBase, font: e.letra, size: px(e.tam), color: e.cor });
  if (tc) pagina.pushOperators(popGraphicsState());
}

/** Como {@link escrever}, com o fim da linha em `xDireita`. */
export function escreverADireita(
  pagina: PDFPage,
  e: Estilo,
  texto: string,
  xDireita: number,
  yBase: number,
): void {
  escrever(pagina, e, texto, xDireita - largura(e, texto), yBase);
}

/**
 * Um bloco de linhas a partir do TOPO (em píxeis do exemplo).
 *
 * Devolve o fundo do bloco, também em píxeis do exemplo, para quem vem a seguir
 * se encostar — é o fluxo de cima para baixo do HTML.
 */
export function bloco(
  pagina: PDFPage,
  e: Estilo,
  linhas: readonly string[],
  xPx: number,
  topoPx: number,
  entrelinha: number,
): number {
  const alturaLinha = e.tam * entrelinha;
  const base = baseDaLinha(e, entrelinha);
  linhas.forEach((l, i) => {
    escrever(pagina, e, l, px(xPx), yDoTopo(topoPx + i * alturaLinha) - base);
  });
  return topoPx + linhas.length * alturaLinha;
}

/** Maiúsculas como o `text-transform: uppercase` — com as regras do português. */
export const maiusculas = (texto: string) => texto.toLocaleUpperCase("pt-PT");

/** Minúsculas, para os sobretítulos («a proposta», «inspiração · 01»). */
export const minusculas = (texto: string) => texto.toLocaleLowerCase("pt-PT");
