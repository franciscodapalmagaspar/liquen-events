"use client";

import type { Dispatch, SetStateAction } from "react";
import { aquecerBiblioteca } from "../../../theme-picker-cache";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN } from "../../classes";
import { UploadArea } from "../../fotos/UploadArea";
import type { DestinoDaFoto } from "../../tipos";

/** A capa ainda sem fotografia: carregar uma, ou ir buscá-la à biblioteca de temas. */
export function CapaPorEscolher({
  idx,
  progresso,
  aoCarregar,
  setPicker,
}: {
  idx: number;
  progresso: { feito: number; total: number } | undefined;
  aoCarregar: (files: File[]) => void;
  setPicker: Dispatch<SetStateAction<DestinoDaFoto | null>>;
}) {
  return (
    <div className="max-w-md">
      <UploadArea
        label="Fotografia da capa"
        progresso={progresso}
        multiple={false}
        curto
        onFiles={aoCarregar}
      />
      <button
        type="button"
        className={`${ADD_BTN} mt-1.5 ${ESTADO} ${PRESSAO}`}
        onClick={() => setPicker({ kind: "cover", idx })}
        // Ao passar o rato já se vai buscar o que o diálogo
        // precisa. `focus` para o teclado, `touchstart` para o
        // telemóvel, onde não há hover nenhum.
        onPointerEnter={aquecerBiblioteca}
        onFocus={aquecerBiblioteca}
        onTouchStart={aquecerBiblioteca}
      >
        Da biblioteca de temas
      </button>
      <p className="mt-2 text-caption text-[var(--bo-text-muted)]">
        Uma fotografia deitada, a cobrir a primeira página e a última.
      </p>
    </div>
  );
}
