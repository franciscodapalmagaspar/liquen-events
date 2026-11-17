"use client";

import { useEffect, useRef } from "react";

/**
 * Pede o selo da armadilha de tempo quando o formulário MONTA (não no primeiro
 * toque): com o preenchimento automático, entre o primeiro toque e o «Enviar»
 * podem passar menos de três segundos a uma pessoa verdadeira, e o sucesso
 * fingido apanhava-a. Entre abrir a página e enviar, não.
 *
 * Devolve uma função que lê o selo no instante do envio. Se o pedido do selo
 * falhou (rede, página antiga), lê `""` e o envio segue sem ele: o servidor não
 * conta um selo em falta como spam (`selo.ts`). NUNCA se pede o selo no
 * momento do envio — esse selo diria «aberto agora» e passava por robô.
 */
export function useSeloDoFormulario(): () => string {
  const selo = useRef("");
  useEffect(() => {
    let vivo = true;
    fetch("/api/orcamento/selo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { selo?: unknown } | null) => {
        if (vivo && typeof j?.selo === "string") selo.current = j.selo;
      })
      .catch(() => {
        /* sem selo: o envio segue sem ele — ver o cabeçalho */
      });
    return () => {
      vivo = false;
    };
  }, []);
  return () => selo.current;
}
