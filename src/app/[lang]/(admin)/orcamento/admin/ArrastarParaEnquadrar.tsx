"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ARRASTAR A FOTOGRAFIA PARA A ENQUADRAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com a capa do PDF à frente: «não ficou com o carro. Eu quero
 * que o sistema fique inteligente para saber identificar isto». O PDF escolhe
 * sozinho (a «atenção» do sharp) e nenhum sistema acerta sempre no que importa
 * numa fotografia — por isso a caixa mostra a escolha do PDF e deixa-a
 * arrastar a fotografia até o que interessa ficar à vista. O que ela larga é o
 * que sai.
 *
 * ── O QUE SE GUARDA ───────────────────────────────────────────────────────
 * Um `{ x, y }` em fracções, que é o `object-position` do CSS: o mesmo número
 * desenha a caixa aqui e recorta a fotografia no PDF (`recortarComFoco`). Só
 * mexe o eixo que sobra — uma fotografia ao alto numa caixa deitada só sobe e
 * desce.
 *
 * ── NO TELEMÓVEL, SÓ DEPOIS DE PEDIR ──────────────────────────────────────
 * Arrastar com o dedo em cima de uma fotografia é o gesto de rolar a página.
 * Com o rato arrasta-se logo; com o dedo, carrega-se primeiro em «Enquadrar» —
 * senão a capa prendia o polegar de quem só queria descer.
 */

export interface Foco {
  x: number;
  y: number;
}

const entre0e1 = (v: number) => Math.min(1, Math.max(0, v));

export function ArrastarParaEnquadrar({
  aspeto,
  aspetoDaCaixa,
  foco,
  activo,
  onFoco,
  children,
  nome = "da capa",
}: {
  /** De quê, para o leitor de ecrã («da capa», «do lugar 3 de Paleta»). */
  nome?: string;
  /** Largura ÷ altura da fotografia. Sem ela não se sabe quanto sobra. */
  aspeto?: number;
  /** Largura ÷ altura da caixa (a folha deitada da capa). */
  aspetoDaCaixa: number;
  foco: Foco;
  /** Falso quando a fotografia não vai para o PDF — aí não há o que enquadrar. */
  activo: boolean;
  onFoco: (f: Foco) => void;
  /** Desenha a fotografia com este `object-position`. */
  children: (posicao: string) => ReactNode;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const [aMexer, setAMexer] = useState<Foco | null>(null);
  const [modoDedo, setModoDedo] = useState(false);
  const inicio = useRef<{ px: number; py: number; foco: Foco; ox: number; oy: number } | null>(
    null,
  );

  /** Quantos píxeis sobram em cada eixo, na caixa como está desenhada. */
  function sobra(): { ox: number; oy: number } {
    const r = caixa.current?.getBoundingClientRect();
    if (!r || !aspeto || !(r.width > 0) || !(r.height > 0)) return { ox: 0, oy: 0 };
    return aspeto < aspetoDaCaixa
      ? { ox: 0, oy: r.width / aspeto - r.height }
      : { ox: r.height * aspeto - r.width, oy: 0 };
  }
  const podeMexer = activo && !!aspeto && Math.abs(aspeto - aspetoDaCaixa) > 0.02;

  function aoCarregar(e: PointerEvent<HTMLDivElement>) {
    if (!podeMexer) return;
    if (e.pointerType !== "mouse" && !modoDedo) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    inicio.current = { px: e.clientX, py: e.clientY, foco, ...sobra() };
    setAMexer(foco);
  }
  function aoMexer(e: PointerEvent<HTMLDivElement>) {
    const i = inicio.current;
    if (!i) return;
    setAMexer({
      // Arrastar a fotografia para baixo mostra o que está EM CIMA: o foco
      // anda ao contrário do dedo.
      x: i.ox > 0 ? entre0e1(i.foco.x - (e.clientX - i.px) / i.ox) : i.foco.x,
      y: i.oy > 0 ? entre0e1(i.foco.y - (e.clientY - i.py) / i.oy) : i.foco.y,
    });
  }
  function aoLargar() {
    if (inicio.current && aMexer) onFoco(aMexer);
    inicio.current = null;
    setAMexer(null);
  }
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    if (!podeMexer) return;
    const passo = 0.05;
    const mexe: Record<string, Foco> = {
      ArrowUp: { x: foco.x, y: entre0e1(foco.y - passo) },
      ArrowDown: { x: foco.x, y: entre0e1(foco.y + passo) },
      ArrowLeft: { x: entre0e1(foco.x - passo), y: foco.y },
      ArrowRight: { x: entre0e1(foco.x + passo), y: foco.y },
    };
    const novo = mexe[e.key];
    if (!novo) return;
    e.preventDefault();
    onFoco(novo);
  }

  const visto = aMexer ?? foco;
  const posicao = `${(visto.x * 100).toFixed(1)}% ${(visto.y * 100).toFixed(1)}%`;
  const eixo = aspeto && aspeto < aspetoDaCaixa ? "para cima e para baixo" : "para os lados";

  return (
    <div>
      <div
        ref={caixa}
        onPointerDown={aoCarregar}
        onPointerMove={aoMexer}
        onPointerUp={aoLargar}
        onPointerCancel={aoLargar}
        onKeyDown={aoTeclar}
        tabIndex={podeMexer ? 0 : undefined}
        role={podeMexer ? "group" : undefined}
        aria-label={
          podeMexer
            ? `Enquadramento ${nome}. Arrasta a fotografia ${eixo}, ou usa as setas.`
            : undefined
        }
        className={`relative rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage-600 ${
          podeMexer ? (aMexer ? "cursor-grabbing" : "cursor-grab") : ""
        } ${podeMexer && modoDedo ? "touch-none" : ""}`}
      >
        {children(posicao)}
      </div>
      {podeMexer && (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-caption text-[var(--bo-text-muted)]">
          <span className="max-sm:hidden">
            É este o recorte que vai para o PDF. Arrasta a fotografia {eixo} para a enquadrar.
          </span>
          <span className="sm:hidden">É este o recorte que vai para o PDF.</span>
          <button
            type="button"
            onClick={() => setModoDedo((v) => !v)}
            aria-pressed={modoDedo}
            className={`alvo-toque relative font-medium text-sage-600 underline underline-offset-2 sm:hidden ${ESTADO} ${PRESSAO}`}
          >
            {modoDedo ? "Pronto" : "Enquadrar"}
          </button>
        </p>
      )}
    </div>
  );
}
