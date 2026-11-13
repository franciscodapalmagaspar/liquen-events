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

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;
const ATTR = /([^\s=>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

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

export function lerXml(xml: string): No {
  const raiz: No = { nome: "#raiz", attrs: {}, filhos: [] };
  const pilha: No[] = [raiz];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(xml))) {
    const topo = pilha[pilha.length - 1];
    if (m[1] !== undefined) {
      topo.filhos.push(m[1]);
    } else if (m[3] !== undefined) {
      const nome = local(m[3]);
      if (m[2] === "/") {
        // Fecha até ao nó com este nome; se não houver, ignora o fecho.
        for (let i = pilha.length - 1; i > 0; i--) {
          if (pilha[i].nome === nome) {
            pilha.length = i;
            break;
          }
        }
        continue;
      }
      const attrs: Record<string, string> = {};
      if (m[4]) {
        ATTR.lastIndex = 0;
        let a: RegExpExecArray | null;
        while ((a = ATTR.exec(m[4]))) attrs[a[1]] = decodificar(a[2] ?? a[3] ?? "");
      }
      const no: No = { nome, attrs, filhos: [] };
      topo.filhos.push(no);
      if (m[5] !== "/" && pilha.length < MAX_PROFUNDIDADE) pilha.push(no);
    } else if (m[6] !== undefined) {
      if (pilha.length > 1) topo.filhos.push(decodificar(m[6]));
    }
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
