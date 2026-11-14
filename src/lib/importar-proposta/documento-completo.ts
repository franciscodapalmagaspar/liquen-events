import {
  attr,
  attrDeRelacao,
  descendente,
  filho,
  filhos,
  lerRelacoes,
  lerXml,
  resolverCaminho,
  type No,
} from "./xml";
import { FicheiroIlegivel } from "./zip";
import type { FormatoImportado } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOCUMENTO INTEIRO, PELA ORDEM — SEM DECIDIR NADA (pedido de 13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O Francisco: «o sistema lê o Word todo, ou o PowerPoint, analisa tudo,
 * verifica tudo». Os leitores de `docx.ts`/`pptx.ts` já decidem coisas (o
 * que é título, o que fica de fora — os diapositivos escondidos, o papel
 * timbrado). Este NÃO decide: devolve TUDO o que tem texto ou imagem, cada
 * coisa com um id estável, pela ordem do documento, para a leitura com IA
 * (`ia/perceber.ts`) ver o documento inteiro e a verificação
 * (`ia/verificar.ts`) poder provar, sem IA, que nada ficou para trás.
 *
 * O que entra:
 *  · Word — o corpo (parágrafos com estilo, nível de título, negrito e nível
 *    de lista; tabelas, linha a linha e célula a célula; caixas de texto;
 *    legendas), os cabeçalhos e rodapés da página, as notas de rodapé, e cada
 *    imagem no sítio onde está.
 *  · PowerPoint — os diapositivos pela ordem da APRESENTAÇÃO (os escondidos
 *    também, marcados), o título, as caixas, as tabelas, o texto dos
 *    diagramas SmartArt, as notas do orador, e cada imagem (a do fundo
 *    também) com a descrição alternativa quando a tem.
 *
 * O que fica de fora, e diz-se em `avisos`: comentários, gráficos (o texto
 * deles vive noutra parte do ficheiro) e imagens ligadas de fora (não estão
 * no ficheiro).
 *
 * ── NADA SE PERDE: A CONTAGEM DOS DOIS LADOS ────────────────────────────────
 *
 * Cada parte lida é contada DUAS vezes, por caminhos diferentes: uma passagem
 * simples pelo XML (todos os `<t>`, todos os `<p>` com texto, todas as
 * imagens) e a soma do que a representação tem. Se não baterem, a leitura
 * falha com {@link LeituraIncompleta} — preferível a uma proposta a que falta
 * uma linha do orçamento sem ninguém saber.
 *
 * As duas contagens seguem as mesmas três regras de propósito (não são uma
 * falha de independência): ignora-se o `mc:Fallback` (o Word escreve a mesma
 * caixa de texto duas vezes, uma para cada versão), o texto apagado com
 * alterações registadas (`w:del`), e, nas notas do orador, o número do
 * diapositivo e a data.
 */

export type PapelDoParagrafo =
  | "corpo"
  | "titulo"
  | "caixa"
  | "legenda"
  | "notas"
  | "cabecalho"
  | "rodape"
  | "nota-de-rodape"
  | "diagrama";

export interface ParagrafoLido {
  tipo: "paragrafo";
  id: string;
  parte: string;
  texto: string;
  papel: PapelDoParagrafo;
  /** O nome do estilo do Word («heading 1», «List Paragraph»), quando tem. */
  estilo?: string;
  /** Nível de título: 0 = título do documento, 1 = «Título 1»… */
  nivel?: number;
  /** Nível de lista (0 = primeiro), quando é um ponto de uma lista. */
  lista?: number;
  negrito?: boolean;
  /** Tamanho da letra em pontos (PowerPoint), quando está escrito. */
  tamanho?: number;
}

export interface LinhaDeTabelaLida {
  tipo: "linha-de-tabela";
  id: string;
  parte: string;
  /** O id da tabela (`t3`), para as linhas se agruparem. */
  tabela: string;
  /** 0 = a primeira linha da tabela. */
  linha: number;
  celulas: string[];
  /** Quantos parágrafos com texto há nas células (para a contagem). */
  paragrafos: number;
}

export interface ImagemLida {
  tipo: "imagem";
  /** Id da OCORRÊNCIA (`o5`): a mesma imagem pode estar em dois sítios. */
  id: string;
  parte: string;
  /** Id da IMAGEM (`im2`) — igual em todas as ocorrências do mesmo ficheiro. */
  imagem: string;
  caminho: string;
  /** A descrição alternativa (PowerPoint/Word), quando a tem. */
  descricao?: string;
  /** A legenda («Legenda» do Word) logo a seguir, quando a tem. */
  legenda?: string;
  fundo?: boolean;
}

export type UnidadeLida = ParagrafoLido | LinhaDeTabelaLida | ImagemLida;

export interface ParteLida {
  id: string;
  tipo: "corpo" | "diapositivo" | "cabecalho" | "rodape" | "notas-de-rodape";
  /** «Diapositivo 3», «Cabeçalho da página», «Corpo do documento». */
  nome: string;
  numero?: number;
  escondido?: boolean;
}

export interface Contagem {
  caracteres: number;
  paragrafos: number;
  imagens: number;
}

export interface DocumentoCompleto {
  formato: FormatoImportado;
  partes: ParteLida[];
  unidades: UnidadeLida[];
  /** Uma entrada por ficheiro de imagem, pela ordem da primeira ocorrência. */
  imagens: { id: string; caminho: string; ocorrencias: number }[];
  contagem: { origem: Contagem; representacao: Contagem };
  avisos: string[];
}

export class LeituraIncompleta extends Error {
  constructor(
    message: string,
    readonly origem: Contagem,
    readonly representacao: Contagem,
  ) {
    super(message);
    this.name = "LeituraIncompleta";
  }
}

// ── O texto ──────────────────────────────────────────────────────────────────

const NAO_SE_LE = new Set(["del", "delText", "instrText", "Fallback"]);

/** Caracteres que contam (sem espaços), para as duas contagens. */
export function caracteresQueContam(s: string): number {
  let n = 0;
  for (const c of s) if (!/\s/u.test(c)) n++;
  return n;
}

/**
 * O texto PRÓPRIO de um parágrafo: os `<t>` dele, sem descer a outro `<p>`
 * (uma caixa de texto dentro do parágrafo é outro parágrafo, e sai à parte).
 */
function textoProprio(p: No): string {
  let s = "";
  const andar = (x: No | string) => {
    if (typeof x === "string") return;
    if (NAO_SE_LE.has(x.nome)) return;
    if (x.nome === "t") {
      for (const f of x.filhos) if (typeof f === "string") s += f;
      return;
    }
    if (x.nome === "p" && x !== p) return;
    if (x.nome === "tab") s += "\t";
    else if (x.nome === "br" || x.nome === "cr") s += "\n";
    else if (x.nome === "noBreakHyphen") s += "-";
    for (const f of x.filhos) andar(f);
  };
  andar(p);
  return s
    .replace(/[  ]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\t+/g, "\t")
    .trim();
}

/** Os `<p>` dentro de um nó, pela ordem, sem os do `mc:Fallback`. */
function paragrafosDentro(no: No): No[] {
  const out: No[] = [];
  const andar = (x: No) => {
    for (const f of x.filhos) {
      if (typeof f === "string" || NAO_SE_LE.has(f.nome)) continue;
      if (f.nome === "p") out.push(f);
      andar(f);
    }
  };
  andar(no);
  return out;
}

// ── A contagem simples, pela origem ──────────────────────────────────────────

function contarNaOrigem(
  raiz: No,
  imagemConta: (no: No) => boolean,
  saltar: (no: No) => boolean = () => false,
): Contagem {
  const c: Contagem = { caracteres: 0, paragrafos: 0, imagens: 0 };
  const andar = (x: No) => {
    for (const f of x.filhos) {
      if (typeof f === "string" || NAO_SE_LE.has(f.nome) || saltar(f)) continue;
      if (f.nome === "t") {
        c.caracteres += caracteresQueContam(f.filhos.filter((s) => typeof s === "string").join(""));
        continue;
      }
      if (f.nome === "noBreakHyphen") c.caracteres += 1;
      if (f.nome === "p" && textoProprio(f)) c.paragrafos++;
      if ((f.nome === "blip" || f.nome === "imagedata") && imagemConta(f)) c.imagens++;
      andar(f);
    }
  };
  andar(raiz);
  return c;
}

function somar(a: Contagem, b: Contagem): Contagem {
  return {
    caracteres: a.caracteres + b.caracteres,
    paragrafos: a.paragrafos + b.paragrafos,
    imagens: a.imagens + b.imagens,
  };
}

// ── O que é comum aos dois formatos ──────────────────────────────────────────

class Construtor {
  unidades: UnidadeLida[] = [];
  partes: ParteLida[] = [];
  imagens: { id: string; caminho: string; ocorrencias: number }[] = [];
  avisos: string[] = [];
  private nP = 0;
  private nT = 0;
  private nL = 0;
  private nO = 0;

  parte(p: ParteLida) {
    this.partes.push(p);
  }
  novaTabela(): string {
    return `t${++this.nT}`;
  }
  paragrafo(p: Omit<ParagrafoLido, "tipo" | "id">) {
    this.unidades.push({ tipo: "paragrafo", id: `p${++this.nP}`, ...p });
  }
  linha(l: Omit<LinhaDeTabelaLida, "tipo" | "id">) {
    this.unidades.push({ tipo: "linha-de-tabela", id: `l${++this.nL}`, ...l });
  }
  imagem(parte: string, caminho: string, extra: { descricao?: string; fundo?: boolean } = {}) {
    let im = this.imagens.find((x) => x.caminho === caminho);
    if (!im) {
      im = { id: `im${this.imagens.length + 1}`, caminho, ocorrencias: 0 };
      this.imagens.push(im);
    }
    im.ocorrencias++;
    this.unidades.push({
      tipo: "imagem",
      id: `o${++this.nO}`,
      parte,
      imagem: im.id,
      caminho,
      ...(extra.descricao ? { descricao: extra.descricao } : {}),
      ...(extra.fundo ? { fundo: true } : {}),
    });
  }

  contagem(): Contagem {
    const c: Contagem = { caracteres: 0, paragrafos: 0, imagens: 0 };
    for (const u of this.unidades) {
      if (u.tipo === "paragrafo") {
        c.caracteres += caracteresQueContam(u.texto);
        c.paragrafos++;
      } else if (u.tipo === "linha-de-tabela") {
        for (const cel of u.celulas) c.caracteres += caracteresQueContam(cel);
        c.paragrafos += u.paragrafos;
      } else {
        c.imagens++;
      }
    }
    return c;
  }

  /** As legendas do Word passam para a imagem de antes (ou de depois). */
  ligarLegendas() {
    this.unidades.forEach((u, i) => {
      if (u.tipo !== "paragrafo" || u.papel !== "legenda") return;
      const antes = this.unidades[i - 1];
      const depois = this.unidades[i + 1];
      const alvo =
        antes?.tipo === "imagem" && !antes.legenda
          ? antes
          : depois?.tipo === "imagem" && !depois.legenda
            ? depois
            : null;
      if (alvo) alvo.legenda = u.texto;
    });
  }

  fechar(formato: FormatoImportado, origem: Contagem): DocumentoCompleto {
    this.ligarLegendas();
    const representacao = this.contagem();
    if (
      origem.caracteres !== representacao.caracteres ||
      origem.paragrafos !== representacao.paragrafos ||
      origem.imagens !== representacao.imagens
    ) {
      throw new LeituraIncompleta(
        `A leitura completa não bate com o ficheiro: o ficheiro tem ${origem.caracteres} caracteres, ${origem.paragrafos} parágrafos e ${origem.imagens} imagens; a leitura tem ${representacao.caracteres}, ${representacao.paragrafos} e ${representacao.imagens}.`,
        origem,
        representacao,
      );
    }
    return {
      formato,
      partes: this.partes,
      unidades: this.unidades,
      imagens: this.imagens,
      contagem: { origem, representacao },
      avisos: this.avisos,
    };
  }
}

function ligado(no: No | undefined): boolean {
  if (!no) return false;
  const v = attr(no, "val");
  return v === undefined || !/^(0|false|off)$/i.test(v);
}

// ── O WORD ───────────────────────────────────────────────────────────────────

interface EstiloDoWord {
  nome: string;
  nivel?: number;
  lista?: boolean;
  negrito?: boolean;
  legenda?: boolean;
}

function estilosDoWord(xml: string | undefined): Map<string, EstiloDoWord> {
  const out = new Map<string, EstiloDoWord>();
  if (!xml) return out;
  for (const s of filhos(descendente(lerXml(xml), "styles") ?? lerXml(xml), "style")) {
    const id = attr(s, "styleId");
    if (!id) continue;
    const nome = attr(filho(s, "name") ?? s, "val") ?? id;
    const n = nome.toLowerCase();
    const e: EstiloDoWord = { nome };
    const h = /^heading\s*(\d)$/.exec(n);
    if (h) e.nivel = Number(h[1]);
    else if (n === "title") e.nivel = 0;
    const ppr = filho(s, "pPr");
    const ol = ppr && filho(ppr, "outlineLvl");
    if (e.nivel === undefined && ol) {
      const v = Number(attr(ol, "val"));
      if (Number.isFinite(v) && v < 9) e.nivel = v + 1;
    }
    if ((ppr && filho(ppr, "numPr")) || /list/.test(n)) e.lista = true;
    if (n === "caption") e.legenda = true;
    const rpr = filho(s, "rPr");
    if (rpr && ligado(filho(rpr, "b"))) e.negrito = true;
    out.set(id, e);
  }
  return out;
}

function lerParteDoWord(
  k: Construtor,
  raiz: No,
  parte: string,
  papelBase: PapelDoParagrafo,
  rels: Map<string, string>,
  estilos: Map<string, EstiloDoWord>,
) {
  const caminhoDa = (b: No): string | null => {
    const id = attrDeRelacao(b, "embed") ?? attrDeRelacao(b, "id");
    const alvo = id ? rels.get(id) : undefined;
    return alvo ? resolverCaminho("word", alvo) : null;
  };

  /** As imagens de um nó, sem entrar noutros parágrafos (que tratam das suas). */
  const imagensProprias = (
    no: No,
    parar: (x: No) => boolean,
  ): { caminho: string; descr?: string }[] => {
    const out: { caminho: string; descr?: string }[] = [];
    let descr: string | undefined;
    const andar = (x: No) => {
      for (const f of x.filhos) {
        if (typeof f === "string" || NAO_SE_LE.has(f.nome) || parar(f)) continue;
        if (f.nome === "docPr") descr = attr(f, "descr") || attr(f, "title") || undefined;
        if (f.nome === "blip" || f.nome === "imagedata") {
          const c = caminhoDa(f);
          if (c) out.push({ caminho: c, ...(descr ? { descr } : {}) });
        }
        andar(f);
      }
    };
    andar(no);
    return out;
  };

  const paragrafo = (p: No, papel: PapelDoParagrafo) => {
    const ppr = filho(p, "pPr");
    const idEstilo = ppr ? attr(filho(ppr, "pStyle") ?? ppr, "val") : undefined;
    const estilo = idEstilo ? estilos.get(idEstilo) : undefined;
    let nivel = estilo?.nivel;
    const ol = ppr && filho(ppr, "outlineLvl");
    if (ol) {
      const v = Number(attr(ol, "val"));
      if (Number.isFinite(v) && v < 9) nivel = v + 1;
    }
    const numPr = ppr && filho(ppr, "numPr");
    const texto = textoProprio(p);
    if (texto) {
      const runs = filhos(p, "r").filter((r) => filho(r, "t"));
      const negrito =
        estilo?.negrito === true ||
        (runs.length > 0 &&
          runs.every((r) => {
            const rpr = filho(r, "rPr");
            return rpr ? ligado(filho(rpr, "b")) : false;
          }));
      const ilvl = numPr ? Number(attr(filho(numPr, "ilvl") ?? numPr, "val")) : NaN;
      k.paragrafo({
        parte,
        texto,
        papel: estilo?.legenda ? "legenda" : papel,
        ...(estilo?.nome ? { estilo: estilo.nome } : {}),
        ...(nivel !== undefined && nivel <= 6 ? { nivel } : {}),
        ...(numPr || estilo?.lista ? { lista: Number.isFinite(ilvl) ? ilvl : 0 } : {}),
        ...(negrito ? { negrito: true } : {}),
      });
    }
    // As imagens do parágrafo (não as das caixas de texto, que são outro <p>).
    for (const im of imagensProprias(p, (x) => x.nome === "p")) {
      k.imagem(parte, im.caminho, im.descr ? { descricao: im.descr } : {});
    }
    // As caixas de texto dentro dele, logo a seguir.
    for (const f of filhos(p)) andarCaixas(f);
  };

  const andarCaixas = (x: No) => {
    if (NAO_SE_LE.has(x.nome)) return;
    if (x.nome === "txbxContent") {
      andarBloco(x, "caixa");
      return;
    }
    if (x.nome === "p") return;
    for (const f of filhos(x)) andarCaixas(f);
  };

  const tabela = (t: No) => {
    const id = k.novaTabela();
    let n = 0;
    const imagens: { caminho: string; descr?: string }[] = [];
    for (const tr of filhos(t, "tr")) {
      const celulas: string[] = [];
      let paragrafos = 0;
      for (const tc of filhos(tr, "tc")) {
        const ps = paragrafosDentro(tc);
        const textos = ps.map(textoProprio).filter(Boolean);
        paragrafos += textos.length;
        celulas.push(textos.join("\n"));
        for (const p of ps) imagens.push(...imagensProprias(p, (x) => x.nome === "p"));
      }
      if (paragrafos > 0) k.linha({ parte, tabela: id, linha: n++, celulas, paragrafos });
    }
    for (const im of imagens) k.imagem(parte, im.caminho, im.descr ? { descricao: im.descr } : {});
  };

  const andarBloco = (no: No, papel: PapelDoParagrafo) => {
    for (const f of filhos(no)) {
      if (NAO_SE_LE.has(f.nome)) continue;
      if (f.nome === "p") paragrafo(f, papel);
      else if (f.nome === "tbl") tabela(f);
      else andarBloco(f, papel);
    }
  };
  andarBloco(raiz, papelBase);
}

export function lerDocxCompleto(textos: Map<string, string>): DocumentoCompleto {
  const xml = textos.get("word/document.xml");
  if (!xml) throw new FicheiroIlegivel("Este ficheiro não tem o texto de um documento do Word.");
  const k = new Construtor();
  const estilos = estilosDoWord(textos.get("word/styles.xml"));
  const relsXml = textos.get("word/_rels/document.xml.rels");
  const rels = lerRelacoes(relsXml);
  const conta = (rel: Map<string, string>) => (b: No) =>
    Boolean(rel.get(attrDeRelacao(b, "embed") ?? attrDeRelacao(b, "id") ?? ""));
  let origem: Contagem = { caracteres: 0, paragrafos: 0, imagens: 0 };

  const corpo = descendente(lerXml(xml), "body");
  if (!corpo) throw new FicheiroIlegivel("O documento do Word está vazio ou danificado.");
  k.parte({ id: "corpo", tipo: "corpo", nome: "Corpo do documento" });
  lerParteDoWord(k, corpo, "corpo", "corpo", rels, estilos);
  origem = somar(origem, contarNaOrigem(corpo, conta(rels)));

  // Cabeçalhos e rodapés, pela ordem das relações, sem repetir a mesma parte.
  const relacoes = relsXml ? lerXml(relsXml) : null;
  let nCab = 0;
  let nRod = 0;
  for (const r of relacoes ? filhos(descendente(relacoes, "Relationships") ?? relacoes) : []) {
    const tipo = attr(r, "Type") ?? "";
    const alvo = attr(r, "Target");
    if (!alvo || attr(r, "TargetMode") === "External") continue;
    const eCab = /\/header$/.test(tipo);
    const eRod = /\/footer$/.test(tipo);
    if (!eCab && !eRod) continue;
    const caminho = resolverCaminho("word", alvo);
    const x = textos.get(caminho);
    if (!x) continue;
    const nome = caminho.split("/").pop()!;
    const relsDela = lerRelacoes(textos.get(`word/_rels/${nome}.rels`));
    const raiz = lerXml(x);
    const id = eCab ? `cab${++nCab}` : `rod${++nRod}`;
    k.parte({
      id,
      tipo: eCab ? "cabecalho" : "rodape",
      nome: eCab ? `Cabeçalho da página ${nCab}` : `Rodapé da página ${nRod}`,
    });
    lerParteDoWord(k, raiz, id, eCab ? "cabecalho" : "rodape", relsDela, estilos);
    origem = somar(origem, contarNaOrigem(raiz, conta(relsDela)));
  }

  const notas = textos.get("word/footnotes.xml");
  if (notas) {
    const raiz = lerXml(notas);
    const relsN = lerRelacoes(textos.get("word/_rels/footnotes.xml.rels"));
    k.parte({ id: "notas", tipo: "notas-de-rodape", nome: "Notas de rodapé" });
    lerParteDoWord(k, raiz, "notas", "nota-de-rodape", relsN, estilos);
    origem = somar(origem, contarNaOrigem(raiz, conta(relsN)));
  }

  if (textos.has("word/comments.xml")) {
    k.avisos.push("O documento tem comentários: ficaram de fora (não fazem parte da proposta).");
  }
  if (
    relsXml &&
    /TargetMode="External"[^>]*\/image"|\/image"[^>]*TargetMode="External"/.test(relsXml)
  ) {
    k.avisos.push("Há imagens ligadas de fora do ficheiro: não estão lá dentro e não se importam.");
  }
  if ([...textos.keys()].some((c) => /^word\/charts\//.test(c))) {
    k.avisos.push(
      "O documento tem gráficos: o texto deles não foi lido. Confirma se tinham valores.",
    );
  }
  return k.fechar("docx", origem);
}

// ── O POWERPOINT ─────────────────────────────────────────────────────────────

const TITULOS = new Set(["title", "ctrTitle"]);
/** Nas notas do orador, o número do diapositivo, a data e afins não são texto dela. */
const NAS_NOTAS_NAO = new Set(["sldNum", "dt", "hdr", "ftr", "sldImg"]);

function tipoDoMarcador(sp: No): string | null {
  const nv = filho(sp, "nvSpPr") ?? filho(sp, "nvPicPr") ?? sp;
  const ph = descendente(nv, "ph");
  return ph ? (attr(ph, "type") ?? "body") : null;
}

function ordemDosDiapositivos(textos: Map<string, string>): string[] {
  const pres = textos.get("ppt/presentation.xml");
  const rels = lerRelacoes(textos.get("ppt/_rels/presentation.xml.rels"));
  const ordem: string[] = [];
  if (pres) {
    const lista = descendente(lerXml(pres), "sldIdLst");
    for (const s of lista ? filhos(lista, "sldId") : []) {
      const alvo = rels.get(attrDeRelacao(s, "id") ?? "");
      if (alvo) ordem.push(resolverCaminho("ppt", alvo));
    }
  }
  if (ordem.length) return ordem.filter((c) => textos.has(c));
  return [...textos.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
}

function tamanhoDe(p: No): number | undefined {
  let max = 0;
  const andar = (x: No) => {
    for (const f of filhos(x)) {
      if (f.nome === "rPr" || f.nome === "defRPr" || f.nome === "endParaRPr") {
        const sz = Number(attr(f, "sz"));
        if (f.nome === "rPr" && Number.isFinite(sz) && sz > max) max = sz;
      }
      andar(f);
    }
  };
  andar(p);
  return max > 0 ? max / 100 : undefined;
}

function lerFormas(
  k: Construtor,
  raiz: No,
  parte: string,
  rels: Map<string, string>,
  pasta: string,
  notas: boolean,
) {
  const caminhoDa = (b: No): string | null => {
    const alvo = rels.get(attrDeRelacao(b, "embed") ?? "");
    return alvo ? resolverCaminho(pasta, alvo) : null;
  };
  const textoDaForma = (sp: No, papel: PapelDoParagrafo, marcador: string | null) => {
    const corpo = filho(sp, "txBody");
    if (!corpo) return;
    for (const p of filhos(corpo, "p")) {
      const texto = textoProprio(p);
      if (!texto) continue;
      const ppr = filho(p, "pPr");
      const semMarca = ppr ? Boolean(filho(ppr, "buNone")) : false;
      const comMarca = ppr ? Boolean(filho(ppr, "buChar") || filho(ppr, "buAutoNum")) : false;
      const nivel = Number(ppr ? attr(ppr, "lvl") : 0) || 0;
      const eLista = comMarca || (marcador === "body" && !semMarca && !notas);
      const negrito = descendente(p, "rPr")
        ? filhos(p, "r").every((r) => attr(filho(r, "rPr") ?? r, "b") === "1")
        : false;
      const tamanho = tamanhoDe(p);
      k.paragrafo({
        parte,
        texto,
        papel,
        ...(eLista ? { lista: nivel } : {}),
        ...(negrito && filhos(p, "r").length ? { negrito: true } : {}),
        ...(tamanho ? { tamanho } : {}),
      });
    }
  };
  const forma = (sp: No) => {
    const marcador = tipoDoMarcador(sp);
    if (notas && marcador && NAS_NOTAS_NAO.has(marcador)) return;
    const papel: PapelDoParagrafo = notas
      ? "notas"
      : marcador && TITULOS.has(marcador)
        ? "titulo"
        : marcador
          ? "corpo"
          : "caixa";
    textoDaForma(sp, papel, marcador);
    // Uma forma com a fotografia como enchimento.
    for (const b of filhos(filho(sp, "spPr") ?? sp, "blipFill")) {
      const blip = filho(b, "blip");
      const c = blip && caminhoDa(blip);
      if (c) k.imagem(parte, c);
    }
  };
  const tabela = (tbl: No) => {
    const id = k.novaTabela();
    let n = 0;
    for (const tr of filhos(tbl, "tr")) {
      const celulas: string[] = [];
      let paragrafos = 0;
      for (const tc of filhos(tr, "tc")) {
        const textos = paragrafosDentro(tc).map(textoProprio).filter(Boolean);
        paragrafos += textos.length;
        celulas.push(textos.join("\n"));
      }
      if (paragrafos > 0) k.linha({ parte, tabela: id, linha: n++, celulas, paragrafos });
    }
  };
  const andar = (no: No) => {
    for (const f of filhos(no)) {
      if (NAO_SE_LE.has(f.nome)) continue;
      if (f.nome === "sp") forma(f);
      else if (f.nome === "pic") {
        const descr = attr(descendente(f, "cNvPr") ?? f, "descr") || undefined;
        const blip = descendente(f, "blip");
        const c = blip && caminhoDa(blip);
        if (c) k.imagem(parte, c, descr ? { descricao: descr } : {});
      } else if (f.nome === "graphicFrame") {
        const tbl = descendente(f, "tbl");
        if (tbl) tabela(tbl);
      } else if (f.nome === "grpSp" || f.nome === "AlternateContent" || f.nome === "Choice") {
        andar(f);
      }
    }
  };
  andar(raiz);
}

/** O que a contagem simples conta numa parte do PowerPoint — as mesmas formas. */
function contarPowerPoint(raiz: No, rels: Map<string, string>, notas: boolean): Contagem {
  const conta = (b: No) => Boolean(rels.get(attrDeRelacao(b, "embed") ?? ""));
  const saltar = (no: No) => {
    if (notas && no.nome === "sp") {
      const m = tipoDoMarcador(no);
      return Boolean(m && NAS_NOTAS_NAO.has(m));
    }
    return false;
  };
  return contarNaOrigem(raiz, conta, saltar);
}

export function lerPptxCompleto(textos: Map<string, string>): DocumentoCompleto {
  if (
    !textos.has("ppt/presentation.xml") &&
    ![...textos.keys()].some((c) => c.startsWith("ppt/slides/"))
  ) {
    throw new FicheiroIlegivel("Este ficheiro não tem os diapositivos de um PowerPoint.");
  }
  const k = new Construtor();
  let origem: Contagem = { caracteres: 0, paragrafos: 0, imagens: 0 };

  ordemDosDiapositivos(textos).forEach((caminho, i) => {
    const n = i + 1;
    const raiz = lerXml(textos.get(caminho)!);
    const sld = descendente(raiz, "sld");
    const escondido = Boolean(sld && attr(sld, "show") === "0");
    const nome = caminho.split("/").pop()!;
    const relsXml = textos.get(`ppt/slides/_rels/${nome}.rels`);
    const rels = lerRelacoes(relsXml);
    const id = `d${n}`;
    k.parte({
      id,
      tipo: "diapositivo",
      nome: `Diapositivo ${n}`,
      numero: n,
      ...(escondido ? { escondido: true } : {}),
    });

    // O fundo primeiro: numa proposta é muitas vezes a fotografia principal.
    const cSld = descendente(raiz, "cSld");
    const bg = cSld && filho(cSld, "bg");
    if (bg) {
      for (const b of filhos(filho(bg, "bgPr") ?? bg, "blipFill")) {
        const blip = filho(b, "blip");
        const alvo = blip && rels.get(attrDeRelacao(blip, "embed") ?? "");
        if (alvo) k.imagem(id, resolverCaminho("ppt/slides", alvo), { fundo: true });
      }
    }
    const arvore = descendente(raiz, "spTree");
    if (arvore) lerFormas(k, arvore, id, rels, "ppt/slides", false);
    // A contagem pela origem: o fundo e a árvore, as mesmas duas coisas.
    const soFundo: No = { nome: "#", attrs: {}, filhos: bg ? [bg] : [] };
    const fundoConta = (b: No) => {
      const pai = b;
      return Boolean(rels.get(attrDeRelacao(pai, "embed") ?? ""));
    };
    const cf = contarNaOrigem(soFundo, fundoConta);
    origem = somar(origem, { caracteres: 0, paragrafos: 0, imagens: cf.imagens });
    if (arvore) origem = somar(origem, contarPowerPoint(arvore, rels, false));

    // As relações do diapositivo: diagramas e notas do orador.
    const relacoes = relsXml ? lerXml(relsXml) : null;
    for (const r of relacoes ? filhos(descendente(relacoes, "Relationships") ?? relacoes) : []) {
      const tipo = attr(r, "Type") ?? "";
      const alvo = attr(r, "Target");
      if (!alvo || attr(r, "TargetMode") === "External") continue;
      const c = resolverCaminho("ppt/slides", alvo);
      if (/\/diagramData$/.test(tipo) && textos.has(c)) {
        const d = lerXml(textos.get(c)!);
        const ps = paragrafosDentro(d);
        for (const p of ps) {
          const texto = textoProprio(p);
          if (texto) k.paragrafo({ parte: id, texto, papel: "diagrama" });
        }
        origem = somar(
          origem,
          contarNaOrigem(d, () => false),
        );
      } else if (/\/notesSlide$/.test(tipo) && textos.has(c)) {
        const notasRaiz = lerXml(textos.get(c)!);
        const nomeN = c.split("/").pop()!;
        const relsN = lerRelacoes(textos.get(`ppt/notesSlides/_rels/${nomeN}.rels`));
        const arvoreN = descendente(notasRaiz, "spTree");
        if (arvoreN) {
          lerFormas(k, arvoreN, id, relsN, "ppt/notesSlides", true);
          origem = somar(origem, contarPowerPoint(arvoreN, relsN, true));
        }
      } else if (/\/chart$/.test(tipo)) {
        k.avisos.push(
          `O diapositivo ${n} tem um gráfico: o texto dele não foi lido. Confirma se tinha valores.`,
        );
      }
    }
    if (relsXml && /TargetMode="External"/.test(relsXml) && /\/image"/.test(relsXml)) {
      k.avisos.push(
        `O diapositivo ${n} tem uma imagem ligada de fora do ficheiro: não se importa.`,
      );
    }
  });
  if ([...textos.keys()].some((c) => /^ppt\/comments\//.test(c))) {
    k.avisos.push("A apresentação tem comentários: ficaram de fora (não fazem parte da proposta).");
  }
  return k.fechar("pptx", origem);
}

// ── A representação em texto, para a leitura com IA ─────────────────────────

/**
 * O documento como texto, uma unidade por linha, cada uma com o seu id entre
 * parênteses rectos. É isto (e só isto: as imagens vão pelo id, não pelos
 * bytes) que segue para a leitura com IA.
 */
export function documentoEmTexto(
  d: Pick<DocumentoCompleto, "partes" | "unidades">,
  partesIncluidas?: ReadonlySet<string>,
): string {
  const linhas: string[] = [];
  let parteActual = "";
  for (const u of d.unidades) {
    if (partesIncluidas && !partesIncluidas.has(u.parte)) continue;
    if (u.parte !== parteActual) {
      parteActual = u.parte;
      const p = d.partes.find((x) => x.id === u.parte);
      linhas.push("");
      linhas.push(
        `=== [${u.parte}] ${p?.nome ?? u.parte}${p?.escondido ? " (ESCONDIDO)" : ""} ===`,
      );
    }
    if (u.tipo === "paragrafo") {
      const marcas = [
        u.papel !== "corpo" ? u.papel : "",
        u.nivel !== undefined ? `título nível ${u.nivel}` : "",
        u.lista !== undefined ? `lista nível ${u.lista}` : "",
        u.negrito ? "negrito" : "",
        u.tamanho ? `${u.tamanho} pt` : "",
        u.estilo && u.nivel === undefined && u.lista === undefined ? `estilo «${u.estilo}»` : "",
      ].filter(Boolean);
      linhas.push(
        `[${u.id}]${marcas.length ? ` (${marcas.join(", ")})` : ""} ${u.texto.replace(/\n/g, " ⏎ ")}`,
      );
    } else if (u.tipo === "linha-de-tabela") {
      linhas.push(
        `[${u.id}] (tabela ${u.tabela}, linha ${u.linha + 1}) ${u.celulas.map((c) => c.replace(/\n/g, " ⏎ ")).join(" | ")}`,
      );
    } else {
      const extra = [
        u.fundo ? "fundo do diapositivo" : "",
        u.descricao ? `descrição: «${u.descricao}»` : "",
        u.legenda ? `legenda: «${u.legenda}»` : "",
      ].filter(Boolean);
      linhas.push(`[${u.imagem}] IMAGEM${extra.length ? ` (${extra.join("; ")})` : ""}`);
    }
  }
  return linhas.join("\n").trim();
}
