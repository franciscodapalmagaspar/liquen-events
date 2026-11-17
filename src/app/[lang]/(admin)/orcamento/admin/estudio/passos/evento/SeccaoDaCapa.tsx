"use client";

import type { Dispatch, SetStateAction } from "react";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import {
  LADO_MINIMO_DA_CAPA,
  perdaNaFolha,
  problemaDaCapa,
  ASPETO_DA_FOLHA,
} from "@/lib/pdf-editorial/regra-da-capa";
import { isPendingImage } from "@/lib/proposal-doc";
import { PERDA_QUE_SE_AVISA } from "@/lib/proposal-geometria";
import { ArrastarParaEnquadrar } from "../../../ArrastarParaEnquadrar";
import { aquecerBiblioteca } from "../../../theme-picker-cache";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { ADD_BTN } from "../../classes";
import { Section } from "../../formulario/Section";
import { Thumb } from "../../fotos/Thumb";
import { UploadArea } from "../../fotos/UploadArea";
import type { DestinoDaFoto, EstadoDosUrls, Step } from "../../tipos";

interface PropsSeccaoDaCapa {
  aspetosDasFotos: Record<string, number>;
  assetMedias: Record<string, string>;
  assetOriginais: Record<string, string>;
  assetUrls: Record<string, string>;
  doc: StudioDoc;
  estadoDosUrls: EstadoDosUrls;
  focoAutoDaCapa: { caminho: string; foco: { x: number; y: number } } | null;
  handleUpload: (
    key: string,
    todas: File[],
    onPaths: (paths: string[]) => void,
    reservar?: (marcadores: string[]) => void,
  ) => Promise<void>;
  idxDaCapa: number;
  marcarUrlMorto: (url: string) => void;
  notaDaSeccao: (chave: string, titulo: string) => React.JSX.Element;
  patch: (p: Partial<StudioDoc>) => void;
  registarAspeto: (ref: string, aspeto: number) => void;
  removeCoverAt: (idx: number) => void;
  setCoverAt: (idx: number, path: string) => void;
  setPicker: Dispatch<SetStateAction<DestinoDaFoto | null>>;
  step: Step;
  tamanhoDaCapa: { w: number; h: number } | null;
  tentarBuscarFotos: () => Promise<void>;
  uploading: Record<string, { feito: number; total: number }>;
}

/**
 * ── A FOTOGRAFIA DA CAPA — uma, a cobrir a folha ──────────────────────────
 * Eram duas, «Esquerda» e «Direita», as tiras altas do PDF antigo. O desenho
 * novo tem UMA fotografia a cobrir a folha deitada inteira, e ela escolheu:
 * «Usa a minha, com aviso». O PDF usa a que ela escolher; se não servir para a
 * página inteira (ao alto, ou pequena), usa a melhor deitada dos temas — e isso
 * diz-se AQUI, ao lado da fotografia, antes de o PDF existir. A regra é a mesma
 * do servidor (`regra-da-capa.ts`).
 *
 * O lugar é a primeira fotografia que houver: há propostas antigas só com a
 * «Direita». A segunda que exista fica guardada e não sai.
 *
 * Saiu do `ProposalStudio` tal e qual (fase 4 de `docs/ESTRUTURA-DO-CODIGO.md`).
 */
export function SeccaoDaCapa({
  aspetosDasFotos,
  assetMedias,
  assetOriginais,
  assetUrls,
  doc,
  estadoDosUrls,
  focoAutoDaCapa,
  handleUpload,
  idxDaCapa,
  marcarUrlMorto,
  notaDaSeccao,
  patch,
  registarAspeto,
  removeCoverAt,
  setCoverAt,
  setPicker,
  step,
  tamanhoDaCapa,
  tentarBuscarFotos,
  uploading,
}: PropsSeccaoDaCapa) {
  return (
    <Section
      title="Fotografia da capa"
      id="capas"
      escondida={step !== "evento"}
      rodape={notaDaSeccao("capas", "Nota sobre a capa")}
    >
      {(() => {
        const idx = idxDaCapa;
        const path = doc.coverImages?.[idx];
        const aspeto = path ? aspetosDasFotos[path] : undefined;
        const problema = tamanhoDaCapa
          ? problemaDaCapa(tamanhoDaCapa.w, tamanhoDaCapa.h)
          : aspeto && aspeto < 1
            ? "ao-alto"
            : null;
        /** Ela disse «usa esta na mesma»: vai, recortada como aqui. */
        const mesmoAssim = !!problema && !!doc.capaMesmoAssim;
        /** A fotografia que se vê aqui NÃO é a que vai para o PDF. */
        const naoVai = !!problema && !mesmoAssim;
        const perda = aspeto && (!problema || mesmoAssim) ? perdaNaFolha(aspeto) : 0;
        if (!path) {
          return (
            <div className="max-w-md">
              <UploadArea
                label="Fotografia da capa"
                progresso={uploading[`cover-${idx}`]}
                multiple={false}
                curto
                onFiles={(files) =>
                  handleUpload(`cover-${idx}`, files.slice(0, 1), (paths) =>
                    setCoverAt(idx, paths[0]),
                  )
                }
              />
              <button
                type="button"
                className={`${ADD_BTN} mt-1.5 ${ESTADO} ${PRESSAO}`}
                onClick={() => setPicker({ kind: "cover", idx })}
                // Ao passar o rato já se vai buscar o que o diálogo
                // precisa. `focus` para o teclado, `touchstart` para o
                // telemóvel, onde não há hover nenhum.
                onPointerEnter={aquecerBiblioteca}
                onFocus={aquecerBiblioteca}
                onTouchStart={aquecerBiblioteca}
              >
                Da biblioteca de temas
              </button>
              <p className="mt-2 text-caption text-[var(--bo-text-muted)]">
                Uma fotografia deitada, a cobrir a primeira página e a última.
              </p>
            </div>
          );
        }
        /**
         * O enquadramento que se VÊ é o que sai: o escolhido à mão, ou
         * o que o PDF escolheria sozinho (perguntado ao servidor), ou o
         * centro enquanto a resposta não chega.
         */
        const focoVisto = doc.focoDaCapa ??
          (focoAutoDaCapa?.caminho === path ? focoAutoDaCapa.foco : undefined) ?? {
            x: 0.5,
            y: 0.5,
          };
        return (
          <div className="max-w-md">
            <ArrastarParaEnquadrar
              aspeto={aspeto}
              aspetoDaCaixa={ASPETO_DA_FOLHA}
              foco={focoVisto}
              activo={!naoVai}
              onFoco={(f) => patch({ focoDaCapa: f })}
            >
              {(posicao) => (
                <div className="relative">
                  <Thumb
                    posicao={naoVai ? undefined : posicao}
                    url={assetUrls[path]}
                    // A cascata, do mais leve para o mais pesado. Ver
                    // `assetMedias`: o degrau do meio poupa ~900 KB por
                    // célula sempre que a miniatura falha.
                    planoB={[assetMedias[path], assetOriginais[path]]}
                    estadoDosUrls={estadoDosUrls}
                    aoTentarDeNovo={() => void tentarBuscarFotos()}
                    aoMorrer={marcarUrlMorto}
                    // A capa está no topo do passo: nunca espera pela fila
                    // das fotos que estão fora do ecrã.
                    priority
                    onRemove={() => removeCoverAt(idx)}
                    // A forma da folha do PDF (1123 × 794): o que se vê
                    // aqui é o recorte que sai.
                    className="aspect-[1123/794] w-full"
                    onMedida={(a) => registarAspeto(path, a)}
                    pendente={isPendingImage(path)}
                    onde="capa"
                    refDoc={path}
                  />
                  {/* ── O QUE SE VÊ AQUI TEM DE SER O QUE SAI ─────────────
                  A caixa recorta-a deitada, e assim parece servir. Ela
                  leu-a como a capa e o PDF saiu com outra. Quando não
                  vai, di-lo em cima dela, e não só por baixo. */}
                  {naoVai && (
                    <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-caption whitespace-nowrap text-white">
                      Não vai para o PDF
                    </span>
                  )}
                  {perda > PERDA_QUE_SE_AVISA && (
                    <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-caption whitespace-nowrap text-white tabular-nums">
                      perde {Math.round(perda * 100)}% da área
                    </span>
                  )}
                </div>
              )}
            </ArrastarParaEnquadrar>
            {doc.focoDaCapa && !naoVai && (
              <button
                type="button"
                className={`alvo-toque relative mt-1 text-caption font-medium text-sage-600 underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                onClick={() => patch({ focoDaCapa: undefined })}
              >
                Voltar ao enquadramento automático
              </button>
            )}
            {mesmoAssim && (
              <p
                role="status"
                className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
              >
                <span>
                  {problema === "ao-alto"
                    ? "Vai para a capa recortada para ficar deitada, como aqui. "
                    : "Vai para a capa, e numa página inteira pode ver-se o grão. "}
                  <button
                    type="button"
                    className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                    onClick={() => patch({ capaMesmoAssim: undefined })}
                  >
                    Usar a melhor deitada dos temas
                  </button>
                </span>
              </p>
            )}
            {naoVai && (
              <p
                role="status"
                className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
              >
                <span aria-hidden="true">⚠</span>
                <span>
                  {problema === "ao-alto"
                    ? "É ao alto, e a capa é deitada. "
                    : `É pequena para a capa (${Math.max(tamanhoDaCapa?.w ?? 0, tamanhoDaCapa?.h ?? 0)} px; pede ${LADO_MINIMO_DA_CAPA}). `}
                  Por isso o PDF usa a melhor fotografia deitada dos temas, e não esta.{" "}
                  <button
                    type="button"
                    className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                    onClick={() => patch({ capaMesmoAssim: true })}
                  >
                    Usar esta na mesma
                  </button>
                  {" · "}
                  <button
                    type="button"
                    className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                    onClick={() => setPicker({ kind: "cover", idx })}
                    onPointerEnter={aquecerBiblioteca}
                    onFocus={aquecerBiblioteca}
                  >
                    Trocar
                  </button>
                </span>
              </p>
            )}
          </div>
        );
      })()}
    </Section>
  );
}
