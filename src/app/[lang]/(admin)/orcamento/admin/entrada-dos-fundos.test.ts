import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FUNDO VEM COM A CAIXA QUE ELE TRAZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações fluidas em tudo o que seja para ir de uma
 * coisa à outra».
 *
 * O back office tem nove superfícies que escurecem o ecrã por trás do que se
 * abriu. As CAIXAS entram todas com a `.bo-entrada` — 240 ms, quatro píxeis,
 * `cubic-bezier(0, 0, 0.2, 1)` — e isso está feito há muito. Os FUNDOS
 * apareciam com a opacidade final no primeiro fotograma.
 *
 * É o pior sítio possível para um corte seco: o fundo é a parte que cobre o
 * ecrã INTEIRO. A caixa deslizava devagar por cima de um ecrã que já tinha
 * escurecido de repente — dois tempos diferentes no mesmo gesto.
 *
 * ── O QUE ESTE FICHEIRO PRENDE ────────────────────────────────────────────
 *
 * Todo o véu escuro do back office tem de trazer a `.bo-entrada-fundo`, ou
 * estar nesta tabela com o motivo escrito. Um véu novo sem uma coisa nem
 * outra falha aqui — e quem o escrever tem de dizer porque é que aquele
 * aparece de repente.
 */

const PASTA = new URL(".", import.meta.url).pathname;

/** Um véu: uma classe com `inset-0` e uma tinta escura translúcida. */
const VEU = /className=\{?"([^"]*\binset-0\b[^"]*)"/g;
const ESCURO = /bg-(?:black|\[var\(--bo-seleccao\)\])\/\d+/;

/**
 * ── OS QUE NÃO SÃO VÉUS, E PORQUÊ ─────────────────────────────────────────
 *
 * Três superfícies casam o véu e a caixa no mesmo elemento: a tinta escura
 * não está por trás de nada, É o ecrã. Cada uma tem (ou há-de ter) a sua
 * própria entrada, e pôr-lhes a do fundo animava a coisa toda em vez do véu.
 */
const NAO_SAO_VEUS: Record<string, string> = {
  "PhotoLightbox.tsx": "a tinta é o próprio visualizador, não um véu por trás dele",
  "LupaDeFotos.tsx": "idem — a lupa é o ecrã inteiro, e a entrada dela é outra missão",
  "CriarAPartirDe.tsx": "a caixa e o véu são o mesmo elemento (`flex items-start justify-center`)",
};

function ficheirosDoBackOffice(): string[] {
  const achados: string[] = [];
  const percorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) percorrer(caminho);
      else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) achados.push(caminho);
    }
  };
  percorrer(PASTA);
  return achados;
}

type Veu = { ficheiro: string; classe: string };

function veusEscuros(): Veu[] {
  const encontrados: Veu[] = [];
  for (const caminho of ficheirosDoBackOffice()) {
    const fonte = readFileSync(caminho, "utf8");
    for (const m of fonte.matchAll(VEU)) {
      const classe = m[1];
      if (!ESCURO.test(classe)) continue;
      encontrados.push({ ficheiro: caminho.slice(PASTA.length), classe });
    }
  }
  return encontrados;
}

describe("o fundo vem com a caixa que ele traz", () => {
  it("todo o véu escuro do back office acende em vez de aparecer", () => {
    const semEntrada = veusEscuros()
      .filter((v) => !NAO_SAO_VEUS[v.ficheiro.split("/").pop() ?? ""])
      .filter((v) => !v.classe.includes("bo-entrada-fundo"));

    expect(
      semEntrada.map((v) => `${v.ficheiro} → ${v.classe.slice(0, 60)}`),
      "Um véu que escurece o ecrã inteiro num só fotograma, por baixo de uma " +
        "caixa que entra em 240 ms. Ou leva `bo-entrada bo-entrada-fundo`, ou " +
        "entra na tabela NAO_SAO_VEUS com a razão escrita.",
    ).toEqual([]);
  });

  /**
   * Controlo positivo: sem isto, um regex partido fazia o caso de cima passar
   * por nunca encontrar véu nenhum.
   */
  it("o instrumento encontra mesmo os véus que existem", () => {
    const todos = veusEscuros();
    expect(todos.length, "véus escuros no back office").toBeGreaterThanOrEqual(7);
    expect(todos.some((v) => v.ficheiro.endsWith("AdminClient.tsx"))).toBe(true);
    expect(todos.some((v) => v.ficheiro.endsWith("FolhaOuDialogo.tsx"))).toBe(true);
  });

  /** E a tabela das excepções não pode ganhar linhas mortas. */
  it("a tabela das excepções não guarda ficheiros que já não têm véu", () => {
    const comVeu = new Set(veusEscuros().map((v) => v.ficheiro.split("/").pop()));
    const mortas = Object.keys(NAO_SAO_VEUS).filter((f) => !comVeu.has(f));
    expect(mortas, "excepções escritas para ficheiros sem véu nenhum").toEqual([]);
  });

  /**
   * E a classe que tudo isto pede tem de existir, ser só opacidade, e calar-se
   * com movimento reduzido — que é a herança da `.bo-entrada`.
   */
  it("a `.bo-entrada-fundo` existe, não desloca nada, e cala-se com movimento reduzido", () => {
    // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
    // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
    // o browser os aplica no back office.
    const css =
      readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");
    expect(css).toMatch(/\.bo-entrada-fundo\s*\{[^}]*--bo-entrada-y:\s*0px/);
    expect(css).toMatch(/\.bo-entrada\s*\{\s*animation:\s*bo-entrada\s+240ms/);
    expect(css).toMatch(
      /prefers-reduced-motion:\s*reduce[\s\S]{0,200}?\.bo-entrada\s*\{\s*animation:\s*none/,
    );
  });
});
