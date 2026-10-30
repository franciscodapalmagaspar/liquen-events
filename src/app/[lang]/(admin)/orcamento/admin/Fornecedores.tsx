"use client";

import { casaComAProcura } from "@/lib/procura";
import { useMemo, useState, useDeferredValue } from "react";
import type { Supplier } from "@/lib/orcamento/types";
import { downloadCsv, dateStamp } from "./export";
import { SkeletonCard } from "./Skeleton";
import {
  Button,
  Card,
  EmptyState,
  Field,
  MenuDeAccoes,
  PerguntaDestrutiva,
  Toolbar,
  type AccaoDeItem,
} from "./ui";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { ESTADO, PRESSAO } from "./ui/movimento";
import CampoTelefone from "@/components/CampoTelefone";
import { APARENCIA_DO_BACK_OFFICE, TELEFONE_EM_CAIXA } from "./ui/aparencia-do-telefone";

const CATEGORIES = [
  "Catering",
  "Floristas",
  "Música/DJ",
  "Fotografia",
  "Vídeo",
  "Decoração",
  "Espaços",
  "Audiovisual",
  "Transporte",
  "Outro",
];

const EMPTY_FORM = {
  name: "",
  category: "Catering",
  phone: "",
  email: "",
  location: "",
  notes: "",
};

/**
 * O que o PATCH de `/api/fornecedores/[id]` aceita: os campos do fornecedor,
 * com `null` a valer "apagar". É assim que o `supplierUpdateSchema` os declara
 * (`.nullish()`), e é a diferença entre poder e não poder tirar uma avaliação.
 */
type PatchFornecedor = { [K in keyof Supplier]?: Supplier[K] | null };

/* Os três ícones da linha, escritos uma vez: o mesmo desenho serve os botões
   soltos do computador e os itens do menu «⋯» do dedo. */
const EstrelaIcon = (cheia: boolean) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={cheia ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      strokeLinejoin="round"
    />
  </svg>
);

const LapisIcon = (
  <svg
    width="13"
    height="13"
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

const CaixoteIcon = (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
  </svg>
);

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

export default function Fornecedores() {
  const { toast } = useToast();
  const anular = useAnular();
  const depoisDeApagar = useDepoisDeApagar();

  const {
    data: suppliers = [],
    setData: setSuppliers,
    loading,
    error,
    errorMessage,
    refresh,
  } = useCachedList<Supplier[]>("fornecedores", "/api/fornecedores");
  const [search, setSearch] = useState("");
  // Defer so the filter/row reconcile runs off the keystroke; input stays instant.
  const dSearch = useDeferredValue(search);
  const [cat, setCat] = useState("Todos");
  const [adding, setAdding] = useState(false);

  /**
   * O fornecedor à espera de resposta à pergunta de o remover.
   *
   * Guarda-se a ficha e não só o `id`: o nome tem de aparecer na pergunta — sem
   * ele ela tem de se lembrar em qual linha tocou — e a lista pode mudar entre
   * a pergunta e a resposta.
   */
  const [aRemover, setARemover] = useState<Supplier | null>(null);

  /**
   * As acções de uma ficha, como DADOS — a forma é de quem as desenha.
   *
   * Estão aqui e não em linha para que os três ícones do computador e os três
   * itens do menu «⋯» do dedo não possam divergir: é a MESMA lista, e nenhum
   * dos dois desenhos pode ganhar uma acção que o outro não tenha.
   */
  const accoesDe = (s: Supplier): AccaoDeItem[] => [
    {
      id: "preferido",
      rotulo: s.preferred ? "Remover dos preferidos" : "Marcar como preferido",
      icone: EstrelaIcon(!!s.preferred),
      onAccao: () =>
        patchSupplier(
          s.preferred ? `tirar «${s.name}» dos preferidos` : `marcar «${s.name}» como preferido`,
          s.id,
          { preferred: !s.preferred },
          s.preferred ? `«${s.name}» saiu dos preferidos.` : `«${s.name}» marcado como preferido.`,
        ),
    },
    { id: "editar", rotulo: "Editar", icone: LapisIcon, onAccao: () => startEdit(s) },
    {
      id: "remover",
      rotulo: "Remover",
      icone: CaixoteIcon,
      destrutiva: true,
      onAccao: () => pedirParaRemover(s.id),
    },
  ];
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * ESTE ECRÃ GRAVAVA E NUNCA PERGUNTAVA SE O SERVIDOR TINHA ACEITADO
   * ════════════════════════════════════════════════════════════════════════════
   *
   * As três escritas daqui — acrescentar, apagar, alterar — mandavam o pedido e
   * seguiam. Sem `res.ok`, sem `catch`, sem aviso. E como o `setSuppliers` do
   * `useCachedList` escreve através para a cache, a alteração que o servidor
   * recusou sobrevivia a mudar de separador e voltar: parecia gravada até ao
   * recarregamento seguinte, onde nunca tinha existido.
   *
   * O caso que isto apanha é o mais banal de todos: a sessão expira — ela deixa
   * o back office aberto horas seguidas —, ela corrige as notas de um
   * fornecedor («só atende depois das 18h, factura a 60 dias»), o pedido leva
   * 401, e o ecrã mostra o texto novo como se estivesse guardado.
   *
   * Era o ÚNICO ecrã de escrita que tinha ficado de fora do padrão que os
   * outros seis já usam (Inventário, Tarefas, Convidados, Custos, Plano de
   * produção, Cronograma): guardar o estado anterior, verificar a resposta,
   * repor e dizer o que aconteceu.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ QUAL FORNECEDOR
   * ══════════════════════════════════════════════════════════════════════
   *
   * As três escritas tinham seis frases entre si («Não foi possível guardar o
   * fornecedor.», «Erro de ligação ao remover…»), e nenhuma dizia de QUEM se
   * estava a falar nem o que fazer a seguir. A sessão expirada e a rede em
   * baixo levavam o mesmo aviso, e são o caso em que repetir resolve e o caso
   * em que repetir não pode resolver.
   *
   * Um sítio só a pedir, a verificar o `ok` e a escolher a frase
   * (`porque-falhou`). É o padrão de `MaterialListas`.
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

  async function add() {
    if (!form.name.trim()) return;
    // O formulário fica ABERTO e preenchido quando falha: o que ela escreveu
    // não se perde, e o campo por onde recomeçar é o mesmo em que estava.
    const { ok, corpo } = await gravar(
      `guardar o fornecedor «${form.name.trim()}»`,
      "/api/fornecedores",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );
    if (!ok) return;
    const created = corpo as Supplier | null;
    // Um 200 sem ficha no corpo não é uma ficha para pôr na lista — sem este
    // guarda entrava um `null` e a ordenação por nome rebentava a seguir.
    if (!created?.id) {
      toast(
        `«${form.name.trim()}» ficou guardado, mas não voltou do servidor. Atualiza a página.`,
        "error",
      );
      return;
    }
    setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    setForm({ name: "", category: "Catering", phone: "", email: "", location: "", notes: "" });
    setAdding(false);
  }

  /**
   * Perguntar primeiro. A pergunta fica fora do `remove` de propósito: o
   * `remove` é o que age, e quem quiser um dia remover sem perguntar (um lote,
   * um desfazer) não tem de contornar uma caixa — basta não a abrir.
   */
  function pedirParaRemover(id: string) {
    const s = suppliers.find((x) => x.id === id);
    // Sem ficha não há nome para pôr na pergunta, e uma pergunta que não diz o
    // que se perde não vale o toque.
    if (!s) {
      void remove(id);
      return;
    }
    setARemover(s);
  }

  async function remove(id: string) {
    const s = suppliers.find((x) => x.id === id);
    // Repõe-se ESTA ficha no sítio dela, não a lista inteira de antes do
    // pedido. Repor a lista desfazia o que tivesse gravado bem enquanto este
    // pedido ia a caminho: ela apaga dois fornecedores seguidos, o segundo
    // passa, o primeiro volta com erro — e o segundo reaparecia no ecrã apesar
    // de já não existir na base de dados.
    const posicao = suppliers.findIndex((x) => x.id === id);
    setSuppliers((prev) => prev.filter((x) => x.id !== id));
    const { ok, corpo } = await gravar(
      `remover o fornecedor «${s?.name ?? "sem nome"}»`,
      `/api/fornecedores/${id}`,
      { method: "DELETE" },
    );
    if (!ok && s) {
      setSuppliers((prev) => {
        if (prev.some((x) => x.id === id)) return prev;
        const onde = Math.min(posicao < 0 ? prev.length : posicao, prev.length);
        return [...prev.slice(0, onde), s, ...prev.slice(onde)];
      });
    }
    // Foi para a Reciclagem: o aviso traz «Anular», que o repõe tal e qual.
    if (ok && s) depoisDeApagar(corpo, `«${s.name}» removido.`, () => void refresh());
  }

  /**
   * Grava uma alteração à ficha. Com `feito` (a frase do que aconteceu), o
   * aviso traz «Anular», que grava os campos tocados como estavam — `null` onde
   * antes não havia nada, que é o «apagar este campo» que a rota entende.
   */
  async function patchSupplier(
    oQue: string,
    id: string,
    patch: PatchFornecedor,
    feito?: string,
  ): Promise<boolean> {
    // O anterior é DESTA ficha (ver a nota em `remove`): repor a lista inteira
    // apagava do ecrã as alterações que outra gravação tivesse feito entretanto.
    const anterior = suppliers.find((s) => s.id === id);
    // `null` é o "apagar este campo" que a rota entende; em memória o campo
    // passa a não existir — que é exactamente como ele volta a ser lido depois
    // (o `fromRow` do store traduz a coluna nula para `undefined`).
    const emMemoria = Object.fromEntries(
      Object.entries(patch).map(([k, v]) => [k, v ?? undefined]),
    ) as Partial<Supplier>;
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, ...emMemoria } : s)));
    const { ok } = await gravar(oQue, `/api/fornecedores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!ok) {
      if (anterior) setSuppliers((prev) => prev.map((s) => (s.id === id ? anterior : s)));
      return false;
    }
    if (feito && anterior) {
      const inverso = Object.fromEntries(
        Object.keys(patch).map((k) => [k, anterior[k as keyof Supplier] ?? null]),
      ) as PatchFornecedor;
      anular(feito, () => patchSupplier(`repor «${anterior.name}» como estava`, id, inverso));
    }
    return true;
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      category: s.category,
      phone: s.phone ?? "",
      email: s.email ?? "",
      location: s.location ?? "",
      notes: s.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    // A edição só FECHA se o servidor tiver aceitado. Fechá-la de qualquer
    // maneira era mostrar-lhe o valor antigo de volta sem explicação nenhuma.
    const nome = suppliers.find((x) => x.id === id)?.name ?? editForm.name.trim();
    if (
      !(await patchSupplier(
        `guardar as alterações a «${nome}»`,
        id,
        editForm,
        `«${editForm.name.trim() || nome}» guardado.`,
      ))
    )
      return;
    setEditingId(null);
  }

  function exportCsv() {
    const rows: (string | number)[][] = [
      ["Nome", "Categoria", "Telefone", "Email", "Localização", "Notas"],
      ...filtered.map((s) => [
        s.name,
        s.category,
        s.phone ?? "",
        s.email ?? "",
        s.location ?? "",
        s.notes ?? "",
      ]),
    ];
    downloadCsv(`fornecedores-${dateStamp()}`, rows);
  }

  const cats = useMemo(
    () => ["Todos", "Preferidos", ...Array.from(new Set(suppliers.map((s) => s.category)))],
    [suppliers],
  );
  // Memoised: the filter+sort over all suppliers was recomputed on every render
  // (incl. typing in the add/edit forms), not just when the inputs changed.
  const filtered = useMemo(
    () =>
      suppliers
        .filter((s) => {
          if (cat === "Preferidos" && !s.preferred) return false;
          if (cat !== "Todos" && cat !== "Preferidos" && s.category !== cat) return false;
          const q = dSearch.trim().toLowerCase();
          if (q && !casaComAProcura(q, [s.name, s.email, s.phone, s.location, s.notes]))
            return false;
          return true;
        })
        .slice()
        .sort((a, b) => {
          if (a.preferred && !b.preferred) return -1;
          if (!a.preferred && b.preferred) return 1;
          return a.name.localeCompare(b.name);
        }),
    [suppliers, cat, dSearch],
  );

  // A falha ANTES do estado vazio: "Sem fornecedores ainda — guarde aqui os
  // contactos" manda-a começar de novo uma agenda que já existe, e o florista
  // que ela veio procurar continua sem telefone.
  if (error && suppliers.length === 0) {
    return (
      <AvisoDeFalha
        titulo="Não foi possível ler os fornecedores"
        mensagem={errorMessage}
        aoTentarDeNovo={refresh}
      />
    );
  }

  return (
    <div>
      <Toolbar
        className="mb-6"
        start={
          <div className="relative w-full max-w-md sm:w-80">
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
              placeholder="Procurar fornecedor…"
              aria-label="Procurar fornecedores"
              className="bo-input py-2.5 pl-10 pr-3 text-sm text-[var(--bo-text)] placeholder-foreground/30"
            />
          </div>
        }
        end={
          <>
            {suppliers.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={exportCsv}
                title="Exportar fornecedores para CSV"
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
              {adding ? "Cancelar" : "Novo fornecedor"}
            </Button>
          </>
        }
      />

      {adding && (
        <Card padding="sm" className="mb-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Nome do fornecedor"
            />
            <Field
              as="select"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Field>
            {/* A bandeira e o número, como nos pedidos (pedido dela, 30/10).
                O rótulo é o do `Field`, escrito à mão porque o controlo não é
                um `<input>` só. */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fornecedor-novo-telefone"
                className="text-footnote font-semibold text-[var(--bo-text-muted)]"
              >
                Telefone
              </label>
              <CampoTelefone
                id="fornecedor-novo-telefone"
                value={form.phone}
                onChange={(phone) => setForm({ ...form, phone })}
                aparencia={APARENCIA_DO_BACK_OFFICE}
                classeDoBotao={TELEFONE_EM_CAIXA.botao}
                classeDoNumero={TELEFONE_EM_CAIXA.numero}
                placeholder="912 345 678"
                locale="pt"
              />
            </div>
            <Field
              label="E-mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="E-mail"
            />
            <Field
              label="Localização"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="Localização"
            />
            <Field
              label="Notas"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Notas"
            />
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={add} disabled={!form.name.trim()}>
              Guardar fornecedor
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

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
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
                  d="M3 9l1-5h16l1 5M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z"
                  strokeLinejoin="round"
                />
                <path d="M9 13h6" strokeLinecap="round" />
              </svg>
            }
            title={
              suppliers.length === 0 ? "Sem fornecedores ainda" : "Nenhum fornecedor encontrado"
            }
            description={
              suppliers.length === 0
                ? "Guarda aqui os contactos de catering, floristas, fotógrafos e outros parceiros de confiança."
                : "Tenta outra pesquisa ou categoria."
            }
            action={
              suppliers.length === 0
                ? { label: "Adicionar fornecedor", onClick: () => setAdding(true) }
                : undefined
            }
          />
        </Card>
      ) : (
        /* ── O ESQUELETO DÁ LUGAR AOS CARTÕES, EM VEZ DE SALTAR PARA ELES ───
           O ramo de cima desenha seis `SkeletonCard` na MESMA grelha; quando os
           fornecedores chegam, esta grelha monta de raiz e o esqueleto sai. Era
           uma troca seca de um fotograma para o outro.

           `.bo-cena`: 600 ms, doze píxeis, só a desacelerar — a banda de
           apresentação, que é o que isto é. Uma vez só, na GRELHA e não em cada
           cartão: com dezenas de fornecedores, um degrau por cartão seria a
           lentidão que o tecto do sexto degrau existe para evitar.

           O esqueleto continua sem entrada, de propósito. */
        <div className="bo-cena grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <Card key={s.id} padding="sm" className="group">
              {editingId === s.id ? (
                /* ── Edit mode ── */
                <div className="flex flex-col gap-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="bo-eyebrow">Editar fornecedor</p>
                    <button
                      onClick={() => setEditingId(null)}
                      aria-label="Fechar edição"
                      className={`text-sm text-foreground/30 hover:text-[var(--bo-text-muted)] ${ESTADO} ${PRESSAO}`}
                    >
                      ×
                    </button>
                  </div>
                  <Field
                    label="Nome"
                    hideLabel
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Nome *"
                  />
                  <Field
                    as="select"
                    label="Categoria"
                    hideLabel
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Field>
                  <CampoTelefone
                    id={`fornecedor-${s.id}-telefone`}
                    ariaLabel="Telefone"
                    value={editForm.phone}
                    onChange={(phone) => setEditForm({ ...editForm, phone })}
                    aparencia={APARENCIA_DO_BACK_OFFICE}
                    classeDoBotao={TELEFONE_EM_CAIXA.botao}
                    classeDoNumero={TELEFONE_EM_CAIXA.numero}
                    placeholder="912 345 678"
                    locale="pt"
                  />
                  <Field
                    label="E-mail"
                    hideLabel
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="E-mail"
                  />
                  <Field
                    label="Localização"
                    hideLabel
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    placeholder="Localização"
                  />
                  <Field
                    label="Notas"
                    hideLabel
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Notas"
                  />
                  <div className="mt-1 flex gap-2">
                    <Button
                      fullWidth
                      onClick={() => saveEdit(s.id)}
                      disabled={!editForm.name.trim()}
                    >
                      Guardar
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                /* ── Display mode ── */
                <>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[var(--bo-text)] text-sm font-semibold truncate">
                          {s.name}
                        </p>
                        {s.preferred && (
                          <span className="shrink-0 text-amber-500" title="Fornecedor preferido">
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              stroke="none"
                            >
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                            </svg>
                          </span>
                        )}
                      </div>
                      <p className="text-sage-600/70 text-[10px] tracking-[0.15em] uppercase mt-0.5">
                        {s.category}
                      </p>
                    </div>
                    {/* ══ AS ACÇÕES DA FICHA, EM DUAS FORMAS ════════════════════
                        A mesma lista de acções desenhada de duas maneiras, e a
                        escolha é do CSS — o `com-rato:`/`sem-rato:` de
                        globals.css — para não haver um primeiro desenho errado
                        a piscar antes do certo.

                        COM RATO: três ícones soltos, que aparecem ao pairar.
                        É o desenho que estava e que fica byte a byte igual.

                        SEM RATO: um «⋯» só. MEDIDO a 375×667 com dedo — os três
                        alvos de 44 px deixavam 153 px de coluna ao nome do
                        fornecedor, e é disto que a fotografia da queixa era. Com
                        um alvo em vez de três, a coluna do nome passa a 257 px.

                        E a 768×1024 com dedo (o iPad em retrato) os três não
                        apareciam DE TODO: 4 de 36 visíveis, e os 4 eram estrelas
                        de fichas já preferidas, que nunca passaram pelo
                        `sm:opacity-0`. Era esse o defeito grave — funcional, não
                        estético.

                        «Remover» vai para dentro do menu, com separador e a
                        vermelho (ver `MenuDeAccoes`): no dedo, apagar ao lado de
                        editar é um engano à espera de acontecer. */}
                    <div className="hidden com-rato:flex items-center gap-2 shrink-0">
                      <button
                        onClick={() =>
                          patchSupplier(
                            s.preferred
                              ? `tirar «${s.name}» dos preferidos`
                              : `marcar «${s.name}» como preferido`,
                            s.id,
                            { preferred: !s.preferred },
                            s.preferred
                              ? `«${s.name}» saiu dos preferidos.`
                              : `«${s.name}» marcado como preferido.`,
                          )
                        }
                        className={`alvo-toque p-1.5 ${ESTADO} ${PRESSAO} ${s.preferred ? "text-amber-500 hover:text-amber-400" : "text-foreground/15 sem-rato:text-[var(--bo-text-muted)] hover:text-amber-400 opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100"}`}
                        title={s.preferred ? "Remover dos preferidos" : "Marcar como preferido"}
                      >
                        {EstrelaIcon(!!s.preferred)}
                      </button>
                      <button
                        onClick={() => startEdit(s)}
                        className={`alvo-toque p-1.5 text-foreground/20 sem-rato:text-[var(--bo-text-muted)] hover:text-sage-600 opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 ${ESTADO} ${PRESSAO}`}
                        aria-label="Editar"
                      >
                        {LapisIcon}
                      </button>
                      <button
                        onClick={() => pedirParaRemover(s.id)}
                        className={`alvo-toque p-1.5 text-foreground/20 sem-rato:text-[var(--bo-text-muted)] hover:text-[var(--bo-perigo)] opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 ${ESTADO} ${PRESSAO}`}
                        aria-label="Remover"
                      >
                        ×
                      </button>
                    </div>
                    <MenuDeAccoes
                      className="com-rato:hidden shrink-0"
                      sobre={s.name}
                      accoes={accoesDe(s)}
                    />
                  </div>
                  {/* Star rating */}
                  <div className="flex items-center gap-0.5 pointer-coarse:gap-2 mb-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        // Apagar a avaliação manda `null`, não `0`: o
                        // `supplierUpdateSchema` da rota aceita 1–5 ou nulo, e o
                        // zero levava 400 — a estrela voltava a acender-se e
                        // ficava um "não foi possível guardar" sem explicação. É
                        // o único caminho para desfazer um clique enganado.
                        onClick={() =>
                          patchSupplier(
                            s.rating === star
                              ? `tirar a avaliação de «${s.name}»`
                              : `avaliar «${s.name}» com ${star} estrela${star !== 1 ? "s" : ""}`,
                            s.id,
                            { rating: s.rating === star ? null : star },
                            s.rating === star
                              ? `Tirada a avaliação de «${s.name}».`
                              : `«${s.name}» com ${star} estrela${star !== 1 ? "s" : ""}.`,
                          )
                        }
                        /* MEDIDO a 375px: 13×13 px, 2px de uma estrela para a
                           outra — o dedo não acerta na que quer, e acaba a
                           mudar a avaliação para a errada. `alvo-toque` dá os
                           44px só no dedo; o `gap-2` (8px, também só no dedo)
                           separa uma caixa de 44 da vizinha, senão continuavam
                           coladas mesmo maiores. */
                        className={`alvo-toque focus:outline-none ${ESTADO} ${PRESSAO}`}
                        aria-label={`${star} estrela${star !== 1 ? "s" : ""}`}
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill={star <= (s.rating ?? 0) ? "#b5894a" : "none"}
                          stroke={star <= (s.rating ?? 0) ? "#b5894a" : "#d0c9be"}
                          strokeWidth="1.6"
                        >
                          <path
                            d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    ))}
                    <span className="text-foreground/25 text-[10px] ml-1">
                      {s.rating ? `${s.rating}/5` : "—"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-xs">
                    {s.phone && (
                      <a
                        href={`tel:${s.phone}`}
                        // MEDIDO: 309×16 px de alvo — é o número que liga a
                        // chamada, e 16px de altura é fácil de errar por um
                        // pixel e acabar a tocar na linha ao lado. `alvo-toque`
                        // dá-lhe 44px de altura só no dedo (`justify-start`
                        // porque, ao contrário dos botões de ícone, este texto
                        // não deve ficar centrado).
                        className={`alvo-toque !justify-start text-foreground/45 hover:text-sage-600 ${ESTADO} ${PRESSAO}`}
                      >
                        {s.phone}
                      </a>
                    )}
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        // O MESMO 309×16 do telefone aqui em cima, e a mesma
                        // correcção: o irmão foi tratado e este ficou para
                        // trás, na mesma coluna e à distância de um dedo.
                        // O corte passou para um filho: os emails destes
                        // fornecedores passam da largura da coluna, e num
                        // `inline-flex` o `truncate` no próprio link é inerte.
                        className={`alvo-toque !justify-start min-w-0 text-foreground/45 hover:text-sage-600 ${ESTADO} ${PRESSAO}`}
                      >
                        <span className="min-w-0 truncate">{s.email}</span>
                      </a>
                    )}
                    {s.location && <span className="text-foreground/30">{s.location}</span>}
                    {s.notes && (
                      <span className="text-foreground/35 leading-relaxed mt-1">{s.notes}</span>
                    )}
                  </div>
                </>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── A PERGUNTA É A DA CASA ──────────────────────────────────────────
          Folha inferior no telemóvel, ao pé do polegar; diálogo centrado no
          computador; e o verbo no botão em vez de «OK». */}
      <PerguntaDestrutiva
        aberto={!!aRemover}
        onFechar={() => setARemover(null)}
        titulo={`Remover o fornecedor «${aRemover?.name ?? ""}»?`}
        aviso="Fica 30 dias na Reciclagem, de onde se repõe tal e qual."
        rotuloConfirmar="Remover"
        // Fecha primeiro e só depois age: a lista é optimista — a ficha sai
        // logo e volta se o servidor recusar — e uma caixa por cima atrasaria
        // um gesto que hoje é instantâneo.
        onConfirmar={() => {
          const s = aRemover;
          setARemover(null);
          if (s) void remove(s.id);
        }}
      />
    </div>
  );
}
