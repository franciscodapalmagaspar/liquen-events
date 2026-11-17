"use client";
import { useAmostrasDeGeracao } from "./useAmostrasDeGeracao";
import { asPropostasMudaram } from "../../percentagem-do-sinal";
import { useEffect } from "react";
import { porqueFalhouOEnvio } from "../../porque-falhou-o-envio";
import { porqueFalhou } from "@/lib/erro-do-servidor";
import { eTempoEsgotado, sinalComTecto, TECTO_DO_ENVIO_MS } from "@/lib/tempo-esgotado";
import { useToast } from "../../Toast";
import { stripPendingImages } from "@/lib/proposal-doc";
import { linkDoWhatsApp } from "@/lib/whatsapp";
import type { Quote } from "@/lib/orcamento/types";
import { useEnvioAdiado } from "../../ui/envio-adiado";
import {
  avisoDeConteudoIncompleto,
  normalizaCortes,
} from "@/lib/orcamento/estudio/textos-do-estudio";
import { retratoDoPdf } from "./pdf-no-ecra";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useTraducoes } from "../traducoes/useTraducoes";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEstadoDoEnvio } from "./useEstadoDoEnvio";
import { usePaginasDaProposta } from "../pdf/usePaginasDaProposta";
import { useFotosUsadasNoutras } from "../fotos/useFotosUsadasNoutras";
import { usePdfDaProposta } from "./usePdfDaProposta";
import { useProntaParaEnviar } from "./useProntaParaEnviar";
import type { Dispatch, RefObject, SetStateAction } from "react";

export interface EntradaEnviarAProposta {
  apontarGeracao: ReturnType<typeof useAmostrasDeGeracao>["apontarGeracao"];
  busy: "preview" | "send" | null;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  enviarAgora: RefObject<() => void>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  envioAdiado: ReturnType<typeof useEnvioAdiado>;
  fotosUsadasNoutras: ReturnType<typeof useFotosUsadasNoutras>;
  onSent: (() => void) | undefined;
  paginasDaProposta: ReturnType<typeof usePaginasDaProposta>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  pdfDaProposta: ReturnType<typeof usePdfDaProposta>;
  pronta: ReturnType<typeof useProntaParaEnviar>;
  quote: Quote;
  resumoComLink: (link: string | undefined) => string;
  setBusy: Dispatch<SetStateAction<"preview" | "send" | null>>;
  toast: ReturnType<typeof useToast>["toast"];
  traducoes: ReturnType<typeof useTraducoes>;
}

export function useEnviarAProposta({
  apontarGeracao,
  busy,
  documento,
  enviarAgora,
  envio,
  envioAdiado,
  fotosUsadasNoutras,
  onSent,
  paginasDaProposta,
  passos,
  pdfDaProposta,
  pronta,
  quote,
  resumoComLink,
  setBusy,
  toast,
  traducoes,
}: EntradaEnviarAProposta) {
  const { doc } = documento;
  const {
    assuntoDoEmail,
    canal,
    corpoDoEmail,
    enviada,
    modeloDoEmail,
    pdfPreparado,
    pdfVisto,
    sent,
    setConfirmSend,
    setLinkDaProposta,
    setSent,
  } = envio;
  const { origensNoDocumento } = fotosUsadasNoutras;
  const { totalDeFotos } = paginasDaProposta;
  const { step } = passos;
  const { fotosPorConfirmar } = pdfDaProposta;
  const { perguntas } = pronta;
  const { idiomaDoPdf } = traducoes;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ENVIAR, DEPOIS DE VER O QUE FICA DE FORA
   * ════════════════════════════════════════════════════════════════════════
   *
   * O gerador diz o que a composição cortou — o nome do casal que não coube na
   * capa, a sétima foto de um mood board, a legenda que acaba a meio da frase.
   * Isso chegava aqui DENTRO da resposta do envio, ou seja depois de o email
   * ter saído: ela lia o aviso com o casal já a ter o documento.
   *
   * Agora o servidor pára e pergunta (409, `precisaConfirmarCortes`), e este
   * é o segundo clique: o mesmo envio, com a resposta dada. Não é um botão
   * diferente nem um caminho diferente — é o mesmo, com `cortesConfirmados`.
   */
  // A ref aponta sempre para o `send` deste render (o documento de agora).
  useEffect(() => {
    enviarAgora.current = () => void send();
  });
  // Sair do passo do envio a meio da espera cancela: a faixa «A enviar em…»
  // só existe neste passo, e nada sai sem ela estar a ver.
  const cancelarEnvioAdiado = envioAdiado.cancelar;
  useEffect(() => {
    if (step !== "enviar" || sent) cancelarEnvioAdiado();
  }, [step, sent, cancelarEnvioAdiado]);
  async function send() {
    if (busy) return;
    // A trava do envio é o `canSend` (o botão nem chega a estar ligado), mas
    // repete-se aqui: entre carregar em "Enviar" e carregar em "Confirmar" pode
    // ter entrado outro lote de fotos, e o segundo clique não pode ser o que
    // manda a proposta sem elas.
    if (fotosPorConfirmar > 0) {
      toast(
        fotosPorConfirmar === 1
          ? "Ainda há 1 foto a entrar na proposta. Assim que assentar, o envio fica disponível."
          : `Ainda há ${fotosPorConfirmar} fotos a entrar na proposta. Assim que assentarem, o envio fica disponível.`,
        "info",
      );
      setConfirmSend(false);
      return;
    }
    setBusy("send");
    setConfirmSend(false);
    /**
     * ── O WHATSAPP ABRE-SE AQUI, AINDA DENTRO DO CLIQUE ─────────────────────
     *
     * Achado n.º 4: com «Por onde segue: WhatsApp», o WhatsApp nunca abria. O
     * link só existe quando o servidor responde, e um separador aberto DEPOIS
     * de um `await` é bloqueado pelo browser (já não é o gesto dela). Abre-se
     * vazio agora, e aponta-se para o WhatsApp quando o link chegar; se o envio
     * não chegar lá, fecha-se.
     */
    let janelaDoWhatsApp: Window | null = null;
    let whatsAppAberto = false;
    if (canal === "whatsapp") {
      try {
        janelaDoWhatsApp = window.open("", "_blank") ?? null;
        if (janelaDoWhatsApp) janelaDoWhatsApp.opener = null;
      } catch {
        janelaDoWhatsApp = null;
      }
    }
    // O retrato do que vai seguir: se o PDF desta versão já estiver à mão, é o
    // ficheiro que o «Descarregar PDF» de depois do envio entrega.
    const retratoDoEnvio = retratoDoPdf(stripPendingImages(doc), idiomaDoPdf);
    // Se a resposta do servidor CHEGOU, um erro a seguir não é «a resposta não
    // chegou» — é outra coisa, e diz-se como tal (revisão de 13/11).
    let respondeu = false;
    try {
      const comecou = Date.now();
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: sinalComTecto(TECTO_DO_ENVIO_MS),
        // As ORIGENS das fotos entram no documento no envio, e só no envio:
        // é a partir daqui que a proposta seguinte pode saber que esta já usou
        // aquele arco. Enquanto é rascunho, o mapa vive ao lado (SIDE_KEY) e
        // não tem de viajar.
        body: JSON.stringify({
          mode: "send",
          doc: { ...stripPendingImages(doc), fotosDeBiblioteca: origensNoDocumento() },
          /**
           * ── A LÍNGUA VAI COM O ENVIO, E FICA GRAVADA COM A PROPOSTA ──────
           *
           * Aqui não ia nenhuma, e a razão de então está escrita na rota: o
           * email era português em qualquer caso, e um PDF inglês dentro de um
           * email português seria pior do que os dois em português. Isso
           * mudou — o email, a página do aceite, o portal e a segunda descarga
           * seguem agora a língua da proposta —, e o que ficaria estranho é o
           * contrário: pré-visualizar em inglês e o casal receber português.
           *
           * É a MESMA escolha do passo 2 (um só estado), por isso não há como
           * enviar numa língua diferente daquela em que ela viu o documento.
           */
          idioma: idiomaDoPdf,
          /**
           * ── O EMAIL QUE ELA LEU NO ECRÃ É O EMAIL QUE SAI ────────────────
           *
           * O corpo e o assunto viajam JUNTOS e só quando há corpo: é o par que
           * veio do mesmo rascunho, e a rota recusa um assunto solto (ver o
           * `assuntoEscritoAMao`). Sem corpo — um estúdio antigo, uma leitura do
           * rascunho que falhou — nada disto vai e o email sai exactamente como
           * saía: o modelo dela, ou o texto da casa.
           *
           * O `modelo` não escolhe texto nenhum. Vai para a CÓPIA do envio, para
           * daqui a três semanas se saber de que texto é que este partiu.
           */
          ...(corpoDoEmail.trim()
            ? {
                corpo: corpoDoEmail,
                ...(assuntoDoEmail.trim() ? { assunto: assuntoDoEmail } : {}),
                ...(modeloDoEmail ? { modelo: modeloDoEmail } : {}),
              }
            : {}),
          // Só viaja quando é «sim»: um campo a dizer `false` em todos os
          // envios normais era um campo a mais a explicar a quem lesse a rota.
          // As respostas às perguntas do envio, só as dadas A ESTE documento
          // (`usePerguntasDoEnvio`): as fotos levam QUANTAS ela aceitou.
          ...perguntas.respostasPara(retratoDoEnvio),
          /* Só viaja quando é «não», pela mesma razão do `cortesConfirmados`
             aqui em cima — e porque a rota trata a AUSÊNCIA como «sim», para
             nenhum envio antigo deixar de sair por causa de um campo novo. */
          ...(canal === "whatsapp" ? { porEmail: false } : {}),
          // A chave do PDF final que foi visto e confirmado — o servidor
          // recusa o envio sem ela (ver `chaveDoQueChegou` na rota).
          ...(pdfVisto?.confirmado ? { pdfVisto: pdfVisto.chave } : {}),
        }),
      });
      respondeu = true;
      const data = await res.json().catch(() => null);
      /**
       * ── O ENVIO PAROU PARA PERGUNTAR ────────────────────────────────────
       *
       * O documento está desenhado e a proposta ainda não foi gravada nem
       * enviada: o servidor devolveu 409 com o que a composição cortou. Isto
       * NÃO é uma falha — é a única altura em que voltar atrás não custa nada,
       * e por isso não passa pelo `throw` (que pinta tudo de vermelho e diz
       * «não foi possível enviar»).
       */
      if (res.status === 409 && data?.precisaConfirmarFotos) {
        const n = Math.max(1, Math.floor(Number(data.missingImages)) || 1);
        perguntas.perguntar({ tipo: "fotos", n, retrato: retratoDoEnvio });
        return;
      }
      if (res.status === 409 && data?.precisaConfirmarCortes) {
        const cortes = normalizaCortes(data.truncations);
        perguntas.perguntar({ tipo: "cortes", cortes, retrato: retratoDoEnvio });
        return;
      }
      perguntas.fechar();
      if (!res.ok) throw new Error(data?.error || porqueFalhouOEnvio(res.status));
      // A proposta seguiu: a lista leve (fase do pedido, Pagamentos) relê-se.
      asPropostasMudaram();
      perguntas.esquecer();
      // O envio também ensina a estimativa. Os bytes vêm do servidor: o PDF do
      // envio não passa pelo browser (segue em anexo), portanto sem esta linha
      // metade das gerações não ensinava nada.
      if (typeof data?.pdfBytes === "number" && data?.pdfDaMemoria !== true) {
        apontarGeracao(totalDeFotos, Date.now() - comecou, data.pdfBytes);
      }
      // O link desta proposta, já pronto para o botão «Copiar resumo» — sem
      // esperar pela leitura de abertura (`GET`, aqui em cima) que já correu
      // há minutos, antes de haver o que enviar.
      if (typeof data?.acceptUrl === "string") setLinkDaProposta(data.acceptUrl);
      // A proposta ficou guardada em qualquer caso; a mensagem distingue enviada
      // por email vs guardada-mas-sem-email, para a equipa saber o que fazer.
      // O DOCUMENTO INCOMPLETO É O AVISO MAIS IMPORTANTE DOS TRÊS, por isso é o
      // que fica no ecrã. Uma proposta que seguiu para o noivo com fotos a
      // menos é o problema que originou esta contagem; saber que o email saiu
      // é secundário quando o documento que ele leva está incompleto.
      const emFalta = Number(data?.missingImages ?? 0);
      const aviso = avisoDeConteudoIncompleto(emFalta, normalizaCortes(data?.truncations));
      /**
       * ══════════════════════════════════════════════════════════════════════
       * «ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
       * ══════════════════════════════════════════════════════════════════════
       *
       * Um pedido sem email de cliente válido devolvia 200 com `emailed:false`
       * — e o ecrã mostrava um aviso cinzento, marcava o passo como «Proposta
       * enviada ✓» e seguia. Ela ficava convencida de que tinha ido; o casal
       * não recebia nada. É, ao pé da letra, «não dá para mandar a proposta
       * para o cliente» — e da pior maneira, porque nem sequer parecia falhar.
       *
       * O email não ter saído é um ERRO, não uma informação. E o passo só é
       * dado por feito quando o email saiu: a proposta fica gravada na mesma
       * (isso não se perde), mas o botão continua lá para ela poder corrigir o
       * contacto e enviar a sério.
       */
      // E o WhatsApp que ela escolheu também conta como ter seguido (achado
      // n.º 4): o servidor marca-a como «enviada» e devolve o link.
      const saiu =
        Boolean(data?.emailed) || (data?.semEmailPorEscolha === true && data?.estado === "enviada");
      /**
       * ══════════════════════════════════════════════════════════════════════
       * PRIMEIRO O QUE ACONTECEU, DEPOIS O QUE ESTAVA LÁ DENTRO
       * ══════════════════════════════════════════════════════════════════════
       *
       * Esta cadeia começava pelo `aviso` do conteúdo, e ele ganhava a tudo.
       * A prioridade fazia sentido quando havia três desfechos («o documento
       * incompleto é o mais importante dos três»); com cinco, produzia frases
       * que afirmam o contrário do que aconteceu:
       *
       *  · com uma foto em falta E o SMTP em baixo, lia-se «No PDF que seguiu,
       *    falta 1 foto. Verifica a proposta e reenvia» — e não seguiu PDF
       *    nenhum, o casal não recebeu nada;
       *  · com uma foto em falta E a marcação do estado a falhar, o
       *    `estadoError` nunca chegava a ser mostrado.
       *
       * A ordem passa a ser: decide-se primeiro por SAIU ou não saiu — que é o
       * facto — e só depois pelo conteúdo. E quando saiu, os avisos JUNTAM-SE
       * em vez de se substituírem: não há razão para escolher entre dizer que
       * faltou uma foto e dizer que o pedido não ficou actualizado.
       */
      if (!saiu) {
        // O email NÃO saiu. Nada do que o documento tenha lá dentro interessa
        // mais do que isto, e sobretudo nada pode dizer «que seguiu».
        toast(
          data?.emailError ||
            "A proposta foi gravada mas o EMAIL NÃO SAIU — o cliente não recebeu nada.",
          "error",
        );
      } else if (typeof data?.repetidoAviso === "string") {
        /**
         * O servidor reconheceu isto como uma REPETIÇÃO e não enviou nada
         * (mesmo documento, há menos de três minutos). Acontece quando a rede
         * tosse a meio, o ecrã diz que falhou, e ela carrega outra vez — o
         * primeiro pedido acabou por seguir. Dizer «Proposta enviada» aqui era
         * verdade só por acidente; dizer o que aconteceu é o que a impede de
         * ficar à espera de perceber porque é que há duas linhas no quadro.
         */
        toast(data.repetidoAviso, "success");
      } else {
        /**
         * O email saiu. Junta-se tudo o que correu mal DEPOIS disso, por ordem
         * de gravidade, numa frase só — cada um destes campos só vem na
         * resposta quando falhou mesmo.
         *
         * O `docError` (A9-003) nunca era lido: `grep docError` no cliente dava
         * zero. É o pior dos quatro — sem documento gravado, o link que o casal
         * acabou de receber não tem PDF nenhum para lhe mostrar.
         */
        const problemas = [
          typeof data?.docError === "string" && data?.docSaved === false ? data.docError : "",
          typeof data?.estadoError === "string" ? data.estadoError : "",
          typeof data?.pedidoError === "string" ? data.pedidoError : "",
          typeof data?.copiaError === "string" ? data.copiaError : "",
          aviso ? `No PDF que seguiu, ${aviso}.` : "",
        ].filter(Boolean);
        if (problemas.length > 0) {
          toast(problemas.join(" "), "error");
        } else {
          /* Com «só WhatsApp» não seguiu nada para ninguém — a proposta foi
             GERADA. Um aviso a dizer «enviada» era a mentira que faria a
             próxima pessoa não carregar no botão que falta. */
          toast(
            canal === "whatsapp"
              ? janelaDoWhatsApp
                ? "Proposta pronta — o WhatsApp abriu com o link. Escolhe o casal e carrega em enviar."
                : "Proposta pronta — falta mandá-la: é o botão «Mandar por WhatsApp»."
              : "Proposta enviada ao cliente",
            "success",
          );
        }
      }
      // Trava contra reenvio acidental: o passo Enviar passa a mostrar a
      // confirmação "Proposta enviada ✓" em vez do botão pronto a disparar.
      // Só quando há mesmo o que confirmar.
      if (saiu) {
        enviada.current = {
          id: typeof data?.id === "string" ? data.id : null,
          pdf:
            pdfPreparado.current?.retrato === retratoDoEnvio ? pdfPreparado.current.promessa : null,
        };
        setSent(true);
        onSent?.();
      }
      if (saiu && janelaDoWhatsApp && typeof data?.acceptUrl === "string") {
        janelaDoWhatsApp.location.href = linkDoWhatsApp(resumoComLink(data.acceptUrl));
        whatsAppAberto = true;
      }
    } catch (e) {
      // Tempo esgotado ou ligação cortada NÃO querem dizer «não seguiu»: o
      // pedido pode ter chegado e o email ter saído — só a resposta é que não
      // voltou. Diz-se isso, e não «erro», para ela ver antes de carregar outra
      // vez (e, se carregar logo, o servidor responde que ainda está a enviar).
      const semResposta = !respondeu && (eTempoEsgotado(e) || e instanceof TypeError);
      toast(
        semResposta
          ? "A resposta do envio não chegou (rede lenta ou cortada). A proposta pode já ter seguido: confirme no pedido se aparece como enviada antes de voltar a enviar."
          : porqueFalhou(e, "Erro ao enviar a proposta."),
        "error",
      );
    } finally {
      setBusy(null);
      // Não seguiu (ou parou para perguntar pelos cortes): o separador vazio
      // não fica aberto a fingir que alguma coisa vai acontecer.
      if (janelaDoWhatsApp && !whatsAppAberto) {
        try {
          janelaDoWhatsApp.close();
        } catch {
          /* já fechado */
        }
      }
    }
  }

  /**
   * Há destinatário para esta proposta?
   *
   * A MESMA regra do servidor (ver a rota do envio): um endereço com arroba e
   * um ponto no domínio. Não é uma validação a sério — é a que distingue «não
   * há email nenhum» de «há». Se as duas discordassem, o ecrã dizia que ia
   * seguir e o servidor não o mandava.
   */
  const emailDoCliente = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(quote.email ?? "");

  return { emailDoCliente, send };
}
