"use client";

import { STATUS_OPTIONS } from "./pastilha-do-estado";
import { type FiltrosDaLista } from "./useFiltrosDosPedidos";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * AS PASTILHAS DA LISTA — os estados (com a contagem de cada um), os
 * arquivados e as etiquetas. (Saíram do `AdminClient.tsx` na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface PastilhasDaListaProps {
  filtros: FiltrosDaLista;
  archivedCount: number;
  allTags: string[];
  statusCounts: { counts: Record<string, number>; activeTotal: number };
}

export function PastilhasDaLista({
  filtros,
  archivedCount,
  allTags,
  statusCounts,
}: PastilhasDaListaProps) {
  const { filterStatus, setFilterStatus, tagFilter, setTagFilter, showArchived, setShowArchived } =
    filtros;
  return (
    <>
      {/* ── AS PASTILHAS DE ESTADO ───────────────────────────────────
          Estas NÃO recolhem com as outras, e a diferença é de uso: são a
          triagem («o que é novo? o que está à espera de resposta?»), não
          um filtro de ocasião. Recolhê-las era esconder o gesto mais
          repetido do ecrã.

          O que muda é a forma: eram seis pastilhas a quebrar em duas
          linhas (mais de 70 px), passam a UMA fila que se arrasta com o
          polegar. Um contentor com scroll próprio é, aliás, a única
          maneira de sair da margem que a auditoria de toque aceita — ver
          `temScrollProprio` em `ergonomia-tactil.mjs`.

          `py-1` não é enfeite: `overflow-x` recorta também na vertical, e
          sem essa folga o anel de foco das pastilhas ficava cortado. */}
      <div
        style={{ "--cena": 1 } as React.CSSProperties}
        className="bo-cena flex flex-nowrap lg:flex-wrap overflow-x-auto lg:overflow-visible gap-1.5 py-1 mb-3 sm:mb-5 lg:mb-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* AS PASTILHAS DE FILTRO: 120 ms, e sem `all`.
            Estavam em `transition-all duration-150` — as quatro. Os 150 são
            o valor de omissão do Tailwind escrito à mão, e o `all` obriga a
            considerar `width` e `height` numa tira que rola na horizontal
            com o dedo. O que aqui muda ao carregar é fundo e cor de letra:
            o degrau `micro` (120 ms) e a lista fechada do `ESTADO`. */}
        {!showArchived && (
          <>
            <button
              onClick={() => setFilterStatus("all")}
              className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium ${ESTADO} ${PRESSAO} ${filterStatus === "all" ? "bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] " : "bg-[var(--bo-tinta-6)] text-foreground/40 hover:bg-[var(--bo-tinta-10)] hover:text-[var(--bo-text-muted)]"}`}
            >
              Todos · {statusCounts.activeTotal}
            </button>
            {STATUS_OPTIONS.map((s) => {
              const count = statusCounts.counts[s.id] ?? 0;
              return (
                <button
                  key={s.id}
                  onClick={() => setFilterStatus(s.id)}
                  className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium ${ESTADO} ${PRESSAO} ${filterStatus === s.id ? "bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] " : "bg-[var(--bo-tinta-6)] text-foreground/40 hover:bg-[var(--bo-tinta-10)] hover:text-[var(--bo-text-muted)]"}`}
                >
                  {s.label} · {count}
                </button>
              );
            })}
          </>
        )}
        {archivedCount > 0 && (
          <button
            onClick={() => {
              setShowArchived((v) => !v);
              setFilterStatus("all");
            }}
            className={`alvo-toque shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase font-medium ${ESTADO} ${PRESSAO} ${showArchived ? "bg-[var(--bo-seleccao)] text-[var(--bo-sobre-seleccao)] " : "bg-[var(--bo-tinta-6)] text-foreground/30 hover:bg-[var(--bo-tinta-10)]"}`}
          >
            Arquivados · {archivedCount}
          </button>
        )}
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        /* O `-mt` cancela parte da margem da fila de cima: as duas filas
           são o mesmo gesto e não precisam de ar entre elas. Abaixo de 640
           a conta é sobre margens já apertadas (12 em vez de 20), portanto
           o cancelamento também encolhe — senão as pastilhas encostavam. */
        <div className="flex flex-wrap items-center gap-1.5 mb-4 -mt-2 sm:mb-8 sm:-mt-4">
          <span className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase mr-1">
            Etiquetas
          </span>
          {/* `alvo-toque` como o «Arquivados · N» dez linhas acima: estes
              chips são a MESMA fila de filtros, e mediam 68×24 px no
              telemóvel — metade do mínimo da casa. O ajudante só cresce
              onde há dedo (`pointer: coarse`), portanto no portátil a
              fila fica exactamente como está. */}
          {allTags.map((t) => (
            <button
              key={t}
              onClick={() => setTagFilter((cur) => (cur === t ? null : t))}
              className={`alvo-toque px-3 py-1 rounded-full text-[10px] font-medium tracking-wide ${ESTADO} ${PRESSAO} ${
                tagFilter === t
                  ? "bg-sage-600 text-white "
                  : "bg-sage-600/10 text-sage-600 hover:bg-sage-600/18"
              }`}
            >
              {t}
            </button>
          ))}
          {tagFilter && (
            <button
              onClick={() => setTagFilter(null)}
              className={`text-foreground/35 text-[10px] hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO} ml-1`}
            >
              Limpar
            </button>
          )}
        </div>
      )}
    </>
  );
}
