import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * O contrato da rota é lido pelo estúdio, que corre no browser: o que ele
 * importa A CORRER tem de poder ir para lá. Só `import type` (que desaparece
 * na compilação) e os módulos desta lista, que não puxam nem o zod nem o
 * servidor.
 */
const PODE_CORRER_NO_BROWSER = new Set(["@/lib/todos-os-valores"]);

describe("o contrato da rota pode ir para o browser", () => {
  it("só importa tipos, e módulos sem zod nem servidor", () => {
    const fonte = readFileSync(path.join(import.meta.dirname, "contrato.ts"), "utf8");
    const importacoes = [...fonte.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"([^"]+)";/gm)];
    expect(importacoes.length).toBeGreaterThan(0);
    const queCorrem = importacoes.filter(([, soTipo]) => !soTipo).map(([, , modulo]) => modulo);
    expect(queCorrem.filter((m) => !PODE_CORRER_NO_BROWSER.has(m))).toEqual([]);
    expect(fonte).not.toMatch(/server-only|from "zod"/);
  });

  it("e os módulos que deixa correr também não puxam o servidor", () => {
    const fonte = readFileSync(
      path.join(import.meta.dirname, "..", "..", "todos-os-valores.ts"),
      "utf8",
    );
    expect(fonte).not.toMatch(/^import /m);
  });
});
