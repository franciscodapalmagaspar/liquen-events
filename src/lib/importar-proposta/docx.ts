import { FicheiroIlegivel } from "./zip";
import {
  attr,
  attrDeRelacao,
  descendentes,
  filho,
  filhos,
  lerRelacoes,
  lerXml,
  resolverCaminho,
  type No,
} from "./xml";
import type { Bloco, ConteudoImportado, Seccao } from "./tipos";

/**
 * Lê um .docx: os parágrafos, os cabeçalhos, as listas, as tabelas e as
 * imagens, pela ordem em que estão no documento.
 *
 * ── O QUE É UM CABEÇALHO ────────────────────────────────────────────────────
 *
 * Pelo ESTILO, e pelo nome inglês do estilo (`heading 1`): o identificador
 * muda com a língua do Word («Ttulo1» num Word português), o nome interno não.
 * Quem escreveu a proposta sem estilos — a maioria — pôs os títulos a negrito,
 * ou em maiúsculas, numa linha curta. Quando o documento não tem NENHUM
 * cabeçalho de estilo, essas linhas passam a valer como cabeçalhos. Quando tem,
 * não: misturar as duas regras partia o documento em secções a mais.
 *
 * Os cabeçalhos e rodapés da página ficam de fora: são o papel timbrado da
 * casa, não a proposta.
 */

interface Estilo {
  nivel?: number;
  lista?: boolean;
  negrito?: boolean;
}

function lerEstilos(xml: string | undefined): Map<string, Estilo> {
  const out = new Map<string, Estilo>();
  if (!xml) return out;
  for (const s of descendentes(lerXml(xml), "style")) {
    const id = attr(s, "styleId");
    if (!id) continue;
    const nome = (attr(filho(s, "name") ?? s, "val") ?? "").toLowerCase();
    const e: Estilo = {};
    const h = /^heading\s*(\d)$/.exec(nome);
    if (h) e.nivel = Number(h[1]);
    else if (nome === "title") e.nivel = 0;
    const ppr = filho(s, "pPr");
    const ol = ppr && filho(ppr, "outlineLvl");
    if (e.nivel === undefined && ol) {
      const v = Number(attr(ol, "val"));
      if (Number.isFinite(v) && v < 9) e.nivel = v + 1;
    }
    if (ppr && filho(ppr, "numPr")) e.lista = true;
    if (/list/.test(nome)) e.lista = true;
    const rpr = filho(s, "rPr");
    if (rpr && ligado(filho(rpr, "b"))) e.negrito = true;
    out.set(id, e);
  }
  return out;
}

function ligado(no: No | undefined): boolean {
  if (!no) return false;
  const v = attr(no, "val");
  return v === undefined || !/^(0|false|off)$/i.test(v);
}

/** O texto de um parágrafo, com tabulações e quebras. */
function textoDe(no: No): string {
  let s = "";
  const andar = (x: No | string) => {
    if (typeof x === "string") return;
    if (x.nome === "t") {
      for (const f of x.filhos) if (typeof f === "string") s += f;
      return;
    }
    if (x.nome === "tab") s += "\t";
    else if (x.nome === "br" || x.nome === "cr") s += "\n";
    else if (x.nome === "noBreakHyphen") s += "-";
    // Texto apagado com alterações registadas, e códigos de campo: fora.
    if (x.nome === "del" || x.nome === "instrText" || x.nome === "delText") return;
    for (const f of x.filhos) andar(f);
  };
  andar(no);
  return s
    .replace(/[  ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

type Peca =
  | { tipo: "cabecalho"; nivel: number; texto: string }
  | { tipo: "bloco"; bloco: Bloco; candidato?: boolean }
  | { tipo: "imagem"; caminho: string };

function eCandidatoATitulo(texto: string, negrito: boolean): boolean {
  if (texto.length < 3 || texto.length > 70 || texto.includes("\n")) return false;
  if (/[.;]$/.test(texto) || /€|\d+[.,]\d{2}\b/.test(texto)) return false;
  const letras = texto.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letras.length < 3) return false;
  const maiusculas = letras === letras.toUpperCase();
  return negrito || maiusculas;
}

export function lerDocx(textos: Map<string, string>): ConteudoImportado {
  const xml = textos.get("word/document.xml");
  if (!xml) {
    throw new FicheiroIlegivel("Este ficheiro não tem o texto de um documento do Word.");
  }
  const rels = lerRelacoes(textos.get("word/_rels/document.xml.rels"));
  const estilos = lerEstilos(textos.get("word/styles.xml"));
  const raiz = lerXml(xml);
  const corpo = descendentes(raiz, "body")[0];
  if (!corpo) throw new FicheiroIlegivel("O documento do Word está vazio ou danificado.");

  const pecas: Peca[] = [];
  const imagensDe = (no: No): string[] => {
    const out: string[] = [];
    for (const b of descendentes(no, "blip")) {
      const alvo = rels.get(attrDeRelacao(b, "embed") ?? "");
      if (alvo) out.push(resolverCaminho("word", alvo));
    }
    for (const b of descendentes(no, "imagedata")) {
      const alvo = rels.get(attrDeRelacao(b, "id") ?? "");
      if (alvo) out.push(resolverCaminho("word", alvo));
    }
    return out;
  };

  const paragrafo = (p: No) => {
    const ppr = filho(p, "pPr");
    const idEstilo = ppr ? attr(filho(ppr, "pStyle") ?? ppr, "val") : undefined;
    const estilo = (idEstilo && estilos.get(idEstilo)) || {};
    let nivel = estilo.nivel;
    const ol = ppr && filho(ppr, "outlineLvl");
    if (ol) {
      const v = Number(attr(ol, "val"));
      if (Number.isFinite(v) && v < 9) nivel = v + 1;
    }
    const numPr = ppr && filho(ppr, "numPr");
    const texto = textoDe(p);

    if (texto) {
      if (nivel !== undefined && nivel <= 3) {
        pecas.push({ tipo: "cabecalho", nivel, texto });
      } else if (numPr || estilo.lista) {
        const ilvl = numPr ? Number(attr(filho(numPr, "ilvl") ?? numPr, "val")) : 0;
        pecas.push({
          tipo: "bloco",
          bloco: { tipo: "item", texto, nivel: Number.isFinite(ilvl) ? ilvl : 0 },
        });
      } else {
        const runs = descendentes(p, "r").filter((r) => descendentes(r, "t").length > 0);
        const negrito =
          estilo.negrito === true ||
          (runs.length > 0 &&
            runs.every((r) => {
              const rpr = filho(r, "rPr");
              return rpr ? ligado(filho(rpr, "b")) : false;
            }));
        pecas.push({
          tipo: "bloco",
          bloco: { tipo: "paragrafo", texto, ...(negrito ? { negrito } : {}) },
          candidato: eCandidatoATitulo(texto, negrito),
        });
      }
    }
    for (const c of imagensDe(p)) pecas.push({ tipo: "imagem", caminho: c });
  };

  const tabela = (t: No) => {
    const linhas: string[][] = [];
    for (const tr of filhos(t, "tr")) {
      const celulas = filhos(tr, "tc").map((tc) =>
        filhos(tc, "p").map(textoDe).filter(Boolean).join(" ").trim(),
      );
      if (celulas.some(Boolean)) linhas.push(celulas);
    }
    if (linhas.length) pecas.push({ tipo: "bloco", bloco: { tipo: "tabela", linhas } });
    for (const c of imagensDe(t)) pecas.push({ tipo: "imagem", caminho: c });
  };

  const andar = (no: No) => {
    for (const f of filhos(no)) {
      if (f.nome === "p") paragrafo(f);
      else if (f.nome === "tbl") tabela(f);
      else if (f.nome === "sdt" || f.nome === "sdtContent" || f.nome === "customXml") andar(f);
    }
  };
  andar(corpo);

  // Sem cabeçalhos de estilo, as linhas curtas a negrito ou em maiúsculas
  // passam a sê-lo (ver o cabeçalho do ficheiro).
  const temCabecalhos = pecas.some((p) => p.tipo === "cabecalho");
  const avisos: string[] = [];
  if (!temCabecalhos && pecas.some((p) => p.tipo === "bloco" && p.candidato)) {
    avisos.push(
      "O documento não usa estilos de título: dividi as secções pelas linhas curtas a negrito ou em maiúsculas. Confirma os Serviços.",
    );
  }

  const seccoes: Seccao[] = [];
  let actual: Seccao = { titulo: "", blocos: [], imagens: [], origem: "Início do documento" };
  const fechar = () => {
    if (actual.titulo || actual.blocos.length || actual.imagens.length) seccoes.push(actual);
  };
  for (const p of pecas) {
    const eTitulo =
      (p.tipo === "cabecalho" && p.nivel <= 2) ||
      (!temCabecalhos && p.tipo === "bloco" && p.candidato === true);
    if (eTitulo) {
      fechar();
      const texto = p.tipo === "cabecalho" ? p.texto : (p.bloco as { texto: string }).texto;
      actual = { titulo: texto, blocos: [], imagens: [], origem: `Secção «${texto}»` };
    } else if (p.tipo === "cabecalho") {
      actual.blocos.push({ tipo: "paragrafo", texto: p.texto, negrito: true });
    } else if (p.tipo === "bloco") {
      actual.blocos.push(p.bloco);
    } else if (!actual.imagens.includes(p.caminho)) {
      actual.imagens.push(p.caminho);
    }
  }
  fechar();

  return { formato: "docx", seccoes, avisos };
}
