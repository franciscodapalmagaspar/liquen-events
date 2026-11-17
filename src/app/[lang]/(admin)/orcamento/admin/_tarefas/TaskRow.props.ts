import type { Task } from "@/lib/orcamento/types";

/** As propriedades de uma linha da lista (`TaskRow`). */
export type PropsDaLinha = {
  t: Task;
  /**
   * O nome do evento: o do PEDIDO quando a tarefa o tem, senão o `clientName`
   * (ver `nomeDoEvento`). Uma tarefa gravada sem `clientName` mostrava a linha
   * sem nome nenhum, com o grupo por cima a dizê-lo (revisão de 14/11). Uma
   * string, e não o mapa, para o `memo` da linha continuar a valer.
   */
  nomeDoCliente: string;
  overdue: boolean;
  /**
   * ── A COSTURA DO ARRASTAR, E ONDE ELA FICA ──────────────────────────────
   *
   * A fase 06 entrega «ordenação manual ACTIVA o arrastar»; o arrasto em si é
   * a fase 09. Enquanto ela não chega, o que a linha ganha é a MARCA de que
   * está arrastável — `data-arrastavel` — e mais nada: nem cursor de mão, nem
   * pega desenhada. Um cursor `grab` por cima de uma linha que não se agarra é
   * uma promessa falsa, e três botões no hover de uma linha são proibição da
   * Parte 8.
   *
   * ── E A FASE 09 CHEGOU ──────────────────────────────────────────────────
   *
   * A marca continua a ser a mesma (`data-arrastavel`), e agora traz com ela o
   * `draggable` e os quatro manipuladores. O que NÃO veio foi a pega desenhada:
   * a linha inteira agarra-se, que é o que os Lembretes fazem, e uma pega de
   * seis pontinhos seria o terceiro controlo de uma linha que a Parte 8 quer
   * com um.
   */
  arrastavel: boolean;
  /** A linha que o painel de detalhe está a mostrar. */
  escolhida: boolean;
  /** Está no lote das acções em várias tarefas (BO 4). */
  seleccionada: boolean;
  /**
   * Há um lote a ser escolhido — por ⇧/⌘+clique ou pelo botão «Selecionar»
   * (o caminho do dedo). Enquanto há, tocar no título soma ou tira a tarefa
   * do lote em vez de abrir o detalhe, e o título diz isso a quem ouve o ecrã.
   */
  aSeleccionar: boolean;
  /** Onde é que a linha arrastada vai entrar, se for aqui. */
  marca: "antes" | "depois" | null;
  /** Esta é a linha que está a ser arrastada neste momento. */
  aArrastar: boolean;
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onRemove: (id: string) => void;
  onEscolher: (t: Task, mods?: { estender: boolean; somar: boolean }) => void;
  /** «Hoje» e «Amanhã» do menu — o prazo sem abrir o editor. */
  onPrazo: (t: Task, quando: "hoje" | "amanha") => void;
  /** A alternativa ao arrasto, que nunca pode ser o único caminho. [APPLE] */
  onMover: (id: string, direccao: -1 | 1) => void;
  /**
   * Os quatro momentos do arrasto, num objecto só: são estáveis, chegam do
   * ecrã, e passá-los soltos era quadruplicar a lista de propriedades de uma
   * linha que está atrás de um `memo()`.
   */
  onArrastar: {
    comecar: (e: React.DragEvent<HTMLElement>) => void;
    porCima: (e: React.DragEvent<HTMLElement>) => void;
    largar: (e: React.DragEvent<HTMLElement>) => void;
    acabar: () => void;
  };
};
