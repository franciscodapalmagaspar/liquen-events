"use client";

import {
  createContext,
  useContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { type ActivityEntry, type Quote, type QuoteStatus } from "@/lib/orcamento/types";
import { type Avisar } from "../../Toast";
import { accoesDosPedidos } from "../accoes-dos-pedidos";
import { type DetailTab } from "../separadores-do-painel";
import { type EdicaoDoPedido } from "../useEdicaoDoPedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO ABERTO — o que todas as peças do painel partilham
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do pedido são treze componentes, e quase todos precisavam das
 * mesmas coisas: o pedido, a edição, quem está a usar, e uma maneira de mudar
 * o pedido. Essa maneira eram o `setQuotes` e o `setSelected` do
 * `AdminClient`, passados por props a oito componentes — e cada um sabia a
 * forma da lista do pai e escrevia à mão o mesmo `prev.map(…)`.
 *
 * Agora as peças pedem o que usam a este contexto, e mudam o pedido por
 * ACÇÕES com nome:
 *
 *   · `alterarOAberto(remendo)` — muda campos do pedido aberto (a etiqueta, o
 *     plano, os pagamentos…) na lista e, se ainda for o aberto, no painel;
 *   · `substituirPedido(q)` — o servidor devolveu o pedido inteiro: troca-o na
 *     lista, e no painel SÓ se ainda for esse o aberto;
 *   · `mostrarPedido(q)` — troca-o na lista E abre-o (o arquivar, que fica no
 *     pedido que se arquivou).
 *
 * A diferença entre a segunda e a terceira já existia, e ficou com nome. A
 * primeira deixou de mudar o painel quando o pedido aberto já é outro (17/11).
 *
 * Nenhum filho do painel usa `memo`: passar por contexto em vez de props não
 * muda quando nem o que se desenha.
 */
export interface PedidoAberto {
  selected: Quote;
  edicao: EdicaoDoPedido;
  userName: string;
  locale: "pt" | "en";
  toast: Avisar;
  alterarOAberto: (remendo: Partial<Quote>) => void;
  substituirPedido: (q: Quote) => void;
  mostrarPedido: (q: Quote) => void;
  abrirDetailTab: (tab: DetailTab) => void;
  gestaoRef: RefObject<HTMLDivElement | null>;
  toolsRef: RefObject<HTMLDivElement | null>;
  appendActivity: (quoteId: string, entries: ActivityEntry[], oQue?: string) => Promise<boolean>;
  refletirEstadoDoEstudio: (id: string, status: QuoteStatus) => void;
  activeQuotes: Quote[];
}

const Contexto = createContext<PedidoAberto | null>(null);

/** O pedido aberto e as acções sobre ele. Só existe dentro do painel. */
export function usePedidoAberto(): PedidoAberto {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("usePedidoAberto fora do painel do pedido");
  return valor;
}

type Fonte = Omit<PedidoAberto, "alterarOAberto" | "substituirPedido" | "mostrarPedido"> & {
  setQuotes: Dispatch<SetStateAction<Quote[]>>;
  setSelected: Dispatch<SetStateAction<Quote | null>>;
  children: ReactNode;
};

/** O painel do pedido, com o pedido aberto à disposição de cada peça. */
export function OPedidoAberto({ setQuotes, setSelected, children, ...resto }: Fonte) {
  const { selected } = resto;
  const { substituirPedido, mostrarPedido, alterarPedido } = accoesDosPedidos(
    setQuotes,
    setSelected,
  );
  const valor: PedidoAberto = {
    ...resto,
    // O pedido é o deste desenho, e o remendo só chega ao painel se ele ainda
    // for o aberto. Uma ferramenta que acaba de gravar DEPOIS de ela ter
    // aberto outro pedido punha os pagamentos (ou os convidados, a checklist)
    // do primeiro no segundo — e a gravação seguinte do segundo levava-os
    // para o servidor (revisão independente de 17/11).
    alterarOAberto: (remendo) => alterarPedido(selected.id, remendo),
    substituirPedido,
    mostrarPedido,
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
