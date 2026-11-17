"use client";
import { parseMoneyText, DEFAULT_VAT_RATE } from "@/lib/proposal-doc";
import { somaDosExtrasSemIva } from "@/lib/proposal-budget";
import { eur, round2 } from "@/lib/money";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import {
  modoDoAdicional,
  textoDoAdicional,
  type ModoDeIvaDoAdicional,
} from "@/lib/orcamento/estudio/precos-e-iva";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useTotalDaProposta } from "./useTotalDaProposta";
import { useConfirmacoes } from "../../documento/useConfirmacoes";

export interface EntradaAdicionaisDoOrcamento {
  confirmacoes: ReturnType<typeof useConfirmacoes>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useAdicionaisDoOrcamento({
  confirmacoes,
  documento,
  total,
}: EntradaAdicionaisDoOrcamento) {
  const { pedirConfirmacaoDeDinheiro } = confirmacoes;
  const { doc, setDoc } = documento;
  const { amountParaBase, persistirPreco, setTotalInput, totalInput, vatMode, writeTotal } = total;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * MEXER NUM VALOR ADICIONAL MEXE NO TOTAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «colocámos a deslocação da equipa Líquen, que são mil
   * quinhentos e cinquenta euros, e depois no total, naquela aba onde diz total
   * IVA e validade, isto não soma. Eu quero que o back office tenha
   * inteligência suficiente para ver os valores que nós colocamos em cada aba e
   * faça a soma com o valor total.»
   *
   * O problema era maior do que o ecrã. Este total é também o PREÇO FINAL do
   * pedido, e é dele que saem a factura, o sinal de 30% e o saldo: uma
   * deslocação de 1.550 € escrita aqui aparecia na proposta que o cliente lê e
   * não entrava em nada do que se cobra. O sinal era pedido a menos e a factura
   * era emitida a menos.
   *
   * ── PORQUE É QUE SE SOMA A DIFERENÇA, E NÃO O TOTAL DOS EXTRAS ───────────
   *
   * Aplica-se ao total o que MUDOU (o depois menos o antes), e nunca o valor
   * inteiro. É isso que torna a conta imune a ser feita duas vezes: escrever
   * «1550» são quatro teclas, e quatro somas do valor inteiro dariam um total
   * absurdo. Assim, cada tecla soma o que acrescentou e o resultado final é
   * exactamente a diferença entre o que lá estava e o que ficou.
   *
   * Também é o que respeita um total escrito à mão: quem apagar um extra vê o
   * total descer o mesmo que ele subiu, e mais nada é tocado.
   */
  function definirExtras(novos: { label: string; valueText: string }[]) {
    /**
     * ── O IVA QUE A LINHA DECLARA CONTA ─────────────────────────────────────
     *
     * Este campo é a base (o rótulo diz «Preço final (sem IVA)»), por isso o que
     * se lhe soma tem de ser base. A soma pegava no número e somava-o tal e
     * qual: «895,00 € + IVA» e «895,00 €» acabavam exactamente no mesmo sítio.
     *
     * Só a primeira estava certa. Numa proposta que se lê COM IVA, a segunda
     * promete ao casal que aquela linha custa 895 — e fazia o total subir 895 de
     * BASE, que são 1.101 do que eles vão pagar. A linha e o total a dizerem
     * números diferentes sobre a mesma coisa, no mesmo documento.
     *
     * `somaDosExtrasSemIva` lê o que cada linha declara e, quando ela não
     * declara nada, segue o modo do documento — que é a leitura que o casal faz,
     * porque é a que está impressa ao lado do total.
     */
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const delta =
      Math.round(
        (somaDosExtrasSemIva(novos, contexto) -
          somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
          100,
      ) / 100;
    setDoc((d) => ({ ...d, budgetExtras: novos }));
    /**
     * Quando os adicionais SOMAM ao valor escrito, o campo do total é só dos
     * serviços e não se mexe: acrescentar uma deslocação de 140 deixa os 3.000
     * onde estão e faz o total subir para 3.140. Enquanto isto não existia, o
     * campo era empurrado para cima e os serviços encolhiam por baixo — que é
     * exactamente o quadro que ela viu e que não queria.
     */
    if (doc.budgetExtrasSomam) {
      /**
       * O campo não mexe, mas o PEDIDO tem de mexer.
       *
       * O «Preço final (sem IVA)» do pedido é de onde a Visão Geral, as
       * Estatísticas e o dossier leem o dinheiro dos pedidos que ainda não têm
       * proposta enviada. Se ele ficasse com os serviços apenas, uma deslocação
       * de 140 € deixava de aparecer nesses ecrãs — e o pior de tudo é que
       * desaparecia em silêncio, num número que já ninguém confere.
       *
       * A soma é feita com os adicionais NOVOS, e não com os que estão no
       * documento: o `setDoc` acima é assíncrono, e ler `doc` aqui daria o
       * estado anterior. É a mesma armadilha que o `delta` já evita.
       */
      const escrito = parseMoneyText(totalInput);
      const efectivo = Math.round((escrito + somaDosExtrasSemIva(novos, contexto)) * 100) / 100;
      persistirPreco(efectivo > 0 ? efectivo : undefined, { jaEfectivo: true });
      return;
    }
    if (delta === 0) return;
    // Um total não pode ficar negativo por causa de um extra apagado.
    const base = Math.max(0, Math.round((parseMoneyText(totalInput) + delta) * 100) / 100);
    setTotalInput(base > 0 ? textoDoTotal(base) : "");
    writeTotal(base > 0 ? amountParaBase(base, vatMode) : undefined, vatMode);
    persistirPreco(base > 0 ? base : undefined);
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * TROCAR «COMO CONTAM OS ADICIONAIS» É MEXER NO DINHEIRO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O selector decide se a deslocação está DENTRO do valor escrito ou se lhe
   * SOMA — ou seja, decide se o casal paga 3.000 ou 3.140. A frase debaixo
   * dele diz isso mesmo, com os dois números.
   *
   * E era um `setDoc` a seco: mudava o total no ecrã e não gravava nada no
   * pedido. A partir daí o estúdio dizia um número e o «Preço final» dizia
   * outro, em silêncio — até à abertura seguinte, em que quem manda no valor é
   * o pedido e o total saltava sozinho o valor inteiro dos adicionais. É «o
   * valor está diferente do que enviámos», pela porta do lado.
   *
   * A conta é a do `definirExtras`, e de propósito a mesma: o campo do escrito
   * NÃO mexe (é sempre só os serviços); o que muda é o efectivo, e é o
   * efectivo que o pedido guarda.
   */
  function trocarModoDosAdicionais(somam: boolean) {
    setDoc((d) => ({ ...d, budgetExtrasSomam: somam }));
    const escrito = parseMoneyText(totalInput);
    // Os adicionais do documento que está no ecrã — o `setDoc` acima é
    // assíncrono e só mexe na REGRA, não nas linhas.
    const adicionais = somaDosExtrasSemIva(doc.budgetExtras ?? [], {
      mode: vatMode,
      vatRate: doc.vatRate,
    });
    const efectivo = round2(somam ? escrito + adicionais : escrito);
    persistirPreco(efectivo > 0 ? efectivo : undefined, { jaEfectivo: true });
  }

  // ── Budget extras: linhas adicionais (Deslocação, Coordenação, Tecidos…) ──
  /**
   * ── A TABELA ABRE COM UMA LINHA PRONTA ─────────────────────────────────
   *
   * Palavras dela, com a captura dos cabeçalhos sem nada por baixo: «eu quero
   * que isto aqui esteja aberto por definição». Sem adicionais, a secção
   * mostrava «Descrição · Valor · IVA» e um «+ Adicionar» — um clique a mais
   * para começar a escrever.
   *
   * A linha vazia é SÓ do ecrã: não entra na proposta até se escrever nela
   * (`updateBudgetExtra` cria-a nesse momento), e mesmo que entrasse vazia o
   * PDF já salta as linhas sem descrição nem valor (`proposal-doc-pdf`).
   */
  const extrasAVista: { label: string; valueText: string }[] =
    (doc.budgetExtras ?? []).length > 0 ? (doc.budgetExtras ?? []) : [{ label: "", valueText: "" }];
  const soLinhaPorEscrever = (doc.budgetExtras ?? []).length === 0;

  function addBudgetExtra() {
    // Uma linha nova nasce vazia: não há valor nenhum para somar ainda.
    definirExtras([...(doc.budgetExtras ?? []), { label: "", valueText: "" }]);
  }
  function updateBudgetExtra(i: number, p: Partial<{ label: string; valueText: string }>) {
    const extras = doc.budgetExtras ?? [];
    // A linha que se mostra aberta sem existir (ver `extrasAVista`): a primeira
    // coisa escrita nela é o que a cria.
    if (extras.length === 0 && i === 0) {
      definirExtras([{ label: "", valueText: "", ...p }]);
      return;
    }
    definirExtras(extras.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  /**
   * O valor escrito no campo numérico, já normalizado e com o IVA da linha.
   *
   * «1.500», «1500» e «1 500 €» dão os três 1500 — é o que a missão pede e é o
   * que `normalizarValor` já sabia fazer para os preços das linhas. O que se
   * GRAVA continua a ser texto, porque é ele que o PDF imprime; ver
   * `textoDoAdicional`.
   */
  function definirValorDoAdicional(i: number, escrito: string) {
    const linha = extrasAVista[i];
    if (!linha) return;
    const modo = modoDoAdicional(linha.valueText ?? "", doc.vatRate ?? DEFAULT_VAT_RATE);
    updateBudgetExtra(i, { valueText: textoDoAdicional(escrito, modo) });
  }
  /** Troca o IVA que a linha declara, mantendo o número que lá está. */
  function definirIvaDoAdicional(i: number, modo: ModoDeIvaDoAdicional) {
    const linha = extrasAVista[i];
    if (!linha) return;
    updateBudgetExtra(i, { valueText: textoDoAdicional(linha.valueText ?? "", modo) });
  }
  /**
   * Apagar um valor adicional TIRA-O do total — e portanto do sinal e da
   * fatura. Uma deslocação de 1.550 € desaparecia do preço final com um clique
   * num «×» de doze pixéis, sem pergunta e sem volta atrás; é exactamente o
   * mesmo estrago do «Usar X €» e leva o mesmo tratamento.
   *
   * Uma linha sem valor legível (a que se acabou de acrescentar, ou uma que
   * diga «a definir») sai sem perguntar: não mexe em dinheiro nenhum, e
   * perguntar aí seria ensinar a responder que sim sem ler.
   */
  function removeBudgetExtra(i: number) {
    const linha = (doc.budgetExtras ?? [])[i];
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const vale = linha ? somaDosExtrasSemIva([linha], contexto) : 0;
    const apagar = () => definirExtras((doc.budgetExtras ?? []).filter((_, j) => j !== i));
    if (!linha || vale === 0) {
      apagar();
      return;
    }
    const escrito = parseMoneyText(totalInput);
    /**
     * Auditoria de 13/11 (estúdio, n.º 17). Com «estas linhas somam-se», o
     * campo é SÓ a parte dos serviços, e o preço final é ele MAIS todos os
     * adicionais: a pergunta mostrava «de [campo] para [campo − linha]», dois
     * números que não eram o preço de antes nem o de depois.
     */
    const base = doc.budgetExtrasSomam
      ? Math.round((escrito + somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) * 100) / 100
      : escrito;
    const nome = linha.label?.trim() || "esta linha";
    pedirConfirmacaoDeDinheiro({
      oQue: "o total",
      de: base,
      para: Math.max(0, Math.round((base - vale) * 100) / 100),
      registo: `«${nome}» removida dos valores adicionais no estúdio: preço final de ${eur(base)} para ${eur(Math.max(0, base - vale))}.`,
      motivo: `«${nome}» removida dos valores adicionais.`,
      aplicar: apagar,
    });
  }

  return {
    addBudgetExtra,
    definirExtras,
    definirIvaDoAdicional,
    definirValorDoAdicional,
    extrasAVista,
    removeBudgetExtra,
    soLinhaPorEscrever,
    trocarModoDosAdicionais,
    updateBudgetExtra,
  };
}
