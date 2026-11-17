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

import GoogleTag, {
  GA4_ID,
  GTAG_SOSSEGO_MS,
  GTAG_SRC,
  aplicarConsentimentoGoogle,
} from "./GoogleTag";

const gtagsNoDocumento = () => document.querySelectorAll(`script[src="${GTAG_SRC}"]`);

/** Os comentários podem falar do `next/script` à vontade; o código não. */
function semComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

beforeEach(() => {
  pathname.value = "/galeria";
  for (const s of gtagsNoDocumento()) s.remove();
  delete (window as { gtag?: unknown }).gtag;
  delete (window as { dataLayer?: unknown }).dataLayer;
  // Estes testes da carga são do caminho COM consentimento. Os sem ele estão
  // no fim (auditoria legal, 17/11).
  localStorage.setItem("liquen-consent", "granted");
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

  it("e, se ninguém mexer, não entra — nem passado muito tempo (31/10, «Só ao 1.º toque»)", () => {
    vi.useFakeTimers();
    try {
      render(<GoogleTag />);
      vi.advanceTimersByTime(60_000);
      expect(gtagsNoDocumento()).toHaveLength(0);
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
      window.dispatchEvent(new Event("scroll"));
      vi.advanceTimersByTime(60_000);
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

/**
 * Auditoria legal (17/11). MEDIDO num Chromium antes desta mudança: depois de
 * «Recusar», cada página pedia o gtag.js e mandava `g/collect` com `gcs=G100`
 * (os pings «sem cookies» do Consent Mode). Ela quer que «Recusar» não deixe
 * sair nada para a Google — e, antes da escolha, também nada.
 */
describe("GoogleTag — sem «Aceitar», a biblioteca da Google não entra", () => {
  function gestoESossego() {
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(GTAG_SOSSEGO_MS);
    window.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(60_000);
  }

  it("antes da escolha: nem com gestos", () => {
    localStorage.removeItem("liquen-consent");
    vi.useFakeTimers();
    try {
      render(<GoogleTag />);
      gestoESossego();
      expect(gtagsNoDocumento()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("com «Recusar»: nem com gestos, nem a mudar de página", () => {
    localStorage.setItem("liquen-consent", "denied");
    vi.useFakeTimers();
    try {
      const { rerender } = render(<GoogleTag />);
      gestoESossego();
      pathname.value = "/sobre";
      rerender(<GoogleTag />);
      gestoESossego();
      window.dispatchEvent(new Event("liquen:consent-changed"));
      expect(gtagsNoDocumento()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aceitar a meio da visita (neste separador): entra logo, em «granted»", () => {
    localStorage.removeItem("liquen-consent");
    render(<GoogleTag />);
    expect(gtagsNoDocumento()).toHaveLength(0);
    // O que o aviso de cookies faz no toque em «Aceitar».
    localStorage.setItem("liquen-consent", "granted");
    aplicarConsentimentoGoogle(true);
    window.dispatchEvent(new Event("liquen:consent-changed"));
    expect(gtagsNoDocumento()).toHaveLength(1);
    const fila = (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) =>
      Array.from(a),
    );
    const update = fila.find((a) => a[0] === "consent" && a[1] === "update");
    expect(update?.[2]).toMatchObject({ analytics_storage: "granted", ad_storage: "granted" });
  });
});

/** Achados da revisão independente (17/11). */
describe("GoogleTag — a escolha feita a meio da visita, aqui ou noutro separador", () => {
  const fila = () =>
    (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((a) => Array.from(a));
  const ultimoUpdate = () =>
    fila()
      .filter((a) => a[0] === "consent" && a[1] === "update")
      .at(-1)?.[2];

  it("aceite noutro separador: aplica «granted», levanta o ga-disable e carrega", () => {
    localStorage.setItem("liquen-consent", "denied");
    render(<GoogleTag />);
    aplicarConsentimentoGoogle(false); // a recusa que ficou desta visita
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`]).toBe(true);
    localStorage.setItem("liquen-consent", "granted");
    window.dispatchEvent(new StorageEvent("storage", { key: "liquen-consent" }));
    expect(gtagsNoDocumento()).toHaveLength(1);
    expect(ultimoUpdate()).toMatchObject({ analytics_storage: "granted" });
    expect((window as unknown as Record<string, unknown>)[`ga-disable-${GA4_ID}`]).toBe(false);
  });

  it("recusado antes do gesto: a entrada que estava à espera é desarmada", () => {
    vi.useFakeTimers();
    try {
      render(<GoogleTag />); // com consentimento (beforeEach): fica à espera do gesto
      localStorage.setItem("liquen-consent", "denied");
      window.dispatchEvent(new StorageEvent("storage", { key: "liquen-consent" }));
      window.dispatchEvent(new Event("pointerdown"));
      vi.advanceTimersByTime(60_000);
      expect(gtagsNoDocumento()).toHaveLength(0);
      expect(ultimoUpdate()).toMatchObject({ analytics_storage: "denied" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("recusar apaga os cookies da Google", () => {
    document.cookie = "_ga=GA1.1.1.1; path=/";
    document.cookie = "_ga_29CZZ76H6F=GS2.1; path=/";
    document.cookie = "_gcl_au=1.1.1; path=/";
    document.cookie = "liquen-lang=pt; path=/";
    aplicarConsentimentoGoogle(false);
    expect(document.cookie).not.toMatch(/_ga|_gcl/);
    expect(document.cookie).toContain("liquen-lang=pt"); // o necessário fica
    document.cookie = "liquen-lang=; max-age=0; path=/";
  });

  it("recusar a meio da visita cala a fila (o Ads incluído); aceitar devolve-a", () => {
    render(<GoogleTag />);
    const fila = (window as unknown as { dataLayer: unknown[] }).dataLayer;
    const gtag = (window as unknown as { gtag: (...a: unknown[]) => void }).gtag;
    aplicarConsentimentoGoogle(false);
    const antes = fila.length;
    gtag("event", "conversion", { send_to: "AW-x" });
    expect(fila.length).toBe(antes); // calado
    aplicarConsentimentoGoogle(true);
    gtag("event", "conversion", { send_to: "AW-x" });
    expect(Array.from(fila.at(-1) as IArguments)[1]).toBe("conversion");
  });

  it("uma recusa noutro separador também apaga o clique da Meta (o MetaPixel pode não estar montado)", async () => {
    const meta = await import("@/lib/meta/click-id");
    localStorage.setItem("liquen-consent", "granted");
    meta.capturarClique("?fbclid=IwAR_outro_separador", "/s/x");
    expect(localStorage.getItem(meta.META_CLICK_KEY)).toContain("IwAR_outro_separador");
    render(<GoogleTag />);
    localStorage.setItem("liquen-consent", "denied");
    window.dispatchEvent(new StorageEvent("storage", { key: "liquen-consent" }));
    expect(localStorage.getItem(meta.META_CLICK_KEY)).toBeNull();
    localStorage.setItem("liquen-consent", "granted");
    meta.aoMudarConsentimento(true);
    expect(localStorage.getItem(meta.META_CLICK_KEY)).toBeNull(); // a memória também foi
  });
});
