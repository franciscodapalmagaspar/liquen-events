import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { BRILHO, CARTAO, LADO_PAGINA } from "../imagens";
import {
  FUNDO_DO_CONTEUDO,
  cabecalho,
  fotoNaCaixa,
  fundoArrastado,
  novaPagina,
  rectangulo,
  rodape,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, hexParaRgb, px } from "../paleta";
import { CARTOES_POR_PAGINA } from "../plano";
import { caber, escrever, maiusculas, yDoTopo, type Estilo } from "../texto";

export { CARTOES_POR_PAGINA };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «O QUE PROPOMOS» (§6.4) E «A PALETA E O AMBIENTE» (§6.5)
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ── O que propomos ──────────────────────────────────────────────────────── */

export interface Servico {
  nome: string;
  /** A descrição que ela escreveu no serviço, se escreveu. */
  descricao: string;
  /** A primeira fotografia do tema que lhe corresponde. */
  foto: Foto | null;
}

export interface DadosDosServicos {
  sobretitulo: string;
  titulo: string;
  /** Os serviços DESTA página (até {@link CARTOES_POR_PAGINA}). */
  servicos: readonly Servico[];
  /** O número do primeiro cartão desta página (1, 4, 7…). */
  primeiro: number;
  pagina: number;
}

const TOPO_DOS_CARTOES = 211;
const VAO = 7;

/**
 * Os cartões lado a lado a toda a largura útil, de 211 px até ao rodapé — dois
 * cartões são 486 × 504 com 7 px entre eles, três dividem por igual. Cada um é
 * a fotografia do serviço, com o gradiente no terço de baixo (fundido na
 * imagem), e POR CIMA dela, em baixo: o número em itálico, o nome em
 * maiúsculas e a descrição. Fundo Tinta, sem bordas.
 */
export async function servicos(ctx: Contexto, d: DadosDosServicos): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const largo = FOLHA_PX_W - 2 * MARGEM;
  cabecalho(ctx, p, { sobretitulo: d.sobretitulo, titulo: d.titulo, x: MARGEM, largura: largo });

  const n = Math.max(1, d.servicos.length);
  const w = (largo - VAO * (n - 1)) / n;
  const h = FUNDO_DO_CONTEUDO - TOPO_DOS_CARTOES;
  const num: Estilo = {
    letra: ctx.letras.bodoniItalico,
    tam: LETRA.cartaoNumero.tam,
    cor: COR.linho,
  };
  const nome: Estilo = {
    letra: ctx.letras.jost,
    tam: LETRA.cartaoNome.tam,
    cor: COR.cal,
    espaco: LETRA.cartaoNome.espaco,
  };
  const desc: Estilo = { letra: ctx.letras.jost, tam: LETRA.cartaoDescricao.tam, cor: COR.linho };

  for (const [i, s] of d.servicos.entries()) {
    const x = MARGEM + i * (w + VAO);
    const caixa = { x, y: TOPO_DOS_CARTOES, w, h };
    await fotoNaCaixa(ctx, p, s.foto, caixa, { degrades: CARTAO }, LADO_PAGINA, 1.4);
    // O texto, de baixo para cima: a descrição, o nome, e o número ao lado.
    const xTexto = x + 80;
    const largura = px(w - 80 - 28);
    const ds = s.descricao.trim() ? caber(desc, s.descricao, largura, 4, 11) : null;
    if (ds?.cortado) {
      ctx.cortes.push({ where: `O que propomos · ${s.nome}`, dropped: ds.cortado, unit: "linhas" });
    }
    const nm = caber(nome, maiusculas(s.nome), largura, 3, 10);
    let base = TOPO_DOS_CARTOES + h - 46;
    if (ds) {
      const passo = ds.estilo.tam * LETRA.cartaoDescricao.entrelinha;
      const primeira = base - (ds.linhas.length - 1) * passo;
      ds.linhas.forEach((l, k) =>
        escrever(p, ds.estilo, l, px(xTexto), yDoTopo(primeira + k * passo)),
      );
      base = primeira - 30;
    }
    const passoNome = nm.estilo.tam * LETRA.cartaoNome.entrelinha;
    const primeiraNome = base - (nm.linhas.length - 1) * passoNome;
    nm.linhas.forEach((l, k) =>
      escrever(p, nm.estilo, l, px(xTexto), yDoTopo(primeiraNome + k * passoNome)),
    );
    escrever(p, num, String(d.primeiro + i).padStart(2, "0"), px(x + 28), yDoTopo(primeiraNome));
  }
  rodape(ctx, p, d.pagina);
  return p;
}

/* ── A paleta e o ambiente ───────────────────────────────────────────────── */

export interface DadosDoAmbiente {
  /** As cinco cores, `#RRGGBB`. */
  cores: readonly string[];
  /** Até cinco fotografias para a fila de baixo. */
  fotos: readonly Foto[];
  /** A fotografia a toda a altura, à esquerda. */
  painel: Foto | null;
  pagina: number;
}

/** A fotografia a toda a altura, à esquerda (442 px). */
const PAINEL = { x: 0, y: 0, w: 442, h: FOLHA_PX_H };
const X0 = 504;
const LADO = 103;
const ENTRE = 8;

export async function ambiente(ctx: Contexto, d: DadosDoAmbiente): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const direita = { x: PAINEL.w, y: 0, w: FOLHA_PX_W - PAINEL.w, h: FOLHA_PX_H };
  await fundoArrastado(ctx, p, d.painel, d.pagina, BRILHO.texto, direita);
  await fotoNaCaixa(ctx, p, d.painel, PAINEL, {}, LADO_PAGINA);

  const fim = cabecalho(ctx, p, {
    sobretitulo: ctx.te.sobretituloAmbiente,
    titulo: ctx.te.tituloAmbiente,
    x: X0,
    largura: FOLHA_PX_W - MARGEM - X0,
  });
  const frase: Estilo = { letra: ctx.letras.jost, tam: 13, cor: COR.linho };
  escrever(p, frase, ctx.te.subtituloAmbiente, px(X0), yDoTopo(fim + 34));

  const topoCores = 243;
  const hex: Estilo = {
    letra: ctx.letras.jost,
    tam: LETRA.hex.tam,
    cor: COR.linho,
    espaco: LETRA.hex.espaco,
  };
  for (const [i, cor] of d.cores.slice(0, 5).entries()) {
    const x = X0 + i * (LADO + ENTRE);
    rectangulo(p, { x, y: topoCores, w: LADO, h: 211 }, hexParaRgb(cor as `#${string}`), COR.pedra);
    escrever(p, hex, maiusculas(cor), px(x), yDoTopo(topoCores + 211 + 20));
  }
  await Promise.all(
    d.fotos
      .slice(0, 5)
      .map((f, i) =>
        fotoNaCaixa(ctx, p, f, { x: X0 + i * (LADO + ENTRE), y: 527, w: LADO, h: LADO }),
      ),
  );
  rodape(ctx, p, d.pagina, { x0: X0 });
  return p;
}
