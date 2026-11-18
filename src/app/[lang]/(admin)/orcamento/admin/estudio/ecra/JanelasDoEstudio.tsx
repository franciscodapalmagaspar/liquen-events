"use client";

import LupaDeFotos from "../../LupaDeFotos";
import { VerOPdfNoEcra } from "../../VerOPdfNoEcra";
import { Button } from "../../ui";
import { guardarNoDisco } from "../envio/pdf-no-ecra";
import { EscolhaDaFotoDaPagina } from "./pdf/EscolhaDaFotoDaPagina";
import ThemePicker from "../../ThemePicker";
import { MAXIMO_POR_PAGINA } from "@/lib/pdf-editorial/plano";
import { useEstudio } from "../contexto";

/**
 * NOTA SOBRE A BARRA ACIMA, medida a 375 px num iPhone SE:
 * o `flex-wrap` estava a partir de 640 px (`sm:flex-wrap`), e abaixo
 * disso a barra era uma fila rígida. No último passo ela leva o
 * «← Pré-visualizar» e o «Gerar e enviar ao cliente» lado a lado: 222 px
 * de botão numa barra de 351 px, com o botão a acabar em 390 px de um
 * ecrã de 375. O último toque de toda a jornada de escrever uma proposta
 * ficava cortado, e a 320 px faltavam 70 px.
 *
 * O `flex-wrap` passa a valer em todas as larguras: quando não cabem
 * lado a lado, o botão principal desce para a linha de baixo, inteiro.
 * Acima de 640 px nada muda, porque aí já cabiam.
 *
 * A fotografia em grande, com as setas a percorrer as deste board.
 */
export function JanelasDoEstudio() {
  const {
    avisoDeQualidade,
    accoesDoDocumento: { confirmarPdfVisto },
    adiamento: { perguntaDoEnvioDesdeRef },
    biblioteca: { onDroppedFromLibrary, onPickedFromLibrary, onReservedFromLibrary },
    botaoDoEnvio: { soFaltaVerOPdf },
    documento: { doc },
    envio: { pdfNoEcra, pdfVisto, setConfirmSend, setPdfNoEcra },
    escolha: { lupa, picker, pickerNoEcra, setLupa, setPicker },
    fotos: { assetOriginais, assetUrls },
    fotosUsadasNoutras: { usadasNoutras, usedThemePaths },
    ocupado: { busy },
    pedido: { quote },
    pronta: { pdfVistoAgora },
  } = useEstudio();
  return (
    <>
      {lupa && (
        <LupaDeFotos
          aberta
          titulo={doc.moodBoards[lupa.bi]?.title ?? ""}
          urls={(doc.moodBoards[lupa.bi]?.images ?? []).map(
            (p) => assetOriginais[p] ?? assetUrls[p],
          )}
          indice={lupa.ii}
          onFechar={() => setLupa(null)}
          onMudar={(ii) => setLupa((l) => (l ? { ...l, ii } : l))}
        />
      )}

      {pdfNoEcra && (
        <VerOPdfNoEcra
          key={pdfNoEcra.id}
          aberto
          blob={pdfNoEcra.blob}
          titulo={pdfNoEcra.rascunho ? "Rascunho da proposta" : "O PDF final"}
          onFechar={() => setPdfNoEcra(null)}
          accoes={
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => guardarNoDisco(pdfNoEcra.blob, pdfNoEcra.nome)}
                iconRight={<span aria-hidden="true">↓</span>}
              >
                Descarregar
              </Button>
              {!pdfNoEcra.rascunho && pdfVistoAgora && !pdfVisto?.confirmado && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => {
                    confirmarPdfVisto(true);
                    setPdfNoEcra(null);
                    // Quando ver o PDF era a ÚNICA coisa que faltava, segue
                    // logo para a pergunta de sempre — como o botão da barra.
                    if (soFaltaVerOPdf) {
                      perguntaDoEnvioDesdeRef.current = performance.now();
                      setConfirmSend(true);
                    }
                  }}
                  iconRight={<span aria-hidden="true">→</span>}
                >
                  {soFaltaVerOPdf ? "Está certo — enviar" : "Está certo"}
                </Button>
              )}
            </>
          }
        />
      )}

      <EscolhaDaFotoDaPagina />

      {avisoDeQualidade.dialogo}
      {pickerNoEcra && (
        <ThemePicker
          aberto={picker !== null}
          quoteId={quote.id}
          // A trocar UMA foto no lugar, escolher várias não faz sentido: as
          // outras iriam para o fim e a troca deixava de ser uma troca.
          multiple={pickerNoEcra.kind === "board" && pickerNoEcra.substituir === undefined}
          usedThemePaths={usedThemePaths}
          usadasNoutras={usadasNoutras}
          onClose={() => setPicker(null)}
          onPicked={onPickedFromLibrary}
          onReserve={onReservedFromLibrary}
          onDropped={onDroppedFromLibrary}
          lugar={
            pickerNoEcra.kind === "board"
              ? "tema"
              : pickerNoEcra.kind === "cover"
                ? "capa"
                : "pagina"
          }
          /* ── A PÁGINA QUE SE ESTÁ A COMPOR ─────────────────────────────
             Só para os mood boards: um mood board É uma página do PDF, com
             `MAXIMO_POR_PAGINA` fotos por página (acima disso, duas). As
             capas são uma foto por espaço — não há conjunto nenhum a compor, e
             o canto não teria o que dizer.

             Fora também quando se está a TROCAR uma foto no lugar: aí a página
             não cresce, e um contador a somar mais uma seria mentira. */
          paginaEmConstrucao={
            pickerNoEcra.kind === "board" && pickerNoEcra.substituir === undefined
              ? {
                  titulo: doc.moodBoards[pickerNoEcra.bi]?.title,
                  fotos: (doc.moodBoards[pickerNoEcra.bi]?.images ?? []).map((path) => ({
                    path,
                    url: assetUrls[path],
                    // O plano B, como na grelha aqui ao lado: uma miniatura que
                    // não existe cai para o original em vez de dar o ícone de
                    // imagem partida.
                    planoB: assetOriginais[path],
                  })),
                  maximo: MAXIMO_POR_PAGINA,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
