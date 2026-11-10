"use client";

import { RATO, DEDO, TECLADO_DE_LISTA } from "./ui/sensores-de-arrasto";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MoodBoard } from "@/lib/proposal-doc";
import { contagemDosEstados, diagnosticoDoBoard } from "@/lib/proposal-moodboard";

/**
 * No PDF novo nenhuma fotografia fica de fora: acima de doze o tema passa a
 * duas páginas. Não há tecto a partir do qual uma foto «não é impressa».
 */
const SEM_TECTO = Number.POSITIVE_INFINITY;
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DAS PÁGINAS DE INSPIRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Índice lateral dentro da secção, com os 8 boards, para saltar
 * entre eles sem scroll. Marca quais estão vazios, prontos ou bloqueados.»
 *
 * Oito boards abertos são vários ecrãs de altura. Sem índice, «ir ao quinto» é
 * percorrer os quatro primeiros — e, a meio de os percorrer, mexer sem querer
 * num campo pelo caminho.
 *
 * ── O ESTADO É O QUE FAZ ISTO VALER A PENA ────────────────────────────────
 * Uma lista de títulos é um atalho. Uma lista que diz o que falta a cada página
 * responde à pergunta que se faz mesmo a meio de uma proposta: «o que é que
 * ainda me falta?» — que é a razão de se percorrer a secção toda.
 *
 * Vazio era o único estado que isto mostrava, e vazio é o caso fácil. O que
 * faltava era o meio: a página com fotos e sem título, a que ficou sem
 * descrição, a que tem nove fotos quando a folha desenha seis. A regra está em
 * `diagnosticoDoBoard`, uma vez só, e daqui saem as duas leituras — a marca de
 * cada entrada e o contador do cabeçalho.
 *
 * ── ARRASTAR AQUI ─────────────────────────────────────────────────────────
 * Reordenar era subir um board de cada vez pelas setas do cartão, com o cartão
 * à vista — e com oito páginas, levar a última ao topo são sete cliques e sete
 * saltos de scroll. No índice as oito estão à distância de um gesto.
 *
 * O contexto de arrasto é PRÓPRIO, e não o dos cartões: são duas listas do
 * mesmo em sítios diferentes do ecrã, e um contexto partilhado faria o cartão e
 * a entrada do índice disputarem o mesmo identificador. O que os mantém de
 * acordo é chamarem a MESMA acção (`onMover`), com posições — não índices.
 *
 * A pega é um alvo próprio (⠿). Sem ela, o gesto de arrastar e o de saltar
 * eram o mesmo gesto no mesmo sítio, e o índice deixava de servir para o que
 * foi feito.
 *
 * ── PORQUE É QUE NÃO É `position: sticky` NO TELEMÓVEL ────────────────────
 * A 390 px de largura, uma coluna lateral rouba metade da grelha das fotos. Em
 * ecrã estreito o índice é uma tira que se percorre na horizontal, por cima da
 * lista; a partir de `lg` passa a coluna fixa ao lado.
 */
export default function MoodBoardIndice({
  boards,
  ordem,
  bloqueados,
  onSaltar,
  onMover,
}: {
  boards: readonly MoodBoard[];
  /** Os índices reais, pela ordem em que estão desenhados. */
  ordem: readonly number[];
  /** Quantas fotos tem cada board, por índice real. */
  bloqueados?: readonly boolean[];
  onSaltar: (bi: number) => void;
  /** Mover a página que está NA POSIÇÃO `de` para a posição `para`. */
  onMover?: (de: number, para: number) => void;
}) {
  const activo = useBoardAVista(ordem);
  const sensores = useSensors(
    // Os mesmos limiares dos cartões: o rato pega aos 4 px, o dedo só depois de
    // segurar 180 ms — senão, no telemóvel, percorrer a tira do índice
    // arrastava a página em que o dedo pousou.
    useSensor(MouseSensor, RATO),
    useSensor(TouchSensor, DEDO),
    useSensor(KeyboardSensor, TECLADO_DE_LISTA),
  );
  const ids = useMemo(() => ordem.map((bi) => `indice:${bi}`), [ordem]);

  const contagem = useMemo(() => contagemDosEstados(boards, SEM_TECTO), [boards]);

  if (boards.length === 0) return null;

  function aoLargar(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const de = ids.indexOf(String(active.id));
    const para = ids.indexOf(String(over.id));
    if (de < 0 || para < 0) return;
    onMover?.(de, para);
  }

  const lista = (
    /* A tira rola de lado; a coluna empilha. O limiar é o do invólucro que
       lhe dá a largura (`ProposalStudio`, a grelha de `11rem`), e tem de ser o
       MESMO: ver lá o comentário. */
    <ul className="flex gap-1.5 overflow-x-auto pb-1 @min-[40rem]:flex-col @min-[40rem]:overflow-visible @min-[40rem]:pb-0">
      {ordem.map((bi, pos) => (
        <EntradaDoIndice
          key={bi}
          bi={bi}
          pos={pos}
          board={boards[bi]}
          bloqueado={bloqueados?.[bi] ?? false}
          activo={activo === bi}
          arrastavel={!!onMover}
          onSaltar={onSaltar}
        />
      ))}
    </ul>
  );

  return (
    <nav
      aria-label="Índice das páginas de inspiração"
      /* Na caixa estreita é uma fila que rola de lado (o `<ul>` abaixo), e aí
         não há altura para limitar. Na caixa larga é uma coluna `sticky`: sem
         tecto, uma proposta com muitas páginas tem o fim do índice fora do ecrã
         e sem maneira de lá chegar, porque uma coluna presa não acompanha o
         rolo.

         O limiar é uma *container query* e não `lg:`, porque este índice não
         tem largura própria — ela vem da grelha do `ProposalStudio`, e a
         pergunta que as duas fazem tem de ser a mesma. A caixa que conta é a
         coluna onde ela escreve, e essa é MAIOR abaixo de 1024 do que acima:
         a razão está escrita lá, ao pé da grelha. */
      className="mb-3 @min-[40rem]:mb-0 @min-[40rem]:sticky @min-[40rem]:top-24 @min-[40rem]:max-h-[calc(100vh-7rem)] @min-[40rem]:self-start @min-[40rem]:overflow-y-auto"
    >
      <p className="bo-eyebrow mb-1.5">Páginas</p>
      {/* ── QUANTAS FALTAM, EM VEZ DE QUANTAS HÁ ────────────────────────────
          «8 páginas» não se responde a nada. O que se quer saber antes de
          enviar é quantas ainda pedem trabalho, e é isso que está escrito. */}
      <p className="mb-1.5 text-[10px] leading-relaxed text-foreground/45">
        {resumoDosEstados(contagem)}
      </p>
      {onMover ? (
        <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoLargar}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            {lista}
          </SortableContext>
        </DndContext>
      ) : (
        lista
      )}
    </nav>
  );
}

/** «3 prontas · 2 por acabar · 3 vazias», sem as que são zero. */
function resumoDosEstados(c: Record<"pronto" | "por-acabar" | "vazio", number>): string {
  const partes = [
    c.pronto > 0 ? `${c.pronto} ${c.pronto === 1 ? "pronta" : "prontas"}` : null,
    c["por-acabar"] > 0 ? `${c["por-acabar"]} por acabar` : null,
    c.vazio > 0 ? `${c.vazio} ${c.vazio === 1 ? "vazia" : "vazias"}` : null,
  ].filter(Boolean);
  // Todas prontas é a única frase que vale a pena ser diferente: é a resposta a
  // «já posso enviar?».
  if (partes.length === 1 && c.pronto > 0) return "Estão todas prontas.";
  return partes.join(" · ");
}

function EntradaDoIndice({
  bi,
  pos,
  board,
  bloqueado,
  activo,
  arrastavel,
  onSaltar,
}: {
  bi: number;
  pos: number;
  board: MoodBoard | undefined;
  bloqueado: boolean;
  activo: boolean;
  arrastavel: boolean;
  onSaltar: (bi: number) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: `indice:${bi}`,
    disabled: !arrastavel,
  });
  const diagnostico = diagnosticoDoBoard(board ?? { images: [] }, SEM_TECTO);
  const vazio = diagnostico.estado === "vazio";
  const porAcabar = diagnostico.estado === "por-acabar";
  // O que falta, numa frase — no `title` e para quem lê por voz. A marca
  // visual diz QUE falta; isto diz O QUÊ, sem ocupar a entrada.
  const oQueFalta = diagnostico.falta.join(", ");

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      /* Na tira as entradas não encolhem (rolam); na coluna encolhem, para o
         título truncar em vez de empurrar. O mesmo limiar dos outros dois. */
      className={`flex shrink-0 items-center gap-0.5 @min-[40rem]:shrink ${
        isDragging ? "relative z-10 opacity-90" : ""
      }`}
    >
      {arrastavel && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastar a página ${pos + 1}`}
          className={`alvo-toque flex h-7 w-4 shrink-0 cursor-grab items-center justify-center rounded text-foreground/25 hover:text-[var(--bo-text-muted)] active:cursor-grabbing ${ESTADO} ${PRESSAO}`}
        >
          <span aria-hidden="true">⠿</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => onSaltar(bi)}
        // A página que está à vista. `aria-current` e não só a cor: é a mesma
        // informação, e quem lê por voz também precisa dela.
        aria-current={activo ? "true" : undefined}
        title={oQueFalta ? `Página ${pos + 1}: ${oQueFalta}` : undefined}
        // `relative`: o `sr-only` do «por acabar» lá dentro é `absolute`, e sem
        // um antepassado posicionado DENTRO da fita que desliza ele escapava-lhe
        // e alargava a página — 40 px de deslize lateral a 390 (medido).
        className={`alvo-toque relative flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-tight  ${
          activo
            ? "border-sage-600/55 bg-sage-600/[0.07] text-[var(--bo-text)]"
            : vazio
              ? "border-dashed border-foreground/20 text-foreground/45"
              : "border-[var(--bo-hairline-strong)] text-[var(--bo-tinta-72)] hover:border-foreground/25"
        } ${ESTADO} ${PRESSAO}`}
      >
        <span className="text-foreground/30 tabular-nums">{pos + 1}</span>
        <span className="min-w-0 flex-1 truncate">{board?.title?.trim() || "sem título"}</span>
        {/* ── O ESTADO, EM DUAS PALAVRAS ────────────────────────────────────
            Três marcas e não uma: «vazio» era a única que existia, e uma
            página com fotos e sem título lia-se como pronta. O ponto âmbar é
            o «falta qualquer coisa» — o que falta está no `title` e no nome
            acessível, para a entrada não crescer. */}
        {porAcabar && (
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--bo-aviso-tom)]"
            title={oQueFalta}
          />
        )}
        <span className="shrink-0 text-[10px] text-foreground/40">
          {bloqueado ? "fechado" : vazio ? "vazio" : `${board?.images?.length ?? 0}`}
        </span>
        {porAcabar && <span className="sr-only">— por acabar: {oQueFalta}</span>}
      </button>
    </li>
  );
}

/**
 * Qual das páginas está à vista neste momento.
 *
 * Palavras dela: «Indicar qual o board actualmente visível durante o scroll.»
 * Com oito páginas abertas, o índice sem isto é um mapa sem o «você está aqui»:
 * diz para onde se pode ir e não diz de onde se parte.
 *
 * É um `IntersectionObserver` sobre os cartões (`#mood-board-<bi>`), e escolhe
 * o que está MAIS ACIMA entre os que se vêem — é assim que se lê uma página, de
 * cima para baixo, e é a escolha que não pisca quando dois cartões partilham o
 * ecrã. Sem observador (jsdom, browsers antigos) devolve `null` e o índice
 * comporta-se como antes.
 */
function useBoardAVista(ordem: readonly number[]): number | null {
  const [activo, setActivo] = useState<number | null>(null);
  const chave = ordem.join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const indices = chave ? chave.split(",").map(Number) : [];
    const aVista = new Map<number, number>();
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          const bi = Number(e.target.id.replace("mood-board-", ""));
          if (e.isIntersecting) aVista.set(bi, e.boundingClientRect.top);
          else aVista.delete(bi);
        }
        if (aVista.size === 0) return;
        // O mais acima dos que se vêem.
        let melhor: number | null = null;
        let topo = Infinity;
        for (const [bi, y] of aVista) {
          if (y < topo) {
            topo = y;
            melhor = bi;
          }
        }
        setActivo(melhor);
      },
      // A margem de cima corta a barra fixa do back office: sem ela, o cartão
      // que está por baixo dela contava como visível.
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const bi of indices) {
      const el = document.getElementById(`mood-board-${bi}`);
      if (el) observador.observe(el);
    }
    return () => observador.disconnect();
  }, [chave]);

  return activo;
}
