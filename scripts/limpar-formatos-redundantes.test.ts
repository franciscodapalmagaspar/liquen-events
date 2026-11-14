import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PARES, SUFIXO_DA_CAPA, megas, planoDeLimpeza } from "./limpar-formatos-redundantes.mjs";
import {
  THEME_AVIF_BUCKET,
  THEME_AVIF_MICRO_BUCKET,
  THEME_AVIF_MID_BUCKET,
  THEME_MICRO_BUCKET,
  THEME_MID_BUCKET,
  THEME_THUMB_BUCKET,
} from "@/lib/theme-ref";

/**
 * UM FICHEIRO POR TAMANHO (14/11) — a limpeza das AVIF que repetem o irmão.
 * Cada caso prende uma regra do guião; ver o cabeçalho dele.
 */
describe("limpar-formatos-redundantes", () => {
  const irmaos = new Map([
    ["t/a.jpg", 1000],
    ["t/b.jpg", 1000],
    ["t/vazio.jpg", 0],
  ]);

  it("só apaga a AVIF cujo irmão existe, com bytes, na mesma chave", () => {
    const { apagar, ficam } = planoDeLimpeza(
      [
        { caminho: "t/a.jpg", bytes: 10 },
        { caminho: "t/sem.jpg", bytes: 20 },
        { caminho: "t/vazio.jpg", bytes: 30 },
      ],
      irmaos,
    );
    expect(apagar.map((o) => o.caminho)).toEqual(["t/a.jpg"]);
    expect(ficam.map((o) => [o.caminho, o.motivo])).toEqual([
      ["t/sem.jpg", "sem-irmao"],
      ["t/vazio.jpg", "sem-irmao"],
    ]);
  });

  it("nunca apaga a capa grande nem a de 1200 da mesma capa (decisão dela, 27/10)", () => {
    const { apagar, ficam } = planoDeLimpeza(
      [
        { caminho: "t/b.jpg", bytes: 10 },
        { caminho: `t/b.jpg${SUFIXO_DA_CAPA}`, bytes: 50 },
        { caminho: "t/a.jpg", bytes: 10 },
      ],
      // A capa grande nunca tem irmão — é o único ficheiro desse tamanho.
      new Map([...irmaos, [`t/b.jpg${SUFIXO_DA_CAPA}`, 1]]),
    );
    expect(apagar.map((o) => o.caminho)).toEqual(["t/a.jpg"]);
    expect(Object.fromEntries(ficam.map((o) => [o.caminho, o.motivo]))).toEqual({
      "t/b.jpg": "media-da-capa",
      [`t/b.jpg${SUFIXO_DA_CAPA}`]: "capa",
    });
  });

  it("os pares são os buckets das constantes, e cada AVIF aponta ao do seu tamanho", () => {
    expect(PARES).toEqual([
      { redundante: THEME_AVIF_BUCKET, fica: THEME_THUMB_BUCKET },
      { redundante: THEME_AVIF_MICRO_BUCKET, fica: THEME_MICRO_BUCKET },
      { redundante: THEME_AVIF_MID_BUCKET, fica: THEME_MID_BUCKET },
      { redundante: "proposal-avif-medias", fica: "proposal-medias" },
    ]);
    // O sufixo da capa é o MESMO que o código usa para a gravar.
    expect(readFileSync("src/lib/proposal-assinaturas.ts", "utf8")).toContain(
      `export const SUFIXO_DA_CAPA_WEB = "${SUFIXO_DA_CAPA}";`,
    );
    expect(readFileSync("src/lib/proposal-assinaturas.ts", "utf8")).toContain(
      'export const PROPOSAL_AVIF_MID_BUCKET = "proposal-avif-medias";',
    );
    expect(readFileSync("src/lib/proposal-assinaturas.ts", "utf8")).toContain(
      'export const PROPOSAL_MID_BUCKET = "proposal-medias";',
    );
  });

  it("é um ensaio por omissão: só apaga com --apagar", () => {
    const fonte = readFileSync("scripts/limpar-formatos-redundantes.mjs", "utf8");
    expect(fonte).toMatch(/const APAGAR = process\.argv\.includes\("--apagar"\);/);
    // A única chamada que apaga está depois do `if (!APAGAR) return;`.
    const corte = fonte.indexOf("if (!APAGAR) return;");
    expect(corte).toBeGreaterThan(0);
    expect(fonte.indexOf(".remove(")).toBeGreaterThan(corte);
    expect(fonte.match(/\.remove\(/g)).toHaveLength(1);
  });

  it("soma os MB", () => {
    expect(megas([{ bytes: 1048576 }, { bytes: 524288 }])).toBe(1.5);
    expect(megas([])).toBe(0);
  });
});

/**
 * E as páginas da proposta já não oferecem a AVIF de 1200 em sítio nenhum
 * (o `Inspiracao.test.tsx` prova-o a desenhar; aqui, o Documento e a lista de
 * temas, que não têm passeio próprio para isto).
 */
describe("nenhuma leitura oferece uma AVIF que a limpeza apaga", () => {
  it('o Documento da proposta não tem `<source type="image/avif">`', () => {
    const doc = readFileSync("src/app/[lang]/(privado)/proposta/[token]/Documento.tsx", "utf8");
    expect(doc).not.toMatch(/image\/avif/);
  });

  it("a lista de temas não assina o `theme-avif`", () => {
    const resumos = readFileSync("src/lib/temas-resumos.ts", "utf8");
    expect(resumos).not.toMatch(/signThemeAvif|THEME_AVIF/);
    const storage = readFileSync("src/lib/theme-storage.ts", "utf8");
    expect(storage).not.toMatch(/export function signThemeAvif/);
  });
});
