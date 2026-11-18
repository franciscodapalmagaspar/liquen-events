"use client";

import { useEstudio } from "./contexto";

import { AvisoDoValorEnviado } from "./ecra/versoes/AvisoDoValorEnviado";
import { CabecalhoDoEstudio } from "./ecra/CabecalhoDoEstudio";

import { BarraDeBaixo } from "./ecra/barra/BarraDeBaixo";

import { JanelasDoEstudio } from "./ecra/JanelasDoEstudio";
import { PassoDeRever } from "./ecra/rever/PassoDeRever";
import { CorpoDoEstudio } from "./ecra/CorpoDoEstudio";
import { PassosDoEstudio } from "./ecra/PassosDoEstudio";
import { AvisosDoEstudio } from "./ecra/AvisosDoEstudio";

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
