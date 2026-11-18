import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pedido do dono (18/11), com a captura do telemóvel: na página inicial, ao
 * descer, o «Pedir proposta» do canto sai — a entrada já o tem no primeiro
 * ecrã. Nas outras páginas fica. (Medido no browser em `e2e/cta-flutuante.spec.ts`.)
 */
const fonte = readFileSync(join(process.cwd(), "src/components/StickyCTA.tsx"), "utf8");

describe("o «Pedir proposta» do canto", () => {
  it("esconde-se na página inicial", () => {
    expect(fonte).toMatch(/const hidden =\s*pathname === "\/" \|\|/);
  });
  it("e usa a letra das chamadas, mais pequena (pedido de 18/11)", () => {
    expect(fonte).toContain('className="text-chamada ');
  });
});

describe("o «Pedir proposta» do canto e a chamada final da página", () => {
  it("esconde-se quando a chamada final (com o seu próprio botão) está no ecrã", () => {
    expect(fonte).toContain('"footer, [data-chamada-final]"');
    expect(fonte).toContain("[mounted, pathname]");
  });
  it("e as páginas com chamada final marcam-na", () => {
    for (const pagina of ["clientes", "servicos", "sobre"]) {
      const p = readFileSync(
        join(process.cwd(), `src/app/[lang]/(site)/${pagina}/page.tsx`),
        "utf8",
      );
      expect(p, pagina).toContain("<section data-chamada-final");
    }
  });
});
