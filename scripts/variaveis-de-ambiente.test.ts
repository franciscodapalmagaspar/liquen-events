import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avisarNaConstrucao, variaveisEmFalta } from "./variaveis-de-ambiente.mjs";

/**
 * Registos de 10–17/11: «Optional environment variables not set» 1688 vezes,
 * uma por arranque de função. As opcionais passam a dizer-se UMA vez por
 * implantação, na construção.
 */
describe("variaveis-de-ambiente — o aviso da construção", () => {
  const completo = {
    SESSION_SECRET: "x".repeat(40),
    ADMIN_PASSWORD_HASH: "x",
    SUPABASE_URL: "x",
    SUPABASE_SERVICE_ROLE_KEY: "x",
    SMTP_HOST: "x",
    SMTP_USER: "x",
    SMTP_PASS: "x",
    VAPID_PUBLIC_KEY: "x",
    VAPID_PRIVATE_KEY: "x",
    SENTRY_DSN: "x",
    DEEPL_API_KEY: "x",
    CRON_SECRET: "x",
  };

  it("diz as opcionais em falta uma vez, com os nomes e sem valores", () => {
    const linhas: string[] = [];
    const env = {
      ...completo,
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: undefined,
      VERCEL_ENV: "production",
    };
    avisarNaConstrucao(env, (l) => linhas.push(l));
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toContain("VAPID_PUBLIC_KEY");
    expect(linhas[0]).toContain("VAPID_PRIVATE_KEY");
    expect(linhas[0]).not.toContain("x".repeat(40));
  });

  it("com tudo definido, não diz nada", () => {
    const linhas: string[] = [];
    avisarNaConstrucao({ ...completo, VERCEL_ENV: "production" }, (l) => linhas.push(l));
    expect(linhas).toEqual([]);
  });

  it("numa pré-visualização da Vercel, o Supabase em falta não é crítico (não é a produção)", () => {
    const sem = { ...completo, SUPABASE_URL: undefined };
    expect(variaveisEmFalta(sem, false).criticas).toEqual([]);
    expect(variaveisEmFalta(sem, true).criticas.join()).toContain("SUPABASE_URL");
  });

  it("o `npm run build` corre o aviso antes do `next build`", () => {
    const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const build = pacote.scripts.build;
    expect(build).toContain("node scripts/variaveis-de-ambiente.mjs");
    expect(build.indexOf("variaveis-de-ambiente")).toBeLessThan(build.indexOf("next build"));
  });
});
