"use client";

import { type Dispatch, type KeyboardEvent, type RefObject, type SetStateAction } from "react";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import { type AvaliacaoDaFoto } from "@/lib/qualidade-da-foto";
import { type ThemeImage } from "@/lib/theme-types";
import { CuradoriaDeFotos } from "../../CuradoriaDeFotos";
import { PaginaEmConstrucao, type FotoDaPagina } from "../../PaginaEmConstrucao";
import { Ajuda, Button } from "../../ui";
import { GrelhaDoSeletor } from "./GrelhaDoSeletor";

/** A coluna da direita do seletor: a barra da selecção e a grelha das
 *  fotografias do tema escolhido. (Saiu do `ThemePicker.tsx` na fase 8 da
 *  estrutura do código, tal e qual.) */
export interface FotosDoTemaProps {
  multiple: boolean;
  usadasNoutras: Readonly<Record<string, string>> | undefined;
  paginaEmConstrucao:
    | { titulo?: string; fotos: readonly FotoDaPagina[]; maximo: number }
    | undefined;
  themeId: string | null;
  images: ThemeImage[];
  truncated: boolean;
  unreadable: boolean;
  falhaFotos: LeituraFalhada | null;
  loadingImages: boolean;
  loadingMore: boolean;
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  focusIndex: number;
  setFocusIndex: Dispatch<SetStateAction<number>>;
  setPreviewIndex: Dispatch<SetStateAction<number | null>>;
  gridRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedSet: Set<string>;
  pendingSet: Set<string>;
  usedSet: Set<string>;
  failedPaths: string[];
  aEntrar: FotoDaPagina[];
  remaining: number | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  setCuradoria: Dispatch<SetStateAction<boolean>>;
  curadoria: boolean;
  largoQueChegue: boolean;
  toggleAt: (index: number, extend: boolean) => void;
  selectAllVisible: () => void;
  decidirNaCuradoria: (path: string, incluir: boolean) => void;
  onGridKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  qualidadeDe: (im: ThemeImage) => AvaliacaoDaFoto | null;
  atLimit: boolean;
}

export function FotosDoTema({
  multiple,
  usadasNoutras,
  paginaEmConstrucao,
  themeId,
  images,
  truncated,
  unreadable,
  falhaFotos,
  loadingImages,
  loadingMore,
  selected,
  setSelected,
  focusIndex,
  setFocusIndex,
  setPreviewIndex,
  gridRef,
  scrollRef,
  selectedSet,
  pendingSet,
  usedSet,
  failedPaths,
  aEntrar,
  remaining,
  hasMore,
  loadMore,
  setCuradoria,
  curadoria,
  largoQueChegue,
  toggleAt,
  selectAllVisible,
  decidirNaCuradoria,
  onGridKeyDown,
  qualidadeDe,
  atLimit,
}: FotosDoTemaProps) {
  return (
    <>
      {/* A coluna da direita: a barra de selecção e a grelha. Um invólucro só,
          para que a coluna dos temas não empurre nada — e para que o `flex-1`
          que a grelha já ocupava passe a ser desta coluna. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Barra de seleção ──────────────────────────────────────────────
          Só faz sentido com várias fotos a escolher.

          ── «SELECIONAR TODAS AS VISÍVEIS» NÃO DIZIA O QUE FAZIA ──────────
          Palavras dela: «está solto e é ambíguo: seleciona as visíveis no
          ecrã ou todas as do tema?». Nenhuma das duas — escolhe as que já
          foram CARREGADAS, que com um tema pequeno são todas e com um tema
          grande são as primeiras quarenta.

          O rótulo passa a dizer o número e de onde ele vem, e muda com o
          estado: «as 18 deste tema» quando não falta nenhuma, «as 40 já
          mostradas» quando o tema tem mais e ainda não desceram. Um botão
          que diz um número é também um botão que se pode recusar antes de
          carregar nele. */}
        {multiple && images.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--bo-hairline)] px-5 py-2.5">
            <Button size="sm" variant="ghost" onClick={selectAllVisible} disabled={atLimit}>
              {hasMore
                ? `Escolher as ${images.length} já mostradas`
                : `Escolher as ${images.length} deste tema`}
            </Button>
            {selected.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Limpar seleção
              </Button>
            )}
            {/* ── A PORTA DA CURADORIA ────────────────────────────────────
              Só com fotos que cheguem para valer a pena: com seis, a grelha
              mostra-as todas de uma vez e uma de cada vez seria mais lento.
              É a partir de uma grelha que não cabe no ecrã que o modo ganha. */}
            {images.length > 8 && (
              <Button size="sm" variant="ghost" onClick={() => setCuradoria(true)}>
                Uma de cada vez
              </Button>
            )}
            {/* ── TRÊS TEXTOS DE AJUDA A COMPETIR, E AGORA UM ─────────────
              Palavras dela: «há três textos de ajuda a competir; devia ser
              uma instrução curta e os atalhos atrás de um "?"».

              Havia mesmo. Aqui em cima duas versões da MESMA frase, uma para
              o dedo e outra para o rato, ambas sempre no ecrã; e lá em baixo,
              no rodapé, «Toca nas fotos que queres usar.» a dizer a terceira
              vez a mesma coisa. Nenhum dos três é falso — o problema é que
              são úteis na primeira vez e ruído a partir da segunda, e quem
              lê três instruções ao mesmo tempo não fica a saber mais.

              Fica UMA, no rodapé, onde já está a contagem: é o mesmo sítio
              para onde o olho vai ver quantas escolheu, e é a mesma frase que
              explica porque é que o botão de adicionar está desligado. Os
              atalhos — que são de teclado e não se adivinham de qualquer
              maneira — mudam-se para aqui, atrás do «?», e continuam a estar
              a um toque de quem os quiser.

              `alinhar="direita"` porque o botão está encostado à margem: um
              painel a crescer para a direita a partir daqui saía do diálogo. */}
            <Ajuda sobre="como escolher fotos" alinhar="direita" className="ml-auto">
              <span className="block text-[11px] font-medium text-[var(--bo-text)]">
                Como escolher
              </span>
              <ul className="mt-1.5 space-y-1">
                <li>Toca numa foto para a escolher. Toca outra vez para a tirar.</li>
                <li>A lupa de cada foto mostra-a em grande sem sair daqui.</li>
                <li>
                  No computador: <strong>setas</strong> andam pela grelha e <strong>V</strong>{" "}
                  mostra em grande.
                </li>
                <li>
                  <strong>Shift</strong> + clique (ou Shift + seta) escolhe tudo o que está pelo
                  meio.
                </li>
              </ul>
            </Ajuda>
          </div>
        )}

        {/* ── UMA DE CADA VEZ, OU A GRELHA ─────────────────────────────────
          Os dois modos partilham tudo o que interessa — a selecção, o tema, o
          teto do lote — e por isso a troca é só uma questão de o que se
          desenha. A curadoria substitui a grelha e mais nada: o cabeçalho, a
          fila dos temas e o rodapé continuam onde estavam, e o botão de
          confirmar conta o mesmo que contava. */}
        {/* ── O CANTO ONDE A PÁGINA SE VÊ A COMPOR ────────────────────────
          `relative` para o canto flutuar POR CIMA das fotos em vez de lhes
          tirar uma linha — palavras dela: «não pode roubar espaço às fotos.
          Pequena, num canto, e dispensável». O invólucro não muda nada do que
          está cá dentro: era este `flex-1` que a grelha ocupava, e continua a
          ser. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {curadoria && multiple ? (
            <CuradoriaDeFotos
              images={images}
              escolhidas={selectedSet}
              usadas={usedSet}
              podeEscolherMais={!atLimit}
              aoDecidir={decidirNaCuradoria}
              aoVerGrande={(i) => setPreviewIndex(i)}
              aoSair={() => setCuradoria(false)}
            />
          ) : (
            <GrelhaDoSeletor
              usadasNoutras={usadasNoutras}
              themeId={themeId}
              images={images}
              truncated={truncated}
              unreadable={unreadable}
              falhaFotos={falhaFotos}
              loadingImages={loadingImages}
              loadingMore={loadingMore}
              focusIndex={focusIndex}
              setFocusIndex={setFocusIndex}
              setPreviewIndex={setPreviewIndex}
              gridRef={gridRef}
              scrollRef={scrollRef}
              selectedSet={selectedSet}
              pendingSet={pendingSet}
              usedSet={usedSet}
              failedPaths={failedPaths}
              remaining={remaining}
              hasMore={hasMore}
              loadMore={loadMore}
              toggleAt={toggleAt}
              onGridKeyDown={onGridKeyDown}
              qualidadeDe={qualidadeDe}
              atLimit={atLimit}
            />
          )}

          {/* Sem coluna, o canto de sempre: aqui a alternativa seria
                roubar altura à grelha, que é o problema que a coluna
                acabou de resolver. */}
          {paginaEmConstrucao && multiple && !largoQueChegue && (
            <PaginaEmConstrucao
              titulo={paginaEmConstrucao.titulo}
              jaLa={paginaEmConstrucao.fotos}
              aEntrar={aEntrar}
              maximo={paginaEmConstrucao.maximo}
            />
          )}
        </div>
      </div>
    </>
  );
}
