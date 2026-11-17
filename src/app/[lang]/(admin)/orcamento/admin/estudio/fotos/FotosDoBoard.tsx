"use client";

import { memo } from "react";
import { isPendingImage } from "@/lib/proposal-doc";
import { CelulaDeFoto, GrelhaDeFotos } from "../../MoodBoardFotos";
import type { EstadoDosUrls } from "../tipos";
import { AccoesDaFoto } from "./AccoesDaFoto";
import { Thumb } from "./Thumb";

/** As acções das fotografias de um mood board — ver `eventosDasFotos`. */
export interface EventosDasFotos {
  reordenar: (bi: number, de: number, para: number) => void;
  ampliar: (bi: number, ii: number) => void;
  substituir: (bi: number, ii: number) => void;
  principal: (bi: number, ii: number) => void;
  seleccionar: (bi: number, ii: number) => void;
  remover: (bi: number, ii: number) => void;
  tentarDeNovo: () => void;
  morreu: (url: string) => void;
  medida: (caminho: string, aspeto: number) => void;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA DE FOTOGRAFIAS DE UMA PÁGINA, MEMORIZADA (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «está a travar imenso e super pouco fluido». MEDIDO (perfil a escrever
 * numa descrição, proposta com 8 páginas de 12 fotos): cada letra redesenhava
 * as 96 células — a miniatura, a tira, e as acções de cada uma —, porque a
 * grelha vivia dentro do corpo do estúdio, que se redesenha inteiro a cada
 * letra.
 *
 * Aqui, com `memo`, uma página só se redesenha quando muda alguma coisa que
 * ELA mostra: as fotografias dela, o título (entra no nome das acções), a
 * principal, o estar fechada, as escolhidas dela, os endereços das miniaturas,
 * ou a história/origem das fotografias. O que se desenha é EXACTAMENTE o que
 * estava no estúdio — só mudou de sítio.
 */
export const FotosDoBoard = memo(function FotosDoBoard({
  bi,
  images,
  titulo,
  principal: principalDoTema,
  fechado,
  seleccionadasDoBoard,
  assetUrls,
  assetMedias,
  assetOriginais,
  estadoDosUrls,
  historiaDe,
  origemDe,
  eventos,
}: {
  bi: number;
  images: readonly string[];
  titulo: string;
  principal: number | undefined;
  fechado: boolean;
  /** As escolhidas desta página, «0,3». */
  seleccionadasDoBoard: string;
  assetUrls: Record<string, string>;
  assetMedias: Record<string, string>;
  assetOriginais: Record<string, string>;
  estadoDosUrls: EstadoDosUrls;
  historiaDe: (caminho: string) => { texto: string; grave: boolean } | null;
  origemDe: (caminho: string) => string | undefined;
  eventos: EventosDasFotos;
}) {
  const escolhidas = new Set(
    seleccionadasDoBoard ? seleccionadasDoBoard.split(",").map(Number) : [],
  );
  return (
    <GrelhaDeFotos
      bi={bi}
      quantas={images.length}
      className="grid grid-cols-3 @min-[24rem]:grid-cols-4 gap-2"
    >
      {images.map((path, ii) => (
        <CelulaDeFoto
          // A chave é a POSIÇÃO, não o caminho: quando o marcador provisório dá
          // lugar ao caminho definitivo, uma chave com o caminho faria o React
          // desmontar a célula e a foto piscava a meio da troca.
          key={ii}
          bi={bi}
          ii={ii}
          principal={principalDoTema === ii}
          seleccionada={escolhidas.has(ii)}
          // Fechado, a foto vê-se mas não se mexe: é isso que «terminado» quer dizer.
          bloqueada={fechado}
          // A tira e o texto do rato — ver `repeticaoNestaProposta`.
          historia={historiaDe(path)}
          origem={origemDe(path)}
          accoes={
            fechado ? null : (
              <AccoesDaFoto
                nome={`Fotografia ${ii + 1} de «${titulo || "mood board sem título"}»`}
                podeRecuar={ii > 0}
                podeAvancar={ii < images.length - 1}
                seleccionada={escolhidas.has(ii)}
                principal={principalDoTema === ii}
                onRecuar={() => eventos.reordenar(bi, ii, ii - 1)}
                onAvancar={() => eventos.reordenar(bi, ii, ii + 1)}
                onAmpliar={() => eventos.ampliar(bi, ii)}
                onSubstituir={() => eventos.substituir(bi, ii)}
                onPrincipal={() => eventos.principal(bi, ii)}
                onSeleccionar={() => eventos.seleccionar(bi, ii)}
                onRemover={() => eventos.remover(bi, ii)}
              />
            )
          }
        >
          <Thumb
            url={assetUrls[path]}
            planoB={[assetMedias[path], assetOriginais[path]]}
            estadoDosUrls={estadoDosUrls}
            aoTentarDeNovo={eventos.tentarDeNovo}
            aoMorrer={eventos.morreu}
            priority={bi === 0 && ii < 4}
            onde="mood-board"
            refDoc={path}
            semRemover
            onRemove={() => eventos.remover(bi, ii)}
            onMedida={(a) => eventos.medida(path, a)}
            aspeto={1}
            pendente={isPendingImage(path)}
          />
        </CelulaDeFoto>
      ))}
    </GrelhaDeFotos>
  );
});
