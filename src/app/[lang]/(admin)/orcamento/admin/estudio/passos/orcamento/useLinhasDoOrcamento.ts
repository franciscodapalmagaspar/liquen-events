"use client";
import { marcarExtra } from "@/lib/orcamento/versoes-da-proposta";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  escalasDe,
  recalcular,
  type TipoDeEscala,
} from "@/lib/orcamento/escala";
import {
  definirArtigoDaLinha,
  definirArtigoDoAdicional,
  definirSubpontos,
  subpontosDe,
  type ArtigoId,
} from "@/lib/orcamento/artigos-de-faturacao";
import type { ProposalDoc, SubpontoDoOrcamento } from "@/lib/proposal-doc";
import {
  adicionarLinha,
  definirItem,
  definirPreco,
  linhasDe,
  normalizarValor,
  precosDe,
  removerLinha,
} from "@/lib/proposal-budget";
import { eur } from "@/lib/money";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../../documento/useAccoesReversiveis";
import { useTotalDaProposta } from "./useTotalDaProposta";
import { useSomarOTotal } from "./useSomarOTotal";
import { useContasDoOrcamento } from "./useContasDoOrcamento";

export interface EntradaLinhasDoOrcamento {
  contas: ReturnType<typeof useContasDoOrcamento>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  somaDoTotal: ReturnType<typeof useSomarOTotal>;
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useLinhasDoOrcamento({
  contas,
  documento,
  reversiveis,
  somaDoTotal,
  total,
}: EntradaLinhasDoOrcamento) {
  const { artigosDoDoc, convidados } = contas;
  const { doc, setDoc } = documento;
  const { setLimpo } = reversiveis;
  const { somarOTotal } = somaDoTotal;
  const { totalInput } = total;

  /**
   * Trocar o tipo de escala de uma linha.
   *
   * Ao passar a escalonável, o unitário nasce do preço que já lá estava
   * dividido pelas unidades — para o total não dar um salto no instante em que
   * ela escolhe a opção. Ao voltar a fixa, o preço fica onde está: era o
   * resultado da última multiplicação, e é um número que ela reconhece.
   */
  function definirEscala(i: number, tipo: TipoDeEscala) {
    somarOTotal.current = true;
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const porMesa = d.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO;
      const proximas = escalas.map((e, j) => {
        if (j !== i) return e;
        if (tipo === "fixa") return null;
        const unidades =
          tipo === "por-mesa"
            ? Math.max(1, Math.ceil(convidados / porMesa))
            : Math.max(1, convidados);
        const precoActual = (d.budgetAmounts ?? [])[i];
        const base =
          typeof precoActual === "number" && precoActual > 0 ? precoActual / unidades : 0;
        return { tipo, unitario: Math.round(base * 100) / 100 };
      });
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }

  function definirUnitario(i: number, texto: string) {
    somarOTotal.current = true;
    const n = normalizarValor(texto);
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const proximas = escalas.map((e, j) => (j === i && e ? { ...e, unitario: n ?? 0 } : e));
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }

  // ── Budget: decoracao (grouped) ──
  // Tudo passa pelos ajudantes de `proposal-budget`: os nomes e os preços são
  // dois arrays paralelos, e mexer num sem mexer no outro faz os preços
  // deslizarem uma posição — o preço da cerimónia acabaria no ramo da noiva,
  // sem nada a assinalar.
  function addBudgetItem() {
    setDoc((d) => adicionarLinha(d));
  }
  function updateBudgetItem(i: number, value: string) {
    setDoc((d) => definirItem(d, i, value));
  }
  /**
   * Remover uma linha do orçamento — ANULAR, e não pergunta.
   *
   * É o gesto mais repetido do estúdio: um orçamento de decoração compõe-se
   * linha a linha com o cliente ao telefone, e tira-se e põe-se enquanto se
   * fala. Perguntar em cada «×» é atrito diário, e o preço desse atrito
   * paga-se todo no mesmo sítio: uma caixa que se despacha vinte vezes numa
   * tarde é uma caixa que não protege nada na vigésima primeira.
   *
   * ── E PORQUE É QUE A LINHA ADICIONAL LEVA PERGUNTA E ESTA NÃO ────────────
   * Parecem irmãs e não são. Apagar um VALOR ADICIONAL muda o preço final do
   * pedido — e portanto o sinal e a factura que saem a seguir —, e por isso
   * passa pela pergunta do dinheiro com os dois números à vista (ver
   * `removeBudgetExtra`). Esta não: o total desta proposta é um campo escrito à
   * parte, e tirar uma linha daqui mexe na soma das linhas, que o ecrã já
   * mostra e assinala quando as duas divergem. É trabalho de escrita, não
   * dinheiro cobrado.
   *
   * A barra diz o nome da linha e o que ela valia — sem isso, «linha removida»
   * numa lista de catorze não diz qual.
   */
  function removeBudgetItem(i: number) {
    const linha = linhasDe(doc)[i];
    const nome = (linha?.item ?? "").trim();
    const preco = precosDe(doc)[i];
    if (nome !== "" || (typeof preco === "number" && preco > 0)) {
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Linha «${nome || `sem nome (${i + 1})`}» removida do orçamento` +
          (typeof preco === "number" && preco > 0 ? ` — valia ${eur(preco)}.` : "."),
      });
    }
    somarOTotal.current = true;
    setDoc((d) => removerLinha(d, i));
  }
  function updateBudgetPrice(i: number, texto: string) {
    somarOTotal.current = true;
    setDoc((d) => definirPreco(d, i, normalizarValor(texto)));
  }
  /** O artigo do Moloni de uma linha (5/11) — só para a faturação. */
  /**
   * Os subpontos internos de uma linha (6/11). Lidos do documento DENTRO do
   * `setDoc`, para dois gestos seguidos não se pisarem; e o total segue a soma.
   */
  function mudarSubpontos(
    i: number,
    mudar: (atuais: SubpontoDoOrcamento[]) => SubpontoDoOrcamento[],
  ) {
    somarOTotal.current = true;
    setDoc((d) => definirSubpontos(d, i, mudar(subpontosDe(d as ProposalDoc)[i] ?? [])));
  }
  /** Dividir a linha: o primeiro subponto nasce com o preço e o artigo dela —
   *  nada do que já estava escrito se perde. */
  function dividirEmSubpontos(i: number) {
    const preco = precosDe(doc)[i] ?? null;
    const artigo = artigosDoDoc[i] ?? null;
    mudarSubpontos(i, () => [{ nome: "", valor: preco, artigo }]);
  }
  function updateBudgetArtigo(i: number, artigo: ArtigoId | null) {
    setDoc((d) => definirArtigoDaLinha(d, i, artigo));
  }
  /** O artigo do Moloni de um valor adicional (5/11). */
  function updateExtraArtigo(i: number, artigo: ArtigoId | null) {
    setDoc((d) => definirArtigoDoAdicional(d, i, artigo));
  }
  /**
   * Marca (ou desmarca) uma linha como EXTRA.
   *
   * É isto que faz a mesma proposta ter uma versão base e uma versão com
   * extras: o casal pede "uma coisa mais simples e outra com tudo", e a
   * alternativa era duas propostas — dois documentos a divergir, e ao fim de
   * duas semanas ninguém saber qual é a que vale.
   */
  function updateBudgetExtraFlag(i: number, extra: boolean) {
    setDoc((d) => marcarExtra(d as ProposalDoc, i, extra) as StudioDoc);
  }

  // ── Budget: organizacao (per-item rows) ──
  function addBudgetRow() {
    setDoc((d) => ({ ...d, budgetRows: [...(d.budgetRows ?? []), { item: "", price: "" }] }));
  }
  function updateBudgetRow(i: number, p: Partial<{ item: string; price: string }>) {
    setDoc((d) => ({
      ...d,
      budgetRows: (d.budgetRows ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));
  }
  /**
   * Remover uma linha do orçamento de organização — ANULAR, pela mesma razão
   * escrita em `removeBudgetItem`: é frequente, é barato de refazer, e uma
   * pergunta por linha é um editor que ninguém usa.
   *
   * Aqui o valor é TEXTO («1.500,00 €», às vezes «a combinar»), por isso a
   * barra diz o que lá estava escrito, à letra, em vez de o tentar somar.
   */
  function removeBudgetRow(i: number) {
    const linha = (doc.budgetRows ?? [])[i];
    const nome = (linha?.item ?? "").trim();
    const valor = (linha?.price ?? "").trim();
    if (nome !== "" || valor !== "") {
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Linha «${nome || `sem nome (${i + 1})`}» removida do orçamento` +
          (valor ? ` — valia ${valor}.` : "."),
      });
    }
    setDoc((d) => ({ ...d, budgetRows: (d.budgetRows ?? []).filter((_, j) => j !== i) }));
  }

  return {
    addBudgetItem,
    addBudgetRow,
    definirEscala,
    definirUnitario,
    dividirEmSubpontos,
    mudarSubpontos,
    removeBudgetItem,
    removeBudgetRow,
    updateBudgetArtigo,
    updateBudgetExtraFlag,
    updateBudgetItem,
    updateBudgetPrice,
    updateBudgetRow,
    updateExtraArtigo,
  };
}
