import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deveConstruir } from "./vercel-construir.mjs";

/**
 * A conta grátis da Vercel passou os 10 GB de publicações guardadas (17,35 GB,
 * 22/10) e bloqueou a produção. As pré-visualizações passam a construir-se só
 * quando se pedem — ver `vercel-construir.mjs`.
 */
describe("que publicações a Vercel constrói", () => {
  it("produção constrói sempre", () => {
    expect(deveConstruir({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe(true);
  });

  it("uma pré-visualização de um ramo qualquer é saltada", () => {
    expect(deveConstruir({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" })).toBe(false);
  });

  it("pede-se com um ramo preview/… ou [preview] no commit", () => {
    expect(deveConstruir({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/proxy" })).toBe(true);
    expect(
      deveConstruir({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/x",
        VERCEL_GIT_COMMIT_MESSAGE: "Proxy: … [preview]",
      }),
    ).toBe(true);
  });

  it("na dúvida (sem variáveis), constrói — saltar a produção por engano é pior", () => {
    expect(deveConstruir({})).toBe(true);
  });

  it("o vercel.json usa este guião", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { ignoreCommand?: string };
    expect(config.ignoreCommand).toBe("node scripts/vercel-construir.mjs");
  });
});
