"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CONTAGEM_VAZIA, comAcontecimento, totalAte, type Contagem } from "@/lib/tempo-activo";
import type { Quote } from "@/lib/orcamento/types";

export interface EntradaTempoNaProposta {
  quote: Quote;
}

export function useTempoNaProposta({ quote }: EntradaTempoNaProposta) {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO QUE ESTA PROPOSTA CUSTOU MESMO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «não relógio de parede: tempo com a página em foco».
   *
   * A contagem vive numa `ref` e não em estado: um acontecimento por tecla
   * escrita a redesenhar o estúdio inteiro seria pagar em fluidez o preço de
   * medir a fluidez. O ecrã lê-a de meio em meio minuto, que é o passo a que o
   * número muda.
   *
   * A regra do que conta está em `tempo-activo.ts`, com relógio injectado e
   * testes — incluindo o caso que estraga qualquer medição destas: o ecrã que
   * ficou aberto enquanto ela foi ao telefone.
   */
  const tempo = useRef<Contagem>(CONTAGEM_VAZIA);
  const [tempoMostrado, setTempoMostrado] = useState(0);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO SOBE PARA O SERVIDOR — E SOBE EM PEDAÇOS, NÃO EM TOTAIS
   * ════════════════════════════════════════════════════════════════════════
   *
   * A pergunta que motiva tudo isto é «que boards custam mais tempo?», e essa
   * pergunta atravessa PROPOSTAS e APARELHOS. Guardado no `localStorage`, o
   * total seria o deste computador — e uma proposta começada no portátil e
   * acabada no tablet contaria metade em cada sítio.
   *
   * Envia-se o INCREMENTO desde o último envio, e o servidor soma. Se se
   * enviasse o total, dois separadores abertos na mesma proposta escreviam um
   * por cima do outro e ficava só o do último a falar.
   *
   * O que já foi enviado vive numa `ref`: é o ponto de referência do próximo
   * incremento, e não tem nada que redesenhar o ecrã quando muda.
   */
  const tempoEnviado = useRef(0);
  /**
   * A secção onde ela está agora, vinda da coluna lateral (que já a calcula).
   *
   * Numa `ref` e não em estado: muda a cada scroll, e o número que ela alimenta
   * só é lido de meio em meio minuto. Em estado, rolar a página redesenhava o
   * estúdio inteiro para não mudar nada no ecrã.
   */
  const seccaoActivaRef = useRef<string | null>(null);
  const anotarSeccao = useCallback((id: string | null) => {
    seccaoActivaRef.current = id;
  }, []);
  const reportarTempo = useCallback(
    (total: number, aFechar = false) => {
      const delta = Math.round(total - tempoEnviado.current);
      // Menos de um segundo não vale um pedido. A `ref` não avança, portanto
      // este bocadinho não se perde: vai no envio seguinte.
      if (delta < 1000) return;
      tempoEnviado.current = total;
      const seccao = seccaoActivaRef.current;
      const corpo = JSON.stringify({ ms: delta, ...(seccao ? { seccao } : {}) });
      const url = `/api/orcamento/${quote.id}/tempo-activo`;
      if (aFechar && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // O beacon sobrevive à página; um `fetch` não.
        try {
          navigator.sendBeacon(url, new Blob([corpo], { type: "application/json" }));
          return;
        } catch {
          /* sem beacon — tenta pelo caminho normal, que ainda pode chegar */
        }
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        keepalive: aFechar,
      }).catch(() => {
        // Sem rede o pedaço perde-se, e isso é aceitável: é uma MEDIÇÃO, não
        // trabalho. Interromper quem está a montar uma proposta para lhe falar
        // de um número que ela não pediu seria trocar o essencial pelo
        // acessório.
      });
    },
    [quote.id],
  );
  useEffect(() => {
    const sinal = (tipo: "vida" | "pausa") => () => {
      tempo.current = comAcontecimento(tempo.current, { tipo, em: Date.now() });
    };
    const vivo = sinal("vida");
    const parado = sinal("pausa");
    const aoMudarDeFoco = () => (document.hidden ? parado() : vivo());
    for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
      window.addEventListener(ev, vivo, { passive: true });
    }
    window.addEventListener("focus", vivo);
    window.addEventListener("blur", parado);
    document.addEventListener("visibilitychange", aoMudarDeFoco);
    vivo();
    // Meio minuto: o número mostrado é em minutos, portanto qualquer passo mais
    // curto seria trabalho para não mudar nada no ecrã. É também o passo a que
    // o tempo sobe para o servidor — o mesmo relógio serve as duas coisas.
    const relogio = setInterval(() => {
      const total = totalAte(tempo.current, Date.now());
      setTempoMostrado(total);
      reportarTempo(total);
    }, 30_000);
    /**
     * ── AO FECHAR, O QUE FALTAVA ─────────────────────────────────────────
     *
     * O passo é de meio minuto, portanto fechar o separador deixava sempre
     * para trás até meio minuto — e, num dia de trabalho partido em muitas
     * aberturas curtas, «até meio minuto de cada vez» deixa de ser arredondar
     * e passa a ser um viés sempre para baixo.
     *
     * `sendBeacon` e não `fetch`: um `fetch` disparado no `pagehide` é
     * cancelado com a página. O beacon é entregue pelo browser depois de o
     * separador morrer, que é precisamente o que aqui se quer.
     */
    const aoFechar = () => reportarTempo(totalAte(tempo.current, Date.now()), true);
    window.addEventListener("pagehide", aoFechar);
    return () => {
      for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
        window.removeEventListener(ev, vivo);
      }
      window.removeEventListener("focus", vivo);
      window.removeEventListener("blur", parado);
      document.removeEventListener("visibilitychange", aoMudarDeFoco);
      window.removeEventListener("pagehide", aoFechar);
      clearInterval(relogio);
      // Trocar de cliente também fecha esta medição: sem isto, o tempo desde o
      // último passo ficava por contar em todas as trocas.
      aoFechar();
    };
  }, [reportarTempo]);

  return { anotarSeccao, tempoMostrado };
}
