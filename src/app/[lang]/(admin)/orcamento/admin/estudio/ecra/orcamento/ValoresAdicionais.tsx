"use client";

import { eur } from "@/lib/money";
import { modoDoAdicional } from "@/lib/orcamento/estudio/precos-e-iva";
import { DEFAULT_VAT_RATE } from "@/lib/proposal-doc";
import { normalizarValor } from "@/lib/proposal-budget";
import { LinhaDeValorAdicional } from "./LinhaDeValorAdicional";
import { ADD_BTN } from "../../classes";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { useEstudio } from "../../contexto";

/**
 * Valores adicionais — linhas do orçamento que entram no total
 * (Deslocação, Wedding Coordinator, Tecidos, Mobiliário opção A/B, …).
 * Escrever um valor aqui SOMA-O ao total: ver `definirExtras`.
 */
export function ValoresAdicionais() {
  const {
    adicionais: { addBudgetExtra, extrasAVista, trocarModoDosAdicionais },
    documento: { doc },
    total: { totais },
  } = useEstudio();
  return (
    <div className="mt-5">
      <span className="bo-eyebrow">Valores adicionais</span>
      <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
        Linhas mostradas na proposta antes do total (ex.: deslocação, coordenação, tecidos). Entram
        no sinal e no que o casal paga.
      </p>
      {/**
       * A ESCOLHA QUE VALE DINHEIRO, FEITA À VISTA.
       *
       * Palavras dela, sobre uma proposta já enviada: «aparece
       * "Subtotal dos serviços 2.860" e depois "+140 de
       * deslocação". Está mal, porque nós tínhamos dito três mil
       * MAIS cento e quarenta, e depois mais o IVA.»
       *
       * As duas leituras são legítimas e a diferença é o que o
       * casal paga, por isso escolhe-se aqui, por proposta, e a
       * frase por baixo diz o que cada uma faz aos números que
       * estão neste ecrã. Uma proposta antiga não muda: nasceu
       * sem este campo e continua a ler-se como foi enviada.
       */}
      <div className="mb-3 flex flex-col gap-1.5">
        {/* ── A EXPLICAÇÃO SAIU DE DENTRO DO `<option>` ─────────
                        MEDIDO a 375 px: a opção mais comprida — «é só dos
                        serviços, estas linhas somam-se» — precisa de 231 px de
                        letra numa caixa cujo texto tem 261 px de largura útil,
                        mas o `<select>` do iOS reserva ainda a seta e as
                        margens, e um `<option>` NÃO QUEBRA LINHA: a frase saía
                        cortada a meio, e o que se lia era «é só dos serviços,
                        estas linh…». Uma escolha que vale dinheiro não pode
                        ler-se por metade.

                        As opções passam a nomear o modo em duas ou três
                        palavras, e a explicação — que é uma frase, e as frases
                        pertencem ao texto corrido — desce para debaixo do
                        campo, onde pode quebrar à vontade e onde já estavam os
                        números que ela confere.

                        Texto visível num `span` e nome acessível no próprio
                        `select`, em vez de um `label` com as palavras «Valor
                        (sem IVA)» lá dentro: essas são as palavras do CAMPO do
                        total, e um segundo elemento a dizê-las tornava a
                        procura por etiqueta ambígua. Dezanove testes do
                        estúdio deixaram de encontrar o campo do preço por
                        causa disso. A frase de apoio aqui em baixo pode
                        dizê-las — é um `<p>`, e `findByLabelText` não lê
                        parágrafos. */}
        <span
          aria-hidden="true"
          className="text-[9px] tracking-[0.2em] uppercase text-foreground/25"
        >
          Como entram no total
        </span>
        <select
          id="adicionais-modo"
          aria-label="Como contam os valores adicionais no preço final"
          className="bo-input alvo-toque px-2.5 py-2 text-xs"
          value={doc.budgetExtrasSomam ? "somam" : "dentro"}
          onChange={(e) => trocarModoDosAdicionais(e.target.value === "somam")}
        >
          <option value="dentro">Já incluídas no valor</option>
          <option value="somam">Somam ao valor</option>
        </select>
        <p className="text-xs leading-relaxed text-foreground/45">
          {doc.budgetExtrasSomam ? (
            <>
              O valor que escreveste em «Valor (sem IVA)» é só dos serviços, e estas linhas somam-se
              a ele. Subtotal dos serviços{" "}
              <strong className="font-semibold">{eur(totais.servicos)}</strong>, mais{" "}
              {eur(totais.adicionais)} destas linhas, dá {eur(totais.total)} sem IVA e{" "}
              {eur(totais.aPagar)} a pagar.
            </>
          ) : (
            // Os nós de texto do original: um {" "} à parte não é um espaço dentro do
            // texto, e mede-se diferente (1/64 px). Ver scripts/capturas/estudio-ao-pixel.mjs.
            // prettier-ignore
            <>
              O valor que escreveste em «Valor (sem IVA)» já inclui estas linhas: o
              subtotal dos serviços fica{" "}
              <strong className="font-semibold">{eur(totais.servicos)}</strong> e o
              total sem IVA continua {eur(totais.total)}.
            </>
          )}
        </p>
      </div>
      <div className="@container flex flex-col gap-2">
        {/* Os rótulos das colunas escondem-se onde as colunas não
                        existem: abaixo do limiar a linha passa a ser duas filas,
                        e um cabeçalho de quatro colunas por cima disso seria
                        uma legenda para uma grelha que não está lá.

                        O limiar é a largura DESTA lista e não a da janela. Era
                        `sm:` (640 de janela) e a janela não sabe nada desta
                        caixa: aos 1024 a coluna de conteúdo cai para 504 px e a
                        caixa da descrição — que é onde ela escreve o texto que
                        o casal lê — fica com 196 depois das duas colunas fixas
                        (7 rem + 9 rem) e do botão. O cabeçalho e a linha lêem o
                        MESMO limiar: separá-los é o que dá parágrafos a meia
                        largura numa grelha de uma coluna. */}
        <div className="hidden @min-[26rem]:grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
          <span>Descrição</span>
          <span className="text-right">Valor (€)</span>
          <span>IVA da linha</span>
          <span className="w-5" />
        </div>
        {extrasAVista.map((ex, i) => {
          const modo = modoDoAdicional(ex.valueText ?? "", doc.vatRate ?? DEFAULT_VAT_RATE);
          const numero = normalizarValor(ex.valueText);
          return <LinhaDeValorAdicional key={i} ex={ex} i={i} modo={modo} numero={numero} />;
        })}
        <button
          type="button"
          className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
          onClick={addBudgetExtra}
        >
          + Adicionar valor adicional
        </button>
        {/* O «Somado ao total: X» que aqui estava saiu para o bloco
                        de totais, onde é a linha «Valores adicionais». A conta
                        continua à vista — deixou é de ser a terceira soma
                        diferente no mesmo ecrã. */}
      </div>
    </div>
  );
}
