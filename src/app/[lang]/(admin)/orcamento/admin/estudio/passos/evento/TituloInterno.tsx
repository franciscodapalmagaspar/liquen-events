"use client";

import type { Dispatch, SetStateAction } from "react";
import { buildRef, type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { Field } from "../../../ui";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN } from "../../classes";

/** O título interno da proposta (a `ref`), com o «↺ Automática» quando ela o escreveu. */
export function TituloInterno({
  doc,
  patch,
  refEdited,
  setDoc,
  setRefEdited,
}: {
  doc: StudioDoc;
  patch: (p: Partial<StudioDoc>) => void;
  refEdited: boolean;
  setDoc: (f: (d: StudioDoc) => StudioDoc) => void;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div className="mt-4">
      {refEdited && (
        <div className="mb-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => {
              setRefEdited(false);
              setDoc((d) => ({ ...d, ref: buildRef(d) }));
            }}
            className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
          >
            ↺ Automática
          </button>
        </div>
      )}
      <Field
        label="Título interno (opcional)"
        value={doc.ref ?? ""}
        onChange={(e) => {
          setRefEdited(true);
          patch({ ref: e.target.value });
        }}
        data-campo="ref"
        hint="sobretudo para uso interno; aparece apenas em letra pequena no topo de cada página da proposta."
      />
    </div>
  );
}
