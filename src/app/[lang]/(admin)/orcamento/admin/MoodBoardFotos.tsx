"use client";

import { RATO, DEDO } from "./ui/sensores-de-arrasto";
import { useMemo, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  type CollisionDetection,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOS DOS MOOD BOARDS — ARRASTAR DENTRO E ENTRE PÁGINAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «A ordem das fotos é a de inserção, e é ela que define a
 * composição no PDF.» E, para a foto que foi para o board errado: «hoje é
 * preciso removê-la e voltar a escolhê-la na biblioteca.»
 *
 * Uma proposta tem tipicamente 8 boards e ~40 fotos. Sem arrasto, arrumar uma
 * página é apagar e voltar a escolher — o que, além do trabalho, faz perder a
 * foto de vista na biblioteca.
 *
 * ── UM SÓ CONTEXTO DE ARRASTO PARA A SECÇÃO INTEIRA ───────────────────────
 * Arrastar ENTRE boards obriga a que todas as grelhas vivam dentro do mesmo
 * `DndContext` — dois contextos não se conhecem, e uma foto largada fora do seu
 * voltaria para o sítio. Os mood boards em si arrastam-se no mesmo contexto,
 * distinguidos pelo prefixo do identificador:
 *
 *     foto:<board>:<posição>   uma fotografia
 *     grelha:<board>           a grelha de um board (para largar numa vazia)
 *     board:<board>            o cartão de um mood board
 *
 * O número do board é o índice REAL no documento, e não a posição no ecrã: a
 * ordem desenhada pode ser a sugerida pelos Serviços (ver `proposal-ordem.ts`),
 * e escrever no sítio errado seria mexer no board que está por baixo.
 *
 * ── PORQUE É QUE HÁ UMA PEGA EXPLÍCITA ────────────────────────────────────
 * No telemóvel, uma célula inteira arrastável disputa o gesto de percorrer a
 * página. Os sensores já estão separados (o rato pega aos 4 px, o dedo só
 * depois de segurar 180 ms), mas numa grelha de fotos isso não chega: a foto é
 * grande e o dedo pousa nela para fazer scroll. A pega é um alvo próprio, com
 * os 44 px do dedo, e o resto da célula continua livre para tocar e ampliar.
 */

// ── Os identificadores ──────────────────────────────────────────────────────

export const idDaFoto = (bi: number, ii: number) => `foto:${bi}:${ii}`;
export const idDaGrelha = (bi: number) => `grelha:${bi}`;
export const idDoBoard = (bi: number) => `board:${bi}`;

/** `foto:3:1` → `{ bi: 3, ii: 1 }`. `null` para tudo o resto. */
function lerIdDeFoto(id: string): { bi: number; ii: number } | null {
  const p = id.split(":");
  if (p[0] !== "foto") return null;
  const bi = Number(p[1]);
  const ii = Number(p[2]);
  return Number.isInteger(bi) && Number.isInteger(ii) ? { bi, ii } : null;
}

/** `grelha:3` → 3; `board:3` → 3. `null` para tudo o resto. */
function lerIdSimples(id: string, prefixo: string): number | null {
  const p = id.split(":");
  if (p[0] !== prefixo) return null;
  const n = Number(p[1]);
  return Number.isInteger(n) ? n : null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS SETAS SÓ PARAM ONDE LARGAR FAZ ALGUMA COISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `sortableKeyboardCoordinates` procura o vizinho na direcção da seta entre
 * TODAS as zonas de largada. Aqui há três famílias — a foto (`foto:b:i`), a
 * grelha de um board (`grelha:b`) e o board inteiro (`board:b`) — e as duas
 * últimas são caixas grandes, que envolvem as fotos. Numa janela estreita a
 * caixa grande ganha sempre a corrida ao vizinho seguinte: MEDIDO num ecrã de
 * telemóvel, a seta para baixo a partir da primeira foto ia parar a `grelha:0`
 * e a seguinte a `board:0` — nunca à segunda foto.
 *
 * E `board:0` nem sequer é um destino: o `aoLargar` ignora um board quando o
 * que vem na mão é uma foto. O teclado andava, portanto, para sítios onde
 * largar não fazia nada — o gesto completo (Espaço, seta, Espaço) acabava sem
 * alteração nenhuma e sem uma palavra a dizer porquê. Com o rato isto não se
 * nota, porque a mão aponta a célula; quem só tem teclado ficava sem forma de
 * reordenar fotos num ecrã estreito.
 *
 * A regra aqui é a MESMA que o `aoLargar` já aplica, dita antes do gesto em
 * vez de depois:
 *
 *  · com uma foto na mão, valem as outras fotos (reordenar, ou mudar de
 *    board) e as grelhas dos OUTROS boards — que é como se chega a um board
 *    vazio, o único que não tem fotos sobre que largar. A grelha do próprio
 *    board não vale: largar uma foto no board onde ela já está é um não-gesto;
 *  · com um board na mão, valem só os outros boards.
 */
function alvosValidosPara(activo: string): (id: string) => boolean {
  const foto = lerIdDeFoto(activo);
  const board = lerIdSimples(activo, "board");
  return (id: string) => {
    if (foto) {
      if (lerIdDeFoto(id)) return true;
      const grelha = lerIdSimples(id, "grelha");
      return grelha !== null && grelha !== foto.bi;
    }
    if (board !== null) return lerIdSimples(id, "board") !== null;
    return true;
  };
}

/**
 * A MESMA regra, aplicada a quem decide sobre o que se está pousado.
 *
 * O `coordinateGetter` só escolhe para onde o teclado MOVE; quem decide o
 * `over` — e portanto o que acontece ao largar — é a detecção de colisões, e
 * essa corre sobre todas as zonas outra vez. Filtrar só num dos dois deixava o
 * teclado a mover-se para cima da segunda foto e o `over` a dizer `board:0`,
 * que é precisamente o destino que não faz nada.
 *
 * Vale para o rato pela mesma razão, e melhora-o: arrastar uma foto para o
 * espaço vazio do próprio board dava `grelha:0` e um não-gesto; agora encontra
 * a foto mais próxima, que é o que a mão estava a pedir.
 */
export const deteccaoDeColisao: CollisionDetection = (args) => {
  const vale = alvosValidosPara(String(args.active.id));
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) => vale(String(c.id))),
  });
};

export const coordenadasDeTeclado: KeyboardCoordinateGetter = (event, args) => {
  const vale = alvosValidosPara(String(args.context.active?.id ?? ""));
  const zonas = args.context.droppableContainers;
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: {
      ...args.context,
      // DELEGAR, e não copiar. O `DroppableContainers` do dnd-kit é um `Map`,
      // e um `Map` não sobrevive a um `Object.assign`: a cópia fica com os
      // métodos e sem os dados, e o `get(active.id)` que o
      // `sortableKeyboardCoordinates` faz mais à frente devolvia `undefined` —
      // com o gesto todo a não sair do sítio, em silêncio. Aqui só se
      // intercepta o `getEnabled`; o `get` vai ao objeto verdadeiro.
      droppableContainers: {
        get: (id: UniqueIdentifier) => zonas.get(id),
        getEnabled: () => zonas.getEnabled().filter((c) => vale(String(c.id))),
      } as unknown as typeof zonas,
    },
  });
};

/** O que aconteceu quando ela largou. */
export type LargadaDeFoto =
  | { tipo: "reordenar"; bi: number; de: number; para: number }
  | {
      tipo: "mudar-de-board";
      deBoard: number;
      deIndice: number;
      paraBoard: number;
      paraIndice: number;
    };

export interface ArrastoProps {
  children: ReactNode;
  /** Uma foto mudou de sítio. */
  onLargarFoto: (largada: LargadaDeFoto) => void;
  /** Um mood board mudou de sítio — POSIÇÕES no ecrã, como ela as vê. */
  onLargarBoard: (dePosicao: number, paraPosicao: number) => void;
  /** A ordem desenhada dos boards (índices reais), para converter em posições. */
  ordemDosBoards: readonly number[];
  /** Desenha a foto que está a ser arrastada, para ela ver o que leva na mão. */
  aArrastar: string | null;
  onArrastoComeca: (id: string | null) => void;
  /** A miniatura da foto em viagem. */
  fantasma?: ReactNode;
}

/**
 * O contexto de arrasto da secção inteira.
 *
 * Não desenha nada de seu: envolve os cartões dos mood boards e trata do que
 * acontece quando alguma coisa é largada.
 */
/** Criado uma vez — ver `ui/sensores-de-arrasto.ts`. */
const TECLADO_DAS_FOTOS = { coordinateGetter: coordenadasDeTeclado } as const;

export function ArrastoDosMoodBoards({
  children,
  onLargarFoto,
  onLargarBoard,
  ordemDosBoards,
  aArrastar,
  onArrastoComeca,
  fantasma,
}: ArrastoProps) {
  // Rato e toque com sensores SEPARADOS, como no editor dos Serviços: com um
  // sensor de ponteiro único, no tablet o gesto de percorrer a página agarrava
  // a foto logo aos 4 px.
  const sensores = useSensors(
    useSensor(MouseSensor, RATO),
    useSensor(TouchSensor, DEDO),
    useSensor(KeyboardSensor, TECLADO_DAS_FOTOS),
  );

  function aoComecar(e: DragStartEvent) {
    onArrastoComeca(String(e.active.id));
  }

  function aoLargar(e: DragEndEvent) {
    onArrastoComeca(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    // ── Um mood board inteiro ──
    const boardArrastado = lerIdSimples(activeId, "board");
    if (boardArrastado !== null) {
      const boardAlvo = lerIdSimples(overId, "board");
      if (boardAlvo === null) return;
      const de = ordemDosBoards.indexOf(boardArrastado);
      const para = ordemDosBoards.indexOf(boardAlvo);
      if (de < 0 || para < 0 || de === para) return;
      onLargarBoard(de, para);
      return;
    }

    // ── Uma fotografia ──
    const foto = lerIdDeFoto(activeId);
    if (!foto) return;

    const sobreFoto = lerIdDeFoto(overId);
    if (sobreFoto) {
      if (sobreFoto.bi === foto.bi) {
        if (sobreFoto.ii === foto.ii) return;
        onLargarFoto({ tipo: "reordenar", bi: foto.bi, de: foto.ii, para: sobreFoto.ii });
      } else {
        onLargarFoto({
          tipo: "mudar-de-board",
          deBoard: foto.bi,
          deIndice: foto.ii,
          paraBoard: sobreFoto.bi,
          paraIndice: sobreFoto.ii,
        });
      }
      return;
    }

    // Largada na grelha e não numa foto: vai para o fim daquele board. É o
    // caminho de uma grelha VAZIA, que não tem nenhuma foto sobre que largar.
    const grelha = lerIdSimples(overId, "grelha");
    if (grelha !== null && grelha !== foto.bi) {
      onLargarFoto({
        tipo: "mudar-de-board",
        deBoard: foto.bi,
        deIndice: foto.ii,
        paraBoard: grelha,
        // -1 = no fim. Quem aplica sabe quantas fotos lá estão; aqui não.
        paraIndice: -1,
      });
    }
  }

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={deteccaoDeColisao}
      onDragStart={aoComecar}
      onDragEnd={aoLargar}
      onDragCancel={() => onArrastoComeca(null)}
    >
      {children}
      {/* O que vai na mão. Sem isto, arrastar entre dois boards distantes é
          mover um buraco: a célula de origem esvazia-se e não há nada a
          acompanhar o cursor até ao destino. */}
      <DragOverlay dropAnimation={null}>{aArrastar && fantasma ? fantasma : null}</DragOverlay>
    </DndContext>
  );
}

/**
 * A grelha de um mood board: uma zona onde se pode largar, com as fotos
 * ordenáveis lá dentro.
 *
 * `rectSortingStrategy` e não a de lista: isto é uma grelha de várias colunas,
 * e a estratégia de lista faria as fotos abrirem espaço na vertical — o
 * indicador apontaria para um sítio onde a foto não vai cair.
 */
export function GrelhaDeFotos({
  bi,
  quantas,
  children,
  className = "",
}: {
  /** O índice REAL do board no documento. */
  bi: number;
  quantas: number;
  children: ReactNode;
  className?: string;
}) {
  const ids = useMemo(
    () => Array.from({ length: quantas }, (_, ii) => idDaFoto(bi, ii)),
    [bi, quantas],
  );
  const { setNodeRef, isOver } = useDroppable({ id: idDaGrelha(bi) });
  return (
    <SortableContext items={ids} strategy={rectSortingStrategy}>
      <div
        ref={setNodeRef}
        className={`rounded-xl ${ESTADO} ${
          isOver ? "ring-2 ring-sage-600/50 ring-offset-2 ring-offset-transparent" : ""
        } ${className}`}
      >
        {children}
      </div>
    </SortableContext>
  );
}

/**
 * O cartão de um mood board, arrastável pela sua pega.
 *
 * Palavras dela: «As setas ↑↓ movem um board de cada vez: com 8 boards, levar o
 * último ao topo são sete cliques.» Com arrasto é um gesto — e as setas ficam,
 * porque são o caminho do teclado e o que funciona quando a lista é mais alta
 * do que o ecrã.
 *
 * A pega é devolvida em `children` e não colada no sítio: o cabeçalho do cartão
 * já tem título, subtítulo e botões, e quem o desenha é que sabe onde é que ela
 * cabe sem empurrar nada.
 */
export function CartaoDeBoard({
  bi,
  children,
  className = "",
  ancora,
  onFocusCapture,
}: {
  bi: number;
  children: (pega: React.HTMLAttributes<HTMLElement>) => ReactNode;
  className?: string;
  /** `id` no DOM, para o índice lateral poder saltar para aqui. */
  ancora?: string;
  /**
   * O foco entrou nesta página.
   *
   * É o que diz ao painel da direita qual é a página a mostrar. `Capture`
   * porque o foco aterra num campo lá dentro e não no cartão: sem a fase de
   * captura, o cartão nunca o via.
   */
  onFocusCapture?: () => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: idDoBoard(bi),
  });
  return (
    <div
      ref={setNodeRef}
      id={ancora}
      onFocusCapture={onFocusCapture}
      // `scroll-mt`: o back office tem uma barra fixa no topo, e sem margem de
      // deslocamento o salto do índice deixa o cabeçalho do board por baixo dela.
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`scroll-mt-24 ${className} ${isDragging ? "relative z-10 opacity-90 shadow-[var(--bo-sombra-suspensa)] ring-2 ring-sage-600" : ""}`}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

/** A lista dos cartões, ordenável na vertical. */
export function ListaDeBoards({
  ordem,
  children,
  className = "",
}: {
  /** Os índices reais dos boards, pela ordem em que estão desenhados. */
  ordem: readonly number[];
  children: ReactNode;
  className?: string;
}) {
  const ids = useMemo(() => ordem.map(idDoBoard), [ordem]);
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div className={className}>{children}</div>
    </SortableContext>
  );
}

/**
 * Uma célula arrastável.
 *
 * `children` é a miniatura (o `Thumb` do estúdio) e `accoes` é a barra de
 * botões — recebidos de fora para este ficheiro não ter de saber o que é uma
 * foto do estúdio nem como se mede uma imagem.
 */
export function CelulaDeFoto({
  bi,
  ii,
  children,
  accoes,
  principal = false,
  seleccionada = false,
  bloqueada = false,
  historia,
  origem,
}: {
  bi: number;
  ii: number;
  children: ReactNode;
  accoes?: ReactNode;
  /** É a fotografia do cartão: a de «O que propomos» e a primeira do mosaico
   *  no PDF (`ordemDoDesenho`, em `pdf-editorial/plano.ts`). */
  principal?: boolean;
  seleccionada?: boolean;
  /** O board está fechado: a foto vê-se, não se mexe. */
  bloqueada?: boolean;
  /** Onde é que esta fotografia já esteve — `null` quando não há nada a dizer. */
  historia?: { texto: string; grave: boolean } | null;
  /** A foto da biblioteca de onde esta veio, para quem passa o rato saber. */
  origem?: string;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver } =
    useSortable({ id: idDaFoto(bi, ii), disabled: bloqueada });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`group/foto relative ${isDragging ? "z-10 opacity-40" : ""}`}
      // De que tema veio, e o que se sabe dela. É o que a pergunta «esta foto
      // já não a usei?» quer saber, e chega com o rato em cima.
      title={[origem, historia?.texto].filter(Boolean).join(" · ") || undefined}
    >
      {/* ── ONDE É QUE ELA VAI CAIR ────────────────────────────────────────
          Uma barra à esquerda da célula sobre que se está a passar. As fotos
          já se afastam (é o que a estratégia da grelha faz), mas o afastamento
          sozinho lê-se mal numa grelha de quatro colunas: a barra diz o lugar
          exacto. */}
      {isOver && !isDragging && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-1 top-0 bottom-0 z-20 w-0.5 rounded-full bg-sage-600"
        />
      )}
      <div
        className={`relative overflow-hidden rounded-lg ${
          seleccionada ? "ring-2 ring-sage-600 ring-offset-1" : ""
        }`}
      >
        {children}
        {/* ── ONDE É QUE ELA JÁ ESTEVE ────────────────────────────────────
            Uma tira no fundo, e só quando há alguma coisa a dizer. Vermelha
            para o que é quase sempre engano (a mesma foto duas vezes na
            proposta) ou o que alguém vai notar (o mesmo espaço); apagada para
            «já usada», que não é aviso nenhum — a biblioteca existe para ser
            usada. */}
        {historia && (
          <span
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 truncate px-1 py-0.5 text-[8px] leading-tight text-white ${
              historia.grave ? "bg-[var(--bo-perigo)]/85" : "bg-black/55"
            }`}
          >
            {historia.texto}
          </span>
        )}
        {principal && (
          <span className="pointer-events-none absolute top-1 left-1 z-10 rounded-full bg-sage-600 px-1.5 py-0.5 text-[8px] font-medium tracking-[0.1em] uppercase text-white">
            cartão
          </span>
        )}
      </div>
      {/* A PEGA. Alvo próprio de 44 px no dedo (`alvo-toque`), sempre visível
          onde não há rato — no telemóvel, uma pega que só aparece ao passar o
          rato é uma pega que não existe.

          A pergunta é `com-rato` e não `(hover: none)`, pela mesma razão que a
          barra de acções ao lado: um iPhone com AssistiveTouch, um iPad com
          trackpad ou um portátil de ecrã táctil dizem `(hover: hover)` E
          `(pointer: coarse)` — e com a regra antiga a pega ficava invisível num
          aparelho onde o `alvo-toque` já lhe tinha dado 44 px de lado. Um
          quadrado invisível de 44 px em cima da fotografia é pior do que uma
          pega: apanha o toque e não diz nada. */}
      {!bloqueada && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastar a fotografia ${ii + 1}`}
          className={`alvo-toque absolute top-1 right-1 z-20 flex h-6 w-6 cursor-grab items-center justify-center rounded-md bg-black/55 text-[11px] leading-none text-white opacity-100 com-rato:opacity-0 com-rato:group-hover/foto:opacity-100 com-rato:focus-visible:opacity-100 active:cursor-grabbing ${ESTADO} ${PRESSAO}`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      {accoes}
    </div>
  );
}
