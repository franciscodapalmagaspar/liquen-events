import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ROTAS PESADAS PASSAM TODAS PELO `comCpu` (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `docs/GASTAR-POUCO-DESDE-O-INICIO.md` manda as rotas pesadas passarem por
 * `comCpu` (`src/lib/medir-cpu.ts`): é a única forma, de graça, de saber onde
 * vai o processador. Estas desenham PDFs, páginas, miniaturas ou fotografias,
 * ou assinam envios em lote — e estavam por medir. Este teste prende-as: uma
 * rota desta lista que volte a exportar o método sem a medida falha aqui.
 * O `comCpu` não muda a resposta (ver `medir-cpu.test.ts`).
 */
const ROTAS: Record<string, string[]> = {
  "proposta/[token]/pdf": ["GET"],
  "proposta/[token]/paginas": ["GET"],
  "proposta/[token]/pagina/[n]": ["GET"],
  "proposta/[token]/foto/[id]": ["GET"],
  "proposta/[token]/fundo/[id]": ["GET"],
  "contratos/[id]/pdf": ["GET"],
  "guioes/[id]/pdf": ["GET"],
  "mesas/[id]/pdf": ["GET"],
  "orcamento/[id]/miniatura": ["GET"],
  "orcamento/[id]/foco-da-capa": ["GET"],
  "orcamento/[id]/assets/url": ["POST", "PUT"],
  "temas/[id]/imagens/url": ["POST", "PUT"],
  "admin/fotos-diagnostico": ["GET"],
};

describe("as rotas pesadas são medidas", () => {
  it.each(Object.entries(ROTAS))("%s", (rota, metodos) => {
    const fonte = readFileSync(path.join(__dirname, rota, "route.ts"), "utf8");
    expect(fonte).toContain('import { comCpu } from "@/lib/medir-cpu";');
    for (const m of metodos) {
      expect(fonte, `${rota} ${m}`).toMatch(
        new RegExp(`^export const ${m} = comCpu\\("[^"]+ ${m}", ${m}_semMedida\\);$`, "m"),
      );
      expect(fonte, `${rota} ${m} exportado sem medida`).not.toMatch(
        new RegExp(`^export (async )?function ${m}\\b`, "m"),
      );
    }
  });

  it("cada rota tem um nome próprio nos registos", () => {
    const nomes = Object.keys(ROTAS).flatMap((rota) => {
      const fonte = readFileSync(path.join(__dirname, rota, "route.ts"), "utf8");
      return [...fonte.matchAll(/comCpu\("([^"]+)"/g)].map((m) => m[1]);
    });
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
