"use client";
import { useToast } from "../../Toast";
import { parseMoneyText } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import { randomId } from "../../util";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";
import { Button } from "../../ui";
import { useDocumentoDoEstudio } from "./useDocumentoDoEstudio";
import { useAccoesReversiveis } from "./useAccoesReversiveis";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";

export interface EntradaConfirmacoes {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
}

export function useConfirmacoes({
  documento,
  fotos,
  quote,
  reversiveis,
  toast,
  total,
}: EntradaConfirmacoes) {
  const { doc, semMarcadoresMortos, setDoc } = documento;
  const { setAssetCores, setAssetMedias, setAssetOriginais, setAssetUrls, setThemeOrigins } = fotos;
  const {
    aRemover,
    confirmacaoDeDinheiro,
    limpo,
    setARemover,
    setConfirmacaoDeDinheiro,
    setLimpo,
  } = reversiveis;
  const { persistirPreco, setTotalInput, totalInput } = total;

  /** Devolve o rascunho que o "Limpar" deitou fora. */
  function anularLimpeza() {
    if (!limpo) return;
    setDoc(semMarcadoresMortos(limpo.doc));
    setTotalInput(limpo.total);
    if (limpo.fotos) {
      const f = limpo.fotos;
      // O que entretanto chegou de novo fica; o que o «Limpar» levou volta.
      setAssetUrls((agora) => ({ ...f.urls, ...agora }));
      setAssetOriginais((agora) => ({ ...f.originais, ...agora }));
      setAssetMedias((agora) => ({ ...f.medias, ...agora }));
      setAssetCores((agora) => ({ ...f.cores, ...agora }));
      setThemeOrigins((agora) => ({ ...f.origens, ...agora }));
    }
    // E o preço volta ao pedido com ele: quem repôs o rascunho repôs o valor
    // que lá estava, e deixá-lo só no ecrã era voltar a ter duas verdades.
    const base = parseMoneyText(limpo.total);
    // Com o documento REPOSTO, e não com o que está a sair do ecrã — ver
    // `baseDoEcraParaOPedido`.
    persistirPreco(base > 0 ? base : undefined, { doc: limpo.doc });
    setLimpo(null);
    toast("Rascunho reposto.", "success");
  }

  function registarNoHistorico(summary: string) {
    const entrada: ActivityEntry = {
      id: randomId(),
      at: new Date().toISOString(),
      kind: "price_set",
      summary,
    };
    void fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityLogAppend: [entrada] }),
    }).catch(() => {
      /* sem rede: a alteração vale na mesma, fica é sem linha no histórico */
    });
  }

  /**
   * Pede a confirmação de uma alteração drástica ao dinheiro, com os dois
   * valores à vista — e, aplicada, deixa dez segundos para a anular.
   *
   * Um só caminho para todas elas (ver `confirmacaoDeDinheiro`): enquanto cada
   * botão tivesse a sua maneira de perguntar, cada um respondia por si e
   * nenhum ficava no histórico.
   */
  function pedirConfirmacaoDeDinheiro(p: {
    de: number;
    para: number;
    /** O que se está a substituir, em palavras («o total», «a deslocação»). */
    oQue: string;
    registo: string;
    motivo: string;
    aplicar: () => void;
  }) {
    setConfirmacaoDeDinheiro({
      pergunta: `Substituir ${p.oQue} de ${eur(p.de)} por ${eur(p.para)}?`,
      registo: p.registo,
      motivo: p.motivo,
      docNoMomento: doc,
      aplicar: p.aplicar,
    });
  }

  /**
   * A pergunta de remoção, desenhada no cartão que a levantou.
   *
   * Uma função e não um componente: fecha sobre `aRemover` e sobre o `doc`
   * deste desenho, e um componente novo a cada tecla escrita num título
   * remontava a caixa (e tirava-lhe o foco) por causa de uma identidade que
   * muda. `rotulo` é o que o botão diz — «Remover a página», «Remover a fase» —
   * porque um botão que diga só «Remover» ao lado de outros nove obriga a ler
   * a frase toda outra vez para saber o que ele apaga.
   */
  function perguntaDeRemocao(chave: string, rotulo: string) {
    if (!aRemover || aRemover.chave !== chave || aRemover.docNoMomento !== doc) return null;
    return (
      <div
        role="alertdialog"
        aria-live="assertive"
        aria-label={rotulo}
        className="mb-2 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
      >
        <span className="min-w-[12rem] flex-1 text-xs leading-relaxed text-[var(--bo-text)]">
          {aRemover.pergunta}
        </span>
        {/* Cancelar primeiro, e não escreve NADA: nem apaga, nem toca no
            documento, nem deixa rasto no rascunho. Fecha a pergunta. */}
        <Button variant="ghost" size="sm" onClick={() => setARemover(null)}>
          Cancelar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            aRemover.aplicar();
            setARemover(null);
          }}
        >
          {rotulo}
        </Button>
      </div>
    );
  }

  /** Aplica o que estava por confirmar: escreve, regista e abre a anulação. */
  function confirmarDinheiro() {
    const c = confirmacaoDeDinheiro;
    // A pergunta caducada não se aplica — nem sequer está desenhada.
    if (!c || c.docNoMomento !== doc) return;
    // A fotografia é tirada ANTES de aplicar — é ela que a anulação repõe.
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: c.motivo });
    c.aplicar();
    registarNoHistorico(c.registo);
    setConfirmacaoDeDinheiro(null);
  }

  return {
    anularLimpeza,
    confirmarDinheiro,
    pedirConfirmacaoDeDinheiro,
    perguntaDeRemocao,
    registarNoHistorico,
  };
}
