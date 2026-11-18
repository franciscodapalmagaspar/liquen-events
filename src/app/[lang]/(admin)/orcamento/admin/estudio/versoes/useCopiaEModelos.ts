"use client";
import { mesmoValorAoCentimo } from "@/lib/money";
import { useState } from "react";
import { useToast } from "../../Toast";
import { parseMoneyText } from "@/lib/proposal-doc";
import { type Escolha } from "../../CriarAPartirDe";
import { eur } from "@/lib/money";
import { type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import type { EstadoDosUrls } from "../tipos";
import { baseDoDoc } from "@/lib/orcamento/estudio/dinheiro-do-documento";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { useCamposPorConfirmar } from "./useCamposPorConfirmar";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useConfirmacoes } from "../documento/useConfirmacoes";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaCopiaEModelos {
  camposPorConfirmar: ReturnType<typeof useCamposPorConfirmar>;
  confirmacoes: ReturnType<typeof useConfirmacoes>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  hidratarAssets: (
    vivo?: () => boolean,
    opcoes?: { daAbertura?: boolean },
  ) => Promise<EstadoDosUrls>;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useCopiaEModelos({
  camposPorConfirmar,
  confirmacoes,
  documento,
  hidratarAssets,
  reversiveis,
  setRefEdited,
  toast,
  total,
}: EntradaCopiaEModelos) {
  const { setPorConfirmar } = camposPorConfirmar;
  const { registarNoHistorico } = confirmacoes;
  const { doc, setDoc } = documento;
  const { setLimpo } = reversiveis;
  const { persistirPreco, setTotalInput, totalInput } = total;
  const [copiarAberto, setCopiarAberto] = useState(false);
  const [copiaSubstitui, setCopiaSubstitui] = useState<string | null>(null);
  /** Caixa do nome, aberta pelo "Guardar como modelo" do cabeçalho. */
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);

  /** O documento copiado passa a ser este, com os campos a confirmar marcados. */
  /**
   * Copiar uma proposta antiga para cima desta.
   *
   * Também mexe no preço final, e por isso também tem de ser reversível e
   * ficar no histórico. A PERGUNTA já existe e é melhor do que uma caixa: o
   * `CriarAPartirDe` mostra de quem é a proposta a copiar antes de a aplicar, e
   * os cinco campos que mudam de casamento para casamento ficam marcados a
   * laranja até ela lhes tocar (ver `porConfirmar`). Duas perguntas sobre o
   * mesmo gesto seriam uma a mais.
   */
  function aplicarCopia(e: Escolha) {
    const anterior = parseMoneyText(totalInput);
    const copiado = e.doc as StudioDoc;
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: `Proposta copiada de ${e.nomeDaOrigem}.`,
    });
    setDoc(copiado);
    // As fotografias da cópia são caminhos que este ecrã ainda não conhece:
    // sem ir buscar as miniaturas, ficavam a cinzento («não veio») até
    // recarregar a página (auditoria de 13/11, estúdio n.º 12). O mesmo
    // `hidratarAssets` da cópia de um mood board.
    void hidratarAssets();
    // O campo do valor é estado à parte (aceita texto a meio de ser escrito),
    // por isso não acompanha o documento de graça: ficava a mostrar o número
    // ANTERIOR enquanto o documento copiado já tinha outro — ou nenhum. E,
    // como no repor, o valor GRAVA-SE no pedido: sem isto o estúdio dizia um
    // número e a Gestão do pedido, o Kanban e o dossier diziam outro.
    const base = baseDoDoc(copiado);
    const temValor = typeof base === "number" && base > 0;
    setTotalInput(temValor ? textoDoTotal(base!) : "");
    // Com o documento COPIADO — ver `baseDoEcraParaOPedido`.
    persistirPreco(temValor ? base : undefined, { doc: copiado });
    setPorConfirmar(new Set(e.camposAMudar));
    // O título interno volta a gerar-se sozinho: a cópia esvaziou-o de
    // propósito para não ficar com o nome do casal anterior no cabeçalho.
    setRefEdited(false);
    const partilha =
      e.fotosPartilhadas > 0
        ? ` ${e.fotosPartilhadas} foto(s) ficaram na pasta da proposta antiga.`
        : "";
    if (!mesmoValorAoCentimo(temValor ? base! : 0, anterior)) {
      registarNoHistorico(
        `Proposta copiada de ${e.nomeDaOrigem} no estúdio: preço final de ${eur(anterior)} para ${eur(temValor ? base! : 0)}.`,
      );
    }
    toast(
      `Copiado de ${e.nomeDaOrigem}. Confirma o que está marcado.${partilha}`,
      e.fotosPartilhadas > 0 ? "error" : "success",
    );
  }

  /**
   * A validade desta proposta passa a ser a de todas as novas.
   *
   * A missão pede um valor por omissão «configurável», e a forma mais barata
   * de o configurar é a partir do sítio onde ela já está a decidir o número —
   * em vez de um ecrã de definições que é preciso ir procurar.
   */
  async function guardarValidadePadrao(dias: number) {
    try {
      const r = await fetch("/api/propostas/preferencias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntilDays: dias }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar.");
      toast(`As propostas novas passam a valer ${dias} dias.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar.", "error");
    }
  }

  /** Guarda ESTA proposta como modelo reutilizável, com o nome que ela der. */
  async function guardarComoModelo(nome: string) {
    const limpo = nome.trim();
    if (!limpo) return;
    try {
      const r = await fetch("/api/propostas/modelos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O documento vai TAL COMO ESTÁ, com o nome e a data deste casal lá
        // dentro. Não faz mal: quem o usar passa pelo `copiarParaPedido`, que
        // é o mesmo caminho de qualquer proposta anterior e substitui tudo o
        // que é de outra pessoa. Limpar aqui seria uma segunda regra a poder
        // discordar da primeira.
        body: JSON.stringify({ nome: limpo, tipo: "completo", doc, origem: doc.clientNames }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error ?? "Não deu para guardar o modelo.");
      setNomeModelo(null);
      toast(`Modelo «${limpo}» guardado.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para guardar o modelo.", "error");
    }
  }

  return {
    aplicarCopia,
    copiaSubstitui,
    copiarAberto,
    guardarComoModelo,
    guardarValidadePadrao,
    nomeModelo,
    setCopiaSubstitui,
    setCopiarAberto,
    setNomeModelo,
  };
}
