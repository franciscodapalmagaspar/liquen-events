import { describe, it, expect } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import sitemap from "./sitemap";
import { SITE } from "@/lib/site";
import { GALLERY_WIDTHS, galleryKey } from "@/app/[lang]/(site)/galeria/gallery-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TUDO O QUE O SITEMAP DECLARA TEM DE EXISTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Não é uma correcção — hoje as 62 entradas estão certas, e foi verificado uma
 * a uma. É uma REDE, e passou a ser precisa por causa de uma mudança feita ao
 * lado: agora existe uma rota apanha-tudo (`(site)/[...caminho]`) que serve o
 * 404 desenhado a qualquer endereço sem destino. Isso é bom para quem visita e
 * MAU para quem lê logs: um caminho enganado no sitemap deixa de rebentar de
 * forma visível — passa a devolver uma página bonita com estado 404, e a
 * Google limita-se a queixar-se disso semanas depois, no Search Console.
 *
 * Aqui as rotas são resolvidas contra o `app/` de verdade, à mão e sem contar
 * com o apanha-tudo (que casaria com tudo e não mediria nada).
 *
 * As imagens também: um `<image:loc>` que responda 404 não tira a página do
 * índice, mas gasta rastreio e nunca aparece na pesquisa de imagens — e este
 * sítio declara 449 delas.
 */

const RAIZ_DO_SITIO = join(process.cwd(), "src/app/[lang]/(site)");
const PUBLICO = join(process.cwd(), "public");

/**
 * Existe uma `page.tsx` para este caminho?
 *
 * Percorre-se a árvore como o encaminhador do Next a percorre: os grupos entre
 * parênteses são transparentes e um segmento dinâmico `[x]` casa com qualquer
 * valor. DE PROPÓSITO fica de fora o apanha-tudo `[...x]`: ele existe
 * precisamente para apanhar o que não tem página, portanto contá-lo faria este
 * teste aprovar tudo.
 */
function temPagina(segmentos: string[], dir: string): boolean {
  if (!existsSync(dir)) return false;
  if (segmentos.length === 0) return existsSync(join(dir, "page.tsx"));

  const [cabeca, ...resto] = segmentos;
  const pastas = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (pastas.includes(cabeca) && temPagina(resto, join(dir, cabeca))) return true;
  for (const grupo of pastas.filter((p) => p.startsWith("("))) {
    if (temPagina(segmentos, join(dir, grupo))) return true;
  }
  for (const dinamico of pastas.filter((p) => /^\[[^.\]]+\]$/.test(p))) {
    if (temPagina(resto, join(dir, dinamico))) return true;
  }
  return false;
}

const entradas = sitemap();

/** O caminho público de um URL do sitemap, sem o espelho `/en`. */
function caminho(url: string): string {
  return url.replace(SITE.url, "").replace(/^\/en(?=\/|$)/, "") || "/";
}

describe("sitemap", () => {
  it("não passa por vacuidade", () => {
    expect(entradas.length).toBeGreaterThan(40);
  });

  it("declara cada página nas duas línguas", () => {
    const pt = entradas.filter((e) => !e.url.replace(SITE.url, "").startsWith("/en"));
    expect(entradas).toHaveLength(pt.length * 2);
  });

  it.each([...new Set(entradas.map((e) => caminho(e.url)))])(
    "%s corresponde a uma página que existe",
    (p) => {
      const segmentos = p.split("/").filter(Boolean);
      expect(
        temPagina(segmentos, RAIZ_DO_SITIO),
        `o sitemap declara ${p}, e não há page.tsx que o sirva — hoje isso ` +
          "devolve o 404 desenhado, em silêncio.",
      ).toBe(true);
    },
  );

  /**
   * Desde 9/11 o sitemap declara as versões de `/_img/g/` (ver
   * `imagemDoSitemap`), que não estão no git: o `pregen-gallery` gera-as na
   * construção a partir de cada original de `public/imagens/`, nas larguras
   * de `GALLERY_WIDTHS`. Para cada uma, o que se confere é que o ORIGINAL de
   * onde nasce existe — e que a largura é uma das que se geram.
   */
  it("todas as fotografias declaradas existem em public/ (ou nascem de um original que existe)", () => {
    const imagens = new Set<string>();
    for (const e of entradas) for (const i of e.images ?? []) imagens.add(i);
    const chaves = new Set(readdirSync(join(PUBLICO, "imagens")).map((f) => galleryKey(f)));
    const emFalta = [...imagens].filter((u) => {
      const caminho = u.replace(SITE.url, "");
      const g = /^\/_img\/g\/(.+)-(\d+)\.webp$/.exec(caminho);
      if (g) {
        return !(chaves.has(g[1]) && (GALLERY_WIDTHS as readonly number[]).includes(Number(g[2])));
      }
      return !existsSync(join(PUBLICO, caminho));
    });
    expect(emFalta, `imagens declaradas que não existem: ${emFalta.join(", ")}`).toHaveLength(0);
    // Controlo positivo: há mesmo fotografias da galeria declaradas assim.
    expect([...imagens].some((u) => u.includes("/_img/g/"))).toBe(true);
  });

  it("o sitemap já não declara nenhum original", () => {
    const todas = entradas.flatMap((e) => e.images ?? []);
    expect(todas.filter((u) => u.includes("/imagens/"))).toEqual([]);
  });
});
