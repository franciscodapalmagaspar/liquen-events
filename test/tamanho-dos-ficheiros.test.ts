import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import TECTOS from "./tamanho-dos-ficheiros.json";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CATRACA DO TAMANHO (fase 0 de `docs/ESTRUTURA-DO-CODIGO.md`, 17/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O limite de ~400 linhas por ficheiro só vale se uma ferramenta o verificar
 * (§1.11). Partir os 193 ficheiros que já passam dele não se faz num dia, por
 * isso a regra é uma catraca:
 *
 *  · um ficheiro NOVO de `src/` nasce com 400 linhas ou menos;
 *  · os que já passam ficam em `tamanho-dos-ficheiros.json`, com o número de
 *    linhas que tinham, e esse número é o tecto: podem encolher, nunca crescer;
 *  · quando um encolhe, o número desce no mesmo PR (senão podia voltar a
 *    crescer até ao antigo sem ninguém ver), e quando desce das 400 sai da lista.
 *
 * Se isto ficar vermelho porque um ficheiro grande cresceu de boa-fé, a
 * resposta é parti-lo, não subir o número.
 *
 * Contam-se as linhas como o `wc -l`, só no código de produção: `.ts` e `.tsx`
 * de `src/`, sem os testes (`.test.`/`.spec.`).
 */

const LIMITE = 400;
const RAIZ = path.resolve(__dirname, "..");
const tectos = TECTOS as Record<string, number>;

function ficheirosDeProducao(dir: string): string[] {
  const saida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules") saida.push(...ficheirosDeProducao(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) {
      saida.push(path.relative(RAIZ, p).split(path.sep).join("/"));
    }
  }
  return saida;
}

function linhas(rel: string): number {
  const texto = readFileSync(path.join(RAIZ, rel), "utf8");
  let n = 0;
  for (let i = 0; i < texto.length; i++) if (texto.charCodeAt(i) === 10) n++;
  return n;
}

const tamanhos = new Map(ficheirosDeProducao(path.join(RAIZ, "src")).map((f) => [f, linhas(f)]));

describe("o tamanho dos ficheiros só desce", () => {
  it(`nenhum ficheiro novo passa das ${LIMITE} linhas`, () => {
    const novosGrandes = [...tamanhos]
      .filter(([f, n]) => n > LIMITE && !(f in tectos))
      .map(([f, n]) => `${f}: ${n} linhas`);
    expect(novosGrandes, "parte-o em ficheiros por assunto").toEqual([]);
  });

  it("nenhum dos grandes cresce", () => {
    const cresceram = Object.entries(tectos)
      .filter(([f, tecto]) => (tamanhos.get(f) ?? 0) > tecto)
      .map(([f, tecto]) => `${f}: ${tamanhos.get(f)} linhas (tecto ${tecto})`);
    expect(cresceram, "parte-o; não se sobe o tecto").toEqual([]);
  });

  it("o tecto acompanha o que encolheu, e sai da lista quem já cabe", () => {
    const desactualizados = Object.entries(tectos)
      .filter(([f, tecto]) => {
        const n = tamanhos.get(f);
        return n === undefined || n <= LIMITE || n < tecto;
      })
      .map(([f, tecto]) => {
        const n = tamanhos.get(f);
        if (n === undefined) return `${f}: já não existe — tira-o da lista`;
        if (n <= LIMITE) return `${f}: ${n} linhas — já cabe, tira-o da lista`;
        return `${f}: ${n} linhas — desce o tecto de ${tecto} para ${n}`;
      });
    expect(desactualizados, "actualiza test/tamanho-dos-ficheiros.json").toEqual([]);
  });
});
