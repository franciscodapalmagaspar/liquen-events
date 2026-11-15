"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode, Ref, RefObject } from "react";
import { createPortal } from "react-dom";
import type { Impedimento } from "@/lib/proposal-progress";
import { FolhaOuDialogo } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DO ENVIO, NO TELEMÓVEL: UMA LINHA, E O RESTO A UM TOQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (14/10), com a captura do «Rever e enviar» num iPhone: «esta
 * aba de enviar ao cliente no telemóvel tapa tudo… transforma isto em algo
 * inteligente que se adapte».
 *
 * A barra levava seis coisas — voltar, a língua, o descarregar, o «Vai para»,
 * a caixa vermelha do que falta e o enviar — e no telemóvel isso é meio ecrã
 * colado por cima do trabalho. Nada daquilo está a mais; está tudo ao mesmo
 * tempo. Fica, na barra, o que decide o gesto seguinte: voltar, o ESTADO numa
 * pastilha, e enviar. A pastilha abre uma folha com o resto, inteiro e pela
 * mesma ordem.
 *
 * ── E O ECRÃ LARGO TAMBÉM (14/10, «melhora isto drasticamente») ──────────
 *
 * Ela mandou a captura da barra no computador: um cartão de três andares, com
 * a frase do inglês, «Vai para…», a caixa vermelha do que falta e o canal por
 * baixo de tudo. Escolheu «uma linha só»: ←, a MESMA pastilha do estado, a
 * língua, o canal só com os logótipos, o PDF e o botão. O que a caixa vermelha
 * dizia passa a abrir-se da pastilha, num painel por cima dela
 * ({@link PainelDoEnvio}) — no telemóvel continua a ser a folha.
 */

/**
 * Onde vivem a língua e o descarregar: ao lado do botão no ecrã largo, numa
 * folha no telemóvel — com o «Vai para» e a lista do que falta por cima
 * (`antes`), que na barra compacta deixam de caber.
 */
export function ControlosDoEnvio({
  compacta,
  aberta,
  onFechar,
  antes,
  children,
}: {
  compacta: boolean;
  aberta: boolean;
  onFechar: () => void;
  antes: ReactNode;
  children: ReactNode;
}) {
  if (!compacta) {
    return (
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        {children}
      </div>
    );
  }
  /**
   * ── A FOLHA NASCE FORA DA BARRA ─────────────────────────────────────────
   * MEDIDO a 390 px: desenhada aqui dentro, a folha abria POR TRÁS da cápsula
   * dos destinos. A barra é `sticky` com `z-20` e `backdrop-filter` — e o
   * `backdrop-filter` faz dela o bloco de contenção de tudo o que é `fixed`
   * lá dentro, e o `z-20` o tecto do empilhamento. A folha vai para o `body`,
   * que é onde as outras folhas desta casa vivem.
   */
  if (typeof document === "undefined") return null;
  return createPortal(
    <FolhaOuDialogo
      aberto={aberta}
      onFechar={onFechar}
      titulo="Antes de enviar"
      descricao="Para onde vai, o que falta, a língua e o PDF."
      largura="sm"
    >
      <div className="flex flex-col gap-4">
        {antes}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">{children}</div>
      </div>
    </FolhaOuDialogo>,
    document.body,
  );
}

/** O que a pastilha diz. Puro, para se poder provar sem desenhar nada. */
export function estadoDoEnvio(
  faltas: readonly Impedimento[],
  fotosPorConfirmar: number,
  idioma: string,
): { texto: string; trava: boolean } {
  if (fotosPorConfirmar > 0) return { texto: "Fotos a entrar", trava: true };
  const travam = faltas.filter((f) => f.trava);
  // Só falta ver o PDF: a pastilha diz «Falta 1» como em qualquer outra falta
  // única. Dizia «Ver o PDF ›», ao lado do botão «Ver o PDF ↓» — dois nomes
  // quase iguais para duas coisas diferentes (abrir a lista; descarregar o PDF),
  // auditoria de 14/11, n.º 13. A acção é o botão; a pastilha é o estado.
  if (travam.length === 1) return { texto: "Falta 1", trava: true };
  if (travam.length > 1) return { texto: `Faltam ${travam.length}`, trava: true };
  return { texto: `${idioma.toUpperCase()} · pronto`, trava: false };
}

/**
 * A pastilha do meio: diz o estado do envio e abre a folha. Vermelha enquanto
 * alguma coisa trava, neutra quando está pronto — e é então a língua que diz,
 * que é a última coisa que se pode querer confirmar antes de enviar.
 */
export function PastilhaDoEnvio({
  faltas,
  fotosPorConfirmar,
  idioma,
  onAbrir,
  aberta,
  ref,
}: {
  faltas: readonly Impedimento[];
  fotosPorConfirmar: number;
  idioma: string;
  onAbrir: () => void;
  /** No ecrã largo: o painel está aberto. */
  aberta?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const { texto, trava } = estadoDoEnvio(faltas, fotosPorConfirmar, idioma);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      aria-expanded={aberta}
      aria-label={`Antes de enviar: ${texto}`}
      className={`alvo-toque mr-auto inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium ${ESTADO} ${PRESSAO} ${
        trava
          ? "border-[var(--bo-perigo)]/30 bg-[var(--bo-perigo)]/[0.06] text-[var(--bo-perigo)]"
          : "border-[var(--bo-hairline-strong)] text-[var(--bo-text)]"
      }`}
    >
      {texto}
      <span aria-hidden="true">›</span>
    </button>
  );
}

/**
 * ── O PAINEL DA PASTILHA, NO ECRÃ LARGO ─────────────────────────────────────
 *
 * O que a caixa vermelha da barra dizia — para onde vai, o que falta (cada
 * falta salta para onde se resolve), e o que o inglês muda — abre-se aqui, por
 * cima da pastilha. Nasce no `body` (a barra tem `backdrop-filter`, que faria
 * dela o bloco de contenção de um `fixed` cá dentro — ver a nota da folha) e
 * é OPACO: a barra já é a camada de vidro deste ecrã, e vidro sobre vidro
 * transforma o fundo em papa (`docs/LIQUID-GLASS.md`, Parte 5).
 *
 * Fecha-se com o Escape, com um clique fora, ou quando uma falta leva a outro
 * sítio; o foco volta à pastilha.
 */
export function PainelDoEnvio({
  aberto,
  onFechar,
  ancora,
  children,
}: {
  aberto: boolean;
  onFechar: () => void;
  ancora: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [sitio, setSitio] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!aberto) return;
    const medir = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const largura = Math.min(416, window.innerWidth - 32);
      const esquerda = Math.max(16, Math.min(r.left, window.innerWidth - largura - 16));
      setSitio({ left: esquerda, bottom: window.innerHeight - r.top + 8, width: largura });
    };
    medir();
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, { passive: true, capture: true });
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, { capture: true });
    };
  }, [aberto, ancora]);

  useEffect(() => {
    if (!aberto) return;
    painel.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFechar();
      ancora.current?.focus();
    };
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node;
      if (painel.current?.contains(alvo) || ancora.current?.contains(alvo)) return;
      onFechar();
    };
    document.addEventListener("keydown", tecla, true);
    document.addEventListener("pointerdown", fora);
    return () => {
      document.removeEventListener("keydown", tecla, true);
      document.removeEventListener("pointerdown", fora);
    };
  }, [aberto, onFechar, ancora]);

  if (!aberto || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={painel}
      role="dialog"
      aria-label="Antes de enviar"
      tabIndex={-1}
      className="bo-entrada bo-material fixed z-[60] flex flex-col gap-3 p-3 shadow-[var(--bo-sombra-suspensa)] focus:outline-none"
      style={
        {
          ...(sitio ?? { visibility: "hidden" }),
          "--bo-material": "var(--bo-elevado)",
        } as CSSProperties
      }
    >
      {children}
    </div>,
    document.body,
  );
}
