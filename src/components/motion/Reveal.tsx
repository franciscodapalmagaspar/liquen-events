"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { EASE_OUT, REVEAL_S, STAGGER_S } from "@/lib/motion/tokens";
import { jaEstaAVista } from "@/lib/motion/primeiro-ecra";

type Variant = "rise" | "fade" | "mask" | "zoom";

/**
 * Scroll-reveal primitive driven by pure CSS transitions + a shared
 * IntersectionObserver. (Previously this used a lazily-imported GSAP
 * ScrollTrigger; since the effect is a ONE-SHOT on-enter reveal — elements start
 * hidden and animate once to a static visible end state, never scrubbed to scroll
 * position — CSS reproduces it byte-for-byte and drops the ~gsap/ScrollTrigger
 * chunk from every page that only uses Reveal.)
 *
 * The hidden "from" state is applied SYNCHRONOUSLY in a layout effect (before the
 * first paint), so above-the-fold reveals never flash. A module-level observer —
 * one per distinct trigger geometry — watches every instance and fires each
 * element's reveal exactly once (mirroring ScrollTrigger's `once: true`), then
 * stops watching it. The effect never runs on the server, so no-JS /
 * reduced-motion users just see the finished content, statically.
 *
 * Easing note: a revelação desacelera na curva de assinatura do sítio — EASE_OUT
 * em `@/lib/motion/tokens`, o mesmo valor que `--ease-out` no globals.css. Este
 * comentário descrevia antes uma curva DIFERENTE (a equivalência ao `power3.out`
 * do GSAP), que a constante logo abaixo já não usava há muito: é o sintoma
 * exacto de um valor copiado à mão em vários sítios. Passou a ficha partilhada,
 * comparada com o CSS por teste, para não voltar a divergir em silêncio.
 *
 * - `rise`  — fade + gentle upward glide (the workhorse).
 * - `fade`  — opacity only.
 * - `mask`  — a clip-path wipe, as if the image/line is uncovered. Cinematic;
 *             use on hero-grade images and display headings.
 * `stagger` animates the element's direct children in sequence instead.
 */

// A desaceleração de assinatura, partilhada com o CSS e com as outras
// primitivas (ver @/lib/motion/tokens). Era aqui um literal próprio.
const EASE = EASE_OUT;

// All instances share observers instead of each spinning up its own. Instances
// with the same trigger geometry (`start`) share ONE observer; each element
// registers a one-shot reveal callback in a WeakMap, fired once on intersection
// and then unobserved — reproducing ScrollTrigger's `once: true`. threshold 0 +
// a bottom root inset make the fire point match ScrollTrigger's "top <N>%": the
// reveal triggers the instant the element's top edge crosses N% down the viewport.
type RevealCallback = () => void;

const observers = new Map<string, IntersectionObserver>();
const revealCallbacks = new WeakMap<Element, RevealCallback>();

function getObserver(rootMargin: string): IntersectionObserver {
  const existing = observers.get(rootMargin);
  if (existing) return existing;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = revealCallbacks.get(entry.target);
        if (cb) {
          revealCallbacks.delete(entry.target);
          observer.unobserve(entry.target);
          cb();
        }
      }
    },
    { threshold: 0, rootMargin },
  );
  observers.set(rootMargin, observer);
  return observer;
}

function observeReveal(el: Element, rootMargin: string, cb: RevealCallback) {
  revealCallbacks.set(el, cb);
  getObserver(rootMargin).observe(el);
}

function unobserveReveal(el: Element, rootMargin: string) {
  if (!revealCallbacks.has(el)) return;
  revealCallbacks.delete(el);
  observers.get(rootMargin)?.unobserve(el);
}

// ScrollTrigger `start` → IntersectionObserver rootMargin. "top 85%" means "fire
// when the element's top edge reaches 85% down the viewport", i.e. a bottom root
// inset of (100 - 85)% = 15%. We read the viewport-percentage token from `start`
// and default to 85% (the primitive's default) when it can't be parsed.
function startToRootMargin(start: string): string {
  const match = /(-?\d+(?:\.\d+)?)\s*%/.exec(start);
  const viewportPercent = match ? parseFloat(match[1]) : 85;
  const bottomInset = 100 - viewportPercent;
  return `0px 0px -${bottomInset}% 0px`;
}

export default function Reveal({
  children,
  variant = "rise",
  as: Tag = "div",
  className,
  delay = 0,
  y = 42,
  // 0.75s (was 1.1s): the old default read as sluggish next to AnimateIn's 0.75s
  // on the same page, so interior-page reveals felt slow. Now they don't just
  // happen to match — leem a MESMA ficha (REVEAL_S).
  duration = REVEAL_S,
  stagger,
  start = "top 85%",
}: {
  children: ReactNode;
  variant?: Variant;
  as?: ElementType;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  stagger?: number | boolean;
  start?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    // Already on screen when the page arrives: it enters with the page, not
    // after it (see @/lib/motion/primeiro-ecra).
    if (jaEstaAVista(el)) return;

    const targets: HTMLElement[] = stagger ? (Array.from(el.children) as HTMLElement[]) : [el];
    if (targets.length === 0) return;
    const step = typeof stagger === "number" ? stagger : STAGGER_S;

    // Hide synchronously, before paint — plain inline styles, no transition — so
    // above-the-fold reveals never flash their finished state first.
    const applyHide = (t: HTMLElement) => {
      if (variant === "mask") {
        t.style.clipPath = "inset(0 0 100% 0)";
        t.style.transform = `translateY(${y * 0.5}px)`;
        t.style.willChange = "clip-path, transform";
      } else if (variant === "zoom") {
        // Cinematic settle: a slightly over-scaled, faded image eases to rest.
        // Pure transform+opacity → GPU-composited, so it stays 60fps smooth even
        // on full-bleed photos (unlike a clip-path wipe, which repaints).
        t.style.opacity = "0";
        t.style.transform = "scale(1.08)";
        t.style.transformOrigin = "center";
        t.style.willChange = "transform, opacity";
      } else if (variant === "fade") {
        t.style.opacity = "0";
      } else {
        t.style.opacity = "0";
        t.style.transform = `translateY(${y}px)`;
        t.style.willChange = "transform";
      }
    };

    // Transition to the final visible state — the exact end values GSAP landed on.
    // `stagger` adds step*index to the per-target delay, matching GSAP's stagger.
    const reveal = (t: HTMLElement, i: number) => {
      const d = delay + (stagger ? i * step : 0);
      if (variant === "mask") {
        t.style.transition = `clip-path ${duration}s ${EASE} ${d}s, transform ${duration}s ${EASE} ${d}s`;
        t.style.clipPath = "inset(0 0 0% 0)";
        t.style.transform = "translateY(0px)";
      } else if (variant === "zoom") {
        t.style.transition = `opacity ${duration}s ${EASE} ${d}s, transform ${duration}s ${EASE} ${d}s`;
        t.style.opacity = "1";
        t.style.transform = "scale(1)";
      } else if (variant === "fade") {
        t.style.transition = `opacity ${duration}s ${EASE} ${d}s`;
        t.style.opacity = "1";
      } else {
        t.style.transition = `opacity ${duration}s ${EASE} ${d}s, transform ${duration}s ${EASE} ${d}s`;
        t.style.opacity = "1";
        t.style.transform = "translateY(0px)";
      }
    };

    for (const t of targets) applyHide(t);

    // Trigger on the container (as ScrollTrigger's `trigger: el` did) even when
    // staggering its children.
    const rootMargin = startToRootMargin(start);
    observeReveal(el, rootMargin, () => {
      targets.forEach(reveal);
    });

    // Drop `will-change` once each reveal finishes (children's transitionend
    // bubbles to `el`), so it isn't left promoting layers indefinitely.
    const onEnd = (e: TransitionEvent) => {
      const t = e.target as HTMLElement;
      if (targets.includes(t)) t.style.willChange = "";
    };
    el.addEventListener("transitionend", onEnd);

    return () => {
      unobserveReveal(el, rootMargin);
      el.removeEventListener("transitionend", onEnd);
    };
  }, [variant, delay, y, duration, stagger, start]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
