import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import type { QuoteStatus } from "@/lib/orcamento/types";
import type { OrdemDosPedidos } from "./filtros-dos-pedidos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FILTRO E A ORDEM QUE A EQUIPA USOU DA ÚLTIMA VEZ, NESTE APARELHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista de pedidos lembra-se, por aparelho, do estado por que se filtrou e da
 * ordem escolhida. O `localStorage` é uma FRONTEIRA: o que lá está pode ser de
 * uma versão antiga, de outra aplicação no mesmo domínio ou lixo. Por isso o que
 * se lê passa por aqui antes de entrar no estado — um valor que não se conhece
 * dá `undefined`, e quem chama fica com o de omissão.
 *
 * As ordens possíveis eram escritas à mão no `AdminClient` (seis comparações
 * presas à mão ao tipo `OrdemDosPedidos`). Passam a vir da mesma lista que o
 * tipo, para não poderem divergir.
 */

/** As chaves no `localStorage` (os nomes de sempre: mudá-los perdia a escolha). */
export const CHAVE_DO_FILTRO = "liquen-admin-filter";
export const CHAVE_DA_ORDEM = "liquen-admin-sort";

/** Todas as ordens da lista, pela mesma ordem do menu. */
export const ORDENS_DOS_PEDIDOS = [
  "espera",
  "recent",
  "old",
  "value",
  "followup",
  "eventdate",
] as const satisfies readonly OrdemDosPedidos[];

/** Um texto de fora → uma ordem conhecida, ou `undefined`. */
export function ordemGuardada(valor: string | null): OrdemDosPedidos | undefined {
  return ORDENS_DOS_PEDIDOS.find((o) => o === valor);
}

/** Os seis estados são as chaves de `ROTULO_DO_ESTADO` — a lista que já existe. */
function eEstadoDoPedido(valor: string): valor is QuoteStatus {
  return Object.hasOwn(ROTULO_DO_ESTADO, valor);
}

/** Um texto de fora → «todos» ou um estado conhecido, ou `undefined`. */
export function filtroGuardado(valor: string | null): QuoteStatus | "all" | undefined {
  if (valor === "all") return "all";
  return valor !== null && eEstadoDoPedido(valor) ? valor : undefined;
}
