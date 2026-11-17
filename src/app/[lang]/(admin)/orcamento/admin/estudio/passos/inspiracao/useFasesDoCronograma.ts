"use client";
import { move } from "@/lib/orcamento/estudio/listas";
import { useDocumentoDoEstudio } from "../../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../../documento/useAccoesReversiveis";

export interface EntradaFasesDoCronograma {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  totalInput: string;
}

export function useFasesDoCronograma({
  documento,
  reversiveis,
  totalInput,
}: EntradaFasesDoCronograma) {
  const { doc, setDoc } = documento;
  const { setARemover, setLimpo } = reversiveis;

  // ── Cronograma (organizacao) ──
  function addPhase() {
    setDoc((d) => ({ ...d, cronograma: [...(d.cronograma ?? []), { title: "", items: [] }] }));
  }
  function updatePhase(pi: number, p: Partial<{ title: string; items: string[] }>) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) => (i === pi ? { ...ph, ...p } : ph)),
    }));
  }
  /**
   * Remover uma fase — COM PERGUNTA, pela mesma razão da página de inspiração.
   *
   * Uma fase não é uma linha: é um título e a lista de tarefas que lhe está
   * dentro, e o «×» que a apaga fica ao lado dos «×» das tarefas, dois
   * centímetros acima e do mesmo tamanho. Carregar no de cima em vez do de
   * baixo levava seis tarefas escritas à mão sem dizer nada a ninguém.
   *
   * Rara (um cronograma tem três ou quatro fases, escritas uma vez) e cara
   * (voltar a escrever a lista toda) — portanto pergunta. E a pergunta conta as
   * tarefas, que é exactamente o que o cartão não mostra quando a fase está
   * cheia e o ecrã cortado.
   *
   * A fase que ainda não tem nome nem tarefas sai sem perguntar: uma fase
   * acabada de acrescentar por engano não é trabalho a proteger.
   */
  function removePhase(pi: number) {
    const ph = (doc.cronograma ?? [])[pi];
    const apagar = () =>
      setDoc((d) => ({ ...d, cronograma: (d.cronograma ?? []).filter((_, i) => i !== pi) }));
    if (!ph) return;
    const nome = (ph.title ?? "").trim();
    const escritas = (ph.items ?? []).filter((it) => (it ?? "").trim() !== "");
    if (nome === "" && escritas.length === 0) {
      apagar();
      return;
    }
    // A MESMA regra do gerador: uma fase sem tarefas não imprime nada, e um
    // cronograma sem nenhuma fase com tarefas não tem página nenhuma no PDF
    // (o PDF salta-a — ver o cronograma em `pdf-editorial/plano.ts`). Se esta é a última que
    // ainda tem tarefas, o documento perde uma folha inteira — e isso é a
    // consequência que decide a resposta.
    const comTarefas = (doc.cronograma ?? []).filter((f) =>
      (f.items ?? []).some((it) => (it ?? "").trim() !== ""),
    ).length;
    const ultima = escritas.length > 0 && comTarefas === 1;
    const conta =
      escritas.length > 0
        ? `Leva com ela ${escritas.length} ${escritas.length === 1 ? "tarefa" : "tarefas"}` +
          (ultima ? ", e o cronograma deixa de ter página no PDF." : " do cronograma.")
        : "Ainda não tem tarefas nenhumas — leva o título, e mais nada.";
    setARemover({
      chave: `fase:${pi}`,
      pergunta: `Remover a fase «${nome || `fase ${pi + 1}`}»? ${conta}`,
      docNoMomento: doc,
      aplicar: apagar,
    });
  }
  function movePhase(pi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, cronograma: move(d.cronograma ?? [], pi, dir) }));
  }
  function addPhaseItem(pi: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: [...ph.items, ""] } : ph,
      ),
    }));
  }
  function updatePhaseItem(pi: number, ii: number, value: string) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.map((it, j) => (j === ii ? value : it)) } : ph,
      ),
    }));
  }
  /**
   * Remover uma tarefa — ANULAR, e não pergunta.
   *
   * É o gesto frequente desta secção: escreve-se a lista de uma fase às
   * apalpadelas, acrescentam-se cinco tarefas e tiram-se duas. Refazer uma é
   * escrever outra vez meia dúzia de palavras. Uma caixa por cada «×» seria
   * cinco caixas para compor uma fase — e uma caixa respondida cinco vezes
   * seguidas deixa de ser lida, o que é o oposto do que ela existe para fazer.
   *
   * Vai pela anulação dos dez segundos que já serve o «Limpar» e o «×» das
   * fotografias (`setLimpo`): guarda o documento inteiro antes de mexer, e a
   * barra diz QUAL tarefa saiu e com quantas a fase fica.
   *
   * A tarefa em branco sai calada — não há nada para trazer de volta.
   */
  function removePhaseItem(pi: number, ii: number) {
    const ph = (doc.cronograma ?? [])[pi];
    const tarefa = (ph?.items ?? [])[ii] ?? "";
    if (tarefa.trim() !== "") {
      const ficam = (ph?.items ?? []).filter((_, j) => j !== ii).length;
      const fase = (ph?.title ?? "").trim();
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Tarefa «${tarefa.trim()}» removida` +
          (fase ? ` de «${fase}»` : "") +
          ` — a fase fica com ${ficam}.`,
      });
    }
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph2, i) =>
        i === pi ? { ...ph2, items: ph2.items.filter((_, j) => j !== ii) } : ph2,
      ),
    }));
  }

  return {
    addPhase,
    addPhaseItem,
    movePhase,
    removePhase,
    removePhaseItem,
    updatePhase,
    updatePhaseItem,
  };
}
