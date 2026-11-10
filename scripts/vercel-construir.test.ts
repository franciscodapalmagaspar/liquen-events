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

/**
 * ── E OS RAMOS NEM CHEGAM A ARRANCAR UMA CONSTRUÇÃO (9/11) ─────────────────
 * Medido: cada pré-visualização saltada por este guião ainda abria uma máquina
 * de construção durante ~22 s (clonar, instalar o node, correr isto), e num
 * dia de trabalho eram ~40 — mais minutos do que as construções de produção
 * (~72 s cada, 5 nesse dia). Ela: «quero pagar muito pouco mas fazer tudo».
 * O `git.deploymentEnabled` do vercel.json corta-as antes de existirem; este
 * guião fica como segunda rede. A Vercel constrói quando PELO MENOS uma regra
 * diz `true` para o ramo.
 */
import { readFileSync as lerFicheiro } from "node:fs";
import { describe as descrever, it as caso, expect as esperar } from "vitest";

descrever("vercel.json — só o main e os preview/… arrancam construções", () => {
  const cfg = JSON.parse(lerFicheiro(new URL("../vercel.json", import.meta.url), "utf8"));
  caso("o main constrói, os outros ramos não, e preview/… continua a ser a porta para pedir uma", () => {
    esperar(cfg.git.deploymentEnabled).toEqual({ "**": false, main: true, "preview/**": true });
    esperar(cfg.ignoreCommand).toBe("node scripts/vercel-construir.mjs");
  });
});
