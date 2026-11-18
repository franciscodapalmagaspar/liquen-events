"use client";

import type { MoodBoard } from "@/lib/proposal-doc";
import { ADD_BTN } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { aquecerBiblioteca } from "../../../theme-picker-cache";
import ModelosParciais from "../../../ModelosParciais";
import { useEstudio } from "../../contexto";

export function AccoesDasFotosDoBoard({
  b,
  bi,
  fechado,
}: {
  b: MoodBoard;
  bi: number;
  fechado: boolean;
}) {
  const {
    avisos: { toast },
    escolha: { setPicker },
  } = useEstudio();
  return (
    <div className="mt-2 flex flex-wrap items-center gap-4">
      <button
        type="button"
        className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
        onClick={() => setPicker({ kind: "board", bi })}
        disabled={fechado}
        onPointerEnter={aquecerBiblioteca}
        onFocus={aquecerBiblioteca}
        onTouchStart={aquecerBiblioteca}
      >
        Escolher da biblioteca de temas
      </button>
      {/* GUARDAR ESTE, e não «o primeiro com título».
                          O controlo era único para a secção inteira e recebia
                          `doc.moodBoards.find(…)` — portanto guardava sempre o
                          PRIMEIRO mood board com título. Ela montava o
                          terceiro, carregava em «Guardar como modelo», e
                          guardava o primeiro; para o terceiro não havia
                          maneira nenhuma. Agora o botão vive ao lado do bloco
                          a que se refere, que é a única forma de a pergunta
                          "qual deles?" não ter de ser respondida por adivinha. */}
      {(b.title ?? "").trim() && (
        <ModelosParciais
          tipo="moodboard"
          mostrar="guardar"
          toast={toast}
          paraGuardar={b}
          nomeSugerido={b.title}
        />
      )}
    </div>
  );
}
