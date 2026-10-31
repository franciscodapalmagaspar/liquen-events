"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useGSAP } from "@gsap/react";
import { PHOTO_REVEAL_FULL_S, REVEAL_S, STAGGER_S } from "./tokens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GSAP DO SÍTIO — os mesmos tempos e as mesmas curvas do resto
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido «nível estúdio» (30/10) autoriza o `gsap`, o `@gsap/react` e o
 * `lenis` para a camada de movimento (o B7 do `docs/PADRAO-PALUMEN.md`). Os
 * tokens do B7.2 NÃO são uma segunda família: a Parte −1 do DESIGN-SYSTEM manda
 * convergir com a que já existe. Por isso:
 *
 *   · `ease.out` é o `expo.out` do GSAP — a MESMA curva que o `--ease-out`
 *     (cubic-bezier(0.16, 1, 0.3, 1) é o easeOutExpo, ponto por ponto);
 *   · `ease.inOut` é o `power1.inOut`, o mais perto do `--ease-in-out`
 *     (0.42, 0, 0.58, 1);
 *   · as durações e o intervalo entre linhas vêm de `tokens.ts`.
 *
 * Só se importa daqui no cliente, e só nos componentes de movimento: o GSAP
 * não entra no primeiro ecrã (ver `RevealText`, que o pede por `import()`).
 */

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export const ease = {
  out: "expo.out",
  inOut: "power1.inOut",
} as const;

export const dur = {
  /** Um bloco que entra (o mesmo do `Reveal`/`AnimateIn`). */
  reveal: REVEAL_S,
  /** Uma fotografia grande que se abre (o mesmo do `PHOTO_REVEAL_FULL_S`). */
  foto: PHOTO_REVEAL_FULL_S,
} as const;

export const stagger = { linhas: STAGGER_S } as const;

export { gsap, ScrollTrigger, SplitText, useGSAP };
