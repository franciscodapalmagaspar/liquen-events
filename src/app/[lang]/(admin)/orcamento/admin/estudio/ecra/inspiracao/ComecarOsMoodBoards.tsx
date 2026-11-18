"use client";

import { PORTA_DE_COMECO } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import ModelosParciais from "../../../ModelosParciais";
import { type MoodBoard } from "@/lib/proposal-doc";
import { aquecerBiblioteca } from "../../../theme-picker-cache";
import { useEstudio } from "../../contexto";

export function ComecarOsMoodBoards() {
  const {
    avisos: { toast },
    documento: { doc },
    escolha: { setPicker },
    moodBoards: { addBoard, inserirMoodBoardDeModelo },
  } = useEstudio();
  return (
    <div className="@container mt-2 rounded-2xl border border-dashed border-[var(--bo-hairline-strong)] px-5 py-8 text-center">
      <p className="text-sm font-medium text-[var(--bo-text)]">
        Ainda não há inspiração nesta proposta
      </p>
      <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--bo-text-muted)]">
        Cada mood board é uma página do PDF com um título (por exemplo «Cerimónia») e as fotografias
        que mostram a ideia ao casal.
      </p>
      {/* ── TRÊS PORTAS (Fase 3, 10/11) ───────────────────
                          As três maneiras de começar, do mesmo tamanho e lado
                          a lado: em branco, de um modelo guardado, ou de um
                          tema da biblioteca. Antes era um botão e um «De um
                          modelo…» solto lá em baixo, e a biblioteca só aparecia
                          DEPOIS de haver uma página. */}
      <div className="mx-auto mt-5 grid max-w-2xl grid-cols-1 gap-3 text-left @min-[34rem]:grid-cols-3">
        <button
          type="button"
          className={`${PORTA_DE_COMECO} ${ESTADO} ${PRESSAO}`}
          onClick={addBoard}
        >
          <span className="block text-sm font-medium text-[var(--bo-text)]">
            Mood board em branco
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--bo-text-muted)]">
            Uma página nova: escreves o título e pões as fotografias.
          </span>
        </button>
        <ModelosParciais
          tipo="moodboard"
          mostrar="inserir"
          toast={toast}
          className="block"
          porta={{
            titulo: "Começar de um modelo",
            texto: "Um mood board que já guardaste, com as fotos e o texto.",
            className: PORTA_DE_COMECO,
          }}
          onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
        />
        <button
          type="button"
          className={`${PORTA_DE_COMECO} ${ESTADO} ${PRESSAO}`}
          onClick={() => {
            const bi = doc.moodBoards.length;
            addBoard();
            setPicker({ kind: "board", bi });
          }}
          onPointerEnter={aquecerBiblioteca}
          onFocus={aquecerBiblioteca}
          onTouchStart={aquecerBiblioteca}
        >
          <span className="block text-sm font-medium text-[var(--bo-text)]">
            Da biblioteca de temas
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--bo-text-muted)]">
            Escolhes as fotografias de um tema e a página nasce com elas.
          </span>
        </button>
      </div>
    </div>
  );
}
