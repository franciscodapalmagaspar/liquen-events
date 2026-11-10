import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

/**
 * O Upstash gasta-se só onde protege contas e envios (regra dela, 10/11 — ver
 * `rateLimit`). Esta é a lista das chamadas com `{ global: true }`. Acrescentar
 * uma é uma decisão de custo: se for preciso, muda-se aqui de propósito, com a
 * razão no PR.
 */
const AUTORIZADAS = [
  "src/app/api/admin/login/route.ts",
  "src/app/api/admin/passkeys/entrada/route.ts",
  "src/app/api/admin/recuperar/definir/route.ts",
  "src/app/api/admin/recuperar/route.ts",
  "src/app/api/orcamento/route.ts",
];

describe("quem usa o Upstash", () => {
  it("só as portas de contas e envios", () => {
    const saida = execSync(`grep -rl --include=*.ts "global: true" src/app src/lib || true`, {
      encoding: "utf8",
    });
    const ficheiros = saida
      .split("\n")
      .filter((f) => f && !f.endsWith(".test.ts") && f !== "src/lib/rate-limit.ts")
      .sort();
    expect(ficheiros).toEqual([...AUTORIZADAS].sort());
  });
});
