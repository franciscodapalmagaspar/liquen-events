"use client";

import EscolherFotoDaPagina from "../../../EscolherFotoDaPagina";
import CoresDaPaleta from "../../../CoresDaPaleta";
import { paletaDaProposta } from "@/lib/proposal-doc";
import { UploadArea } from "../../fotos/UploadArea";
import { useEstudio } from "../../contexto";

export function EscolhaDaFotoDaPagina() {
  const {
    carregamento: { uploading },
    carregar: { handleUpload },
    disposicao: { porFotoNaPagina, quantasNaPagina },
    documento: { doc },
    escolha: { picker, setPicker },
    fotos: { aspetosDasFotos, assetOriginais, assetUrls },
    fotosDaPagina: {
      enquadrarNaPagina,
      focosDaPagina,
      gravarFotosDaPagina,
      lugarDaFoto,
      lugaresDaPagina,
      paginaDaFoto,
      setLugarDaFoto,
      setPaginaDaFoto,
    },
    paginasDaProposta: { fotosDaProposta },
    paleta: { fotosDaPaleta, mudarPaleta, refsDaPaleta },
    pedido: { quote },
  } = useEstudio();
  return (
    <>
      {paginaDaFoto && (
        <EscolherFotoDaPagina
          aberto={paginaDaFoto !== null && picker === null}
          nome={paginaDaFoto.nome}
          max={paginaDaFoto.max}
          lugares={lugaresDaPagina(paginaDaFoto.chave).map((r) =>
            r
              ? {
                  ref: r,
                  url: assetUrls[r] ?? (r.startsWith("data:") ? r : undefined),
                  original: assetOriginais[r],
                }
              : null,
          )}
          escolhida={paginaDaFoto.chave === "capa" || !!doc.fotosDasPaginas?.[paginaDaFoto.chave]}
          podeVoltarAoAutomatico={paginaDaFoto.chave !== "capa"}
          lugar={lugarDaFoto}
          formas={paginaDaFoto.formas}
          focos={focosDaPagina(paginaDaFoto.chave)}
          focoDela={
            paginaDaFoto.chave === "capa"
              ? !!doc.focoDaCapa
              : !!doc.fotosDasPaginas?.[paginaDaFoto.chave]?.focos?.[lugarDaFoto]
          }
          aspetos={aspetosDasFotos}
          onFoco={(f) => enquadrarNaPagina(paginaDaFoto.chave, paginaDaFoto.nome, lugarDaFoto, f)}
          fotosDaProposta={fotosDaProposta}
          paleta={
            paginaDaFoto.chave === "ambiente" ? (
              // As MESMAS fotografias e a mesma sugestão da secção de cima — as
              // do PDF (13/11: aqui lia-se a miniatura, de outras fotografias).
              <CoresDaPaleta
                quoteId={quote.id}
                fotos={fotosDaPaleta}
                refsDoPdf={refsDaPaleta}
                cores={paletaDaProposta(doc)}
                onMudar={mudarPaleta}
              />
            ) : undefined
          }
          carregar={
            <UploadArea
              label="Carregar uma fotografia"
              progresso={uploading[`pagina-${paginaDaFoto.chave}`]}
              multiple={false}
              curto
              onFiles={(files) => {
                const p = paginaDaFoto;
                const lugar = lugarDaFoto;
                handleUpload(`pagina-${p.chave}`, files.slice(0, 1), (paths) => {
                  if (paths[0]) porFotoNaPagina(p.chave, p.nome, p.max, lugar, paths[0]);
                });
              }}
            />
          }
          onLugar={setLugarDaFoto}
          onEscolher={(ref) =>
            porFotoNaPagina(
              paginaDaFoto.chave,
              paginaDaFoto.nome,
              paginaDaFoto.max,
              lugarDaFoto,
              ref,
            )
          }
          onQuantas={(n) => quantasNaPagina(paginaDaFoto.chave, paginaDaFoto.nome, n)}
          onAutomatico={() =>
            gravarFotosDaPagina(
              paginaDaFoto.chave,
              null,
              `«${paginaDaFoto.nome}» volta a escolher sozinha.`,
            )
          }
          onBiblioteca={() =>
            setPicker({
              kind: "pagina",
              chave: paginaDaFoto.chave,
              lugar: lugarDaFoto,
              max: paginaDaFoto.max,
            })
          }
          onFechar={() => setPaginaDaFoto(null)}
        />
      )}
    </>
  );
}
