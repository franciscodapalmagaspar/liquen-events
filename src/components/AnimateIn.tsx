"use client";

import { useRef } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { EASE_OUT, REVEAL_S } from "@/lib/motion/tokens";
import { jaEstaAVista } from "@/lib/motion/primeiro-ecra";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  from?: "bottom" | "left" | "right" | "fade" | "clip";
}

const TRANSFORMS: Record<string, string> = {
  bottom: "translateY(28px)",
  left: "translateX(-28px)",
  right: "translateX(28px)",
  fade: "none",
  clip: "translateY(16px)",
};

// AnimateIn is rendered dozens of times per page. Instead of each instance
// spinning up its OWN IntersectionObserver, they all share a SINGLE module-level
// observer. Each element registers a one-shot reveal callback in a WeakMap; when
// the shared observer reports the element intersecting, it fires that callback
// once and stops watching the element. N reveals therefore cost one observer, not
// N — with byte-for-byte the same threshold / rootMargin, so the reveal geometry
// is identical to the previous per-instance observers.
type RevealCallback = () => void;

let sharedObserver: IntersectionObserver | null = null;
const revealCallbacks = new WeakMap<Element, RevealCallback>();

function getSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = revealCallbacks.get(entry.target);
        if (cb) {
          // Fire once, then stop watching this element (mirrors the original
          // per-instance `observer.disconnect()` after the first intersection).
          revealCallbacks.delete(entry.target);
          sharedObserver!.unobserve(entry.target);
          cb();
        }
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
  );
  return sharedObserver;
}

function observeReveal(el: Element, cb: RevealCallback) {
  revealCallbacks.set(el, cb);
  getSharedObserver().observe(el);
}

function unobserveReveal(el: Element) {
  if (!revealCallbacks.has(el)) return;
  revealCallbacks.delete(el);
  sharedObserver?.unobserve(el);
}

export default function AnimateIn({ children, className = "", delay = 0, from = "bottom" }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Hide/reveal by writing inline styles DIRECTLY on the node — no React state,
  // so a page with dozens of instances doesn't run N synchronous re-renders in
  // the pre-paint commit (which is exactly the work a View-Transition arrival
  // waits on, and read as "stutter"). Mirrors motion/Reveal. SSR renders the
  // element in its natural visible state, so no-JS / reduced-motion visitors
  // always see the content; the pre-paint layout effect re-hides it, so there's
  // no flash.
  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return; // leave visible, no reveal
    // Already on screen when the page arrives: don't hide it only to bring it
    // back — it enters with the page (see @/lib/motion/primeiro-ecra).
    if (jaEstaAVista(el)) return;

    const isClip = from === "clip";
    // Curva e duração vêm da ficha partilhada (@/lib/motion/tokens) — eram aqui
    // um literal e um `0.75s` escritos à mão, iguais aos do Reveal por acaso.
    const easing = `${EASE_OUT} ${delay}ms`;

    // Hide synchronously, before paint.
    if (isClip) {
      el.style.clipPath = "inset(0 0 100% 0)";
      el.style.transform = TRANSFORMS.clip;
      el.style.willChange = "transform, clip-path";
    } else {
      el.style.opacity = "0";
      el.style.transform = TRANSFORMS[from];
      el.style.willChange = "opacity, transform";
    }

    const reveal = () => {
      el.style.transition = isClip
        ? `transform ${REVEAL_S}s ${easing}, clip-path ${REVEAL_S}s ${easing}`
        : `opacity ${REVEAL_S}s ${easing}, transform ${REVEAL_S}s ${easing}`;
      el.style.transform = "none";
      if (isClip) el.style.clipPath = "inset(0 0 0% 0)";
      else el.style.opacity = "1";
      const done = () => {
        el.style.willChange = ""; // drop the compositor hint once settled
        el.removeEventListener("transitionend", done);
      };
      el.addEventListener("transitionend", done);
    };
    observeReveal(el, reveal);
    return () => unobserveReveal(el);
  }, [from, delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
