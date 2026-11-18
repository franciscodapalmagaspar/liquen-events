/** Os tipos que o estúdio e as suas peças partilham. */

import { type Passo } from "@/lib/orcamento/passos-do-estudio";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";

/**
 * Passos do fluxo guiado do estúdio — os cinco do documento dela (A2). O que
 * vive em cada passo, e o estado de cada um, está em `passos-do-estudio.ts`.
 */
export type Step = Passo;

/**
 * Em que pé está a leitura dos URL das fotografias.
 *
 * Três estados e não um booleano, porque a diferença entre «vem a caminho» e
 * «não veio» é a diferença entre esperar e agir — e era exactamente essa que o
 * ecrã não tinha (ver `estadoDosUrls`).
 */
export type EstadoDosUrls = "a-caminho" | "pronto" | "falhou";

/**
 * Para onde vai a fotografia que se escolher na biblioteca de temas.
 *
 * `substituir` é a posição a TROCAR no lugar: a foto escolhida entra ali em
 * vez de ir para o fim. Sem isto, trocar uma foto era removê-la, escolher
 * outra, e arrastá-la de volta ao sítio onde a primeira estava.
 */
export type DestinoDaFoto =
  | { kind: "board"; bi: number; substituir?: number }
  | { kind: "cover"; idx: number }
  /** Uma página do PDF (`fotosDasPaginas`): a foto vai para o lugar `lugar`. */
  | { kind: "pagina"; chave: string; lugar: number; max: number };

/** O que o «Fazer proposta» recebe de quem o monta (o `ProposalStudio`). */
export interface PropsDoEstudio {
  quote: Quote;
  /**
   * Os outros pedidos, só para o painel interno saber o que ela costuma cobrar
   * num casamento desta dimensão. Opcional: sem eles o estúdio funciona na
   * mesma e o aviso de "valor fora do habitual" simplesmente não aparece —
   * comparar com dois eventos seria pior do que não comparar.
   */
  quotes?: Quote[];
  onSent?: () => void;
  /**
   * O valor mudou aqui. O pai actualiza a sua cópia do pedido para o "Preço
   * final" da Gestão do pedido mostrar o mesmo número — porque é o MESMO
   * número: o estúdio grava-o no pedido, não guarda um segundo.
   */
  onQuoteUpdated?: (quote: Quote) => void;
  /**
   * O servidor mudou o ESTADO do pedido ao gravar o rascunho (6/11: «A
   * preparar proposta»). Só o estado, e não o pedido inteiro: a cópia que o
   * estúdio tem pode estar mais velha do que a do pai (o preço gravado entre
   * duas teclas), e devolvê-la inteira era desfazer essa gravação no ecrã.
   */
  onEstadoDoPedido?: (status: QuoteStatus) => void;
  /**
   * Para quem é a proposta, e as duas portas do pedido. Dado pelo «Fazer
   * proposta», o estúdio põe-no NA MESMA LINHA das suas acções — antes eram um
   * cartão inteiro, um traço e uma linha «Estúdio de propostas (PDF)» por cima
   * dos passos (360 px no computador, ~1 000 num telemóvel, antes do primeiro
   * campo). Pedido dela de 9/11: «está uma confusão brutal».
   */
  cliente?: { nome: string; onAbrirPedido: () => void; onTrocar: () => void };
}
