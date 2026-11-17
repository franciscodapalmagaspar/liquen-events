// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { ROTULO_DO_LIVRO } from "@/lib/legal/textos-legais";
import { renderToStaticMarkup } from "react-dom/server";
import Footer from "./Footer";
import { SERVICES } from "@/lib/services-data";
import { LOCALES, type Locale } from "@/lib/i18n/config";
import { getDictionary, localizeHref } from "@/lib/i18n";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O RODAPÉ LISTAVA QUATRO DOS CINCO SERVIÇOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * «Batizados e Comunhões» tem página própria (`/servicos/batizados-e-comunhoes`),
 * está no sitemap e aparece em `/servicos`. No rodapé, não: a lista de slugs é
 * escrita à mão em `Footer.tsx` e ficou para trás quando o serviço foi criado.
 * O rodapé aparece em TODAS as páginas do site e nas duas línguas, portanto o
 * serviço perdia a ligação interna que os outros quatro têm em todo o lado.
 *
 * O teste não olha para uma lista escrita à parte: percorre o CATÁLOGO
 * (`SERVICES`, o mesmo que gera as páginas e o sitemap) e exige que o HTML do
 * rodapé leve um link para cada um. Se amanhã nascer um sexto serviço, é este
 * teste que se queixa antes de o rodapé voltar a ficar incompleto.
 */
function rodape(locale: Locale): string {
  return renderToStaticMarkup(<Footer locale={locale} />);
}

describe("o rodapé liga a todos os serviços do catálogo", () => {
  for (const locale of LOCALES) {
    it(`${locale}: nenhum serviço fica de fora`, () => {
      const html = rodape(locale);
      const emFalta = SERVICES.filter(
        (s) => !html.includes(`href="${localizeHref(`/servicos/${s.slug}`, locale)}"`),
      ).map((s) => s.slug);
      expect(emFalta, `serviços sem link no rodapé (${locale}): ${emFalta.join(", ")}`).toEqual([]);
    });

    it(`${locale}: cada link tem o seu rótulo, e nenhum fica sem texto`, () => {
      const t = getDictionary(locale);
      // Os rótulos são emparelhados por ÍNDICE com os slugs. Um rótulo a menos
      // não parte nada: renderiza um link vazio, invisível ao olho e mudo ao
      // leitor de ecrã.
      expect(t.footer.serviceLinks).toHaveLength(SERVICES.length);
      const html = rodape(locale);
      for (const rotulo of t.footer.serviceLinks) {
        expect(rotulo.trim().length).toBeGreaterThan(0);
        // O "&" de «Parties & Celebrations» sai escapado no HTML.
        expect(html).toContain(rotulo.replace(/&/g, "&amp;"));
      }
    });
  }

  it("o serviço que faltava é o dos batizados e comunhões", () => {
    // A prova directa do defeito relatado, para o dia em que alguém leia só
    // este nome e queira saber o que aconteceu.
    expect(rodape("pt")).toContain('href="/servicos/batizados-e-comunhoes"');
  });
});

/**
 * O Livro de Reclamações Eletrónico (pedido dela, 17/10). É obrigatório para
 * quem presta serviços a consumidores: o acesso à plataforma oficial, visível e
 * destacado. O rodapé está em todas as páginas, portanto é aqui que se prende.
 */
describe("o rodapé leva ao Livro de Reclamações Eletrónico", () => {
  for (const locale of LOCALES) {
    it(`${locale}: ligação à plataforma oficial, numa janela nova, com nome`, () => {
      const html = rodape(locale);
      const a = html.match(
        /<a[^>]*href="https:\/\/www\.livroreclamacoes\.pt\/Inicio\/"[^>]*>/,
      )?.[0];
      expect(a, "sem ligação ao livroreclamacoes.pt").toBeTruthy();
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain(`aria-label="${ROTULO_DO_LIVRO[locale].rotulo}"`);
      expect(html).toContain("livro-de-reclamacoes");
    });
  }
});
