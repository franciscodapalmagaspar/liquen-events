"use client";

import type { ActionDispatch, SetStateAction } from "react";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { camposPorTraduzir, escreverEn } from "@/lib/proposal-doc-bilingue";
import { type IdiomaDaProposta } from "@/lib/orcamento/listas-fechadas";
import {
  corrigirGralha,
  corrigirTudo,
  gralhasDoDocumento,
  tirarSimbolos,
  type CampoPublicado,
} from "@/lib/proposal-ortografia";
import Gralhas from "../../../Gralhas";
import PorTraduzir from "../../../PorTraduzir";
import type { useToast } from "../../../Toast";

/**
 * O texto que sai impresso, revisto antes de seguir: as gralhas (e os
 * símbolos a mais) e, com «Inglês» escolhido, o que ficou por traduzir.
 */
export function RevisaoDoTexto({
  doc,
  idiomaDoPdf,
  irParaCampo,
  setDoc,
  toast,
}: {
  doc: StudioDoc;
  idiomaDoPdf: IdiomaDaProposta;
  irParaCampo: (campo: CampoPublicado, versao?: "pt" | "en") => void;
  setDoc: ActionDispatch<[u: SetStateAction<StudioDoc>]>;
  toast: ReturnType<typeof useToast>["toast"];
}) {
  return (
    <>
      {/* Os acentos que faltam nos campos que saem impressos. Aqui, ao
            pé da Conferência, e não a meio de escrever: a palavra ainda
            está a ser escrita quando o aviso apareceria. */}
      <Gralhas
        doc={doc as ProposalDoc}
        onCorrigir={(g) => {
          setDoc((d) => corrigirGralha(d, g));
          // A palavra muda num campo que pode estar a catorze páginas
          // daqui, dentro de uma secção que não se está a ver. No sítio
          // do clique só se vê a linha sair desta lista — e uma linha a
          // desaparecer não diz o que ficou escrito lá em cima.
          //
          // Com as duas palavras e o campo, é a mesma prestação de
          // contas que o «Corrigir as N» ao lado já fazia com o número.
          toast(`«${g.escrita}» passou a «${g.sugerida}» — ${g.rotulo}.`, "info");
        }}
        onIr={(g) => irParaCampo(g.campo)}
        onTirarSimbolos={(s) => {
          setDoc((d) => tirarSimbolos(d, s));
          toast(`Tirei ${s.simbolos.join(" ")} — ${s.rotulo}.`, "info");
        }}
        onIrAosSimbolos={(s) => irParaCampo(s.campo)}
        onCorrigirTudo={() => {
          const quantas = gralhasDoDocumento(doc as ProposalDoc).length;
          setDoc((d) => corrigirTudo(d));
          toast(quantas === 1 ? "1 palavra corrigida." : `${quantas} palavras corrigidas.`, "info");
        }}
      />
      {/* ── O QUE VAI SAIR EM PORTUGUÊS ─────────────────────────────
            Logo a seguir às Gralhas, e SÓ com «Inglês» escolhido: numa
            proposta portuguesa não há nada por traduzir, e uma secção
            vazia a dizê-lo era ruído no ecrã de toda a gente. */}
      {idiomaDoPdf === "en" && (
        <PorTraduzir
          doc={doc as ProposalDoc}
          onFicarEmPortugues={(c) => setDoc((d) => escreverEn(d, c.campo, c.texto))}
          onFicarTodosEmPortugues={() => {
            const faltam = camposPorTraduzir(doc as ProposalDoc);
            setDoc((d) => {
              let saida = d;
              for (const c of faltam) saida = escreverEn(saida, c.campo, c.texto);
              return saida;
            });
            toast(
              faltam.length === 1
                ? "1 campo fica em português."
                : `${faltam.length} campos ficam em português.`,
              "info",
            );
          }}
          onIr={(c) => irParaCampo(c.campo, "en")}
        />
      )}
    </>
  );
}
