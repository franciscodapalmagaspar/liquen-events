import "server-only";
import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import type { IdiomaDaProposta, TextosDoDocumento } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { embedImagem } from "./embutir";
import type { Foto } from "./fotos";
import {
  BRILHO,
  LADO_CELULA,
  LADO_FUNDO,
  LEITURA,
  TECTO,
  pixeisDaCaixa,
  preparar,
  type Tratamento,
} from "./imagens";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, RODAPE, TOPO_DO_TITULO, px } from "./paleta";
import type { TextosEditoriais } from "./textos";
import {
  bloco,
  caber,
  escrever,
  largura,
  maiusculas,
  minusculas,
  yDoTopo,
  type Estilo,
  type Letras,
} from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PEÇAS QUE TODAS AS PÁGINAS USAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O documento dela (`docs/PDF-DESIGN-NOVO.md`) tem duas assinaturas: o «bloco
 * de título» das páginas de fotografia — sobretítulo em itálico, título em
 * maiúsculas espaçadas, filete e linha pequena, ancorado em baixo à esquerda —
 * e a «moldura afastada» à volta das fotografias nítidas pousadas sobre um
 * fundo arrastado. Estão aqui, uma vez, com o cabeçalho das páginas de texto e
 * o rodapé.
 *
 * As posições verticais são as LINHAS DE BASE medidas no modelo dela, em
 * píxeis da grelha: assim cada número compara-se de olho com o PDF «Claudia
 * Cruz» (`referencia/modelo-novo-23-10/`).
 */

/** Tudo o que uma página precisa de saber sobre o documento onde vai. */
export interface Contexto {
  pdf: PDFDocument;
  letras: Letras;
  idioma: IdiomaDaProposta;
  /** Os textos da casa (`textosDaProposta`). */
  t: TextosDoDocumento;
  /** Os rótulos do desenho. */
  te: TextosEditoriais;
  /** O que corre no rodapé depois do número: «Proposta de decoração · cliente · data». */
  rodape: string;
  /** O logótipo na versão creme, com transparência (é uma forma recortada). */
  logo: PDFImage | null;
  /** O que o desenho cortou — o mesmo relatório do gerador antigo. */
  cortes: DocTruncation[];
  /** Fotografias (pela origem) que chegaram e não se conseguiram desenhar. */
  naoDesenhadas: Set<string>;
  /** As imagens já preparadas e embutidas — ver {@link fotoNaCaixa}. */
  embutidas: Map<string, Promise<PDFImage | null>>;
}

/** Uma página nova, já com o fundo de recurso (a Tinta). */
export function novaPagina(ctx: Contexto): PDFPage {
  const p = ctx.pdf.addPage([PAGINA_W, PAGINA_H]);
  p.drawRectangle({ x: 0, y: 0, width: PAGINA_W, height: PAGINA_H, color: COR.tinta });
  return p;
}

/** Uma caixa em píxeis da grelha. */
export interface CaixaPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A folha toda. */
export const FOLHA: CaixaPx = { x: 0, y: 0, w: FOLHA_PX_W, h: FOLHA_PX_H };

/** O fundo da área de conteúdo, acima do rodapé. */
export const FUNDO_DO_CONTEUDO = 716;

/** Desenha uma imagem JÁ embutida a ocupar a caixa (a forma foi dada pelo sharp). */
function desenharNaCaixa(pagina: PDFPage, img: PDFImage, caixa: CaixaPx) {
  pagina.drawImage(img, {
    x: px(caixa.x),
    y: PAGINA_H - px(caixa.y + caixa.h),
    width: px(caixa.w),
    height: px(caixa.h),
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA NUMA CAIXA — recortada, tratada e embutida UMA vez
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recorta a foto para a forma da caixa (o `object-fit: cover`, com o ponto
 * focal escolhido no editor), aplica o tratamento (fundido na JPEG) e
 * desenha-a. A mesma foto, na mesma caixa, com o mesmo tratamento, é a mesma
 * imagem embutida uma vez só.
 *
 * `lado` é o lado maior em píxeis: {@link LADO_CELULA} para as células, mais
 * para as fotos de página inteira, menos para os fundos arrastados.
 */
export async function fotoNaCaixa(
  ctx: Contexto,
  pagina: PDFPage,
  foto: Foto | null,
  caixa: CaixaPx,
  t: Tratamento = {},
  lado = LADO_CELULA,
  densidade = 1.7,
): Promise<boolean> {
  if (!foto) return false;
  const { w, h } = pixeisDaCaixa(caixa.w, caixa.h, lado, densidade);
  // O enquadramento é da FOTOGRAFIA (escolhido à mão para ela), e não da página.
  if (foto.foco) t = { ...t, foco: foto.foco };
  const chave = `${foto.id}|${w}x${h}|${JSON.stringify(t)}`;
  let img = ctx.embutidas.get(chave);
  if (!img) {
    img = preparar(foto.bytes, w, h, caixa.w, t).then((jpeg) =>
      jpeg ? embedImagem(ctx.pdf, jpeg) : null,
    );
    ctx.embutidas.set(chave, img);
  }
  const pronta = await img;
  if (!pronta) {
    ctx.naoDesenhadas.add(foto.origem);
    return false;
  }
  desenharNaCaixa(pagina, pronta, caixa);
  return true;
}

/**
 * O ângulo do arrastado desta página: entre −8° e −24°, a variar de página
 * para página (§5) — sempre o mesmo para a mesma página, para o PDF não mudar
 * de bytes entre duas gerações iguais.
 */
export const anguloDaPagina = (numero: number) => -8 - ((numero * 7) % 17);

/**
 * O fundo «arrastado» de uma página: a fotografia em movimento, escurecida
 * com o brilho pedido. Sem fotografia, fica a Tinta de recurso.
 *
 * Nas páginas de texto (brilho abaixo do dos separadores), o fundo perde
 * também saturação (×0,6) e leva o {@link TECTO} de luz na página toda: uma
 * fotografia de amarelos e vermelhos vivos ficava clara por trás dos números
 * mesmo a ×0,42 (o pedido dela de 23/10). Nos separadores, o escurecimento de
 * leitura e o tecto da zona do bloco de título.
 */
export function fundoArrastado(
  ctx: Contexto,
  pagina: PDFPage,
  foto: Foto | null,
  numero: number,
  brilho: number,
  caixa: CaixaPx = FOLHA,
): Promise<boolean> {
  return fotoNaCaixa(
    ctx,
    pagina,
    foto,
    caixa,
    brilho < BRILHO.separador
      ? {
          arrastado: { angulo: anguloDaPagina(numero) },
          brilho,
          saturacao: 0.6,
          tecto: { lum: TECTO.texto },
          qualidade: 70,
        }
      : {
          arrastado: { angulo: anguloDaPagina(numero) },
          brilho,
          degrades: LEITURA,
          tecto: ZONA_DO_BLOCO,
          qualidade: 70,
        },
    LADO_FUNDO,
    1,
  );
}

/** Uma fotografia nítida com o escurecimento de leitura (capa, citação, fecho). */
export function fotoDeLeitura(
  ctx: Contexto,
  pagina: PDFPage,
  foto: Foto | null,
  caixa: CaixaPx,
  lado: number,
): Promise<boolean> {
  return fotoNaCaixa(
    ctx,
    pagina,
    foto,
    caixa,
    { degrades: LEITURA, tecto: ZONA_DO_BLOCO, qualidade: 74 },
    lado,
  );
}

/**
 * A zona do bloco de título (§4) nas páginas de fotografia: do sobretítulo de
 * um título em duas linhas (~62 % da altura) até ao fundo, e da margem até
 * 80 % da largura. É aí que se mede o contraste.
 */
export const ZONA_DO_BLOCO = { lum: TECTO.foto, desde: 0.62, ate: 0.8 } as const;

/** Um rectângulo chapado, em píxeis da grelha. */
export function rectangulo(pagina: PDFPage, c: CaixaPx, cor: RGB, borda?: RGB): void {
  pagina.drawRectangle({
    x: px(c.x),
    y: PAGINA_H - px(c.y + c.h),
    width: px(c.w),
    height: px(c.h),
    color: cor,
    ...(borda ? { borderColor: borda, borderWidth: px(1) } : {}),
  });
}

/**
 * A MOLDURA AFASTADA (§4): um rectângulo de 1 px em Cal, a 13 px à volta da
 * fotografia nítida, sem preenchimento.
 */
export function moldura(pagina: PDFPage, foto: CaixaPx): void {
  const d = 13;
  pagina.drawRectangle({
    x: px(foto.x - d),
    y: PAGINA_H - px(foto.y + foto.h + d),
    width: px(foto.w + 2 * d),
    height: px(foto.h + 2 * d),
    borderColor: COR.cal,
    borderWidth: px(1),
  });
}

/** Um fio horizontal de 1 px na Pedra — as tabelas, o índice, os dados. */
export function fio(pagina: PDFPage, x0: number, x1: number, y: number, cor = COR.pedra): void {
  pagina.drawLine({
    start: { x: px(x0), y: yDoTopo(y) },
    end: { x: px(x1), y: yDoTopo(y) },
    thickness: px(1),
    color: cor,
  });
}

/* ── O texto que se repete ──────────────────────────────────────────────── */

/** O sobretítulo em itálico (§3): Bodoni, minúsculas, na Cal. */
export function estiloSobretitulo(ctx: Contexto, tam: number): Estilo {
  return { letra: ctx.letras.bodoniItalico, tam, cor: COR.cal };
}

/** Um título em maiúsculas espaçadas, na Jost. */
export function estiloTitulo(ctx: Contexto, tam: number, espaco: number): Estilo {
  return { letra: ctx.letras.jost, tam, cor: COR.cal, espaco };
}

/** Um rótulo (CLIENTE, DATA…): Jost 11, maiúsculas espaçadas, Linho. */
export function estiloRotulo(ctx: Contexto, tam: number = LETRA.rotulo.tam): Estilo {
  return { letra: ctx.letras.jost, tam, cor: COR.linho, espaco: LETRA.rotulo.espaco };
}

/** A altura das maiúsculas da Jost, em fracção do tamanho — para assentar texto. */
const MAIUSCULA_JOST = 0.7;
/**
 * Do topo da linha do título à sua linha de base, em fracção do tamanho: a
 * ascendente da Jost com a meia entrelinha de 1,15. É o que põe o título a
 * 141 px quando o sobretítulo assenta a 92, como no modelo.
 */
const TOPO_A_BASE_JOST = 0.94;

/**
 * O cabeçalho das páginas de texto (§3, §4): o sobretítulo em itálico por
 * cima, encostado à esquerda, e o título em maiúsculas espaçadas 8 px abaixo.
 * O título encolhe até caber em DUAS linhas. Devolve a linha de base da última
 * linha do título, em píxeis da grelha.
 */
export function cabecalho(
  ctx: Contexto,
  pagina: PDFPage,
  o: { sobretitulo: string; titulo: string; x: number; largura: number; topo?: number },
): number {
  const m = medirCabecalho(ctx, o);
  escrever(
    pagina,
    estiloSobretitulo(ctx, LETRA.sobretitulo.tam),
    minusculas(o.sobretitulo),
    px(o.x),
    yDoTopo(m.baseSobre),
  );
  if (m.cortado)
    ctx.cortes.push({ where: `Título «${o.titulo}»`, dropped: m.cortado, unit: "linhas" });
  m.linhas.forEach((l, i) => escrever(pagina, m.estilo, l, px(o.x), yDoTopo(m.bases[i])));
  return m.bases[m.bases.length - 1];
}

/**
 * As medidas do {@link cabecalho} sem o desenhar: as linhas do título e as
 * suas linhas de base. É o que deixa as condições e o orçamento repartirem o
 * texto pelas páginas ANTES de as desenhar.
 */
export function medirCabecalho(
  ctx: Contexto,
  o: { titulo: string; largura: number; topo?: number },
) {
  const S = LETRA.sobretitulo;
  const T = LETRA.titulo;
  const topo = o.topo ?? TOPO_DO_TITULO;
  // A base do sobretítulo: o topo + a altura das ascendentes do itálico.
  const baseSobre = topo + S.tam * 1.05;
  const c = caber(
    estiloTitulo(ctx, T.tam, T.espaco),
    maiusculas(o.titulo),
    px(o.largura),
    2,
    T.minimo,
  );
  const passo = c.estilo.tam * T.entrelinha;
  // A primeira linha do título: a sua caixa começa `abaixo` px depois da do
  // sobretítulo.
  const primeira = baseSobre + S.tam * 0.3 + S.abaixo + c.estilo.tam * TOPO_A_BASE_JOST;
  return {
    baseSobre,
    linhas: c.linhas,
    estilo: c.estilo,
    cortado: c.cortado,
    bases: c.linhas.map((_, i) => primeira + i * passo),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O BLOCO DE TÍTULO DAS PÁGINAS DE FOTOGRAFIA (§4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ancorado em baixo à esquerda (x = 72): sobretítulo → título → filete →
 * linha pequena. O filete (120 × 1 px, Cal) está SEMPRE a 658 px do topo, e a
 * linha pequena a 672; o título cresce PARA CIMA a partir do filete — com duas
 * linhas, sobe o sobretítulo com ele.
 *
 * Devolve onde acaba a linha pequena (para uma nota por baixo, quando a há).
 */
export function blocoDeTitulo(
  ctx: Contexto,
  pagina: PDFPage,
  o: {
    sobretitulo: string;
    titulo: string;
    /** A linha pequena por baixo do filete — vazia, não aparece. */
    linha?: string;
    /**
     * Até onde o título pode ir, em px da grelha. Por omissão 680, como no
     * modelo: «DECORAÇÃO E DECOR / FLORAL DO JANTAR», «POR NOS DEIXAREM FAZER
     * / PARTE DESTE MOMENTO» — e o título do separador não passa por baixo
     * da fotografia emoldurada.
     */
    largura?: number;
    /** O «&» de «NOME & NOME» em Bodoni itálico (a capa). */
    eComercial?: boolean;
  },
): number {
  const T = LETRA.tituloFoto;
  const x = MARGEM;
  const FILETE = 658;
  const e = estiloTitulo(ctx, T.tam, T.espaco);
  const c = caber(e, maiusculas(o.titulo), px(o.largura ?? 680), 2, T.minimo);
  if (c.cortado)
    ctx.cortes.push({ where: `Título «${o.titulo}»`, dropped: c.cortado, unit: "linhas" });
  const passo = c.estilo.tam * T.entrelinha;
  // A última linha assenta 28 px acima do filete (medido no modelo, a 48 px).
  const ultima = FILETE - 28 * (c.estilo.tam / T.tam);
  const primeira = ultima - (c.linhas.length - 1) * passo;
  c.linhas.forEach((l, i) => {
    const y = yDoTopo(primeira + i * passo);
    if (o.eComercial && l.includes("&")) linhaComEComercial(ctx, pagina, c.estilo, l, x, y);
    else escrever(pagina, c.estilo, l, px(x), y);
  });

  const S = LETRA.sobretituloFoto;
  // O sobretítulo: a sua base a 35 px das maiúsculas do título (o modelo).
  const baseSobre = primeira - c.estilo.tam * 0.7 - 31;
  escrever(
    pagina,
    estiloSobretitulo(ctx, S.tam),
    minusculas(o.sobretitulo),
    px(x),
    yDoTopo(baseSobre),
  );

  rectangulo(pagina, { x, y: FILETE, w: 120, h: 1 }, COR.cal);
  let fim = FILETE + 1;
  const linha = (o.linha ?? "").trim();
  if (linha) {
    const L = LETRA.linhaPequena;
    const el: Estilo = { letra: ctx.letras.jost, tam: L.tam, cor: COR.papel, espaco: L.espaco };
    const base = 672 + L.tam * MAIUSCULA_JOST;
    let texto = maiusculas(linha);
    const max = px(FOLHA_PX_W - 2 * MARGEM);
    while (texto.length > 1 && largura(el, texto) > max) texto = texto.slice(0, -1);
    escrever(pagina, el, texto, px(x), yDoTopo(base));
    fim = base + 6;
  }
  return fim;
}

/** «NOME & NOME»: os nomes na Jost, o «&» em Bodoni itálico (§6.1). */
function linhaComEComercial(
  ctx: Contexto,
  pagina: PDFPage,
  e: Estilo,
  linha: string,
  xPx: number,
  y: number,
) {
  const amp: Estilo = { letra: ctx.letras.bodoniItalico, tam: e.tam * 1.1, cor: e.cor };
  let x = px(xPx);
  const partes = linha.split("&");
  partes.forEach((parte, i) => {
    if (i) {
      escrever(pagina, amp, "&", x, y);
      x += largura(amp, "&");
    }
    if (parte) {
      escrever(pagina, e, parte, x, y);
      x += largura(e, parte) + px(e.tam * (e.espaco ?? 0));
    }
  });
}

/** O logótipo no canto superior esquerdo das páginas de fotografia (§4). */
export function logotipoNoCanto(ctx: Contexto, pagina: PDFPage): void {
  if (!ctx.logo) return;
  const h = 53;
  const w = (ctx.logo.width / ctx.logo.height) * h;
  pagina.drawImage(ctx.logo, { x: px(MARGEM), y: yDoTopo(53 + h), width: px(w), height: px(h) });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RODAPÉ DAS PÁGINAS DE TEXTO (§4)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   14   Proposta de decoração · Claudia Cruz · 11 de dezembro de 2026    [logo]
 *
 * O número da página à esquerda, o nome da proposta 43 px depois, com a linha
 * de base a 38 px do fundo, em Jost 10,7 no Linho. O logótipo (38 px de altura)
 * no canto de baixo à direita — como no modelo, a 18 px da borda. Numa página
 * com uma fotografia a toda a altura do lado direito (as condições), o
 * logótipo não entra: ficava por cima da fotografia.
 *
 * O texto encolhe com «…» se não couber; a marca de rascunho vai À FRENTE, e
 * é por isso que nunca cai.
 */
export function rodape(
  ctx: Contexto,
  pagina: PDFPage,
  numero: number,
  o: { x0?: number; x1?: number; logo?: boolean } = {},
): void {
  const x0 = o.x0 ?? MARGEM;
  const comLogo = o.logo ?? true;
  const e: Estilo = {
    letra: ctx.letras.jost,
    tam: RODAPE.tamanho,
    cor: COR.linho,
    espaco: LETRA.rodape.espaco,
  };
  const base = FOLHA_PX_H - RODAPE.fundo;
  const y = yDoTopo(base);
  escrever(pagina, e, String(numero), px(x0), y);
  let x1 = o.x1 ?? FOLHA_PX_W - MARGEM;
  if (comLogo && ctx.logo) {
    const h = 38;
    const w = (ctx.logo.width / ctx.logo.height) * h;
    const xl = FOLHA_PX_W - 18 - w;
    pagina.drawImage(ctx.logo, { x: px(xl), y: yDoTopo(base + 1), width: px(w), height: px(h) });
    x1 = Math.min(x1, xl - 24);
  }
  const xTexto = x0 + 43;
  const livre = px(x1 - xTexto);
  let meio = ctx.rodape;
  if (largura(e, meio) > livre) {
    while (meio.length > 1 && largura(e, `${meio}…`) > livre) meio = meio.slice(0, -1);
    meio = `${meio.trimEnd()}…`;
  }
  if (livre > px(40)) escrever(pagina, e, meio, px(xTexto), y);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RÓTULO + VALOR, ENTRE FIOS — os dados de «A proposta» e os contactos
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Um fio por cima e outro por baixo, o rótulo (Jost 11, maiúsculas espaçadas,
 * Linho) e o valor (Jost 19, Cal). Medido no modelo: o fio no topo da linha, o
 * rótulo assente 22 px abaixo, o valor 53 px abaixo, a linha seguinte 91 px
 * depois. Devolve o fundo, em píxeis da grelha.
 */
export function rotuloEValor(
  ctx: Contexto,
  pagina: PDFPage,
  o: {
    rotulo: string;
    valor: string;
    x: number;
    topo: number;
    largura: number;
    altura?: number;
    /** O tamanho do valor: 19 nos dados, 16 nos contactos (o modelo). */
    tam?: number;
    /** Onde assenta o valor, a partir do fio de cima. */
    baseDoValor?: number;
  },
): number {
  const altura = o.altura ?? 91;
  const rot = estiloRotulo(ctx);
  const val: Estilo = { letra: ctx.letras.jost, tam: o.tam ?? LETRA.valor.tam, cor: COR.cal };
  fio(pagina, o.x, o.x + o.largura, o.topo);
  escrever(pagina, rot, maiusculas(o.rotulo), px(o.x), yDoTopo(o.topo + 22));
  const c = caber(val, o.valor, px(o.largura), 2, Math.min(14, val.tam));
  if (c.cortado) {
    ctx.cortes.push({ where: `Dados · ${o.rotulo}`, dropped: c.cortado, unit: "linhas" });
  }
  // Uma linha: assente a 53 px. Duas: sobem juntas, menores.
  const passo = c.estilo.tam * LETRA.valor.entrelinha;
  const primeira = o.topo + (o.baseDoValor ?? 53) - (c.linhas.length - 1) * passo * 0.5;
  c.linhas.forEach((l, i) => escrever(pagina, c.estilo, l, px(o.x), yDoTopo(primeira + i * passo)));
  fio(pagina, o.x, o.x + o.largura, o.topo + altura);
  return o.topo + altura;
}

/**
 * Uma nota em Bodoni itálico, no Linho (§3) — os temas, «a proposta». Encolhe
 * até caber em `maxLinhas`; só então corta, e o corte vai para o relatório.
 * Devolve o fundo, em píxeis da grelha.
 */
export function nota(
  ctx: Contexto,
  pagina: PDFPage,
  o: { texto: string; x: number; topo: number; largura: number; maxLinhas: number; onde: string },
): number {
  const N = LETRA.nota;
  const texto = o.texto.trim();
  if (!texto) return o.topo;
  const c = caber(
    { letra: ctx.letras.bodoniItalico, tam: N.tam, cor: COR.linho },
    texto,
    px(o.largura),
    Math.max(1, o.maxLinhas),
    N.minimo,
  );
  if (c.cortado) ctx.cortes.push({ where: o.onde, dropped: c.cortado, unit: "linhas" });
  return bloco(pagina, c.estilo, c.linhas, o.x, o.topo, N.entrelinha);
}
