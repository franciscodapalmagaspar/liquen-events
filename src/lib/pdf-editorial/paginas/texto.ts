import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { BRILHO } from "../imagens";
import {
  FUNDO_DO_CONTEUDO,
  cabecalho,
  fio,
  fotoNaCaixa,
  fundoArrastado,
  moldura,
  nota,
  novaPagina,
  rodape,
  rotuloEValor,
  type CaixaPx,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import { escrever, escreverADireita, largura, yDoTopo, type Estilo } from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ÍNDICE E «A PROPOSTA» — texto sobre um fundo arrastado (§6.2, §6.3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O fundo é a fotografia da própria página, arrastada em movimento e
 * escurecida (brilho 0,42); por cima, a mesma fotografia nítida, com a
 * moldura afastada. «O fundo arrastado pode ser a mesma foto que aparece
 * nítida nessa página» — é o que se faz, e a página fica com UMA fotografia.
 */

/* ── Índice ──────────────────────────────────────────────────────────────── */

export interface EntradaDoIndice {
  titulo: string;
  pagina: number;
}

export interface DadosDoIndice {
  sobretitulo: string;
  titulo: string;
  entradas: readonly EntradaDoIndice[];
  foto: Foto | null;
  numero: number;
}

const FOTO_DO_INDICE: CaixaPx = { x: 91, y: 96, w: 322, h: 442 };
const INDICE_X = 504;
const INDICE_FIM = INDICE_X + 547;
const PRIMEIRA_LINHA = 235;

export async function indice(ctx: Contexto, d: DadosDoIndice): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoArrastado(ctx, p, d.foto, d.numero, BRILHO.texto);
  if (await fotoNaCaixa(ctx, p, d.foto, FOTO_DO_INDICE)) moldura(p, FOTO_DO_INDICE);

  cabecalho(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.titulo,
    x: INDICE_X,
    topo: 82,
    largura: INDICE_FIM - INDICE_X,
  });

  const num: Estilo = {
    letra: ctx.letras.bodoniItalico,
    tam: LETRA.indiceNumero.tam,
    cor: COR.linho,
  };
  const item: Estilo = { letra: ctx.letras.jost, tam: LETRA.indiceItem.tam, cor: COR.cal };
  const pag: Estilo = { letra: ctx.letras.jost, tam: LETRA.indicePagina.tam, cor: COR.linho };
  // Linhas de 61 px; com muitos capítulos, encolhem para caberem acima do rodapé.
  const alt = Math.min(
    61,
    (FUNDO_DO_CONTEUDO - 16 - PRIMEIRA_LINHA) / Math.max(1, d.entradas.length),
  );
  let topo = PRIMEIRA_LINHA;
  fio(p, INDICE_X, INDICE_FIM, topo);
  for (const [i, en] of d.entradas.entries()) {
    // A base das letras a ~62% da linha, como no modelo (38 px em 61).
    const base = yDoTopo(topo + alt * 0.62);
    escrever(p, num, String(i + 1).padStart(2, "0"), px(INDICE_X), base);
    const n = String(en.pagina).padStart(2, "0");
    escreverADireita(p, pag, n, px(INDICE_FIM), base);
    const livre = px(INDICE_FIM - 58 - 24) - largura(pag, n) - px(INDICE_X);
    let texto = en.titulo;
    while (texto.length > 1 && largura(item, texto) > livre) texto = texto.slice(0, -1);
    if (texto !== en.titulo) texto = `${texto.trimEnd()}…`;
    escrever(p, item, texto, px(INDICE_X + 58), base);
    topo += alt;
    fio(p, INDICE_X, INDICE_FIM, topo);
  }
  rodape(ctx, p, d.numero, { x0: INDICE_X });
  return p;
}

/* ── A proposta ──────────────────────────────────────────────────────────── */

export interface DadosDaApresentacao {
  sobretitulo: string;
  titulo: string;
  /** Os factos, já sem os vazios, pela ordem em que aparecem. */
  factos: readonly { rotulo: string; valor: string }[];
  /** A nota em itálico por baixo da fotografia. */
  nota: string;
  foto: Foto | null;
  numero: number;
}

const FOTO_DA_PROPOSTA: CaixaPx = { x: 797, y: 96, w: 288, h: 374 };
const COLUNA = 317;
const COLUNAS_X = [MARGEM, 418] as const;
const PRIMEIRO_DADO = 264;

export async function apresentacao(ctx: Contexto, d: DadosDaApresentacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoArrastado(ctx, p, d.foto, d.numero, BRILHO.texto);
  const temFoto = await fotoNaCaixa(ctx, p, d.foto, FOTO_DA_PROPOSTA);
  if (temFoto) moldura(p, FOTO_DA_PROPOSTA);

  cabecalho(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.titulo,
    x: MARGEM,
    largura: (temFoto ? FOTO_DA_PROPOSTA.x - 13 - 24 : FOLHA_PX_W - MARGEM) - MARGEM,
  });

  // Duas colunas, linha a linha: CLIENTE | EVENTO, DATA | LOCAL, …
  const alt = Math.min(
    91,
    (FUNDO_DO_CONTEUDO - 20 - PRIMEIRO_DADO) / Math.ceil(d.factos.length / 2),
  );
  d.factos.forEach((f, i) => {
    rotuloEValor(ctx, p, {
      rotulo: f.rotulo,
      valor: f.valor,
      x: COLUNAS_X[i % 2],
      topo: PRIMEIRO_DADO + Math.floor(i / 2) * alt,
      largura: COLUNA,
      altura: alt,
    });
  });

  if (d.nota.trim()) {
    const x = FOTO_DA_PROPOSTA.x - 13;
    const topo = temFoto ? FOTO_DA_PROPOSTA.y + FOTO_DA_PROPOSTA.h + 13 + 24 : PRIMEIRO_DADO;
    nota(ctx, p, {
      texto: d.nota,
      x,
      topo,
      largura: FOLHA_PX_W - 24 - x,
      maxLinhas: Math.floor((FUNDO_DO_CONTEUDO - topo) / (LETRA.nota.tam * LETRA.nota.entrelinha)),
      onde: "A proposta · nota",
    });
  }
  rodape(ctx, p, d.numero);
  return p;
}
