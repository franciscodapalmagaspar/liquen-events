import { type Dispatch, type RefObject, type SetStateAction } from "react";
import { MAX_IMPORT_BATCH, type ThemeImage } from "@/lib/theme-types";
import { avaliarFoto, type LugarDaFoto } from "@/lib/qualidade-da-foto";
import { fotoEmCache } from "../../theme-picker-cache";
import { type Avisar } from "../../Toast";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A SELECÇÃO NO SELETOR — o tecto, os intervalos, a curadoria e o teclado
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Escolher fotos até ao tecto da página, por intervalos (Shift), todas as
 * visíveis, na curadoria, e andar pela grelha com as setas.
 *
 * Saiu do corpo do componente (fase 8 de
 * `docs/ESTRUTURA-DO-CODIGO.md`), tal e qual, e é chamado NO MESMO SÍTIO onde o
 * código estava: a ordem dos hooks e dos efeitos da pasta não muda. Os nomes
 * ficam os de lá.
 */
export interface EntradasSeleccaoDoSeletor {
  multiple: boolean;
  lugar: LugarDaFoto | undefined;
  toast: Avisar;
  images: ThemeImage[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  selected: string[];
  setFocusIndex: Dispatch<SetStateAction<number>>;
  focusIndex: number;
  setPreviewIndex: Dispatch<SetStateAction<number | null>>;
  anchor: RefObject<number | null>;
  gridRef: RefObject<HTMLDivElement | null>;
  selectedSet: Set<string>;
  pendingSet: Set<string>;
}

export function useSeleccaoDoSeletor({
  multiple,
  lugar,
  toast,
  images,
  setSelected,
  selected,
  setFocusIndex,
  focusIndex,
  setPreviewIndex,
  anchor,
  gridRef,
  selectedSet,
  pendingSet,
}: EntradasSeleccaoDoSeletor) {
  /** Junta caminhos à seleção pela ORDEM dada, parando no teto do lote. */
  function addUpToLimit(base: string[], paths: string[]): { next: string[]; capped: boolean } {
    const next = base.slice();
    const have = new Set(next);
    for (const p of paths) {
      if (have.has(p)) continue;
      // Já vai a caminho: escolher outra vez seria pedir a mesma cópia duas
      // vezes. Salta-se sem dizer nada — a pastilha já a mostra a entrar.
      if (pendingSet.has(p)) continue;
      if (next.length >= MAX_IMPORT_BATCH) return { next, capped: true };
      next.push(p);
      have.add(p);
    }
    return { next, capped: false };
  }

  /** O aviso do teto quando um gesto em bloco (intervalo, "todas as visíveis")
   *  não coube todo: sem isto ela contava 60 fotos no ecrã e 40 no rodapé. */
  function warnCapped() {
    toast(
      `Só cabem ${MAX_IMPORT_BATCH} fotos de cada vez — ficaram selecionadas as primeiras.`,
      "info",
    );
  }

  /** Marca (ou desmarca) tudo entre duas células, como qualquer gestor de
   *  ficheiros. O sentido é o que a foto do fim vai passar a ser. */
  function selectRange(from: number, to: number, turnOn: boolean) {
    const lo = Math.max(0, Math.min(from, to));
    const hi = Math.min(images.length - 1, Math.max(from, to));
    const range = images.slice(lo, hi + 1).map((i) => i.path);
    if (!turnOn) {
      const drop = new Set(range);
      setSelected(selected.filter((p) => !drop.has(p)));
      return;
    }
    const { next, capped } = addUpToLimit(selected, range);
    setSelected(next);
    if (capped) warnCapped();
  }

  function toggleAt(index: number, extend: boolean) {
    const im = images[index];
    if (!im) return;
    // Ignorado em silêncio: esta foto já vai a caminho desta proposta.
    if (pendingSet.has(im.path)) return;
    // A âncora é lida AGORA e só depois movida: dentro de um `setSelected`
    // preguiçoso já valeria `index`, e o Shift+clique passava a clique normal.
    const from = anchor.current;
    anchor.current = index;
    setFocusIndex(index);

    if (!multiple) {
      // Capas: uma foto por espaço — a segunda escolha substitui a primeira.
      setSelected(selectedSet.has(im.path) ? [] : [im.path]);
      return;
    }
    if (extend && from !== null && from !== index) {
      selectRange(from, index, !selectedSet.has(im.path));
      return;
    }
    if (selectedSet.has(im.path)) {
      setSelected(selected.filter((p) => p !== im.path));
      return;
    }
    // No teto, tocar numa foto por selecionar não faz nada — o rodapé já diz
    // porquê desde que o limite foi atingido. A validação do servidor
    // mantém-se: isto só evita que a equipa escolha 60 fotos e só depois
    // descubra que não cabiam.
    if (selected.length >= MAX_IMPORT_BATCH) return;
    setSelected([...selected, im.path]);
  }

  function selectAllVisible() {
    const { next, capped } = addUpToLimit(
      selected,
      images.map((i) => i.path),
    );
    setSelected(next);
    if (capped) warnCapped();
  }

  /**
   * Uma decisão da curadoria, aplicada à MESMA selecção que a grelha usa.
   *
   * Não é o `toggleAt`: aquele alterna, e aqui a decisão é afirmativa —
   * «incluir» sobre uma foto já incluída não a pode tirar, senão anular a
   * última decisão fazia o contrário do que diz.
   */
  function decidirNaCuradoria(path: string, incluir: boolean) {
    setSelected((prev) => {
      const tem = prev.includes(path);
      if (incluir === tem) return prev;
      if (!incluir) return prev.filter((p) => p !== path);
      if (prev.length >= MAX_IMPORT_BATCH) {
        warnCapped();
        return prev;
      }
      return [...prev, path];
    });
  }

  // ── Teclado na grelha ─────────────────────────────────────────────────────
  // Roving tabindex: uma só célula responde ao Tab, as setas movem-se por
  // dentro. As células continuam a ser `<button>`, por isso o Enter e o Espaço
  // seguem a semântica nativa (= alternar) e o `useFocusTrap` continua a
  // encontrá-las na sua consulta de focáveis; como o rodapé vem SEMPRE depois
  // da grelha no DOM, o "último focável" do trap nunca é uma célula.

  /** Quantas colunas a grelha tem neste ecrã (3 no telemóvel, 5 a partir de
   *  `sm`). Lê-se do CSS em vez de se duplicar aqui a media query. */
  function columnCount(): number {
    const el = gridRef.current;
    if (!el || typeof window === "undefined") return 1;
    const cols = window.getComputedStyle(el).gridTemplateColumns;
    const n = cols ? cols.split(" ").filter(Boolean).length : 0;
    return n > 0 ? n : 1;
  }

  function focusCell(index: number) {
    const clamped = Math.max(0, Math.min(images.length - 1, index));
    setFocusIndex(clamped);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${clamped}"]`)?.focus();
    return clamped;
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (images.length === 0) return;
    // De onde parte a tecla é uma pergunta ao DOM, não ao estado: o foco pode
    // ter chegado à célula por clique ou por Tab, e o `focusIndex` só o
    // alcança na renderização seguinte.
    const from = (e.target as HTMLElement | null)?.closest?.("[data-cell]");
    const current = from ? Number(from.getAttribute("data-cell")) : focusIndex;
    const cols = columnCount();
    let target: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        target = current + 1;
        break;
      case "ArrowLeft":
        target = current - 1;
        break;
      case "ArrowDown":
        target = current + cols;
        break;
      case "ArrowUp":
        target = current - cols;
        break;
      case "Home":
        target = 0;
        break;
      case "End":
        target = images.length - 1;
        break;
      case "v":
      case "V":
        e.preventDefault();
        setPreviewIndex(current);
        return;
      default:
        return;
    }
    e.preventDefault();
    const moved = focusCell(target);
    // Shift + seta estende a seleção sem largar a âncora — é o gesto de
    // intervalo para quem não usa rato.
    if (e.shiftKey && multiple) {
      if (anchor.current === null) anchor.current = current;
      selectRange(anchor.current, moved, true);
    } else if (!e.shiftKey) {
      anchor.current = moved;
    }
  }

  // ── Importação ────────────────────────────────────────────────────────────

  /** A `ThemeImage` de um caminho escolhido. Pode estar noutro tema (a seleção
   *  atravessa separadores), por isso procura-se também na cache. Não achar
   *  nada não impede a cópia: o que a rota precisa é do caminho — o resto só
   *  serve para a pastilha mostrar a miniatura. */
  function imageFor(path: string): ThemeImage {
    const here = images.find((i) => i.path === path);
    if (here) return here;
    return fotoEmCache(path) ?? { path, url: "" };
  }

  /**
   * Entrega a seleção à cópia e devolve o diálogo a quem o abriu.
   *
   * Nada aqui espera pela rede: o `startImport` é síncrono a arrancar (e a
   * descartar o que já vai a caminho), por isso um duplo clique não chega a
   * ser dois lotes — o segundo encontra os caminhos em voo e não faz nada. É
   * também aí, ainda dentro deste gesto, que o `onReserve` guarda o lugar de
   * cada foto no documento: quando o diálogo desaparece do ecrã, as fotos já lá
   * estão.
   */
  /** A avaliação desta foto para o sítio para onde vai (`qualidade-da-foto.ts`). */
  function qualidadeDe(im: ThemeImage) {
    return lugar && im.largura && im.altura ? avaliarFoto(im.largura, im.altura, lugar) : null;
  }
  return {
    qualidadeDe,
    imageFor,
    toggleAt,
    selectAllVisible,
    decidirNaCuradoria,
    onGridKeyDown,
    focusCell,
  };
}
