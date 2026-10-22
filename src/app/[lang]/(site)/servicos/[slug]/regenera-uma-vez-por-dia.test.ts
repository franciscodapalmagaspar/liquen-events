import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * Esta era a única rota com `revalidate`, a 30 s — e foi ela que levou a conta
 * grátis da Vercel aos 258 mil «ISR Writes» de 200 mil (22/10), o que bloqueou
 * todas as publicações do site. Uma vez por dia chega para as fotos mudarem.
 */
describe("a página de cada serviço", () => {
  it("regenera-se no máximo uma vez por dia", () => {
    const fonte = readFileSync("src/app/[lang]/(site)/servicos/[slug]/page.tsx", "utf8");
    const m = /export const revalidate = (\d+);/.exec(fonte);
    expect(m, "desapareceu o revalidate").not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(86400);
  });

  it("nenhuma outra rota do site se regenera sozinha (cada uma conta para o limite)", () => {
    // Uma rota nova com `revalidate` curto volta a encher o limite — que se
    // diga aqui, e não no dia em que a Vercel bloquear outra vez.
    const linhas = execSync(`grep -rln "export const revalidate" src --include=*.tsx --include=*.ts`, {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter((f) => !/\.test\./.test(f));
    expect(linhas).toEqual(["src/app/[lang]/(site)/servicos/[slug]/page.tsx"]);
  });
});
