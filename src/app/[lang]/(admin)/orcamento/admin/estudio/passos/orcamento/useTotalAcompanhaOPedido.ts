"use client";
import { useEffect } from "react";
import {
  totalAmountParaBase,
  detectVatMode,
  DEFAULT_VAT_RATE,
  type VatMode,
} from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import { baseDoPedidoParaOEcra } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useTotalDaProposta } from "./useTotalDaProposta";
import type { RefObject } from "react";

export interface EntradaTotalAcompanhaOPedido {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  hydratedRef: RefObject<boolean>;
  quote: Quote;
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useTotalAcompanhaOPedido({
  documento,
  hydratedRef,
  quote,
  total,
}: EntradaTotalAcompanhaOPedido) {
  const { setDoc } = documento;
  const { doPedidoVistoRef, precoEnviadoRef, setTotalInput } = total;

  // ── O preço mudou na Gestão do pedido: aparece aqui ─────────────────────
  // O outro sentido do mesmo número. Sem isto voltava a haver duas verdades:
  // alterar o "Preço final" no pedido não mexia no estúdio, e o PDF saía com o
  // valor antigo.
  //
  // `precoEnviado` evita o ciclo: quando a mudança veio DAQUI, o valor que
  // volta é o que acabámos de mandar e não há nada a fazer.
  useEffect(() => {
    const doPedido = quote.quotedPrice;
    // Primeiro a pergunta certa: MUDOU o que vem de fora? A montagem também
    // corre este efeito, e na montagem não mudou nada. Ver `doPedidoVisto`.
    const mudou = doPedido !== doPedidoVistoRef.current;
    doPedidoVistoRef.current = doPedido;
    if (!hydratedRef.current) return;
    if (!mudou) return;
    if (doPedido === precoEnviadoRef.current) return;
    precoEnviadoRef.current = doPedido;
    setDoc((d) => {
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      // O pedido guarda o que o casal paga sem IVA; o campo do estúdio mostra
      // só a parte dos serviços quando os adicionais somam. Ver o par de
      // conversões acima.
      const paraOEcra =
        typeof doPedido === "number" && doPedido > 0 ? baseDoPedidoParaOEcra(doPedido, d) : null;
      // Pela mesma razão da abertura: quando a conta não dá, não se apaga o que
      // lá está. Antes, o campo esvaziava-se e o total do documento ia com ele.
      if (paraOEcra == null && typeof doPedido === "number" && doPedido > 0) return d;
      setTotalInput(paraOEcra != null ? textoDoTotal(paraOEcra) : "");
      const amount =
        paraOEcra != null
          ? totalAmountParaBase(paraOEcra, mode, d.vatRate ?? DEFAULT_VAT_RATE)
          : undefined;
      const text = amount == null ? "" : mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
      return d.template === "organizacao"
        ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
    });
  }, [quote.quotedPrice, doPedidoVistoRef, hydratedRef, precoEnviadoRef, setDoc, setTotalInput]);
}
