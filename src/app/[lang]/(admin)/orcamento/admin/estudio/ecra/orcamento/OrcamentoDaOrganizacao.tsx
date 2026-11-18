"use client";

import { chaveDoCampo } from "@/lib/proposal-ortografia";
import { ADD_BTN, INPUT_SM, REMOVE_BTN } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { Field } from "../../../ui";
import { useEstudio } from "../../contexto";

export function OrcamentoDaOrganizacao() {
  const {
    documento: { doc, patch },
    linhas: { addBudgetRow, removeBudgetRow, updateBudgetRow },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <>
      <div className="@container flex flex-col gap-2 mb-3">
        {/* Os cabeçalhos só a partir das 26 rem DESTA lista: abaixo
                      disso a linha passa a duas filas, e três títulos por cima
                      de duas filas nomeiam colunas que ali não existem.

                      Era `sm:` — 640 de JANELA —, e a fila quebra por CAIXA:
                      aos 1024 a coluna de conteúdo tem 504 px e não 975. O
                      cabeçalho e a linha partilham o limiar de propósito. */}
        <div className="hidden grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25 @min-[26rem]:grid">
          <span>Item</span>
          <span className="text-right">Valor</span>
          <span className="w-5" />
        </div>
        {(doc.budgetRows ?? []).map((r, i) => (
          <div
            key={i}
            /* ── A DESCRIÇÃO SOZINHA EM CIMA, NO TELEMÓVEL ──────────
                         Do registo do audit: «a descrição da linha fica com 122
                         px numa grelha que não tem variante de telemóvel».

                         MEDIDO a 390 px: as duas colunas fixas (160 do valor,
                         ~20 do botão) mais os espaços comem 196 dos 318 px da
                         fila. É o irmão mais sortudo do nome da linha do
                         orçamento de Decoração — dá para ler três palavras em
                         vez de uma — mas é a mesma omissão no mesmo ecrã.

                         O desenho é o que as linhas adicionais aqui em cima já
                         fazem: a descrição a ocupar a fila toda, e o valor mais
                         o botão de apagar por baixo. Acima das 26 rem de lista
                         fica exactamente como estava. */
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[26rem]:grid-cols-[minmax(0,1fr)_10rem_auto]"
          >
            <input
              className="bo-input col-span-2 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] @min-[26rem]:col-span-1"
              value={r.item}
              onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
              placeholder="Coordenação do dia"
              aria-label="Item"
              data-campo={chaveDoCampo({ tipo: "linhaEstimada", i })}
            />
            <input
              className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] text-right"
              value={r.price}
              onChange={(e) => updateBudgetRow(i, { price: e.target.value })}
              placeholder="1.500,00 €"
              aria-label="Valor"
            />
            <button
              type="button"
              className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
              onClick={() => removeBudgetRow(i)}
              aria-label="Remover linha"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`} onClick={addBudgetRow}>
          + Adicionar linha
        </button>
      </div>
      {/* O par PT/EN numa linha só quando as duas caixas cabem — ver
                    `aoLado`, em `CaixaInglesa`.

                    Era `xl:` (1280 de JANELA) e o que manda é a largura desta
                    caixa: com o painel «O que vai sair» aberto ela tem 560 px
                    aos 1440, e uma nota de orçamento repartida em duas colunas
                    de 274 px não é «lado a lado». Sem ponto de corte nenhum:
                    20 rem de base para a portuguesa (é um `textarea` de prosa),
                    as 12 rem que a inglesa já pede, e o `flex-wrap` decide. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <Field
          containerClassName="min-w-0 grow basis-[20rem]"
          as="textarea"
          label="Nota do orçamento"
          rows={2}
          className="resize-none"
          value={doc.budgetNote ?? ""}
          onChange={(e) => patch({ budgetNote: e.target.value })}
          data-campo="budgetNote"
          placeholder="Os valores são estimativas e podem ser ajustados…"
        />
        {caixaDeIngles({ tipo: "budgetNote" }, "Nota do orçamento", {
          className: `${INPUT_SM} w-full resize-none leading-relaxed`,
          as: "textarea",
          rows: 2,
        })}
      </div>
    </>
  );
}
