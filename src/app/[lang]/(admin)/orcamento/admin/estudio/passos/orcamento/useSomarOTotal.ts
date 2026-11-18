"use client";
import { useEffect, useRef } from "react";
import { desalinhamento, dinheiroDaProposta } from "@/lib/proposal-budget";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useCamposPorConfirmar } from "../../versoes/useCamposPorConfirmar";
import { useTotalDaProposta } from "./useTotalDaProposta";

export interface EntradaSomarOTotal {
  camposPorConfirmar: ReturnType<typeof useCamposPorConfirmar>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useSomarOTotal({ camposPorConfirmar, documento, total }: EntradaSomarOTotal) {
  const { confirmado } = camposPorConfirmar;
  const { doc } = documento;
  const { onTotalInput } = total;

  /**
   * ── O TOTAL É A SOMA (5/11) ─────────────────────────────────────────────
   * Ela: «a pessoa que está a fazer a proposta vai colocando os serviços e o
   * valor. E depois, no final, o sistema soma os valores todos, dos serviços
   * todos, da deslocação e tudo mais, e dá o valor final.»
   *
   * Quando ELA muda o preço de uma linha (escrever, apagar a linha, mudar a
   * escala), o total passa a ser a soma — com os adicionais, que já entravam
   * no total pelo `definirExtras`. Só nesses gestos, e nunca ao abrir: uma
   * proposta antiga com o total escrito à mão não muda sozinha por ser aberta
   * (fica o aviso e o «Usar …» de sempre).
   */
  const somarOTotalRef = useRef(false);
  useEffect(() => {
    if (!somarOTotalRef.current) return;
    somarOTotalRef.current = false;
    const d = desalinhamento(doc, dinheiroDaProposta(doc).base);
    if (!d || !(d.sugerido > 0)) return;
    confirmado("totalAmount");
    onTotalInput(textoDoTotal(d.sugerido));
    // Só os preços das linhas disparam isto; as funções são as deste render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.budgetAmounts, doc.budgetItems]);

  return { somarOTotalRef };
}
