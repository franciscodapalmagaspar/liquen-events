import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { chavesDoFicheiro } from "../../../test/chaves-do-app-state";
import { ESPACOS, chavesDosEspacos, espacoDaChave } from "./espacos";

/**
 * O registo dos espaços do `app_state` (docs/ESTRUTURA-DOS-DADOS.md, P2) só
 * vale se for COMPLETO: um prefixo que o código escreve e o registo não
 * conhece é um espaço sem forma, sem prazo e sem decisão sobre a cópia — o
 * defeito que o registo veio fechar. Este teste varre `src/` à procura das
 * chaves que o código passa ao `app_state` e falha com o nome de cada uma que
 * não estiver registada.
 */

/**
 * Literais que a varredura apanha por terem a FORMA de uma chave (devolvidos
 * por uma função `chave…` num ficheiro que usa o app_state) e não o são — cada
 * um com a razão.
 */
const NAO_SAO_CHAVES: Readonly<Record<string, readonly string[]>> = {
  // `juntarRetratos` → `chaveDe`: a identidade de uma linha de um retrato da
  // Reciclagem (para não a repetir ao juntar dois), nunca uma chave do app_state.
  "lib/reciclagem.ts": ["id:", "chave:"],
};

function ficheirosDe(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) return ficheirosDe(p);
    return /\.tsx?$/.test(n) && !/\.(test|spec)\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("o registo dos espaços do app_state", () => {
  it("cada chave que o código dá ao app_state pertence a um espaço registado", () => {
    const raiz = path.join(process.cwd(), "src");
    const porRegistar: string[] = [];
    let vistas = 0;
    for (const f of ficheirosDe(raiz)) {
      for (const chave of chavesDoFicheiro(readFileSync(f, "utf-8"), f)) {
        vistas++;
        const relativo = path.relative(raiz, f);
        if (NAO_SAO_CHAVES[relativo]?.includes(chave)) continue;
        if (chave && !espacoDaChave(chave)) porRegistar.push(`${relativo}: «${chave}»`);
      }
    }
    expect(porRegistar, "registe-as em src/lib/app-state/espacos.ts").toEqual([]);
    // Uma varredura que deixasse de encontrar chaves ficava verde por vazio.
    expect(vistas).toBeGreaterThanOrEqual(15);
  });

  it("a varredura apanha uma chave nova por registar", () => {
    const fonte = `
      import { getState, setState } from "@/lib/app-state";
      const CHAVE_NOVA = "espaco-novo:x";
      export function chaveDoPedido(id: string) { return \`outro-novo:\${id}\`; }
      await setState(\`terceiro-novo:\${id}\`, 1);
      await getState("proposal-templates");
      const chaveDoQuarto = (id: string) => \`quarto-novo:\${id}\`;`;
    const achadas = chavesDoFicheiro(fonte);
    expect(achadas).toEqual(
      expect.arrayContaining([
        "espaco-novo:x",
        "outro-novo:",
        "terceiro-novo:",
        "proposal-templates",
      ]),
    );
    expect(achadas.filter((c) => !espacoDaChave(c))).toEqual([
      "espaco-novo:x",
      "outro-novo:",
      "terceiro-novo:",
      "quarto-novo:",
    ]);
  });

  it("uma chave pertence ao espaço do prefixo mais longo, e as fixas só a si", () => {
    expect(espacoDaChave("armazenamento-blob")).toBe("modosDoBlob");
    expect(espacoDaChave("armazenamento-blob:uso")).toBe("usoDoBlob");
    expect(espacoDaChave("armazenamento:ocupacao")).toBe("ocupacao");
    expect(espacoDaChave("proposal-draft:q1")).toBe("rascunhos");
    expect(espacoDaChave("proposal-templates-x")).toBeNull();
    expect(espacoDaChave("desconhecida")).toBeNull();
  });

  it("cada espaço tem uma chave só sua, e um prefixo acaba num separador", () => {
    const chaves = Object.values(ESPACOS).map((e) => e.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const e of Object.values(ESPACOS)) {
      if (e.tipo === "prefixo") expect(e.chave).toMatch(/[:-]$/);
    }
  });

  it("as listas que derivam do registo dizem o mesmo que diziam à mão", () => {
    expect([...chavesDosEspacos((e) => e.indiceDeFotos === true)].sort()).toEqual([
      "blob:i:",
      "foto-resumo:",
      "foto-visual:",
    ]);
    expect(
      [...chavesDosEspacos((e) => e.mencionaPdfs === false && e.indiceDeFotos !== true)].sort(),
    ).toEqual([
      "aquecimento-pdf:",
      "envio-de-proposta:",
      "ligacao-de-proposta:",
      "ligacao-proposta:",
      "proposta-web:",
    ]);
    expect(chavesDosEspacos((e) => e.mencionaFotos === false && e.indiceDeFotos !== true)).toEqual([
      "proposta-web:",
    ]);
  });
});
