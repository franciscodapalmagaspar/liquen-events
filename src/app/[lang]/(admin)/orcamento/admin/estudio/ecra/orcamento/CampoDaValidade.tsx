"use client";

import { Field } from "../../../ui";
import {
  diaDoEvento,
  diasDeValidade,
  resolveValidUntil,
  type ProposalDoc,
} from "@/lib/proposal-doc";
import { hojeNoEstudio } from "@/lib/fuso";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { useEstudio } from "../../contexto";

export function CampoDaValidade() {
  const {
    copia: { guardarValidadePadrao },
    documento: { doc, patch },
  } = useEstudio();
  return (
    <Field
      label="Validade (dias)"
      type="number"
      min={1}
      value={doc.validUntilDays ?? ""}
      onChange={(e) => {
        const n = Number.parseInt(e.target.value, 10);
        patch({ validUntilDays: Number.isFinite(n) && n > 0 ? n : undefined });
      }}
      // Os dias que a regra do evento dá (ver `diasDeValidadePeloEvento`):
      // uma proposta para a semana que vem não diz «60».
      placeholder={String(diasDeValidade({ eventDate: doc.eventDate }, hojeNoEstudio()))}
      aria-label="Dias de validade"
      data-campo="validUntilDays"
      // ── O ÚLTIMO CAMPO DO PASSO, LOGO ACIMA DA BARRA FIXA ───────
      // MEDIDO num iPhone SE (375×667), a fechar este campo com o
      // teclado aberto (~260 px): o teclado mais a barra de acção
      // fixa tapavam-lhe uma fatia. O `scroll-margin-bottom` sozinho
      // não resolve — só entra em jogo se ALGUÉM pedir um scroll, e
      // um toque para abrir o teclado não pede nenhum. Por isso o
      // `onFocus`: ao ganhar foco (é aí que o teclado nasce), o
      // campo centra-se a si próprio no que sobra de ecrã — que já
      // é o ecrã COM o teclado, porque o foco só chega depois de o
      // sistema o ter aberto. `scroll-mb-72` (18 px a mais do que os
      // 260 do teclado) é o cinto e as calças: cobre também quem lá
      // chega por um caminho que não é este foco (uma hiperligação
      // com âncora, um leitor de ecrã a saltar directamente).
      onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
      containerClassName="scroll-mb-72"
      hint={
        <span className="flex flex-col items-start gap-0.5">
          {/* A data a que a conta chega — com o evento perto, os
                          dias escritos podem não ser os que saem (ver
                          `diasDeValidade`). Uma data já fixada (proposta que
                          seguiu) tem o seu próprio aviso, mais abaixo. */}
          {!doc.validUntil && (
            <span data-testid="validade-calculada">
              Válida até{" "}
              {resolveValidUntil(doc as ProposalDoc)
                .split("-")
                .reverse()
                .join("/")}
              {diaDoEvento(doc.eventDate)
                ? " — conta com a data do evento."
                : " — sem data do evento, contam 60 dias."}
            </span>
          )}
          {doc.validUntilDays ? (
            <button
              type="button"
              /* `alvo-toque` + `py-2`: media 18 px de altura. Foi o CI
                           a apanhá-lo e não a máquina de quem escreveu — só
                           aparece quando a proposta tem uma validade diferente da
                           preferida, e os dados locais não a tinham. */
              className={`alvo-toque -my-1 py-2 text-[11px] text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
              onClick={() => void guardarValidadePadrao(doc.validUntilDays!)}
            >
              Passar a usar {doc.validUntilDays} dias em todas as propostas novas
            </button>
          ) : null}
        </span>
      }
    />
  );
}
