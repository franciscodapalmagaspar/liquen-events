import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MINIMO_MS } from "@/lib/anti-spam/tempo-minimo";
import { EtiquetaPossivelSpam } from "./EtiquetaPossivelSpam";

describe("a etiqueta «Possível spam»", () => {
  it("sem marca não desenha nada", () => {
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={undefined} />)).toBe("");
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "inventado" }} />)).toBe("");
    // Nem a caixa à volta (a margem é da própria etiqueta): um `{}` gravado não
    // deixa um espaço vazio por baixo do e-mail.
    expect(renderToStaticMarkup(<EtiquetaPossivelSpam valor={{}} className="mt-1" />)).toBe("");
  });

  it("com marca diz a palavra e o porquê (não só a cor)", () => {
    const html = renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "depressa" }} />);
    expect(html).toContain("Possível spam");
    // O número vem do mesmo sítio que a regra (`tempo-minimo.ts`).
    expect(html).toContain(`menos de ${(MINIMO_MS / 1000).toLocaleString("pt-PT")} segundos`);
    expect(html).toContain("<svg");
  });

  it("segue os tokens do sistema de design: raio de badge e letra da escala", () => {
    // Visto num browser a 17/11: era uma cápsula (`rounded-full`) com letra a
    // 10 px fora da escala, que o piso do back office subia para 12 px. O
    // DESIGN-SYSTEM (§ forma) dá aos badges `--radius-badge` (6 px) — cápsula
    // é só para ações principais e chips de filtro — e nenhum tamanho, raio
    // ou espaçamento pode viver fora dos tokens.
    const html = renderToStaticMarkup(<EtiquetaPossivelSpam valor={{ motivo: "depressa" }} />);
    const classe = /<span class="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(classe).toContain("rounded-badge");
    expect(classe).toContain("text-caption");
    expect(classe).not.toMatch(/rounded-full|text-\[\d|tracking-\[/);
  });
});
