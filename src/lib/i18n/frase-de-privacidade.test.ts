import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDictionary } from "@/lib/i18n";
import { getLegal } from "@/app/[lang]/(site)/legal/legal-content";
import { RELAMPAGO_EN, RELAMPAGO_PT } from "@/components/meta/PedidoRelampago";
import { TEXTOS_EN as RAPIDO_EN, TEXTOS_PT as RAPIDO_PT } from "@/components/ads/PedidoRapido";
import { MESES_DE_CONSERVACAO, NOTA_DO_FORMULARIO, trocosEmTexto } from "@/lib/legal/textos-legais";
import { PRAZO_MS } from "@/lib/retencao";

/**
 * A frase por baixo do formulário de orçamento (auditoria legal, 17/11).
 *
 * Dizia «Não partilhamos os seus dados» / «We never share your details». Não
 * era verdade: com consentimento, o e-mail e o telefone seguem cifrados para a
 * Google e para a Meta, para medir os anúncios, e os pedidos vivem em
 * prestadores (alojamento, base de dados, correio). A frase nova é a que o
 * dono escolheu, e é a mesma que a política de privacidade diz na secção 5.
 */
describe("a nota de proteção de dados dos formulários (17/11)", () => {
  // A frase curta «Não vendemos os seus dados.» saiu dos formulários: ao lado
  // da nota formal era redundante (decisão de 17/11, `.claude/rules/legal.md`).
  // A política continua a dizê-la, na secção 5.
  it("os três formulários montam a MESMA nota, e nenhum a frase curta", () => {
    for (const f of [
      "src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx",
      "src/components/meta/PedidoRelampago.tsx",
      "src/components/ads/PedidoRapido.tsx",
    ]) {
      const fonte = readFileSync(join(process.cwd(), f), "utf8");
      expect(fonte, f).toMatch(/<NotaDeProtecaoDeDados\b/);
      expect(fonte, f).not.toMatch(/Não vendemos|We do not sell/);
    }
    for (const t of [RELAMPAGO_PT, RAPIDO_PT, RELAMPAGO_EN, RAPIDO_EN])
      expect(JSON.stringify(t)).not.toMatch(/vendemos|sell your data/i);
    expect(JSON.stringify(getDictionary("pt").orcamento)).not.toContain("Não vendemos");
    expect(JSON.stringify(getDictionary("en").orcamento)).not.toContain("We do not sell");
  });

  it("diz a base legal, o prazo e liga à política, nas duas línguas", () => {
    const pt = trocosEmTexto(NOTA_DO_FORMULARIO.pt);
    const en = trocosEmTexto(NOTA_DO_FORMULARIO.en);
    expect(pt).toContain("artigo 6.º, n.º 1, alínea b), do RGPD");
    expect(pt).toContain("eliminados ao fim de 12 meses");
    expect(en).toContain("Article 6(1)(b) GDPR");
    expect(en).toContain("deleted after 12 months");
    expect(
      NOTA_DO_FORMULARIO.pt.some((t) => typeof t !== "string" && t.href === "/privacidade"),
    ).toBe(true);
  });

  it("os 12 meses da nota são os da política e os do código que apaga", () => {
    expect(MESES_DE_CONSERVACAO).toBe(12);
    expect(PRAZO_MS).toBe(365 * 24 * 60 * 60 * 1000);
    expect(JSON.stringify(getLegal("pt").privacy)).toContain("eliminados automaticamente 12 meses");
    expect(JSON.stringify(getLegal("en").privacy)).toContain("deleted automatically 12 months");
  });

  it("e a política diz que não vendemos", () => {
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
