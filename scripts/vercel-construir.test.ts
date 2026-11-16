import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { deveConstruir } from "./vercel-construir.mjs";

/**
 * A conta grátis da Vercel passou os 10 GB de publicações guardadas (17,35 GB,
 * 22/10) e bloqueou a produção. As pré-visualizações passam a construir-se só
 * quando se pedem — ver `vercel-construir.mjs`.
 */
describe("que publicações a Vercel constrói", () => {
  it("produção sem mensagem constrói — na dúvida, constrói", () => {
    expect(deveConstruir({ VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main" })).toBe(true);
    expect(
      deveConstruir({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_COMMIT_MESSAGE: "",
      }),
    ).toBe(true);
    expect(
      deveConstruir({
        VERCEL_ENV: "production",
        VERCEL_GIT_COMMIT_REF: "main",
        VERCEL_GIT_COMMIT_MESSAGE: "  \n ",
      }),
    ).toBe(true);
  });

  it("uma pré-visualização de um ramo qualquer é saltada", () => {
    expect(deveConstruir({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/x" })).toBe(false);
  });

  it("pede-se com um ramo preview/… ou [preview] no commit", () => {
    expect(deveConstruir({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "preview/proxy" })).toBe(
      true,
    );
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

  it("o vercel.json usa este guião (só o lote constrói produção)", () => {
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
  caso(
    "o main constrói, os outros ramos não, e preview/… continua a ser a porta para pedir uma",
    () => {
      esperar(cfg.git.deploymentEnabled).toEqual({ "**": false, main: true, "preview/**": true });
      esperar(cfg.ignoreCommand).toBe("node scripts/vercel-construir.mjs");
    },
  );
});

/**
 * ── O LOTE PASSA A ESTAR NO CÓDIGO (16/11) ─────────────────────────────────
 * A regra 9 (publicar em lotes, uma vez por dia) só se cumpria de memória. A
 * fatura de 3–15/11: construir ~2,8 $ e guardar publicações ~2,8 $, contra
 * ~0,3 $ das funções. Em produção, agora só o lote constrói.
 */
descrever("produção constrói só o lote", () => {
  const prod = (mensagem: string) =>
    deveConstruir({
      VERCEL_ENV: "production",
      VERCEL_GIT_COMMIT_REF: "main",
      VERCEL_GIT_COMMIT_MESSAGE: mensagem,
    });

  caso("o lote constrói: «Lote …» no início, ou lote/… em qualquer sítio", () => {
    esperar(prod("Lote 15/11: lote de 14/11 + cabeçalho da biblioteca_fotos (#471)")).toBe(true);
    esperar(prod("Merge pull request #453 from franciscodapalmagaspar/lote/2026-11-13b")).toBe(
      true,
    );
    esperar(prod("Junta tudo (#480)\n\nramo lote/2026-11-16")).toBe(true);
  });

  caso("[publicar] e [urgente] forçam a construção", () => {
    esperar(prod("Site: mostra a página nova [publicar]")).toBe(true);
    esperar(prod("Segurança: fecha a porta X [urgente] (#481)")).toBe(true);
    esperar(prod("Corrige [URGENTE]")).toBe(true);
  });

  caso("um commit normal no main salta a construção", () => {
    esperar(prod("Propostas: a que segue depois do «Ganho» fica aceite, com contrato (#474)")).toBe(
      false,
    );
    esperar(prod("Lotes de fotos: lê seis de cada vez")).toBe(false);
    esperar(prod("Explica o lote no README")).toBe(false);
  });

  caso("as pré-visualizações ficam como estavam (o lote não as liga)", () => {
    esperar(
      deveConstruir({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "lote/2026-11-16",
        VERCEL_GIT_COMMIT_MESSAGE: "Lote 16/11",
      }),
    ).toBe(false);
    esperar(
      deveConstruir({
        VERCEL_ENV: "preview",
        VERCEL_GIT_COMMIT_REF: "feat/x",
        VERCEL_GIT_COMMIT_MESSAGE: "x [publicar]",
      }),
    ).toBe(false);
  });
});
