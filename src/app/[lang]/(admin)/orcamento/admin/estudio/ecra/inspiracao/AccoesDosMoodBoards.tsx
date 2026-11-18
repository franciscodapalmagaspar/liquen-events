"use client";

import { ADD_BTN } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import ModelosParciais from "../../../ModelosParciais";
import { type MoodBoard } from "@/lib/proposal-doc";
import { EmCurso } from "../../../ui";
import { esperaDaCopiaDeFotos } from "@/lib/orcamento/estudio/esperas";
import { useEstudio } from "../../contexto";

export function AccoesDosMoodBoards() {
  const {
    avisos: { toast },
    carregamento: { fotosACopiar },
    dobras: { dobrarTodos },
    documento: { doc },
    moodBoards: { addBoard, inserirMoodBoardDeModelo },
  } = useEstudio();
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4">
      {doc.moodBoards.length > 0 && (
        <button type="button" className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`} onClick={addBoard}>
          + Adicionar mood board
        </button>
      )}
      {/* Fechar tudo é o gesto de quem acabou uma proposta e quer ver
                    a forma dela; abrir tudo, o de quem vai rever. Dois botões e
                    não um interruptor: o estado de cada board é seu, e um
                    interruptor teria de mentir sobre o conjunto. */}
      {doc.moodBoards.length > 1 && (
        <>
          <button
            type="button"
            className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
            onClick={() => dobrarTodos(true)}
          >
            Fechar todos
          </button>
          <button
            type="button"
            className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
            onClick={() => dobrarTodos(false)}
          >
            Abrir todos
          </button>
        </>
      )}
      {/* Sem mood boards, o «De um modelo…» é uma das três
                        portas lá em cima — não se repete aqui. */}
      {doc.moodBoards.length > 0 && (
        <ModelosParciais
          tipo="moodboard"
          mostrar="inserir"
          toast={toast}
          onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
        />
      )}
      {/* ── AS FOTOS DO MODELO A CHEGAR ────────────────────
                        Ao lado do botão que as pediu, e não em cima do bloco:
                        o bloco já está na lista com as fotografias à vista (é
                        o caminho de origem que ainda lá está), e uma caixa
                        entre os cartões empurrava a grelha para baixo a meio
                        do gesto seguinte. Sai sozinha quando a cópia acaba. */}
      {fotosACopiar > 0 && (
        <EmCurso
          className="max-w-xs"
          titulo={
            fotosACopiar === 1
              ? "A copiar 1 foto do modelo…"
              : `A copiar ${fotosACopiar} fotos do modelo…`
          }
          estimadoMs={esperaDaCopiaDeFotos(fotosACopiar)}
          nota="O bloco já está na proposta; as fotografias estão a passar para a pasta deste pedido."
          notaDemorada="A cópia está a demorar. O bloco fica na proposta de qualquer maneira."
        />
      )}
    </div>
  );
}
