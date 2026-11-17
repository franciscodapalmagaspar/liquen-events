"use client";

import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { chaveDoCampo } from "@/lib/proposal-ortografia";
import { MoveBtns } from "../../../ServicesEditor";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN, INPUT_SM, REMOVE_BTN } from "../../classes";
import { Section } from "../../formulario/Section";
import type { Step } from "../../tipos";

interface PropsSeccaoDoCronograma {
  addPhase: () => void;
  addPhaseItem: (pi: number) => void;
  doc: StudioDoc;
  movePhase: (pi: number, dir: -1 | 1) => void;
  notaDaSeccao: (chave: string, titulo: string) => React.JSX.Element;
  perguntaDeRemocao: (chave: string, rotulo: string) => React.JSX.Element | null;
  removePhase: (pi: number) => void;
  removePhaseItem: (pi: number, ii: number) => void;
  step: Step;
  updatePhase: (pi: number, p: Partial<{ title: string; items: string[] }>) => void;
  updatePhaseItem: (pi: number, ii: number, value: string) => void;
}

/**
 * O «Cronograma de Organização» do passo 3 (só nas propostas de organização):
 * as fases e as tarefas de cada uma. Saiu do `ProposalStudio` tal e qual (fase 4
 * de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function SeccaoDoCronograma({
  addPhase,
  addPhaseItem,
  doc,
  movePhase,
  notaDaSeccao,
  perguntaDeRemocao,
  removePhase,
  removePhaseItem,
  step,
  updatePhase,
  updatePhaseItem,
}: PropsSeccaoDoCronograma) {
  return (
    <Section
      title="Cronograma de Organização"
      id="cronograma"
      escondida={step !== "inspiracao"}
      rodape={notaDaSeccao("cronograma", "Nota sobre o cronograma")}
    >
      <div className="flex flex-col gap-3">
        {(doc.cronograma ?? []).map((ph, pi) => (
          <div
            key={pi}
            className="rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-4"
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input
                className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
                value={ph.title}
                onChange={(e) => updatePhase(pi, { title: e.target.value })}
                placeholder="6-12 meses antes do casamento"
                aria-label="Título da fase"
                /* O salto das gralhas encontra o campo por aqui. Ver
                 `chaveDoCampo` — o cronograma entrou na varredura
                 depois de se medir que era texto dela a sair
                 publicado sem passar por corrector nenhum. */
                data-campo={chaveDoCampo({ tipo: "cronogramaTitulo", pi })}
              />
              <MoveBtns
                onUp={() => movePhase(pi, -1)}
                onDown={() => movePhase(pi, 1)}
                disUp={pi === 0}
                disDown={pi === (doc.cronograma?.length ?? 0) - 1}
              />
              <button
                type="button"
                className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                onClick={() => removePhase(pi)}
                aria-label="Remover fase"
              >
                ×
              </button>
            </div>
            {/* Entre o título da fase e a lista de tarefas: a frase
              conta-as, e elas estão logo por baixo. Ver `aRemover`. */}
            {perguntaDeRemocao(`fase:${pi}`, "Remover a fase")}
            <div className="flex flex-col gap-2 pl-1">
              {ph.items.map((it, ii) => (
                <div key={ii} className="flex items-center gap-2">
                  <input
                    className={INPUT_SM}
                    value={it}
                    onChange={(e) => updatePhaseItem(pi, ii, e.target.value)}
                    placeholder="Definição do conceito"
                    aria-label="Tarefa"
                    data-campo={chaveDoCampo({ tipo: "cronogramaItem", pi, ii })}
                  />
                  <button
                    type="button"
                    className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                    onClick={() => removePhaseItem(pi, ii)}
                    aria-label="Remover tarefa"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                onClick={() => addPhaseItem(pi)}
              >
                + Adicionar tarefa
              </button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className={`${ADD_BTN} mt-3 ${ESTADO} ${PRESSAO}`} onClick={addPhase}>
        + Adicionar fase
      </button>
    </Section>
  );
}
