"use client";
import { useToast } from "../../Toast";
import { parseMoneyText } from "@/lib/proposal-doc";
import { linhasDe } from "@/lib/proposal-budget";
import { eur } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";
import {
  baseDoPedidoParaOEcra,
  initialDoc,
  seedDefaults,
  type StudioDoc,
} from "@/lib/orcamento/estudio/documento-inicial";
import { textoDoTotal } from "@/lib/orcamento/estudio/textos-do-estudio";
import { useDocumentoDoEstudio } from "./useDocumentoDoEstudio";
import { useAccoesReversiveis } from "./useAccoesReversiveis";
import { useCamposPorConfirmar } from "../versoes/useCamposPorConfirmar";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { useConfirmacoes } from "./useConfirmacoes";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEstadoDoEnvio } from "../envio/useEstadoDoEnvio";
import type { Dispatch, RefObject, SetStateAction } from "react";

export interface EntradaLimparORascunho {
  DRAFT_KEY: string;
  SIDE_KEY: string;
  camposPorConfirmar: ReturnType<typeof useCamposPorConfirmar>;
  confirmacoes: ReturnType<typeof useConfirmacoes>;
  docDoServidor: RefObject<Record<string, unknown> | null>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  quote: Quote;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  serverStamp: RefObject<string | null>;
  setRefEdited: Dispatch<SetStateAction<boolean>>;
  toast: ReturnType<typeof useToast>["toast"];
  total: ReturnType<typeof useTotalDaProposta>;
  warnedOverwrite: RefObject<boolean>;
}

export function useLimparORascunho({
  DRAFT_KEY,
  SIDE_KEY,
  camposPorConfirmar,
  confirmacoes,
  docDoServidor,
  documento,
  envio,
  fotos,
  passos,
  quote,
  reversiveis,
  serverStamp,
  setRefEdited,
  toast,
  total,
  warnedOverwrite,
}: EntradaLimparORascunho) {
  const { setPorConfirmar } = camposPorConfirmar;
  const { registarNoHistorico } = confirmacoes;
  const { doc, setDoc } = documento;
  const { setConfirmSend, setSent } = envio;
  const {
    assetCores,
    assetMedias,
    assetOriginais,
    assetUrls,
    setAssetCores,
    setAssetMedias,
    setAssetOriginais,
    setAssetUrls,
    setThemeOrigins,
    themeOrigins,
  } = fotos;
  const { irParaPasso } = passos;
  const { setLimpo } = reversiveis;
  const { baseDoEcraParaOPedido, setTotalInput, totalInput } = total;

  /**
   * O que o «Limpar» está prestes a deitar fora, em palavras e com os números.
   *
   * Só o que se conta e se perde mesmo, pela ordem por que custou a fazer. Uma
   * proposta acabada de abrir não tem nada disto, e então a frase não diz nada
   * — «rascunho limpo — 0 páginas, 0 fotografias» é ruído com aritmética.
   */
  function oQueOLimparLevou(d: StudioDoc): string {
    const partes = trabalhoNoDocumento(d);
    return partes.length === 0 ? "Rascunho limpo." : `Rascunho limpo — levou ${partes.join(", ")}.`;
  }

  /** O trabalho que o documento tem, dito por partes — para o «Rascunho
   *  limpo — levou…» e para a pergunta do «Criar a partir de…». */
  function trabalhoNoDocumento(d: StudioDoc): string[] {
    const fotos = d.moodBoards.reduce((n, b) => n + b.images.length, 0);
    const paginas = d.moodBoards.filter((b) => b.images.length > 0).length;
    const servicos = (d.serviceGroups ?? []).reduce((n, g) => n + (g.items ?? []).length, 0);
    const orcamento =
      linhasDe(d).filter((l) => (l.item ?? "").trim() !== "").length +
      (d.budgetRows ?? []).filter((r) => (r.item ?? "").trim() !== "").length;
    const partes = [
      paginas > 0 ? `${paginas} ${paginas === 1 ? "página" : "páginas"} de inspiração` : null,
      fotos > 0 ? `${fotos} ${fotos === 1 ? "fotografia" : "fotografias"}` : null,
      servicos > 0 ? `${servicos} ${servicos === 1 ? "serviço" : "serviços"}` : null,
      orcamento > 0 ? `${orcamento} ${orcamento === 1 ? "linha" : "linhas"} de orçamento` : null,
    ].filter((x): x is string => x !== null);
    return partes;
  }

  function clearDraft() {
    /*
     * ── CONTINUA SEM CAIXA DE CONFIRMAÇÃO, E DE PROPÓSITO ─────────────────
     *
     * A regra desta casa dá a cada acção irreversível UMA das duas coisas, e
     * esta já tem a sua: dez segundos e um botão. A razão está escrita em
     * `limpo` e não mudou — a caixa pergunta ANTES, quando ainda não se viu o
     * que se ia perder, e a resposta certa é quase sempre «sim», por isso
     * carrega-se sem ler. Pôr aqui as duas era pedir duas respostas ao mesmo
     * gesto e ensinar a despachar ambas.
     *
     * O que faltava não era a pergunta: era o NÚMERO. A barra dizia «Rascunho
     * limpo» — a frase mais vaga possível sobre o gesto mais largo do ecrã, e
     * quem não sabe o que perdeu não sabe se vale a pena anular. Agora diz o
     * que levou (`oQueOLimparLevou`), enquanto ainda dá para o trazer de volta.
     */
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: oQueOLimparLevou(doc),
      fotos: {
        urls: assetUrls,
        originais: assetOriginais,
        medias: assetMedias,
        cores: assetCores,
        origens: themeOrigins,
      },
    });
    try {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(`${DRAFT_KEY}:at`);
      localStorage.removeItem(SIDE_KEY);
    } catch {
      /* ignore */
    }
    // E no servidor — senão o rascunho limpo aqui reaparecia no dispositivo
    // seguinte, que é precisamente o que guardá-lo lá veio resolver.
    serverStamp.current = null;
    docDoServidor.current = null;
    warnedOverwrite.current = false;
    void fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, { method: "DELETE" }).catch(() => {
      /* sem rede: fica para a próxima limpeza; nada se perde por isso */
    });
    const semente = seedDefaults(initialDoc(quote), quote);
    setDoc(semente);
    // Limpar volta a pôr no ecrã o que o pedido diz — e o que o pedido diz é o
    // que ela acabou de pedir para ver. Nada a confirmar.
    setPorConfirmar(new Set());
    /**
     * ── E O PREÇO DO PEDIDO ATRAVESSA PELA CONVERSÃO, COMO EM TODO O LADO ──
     *
     * Aqui estava `textoDoTotal(quote.quotedPrice)`: o «Preço final» do pedido
     * — o que o casal paga, adicionais INCLUÍDOS — escrito em cru no campo que
     * significa só os SERVIÇOS. É a MESMA expressão, letra por letra, que
     * levou 3.000 a 3.140 a 3.280 a 3.420 na abertura, e que já foi fechada na
     * montagem, na hidratação do rascunho do servidor e na sincronização com a
     * Gestão do pedido.
     *
     * Neste sítio ela não crescia — mas por acidente, não por desenho: o
     * `initialDoc` nasce com `budgetExtras: []`, portanto o degrau é zero e a
     * conversão não tinha nada para tirar. Bastava um dia semear a deslocação
     * do pedido no documento novo para este ser o quinto sítio da mesma avaria,
     * e o dinheiro dela paga o preço de descobri-lo em produção.
     *
     * Com a conversão, o número deste sítio é hoje exactamente o mesmo e passa
     * a estar certo por construção. O `o-valor-que-ela-poe-e-o-valor-que-fica`
     * prende a regra: nenhum caminho leva o preço do pedido ao campo do estúdio
     * sem passar pelo par.
     */
    const doPedidoAoLimpar = quote.quotedPrice;
    const escritoAoLimpar =
      typeof doPedidoAoLimpar === "number" && doPedidoAoLimpar > 0
        ? baseDoPedidoParaOEcra(doPedidoAoLimpar, semente)
        : null;
    setTotalInput(escritoAoLimpar != null ? textoDoTotal(escritoAoLimpar) : "");
    setAssetUrls({});
    setAssetOriginais({});
    setAssetMedias({});
    setAssetCores({});
    setThemeOrigins({});
    setRefEdited(false);
    setConfirmSend(false);
    setSent(false);
    // Recomeçar é recomeçar no topo do Evento — não a meio dele.
    irParaPasso("evento");
    /**
     * Limpar deita o total fora com o resto — e o total é o preço do pedido.
     * Fica no histórico pela mesma razão que o «Usar X €»: um preço que muda
     * sozinho, visto três semanas depois, tem de ter um sítio onde se explique.
     *
     * ── E OS DOIS LADOS DA CONTA SÃO AGORA A MESMA MOEDA ──────────────────
     *
     * Estava `parseMoneyText(totalInput)` contra `quote.quotedPrice`: o campo
     * do ESCRITO (só serviços) contra o preço do PEDIDO (serviços mais
     * adicionais). Numa proposta com 140 € de deslocação os dois números
     * diferem SEMPRE, e limpar o rascunho escrevia no histórico «preço final
     * de 3.000,00 € para 3.140,00 €» — uma linha sobre dinheiro a dizer que o
     * preço mudou, num gesto onde o preço do pedido não se mexeu um cêntimo.
     * Ela lê o histórico para saber onde é que o valor mudou; uma linha falsa
     * ali gasta-lhe a confiança nas verdadeiras.
     *
     * Os dois lados passam a ser lidos na unidade do PEDIDO — que é o número
     * de que a frase fala.
     */
    const escritoAntes = parseMoneyText(totalInput);
    // Sem nada escrito não há preço para converter: somar-lhe os adicionais
    // dava um «de 140,00 € para 0,00 €» numa proposta que nunca teve preço.
    const anterior = escritoAntes > 0 ? baseDoEcraParaOPedido(escritoAntes, doc) : 0;
    const doPedido = typeof quote.quotedPrice === "number" ? quote.quotedPrice : 0;
    if (Math.abs(doPedido - anterior) > 0.01) {
      registarNoHistorico(
        `Rascunho da proposta limpo: preço final de ${eur(anterior)} para ${eur(doPedido)}.`,
      );
    }
    toast("Rascunho limpo", "info");
  }

  return { clearDraft, trabalhoNoDocumento };
}
