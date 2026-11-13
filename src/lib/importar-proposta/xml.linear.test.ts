import { describe, it, expect } from "vitest";
import { decodificar, local, lerXml, type No } from "./xml";
import { docx, pptx } from "./fabricar.testkit";
import { lerTextosDoZip } from "./zip-node";

/**
 * O leitor de XML é LINEAR: um `<?`, `<!--`, `<![CDATA[` ou uma aspa sem fecho
 * não pode fazer a leitura correr até ao fim uma vez por cada `<`. Era o que a
 * expressão regular de antes fazia (16 MB, que comprimem para KB, prendiam a
 * função 30 s).
 */

// ── A leitura de ANTES, tal e qual, para provar que o XML válido sai igual ──
const TOKEN_ANTIGO =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![A-Za-z][^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)|</g;
const ATTR_ANTIGO = /([^\s=>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
function lerXmlAntigo(xml: string): No {
  const raiz: No = { nome: "#raiz", attrs: {}, filhos: [] };
  const pilha: No[] = [raiz];
  TOKEN_ANTIGO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_ANTIGO.exec(xml))) {
    const topo = pilha[pilha.length - 1];
    if (m[1] !== undefined) topo.filhos.push(m[1]);
    else if (m[3] !== undefined) {
      const nome = local(m[3]);
      if (m[2] === "/") {
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
        ATTR_ANTIGO.lastIndex = 0;
        let a: RegExpExecArray | null;
        while ((a = ATTR_ANTIGO.exec(m[4]))) attrs[a[1]] = decodificar(a[2] ?? a[3] ?? "");
      }
      const no: No = { nome, attrs, filhos: [] };
      topo.filhos.push(no);
      if (m[5] !== "/" && pilha.length < 400) pilha.push(no);
    } else if (m[6] !== undefined) {
      if (pilha.length > 1) topo.filhos.push(decodificar(m[6]));
    }
  }
  return raiz;
}

function cronometrar(f: () => void): number {
  const t = performance.now();
  f();
  return performance.now() - t;
}

const MB = 1024 * 1024;

describe("o leitor de XML é linear", () => {
  const patologicos: [string, string][] = [
    ["<? sem fecho", "<?".repeat(MB)],
    ["<!-- sem fecho", "<!--".repeat(MB / 2)],
    ["<![CDATA[ sem fecho", "<![CDATA[".repeat(Math.floor((1.5 * MB) / 9))],
    ["<!DOCTYPE sem fecho", "<!A".repeat(MB / 2)],
    ["aspa sem fecho numa etiqueta", '<a b="'.repeat(MB / 4)],
    ["muitas aspas antes do >", `<a ${'x="1" '.repeat(MB / 4)}`],
    ["etiqueta sem fecho", "<a".repeat(MB)],
  ];
  for (const [nome, xml] of patologicos) {
    it(`${nome} (~${(xml.length / MB).toFixed(1)} MB) lê-se em menos de 200 ms`, () => {
      expect(xml.length).toBeGreaterThan(MB);
      const ms = cronometrar(() => lerXml(xml));
      expect(ms).toBeLessThan(200);
    });
  }

  it("o XML válido sai igual ao de antes", () => {
    const amostras = [
      '<?xml version="1.0"?><!DOCTYPE x><r a="1" b=\'dois &amp; três\'><!-- nota --><p>olá &lt;mundo&gt;</p><![CDATA[<cru>]]><br/><x:y z:w="v">t</x:y></r>',
      "<a><b><c>texto</a></zzz>",
      '<w:p><w:r><w:t xml:space="preserve"> com espaço </w:t></w:r></w:p>',
      "texto antes <a> 1 < 2 </a>",
    ];
    const z1 = docx([
      "Casamento Ana & Rui",
      { h: 1, t: "Cerimónia" },
      { li: "Arco" },
      { img: "a.jpeg" },
      { tabela: [["Total", "1.000 €"]] },
    ]);
    const z2 = pptx([{ titulo: "Mesas", marcadores: ["Centros", "  baixos"], imagens: ["m.jpg"] }]);
    for (const z of [z1, z2]) for (const t of lerTextosDoZip(z).values()) amostras.push(t);
    for (const xml of amostras) expect(lerXml(xml)).toEqual(lerXmlAntigo(xml));
  });
});
