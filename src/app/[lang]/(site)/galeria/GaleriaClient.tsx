"use client";

import { useState, useEffect, useCallback, useRef, useMemo, startTransition, memo } from "react";
import { idCurto } from "@/lib/id-unico";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { createPortal } from "react-dom";
import Image from "next/image";
import type { Label } from "./photos-data";
import { collectionFor } from "./collections";
import { type Photo, interleaveByCollection, razaoDe } from "./interleave";
import type { Dict } from "@/lib/i18n";
import GalleryImage from "./GalleryImage";
import { galleryImageLoader } from "./gallery-image-loader";
import {
  CORTE_TELEMOVEL,
  ESCADA_ECRA_GRANDE,
  ESCADA_TELEMOVEL,
  ficheiroDaGaleria,
  srcsetDaGaleria,
  sizesDaFila,
} from "./gallery-srcset";
import { snapGalleryWidth } from "./gallery-image-loader";
import { useAntecipacao } from "./useAntecipacao";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";
import { DUR_ELEMENTO_MS, DUR_VISTA_MS, EASE_IN, EASE_OUT } from "@/lib/motion/tokens";
import { assentar } from "@/lib/motion/mola";
import {
  type Caixa,
  aVista,
  caixaContida,
  decidirDeslize,
  DESLIZE_INTERVALO_PX,
  dentroDe,
  elastico,
  janelaDaTira,
  miniaturasNaTira,
  POSE_FINAL,
  poseDaMiniatura,
  proporcao,
} from "./voo";

/** Quanto tempo a barra e a tira do visualizador ficam à vista sem mexer (GAL-4). */
const CROMAGEM_ESCONDE_MS = 2500;

const CATS = ["Todos", "Casamento", "Corporativo", "Conferência", "Aéreo", "Evento"] as const;

type Cat = (typeof CATS)[number];
const PAGE = 24;
// Fewer tiles on the FIRST paint than each subsequent page: React hydrating the
// initial grid is a synchronous burst (measured up to a ~1s main-thread freeze
// on a 6×-throttled phone when navigating into /galeria). A smaller first mount
// cuts that freeze; the infinite-scroll append (in a yieldable startTransition)
// fills the rest within a frame. Same value SSR + client → no hydration mismatch.
const INITIAL_PAGE = 12;
/**
 * O `sizes` que os mosaicos da grelha declaram. O lightbox reutiliza-o para a
 * pré-visualização instantânea — ver a nota lá em baixo: é o que garante que o
 * browser escolhe o ficheiro que já tem em cache em vez de pedir outro.
 */
const SIZES_DA_GRELHA = "(max-width: 639px) 100vw, (max-width: 767px) 50vw, 33vw";

// ── Restauro da posição de scroll ───────────────────────────────────────────
/**
 * RECARREGAR OU VOLTAR ATRÁS TEM DE DEIXAR O VISITANTE ONDE ELE ESTAVA.
 *
 * Não deixava. Medido num Chromium de verdade (Pixel 7, build de produção,
 * `/galeria`), com o visitante a 51 800 px (108 das 427 fotos montadas,
 * documento com 57 350 px):
 *
 *   recarregar        51 800 px → 7 807 px   (-43 993 px)   3 corridas
 *   voltar atrás      51 800 px → 7 807 px   (-43 993 px)   (histórico duro)
 *   voltar atrás      51 800 px → 7 807 px   (-43 993 px)   (<Link> do App Router)
 *   pior corrida      51 800 px →   869 px   (-50 931 px)
 *
 * O browser TENTA restaurar (`history.scrollRestoration` === "auto"), e é aí
 * que falha: quando ele aplica a posição guardada o documento só tem as
 * INITIAL_PAGE=12 fotos do primeiro render — 8 646 px de altura —, portanto os
 * 51 800 px são cortados para o fim do documento curto (7 807 px = 8 646 - 839
 * de viewport) e a posição real perde-se para sempre. Como o `html` leva
 * `scroll-behavior: smooth` (globals.css), esse corte ainda é ANIMADO: mediu-se
 * um deslize fantasma de 0 → 7 807 px ao longo de ~600 ms, sozinho, à frente do
 * visitante. E numa das corridas o deslize entrou em corrida com o scroll
 * infinito e desceu a galeria INTEIRA — parou a 225 865 px com as 427 fotos
 * montadas, ou seja, descarregou tudo o que devia ter poupado.
 *
 * A correção NÃO é subir o INITIAL_PAGE (isso paga o arranque lento a TODA a
 * gente, incluindo a quem chega pela primeira vez). É:
 *   1. carimbar a ENTRADA DE HISTÓRICO com um identificador (`galeriaPos`) e
 *      guardar `{y, shown}` em sessionStorage debaixo dele;
 *   2. `scrollRestoration = "manual"` — o restauro do browser só sabe cortar;
 *   3. ao voltar a essa entrada (recarregar, back duro ou back do App Router:
 *      os três reencontram o mesmo `history.state`), repor `shown` e só depois
 *      saltar para `y`, antes da primeira pintura.
 * Quem chega de novo cria uma entrada NOVA, sem carimbo — e continua a arrancar
 * com 12 fotos, exactamente como antes.
 */
const POS_PREFIX = "galeria:pos:";
/** Quanto tempo o restauro ESPERA por altura de documento antes de desistir. */
const RESTORE_WAIT_MS = 2000;
/** Quanto tempo MANTÉM a posição depois de lá chegar (ver a fase de manutenção). */
const RESTORE_HOLD_MS = 700;
type SavedPos = { y: number; shown: number; hash: string };

/**
 * Identificador desta ENTRADA de histórico (não desta página). É o carimbo que
 * distingue "voltei ao sítio onde estava" de "entrei agora na galeria": uma
 * navegação nova cria uma entrada sem carimbo (`returning: false` → arranque
 * normal de 12 fotos), enquanto recarregar ou voltar atrás reencontra o mesmo
 * `history.state` — e é por isso que serve para os três casos, incluindo o
 * back do App Router, onde o tipo da navegação continua a ser "navigate".
 * Preserva o resto do `history.state` (o App Router guarda lá a sua árvore).
 */
function historyPosKey(): { key: string; returning: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const state = (window.history.state ?? {}) as Record<string, unknown>;
    const existing = state.galeriaPos;
    if (typeof existing === "string") return { key: POS_PREFIX + existing, returning: true };
    const id = idCurto();
    window.history.replaceState({ ...state, galeriaPos: id }, "");
    return { key: POS_PREFIX + id, returning: false };
  } catch {
    return null; // sem histórico utilizável → galeria normal, sem restauro
  }
}

function readPos(key: string): SavedPos | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SavedPos>;
    if (typeof v?.y !== "number" || typeof v?.shown !== "number") return null;
    return { y: v.y, shown: v.shown, hash: typeof v.hash === "string" ? v.hash : "" };
  } catch {
    return null; // sessionStorage bloqueado (modo privado antigo) ou JSON partido
  }
}

function writePos(key: string, pos: SavedPos): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(pos));
  } catch {
    /* quota/privacidade: perder o restauro é aceitável, rebentar não é */
  }
}

// URL-hash slugs for each category, so a filtered view is shareable &
// bookmarkable (e.g. /galeria#casamentos) and survives the back button.
const CAT_SLUGS: Record<Cat, string> = {
  Todos: "",
  Casamento: "casamentos",
  Corporativo: "corporativos",
  Conferência: "conferencias",
  Aéreo: "aereos",
  Evento: "eventos",
};
function catFromSlug(slug: string): Cat {
  return (CATS.find((c) => CAT_SLUGS[c] === slug) as Cat) ?? "Todos";
}

// "Ver este casamento" — a shareable, URL-hashable view of a single couple's
// full story (as opposed to the deliberately-interleaved category grids).
// Prefixed `c-` in the hash so it can't collide with a CAT_SLUGS value.
// Matches combining marks left behind by NFD decomposition (Unicode "Mark"
// category).
const DIACRITICS_RE = /\p{M}/gu;
function collectionSlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/&/g, "e")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function collectionFromSlug(slug: string, names: string[]): string | null {
  return names.find((n) => collectionSlug(n) === slug) ?? null;
}

// Corre trabalho NÃO crítico quando a main thread está livre, para que a
// hidratação e a primeira interação não fiquem bloqueadas por observers /
// listeners que a primeira pintura não precisa. `requestIdleCallback` onde
// existe; caso contrário (Safari) um setTimeout curto. Devolve um cancelador.
function onIdle(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout: 500 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = window.setTimeout(cb, 1);
  return () => window.clearTimeout(id);
}

// Rede lenta? Em Save-Data ou effectiveType 2g/3g não vale a pena pré-carregar
// especulativamente os vizinhos full-screen do lightbox (imagens grandes que o
// utilizador pode nunca ver). Em rede normal → comportamento inalterado.
const SLOW_ET = new Set(["slow-2g", "2g", "3g"]);
function shouldPreloadNeighbours(): boolean {
  if (typeof navigator === "undefined") return true;
  const c = (
    navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
  ).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !(c.effectiveType && SLOW_ET.has(c.effectiveType));
}

// Anel de foco de teclado, DENTRO da caixa (os mosaicos têm overflow-hidden).
//
// A versão anterior (`focus-visible:ring-2 ring-inset`) nunca chegou a ser
// pintada: a regra global `:focus-visible { box-shadow: ... }` (globals.css)
// declara o MESMO box-shadow no MESMO elemento e ganha, por isso o anel real
// era o global — sem `inset`, cortado pelo overflow, e com um contraste medido
// de 1.01:1 sobre a foto (pior de 8 mosaicos). Aqui o anel é um ELEMENTO
// próprio: o box-shadow é dele, não do elemento focado, logo a regra global não
// lhe toca. Par branco/preto para se ver tanto sobre fotos claras como escuras.
const FOCUS_RING = "focus:outline-none";
const FOCUS_RING_SHADOW = "inset 0 0 0 3px #fff, inset 0 0 0 6px rgba(0,0,0,0.85)";
function FocusRing() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 opacity-0 group-focus-visible:opacity-100"
      style={{ boxShadow: FOCUS_RING_SHADOW }}
    />
  );
}

// Zoom de hover. Sob prefers-reduced-motion não há transição nenhuma: as três
// ocorrências (masonry, herói 2x2, satélites) escapavam ao bloco reduced-motion
// do globals.css e continuavam a animar 900ms (medido: transitionDuration 0.9s
// com reducedMotion "reduce").
//
// 400 ms e 1.03 (auditoria externa, A4) — o mesmo zoom de todas as fotografias
// do sítio; a curva é a omissão da casa (cubic-bezier(0.16, 1, 0.3, 1)).
const ZOOM_CLASS = "transition-transform duration-foto-zoom group-hover:scale-[1.03]";

// Hover overlay — reused in hero cells and masonry cells.
// `aria-hidden`: é decoração visual que repete o que o botão já diz. Sem isto o
// nome acessível de cada mosaico saía com a informação colada 2-3 vezes
// ("Casamento … : Sophia & Artur Sophia & Artur CASAMENTO", lido da árvore de
// acessibilidade); o nome vem agora só do aria-label do botão.
/**
 * ════════════════════════════════════════════════════════════════════════════
 * NUM ECRÃ TÁCTIL ISTO NUNCA SE VÊ — E MESMO ASSIM CUSTAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta sobreposição são nove elementos por mosaico: um gradiente do tamanho da
 * fotografia, duas linhas de texto (uma com `truncate`, ou seja com medição de
 * texto e com o Playfair), um SVG, e um círculo com `backdrop-filter`. Só
 * aparece com `:hover` ou `:focus-visible`.
 *
 * O `content-visibility: auto` do mosaico não a torna grátis — adia o estilo,
 * o layout e o registo de pintura até o mosaico entrar na banda, e depois
 * paga-os todos de uma vez. Num telemóvel, onde não há rato, é trabalho que se
 * faz na íntegra para uma coisa que nunca é desenhada.
 *
 * `hover: none` esconde-a por CSS (ver `.g-sobrepor` em globals.css): o custo
 * de layout desaparece e o teclado continua servido, porque em qualquer
 * aparelho com teclado há também um apontador fino. O nome acessível do
 * mosaico nunca dependeu disto — vem do `aria-label` do botão, e esta camada é
 * `aria-hidden` desde sempre.
 */
function HoverOverlay({ caption, sub }: { caption: string; sub?: string }) {
  return (
    <span aria-hidden className="g-sobrepor">
      {/* Reveal on keyboard focus too (not just hover) so tabbing the grid
          surfaces the same caption sighted mouse users get (WCAG 1.4.13). */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 p-3.5 flex items-end justify-between gap-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 translate-y-1.5 group-hover:translate-y-0 group-focus-visible:translate-y-0 transition-all duration-300 pointer-events-none">
        <span className="min-w-0">
          <span
            className="block text-white/90 text-[12px] font-medium truncate"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {caption}
          </span>
          {/* /70 (era /55): sobre a foto mais clara medida (luminância 0.535) a
              sub-legenda de 9px dava 4.25:1, abaixo do mínimo de 4.5:1. */}
          {sub && (
            <span className="block text-white/70 text-[9px] tracking-[0.2em] uppercase mt-0.5">
              {sub}
            </span>
          )}
        </span>
        <span className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
          <svg
            className="w-3.5 h-3.5 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0zm-3-3v6m-3-3h6"
            />
          </svg>
        </span>
      </div>
    </span>
  );
}

// One masonry tile, memoised. Infinite-scroll appends re-run GaleriaClient's
// render; without memo, React reconciled every already-mounted tile's next/image
// subtree on each append (hundreds of them to add 24). All props here are stable
// across an append for existing tiles (the photo object comes from the memoised
// pool; strings/flags/idx don't change; onOpen and registerTile are useCallback-
// stable), so memo lets existing tiles bail out — only the new page's tiles
// render. A tile never depends on which photo is open: the lightbox measures
// it on open/close (see `openAt` and the flight in `Lightbox`) and leaves it
// mounted.
const Tile = memo(function Tile({
  photo,
  idx,
  alt,
  label,
  caption,
  sub,
  escondida,
  eager,
  revealDelay,
  tabbable,
  unavailableLabel,
  zoomClass,
  onOpen,
  onKeyNav,
  onTileFocus,
  registerTile,
}: {
  photo: Photo;
  idx: number;
  alt: string;
  /** Nome acessível completo do botão (legenda + posição no pool). */
  label: string;
  caption: string;
  sub?: string;
  /** Classes que a escondem onde a mesma foto está na fila do topo (`NA_GRELHA_ATE`). */
  escondida: string;
  eager: boolean;
  revealDelay: number;
  tabbable: boolean;
  unavailableLabel: string;
  zoomClass: string;
  onOpen: (idx: number) => void;
  onKeyNav: (e: React.KeyboardEvent, idx: number) => void;
  onTileFocus: (idx: number) => void;
  registerTile: (el: HTMLDivElement | null) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      ref={registerTile}
      className={`g-reveal${escondida ? ` ${escondida}` : ""}`}
      style={{ "--reveal-delay": `${revealDelay}ms` } as React.CSSProperties}
    >
      <button
        ref={btnRef}
        onClick={() => onOpen(idx)}
        onKeyDown={(e) => onKeyNav(e, idx)}
        onFocus={() => onTileFocus(idx)}
        data-ripple
        data-tile-idx={idx}
        data-tile-variant="grid"
        data-cap={caption}
        data-sub={sub}
        // Tabulação rotativa (roving tabindex): a grelha é UM ponto de
        // tabulação e as setas percorrem as fotos. Antes eram 427 pontos numa
        // ordem que saltava até 3625px para trás (o masonry é empacotado
        // coluna-a-coluna) e a tabulação era EXPULSA da grelha ao fim de cada
        // lote de 24, deixando 403 das 427 fotos inalcançáveis sem rato.
        tabIndex={tabbable ? 0 : -1}
        aria-label={label}
        className={`g-tile relative w-full overflow-hidden group ${FOCUS_RING}`}
        // A cor média da própria foto por baixo (ver tile-colors.json): um
        // mosaico à espera da imagem mostra a cor DELA, não o fundo liso da
        // página. Custa ~7 caracteres por foto e cobre as 427 — o blur, que é
        // 20x mais pesado, fica só para a primeira janela.
        style={{ aspectRatio: photo.aspectRatio, backgroundColor: photo.color }}
      >
        <GalleryImage
          src={photo.src}
          alt={alt}
          // 100vw no ramo mobile. Esteve a 60vw por causa de uma poupança de
          // bytes que era, na verdade, um corte de resolução: em telemóvel o
          // mosaico do masonry ocupa a LARGURA TODA. Medido a 390px, a caixa
          // mede 390 CSS px, e com 60vw o browser pedia candidatos de 256px
          // para a encher — suave já a DPR1, e a 3x nem se discute. Os "-56% de
          // bytes" que isso mostrava eram fotografias mais pequenas do que o
          // sítio onde são desenhadas, não compressão melhor.
          sizes="(max-width: 639px) 100vw, (max-width: 767px) 50vw, 33vw"
          className={`object-cover ${zoomClass}`}
          aspectRatio={photo.aspectRatio}
          priority={eager}
          // Fora das duas primeiras filas, a fotografia deixa de
          // competir com as que já estão à vista. Ver a nota em
          // `GalleryImage`: é ganho de ORDEM, não de bytes.
          longe={idx >= 12}
          anchorRef={btnRef}
          unavailableLabel={unavailableLabel}
        />
        <HoverOverlay caption={caption} sub={sub} />
        <FocusRing />
      </button>
    </div>
  );
});

/**
 * A FILA DO TOPO, SEM CORTES (15/10, a pedido dela: «isto não pode acontecer…
 * as fotos têm que ser apresentadas de acordo com as suas dimensões»).
 *
 * Era um mosaico de altura FIXA — um 2×2 e quatro satélites, todos recortados
 * (`object-cover`) em caixas cuja forma mudava com a largura do ecrã. A 1920 px
 * o 2×2 ficava com 958×600 e uma foto ao alto mostrava só o céu; as satélites
 * recebiam uma foto ao alto 87 % das vezes e cortavam-na também.
 *
 * Agora é uma fila «justificada»: cada foto leva uma caixa com o SEU rácio
 * (`aspect-ratio`) e `flex: <rácio> 1 0%`. Numa linha flex isso dá a cada uma
 * uma largura proporcional ao rácio, e portanto a MESMA altura a todas — a que
 * faz a fila caber na largura. Nada se recorta, em largura nenhuma, e é só CSS:
 * o servidor já sabe a forma de cada foto, a altura fica reservada desde o
 * primeiro fotograma e não há salto.
 *
 * Quantas entram na fila depende da largura (o destaque, e mais uma por
 * degrau); as que não entram vivem na grelha, como as satélites viviam no
 * telemóvel. Cada foto 1–3 existe duas vezes e o CSS mostra uma só: a da fila
 * desde o degrau dela (`NA_FILA_DESDE`), a da grelha até lá (`NA_GRELHA_ATE`).
 */
const FILA_MAX = 4;
const NA_FILA_DESDE = ["", "hidden sm:block", "hidden md:block", "hidden 2xl:block"];
const NA_GRELHA_ATE = ["", "sm:hidden", "md:hidden", "2xl:hidden"];
/** Os mesmos degraus em JS: quantas fotos leva a fila a esta largura. */
const DEGRAUS_DA_FILA = ["(min-width: 640px)", "(min-width: 768px)", "(min-width: 1536px)"];

/**
 * Uma foto da fila do topo. Componente próprio por causa do ref: o `anchorRef`
 * de cada uma tem de ser o SEU botão (é ele que o observer vigia).
 */
function FotoDaFila({
  photo,
  idx,
  sizes,
  alt,
  label,
  cap,
  tabbable,
  zoomClass,
  unavailableLabel,
  onOpen,
  onKeyNav,
  onTileFocus,
}: {
  photo: Photo;
  idx: number;
  /** Ver `sizesDaFila`: sai da forma das fotos que estão na fila. */
  sizes: string;
  alt: string;
  label: string;
  cap: { caption: string; sub?: string };
  tabbable: boolean;
  zoomClass: string;
  unavailableLabel: string;
  onOpen: (idx: number) => void;
  onKeyNav: (e: React.KeyboardEvent, idx: number) => void;
  onTileFocus: (idx: number) => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const r = razaoDe(photo.aspectRatio);
  return (
    <button
      ref={btnRef}
      onClick={() => onOpen(idx)}
      onKeyDown={(e) => onKeyNav(e, idx)}
      onFocus={() => onTileFocus(idx)}
      data-ripple
      data-tile-idx={idx}
      data-tile-variant="hero"
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      data-cap={cap.caption}
      data-sub={cap.sub}
      className={`g-hero g-tile relative min-w-0 overflow-hidden group ${FOCUS_RING}${NA_FILA_DESDE[idx] ? ` ${NA_FILA_DESDE[idx]}` : ""}`}
      style={
        {
          // A caixa tem a forma da foto: ver a nota em `FILA_MAX`.
          aspectRatio: photo.aspectRatio,
          flex: `${r} 1 0%`,
          // 40 ms e não 70: com a opacidade fora da animação (ver `g-hero-in`),
          // o atraso deixou de ser tempo com a fila invisível, mas continua a
          // ser tempo até a parede assentar. A onda lê-se na mesma.
          "--hero-delay": `${idx * 40}ms`,
          backgroundColor: photo.color,
        } as React.CSSProperties
      }
    >
      {/* Fica SEMPRE montada, também com esta foto aberta: é o sítio para onde
          o voo de volta aterra. */}
      <GalleryImage
        src={photo.src}
        alt={alt}
        sizes={sizes}
        // A caixa tem a forma da foto, por isso `cover` já não recorta nada;
        // fica pelo arredondamento de um píxel.
        className={`object-cover ${zoomClass}`}
        aspectRatio={photo.aspectRatio}
        foco={photo.foco}
        // O destaque é a maior imagem da página e o candidato a LCP: eager e
        // `fetchPriority="high"`. As outras não levam `priority`: escondidas
        // (`display:none`) o observer nunca dispara e o telemóvel não as
        // descarrega; à vista, entram na fila logo a seguir.
        priority={idx === 0}
        anchorRef={btnRef}
        unavailableLabel={unavailableLabel}
      />
      <HoverOverlay {...cap} />
      <FocusRing />
    </button>
  );
}

export default function GaleriaClient({
  photos,
  dict,
  orderSeed = "",
}: {
  photos: Photo[];
  dict: Dict["galeria"];
  /**
   * Semente da arrumação, decidida NO SERVIDOR (ver galeria/page.tsx). Vinha
   * daqui até agora: o cliente sorteava uma semente em `onIdle` e
   * re-baralhava a grelha depois da hidratação. Medido, isso trocava as 12
   * fotos do primeiro ecrã a t=1178 ms e deitava fora 398,9 KB já
   * descarregados — 57,8% de todos os bytes de imagem da aterragem, incluindo
   * a foto do `<link rel=preload>` do mosaico 2x2. Em 3G a diferença era
   * entre 0-2 e 9 fotos nítidas aos 5 s.
   *
   * Com a semente a vir do servidor, o HTML, o preload, os placeholders e os
   * pedidos saem todos já na ordem final: zero fotos trocadas, zero bytes
   * deitados fora. A arrumação continua a mudar (por build, em vez de por
   * visita) — ver a nota em page.tsx.
   */
  orderSeed?: string;
}) {
  const collectionNames = useMemo(
    () =>
      Array.from(new Set(photos.map((p) => collectionFor(p.src)).filter((c): c is string => !!c))),
    [photos],
  );
  const [cat, setCat] = useState<Cat>("Todos");
  // Non-null = "ver este casamento" mode: browsing one couple's full story
  // (in shoot order, no interleaving) instead of a category grid.
  const [collectionFilter, setCollectionFilter] = useState<string | null>(null);
  const [shown, setShown] = useState(INITIAL_PAGE);
  const [fading, setFading] = useState(false);
  const [lb, setLb] = useState<number | null>(null);
  // A fechar? Enquanto true o lightbox corre a saída (o voo de volta à
  // miniatura, ou um esbatimento) e só depois desmonta — ver `close()`.
  const [closing, setClosing] = useState(false);
  // Acabou de abrir? A primeira foto entra pelo VOO a partir da miniatura (ver
  // `origem`); ao navegar com ←/→ volta o `lb-photo-in` entre fotos.
  const [justOpened, setJustOpened] = useState(false);
  /**
   * De onde se abriu: a caixa da miniatura em que se tocou, a do `<img>` dela
   * e o ficheiro que ela está a mostrar. É o ponto de partida do voo (ver
   * `voo.ts`). `null` quando não há miniatura pintada a partir da qual voar.
   */
  const [origem, setOrigem] = useState<OrigemDoVoo | null>(null);
  // Nº de colunas da masonry — medido no cliente para podermos distribuir os
  // tiles MANUALMENTE por colunas equilibradas (ver `masonryColumns`). Começa em
  // 1 (mobile-first) para que o SSR e a primeira renderização no cliente
  // coincidam (sem hydration mismatch); o efeito ajusta para o valor real. Espelha
  // os breakpoints antigos (columns-1 / sm:columns-2 / md:columns-3).
  const [cols, setCols] = useState(1);
  // Quantas fotos leva a fila do topo (ver `FILA_MAX`): 1 no SSR, como `cols`.
  const [fila, setFila] = useState(1);
  // Measure the real column count in a LAYOUT effect (before the browser paints),
  // not a passive effect. SSR + the hydration render still use cols=1 (no
  // mismatch), but the correction to 2/3 now lands before first paint — so a
  // tablet/desktop visitor never sees the masonry painted in one full-width
  // column and then re-pack into 2–3 columns (that 1→N repack was a big CLS on
  // landing at /galeria). Runs as a passive effect on the server (no-op there).
  useIsomorphicLayoutEffect(() => {
    const degraus = DEGRAUS_DA_FILA.map((q) => window.matchMedia(q));
    const [sm, md] = degraus;
    const apply = () => {
      setCols(md.matches ? 3 : sm.matches ? 2 : 1);
      setFila(1 + degraus.filter((m) => m.matches).length);
    };
    apply();
    for (const m of degraus) m.addEventListener("change", apply);
    return () => {
      for (const m of degraus) m.removeEventListener("change", apply);
    };
  }, []);

  // ── Restauro da posição (ver a nota longa junto a POS_PREFIX) ─────────────
  /** Chave em sessionStorage desta entrada de histórico. */
  const posKeyRef = useRef<string | null>(null);
  /** Posição por repor; volta a null assim que o salto acontece. */
  const restoreYRef = useRef<number | null>(null);
  /**
   * `shown` legível de dentro de listeners sem os re-registar a cada página.
   * Actualizado num efeito (nunca durante o render: refs em render são
   * exactamente o que o lint do React Compiler proíbe), e num efeito de
   * LAYOUT, não passivo: o par `{y, shown}` que se grava tem de ser
   * CONSISTENTE. Com um efeito passivo, esta ref ficava um commit atrás da
   * altura real do documento e podia gravar-se "estou a 133 940 px" com
   * "estavam 228 fotos" — 24 fotos (~12 000 px) a menos do que as precisas
   * para lá chegar. No restauro isso deixava a posição fora do documento e o
   * visitante acabava no topo (medido, com o CPU estrangulado 4x).
   */
  const shownRef = useRef(shown);
  useIsomorphicLayoutEffect(() => {
    shownRef.current = shown;
  }, [shown]);
  const lastSaveRef = useRef(0);
  /** A subir ao topo por ordem do visitante: não gravar nada até lá chegar. */
  const toTopRef = useRef(false);
  const toTopTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Gravação adiada da última posição (aresta de saída — ver `savePos`). */
  const trailingRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Carimba a entrada, desliga o restauro do browser e, se estamos a VOLTAR a
  // esta entrada, repõe quantas fotos estavam montadas. Repor `shown` primeiro
  // é o ponto todo: sem as fotos não há altura de documento, e sem altura
  // qualquer posição é cortada para o fim de um documento de 12 fotos.
  // Num efeito de LAYOUT: o `setShown` daqui volta a renderizar ANTES da
  // primeira pintura, portanto o visitante não chega a ver o topo da galeria.
  useIsomorphicLayoutEffect(() => {
    const h = historyPosKey();
    if (!h) return;
    posKeyRef.current = h.key;
    // Segundo cinto. Quem desliga mesmo o restauro do browser é o script
    // inline de page.tsx (corre a t≈11 ms, contra t≈2 086 ms de hidratação com
    // o CPU estrangulado 4x — a explicação está lá). Este aqui cobre a entrada
    // na galeria por navegação client-side do App Router, onde não há HTML
    // novo para o script inline correr.
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (h.returning) {
      const saved = readPos(h.key);
      // Hash diferente = outra vista (categoria/coleção), outro pool, outra
      // altura: a posição guardada não quer dizer nada lá.
      if (saved && saved.hash === window.location.hash) {
        restoreYRef.current = saved.y;
        setShown((s) => Math.max(s, Math.min(saved.shown, photos.length)));
      }
    }
    return () => {
      // Ao sair da galeria (navegação client-side) devolvemos o restauro ao
      // browser: as outras páginas do sítio não têm scroll infinito e o
      // comportamento nativo serve-lhes bem.
      if ("scrollRestoration" in window.history) window.history.scrollRestoration = "auto";
    };
  }, [photos.length]);

  // Salta para a posição guardada assim que houver altura para ela. Corre em
  // cada commit relevante (`shown`/`cols` mudam a altura do documento) e ainda
  // antes da pintura. `behavior: "instant"` é obrigatório: o `html` tem
  // `scroll-behavior: smooth`, e sem isto o restauro seria uma animação de
  // dezenas de milhares de píxeis à frente do visitante.
  useIsomorphicLayoutEffect(() => {
    const y = restoreYRef.current;
    if (y === null || typeof window === "undefined") return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max + 1 < y) return; // ainda falta altura → tenta no próximo commit
    window.scrollTo({ top: y, behavior: "instant" });
    // NÃO se larga aqui a posição: quem fecha o restauro é a fase de
    // manutenção abaixo (há quem faça scroll ao topo depois de nós).
  }, [shown, cols]);

  // Fase de manutenção — o restauro não acaba no primeiro salto.
  //
  // Duas coisas o desfaziam depois de ele acontecer:
  //  • a navegação client-side do App Router faz scroll ao TOPO depois de
  //    montar a rota. Medido no back por <Link> da navbar: as 108 fotos eram
  //    repostas (documento com 57 735 px) e mesmo assim a página acabava em
  //    y=0 — pior do que o defeito original, que pelo menos ficava a 7 807 px;
  //  • a altura só pode chegar depois da pintura (fontes, `cols` a mudar),
  //    e nessa altura o efeito de layout acima já não volta a correr porque
  //    `shown` deixou de mudar.
  // Por isso: espera-se por altura (até RESTORE_WAIT_MS) e, chegados à
  // posição, reafirma-se durante RESTORE_HOLD_MS.
  //
  // Enquanto falta altura vai-se ao ponto MAIS FUNDO que já existe, nunca
  // além de `y`. É de propósito, e tem um custo conhecido: encostado ao fim do
  // documento o sentinela do scroll infinito carrega a página seguinte (e o
  // ancoramento de scroll do Chromium acompanha o crescimento — medido:
  // 20 079 → 56 896 px em 130 ms), portanto o documento cresce até `y` caber e
  // o ciclo pára lá. O tecto em `y` é o que impede isto de ser a fuga que o
  // restauro do browser era: ele não tinha tecto e descia a galeria inteira
  // (225 865 px, as 427 fotos). A alternativa — ficar quieto à espera —
  // deixava o visitante no TOPO sempre que o par gravado ficasse uma página
  // curto (medido com o CPU estrangulado 4x).
  useEffect(() => {
    if (restoreYRef.current === null || typeof window === "undefined") return;
    const t0 = performance.now();
    let chegou: number | null = null;
    let id = 0;
    const parar = () => {
      restoreYRef.current = null;
      cancelAnimationFrame(id);
    };
    // O visitante manda sempre mais do que o restauro: ao primeiro gesto dele,
    // largamos a posição (senão o "hold" agarrava a página contra o dedo).
    const gestos = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    for (const g of gestos) window.addEventListener(g, parar, { passive: true, once: true });
    const tick = () => {
      const y = restoreYRef.current;
      if (y === null) return;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const alvo = Math.min(y, max);
      if (Math.abs(window.scrollY - alvo) > 1) window.scrollTo({ top: alvo, behavior: "instant" });
      if (max + 1 >= y) chegou ??= performance.now();
      const fim =
        chegou !== null
          ? performance.now() - chegou > RESTORE_HOLD_MS
          : performance.now() - t0 > RESTORE_WAIT_MS;
      if (fim) {
        restoreYRef.current = null;
        return;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      for (const g of gestos) window.removeEventListener(g, parar);
    };
  }, [shown]);

  /** Apaga a posição desta entrada (pedido explícito de esquecer o sítio). */
  const clearPos = useCallback(() => {
    const key = posKeyRef.current;
    // Também cancela uma gravação adiada: sem isto ela voltava a criar a
    // entrada 250 ms depois de a termos apagado.
    clearTimeout(trailingRef.current);
    if (!key) return;
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* sessionStorage bloqueado: não havia nada gravado, também não há nada a apagar */
    }
  }, []);

  /** Guarda `{y, shown}` desta entrada. Estrangulado a 250 ms — o scroll
      infinito faz esta função passar por cada frame de scroll e um
      `sessionStorage.setItem` é síncrono. `force` no pagehide/ocultação, que é
      a última oportunidade de gravar a posição final. */
  const savePos = useCallback((force = false) => {
    const key = posKeyRef.current;
    if (!key || restoreYRef.current !== null) return; // a restaurar: não gravar por cima
    if (toTopRef.current) return; // a caminho do topo por pedido do visitante
    const y = Math.round(window.scrollY);
    // O TOPO NUNCA SE GRAVA. Duas razões, e a segunda é um defeito medido:
    //  (a) restaurar para o topo é o mesmo que não restaurar nada;
    //  (b) o topo é a posição que a navegação client-side do App Router IMPÕE
    //      ao sair da rota — ela faz scroll ao topo com este listener ainda
    //      ligado. Medido: sair da galeria por um <Link> da navbar reescrevia
    //      o `{"y":51774,"shown":108}` guardado para `{"y":0,"shown":108}`, e
    //      o voltar atrás repunha as 108 fotos e deixava o visitante no topo —
    //      pior do que o defeito original, que ao menos parava a 7 807 px.
    if (y === 0) return;
    // A posição é capturada AGORA, não relida quando a gravação adiada
    // dispara: se pelo meio a navegação levar a página ao topo, o que fica
    // gravado continua a ser o último sítio REAL do visitante.
    const pos = { y, shown: shownRef.current, hash: window.location.hash };
    const escrever = () => {
      lastSaveRef.current = performance.now();
      writePos(key, pos);
    };
    clearTimeout(trailingRef.current);
    if (force || performance.now() - lastSaveRef.current >= 250) escrever();
    // ARESTA DE SAÍDA, não só de entrada: a ÚLTIMA posição de um scroll cai
    // sempre dentro da janela do estrangulamento e não vem evento nenhum
    // depois dela para a gravar. Medido sem isto, o voltar atrás por <Link>
    // ficava 2 774 px acima do sítio — a posição gravada era a do frame
    // anterior ao fim do scroll.
    else trailingRef.current = setTimeout(escrever, 250);
  }, []);

  useEffect(() => {
    // O `pagehide` cobre o que o scroll estrangulado pode ter deixado por
    // gravar (e é o evento que dispara também quando a página vai para a
    // bfcache); o `visibilitychange` cobre o telemóvel que muda de app.
    const onHide = () => savePos(true);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [savePos]);

  // prefers-reduced-motion, lido no cliente (false no SSR e na hidratação, por
  // isso não há mismatch). Serve para desligar o zoom de hover das fotos, que
  // escapava ao bloco reduced-motion do globals.css.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  const zoomClass = reduceMotion ? "" : ZOOM_CLASS;

  // O lightbox (portal, listeners de teclado/gesto, trap de foco, slideshow,
  // pré-carga de vizinhos) vive num componente-filho `Lightbox` que só é montado
  // quando `lb !== null`. Assim, nada da sua configuração — refs, efeitos,
  // listeners — corre na primeira pintura; só arranca quando o utilizador abre
  // uma foto. Comportamento idêntico depois de aberto.

  // Scroll-reveal for masonry tiles — they fade+rise as they enter view, so the
  // wall assembles itself instead of popping in. One shared IntersectionObserver
  // for every tile (created lazily on the first ref), transform/opacity only
  // (compositor work, never blocks scroll), and it unobserves each tile once
  // revealed. `registerTile` returns a cleanup (React 19 ref cleanup) so tiles
  // that unmount on a filter change stop being observed — no leak. Reduced
  // motion / no IntersectionObserver → shown immediately.
  const revealObs = useRef<IntersectionObserver | null>(null);
  const registerTile = useCallback((el: HTMLDivElement | null) => {
    if (!el || typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      el.classList.add("in", "done");
      return;
    }
    if (!revealObs.current) {
      revealObs.current = new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const tile = e.target as HTMLElement;
            tile.classList.add("in");
            obs.unobserve(tile);
            tile.addEventListener("transitionend", () => tile.classList.add("done"), {
              once: true,
            });
          }
        },
        { rootMargin: "0px 0px -6% 0px" },
      );
    }
    revealObs.current.observe(el);
    return () => revealObs.current?.unobserve(el);
  }, []);
  useEffect(() => () => revealObs.current?.disconnect(), []);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [ioSupported, setIoSupported] = useState(true);
  // Quantos píxeis à frente do dedo é que os mosaicos seguintes entram no DOM.
  // Adapta-se à velocidade do scroll — ver `useAntecipacao`.
  const { margemPx: margemAntecipacao } = useAntecipacao();
  useEffect(() => {
    setIoSupported(typeof window !== "undefined" && "IntersectionObserver" in window);
  }, []);

  // "Voltar ao topo" — o botão flutuante aparece depois de descer bastante (a
  // página cresce muito com o scroll infinito). Listener passivo, throttled com
  // rAF; setShowTop só re-renderiza quando o booleano muda (React ignora o resto).
  const [showTop, setShowTop] = useState(false);
  // O botão "voltar ao topo" só interessa depois de o utilizador descer bastante,
  // por isso registamos o scroll listener em idle — nada de trabalho de scroll na
  // main thread durante a primeira pintura.
  useEffect(() => {
    let raf = 0;
    let remove = () => {};
    const cancel = onIdle(() => {
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          setShowTop(window.scrollY > 1200);
          // O registo da posição vive DENTRO deste listener de propósito: é o
          // único listener de scroll da galeria e já está estrangulado por rAF
          // (o `savePos` acrescenta o seu próprio limite de 250 ms). Um segundo
          // listener só para gravar seria trabalho de main thread a cada frame
          // de scroll — precisamente o que esta página passou meses a tirar.
          savePos();
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
      remove = () => window.removeEventListener("scroll", onScroll);
    });
    return () => {
      cancel();
      remove();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [savePos]);
  const scrollTop = useCallback(() => {
    // Carregar em "voltar ao topo" é dizer, explicitamente, que já não se quer
    // voltar àquele sítio: apaga-se a posição guardada e suspende-se o registo
    // até a subida acabar (senão a própria animação de subida gravava as
    // posições intermédias e o restauro trazia o visitante de volta a meio).
    clearPos();
    toTopRef.current = true;
    clearTimeout(toTopTimerRef.current);
    toTopTimerRef.current = setTimeout(() => {
      toTopRef.current = false;
    }, 1200);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  }, [clearPos]);

  // Sync the active filter with the URL hash so categories and single-couple
  // views are shareable and the browser back button restores the previous
  // filter. Read post-hydration (avoids any SSR/CSR mismatch) and on every
  // hashchange.
  useEffect(() => {
    let remove = () => {};
    // A PRIMEIRA passagem por `apply` é o mount (este efeito corre em idle,
    // ~1,3s depois do arranque, haja hash ou não); as seguintes são
    // hashchanges de verdade. A distinção é o que impede este efeito de
    // ENCOLHER o que já está montado — só um hashchange real muda de vista e
    // portanto só ele recomeça em PAGE. Ver as duas notas dentro do `apply`.
    let first = true;
    const cancel = onIdle(() => {
      const apply = () => {
        const mount = first;
        first = false;
        const hash = window.location.hash.replace(/^#/, "");
        if (hash.startsWith("c-")) {
          const name = collectionFromSlug(hash.slice(2), collectionNames);
          if (name) {
            setCollectionFilter(name);
            // No mount NUNCA encolher: se voltámos a esta entrada de histórico
            // já cá estão as fotos repostas (podem ser 108) e um `setShown(PAGE)`
            // aqui cortava o documento outra vez para 24 fotos — o mesmo
            // encolhimento que faz o browser perder a posição.
            setShown((prev) => (mount ? Math.max(prev, PAGE) : PAGE));
            return;
          }
        }
        setCollectionFilter(null);
        const c = catFromSlug(hash);
        setCat((prev) => (prev === c ? prev : c));
        // Sem hash e ainda no estado inicial, NÃO repor `shown`. Este efeito
        // corre no mount (via onIdle) mesmo quando não há hash nenhum, e o
        // `setShown(PAGE)` anulava o INITIAL_PAGE=12 ~1,3s depois do arranque:
        // medido, o contador saltava de "12 de 427" para "24 de 427" aos 2,0s e
        // os pedidos do primeiro ecrã partiam em duas vagas com 964ms parados
        // no meio (…354, 354, 1318, 1318…). Com esta guarda a rampa é contínua.
        // O `Math.max` estende a mesma guarda ao restauro (`shown` reposto >
        // INITIAL_PAGE), que de outra forma seria desfeito aqui.
        setShown((prev) => (mount ? Math.max(prev, hash ? PAGE : 0) : PAGE));
      };
      apply();
      window.addEventListener("hashchange", apply);
      remove = () => window.removeEventListener("hashchange", apply);
    });
    return () => {
      cancel();
      remove();
    };
  }, [collectionNames]);

  // Localized display helpers — internal label keys stay PT (used for
  // filtering); only what the user reads is translated.
  const labelText = (l: Label) => dict.labels[l];

  // Posição de cada foto dentro do seu grupo (a coleção quando existe, senão a
  // categoria). É isto que torna o alt ÚNICO: o comentário antigo dizia que
  // juntar a coleção fazia cada foto "ler unicamente", mas a medição sobre o
  // dataset inteiro deu 427 fotos para 17 strings distintas — as 3 mais
  // repetidas cobriam 188 fotos e a pior repetia-se 86 vezes. Com a posição, as
  // 427 passam a 427 strings distintas.
  const ordinals = useMemo(() => {
    const seen = new Map<string, number>();
    const total = new Map<string, number>();
    const out = new Map<string, { n: number; of: number }>();
    for (const p of photos) {
      const key = collectionFor(p.src) ?? p.label;
      total.set(key, (total.get(key) ?? 0) + 1);
    }
    for (const p of photos) {
      const key = collectionFor(p.src) ?? p.label;
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      out.set(p.src, { n, of: total.get(key) ?? 1 });
    }
    return out;
  }, [photos]);

  // Per-photo alt text. The category template (dict.alt) alone would make
  // hundreds of photos share one identical string (bad for image SEO + a11y),
  // so when the shoot/couple is known we append it — every photo then reads
  // uniquely and descriptively (e.g. "Casamento ao ar livre — Daniela &
  // Guilherme") while keeping the localized, keyword-rich base.
  /** Descrição da foto sem posição nenhuma (o tronco comum ao alt e ao nome
      acessível do botão). */
  const altBase = (src: string, l: Label) => {
    const base = dict.alt[l];
    const c = collectionFor(src);
    return c ? `${base}: ${c}` : base;
  };
  const altText = (src: string, l: Label) => {
    const o = ordinals.get(src);
    const pos = o ? ` (${dict.lbPhoto} ${o.n} ${dict.lbOf} ${o.of})` : "";
    return altBase(src, l) + pos;
  };
  const caption = (src: string, label: Label): { caption: string; sub?: string } => {
    const c = collectionFor(src);
    return c ? { caption: c, sub: labelText(label) } : { caption: labelText(label) };
  };

  // Interleave AFTER filtering, so every category is independently well-mixed:
  // spreading across the full library first, then filtering, would let same-
  // event photos drift back together once the other categories are removed.
  // A collection view is the opposite intent — it's ONE event told in shoot
  // order — so it skips interleaving entirely.
  //
  // TUDO MISTURADO: sem blocos temáticos (a antiga regra "decoração primeiro"
  // empilhava bouquets/arranjos no topo). O interleave por coleção espalha
  // cada evento uniformemente, por isso o grid abre já com uma mistura real —
  // casais, mesas, decoração, aéreas — sem aglomerados.
  const pool = useMemo(() => {
    if (collectionFilter) {
      return photos.filter((p) => collectionFor(p.src) === collectionFilter);
    }
    const filtered = cat === "Todos" ? photos : photos.filter((p) => p.label === cat);
    return interleaveByCollection(filtered, orderSeed);
  }, [cat, collectionFilter, photos, orderSeed]);
  // Memoised so `masonryColumns` (which depends on `visible`) doesn't recompute
  // on every unrelated render (lightbox open/close, hover, showTop…): a plain
  // pool.slice() made a fresh array reference each render and defeated that memo.
  const visible = useMemo(() => pool.slice(0, shown), [pool, shown]);

  // Masonry manual: distribui as fotos por `cols` colunas equilibradas, sempre
  // para a coluna MAIS CURTA (usando a altura real de cada tile = H/W do
  // aspectRatio). Porquê não CSS multi-column: o `column-fill: balance`
  // dimensiona cada bloco de página pela sua coluna MAIS ALTA, por isso as
  // colunas mais curtas deixavam uma cauda preta até essa altura — o "fundo
  // preto no meio das fotos". O empacotamento guloso mantém as colunas quase
  // iguais (só uma pequena cauda no fundo de tudo) e é estável por prefixo:
  // carregar mais uma página nunca desloca tiles já colocados, portanto a grelha
  // continua a não re-baralhar a meio do scroll.
  const masonryColumns = useMemo(() => {
    // A fila do topo fica com as `fila` primeiras; a masonry leva o resto.
    const start = collectionFilter ? 0 : fila;
    const cells: { p: Photo; idx: number }[][] = Array.from({ length: cols }, () => []);
    const heights = new Array<number>(cols).fill(0);
    for (let i = start; i < visible.length; i++) {
      const p = visible[i];
      const [w, h] = p.aspectRatio.split("/").map((n) => parseFloat(n));
      const rel = w > 0 && h > 0 ? h / w : 1; // altura do tile a largura de coluna unitária
      let c = 0;
      for (let k = 1; k < cols; k++) if (heights[k] < heights[c]) c = k;
      cells[c].push({ p, idx: i });
      heights[c] += rel;
    }
    return cells;
  }, [visible, cols, fila, collectionFilter]);

  // ── Tabulação rotativa da grelha ────────────────────────────────────────
  // A grelha é um único ponto de tabulação e as setas ←/→ (mais Home/End)
  // percorrem as fotos por ordem de leitura lógica. Corrige duas medições: a
  // ordem de foco saltava até 3625px para trás (o DOM é coluna-a-coluna) e ao
  // 24.º Tab o foco era expulso da grelha para o link "Pedir orçamento",
  // porque o lote seguinte só montava 3s depois — 403 das 427 fotos eram
  // inalcançáveis sem rato.
  const [rovingIdx, setRovingIdx] = useState(0);
  const pendingFocusRef = useRef<number | null>(null);
  // Ao trocar de filtro/coleção o pool encolhe; o índice tabulável é sempre
  // encostado ao que existe, para a grelha nunca ficar sem porta de entrada.
  const roving = Math.min(rovingIdx, Math.max(0, visible.length - 1));
  /** Foca o mosaico `idx` na sua instância VISÍVEL (as fotos 1-3 existem duas
      vezes: na fila do topo e na grelha, e o CSS esconde uma conforme a
      largura — são quatro degraus, por isso conta a que tem tamanho). */
  const focusTile = useCallback((idx: number) => {
    if (typeof document === "undefined") return false;
    const el =
      miniaturaPintada(idx) ??
      document.querySelector<HTMLElement>(`[data-tile-idx="${idx}"][data-tile-variant="grid"]`) ??
      document.querySelector<HTMLElement>(`[data-tile-idx="${idx}"]`);
    if (!el) return false;
    el.focus();
    return true;
  }, []);
  const onTileFocus = useCallback((idx: number) => setRovingIdx(idx), []);
  /**
   * Nome acessível do botão de um mosaico. Antes não havia nenhum: o nome vinha
   * do conteúdo (alt da imagem + texto do overlay), o que dava a informação
   * colada 2-3 vezes e sem qualquer posição — 24 mosaicos visíveis partilhavam
   * 11 nomes, o mais repetido 6 vezes seguidas. Também é isto que devolve os
   * mosaicos à árvore de acessibilidade: com o nome no BOTÃO em vez de no
   * conteúdo, o `content-visibility: auto` (que salta o conteúdo dos mosaicos
   * fora do ecrã) deixa de os apagar.
   */
  const tileLabel = (src: string, l: Label, idx: number) =>
    `${altBase(src, l)}. ${dict.lbPhoto} ${idx + 1} ${dict.lbOf} ${pool.length}`;
  const onKeyNav = useCallback(
    (e: React.KeyboardEvent, idx: number) => {
      let target: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") target = idx + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = idx - 1;
      else if (e.key === "Home") target = 0;
      else if (e.key === "End") target = pool.length - 1;
      if (target === null) return;
      e.preventDefault();
      const to = Math.max(0, Math.min(target, pool.length - 1));
      setRovingIdx(to);
      if (!focusTile(to)) {
        // Ainda não está montado: carrega até lá e foca quando aparecer.
        pendingFocusRef.current = to;
        startTransition(() => setShown((s) => Math.max(s, Math.min(to + 1, pool.length))));
      }
    },
    [pool.length, focusTile],
  );
  useIsomorphicLayoutEffect(() => {
    const want = pendingFocusRef.current;
    if (want === null) return;
    if (focusTile(want)) pendingFocusRef.current = null;
  }, [shown, cols, focusTile]);

  // Infinite scroll — a sentinel below the grid loads the next page as it nears
  // the viewport (no "Ver mais" click). Recreated whenever `shown`/`pool.length`
  // change: re-observing reports the current intersection immediately, so if the
  // sentinel is still in view after a page loads it chains to the next one, and
  // it naturally stops once every photo is shown. rootMargin loads ~one viewport
  // ahead so tiles are ready before they scroll in. Browsers without
  // IntersectionObserver fall back to the manual button (see `ioSupported`).
  useEffect(() => {
    if (shown >= pool.length) return;
    const el = sentinelRef.current;
    if (!el || typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        // Non-urgent update: React yields while mounting the next page of tiles
        // so a long scroll never stutters ("super fluido"). The new tiles carry
        // `default="none"` view-transition-names, so no morph/flash fires here.
        if (entries[0]?.isIntersecting)
          startTransition(() => setShown((s) => Math.min(s + PAGE, pool.length)));
      },
      /**
       * A MARGEM É O QUE DECIDE SE A FOTO CHEGA A TEMPO — e por isso não pode
       * ser fixa.
       *
       * Esteve em 800 px. Não por acaso: com 400 px o scroll infinito partia-se
       * (no fundo da página a sentinela fica ~707 px ACIMA do viewport, porque
       * debaixo dela ainda vem a secção do Instagram) e a galeria congelava em
       * 252 de 427 no telemóvel. Mas 800 px também não chegava: medido, a
       * antecipação real ficava em ~1100 px, o que a 1668 px/s dá 660 ms — e a
       * 4000 px/s, que é um flick a sério, dá 275 ms. Uma foto não vem em
       * 275 ms. Daí as 35 fotografias que na secretária eram pedidas com o
       * mosaico JÁ à vista.
       *
       * `useAntecipacao` devolve a margem que mantém constante o TEMPO de
       * aviso (1,2 s), com piso de 2 ecrãs e tecto de 6 — e em degraus
       * inteiros, para não se criar um observador por frame.
       *
       * O que continua igual: quem limita a rajada de pedidos é a fila
       * (load-queue.ts), não esta margem. Ela pode ser folgada à vontade.
       */
      { rootMargin: `${margemAntecipacao}px 0px` },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, pool.length, margemAntecipacao]);

  // Lightbox navigation (through entire pool, not just shown)
  const openAt = useCallback((idx: number) => {
    // Abrir é um estado simples, sem View Transition (essa tirava um retrato
    // da camada inteira e obrigava a grelha toda a voltar a desenhar-se). O
    // que liga a miniatura à foto é o VOO: mede-se aqui a miniatura em que se
    // tocou e o `Lightbox` faz a cópia dela voar até ao sítio da foto.
    setOrigem(medirMiniatura(idx));
    setJustOpened(true);
    setLb(idx);
  }, []);
  /**
   * Pede para fechar. Quem anima a saída é o `Lightbox` — o voo de volta à
   * miniatura quando ela está à vista, um esbatimento quando não está, nada
   * com movimento reduzido — e é ele que chama `fechado()` no fim. Pedir duas
   * vezes (o Escape repetido, o ✕ a seguir ao Escape) é o mesmo que pedir uma.
   */
  const close = useCallback(() => setClosing(true), []);
  const fechado = useCallback(() => {
    setLb(null);
    setClosing(false);
    setOrigem(null);
  }, []);
  // Fecho sem voo — para o gesto de arrastar-para-baixo, onde a própria foto
  // já saiu do ecrã com o dedo.
  const dismiss = fechado;
  // SEM DAR A VOLTA (GAL-2). Da primeira para trás saltava para a 917 sem
  // aviso; agora as pontas são pontas — o visualizador mostra-o com um
  // elástico, e o ‹ e o › desaparecem lá.
  const prev = useCallback(() => {
    if (lb === null || lb <= 0) return;
    setJustOpened(false);
    setLb(lb - 1);
  }, [lb]);
  const next = useCallback(() => {
    if (lb === null || lb >= pool.length - 1) return;
    setJustOpened(false);
    setLb(lb + 1);
  }, [lb, pool]);

  // (Todos os efeitos exclusivos do lightbox — teclado/trap de foco, foco de
  // entrada/saída, slideshow, bloqueio de scroll do body e gestos táteis — vivem
  // agora dentro do componente `Lightbox`, que só monta quando está aberto.)

  function switchCat(c: Cat) {
    if (c === cat && !collectionFilter) return;
    setFading(true);
    setTimeout(() => {
      setCat(c);
      setCollectionFilter(null);
      setShown(PAGE);
      setFading(false);
    }, 160);
    // Reflect the filter in the URL (shareable / bookmarkable) without adding a
    // history entry per click.
    const slug = CAT_SLUGS[c];
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search;
    // `history.state` PRESERVADO (era `null`): é lá que vive o carimbo desta
    // entrada (`galeriaPos`, ver POS_PREFIX) — e também a árvore do router do
    // App Router. Apagá-lo aqui deixava o visitante sem restauro de posição a
    // partir do momento em que trocasse de vista.
    window.history.replaceState(window.history.state, "", url);
  }

  // Called from inside the (open) lightbox, so the grid fade doesn't apply —
  // it's hidden behind the modal. Deliberately does NOT go through close()
  // first: re-pointing `lb` at the same photo's new index, in the same
  // commit as the pool swap, means the visible photo never changes.
  const viewCollection = useCallback(
    (name: string) => {
      const newPool = photos.filter((p) => collectionFor(p.src) === name);
      const currentSrc = lb !== null ? pool[lb].src : null;
      const newIdx = currentSrc ? newPool.findIndex((p) => p.src === currentSrc) : -1;
      setCollectionFilter(name);
      setShown(PAGE);
      setJustOpened(false);
      if (newIdx >= 0) setLb(newIdx);
      else if (lb !== null) close();
      // `history.state` preservado — ver a nota igual em `switchCat`.
      window.history.replaceState(window.history.state, "", `#c-${collectionSlug(name)}`);
    },
    [photos, pool, lb, close],
  );

  return (
    <>
      {/* ── Filtros / vista de casamento ── */}
      {/* A grelha é full-bleed (o wrapper max-w/px saiu da page), por isso o
          chrome dos filtros leva aqui o seu próprio padding lateral. */}
      {collectionFilter ? (
        <div className="flex items-center gap-4 mb-8 px-3 sm:px-4 lg:px-6">
          <button
            onClick={() => switchCat("Todos")}
            className="flex-shrink-0 flex min-h-[44px] items-center gap-1.5 border border-white/25 px-4 py-2 text-[11px] tracking-[0.2em] uppercase text-white/70 hover:border-white/60 hover:text-white transition-colors duration-300"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {dict.backToGallery}
          </button>
          <div className="min-w-0">
            <p
              className="text-white/90 text-base truncate"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {collectionFilter}
            </p>
            <p className="text-white/55 text-[10px] tracking-[0.15em] uppercase mt-0.5">
              {pool.length} {dict.photosLabel}
            </p>
          </div>
        </div>
      ) : (
        /* Category filter bar removed on request — the gallery shows every
           photo, with no category chrome. (Collection deep-links still work via
           the collection view above; there's just no category filter now.) */
        <div className="mb-6" />
      )}

      {/* ── Grid ── */}
      {/* O contentor do masonry era um `DIV role=none label=none`: 427 botões
          soltos, sem região, sem nome e sem posição. Agora é um grupo com nome
          e com uma instrução (as setas) que o leitor de ecrã anuncia à entrada.
          Isto e o `aria-label` de cada mosaico são o que dá contexto a quem
          navega sem ver. */}
      <div
        role="group"
        aria-label={dict.gridLabel}
        aria-describedby="galeria-grid-hint"
        style={{ opacity: fading ? 0 : 1, transition: "opacity 0.16s" }}
      >
        <p id="galeria-grid-hint" className="sr-only">
          {dict.gridHint}
        </p>
        {/* A fila do topo, sem cortes (ver `FILA_MAX`). Fora da vista de
            coleção: a coleção é uma história só, e começa direita na grelha. */}
        {!collectionFilter && visible.length > 0 && (
          <div className="flex items-start gap-0.5 mb-0.5">
            {visible.slice(0, FILA_MAX).map((p, idx, fila) => (
              <FotoDaFila
                key={p.src}
                photo={p}
                idx={idx}
                sizes={sizesDaFila(
                  fila.map((f) => razaoDe(f.aspectRatio)),
                  idx,
                )}
                alt={altText(p.src, p.label)}
                label={tileLabel(p.src, p.label, idx)}
                cap={caption(p.src, p.label)}
                tabbable={roving === idx}
                zoomClass={zoomClass}
                unavailableLabel={dict.photoUnavailable}
                onOpen={openAt}
                onKeyNav={onKeyNav}
                onTileFocus={onTileFocus}
              />
            ))}
          </div>
        )}

        {/* Masonry — fotos restantes (as da fila que não cabem nela a esta
            largura reaparecem aqui); numa vista de coleção começa em 0, sem
            fila.

            Colunas flex distribuídas manualmente (ver `masonryColumns`), NÃO
            CSS multi-column: cada coluna é uma pilha independente que encolhe
            até ao seu conteúdo (`items-start`), por isso nunca há uma cauda
            preta por baixo de uma coluna mais curta. Como o empacotamento é
            estável por prefixo, carregar mais fotos apenas prolonga as colunas
            existentes — os tiles já vistos não mudam de sítio. */}
        {(collectionFilter ? visible.length > 0 : visible.length > 1) && (
          <div className="flex items-start gap-0.5">
            {masonryColumns.map((col, ci) => (
              <div key={ci} className="flex min-w-0 flex-1 flex-col gap-0.5">
                {col.map(({ p, idx }, j) => {
                  const cap = caption(p.src, p.label);
                  return (
                    <Tile
                      key={p.src}
                      photo={p}
                      idx={idx}
                      alt={altText(p.src, p.label)}
                      label={tileLabel(p.src, p.label, idx)}
                      caption={cap.caption}
                      sub={cap.sub}
                      escondida={!collectionFilter && idx < FILA_MAX ? NA_GRELHA_ATE[idx] : ""}
                      eager={!!collectionFilter && idx === 0}
                      revealDelay={(j % 3) * 60}
                      tabbable={roving === idx}
                      unavailableLabel={dict.photoUnavailable}
                      zoomClass={zoomClass}
                      onOpen={openAt}
                      onKeyNav={onKeyNav}
                      onTileFocus={onTileFocus}
                      registerTile={registerTile}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Scroll infinito ── */}
      <div className="mt-14 flex flex-col items-center gap-4">
        {shown < pool.length && (
          <>
            {/* Sentinela invisível — o IntersectionObserver carrega a próxima
                página quando ela se aproxima do ecrã. */}
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
            {ioSupported && (
              <div className="g-loading flex items-center gap-2" aria-hidden>
                <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
                <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
                <span className="g-loading-dot h-1.5 w-1.5 rounded-full bg-moss-light" />
              </div>
            )}
            {/* Botão "Ver mais" REAL, sempre montado, não só quando falta o
                IntersectionObserver. Com o scroll infinito ele fica invisível
                (sr-only) até receber foco: é a saída de teclado que faltava —
                quem sai da grelha com Tab encontra sempre algo focável que
                carrega o lote seguinte, em vez de ser expulso para o CTA. */}
            <button
              onClick={() => setShown((s) => Math.min(s + PAGE, pool.length))}
              className={`group flex min-h-[44px] items-center gap-3 border border-white/70 px-10 py-3.5 text-[11px] uppercase tracking-[0.3em] text-white transition-colors duration-300 hover:border-white hover:bg-white hover:text-[#0c0e0b] ${
                ioSupported ? "sr-only focus:not-sr-only focus:relative" : ""
              }`}
            >
              {dict.verMais}
              <span className="text-white/55 transition-colors group-hover:text-[#0c0e0b]/70">
                +{Math.min(PAGE, pool.length - shown)}
              </span>
            </button>
            <div className="relative h-px w-40 overflow-hidden bg-white/10">
              <div
                className="absolute inset-0 origin-left bg-moss/60 motion-safe:transition-transform motion-safe:duration-500"
                style={{ transform: `scaleX(${fraccaoDaBarra(shown, pool.length)})` }}
              />
            </div>
          </>
        )}
        {/* Contador SEMPRE montado. O bloco inteiro desmontava assim que
            `shown >= pool.length`, por isso o estado final ("427 de 427") era o
            único que nunca chegava a ser anunciado. */}
        {/* `shown` arranca em INITIAL_PAGE=12 mesmo quando o pool é menor, por
            isso encosta-se ao total: agora que o contador está sempre montado,
            sem isto lia-se "12 de 8". */}
        <p role="status" className="text-[10px] tracking-widest text-white/55">
          {Math.min(shown, pool.length)} {dict.de} {pool.length}
        </p>
      </div>

      {/* ── Lightbox ── LAZY-MOUNT: só existe quando aberto. Todo o seu JS de
          runtime — portal, listeners de teclado/gesto, trap de foco, slideshow,
          pré-carga de vizinhos — não corre na primeira pintura; arranca apenas
          ao abrir uma foto e desmonta ao fechar. Comportamento idêntico. */}
      {lb !== null && (
        <Lightbox
          index={lb}
          pool={pool}
          origem={origem}
          closing={closing}
          fechado={fechado}
          justOpened={justOpened}
          setJustOpened={setJustOpened}
          setLb={setLb}
          close={close}
          prev={prev}
          next={next}
          dict={dict}
          dismiss={dismiss}
          viewCollection={viewCollection}
        />
      )}

      {/* ── Voltar ao topo ── No canto inferior direito. Estava empilhado por
          cima do WhatsApp (`bottom: 5rem`); desde 2/11 a galeria não tem
          botões flutuantes (nem WhatsApp nem «Pedir proposta», pedido dela),
          por isso desce para o canto. Escondido enquanto o lightbox está
          aberto. */}
      <button
        onClick={scrollTop}
        aria-label={dict.backToTop}
        title={dict.backToTop}
        inert={!(showTop && lb === null)}
        className={`fixed z-40 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white/80 ring-1 ring-white/15 backdrop-blur-md transition-all duration-300 hover:scale-105 hover:bg-black/70 hover:text-white active:scale-95 ${
          showTop && lb === null
            ? "translate-y-0 opacity-100"
            : "pointer-events-none translate-y-3 opacity-0"
        }`}
        style={{
          bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
          right: "calc(1.25rem + env(safe-area-inset-right))",
        }}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </>
  );
}

/**
 * O que se sabe sobre UMA fotografia do lightbox. Carimbado com o índice dela
 * de propósito — ver a nota grande dentro do `Lightbox`.
 */
type EstadoDaFoto = {
  idx: number;
  /** Portão da pré-carga: os vizinhos só são pedidos depois de ESTA chegar. */
  carregada: boolean;
  formato: "avif" | "webp";
  /** Desistiu-se da derivada: pede-se o ficheiro original tal e qual. */
  cru: boolean;
  /** Nem o original veio: mostra-se a frase e o «Tentar de novo». */
  falhou: boolean;
  /** Quantas vezes se carregou em «Tentar de novo» (muda a chave do `<Image>`). */
  tentativa: number;
};
const estadoDaFotoDoZero = (idx: number, tentativa = 0): EstadoDaFoto => ({
  idx,
  carregada: false,
  formato: "avif",
  cru: false,
  falhou: false,
  tentativa,
});

/** De onde parte o voo — ver `openAt` e `voo.ts`. */
type OrigemDoVoo = {
  /** A caixa da miniatura (o botão, que corta). */
  recorte: Caixa;
  /** A caixa do `<img>` dela — maior do que o recorte com o zoom do rato. */
  imagem: Caixa;
  /** O `object-position` com que ela corta. */
  foco: string;
  /** O ficheiro que ela está a mostrar: já está no browser, não se pede outro. */
  src: string;
};

const caixaDe = (r: DOMRect): Caixa => ({ x: r.left, y: r.top, w: r.width, h: r.height });

/**
 * A miniatura PINTADA da foto `idx`. As fotos 1 a 3 existem duas vezes (na
 * fila do topo e na grelha) e o CSS esconde uma: conta a que tem tamanho.
 */
function miniaturaPintada(idx: number): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tile-idx="${idx}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/** Mede a miniatura de onde se vai voar; `null` se ainda não tem fotografia. */
function medirMiniatura(idx: number): OrigemDoVoo | null {
  if (typeof document === "undefined") return null;
  const tile = miniaturaPintada(idx);
  const img = tile?.querySelector("img");
  if (!tile || !img || !img.complete || !img.naturalWidth || !img.currentSrc) return null;
  return {
    recorte: caixaDe(tile.getBoundingClientRect()),
    imagem: caixaDe(img.getBoundingClientRect()),
    foco: getComputedStyle(img).objectPosition,
    src: img.currentSrc,
  };
}

/** Põe a cópia que voa exactamente em cima da caixa onde a foto vai ficar. */
function posicionar(el: HTMLElement, c: Caixa) {
  el.style.left = `${c.x}px`;
  el.style.top = `${c.y}px`;
  el.style.width = `${c.w}px`;
  el.style.height = `${c.h}px`;
}

/**
 * O lightbox propriamente dito. É montado SÓ quando aberto (ver `GaleriaClient`),
 * por isso todos os seus refs, efeitos e listeners (teclado, trap de foco, foco
 * de entrada/saída, slideshow, bloqueio de scroll, gestos táteis, pré-carga de
 * vizinhos) só arrancam ao abrir — nunca na primeira pintura da galeria.
 *
 * Abre com a miniatura a VOAR até ao sítio da foto e fecha com ela a voltar
 * para a grelha (ver `voo.ts`); o fundo toma a cor da fotografia aberta.
 */
function Lightbox({
  index,
  pool,
  origem,
  closing,
  fechado,
  justOpened,
  setJustOpened,
  setLb,
  close,
  prev,
  next,
  dismiss,
  viewCollection,
  dict,
}: {
  index: number;
  pool: Photo[];
  origem: OrigemDoVoo | null;
  closing: boolean;
  /** A saída acabou: desmonta. */
  fechado: () => void;
  justOpened: boolean;
  setJustOpened: (v: boolean) => void;
  setLb: (v: number | null) => void;
  close: () => void;
  prev: () => void;
  next: () => void;
  dismiss: () => void;
  viewCollection: (name: string) => void;
  dict: Dict["galeria"];
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  /**
   * TRÊS CAIXAS, CADA UMA COM O SEU TRABALHO (GAL-2).
   *
   *  · `photoLayerRef` — a camada FIXA da foto. Nunca se mexe: é ela que se
   *    mede para o voo de abrir e fechar e para o «qualquer preto fecha»;
   *  · `arrastoRef` — o arrastar para baixo para fechar (`translateY`);
   *  · `pistaRef` — a pista das três fotografias (`translateX`), que segue o
   *    dedo e assenta com a mola da casa.
   *
   * Os gestos escrevem nos `ref`s, nunca no estado: um arrasto não desenha o
   * React fotograma a fotograma.
   */
  const photoLayerRef = useRef<HTMLDivElement>(null);
  const arrastoRef = useRef<HTMLDivElement>(null);
  const pistaRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  /** A cópia da miniatura que voa — ver `voo.ts`. Gerida à mão, fora do React. */
  const vooRef = useRef<HTMLImageElement>(null);
  const vooAnimRef = useRef<Animation | null>(null);
  const segurancaRef = useRef<number | undefined>(undefined);

  /**
   * O que se decide UMA vez, ao abrir: movimento reduzido, se o browser sabe
   * animar, e portanto se há voo. Sem voo (sem miniatura pintada, movimento
   * reduzido, jsdom), a foto entra com o `lb-photo-in` de sempre — ou, com
   * movimento reduzido, aparece.
   */
  const [arranque] = useState(() => {
    const reduzido =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const anima = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
    return {
      index,
      origem,
      reduzido,
      anima,
      voa: !!origem && !reduzido && anima,
      prop: proporcao(pool[index].aspectRatio),
    };
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE SE SABE SOBRE A FOTOGRAFIA ABERTA VEM CARIMBADO COM O ÍNDICE DELA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * São três coisas — se já carregou (portão da pré-carga dos vizinhos), em que
   * formato está a ser pedida, e se já se desistiu da derivada — e as três são
   * DA FOTOGRAFIA, não do lightbox. Eram três `useState` repostos num efeito
   * PASSIVO com `[index]`, e um efeito passivo corre DEPOIS do commit: no
   * commit em que o índice muda, os três valores ainda são os da fotografia
   * anterior. Isso via-se, e não era teórico:
   *
   *  • `heroLoaded` ficava `true` por um commit, portanto os dois `<img>` dos
   *    vizinhos NOVOS eram montados — e um `<img>` montado é um pedido — ao
   *    mesmo tempo que a fotografia que a pessoa acabou de abrir. É exactamente
   *    a disputa que o portão existe para evitar. A seguir o efeito arrancava-os
   *    do DOM, abortando os pedidos, para os voltar a fazer do zero quando o
   *    herói chegasse. Medido com `GaleriaClient.precarga.test.tsx`: dois
   *    `<img>` de vizinho criados e removidos dentro do mesmo `→`;
   *  • `lbRaw`/`lbFormato` arrastavam a desistência da fotografia ANTERIOR para
   *    a seguinte: depois de uma foto cair no ficheiro original, a seguinte era
   *    pedida em original (a fotografia inteira, sem derivada) durante esse
   *    commit, antes de o efeito a repor em AVIF.
   *
   * Com o carimbo, a reposição é DERIVADA no próprio render: um índice novo lê
   * um estado novo no mesmo instante em que o índice muda, sem commit nenhum
   * pelo meio e sem efeito nenhum.
   */
  const [guardado, setGuardado] = useState<EstadoDaFoto>(() => estadoDaFotoDoZero(index));
  const foto = guardado.idx === index ? guardado : estadoDaFotoDoZero(index);
  /** Anota o que se sabe da fotografia ABERTA — nunca da anterior. */
  const anotar = (mudanca: (a: EstadoDaFoto) => EstadoDaFoto) =>
    setGuardado((p) => mudanca(p.idx === index ? p : estadoDaFotoDoZero(index)));
  const heroLoaded = foto.carregada;

  /**
   * A foto do lightbox é a ÚNICA imagem da galeria que continua a passar pelo
   * optimizador (é a única que precisa de mais resolução do que as miniaturas
   * pré-geradas, e abre uma de cada vez — não faz rajada). Como não tem
   * re-tentativa nem legenda de falha, ganha aqui a mesma rede de segurança
   * que a grelha já tinha: se o optimizador falhar, serve-se o ficheiro
   * original de `/imagens/x.jpg`. Uma foto pesada é melhor do que um ecrã
   * preto. Repõe-se a cada foto (ver o carimbo acima).
   */
  const lbRaw = foto.cru;
  /**
   * ── O FORMATO DA FOTOGRAFIA GRANDE ────────────────────────────────────────
   *
   * A grelha passou a AVIF e o lightbox tinha ficado para trás: pedia
   * `<chave>-1280.webp` para a foto mostrada E para os dois vizinhos
   * pré-carregados. Medido na escada: 169,9 KB em WebP contra 125,8 em AVIF a
   * 1280 px — **~44 KB por fotografia aberta**, e quem percorre o lightbox
   * foto a foto paga isso em cada uma.
   *
   * Porquê uma ESCADA de formato e não um `<picture>` como na grelha: esta
   * fotografia está embrulhada no `<ViewTransition>` do morph e tem de
   * continuar a ser UM elemento com um nome só. Um `<picture>` aqui obrigava a
   * refazer o morph. Um degrau a mais na escada de recuo que já existia
   * (avif → webp → ficheiro original) dá o mesmo resultado sem lhe tocar.
   *
   * Um browser sem AVIF falha o primeiro pedido e cai no WebP — um pedido
   * desperdiçado, uma vez por fotografia, para uma minoria que de outra forma
   * não teria fotografia nenhuma. O degrau seguinte continua a ser o ficheiro
   * original, que existe sempre.
   */
  const lbFormato = foto.formato;

  // Defer the (secondary) thumbnail strip to the frame AFTER the lightbox
  // opens, so the open commit only has to mount the hero photo — not also a row
  // of thumbnail <Image>s. Keeps the open frame light on low-end phones; the
  // strip fades in a frame later. Double rAF = after the first paint.
  const [chromeReady, setChromeReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setChromeReady(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const labelText = (l: Label) => dict.labels[l];
  const altText = (src: string, l: Label) => {
    const base = dict.alt[l];
    const c = collectionFor(src);
    return c ? `${base}: ${c}` : base;
  };

  /** Salta para uma foto (a tira, o Início, o Fim). */
  const irPara = useCallback(
    (i: number) => {
      setJustOpened(false);
      setLb(i);
    },
    [setJustOpened, setLb],
  );

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A PISTA: A FOTO SEGUE O DEDO, E ASSENTA COM MOLA (GAL-2)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A anterior, a actual e a seguinte estão lado a lado. O dedo arrasta a pista
   * inteira, e ao largar a mola da casa (`assentar`, a mesma da curadoria de
   * fotografias) leva-a para a vizinha — com a velocidade que o dedo trazia —
   * ou de volta ao sítio. Quem decide é `decidirDeslize` (voo.ts): 20 % da
   * largura, ou um gesto rápido mesmo curto. Nas pontas não há vizinha, e o
   * dedo sente um elástico (`elastico`) em vez de saltar para a 917.
   *
   * Sem `Element.animate` (jsdom) ou com movimento reduzido, nada desliza: a
   * troca é imediata. O dedo continua a mover a foto — é manipulação directa,
   * não animação.
   */
  const xRef = useRef(0);
  const pararMolaRef = useRef<(() => void) | null>(null);
  /** O sentido da viagem em curso (a mola a caminho da vizinha), ou 0. */
  const viagemRef = useRef<-1 | 0 | 1>(0);
  /** Para o clique que vem a seguir a um arrasto não contar como toque. */
  const arrastouRef = useRef(false);
  const desliza = arranque.anima && !arranque.reduzido;
  /**
   * Como se chegou à foto aberta: a deslizar (a vizinha que já estava na pista
   * passa a ser a do meio, sem esbatimento) ou num salto (a tira, o Início, o
   * Fim — esbate-se como antes).
   */
  const [entrada, setEntrada] = useState<"salto" | "deslize">("salto");
  /**
   * As vizinhas na pista só se montam depois de a foto aberta chegar (a mesma
   * porta da pré-carga), ou assim que um gesto começa — aí já fazem falta.
   */
  const [vizinhasJa, setVizinhasJa] = useState(false);
  const vizinhasJaRef = useRef(false);
  const montarVizinhas = useCallback(() => {
    if (vizinhasJaRef.current) return;
    vizinhasJaRef.current = true;
    setVizinhasJa(true);
  }, []);

  const pintarPista = useCallback((x: number) => {
    xRef.current = x;
    const pista = pistaRef.current;
    if (pista) pista.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
  }, []);
  const pararMola = useCallback(() => {
    pararMolaRef.current?.();
    pararMolaRef.current = null;
  }, []);
  /** Uma volta da mola da casa até `alvo`, a partir de onde a pista está. */
  const molaAte = useCallback(
    (alvo: number, velocidadePxMs: number, fim?: () => void) => {
      pararMola();
      pararMolaRef.current = assentar(
        { x: xRef.current - alvo, y: 0 },
        (p) => {
          pintarPista(alvo + p.x);
          if (p.x === 0 && p.y === 0) {
            pararMolaRef.current = null;
            fim?.();
          }
        },
        { x: velocidadePxMs * 1000, y: 0 },
      );
    },
    [pararMola, pintarPista],
  );

  /** Troca para a vizinha — já, sem animação. */
  const mudar = useCallback(
    (dir: -1 | 1) => {
      setEntrada("deslize");
      if (dir > 0) next();
      else prev();
    },
    [next, prev],
  );
  /** A pista viaja até à vizinha e, chegada lá, a vizinha passa a ser a aberta. */
  const viajar = useCallback(
    (dir: -1 | 1, velocidadePxMs = 0) => {
      const largura = photoLayerRef.current?.clientWidth ?? 0;
      viagemRef.current = dir;
      molaAte(-dir * (largura + DESLIZE_INTERVALO_PX), velocidadePxMs, () => {
        viagemRef.current = 0;
        mudar(dir);
      });
    },
    [molaAte, mudar],
  );
  /** Na ponta: um empurrão elástico, e volta. */
  const empurrar = useCallback(
    (dir: -1 | 1) => {
      const largura = photoLayerRef.current?.clientWidth ?? 0;
      pintarPista(elastico(-dir * 72, largura));
      molaAte(0, 0);
    },
    [molaAte, pintarPista],
  );
  /** ‹ › e as setas: deslizam como o dedo. */
  const andar = useCallback(
    (dir: -1 | 1) => {
      if (viagemRef.current) return; // uma viagem de cada vez
      const existe = dir > 0 ? index < pool.length - 1 : index > 0;
      if (!desliza) {
        if (existe) mudar(dir);
        return;
      }
      if (!existe) {
        empurrar(dir);
        return;
      }
      montarVizinhas();
      // Um fotograma para a vizinha estar na pista antes de a pista andar.
      requestAnimationFrame(() => viajar(dir));
    },
    [desliza, index, pool.length, mudar, empurrar, montarVizinhas, viajar],
  );

  // Uma foto nova está aberta: a pista volta a zero NO MESMO fotograma em que
  // as fotografias trocam de lugar (efeito de layout, antes da pintura) — a
  // vizinha que estava à direita passa a estar ao meio, e não se vê salto.
  useIsomorphicLayoutEffect(() => {
    pararMola();
    viagemRef.current = 0;
    pintarPista(0);
  }, [index]);
  useEffect(() => () => pararMolaRef.current?.(), []);

  /** O gesto em curso. Só dedo e caneta: o rato tem os botões e as setas. */
  const gesto = useRef({
    id: -1,
    x0: 0,
    y0: 0,
    dx: 0,
    dy: 0,
    eixo: "" as "" | "x" | "y",
    base: 0,
    amostras: [] as { t: number; x: number }[],
  });
  const aoPousar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" || closing) return;
    // Um dedo que pousa enquanto a foto ainda assenta agarra-a onde ela está.
    pararMola();
    viagemRef.current = 0;
    gesto.current = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      dx: 0,
      dy: 0,
      eixo: "",
      base: xRef.current,
      amostras: [{ t: e.timeStamp, x: e.clientX }],
    };
    arrastouRef.current = false;
  };
  const aoMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = gesto.current;
    if (e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x0;
    g.dy = e.clientY - g.y0;
    if (g.eixo === "") {
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) return;
      g.eixo = Math.abs(g.dy) > Math.abs(g.dx) ? "y" : "x";
      arrastouRef.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (g.eixo === "y") arrastoRef.current?.classList.add("lb-dragging");
      else montarVizinhas();
    }
    if (g.eixo === "x") {
      g.amostras.push({ t: e.timeStamp, x: e.clientX });
      while (g.amostras.length > 2 && e.timeStamp - g.amostras[0].t > 100) g.amostras.shift();
      const largura = photoLayerRef.current?.clientWidth ?? 0;
      const total = g.base + g.dx;
      const semVizinha = (total > 0 && index <= 0) || (total < 0 && index >= pool.length - 1);
      pintarPista(semVizinha ? elastico(total, largura) : total);
    } else if (g.dy > 0) {
      // Arrastar para baixo para fechar: a foto segue o dedo e o fundo
      // desvanece, como nas Fotografias do iPhone.
      const l = arrastoRef.current;
      const b = backdropRef.current;
      const escala = 1 - Math.min(g.dy / 1400, 0.12);
      if (l) l.style.transform = `translateY(${g.dy}px) scale(${escala})`;
      if (b) b.style.opacity = String(1 - Math.min(g.dy / 500, 0.72));
    }
  };
  const aoLargar = (e: React.PointerEvent<HTMLDivElement>, cancelado = false) => {
    const g = gesto.current;
    if (e.pointerId !== g.id) return;
    g.id = -1;
    if (g.eixo === "x") {
      const a = g.amostras;
      const primeira = a[0];
      const ultima = a[a.length - 1];
      const dt = ultima.t - primeira.t;
      const velocidade = dt > 0 ? (ultima.x - primeira.x) / dt : 0;
      const largura = photoLayerRef.current?.clientWidth ?? 0;
      const dir = cancelado
        ? 0
        : decidirDeslize({
            dx: g.base + g.dx,
            velocidade,
            largura,
            haAnterior: index > 0,
            haSeguinte: index < pool.length - 1,
          });
      if (dir && desliza) viajar(dir, velocidade);
      else if (dir) mudar(dir);
      else if (desliza) molaAte(0, velocidade);
      else pintarPista(0);
    } else if (g.eixo === "y") {
      const l = arrastoRef.current;
      const b = backdropRef.current;
      l?.classList.remove("lb-dragging");
      if (!cancelado && g.dy > 120) {
        if (l) l.style.transform = "translateY(115%) scale(0.88)";
        if (b) b.style.opacity = "0";
        window.setTimeout(dismiss, 220);
      } else {
        if (l) l.style.transform = "";
        if (b) b.style.opacity = "";
      }
    }
    g.eixo = "";
  };

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * MAIS FOTOGRAFIA NO ECRÃ (GAL-4)
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A barra de cima, as setas e a tira flutuam POR CIMA da foto, e escondem-se
   * ao fim de 2,5 s parados. Mexer o rato traz-as; um toque na foto mostra-as
   * ou esconde-as (um toque no preto, fora dela, continua a fechar). Escondidas
   * ficam `inert`: o Tab não cai num botão que não se vê.
   *
   * No telemóvel (ponteiro grosso) não há tira nem ‹ ›: ficam os gestos, e a
   * barra de cima com o fechar.
   */
  const [tocar] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
  );
  const [chromeVisivel, setChromeVisivel] = useState(true);
  const [dicasAbertas, setDicasAbertas] = useState(false);
  const esconderRef = useRef<number | undefined>(undefined);
  /** O rato está por cima da barra ou da tira: não se esconde debaixo dele. */
  const sobreChromeRef = useRef(false);
  const agendarEsconder = useCallback(() => {
    window.clearTimeout(esconderRef.current);
    esconderRef.current = window.setTimeout(function esconder() {
      const focado = document.activeElement?.closest?.(".lb-cromagem");
      if (sobreChromeRef.current || focado) {
        esconderRef.current = window.setTimeout(esconder, CROMAGEM_ESCONDE_MS);
        return;
      }
      setDicasAbertas(false);
      setChromeVisivel(false);
    }, CROMAGEM_ESCONDE_MS);
  }, []);
  const mostrarChrome = useCallback(() => {
    setChromeVisivel(true);
    agendarEsconder();
  }, [agendarEsconder]);
  useEffect(() => {
    agendarEsconder();
    return () => window.clearTimeout(esconderRef.current);
  }, [agendarEsconder]);
  const alternarChrome = () => {
    if (chromeVisivel) {
      window.clearTimeout(esconderRef.current);
      setDicasAbertas(false);
      setChromeVisivel(false);
    } else mostrarChrome();
  };

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      // A sair, as teclas já não mexem em nada: só o Tab continua preso.
      if (closing && e.key !== "Tab") return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") andar(-1);
      else if (e.key === "ArrowRight") andar(1);
      else if (e.key === "Home") {
        e.preventDefault();
        irPara(0);
      } else if (e.key === "End") {
        e.preventDefault();
        irPara(pool.length - 1);
      } else if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // «f» põe o visualizador em ecrã inteiro, e tira-o. O Esc do browser
        // também o tira (e esse Esc não chega aqui: o browser fica com ele).
        const d = dialogRef.current;
        if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
        else if (d?.requestFullscreen) void d.requestFullscreen().catch(() => {});
      } else if (e.key === "Tab" && !chromeVisivel) {
        // A barra está escondida (e `inert`): o primeiro Tab mostra-a, e é
        // o seguinte que entra nela.
        e.preventDefault();
        mostrarChrome();
      } else if (e.key === "Tab" && dialogRef.current) {
        // Trap focus inside the lightbox dialog.
        const f = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        const active = document.activeElement;
        if (!dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [close, andar, irPara, closing, pool.length, chromeVisivel, mostrarChrome]);

  // Move focus into the dialog on open; restore it to the trigger on close
  // (mount = abrir, unmount = fechar, já que este componente só vive aberto).
  // Índice actual num ref, para a limpeza do efeito de foco (que corre uma só
  // vez, no unmount) saber qual era a foto aberta.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      cancelAnimationFrame(id);
      const origin = restoreFocusRef.current;
      // `viewCollection` ("Ver este casamento") troca o pool inteiro: o mosaico
      // de origem já foi desmontado e focá-lo mandava o foco para o <body>
      // (medido: focusOnBody true, activeElement BODY). Confirmar `isConnected`
      // e, se falhar, cair no mosaico da foto que estava aberta.
      //
      // `preventScroll`: devolver o foco não pode mexer na página. Sem ele, o
      // browser rolava a miniatura para dentro da `scroll-padding-top` do
      // cabeçalho, e a grelha saltava por baixo de quem acabou de fechar.
      if (origin?.isConnected) {
        origin.focus?.({ preventScroll: true });
        return;
      }
      const tile =
        miniaturaPintada(indexRef.current) ??
        document.querySelector<HTMLElement>(`[data-tile-idx="${indexRef.current}"]`);
      (tile ?? document.querySelector<HTMLElement>("[data-tile-idx]"))?.focus({
        preventScroll: true,
      });
    };
  }, []);

  // O slideshow (o «▶» ao lado do «×», a barra de espaço e a barra de
  // progresso) saiu a pedido dela, com a captura do botão: «retira isto do
  // site da galeria». Navega-se com ←/→, com as miniaturas e com o gesto.

  // A página por baixo não rola, e o aviso de cookies recolhe-se enquanto o
  // visualizador está aberto: era `z-[70]`, por cima dele (`z-[60]`), e tapava
  // a tira de miniaturas no telemóvel. Volta ao fechar — a escolha continua por
  // fazer. Ver `html.lightbox-aberta` no globals.css.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("lightbox-aberta");
    return () => {
      document.body.style.overflow = "";
      document.documentElement.classList.remove("lightbox-aberta");
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
      window.clearTimeout(segurancaRef.current);
    };
  }, []);

  /**
   * ── O VOO DE IDA ────────────────────────────────────────────────────────
   *
   * Num efeito de LAYOUT, antes da primeira pintura: o primeiro fotograma
   * que se vê já tem a cópia em cima da miniatura. A foto do visualizador
   * fica escondida (`data-voo`) enquanto a cópia voa, e aparece no mesmo
   * instante em que a cópia sai — no mesmo sítio, com o mesmo ficheiro.
   */
  useIsomorphicLayoutEffect(() => {
    const copia = vooRef.current;
    const camada = photoLayerRef.current;
    const de = arranque.origem;
    if (!arranque.voa || !de || !copia || !camada) return;
    const destino = caixaContida(caixaDe(camada.getBoundingClientRect()), arranque.prop);
    if (!destino.w) return;
    posicionar(copia, destino);
    copia.src = de.src;
    copia.dataset.aVoar = "";
    camada.dataset.voo = "";
    const anim = copia.animate(
      [poseDaMiniatura(destino, de.recorte, de.imagem, de.foco), POSE_FINAL],
      { duration: DUR_VISTA_MS, easing: EASE_OUT, fill: "both" },
    );
    vooAnimRef.current = anim;
    const pousar = () => {
      delete camada.dataset.voo;
      delete copia.dataset.aVoar;
      anim.cancel();
      vooAnimRef.current = null;
    };
    anim.onfinish = pousar;
    return () => {
      anim.onfinish = null;
      pousar();
    };
  }, [arranque]);

  // Mudar de foto a meio do voo: a cópia aterra já, para a seguinte aparecer.
  useEffect(() => {
    if (index !== arranque.index) vooAnimRef.current?.finish();
  }, [index, arranque.index]);

  /**
   * ── A SAÍDA ─────────────────────────────────────────────────────────────
   *
   * Com a miniatura à vista, a fotografia volta para ela pelo mesmo caminho e
   * o fundo esbate-se por baixo. Se ela navegou para uma foto cuja miniatura
   * não está à vista, esbate-se tudo. Com movimento reduzido, fecha logo —
   * eram 260 ms de espera sem animação nenhuma.
   *
   * Há uma rede: se o fim da animação não chegar (separador escondido a
   * meio), fecha na mesma pouco depois.
   */
  const saidaRef = useRef(false);
  useEffect(() => {
    if (!closing || saidaRef.current) return;
    saidaRef.current = true;
    let feito = false;
    const fim = () => {
      if (feito) return;
      feito = true;
      fechado();
    };
    const dialog = dialogRef.current;
    if (arranque.reduzido || !arranque.anima || !dialog) {
      fim();
      return;
    }
    vooAnimRef.current?.finish();
    segurancaRef.current = window.setTimeout(fim, DUR_VISTA_MS + 400);
    const copia = vooRef.current;
    const camada = photoLayerRef.current;
    const tile = miniaturaPintada(index);
    const imgTile = tile?.querySelector("img");
    const caixaTile = tile ? caixaDe(tile.getBoundingClientRect()) : null;
    // A da FOTO ABERTA: com a pista, a camada tem também as vizinhas.
    const grande =
      camada?.querySelector<HTMLImageElement>("[data-actual] img.lb-grande[data-carregada]") ??
      camada?.querySelector<HTMLImageElement>("[data-actual] picture img");
    if (
      copia &&
      camada &&
      imgTile &&
      caixaTile &&
      grande?.currentSrc &&
      aVista(caixaTile, window.innerWidth, window.innerHeight)
    ) {
      const destino = caixaContida(
        caixaDe(camada.getBoundingClientRect()),
        proporcao(pool[index].aspectRatio),
      );
      posicionar(copia, destino);
      copia.src = grande.currentSrc;
      copia.dataset.aVoar = "";
      camada.dataset.voo = "";
      dialog.dataset.sair = "";
      copia
        .animate(
          [
            POSE_FINAL,
            poseDaMiniatura(
              destino,
              caixaTile,
              caixaDe(imgTile.getBoundingClientRect()),
              getComputedStyle(imgTile).objectPosition,
            ),
          ],
          { duration: DUR_VISTA_MS, easing: EASE_OUT, fill: "forwards" },
        )
        .finished.then(fim, fim);
    } else {
      dialog
        .animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(0.965)" },
          ],
          { duration: DUR_ELEMENTO_MS, easing: EASE_IN, fill: "forwards" },
        )
        .finished.then(fim, fim);
    }
  }, [closing, fechado, arranque, index, pool]);

  // Quantas miniaturas cabem na tira (ver `miniaturasNaTira`).
  const [nTira, setNTira] = useState(() =>
    miniaturasNaTira(typeof window === "undefined" ? 1024 : window.innerWidth),
  );
  useEffect(() => {
    const medir = () => setNTira(miniaturasNaTira(window.innerWidth));
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  if (typeof document === "undefined") return null;

  // Thumbnail strip around current photo
  const stripIdx = janelaDaTira(index, pool.length, nTira);
  // Em rede lenta / Save-Data não pré-carregamos os vizinhos full-screen.
  const preloadNeighbours = shouldPreloadNeighbours();
  /** As fotografias na pista: a aberta e, quando já fazem falta, as vizinhas. */
  const naPista = (heroLoaded || vizinhasJa ? [index - 1, index, index + 1] : [index]).filter(
    (i) => i >= 0 && i < pool.length,
  );

  /**
   * A pré-visualização de UMA fotografia — a miniatura que já está em cache.
   * Serve a aberta (por baixo da grande) e as vizinhas na pista: quando uma
   * vizinha passa a ser a aberta, este `<picture>` é o MESMO elemento (a
   * chave do slide é o índice da foto), e a grande entra por cima dele.
   */
  const previa = (i: number) => (
    <picture>
      <source
        media={CORTE_TELEMOVEL}
        type="image/avif"
        srcSet={srcsetDaGaleria(pool[i].src, ESCADA_TELEMOVEL, "avif")}
        sizes={SIZES_DA_GRELHA}
      />
      <source
        type="image/avif"
        srcSet={srcsetDaGaleria(pool[i].src, ESCADA_ECRA_GRANDE, "avif")}
        sizes={SIZES_DA_GRELHA}
      />
      {/*
          AS DUAS LINHAS DE WebP, QUE FALTAVAM.

          Esta pré-visualização existe para ser um acerto de cache: as
          mesmas escadas e o mesmo `sizes` da grelha, para o browser
          reutilizar o ficheiro que já tem e a fotografia aparecer a 0 ms.
          Só que só havia `<source>` de AVIF — quem não lê AVIF caía no
          `<img>`, que estava preso ao WebP de 768. Em secretária a grelha
          guardou o de 1024: ficheiro diferente, cache falhada, e ~69 KB
          descarregados no instante em que se prometeu "instantâneo".
          São ~5 % das visitas, e para essas isto era ruído puro.
        */}
      <source
        media={CORTE_TELEMOVEL}
        type="image/webp"
        srcSet={srcsetDaGaleria(pool[i].src, ESCADA_TELEMOVEL, "webp")}
        sizes={SIZES_DA_GRELHA}
      />
      <source
        type="image/webp"
        srcSet={srcsetDaGaleria(pool[i].src, ESCADA_ECRA_GRANDE, "webp")}
        sizes={SIZES_DA_GRELHA}
      />
      <img
        src={ficheiroDaGaleria(pool[i].src, 768, "webp")}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-contain"
        decoding="async"
      />
    </picture>
  );

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${dict.lbGallery}: ${labelText(pool[index].label)}, ${dict.lbPhoto} ${index + 1} ${dict.lbOf} ${pool.length}`}
      tabIndex={-1}
      className="fixed inset-0 z-[60] select-none focus:outline-none"
      onClick={close}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        sobreChromeRef.current = !!(e.target as Element).closest?.(".lb-cromagem .lb-chrome");
        if (!chromeVisivel) mostrarChrome();
        else agendarEsconder();
      }}
    >
      {/* O fundo — camada própria, que é o que o gesto de arrastar-para-baixo
          desvanece. Toma a cor da fotografia aberta (GAL-3): um degradé que
          nasce dela, misturada com preto, e cai para preto nas margens. A cor
          passa por uma propriedade registada (`@property --lb-cor`) porque é a
          única forma de um degradé TRANSITAR para a cor da foto seguinte; o
          `background` sozinho troca de repente. */}
      <div
        ref={backdropRef}
        className="lb-backdrop absolute inset-0"
        style={{ "--lb-cor": pool[index].color ?? "#000" } as React.CSSProperties}
      />

      {/* A cópia da miniatura que voa ao abrir e ao fechar (ver `voo.ts`).
          Escondida em repouso; quem a mostra e a move é o código do voo. É um
          `<img>` cru de propósito: recebe o ficheiro que a miniatura JÁ está a
          mostrar (`currentSrc`), e um `<Image>` pediria outro. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={vooRef} alt="" aria-hidden className="lb-voo" decoding="sync" />

      {/* Região viva. Medido: `liveRegionsInDialog: 0` — navegar com ←/→ (ou
          pelas miniaturas, ou pelo slideshow) era completamente silencioso.
          Mudar o `aria-label` de um elemento JÁ focado não anuncia nada; esta
          região reescreve-se a cada foto e é isso que o leitor lê. */}
      <p role="status" aria-live="polite" className="sr-only">
        {`${dict.lbPhoto} ${index + 1} ${dict.lbOf} ${pool.length}. ${altText(
          pool[index].src,
          pool[index].label,
        )}`}
      </p>

      {/* A FOTOGRAFIA OCUPA O ECRÃ (GAL-4), menos uma margem de 16 px (24 no
          computador) e as zonas seguras do telemóvel — ver `.lb-palco`. A
          barra e a tira flutuam por cima. `touch-none`: o dedo é do gesto,
          não do scroll da página. */}
      <div
        ref={photoLayerRef}
        className="lb-photo-layer lb-palco overflow-hidden touch-none"
        onPointerDown={aoPousar}
        onPointerMove={aoMover}
        onPointerUp={(e) => aoLargar(e)}
        onPointerCancel={(e) => aoLargar(e, true)}
        onClick={(e) => {
          // QUALQUER PRETO FECHA; um toque NA foto mostra ou esconde a barra.
          // A camada vai de margem a margem, mas a foto encaixada não: conta a
          // caixa pintada, pela proporção da foto. O clique que vem no fim de
          // um arrasto não é um toque.
          e.stopPropagation();
          if (arrastouRef.current) {
            arrastouRef.current = false;
            return;
          }
          const camada = photoLayerRef.current;
          if (!camada) return;
          const foto = caixaContida(
            caixaDe(camada.getBoundingClientRect()),
            proporcao(pool[index].aspectRatio),
          );
          if (dentroDe(foto, e.clientX, e.clientY)) alternarChrome();
          else close();
        }}
      >
        <div ref={arrastoRef} className="lb-arrasto absolute inset-0">
          <div ref={pistaRef} className="lb-pista absolute inset-0">
            {naPista.map((i) => {
              const aberta = i === index;
              return (
                <div
                  // A chave é a FOTOGRAFIA: ao deslizar, a vizinha passa a ser
                  // a aberta sem desmontar — e a anterior sai de vez quando sai
                  // da pista (era a dupla exposição a cada seta).
                  key={i}
                  data-actual={aberta ? "" : undefined}
                  aria-hidden={aberta ? undefined : true}
                  className="lb-slide absolute inset-0"
                  style={{
                    transform:
                      i === index
                        ? undefined
                        : `translateX(calc(${i - index} * (100% + ${DESLIZE_INTERVALO_PX}px)))`,
                  }}
                >
                  <div
                    className={`absolute inset-0${
                      aberta && entrada === "salto" && !(justOpened && arranque.voa)
                        ? " lb-photo-in"
                        : ""
                    }`}
                  >
                    {/*
                    ABRE COM A MINIATURA QUE JÁ ESTÁ EM CACHE, e só depois troca.

                    A miniatura do mosaico em que se acabou de tocar já está no
                    disco do browser: desenhá-la primeiro faz a abertura ser
                    INSTANTÂNEA, e a versão grande entra por cima quando chega.
                    O `sizes` é o DA GRELHA, não o do lightbox, de propósito: é
                    o que faz o browser escolher o candidato que já tem.

                    Fica montada depois de a grande carregar: o `onLoad` dispara
                    quando a grande está pronta, não quando está VISÍVEL (entra
                    com um esbatimento), e tirá-la deixava o fundo à vista.
                  */}
                    {previa(i)}
                    {aberta && (
                      <>
                        {!foto.falhou && (
                          <Image
                            key={`${index}-${foto.tentativa}-${lbRaw ? "raw" : lbFormato}`}
                            src={pool[index].src}
                            alt={altText(pool[index].src, pool[index].label)}
                            fill
                            // "90vw", não "min(90vw, 1920px)". O tecto que o min() queria pôr
                            // já é o do next.config (deviceSizes acaba em 1920), e a forma
                            // com parênteses não casa com a regex que o Next usa para ler o
                            // `sizes` — node_modules/next/dist/shared/lib/get-img-props.js:53,
                            // `/(^|\s)(1?\d?\d)vw/g`, exige início-de-string ou espaço antes
                            // do número. Com "min(90vw, …)" o 90vw vem precedido de "(", a
                            // lista de percentagens fica vazia e o Next cai no ramo que emite
                            // TODAS as 16 larguras do srcset — incluindo candidatos absurdos
                            // de 16, 32 e 64 px. Com "90vw" são 10, e a largura que o browser
                            // escolhe é a mesma (medido nos 8 perfis de dispositivo).
                            sizes="90vw"
                            quality={72}
                            // A escada de formato, e depois o ficheiro original tal e qual
                            // (ver `lbFormato` e `lbRaw`).
                            {...(lbRaw
                              ? { loader: ({ src }: { src: string }) => src }
                              : {
                                  loader: ({ src, width }: { src: string; width: number }) =>
                                    ficheiroDaGaleria(src, snapGalleryWidth(width), lbFormato),
                                })}
                            onError={() => {
                              // avif → webp → original → a frase. Nunca salta um degrau: o
                              // WebP é o que salva quem não sabe ler AVIF, e o original é o
                              // que salva quem não tem a derivada. Quando nem o original vem,
                              // mostra-se o que aconteceu, e não a imagem partida do browser.
                              anotar((a) =>
                                a.cru
                                  ? { ...a, falhou: true }
                                  : a.formato === "avif"
                                    ? { ...a, formato: "webp" }
                                    : { ...a, cru: true },
                              );
                            }}
                            // priority: the full-res lightbox photo is a DIFFERENT srcset
                            // candidate than the tile thumbnail, so opening starts a cold fetch.
                            // Fetching it high-priority (instead of default) shortens the
                            // "black → pop" gap so the photo is ready as the open animation runs.
                            // Next 16 deprecou `priority` a favor de `preload`; para uma
                            // foto que ja esta no DOM a propria doc recomenda antes
                            // fetchPriority="high", que e exactamente o efeito que se quer.
                            fetchPriority="high"
                            onLoad={() => anotar((a) => ({ ...a, carregada: true }))}
                            // SEM o desfocado (`blurProps`). Pintava a área inteira em modo
                            // cover, POR CIMA da pré-visualização nítida que já estava pronta
                            // aos 140 ms, e só saía aos ~770 ms: abrir uma foto mostrava uma
                            // mancha meio segundo. Agora a grande fica transparente até
                            // chegar e entra por cima da pré-visualização (`lb-grande`).
                            className="object-contain lb-grande"
                            data-carregada={heroLoaded ? "" : undefined}
                          />
                        )}
                        {foto.falhou && (
                          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6">
                            <div
                              role="alert"
                              className="pointer-events-auto flex flex-col items-center gap-3 rounded-2xl bg-black/70 px-6 py-5 text-center ring-1 ring-white/10"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <p className="text-sm text-white/85">{dict.lbErro}</p>
                              <button
                                type="button"
                                onClick={() =>
                                  setGuardado(estadoDaFotoDoZero(index, foto.tentativa + 1))
                                }
                                className="min-h-[44px] rounded-full px-5 text-sm text-white ring-1 ring-white/30 transition-colors duration-elemento hover:bg-white/10"
                              >
                                {dict.lbTentar}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pré-carrega só o vizinho SEGUINTE (o sentido de navegação dominante)
          para que → seja instantâneo. Usa `sizes="90vw"` — o MESMO candidato que
          a foto mostrada — para o browser acertar no recurso exato em cache no
          passo seguinte (com 45vw carregava um URL diferente e o → voltava a
          descodificar do zero). Só um vizinho (não os dois), fora de ecrã, e só
          em rede boa (Save-Data / 2g / 3g ignora). O anterior carrega no ← —
          raro. */}
      <div aria-hidden className="absolute h-px w-px overflow-hidden opacity-0 pointer-events-none">
        {preloadNeighbours &&
          pool.length > 1 &&
          heroLoaded &&
          /**
           * OS DOIS VIZINHOS, não só o seguinte.
           *
           * Isto pré-carregava só o `+1`, com a justificação de que o sentido
           * de navegação dominante é para a frente e o `←` é raro. É verdade
           * em média — e é exactamente por isso que o `←` era o gesto que
           * doía: quem volta atrás está a voltar a uma fotografia de que
           * gostou, e essa era a única que aparecia preta.
           *
           * O `-1` está quase sempre em cache (acabou de se passar por ela),
           * portanto na prática isto custa zero bytes na navegação para a
           * frente; só paga alguma coisa quando se ABRE a meio da grelha, que
           * é uma vez por sessão.
           */
          // Só as vizinhas que EXISTEM: as pontas já não dão a volta.
          [index + 1, index - 1]
            .filter((i) => i >= 0 && i < pool.length)
            .map((i) => (
              <Image
                key={i}
                src={pool[i].src}
                alt=""
                fill
                // O MESMO `sizes` da foto mostrada (ver a nota lá em cima sobre
                // a regex do Next), para o browser acertar no recurso exacto
                // que já ficou em cache e a navegação ser instantânea.
                sizes="90vw"
                quality={72}
                // E o MESMO FORMATO, pela mesma razão: pré-carregar o WebP e
                // depois pedir o AVIF (ou o contrário) seria descarregar a
                // fotografia duas vezes e não adiantar nada ao `→`.
                loader={({ src, width }: { src: string; width: number }) =>
                  ficheiroDaGaleria(src, snapGalleryWidth(width), lbFormato)
                }
                loading="eager"
              />
            ))}
      </div>

      {/* ── A CROMAGEM, A FLUTUAR (GAL-4) ──────────────────────────────────
          A barra de cima, as setas e a tira. Esconde-se ao fim de 2,5 s sem
          mexer, e `inert` enquanto escondida — ver `chromeVisivel`. */}
      <div
        className="lb-cromagem pointer-events-none absolute inset-0 z-10"
        data-escondido={chromeVisivel ? undefined : ""}
        inert={!chromeVisivel}
      >
        {/* Barra superior */}
        <div
          className="lb-scrim lb-chrome pointer-events-auto absolute inset-x-0 top-0 flex items-center justify-between px-5 pb-6"
          // Clear the notch so the counter / close button aren't hidden under
          // the status bar on notched phones (keeps its base top padding too).
          style={{ paddingTop: "calc(0.875rem + env(safe-area-inset-top))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3">
            <span className="text-white/70 text-xs font-light tabular-nums">{index + 1}</span>
            {/* /60 (era /40): o separador media 3.66:1 a 12px, abaixo do minimo de 4.5:1. */}
            <span className="text-white/60 text-xs">/</span>
            <span className="text-white/55 text-xs tabular-nums">{pool.length}</span>
            <span className="w-px h-3 bg-white/10 mx-1" />
            {collectionFor(pool[index].src) && (
              <span className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    viewCollection(collectionFor(pool[index].src)!);
                  }}
                  aria-label={`${dict.viewWedding}: ${collectionFor(pool[index].src)}`}
                  title={dict.viewWedding}
                  // min-h + inline-flex: media 27x16px em telemovel, abaixo dos 24x24 CSS
                  // px minimos da WCAG 2.5.8. So cresce a caixa, o sublinhado fica igual.
                  className="inline-flex min-h-[24px] items-center text-white/70 text-xs hover:text-white underline decoration-white/25 hover:decoration-white/70 underline-offset-4 transition-colors"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {collectionFor(pool[index].src)}
                </button>
                <span className="text-white/20 mx-1.5">·</span>
              </span>
            )}
            <span className="text-white/65 text-[10px] tracking-[0.15em] uppercase">
              {labelText(pool[index].label)}
            </span>
          </div>
          <div className="relative flex items-center gap-1">
            {/* As dicas do teclado passaram a um «?» (GAL-4): a linha de baixo
                comia altura à foto. Só com rato — ver `.lb-dica`. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDicasAbertas((v) => !v);
              }}
              aria-label={dict.lbAtalhos}
              aria-expanded={dicasAbertas}
              className="lb-dica h-11 w-11 rounded-full text-sm text-white/60 transition-colors hover:bg-white/8 hover:text-white"
            >
              ?
            </button>
            {dicasAbertas && (
              <p className="lb-dica-caixa absolute right-0 top-full mt-1 whitespace-nowrap rounded-xl bg-black/80 px-3 py-2 text-[11px] tracking-widest text-white/80 ring-1 ring-white/10">
                {dict.keyboardHint}
              </p>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                close();
              }}
              aria-label={dict.lbClose}
              // /60 (era /40): icone em repouso media 3.66:1, no limite de WCAG 1.4.11.
              className="p-3 text-white/60 hover:text-white transition-colors rounded-full hover:bg-white/8"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
        {!tocar && index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              andar(-1);
            }}
            aria-label={dict.lbPrev}
            className="lb-chrome pointer-events-auto absolute left-3 top-[calc(50%-1.5rem)] grid place-items-center w-11 h-11 md:left-6 md:w-12 md:h-12 rounded-full bg-black/40 text-white/75 ring-1 ring-white/10 hover:bg-black/60 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        )}
        {!tocar && index < pool.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              andar(1);
            }}
            aria-label={dict.lbNext}
            className="lb-chrome pointer-events-auto absolute right-3 top-[calc(50%-1.5rem)] grid place-items-center w-11 h-11 md:right-6 md:w-12 md:h-12 rounded-full bg-black/40 text-white/75 ring-1 ring-white/10 hover:bg-black/60 hover:text-white hover:scale-105 active:scale-95 transition-all duration-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        )}

        {/* Strip de thumbnails — deferido para o frame seguinte à abertura
            para não pesar no commit de abertura (ver chromeReady). No
            telemóvel não há tira: ficam os gestos (GAL-4). */}
        {!tocar && (
          <div
            className="lb-chrome lb-scrim-baixo pointer-events-auto absolute inset-x-0 bottom-0 flex min-h-[76px] items-center justify-center gap-1 px-4 pb-3 pt-6"
            onClick={(e) => e.stopPropagation()}
          >
            {chromeReady &&
              stripIdx.map((idx) => (
                <button
                  key={idx}
                  onClick={() => irPara(idx)}
                  aria-label={`${dict.lbPhoto} ${idx + 1} ${dict.lbOf} ${pool.length}`}
                  aria-current={idx === index ? "true" : undefined}
                  className={`group relative flex-shrink-0 overflow-hidden transition-all duration-200 ${FOCUS_RING} ${
                    idx === index
                      ? "w-[72px] h-[52px] ring-1 ring-white/60 opacity-100"
                      : "w-[60px] h-[44px] opacity-50 hover:opacity-80 hover:scale-105"
                  }`}
                >
                  {/* A tira usa as MESMAS miniaturas estáticas da grelha (loader
                      pré-gerado): não gasta o optimizador e, para as fotos já
                      vistas na grelha, o ficheiro já está na cache do browser —
                      a tira aparece instantânea. */}
                  <Image
                    src={pool[idx].src}
                    alt=""
                    fill
                    sizes="72px"
                    loader={galleryImageLoader}
                    className="object-cover"
                    // Um quadrado de 72 px corta muito: pelo ponto de interesse,
                    // e não pelo centro (gallery-meta.json).
                    style={pool[idx].foco ? { objectPosition: pool[idx].foco } : undefined}
                  />
                  <FocusRing />
                </button>
              ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
