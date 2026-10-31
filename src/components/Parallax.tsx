"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * Subtle scroll parallax, engineered so NATIVE scrolling never pays for it:
 *
 *  - One shared scroll/resize listener + one rAF drives every instance on the
 *    page (not a loop per element).
 *  - Zero layout reads during scroll. Element positions are measured once
 *    (mount, resize, window load) into document-space coordinates; each frame
 *    only reads `window.scrollY` and writes transforms. No getBoundingClientRect
 *    per frame ⇒ no layout thrashing, no forced reflows.
 *  - A single shared IntersectionObserver decides which layers are near the
 *    viewport. Only those visible/near layers are in the per-frame loop and only
 *    they carry `will-change`; far off-screen layers do ZERO work each frame
 *    (no offset math, no branch) — on pages with ~12 heroes that turns a
 *    12-iteration loop into a 2–3-iteration one.
 *  - Transform-only writes (compositor work), skipped when the value didn't
 *    change.
 *  - Inert under prefers-reduced-motion.
 *
 * NB: the parent needs `overflow-hidden`, and the child some scale headroom
 * (e.g. `hero-settle` or `scale-110`), so the drift never exposes edges.
 */
// O interruptor do parallax. Esteve desligado em todo o lado, para o
// computador deslizar tão liso como o telemóvel. O pedido «nível estúdio»
// (30/10) pede-o de volta só no computador (o B7.4 do PADRAO-PALUMEN): rato ou
// trackpad e sem «reduzir movimento». No dedo a fotografia fica parada.
function parallaxWanted(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Item {
  el: HTMLElement;
  speed: number;
  top: number; // document-space top (transform-compensated)
  height: number;
  shift: number; // last applied translateY
  active: boolean; // near-viewport per the IntersectionObserver (in the frame loop)
}

const items = new Set<Item>();
// Subset of `items` currently near the viewport — the only ones the per-frame
// loop touches. Membership is driven by the IntersectionObserver, not by math
// re-run every scroll tick.
const onscreen = new Set<Item>();
const byEl = new WeakMap<Element, Item>();
let io: IntersectionObserver | null = null;
let raf = 0;
let listening = false;

// Start tracking a layer ~1.5 viewports before it scrolls into view so its
// drift is already in place — no pop on entry. Matches the old center-distance
// activation window (offset < vh * 1.5), so the active-set size is unchanged;
// the win is that everything beyond it is no longer iterated at all.
const ROOT_MARGIN = "150% 0px 150% 0px";

function measureAll() {
  const y = window.scrollY;
  // Read phase only — all rects first, no interleaved writes.
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    // The rect already includes our own transform; subtract it to get the
    // element's untransformed document position.
    it.top = r.top + y - it.shift;
    it.height = r.height;
  }
  schedule();
}

function frame() {
  raf = 0;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const viewCentre = y + vh / 2;
  // Only near-viewport layers — off-screen ones aren't in this set.
  for (const it of onscreen) {
    const offset = it.top + it.height / 2 - viewCentre;
    const shift = Math.round(-offset * it.speed * 10) / 10;
    if (shift !== it.shift) {
      it.shift = shift;
      it.el.style.transform = `translate3d(0, ${shift}px, 0)`;
    }
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(frame);
}

let resizeRaf = 0;
function onResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    measureAll();
  });
}

function onIntersect(entries: IntersectionObserverEntry[]) {
  for (const e of entries) {
    const it = byEl.get(e.target);
    if (!it) continue;
    if (e.isIntersecting) {
      if (!it.active) {
        it.active = true;
        onscreen.add(it);
        // Promote to a compositor layer only while it's actually animating.
        it.el.style.willChange = "transform";
      }
    } else if (it.active) {
      it.active = false;
      onscreen.delete(it);
      // Drop the promotion so we don't pin dozens of viewport-sized layers
      // (e.g. ~12 on /servicos) that aren't moving.
      it.el.style.willChange = "auto";
    }
  }
  schedule();
}

function listen() {
  if (listening) return;
  listening = true;
  io = new IntersectionObserver(onIntersect, { rootMargin: ROOT_MARGIN });
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  // Late layout shifts (images/fonts settling) move everything below them.
  window.addEventListener("load", measureAll);
}

function unlisten() {
  if (!listening || items.size > 0) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("load", measureAll);
  io?.disconnect();
  io = null;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Fraction of the element's distance-from-viewport-centre to counter-move.
      0.1–0.2 is cinematic; beyond that it reads as a gimmick. */
  speed?: number;
  /** Opt into the CSS scroll-driven drift (compositor, zero main-thread cost;
      see .parallax-drift in globals.css). Gated there by @supports +
      prefers-reduced-motion, so it's pure progressive enhancement — unsupported
      browsers just show the static image. Independent of the (disabled) JS
      path above. */
  drift?: boolean;
}

export default function Parallax({ children, className = "", speed = 0.12, drift = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    // Parallax disabled on every device for maximum scroll fluidity — the
    // desktop now scrolls as natively-smooth as mobile (which already had
    // parallax off on touch). The parent keeps scale headroom (hero-settle), so
    // each image simply sits static: no drift, and no per-frame compositing of
    // viewport-sized layers. Flip parallaxWanted() to re-enable the effect.
    if (!parallaxWanted()) return;

    const item: Item = { el, speed, top: 0, height: 0, shift: 0, active: false };
    items.add(item);
    byEl.set(el, item);
    listen();

    // Measure this item now (others keep their cached geometry) and place it.
    const r = el.getBoundingClientRect();
    item.top = r.top + window.scrollY;
    item.height = r.height;
    // The IntersectionObserver decides whether it enters the frame loop; a
    // near-viewport layer is picked up on the observer's first (async) callback.
    io?.observe(el);
    schedule();
    // One late re-measure catches content that settles after hydration.
    const settle = window.setTimeout(measureAll, 900);

    return () => {
      window.clearTimeout(settle);
      io?.unobserve(el);
      byEl.delete(el);
      onscreen.delete(item);
      items.delete(item);
      el.style.willChange = "";
      el.style.transform = "";
      unlisten();
    };
  }, [speed]);

  return (
    <div ref={ref} className={`${className}${drift ? " parallax-drift" : ""}`}>
      {children}
    </div>
  );
}
