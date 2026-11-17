"use client";
import { useMemo } from "react";
import { estadoDoEnvio } from "../../BarraDoEnvioCompacta";
import { oQueFaltaParaEnviar, podeEnviar } from "@/lib/proposal-progress";
import { estadoDosPassos } from "@/lib/orcamento/passos-do-estudio";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { PASSOS_DO_FORMULARIO } from "../passos/passos-do-formulario";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useTraducoes } from "../traducoes/useTraducoes";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEstadoDoEnvio } from "./useEstadoDoEnvio";
import { usePdfDaProposta } from "./usePdfDaProposta";
import { useProntaParaEnviar } from "./useProntaParaEnviar";

export interface EntradaBotaoDoEnvio {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  envio: ReturnType<typeof useEstadoDoEnvio>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  pdfDaProposta: ReturnType<typeof usePdfDaProposta>;
  pronta: ReturnType<typeof useProntaParaEnviar>;
  total: ReturnType<typeof useTotalDaProposta>;
  traducoes: ReturnType<typeof useTraducoes>;
}

export function useBotaoDoEnvio({
  documento,
  envio,
  passos,
  pdfDaProposta,
  pronta,
  total,
  traducoes,
}: EntradaBotaoDoEnvio) {
  const { doc } = documento;
  const { pdfVisto, sent } = envio;
  const { step } = passos;
  const { fotosPorConfirmar } = pdfDaProposta;
  const { contextoDoEnvio, pdfConfirmado, pdfVistoAgora, seccoes } = pronta;
  const { money } = total;
  const { idiomaDoPdf } = traducoes;
  /**
   * As faltas DO BOTÃO DE ENVIAR: as de cima mais «falta ver o PDF final».
   * Ficam separadas de propósito — o `temErros` decide se se descarrega o
   * rascunho ou o PDF final, e se o «ver o PDF» entrasse nele o PDF final
   * nunca se podia descarregar para ser visto.
   */
  // E as fotos que o PDF final visto deixou de fora (17/11): uma linha na
  // Conferência, para não ficarem só no aviso que passa.
  const fotosEmFaltaNoPdf = pdfVistoAgora ? (pdfVisto?.emFalta ?? 0) : 0;
  const contextoDoBotao = useMemo(
    () => ({ ...contextoDoEnvio, pdfVisto: pdfConfirmado, fotosEmFaltaNoPdf }),
    [contextoDoEnvio, pdfConfirmado, fotosEmFaltaNoPdf],
  );
  const faltasDoEnvio = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross, contextoDoBotao);
  /** O sinal de cada passo na barra de cima — das mesmas duas listas. */
  // A MESMA lista do botão de enviar e da Conferência (`faltasDoEnvio`), e não
  // a de cima: com a de cima o «5 Rever e enviar» mostrava o visto enquanto a
  // Conferência travava com «Falta ver o PDF final» (auditoria de 14/11, n.º 4).
  const estadosDosPassos = estadoDosPassos(seccoes, faltasDoEnvio, sent);
  /**
   * A pastilha «Antes de enviar» está vermelha (alguma coisa trava o envio)?
   * Então é um ALARME e não um acessório: ao descer no telemóvel fica à vista,
   * senão o botão principal ficava apagado sem dizer porquê. A mesma regra da
   * pastilha (`estadoDoEnvio`), para as duas não discordarem.
   */
  const oEnvioTrava = estadoDoEnvio(faltasDoEnvio, fotosPorConfirmar, idiomaDoPdf).trava;
  /** Os passos 1 a 4 partilham o MESMO contentor, sempre montado. */
  const noFormulario = PASSOS_DO_FORMULARIO.includes(step);
  // A regra das FOTOS POR CONFIRMAR fica aqui e não em `proposal-progress`:
  // esse olha para o DOCUMENTO, e isto é um estado desta aba — a cópia que
  // ainda vai a caminho só esta sessão a conhece. O email sai uma vez, e um
  // PDF sem a foto escolhida dura para sempre.
  const canSend =
    podeEnviar(doc as ProposalDoc, money.gross, contextoDoBotao) && fotosPorConfirmar === 0;
  /**
   * O que o botão principal do «Rever e enviar» faz (ver «O BOTÃO QUE GUIA»,
   * na barra): quando a ÚNICA falta que trava é ver o PDF final, guia esse
   * passo em vez de ficar apagado.
   */
  const soFaltaVerOPdf =
    fotosPorConfirmar === 0 &&
    faltasDoEnvio.filter((f) => f.trava).length === 1 &&
    faltasDoEnvio.some((f) => f.trava && f.id === "visto");
  const modoDoBotao: "ver" | "confirmar" | "enviar" = soFaltaVerOPdf
    ? pdfVistoAgora
      ? "confirmar"
      : "ver"
    : "enviar";

  return {
    canSend,
    estadosDosPassos,
    faltasDoEnvio,
    modoDoBotao,
    noFormulario,
    oEnvioTrava,
    soFaltaVerOPdf,
  };
}
