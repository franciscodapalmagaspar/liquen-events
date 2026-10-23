import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { BRILHO, LADO_PAGINA, LEITURA, TECTO } from "../imagens";
import {
  FOLHA,
  FUNDO_DO_CONTEUDO,
  blocoDeTitulo,
  cabecalho,
  estiloRotulo,
  estiloSobretitulo,
  estiloTitulo,
  fotoDeLeitura,
  fotoNaCaixa,
  fundoArrastado,
  logotipoNoCanto,
  moldura,
  nota,
  novaPagina,
  rectangulo,
  rodape,
  ZONA_DO_BLOCO,
  type CaixaPx,
  type Contexto,
} from "../moldura";
import { composicao, levaBloco, type Disposicao } from "../mosaico";
import { COR, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import { caber, escrever, maiusculas, minusculas, quebrar, yDoTopo } from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DOS TEMAS DE INSPIRAÇÃO (§6.6b)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mosaico de ponta a ponta, sem margens e sem rodapé, com 6 px entre as
 * fotografias e o fundo Tinta à vista. O texto do tema vive numa CÉLULA do
 * mosaico (fundo Tinta, 346 px de largura, metade da altura): sobretítulo em
 * itálico, título em maiúsculas, a nota em Bodoni itálico. A composição é a
 * que ela escolheu para o tema, ou a automática pelo número de fotografias —
 * ver `mosaico.ts`.
 */

export interface DadosDoTema {
  /** A vez do tema na proposta: 1, 2, 3… — decide o lado da célula. */
  numero: number;
  /** O número do capítulo («inspiração · 01»). */
  capitulo: number;
  /** Num casamento, o nome do capítulo («Jantar»); fora dele, vazio. */
  grupo: string;
  titulo: string;
  subtitulo: string;
  nota: string;
  /** As fotografias DESTA página, pela ordem dela. */
  fotos: readonly Foto[];
  /** O número desta página no documento. */
  pagina: number;
  /** A primeira página do tema (as seguintes de um tema longo não repetem o bloco). */
  primeira: boolean;
  /** Só para um tema SEM fotografias: uma fotografia de outro tema do capítulo. */
  painel?: Foto | null;
  /** A disposição que ela escolheu para o tema; sem ela, a automática. */
  disposicao?: Disposicao | null;
}

const sobretituloDoTema = (ctx: Contexto, d: DadosDoTema) =>
  `${ctx.te.inspiracao} · ${String(d.capitulo).padStart(2, "0")}`;

export async function tema(ctx: Contexto, d: DadosDoTema): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const c = composicao(
    d.fotos.map((f) => f.aspecto),
    d.numero % 2 === 0,
    d.disposicao,
  );
  const sobre = sobretituloDoTema(ctx, d);

  if (c.tipo === "texto") {
    await paginaDeTexto(ctx, p, d, sobre);
    return p;
  }

  if (c.tipo === "inteira") {
    await fotoDeLeitura(ctx, p, d.fotos[0], FOLHA, LADO_PAGINA);
    logotipoNoCanto(ctx, p);
    const fim = blocoDeTitulo(ctx, p, {
      sobretitulo: sobre,
      titulo: d.titulo,
      linha: d.subtitulo,
    });
    if (d.primeira && d.nota) {
      nota(ctx, p, {
        texto: d.nota,
        x: MARGEM,
        topo: fim + 10,
        largura: 640,
        maxLinhas: 2,
        onde: `Tema «${d.titulo}» · nota`,
      });
    }
    return p;
  }

  const comBloco = levaBloco(c.tipo, d.primeira, Boolean(d.grupo));
  await Promise.all(
    c.celulas.map((caixa, i) =>
      comBloco && c.tipo !== "desalinhadas"
        ? fotoNaCaixa(ctx, p, d.fotos[i] ?? null, caixa, {
            degrades: LEITURA,
            tecto: { lum: TECTO.foto, desde: ZONA_DO_BLOCO.desde },
          })
        : fotoNaCaixa(ctx, p, d.fotos[i] ?? null, caixa),
    ),
  );
  if (comBloco) {
    const fim = blocoDeTitulo(ctx, p, { sobretitulo: sobre, titulo: d.titulo, linha: d.subtitulo });
    if (d.nota) {
      nota(ctx, p, {
        texto: d.nota,
        x: MARGEM,
        topo: fim + 10,
        largura: 640,
        maxLinhas: 2,
        onde: `Tema «${d.titulo}» · nota`,
      });
    }
  }
  if ("mosaico" in c) celulaDeTexto(ctx, p, c.mosaico, d, sobre);
  return p;
}

/* ── A célula de texto ───────────────────────────────────────────────────── */

/**
 * A célula de texto: fundo Tinta, o sobretítulo em itálico, o título em
 * maiúsculas espaçadas (Jost 24, nunca a partir palavras), o subtítulo como
 * rótulo, e a nota em Bodoni itálico. Medido no modelo: 48 px de margem, o
 * sobretítulo assente a 75 px do topo, o título 34 px depois.
 *
 * A nota encolhe até caber na célula; só se nem assim couber é que se corta,
 * com «…», e o corte vai para o relatório que ela lê antes de enviar.
 */
function celulaDeTexto(ctx: Contexto, p: PDFPage, cx: CaixaPx, d: DadosDoTema, sobre: string) {
  rectangulo(p, cx, COR.tinta);
  const x = cx.x + 48;
  const largo = cx.w - 48 - 30;
  const S = LETRA.sobretitulo;
  const baseSobre = cx.y + 75;
  escrever(p, estiloSobretitulo(ctx, S.tam), minusculas(sobre), px(x), yDoTopo(baseSobre));

  const T = LETRA.tituloDoTema;
  const tit = caberSemPartir(ctx, maiusculas(d.titulo || ctx.te.inspiracao), px(largo));
  if (tit.cortado) {
    ctx.cortes.push({ where: `Tema «${d.titulo}» · título`, dropped: tit.cortado, unit: "linhas" });
  }
  const passo = tit.estilo.tam * T.entrelinha;
  let base = baseSobre + 34;
  tit.linhas.forEach((l, i) => escrever(p, tit.estilo, l, px(x), yDoTopo(base + i * passo)));
  base += (tit.linhas.length - 1) * passo;

  // O subtítulo só num casamento: fora dele o capítulo é o próprio tema, e o
  // separador que vem antes já o diz na linha pequena (o modelo não o repete).
  const sub = !d.primeira ? ctx.te.maisIdeias : d.grupo ? d.subtitulo.trim() : "";
  if (sub) {
    const r = estiloRotulo(ctx);
    const linhas = quebrar(r, maiusculas(sub), px(largo)).slice(0, 2);
    base += 30;
    linhas.forEach((l, i) => escrever(p, r, l, px(x), yDoTopo(base + i * 16)));
    base += (linhas.length - 1) * 16;
  }

  const texto = d.primeira ? d.nota.trim() : "";
  if (texto) {
    const topo = base + 52;
    const fundo = cx.y + cx.h - 28;
    nota(ctx, p, {
      texto,
      x,
      topo,
      largura: largo,
      maxLinhas: Math.floor((fundo - topo) / (LETRA.nota.tam * LETRA.nota.entrelinha)),
      onde: `Tema «${d.titulo}» · nota`,
    });
  }
}

/**
 * O título do tema em até três linhas, sem nunca partir uma palavra: se a
 * palavra mais comprida não cabe na largura, a letra desce até caber.
 */
function caberSemPartir(ctx: Contexto, texto: string, max: number) {
  const T = LETRA.tituloDoTema;
  let e = estiloTitulo(ctx, T.tam, T.espaco);
  const palavras = texto.split(/\s+/).filter(Boolean);
  while (
    e.tam > T.minimo &&
    palavras.some((w) => quebrar(e, w, max).length > 1 || caber(e, w, max, 1, e.tam).cortado)
  ) {
    e = { ...e, tam: e.tam - 0.5 };
  }
  return caber(e, texto, max, 3, T.minimo);
}

/* ── Um tema sem fotografias ─────────────────────────────────────────────── */

/** A fotografia emoldurada, no mesmo sítio da de «A proposta». */
const FOTO_DO_TEXTO: CaixaPx = { x: 797, y: 96, w: 288, h: 374 };

/**
 * Um tema só com texto: o fundo arrastado de outra fotografia do capítulo (o
 * painel), essa fotografia emoldurada à direita, e o texto à esquerda, com o
 * rodapé. Sem fotografia nenhuma na proposta, fica a Tinta de recurso.
 */
async function paginaDeTexto(ctx: Contexto, p: PDFPage, d: DadosDoTema, sobre: string) {
  const painel = d.painel ?? null;
  await fundoArrastado(ctx, p, painel, d.pagina, BRILHO.texto);
  const temFoto = await fotoNaCaixa(ctx, p, painel, FOTO_DO_TEXTO);
  if (temFoto) moldura(p, FOTO_DO_TEXTO);
  const largo = (temFoto ? FOTO_DO_TEXTO.x - 13 - 40 : FOLHA_PX_W - MARGEM) - MARGEM;
  let base = cabecalho(ctx, p, {
    sobretitulo: sobre,
    titulo: d.titulo || ctx.te.inspiracao,
    x: MARGEM,
    largura: largo,
  });
  if (d.subtitulo.trim()) {
    base += 44;
    escrever(p, estiloRotulo(ctx), maiusculas(d.subtitulo), px(MARGEM), yDoTopo(base));
  }
  if (d.nota.trim()) {
    const topo = base + 50;
    nota(ctx, p, {
      texto: d.nota,
      x: MARGEM,
      topo,
      largura: Math.min(560, largo),
      maxLinhas: Math.floor(
        (FUNDO_DO_CONTEUDO - 20 - topo) / (LETRA.nota.tam * LETRA.nota.entrelinha),
      ),
      onde: `Tema «${d.titulo}» · nota`,
    });
  }
  rodape(ctx, p, d.pagina);
}
