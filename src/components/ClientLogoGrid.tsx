"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { FILTRO_DA_TINTA, TintaDosLogotipos } from "./TintaDosLogotipos";
import { useImageErrorRef } from "./SafeImage";
import { logoHeight, logoDimsFor, logoSizes } from "@/lib/logo";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

interface Client {
  name: string;
  logo: string;
}

function ClientLogo({ client, index }: { client: Client; index: number }) {
  const [failed, setFailed] = useState(false);
  const refErro = useImageErrorRef(() => setFailed(true));
  // Mesmo peso à vista para todos (ela, 17/10): a altura vem da área E da tinta
  // de cada logótipo (ver logoHeight). Limites largos — 22 a 72 px — porque é
  // a tinta, e não um tecto, que deve igualar o José de Mello e a Deloitte.
  const h = logoHeight(client.logo, 3000, 14, 72);
  const d = logoDimsFor(client.logo);

  return (
    <div
      className="cl-cell relative overflow-hidden h-28 sm:h-32 basis-1/2 sm:basis-1/3 lg:basis-1/4 xl:basis-1/5 flex items-center justify-center px-4 sm:px-5"
      // Diagonal-ish wave: each logo's reveal is offset by its index, so the
      // block resolves in as one staggered sweep (top-left → bottom-right).
      style={{ ["--cl-delay" as string]: `${index * 42}ms` }}
    >
      <div className="cl-reveal relative z-10 flex items-center justify-center w-full">
        {/* O tecto de 68% vive na CAIXA do logótipo e não na imagem: na imagem,
            a caixa ficava com a largura natural e a imagem encolhia lá dentro
            encostada à esquerda — o logótipo saía do centro. */}
        {!failed && client.logo ? (
          <span className="cl-logo max-w-[68%]">
            <Image
              src={client.logo}
              alt={client.name}
              width={d[0]}
              height={d[1]}
              // O `sizes` é POR LOGÓTIPO. O 157px que aqui estava era a largura
              // do logótipo MAIS LARGO da parede; os outros são desenhados a
              // 30–60px (a altura vem da área, ver logoHeight) e recebiam na
              // mesma o ficheiro de 256px. A mesma função serve a fita da
              // página inicial, para os três `<img>` do mesmo cliente nesta
              // página resolverem para um só URL. Ver a nota em src/lib/logo.ts.
              sizes={logoSizes(client.logo)}
              // Flat black silhouette (brightness-0) — encoder quality is
              // imperceptible, so 50 trims the bytes of ~20 logos on /clientes.
              quality={50}
              className="cl-black object-contain w-auto max-w-full"
              style={{ height: `${h}px`, filter: FILTRO_DA_TINTA }}
              // O erro é ouvido pela `ref` e NÃO pelo `onError` do next/image.
              // Passar `onError` faz o next/image reatribuir `img.src = img.src` na
              // montagem (image-component.js:140) para ressuscitar um erro anterior à
              // hidratação; quando a hidratação apanha a imagem ainda a descarregar,
              // isso ABORTA o pedido em voo e manda outro. Medido em /clientes: os 18
              // logótipos pedidos duas vezes em 3 de 8 corridas, +163 KB. O
              // `useImageErrorRef` cobre o mesmo caso lendo o estado do elemento.
              ref={refErro}
            />
          </span>
        ) : (
          <span className="text-foreground text-[10px] sm:text-[11px] font-medium tracking-[0.15em] uppercase text-center leading-snug">
            {client.name}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Sem quadrados: as células não têm traços (ela, 17/10, «tira os quadrados à
 * volta dos logos»). Os logótipos ficam soltos sobre o fundo da página. As
 * colunas são as mesmas de antes (2/3/4/5), mas em `flex-wrap` centrado: sem
 * traços a desenhar a grelha, uma última fila incompleta encostada à esquerda
 * parecia um engano — assim fica ao centro.
 *
 * Entrance animation: one IntersectionObserver on the grid (fire once, then
 * disconnect — no scroll listeners, no per-frame JS) adds `.cl-in`; the CSS in
 * globals.css does the staggered blur-to-sharp rise. `.cl-armed` is only added
 * once JS runs, so no-JS visitors — and reduced-motion users — see the logos in
 * their final, fully-legible state. All motion is gated in globals.css.
 */
export default function ClientLogoGrid({ clients }: { clients: Client[] }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // Respect reduced-motion and no-IO environments: leave the grid unarmed,
    // i.e. permanently visible with no reveal.
    if (prefersReducedMotion()) return;
    if (!("IntersectionObserver" in window)) return;

    el.classList.add("cl-armed"); // hide (synchronously, before paint) to reveal
    // Once each logo's staggered reveal finishes, drop its compositor hint so the
    // wall doesn't leave ~20 promoted layers pinned for the rest of the page's
    // life (mirrors the .g-reveal / Reveal.tsx transitionend cleanup). The armed
    // "from" state in globals.css sets will-change; here we clear it per cell.
    const onRevealEnd = (e: TransitionEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.classList.contains("cl-reveal")) target.style.willChange = "auto";
    };
    el.addEventListener("transitionend", onRevealEnd);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("cl-in");
          observer.disconnect(); // fire once
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      el.removeEventListener("transitionend", onRevealEnd);
    };
  }, []);

  return (
    <div ref={gridRef} className="flex flex-wrap justify-center">
      <TintaDosLogotipos />
      {clients.map((client, i) => (
        <ClientLogo key={client.name} client={client} index={i} />
      ))}
    </div>
  );
}
