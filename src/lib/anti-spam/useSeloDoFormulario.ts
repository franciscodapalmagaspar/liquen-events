"use client";

import { useCallback, useEffect, useRef } from "react";
import { quantoFaltaEsperar } from "./tempo-minimo";

/**
 * Pede o selo da armadilha de tempo quando o formulário MONTA (não no primeiro
 * toque): com o preenchimento automático, entre o primeiro toque e o «Enviar»
 * podem passar menos de três segundos a uma pessoa verdadeira. Entre abrir a
 * página e enviar, quase nunca.
 *
 * Devolve uma função ASSÍNCRONA, para chamar já com o «A enviar…» no ecrã.
 * Guarda a hora a que o selo chegou e, se ela carregar em «Enviar» antes dos
 * 3 s (e da folga, `tempo-minimo.ts`), espera o que falta e só depois devolve
 * o selo. Assim um pedido verdadeiro nunca chega ao servidor como «depressa».
 * (Mesmo que chegasse, o servidor só o marcava como «possível spam» — nunca o
 * deita fora: `veredito.ts`.)
 *
 * Se o pedido do selo falhou (rede, página antiga), devolve `""` logo, sem
 * esperar: o servidor trata um selo em falta como um pedido normal. NUNCA se
 * pede o selo no momento do envio — esse selo diria «aberto agora».
 */
export function useSeloDoFormulario(): () => Promise<string> {
  const selo = useRef("");
  // `performance.now()` e não `Date.now()`: não anda para trás quando o
  // telemóvel acerta o relógio.
  const recebidoEm = useRef<number | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch("/api/orcamento/selo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { selo?: unknown } | null) => {
        if (vivo && typeof j?.selo === "string") {
          selo.current = j.selo;
          recebidoEm.current = performance.now();
        }
      })
      .catch(() => {
        /* sem selo: o envio segue sem ele — ver o cabeçalho */
      });
    return () => {
      vivo = false;
    };
  }, []);
  return useCallback(async () => {
    if (!selo.current || recebidoEm.current === null) return "";
    const falta = quantoFaltaEsperar(recebidoEm.current, performance.now());
    if (falta > 0) await new Promise((r) => setTimeout(r, falta));
    return selo.current;
  }, []);
}
