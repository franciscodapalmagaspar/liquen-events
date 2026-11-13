"use client";

import { useEffect, useState } from "react";
import { todayKey } from "./util";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DIA DE HOJE QUE MUDA À MEIA-NOITE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O «Hoje» lia `todayKey()` no render — e o render só volta a correr quando
 * alguma coisa muda. Com o back office aberto de um dia para o outro (é como
 * ela o usa), o bloco continuava na manhã seguinte a mostrar as tarefas e os
 * eventos de ONTEM como sendo de hoje.
 *
 * Um temporizador só, para a próxima meia-noite local (nenhuma sondagem), e o
 * regresso ao separador — um portátil que dormiu a noite inteira não corre
 * temporizadores, e é ao abrir a tampa que o dia tem de estar certo.
 */
export function useDiaDeHoje(): string {
  const [hoje, setHoje] = useState(todayKey);

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    const acertar = () => setHoje(todayKey());
    const agendar = () => {
      const agora = new Date();
      const meiaNoite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1);
      // Um segundo depois, para não acordar ainda no dia que está a acabar.
      temporizador = setTimeout(
        () => {
          acertar();
          agendar();
        },
        meiaNoite.getTime() - agora.getTime() + 1000,
      );
    };
    const aoVoltar = () => {
      if (document.visibilityState === "visible") acertar();
    };
    agendar();
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, []);

  return hoje;
}
