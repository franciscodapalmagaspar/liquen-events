"use client";
import { useEffect } from "react";
import { useToast } from "../../Toast";
import { useInscricaoNoRegisto } from "../../registo-de-gravacoes";
import { aquecerFotosEmSegundoPlano } from "../../theme-picker-cache";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { useDocumentoDoEstudio } from "./useDocumentoDoEstudio";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";

export interface EntradaDesfazer {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  guardarAgora: () => void;
  oRegistoFalaPorMim: ReturnType<typeof useInscricaoNoRegisto>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useDesfazer({
  documento,
  guardarAgora,
  oRegistoFalaPorMim,
  toast,
  total,
}: EntradaDesfazer) {
  const { doc, historicoRef, semMarcadoresMortos, setDoc, setPodeDesfazer } = documento;
  const { baseDoEcraParaOPedido, persistirPreco, precoEnviadoRef, setTotalInput } = total;

  /**
   * Volta ao documento anterior. Chamada pelo `Cmd/Ctrl+Z` e pelo botão
   * "Desfazer" — o teclado é um atalho, não o caminho.
   *
   * O último elemento do histórico É o documento actual (foi lá posto pela
   * gravação); por isso desfazer tira DOIS e usa o penúltimo.
   */
  function desfazer(): boolean {
    const h = historicoRef.current;
    const ultimo = h[h.length - 1];
    let anterior: StudioDoc;
    /**
     * Auditoria de 13/11 (estúdio, n.º 4): a fotografia só se tira 800 ms
     * depois de ela parar. Desfazer ANTES disso (apagou uma linha e carregou
     * logo ⌘Z) usava o penúltimo — e voltava DOIS passos atrás. Se o documento
     * de agora ainda não está no histórico, volta-se ao último, e o histórico
     * fica como está.
     */
    if (ultimo && JSON.stringify(ultimo) !== JSON.stringify(doc)) {
      anterior = ultimo;
    } else {
      if (h.length < 2) return false;
      anterior = h[h.length - 2];
      historicoRef.current = h.slice(0, -1);
    }
    setPodeDesfazer(historicoRef.current.length >= 2);
    anterior = semMarcadoresMortos(anterior);
    setDoc(anterior);
    // O campo do total é estado à parte (aceita texto a meio de ser escrito),
    // por isso tem de acompanhar — senão desfazer devolvia o documento antigo
    // e deixava o valor novo na caixa.
    const base = baseDoDoc(anterior);
    setTotalInput(base === undefined ? "" : textoDoTotal(base));
    // E o PEDIDO também (n.º 5): o valor desfeito voltava ao ecrã e ao PDF, mas
    // o «Preço final» do pedido — margem, Estatísticas, faturas — ficava com o
    // número desfeito.
    const doPedido = base == null ? undefined : baseDoEcraParaOPedido(base, anterior);
    if (doPedido !== precoEnviadoRef.current) persistirPreco(base, { doc: anterior });
    return true;
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      /**
       * ⌘/Ctrl+S — o MESMO gesto do botão «Guardar agora».
       *
       * É o atalho que toda a gente já tem nos dedos de outros programas, e o
       * que o browser faz com ele por omissão («guardar a página») não serve
       * aqui a ninguém — daí o `preventDefault`. Ao contrário do ⌘Z, vale
       * TAMBÉM com o cursor dentro de uma caixa de texto: é precisamente a
       * meio de escrever um parágrafo que apetece guardar, e não há um
       * «guardar» do browser dentro de um campo para lhe ficar no caminho.
       *
       * DENTRO DO BACK OFFICE ESTE ATALHO NÃO É DAQUI. Passou a ser o gesto
       * único, tratado pelo registo, que grava o estúdio E tudo o resto que
       * tenha coisa por gravar — e responde por todos de uma vez. Dois
       * tratadores para a mesma tecla dariam duas gravações e duas respostas
       * diferentes ao mesmo gesto, que é como se ensina uma pessoa a
       * desconfiar das duas.
       *
       * Fica aqui como recurso para quando o estúdio é montado FORA do registo
       * (o dossier do evento, um teste): um atalho que desaparecesse em
       * silêncio nesses sítios seria trocar uma duplicação por uma perda.
       */
      if (!oRegistoFalaPorMim && e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        guardarAgora();
        return;
      }
      if (e.key.toLowerCase() !== "z" || e.shiftKey) return;
      // Dentro de uma caixa de texto, o Cmd+Z do browser desfaz a escrita —
      // que é o que ela espera. Só se assume o comando fora dos campos, ou
      // quando o browser já não tem nada para desfazer nesse campo.
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (aEscrever) return;
      if (desfazer()) {
        e.preventDefault();
        toast("Desfeito.", "info");
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  /**
   * Depois de o estúdio assentar, vai buscando as miniaturas da biblioteca em
   * segundo plano. É neste ecrã que o seletor de temas se abre — uma vez por
   * mood board —, e é aqui que faz sentido pagar esse trabalho adiantado.
   *
   * Os travões (dados poupados, ligação lenta) estão no próprio
   * `aquecerFotosEmSegundoPlano`, não aqui: quem decide se vale a pena gastar
   * bytes é quem sabe como está a rede, não quem sabe que ecrã é este.
   */
  useEffect(() => {
    aquecerFotosEmSegundoPlano();
  }, []);

  return { desfazer };
}
