import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { BRILHO } from "../imagens";
import {
  FUNDO_DO_CONTEUDO,
  cabecalho,
  estiloRotulo,
  fio,
  fundoArrastado,
  medirCabecalho,
  novaPagina,
  rodape,
  type Contexto,
} from "../moldura";
import { COR, LETRA, MARGEM, px } from "../paleta";
import {
  caber,
  escrever,
  escreverADireita,
  largura,
  maiusculas,
  quebrar,
  yDoTopo,
  type Estilo,
} from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O INVESTIMENTO (§6.8) — a página do total e o quadro dos serviços
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os números são os que o gerador antigo já calcula (`totaisDaProposta`) e
 * escreve (`eurDocumento` + `montanteNaLingua`). Estas páginas só os arrumam:
 * nenhum valor é calculado aqui.
 *
 * As duas sobre o fundo arrastado escuro, com o texto à esquerda — como no
 * modelo, o lado direito fica para a fotografia em movimento.
 */

/* ── O total ─────────────────────────────────────────────────────────────── */

export interface DadosDoTotal {
  /** «Total a pagar», ou o rótulo dela quando não há total estruturado. */
  rotulo: string;
  /** «4.501,80 €». */
  valor: string;
  /** «Com IVA incluído.» — só quando o valor é o total a pagar. */
  nota?: string;
  /** Subtotal, adicionais, total sem IVA, IVA. */
  linhas: readonly { rotulo: string; valor: string; forte?: boolean }[];
  /** Sinal e saldo. */
  marcos: readonly { valor: string; texto: string }[];
  /** O que vem depois: a versão sem extras, a nota do orçamento. */
  rodapeDoTotal: readonly string[];
  foto: Foto | null;
  pagina: number;
}

/** A tabela do total: 595 px de largura, linhas de 43 px (o documento). */
const TABELA = 595;
const LINHA = 43;
const ENTRE_MARCOS = 18;

/**
 * Medido no modelo: o preço assenta a 275 px, «Com IVA incluído.» 37 px
 * depois, o primeiro fio da tabela a 350, o texto de cada linha 28 px abaixo
 * do seu fio; os marcos assentam 67 px depois do último fio, e o texto deles
 * 38 px abaixo do valor.
 */
export async function total(ctx: Contexto, d: DadosDoTotal): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoArrastado(ctx, p, d.foto, d.pagina, BRILHO.texto);
  const fimDoTitulo = cabecalho(ctx, p, {
    sobretitulo: ctx.te.sobretituloInvestimento,
    titulo: d.rotulo,
    x: MARGEM,
    largura: 900,
  });

  const preco = caber(
    { letra: ctx.letras.bodoni, tam: LETRA.preco.tam, cor: COR.cal },
    d.valor,
    px(900),
    1,
    LETRA.preco.minimo,
  );
  const lin: Estilo = { letra: ctx.letras.jost, tam: LETRA.linhaOrcamento.tam, cor: COR.cal };
  // Os marcos na Jost, e não na Bodoni do documento: a 32 px, no ecrã de um
  // telemóvel, o traço fino da Bodoni (e o «€» e as vírgulas) somem-se —
  // o pedido dela de 23/10. Só o preço grande fica na Bodoni.
  const marco: Estilo = {
    letra: ctx.letras.jost,
    tam: LETRA.marco.tam,
    cor: COR.cal,
    espaco: LETRA.marco.espaco,
  };
  const M = LETRA.marcoTexto;
  const marcoT: Estilo = { letra: ctx.letras.jost, tam: M.tam, cor: COR.linho };
  const N = LETRA.notaPequena;
  const nota: Estilo = { letra: ctx.letras.jost, tam: N.tam, cor: COR.linho };
  const colMarco = (TABELA - ENTRE_MARCOS) / 2;
  const textosDosMarcos = d.marcos.map((m) => quebrar(marcoT, m.texto, px(colMarco)));
  const linhasDosMarcos = Math.max(0, ...textosDosMarcos.map((l) => l.length));
  const notas = d.rodapeDoTotal.flatMap((t) => quebrar(nota, t, px(TABELA)));

  // Com muitas linhas na escada (vários adicionais), as linhas encolhem até
  // 34 px para tudo caber acima do rodapé; nunca se corta um valor.
  let basePreco = Math.max(275, fimDoTitulo + 134);
  const depoisDaTabela = () =>
    (d.marcos.length ? 67 + 38 + (linhasDosMarcos - 1) * M.tam * M.entrelinha : 0) +
    (notas.length ? 34 + (notas.length - 1) * N.tam * N.entrelinha : 0);
  let alt = LINHA;
  const fundo = FUNDO_DO_CONTEUDO - 10;
  const precisa = () => basePreco + 75 + d.linhas.length * alt + depoisDaTabela();
  while (precisa() > fundo && alt > 34) alt -= 1;
  if (precisa() > fundo) basePreco = Math.max(fimDoTitulo + 100, basePreco - (precisa() - fundo));

  escrever(p, preco.estilo, preco.linhas[0] ?? "", px(MARGEM), yDoTopo(basePreco));
  if (d.nota) escrever(p, nota, d.nota, px(MARGEM), yDoTopo(basePreco + 37));

  let topo = basePreco + 75;
  if (d.linhas.length) {
    fio(p, MARGEM, MARGEM + TABELA, topo);
    for (const l of d.linhas) {
      const y = yDoTopo(topo + alt * (28 / LINHA));
      escreverADireita(p, lin, l.valor, px(MARGEM + TABELA), y);
      const livre = px(TABELA - 24) - largura(lin, l.valor);
      let rotulo = l.rotulo;
      while (rotulo.length > 1 && largura(lin, rotulo) > livre) rotulo = rotulo.slice(0, -1);
      if (rotulo !== l.rotulo) {
        rotulo = `${rotulo.trimEnd()}…`;
        ctx.cortes.push({ where: `Investimento · ${l.rotulo}`, dropped: 1, unit: "linhas" });
      }
      escrever(p, lin, rotulo, px(MARGEM), y);
      topo += alt;
      fio(p, MARGEM, MARGEM + TABELA, topo);
    }
  }

  if (d.marcos.length) {
    const base = topo + 67;
    d.marcos.forEach((m, i) => {
      const x = MARGEM + i * (colMarco + ENTRE_MARCOS);
      const v = caber(marco, m.valor, px(colMarco), 1, 20);
      escrever(p, v.estilo, v.linhas[0] ?? "", px(x), yDoTopo(base));
      textosDosMarcos[i].forEach((l, k) =>
        escrever(p, marcoT, l, px(x), yDoTopo(base + 38 + k * M.tam * M.entrelinha)),
      );
    });
    topo = base + 38 + (linhasDosMarcos - 1) * M.tam * M.entrelinha;
  }

  notas.forEach((l, k) =>
    escrever(p, nota, l, px(MARGEM), yDoTopo(topo + 34 + k * N.tam * N.entrelinha)),
  );
  rodape(ctx, p, d.pagina);
  return p;
}

/* ── O quadro ────────────────────────────────────────────────────────────── */

export interface LinhaDoOrcamento {
  nome: string;
  /** «extra», numa linha opcional. */
  marca?: string;
  /** O preço escrito, no modelo de Organização. */
  preco?: string;
}

export interface DadosDoOrcamento {
  titulo: string;
  subtitulo: string;
  linhas: readonly LinhaDoOrcamento[];
  /** O número da primeira linha desta página. */
  primeiro: number;
  painel: Foto | null;
  pagina: number;
}

/**
 * O quadro: a mesma tabela do total (fios Pedra, linhas de 43 px), mais larga
 * porque os nomes dos serviços são compridos. O número em Bodoni itálico como
 * no índice, o nome na Jost, e o valor ou a marca «extra» à direita, também na
 * Jost (o documento pedia Bodoni itálico; ver a Parte −1).
 */
const QUADRO = 760;
const NUMERO = 58;
const ENTRELINHA_DO_NOME = 1.3;
/** O primeiro fio, com o título numa linha e o subtítulo por baixo. */
const PRIMEIRO_FIO = 235;

const estiloDoNome = (ctx: Contexto): Estilo => ({
  letra: ctx.letras.jost,
  tam: LETRA.linhaOrcamento.tam,
  cor: COR.cal,
});
// Os valores na Jost, como os da tabela do total: em Bodoni itálico, a 18 px,
// os traços finos somem-se num telemóvel (o pedido dela de 23/10).
const estiloDoValor = (ctx: Contexto, marca: boolean): Estilo => ({
  letra: ctx.letras.jost,
  tam: LETRA.linhaOrcamento.tam,
  cor: marca ? COR.linho : COR.cal,
});

/** As linhas de um item, partidas à largura que lhe sobra depois do número e do valor. */
function linhasDe(ctx: Contexto, l: LinhaDoOrcamento): string[] {
  const valor = l.preco || l.marca || "";
  const direita = valor ? largura(estiloDoValor(ctx, !l.preco), valor) + px(24) : 0;
  return quebrar(estiloDoNome(ctx), l.nome, px(QUADRO - NUMERO) - direita);
}

const alturaDaLinha = (ctx: Contexto, l: LinhaDoOrcamento) =>
  LINHA + (linhasDe(ctx, l).length - 1) * LETRA.linhaOrcamento.tam * ENTRELINHA_DO_NOME;

/** Reparte as linhas pelas páginas — um quadro comprido continua na seguinte. */
export function repartirLinhas(
  ctx: Contexto,
  linhas: readonly LinhaDoOrcamento[],
): LinhaDoOrcamento[][] {
  const cabe = FUNDO_DO_CONTEUDO - 16 - PRIMEIRO_FIO;
  const paginas: LinhaDoOrcamento[][] = [[]];
  let usado = 0;
  for (const l of linhas) {
    const h = alturaDaLinha(ctx, l);
    if (paginas[paginas.length - 1].length && usado + h > cabe) {
      paginas.push([]);
      usado = 0;
    }
    paginas[paginas.length - 1].push(l);
    usado += h;
  }
  return paginas;
}

export async function orcamento(ctx: Contexto, d: DadosDoOrcamento): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundoArrastado(ctx, p, d.painel, d.pagina, BRILHO.texto);
  const o = {
    sobretitulo: ctx.te.sobretituloInvestimento,
    titulo: d.titulo,
    x: MARGEM,
    largura: 900,
  };
  let base = cabecalho(ctx, p, o);
  if (d.subtitulo) {
    base += 44;
    escrever(p, estiloRotulo(ctx), maiusculas(d.subtitulo), px(MARGEM), yDoTopo(base));
  }
  // Um título em duas linhas empurra a tabela; o normal é o primeiro fio a 235.
  const umaLinha = medirCabecalho(ctx, { titulo: "x", largura: 900 }).bases[0];
  let topo = PRIMEIRO_FIO + Math.max(0, base - (umaLinha + 44));

  const nome = estiloDoNome(ctx);
  const num: Estilo = {
    letra: ctx.letras.bodoniItalico,
    tam: LETRA.indiceNumero.tam,
    cor: COR.linho,
  };
  fio(p, MARGEM, MARGEM + QUADRO, topo);
  for (const [i, l] of d.linhas.entries()) {
    const linhas = linhasDe(ctx, l);
    const h = alturaDaLinha(ctx, l);
    const y = topo + 28;
    escrever(p, num, String(d.primeiro + i).padStart(2, "0"), px(MARGEM), yDoTopo(y));
    linhas.forEach((ln, k) =>
      escrever(p, nome, ln, px(MARGEM + NUMERO), yDoTopo(y + k * nome.tam * ENTRELINHA_DO_NOME)),
    );
    const valor = l.preco || l.marca;
    if (valor)
      escreverADireita(p, estiloDoValor(ctx, !l.preco), valor, px(MARGEM + QUADRO), yDoTopo(y));
    topo += h;
    fio(p, MARGEM, MARGEM + QUADRO, topo);
  }
  rodape(ctx, p, d.pagina);
  return p;
}
