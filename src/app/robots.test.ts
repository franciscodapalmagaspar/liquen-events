import { describe, expect, it } from "vitest";
import robots, { ROBOS_DAS_RESPOSTAS } from "./robots";

describe("robots — os robôs das respostas, pelo nome", () => {
  const r = robots();
  const regras = Array.isArray(r.rules) ? r.rules : [r.rules];

  it("deixa entrar o GPTBot, o ClaudeBot, o PerplexityBot e o Google-Extended", () => {
    for (const nome of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
      const regra = regras.find((g) => [g.userAgent].flat().includes(nome));
      expect(regra, nome).toBeDefined();
      expect(regra?.allow).toBe("/");
      expect([regra?.disallow].flat()).toEqual(["/api/"]);
    }
  });

  it("cada robô com regra própria tem as mesmas regras da `*` (segue só a sua)", () => {
    const todos = regras.find((g) => g.userAgent === "*");
    for (const nome of ROBOS_DAS_RESPOSTAS) {
      const regra = regras.find((g) => [g.userAgent].flat().includes(nome));
      expect(regra?.allow).toEqual(todos?.allow);
      expect(regra?.disallow).toEqual(todos?.disallow);
    }
  });

  it("aponta o sitemap", () => {
    expect(r.sitemap).toBe("https://liquen-events.com/sitemap.xml");
  });
});
