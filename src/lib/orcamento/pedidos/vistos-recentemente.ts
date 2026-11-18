/**
 * ════════════════════════════════════════════════════════════════════════════
 * «VISTOS RECENTEMENTE» — OS ÚLTIMOS PEDIDOS ABERTOS NESTE APARELHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A paleta (⌘K) mostra os últimos seis pedidos que ela abriu. A lista vive no
 * `localStorage`, e era lida em dois sítios com um `JSON.parse` sem verificação
 * nenhuma: o que lá estivesse entrava no estado tal e qual. Uma entrada sem
 * `id`, ou um objecto em vez de uma lista, chegava à paleta.
 *
 * Agora a leitura e a escrita são estas duas funções puras: o que não tem a
 * forma de um `PedidoVistoRecentemente` fica de fora, e a lista nunca passa
 * do tecto.
 */

export const CHAVE_DOS_VISTOS = "liquen-recent-quotes";

/** Quantos pedidos a paleta lembra. */
export const VISTOS_NO_MAXIMO = 6;

export interface PedidoVistoRecentemente {
  id: string;
  name: string;
  email: string;
  status: string;
}

function eVisto(valor: unknown): valor is PedidoVistoRecentemente {
  if (typeof valor !== "object" || valor === null) return false;
  const campos: Partial<Record<keyof PedidoVistoRecentemente, unknown>> = valor;
  return (
    typeof campos.id === "string" &&
    campos.id !== "" &&
    typeof campos.name === "string" &&
    typeof campos.email === "string" &&
    typeof campos.status === "string"
  );
}

/** O texto guardado → a lista, só com as entradas que têm a forma certa. */
export function lerVistos(texto: string | null): PedidoVistoRecentemente[] {
  if (!texto) return [];
  let valor: unknown;
  try {
    valor = JSON.parse(texto);
  } catch {
    return [];
  }
  return Array.isArray(valor) ? valor.filter(eVisto).slice(0, VISTOS_NO_MAXIMO) : [];
}

/** Põe `visto` à cabeça, sem repetir o mesmo pedido, até ao tecto. */
export function juntarAosVistos(
  antes: readonly PedidoVistoRecentemente[],
  visto: PedidoVistoRecentemente,
): PedidoVistoRecentemente[] {
  return [visto, ...antes.filter((r) => r.id !== visto.id)].slice(0, VISTOS_NO_MAXIMO);
}
