"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAlturaDoConteudo } from "./ui/altura-do-conteudo";
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
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useGaveta } from "./ui/gaveta";
import {
  fallbackServiceGroupId,
  fallbackServiceItemId,
  withServiceIds,
  type ServiceGroup,
  type ServiceItem,
} from "@/lib/proposal-doc";
import BibliotecaServicos, { guardarNaBiblioteca } from "./BibliotecaServicos";
import CaixaInglesa from "./CaixaInglesa";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * A secção «Serviços» do estúdio de propostas — grupos (a, b, c…) e as suas
 * linhas.
 *
 * É O ECRÃ MAIS ESCRITO DA CASA: dezenas de linhas por proposta, muitas vezes
 * com o cliente ao telefone. Por isso a régua aqui é o TECLADO, não o rato —
 * escrever "Reunião inicial" Enter "Montagem" Enter "Desmontagem" tem de
 * funcionar sem uma única ida ao rato. O arrasto, os botões e os ícones existem
 * para o que o teclado não faz bem (reordenar ao calhas), não como caminho
 * principal.
 *
 * Atalhos (todos com o cursor dentro da secção):
 *   Enter          — nova linha por baixo, com o cursor lá
 *   Enter (vazia)  — fecha o grupo e abre um grupo novo, cursor no título
 *   Backspace      — numa linha vazia, apaga-a e volta ao fim da anterior
 *   Alt+↑ / Alt+↓  — move a linha (ou o grupo, a partir do título)
 *   Ctrl/Cmd+Z     — anula a última ação estrutural, incluindo remoções
 *   Ctrl/Cmd+Enter — grava o rascunho já
 *   Colar          — várias linhas de texto ⇒ uma linha de serviço por cada
 */

type Groups = ServiceGroup[];
type Updater = (prev: Groups) => Groups;

export interface ServicesEditorProps {
  groups: Groups;
  /** Aplica uma transformação aos grupos dentro do documento do estúdio. */
  onGroupsChange: (update: Updater) => void;
  /** Mostrar o campo «Descrição» (template Organização). */
  showDesc?: boolean;
  /** Ctrl/Cmd+Enter — gravar já, sem esperar pelo debounce do estúdio. */
  onSave?: () => void;
  /**
   * A proposta é bilingue: cada campo ganha uma caixa inglesa POR BAIXO.
   *
   * Desligado por omissão, e desligado este ecrã é exactamente o de sempre —
   * que é o ponto: é O ECRÃ MAIS ESCRITO DA CASA, e dobrar-lhe a altura para
   * toda a gente era pagar todos os dias por um caso ocasional.
   */
  bilingue?: boolean;
}

// ── Estilos ──
// Linhas BAIXAS e pouco arredondadas: cabe mais grupo no ecrã, e é o ecrã
// inteiro que se percorre com os olhos enquanto se escreve.
// (sem `flex-*` nem cor de texto aqui: quem os precisa acrescenta-os no sítio,
// para não ficarem duas utilidades da MESMA propriedade a disputar a cascata.)
const ROW_INPUT =
  "min-w-0 rounded-md border border-[var(--bo-control-border,rgba(42,38,32,0.5))] " +
  "bg-[var(--bo-surface,#ffffff)] px-2 py-1.5 text-xs leading-5 text-[var(--bo-text)] " +
  `focus:border-[var(--bo-accent,#4c6752)] focus:outline-none ${ESTADO}`;
/** `alvo-toque`: 44 px no dedo, sem mexer no aspeto com rato (ver globals.css).
 *  `!justify-start` porque a classe centra o conteúdo e este botão é uma linha
 *  de texto que tem de ficar alinhada à esquerda com o resto da coluna. */
const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium inline-flex items-center " +
  `text-sage-600 hover:text-[var(--bo-accent-hover)] ${ESTADO} ${PRESSAO}`;
/** Ações da linha: presentes SEMPRE no layout (nunca há salto), visíveis só em
 *  hover/foco — e sempre visíveis onde não há hover nenhum (tablet). */
const ROW_ACTIONS =
  `flex items-center gap-0.5 shrink-0 opacity-0 ${ESTADO} ` +
  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 " +
  "[@media(hover:none)]:opacity-100";
/** 24 px com rato — a densidade calma que este editor quer — e 44 px no dedo,
 *  pelo `alvo-toque`. Estes ícones estão encostados uns aos outros, e é aqui
 *  que acertar ao lado custa uma remoção que não se queria. */
const ICON_BTN =
  "alvo-toque inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--bo-text-muted)] " +
  "hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)] disabled:opacity-30 " +
  `disabled:hover:bg-transparent disabled:cursor-not-allowed ${ESTADO} ${PRESSAO}`;

/** Os campos onde se escreve: o marcador continua a ser um `<input>` («a)» tem
 *  três caracteres e nunca cresce), o resto passou a `<textarea>`. */
type CampoDeEscrita = HTMLInputElement | HTMLTextAreaElement;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NOME DO SERVIÇO DEIXA DE ACABAR A MEIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, de uma fotografia do ecrã: «Decoração Floral do Casamen».
 * Num `<input>` o texto que não cabe não existe — desliza para fora e a única
 * maneira de o ler é pôr o cursor lá dentro e navegar às cegas. MEDIDO a
 * 375 px: a caixa do nome tem 259 px de texto útil, e os nomes reais desta casa
 * andam nos 40 a 50 caracteres, ou seja cerca de 300 px. Falta sempre.
 *
 * Um `<textarea>` de UMA linha que cresce com o que lá está resolve-o sem tirar
 * nada: fechado ocupa exactamente a mesma altura que o `<input>` ocupava, e
 * quando o texto passa da linha abre a segunda em vez de o esconder.
 *
 * ── O ENTER CONTINUA A SER «LINHA SEGUINTE» ───────────────────────────────
 * É a razão pela qual isto não era um `<textarea>` desde o princípio. Aqui o
 * Enter é o atalho mais usado do editor (ver o cabeçalho do ficheiro), e num
 * `<textarea>` seria uma quebra de linha DENTRO do nome do serviço — que
 * seguia assim para o PDF. Por isso o Enter é travado no próprio campo, sempre,
 * com ou sem Shift, antes de o resto acontecer. O `Ctrl+Enter` de gravar não é
 * afectado: travar o comportamento por omissão não impede o evento de subir
 * até ao ouvinte da secção.
 */
function CampoQueCresce({
  aoEscrever,
  valor,
  ...resto
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows" | "ref"> & {
  valor: string;
  /** O `ref` do editor, para o foco poder ir para uma linha acabada de nascer. */
  aoEscrever: (el: CampoDeEscrita | null) => void;
}) {
  const meu = useRef<HTMLTextAreaElement | null>(null);

  // A altura mede-se DEPOIS de o texto estar no nó e ANTES de o browser
  // pintar: com `useEffect` a caixa aparecia com uma linha e saltava para duas
  // à frente de quem estava a escrever.
  // A altura segue o texto, e só se mede quando a caixa se vê — ver
  // `ui/altura-do-conteudo.ts` (as caixas espremidas de 14/10). As bordas
  // contam: MEDIDO a 1280 px, sem elas a caixa do nome ficava com 32 px onde o
  // `<input>` tinha 34, e a secção «Serviços» encolhia 66 px.
  useAlturaDoConteudo(meu, valor);

  return (
    <textarea
      {...resto}
      value={valor}
      rows={1}
      ref={(el) => {
        meu.current = el;
        aoEscrever(el);
      }}
      onKeyDown={(e) => {
        // Ver o cabeçalho: no nome de um serviço, o Enter nunca é uma quebra
        // de linha. Trava-se aqui, e o significado («abre a linha seguinte»)
        // fica onde sempre esteve, nos `onItemKeyDown`/`onGroupKeyDown`.
        if (e.key === "Enter") e.preventDefault();
        resto.onKeyDown?.(e);
      }}
    />
  );
}

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
/** O marcador que a numeração automática daria à posição `i`. */
const autoLetter = (i: number) => `${LETTERS[i] ?? ""})`;
/** Um marcador com forma de automático ("a)", "b)"…) — só estes é que a
 *  numeração toca; um escrito à mão ("I.", "1)") fica como está. */
const AUTO_LETTER = /^[a-z]\)$/;

/** Renumera os marcadores automáticos pela posição. Devolve o MESMO array se
 *  não houver nada a mudar (menos re-renders, menos gravações). */
function renumber(groups: Groups): Groups {
  let changed = false;
  const next = groups.map((g, i) => {
    const cur = g.letter ?? "";
    if (cur !== "" && !AUTO_LETTER.test(cur)) return g;
    const want = autoLetter(i);
    if (cur === want) return g;
    changed = true;
    return { ...g, letter: want };
  });
  return changed ? next : groups;
}

/** Ids de linhas NOVAS. Sorteados só aqui, no browser, uma única vez por linha —
 *  o documento guarda-os e ninguém os volta a gerar (o preenchimento de
 *  rascunhos antigos é o determinístico de `withServiceIds`). */
let uidSeq = 0;
const newId = () => `s${Date.now().toString(36)}${(uidSeq++).toString(36)}`;

const emptyItem = (): ServiceItem => ({ id: newId(), label: "", desc: "" });
/**
 * Um grupo novo nasce SEM linhas.
 *
 * Nascer já com uma linha vazia enchia o ecrã de um campo por preencher antes
 * de alguém o ter pedido, e a sugestão cinzenta dessa linha lia-se como se o
 * grupo já tivesse conteúdo. A linha aparece quando for pedida: Enter no
 * título cria-a e leva lá o cursor (ver `onGroupKeyDown`), tal como o botão de
 * acrescentar linha — por isso escrever o grupo todo sem tocar no rato
 * continua a funcionar exatamente na mesma.
 */
const emptyGroup = (i: number): ServiceGroup => ({
  id: newId(),
  letter: autoLetter(i),
  title: "",
  items: [],
});

/** O texto cinzento dos campos vazios: diz o que se escreve, sem um exemplo
 *  que se confunda com texto escrito (ver o título do grupo, mais abaixo). */
const PEDE_O_TITULO = "Escreve aqui o título do grupo";
const PEDE_A_LINHA = "Escreve aqui um serviço";

/**
 * Um grupo que NÃO sai em lado nenhum: sem título e sem uma linha com nome. É
 * a mesma conta do PDF (`servicosDoDocumento`) e do índice do estúdio
 * (`oQueTemODocumento`) — um grupo só com título sai, como um cartão.
 */
const grupoVazio = (g: ServiceGroup) =>
  !(g.title ?? "").trim() && !g.items.some((it) => (it.label ?? "").trim());

const isBlank = (it: ServiceItem) => !it.label.trim() && !(it.desc ?? "").trim();

/** Uma linha colada: "- Montagem" / "1. Montagem" / "• Montagem" → "Montagem".
 *  Quem cola vem de um email ou de um bloco de notas, não de um formulário. */
function cleanPastedLine(line: string): string {
  return line.replace(/^\s*(?:[-–—•*·]|\d+[.)])\s+/, "").trim();
}

/** Onde pôr o cursor depois de uma alteração. */
type FocusTarget = { key: string; caret?: "end" } | null;

const groupKey = (id: string) => `g:${id}`;
const itemKey = (id: string, field: "label" | "desc") => `i:${id}:${field}`;

export default function ServicesEditor({
  groups,
  onGroupsChange,
  showDesc = false,
  onSave,
  bilingue = false,
}: ServicesEditorProps) {
  const { toast } = useToast();
  /** «Atalhos de teclado», no topo do editor. Ver `ui/gaveta.ts`. */
  const gaveta = useGaveta();
  // Campos por chave estável, para o foco poder ir para uma linha que ACABOU de
  // nascer (o nó só existe depois do render seguinte).
  const inputs = useRef(new Map<string, CampoDeEscrita>());
  const pendingFocus = useRef<FocusTarget>(null);
  /** Onde estava o cursor quando a última ação começou — para o anular o devolver. */
  const activeKey = useRef<string | null>(null);
  /** Pilha de anulação: fotografias dos grupos ANTES de cada ação estrutural. */
  const undoStack = useRef<{ groups: Groups; focus: FocusTarget }[]>([]);
  /** "Removido — anular", em vez de uma pergunta antes de cada remoção. */
  /** Que grupo tem a gaveta da biblioteca aberta. `null` = nenhuma. */
  const [bibliotecaAberta, setBibliotecaAberta] = useState<number | null>(null);
  /**
   * O que já foi para a biblioteca, pelo NOME do serviço.
   *
   * Pelo nome e não pela posição: as linhas arrastam-se, duplicam-se e
   * removem-se, e uma chave "grupo:linha" fazia o visto saltar para o serviço
   * que ficou naquele lugar — a dizer "já está guardado" sobre uma coisa que
   * não estava.
   *
   * O botão trocar de estado é a única confirmação que há; sem ela, a forma de
   * saber se resultou era ir abrir a biblioteca. Não se limpa sozinho: o que a
   * pergunta merece de resposta é "já lá está", não "esteve".
   */
  const [guardados, setGuardados] = useState<Record<string, "a-guardar" | "guardado">>({});

  /**
   * Manda para a biblioteca uma linha escrita à mão.
   *
   * Só aparece nas linhas COM nome: guardar "" na biblioteca não é um serviço,
   * é uma entrada em branco que alguém vai ter de apagar. A descrição vai
   * junto, porque é metade do serviço; a versão inglesa fica por escrever e o
   * ecrã dos Serviços diz quantas faltam.
   */
  const guardar = useCallback(
    async (label: string, desc: string) => {
      const chave = label.trim().toLowerCase();
      setGuardados((g) => ({ ...g, [chave]: "a-guardar" }));
      const ok = await guardarNaBiblioteca(label.trim(), desc.trim());
      setGuardados((g) => {
        // Falhou: volta ao estado de antes, para o botão poder ser carregado
        // outra vez. Um visto sobre uma gravação que não aconteceu era pior do
        // que não haver visto nenhum.
        if (!ok) return Object.fromEntries(Object.entries(g).filter(([k]) => k !== chave));
        return { ...g, [chave]: "guardado" };
      });
      // ── E A FALHA TEM DE SE DIZER ────────────────────────────────────────
      // Resultar já se vê: o ícone passa a visto, no mesmo botão em que ela
      // carregou, e por isso não há aviso nenhum a acrescentar aí. Falhar é
      // que era mudo — o botão voltava exactamente ao que era antes do clique,
      // que é o mesmo ecrã de quem ainda não carregou em nada. Ela ficava a
      // pensar que o serviço estava na biblioteca; a única forma de descobrir
      // que não estava era ir lá abrir a gaveta.
      if (!ok) {
        toast(
          `«${label.trim()}» não foi para a biblioteca. Tenta outra vez — a linha aqui não se perde.`,
          "error",
        );
      }
    },
    [toast],
  );
  /** O «Anular» da casa (`ui/anular.ts`, 10 s). Era uma barra própria de 5 s,
   *  fixa no canto; passou ao aviso comum para ser igual em todo o lado. */
  const anular = useAnular();
  /** Os grupos de AGORA — o «Anular» corre segundos depois do gesto, e a
   *  fotografia que guarda para o Cmd+Z tem de ser a do momento em que toca. */
  const gruposAgora = useRef(groups);
  useEffect(() => {
    gruposAgora.current = groups;
  });

  // A MESMA função de ref por chave: uma função nova a cada render faria o React
  // desligar e religar todos os campos em cada tecla escrita.
  const refCache = useRef(new Map<string, (el: CampoDeEscrita | null) => void>());
  const register = useCallback((key: string) => {
    let cb = refCache.current.get(key);
    if (!cb) {
      cb = (el: CampoDeEscrita | null) => {
        if (el) inputs.current.set(key, el);
        else inputs.current.delete(key);
      };
      refCache.current.set(key, cb);
    }
    return cb;
  }, []);

  // Depois de cada render: se ficou foco pendente, entrega-o.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const el = inputs.current.get(target.key);
    if (!el) return;
    el.focus();
    if (target.caret === "end") {
      const n = el.value.length;
      try {
        el.setSelectionRange(n, n);
      } catch {
        /* input sem seleção (jsdom/número) — o foco já é o essencial */
      }
    }
  });

  // Rascunhos antigos (e os que vêm do servidor) não têm ids. Preenche-os pela
  // POSIÇÃO — os mesmos que o render já usou como chave, por isso nenhuma linha
  // troca de identidade neste passo.
  useEffect(() => {
    if (withServiceIds(groups) !== groups) onGroupsChange((prev) => withServiceIds(prev));
  }, [groups, onGroupsChange]);

  /** Escrita de texto: sem fotografia (o Ctrl+Z do editor é para a ESTRUTURA;
   *  dentro de um campo o Ctrl+Z do sistema continua a ser o do campo). */
  const edit = useCallback((update: Updater) => onGroupsChange(update), [onGroupsChange]);

  /** Alteração ESTRUTURAL: guarda a fotografia anterior e move o cursor. */
  const commit = useCallback(
    (next: Groups, focus?: FocusTarget) => {
      undoStack.current.push({
        groups,
        focus: activeKey.current ? { key: activeKey.current } : null,
      });
      if (undoStack.current.length > 60) undoStack.current.shift();
      if (focus !== undefined) pendingFocus.current = focus;
      onGroupsChange(() => next);
    },
    [groups, onGroupsChange],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    pendingFocus.current = prev.focus ? { ...prev.focus, caret: "end" } : null;
    onGroupsChange(() => prev.groups);
  }, [onGroupsChange]);

  /**
   * Anuncia uma remoção com o caminho de volta: «Anular» repõe a fotografia
   * DESTA remoção (e não simplesmente o topo da pilha), que é o que o texto do
   * aviso promete — e guarda o estado de agora na pilha, para o Cmd+Z o desfazer.
   */
  const announceRemoval = useCallback(
    (label: string, before: Groups, focus: FocusTarget) => {
      anular(label, () => {
        undoStack.current.push({
          groups: gruposAgora.current,
          focus: activeKey.current ? { key: activeKey.current } : null,
        });
        pendingFocus.current = focus ? { ...focus, caret: "end" } : null;
        onGroupsChange(() => before);
      });
    },
    [anular, onGroupsChange],
  );

  // Chaves de foco com o MESMO id de recurso que o render usa — incluindo o
  // derivado da posição, para um rascunho antigo (ainda sem ids) não ficar com
  // um "g:undefined" à espera de um campo que não existe.
  const gKey = (g: ServiceGroup, i: number) => groupKey(g.id ?? fallbackServiceGroupId(i));
  const iKey = (
    g: ServiceGroup,
    gi: number,
    it: ServiceItem,
    ii: number,
    field: "label" | "desc" = "label",
  ) => itemKey(it.id ?? fallbackServiceItemId(g.id ?? fallbackServiceGroupId(gi), ii), field);

  // ── Grupos ──
  function addGroup() {
    const next = renumber([...groups, emptyGroup(groups.length)]);
    commit(next, { key: gKey(next[next.length - 1], next.length - 1) });
  }

  function updateGroup(gi: number, p: Partial<ServiceGroup>) {
    edit((prev) => prev.map((g, i) => (i === gi ? { ...g, ...p } : g)));
  }

  function removeGroup(gi: number) {
    const before = groups;
    const next = renumber(groups.filter((_, i) => i !== gi));
    const at = next[gi - 1] ? gi - 1 : next[gi] ? gi : -1;
    const focus: FocusTarget = at >= 0 ? { key: gKey(next[at], at), caret: "end" } : null;
    commit(next, focus);
    announceRemoval("Grupo removido", before, { key: gKey(groups[gi], gi) });
  }

  function moveGroup(gi: number, dir: -1 | 1) {
    const to = gi + dir;
    if (to < 0 || to >= groups.length) return;
    commit(renumber(arrayMove(groups, gi, to)), { key: gKey(groups[gi], to), caret: "end" });
  }

  function duplicateGroup(gi: number) {
    const src = groups[gi];
    const copy: ServiceGroup = {
      ...src,
      id: newId(),
      items: src.items.map((it) => ({ ...it, id: newId() })),
    };
    const next = renumber([...groups.slice(0, gi + 1), copy, ...groups.slice(gi + 1)]);
    commit(next, { key: gKey(copy, gi + 1), caret: "end" });
  }

  // ── Linhas ──
  function updateItem(gi: number, ii: number, p: Partial<ServiceItem>) {
    edit((prev) =>
      prev.map((g, i) =>
        i === gi ? { ...g, items: g.items.map((it, j) => (j === ii ? { ...it, ...p } : it)) } : g,
      ),
    );
  }

  /** Insere linhas depois da posição `ii` (−1 = no início) e foca a última. */
  function insertItems(gi: number, ii: number, items: ServiceItem[]) {
    const g = groups[gi];
    const at = ii + 1;
    const nextItems = [...g.items.slice(0, at), ...items, ...g.items.slice(at)];
    const next = groups.map((x, i) => (i === gi ? { ...x, items: nextItems } : x));
    commit(next, {
      key: iKey(g, gi, items[items.length - 1], at + items.length - 1),
      caret: "end",
    });
  }

  function addItem(gi: number) {
    insertItems(gi, groups[gi].items.length - 1, [emptyItem()]);
  }

  function duplicateItem(gi: number, ii: number) {
    insertItems(gi, ii, [{ ...groups[gi].items[ii], id: newId() }]);
  }

  /** Remove a linha. `back` = devolver o cursor ao fim da linha anterior
   *  (Backspace); senão fica na linha que tomou o lugar desta. */
  function removeItem(gi: number, ii: number, back = false) {
    const before = groups;
    const g = groups[gi];
    const nextItems = g.items.filter((_, j) => j !== ii);
    const next = groups.map((x, i) => (i === gi ? { ...x, items: nextItems } : x));
    const at = back ? ii - 1 : nextItems[ii] ? ii : ii - 1;
    const focus: FocusTarget = nextItems[at]
      ? { key: iKey(g, gi, nextItems[at], at), caret: "end" }
      : { key: gKey(g, gi), caret: "end" };
    commit(next, focus);
    if (!back) {
      announceRemoval("Linha removida", before, { key: iKey(g, gi, g.items[ii], ii) });
    }
  }

  function moveItem(gi: number, ii: number, dir: -1 | 1) {
    const g = groups[gi];
    const to = ii + dir;
    if (to < 0 || to >= g.items.length) return;
    const next = groups.map((x, i) => (i === gi ? { ...x, items: arrayMove(x.items, ii, to) } : x));
    commit(next, { key: iKey(g, gi, g.items[ii], to), caret: "end" });
  }

  /** Enter numa linha VAZIA: fecha o grupo e abre o seguinte, cursor no título. */
  function closeGroupAndStartNext(gi: number, ii: number) {
    const g = groups[gi];
    const trimmed = { ...g, items: g.items.filter((_, j) => j !== ii) };
    const fresh = emptyGroup(gi + 1);
    const next = renumber([...groups.slice(0, gi), trimmed, fresh, ...groups.slice(gi + 1)]);
    commit(next, { key: gKey(fresh, gi + 1) });
  }

  /** Colar em lote: cada linha de texto vira uma linha de serviço. */
  function pasteLines(
    gi: number,
    ii: number,
    field: "label" | "desc",
    text: string,
    el: CampoDeEscrita,
  ) {
    const lines = text.split(/\r?\n/).map(cleanPastedLine).filter(Boolean);
    if (lines.length === 0) return;
    const g = groups[gi];
    const item = g.items[ii];
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const merged = `${el.value.slice(0, start)}${lines[0]}${el.value.slice(end)}`;
    const extras = lines.slice(1).map((label) => ({ id: newId(), label, desc: "" }));
    const at = ii + 1;
    const nextItems = [
      ...g.items.slice(0, ii),
      { ...item, [field]: merged },
      ...extras,
      ...g.items.slice(at),
    ];
    const next = groups.map((x, i) => (i === gi ? { ...x, items: nextItems } : x));
    const last = extras[extras.length - 1];
    commit(next, {
      key: last ? iKey(g, gi, last, ii + extras.length) : iKey(g, gi, item, ii, field),
      caret: "end",
    });
  }

  // ── Teclado ──
  /** Atalhos que valem em toda a secção (chegam aqui por borbulhagem). */
  function onSectionKeyDown(e: React.KeyboardEvent) {
    const meta = e.metaKey || e.ctrlKey;
    if (!meta) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onSave?.();
      return;
    }
    if ((e.key === "z" || e.key === "Z") && !e.shiftKey) {
      e.preventDefault();
      undo();
    }
  }

  function onItemKeyDown(
    e: React.KeyboardEvent<CampoDeEscrita>,
    gi: number,
    ii: number,
    field: "label" | "desc",
  ) {
    if (e.metaKey || e.ctrlKey) return; // tratado na secção
    const g = groups[gi];
    const it = g.items[ii];
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveItem(gi, ii, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.altKey) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isBlank(it)) closeGroupAndStartNext(gi, ii);
      else insertItems(gi, ii, [emptyItem()]);
      return;
    }
    if (
      e.key === "Backspace" &&
      e.currentTarget.value === "" &&
      e.currentTarget.selectionStart === 0
    ) {
      // Do campo da descrição, o Backspace volta primeiro ao rótulo.
      if (field === "desc") {
        e.preventDefault();
        focusNow(iKey(g, gi, it, ii));
        return;
      }
      if (!isBlank(it)) return;
      e.preventDefault();
      removeItem(gi, ii, true);
    }
  }

  function onGroupKeyDown(
    e: React.KeyboardEvent<CampoDeEscrita>,
    gi: number,
    field: "letter" | "title",
  ) {
    if (e.metaKey || e.ctrlKey) return;
    const g = groups[gi];
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      moveGroup(gi, e.key === "ArrowUp" ? -1 : 1);
      return;
    }
    if (e.altKey) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Do título entra-se DIRETO na primeira linha do grupo (criando-a se for
      // preciso): é este o passo que se dá a seguir, sempre.
      if (g.items.length === 0) addItem(gi);
      else focusNow(iKey(g, gi, g.items[0], 0));
      return;
    }
    if (
      e.key === "Backspace" &&
      field === "title" &&
      e.currentTarget.value === "" &&
      e.currentTarget.selectionStart === 0 &&
      g.items.length === 0 &&
      groups.length > 1
    ) {
      e.preventDefault();
      removeGroup(gi);
    }
  }

  /** Foco imediato (quando não há alteração de estado pelo meio). */
  function focusNow(key: string) {
    const el = inputs.current.get(key);
    if (!el) return;
    el.focus();
    const n = el.value.length;
    try {
      el.setSelectionRange(n, n);
    } catch {
      /* sem seleção — o foco chega */
    }
  }

  // ── Arrasto ──
  //
  // Rato e toque com sensores SEPARADOS de propósito: com um sensor de ponteiro
  // único, no tablet o gesto de percorrer a página agarrava a linha logo aos
  // 4 px. Assim o rato começa a arrastar aos 4 px e o dedo só depois de segurar.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const groupIds = useMemo(
    () => groups.map((g, gi) => g.id ?? fallbackServiceGroupId(gi)),
    [groups],
  );

  function onGroupDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = groupIds.indexOf(String(active.id));
    const to = groupIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    commit(renumber(arrayMove(groups, from, to)));
  }

  function onItemDragEnd(gi: number, e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const g = groups[gi];
    const ids = g.items.map((it, ii) => it.id ?? fallbackServiceItemId(groupIds[gi], ii));
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    commit(groups.map((x, i) => (i === gi ? { ...x, items: arrayMove(x.items, from, to) } : x)));
  }

  return (
    <div
      onKeyDown={onSectionKeyDown}
      onFocus={(e) => {
        const el = e.target as HTMLElement;
        const key = el.dataset?.fieldKey;
        if (key) activeKey.current = key;
      }}
    >
      {/* ── ATALHOS DE TECLADO NUM APARELHO SEM TECLADO ────────────────────
          Esta linha diz «Enter abre a linha seguinte · Alt+↑/↓ move · Ctrl+Z
          anula». MEDIDO a 375 px: 60 px de altura (três linhas de texto) no
          topo da secção mais escrita da casa, gastos a explicar gestos que ali
          não existem.

          Não se perde nenhuma acção ao escondê-la — todas têm botão:
          «+ Adicionar linha» faz o que o Enter faz, as setas de cada linha
          fazem o que o Alt+↑/↓ faz, e o «Desfazer» do cabeçalho do estúdio faz
          o que o Ctrl+Z faz. É por isso que isto se pode esconder em vez de ter
          de ser substituído.

          ── E A PERGUNTA É SOBRE O PONTEIRO, NÃO SOBRE A LARGURA ──────────
          Era `max-md:hidden`, ou seja «esconde abaixo de 768 px». Mas o que
          torna estes atalhos inúteis não é o ecrã ser estreito — é não haver
          teclas. Um iPad ao alto tem 768 px e não tem Ctrl; um iPad com
          teclado tem os 1024 e TEM. O eixo certo está escrito no
          `ui/adaptativo.ts`: a largura decide o layout, o ponteiro decide os
          alvos. `pointer-coarse:hidden` é o que o resto da casa já usa para
          isto — ver `AjudaGlossario.tsx`, que esconde «ou com a tecla ?» pela
          mesma razão. */}
      {/*
       * ── OS ATALHOS PASSAM PARA TRÁS DE UM «?» ──────────────────────────
       *
       * Palavras dela: «são úteis em desktop, mas não precisam de uma linha
       * permanente». E é verdade das duas maneiras — quem os sabe não precisa
       * de os ler todos os dias, e quem não os sabe lê-os uma vez.
       *
       * `<details>` e não um painel nosso: abre sem JavaScript, o leitor de
       * ecrã já sabe anunciá-lo, e o estado fica onde o navegador o guarda em
       * vez de num estado nosso que ninguém grava.
       *
       * Continua escondido a quem escreve com o dedo, pela razão que já cá
       * estava: sessenta píxeis no topo da secção mais escrita da casa, gastos
       * a explicar gestos que ali não existem.
       */}
      <details className="pointer-coarse:hidden group -mt-2 mb-3" onToggle={gaveta.aoAlternar}>
        <summary
          onClick={gaveta.aoTocarNoResumo}
          className={`marker:content-none inline-flex list-none items-center gap-1.5 text-xs text-foreground/45 hover:text-[var(--bo-tinta-72)] [&::-webkit-details-marker]:hidden ${ESTADO} ${PRESSAO}`}
        >
          <span
            aria-hidden
            className="grid h-4 w-4 place-items-center rounded-full border border-foreground/20 text-[10px] leading-none"
          >
            ?
          </span>
          Atalhos de teclado
        </summary>
        {/* Quatro atalhos num parágrafo só: UM bloco, uma entrada. Não há
            escada nenhuma a fazer aqui — a escada da casa é por bloco, e isto
            é uma frase. */}
        <p className={`mt-2 text-xs leading-relaxed text-foreground/50 ${gaveta.corpo}`}>
          <strong className="font-semibold text-[var(--bo-tinta-72)]">Enter</strong> abre a linha
          seguinte ·{" "}
          <strong className="font-semibold text-[var(--bo-tinta-72)]">
            Enter numa linha vazia
          </strong>{" "}
          abre um grupo novo ·{" "}
          <strong className="font-semibold text-[var(--bo-tinta-72)]">Alt+↑/↓</strong> move ·{" "}
          <strong className="font-semibold text-[var(--bo-tinta-72)]">Ctrl+Z</strong> anula. Colar
          várias linhas cria uma linha por cada.
        </p>
      </details>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={onGroupDragEnd}
      >
        <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {groups.map((g, gi) => {
              const gid = groupIds[gi];
              const itemIds = g.items.map((it, ii) => it.id ?? fallbackServiceItemId(gid, ii));
              return (
                <SortableRow
                  key={gid}
                  id={gid}
                  // Fase 4 do redesenho: cada grupo é um CARTÃO — o título
                  // grande em cima e as linhas por baixo, separadas por um
                  // traço. Antes, título e linhas tinham o mesmo corpo de
                  // letra e o grupo lia-se como mais uma linha da lista.
                  className="rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-3"
                >
                  {({ handleProps }) => (
                    <>
                      {/* `flex-wrap`: a 375 px (o iPhone SE) os campos crescem
                          para os 44 px de altura e 16 px de letra que o dedo
                          pede, e esta fila deixava de caber — o título ficava
                          espremido e as ações saíam da margem. A quebrar,
                          descem para a linha de baixo inteiras. */}
                      <div className="group/row flex flex-wrap items-center gap-1">
                        <DragHandle {...handleProps} label={`Arrastar grupo ${gi + 1}`} />
                        <input
                          {...fieldProps(groupKey(gid) + ":letter")}
                          ref={register(groupKey(gid) + ":letter")}
                          className={`${ROW_INPUT} w-12 shrink-0`}
                          value={g.letter ?? ""}
                          onChange={(e) => updateGroup(gi, { letter: e.target.value })}
                          onKeyDown={(e) => onGroupKeyDown(e, gi, "letter")}
                          placeholder={autoLetter(gi)}
                          title="Numera-se sozinho (a, b, c…); escreve por cima para fixar outra letra"
                          aria-label={`Marcador do grupo ${gi + 1} — numera-se sozinho`}
                        />
                        <CampoQueCresce
                          {...fieldProps(groupKey(gid))}
                          aoEscrever={register(groupKey(gid))}
                          className={`${ROW_INPUT} min-w-[12rem] flex-1 resize-none !text-sm font-semibold`}
                          valor={g.title}
                          onChange={(e) => updateGroup(gi, { title: e.target.value })}
                          // A pega do aviso de ortografia — ver `chaveDoCampo`.
                          data-campo={`grupoTitulo:${gi}`}
                          onKeyDown={(e) => onGroupKeyDown(e, gi, "title")}
                          // Uma INSTRUÇÃO e não um exemplo. A 14/10 ela mandou a
                          // captura de um «b)» com «Decoração Floral de
                          // Casamento» a cinzento: lia-se como um título já
                          // escrito, o campo estava vazio, e o grupo não saía.
                          placeholder={PEDE_O_TITULO}
                          aria-label={`Título do grupo ${gi + 1}`}
                        />
                        {/* A caixa inglesa AO LADO quando a fila tem largura
                            para as duas, por baixo quando não tem — sem ponto
                            de corte nenhum; ver `aoLado`, em `CaixaInglesa`.
                            Escreve-se em `titleEn`,
                            que viaja colado ao grupo — incluindo quando o grupo
                            é guardado como MODELO, isolado do documento. */}
                        {bilingue && (
                          <CaixaInglesa
                            aoLado
                            campo={{ tipo: "grupoTitulo", gi }}
                            rotulo={`Título do grupo ${gi + 1}`}
                            valor={g.titleEn ?? ""}
                            onChange={(texto) => updateGroup(gi, { titleEn: texto })}
                            porTraduzir={!!g.title.trim() && !(g.titleEn ?? "").trim()}
                            as="textarea"
                            cresce
                            className={`${ROW_INPUT} min-w-[12rem] flex-1 resize-none !text-sm font-semibold`}
                            placeholder="Wedding Floral Design"
                          />
                        )}
                        <div className={ROW_ACTIONS}>
                          <MoveBtns
                            onUp={() => moveGroup(gi, -1)}
                            onDown={() => moveGroup(gi, 1)}
                            disUp={gi === 0}
                            disDown={gi === groups.length - 1}
                            what="grupo"
                          />
                          <IconBtn
                            label={`Duplicar grupo ${gi + 1}`}
                            onClick={() => duplicateGroup(gi)}
                          >
                            <CopyIcon />
                          </IconBtn>
                          <IconBtn
                            label={`Remover grupo ${gi + 1}`}
                            onClick={() => removeGroup(gi)}
                            danger
                          >
                            <TrashIcon />
                          </IconBtn>
                        </div>
                      </div>

                      {grupoVazio(g) && (
                        <p
                          data-testid={`grupo-vazio-${gi}`}
                          className="mt-1 pl-4 text-xs leading-snug text-[var(--bo-text-muted)]"
                        >
                          Ainda sem título — o grupo {g.letter || autoLetter(gi)} só entra na
                          proposta quando tiver um título (chega o título, sem linhas).
                        </p>
                      )}

                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                        onDragEnd={(e) => onItemDragEnd(gi, e)}
                      >
                        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                          <div className="mt-2 flex flex-col gap-1 border-t border-[var(--bo-hairline)] pt-2 pl-4">
                            {g.items.map((it, ii) => {
                              const iid = itemIds[ii];
                              return (
                                <SortableRow
                                  key={iid}
                                  id={iid}
                                  // `flex-wrap`, SEMPRE — não só na proposta
                                  // bilingue.
                                  //
                                  // MEDIDO a 375 px (iPhone SE), numa linha com
                                  // as cinco ações visíveis (mover×2, duplicar,
                                  // guardar na biblioteca, remover): os cinco
                                  // botões de 44 px (o mínimo táctil, ver
                                  // `.alvo-toque` em `globals.css`) somam 228 px
                                  // — mais os 4 px dos `gap-1` entre eles — numa
                                  // linha de 263 px. Sobravam 27 px para o nome
                                  // do serviço: uma letra, «D» de «Decoração…».
                                  // Sem preencher, com só quatro botões (sem o
                                  // de guardar), sobravam 73 — na mesma, menos
                                  // de um carácter por toque.
                                  //
                                  // Era `nowrap` fora da proposta bilingue "para
                                  // a linha continuar a ser a de sempre" — mas a
                                  // "de sempre" já não cabia: o `.alvo-toque`
                                  // que dá 44 px aos ícones no dedo (correcto,
                                  // é o mínimo da HIG) cresceu por baixo deste
                                  // comentário sem ele ser revisto. O grupo, ao
                                  // lado, já tinha a mesma quebra por a mesma
                                  // razão (ver o comentário no título do
                                  // grupo) — falta só aplicar aqui o que ali já
                                  // estava certo.
                                  className="group/row flex flex-wrap items-center gap-1 rounded-md px-0.5 py-0.5 hover:bg-[var(--bo-tinta-3)] focus-within:bg-[var(--bo-tinta-3)]"
                                >
                                  {({ handleProps }) => (
                                    <>
                                      <DragHandle
                                        {...handleProps}
                                        label={`Arrastar linha ${ii + 1} do grupo ${gi + 1}`}
                                      />
                                      <CampoQueCresce
                                        {...fieldProps(itemKey(iid, "label"))}
                                        aoEscrever={register(itemKey(iid, "label"))}
                                        // `min-w-[8rem]`: sem mínimo, o `flex-1`
                                        // sozinho não bastava para EMPURRAR as
                                        // ações para a linha de baixo — um
                                        // `<input>` sem `size` tem uma largura
                                        // "preferida" pequena, e o cálculo de
                                        // quebra do flexbox usa-a. Com o mínimo,
                                        // as ações deixam de caber ao lado do
                                        // nome e descem, inteiras, para a
                                        // segunda linha — como já acontecia no
                                        // título do grupo, aqui ao lado.
                                        className={`${ROW_INPUT} min-w-[8rem] flex-1 resize-none`}
                                        valor={it.label}
                                        onChange={(e) =>
                                          updateItem(gi, ii, { label: e.target.value })
                                        }
                                        data-campo={`itemRotulo:${gi}:${ii}`}
                                        onKeyDown={(e) => onItemKeyDown(e, gi, ii, "label")}
                                        onPaste={(e) => {
                                          const text = e.clipboardData.getData("text/plain");
                                          if (!/[\r\n]/.test(text)) return;
                                          e.preventDefault();
                                          pasteLines(gi, ii, "label", text, e.currentTarget);
                                        }}
                                        placeholder={PEDE_A_LINHA}
                                        aria-label={`Linha ${ii + 1} do grupo ${gi + 1}`}
                                      />
                                      {bilingue && (
                                        <CaixaInglesa
                                          aoLado
                                          campo={{ tipo: "itemRotulo", gi, ii }}
                                          rotulo={`Linha ${ii + 1} do grupo ${gi + 1}`}
                                          valor={it.labelEn ?? ""}
                                          onChange={(texto) =>
                                            updateItem(gi, ii, { labelEn: texto })
                                          }
                                          porTraduzir={
                                            !!it.label.trim() && !(it.labelEn ?? "").trim()
                                          }
                                          as="textarea"
                                          cresce
                                          className={`${ROW_INPUT} flex-1 resize-none`}
                                          placeholder="Ceremony Decor"
                                        />
                                      )}
                                      {showDesc && (
                                        <CampoQueCresce
                                          {...fieldProps(itemKey(iid, "desc"))}
                                          aoEscrever={register(itemKey(iid, "desc"))}
                                          /* ── DUAS CAIXAS A DIVIDIR 259 px ─────────────────
                                             MEDIDO a 375 px, template Organização (o que tem
                                             descrição), numa linha a sério: o nome do serviço
                                             ficava com 128 px e a descrição com 127, lado a
                                             lado. A 16 px de letra são catorze caracteres —
                                             «Arco floral de» de um nome de 49. A 320 px a
                                             descrição ficava com 72: oito caracteres. Escrever
                                             ali é escrever por uma frincha, e é O ECRÃ MAIS
                                             ESCRITO DA CASA.

                                             `max-sm:min-w-full` põe a descrição sozinha na
                                             linha de baixo — 259 px cada uma, o dobro. É a
                                             mesma manobra que a caixa inglesa aqui ao lado já
                                             faz com o `basis-full`, e é `max-sm:` de propósito:
                                             acima de 640 px, onde ela trabalha a sério, não há
                                             uma única propriedade nova a aplicar-se (medido a
                                             640, 768 e 1280: 132, 196 e 200 px, iguais aos de
                                             antes ao pixel). */
                                          className={`${ROW_INPUT} max-sm:min-w-full flex-1 resize-none`}
                                          valor={it.desc ?? ""}
                                          onChange={(e) =>
                                            updateItem(gi, ii, { desc: e.target.value })
                                          }
                                          data-campo={`itemDesc:${gi}:${ii}`}
                                          onKeyDown={(e) => onItemKeyDown(e, gi, ii, "desc")}
                                          onPaste={(e) => {
                                            const text = e.clipboardData.getData("text/plain");
                                            if (!/[\r\n]/.test(text)) return;
                                            e.preventDefault();
                                            pasteLines(gi, ii, "desc", text, e.currentTarget);
                                          }}
                                          placeholder="Descrição"
                                          aria-label={`Descrição da linha ${ii + 1} do grupo ${gi + 1}`}
                                        />
                                      )}
                                      {showDesc && bilingue && (
                                        <CaixaInglesa
                                          aoLado
                                          campo={{ tipo: "itemDesc", gi, ii }}
                                          rotulo={`Descrição da linha ${ii + 1} do grupo ${gi + 1}`}
                                          valor={it.descEn ?? ""}
                                          onChange={(texto) =>
                                            updateItem(gi, ii, { descEn: texto })
                                          }
                                          porTraduzir={
                                            !!(it.desc ?? "").trim() && !(it.descEn ?? "").trim()
                                          }
                                          as="textarea"
                                          cresce
                                          className={`${ROW_INPUT} flex-1 resize-none`}
                                        />
                                      )}
                                      <div className={ROW_ACTIONS}>
                                        <MoveBtns
                                          onUp={() => moveItem(gi, ii, -1)}
                                          onDown={() => moveItem(gi, ii, 1)}
                                          disUp={ii === 0}
                                          disDown={ii === g.items.length - 1}
                                          what="linha"
                                        />
                                        <IconBtn
                                          label={`Duplicar linha ${ii + 1} do grupo ${gi + 1}`}
                                          onClick={() => duplicateItem(gi, ii)}
                                        >
                                          <CopyIcon />
                                        </IconBtn>
                                        {/* PARA A BIBLIOTECA.
                                            Um serviço bem escrito à mão é
                                            trabalho que se repete na proposta
                                            seguinte — e hoje repetia-se a
                                            escrever outra vez. Só aparece com
                                            nome, e depois de guardado fica a
                                            dizê-lo em vez de convidar a
                                            carregar de novo. */}
                                        {it.label.trim() && (
                                          <IconBtn
                                            label={
                                              guardados[it.label.trim().toLowerCase()] ===
                                              "guardado"
                                                ? `«${it.label.trim()}» está na biblioteca`
                                                : `Guardar «${it.label.trim()}» na biblioteca`
                                            }
                                            disabled={!!guardados[it.label.trim().toLowerCase()]}
                                            onClick={() => void guardar(it.label, it.desc ?? "")}
                                          >
                                            {guardados[it.label.trim().toLowerCase()] ===
                                            "guardado" ? (
                                              <CheckIcon />
                                            ) : (
                                              <SaveIcon />
                                            )}
                                          </IconBtn>
                                        )}
                                        <IconBtn
                                          label={`Remover linha ${ii + 1} do grupo ${gi + 1}`}
                                          onClick={() => removeItem(gi, ii)}
                                          danger
                                        >
                                          <TrashIcon />
                                        </IconBtn>
                                      </div>
                                    </>
                                  )}
                                </SortableRow>
                              );
                            })}
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                className={`${ADD_BTN} self-start pl-0.5`}
                                onClick={() => addItem(gi)}
                              >
                                + Adicionar linha
                              </button>
                              {/* A biblioteca ao lado do escrever à mão, e não
                                  em vez dele: escrever continua a ser o caminho
                                  mais curto para o que ainda não existe. */}
                              <button
                                type="button"
                                className={`${ADD_BTN} self-start`}
                                aria-expanded={bibliotecaAberta === gi}
                                onClick={() => setBibliotecaAberta((a) => (a === gi ? null : gi))}
                              >
                                ⌕ Da biblioteca
                              </button>
                            </div>
                            {bibliotecaAberta === gi && (
                              <BibliotecaServicos
                                onFechar={() => setBibliotecaAberta(null)}
                                onEscolher={(s) => {
                                  onGroupsChange((prev) =>
                                    prev.map((g, j) =>
                                      j === gi
                                        ? {
                                            ...g,
                                            items: [
                                              ...g.items,
                                              { label: s.nome, desc: s.descricao || undefined },
                                            ],
                                          }
                                        : g,
                                    ),
                                  );
                                  setBibliotecaAberta(null);
                                }}
                              />
                            )}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </>
                  )}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button type="button" className={`${ADD_BTN} mt-3`} onClick={addGroup}>
        + Adicionar grupo de serviços
      </button>
    </div>
  );
}

/** Marca o campo para o «anular» saber onde o cursor estava. */
function fieldProps(key: string) {
  return { "data-field-key": key } as const;
}

/**
 * Uma linha (grupo ou item) arrastável. O conteúdo recebe as propriedades da
 * PEGA — só ela arrasta, para o rato continuar a poder selecionar texto dentro
 * dos campos.
 */
function SortableRow({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (api: {
    handleProps: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      ref: (el: HTMLElement | null) => void;
    };
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${className ?? ""} ${
        isDragging
          ? "relative z-10 bg-[var(--bo-surface)] opacity-95 shadow-[var(--bo-sombra-suspensa)] ring-2 ring-sage-600"
          : ""
      }`}
    >
      {children({
        handleProps: {
          ...attributes,
          ...listeners,
          ref: setActivatorNodeRef,
        } as React.ButtonHTMLAttributes<HTMLButtonElement> & {
          ref: (el: HTMLElement | null) => void;
        },
      })}
    </div>
  );
}

function DragHandle({
  label,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  ref?: (el: HTMLElement | null) => void;
}) {
  return (
    // A PEGA DE ARRASTO NÃO EXISTE EM ECRÃ TÁCTIL, e isso é a correcção.
    //
    // Media 16×24 — com o dedo, agarrar uma linha era acertar num alvo mais
    // estreito do que a própria unha. A tentativa óbvia (pôr-lhe `alvo-toque`)
    // trocou o defeito por um pior: numa linha de 375 px já vivem seis botões
    // de 44 px, e a pega a crescer espremeu o CAMPO DE ESCREVER para 25 px.
    // O guarda de ergonomia apanhou os dois, um de cada vez.
    //
    // Em telemóvel a pega é redundante: reordenar faz-se com as setas, que
    // estão ali ao lado, já têm 44 px e respondem a um toque simples. A pega
    // exige um toque MANTIDO de 180 ms (é o sensor de toque do dnd-kit) — é o
    // caminho mais difícil dos três, e era o que estava a roubar a largura ao
    // único sítio da linha onde se escreve. Com rato, onde o arrasto é o gesto
    // natural e não há dedo para acomodar, fica exactamente como estava.
    <button
      type="button"
      {...rest}
      aria-label={`${label} (ou usa as setas)`}
      title="Arrastar para reordenar"
      className={`[@media(pointer:coarse)]:hidden inline-flex h-6 w-4 shrink-0 cursor-grab touch-none items-center justify-center rounded text-foreground/45 opacity-0 hover:text-[var(--bo-text)] focus-visible:opacity-100 active:cursor-grabbing group-hover/row:opacity-100 group-focus-within/row:opacity-100 [@media(hover:none)]:opacity-100 ${ESTADO} ${PRESSAO}`}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        ⠿
      </span>
    </button>
  );
}

function IconBtn({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${ICON_BTN} ${danger ? "hover:text-[var(--bo-perigo)]" : ""}`}
    >
      {children}
    </button>
  );
}

/**
 * Setas de reordenar — o caminho acessível para o mesmo que o arrasto faz.
 *
 * Cinzento LEGÍVEL (estavam a `text-foreground/35` e liam-se como desativadas)
 * e um hover que se vê.
 */
export function MoveBtns({
  onUp,
  onDown,
  disUp,
  disDown,
  what = "item",
}: {
  onUp: () => void;
  onDown: () => void;
  disUp: boolean;
  disDown: boolean;
  /** O que se move, para o aria-label ("grupo", "linha", "mood board"…). */
  what?: string;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <button
        type="button"
        className={`${ICON_BTN} text-xs leading-none`}
        onClick={onUp}
        disabled={disUp}
        aria-label={`Mover ${what} para cima`}
        title={`Mover ${what} para cima (Alt+↑)`}
      >
        ↑
      </button>
      <button
        type="button"
        className={`${ICON_BTN} text-xs leading-none`}
        onClick={onDown}
        disabled={disDown}
        aria-label={`Mover ${what} para baixo`}
        title={`Mover ${what} para baixo (Alt+↓)`}
      >
        ↓
      </button>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="1.5" y="1.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 12.5h6a2 2 0 0 0 2-2v-6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Guardar na biblioteca — uma prateleira com uma seta para dentro. */
function SaveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M7 1.5v6.5M4.5 5.8 7 8.3l2.5-2.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2 10.2v1.3a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Já lá está. */
function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7.5 5.5 10.5 11.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h9M5.5 3.5V2.2h3v1.3M3.6 3.5l.5 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
