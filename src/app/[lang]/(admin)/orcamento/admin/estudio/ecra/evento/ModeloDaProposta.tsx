"use client";

import { Segmented } from "../../../ui";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { useEstudio } from "../../contexto";

/**
 * Template selector
 */
export function ModeloDaProposta() {
  const {
    accoesDoDocumento: { setTemplate },
    passos: { step },
    pronta: { isDeco },
    traducoes: { bilingue, setBilingue },
  } = useEstudio();
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-3"
      hidden={step !== "evento"}
    >
      <Segmented
        ariaLabel="Modelo da proposta"
        value={isDeco ? "decoracao" : "organizacao"}
        onChange={setTemplate}
        options={[
          { value: "decoracao", label: "Decoração" },
          { value: "organizacao", label: "Organização" },
        ]}
      />
      {/* ══════════════════════════════════════════════════════════════
                PROPOSTA BILINGUE — O INTERRUPTOR
                ══════════════════════════════════════════════════════════════

                Ligado, cada campo de prosa ganha uma segunda caixa POR BAIXO,
                marcada «EN». Desligado, o ecrã é o de hoje ao pixel — e é essa
                a razão de haver um interruptor em vez de as caixas estarem lá
                sempre: esta secção é o ecrã mais escrito da casa, muitas vezes
                com o cliente ao telefone, e a maioria das propostas nunca vai a
                inglês.

                Não é derivado do «Idioma do PDF»: esse vive no passo SEGUINTE
                ao da escrita, e escolher «Inglês» só para tirar uma prova
                acendia as caixas todas de repente. */}
      <button
        type="button"
        onClick={() => setBilingue((v) => !v)}
        aria-pressed={bilingue}
        className={`alvo-toque inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium  ${
          bilingue
            ? "border-sage-600/40 bg-sage-600/[0.08] text-sage-600"
            : "border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-foreground/30 hover:text-[var(--bo-text)]"
        } ${ESTADO} ${PRESSAO}`}
        title="Acrescenta uma caixa em inglês por baixo de cada campo de texto"
      >
        <span aria-hidden="true">{bilingue ? "✓" : "+"}</span>
        Proposta bilingue (PT + EN)
      </button>
    </div>
  );
}
