import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { finalidadeDoModelo, rodapeLegalDoEmail, type Finalidade } from "./email-rodape-legal";
import { emailAoCliente } from "./email-assinatura";
import { buildClientConfirmation } from "./client-confirmation";
import { SITE } from "./site";

const LINGUAS = ["pt", "en"] as const;
const FINALIDADES: Finalidade[] = ["pedido", "proposta", "faturacao"];

describe("o rodapé legal dos e-mails (17/11, docs/LEGAL-EMAILS.md)", () => {
  it.each(LINGUAS)("%s: as quatro peças, em HTML e em texto simples", (lingua) => {
    const { html, texto } = rodapeLegalDoEmail({ lingua, finalidade: "pedido" });
    for (const url of [
      "https://www.cniacc.pt/",
      "https://www.consumidor.gov.pt/",
      SITE.livroReclamacoes,
      `${SITE.url}${lingua === "en" ? "/en" : ""}/privacidade`,
    ]) {
      expect(html, url).toContain(`href="${url}"`);
      expect(texto, url).toContain(url);
    }
    expect(html).toContain(lingua === "pt" ? "Proteção de dados." : "Data protection.");
    expect(texto).toContain(
      lingua === "pt" ? "Recebeu este e-mail porque" : "You are receiving this e-mail because",
    );
  });

  it("numa moldura sempre branca: só o ícone oficial, e sem regras de modo escuro", () => {
    // Medido nas capturas: a silhueta branca sumia no branco, e o cinzento do
    // modo escuro ficava a 2,6:1 sobre o branco.
    const { html } = rodapeLegalDoEmail({ lingua: "pt", finalidade: "proposta" });
    expect(html.match(/<img[^>]*>/g)).toHaveLength(1);
    expect(html).toContain("livro-de-reclamacoes-escuro.png");
    expect(html).not.toContain("prefers-color-scheme");
  });

  it("o ícone vai em PNG, com URL absoluto, alt, width e height, nas duas versões", () => {
    const { html } = rodapeLegalDoEmail({ lingua: "pt", finalidade: "pedido", modoEscuro: true });
    const imgs = html.match(/<img[^>]*>/g) ?? [];
    expect(imgs).toHaveLength(2);
    for (const img of imgs) {
      expect(img).toMatch(/src="https:\/\/[^"]+\.png"/);
      expect(img).toContain('alt="Livro de Reclamações Eletrónico"');
      expect(img).toContain('width="120"');
      expect(img).toContain('height="48"');
      const ficheiro = img.match(/src="https:\/\/[^/]+(\/[^"]+)"/)![1];
      expect(existsSync(join(process.cwd(), "public", ficheiro)), ficheiro).toBe(true);
    }
    // A silhueta clara só aparece em modo escuro.
    expect(html).toContain("prefers-color-scheme: dark");
  });

  it("a finalidade muda com o e-mail; a faturação acrescenta a alínea c)", () => {
    const pt = (f: Finalidade) => rodapeLegalDoEmail({ lingua: "pt", finalidade: f }).texto;
    expect(pt("pedido")).toContain("para lhe responder e preparar a proposta");
    expect(pt("proposta")).toContain("para preparar e executar a proposta");
    expect(pt("faturacao")).toContain("alínea c)");
    expect(rodapeLegalDoEmail({ lingua: "en", finalidade: "faturacao" }).texto).toContain(
      "Article 6(1)(c) GDPR",
    );
    expect(finalidadeDoModelo("sinal-recebido")).toBe("faturacao");
    expect(finalidadeDoModelo("agradecimento")).toBe("proposta");
  });

  it("sem ODR, sem «não partilhamos», sem identificação legal", () => {
    for (const lingua of LINGUAS)
      for (const finalidade of FINALIDADES) {
        const { html, texto } = rodapeLegalDoEmail({ lingua, finalidade });
        for (const s of [html, texto]) {
          expect(s).not.toMatch(/\bODR\b|ec\.europa\.eu\/consumers/i);
          expect(s).not.toMatch(/não partilhamos|we (do not|never) share/i);
          expect(s).not.toMatch(/\bNIF\b|VAT number/i);
        }
      }
  });

  it("o emailAoCliente leva-o, e só o deixa de fora quando se pede", () => {
    const com = emailAoCliente({
      html: "<p>Olá.</p>",
      texto: "Olá.",
      rodapeLegal: { lingua: "en", finalidade: "proposta" },
    });
    expect(com.html).toContain("data-rodape-legal");
    expect(com.text).toContain("Dispute resolution.");
    const sem = emailAoCliente({ html: "<p>Olá.</p>", texto: "Olá.", rodapeLegal: null });
    expect(sem.html).not.toContain("data-rodape-legal");
  });

  it.each(LINGUAS)("%s: a confirmação do pedido (as duas variantes) leva-o", (locale) => {
    for (const referenceId of ["LQ-1234", undefined]) {
      const c = buildClientConfirmation({ locale, name: "Inês", referenceId, event: undefined });
      expect(c.html, String(referenceId)).toContain("data-rodape-legal");
      expect(c.text).toContain("https://www.cniacc.pt/");
      expect(c.text).toContain(
        locale === "pt" ? "para lhe responder e preparar a proposta" : "solely to reply",
      );
    }
  });

  it("todas as rotas que escrevem ao cliente decidem o rodapé", () => {
    // O `emailAoCliente` exige `rodapeLegal` (o tsc prende-o); aqui prende-se
    // que ninguém monta um email ao cliente sem passar por ele ou pela
    // confirmação.
    const rotas: string[] = [];
    const percorrer = (dir: string) => {
      for (const e of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) percorrer(rel);
        else if (
          e.name === "route.ts" &&
          readFileSync(join(process.cwd(), rel), "utf8").includes("sendMail(")
        )
          rotas.push(rel);
      }
    };
    percorrer("src/app/api");
    const aoCliente = rotas.filter((r) => {
      const f = readFileSync(join(process.cwd(), r), "utf8");
      return f.includes("emailAoCliente(") || f.includes("buildClientConfirmation(");
    });
    expect(aoCliente.sort()).toEqual(
      [
        "src/app/api/email-templates/teste/route.ts",
        "src/app/api/mesas/[id]/enviar/route.ts",
        "src/app/api/orcamento/[id]/mensagem/route.ts",
        "src/app/api/orcamento/[id]/modelo/route.ts",
        "src/app/api/orcamento/[id]/proposta-doc/route.ts",
        "src/app/api/orcamento/route.ts",
      ].sort(),
    );
  });
});
