"use client";

import { casaComAProcura } from "@/lib/procura";
import { useMemo, useState, useDeferredValue, type ReactNode } from "react";
import type { PropItem } from "@/lib/inventory-types";
import { PROP_CATEGORIES } from "@/lib/inventory-types";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { downloadCsv, dateStamp } from "./exportar-em-csv";
import {
  Button,
  Card,
  EmptyState,
  Escolha,
  Field,
  MenuDeAccoes,
  PerguntaDestrutiva,
  TabelaOuCartoes,
  Toolbar,
  cn,
  type AccaoDeItem,
} from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import ModoDeCarga from "./ModoDeCarga";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { unidadeNaContagem } from "@/lib/unidade-na-contagem";

/* Os dois ícones da linha, escritos uma vez: servem os botões soltos da tabela
   do computador e os itens do menu «⋯» de quem não tem rato. */
const LapisIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" />
  </svg>
);

const CruzIcon = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PERGUNTA DE REMOVER — porque é que deixou de ser um `confirm()`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava aqui era `confirm('Remover o item "X"? Esta ação não pode ser
 * anulada.')`, e tinha três defeitos, por esta ordem de gravidade:
 *
 *   1. «Esta ação não pode ser anulada» não diz o que se perde. Diz que é
 *      grave, que é a única coisa que quem carregou no botão já sabia.
 *   2. A caixa do browser não cabe num telemóvel de 375 px sem cortar a frase,
 *      não se traduz e não tem nada do desenho da casa — e este inventário
 *      usa-se no armazém, no telemóvel.
 *   3. `confirm()` bloqueia o fio principal do browser. Numa aba com gravações
 *      automáticas a decorrer, é a pior altura para congelar tudo.
 *
 * Fica uma pergunta que NOMEIA o adereço e diz o tamanho do que sai do
 * inventário — a quantidade e onde estava. Remover um adereço é raro e é caro
 * (o registo não volta, e nem sequer é o adereço que desaparece: é o
 * conhecimento de que ele existe e de onde está), portanto leva pergunta e não
 * janela para anular.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Remover do inventário», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

type Condition = PropItem["condition"];

const CONDITIONS: Condition[] = ["novo", "bom", "usado", "danificado"];

const CONDITION_LABEL: Record<Condition, string> = {
  novo: "Novo",
  bom: "Bom",
  usado: "Usado",
  danificado: "Danificado",
};

// Moss-forward chip palette, matching the back-office accent language.
const CONDITION_CHIP: Record<Condition, { bg: string; text: string }> = {
  novo: { bg: "#e7efe4", text: "#3a5c39" },
  bom: { bg: "#eef1e6", text: "#525a2f" },
  usado: { bg: "#f6efe1", text: "#84692d" }, // 4,26:1 → 4,55:1 sobre #f6efe1
  danificado: { bg: "#f6e6df", text: "#8a2a22" },
};

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

interface FormState {
  name: string;
  category: string;
  quantity: string;
  unit: string;
  condition: Condition;
  location: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  category: PROP_CATEGORIES[0],
  quantity: "1",
  unit: "",
  condition: "bom",
  location: "",
  notes: "",
};

function fromItem(i: PropItem): FormState {
  return {
    name: i.name,
    category: i.category,
    quantity: String(i.quantity),
    unit: i.unit ?? "",
    condition: i.condition,
    location: i.location ?? "",
    notes: i.notes ?? "",
  };
}

function toPayload(f: FormState) {
  return {
    name: f.name.trim(),
    category: f.category,
    quantity: Math.max(0, Math.floor(Number(f.quantity) || 0)),
    unit: f.unit.trim(),
    condition: f.condition,
    location: f.location.trim(),
    notes: f.notes.trim(),
  };
}

function ConditionChip({ condition }: { condition: Condition }) {
  const c = CONDITION_CHIP[condition];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {CONDITION_LABEL[condition]}
    </span>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CINCO CAMPOS DA EDIÇÃO EM LINHA — ESCRITOS UMA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estavam escritos DUAS vezes: uma na linha da tabela, outra no cartão do
 * telemóvel, as duas montadas ao mesmo tempo (`md:hidden` / `hidden md:block`)
 * e as duas ligadas ao mesmo `editForm`. Dois `<input aria-label="Quantidade">`
 * vivos para a mesma quantidade — um invisível, mas presente para o leitor de
 * ecrã, para o `Tab` e para os testes, que tinham de escrever
 * `getAllByLabelText("Quantidade")[0]` para escolher um deles.
 *
 * O que muda entre as duas formas é só a MEDIDA (a tabela tem colunas, o cartão
 * empilha), e a medida entra por `className`. O rótulo, o tipo e o que cada
 * campo escreve ficam aqui, num sítio, onde não podem divergir.
 */
/**
 * ── A LARGURA VAI PARA A CAIXA, O RESTO PARA O CONTROLO ─────────────────────
 *
 * Estes campos recebem de quem os chama uma cadeia que MISTURA as duas coisas
 * («w-full px-2.5 py-1.5», «flex-1 px-2.5 py-2»). Enquanto foram `<select>` isso
 * não fazia diferença — era tudo o mesmo elemento. Agora o campo de escolher é
 * um controlo dentro de uma caixa, e a seta é desenhada por cima da CAIXA: se a
 * largura ficasse só no controlo, um `w-20` numa célula de tabela deixava a seta
 * a flutuar à direita, longe do campo a que pertence.
 *
 * Separar é uma regra de duas linhas e não vale um componente novo; o que vale
 * é estar escrito porquê.
 */
const LARGURA = /^(w-|min-w-|max-w-|flex-1$|flex-\[|basis-|sm:w-|lg:w-)/;
const larguraDe = (c?: string) =>
  (c ?? "")
    .split(/\s+/)
    .filter((x) => LARGURA.test(x))
    .join(" ");
const restoDe = (c?: string) =>
  (c ?? "")
    .split(/\s+/)
    .filter((x) => x && !LARGURA.test(x))
    .join(" ");

interface CampoDeEdicao {
  f: FormState;
  set: (f: FormState) => void;
  className?: string;
}

function CampoNome({ f, set, className }: CampoDeEdicao) {
  return (
    <input
      value={f.name}
      onChange={(e) => set({ ...f, name: e.target.value })}
      placeholder="Nome *"
      aria-label="Nome"
      className={cn("bo-input text-sm text-[var(--bo-text)]", className)}
    />
  );
}

function CampoCategoria({ f, set, className }: CampoDeEdicao) {
  return (
    <Escolha
      valor={f.category}
      aoMudar={(v) => set({ ...f, category: v })}
      aria-label="Categoria"
      /* A largura vai na CAIXA e o resto no controlo: a seta é desenhada por
         cima da caixa, e um controlo mais estreito do que ela deixava-a a
         flutuar ao lado do campo. Ver `containerClassName` no `Escolha`. */
      containerClassName={larguraDe(className)}
      className={cn("text-sm text-[var(--bo-tinta-72)]", restoDe(className))}
    >
      {PROP_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Escolha>
  );
}

function CampoQuantidade({ f, set, className }: CampoDeEdicao) {
  return (
    <input
      type="number"
      min={0}
      value={f.quantity}
      onChange={(e) => set({ ...f, quantity: e.target.value })}
      aria-label="Quantidade"
      className={cn("bo-input text-sm text-[var(--bo-text)]", className)}
    />
  );
}

function CampoEstado({ f, set, className }: CampoDeEdicao) {
  return (
    <Escolha
      valor={f.condition}
      aoMudar={(v) => set({ ...f, condition: v as Condition })}
      aria-label="Estado"
      containerClassName={larguraDe(className)}
      className={cn("text-sm text-[var(--bo-tinta-72)]", restoDe(className))}
    >
      {CONDITIONS.map((c) => (
        <option key={c} value={c}>
          {CONDITION_LABEL[c]}
        </option>
      ))}
    </Escolha>
  );
}

function CampoLocalizacao({ f, set, className }: CampoDeEdicao) {
  return (
    <input
      value={f.location}
      onChange={(e) => set({ ...f, location: e.target.value })}
      placeholder="Localização"
      aria-label="Localização"
      className={cn("bo-input text-sm text-[var(--bo-text)]", className)}
    />
  );
}

export default function Inventario() {
  const { toast } = useToast();
  const anular = useAnular();
  const depoisDeApagar = useDepoisDeApagar();
  const {
    data: items = [],
    setData: setItems,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<PropItem[]>("inventario", "/api/inventario");
  const [search, setSearch] = useState("");
  // Defer so filtering + row reconcile runs off the keystroke; input stays instant.
  const dSearch = useDeferredValue(search);
  const [cat, setCat] = useState("Todas");
  const [cond, setCond] = useState<"Todos" | Condition>("Todos");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  // A repartição por categoria é detalhe — o total é o que importa ao relance.
  const [showCatTotals, setShowCatTotals] = useState(false);
  // O inventário tem DUAS tarefas, e não é a mesma com letra maior: aqui
  // gere-se (editar, corrigir, exportar), no modo de carga percorre-se e
  // risca-se. Ver ModoDeCarga.
  const [aCarregar, setACarregar] = useState(false);
  /** A pergunta em curso — ver o comentário no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * As três escritas deste ecrã tinham seis frases entre elas — «Não foi
   * possível guardar o item.», «Erro de ligação ao guardar.», «Não foi
   * possível remover o item.» e companhia — e nenhuma distinguia a rede em
   * baixo da sessão expirada, do item que outra pessoa já apagou, do valor que
   * o servidor recusou. Quem lê carrega outra vez, e com a sessão caduca isso
   * não pode funcionar.
   *
   * Um sítio só a fazer fetch, a verificar o `ok` e a escolher a frase — o
   * mesmo padrão do `MaterialListas`. Devolve o corpo porque o item criado e o
   * item actualizado vêm de lá, e devolve `ok` em vez de atirar, porque quem
   * chama tem de poder repor o ecrã.
   */
  async function gravar(
    oQue: string,
    url: string,
    init?: RequestInit,
  ): Promise<{ ok: boolean; corpo: unknown }> {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      toast(porqueRebentou(oQue).mensagem, "error");
      return { ok: false, corpo: null };
    }
    const corpo = await res.json().catch(() => null);
    if (!res.ok) {
      toast(porqueFalhou(oQue, res, corpo).mensagem, "error");
      return { ok: false, corpo };
    }
    return { ok: true, corpo };
  }

  /**
   * Gravou-se, mas o que voltou não tem a forma de um item.
   *
   * Antes entrava na lista à mesma (`await res.json()` sem olhar) e a linha
   * seguinte a desenhar `i.name` atirava — com o inventário dentro do back
   * office, a excepção levava-o todo. Uma resposta 200 sem corpo de item
   * acontece com um proxy pelo meio a devolver HTML.
   */
  const pareceItem = (c: unknown): c is PropItem =>
    !!c && typeof (c as PropItem).id === "string" && typeof (c as PropItem).name === "string";

  const AVISO_SEM_RELEITURA = "Gravado, mas não deu para reler o inventário. Atualiza a página.";

  async function add() {
    const payload = toPayload(form);
    if (!payload.name) return;
    setSaving(true);
    const { ok, corpo } = await gravar(
      `adicionar «${payload.name}» ao inventário`,
      "/api/inventario",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    if (!ok) return;
    if (!pareceItem(corpo)) {
      toast(AVISO_SEM_RELEITURA, "error");
      return;
    }
    setItems((prev) => [...prev, corpo].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(EMPTY_FORM);
    setAdding(false);
    // Anula-se apagando o que se criou.
    const criado = corpo;
    anular(`«${criado.name}» adicionado ao inventário.`, async () => {
      setItems((prev) => prev.filter((i) => i.id !== criado.id));
      const { ok: tirou } = await gravar(
        `tirar «${criado.name}» do inventário`,
        `/api/inventario/${criado.id}`,
        { method: "DELETE" },
      );
      if (!tirou) {
        setItems((prev) =>
          prev.some((i) => i.id === criado.id)
            ? prev
            : [...prev, criado].sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      return tirou;
    });
  }

  async function saveEdit(id: string) {
    const payload = toPayload(editForm);
    if (!payload.name) return;
    setSaving(true);
    /**
     * ════════════════════════════════════════════════════════════════════════
     * SE O SERVIDOR RECUSA, O ECRÃ TEM DE VOLTAR ATRÁS
     * ════════════════════════════════════════════════════════════════════════
     *
     * A escrita optimista é a certa — o ecrã responde já e a lista não pisca.
     * O que faltava era a outra metade: quando o servidor recusava, mostrava-se
     * a mensagem e ficava por ali, com os valores novos na lista. E o `setItems`
     * do `useCachedList` escreve através para a cache, por isso sair do
     * inventário e voltar mostrava-os de novo — agora sozinhos, sem nenhuma
     * mensagem por perto que lhes tirasse a razão.
     *
     * Ela corrige "4" para "40" arcos, o servidor recusa, a mensagem passa, e o
     * ecrã continua a dizer 40. Na véspera carrega-se a carrinha por um número
     * que nunca existiu na base de dados.
     *
     * Repõe-se SÓ esta linha, e sobre o que a lista tiver AGORA: guardar a
     * lista inteira antes do pedido era guardar um instante que já passou, e
     * com duas gravações no ar a que falhasse desfazia também a que passou.
     */
    const anterior = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...payload } : i)));
    const { ok, corpo } = await gravar(
      `guardar as alterações a «${payload.name}»`,
      `/api/inventario/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    if (!ok) {
      // A edição fica ABERTA de propósito: o que ela escreveu não se perde, e
      // o campo por onde recomeçar é o mesmo em que estava.
      if (anterior) setItems((prev) => prev.map((i) => (i.id === id ? anterior : i)));
      return;
    }
    if (!pareceItem(corpo)) {
      toast(AVISO_SEM_RELEITURA, "error");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? corpo : i)).sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingId(null);
    if (!anterior) {
      toast("Alterações guardadas.", "success");
      return;
    }
    // O «Anular» grava o item como estava, pelo mesmo PATCH.
    anular(`«${payload.name}» guardado.`, async () => {
      const { ok: voltou, corpo: reposto } = await gravar(
        `repor «${anterior.name}» como estava`,
        `/api/inventario/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(fromItem(anterior))),
        },
      );
      if (voltou && pareceItem(reposto)) {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? reposto : i)).sort((a, b) => a.name.localeCompare(b.name)),
        );
      }
      return voltou;
    });
  }

  /** A pergunta, com a quantidade e o sítio lá dentro. Ver o topo do ficheiro. */
  function perguntarSeRemove(i: PropItem) {
    const unidade = i.unit?.trim() || "un.";
    setAPerguntar({
      titulo: `Remover «${i.name}» do inventário?`,
      oQueSePerde: [
        `${i.quantity} ${unidade} registadas${i.location ? ` em ${i.location}` : ""}`,
        "a linha sai da lista, do modo de carga e das exportações",
      ],
      aviso: "Fica 30 dias na Reciclagem, de onde se repõe tal e qual.",
      rotulo: "Remover do inventário",
      fazer: () => remove(i.id),
    });
  }

  async function remove(id: string) {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    const { ok, corpo } = await gravar(
      `remover «${it?.name ?? "o item"}» do inventário`,
      `/api/inventario/${id}`,
      { method: "DELETE" },
    );
    if (!ok) {
      // Repõe-se SÓ esta linha, e só se ela não estiver já na lista. Guardar a
      // lista inteira antes do pedido — como se fazia — era guardar um instante
      // que já passou: dois «Remover» confirmados de seguida põem duas chamadas
      // no ar, e a que falhasse ressuscitava no ecrã a que o servidor tinha
      // mesmo apagado. E o `setItems` escreve através para a cache, portanto a
      // linha fantasma ficava lá até alguém recarregar.
      setItems((prev) =>
        prev.some((x) => x.id === id)
          ? prev
          : [...prev, it].sort((a, b) => a.name.localeCompare(b.name)),
      );
      return;
    }
    // Foi para a Reciclagem: o aviso traz «Anular», que o repõe tal e qual.
    depoisDeApagar(corpo, `«${it.name}» removido.`, () => void refresh());
  }

  function startEdit(i: PropItem) {
    setEditingId(i.id);
    setEditForm(fromItem(i));
  }

  /**
   * As acções de uma linha, como DADOS — a forma é de quem as desenha.
   *
   * Estão aqui para que os dois ícones da tabela e os dois itens do menu «⋯»
   * não possam divergir: é a MESMA lista, e nenhum dos dois desenhos pode
   * ganhar uma acção que o outro não tenha.
   */
  const accoesDe = (i: PropItem): AccaoDeItem[] => [
    { id: "editar", rotulo: "Editar", icone: LapisIcon, onAccao: () => startEdit(i) },
    {
      id: "remover",
      rotulo: "Remover",
      icone: CruzIcon,
      destrutiva: true,
      onAccao: () => perguntarSeRemove(i),
    },
  ];

  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Nome", "Categoria", "Quantidade", "Unidade", "Estado", "Localização", "Notas"],
      ...filtered.map((i) => [
        i.name,
        i.category,
        i.quantity,
        i.unit ?? "",
        CONDITION_LABEL[i.condition],
        i.location ?? "",
        i.notes ?? "",
      ]),
    ];
    downloadCsv(`inventario-${dateStamp()}`, rows);
  }

  const cats = useMemo(
    () => ["Todas", ...Array.from(new Set(items.map((i) => i.category)))],
    [items],
  );

  const filtered = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    return items
      .filter((i) => {
        if (cat !== "Todas" && i.category !== cat) return false;
        if (cond !== "Todos" && i.condition !== cond) return false;
        if (q && !casaComAProcura(q, [i.name, i.category, i.location, i.notes])) return false;
        return true;
      })
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, dSearch, cat, cond]);

  // Category totals (over the filtered set): distinct items + summed quantity.
  const totals = useMemo(() => {
    const map = new Map<string, { items: number; qty: number }>();
    for (const i of filtered) {
      const t = map.get(i.category) ?? { items: 0, qty: 0 };
      t.items += 1;
      t.qty += i.quantity;
      map.set(i.category, t);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totalQty = filtered.reduce((s, i) => s + i.quantity, 0);

  // O modo de carga trabalha sobre o que está À FRENTE dela — já filtrado pela
  // procura e pela categoria. Carregar a carrinha é sempre sobre um
  // subconjunto, nunca sobre o catálogo inteiro.
  if (aCarregar) return <ModoDeCarga itens={filtered} onSair={() => setACarregar(false)} />;

  // A falha ANTES do estado vazio: "Sem itens no inventário" convida a comprar
  // outra vez o que já está no armazém — e o modo de carga, que é o que se usa
  // na véspera, ia percorrer uma lista vazia sem nada a dizer que estava a
  // mentir. Ver `AvisoDeFalha`.
  if (error && items.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler o inventário"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div>
      {/* Toolbar */}
      <Toolbar
        className="mb-6"
        start={
          <>
            <div className="relative w-full max-w-md sm:w-72">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar item…"
                aria-label="Procurar itens do inventário"
                className="bo-input py-2.5 pl-10 pr-3 text-sm text-[var(--bo-text)] placeholder-foreground/30"
              />
            </div>
            <Escolha
              valor={cond}
              aoMudar={(v) => setCond(v as "Todos" | Condition)}
              aria-label="Filtrar por estado"
              containerClassName="sm:w-44"
              className="px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            >
              <option value="Todos">Todos os estados</option>
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Escolha>
          </>
        }
        end={
          <>
            {items.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setACarregar(true)}
                title="Percorrer a lista e ir riscando o que já está na carrinha"
              >
                Modo de carga
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={exportCsv}
                title="Exportar inventário para CSV"
              >
                Exportar
              </Button>
            )}
            <Button
              variant={adding ? "secondary" : "primary"}
              size="sm"
              iconLeft={adding ? undefined : PlusIcon}
              onClick={() => setAdding(!adding)}
            >
              {adding ? "Cancelar" : "Novo item"}
            </Button>
          </>
        }
      />

      {/* Add form */}
      {adding && (
        <Card padding="sm" className="mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do item"
            />
            <Field
              as="select"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {PROP_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Field>
            <Field
              label="Quantidade"
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              placeholder="Quantidade"
            />
            <Field
              label="Unidade"
              value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
              placeholder="Ex.: un., m, par"
            />
            <Field
              as="select"
              label="Estado"
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value as Condition })}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </option>
              ))}
            </Field>
            <Field
              label="Localização"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Ex.: Armazém A, prateleira 3"
            />
            <Field
              containerClassName="sm:col-span-2"
              label="Notas"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={add} loading={saving} disabled={!form.name.trim() || saving}>
              Guardar item
            </Button>
          </div>
        </Card>
      )}

      {/* Category chips */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por categoria">
        {cats.map((c) => (
          <Button
            key={c}
            size="sm"
            variant={cat === c ? "subtle" : "ghost"}
            aria-pressed={cat === c}
            onClick={() => setCat(c)}
          >
            {c}
          </Button>
        ))}
      </div>

      {/* Totals — the grand total leads; the per-category breakdown folds away */}
      {!loading && filtered.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bo-sucesso-lavagem)] px-2.5 py-1 text-[11px] font-medium text-[var(--bo-aviso)]">
            Total: {filtered.length} {filtered.length === 1 ? "item" : "itens"} · {totalQty} un.
          </span>
          {totals.length > 1 && (
            <Button
              size="sm"
              variant="ghost"
              aria-expanded={showCatTotals}
              onClick={() => setShowCatTotals((s) => !s)}
            >
              {showCatTotals ? "Ocultar por categoria" : "Ver por categoria"}
            </Button>
          )}
          {showCatTotals &&
            totals.map(([c, t]) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--bo-tinta-6)] px-2.5 py-1 text-[11px] text-foreground/50"
              >
                <span className="font-medium text-[var(--bo-tinta-72)]">{c}</span>
                <span className="text-foreground/35">
                  {t.items} {t.items === 1 ? "item" : "itens"} · {t.qty} un.
                </span>
              </span>
            ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <Card>
          <div className="flex flex-col gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bo-skeleton h-9 w-full" aria-hidden />
            ))}
          </div>
          <p className="sr-only">A carregar inventário…</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path
                  d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
                  strokeLinejoin="round"
                />
                <path d="M3.27 6.96 12 12l8.73-5.04M12 22V12" strokeLinecap="round" />
              </svg>
            }
            title={items.length === 0 ? "Sem itens no inventário" : "Nenhum item encontrado"}
            description={
              items.length === 0
                ? "Regista aqui os adereços e materiais de decoração do estúdio."
                : "Tenta outra pesquisa, categoria ou estado."
            }
            action={
              items.length === 0
                ? { label: "Adicionar item", onClick: () => setAdding(true) }
                : undefined
            }
          />
        </Card>
      ) : (
        /* ── UMA LISTA, UMA ÁRVORE ──────────────────────────────────────────
           Aqui estavam DUAS, e era o pior dos três ecrãs: um `<Card md:hidden>`
           com os cartões e um `<Card hidden md:block>` com a tabela de seis
           colunas, as duas montadas ao mesmo tempo — e portanto a LINHA EM
           EDIÇÃO estava escrita duas vezes, cinco campos cada, as duas ligadas
           ao mesmo `editForm` e com o mesmo `aria-label` por campo. Uma procura
           por «Quantidade» encontrava dois campos, e o dedo podia acertar no que
           não se via. É o defeito que o `useMedida.ts:16-21` descreve.

           Agora é o `TabelaOuCartoes`: uma forma de cada vez, os cinco campos
           escritos uma vez só (ver `CampoNome` e companhia, em baixo), e o
           corte passa a ser o da casa (`CORTES.desktop`, 1024) em vez dos
           768 px do `md:` — que este back office não usa e que é exactamente a
           largura de um iPad em retrato, onde estas seis colunas não cabem.
           Ver `ui/adaptativo.ts:53-60`. */
        /* ── E O ESQUELETO DÁ LUGAR À TABELA, EM VEZ DE SALTAR PARA ELA ─────
           O ramo `loading` desenha cinco barras `bo-skeleton` com a altura das
           linhas; quando o inventário chega, este cartão monta de raiz e o
           esqueleto sai. Era uma troca seca de um fotograma para o outro.

           `.bo-cena`: 600 ms e doze píxeis, a banda de apresentação. Uma vez
           só, no CARTÃO — as linhas da tabela não levam degrau próprio, que é a
           regra da casa para listas de dados. E o esqueleto continua sem
           entrada: um esqueleto é a espera, não uma apresentação. */
        <Card padding="none" className="bo-cena">
          <div className="p-3 sm:p-4">
            <TabelaOuCartoes
              itens={filtered}
              chaveDe={(i) => i.id}
              legenda="Inventário"
              // O cartão traz a sua própria moldura porque a LINHA EM EDIÇÃO
              // precisa de outra cor de fundo — e traz os seus próprios botões
              // («Editar», «Remover», «Guardar»), que não podem viver dentro de
              // outro botão.
              semMoldura
              cartao={(i) =>
                /* A linha em edição é um caso à parte, e é o cartão que decide:
                   os mesmos cinco campos, empilhados em vez de em colunas. */
                editingId === i.id ? (
                  <div className="flex flex-col gap-2.5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-4">
                    <CampoNome f={editForm} set={setEditForm} className="w-full px-2.5 py-2" />
                    <CampoCategoria f={editForm} set={setEditForm} className="w-full px-2.5 py-2" />
                    <div className="flex gap-2">
                      <CampoQuantidade
                        f={editForm}
                        set={setEditForm}
                        className="w-24 px-2.5 py-2 text-right"
                      />
                      <CampoEstado f={editForm} set={setEditForm} className="flex-1 px-2.5 py-2" />
                    </div>
                    <CampoLocalizacao
                      f={editForm}
                      set={setEditForm}
                      className="w-full px-2.5 py-2"
                    />
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => saveEdit(i.id)}
                        loading={saving}
                        disabled={!editForm.name.trim() || saving}
                      >
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ── O CARTÃO: QUATRO COISAS ────────────────────────────
                     nome · categoria · quantidade e estado na mesma linha ·
                     localização. As acções em baixo, por extenso — no dedo não
                     há hover, e dois ícones de 14 px não são um alvo. */
                  <div className="rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-surface)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--bo-text)]">{i.name}</p>
                        {i.notes && (
                          <p className="mt-0.5 line-clamp-1 text-xs text-foreground/40">
                            {i.notes}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] uppercase tracking-[0.1em] text-sage-600/70">
                          {i.category}
                          {i.location ? (
                            <span className="text-foreground/35"> · {i.location}</span>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="tabular-nums text-[var(--bo-tinta-72)]">
                          {i.quantity}
                          {i.unit ? (
                            <span className="text-foreground/35">
                              {" "}
                              {unidadeNaContagem(i.quantity, i.unit)}
                            </span>
                          ) : null}
                        </p>
                        <div className="mt-1">
                          <ConditionChip condition={i.condition} />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => startEdit(i)}>
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => perguntarSeRemove(i)}>
                        Remover
                      </Button>
                    </div>
                  </div>
                )
              }
              colunas={[
                {
                  chave: "nome",
                  cabecalho: "Nome",
                  ordenar: (a, b) => a.name.localeCompare(b.name, "pt"),
                  celula: (i) =>
                    editingId === i.id ? (
                      <CampoNome f={editForm} set={setEditForm} className="w-full px-2.5 py-1.5" />
                    ) : (
                      <span className="block">
                        <span className="block font-medium text-[var(--bo-text)]">{i.name}</span>
                        {i.notes && (
                          <span className="mt-0.5 line-clamp-1 block text-xs text-foreground/40">
                            {i.notes}
                          </span>
                        )}
                      </span>
                    ),
                },
                {
                  chave: "categoria",
                  cabecalho: "Categoria",
                  ordenar: (a, b) => a.category.localeCompare(b.category, "pt"),
                  celula: (i) =>
                    editingId === i.id ? (
                      <CampoCategoria
                        f={editForm}
                        set={setEditForm}
                        className="w-full px-2.5 py-1.5"
                      />
                    ) : (
                      <span className="text-[11px] uppercase tracking-[0.1em] text-sage-600/70">
                        {i.category}
                      </span>
                    ),
                },
                {
                  chave: "quantidade",
                  cabecalho: "Qtd",
                  alinharADireita: true,
                  largura: "w-24",
                  ordenar: (a, b) => a.quantity - b.quantity,
                  celula: (i) =>
                    editingId === i.id ? (
                      <CampoQuantidade
                        f={editForm}
                        set={setEditForm}
                        className="w-20 px-2.5 py-1.5 text-right"
                      />
                    ) : (
                      <span className="whitespace-nowrap tabular-nums text-[var(--bo-tinta-72)]">
                        {i.quantity}
                        {i.unit ? (
                          <span className="text-foreground/35">
                            {" "}
                            {unidadeNaContagem(i.quantity, i.unit)}
                          </span>
                        ) : null}
                      </span>
                    ),
                },
                {
                  chave: "estado",
                  cabecalho: "Estado",
                  celula: (i) =>
                    editingId === i.id ? (
                      <CampoEstado
                        f={editForm}
                        set={setEditForm}
                        className="w-full px-2.5 py-1.5"
                      />
                    ) : (
                      <ConditionChip condition={i.condition} />
                    ),
                },
                {
                  chave: "localizacao",
                  cabecalho: "Localização",
                  celula: (i) =>
                    editingId === i.id ? (
                      <CampoLocalizacao
                        f={editForm}
                        set={setEditForm}
                        className="w-full px-2.5 py-1.5"
                      />
                    ) : (
                      <span className="text-foreground/50">{i.location || "—"}</span>
                    ),
                },
                {
                  chave: "accoes",
                  interactiva: true,
                  cabecalho: "Ações",
                  alinharADireita: true,
                  largura: "w-32",
                  celula: (i) =>
                    editingId === i.id ? (
                      <span className="inline-flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          onClick={() => saveEdit(i.id)}
                          loading={saving}
                          disabled={!editForm.name.trim() || saving}
                        >
                          Guardar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancelar
                        </Button>
                      </span>
                    ) : (
                      <>
                        {/* ══ AS ACÇÕES DA LINHA, EM DUAS FORMAS ══════════════
                            Esta tabela só aparece a partir de `CORTES.desktop`
                            (1024 px); abaixo disso o mesmo inventário desenha-se
                            em cartões com «Editar» e «Remover» escritos por
                            extenso.

                            MEDIDO a 768×1024 com dedo — um iPad em retrato, que
                            era EXACTAMENTE a largura onde a tabela entrava
                            quando o corte ainda era `md:`: os 20 botões da
                            tabela estavam lá, com a tabela visível, e ZERO deles
                            apareciam. Só tinham `opacity-0
                            group-hover:opacity-100`, sem escapatória nenhuma.
                            Sem rato não há como pedir um hover: naquele
                            aparelho, editar e remover um adereço a partir da
                            tabela não existiam.

                            COM RATO fica o que estava: dois ícones que aparecem
                            ao pairar sobre a linha.
                            SEM RATO fica um «⋯», com «Remover» lá dentro,
                            separado e a vermelho. */}
                        <span className="hidden com-rato:flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(i)}
                            className={`alvo-toque text-foreground/25 sem-rato:text-[var(--bo-text-muted)] hover:text-sage-600 opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 rounded-md p-1 ${ESTADO} ${PRESSAO}`}
                            aria-label="Editar"
                          >
                            {LapisIcon}
                          </button>
                          <button
                            onClick={() => perguntarSeRemove(i)}
                            className={`alvo-toque text-foreground/25 sem-rato:text-[var(--bo-text-muted)] hover:text-[var(--bo-perigo)] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 rounded-md p-1 ${ESTADO} ${PRESSAO}`}
                            aria-label="Remover"
                          >
                            {CruzIcon}
                          </button>
                        </span>
                        <MenuDeAccoes
                          className="com-rato:hidden justify-end"
                          sobre={i.name}
                          accoes={accoesDe(i)}
                        />
                      </>
                    ),
                },
              ]}
            />
          </div>
        </Card>
      )}

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          `ui/PerguntaDestrutiva`: folha inferior no telemóvel (ao pé do
          polegar), diálogo centrado no computador, e o verbo repetido no botão
          em vez de «OK». Um `confirm()` do browser não cabe em 375 px, não se
          traduz e não leva uma lista de números lá dentro — que é a única
          coisa que faz a pergunta valer a pena. */}
      <PerguntaDestrutiva
        aberto={!!aPerguntar}
        onFechar={() => setAPerguntar(null)}
        titulo={aPerguntar?.titulo ?? ""}
        oQueSePerde={aPerguntar?.oQueSePerde}
        aviso={aPerguntar?.aviso}
        rotuloConfirmar={aPerguntar?.rotulo ?? ""}
        // Fecha PRIMEIRO e só depois age, em vez de esperar pela resposta com a
        // caixa aberta: estes ecrãs são optimistas — tiram a linha logo e
        // repõem-na se o servidor recusar — e uma caixa a rodar por cima deles
        // atrasaria um gesto que hoje é instantâneo, e impedia dois seguidos.
        onConfirmar={() => {
          const escolhido = aPerguntar;
          setAPerguntar(null);
          void escolhido?.fazer();
        }}
      />
    </div>
  );
}
