"use client";
import { useAmostrasDeGeracao } from "./useAmostrasDeGeracao";
import { useEffect, useRef } from "react";
import { porqueFalhou } from "@/lib/erro-do-servidor";
import { eTempoEsgotado, sinalComTecto, TECTO_DA_PRE_VISUALIZACAO_MS } from "@/lib/tempo-esgotado";
import { useToast } from "../../Toast";
import { countPendingImages, stripPendingImages } from "@/lib/proposal-doc";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import type { Quote } from "@/lib/orcamento/types";
import { descarregar } from "../../ui/descarregar";
import { avisoDeConteudoIncompleto } from "@/lib/orcamento/estudio/textos-do-estudio";
import * as contrato from "@/lib/orcamento/envio/contrato";
import { type PdfPronto, guardarNoDisco, retratoDoPdf, verPdfNoEcra } from "./pdf-no-ecra";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useTraducoes } from "../traducoes/useTraducoes";
import { useEstadoDoEnvio } from "./useEstadoDoEnvio";
import { usePaginasDaProposta } from "../pdf/usePaginasDaProposta";
import { useBarraDoEstudio } from "../barra/useBarraDoEstudio";
import type { Dispatch, SetStateAction } from "react";

export interface EntradaPdfDaProposta {
  apontarGeracao: ReturnType<typeof useAmostrasDeGeracao>["apontarGeracao"];
  barra: ReturnType<typeof useBarraDoEstudio>;
  busy: "preview" | "send" | null;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  paginasDaProposta: ReturnType<typeof usePaginasDaProposta>;
  quote: Quote;
  setBusy: Dispatch<SetStateAction<"preview" | "send" | null>>;
  toast: ReturnType<typeof useToast>["toast"];
  traducoes: ReturnType<typeof useTraducoes>;
}

export function usePdfDaProposta({
  apontarGeracao,
  barra,
  busy,
  documento,
  envio,
  paginasDaProposta,
  quote,
  setBusy,
  toast,
  traducoes,
}: EntradaPdfDaProposta) {
  const { barraCompacta } = barra;
  const { doc } = documento;
  const {
    enviadaRef,
    pdfPreparadoRef,
    setAvancoDaEnviada,
    setBytesDoPdf,
    setPdfNoEcra,
    setPdfSaiu,
    setPdfVisto,
  } = envio;
  const { totalDeFotos } = paginasDaProposta;
  const { idiomaDoPdf } = traducoes;

  // ── Actions ──
  //
  // ── FOTOS POR CONFIRMAR ──
  //
  // O documento que sai daqui NUNCA leva marcadores provisórios: o gerador não
  // os sabe ir buscar e o resultado seria uma foto a menos, em silêncio, no PDF
  // do cliente. `stripPendingImages` é a fronteira.
  //
  // Filtrar sozinho não chega — seria enviar com buracos e calar. Por isso:
  //
  //  · PRÉ-VISUALIZAR gera à mesma, sem elas, e DIZ-LO. É um PDF para ela ver,
  //    volta a gerar-se daqui a dez segundos, e travar aqui só a impedia de ir
  //    ver o resto da proposta enquanto as fotos assentam.
  //
  //  · ENVIAR ESPERA. É o gesto irreversível: o email sai uma vez e o noivo lê
  //    o que lhe chegou. A cópia demora segundos; um PDF sem a foto que ela
  //    escolheu dura para sempre. O botão fica desligado enquanto houver fotos
  //    a caminho, com a razão escrita ao lado, e volta sozinho quando assentam.
  /**
   * ── O RASCUNHO (B1) ───────────────────────────────────────────────────────
   * Com um erro por resolver, o PDF «final» não se descarrega — é a mesma
   * regra do botão de enviar. Descarrega-se um RASCUNHO: o mesmo desenho, com
   * «RASCUNHO» no rodapé de cada página e «(rascunho)» no nome do ficheiro,
   * para nunca poder ser confundido com o que segue para o casal.
   */
  /**
   * Pede o PDF ao servidor. É o mesmo pedido para o botão e para a preparação
   * em segundo plano (mais abaixo), e por isso também é aqui que a geração
   * ensina a estimativa — mas só quando o servidor DESENHOU: um PDF que veio da
   * memória (`X-Pdf-Da-Memoria`) ensinava que desenhar leva um segundo.
   */
  async function pedirOPdf(
    desenhado: ReturnType<typeof stripPendingImages<typeof doc>>,
    rascunho: boolean,
  ): Promise<PdfPronto> {
    // De ponta a ponta, que é o que ela espera — e não o que o servidor demora
    // a desenhar. É esta a medida que faz a estimativa valer alguma coisa.
    const comecou = Date.now();
    const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: sinalComTecto(TECTO_DA_PRE_VISUALIZACAO_MS),
      // `idioma` vai SEMPRE, mesmo quando é o português. O servidor tem o
      // português por omissão para os chamadores antigos, mas quem tem um
      // botão para escolher diz o que escolheu — senão «pt» seria só a
      // ausência de um campo, e o dia em que a omissão mudar de lado leva
      // esta chamada atrás sem ninguém dar por isso.
      body: JSON.stringify({
        mode: "preview",
        idioma: idiomaDoPdf,
        doc: desenhado,
        ...(rascunho ? { rascunho: true } : {}),
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error || "Não foi possível gerar a pré-visualização.");
    }
    const blob = await res.blob();
    // A geração que acabou de acontecer ensina a próxima estimativa: quantas
    // fotos, quanto tempo, quantos bytes. Medido, não estimado.
    const { CABECALHOS_DA_PRE_VISUALIZACAO: CABECALHO } = contrato;
    if (res.headers.get(CABECALHO.pdfDaMemoria) !== "1") {
      apontarGeracao(totalDeFotos, Date.now() - comecou, blob.size);
    }
    return {
      blob,
      chave: rascunho ? null : res.headers.get(CABECALHO.chaveDoPdf),
      emFalta: Number(res.headers.get(CABECALHO.fotosEmFalta) ?? "0"),
      cortes: res.headers.get(CABECALHO.conteudoCortado),
    };
  }

  // A preparação em segundo plano corre num efeito, e o efeito quer sempre o
  // `pedirOPdf` deste render (o idioma e o pedido de agora).
  const pedirOPdfAgoraRef = useRef(pedirOPdf);
  useEffect(() => {
    pedirOPdfAgoraRef.current = pedirOPdf;
  });

  async function preview({ rascunho = false }: { rascunho?: boolean } = {}) {
    if (busy) return;
    setPdfSaiu(false);
    setBusy("preview");
    // O documento EXACTO que vai ser desenhado — é este que fica «visto».
    const desenhado = stripPendingImages(doc);
    const retrato = retratoDoPdf(desenhado, idiomaDoPdf);
    try {
      /**
       * O PDF FINAL que o estúdio já preparou em segundo plano, se for desta
       * versão (ver `pdfPreparado`) — pronto, ou ainda a caminho, e então
       * espera-se por ele em vez de pedir outro. Se essa preparação falhou,
       * pede-se agora, como antes: a preparação nunca pode ser a razão de o
       * botão não dar nada.
       */
      const jaPedido =
        !rascunho && pdfPreparadoRef.current?.retrato === retrato
          ? await pdfPreparadoRef.current.promessa.catch(() => null)
          : null;
      const pdf = jaPedido ?? (await pedirOPdf(desenhado, rascunho));
      if (!rascunho) pdfPreparadoRef.current = { retrato, promessa: Promise.resolve(pdf) };
      const { blob } = pdf;
      // O tamanho serve o ecrã do email, que confirma o anexo antes de ele
      // seguir: aqui é MEDIDO, e não a estimativa que se mostra sem isto.
      setBytesDoPdf(blob.size);
      // O nome do ficheiro diz a língua. Gerar as duas versões é coisa que
      // acontece — ela manda a portuguesa aos pais e a inglesa ao casal — e com
      // o mesmo nome a segunda ficava «proposta-Ana (1).pdf» na pasta de
      // transferências, sem forma de saber qual é qual sem abrir as duas.
      /**
       * O MESMO NOME QUE O CASAL VAI VER.
       *
       * Isto compunha um nome só seu — `proposta-Ana.pdf` — e era o quarto nome
       * diferente para o mesmo documento: um no botão daqui, um no anexo do
       * email, um na descarga do link do casal e um no portal. Ela confere o
       * PDF na pasta de transferências e envia-o a seguir; se o que confere não
       * se chama como o que segue, a conferência não prova nada.
       *
       * Passa a sair da mesma função que o servidor usa — incluindo o nome que
       * ela escreveu, quando escreveu.
       */
      const nome = nomeDoFicheiroDaProposta(
        {
          escolhido: doc.nomeDoFicheiro,
          clientNames: doc.clientNames,
          eventDate: doc.eventDate,
          ref: quote.id,
        },
        idiomaDoPdf,
      );
      const nomeFinal = rascunho ? nome.replace(/\.pdf$/i, " (rascunho).pdf") : nome;
      // No telemóvel o PDF abre DENTRO do estúdio (23/10): descarregá-lo
      // tirava-a da página, e voltar recarregava o estúdio. No computador
      // continua a ir para as transferências, como sempre.
      const noEcra = verPdfNoEcra(barraCompacta);
      if (noEcra) setPdfNoEcra({ id: Date.now(), blob, nome: nomeFinal, rascunho });
      else guardarNoDisco(blob, nomeFinal);
      setPdfSaiu(true);
      // O gerador SALTA a foto que não consegue ir buscar E CORTA o que não
      // cabe no desenho, por isso um PDF incompleto sai na mesma, com ar de
      // estar bem. Sem este aviso, a primeira pessoa a dar pela falta era o
      // cliente. O servidor conta as duas coisas e devolve-as nos cabeçalhos.
      // Só o PDF FINAL conta como visto — o rascunho é o que ainda não pode
      // seguir. Um PDF novo pede uma confirmação nova.
      const chave = rascunho ? null : pdf.chave;
      if (chave) setPdfVisto({ chave, retrato, confirmado: false, emFalta: pdf.emFalta });
      const emFalta = pdf.emFalta;
      const cortes = contrato.cortesDoCabecalho(pdf.cortes);
      const aviso = avisoDeConteudoIncompleto(emFalta, cortes);
      if (aviso) {
        toast(`PDF gerado, mas ${aviso}. Verifica antes de enviar.`, "error");
      } else if (fotosPorConfirmar > 0) {
        toast(
          fotosPorConfirmar === 1
            ? "PDF gerado sem 1 foto que ainda está a entrar na proposta. Gera outra vez daqui a pouco."
            : `PDF gerado sem ${fotosPorConfirmar} fotos que ainda estão a entrar na proposta. Gera outra vez daqui a pouco.`,
          "info",
        );
      } else if (!noEcra) {
        // No telemóvel a folha com o PDF já diz o que aconteceu; um aviso por
        // cima tapava a primeira página.
        toast(
          rascunho
            ? "Rascunho gerado (PDF descarregado, marcado como rascunho)"
            : "Pré-visualização gerada (PDF descarregado)",
          "success",
        );
      }
    } catch (e) {
      toast(
        eTempoEsgotado(e)
          ? "A pré-visualização demorou demasiado e foi interrompida. Tente outra vez."
          : porqueFalhou(
              e,
              "Sem ligação ao servidor — a pré-visualização não foi gerada. Verifique a rede e tente outra vez.",
            ),
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  /**
   * ── «DESCARREGAR PDF» DEPOIS DE ENVIADA ──────────────────────────────────
   *
   * Desenhava o documento outra vez (10 a 60 s), quando o PDF que seguiu já
   * existe duas vezes: no estúdio, se foi o que ela viu antes de enviar (e
   * tinha de ver — é a verificação antes do envio), e guardado no
   * armazenamento pelo envio. Agora entrega o primeiro que houver, que é
   * EXACTAMENTE o que o cliente recebeu; só se nenhum responder é que se
   * desenha, como antes.
   */
  async function descarregarAEnviada() {
    if (busy) return;
    setPdfSaiu(false);
    setAvancoDaEnviada(null);
    setBusy("preview");
    let blob: Blob | null = null;
    try {
      const doEnvio = enviadaRef.current;
      blob = (await doEnvio?.pdf?.catch(() => null))?.blob ?? null;
      if (!blob && doEnvio?.id) {
        // Pelo `descarregar` da casa: a rota do guardado manda o tamanho, e a
        // barra conta os bytes em vez de rodar às cegas.
        blob = await descarregar(`/api/orcamento/${quote.id}/propostas/${doEnvio.id}/pdf`, {
          init: { cache: "no-store" },
          aoAvancar: setAvancoDaEnviada,
        })
          .then((r) => r.blob)
          .catch(() => null);
      }
      if (blob) {
        guardarNoDisco(
          blob,
          nomeDoFicheiroDaProposta(
            {
              escolhido: doc.nomeDoFicheiro,
              clientNames: doc.clientNames,
              eventDate: doc.eventDate,
              ref: quote.id,
            },
            idiomaDoPdf,
          ),
        );
        setPdfSaiu(true);
        toast("PDF descarregado — o mesmo que seguiu para o cliente.", "success");
      }
    } catch {
      blob = null;
    } finally {
      setBusy(null);
    }
    // Nada à mão e o guardado não respondeu: desenha-se, como antes.
    if (!blob) await preview();
  }
  /** Fotos que ocupam já o seu lugar no documento mas ainda não têm caminho.
   *  Nome distinto do `porConfirmar` dos CAMPOS (acima): são coisas diferentes
   *  e partilhar o nome era o caminho para uma delas passar a mentir. */
  const fotosPorConfirmar = countPendingImages(doc);

  return { descarregarAEnviada, fotosPorConfirmar, pedirOPdfAgoraRef, preview };
}
