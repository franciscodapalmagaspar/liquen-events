// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A identificação legal (denominação, NIF, sede) — auditoria legal de 17/11.
 *
 * Os valores são do dono e NÃO se inventam: vivem vazios em `EMPRESA`
 * (`src/lib/site.ts`). O que se prende aqui são os dois lados:
 *   · vazios, não aparece nada (nem um «NIF» sem número);
 *   · preenchidos, aparecem no rodapé e na política de privacidade, secção 1.
 */

import { EMPRESA, SITE, identificacaoLegal } from "./site";
import Footer from "@/components/Footer";
import { getLegal } from "@/app/[lang]/(site)/legal/legal-content";

const VAZIA = { ...EMPRESA };
afterEach(() => Object.assign(EMPRESA, VAZIA));

const TESTE = {
  denominacao: "Empresa de Teste, Lda.",
  nif: "999999990",
  morada: "Rua de Teste, 1, 0000-000 Lugar",
};

describe("a identificação legal da empresa", () => {
  it("está vazia até o dono a preencher — nada inventado", () => {
    expect(EMPRESA).toEqual({ denominacao: "", nif: "", morada: "" });
    expect(SITE.empresa).toBe(EMPRESA);
    expect(identificacaoLegal("pt")).toBeNull();
  });

  it("vazia, o rodapé e a política não mostram nada dela", () => {
    expect(renderToStaticMarkup(<Footer locale="pt" />)).not.toMatch(/NIF/);
    const politica = JSON.stringify(getLegal("pt").privacy);
    expect(politica).not.toContain("Identificação legal");
    expect(JSON.stringify(getLegal("en").privacy)).not.toContain("Legal identification");
  });

  it("preenchida, aparece no rodapé, nas duas línguas", () => {
    Object.assign(EMPRESA, TESTE);
    const pt = renderToStaticMarkup(<Footer locale="pt" />);
    expect(pt).toContain(
      "Empresa de Teste, Lda. · NIF 999999990 · Rua de Teste, 1, 0000-000 Lugar",
    );
    expect(renderToStaticMarkup(<Footer locale="en" />)).toContain("Tax ID (NIF) 999999990");
  });

  it("preenchida, aparece na secção 1 da política de privacidade", () => {
    Object.assign(EMPRESA, TESTE);
    const secao1 = getLegal("pt").privacy.sections[0].body.join(" ");
    expect(secao1).toContain("Identificação legal: Empresa de Teste, Lda. · NIF 999999990");
    expect(getLegal("en").privacy.sections[0].body.join(" ")).toContain(
      "Legal identification: Empresa de Teste, Lda.",
    );
  });

  it("só com parte dos campos, mostra só essa parte", () => {
    expect(identificacaoLegal("pt", { denominacao: "", nif: " 123 ", morada: "" })).toBe("NIF 123");
  });

  it("uma firma que acaba em ponto não ganha um segundo ponto na política", () => {
    Object.assign(EMPRESA, { denominacao: "Empresa de Teste, Lda.", nif: "", morada: "" });
    const secao1 = getLegal("pt").privacy.sections[0].body.join(" ");
    expect(secao1).toContain("Identificação legal: Empresa de Teste, Lda.");
    expect(secao1).not.toContain("Lda..");
  });
});
