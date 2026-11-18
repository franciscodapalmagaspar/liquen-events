"use client";

import { useToast } from "../../Toast";
import { useAvisoDeQualidade } from "../../AvisoDeQualidade";
import { useAmostrasDeGeracao } from "../envio/useAmostrasDeGeracao";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useRef, useState } from "react";
import { useEnvioAdiado } from "../../ui/envio-adiado";
import { useCamposPorConfirmar } from "../versoes/useCamposPorConfirmar";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { useMapasDasFotos } from "../fotos/useMapasDasFotos";
import { useCapa } from "../passos/evento/useCapa";
import { useTraducoes } from "../traducoes/useTraducoes";
import { useEstadoDoEnvio } from "../envio/useEstadoDoEnvio";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEscolhaDeFotos } from "../fotos/useEscolhaDeFotos";
import { useTempoNaProposta } from "../passos/useTempoNaProposta";
import { type CampoPublicado } from "@/lib/proposal-ortografia";
import { useSeleccaoDeFotos } from "../passos/inspiracao/useSeleccaoDeFotos";
import { useEstadoDoRascunho } from "../gravacao/useEstadoDoRascunho";
import { useTotalDaProposta } from "../passos/orcamento/useTotalDaProposta";
import { useRascunhoSobreposto } from "../gravacao/useRascunhoSobreposto";
import { useGravarNoServidor } from "../gravacao/useGravarNoServidor";
import { useHidratarFotos } from "../fotos/useHidratarFotos";
import { useAberturaDoEstudio } from "../gravacao/useAberturaDoEstudio";
import { type PropsDoEstudio } from "../tipos";

export function useNucleoDoEstudio({
  quote,
  quotes,
  onSent,
  onQuoteUpdated,
  onEstadoDoPedido,
  cliente,
}: PropsDoEstudio) {
  const { toast } = useToast();
  const avisoDeQualidade = useAvisoDeQualidade();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  /** As gerações anteriores ensinam a estimativa do PDF — ver o gancho. */
  const { amostras, apontarGeracao } = useAmostrasDeGeracao();
  const documento = useDocumentoDoEstudio({ quote });
  // «É mesmo um casamento»: o aviso de baixo cala-se para este pedido — e
  // fica calado nas próximas vezes (um casamento metido à mão, sem tipo, não
  // pode ficar a perguntar o mesmo cada vez que se abre).
  const chaveDoCasamentoConfirmado = `liquen-casamento-confirmado-${quote.id}`;
  const [casamentoConfirmado, setCasamentoConfirmado] = useState(() => {
    try {
      return localStorage.getItem(chaveDoCasamentoConfirmado) === "1";
    } catch {
      return false;
    }
  });
  /** Quando apareceu a pergunta «Enviar para…?» — ver `CONFIRMAR_ENVIO_APOS_MS`. */
  const perguntaDoEnvioDesdeRef = useRef(0);
  /**
   * ── DEZ SEGUNDOS PARA CANCELAR, DEPOIS DO «CONFIRMAR» ─────────────────────
   *
   * Ela escolheu «10 s para cancelar», como o Gmail (`docs/TUDO-REVERSIVEL.md`).
   * Só no email: no WhatsApp a janela tem de abrir DENTRO do clique (achado
   * n.º 4) e, de qualquer modo, é ela quem carrega em «Enviar» no WhatsApp —
   * a última palavra já é dela. O envio lê-se pela ref no fim da espera, para
   * levar o documento como está nesse instante e não como estava no clique.
   */
  const envioAdiado = useEnvioAdiado();
  const enviarAgoraRef = useRef<() => void>(() => {});
  const camposPorConfirmar = useCamposPorConfirmar();
  const reversiveis = useAccoesReversiveis();
  const fotos = useMapasDasFotos();
  const capa = useCapa({ documento, fotos, quote });
  const [refEdited, setRefEdited] = useState(false);
  /**
   * ── O CARREGAMENTO DE FOTOS, CONTADO ────────────────────────────────────
   *
   * Era um `boolean` por zona de largar, e a zona só sabia dizer «A carregar…».
   * Vinte fotografias de telemóvel com 4G são minutos, e a contagem existia o
   * tempo todo dentro do `handleUpload` (`results[]` e `files.length`) a ser
   * deitada fora — que é a única coisa que responde à pergunta dela: isto está
   * a andar ou está preso?
   *
   * A chave é a mesma de sempre (`cover-0`, `board-3`), e é por ela que o
   * progresso chega à `UploadArea` pelo caminho por onde o `busy` já ia. A
   * ausência da chave É o «não está a carregar nada».
   */
  const [uploading, setUploading] = useState<Record<string, { feito: number; total: number }>>({});
  /**
   * Quantas fotos de modelo estão a ser copiadas para a pasta deste pedido.
   *
   * Zero é «nenhuma». Soma-se e subtrai-se em vez de se escrever o número do
   * último lote: inserir dois modelos seguidos é um gesto normal, e o segundo
   * não pode apagar a espera do primeiro.
   */
  const [fotosACopiar, setFotosACopiar] = useState(0);
  const [busy, setBusy] = useState<null | "preview" | "send">(null);
  const traducoes = useTraducoes({ documento, quote, toast });
  const envio = useEstadoDoEnvio({ busy, quote });
  const passos = usePassosDoEstudio();
  const escolha = useEscolhaDeFotos();
  const tempoNaProposta = useTempoNaProposta({ quote });

  /**
   * O campo a que o aviso de ortografia mandou ir, à espera de ser desenhado.
   *
   * Não se pode saltar no mesmo instante em que se carrega: o aviso vive no
   * passo do envio e o campo está no do conteúdo, portanto no momento do clique
   * o controlo ainda não existe no DOM. Guarda-se o alvo e o salto é dado por um
   * efeito, depois do desenho — que é a única altura em que ele existe.
   */
  /** A falta que a Conferência mandou visitar — ver `irParaAFalta`. */
  const [faltaAVisitar, setFaltaAVisitar] = useState<{
    seccao?: string;
    campo?: string;
    /** Contador, para pedir DUAS vezes o mesmo sítio voltar a saltar. */
    pedido: number;
  } | null>(null);
  const [campoAVisitar, setCampoAVisitar] = useState<{
    campo: CampoPublicado;
    /** Contador de pedidos. Carregar duas vezes na mesma palavra tem de saltar
     *  as duas — e é ele que evita limpar o alvo DENTRO do efeito. */
    pedido: number;
    /** A qual das duas caixas. O painel «Por traduzir» manda à INGLESA, que é
     *  a que está por escrever; as gralhas mandam à portuguesa, onde a palavra
     *  está. */
    versao?: "pt" | "en";
  } | null>(null);
  const seleccao = useSeleccaoDeFotos({ documento });
  const rascunho = useEstadoDoRascunho({ documento, refEdited, toast, traducoes });
  const total = useTotalDaProposta({ documento, onQuoteUpdated, quote });
  const rascunhoSobreposto = useRascunhoSobreposto({ documento, quote, reversiveis, toast, total });
  const servidor = useGravarNoServidor({ documento, onEstadoDoPedido, quote, rascunho });
  const hidratar = useHidratarFotos({ fotos, quote, toast });
  useAberturaDoEstudio({
    DRAFT_KEY,
    SIDE_KEY,
    camposPorConfirmar,
    documento,
    fotos,
    quote,
    rascunho,
    servidor,
    setRefEdited,
    toast,
    total,
    traducoes,
  });

  return {
    pedido: { quote, quotes, onSent, onQuoteUpdated, onEstadoDoPedido, cliente },
    avisoDeQualidade,
    documento,
    envioAdiado,
    camposPorConfirmar,
    reversiveis,
    fotos,
    capa,
    traducoes,
    envio,
    passos,
    escolha,
    tempoNaProposta,
    seleccao,
    rascunho,
    total,
    rascunhoSobreposto,
    servidor,
    hidratar,
    avisos: { toast },
    chavesDoRascunho: { DRAFT_KEY, SIDE_KEY },
    geracoes: { amostras, apontarGeracao },
    casamento: { chaveDoCasamentoConfirmado, casamentoConfirmado, setCasamentoConfirmado },
    referencia: { refEdited, setRefEdited },
    carregamento: { uploading, setUploading, fotosACopiar, setFotosACopiar },
    ocupado: { busy, setBusy },
    visitas: { faltaAVisitar, setFaltaAVisitar, campoAVisitar, setCampoAVisitar },
    adiamento: { perguntaDoEnvioDesdeRef, enviarAgoraRef },
  };
}
