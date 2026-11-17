"use client";

import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * A barra do conjunto: «3 fotografias escolhidas → mover para…».
 *
 * Palavras dela: «Também com seleção múltipla, para mover várias de uma vez.»
 * Arrastar uma a uma resolve o engano de uma foto; quando um board inteiro foi
 * parar ao sítio errado — o que acontece ao colar uma pasta da biblioteca —,
 * são vinte gestos.
 *
 * Só aparece quando há alguma coisa escolhida: uma barra permanentemente ali é
 * uma linha de ruído em todas as outras vezes.
 */
export function BarraDaSeleccao({
  quantas,
  boards,
  onMover,
  onLimpar,
}: {
  quantas: number;
  boards: StudioDoc["moodBoards"];
  onMover: (paraBoard: number) => void;
  onLimpar: () => void;
}) {
  if (quantas === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sage-600/35 bg-sage-600/[0.06] px-3 py-2">
      <p className="text-xs font-medium text-[var(--bo-tinta-72)]">
        {quantas === 1 ? "1 fotografia escolhida" : `${quantas} fotografias escolhidas`}
      </p>
      <label className="flex items-center gap-1.5 text-xs text-[var(--bo-text-muted)]">
        Mover para
        <select
          // Volta sempre a «—» depois de mover: é uma acção, não um estado, e
          // um selector que ficasse a mostrar o último destino leria como se a
          // selecção ainda lá estivesse.
          value=""
          onChange={(e) => {
            const bi = Number(e.target.value);
            if (Number.isInteger(bi)) onMover(bi);
          }}
          className="bo-input w-44 px-2 py-1 text-xs"
          aria-label="Mover as fotografias escolhidas para outro mood board"
        >
          <option value="">—</option>
          {boards.map((b, bi) => (
            <option key={bi} value={bi}>
              {b.title?.trim() || `Mood board ${bi + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onLimpar}
        className={`alvo-toque text-xs font-medium text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
      >
        Limpar
      </button>
    </div>
  );
}
