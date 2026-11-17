"use client";

import { lerPartilhado } from "@/lib/leitura-partilhada";
import { useEffect } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useEstadoDoEnvio } from "./useEstadoDoEnvio";

export interface EntradaLinkDaPropostaEnviada {
  envio: ReturnType<typeof useEstadoDoEnvio>;
  quote: Quote;
}

export function useLinkDaPropostaEnviada({ envio, quote }: EntradaLinkDaPropostaEnviada) {
  const { setLinkDaProposta } = envio;

  /**
   * O link da proposta já enviada, lido UMA vez ao abrir o estúdio — para o
   * botão «Copiar resumo» funcionar mesmo sem passar pelo «Enviar» nesta
   * sessão (reabrir o estúdio de uma proposta enviada ontem, por exemplo).
   * Se falhar, o botão simplesmente sai sem o link — o resumo continua a
   * servir sem ele, que é o comportamento normal de uma proposta por enviar.
   */
  useEffect(() => {
    let vivo = true;
    lerPartilhado(`/api/orcamento/${quote.id}/proposta-doc`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { acceptUrl?: string | null } | null) => {
        if (vivo && data?.acceptUrl) setLinkDaProposta(data.acceptUrl);
      })
      .catch(() => {
        /* sem link, o resumo sai sem ele */
      });
    return () => {
      vivo = false;
    };
  }, [quote.id]);
}
