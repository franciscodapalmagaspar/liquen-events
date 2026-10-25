import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { IconeInstagram, IconeLinkedIn } from "./IconesDasRedes";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("os ícones das redes, num sítio só", () => {
  it("são decorativos: o nome vai na ligação", () => {
    expect(renderToStaticMarkup(<IconeInstagram />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<IconeLinkedIn tamanho={20} />)).toContain('width="20"');
  });

  it("o rodapé do site e o da proposta usam os mesmos (o mesmo traço nos dois)", () => {
    const site = ler("src/components/Footer.tsx");
    const proposta = ler("src/app/[lang]/(privado)/proposta/[token]/PropostaWeb.tsx");
    for (const f of [site, proposta]) expect(f).toContain('from "@/components/IconesDasRedes"');
    expect(site).not.toContain("<svg");
  });

  it("no rodapé da proposta, cada rede abre numa janela nova, sem levar quem abre", () => {
    const proposta = ler("src/app/[lang]/(privado)/proposta/[token]/PropostaWeb.tsx");
    const rodape = proposta.slice(proposta.indexOf('<footer className="pw-foot">'));
    expect(rodape).toContain("href={d.redes.instagram}");
    expect(rodape).toContain("aria-label={t.redes.instagram}");
    expect(rodape.match(/rel="noopener noreferrer"/g)?.length).toBe(2);
    expect(rodape).toContain("{d.redes.linkedin ? (");
  });
});
