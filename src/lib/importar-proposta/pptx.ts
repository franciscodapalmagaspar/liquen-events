import { FicheiroIlegivel } from "./zip";
import {
  attr,
  attrDeRelacao,
  descendente,
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
 * Lê um .pptx: um diapositivo é uma secção — o título, o texto pela ordem das
 * caixas, as tabelas, e as fotografias (incluindo a do fundo, que numa
 * proposta é muitas vezes a fotografia principal).
 *
 * A ordem é a da APRESENTAÇÃO (`presentation.xml`), não a dos nomes dos
 * ficheiros: um diapositivo arrastado para o início continua a chamar-se
 * `slide7.xml`. Os escondidos ficam de fora, e diz-se.
 *
 * As imagens dos modelos e dos mestres (o logótipo em todas as páginas) não
 * estão nas relações do diapositivo, por isso não entram — é o que se quer.
 */

const TITULOS = new Set(["title", "ctrTitle"]);

function textoDoParagrafo(p: No): string {
  let s = "";
  const andar = (x: No | string) => {
    if (typeof x === "string") return;
    if (x.nome === "t") {
      for (const f of x.filhos) if (typeof f === "string") s += f;
      return;
    }
    if (x.nome === "br") s += "\n";
    for (const f of x.filhos) andar(f);
  };
  andar(p);
  return s
    .replace(/[  \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function tamanhoDoParagrafo(p: No): number | undefined {
  let max = 0;
  for (const r of descendentes(p, "rPr")) {
    const sz = Number(attr(r, "sz"));
    if (Number.isFinite(sz) && sz > max) max = sz;
  }
  return max > 0 ? max / 100 : undefined;
}

function ordemDosDiapositivos(textos: Map<string, string>): string[] {
  const pres = textos.get("ppt/presentation.xml");
  const rels = lerRelacoes(textos.get("ppt/_rels/presentation.xml.rels"));
  const ordem: string[] = [];
  if (pres) {
    for (const s of descendentes(lerXml(pres), "sldId")) {
      const alvo = rels.get(attrDeRelacao(s, "id") ?? "");
      if (alvo) ordem.push(resolverCaminho("ppt", alvo));
    }
  }
  if (ordem.length) return ordem.filter((c) => textos.has(c));
  // Sem a lista, pela numeração dos ficheiros.
  return [...textos.keys()]
    .filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));
}

export function lerPptx(textos: Map<string, string>): ConteudoImportado {
  if (
    !textos.has("ppt/presentation.xml") &&
    ![...textos.keys()].some((k) => k.startsWith("ppt/slides/"))
  ) {
    throw new FicheiroIlegivel("Este ficheiro não tem os diapositivos de um PowerPoint.");
  }
  const caminhos = ordemDosDiapositivos(textos);
  const avisos: string[] = [];
  const seccoes: Seccao[] = [];
  let escondidos = 0;

  caminhos.forEach((caminho, i) => {
    const raiz = lerXml(textos.get(caminho)!);
    const sld = descendente(raiz, "sld");
    if (sld && attr(sld, "show") === "0") {
      escondidos++;
      return;
    }
    const nome = caminho.split("/").pop()!;
    const rels = lerRelacoes(textos.get(`ppt/slides/_rels/${nome}.rels`));
    const n = i + 1;
    let titulo = "";
    const blocos: Bloco[] = [];
    const candidatos: { texto: string; tamanho: number }[] = [];

    const forma = (sp: No) => {
      const ph = descendente(filho(sp, "nvSpPr") ?? sp, "ph");
      const tipoPh = ph ? (attr(ph, "type") ?? "body") : null;
      const corpo = filho(sp, "txBody");
      if (!corpo) return;
      const paragrafos = filhos(corpo, "p");
      if (tipoPh && TITULOS.has(tipoPh)) {
        const t = paragrafos.map(textoDoParagrafo).filter(Boolean).join(" ");
        if (t && !titulo) titulo = t;
        else if (t) blocos.push({ tipo: "paragrafo", texto: t });
        return;
      }
      for (const p of paragrafos) {
        const texto = textoDoParagrafo(p);
        if (!texto) continue;
        const ppr = filho(p, "pPr");
        const semMarca = ppr ? Boolean(filho(ppr, "buNone")) : false;
        const comMarca = ppr ? Boolean(filho(ppr, "buChar") || filho(ppr, "buAutoNum")) : false;
        const nivel = Number(ppr ? attr(ppr, "lvl") : 0) || 0;
        // Numa caixa de conteúdo os parágrafos são marcadores, a não ser que
        // digam o contrário; numa caixa de texto solta, só se o disserem.
        const eItem = comMarca || (tipoPh === "body" && !semMarca);
        const tamanho = tamanhoDoParagrafo(p);
        if (eItem) blocos.push({ tipo: "item", texto, nivel });
        else {
          blocos.push({ tipo: "paragrafo", texto, ...(tamanho ? { tamanho } : {}) });
          if (tamanho) candidatos.push({ texto, tamanho });
        }
      }
    };

    const tabela = (tbl: No) => {
      const linhas: string[][] = [];
      for (const tr of filhos(tbl, "tr")) {
        const celulas = filhos(tr, "tc").map((tc) =>
          descendentes(tc, "p").map(textoDoParagrafo).filter(Boolean).join(" "),
        );
        if (celulas.some(Boolean)) linhas.push(celulas);
      }
      if (linhas.length) blocos.push({ tipo: "tabela", linhas });
    };

    const andar = (no: No) => {
      for (const f of filhos(no)) {
        if (f.nome === "sp") forma(f);
        else if (f.nome === "graphicFrame") {
          const tbl = descendente(f, "tbl");
          if (tbl) tabela(tbl);
        } else if (f.nome === "grpSp") andar(f);
      }
    };
    const arvore = descendente(raiz, "spTree");
    if (arvore) andar(arvore);

    // Sem título de marcador, o texto maior e curto do diapositivo.
    if (!titulo) {
      const maior = candidatos
        .filter((c) => c.texto.length <= 80 && c.tamanho >= 24)
        .sort((a, b) => b.tamanho - a.tamanho)[0];
      if (maior) {
        titulo = maior.texto.replace(/\n/g, " ");
        const i = blocos.findIndex((b) => b.tipo === "paragrafo" && b.texto === maior.texto);
        if (i >= 0) blocos.splice(i, 1);
      }
    }

    const imagens: string[] = [];
    for (const b of descendentes(raiz, "blip")) {
      const alvo = rels.get(attrDeRelacao(b, "embed") ?? "");
      if (!alvo) continue;
      const c = resolverCaminho("ppt/slides", alvo);
      if (!imagens.includes(c)) imagens.push(c);
    }

    seccoes.push({ titulo, blocos, imagens, origem: `Diapositivo ${n}` });
  });

  if (escondidos > 0) {
    avisos.push(
      escondidos === 1
        ? "Um diapositivo estava escondido e ficou de fora."
        : `${escondidos} diapositivos estavam escondidos e ficaram de fora.`,
    );
  }
  return { formato: "pptx", seccoes, avisos };
}
