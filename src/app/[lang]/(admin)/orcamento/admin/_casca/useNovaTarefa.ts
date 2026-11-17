"use client";

import { useCallback, useState } from "react";
import type { View } from "../nav";

/**
 * ── A ACÇÃO PRIMÁRIA DAS TAREFAS VIVE NA BARRA, COMO NAS OUTRAS VISTAS ──
 *
 * «Não há ação primária na toolbar. Todos os outros ecrãs têm "+ Novo".
 * Este não tem — porque a criação está num cartão permanente no conteúdo.»
 *
 * A regra é uma acção primária e uma só, sempre no fim da barra, e a
 * consistência entre ecrãs é o que faz um produto ler-se como um produto.
 *
 * O que desce até às `Tarefas` é um CONTADOR e não uma função: a caixa de
 * escrever vive dentro delas (é a última linha da lista, ver a fase 03 do
 * documento dela), e o que a barra faz é pedir-lhe que abra. Um contador
 * porque carregar duas vezes seguidas tem de pedir duas vezes — um booleano
 * ficava preso a `true` e o segundo toque não fazia nada.
 */
export interface PedidoDeNovaTarefa {
  /** Quantas vezes a barra pediu uma tarefa nova. */
  pedido: number;
  /** O último pedido que as Tarefas já serviram. */
  servido: number;
  /** As Tarefas dizem que serviram o pedido `n`. */
  servir: (n: number) => void;
}

export function useNovaTarefa(view: View): {
  pedirNovaTarefa: () => void;
  novaTarefa: PedidoDeNovaTarefa;
} {
  const [pedido, setPedido] = useState(0);
  const pedirNovaTarefa = useCallback(() => setPedido((n) => n + 1), []);
  /* Um toque dado enquanto o código das Tarefas ainda chega fica à espera e é
     servido quando montam. */
  const [servido, setServido] = useState(0);
  /* Um toque que ficou à espera e a pessoa saiu das Tarefas antes de elas
     montarem: dá-se por servido, para não abrir a linha de escrever horas
     depois, ao voltar (revisão independente do lote de 17/11). Ajusta-se o
     estado durante o desenho, que é o padrão do React para isto. */
  if (view !== "tarefas" && servido !== pedido) setServido(pedido);
  return { pedirNovaTarefa, novaTarefa: { pedido, servido, servir: setServido } };
}
