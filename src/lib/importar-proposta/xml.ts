/**
 * Um leitor de XML mínimo, para o XML do Office.
 *
 * Não valida nem resolve espaços de nomes: compara pelo nome LOCAL (`w:p` → `p`),
 * que é o que torna o mesmo código bom para um .docx do Word, do LibreOffice ou
 * exportado do Google Docs (que nem sempre usam os mesmos prefixos).
 *
 * Só conhece as cinco entidades do XML e as numéricas. Um `<!DOCTYPE>` é
 * ignorado — e com ele qualquer entidade declarada: é isso que torna o «billion
 * laughs» impossível aqui, por construção.
 *
 * É tolerante a XML mal fechado (fecha o que ficou aberto) e tem tecto de
 * profundidade, para um ficheiro adulterado não rebentar a pilha.
 */

export interface No {
  /** O nome local, sem prefixo (`p`, `t`, `blip`). */
  nome: string;
  attrs: Record<string, string>;
  filhos: (No | string)[];
}

const MAX_PROFUNDIDADE = 400;

export function local(nome: string): string {
  const i = nome.indexOf(":");
  return i >= 0 ? nome.slice(i + 1) : nome;
}

export function decodificar(s: string): string {
  if (!s.includes("&")) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const n = e[1] === "x" ? Number.parseInt(e.slice(2), 16) : Number.parseInt(e.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
  });
}

/**
 * ── UM PERCURSO SÓ, DO PRINCÍPIO AO FIM ─────────────────────────────────────
 *
 * Isto era uma expressão regular com `[\s\S]*?` para os comentários, o CDATA
 * e as instruções. Com um `<?`, `<!--` ou `<![CDATA[` SEM FECHO, a procura
 * corria até ao fim do texto uma vez por cada `<` — quadrático: 80 KB de `<?`
 * levavam 0,6 s, e 16 MB (que comprimem para KB e cabem nos 4 MB da rota)
 * prendiam a função 30 s. Processador numa função é o que desligou o site a
 * 2/11.
 *
 * Agora cada fecho procura-se com `indexOf` a partir de onde se está, e sem
 * fecho salta-se para o fim de uma vez: cada carácter é visto um número fixo
 * de vezes, seja qual for o ficheiro. O mesmo vale para as aspas dentro de uma
 * etiqueta e para os atributos (lidos à mão, sem expressão regular).
 */
function lerAtributos(corpo: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const n = corpo.length;
  let i = 0;
  const espaco = (c: string) => c === " " || c === "\n" || c === "\t" || c === "\r";
  while (i < n) {
    while (i < n && espaco(corpo[i])) i++;
    const ini = i;
    while (i < n && !espaco(corpo[i]) && corpo[i] !== "=" && corpo[i] !== "/" && corpo[i] !== ">")
      i++;
    const nome = corpo.slice(ini, i);
    if (!nome) {
      i++;
      continue;
    }
    while (i < n && espaco(corpo[i])) i++;
    if (corpo[i] !== "=") continue;
    i++;
    while (i < n && espaco(corpo[i])) i++;
    const aspa = corpo[i];
    if (aspa !== '"' && aspa !== "'") continue;
    const fim = corpo.indexOf(aspa, i + 1);
    if (fim < 0) break;
    attrs[nome] = decodificar(corpo.slice(i + 1, fim));
    i = fim + 1;
  }
  return attrs;
}

/** Onde acaba a etiqueta que começa em `de` (o `>` fora de aspas), ou -1. */
function fimDaEtiqueta(xml: string, de: number): number {
  // Cada procura só volta a correr quando a posição passa o que ela achou —
  // com muitas aspas antes do `>`, procurar de novo a cada par era quadrático.
  let i = de;
  let gt = -2;
  let d = -2;
  let p = -2;
  for (;;) {
    if (gt !== -1 && gt < i) gt = xml.indexOf(">", i);
    if (gt < 0) return -1;
    // Há aspas antes do `>`? Então o `>` pode estar dentro delas.
    if (d !== -1 && d < i) d = xml.indexOf('"', i);
    if (p !== -1 && p < i) p = xml.indexOf("'", i);
    const aspa = d >= 0 && (p < 0 || d < p) ? d : p;
    if (aspa < 0 || aspa > gt) return gt;
    const fecho = xml.indexOf(xml[aspa], aspa + 1);
    if (fecho < 0) return -1;
    i = fecho + 1;
  }
}

const NOME_DA_ETIQUETA = /^[A-Za-z_][\w:.-]*/;

export function lerXml(xml: string): No {
  const raiz: No = { nome: "#raiz", attrs: {}, filhos: [] };
  const pilha: No[] = [raiz];
  const n = xml.length;
  let i = 0;
  const texto = (t: string) => {
    if (t && pilha.length > 1) pilha[pilha.length - 1].filhos.push(decodificar(t));
  };
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) {
      texto(xml.slice(i));
      break;
    }
    if (lt > i) texto(xml.slice(i, lt));
    const topo = pilha[pilha.length - 1];
    if (xml.startsWith("<!--", lt)) {
      const fim = xml.indexOf("-->", lt + 4);
      if (fim < 0) break;
      i = fim + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const fim = xml.indexOf("]]>", lt + 9);
      if (fim < 0) break;
      topo.filhos.push(xml.slice(lt + 9, fim));
      i = fim + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const fim = xml.indexOf("?>", lt + 2);
      if (fim < 0) break;
      i = fim + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) {
      // DOCTYPE e afins: ignorados, e com eles qualquer entidade declarada.
      const fim = xml.indexOf(">", lt + 2);
      if (fim < 0) break;
      i = fim + 1;
      continue;
    }
    const fecha = xml[lt + 1] === "/";
    const nomeM = NOME_DA_ETIQUETA.exec(
      xml.slice(lt + (fecha ? 2 : 1), lt + (fecha ? 2 : 1) + 256),
    );
    if (!nomeM) {
      // Um `<` solto: salta-se só ele.
      i = lt + 1;
      continue;
    }
    const fim = fimDaEtiqueta(xml, lt + 1);
    if (fim < 0) break;
    const nome = local(nomeM[0]);
    i = fim + 1;
    if (fecha) {
      // Fecha até ao nó com este nome; se não houver, ignora o fecho.
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].nome === nome) {
          pilha.length = k;
          break;
        }
      }
      continue;
    }
    let corpo = xml.slice(lt + 1 + nomeM[0].length, fim);
    const vazia = corpo.trimEnd().endsWith("/");
    if (vazia) corpo = corpo.trimEnd().slice(0, -1);
    const no: No = { nome, attrs: lerAtributos(corpo), filhos: [] };
    topo.filhos.push(no);
    if (!vazia && pilha.length < MAX_PROFUNDIDADE) pilha.push(no);
  }
  return raiz;
}

/** O atributo pelo nome local (`w:val` ou `val`). */
export function attr(no: No, nome: string): string | undefined {
  if (nome in no.attrs) return no.attrs[nome];
  for (const [k, v] of Object.entries(no.attrs)) if (local(k) === nome) return v;
  return undefined;
}

export function filhos(no: No, nome?: string): No[] {
  const out: No[] = [];
  for (const f of no.filhos) if (typeof f !== "string" && (!nome || f.nome === nome)) out.push(f);
  return out;
}

export function filho(no: No, nome: string): No | undefined {
  for (const f of no.filhos) if (typeof f !== "string" && f.nome === nome) return f;
  return undefined;
}

/** O atributo de relação (`r:id`, `r:embed`) — nunca o `id` sem prefixo, que
 *  no `sldId` é outra coisa (o número do diapositivo). */
export function attrDeRelacao(no: No, nome: string): string | undefined {
  for (const [k, v] of Object.entries(no.attrs)) if (k.includes(":") && local(k) === nome) return v;
  return undefined;
}

/** Todos os descendentes com este nome, pela ordem do documento (sem recursão). */
export function descendentes(no: No, nome: string): No[] {
  const out: No[] = [];
  const pilha: (No | string)[] = [...no.filhos].reverse();
  while (pilha.length) {
    const x = pilha.pop()!;
    if (typeof x === "string") continue;
    if (x.nome === nome) out.push(x);
    for (let i = x.filhos.length - 1; i >= 0; i--) pilha.push(x.filhos[i]);
  }
  return out;
}

/** O primeiro descendente com este nome. */
export function descendente(no: No, nome: string): No | undefined {
  return descendentes(no, nome)[0];
}

/** As relações de um `.rels`: id → alvo (só as internas). */
export function lerRelacoes(xml: string | undefined): Map<string, string> {
  const rel = new Map<string, string>();
  if (!xml) return rel;
  for (const r of descendentes(lerXml(xml), "Relationship")) {
    const id = attr(r, "Id");
    const alvo = attr(r, "Target");
    if (!id || !alvo || attr(r, "TargetMode") === "External") continue;
    rel.set(id, alvo);
  }
  return rel;
}

/** Resolve um alvo relativo (`../media/image1.png`) a partir de uma pasta. */
export function resolverCaminho(pasta: string, alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = pasta.split("/").filter(Boolean);
  for (const p of alvo.split("/")) {
    if (p === "..") partes.pop();
    else if (p && p !== ".") partes.push(p);
  }
  return partes.join("/");
}
