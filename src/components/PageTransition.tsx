"use client";

import { usePathname } from "next/navigation";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useEffect, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { ViewTransition } from "./vt";

/**
 * Route transitions.
 *
 * We deliberately DON'T use the browser's View Transitions API for route
 * changes. That API snapshots the whole outgoing AND incoming page into
 * compositor layers, freezing the document while it captures — and on our
 * image-heavy heroes (e.g. /sobre's full-bleed 100svh photo) that capture
 * collides with the new route hydrating and decoding its hero, so the
 * transition visibly stuttered no matter how cheap the animated property was.
 *
 * Instead every navigation runs a single lightweight CSS fade on ONLY the
 * incoming content (`.route-fade` in globals.css): no whole-page snapshot, no
 * frozen document, no dual-layer capture — just one composited opacity animation
 * on the new page. That's the cheapest possible transition and stays 60fps even
 * while the new route is still settling. (To bring the View Transitions path
 * back — directional slides, shared-element morphs — flip USE_VIEW_TRANSITIONS
 * to true; the implementation below and the ::view-transition-* rules in
 * globals.css are kept intact.)
 *
 * Entrances are applied ONLY on client-side navigations — never on the very
 * first paint. Animating the initial page would hold the LCP hero invisible
 * while it fades, hurting Largest Contentful Paint. We capture the entry
 * pathname once: the landing render stays static (matches SSR — no hydration
 * mismatch), every subsequent route animates.
 */
// Master switch for the route-level View Transitions API path. OFF for maximum
// transition fluidity — see the note above. The Navbar still tags links
// nav-forward/nav-back and the vt-page* CSS rules remain, so re-enabling is a
// one-line change.
const USE_VIEW_TRANSITIONS = false;
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePublicPathname();
  // A CHAVE é o endereço COMPLETO, com o `/en` (1/11, à noite). Com o público
  // (sem `/en`), trocar de idioma não refazia a página: o React ia remendar o
  // texto antigo no sítio — e um título que o GSAP partiu em linhas já não tem
  // o texto onde o React o deixou. Ela, no iPhone: «muda, mas fica partido».
  // Com a chave completa, a página em inglês nasce de novo (com a mesma entrada
  // suave de qualquer navegação); o vídeo da entrada continua, porque o motor
  // vive fora da árvore (`motorDaSessao`, EntradaEmVideo).
  const chave = usePathname();
  const [entryPath] = useState(pathname);
  const [entryKey] = useState(chave);

  // Whether the BROWSER supports the View Transitions API. React's ViewTransition
  // export exists regardless of browser, so on Safari < 18 (export present, but
  // no document.startViewTransition) the VT path silently hard-cut navigations —
  // the .route-fade fallback never ran. Assume capable for SSR + first render
  // (so hydration matches — the majority path is unchanged), then correct after
  // mount; only a non-supporting browser flips to the CSS fallback.
  const [vtCapable, setVtCapable] = useState(true);
  useEffect(() => {
    setVtCapable(
      typeof document !== "undefined" &&
        typeof (document as Document & { startViewTransition?: unknown }).startViewTransition ===
          "function",
    );
  }, []);

  // Stamp <html data-navigated> on the first client navigation (before paint, so
  // even that navigation's destination hero is covered). Hero pages run their
  // Ken-Burns settle on the INITIAL load only; once the user has navigated,
  // incoming heroes arrive already-settled (see .hero-settle in globals.css), so
  // the 2.2s scale never competes with the new page's image decode + route fade.
  useIsomorphicLayoutEffect(() => {
    if (pathname !== entryPath) {
      document.documentElement.setAttribute("data-navigated", "");
    }
  }, [pathname, entryPath]);

  // Admin/orçamento run full-screen; don't animate their heavy surfaces.
  if (pathname.startsWith("/orcamento")) return <>{children}</>;

  const isNavigation = pathname !== entryPath;

  if (!USE_VIEW_TRANSITIONS || !ViewTransition || !vtCapable) {
    // A subtle TRANSFORM-ONLY entrance (see .route-fade in globals.css): the
    // incoming page eases from a hair over-scaled to rest. It never touches
    // opacity, so the page is fully opaque the whole time — no white flash (the
    // flash came from fading in over the light background). Composited transform
    // → 60fps, and it reads smoother than a hard cut. The key remounts the
    // subtree so per-page state resets; non-prefetched routes still show the dark
    // loading.tsx.
    return (
      <div key={chave} className={isNavigation || chave !== entryKey ? "route-fade" : undefined}>
        {children}
      </div>
    );
  }

  // Keyed by pathname: the old route's tree exits, the new one enters — the
  // enter/exit maps translate the navigation's transition type into the CSS
  // class the ::view-transition-* rules in globals.css animate.
  const typeMap = {
    "nav-forward": "vt-page-fwd",
    "nav-back": "vt-page-bwd",
    default: "vt-page",
  };
  return (
    <ViewTransition key={chave} enter={typeMap} exit={typeMap} default="none">
      {children}
    </ViewTransition>
  );
}
