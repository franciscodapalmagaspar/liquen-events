"use client";

import { type ModoDeIvaDoAdicional } from "@/lib/orcamento/estudio/precos-e-iva";
import { REMOVE_BTN } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ARTIGOS, artigoDoAdicional, eArtigo } from "@/lib/orcamento/artigos-de-faturacao";
import { useEstudio } from "../../contexto";

export function LinhaDeValorAdicional({
  ex,
  i,
  modo,
  numero,
}: {
  ex: { label: string; valueText: string };
  i: number;
  modo: ModoDeIvaDoAdicional;
  numero: number | null;
}) {
  const {
    adicionais: {
      definirIvaDoAdicional,
      definirValorDoAdicional,
      removeBudgetExtra,
      soLinhaPorEscrever,
      updateBudgetExtra,
    },
    linhas: { updateExtraArtigo },
    traducoes: { caixaDeIngles },
  } = useEstudio();
  return (
    <div
      key={i}
      /**
       * ── A CAIXA DA DESCRIÇÃO COM 22 px ────────────────
       *
       * Medido a 375 px: as duas colunas fixas (7rem do
       * valor + 9rem do IVA) mais a coluna do botão comem
       * a largura toda, e ao `minmax(0,1fr)` da descrição
       * sobravam 22 px, uma caixa onde não cabe uma
       * palavra, no campo que dá nome à linha que o casal
       * vai ler.
       *
       * Abaixo de 26 rem DE LISTA (e não de janela) a linha
       * passa a duas filas: a descrição sozinha em cima, e o
       * valor, o IVA e o botão de apagar por baixo. Acima
       * disso fica exactamente como estava.
       */
      className="grid grid-cols-[minmax(0,1fr)_auto] @min-[26rem]:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-center gap-2"
    >
      {/* Um invólucro só para as duas caixas ficarem uma por
                              cima da outra DENTRO da primeira coluna — a linha é
                              uma grelha, e um filho solto abriria uma coluna
                              nova em vez de descer. */}
      <div className="col-span-2 min-w-0 @min-[26rem]:col-span-1">
        <input
          className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
          value={ex.label}
          onChange={(e) => updateBudgetExtra(i, { label: e.target.value })}
          data-campo={`extraRotulo:${i}`}
          placeholder="Deslocação da equipa Líquen"
          aria-label="Descrição da linha adicional"
        />
        {!soLinhaPorEscrever &&
          caixaDeIngles({ tipo: "extraRotulo", i }, "Descrição da linha adicional", {
            className: "bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
            placeholder: "Líquen team travel",
            // EMPILHADA: esta já vive numa célula estreita
            // de uma grelha de dois (o rótulo à esquerda, o
            // valor à direita). Parti-la outra vez ao meio
            // dava duas caixas onde não cabe «Deslocação».
            empilhada: true,
          })}
      </div>
      {/* ── UM CAMPO DE DINHEIRO, NÃO UM CAMPO DE TEXTO ──
                              Chamava-se «Valor (texto)» e aceitava o que lhe
                              escrevessem — que é o que se pede a um campo cujo
                              conteúdo é impresso no PDF tal e qual. O preço
                              disso era «1.500» a valer mil e quinhentos ou um e
                              meio conforme quem o lê.

                              Agora entra um NÚMERO («1.500», «1500», «1 500 €»
                              dão os três 1500, por `normalizarValor`) e o «+
                              IVA» — que era a informação que vinha escondida no
                              texto — passou a ser o selector ao lado. O que se
                              grava continua a ser a frase que o PDF imprime;
                              ver `textoDoAdicional`.

                              `defaultValue` + `onBlur`, como no preço da linha:
                              normalizar a cada tecla apagava o que ela estava a
                              escrever a meio. O `key` traz o valor gravado de
                              volta ao campo quando ele muda por outra via (o
                              selector do IVA, a deslocação calculada, o anular). */}
      <input
        key={`${i}:${ex.valueText}`}
        className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] text-right"
        defaultValue={numero === null ? (ex.valueText ?? "") : String(numero)}
        onBlur={(e) => definirValorDoAdicional(i, e.target.value)}
        placeholder="896"
        inputMode="decimal"
        aria-label={`Valor de ${ex.label?.trim() || "linha adicional sem nome"}`}
      />
      <select
        className="bo-input px-2 py-2 text-xs text-[var(--bo-tinta-72)]"
        value={modo}
        onChange={(e) => definirIvaDoAdicional(i, e.target.value as ModoDeIvaDoAdicional)}
        aria-label={`IVA de ${ex.label?.trim() || "linha adicional sem nome"}`}
      >
        <option value="documento">Como o total</option>
        <option value="acrescer">+ IVA</option>
        <option value="incluido">IVA incluído</option>
      </select>
      {soLinhaPorEscrever ? (
        // A linha ainda não existe: não há o que remover.
        // A célula fica, para a grelha não mudar de forma.
        <span className="w-5" aria-hidden="true" />
      ) : (
        <button
          type="button"
          className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
          onClick={() => removeBudgetExtra(i)}
          aria-label="Remover linha adicional"
        >
          ×
        </button>
      )}
      {/* O que fica escrito na proposta, à letra. É a única
                              forma de ela ver que «1500» e «+ IVA» viram
                              «1 500,00 € + IVA» no papel — e de um texto livre
                              antigo («a definir») se ver que continua lá. */}
      {(ex.valueText ?? "").trim() !== "" && (
        <span className="col-span-full pl-1 text-[10px] text-foreground/35">
          {`No PDF: ${ex.valueText}`}
        </span>
      )}
      {/* O artigo do Moloni deste valor (5/11) — só quando
                              tem um número, que é quando entra no total. */}
      {!soLinhaPorEscrever && /\d/.test(ex.valueText ?? "") && (
        <label className="col-span-full flex items-center gap-2 pl-1 text-[11px] text-[var(--bo-text-muted)]">
          <span className="shrink-0">Artigo do Moloni</span>
          <select
            value={artigoDoAdicional(ex) ?? ""}
            onChange={(e) => updateExtraArtigo(i, eArtigo(e.target.value) ? e.target.value : null)}
            data-campo={`extraArtigo:${i}`}
            aria-label={`Artigo do Moloni de ${ex.label?.trim() || "linha adicional sem nome"}`}
            className={`bo-input w-auto min-w-0 max-w-full px-2 py-1 text-[11px] ${
              artigoDoAdicional(ex)
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
      )}
    </div>
  );
}
