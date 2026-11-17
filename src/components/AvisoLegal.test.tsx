import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// O `<Link>` do Next desenha um `<a>` igual a qualquer outro no HTML do
// servidor; o duplo marca-o, para se ver QUEM desenhou cada ligação.
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a data-next-link="" href={href} {...resto}>
      {children}
    </a>
  ),
}));

import AvisoLegal from "./AvisoLegal";

describe("o AvisoLegal: as ligações internas navegam pelo Next (C1)", () => {
  it.each(["pt", "en"] as const)("%s: Privacidade e Termos são <Link>", (lingua) => {
    const html = renderToStaticMarkup(<AvisoLegal lingua={lingua} />);
    const prefixo = lingua === "en" ? "/en" : "";
    expect(html).toMatch(new RegExp(`<a data-next-link="" href="${prefixo}/privacidade"`));
    expect(html).toMatch(new RegExp(`<a data-next-link="" href="${prefixo}/termos"`));
    // As externas (CNIACC, Portal, Livro) continuam a abrir noutro separador.
    expect(html).toContain('href="https://www.cniacc.pt/" target="_blank"');
  });

  it("no ecrã de erro global, ligações de documento inteiro (não se navega dentro da árvore partida)", () => {
    const html = renderToStaticMarkup(<AvisoLegal lingua="pt" navegacao="documento" />);
    expect(html).not.toContain("data-next-link");
    expect(html).toContain('href="/privacidade"');
    expect(html).toContain('href="/termos"');
  });

  it("o global-error pede ligações de documento inteiro", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync("src/app/global-error.tsx", "utf8");
    expect(fonte).toMatch(/<AvisoLegal[^>]*navegacao="documento"/);
  });
});
