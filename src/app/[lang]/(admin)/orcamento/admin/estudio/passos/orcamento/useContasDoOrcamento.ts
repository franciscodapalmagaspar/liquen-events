"use client";
import { useMemo } from "react";
import { ordemDeSaida } from "@/lib/proposal-ordem";
import { opcionaisDe } from "@/lib/orcamento/versoes-da-proposta";
import { convidadosDoDoc, escalasDe } from "@/lib/orcamento/escala";
import {
  artigosDasLinhas,
  servicosForaDoOrcamento,
  subpontosDe,
} from "@/lib/orcamento/artigos-de-faturacao";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { linhasDe, precosDe } from "@/lib/proposal-budget";
import { contagemDePrecos } from "@/lib/orcamento/estudio/precos-e-iva";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";

export interface EntradaContasDoOrcamento {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
}

export function useContasDoOrcamento({ documento }: EntradaContasDoOrcamento) {
  const { doc } = documento;
  /**
   * Quantas linhas do orçamento já têm preço.
   *
   * Sai de `precosDe` e não de contar campos no ecrã: os preços são um array
   * paralelo às linhas, e é a biblioteca que garante que os dois têm o mesmo
   * comprimento.
   */
  const precos = precosDe(doc);
  const contagem = contagemDePrecos(precos);
  /** Quantas pessoas, lido do campo do documento ("125 pax" → 125). */
  const convidados = convidadosDoDoc(doc as ProposalDoc);
  const escalasDoDoc = escalasDe(doc as ProposalDoc);
  const extrasDoDoc = opcionaisDe(doc as ProposalDoc);
  // O artigo do Moloni de cada linha (5/11) — só para a faturação.
  const artigosDoDoc = artigosDasLinhas(doc as ProposalDoc);
  const subpontosDoDoc = subpontosDe(doc as ProposalDoc);
  const servicosAOrcamentar =
    doc.template !== "organizacao" ? servicosForaDoOrcamento(doc as ProposalDoc) : [];

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A ORDEM QUE VAI SAIR IMPRESSA, MOSTRADA AQUI
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, duas vezes: na lista de Serviços é Cerimónia →
   * Complementos → Cocktail → Jantar, no Orçamento é Cerimónia → Cocktail →
   * Jantar → Complementos. As mesmas rubricas, duas ordens.
   *
   * A regra que as alinha já existia — mas dentro de `proposal-doc-pdf.ts`,
   * que é `server-only`. O PDF saía certo e o ECRÃ continuava a mostrar a
   * ordem de escrita, portanto o que ela via era a divergência, sempre. A
   * regra mudou-se para `proposal-ordem.ts` e é agora a MESMA chamada dos
   * dois lados: estas duas linhas e as duas do gerador.
   *
   * As listas por baixo percorrem estes índices e não `map((_, i) =>`. O
   * índice que sai daqui é o VERDADEIRO — o do array — e é esse que os
   * botões recebem: o que muda é a ordem por que se desenham, não onde se
   * escreve.
   */
  const linhasDoOrcamento = linhasDe(doc);
  /*
    ── SÓ SE RECALCULA QUANDO MUDA O QUE A DECIDE (10/11) ──────────────────
    Ela: «está a travar imenso». A ordem depende dos TÍTULOS (dos grupos de
    serviços, das linhas e das páginas) e da marca de ordem explícita — não do
    texto de uma descrição. Corria a cada letra escrita em qualquer campo; o
    perfil mostrou ~100 ms em 21 letras só aqui. Com a chave dos títulos, só
    corre quando um título muda — e o array devolvido fica o MESMO entre
    letras, o que deixa os filhos que o recebem sem razão para se redesenhar.
  */
  // `JSON.stringify` e não um `join`: com um `join`, nenhuma linha e UMA linha
  // ainda sem nome davam a mesma chave, e a linha acabada de acrescentar não
  // aparecia (apanhado pelo teste «mostra a conta ao lado do número»).
  const chaveDosRotulosDoOrcamento = JSON.stringify(linhasDoOrcamento.map((l) => l.item ?? ""));
  // `ordemDosCapitulos` lê o título de cada grupo E os rótulos das linhas dele.
  const chaveDosCapitulos = JSON.stringify(
    (doc.serviceGroups ?? []).map((g) => [
      g.title ?? "",
      ...(g.items ?? []).map((it) => it.label ?? ""),
    ]),
  );
  const ordemDoOrcamento = useMemo(
    () => ordemDeSaida(doc as ProposalDoc, linhasDoOrcamento, (l) => l.item ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave diz o que decide
    [chaveDosRotulosDoOrcamento, chaveDosCapitulos, doc.ordemExplicita],
  );

  return {
    artigosDoDoc,
    chaveDosCapitulos,
    contagem,
    convidados,
    escalasDoDoc,
    extrasDoDoc,
    linhasDoOrcamento,
    ordemDoOrcamento,
    servicosAOrcamentar,
    subpontosDoDoc,
  };
}
