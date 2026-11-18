"use client";

import { useEstudio } from "./contexto";
import {
  AvisoDoValorEnviado,
  AvisosDoEstudio,
  BarraDeBaixo,
  CabecalhoDoEstudio,
  CorpoDoEstudio,
  JanelasDoEstudio,
  PassoDeRever,
  PassosDoEstudio,
} from "./ecra";

/** O ecrã do «Fazer proposta»: só desenha o que o estúdio (o contexto) lhe dá. */
export function EcraDoEstudio() {
  const {
    barra: { caixaDoEstudio },
    pedido: { cliente },
  } = useEstudio();

  return (
    <div
      ref={caixaDoEstudio}
      className={`@container ${cliente ? "" : "border-t border-[var(--bo-hairline-strong)] pt-5"}`}
    >
      <CabecalhoDoEstudio />

      <AvisoDoValorEnviado />

      <AvisosDoEstudio />

      <PassosDoEstudio />
      <CorpoDoEstudio />
      <PassoDeRever />

      <BarraDeBaixo />

      <JanelasDoEstudio />
    </div>
  );
}
