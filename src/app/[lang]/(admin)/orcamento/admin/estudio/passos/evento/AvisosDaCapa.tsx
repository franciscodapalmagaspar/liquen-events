"use client";

import type { Dispatch, SetStateAction } from "react";
import type { StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { LADO_MINIMO_DA_CAPA, type ProblemaDaCapa } from "@/lib/pdf-editorial/regra-da-capa";
import { aquecerBiblioteca } from "../../../theme-picker-cache";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import type { DestinoDaFoto } from "../../tipos";

/**
 * Por baixo da capa: o que vai para o PDF quando ela não serve para a folha
 * («usa esta na mesma», ou a melhor deitada dos temas). Ver `estadoDaCapa`.
 */
export function AvisosDaCapa({
  idx,
  mesmoAssim,
  naoVai,
  problema,
  patch,
  setPicker,
  tamanhoDaCapa,
}: {
  idx: number;
  mesmoAssim: boolean;
  naoVai: boolean;
  problema: ProblemaDaCapa | null;
  patch: (p: Partial<StudioDoc>) => void;
  setPicker: Dispatch<SetStateAction<DestinoDaFoto | null>>;
  tamanhoDaCapa: { w: number; h: number } | null;
}) {
  return (
    <>
      {mesmoAssim && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
        >
          <span>
            {problema === "ao-alto"
              ? "Vai para a capa recortada para ficar deitada, como aqui. "
              : "Vai para a capa, e numa página inteira pode ver-se o grão. "}
            <button
              type="button"
              className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              onClick={() => patch({ capaMesmoAssim: undefined })}
            >
              Usar a melhor deitada dos temas
            </button>
          </span>
        </p>
      )}
      {naoVai && (
        <p
          role="status"
          className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
        >
          <span aria-hidden="true">⚠</span>
          <span>
            {problema === "ao-alto"
              ? "É ao alto, e a capa é deitada. "
              : `É pequena para a capa (${Math.max(tamanhoDaCapa?.w ?? 0, tamanhoDaCapa?.h ?? 0)} px; pede ${LADO_MINIMO_DA_CAPA}). `}
            Por isso o PDF usa a melhor fotografia deitada dos temas, e não esta.{" "}
            <button
              type="button"
              className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              onClick={() => patch({ capaMesmoAssim: true })}
            >
              Usar esta na mesma
            </button>
            {" · "}
            <button
              type="button"
              className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
              onClick={() => setPicker({ kind: "cover", idx })}
              onPointerEnter={aquecerBiblioteca}
              onFocus={aquecerBiblioteca}
            >
              Trocar
            </button>
          </span>
        </p>
      )}
    </>
  );
}
