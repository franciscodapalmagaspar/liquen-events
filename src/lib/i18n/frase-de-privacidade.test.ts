import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDictionary } from "@/lib/i18n";
import { getLegal } from "@/app/[lang]/(site)/legal/legal-content";
import { RELAMPAGO_EN, RELAMPAGO_PT } from "@/components/meta/PedidoRelampago";
import { TEXTOS_EN as RAPIDO_EN, TEXTOS_PT as RAPIDO_PT } from "@/components/ads/PedidoRapido";

/**
 * A frase por baixo do formulário de orçamento (auditoria legal, 17/11).
 *
 * Dizia «Não partilhamos os seus dados» / «We never share your details». Não
 * era verdade: com consentimento, o e-mail e o telefone seguem cifrados para a
 * Google e para a Meta, para medir os anúncios, e os pedidos vivem em
 * prestadores (alojamento, base de dados, correio). A frase nova é a que o
 * dono escolheu, e é a mesma que a política de privacidade diz na secção 5.
 */
describe("a frase de privacidade do formulário", () => {
  it("é a que o dono escolheu, nas duas línguas", () => {
    expect(getDictionary("pt").orcamento.privacyPost).toBe(". Não vendemos os seus dados.");
    expect(getDictionary("en").orcamento.privacyPost).toBe(". We do not sell your data.");
  });

  it("os formulários dos anúncios (Meta e Google) dizem o mesmo", () => {
    for (const t of [RELAMPAGO_PT, RAPIDO_PT])
      expect(t.privacidade).toBe("Não vendemos os seus dados. Ver");
    for (const t of [RELAMPAGO_EN, RAPIDO_EN])
      expect(t.privacidade).toBe("We do not sell your data. See our");
  });

  it("e a política diz o mesmo", () => {
    expect(JSON.stringify(getLegal("pt").privacy)).toContain("Não vendemos os seus dados");
    expect(JSON.stringify(getLegal("en").privacy)).toContain("We do not sell your data");
  });

  it("a frase falsa não volta a lado nenhum do código", () => {
    // E a dos formulários dos anúncios (17/11, decisão do dono): «Os dados
    // servem apenas para responder ao pedido» também não era verdade com
    // consentimento.
    const falsas =
      /não partilhamos os seus dados|we never share your details|servem apenas para responder|used only to answer this request/i;
    const encontradas: string[] = [];
    const percorrer = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) percorrer(rel);
        else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
          if (falsas.test(readFileSync(join(process.cwd(), rel), "utf8"))) encontradas.push(rel);
        }
      }
    };
    percorrer("src");
    expect(encontradas).toEqual([]);
  });

  it("a política já não promete sinais «sem cookies» à Google depois de recusar", () => {
    // Desde 17/11 a biblioteca da Google nem carrega sem «Aceitar» (GoogleTag.tsx).
    expect(JSON.stringify(getLegal("pt").privacy)).not.toMatch(/sinais [^"]*sem cookies/);
    expect(JSON.stringify(getLegal("en").privacy)).not.toMatch(/cookieless signals/);
    expect(JSON.stringify(getLegal("pt").privacy)).toContain("www.cnpd.pt");
    expect(JSON.stringify(getLegal("en").privacy)).toContain("www.cnpd.pt");
  });
});
