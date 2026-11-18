"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import type { Quote } from "@/lib/orcamento/types";
import { aEscrever, comComando, dentroDeUmaJanela, procuraDaVista, VIEW_KEYS } from "../atalhos";
import type { View } from "../nav";

/** As janelas que, abertas à frente, calam os atalhos de uma tecla. */
interface JanelasAbertas {
  paletteOpen: boolean;
  newQuoteOpen: boolean;
  shortcutsOpen: boolean;
  ajudaOpen: boolean;
  restoreOpen: boolean;
}

interface Entrada {
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  janelas: JanelasAbertas;
  setPaletteOpen: Dispatch<SetStateAction<boolean>>;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  searchRef: RefObject<HTMLInputElement | null>;
  pedirNovaTarefa: () => void;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  navOpen: boolean;
  setNavOpen: Dispatch<SetStateAction<boolean>>;
  selected: Quote | null;
  sairDoPainel: (id: string | null) => void;
  dirtyRef: MutableRefObject<boolean>;
  haSeleccao: boolean;
  aApagarLote: string[] | null;
  aArquivarLote: string[] | null;
  bulkBusy: boolean;
  drawerRef: RefObject<HTMLDivElement | null>;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ATALHOS DE TECLADO DO BACK OFFICE, E O ESCAPE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ⌘K, ⌘N nas Tarefas, ⌘A nos Pedidos, o acorde «g»+destino, «n», «/», «?», e o
 * Escape que fecha a camada de cima. Saiu do `AdminClient` tal e qual, pela
 * mesma ordem (fase 7 de `docs/ESTRUTURA-DO-CODIGO.md`). A tabela das teclas
 * vive em `atalhos.ts`, que a folha dos atalhos também lê.
 *
 * Devolve as duas referências que o `AdminClient` mantém em dia mais abaixo
 * (os pedidos à vista e «o painel está por cima»), porque só existem depois de
 * a lista estar calculada.
 */
export function useAtalhosDoTeclado({
  view,
  setView,
  janelas,
  setPaletteOpen,
  setNewQuoteOpen,
  setShortcutsOpen,
  searchRef,
  pedirNovaTarefa,
  setSelectedIds,
  navOpen,
  setNavOpen,
  selected,
  sairDoPainel,
  dirtyRef,
  haSeleccao,
  aApagarLote,
  aArquivarLote,
  bulkBusy,
  drawerRef,
}: Entrada) {
  const { paletteOpen, newQuoteOpen, shortcutsOpen, ajudaOpen, restoreOpen } = janelas;
  /**
   * ── UMA JANELA À FRENTE CALA OS ATALHOS DE UMA TECLA ──────────────────────
   *
   * «Está a escrever num campo» não chegava. Com uma destas janelas aberta o
   * foco está quase sempre num BOTÃO — a armadilha de foco leva-o para o «×» de
   * fechar — e um botão não é um campo: o «n» passava, e o «Novo pedido» abria
   * POR BAIXO da janela que ela tinha à frente. O mesmo com o «/» (saltava para
   * os Pedidos) e com o acorde «g»+destino (trocava a vista por trás).
   *
   * A regra é uma só: enquanto houver uma janela à frente, uma tecla solta não
   * muda o que está por trás dela. O Escape não passa por aqui — cada janela é
   * dona do seu, e é assim que continua a fechar-se com uma tecla.
   */
  const janelaAberta = newQuoteOpen || shortcutsOpen || ajudaOpen || restoreOpen;
  const janelaAbertaRef = useRef(false);
  const paletteAbertaRef = useRef(false);
  /* A vista, num ref, pela mesma razão que as outras duas aqui em cima: o
     ouvinte de teclado monta-se uma vez e fecharia sobre a vista do primeiro
     desenho. Sem isto, o ⌘N das Tarefas ou nunca disparava ou disparava em
     todas as vistas — conforme a que estivesse aberta ao montar. */
  const viewRef = useRef(view);
  /** Os pedidos DESENHADOS (filtrados e já paginados), para o ⌘A — ver o
   *  ouvinte de teclado e a revisão · 3. */
  const filtradosRef = useRef<string[]>([]);
  /** O painel de um pedido está POR CIMA da lista (gaveta) — o ⌘A não escolhe
   *  por trás dele. Ao lado (xl), a lista vê-se e o ⌘A é dela. */
  const painelPorCimaRef = useRef(false);
  useEffect(() => {
    janelaAbertaRef.current = janelaAberta;
    paletteAbertaRef.current = paletteOpen;
    viewRef.current = view;
  }, [janelaAberta, paletteOpen, view]);

  /**
   * ── O `/` FOCA A PROCURA DA VISTA ONDE SE ESTÁ (BO 4) ─────────────────────
   *
   * Era sempre o `focusSearch`: ia para os Pedidos e focava a procura deles,
   * estivesse ela onde estivesse. Agora foca o campo de procura da vista aberta
   * (`procuraDaVista`, em `atalhos.ts`); nos Pedidos continua a ser o mesmo
   * campo de sempre. Numa vista sem procura — ou com ela fora do ecrã, como
   * dentro de uma pasta de tema — abre a procura em tudo, que é a que serve
   * qualquer sítio.
   */
  const focarProcuraDaVista = useCallback(() => {
    const vista = viewRef.current;
    if (vista === "pedidos" && searchRef.current) {
      searchRef.current.focus();
      return;
    }
    const seletor = procuraDaVista(vista);
    const campo = seletor
      ? [...document.querySelectorAll<HTMLInputElement>(seletor)].find(
          (c) => !c.disabled && !c.closest("[inert], [aria-hidden='true']"),
        )
      : undefined;
    if (campo) campo.focus();
    else setPaletteOpen(true);
    // `searchRef` e o `set*` são estáveis: o atalho continua a ser criado uma vez.
  }, [searchRef, setPaletteOpen]);

  // Global keyboard shortcuts. ⌘K works anywhere; the rest are ignored while
  // typing so they never fight with form fields.
  useEffect(() => {
    let lastG = 0; // timestamp of the last "g" press, for the "g then key" chord
    const onKey = (e: KeyboardEvent) => {
      /* ── ⌘N NAS TAREFAS ────────────────────────────────────────────────
         Antes do teste do «a escrever», e de propósito: ⌘N é um atalho com
         modificador, e um atalho com modificador não colide com o que se está
         a escrever num campo — é para isso que o modificador serve. Quem está
         a escrever uma tarefa e faz ⌘N quer a seguinte, que é exactamente o
         que isto faz.

         Só nas Tarefas: noutra vista o ⌘N do browser (janela nova) continua a
         ser dela. */
      if (comComando(e, "n") && viewRef.current === "tarefas") {
        if (janelaAbertaRef.current || paletteAbertaRef.current) return;
        e.preventDefault();
        pedirNovaTarefa();
        return;
      }

      if (comComando(e, "k")) {
        // A paleta também não se abre por baixo de outra janela; fechá-la com o
        // mesmo atalho continua a valer, que é o que ⌘K faz quando ela é a que
        // está à frente.
        if (janelaAbertaRef.current) return;
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }

      const typing = aEscrever(e.target);

      /* ── ⌘A NOS PEDIDOS SELECIONA O QUE ESTÁ À VISTA (BO 4) ──────────────
         O que está FILTRADO, e não a lista inteira: é o mesmo conjunto que o
         «Selecionar todos (N)» da barra do lote já selecciona, e o mesmo sobre
         que os botões do lote agem (`seleccionadosAVista`). Num campo o ⌘A é
         do campo — seleccionar o texto que se escreveu —, e com uma janela à
         frente é dela. Noutras vistas é do browser, ou da vista (os Temas e as
         Tarefas têm o seu). */
      if (comComando(e, "a", true) && viewRef.current === "pedidos") {
        if (typing || janelaAbertaRef.current || paletteAbertaRef.current) return;
        // A mesma regra das Tarefas (revisão · 8): nunca atrás de uma janela
        // aberta, nem com o painel de um pedido POR CIMA da lista. Com o painel
        // AO LADO (xl) a lista está à vista e o ⌘A escolhe-a — e o
        // `preventDefault` de baixo impede o browser de escolher a página
        // inteira (2.ª revisão · 4).
        if (dentroDeUmaJanela(e.target) || painelPorCimaRef.current) return;
        const ids = filtradosRef.current;
        if (ids.length === 0) return;
        e.preventDefault();
        setSelectedIds(new Set(ids));
        return;
      }

      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (janelaAbertaRef.current || paletteAbertaRef.current) return;

      const k = e.key.toLowerCase();

      // "g" arms the chord; the next key within 900ms picks a destination.
      if (k === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 900 && VIEW_KEYS[k]) {
        e.preventDefault();
        setView(VIEW_KEYS[k]);
        lastG = 0;
        return;
      }
      lastG = 0;

      if (k === "n") {
        e.preventDefault();
        setNewQuoteOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        focarProcuraDaVista();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
      // O Escape saiu daqui: com a janela aberta esta linha já não é alcançada
      // (ver a guarda acima) e sem ela não havia nada para fechar. Quem o trata
      // é a própria janela, que é onde ele tem de continuar a valer.
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    focarProcuraDaVista,
    pedirNovaTarefa,
    setNewQuoteOpen,
    setPaletteOpen,
    setSelectedIds,
    setShortcutsOpen,
    setView,
  ]);

  // Escape dismisses the open drawer/nav — but only when no modal is capturing
  // it (the palette / new-quote / shortcuts dialogs handle their own Escape).
  useEffect(() => {
    if (paletteOpen || newQuoteOpen || shortcutsOpen || ajudaOpen || restoreOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape dentro de um campo de texto sai do CAMPO (dispensa autocomplete/
      // IME, tira o foco), nunca fecha o painel inteiro — fechar o detalhe a
      // meio da escrita descartava trabalho (ex.: um contractRef por gravar).
      const t = e.target as HTMLElement | null;
      /* Com um pedido aberto, QUALQUER controlo de formulário — uma caixa
         como o «Já pago» incluída — só perde o foco: fechar o painel a meio
         deitava fora o que ela estava a preencher (2.ª revisão · 1). Sem
         painel, a caixa não é escrita e o Esc é do lote (revisão · 2). */
      const controlo = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if (t && (selected ? controlo : aEscrever(t))) {
        t.blur();
        return;
      }
      // Uma janela aberta POR CIMA do painel (uma pergunta, um menu) é dona do
      // seu Esc; o próprio painel em gaveta também é uma janela, e esse não.
      const janela = t?.closest?.('[role="dialog"], [role="alertdialog"]') ?? null;
      const outraJanela = !!janela && janela !== drawerRef.current;
      if (navOpen) setNavOpen(false);
      else if (selected && !outraJanela) {
        if (
          !dirtyRef.current ||
          window.confirm("Tem alterações por guardar neste pedido. Descartar?")
        ) {
          // Pela mesma porta do «×» e do véu: fechar por Escape não é um
          // fecho de segunda classe, e um painel que sai por um caminho e
          // pisca no outro lê-se como duas coisas diferentes.
          sairDoPainel(selected.id);
        }
      } else if (
        viewRef.current === "pedidos" &&
        haSeleccao &&
        aApagarLote === null &&
        aArquivarLote === null &&
        // Com o lote a correr, os que falharem vão ficar selecionados: limpar
        // agora fazia o aviso mentir (2.ª revisão · 7).
        !bulkBusy &&
        // Nunca atrás de uma janela aberta (revisão · 8): o Esc é dela.
        !dentroDeUmaJanela(t)
      ) {
        // A camada de topo, quando não há painel nem gaveta, é a selecção do
        // lote: o Esc limpa-a (BO 4), como nos Temas e nas Tarefas.
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [
    paletteOpen,
    newQuoteOpen,
    shortcutsOpen,
    ajudaOpen,
    restoreOpen,
    navOpen,
    setNavOpen,
    selected,
    sairDoPainel,
    dirtyRef,
    setSelectedIds,
    haSeleccao,
    aApagarLote,
    aArquivarLote,
    bulkBusy,
    drawerRef,
  ]);
  return { filtradosRef, painelPorCimaRef };
}
