import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O vigia da sessão vai no pacote inicial do painel (tem de estar montado desde
 * o primeiro instante); o painel de reautenticação NÃO — só se desenha depois
 * de um 401 e chega a pedido (`janela-a-pedido.tsx`). Um `import` estático do
 * painel, ou das passkeys, no vigia voltava a pô-lo no pacote sem ninguém ver
 * (o tecto do `scripts/peso-das-rotas.mjs` só o apanhava no build).
 */
const vigia = readFileSync(path.join(__dirname, "SessaoExpirada.tsx"), "utf8");
const janelas = readFileSync(path.join(__dirname, "janela-a-pedido.tsx"), "utf8");

describe("o painel da sessão que caiu fica fora do pacote", () => {
  it("o vigia não importa o painel nem as passkeys", () => {
    expect(vigia).not.toMatch(/from\s+["']\.\/PainelDaSessaoExpirada["']/);
    expect(vigia).not.toMatch(/passkeys-cliente/);
    expect(vigia).toMatch(
      /import\s*\{\s*PainelDaSessaoExpirada\s*\}\s*from\s*["']\.\/janela-a-pedido["']/,
    );
  });

  it("o painel chega por `import()` e é aquecido com as outras janelas", () => {
    expect(janelas).toMatch(
      /janelaAPedido\(\(\)\s*=>\s*import\(["']\.\/PainelDaSessaoExpirada["']\)\)/,
    );
    expect(janelas).toMatch(/const ORDEM = \[[^\]]*\bsessao\b[^\]]*\]/);
  });
});
