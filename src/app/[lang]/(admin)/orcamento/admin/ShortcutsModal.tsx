"use client";

import { FolhaOuDialogo } from "./ui";
import { VIEW_KEYS } from "./atalhos";
import { NAV, type View } from "./nav";

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * ── O QUE DESAPARECE NUM ECRÃ DE DEDO, E PORQUÊ ────────────────────────────
 *
 * `soTeclado` marca os grupos que não têm contrapartida nenhuma no toque: uma
 * combinação («G, depois P»), um ⌘Z, ou setas sobre um cartão FOCADO — sem
 * teclado não há foco nem combinação, e o que fica no ecrã é uma lista de
 * teclas que o aparelho não tem.
 *
 * O «Geral» fica, e não é por descuido: cada uma das suas seis linhas tem um
 * botão à vista no telemóvel (guardar tudo, pesquisar, novo pedido, o «?», o
 * «×»), portanto lê-se como um índice do que a barra faz e não como uma lista
 * de teclas inúteis.
 *
 * É a mesma decisão que o botão que abre isto já tinha tomado — ele próprio é
 * `pointer-coarse:hidden` na gaveta de navegação (ver `AdminClient`) — e o
 * mesmo padrão do `AjudaGlossario`, que esconde as menções ao «?» e ao Escape
 * pela mesma razão.
 */
/** O nome de cada destino do acorde «G», como o menu o escreve. */
const ROTULO_DO_DESTINO: Partial<Record<View, string>> = {
  ...Object.fromEntries(NAV.map((n) => [n.id, n.label])),
  // Fora do menu (a pedido dela), mas a Visão Geral leva lá — ver `atalhos.ts`.
  kanban: "Organização de propostas",
};

type Grupo = {
  title: string;
  soTeclado?: boolean;
  /**
   * `soNaApp`: atalhos que o BROWSER guarda para si num separador normal
   * (⌘N/Ctrl+N abre janela, ⌘T/Ctrl+T abre separador) e só chegam à página
   * quando o back office está aberto como aplicação instalada. Mostrá-los
   * num separador era prometer uma tecla que abre outra coisa (revisão · 9).
   */
  items: { keys: string[]; label: string; soNaApp?: boolean }[];
};

/**
 * ── O QUE ESTA FOLHA MOSTRA, DESDE BO 4 ───────────────────────────────────
 *
 * Os atalhos que EXISTEM, e não só os do cabeçalho: as Tarefas, o Calendário
 * e a Biblioteca de temas tinham os seus (⌘N, ↑↓, ⌘⌫; ⌘1–4, ⌘T, setas; ⌘A,
 * ⇧+clique) e esta folha não falava de nenhum — um atalho que só quem leu o
 * código conhece não existe. O acorde «G» lê a tabela do ouvinte
 * (`VIEW_KEYS`), por isso a folha não pode voltar a prometer uma letra que
 * não faz nada.
 */
export const GROUPS: Grupo[] = [
  {
    title: "Geral",
    items: [
      // Deixou de ser um atalho do estúdio de propostas: vale em qualquer sítio
      // do back office e grava TODOS os ecrãs com trabalho por gravar — é o
      // mesmo gesto do botão «Guardar tudo» do cabeçalho, com a mesma resposta.
      { keys: ["⌘", "S"], label: "Guardar tudo o que está por gravar" },
      { keys: ["⌘", "K"], label: "Procurar em tudo e comandos" },
      { keys: ["/"], label: "Procurar na vista aberta" },
      { keys: ["N"], label: "Novo pedido" },
      { keys: ["?"], label: "Mostrar atalhos" },
      { keys: ["Esc"], label: "Fechar janelas" },
    ],
  },
  {
    title: "Navegar — pressiona G, depois…",
    soTeclado: true,
    items: Object.entries(VIEW_KEYS).map(([letra, vista]) => ({
      keys: ["G", letra.toUpperCase()],
      label: ROTULO_DO_DESTINO[vista] ?? vista,
    })),
  },
  {
    title: "Pedidos",
    soTeclado: true,
    items: [
      { keys: ["⌘", "A"], label: "Selecionar os que estão à vista" },
      { keys: ["Esc"], label: "Limpar a seleção" },
    ],
  },
  {
    title: "Tarefas",
    soTeclado: true,
    items: [
      { keys: ["⌘", "N"], label: "Nova tarefa", soNaApp: true },
      { keys: ["↑", "↓"], label: "Tarefa anterior e seguinte" },
      { keys: ["⌘", "⌫"], label: "Eliminar a tarefa" },
      { keys: ["⇧", "clique"], label: "Selecionar várias seguidas" },
      { keys: ["⌘", "clique"], label: "Juntar à seleção" },
      { keys: ["⌘", "A"], label: "Selecionar as que estão à vista" },
      { keys: ["Esc"], label: "Limpar a seleção" },
    ],
  },
  {
    title: "Calendário",
    soTeclado: true,
    items: [
      { keys: ["⌘", "1–4"], label: "Dia, semana, mês, ano" },
      { keys: ["T"], label: "Hoje" },
      { keys: ["⌘", "T"], label: "Hoje, na aplicação instalada", soNaApp: true },
      { keys: ["⌘", "N"], label: "Novo evento", soNaApp: true },
      { keys: ["←", "→"], label: "Anterior e seguinte" },
      { keys: ["⌥", "← →"], label: "Mês anterior e seguinte" },
    ],
  },
  {
    title: "Biblioteca de temas",
    soTeclado: true,
    items: [
      { keys: ["⌘", "A"], label: "Selecionar todas as fotos" },
      { keys: ["⇧", "clique"], label: "Selecionar várias seguidas" },
      { keys: ["⌘", "clique"], label: "Juntar à seleção" },
      { keys: ["Espaço"], label: "Ver a foto em grande" },
      { keys: ["Esc"], label: "Limpar a seleção" },
    ],
  },
  {
    title: "Estúdio de propostas",
    soTeclado: true,
    items: [{ keys: ["⌘", "Z"], label: "Desfazer" }],
  },
  {
    title: "Organização de propostas — com um cartão focado",
    soTeclado: true,
    items: [
      { keys: ["Enter"], label: "Abrir o pedido" },
      { keys: ["←"], label: "Mover para a coluna anterior" },
      { keys: ["→"], label: "Mover para a coluna seguinte" },
    ],
  },
];

/** As teclas do Mac e as dos outros sistemas, pela ordem em que aparecem. */
const FORA_DO_MAC: Record<string, string> = { "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift" };

/**
 * Os grupos para ESTE aparelho (revisão · 9): sem os atalhos que o browser
 * guarda para si quando não é a aplicação instalada, e com Ctrl/Alt/Shift
 * em vez de ⌘/⌥/⇧ fora do Mac — os ouvintes aceitam os dois (`metaKey ||
 * ctrlKey`), a folha é que só dizia um.
 */
export function gruposDosAtalhos(ambiente: { mac: boolean; app: boolean }): Grupo[] {
  return GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((i) => ambiente.app || !i.soNaApp)
      .map((i) => ({
        ...i,
        keys: ambiente.mac ? i.keys : i.keys.map((k) => FORA_DO_MAC[k] ?? k),
      })),
  })).filter((g) => g.items.length > 0);
}

/** Onde estamos: Mac ou não, aplicação instalada ou separador do browser. */
function ambienteDoAparelho(): { mac: boolean; app: boolean } {
  if (typeof window === "undefined") return { mac: true, app: false };
  const nav = window.navigator;
  const mac = /Mac|iPhone|iPad|iPod/.test(nav.platform || nav.userAgent || "");
  const app = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  return { mac, app };
}

/** A discoverable cheat-sheet for the back-office keyboard shortcuts (opens with "?"). */
export default function ShortcutsModal({ open, onClose }: Props) {
  return (
    <FolhaOuDialogo
      aberto={open}
      onFechar={onClose}
      titulo="Atalhos de teclado"
      largura="md"
      // Acima da gaveta do pedido (50, e depois disto na árvore); era `z-[90]`
      // à mão e continua a ser.
      nivel={90}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
        {gruposDosAtalhos(ambienteDoAparelho()).map((g) => (
          <div key={g.title} className={g.soTeclado ? "pointer-coarse:hidden" : undefined}>
            <p className="text-foreground/30 text-[10px] tracking-[0.25em] uppercase mb-3">
              {g.title}
            </p>
            <div className="flex flex-col gap-2">
              {g.items.map((it) => (
                <div key={it.label} className="flex items-center justify-between gap-4">
                  <span className="text-[var(--bo-text-muted)] text-sm">{it.label}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {it.keys.map((kk) => (
                      <kbd
                        key={kk}
                        className="min-w-[22px] text-center text-[10px] text-[var(--bo-text-muted)] bg-[var(--bo-tinta-6)] border border-[var(--bo-hairline-strong)] rounded px-1.5 py-1 leading-none"
                      >
                        {kk}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </FolhaOuDialogo>
  );
}
