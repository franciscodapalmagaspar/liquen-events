import { type Dispatch, type RefObject, type SetStateAction } from "react";
import type { ThemeImage } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SELECÇÃO DE FOTOS NA PASTA — clique, Shift, Cmd e teclado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Marcar e desmarcar fotos (uma, um intervalo, todas), limpar a selecção e
 * estendê-la com o teclado.
 *
 * Saiu do corpo do `ThemeFolder`, no `Temas.tsx` (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasSeleccaoDaPasta {
  images: ThemeImage[];
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  anchor: RefObject<number | null>;
}

export function useSeleccaoDaPasta({ images, setSelected, anchor }: EntradasSeleccaoDaPasta) {
  /**
   * ── OS TRÊS GESTOS DE SELECÇÃO ─────────────────────────────────────────
   *
   * «Suportar seleção; ⌘A; Shift+clique para intervalo; ⌘+clique para
   * adicionar.» [APPLE, Collections + Focus and selection] — ponto 7 da
   * auditoria do `docs/APPLE-TEMAS.md`.
   *
   * ── E PORQUE É QUE O CLIQUE SIMPLES NÃO SUBSTITUI A SELECÇÃO ───────────
   *
   * Num Finder, clicar numa foto desmarca as outras e o ⌘ é que acrescenta.
   * Aqui a célula é um `role="checkbox"` com `aria-checked` — e num checkbox o
   * clique ALTERNA, é o que o nome promete a quem ouve o ecrã e é o único
   * gesto que existe num telemóvel, onde não há ⌘ nenhum. Trocar isso partia
   * a semântica e obrigava a escolher quarenta fotos com uma tecla que metade
   * dos dispositivos não tem.
   *
   * O que o ⌘ faz aqui, então, é uma coisa que o clique não fazia: GANHA ao
   * Shift. Com os dois carregados, o Finder acrescenta um item ao intervalo em
   * vez de o refazer — e é exactamente isso que se ganha em poder escolher a
   * quadragésima primeira foto sem perder o intervalo de quarenta que estava
   * feito.
   */
  function toggleAt(index: number, mods: { shift: boolean; somar: boolean }) {
    // A âncora é lida AGORA e só depois movida: o React corre o `setSelected`
    // preguiçosamente, já na renderização, e lá dentro `anchor.current` já
    // valeria `index` — o Shift+clique passava a ser um clique normal.
    const from = anchor.current;
    anchor.current = index;
    const extend = mods.shift && !mods.somar;
    setSelected((prev) => {
      const next = new Set(prev);
      if (extend && from !== null && from !== index) {
        // Shift+clique estende a partir da última foto tocada, e o sentido
        // (marcar ou desmarcar) é o que a foto clicada vai passar a ser — é o
        // que qualquer gestor de ficheiros faz.
        const target = images[index];
        const turnOn = target ? !prev.has(target.path) : true;
        for (let i = Math.min(from, index); i <= Math.max(from, index); i++) {
          const p = images[i]?.path;
          if (!p) continue;
          if (turnOn) next.add(p);
          else next.delete(p);
        }
      } else {
        const p = images[index]?.path;
        if (p) {
          if (next.has(p)) next.delete(p);
          else next.add(p);
        }
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    anchor.current = null;
  }

  /**
   * `Shift` + setas: a selecção estende-se de `de` até `para`, como no Finder.
   * Voltar para trás por cima do que já estava escolhido encolhe — tira a foto
   * de onde se sai, e a de destino fica.
   */
  function estenderPeloTeclado(de: number, para: number) {
    anchor.current = para;
    setSelected((prev) => {
      const caminho: string[] = [];
      for (let k = Math.min(de, para); k <= Math.max(de, para); k++) {
        const p = images[k]?.path;
        if (p) caminho.push(p);
      }
      const destino = images[para]?.path;
      const next = new Set(prev);
      if (caminho.every((p) => prev.has(p))) {
        for (const p of caminho) if (p !== destino) next.delete(p);
      } else {
        for (const p of caminho) next.add(p);
      }
      return next;
    });
  }
  return { clearSelection, toggleAt, estenderPeloTeclado };
}
