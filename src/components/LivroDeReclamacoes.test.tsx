// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { cleanup, render } from "@testing-library/react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LIVRO DE RECLAMAÇÕES CHEGA ÀS PÁGINAS QUE NÃO TÊM O RODAPÉ DO SÍTIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria legal (17/11): a ligação ao Livro de Reclamações Eletrónico só
 * vivia no `Footer.tsx`, e três famílias de páginas não o montam — os anúncios
 * (`/s/…`), a proposta online (`/proposta/[token]`) e os ecrãs de erro fora do
 * layout. Este ficheiro prende as três, e prende que é UMA peça só: a mesma
 * ligação em todo o lado, sem segundas cópias escritas à mão.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/s/x", notFound: vi.fn() }));

import LivroDeReclamacoes, {
  LIVRO_DE_RECLAMACOES_1X,
  LIVRO_DE_RECLAMACOES_2X,
} from "./LivroDeReclamacoes";
import { SITE } from "@/lib/site";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary } from "@/lib/i18n";
import NaoEncontradoSocial from "@/app/[lang]/s/NaoEncontradoSocial";
import GlobalError from "@/app/global-error";

afterEach(cleanup);

const RAIZ = process.cwd();
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");
const ENDERECO = 'href="https://www.livroreclamacoes.pt/Inicio/"';

describe("a peça", () => {
  it("leva à plataforma oficial, numa janela nova, com nome", () => {
    const html = renderToStaticMarkup(
      <LivroDeReclamacoes
        rotulo="Livro de Reclamações Eletrónico"
        novaJanela="abre em nova janela"
      />,
    );
    expect(SITE.livroReclamacoes).toBe("https://www.livroreclamacoes.pt/Inicio/");
    expect(html).toContain(ENDERECO);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Livro de Reclamações Eletrónico (abre em nova janela)"');
    expect(html).toContain(LIVRO_DE_RECLAMACOES_1X);
  });

  it("os dois ficheiros do logótipo existem (o pré-gerador escreve-os)", () => {
    for (const f of [LIVRO_DE_RECLAMACOES_1X, LIVRO_DE_RECLAMACOES_2X]) {
      const caminho = join(RAIZ, "public", f);
      expect(existsSync(caminho), `${f} não existe em public/`).toBe(true);
      expect(statSync(caminho).size).toBeGreaterThan(500);
    }
  });

  it("num fundo claro vai em silhueta escura, num escuro em branca", () => {
    const claro = renderToStaticMarkup(
      <LivroDeReclamacoes rotulo="x" novaJanela="y" sobre="claro" />,
    );
    const escuro = renderToStaticMarkup(<LivroDeReclamacoes rotulo="x" novaJanela="y" />);
    expect(claro).toContain("filter:brightness(0)");
    expect(claro).not.toContain("invert");
    expect(escuro).toContain("invert(1)");
  });
});

describe("as páginas sem o rodapé do sítio também o têm", () => {
  it("o 404 dos anúncios (/s/…), nas duas línguas", () => {
    for (const locale of ["pt", "en"] as const) {
      const dict = getDictionary(locale);
      const { container } = render(
        <LocaleProvider locale={locale} dict={dict as never}>
          <NaoEncontradoSocial />
        </LocaleProvider>,
      );
      const a = container.querySelector(`a[href="${SITE.livroReclamacoes}"]`);
      expect(a, `sem Livro de Reclamações no 404 de /s (${locale})`).toBeTruthy();
      expect(a?.getAttribute("aria-label")).toBe(
        `${dict.footer.livroReclamacoes} (${dict.common.newWindow})`,
      );
      cleanup();
    }
  });

  it("o ecrã de erro global", () => {
    const { container } = render(<GlobalError error={new Error("x")} reset={() => {}} />);
    expect(
      container.ownerDocument.querySelector(`a[href="${SITE.livroReclamacoes}"]`),
    ).toBeTruthy();
  });

  // As três de baixo são de servidor (assíncronas, com cabeçalhos e dados
  // assinados): prende-se a montagem no código, que é onde o defeito nasce.
  it.each([
    ["a página do anúncio", "src/app/[lang]/s/[slug]/page.tsx"],
    ["o 404 global", "src/app/global-not-found.tsx"],
    ["a proposta online (o fecho)", "src/app/[lang]/(privado)/proposta/[token]/PropostaWeb.tsx"],
    [
      "a proposta online (erros e quadro antigo)",
      "src/app/[lang]/(privado)/proposta/[token]/page.tsx",
    ],
  ])("%s monta a peça", (_nome, ficheiro) => {
    const fonte = ler(ficheiro);
    expect(fonte).toMatch(/import LivroDeReclamacoes from "@\/components\/LivroDeReclamacoes"/);
    expect(fonte).toMatch(/<LivroDeReclamacoes\b/);
  });

  it("e ninguém escreve a ligação à mão: o endereço só sai da peça", () => {
    const comLigacaoAMao: string[] = [];
    const percorrer = (dir: string) => {
      for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) percorrer(rel);
        else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
          const f = ler(rel);
          if (/href=\{SITE\.livroReclamacoes\}|livroreclamacoes\.pt/.test(f))
            comLigacaoAMao.push(rel);
        }
      }
    };
    percorrer("src");
    expect(comLigacaoAMao).toEqual(["src/components/LivroDeReclamacoes.tsx"]);
  });
});
