"use client";

import { type CampoPublicado } from "@/lib/proposal-ortografia";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { camposPorRever, camposPorTraduzir } from "@/lib/proposal-doc-bilingue";
import { ESTADO, PRESSAO } from "../../ui/movimento";

/** O que muda em inglês — a mesma frase na folha do telemóvel e no painel da pastilha. */
export const RESSALVA_DO_INGLES =
  "Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a data e o tipo de evento. Da tua prosa sai em inglês o que estiver nas caixas «EN»; o que ficar em branco sai em português. Os valores continuam à portuguesa (1.234,56 €).";

/**
 * O QUE FALTA TRADUZIR, DITO ANTES DO CLIQUE.
 *
 * As duas contas, e as duas frases: «vai sair em português» é verdade sobre um
 * campo VAZIO e é falso sobre um desactualizado — esse tem inglês, só que no
 * inglês errado. Uma traduz-se, a outra relê-se. Vive aqui para a folha do
 * telemóvel e o painel do ecrã largo dizerem o mesmo.
 */
export function AvisoDasTraducoes({
  doc,
  onVer,
  alinhar = "direita",
}: {
  doc: ProposalDoc;
  onVer: (campo: CampoPublicado) => void;
  alinhar?: "direita" | "esquerda";
}) {
  const faltam = camposPorTraduzir(doc);
  const velhas = camposPorRever(doc).filter((c) => c.estado === "desactualizado");
  if (faltam.length === 0 && velhas.length === 0) return null;
  const primeiro = faltam[0] ?? velhas[0];
  return (
    <p
      aria-live="polite"
      className={`w-full ${alinhar === "direita" ? "text-right" : "text-left"} text-[11px] leading-snug text-[var(--bo-aviso)]`}
    >
      {faltam.length > 0 &&
        (faltam.length === 1
          ? "1 campo ainda não tem versão inglesa — vai sair em português."
          : `${faltam.length} campos ainda não têm versão inglesa — vão sair em português.`)}{" "}
      {velhas.length > 0 &&
        (velhas.length === 1
          ? "1 tradução ficou para trás do português."
          : `${velhas.length} traduções ficaram para trás do português.`)}{" "}
      <button
        type="button"
        onClick={() => onVer(primeiro.campo)}
        className={`font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
      >
        Ver quais
      </button>
    </p>
  );
}
