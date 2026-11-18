"use client";

import { Section } from "../../formulario/Section";
import { AvisoDeOrdem } from "../../formulario/AvisoDeOrdem";
import { BarraDaSeleccao } from "../../fotos/BarraDaSeleccao";
import { MoodBoardsEIndice } from "./MoodBoardsEIndice";
import CoresDaPaleta from "../../../CoresDaPaleta";
import { paletaDaProposta } from "@/lib/proposal-doc";
import EditorDeEscolhas from "../../../EditorDeEscolhas";
import { useEstudio } from "../../contexto";

/**
 * Mood boards — decoracao only
 */
export function SeccaoDosMoodBoards() {
  const {
    documento: { doc, patch },
    fotosDosBoards: { moverSeleccaoParaBoard },
    nota: { notaDaSeccao },
    ordem: { fixarOrdem, ordemSugerida },
    paginasDaProposta: { contagemDosBoards },
    paleta: { fotosDaPaleta, mudarPaleta, refsDaPaleta },
    passos: { step },
    pedido: { quote },
    pronta: { fotosParaEscolhas, isDeco },
    seleccao: { seleccionadas, setSeleccionadas },
    traducoes: { bilingue },
  } = useEstudio();
  return (
    <>
      {isDeco && (
        <Section
          title="Mood boards"
          id="moodboards"
          escondida={step !== "inspiracao"}
          nota={contagemDosBoards}
          rodape={notaDaSeccao("moodboards", "Nota sobre os mood boards")}
        >
          <p className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-text-muted)]">
            grupos de imagens de inspiração para o cliente
          </p>
          <AvisoDeOrdem
            mostrar={ordemSugerida}
            onde="As páginas de inspiração"
            onFixar={fixarOrdem}
          />
          <BarraDaSeleccao
            quantas={seleccionadas.size}
            boards={doc.moodBoards}
            onMover={moverSeleccaoParaBoard}
            onLimpar={() => setSeleccionadas(new Set())}
          />
          <MoodBoardsEIndice />

          {/* ── AS CORES DA PALETA, ESCOLHIDAS POR ELA (13/11) ─────────
                  «A minha mãe quer ser ela a escolher as cores.» À vista, aqui,
                  onde estão as fotografias — e não só no «Mudar fotografia» da
                  página. As mesmas cores vão para o PDF e para a proposta
                  online; sem escolha dela, saem as sugeridas pelas flores. */}
          {fotosDaPaleta.length > 0 && (
            <div className="mt-8 border-t border-[var(--bo-hairline)] pt-6">
              <CoresDaPaleta
                quoteId={quote.id}
                fotos={fotosDaPaleta}
                refsDoPdf={refsDaPaleta}
                cores={paletaDaProposta(doc)}
                onMudar={mudarPaleta}
              />
            </div>
          )}

          {/* ── AS ALTERNATIVAS QUE O CASAL ESCOLHE (Fase 3) ───────────
                  Vive aqui dentro, e não numa secção própria: as alternativas
                  são visuais e as fotografias que as explicam já estão nestas
                  páginas. A razão longa está no cabeçalho do editor. */}
          {/* Só depois de haver inspiração — ou se já há alternativas
                    escritas, que nunca se escondem. */}
          {(doc.moodBoards.length > 0 || (doc.escolhas?.length ?? 0) > 0) && (
            <EditorDeEscolhas
              escolhas={doc.escolhas}
              fotos={fotosParaEscolhas}
              bilingue={bilingue}
              onChange={(escolhas) => patch({ escolhas })}
            />
          )}
        </Section>
      )}
    </>
  );
}
