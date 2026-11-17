"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { stripPendingImages } from "@/lib/proposal-doc";
import { usePerguntasDoEnvio } from "../../usePerguntasDoEnvio";
import { fotosParaAsEscolhas, type FotoDisponivel } from "../../EditorDeEscolhas";
import { estadoDasSeccoes, oQueFaltaParaEnviar } from "@/lib/proposal-progress";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import type { FotoEscolhidaEmFalta } from "@/lib/proposta-fotos-verificacao-tipos";
import { retratoDoPdf } from "./pdf-no-ecra";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { useTraducoes } from "../traducoes/useTraducoes";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEstadoDoEnvio } from "./useEstadoDoEnvio";
import { usePdfDaProposta } from "./usePdfDaProposta";

export interface EntradaProntaParaEnviar {
  busy: "preview" | "send" | null;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  pdfDaProposta: ReturnType<typeof usePdfDaProposta>;
  quote: Quote;
  total: ReturnType<typeof useTotalDaProposta>;
  traducoes: ReturnType<typeof useTraducoes>;
}

export function useProntaParaEnviar({
  busy,
  documento,
  envio,
  fotos,
  passos,
  pdfDaProposta,
  quote,
  total,
  traducoes,
}: EntradaProntaParaEnviar) {
  const { doc } = documento;
  const { canal, pdfPreparado, pdfVisto, sent } = envio;
  const { assetUrls } = fotos;
  const { step } = passos;
  const { fotosPorConfirmar, pedirOPdfAgora } = pdfDaProposta;
  const { money } = total;
  const { idiomaDoPdf } = traducoes;

  const isDeco = doc.template !== "organizacao";
  // O botão e o aviso lateral leem a MESMA lista, de propósito: escritos cada
  // um à sua maneira, mais cedo ou mais tarde discordavam — o aviso dizia que
  // faltava o valor e o botão deixava enviar na mesma. A regra (e a razão de
  // cada exigência) está em `proposal-progress.ts`.
  const seccoes = estadoDasSeccoes(doc as ProposalDoc);

  /**
   * As fotografias que uma alternativa pode usar: as que JÁ estão nos mood
   * boards desta proposta.
   *
   * Sem carregamento novo e sem marcadores provisórios — uma opção que
   * apontasse para uma foto ainda por copiar ficava com um caminho que nunca
   * vai existir, e o casal via um buraco onde devia estar a paleta.
   */
  const [escolhidasQueFaltam, setEscolhidasQueFaltam] = useState<FotoEscolhidaEmFalta[]>([]);
  // As que SE SABE que já não existem (na Reciclagem, ou saídas da pasta): a
  // mesma resposta do armazenamento que trava o envio (`FotosEmFalta`), e a
  // mesma fonte do escolhedor dos temas — a pasta. Não se oferecem como
  // alternativa (revisão de 14/11, n.º 6): seriam uma escolha que já nasce
  // em falta.
  const [refsQueFaltam, setRefsQueFaltam] = useState<ReadonlySet<string>>(() => new Set());
  const aoSaberQueFaltam = useCallback((refs: string[]) => setRefsQueFaltam(new Set(refs)), []);
  const fotosParaEscolhas: FotoDisponivel[] = fotosParaAsEscolhas(
    doc.moodBoards ?? [],
    assetUrls,
    refsQueFaltam,
  );

  /**
   * ── O QUE O DOCUMENTO NÃO SABE DE SI PRÓPRIO ──────────────────────────────
   *
   * Por agora, só a LÍNGUA.
   *
   * O `oQueFaltaParaEnviar` também sabe travar por fotografias que não
   * resolvem, e essa peça está escrita e testada — mas não é alimentada
   * daqui, de propósito, e a razão é uma corrida:
   *
   * o `assetUrls` chega DEPOIS do documento. Entre abrir o estúdio e o mapa
   * carregar, um `!assetUrls[caminho]` é verdadeiro para TODAS as fotografias
   * da proposta — e o botão de enviar ficaria travado durante esse intervalo, a
   * dizer que catorze fotografias não carregam quando o que se passa é que
   * ainda não foram pedidas.
   *
   * Um bloqueio que dispara por uma corrida é pior do que não existir: ensina a
   * ignorar a lista, e a lista é o que impede a próxima proposta errada de
   * sair. Fica para um bloco próprio, alimentado por falhas REAIS de
   * carregamento (o `ImagemComPlanoB` já as conhece) e não por uma ausência no
   * mapa.
   */
  //
  // ── E O CANAL, COM O EMAIL DO PEDIDO (B1) ────────────────────────────────
  // Sem email, uma proposta por email não chega a ninguém. O documento dela
  // pô-lo entre os erros; com «só WhatsApp» não trava — é o caso normal de
  // um pedido que entrou por telefone.
  //
  // ── E AS FOTOS ESCOLHIDAS QUE JÁ NÃO EXISTEM (14/11) ─────────────────────
  // Estas sim, alimentadas daqui: vêm de uma verificação do armazenamento que
  // CORREU (o `FotosEmFalta` do passo do envio), nunca de uma ausência no mapa
  // — por isso não há corrida. E só contam enquanto a foto continuar escrita
  // no documento (`oQueFaltaParaEnviar` confere): trocada, o aviso cai.
  const contextoDoEnvio = useMemo(
    () => ({
      idioma: idiomaDoPdf,
      canal,
      emailDoCliente: quote.email,
      fotosEscolhidasQueFaltam: escolhidasQueFaltam,
    }),
    [idiomaDoPdf, canal, quote.email, escolhidasQueFaltam],
  );
  /**
   * Há alguma coisa que TRAVA? É o que separa o PDF final do rascunho, no
   * «Descarregar» do passo de pré-visualizar: o documento dela (B1) quer o
   * mesmo bloqueio no envio e no descarregar o PDF «final», e um rascunho
   * sempre disponível, marcado como tal.
   */
  const faltas = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross, contextoDoEnvio);
  const temErros = faltas.some((f) => f.trava);
  /**
   * O PDF final desta versão foi visto e confirmado? Conta-se só no passo do
   * envio (é lá que se usa), para não serializar o documento a cada tecla
   * nos outros passos.
   */
  const retratoAgora = useMemo(
    () => (step === "enviar" ? retratoDoPdf(stripPendingImages(doc), idiomaDoPdf) : ""),
    [step, doc, idiomaDoPdf],
  );
  const pdfVistoAgora = !!pdfVisto && pdfVisto.retrato === retratoAgora;
  const perguntas = usePerguntasDoEnvio(retratoAgora);
  const pdfConfirmado = pdfVistoAgora && !!pdfVisto?.confirmado;
  /**
   * ── PREPARADO ANTES DE ELA CARREGAR ──────────────────────────────────────
   *
   * No passo «Rever e enviar», sem erros, o PDF final desta versão pede-se em
   * segundo plano 4 s depois de ela parar de mexer — uma vez por versão (era
   * 1,5 s; subiu a 3/11, quando a conta da Vercel passou o limite de
   * processador: cada pedido destes é um PDF inteiro).
   * Quando ela carrega em «Descarregar o PDF final», ou já está pronto, ou já
   * vai a meio; e o envio a seguir sai da memória do servidor em vez de o
   * desenhar outra vez. Uma falha aqui não diz nada a ninguém: o botão volta a
   * pedir, e é lá que um erro se mostra.
   */
  useEffect(() => {
    if (step !== "enviar" || sent || temErros || fotosPorConfirmar > 0 || busy !== null) return;
    if (!retratoAgora || pdfPreparado.current?.retrato === retratoAgora) return;
    const espera = setTimeout(() => {
      // Um PDF inteiro é o trabalho mais caro do servidor: não se desenha para
      // um separador que ninguém está a ver (3/11).
      if (document.hidden) return;
      const desenhado = stripPendingImages(doc);
      const retrato = retratoDoPdf(desenhado, idiomaDoPdf);
      const promessa = pedirOPdfAgora.current(desenhado, false);
      pdfPreparado.current = { retrato, promessa };
      promessa.catch(() => {
        if (pdfPreparado.current?.promessa === promessa) pdfPreparado.current = null;
      });
    }, 4000);
    return () => clearTimeout(espera);
  }, [step, sent, temErros, fotosPorConfirmar, busy, retratoAgora, doc, idiomaDoPdf]);

  return {
    aoSaberQueFaltam,
    contextoDoEnvio,
    fotosParaEscolhas,
    isDeco,
    pdfConfirmado,
    pdfVistoAgora,
    perguntas,
    seccoes,
    setEscolhidasQueFaltam,
    temErros,
  };
}
