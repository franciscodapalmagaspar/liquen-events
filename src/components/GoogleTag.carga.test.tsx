// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GTAG.JS ENTRA À MESMA HORA — MAS SEM PRÉ-CARGA NO `<head>`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com o `<Script strategy="afterInteractive">` do `next/script`, o App Router
 * chama `ReactDOM.preload()` no servidor e cada página pública saía com um
 * `<link rel="preload" as="script">` do gtag.js no `<head>`. Medido a 390×844
 * em `next start`: ~160 KB (brotli) pedidos ao mesmo tempo que a fotografia do
 * topo, que é o LCP.
 *
 * O que estes testes prendem são as duas metades da troca:
 *
 *   · o HTML do servidor não leva a biblioteca de forma nenhuma — nem
 *     `<script src>`, nem `<link rel="preload">`;
 *   · depois da hidratação ela entra, uma vez só, assíncrona. Não mais tarde:
 *     o `lazyOnload` já custou dados ao GA4 (ver o comentário do componente).
 */

const pathname = vi.hoisted(() => ({ value: "/galeria" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import GoogleTag, { GTAG_SRC } from "./GoogleTag";

const gtagsNoDocumento = () => document.querySelectorAll(`script[src="${GTAG_SRC}"]`);

/** Os comentários podem falar do `next/script` à vontade; o código não. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

beforeEach(() => {
  pathname.value = "/galeria";
  for (const s of gtagsNoDocumento()) s.remove();
});
afterEach(cleanup);

describe("GoogleTag — a biblioteca não compete com a primeira pintura", () => {
  it("o HTML do servidor não traz o gtag.js nem um aviso de pré-carga", () => {
    const html = renderToString(<GoogleTag />);
    // Controlo positivo: o servidor desenha MESMO o tag (o bootstrap do
    // consentimento), senão as duas asserções de baixo passavam no vazio.
    expect(html).toContain("consent");
    expect(html).not.toContain("googletagmanager.com/gtag/js");
    expect(html).not.toMatch(/rel="preload"/);
  });

  it("o componente já não passa pelo next/script, que é quem escreve a pré-carga", () => {
    const fonte = semComentarios(
      readFileSync(join(process.cwd(), "src/components/GoogleTag.tsx"), "utf8"),
    );
    expect(fonte).not.toMatch(/from\s+["']next\/script["']/);
  });

  it("depois da hidratação o gtag.js entra — assíncrono, no documento", () => {
    render(<GoogleTag />);
    const scripts = gtagsNoDocumento();
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);
  });

  it("e entra UMA vez, por muitas páginas que se percorram", () => {
    // O tag vive no layout e o efeito corre a cada mudança de caminho.
    const { rerender } = render(<GoogleTag />);
    pathname.value = "/sobre";
    rerender(<GoogleTag />);
    pathname.value = "/pt/contacto";
    rerender(<GoogleTag />);
    expect(gtagsNoDocumento()).toHaveLength(1);
  });

  it("e nas rotas caladas não entra de todo", () => {
    pathname.value = "/pt/orcamento/admin";
    render(<GoogleTag />);
    expect(gtagsNoDocumento()).toHaveLength(0);
  });
});
