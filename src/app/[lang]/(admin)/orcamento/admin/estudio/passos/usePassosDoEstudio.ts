"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { rolarAteVer } from "@/lib/motion/rolar";
import type { Step } from "../tipos";

export function usePassosDoEstudio() {
  // Fluxo guiado: Conteúdo → Pré-visualizar → Enviar.
  const [step, setStep] = useState<Step>("evento");
  /**
   * ── MUDAR DE PASSO SOBE AO TOPO DO PASSO NOVO ─────────────────────────────
   * O `setStep` sozinho trocava o conteúdo sem mexer no rolo: vinda do fundo
   * do passo 1, ela aterrava a meio do passo 2, com o título dele 175–230 px
   * acima do ecrã (auditoria do telemóvel, 14/11). A barra dos passos e o
   * «Anterior / Seguinte» passam por aqui; os saltos para uma falta ou um campo
   * (`irParaAFalta`, `irParaCampo`) NÃO, porque esses levam a vista ao campo.
   *
   * O rolo é feito no efeito logo a seguir, depois de o passo novo estar
   * desenhado — antes disso o contentor ainda tem a altura do anterior.
   */
  // Um contador e não uma bandeira: tocar no passo onde já se está não muda o
  // `step`, e uma bandeira ficava levantada até ao próximo salto para uma falta.
  const [subidaAoPasso, setSubidaAoPasso] = useState(0);
  const formularioDosPassos = useRef<HTMLDivElement>(null);
  const passoDoEnvio = useRef<HTMLDivElement>(null);
  const irParaPasso = useCallback((p: Step) => {
    setStep(p);
    setSubidaAoPasso((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!subidaAoPasso) return;
    const alvo = step === "enviar" ? passoDoEnvio.current : formularioDosPassos.current;
    if (!alvo) return;
    // Só sobe se o início do passo ficou ACIMA do que se vê por baixo das
    // barras coladas (o `scroll-mt` dele é essa altura). Quem já está no topo
    // não é sacudido.
    const margem = parseFloat(getComputedStyle(alvo).scrollMarginTop) || 0;
    if (alvo.getBoundingClientRect().top < margem - 1) rolarAteVer(alvo, { block: "start" });
    // O `step` é lido no momento do pedido; quem manda correr é o contador.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subidaAoPasso]);

  return { formularioDosPassos, irParaPasso, passoDoEnvio, setStep, step };
}
