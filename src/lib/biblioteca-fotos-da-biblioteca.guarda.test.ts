import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Quem pode ler a tabela `biblioteca_fotos` INTEIRA (14/11).
 *
 * A tabela também guarda as medidas das fotos das propostas. Uma listagem da
 * Biblioteca que use `listFotos` volta a mostrar e a contar fotos `LIQ-…`.
 * Só a cópia de segurança e a reposição precisam da tabela inteira; tudo o
 * resto usa `listFotosDaBiblioteca`. Acrescentar um ficheiro aqui é uma
 * decisão, não um atalho.
 */
const PODEM = new Set([
  "src/app/api/backup/route.ts",
  "src/lib/backup-restore.ts",
  "src/lib/biblioteca-fotos-da-biblioteca.ts",
  "src/lib/biblioteca-fotos-store.ts",
]);

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheiros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

describe("listFotos (a tabela inteira) só na cópia de segurança", () => {
  it("nenhum outro ficheiro o importa", () => {
    const raiz = process.cwd();
    const usam = ficheiros(join(raiz, "src"))
      .filter((f) => /\blistFotos\b/.test(readFileSync(f, "utf8")))
      .map((f) => relative(raiz, f).split("\\").join("/"))
      .filter((f) => !PODEM.has(f));
    expect(usam).toEqual([]);
  });
});
