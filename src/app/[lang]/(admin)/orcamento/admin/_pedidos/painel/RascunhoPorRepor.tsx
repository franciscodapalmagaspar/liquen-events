"use client";

import { fraseDoQueMudou } from "../../rascunho-do-pedido";
import { Button } from "../../ui";
import { type RascunhoEncontrado } from "../../rascunho-do-pedido";

/** O aviso do que ficou por gravar da última vez que este pedido esteve aberto
 *  (o rascunho no telemóvel), com «Recuperar» e «Descartar». (Saiu do painel na
 *  fase 7 da estrutura do código, tal e qual.) */
export interface RascunhoPorReporProps {
  rascunhoPorRepor: RascunhoEncontrado | null;
  reporRascunho: () => void;
  descartarRascunho: () => void;
}

export function RascunhoPorRepor({
  rascunhoPorRepor,
  reporRascunho,
  descartarRascunho,
}: RascunhoPorReporProps) {
  return (
    <>
      {/* ── O QUE FICOU POR GRAVAR ─────────────────────────────
          Primeira coisa do conteúdo, e não presa ao cabeçalho:
          aparece exactamente onde o olho já está ao abrir o
          pedido, e rolar para lá dela é uma forma legítima de a
          ignorar. Presa, roubava altura a um cabeçalho que a
          390 px já está apertado — e a decisão não é urgente,
          é só importante.

          Diz o QUE está diferente, por nome, e há quanto tempo.
          Sem isso, «há alterações por gravar» obriga a aceitar
          às cegas — e uma barra que se aceita às cegas mais vale
          não existir. */}
      {rascunhoPorRepor && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--bo-aviso)]/25 bg-[var(--bo-aviso)]/[0.07] px-3.5 py-2.5"
        >
          <p className="min-w-0 flex-1 text-xs leading-snug text-[var(--bo-tinta-72)]">
            Ficou por gravar {fraseDoQueMudou(rascunhoPorRepor.mudou)} deste pedido
            {rascunhoPorRepor.quando ? `, ${rascunhoPorRepor.quando}` : ""}.
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* «Recuperar» e não «Repor»: o produto já tem um
                «Repor», que repõe uma CÓPIA DE SEGURANÇA e
                apaga o que está lá. Duas palavras iguais para
                duas coisas diferentes — uma delas destrutiva —
                é como se carrega na errada. */}
            <Button size="sm" variant="secondary" onClick={reporRascunho}>
              Recuperar
            </Button>
            <Button size="sm" variant="ghost" onClick={descartarRascunho}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
