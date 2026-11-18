"use client";
import { useEffect, useRef, useState } from "react";
import { guardarPdfVisto, lerPdfVisto, type PdfVisto } from "../../pdf-visto";
import type { Quote } from "@/lib/orcamento/types";
import { useFimVisivel } from "../../ui/EmCurso";
import { type Avanco } from "../../ui/descarregar";
import { useCanalDeEnvio } from "./canal-de-envio";
import { type PdfPronto } from "./pdf-no-ecra";

export interface EntradaEstadoDoEnvio {
  busy: "preview" | "send" | null;
  quote: Quote;
}

export function useEstadoDoEnvio({ busy, quote }: EntradaEstadoDoEnvio) {
  const [confirmSend, setConfirmSend] = useState(false);

  /** Por onde a proposta segue, e a última escolha dela — ver `useCanalDeEnvio`. */
  const { canal, escolherCanal } = useCanalDeEnvio();
  /**
   * ── O EMAIL QUE VAI SAIR ─────────────────────────────────────────────────
   *
   * O corpo, o assunto e o modelo de que eles partem vivem AQUI e não dentro do
   * `EmailDoEnvio`, por uma razão só: é este componente que carrega no botão, e
   * o que se envia tem de ser o que está na caixa nesse instante. O ecrã do
   * email preenche-os a partir do servidor e deixa-os editar; o `send` lê-os.
   *
   * Não fazem parte do `doc`: são deste envio.
   */
  const [corpoDoEmail, setCorpoDoEmail] = useState("");
  const [assuntoDoEmail, setAssuntoDoEmail] = useState("");
  const [modeloDoEmail, setModeloDoEmail] = useState("");
  /**
   * Quantos bytes tinha o PDF da ÚLTIMA pré-visualização, para o ecrã do email
   * poder confirmar o tamanho do anexo com um número medido em vez de estimado.
   * `null` para quem foi direito ao passo 3 sem gerar nada — aí fica a
   * estimativa, e diz-se que é uma estimativa.
   */
  const [bytesDoPdf, setBytesDoPdf] = useState<number | null>(null);
  /**
   * O FIM DA ESPERA DO PDF VÊ-SE (D2). `pdfSaiu` diz se a última descarga
   * acabou bem, e o `useFimVisivel` mantém o `EmCurso` mais um instante com o
   * visto e «PDF pronto» — antes, a espera desaparecia sem dizer como acabou.
   */
  const [pdfSaiu, setPdfSaiu] = useState(false);
  const fimDoPdf = useFimVisivel(busy === "preview", pdfSaiu);
  /** Os bytes do PDF ENVIADO a chegar (a rota do guardado diz o tamanho). */
  const [avancoDaEnviada, setAvancoDaEnviada] = useState<Avanco | null>(null);
  /**
   * O link de aceitação da proposta MAIS RECENTE que saiu mesmo para o
   * cliente, para o botão «Copiar resumo». `null` até se saber que existe —
   * nunca um link a adivinhar. Vem de duas fontes: a leitura ao abrir o
   * estúdio (`GET`, em baixo — cobre reabrir o estúdio de uma proposta já
   * enviada numa sessão anterior) e a resposta do próprio envio (`send`, mais
   * abaixo — actualiza-o já, sem esperar por um segundo pedido).
   */
  const [linkDaProposta, setLinkDaProposta] = useState<string | null>(null);
  // Depois de um envio bem-sucedido, o formulário NÃO fica pronto a re-disparar:
  // mostra um estado de confirmação e exige uma escolha consciente para reenviar.
  const [sent, setSent] = useState(false);
  /**
   * ── VER O PDF FINAL ANTES DE ENVIAR (14/10) ────────────────────────────
   *
   * Pedido dela: «quero que haja algo que antes de enviar para os clientes
   * obrigue os colaboradores da Líquen a verificar se está tudo bem». A
   * escolha foi «Ver o PDF primeiro»: o envio só desbloqueia depois de
   * descarregar o PDF FINAL desta versão e marcar «Vi a proposta e está tudo
   * certo». `chave` é a que o servidor devolveu (`X-Chave-Do-Pdf`) e que o
   * envio leva de volta; `retrato` é o documento tal como foi descarregado —
   * mudar uma vírgula depois deixa de bater, e é preciso ver outra vez.
   */
  const [pdfVisto, setPdfVisto] = useState<PdfVisto | null>(() => lerPdfVisto(quote.id));
  // Guardado nesta aba, por pedido (23/10) — ver `pdf-visto.ts`.
  useEffect(() => {
    guardarPdfVisto(quote.id, pdfVisto);
  }, [quote.id, pdfVisto]);
  /**
   * O PDF aberto DENTRO do estúdio (`VerOPdfNoEcra`) — no telemóvel, em vez
   * de o descarregar. Ver o comentário desse ficheiro.
   */
  const [pdfNoEcra, setPdfNoEcra] = useState<{
    id: number;
    blob: Blob;
    nome: string;
    rascunho: boolean;
  } | null>(null);
  /**
   * O PDF FINAL da versão que está no ecrã, pedido antes de ela carregar no
   * botão (ver o efeito «PREPARADO ANTES DE ELA CARREGAR»). `retrato` diz de
   * que versão é; uma versão diferente não o usa.
   */
  const pdfPreparadoRef = useRef<{ retrato: string; promessa: Promise<PdfPronto> } | null>(null);
  /**
   * O que seguiu no último envio: a proposta gravada (para ir buscar o PDF
   * guardado) e, se ainda estiver à mão, o próprio ficheiro.
   */
  const enviadaRef = useRef<{ id: string | null; pdf: Promise<PdfPronto> | null } | null>(null);

  return {
    assuntoDoEmail,
    avancoDaEnviada,
    bytesDoPdf,
    canal,
    confirmSend,
    corpoDoEmail,
    enviadaRef,
    escolherCanal,
    fimDoPdf,
    linkDaProposta,
    modeloDoEmail,
    pdfNoEcra,
    pdfPreparadoRef,
    pdfVisto,
    sent,
    setAssuntoDoEmail,
    setAvancoDaEnviada,
    setBytesDoPdf,
    setConfirmSend,
    setCorpoDoEmail,
    setLinkDaProposta,
    setModeloDoEmail,
    setPdfNoEcra,
    setPdfSaiu,
    setPdfVisto,
    setSent,
  };
}
