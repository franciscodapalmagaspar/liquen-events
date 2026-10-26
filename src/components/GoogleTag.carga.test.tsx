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
 *   · depois da hidratação ela entra, uma vez só, assíncrona — no primeiro
 *     gesto ou num prazo de relógio (24/10). Nunca à espera do `load`: o
 *     `lazyOnload` já custou dados ao GA4 (ver o comentário do componente).
 */

const pathname = vi.hoisted(() => ({ value: "/galeria" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

import GoogleTag, { GTAG_ESPERA_MS, GTAG_SOSSEGO_MS, GTAG_SRC } from "./GoogleTag";

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

  it("depois da hidratação o gtag.js NÃO entra logo: espera por um gesto", () => {
    vi.useFakeTimers();
    try {
      render(<GoogleTag />);
      expect(gtagsNoDocumento()).toHaveLength(0);
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(GTAG_SOSSEGO_MS);
      const scripts = gtagsNoDocumento();
      expect(scripts).toHaveLength(1);
      expect((scripts[0] as HTMLScriptElement).async).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  // Ela (26/10, iPhone): «ao fazer scroll está a travar». O primeiro gesto no
  // telemóvel é o polegar a deslizar — e era nesse instante que os ~360 KB do
  // Google começavam a correr. Enquanto a página se mexe, não entra.
  it("e nunca a meio de um deslize: espera que a página sossegue", () => {
    vi.useFakeTimers();
    try {
      render(<GoogleTag />);
      window.dispatchEvent(new Event("touchstart"));
      for (let i = 0; i < 10; i++) {
        vi.advanceTimersByTime(GTAG_SOSSEGO_MS / 2);
        window.dispatchEvent(new Event("scroll"));
        expect(gtagsNoDocumento()).toHaveLength(0);
      }
      vi.advanceTimersByTime(GTAG_SOSSEGO_MS);
      expect(gtagsNoDocumento()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("e, se ninguém mexer, entra no prazo — a página vista conta na mesma", () => {
    vi.useFakeTimers();
    try {
      render(<GoogleTag />);
      expect(gtagsNoDocumento()).toHaveLength(0);
      vi.advanceTimersByTime(GTAG_ESPERA_MS + GTAG_SOSSEGO_MS);
      expect(gtagsNoDocumento()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("e entra UMA vez, por muitas páginas que se percorram", () => {
    vi.useFakeTimers();
    try {
      // O tag vive no layout e o efeito corre a cada mudança de caminho.
      const { rerender } = render(<GoogleTag />);
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(GTAG_SOSSEGO_MS);
      pathname.value = "/sobre";
      rerender(<GoogleTag />);
      pathname.value = "/pt/contacto";
      rerender(<GoogleTag />);
      vi.advanceTimersByTime(GTAG_ESPERA_MS + GTAG_SOSSEGO_MS);
      expect(gtagsNoDocumento()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("e nas rotas caladas não entra de todo", () => {
    pathname.value = "/pt/orcamento/admin";
    render(<GoogleTag />);
    expect(gtagsNoDocumento()).toHaveLength(0);
  });
});
