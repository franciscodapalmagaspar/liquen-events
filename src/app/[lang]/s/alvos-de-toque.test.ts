import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import PaginaSocial from "./[slug]/page";
import { LOCALES } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ALVOS DE TOQUE ESCRITOS À MÃO NESTA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO na árvore que a página devolve, antes da correcção: as duas âncoras
 * que ela desenha por sua conta não traziam espaçamento nenhum.
 *
 *   <a href="tel:+351919259820" class="text-[11px] tracking-[0.14em] …">
 *   <a href="/privacidade" class="underline">
 *
 * Texto de 11 px sem `padding` dá uma caixa de ~16 px de altura — cerca de um
 * TERÇO do mínimo de 44×44 que o TOUCH-AUDIT.md fixou para este repositório, e
 * que `globals.css` implementa na classe `.alvo-toque` (só em
 * `(pointer: coarse)`, para o portátil ficar como está).
 *
 * PORQUE É QUE ISTO CONTA MAIS AQUI DO QUE EM QUALQUER OUTRA PÁGINA. Este ramo
 * só é visto ao telemóvel — é o destino de anúncios do Instagram, dentro do
 * browser interno da aplicação —, e o telefone é UM DOS TRÊS actos de conversão
 * da página, ao lado do WhatsApp e do formulário. Os outros dois vivem na barra
 * fixa e têm 48 px; o telefone tinha 16.
 *
 * ── O QUE ESTE TESTE MEDE, E O QUE NÃO MEDE ────────────────────────────────
 * Mede a DECLARAÇÃO, não a caixa pintada: sem browser não há disposição, e sem
 * disposição não há pixels. Quem mede pixels é `e2e/social.spec.ts`, num
 * Chromium de 390 px com toque ligado. O que este ficheiro garante é que
 * nenhuma âncora nova desta página nasce sem a classe — que é o modo de falha
 * real, porque uma âncora escreve-se numa linha e o defeito não se vê no
 * portátil de quem a escreveu.
 *
 * A regra é sobre TODAS as âncoras da árvore própria da página, e não sobre as
 * duas conhecidas: uma lista de excepções fixas passava a verde no dia em que
 * alguém acrescentasse a terceira.
 */

interface No {
  props?: { children?: unknown; href?: unknown; className?: unknown };
}

/** Percorre a árvore de elementos, incluindo listas e fragmentos. */
function* aPercorrer(no: unknown): Generator<No> {
  if (Array.isArray(no)) {
    for (const filho of no) yield* aPercorrer(filho);
    return;
  }
  if (!no || typeof no !== "object") return;
  const n = no as No;
  if (!n.props) return;
  yield n;
  yield* aPercorrer(n.props.children);
}

/**
 * As âncoras que a PÁGINA desenha.
 *
 * Os componentes de cliente (a barra fixa, o formulário) aparecem na árvore por
 * referência, com os filhos por desenhar — e é o que se quer: os alvos deles
 * são responsabilidade deles, e já estão acima dos 44 px.
 */
async function ancorasDe(lang: string, slug: string) {
  const arvore = await PaginaSocial({ params: Promise.resolve({ lang, slug }) });
  const ancoras: { href: string; className: string }[] = [];
  for (const n of aPercorrer(arvore)) {
    if (typeof n.props?.href === "string") {
      ancoras.push({ href: n.props.href, className: String(n.props.className ?? "") });
    }
  }
  return ancoras;
}

describe("alvos de toque da variante social", () => {
  it("a classe que os cura continua a existir, e continua a valer 44 px", () => {
    // Sem isto o resto do ficheiro media a presença de uma palavra sem efeito.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.alvo-toque\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.alvo-toque\s*\{[^}]*min-width:\s*44px/);
  });

  for (const lang of LOCALES) {
    it(`/${lang}/s/comporta desenha as âncoras que se esperam`, async () => {
      // Não passar por vacuidade: se a página deixar de desenhar âncoras
      // próprias, a regra abaixo fica verdadeira sem verificar nada.
      const ancoras = await ancorasDe(lang, "comporta");
      // As ligações legais (Privacidade · Cookies · Termos, o Livro e os
      // litígios) saíram para a peça de todas as páginas, `AvisoLegal.tsx`
      // (17/11), que dá o `alvo-toque` às suas: aparecem aqui por referência.
      expect(ancoras.map((a) => a.href).sort()).toEqual(["tel:+351919259820"]);
    });

    it(`/${lang}/s/comporta dá 44 px a cada âncora em ponteiro grosso`, async () => {
      for (const a of await ancorasDe(lang, "comporta")) {
        expect(
          a.className.split(/\s+/),
          `<a href="${a.href}"> sem \`alvo-toque\`: class="${a.className}"`,
        ).toContain("alvo-toque");
      }
    });
  }
});
