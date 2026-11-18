import { type Dispatch, type SetStateAction } from "react";
import { type LeituraDoPedido } from "@/lib/orcamento/pedidos/leitura-do-pedido";
import { type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { type LeituraFalhada } from "@/lib/porque-nao-leu";
import { type AccoesDosPedidos } from "../_pedidos/accoes-dos-pedidos";
import { type View } from "../nav";
import { type PedidoDaPaleta } from "../procura-em-tudo";
import { type PedidoDeNovaTarefa } from "./useNovaTarefa";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE AS VISTAS RECEBEM — dois grupos, e não 25 props soltas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As vistas da casca (Pedidos, Calendário, Tarefas, Clientes…) recebiam 25
 * props do `AdminClient`, e a `VistasDaOperacao` recebia de novo 11 delas.
 * Passam a dois grupos: os PEDIDOS (a lista e o que se faz a um pedido) e a
 * NAVEGAÇÃO (onde se está, para onde se vai, e o que se leva). Nenhuma das
 * vistas usa `memo`: objectos novos a cada desenho não mudam o que se desenha.
 */

/** A lista dos pedidos e o que as vistas podem fazer a um pedido. */
export interface PedidosDasVistas {
  quotes: Quote[];
  activeQuotes: Quote[];
  nomesDosPedidos: Map<string, string>;
  archivedCount: number;
  falhaDosPedidos: LeituraFalhada | null;
  substituirPedido: AccoesDosPedidos["substituirPedido"];
  alterarPedido: AccoesDosPedidos["alterarPedido"];
  refletirEstadoDoEstudio: (id: string, status: QuoteStatus) => void;
  /** O estúdio gravou o pedido: a lista troca-o, e o preço do painel segue-o se for o aberto. */
  refletirPrecoDoEstudio: (q: Quote) => void;
  marcarDesfecho: (actualizado: Quote) => void;
  revalidarPedidos: (forcar?: boolean) => Promise<void>;
  verArquivados: () => void;
  comPedidoInteiro: (q: Quote) => Promise<LeituraDoPedido>;
  abrirCliente: (pedido: Quote) => void;
  openQuote: (pedido: Quote) => Promise<void>;
}

/** Onde se está, para onde se vai, e o que se leva na viagem. */
export interface NavegacaoDasVistas {
  view: View;
  setView: Dispatch<SetStateAction<View>>;
  pedidoPara: (v: View) => PedidoDaPaleta | undefined;
  irComPedido: (vista: View, pedido: PedidoDaPaleta) => void;
  propostaPara: string | null;
  setPropostaPara: Dispatch<SetStateAction<string | null>>;
  setNewQuoteOpen: Dispatch<SetStateAction<boolean>>;
  novaTarefa: PedidoDeNovaTarefa;
}
