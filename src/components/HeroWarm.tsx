"use client";

import { useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { onIdle } from "@/lib/onIdle";
import { heroAvifUrl, heroImageUrl } from "@/lib/hero-image-loader";

/**
 * O browser sabe mostrar AVIF? Pergunta-se uma vez, descodificando um AVIF de
 * 1×1 (279 bytes, escrito aqui). É a mesma escolha que o `<picture>` dos heróis
 * faz pelo `type` da `<source>`.
 *
 * Antes isto não existia, e o aquecimento pedia SEMPRE o WebP — que, num
 * browser com AVIF (todos os correntes), a página seguinte nunca usava: o
 * herói dela vinha a frio, por trás do desfoque. Ela (16/10): «ainda dá para
 * ver a foto desfocada, ainda não dá para ver bem a foto».
 */
const AVIF_1X1 =
  "data:image/avif;base64,AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAACJpbG9jAAAAAERAAAEAAQAAAAAA+gABAAAAAAAAAB0AAAAjaWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABhdjAxAAAAAA5waXRtAAAAAAABAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAlbWRhdBIACgc4AAaQENBpMhAcQmLk4AAWAACQNY48fohQ";
let temAvif: Promise<boolean> | null = null;
export function browserTemAvif(): Promise<boolean> {
  if (!temAvif) {
    temAvif = new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img.width > 0);
      img.onerror = () => ok(false);
      img.src = AVIF_1X1;
    });
  }
  return temAvif;
}

/**
 * Warms the OTHER marketing pages' hero images in the background so navigating
 * to them shows the sharp photo immediately — no "blurred placeholder, then it
 * opens" gap.
 *
 * Why this works: the router prefetches a route's DATA, but not its hero image
 * binary, so on arrival the hero still had to fetch, and the blur placeholder
 * covered that gap. Here, once the current page is idle, we fetch each other
 * hero at the EXACT `/_img/<key>-<w>.webp` static URL that page's `<HeroImage>`
 * will request on THIS device — same src, same snapped width — so it lands in
 * the browser cache and the later request is an instant cache hit. These files
 * are pre-generated at build (scripts/pregen-heroes.mjs), so there's no encode
 * on the wire either.
 *
 * Deferred to idle (after the current page's LCP) and skipped on Save-Data /
 * 2g-3g so it never competes with the visitor's actual page.
 */

// Public route → its hero image source (kept in sync with each page's hero and
// with HERO_SOURCES in src/lib/hero-image-loader.ts).
const HERO_BY_ROUTE: Record<string, string> = {
  "/": "/imagens/entrada-floresta-clara.jpg",
  "/sobre": "/imagens/hd-edited.jpg",
  "/servicos": "/imagens/EW1_1330.jpg",
  "/galeria": "/imagens/DaniGui_Preview20.jpg",
  "/contacto": "/imagens/DJI_20250913190635_0120_D.jpg",
  "/clientes": "/imagens/EW1_1393.jpg",
};

/**
 * O caminho público de um `href` interno, sem a língua (`/en/servicos` →
 * `/servicos`). `null` para tudo o que não é deste sítio.
 */
export function rotaDoHref(href: string, origem: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origem);
  } catch {
    return null;
  }
  if (url.origin !== origem) return null;
  const sem = url.pathname.replace(/^\/en(?=\/|$)/, "") || "/";
  return sem.length > 1 ? sem.replace(/\/$/, "") : sem;
}

/**
 * As fotografias já descodificadas, guardadas para o browser não as largar
 * antes de a página nova as pedir. Seis no máximo (uma por página com herói).
 */
const prontas = new Map<string, HTMLImageElement>();

/**
 * ── NO TOQUE, A FOTOGRAFIA DO DESTINO COMEÇA LOGO A FICAR PRONTA ─────────
 *
 * Ela, 24/10: «quando carrego para ir para alguma cena… fica um bocadinho
 * branco do nada». O aquecimento em `onIdle` (em baixo) já punha o ficheiro
 * em cache, mas ter o ficheiro não chega: um AVIF de 1536 px ainda tem de ser
 * DESCODIFICADO, e até isso acabar a página nova mostrava o desfoque. Aqui,
 * no instante do toque — centenas de milissegundos antes de a página mudar —
 * pede-se o mesmo ficheiro e chama-se `decode()`. Quando a página monta, a
 * fotografia já está pronta a pintar e o véu nem chega a pôr-se.
 */
export function prepararHeroiDe(href: string): void {
  const rota = rotaDoHref(href, window.location.origin);
  const src = rota ? HERO_BY_ROUTE[rota] : undefined;
  if (!src) return;
  void browserTemAvif().then((avif) => {
    const alvo = window.innerWidth * (window.devicePixelRatio || 1);
    const url = (avif && heroAvifUrl(src, alvo)) || heroImageUrl(src, alvo);
    if (prontas.has(url)) return;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    prontas.set(url, img);
    if (prontas.size > 6) prontas.delete(prontas.keys().next().value as string);
    img.decode().catch(() => {});
  });
}

export default function HeroWarm() {
  const pathname = usePublicPathname();

  useEffect(() => {
    const noToque = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a) prepararHeroiDe(a.getAttribute("href") ?? "");
    };
    document.addEventListener("pointerdown", noToque, { capture: true, passive: true });
    return () => document.removeEventListener("pointerdown", noToque, { capture: true });
  }, []);

  useEffect(() => {
    // Don't warm on the back office / quote flow, or the current page.
    if (pathname.startsWith("/orcamento")) return;
    // ── NEM NAS PÁGINAS QUE RECEBEM TRÁFEGO PAGO ──────────────────────────
    // MEDIDO (scripts/medir-social.mjs, /casamentos/estilo/boho, perfil
    // Instagram iOS, 390x844, 4G lento, CPU a 1/4): a página descarregava
    // 1299 KB de imagens, dos quais **623 KB eram as capas das SEIS páginas
    // institucionais** — /contacto (266 KB), /servicos (145 KB), a inicial
    // (134 KB), /clientes (82 KB), /sobre (70 KB) e /galeria (66 KB). Nenhuma
    // delas é desenhada aqui.
    //
    // E é o pior caso possível, não um caso qualquer: o `HERO_BY_ROUTE` não
    // tem nenhuma rota `/casamentos/…`, portanto NENHUMA das seis é "a página
    // actual" e nenhuma é saltada pelo `continue` lá em baixo. Descarregam-se
    // as seis, em `onIdle`, a competir com as fotografias da própria página.
    //
    // O aquecimento é uma aposta em navegação futura. Quem chega de um anúncio
    // não navega: ou converte, ou sai. Aqui a aposta perde sempre, e paga-se
    // com bytes que custam dinheiro por clique.
    if (pathname.startsWith("/casamentos/") || pathname.startsWith("/s/")) return;
    // Nem na galeria. É a única página do sítio com 427 fotografias para ir
    // buscar, e portanto a última onde faz sentido gastar rede a pré-carregar
    // as capas de outras páginas. Medido numa aterragem em /galeria (cache
    // fria, 4G emulado, 1440x900): 734 KB de heros alheios pedidos a t≈1167 ms,
    // exactamente em cima da rajada da grelha — 1536w de DJI_…_0120_D (282 KB),
    // EW1_1330 (151 KB), JOAO_E_PEDRO_… (147 KB), EW1_1393 (83 KB) e hd-edited
    // (71 KB). Bloqueando-os, em 3G, as fotos nítidas aos 8 s passaram de
    // 6/9/9 para 12/12/12.
    if (pathname === "/galeria") return;
    // Respect data-saver / slow connections.
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || (conn?.effectiveType && /(^|-)(2g|3g)$/.test(conn.effectiveType))) return;

    let vivo = true;
    const largar = onIdle(() => {
      void browserTemAvif().then((avif) => {
        if (!vivo) return;
        const dpr = window.devicePixelRatio || 1;
        const target = window.innerWidth * dpr;
        for (const [route, src] of Object.entries(HERO_BY_ROUTE)) {
          if (route === pathname) continue; // this page's hero is already loading
          const img = new Image();
          img.decoding = "async";
          // O MESMO ficheiro que o `<picture>` da página vai escolher (a mesma
          // largura arredondada, e o AVIF onde o browser o lê).
          img.src = (avif && heroAvifUrl(src, target)) || heroImageUrl(src, target);
        }
      });
    });
    return () => {
      vivo = false;
      largar();
    };
  }, [pathname]);

  return null;
}
