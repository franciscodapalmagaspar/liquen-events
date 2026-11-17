"use client";

import { type Dispatch, type SetStateAction } from "react";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { dateStamp, downloadCsv, quotesToCsvRows } from "../export";
import { EmCurso } from "../ui";
import { STATUS_OPTIONS } from "./PastilhaDoEstado";
import { type FiltrosDaLista } from "./useFiltrosDosPedidos";
import { EscolhaDoEstado } from "../EscolhaDoEstado";
import { ESTADO, PRESSAO } from "../ui/movimento";

/**
 * A BARRA DA SELECÇÃO — o que se faz a vários pedidos de uma vez (marcar como,
 * exportar, arquivar, apagar), e a espera do lote que está a correr. (Saiu do
 * `AdminClient.tsx` na fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`, tal e qual.)
 */
export interface BarraDaSeleccaoProps {
  filtros: FiltrosDaLista;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  selectedIds: Set<string>;
  lote: { titulo: string; feito: number; total: number } | null;
  bulkBusy: boolean;
  applyBulkStatus: (status: QuoteStatus, ids: string[]) => Promise<void>;
  pedirParaArquivar: (arquivar: boolean, ids: string[]) => void;
  deleteSelected: (ids: string[]) => void;
  visibleQuotes: Quote[];
  seleccionadosAVista: string[];
}

export function BarraDaSeleccao({
  filtros,
  setSelectedIds,
  selectedIds,
  lote,
  bulkBusy,
  applyBulkStatus,
  pedirParaArquivar,
  deleteSelected,
  visibleQuotes,
  seleccionadosAVista,
}: BarraDaSeleccaoProps) {
  const { showArchived, filtered } = filtros;
  return (
    <>
      {/* Bulk actions */}
      {seleccionadosAVista.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-5 p-3 rounded-xl border border-sage-600/25 bg-sage-600/[0.06]">
          <span className="text-sage-600 text-xs font-semibold">
            {seleccionadosAVista.length} selecionado
            {seleccionadosAVista.length !== 1 ? "s" : ""}
          </span>
          {seleccionadosAVista.length < filtered.length && (
            <button
              onClick={() => setSelectedIds(new Set(filtered.map((q) => q.id)))}
              className={`text-[var(--bo-text-muted)] text-xs hover:text-sage-600 ${ESTADO} ${PRESSAO}`}
            >
              {/* Com mais filtrados do que desenhados, di-lo: o ⌘A só
                  escolhe o que se vê, e os outros pedem-se aqui, à
                  vista (revisão · 3). */}
              {filtered.length > visibleQuotes.length
                ? `Selecionar todos os ${filtered.length} filtrados`
                : `Selecionar todos (${filtered.length})`}
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
              Marcar como
            </span>
            {/* Era aqui que vivia o «A aplicar…», num `<option>` de um
                `<select>` fechado — texto que ninguém vê. O sinal passou
                para o `EmCurso` no fundo desta barra. */}
            <EscolhaDoEstado
              forma="campo"
              estados={STATUS_OPTIONS}
              valor=""
              vazio="—"
              disabled={bulkBusy}
              aoMudar={(v) => applyBulkStatus(v, seleccionadosAVista)}
              aria-label="Marcar pedidos selecionados como"
              className="bo-input px-2 py-1.5 text-xs text-[var(--bo-tinta-72)]"
            />
          </div>
          <button
            onClick={() =>
              downloadCsv(
                `pedidos-selecao-${dateStamp()}`,
                quotesToCsvRows(filtered.filter((q) => selectedIds.has(q.id))),
              )
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bo-surface)] border border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-sage-600 ${ESTADO} ${PRESSAO} `}
          >
            Exportar seleção
          </button>
          {(() => {
            const emails = filtered
              .filter((q) => selectedIds.has(q.id) && q.email)
              .map((q) => q.email);
            if (emails.length === 0) return null;
            return (
              <a
                href={`mailto:?bcc=${encodeURIComponent(emails.join(","))}`}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bo-surface)] border border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-sage-600 ${ESTADO} ${PRESSAO} `}
                title={`Compor email para ${emails.length} cliente(s) (em bcc)`}
              >
                Email ({emails.length})
              </a>
            );
          })()}
          {/* Arquivar ou restaurar, conforme a lista que está à frente:
              na dos arquivados só faz sentido trazê-los de volta (BO 4). */}
          <button
            onClick={() => pedirParaArquivar(!showArchived, seleccionadosAVista)}
            disabled={bulkBusy}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bo-surface)] border border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] text-[10px] tracking-[0.12em] uppercase rounded-lg hover:text-sage-600 ${ESTADO} ${PRESSAO} disabled:opacity-50`}
          >
            {showArchived ? "Restaurar" : "Arquivar"} ({seleccionadosAVista.length})
          </button>
          {/* Hard delete for the whole selection — restrained terracotta,
              always behind a single confirm; disabled while a batch runs. */}
          <button
            onClick={() => deleteSelected(seleccionadosAVista)}
            disabled={bulkBusy}
            className={`flex items-center gap-1.5 px-3 py-1.5 bg-[var(--bo-surface)] border border-[var(--bo-perigo)]/25 text-[var(--bo-perigo)]/80 text-[10px] tracking-[0.12em] uppercase rounded-lg hover:bg-[var(--bo-perigo)]/10 hover:text-[var(--bo-perigo)] ${ESTADO} ${PRESSAO} disabled:opacity-50`}
          >
            Apagar ({seleccionadosAVista.length})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className={`ml-auto text-foreground/40 text-xs hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
          >
            Limpar
          </button>
          {/* A espera fica DENTRO da barra da seleção, por baixo dos
              botões que a lançaram — é onde os olhos já estão.
              `basis-full` para tomar uma linha só sua: a 390 px esta
              barra já quebra em várias filas e um cartão encaixado entre
              dois botões não cabia. */}
          {lote && (
            <EmCurso
              className="basis-full"
              titulo={lote.titulo}
              feito={lote.feito}
              total={lote.total}
              nota="Não feches a página até acabar."
            />
          )}
        </div>
      )}
    </>
  );
}
