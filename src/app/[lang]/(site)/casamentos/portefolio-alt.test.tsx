// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * AS TRÊS GRELHAS DE PORTEFÓLIO DAS PÁGINAS DE ANÚNCIOS VINHAM MUDAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A secção "PORTEFÓLIO" de `/casamentos/[polo]`, `/casamentos/destination` e
 * `/casamentos/estilo/[estilo]` é a única coisa que aquelas secções mostram:
 * um `<h2>` de título e uma grelha de fotografias REAIS, sem legenda visível
 * nenhuma por baixo de cada uma. Ainda assim as três grelhas passavam
 * `alt=""` a cada `<SafeImage>` — o valor certo para uma imagem decorativa
 * (um fundo, uma faixa de logótipos), errado aqui: para quem usa leitor de
 * ecrã a secção inteira lia-se como se não existisse, e o Google Imagens não
 * tinha nada para indexar em nenhuma das dúzias de páginas deste ramo.
 *
 * O `e2e/a11y.spec.ts` (axe) e o `lighthouserc*.json` não apanhavam isto
 * porque nenhum dos dois visita ESTAS páginas — a lista de rotas dos dois é a
 * mesma meia dúzia de páginas do menu principal, e as páginas de campanha
 * (13 polos + 3 estilos + destination, × 2 línguas = 34 endereços) não têm
 * link nenhum nessa navegação. axe também não acusaria `alt=""`: é
 * sintacticamente válido, e só um humano a olhar para o objectivo da secção
 * ("PORTEFÓLIO") reconhece que ali a imagem É o conteúdo.
 *
 * Este teste não olha para uma lista escrita à mão: percorre o CATÁLOGO
 * (`POLOS`, `ESTILOS`, a lista `FOTOS` da página de destination) e exige que
 * cada fotografia da grelha tenha uma legenda não vazia e distinta das
 * outras — como já acontece na galeria de `/servicos/[slug]`.
 */

vi.mock("next/image", async (importOriginal) => ({
  // O `getImageProps` é o verdadeiro: o `SafeImage` usa-o para escrever a
  // `<source>` AVIF das fotografias (ver `fonteAvif`), e não há nada nele para
  // fingir — é uma conta pura sobre as props.
  getImageProps: (await importOriginal<typeof import("next/image")>()).getImageProps,
  // Passthrough simples: o que importa aqui é o `alt` que chega ao `<img>`,
  // não o comportamento de optimização do next/image. Descarta as props que
  // o next/image entende mas o DOM não (só ruído nos avisos do teste).
  default: (props: Record<string, unknown>) => {
    const {
      fill: _fill,
      loader: _loader,
      priority: _priority,
      blurDataURL: _blurDataURL,
      ...rest
    } = props;
    // O `alt` vem nas props — é ele que este teste verifica.
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

// A grelha vive numa página com um formulário (`PedidoRapido`), que lê o
// router do App Router. Este teste não olha para o formulário nenhum, só
// para as fotos, por isso um `useRouter` de fachada chega.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const { default: PoloPage } = await import("./[polo]/page");
const { default: DestinationPage } = await import("./destination/page");
const { default: EstiloPage } = await import("./estilo/[estilo]/page");
const { POLOS, ESTILOS } = await import("@/lib/ads/polos");
const { default: VariantePage } = await import("../../s/[slug]/page");
const { VARIANTES, fotosDaVariante } = await import("@/lib/meta/variantes");

function imagensDe(el: ReactElement): HTMLImageElement[] {
  const html = renderToStaticMarkup(el);
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = html;
  return Array.from(doc.body.querySelectorAll("img"));
}

/** Legendas não vazias e todas distintas entre si (uma foto muda de outra). */
function verificaLegendas(fotos: string[], imgs: HTMLImageElement[], contexto: string) {
  const doPortefolio = imgs.filter((img) => fotos.includes(img.getAttribute("src") ?? ""));
  expect(doPortefolio.length, `${contexto}: nº de fotos no DOM`).toBe(fotos.length);
  const alts = doPortefolio.map((img) => (img.getAttribute("alt") ?? "").trim());
  for (const alt of alts) {
    expect(alt, `${contexto}: uma foto do portefólio ficou sem legenda`).not.toBe("");
  }
  expect(new Set(alts).size, `${contexto}: legendas repetidas: ${JSON.stringify(alts)}`).toBe(
    alts.length,
  );
}

describe("grelhas de portefólio das páginas de anúncios", () => {
  it.each(["pt", "en"] as const)(
    "%s: polo regional, cada foto do portefólio tem legenda própria",
    async (lang) => {
      const polo = POLOS[0];
      const el = await PoloPage({ params: Promise.resolve({ lang, polo: polo.slug }) });
      verificaLegendas(polo.fotos, imagensDe(el), `/${lang}/casamentos/${polo.slug}`);
    },
  );

  it.each(["pt", "en"] as const)(
    "%s: destination, cada foto do portefólio tem legenda própria",
    async (lang) => {
      const el = await DestinationPage({ params: Promise.resolve({ lang }) });
      // FOTOS não é exportada da página; a mesma lista está reflectida aqui
      // pelos `src` que realmente aparecem no DOM sob o portefólio: como o
      // teste falha se qualquer `<img>` do portefólio ficar sem `alt`, basta
      // exigir mais de uma foto e todas com legenda distinta.
      const html = renderToStaticMarkup(el);
      const doc = document.implementation.createHTMLDocument("");
      doc.body.innerHTML = html;
      const imgs = Array.from(doc.body.querySelectorAll("img"));
      // O herói (prioridade) fica de fora por `alt=""` ser dele por direito;
      // o portefólio é o resto das imagens com `loading="lazy"`.
      const portefolio = imgs.filter((img) => img.getAttribute("loading") === "lazy");
      expect(portefolio.length, `/${lang}/casamentos/destination: fotos no portefólio`).toBe(4);
      const alts = portefolio.map((img) => (img.getAttribute("alt") ?? "").trim());
      for (const alt of alts) expect(alt).not.toBe("");
      expect(new Set(alts).size).toBe(alts.length);
    },
  );

  /**
   * ── E A MESMA SECÇÃO NA PÁGINA DOS ANÚNCIOS DO INSTAGRAM ────────────────
   *
   * A varredura que apanhou as três grelhas de cima parou nas páginas de
   * `/casamentos`. O ramo `/s/<slug>` — o destino do tráfego PAGO da Meta —
   * tem a mesma secção («O TRABALHO»: quatro fotografias em grelha, sem
   * legenda visível) e tinha exactamente o mesmo `alt=""`. E tinha-o também na
   * CAPA, que ali não é decoração nenhuma: é a fotografia a ecrã inteiro que
   * faz metade do argumento da página.
   *
   * Estas páginas são `noindex` de propósito, portanto o Google não é o
   * argumento — o argumento é quem chega a uma landing page de anúncio com
   * leitor de ecrã e não fica a saber que ali há sequer uma imagem.
   */
  it.each(["pt", "en"] as const)(
    "%s: a variante social, capa e grelha do trabalho com legenda própria",
    async (lang) => {
      for (const v of VARIANTES) {
        if (v.soEm && v.soEm !== lang) continue;
        const el = await VariantePage({ params: Promise.resolve({ lang, slug: v.slug }) });
        const imgs = imagensDe(el);
        const contexto = `/${lang}/s/${v.slug}`;

        // A capa: é a primeira imagem e é conteúdo, não fundo.
        const capa = imgs.find((img) => (img.getAttribute("src") ?? "").includes(v.capa));
        expect(capa, `${contexto}: a capa não apareceu no DOM`).toBeTruthy();
        expect((capa?.getAttribute("alt") ?? "").trim(), `${contexto}: capa sem legenda`).not.toBe(
          "",
        );

        // E a grelha do trabalho, com uma legenda distinta por fotografia. A
        // capa sai da conta: nalgumas variantes a fotografia de capa é também
        // uma das quatro da grelha, e apareceria duas vezes no DOM.
        verificaLegendas(
          fotosDaVariante(v),
          imgs.filter((img) => img !== capa),
          contexto,
        );
      }
    },
  );

  it.each(["pt", "en"] as const)(
    "%s: cada estilo, cada foto do portefólio tem legenda própria",
    async (lang) => {
      for (const estilo of ESTILOS) {
        const el = await EstiloPage({ params: Promise.resolve({ lang, estilo: estilo.slug }) });
        verificaLegendas(estilo.fotos, imagensDe(el), `/${lang}/casamentos/estilo/${estilo.slug}`);
      }
    },
  );
});
