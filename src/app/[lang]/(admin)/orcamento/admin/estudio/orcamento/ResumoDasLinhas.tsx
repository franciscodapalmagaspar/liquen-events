"use client";

import { eur } from "@/lib/money";
import { totaisDaProposta } from "@/lib/proposal-budget";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/**
 * O resumo do orçamento colado às linhas — uma faixa de leitura, pela ordem
 * do PDF. Não calcula nada: recebe os `totais` de `totaisDaProposta`.
 */
export function ResumoDasLinhas({
  totais,
  pctSinal,
  onMudar,
}: {
  totais: ReturnType<typeof totaisDaProposta>;
  pctSinal: number;
  onMudar: () => void;
}) {
  const partes: [string, string, boolean?][] = [
    ["Total sem IVA", eur(totais.total)],
    [`IVA ${Math.round(totais.taxa * 100)}%`, eur(totais.iva)],
    ["Total a pagar", eur(totais.aPagar), true],
    [`Sinal ${pctSinal}%`, eur(totais.sinal)],
    [`Saldo ${100 - pctSinal}%`, eur(totais.saldo)],
  ];
  return (
    <section
      aria-label="Resumo do orçamento"
      className="mt-4 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-4 py-3"
      data-resumo-das-linhas
    >
      <div className="flex items-center justify-between gap-3">
        <span className="bo-eyebrow">Resumo</span>
        <button
          type="button"
          className={`alvo-toque relative text-[11px] font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
          onClick={onMudar}
        >
          Mudar o sinal ou a validade
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs @min-[34rem]:grid-cols-5">
        {partes.map(([rotulo, valor, forte]) => (
          <div key={rotulo} className="flex min-w-0 flex-col">
            <dt className="text-[var(--bo-text-muted)]">{rotulo}</dt>
            <dd
              className={`tabular-nums ${
                forte ? "text-sm font-semibold text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
              }`}
            >
              {valor}
            </dd>
          </div>
        ))}
      </dl>
      {!totais.fecha && (
        <p className="mt-2 text-[11px] text-[var(--bo-perigo)]">
          ⚠ O total não bate certo com as linhas — o porquê está em «Total e validade».
        </p>
      )}
    </section>
  );
}
