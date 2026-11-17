"use client";

import { useEffect, useMemo, useState, useDeferredValue, useRef, type ReactNode } from "react";
import { servirUmaVez, type PedidoDaPaleta } from "./procura-em-tudo";
import type { MaterialItem, MaterialKind } from "@/lib/material-types";
import {
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS,
  MATERIAL_KIND_LABEL,
  abaixoDoMinimo,
} from "@/lib/material-types";
import type { PlanoCsv } from "@/lib/material-csv";
import { useToast } from "./Toast";
import { useAnular } from "./ui/anular";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";
import { downloadCsv, dateStamp } from "./export";
import {
  Button,
  Card,
  EmCurso,
  EmptyState,
  Escolha,
  Field,
  PerguntaDestrutiva,
  Segmented,
  Toolbar,
} from "./ui";
import MaterialListas from "./MaterialListas";
import MaterialRegras from "./MaterialRegras";
import { useCachedList } from "./useCachedList";
import { AvisoDeFalha } from "./AvisoDeFalha";
import { porqueFalhou, porqueRebentou } from "@/lib/porque-falhou";
import { unidadeNaContagem } from "@/lib/unidade-na-contagem";
import { EMPTY_FORM, fromItem, toPayload, type FormState } from "./material-formulario";

/**
 * CATÁLOGO DE MATERIAL DE LOGÍSTICA.
 *
 * O que faz a montagem acontecer: escadote, extensões, ferramentas, fita-cola,
 * sacos do lixo. NÃO são adereços — esses vivem no ecrã Inventário e são outra
 * coisa (MATERIAL.md §0.1).
 *
 * O que este ecrã tem e o Inventário não:
 *  • `kind` — consumível gasta-se e desconta; reutilizável tem de VOLTAR;
 *  • `minStock` — abaixo dele, entra na lista de compras. Sem mínimo, não se
 *    vigia, e é por isso que o campo distingue vazio de zero;
 *  • importação CSV com pré-visualização, porque quem carrega isto passa o
 *    inventário todo de uma vez e um ficheiro mal lido custa mais a desfazer
 *    do que a escrever de novo.
 */

const KIND_CHIP: Record<MaterialKind, { bg: string; text: string }> = {
  consumivel: { bg: "#f6efe1", text: "#84692d" }, // 4,26:1 → 4,55:1 sobre #f6efe1
  reutilizavel: { bg: "#e7efe4", text: "#3a5c39" },
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE LEVA PERGUNTA NESTE ECRÃ, E O QUE NÃO LEVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas daqui deitam trabalho fora, e as duas são RARAS e CARAS — por
 * isso as duas levam pergunta, e nenhuma leva janela para anular:
 *
 *   REMOVER DO CATÁLOGO tira o item de vez. As listas base que o usem ficam com
 *   a linha a dizer «(item removido do catálogo)» — o defeito não aparece aqui,
 *   aparece na véspera de um evento, na lista de quem carrega a carrinha.
 *
 *   CANCELAR UMA IMPORTAÇÃO JÁ LIDA deita fora um ensaio de centenas de linhas
 *   que o servidor já correu, e o botão está encostado ao «Gravar». Para voltar
 *   ao mesmo sítio é preciso ir buscar o ficheiro outra vez.
 *
 * E o que NÃO leva pergunta, para não se andar a acrescentar depois:
 *   · GRAVAR A IMPORTAÇÃO já tem a sua — é o painel «Antes de gravar», com os
 *     números lá dentro. Uma segunda caixa por cima dessa era perguntar duas
 *     vezes a mesma coisa.
 *   · O «Cancelar» dos formulários de adicionar e editar é a declaração de que
 *     não se quer aquilo. Perguntar a quem já disse que não é atrito puro.
 *   · ESCOLHER UM SEGUNDO CSV com um ensaio aberto substitui o ensaio — mas
 *     quem está no selector de ficheiros está exactamente a pedir isso.
 */

/** Uma pergunta que nomeia o que se perde, e o que fazer se a resposta for sim. */
interface Pergunta {
  /** A pergunta, com o NOME da coisa lá dentro. Nunca «Tens a certeza?». */
  titulo: string;
  /** Uma linha por coisa que desaparece, cada uma com o seu número. */
  oQueSePerde: ReactNode[];
  /** A frase por baixo da lista. */
  aviso?: ReactNode;
  /** O verbo, repetido no botão: «Remover do catálogo», não «Confirmar». */
  rotulo: string;
  fazer: () => void | Promise<void>;
}

function KindChip({ kind }: { kind: MaterialKind }) {
  const c = KIND_CHIP[kind];
  return (
    <span
      className="inline-block px-2 py-0.5 rounded-md text-[10px] tracking-[0.08em] uppercase font-medium"
      style={{ background: c.bg, color: c.text }}
    >
      {MATERIAL_KIND_LABEL[kind]}
    </span>
  );
}

export default function Material({
  pedidoDaPaleta,
}: {
  /** A paleta (⌘K) escolheu um material: abre o catálogo filtrado por ele. */
  pedidoDaPaleta?: PedidoDaPaleta;
}) {
  // Catálogo e listas são a mesma matéria vista de dois ângulos — o que existe,
  // e o que costuma ir junto — por isso vivem no mesmo sítio em vez de
  // ocuparem duas entradas do menu.
  const [aba, setAba] = useState<"catalogo" | "listas" | "regras">("catalogo");
  /* O material vive no CATÁLOGO: um pedido da paleta leva-o para lá, e é o
     catálogo que o serve (a procura é dele). Guardado aqui para sobreviver à
     troca de aba, que remonta o catálogo. */
  const [procuraDaPaleta, setProcuraDaPaleta] = useState<PedidoDaPaleta | undefined>();
  useEffect(() => {
    servirUmaVez(pedidoDaPaleta, (p) => {
      if (p.procura === undefined) return;
      setAba("catalogo");
      setProcuraDaPaleta({ procura: p.procura });
    });
  }, [pedidoDaPaleta]);
  return (
    <Card>
      <Segmented
        ariaLabel="Catálogo, listas base ou regras"
        value={aba}
        onChange={(v) => setAba(v as "catalogo" | "listas" | "regras")}
        options={[
          { value: "catalogo", label: "Catálogo" },
          { value: "listas", label: "Listas base" },
          { value: "regras", label: "Regras" },
        ]}
      />
      {/* ── O PAINEL TROCA COM UM GESTO, E NÃO ENTRE DOIS FOTOGRAMAS ────────
          A pílula do `Segmented` DESLIZA de um segmento para o outro (250 ms,
          `ui/movimento.ts`) e o painel que ela comanda mudava a seco: o
          conteúdo inteiro do cartão era substituído sem um único sinal de que
          foi a ABA que mudou e não o conteúdo que foi trocado por baixo. Meio
          gesto — a metade que se vê é a pequena.

          A palavra é a da casa e não uma nova: `.view-in` (240 ms, 8 px,
          `cubic-bezier(0, 0, 0.2, 1)`, `backwards` — sem `transform` pendurado
          no fim, que é o que já partiu uma gaveta `fixed` uma vez). É
          literalmente o que aqui se passa: a moldura fica, o conteúdo dentro
          dela passa a ser outro. É o mesmo que os separadores do detalhe já
          fazem em `AdminClient.tsx:7195`.

          ── E PORQUE É QUE O `key` AQUI NÃO CUSTA NADA ──────────────────────
          Regra da casa: `key` REMONTA, e nunca se lhe toca para animar o que
          guarda foco, rolo ou texto escrito. Aqui não guarda: os três ramos são
          COMPONENTES DIFERENTES, portanto o React já destrói um e monta o outro
          a cada troca de aba — com `key` ou sem ele. O que o `key` acrescenta é
          só que o invólucro também é novo, e por isso a animação volta a correr
          nele. Nada que sobrevivesse à troca deixa de sobreviver.

          Com `prefers-reduced-motion` a `.view-in` não anima (globals.css). */}
      <div key={aba} className="view-in mt-5">
        {aba === "catalogo" ? (
          <Catalogo pedidoDaPaleta={procuraDaPaleta} />
        ) : aba === "listas" ? (
          <MaterialListas />
        ) : (
          <MaterialRegras />
        )}
      </div>
    </Card>
  );
}

function Catalogo({ pedidoDaPaleta }: { pedidoDaPaleta?: PedidoDaPaleta }) {
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
  } = useCachedList<MaterialItem[]>("material", "/api/material");
  const [search, setSearch] = useState("");
  const dSearch = useDeferredValue(search);
  const [cat, setCat] = useState("Todas");
  const [kind, setKind] = useState<"Todos" | MaterialKind>("Todos");
  /** Só o que está abaixo do mínimo — o atalho para a lista de compras. */
  const [soEmFalta, setSoEmFalta] = useState(false);
  // A escolha da paleta ganha aos filtros que lá estavam (BO 4).
  useEffect(() => {
    servirUmaVez(pedidoDaPaleta, (p) => {
      if (p.procura === undefined) return;
      setSearch(p.procura);
      setCat("Todas");
      setKind("Todos");
      setSoEmFalta(false);
    });
  }, [pedidoDaPaleta]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // ── Importação CSV ────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  /** O nome do ficheiro escolhido, só para as frases o poderem dizer: quem
   *  tenta duas importações seguidas precisa de saber QUAL delas falhou. */
  const [nomeCsv, setNomeCsv] = useState("");
  const [plano, setPlano] = useState<PlanoCsv | null>(null);
  const [importando, setImportando] = useState(false);
  /**
   * Quantas linhas estão a ser gravadas AGORA, ou `null` quando não há
   * gravação nenhuma a correr.
   *
   * Separado do `importando` (que também cobre a leitura do ficheiro) porque a
   * espera só tem de aparecer no gesto que demora: o ensaio é rápido e devolve
   * o painel; a gravação é que são 5 a 30 segundos com a página muda.
   */
  const [aGravar, setAGravar] = useState<number | null>(null);

  /** A pergunta em curso — ver o comentário grande no topo do ficheiro. */
  const [aPerguntar, setAPerguntar] = useState<Pergunta | null>(null);

  const emFalta = useMemo(() => items.filter(abaixoDoMinimo), [items]);

  const visiveis = useMemo(() => {
    const q = dSearch.trim().toLowerCase();
    return items.filter((i) => {
      if (cat !== "Todas" && i.category !== cat) return false;
      if (kind !== "Todos" && i.kind !== kind) return false;
      if (soEmFalta && !abaixoDoMinimo(i)) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q) ||
        (i.notes ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, dSearch, cat, kind, soEmFalta]);

  /**
   * ══════════════════════════════════════════════════════════════════════
   * UMA GRAVAÇÃO, E UMA FRASE QUE DIZ O QUE ACONTECEU
   * ══════════════════════════════════════════════════════════════════════
   *
   * Este ecrã tinha cinco escritas e três frases entre elas: «Não foi possível
   * guardar.», «Erro de ligação ao guardar.» e «Não foi possível remover.» —
   * as mesmas palavras para a rede em baixo, a sessão expirada, o item apagado
   * por outra pessoa, o nome repetido e o servidor em baixo. Nenhuma dizia de
   * QUE material falava, num ecrã que mostra o catálogo inteiro.
   *
   * Agora há um sítio só a fazer fetch, a verificar o `ok` e a escolher a
   * frase — o mesmo padrão do `MaterialListas`. Devolve o corpo porque as
   * escritas daqui precisam dele (a linha criada, a linha actualizada, o
   * ensaio do CSV), e devolve `ok` em vez de atirar, porque quem chama tem de
   * poder repor o ecrã quando falhou.
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
   * Gravou-se, mas o que voltou não tem a forma de um item do catálogo.
   *
   * Antes isto entrava na lista à mesma (`await res.json()` sem olhar), e a
   * linha seguinte a desenhar `i.name` atirava — com o catálogo dentro do back
   * office, a excepção levava o back office todo. Uma resposta 200 sem corpo
   * de item acontece com um proxy pelo meio a devolver HTML.
   */
  const pareceItem = (c: unknown): c is MaterialItem =>
    !!c &&
    typeof (c as MaterialItem).id === "string" &&
    typeof (c as MaterialItem).name === "string";

  const AVISO_SEM_RELEITURA = "Gravado, mas não deu para reler o catálogo. Atualiza a página.";

  async function add() {
    const payload = toPayload(form);
    if (!payload.name) return;
    setSaving(true);
    const { ok, corpo } = await gravar(`adicionar «${payload.name}» ao catálogo`, "/api/material", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!ok) return;
    if (!pareceItem(corpo)) {
      toast(AVISO_SEM_RELEITURA, "error");
      return;
    }
    setItems((prev) => [...prev, corpo].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(EMPTY_FORM);
    setAdding(false);
    // Anula-se apagando o que se criou: um item acabado de nascer ainda não
    // está em lista base nenhuma.
    const criado = corpo;
    anular(`«${criado.name}» adicionado ao catálogo.`, async () => {
      setItems((prev) => prev.filter((i) => i.id !== criado.id));
      const { ok: tirou } = await gravar(
        `tirar «${criado.name}» do catálogo`,
        `/api/material/${criado.id}`,
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
    const antes = items.find((i) => i.id === id);
    setSaving(true);
    const { ok, corpo } = await gravar(
      `guardar as alterações a «${payload.name}»`,
      `/api/material/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    setSaving(false);
    // A edição fica ABERTA quando falha: o que ela escreveu não se perde, e o
    // campo por onde recomeçar é o mesmo em que estava.
    if (!ok) return;
    if (!pareceItem(corpo)) {
      toast(AVISO_SEM_RELEITURA, "error");
      return;
    }
    setItems((prev) => prev.map((i) => (i.id === id ? corpo : i)));
    setEditingId(null);
    if (!antes) {
      toast("Guardado.", "success");
      return;
    }
    // O «Anular» grava o item como estava, pelo mesmo PATCH.
    anular(`«${payload.name}» guardado.`, async () => {
      const { ok: voltou, corpo: reposto } = await gravar(
        `repor «${antes.name}» como estava`,
        `/api/material/${id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(fromItem(antes))),
        },
      );
      if (voltou && pareceItem(reposto)) {
        setItems((prev) => prev.map((i) => (i.id === id ? reposto : i)));
      }
      return voltou;
    });
  }

  /**
   * A PERGUNTA DE REMOVER, com o tamanho do que se perde lá dentro.
   *
   * O que estava aqui era nada: um botão «Remover» que apagava à primeira.
   * Numa lista de dezenas de linhas todas com o mesmo botão no mesmo sítio,
   * é o clique ao lado que apaga o material errado — e sem o nome à frente dos
   * olhos ninguém dá por isso até faltar o escadote.
   *
   * O número é o stock: é a medida do que estava registado e deixa de estar. A
   * segunda frase é a consequência que não se vê deste ecrã — a linha
   * «(item removido do catálogo)» que fica nas listas base.
   */
  function perguntarSeRemove(i: MaterialItem) {
    const unidade = i.unit?.trim() || "un.";
    setAPerguntar({
      titulo: `Remover «${i.name}» do catálogo?`,
      oQueSePerde: [
        `${i.stock} ${unidade} em stock${
          typeof i.minStock === "number" ? `, e o mínimo de ${i.minStock} por que se vigia` : ""
        }`,
        "nas listas base, a linha dele passa a dizer «(item removido do catálogo)»",
      ],
      aviso:
        "As checklists já geradas não mudam — foram copiadas. Fica 30 dias na Reciclagem, de onde se repõe tal e qual.",
      rotulo: "Remover do catálogo",
      fazer: () => remove(i.id),
    });
  }

  async function remove(id: string) {
    const removido = items.find((i) => i.id === id);
    if (!removido) return;
    setItems((prev) => prev.filter((i) => i.id !== id));
    const { ok, corpo } = await gravar(
      `remover «${removido.name}» do catálogo`,
      `/api/material/${id}`,
      { method: "DELETE" },
    );
    // Foi para a Reciclagem (com as regras que apontavam para ele): o aviso
    // traz «Anular», que repõe tudo tal e qual.
    if (ok) depoisDeApagar(corpo, `«${removido.name}» saiu do catálogo.`, () => void refresh());
    if (!ok) {
      // Reversão: o catálogo no ecrã não pode divergir do que está gravado.
      //
      // Repõe-se SÓ esta linha, e sobre o que a lista tiver agora. Guardar a
      // lista inteira antes do `await` — como se fazia — era guardar um instante
      // que já passou: não há confirmação nenhuma pelo meio, dois cliques
      // seguidos põem duas remoções no ar, e a que falhasse repunha o mundo
      // anterior às DUAS. A que o servidor já tinha apagado voltava ao ecrã, e
      // com ela à cache do `useCachedList` — o catálogo ficava a afirmar que
      // existe material que já não existe até alguém recarregar a página.
      setItems((prev) =>
        prev.some((i) => i.id === id)
          ? prev
          : [...prev, removido].sort((a, b) => a.name.localeCompare(b.name)),
      );
    }
  }

  /**
   * A PERGUNTA DE DEITAR FORA UM ENSAIO JÁ LIDO.
   *
   * O «Cancelar» está a dois centímetros do «Gravar», e o que ele deita fora
   * não é um formulário meio escrito: é um ficheiro já lido e um ensaio que o
   * servidor já correu por cima do catálogo inteiro. A pergunta diz QUAL
   * ficheiro e QUANTAS linhas estavam à espera — e diz também que nada foi
   * gravado, que é a dúvida imediata de quem carregou por engano.
   */
  function perguntarSeDeitaForaOEnsaio() {
    const novos = plano?.novos ?? 0;
    const atualizados = plano?.atualizados ?? 0;
    setAPerguntar({
      titulo: `Deitar fora a importação de «${nomeCsv || "o ficheiro"}»?`,
      oQueSePerde: [
        `${novos} ${novos === 1 ? "linha nova" : "linhas novas"} e ${atualizados} a atualizar — ${
          novos + atualizados
        } ao todo, já lidas e conferidas pelo servidor`,
      ],
      aviso: "Nada foi gravado. Para voltar aqui tens de escolher o ficheiro outra vez.",
      rotulo: "Deitar fora",
      fazer: () => {
        setPlano(null);
        setCsv(null);
        setNomeCsv("");
      },
    });
  }

  function pedirFicheiro() {
    fileRef.current?.click();
  }

  async function lerFicheiro(file: File) {
    const texto = await file.text();
    setCsv(texto);
    setNomeCsv(file.name);
    setImportando(true);
    // «ensaiar» e não «ler»: o pedido é o ENSAIO do CSV (aplicar: false), e é
    // esse o gesto que a frase tem de nomear para se repetir o certo.
    const { ok, corpo } = await gravar(
      `ensaiar a importação de «${file.name}»`,
      "/api/material/importar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: texto, aplicar: false }),
      },
    );
    setImportando(false);
    // Sem ensaio não há nada a gravar: deitar fora o CSV é o que impede o
    // painel de "Antes de gravar" de aparecer vazio sobre um ficheiro que o
    // servidor nunca chegou a ler.
    if (!ok || !corpo) {
      setCsv(null);
      return;
    }
    setPlano(corpo as PlanoCsv);
  }

  /**
   * Relê o catálogo. `false` quando a leitura falhou — e aí NÃO escreve nada.
   *
   * O corpo de um 401 ou de um 503 é `{ error: "…" }`, um objecto. Isto era um
   * `fetch(…).then((x) => x.json())` sem `res.ok`, portanto esse objecto entrava
   * no estado como se fosse o catálogo — e a linha seguinte que faz
   * `items.filter(...)` atirava. Este ecrã vive dentro do back office, por isso
   * a excepção subia até ao ecrã de erro da aplicação e levava-o todo.
   *
   * Pior: o `setItems` do `useCachedList` escreve através para a cache, que
   * sobrevive à desmontagem — o objecto de erro ficava lá a rebentar a vista de
   * cada vez que se voltasse a ela, até alguém recarregar a página.
   */
  async function recarregarCatalogo(): Promise<boolean> {
    try {
      const res = await fetch("/api/material");
      if (!res.ok) return false;
      const lista = await res.json();
      if (!Array.isArray(lista)) return false;
      setItems(lista);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * QUANTO É QUE ESTA GRAVAÇÃO COSTUMA DEMORAR, EM MILISSEGUNDOS.
   *
   * A escrita é UM pedido só: o servidor recebe o CSV inteiro e só responde no
   * fim, portanto do lado de cá não há nada que se possa contar e a espera é
   * das opacas (ver `espera-em-curso.ts`). O que há é o TAMANHO — e é ele que
   * separa um segundo de meio minuto.
   *
   * De onde saem os números: o que se mede neste ecrã são 5 a 30 segundos para
   * ficheiros de centenas de linhas. ~1000 ms de arranque (a viagem até ao
   * servidor, que num 4G fraco não é de borla, mais o ensaio do CSV) e ~25 ms
   * por linha escrita dá 6 s a 200 linhas, 11 s a 400 e 26 s a 1000 — dentro
   * do que se vê. É um palpite honesto, e a barra trata-o como tal: abranda,
   * nunca chega ao fim sozinha, e quem a fecha é a resposta.
   *
   * As linhas são as que VÃO SER ESCRITAS (`novos + atualizados`), que é o
   * mesmo número que o ensaio já mostra por cima do botão. As linhas por
   * perceber não entram: não são gravadas, e contá-las era esticar a
   * estimativa por causa de trabalho que não se faz.
   */
  function esperaDaGravacao(linhas: number): number {
    return 1000 + linhas * 25;
  }

  async function aplicarImportacao() {
    if (!csv) return;
    setImportando(true);
    setAGravar(plano ? plano.novos + plano.atualizados : 0);
    const { ok, corpo } = await gravar(
      `gravar a importação de «${nomeCsv || "o ficheiro"}»`,
      "/api/material/importar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, aplicar: true }),
      },
    );
    // O painel do ensaio FICA quando a gravação falha: é dele que se repete, e
    // deitá-lo fora obrigava a escolher o ficheiro outra vez.
    if (!ok) {
      setImportando(false);
      setAGravar(null);
      return;
    }
    const r = corpo as { criados?: number; atualizados?: number; ignorados?: number } | null;
    setCsv(null);
    setPlano(null);
    /**
     * A contagem só se diz quando ela VEIO.
     *
     * `${r.criados} novos` era lido de um corpo que se assumia bom: se a
     * resposta não trouxesse números, o antigo `await res.json()` atirava DEPOIS
     * de a importação já ter corrido, e o ecrã dizia «A importação falhou» sobre
     * centenas de linhas que tinham entrado. Quem lê isso importa o ficheiro
     * outra vez. Dizer «0 novos» seria a mesma mentira ao contrário.
     */
    toast(
      typeof r?.criados === "number"
        ? `${r.criados} novos, ${r.atualizados ?? 0} atualizados` +
            (r.ignorados ? `, ${r.ignorados} ignorados` : "") +
            "."
        : "Importação gravada. O servidor não disse quantas linhas entraram — confere o catálogo.",
      "success",
    );
    // Recarrega em vez de remendar o estado: a importação mexe em muitas
    // linhas de uma vez e adivinhar o resultado aqui era a maneira de o ecrã
    // ficar a dizer uma coisa e a base de dados outra.
    //
    // A releitura é OUTRA operação, e por isso está FORA do desfecho da
    // gravação: falhar a reler não desmente o que já ficou gravado, e dizer
    // "a importação falhou" depois de ela ter corrido era mandar repetir uma
    // importação que já lá está.
    //
    // A espera («A gravar o material…») só se fecha DEPOIS da releitura: era
    // por isso que o `setAGravar(null)` estava num `finally` e não a seguir à
    // resposta — sem isto o ecrã ficava mudo durante a leitura do catálogo
    // inteiro, que é a parte lenta em ficheiros grandes.
    if (!(await recarregarCatalogo())) {
      toast("Gravado, mas não foi possível reler o catálogo. Atualiza a página.", "error");
    }
    setImportando(false);
    setAGravar(null);
  }

  function exportar() {
    // O cabeçalho é o MESMO que a importação lê: exportar, corrigir no Excel e
    // reimportar tem de ser uma volta fechada, senão a exportação é um beco.
    downloadCsv(`material-${dateStamp()}.csv`, [
      ["nome", "categoria", "unidade", "tipo", "stock", "minimo", "notas"],
      ...items.map((i) => [
        i.name,
        i.category,
        i.unit ?? "",
        i.kind,
        String(i.stock),
        typeof i.minStock === "number" ? String(i.minStock) : "",
        i.notes ?? "",
      ]),
    ]);
  }

  // O `Field` DESENHA o controlo — recebe as propriedades dele e devolve
  // `<label for>` + `<input>`/`<select>` já ligados. Passar-lhe um `<input>`
  // por dentro punha um filho num elemento vazio e o React abortava o ecrã
  // inteiro (era isto que fazia o Material "não funcionar"). Ver `ui/Field`.
  const campos = (f: FormState, set: (f: FormState) => void) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <Field
        label="Nome"
        value={f.name}
        onChange={(e) => set({ ...f, name: e.target.value })}
        placeholder="Escadote 3 degraus"
      />
      <Field
        as="select"
        label="Categoria"
        value={f.category}
        onChange={(e) => set({ ...f, category: e.target.value })}
      >
        {MATERIAL_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </Field>
      <Field
        as="select"
        label="Tipo"
        value={f.kind}
        onChange={(e) => set({ ...f, kind: e.target.value as MaterialKind })}
      >
        <option value="reutilizavel">Reutilizável (tem de voltar)</option>
        <option value="consumivel">Consumível (gasta-se)</option>
      </Field>
      <div>
        <Field
          label="Unidade"
          list="material-units"
          value={f.unit}
          onChange={(e) => set({ ...f, unit: e.target.value })}
        />
        <datalist id="material-units">
          {MATERIAL_UNITS.map((u) => (
            <option key={u} value={u} />
          ))}
        </datalist>
      </div>
      <Field
        label="Stock"
        inputMode="decimal"
        value={f.stock}
        onChange={(e) => set({ ...f, stock: e.target.value })}
      />
      <Field
        label="Mínimo (vazio = não vigiar)"
        inputMode="decimal"
        value={f.minStock}
        onChange={(e) => set({ ...f, minStock: e.target.value })}
        placeholder="—"
      />
      <div className="sm:col-span-2 lg:col-span-3">
        <Field
          label="Notas"
          value={f.notes}
          onChange={(e) => set({ ...f, notes: e.target.value })}
          placeholder="Onde está guardado, cuidados, o que costuma faltar…"
        />
      </div>
    </div>
  );

  return (
    <>
      {/* ── A ESCADA DESTA VISTA ────────────────────────────────────────────
          Dois blocos, que são os dois que esta vista tem: os controlos (0) e o
          catálogo (1). A escada é a da casa (`.bo-cena` no `globals.css`) — 600
          ms, degraus de 20 ms, tecto ao sexto degrau, desligada em
          `prefers-reduced-motion`.

          Não há um terceiro: os painéis do meio (o ensaio da importação, a
          gravação em curso, o formulário de adicionar) aparecem por um gesto
          dela e não à chegada da vista, e partir o ecrã em pedaços só para
          haver mais degraus é o que faz uma vista ficar agitada. */}
      {/* ── A MESMA BARRA DAS OUTRAS VISTAS ───────────────────────────────
          Achado n.º 23 da auditoria: a pesquisa daqui era um `bo-input` nu —
          fina, sem lupa, mais baixa do que os seletores ao lado — e os botões
          caíam soltos numa segunda linha. Passa a ser a do Inventário: o
          `Toolbar` com `start` (procurar e filtrar) e `end` (agir). */}
      <Toolbar
        style={{ "--cena": 0 } as React.CSSProperties}
        className="bo-cena"
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
                placeholder="Procurar material…"
                aria-label="Procurar material"
                className="bo-input py-2.5 pl-10 pr-3 text-sm text-[var(--bo-text)] placeholder-foreground/30"
              />
            </div>
            <Escolha
              valor={cat}
              aoMudar={setCat}
              aria-label="Filtrar por categoria"
              containerClassName="sm:w-44"
              className="px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            >
              {/* `<option>` sem `value`: o valor é o TEXTO, como no nativo. É a
                  regra que o `Escolha` copia de propósito, para migrações destas
                  não trocarem um valor por um rótulo em silêncio. */}
              <option>Todas</option>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Escolha>
            <Escolha
              valor={kind}
              aoMudar={(v) => setKind(v as "Todos" | MaterialKind)}
              aria-label="Filtrar por tipo"
              containerClassName="sm:w-40"
              className="px-3 py-2.5 text-sm text-[var(--bo-tinta-72)]"
            >
              <option value="Todos">Todos</option>
              <option value="reutilizavel">Reutilizável</option>
              <option value="consumivel">Consumível</option>
            </Escolha>
            {emFalta.length > 0 && (
              <Button
                size="sm"
                variant={soEmFalta ? "primary" : "ghost"}
                onClick={() => setSoEmFalta((v) => !v)}
              >
                Abaixo do mínimo ({emFalta.length})
              </Button>
            )}
          </>
        }
        end={
          <>
            <Button size="sm" variant="ghost" onClick={exportar}>
              Exportar
            </Button>
            <Button size="sm" variant="ghost" onClick={pedirFicheiro}>
              Importar CSV
            </Button>
            <Button size="sm" onClick={() => setAdding((v) => !v)}>
              {PlusIcon}
              Adicionar
            </Button>
          </>
        }
      />

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void lerFicheiro(f);
          // Limpa o valor para reimportar o MESMO ficheiro depois de o corrigir
          // no Excel — sem isto, escolher o mesmo nome não disparava nada.
          e.target.value = "";
        }}
      />

      {/* ── Pré-visualização da importação ──────────────────────────────── */}
      {plano && (
        <div className="mt-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-sm font-medium">Antes de gravar:</p>
            <p className="text-sm text-[var(--bo-tinta-72)]">
              <strong>{plano.novos}</strong> novos · <strong>{plano.atualizados}</strong>{" "}
              atualizados
              {plano.erros > 0 && (
                <>
                  {" · "}
                  <strong className="text-[var(--bo-perigo)]">{plano.erros}</strong> por perceber
                </>
              )}
            </p>
          </div>

          {plano.erros > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--bo-tinta-72)]">
              {plano.linhas
                .filter((l) => l.estado === "erro")
                .slice(0, 8)
                .map((l) => (
                  <li key={l.linha}>
                    <span className="font-medium">Linha {l.linha}:</span> {l.erro}
                  </li>
                ))}
              {plano.erros > 8 && <li>… e mais {plano.erros - 8}.</li>}
            </ul>
          )}

          <p className="bo-text-muted mt-3 text-xs">
            As linhas por perceber não são gravadas. As outras entram na mesma.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <Button
              size="sm"
              onClick={aplicarImportacao}
              disabled={importando || plano.novos + plano.atualizados === 0}
            >
              {importando ? "A gravar…" : "Gravar"}
            </Button>
            <Button size="sm" variant="ghost" onClick={perguntarSeDeitaForaOEnsaio}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* FORA do painel do ensaio de propósito: o `aplicarImportacao` faz
          `setPlano(null)` assim que a escrita responde, e o que vem a seguir —
          reler o catálogo inteiro — ainda demora. Lá dentro, a espera
          desaparecia a meio do trabalho e o ecrã voltava a ficar mudo.
          Aparece exactamente onde o botão «Gravar» estava. */}
      {aGravar !== null && (
        <EmCurso
          className="mt-4"
          titulo="A gravar o material…"
          estimadoMs={esperaDaGravacao(aGravar)}
          nota={`${aGravar} linha${aGravar !== 1 ? "s" : ""} a entrar no catálogo. Não feches a página.`}
          notaDemorada="Está a demorar mais do que o costume. A gravação continua — não feches a página."
        />
      )}

      {adding && (
        <div className="mt-4 rounded-xl border border-[var(--bo-hairline-strong)] p-4">
          {campos(form, setForm)}
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" onClick={add} disabled={saving || !form.name.trim()}>
              Guardar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* ── Lista ───────────────────────────────────────────────────────── */}
      {/* A falha ANTES do estado vazio: sem isto, uma leitura que rebentou
          aparecia como "Catálogo vazio" e mandava-a carregar o que já lá
          estava. Ver `AvisoDeFalha`. */}
      {error && items.length === 0 ? (
        <AvisoDeFalha
          titulo="Não foi possível ler o material"
          mensagem={errorMessage}
          aoTentarDeNovo={refresh}
        />
      ) : loading && items.length === 0 ? (
        // A espera NÃO leva degrau: um ecrã a dizer «A carregar…» é a espera,
        // não uma apresentação.
        <p className="bo-text-muted mt-6 text-sm">A carregar…</p>
      ) : (
        /* Segundo degrau, e vai no CONTENTOR do catálogo — o que está aqui
           dentro é uma coluna de quantidades e mínimos que ela confere com o
           dedo, e uma coluna a chegar linha a linha é uma coluna que não se
           confere. Envolve o catálogo E o estado vazio porque são o mesmo
           bloco visto de duas maneiras. */
        <div style={{ "--cena": 1 } as React.CSSProperties} className="bo-cena">
          {visiveis.length === 0 ? (
            <EmptyState
              title={items.length === 0 ? "Catálogo vazio" : "Nada com estes filtros"}
              description={
                items.length === 0
                  ? "Adiciona o material à mão, ou importa o inventário de uma vez a partir de um CSV."
                  : "Experimenta outra categoria, outro tipo, ou limpa a pesquisa."
              }
            />
          ) : (
            <ul className="mt-4 divide-y divide-[var(--bo-hairline)]">
              {visiveis.map((i) =>
                editingId === i.id ? (
                  <li key={i.id} className="py-4">
                    {campos(editForm, setEditForm)}
                    <div className="mt-3 flex items-center gap-2">
                      <Button size="sm" onClick={() => saveEdit(i.id)} disabled={saving}>
                        Guardar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </li>
                ) : (
                  <li key={i.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                    <span className="font-medium">{i.name}</span>
                    <KindChip kind={i.kind} />
                    <span className="bo-text-muted text-xs">{i.category}</span>
                    <span className="text-sm">
                      {i.stock}
                      {i.unit ? ` ${unidadeNaContagem(i.stock, i.unit)}` : ""}
                    </span>
                    {abaixoDoMinimo(i) && (
                      <span className="rounded-md bg-[var(--bo-perigo-lavagem)] px-2 py-0.5 text-[10px] font-medium tracking-[0.08em] text-[var(--bo-perigo)] uppercase">
                        Repor (mín. {i.minStock})
                      </span>
                    )}
                    {i.notes && <span className="bo-text-muted text-xs">{i.notes}</span>}
                    <span className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(i.id);
                          setEditForm(fromItem(i));
                        }}
                      >
                        Editar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => perguntarSeRemove(i)}>
                        Remover
                      </Button>
                    </span>
                  </li>
                ),
              )}
            </ul>
          )}
        </div>
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
    </>
  );
}
