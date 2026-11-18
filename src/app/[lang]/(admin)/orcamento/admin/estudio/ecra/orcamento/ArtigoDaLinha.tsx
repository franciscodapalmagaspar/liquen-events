"use client";

import type { LinhaOrcamento } from "@/lib/proposal-budget";
import { ARTIGOS, eArtigo } from "@/lib/orcamento/artigos-de-faturacao";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { SubpontosDaLinha } from "../../orcamento/SubpontosDaLinha";
import { useEstudio } from "../../contexto";

/**
 * ── O ARTIGO DO MOLONI DESTA LINHA (5/11) ─────────────
 * Ela: «quando estivéssemos a fazer a proposta, colocar
 * os valores para cada coisa … para depois no Moloni
 * estar tudo organizadinho». Só para a casa — o cliente
 * não vê. Uma fila própria por baixo, como a fórmula da
 * escala: a fila de cima tem a largura contada ao píxel.
 */
export function ArtigoDaLinha({ i, l }: { i: number; l: LinhaOrcamento }) {
  const {
    contas: { artigosDoDoc, subpontosDoDoc },
    linhas: { dividirEmSubpontos, mudarSubpontos, updateBudgetArtigo },
  } = useEstudio();
  return (
    <>
      {subpontosDoDoc[i].length === 0 ? (
        <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
          <label className="flex w-full items-center gap-2 pl-1 text-[11px] text-[var(--bo-text-muted)]">
            <span className="shrink-0">Artigo do Moloni</span>
            <select
              value={artigosDoDoc[i] ?? ""}
              onChange={(e) =>
                updateBudgetArtigo(i, eArtigo(e.target.value) ? e.target.value : null)
              }
              data-campo={`budgetArtigo:${i}`}
              aria-label={`Artigo do Moloni de ${l.item || "linha sem nome"}`}
              className={`bo-input w-auto min-w-0 max-w-full px-2 py-1 text-[11px] ${
                artigosDoDoc[i]
                  ? "text-[var(--bo-tinta-72)]"
                  : "border-dashed text-[var(--bo-text-muted)]"
              }`}
            >
              <option value="">Escolher…</option>
              {ARTIGOS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome} · {a.ref}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => dividirEmSubpontos(i)}
            className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
          >
            + Subpontos
          </button>
        </div>
      ) : (
        <SubpontosDaLinha
          i={i}
          linha={l.item}
          subs={subpontosDoDoc[i]}
          aoMudar={(mudar) => mudarSubpontos(i, mudar)}
        />
      )}
    </>
  );
}
