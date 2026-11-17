import { casaComAProcura } from "@/lib/procura";
import { contextoDeLocal, diasDeEspera, porEspera } from "@/lib/orcamento/espera";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS FILTROS E A ORDEM DA LISTA DE PEDIDOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que a lista mostra, por que ordem, e como se diz o que a está a esconder —
 * as três perguntas, puras. Viviam dentro do `AdminClient.tsx` (um `useMemo` de
 * noventa linhas e duas contas soltas); saíram na fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md` sem mudar uma regra.
 */

/**
 * A ordem por omissão é a ESPERA, não a data de entrada: «mais recentes» põe à
 * cabeça o que acabou de chegar — que é o que menos urge.
 */
export type OrdemDosPedidos = "espera" | "recent" | "old" | "value" | "followup" | "eventdate";

/** Um corte e não uma lista de valores: «há três dias ou mais». */
export type FiltroDeEspera = "all" | "3" | "7";

export interface FiltrosDosPedidos {
  estado: QuoteStatus | "all";
  etiqueta: string | null;
  categoria: string;
  espera: FiltroDeEspera;
  mes: string;
  regiao: string;
  planner: string;
  arquivados: boolean;
  soOsMeus: boolean;
  /** O texto da procura (no ecrã, o valor ADIADO — ver `useDeferredValue`). */
  procura: string;
  ordem: OrdemDosPedidos;
}

/**
 * A lista filtrada e ordenada.
 *
 * `quem` é o nome de quem está a ver — é o «só os meus».
 */
export function filtrarEOrdenarPedidos(
  quotes: readonly Quote[],
  f: FiltrosDosPedidos,
  quem: string,
): Quote[] {
  const q = f.procura.trim().toLowerCase();
  let list = quotes.filter((x) => (f.arquivados ? x.archived : !x.archived));
  if (!f.arquivados && f.estado !== "all") {
    list = list.filter((x) => x.status === f.estado);
  }
  if (f.categoria !== "all") {
    list = list.filter((x) => x.category === f.categoria);
  }
  if (f.soOsMeus) {
    list = list.filter((x) => x.assignedTo === quem);
  }
  if (f.espera !== "all") {
    const corte = Number(f.espera);
    list = list.filter((x) => (diasDeEspera(x) ?? -1) >= corte);
  }
  if (f.mes !== "all") {
    list = list.filter((x) => (x.date ?? "").slice(0, 7) === f.mes);
  }
  if (f.regiao !== "all") {
    list = list.filter((x) => contextoDeLocal(x).regiao === f.regiao);
  }
  if (f.planner !== "all") {
    list = list.filter((x) => (x.company ?? "").trim() === f.planner);
  }
  if (f.etiqueta) {
    const etiqueta = f.etiqueta;
    list = list.filter((x) => (x.tags ?? []).includes(etiqueta));
  }
  if (q) {
    // Sem acentos e com o telefone em qualquer formato — ver `procura.ts`
    // (achado n.º 10: «evora» dava zero resultados).
    list = list.filter((x) =>
      casaComAProcura(q, [
        x.name,
        x.email,
        x.phone,
        x.company,
        x.location,
        x.id,
        x.assignedTo,
        x.contractRef,
        ...(x.tags ?? []),
      ]),
    );
  }
  return ordenarPedidos(list, f.ordem);
}

const MAIS_RECENTE_PRIMEIRO = (a: Quote, b: Quote) =>
  +new Date(b.submittedAt) - +new Date(a.submittedAt);

/** Uma cópia ordenada; a lista de entrada não se toca. */
export function ordenarPedidos(list: readonly Quote[], ordem: OrdemDosPedidos): Quote[] {
  const sorted = [...list];
  if (ordem === "espera") sorted.sort((a, b) => porEspera(a, b));
  else if (ordem === "recent") sorted.sort(MAIS_RECENTE_PRIMEIRO);
  else if (ordem === "old")
    sorted.sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));
  else if (ordem === "followup")
    // Os que pedem seguimento sobem, o mais atrasado primeiro; os que não têm
    // data de seguimento descem (o mais recente primeiro entre eles).
    sorted.sort((a, b) => {
      const av = a.followUpAt ?? "9999-99-99";
      const bv = b.followUpAt ?? "9999-99-99";
      if (av !== bv) return av < bv ? -1 : 1;
      return MAIS_RECENTE_PRIMEIRO(a, b);
    });
  else if (ordem === "eventdate")
    // Os eventos mais próximos primeiro; os sem data descem.
    sorted.sort((a, b) => {
      const av = a.date || "9999-99-99";
      const bv = b.date || "9999-99-99";
      if (av !== bv) return av < bv ? -1 : 1;
      return MAIS_RECENTE_PRIMEIRO(a, b);
    });
  else
    sorted.sort(
      (a, b) =>
        (b.quotedPrice ?? b.priceBreakdown?.total ?? 0) -
        (a.quotedPrice ?? a.priceBreakdown?.total ?? 0),
    );
  return sorted;
}

/**
 * QUANTOS FILTROS DO PAINEL ESTÃO A ESCONDER PEDIDOS — o número ao lado do
 * botão «Filtros».
 *
 * Não entram: a ORDEM (muda a ordem, não tira nada), e o ESTADO, as ETIQUETAS
 * e os ARQUIVADOS, que já estão à vista em pastilhas próprias.
 */
export function filtrosDoPainelActivos(
  f: Pick<FiltrosDosPedidos, "soOsMeus" | "categoria" | "espera" | "mes" | "regiao" | "planner">,
): number {
  return (
    (f.soOsMeus ? 1 : 0) +
    (f.categoria !== "all" ? 1 : 0) +
    (f.espera !== "all" ? 1 : 0) +
    (f.mes !== "all" ? 1 : 0) +
    (f.regiao !== "all" ? 1 : 0) +
    (f.planner !== "all" ? 1 : 0)
  );
}

/**
 * Está ALGUMA coisa a esconder pedidos? Serve a lista vazia, que tem de
 * distinguir «ainda não entrou nada» de «isto está filtrado».
 */
export function haFiltroAActuar(
  f: Pick<FiltrosDosPedidos, "procura" | "estado" | "etiqueta" | "arquivados">,
  doPainel: number,
): boolean {
  return (
    doPainel > 0 ||
    f.procura.trim() !== "" ||
    f.estado !== "all" ||
    f.etiqueta !== null ||
    f.arquivados
  );
}

/**
 * O que está a esconder os pedidos, por extenso — «Nenhum pedido corresponde»
 * não diz o que fazer se não se souber o que está ligado.
 */
export function oQueEstaAFiltrar(
  f: Pick<FiltrosDosPedidos, "procura" | "estado" | "etiqueta" | "arquivados">,
  doPainel: number,
): string {
  const partes: string[] = [];
  if (f.procura.trim()) partes.push(`a pesquisa «${f.procura.trim()}»`);
  if (f.estado !== "all") partes.push("um estado");
  if (f.etiqueta) partes.push(`a etiqueta «${f.etiqueta}»`);
  if (f.arquivados) partes.push("os arquivados");
  if (doPainel > 0) {
    partes.push(doPainel === 1 ? "um filtro do painel" : `${doPainel} filtros do painel`);
  }
  if (partes.length === 0) return "";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** Os pedidos activos por estado, contados de uma vez (e não um `filter` por
 *  pastilha a cada desenho). */
export function contarPorEstado(quotes: readonly Quote[]): {
  counts: Record<string, number>;
  activeTotal: number;
} {
  const counts: Record<string, number> = {};
  let activeTotal = 0;
  for (const q of quotes) {
    if (q.archived) continue;
    activeTotal += 1;
    counts[q.status] = (counts[q.status] ?? 0) + 1;
  }
  return { counts, activeTotal };
}

/** Todas as etiquetas em uso, por ordem alfabética — sugestões e filtro. */
export function etiquetasEmUso(quotes: readonly Quote[]): string[] {
  const set = new Set<string>();
  for (const q of quotes) for (const t of q.tags ?? []) set.add(t);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
