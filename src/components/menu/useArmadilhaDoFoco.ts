"use client";

import { useEffect, useRef } from "react";

/**
 * O foco de um painel de diálogo aberto (padrão WAI-ARIA): à abertura vai para
 * o PRÓPRIO painel, o `Escape` fecha, e o `Tab` dá a volta lá dentro.
 *
 * ── PORQUE É QUE O FOCO VAI PARA O PAINEL E NÃO PARA O PRIMEIRO LINK ──────
 * Ela, com a fotografia: «aparece este retângulo branco à volta quando eu
 * carrego no menu, quero que tires isso». Era o anel de foco: um foco posto
 * por programa faz o `:focus-visible` casar, e o browser desenhava-o à volta
 * de um link em que ninguém tinha carregado. A correcção não é apagar o anel
 * (é o que guia quem usa teclado): é focar o painel, que é `role="dialog"` com
 * `tabIndex={-1}`. O primeiro `Tab` leva ao primeiro link, e aí o anel
 * aparece para quem o pediu.
 *
 * Dois `requestAnimationFrame`: o clique que abriu o menu ainda segura o foco
 * no botão durante o primeiro fotograma pintado; com um só, o foco voltava ao
 * botão em silêncio.
 */
export function useArmadilhaDoFoco(aberto: boolean, fechar: () => void) {
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const painel = painelRef.current;
    const focaveis = () =>
      Array.from(
        painel?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => painel?.focus());
    });

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab") return;
      const itens = focaveis();
      if (itens.length === 0) return;
      const primeiro = itens[0];
      const ultimo = itens[itens.length - 1];
      // Com o foco no próprio painel, um `Shift+Tab` saía pela porta de trás
      // para o cromado do sítio, por baixo do diálogo: vai para o último.
      if (
        e.shiftKey &&
        (document.activeElement === primeiro || document.activeElement === painel)
      ) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto, fechar]);

  return painelRef;
}
