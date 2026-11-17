import { casaComAProcura } from "@/lib/procura";
import type { CalendarEvent, ProposalStatus, Supplier, Task } from "@/lib/orcamento/types";
import type { ItemDosAceites } from "@/lib/orcamento/aceites";
import type { MaterialItem } from "@/lib/material-types";
import type { ThemeSummary } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ⌘K PROCURA EM TUDO — COM O QUE O BROWSER JÁ TEM, E NADA MAIS (BO 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A paleta só encontrava pedidos. Quem escrevia o nome de um casal à procura
 * da PROPOSTA dele, de uma tarefa, de uma marcação ou de um tema não recebia
 * nada — e ia procurar à mão, vista a vista.
 *
 * ── A REGRA DE CUSTO, QUE É A QUE DESENHA ESTE FICHEIRO ───────────────────
 *
 * Nenhum pedido novo ao servidor e nenhuma leitura nova ao Supabase. Cada
 * grupo vem de uma lista que o back office JÁ trouxe para a memória (o
 * `useCachedList` e a cache dos temas); o que ainda não veio não entra — e
 * não se vai buscar só para a procura. Por isso as fontes são todas
 * opcionais: `undefined` quer dizer «ainda não está na memória», e o grupo
 * simplesmente não aparece. Dizer «sem resultados» sobre uma lista que nunca
 * se leu seria afirmar uma coisa que não se sabe.
 *
 * Este módulo é PURO: recebe as listas e as portas de navegação, devolve os
 * grupos. Quem lê a cache é o `AdminClient`, no instante em que a paleta abre.
 */

/** Um resultado da procura: o que se mostra, onde se procura, e onde leva. */
export interface ItemDaProcura {
  id: string;
  label: string;
  hint?: string;
  /** Os textos onde a procura procura — os mesmos campos que a vista mostra. */
  campos: readonly unknown[];
  run: () => void;
}

export interface GrupoDaProcura {
  nome: string;
  itens: readonly ItemDaProcura[];
}

/** No máximo quatro por grupo: a paleta mostra-os todos sem rolar. */
export const MAX_POR_GRUPO = 4;

/** A proposta como a lista leve (`/api/propostas?semDoc=1`) a traz. */
export interface PropostaDaProcura {
  id: string;
  quoteId?: string;
  clientName?: string;
  clientEmail?: string;
  status?: ProposalStatus;
  sentAt?: string;
}

/** As listas que já estão na memória. Ausente = ainda não veio. */
export interface FontesDaProcura {
  propostas?: readonly PropostaDaProcura[];
  tarefas?: readonly Task[];
  calendario?: readonly CalendarEvent[];
  temas?: readonly ThemeSummary[] | null;
  contratos?: readonly ItemDosAceites[];
  fornecedores?: readonly Supplier[];
  material?: readonly MaterialItem[];
}

/** As portas: cada resultado abre o sítio certo pela navegação que já existe. */
export interface PortasDaProcura {
  proposta: (p: PropostaDaProcura) => void;
  tarefa: (t: Task) => void;
  marcacao: (e: CalendarEvent) => void;
  tema: (t: ThemeSummary) => void;
  contrato: (c: ItemDosAceites) => void;
  fornecedor: (s: Supplier) => void;
  material: (m: MaterialItem) => void;
}

/** Os nomes dos estados de uma proposta, como o resto do back office os diz. */
export const ROTULO_DA_PROPOSTA: Record<ProposalStatus, string> = {
  rascunho: "Por enviar",
  enviada: "Enviada",
  em_negociacao: "Em negociação",
  aceite: "Aceite",
  rejeitada: "Recusada",
};

/** «2027-03-12» → «12 mar. 2027». Ao meio-dia, para o fuso não mudar o dia. */
export function diaLegivel(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/** Uma lista que ainda não veio é `undefined`; uma que veio estragada também. */
const lista = <T>(x: readonly T[] | null | undefined): readonly T[] | undefined =>
  Array.isArray(x) ? x : undefined;

/**
 * Os grupos, a partir do que está na memória. Um grupo sem fonte não nasce;
 * um grupo com fonte vazia também não (não há nada para mostrar nele).
 */
export function montarGruposDaProcura(
  fontes: FontesDaProcura,
  abrir: PortasDaProcura,
): GrupoDaProcura[] {
  const grupos: GrupoDaProcura[] = [];
  const juntar = (nome: string, itens: ItemDaProcura[]) => {
    if (itens.length > 0) grupos.push({ nome, itens });
  };

  const propostas = lista(fontes.propostas);
  if (propostas)
    juntar(
      "Propostas",
      propostas.map((p) => ({
        id: `proposta-${p.id}`,
        label: p.clientName || "Proposta sem nome",
        hint: [p.status ? ROTULO_DA_PROPOSTA[p.status] : "", p.sentAt ? diaLegivel(p.sentAt) : ""]
          .filter(Boolean)
          .join(" · "),
        campos: [p.clientName, p.clientEmail, p.quoteId, p.id],
        run: () => abrir.proposta(p),
      })),
    );

  const tarefas = lista(fontes.tarefas);
  if (tarefas)
    juntar(
      "Tarefas",
      tarefas.map((t) => ({
        id: `tarefa-${t.id}`,
        label: t.title,
        hint: t.done ? "Feita" : t.dueDate ? `Até ${diaLegivel(t.dueDate)}` : t.clientName || "",
        campos: [t.title, t.clientName, t.assignee, t.area, t.notas],
        run: () => abrir.tarefa(t),
      })),
    );

  const calendario = lista(fontes.calendario);
  if (calendario)
    juntar(
      "Calendário",
      calendario.map((e) => ({
        id: `marcacao-${e.id}`,
        label: e.title,
        hint: [diaLegivel(e.date), e.time ?? ""].filter(Boolean).join(" · "),
        campos: [e.title, e.note],
        run: () => abrir.marcacao(e),
      })),
    );

  const temas = lista(fontes.temas);
  if (temas)
    juntar(
      "Temas",
      temas
        // Um tema arquivado está fora da lista principal dos Temas: a procura
        // não o traz de volta pela porta das traseiras.
        .filter((t) => !t.arquivado)
        .map((t) => ({
          id: `tema-${t.id}`,
          label: t.name,
          hint:
            typeof t.imageCount === "number"
              ? `${t.imageCount} foto${t.imageCount === 1 ? "" : "s"}`
              : "",
          campos: [t.name, t.notes],
          run: () => abrir.tema(t),
        })),
    );

  const contratos = lista(fontes.contratos);
  if (contratos)
    juntar(
      "Contratos",
      contratos.map((c) => ({
        id: `contrato-${c.id}`,
        label: c.clientName || "Sem nome",
        hint: c.tipo === "contrato" ? "Contrato" : "Sem contrato",
        campos: [c.clientName, c.clientEmail, c.quoteId],
        run: () => abrir.contrato(c),
      })),
    );

  const fornecedores = lista(fontes.fornecedores);
  if (fornecedores)
    juntar(
      "Fornecedores",
      fornecedores.map((s) => ({
        id: `fornecedor-${s.id}`,
        label: s.name,
        hint: s.category,
        campos: [s.name, s.category, s.email, s.phone, s.location],
        run: () => abrir.fornecedor(s),
      })),
    );

  const material = lista(fontes.material);
  if (material)
    juntar(
      "Material",
      material.map((m) => ({
        id: `material-${m.id}`,
        label: m.name,
        hint: m.category,
        campos: [m.name, m.category, m.notes],
        run: () => abrir.material(m),
      })),
    );

  return grupos;
}

/**
 * Os resultados de uma procura: só com texto escrito (sem texto a paleta é a
 * navegação, e cinquenta tarefas por baixo dela eram ruído), e no máximo
 * `MAX_POR_GRUPO` por grupo, pela ordem em que a lista os tem.
 */
export function procurarNosGrupos(
  procura: string,
  grupos: readonly GrupoDaProcura[],
): { id: string; label: string; hint?: string; group: string; run: () => void }[] {
  const q = procura.trim();
  if (!q) return [];
  const saida: { id: string; label: string; hint?: string; group: string; run: () => void }[] = [];
  for (const g of grupos) {
    let n = 0;
    for (const item of g.itens) {
      if (n >= MAX_POR_GRUPO) break;
      if (!casaComAProcura(q, item.campos)) continue;
      saida.push({
        id: item.id,
        label: item.label,
        hint: item.hint || undefined,
        group: g.nome,
        run: item.run,
      });
      n++;
    }
  }
  return saida;
}

/**
 * ── UM PEDIDO DA PALETA É SERVIDO UMA VEZ ──────────────────────────────────
 *
 * A paleta pede a uma vista que abra uma coisa («esta tarefa», «este tema»).
 * As vistas só existem enquanto estão à frente, e voltam a montar sempre que
 * se regressa a elas — com o mesmo pedido nas propriedades. Sem memória,
 * voltar às Tarefas uma hora depois reabria a tarefa que a paleta pediu de
 * manhã.
 *
 * A memória é a IDENTIDADE do objecto: cada escolha na paleta cria um pedido
 * novo, e um pedido já servido não se serve outra vez, monte a vista as vezes
 * que montar. Um `WeakSet` e não um contador: não há nada para limpar.
 */
const servidos = new WeakSet<object>();

/**
 * O que a paleta pede a uma vista. Um objecto NOVO a cada escolha — é a
 * identidade dele que o `servirUmaVez` lembra.
 *
 *  · `id`      — abrir esta coisa (a tarefa, a marcação, o tema);
 *  · `procura` — abrir a vista já filtrada por este texto (propostas,
 *                contratos, fornecedores, material: as vistas que não têm
 *                detalhe próprio abrem-se na linha certa pela procura delas);
 *  · `novo`    — começar uma nova (tarefa, marcação).
 */
export interface PedidoDaPaleta {
  id?: string;
  procura?: string;
  novo?: boolean;
}

export function servirUmaVez<P extends object>(
  pedido: P | null | undefined,
  servir: (p: P) => void,
): void {
  if (!pedido || servidos.has(pedido)) return;
  servidos.add(pedido);
  servir(pedido);
}
