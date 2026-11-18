"use client";

import { lerPartilhado } from "@/lib/leitura-partilhada";
import { estadoNoEcra, haQueMostrar } from "@/lib/orcamento/estudio/estado-da-gravacao";
import { useAmostrasDeGeracao } from "./estudio/envio/useAmostrasDeGeracao";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { quandoGravado } from "@/lib/quando-gravado";
import { rolarAteVer } from "@/lib/motion/rolar";
import { porqueFalhouOEnvio } from "./porque-falhou-o-envio";
import { useToast } from "./Toast";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import {
  withProposalDefaults,
  DEFAULT_CONDICOES_GERAIS,
  detectVatMode,
  parseMoneyText,
  isPendingImage,
  stripPendingImages,
  DEFAULT_VAT_RATE,
  diasDeValidade,
  diaDoEvento,
  resolveValidUntil,
  type MoodBoard,
  type VatMode,
} from "@/lib/proposal-doc";
import { camposDoEventoNaLingua } from "@/lib/proposal-doc-textos";
import { ordemDeSaida } from "@/lib/proposal-ordem";
import { EstadoDaGravacaoNaBarra } from "./EstadoDaGravacaoNaBarra";
import { haAssinaturaMorta, semAssinaturasJaMortas } from "./assinatura";
import PainelInterno from "./PainelInterno";
import MoodBoardIndice from "./MoodBoardIndice";
import AEnviarAProposta from "./AEnviarAProposta";
import PerguntaAntesDoEnvio from "./PerguntaAntesDoEnvio";
import { passoParaCorrigir } from "./usePerguntasDoEnvio";

import PorqueNaoDaParaEnviar from "./PorqueNaoDaParaEnviar";
import { ControlosDoEnvio, PainelDoEnvio, PastilhaDoEnvio } from "./BarraDoEnvioCompacta";
import { destinoDoEnvio } from "@/lib/orcamento/destino-do-envio";
import EscolherDisposicao from "./EscolherDisposicao";
import PaginaEditorial from "./PaginaEditorial";
import EscolherFotoDaPagina from "./EscolherFotoDaPagina";
import CoresDaPaleta from "./CoresDaPaleta";
import { VerOPdfNoEcra } from "./VerOPdfNoEcra";
import { useAnular } from "./ui/anular";
import LupaDeFotos from "./LupaDeFotos";
import { ArrastoDosMoodBoards, CartaoDeBoard, ListaDeBoards } from "./MoodBoardFotos";
import { fotoPrincipalDe } from "@/lib/proposal-moodboard";
import { chaveDoCampo, seccaoDoCampo, type CampoPublicado } from "@/lib/proposal-ortografia";
import { fotosQueDestoam } from "@/lib/cor-dominante";
import { tempoEstimado } from "@/lib/custo-do-pdf";
import { totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { custosDe } from "@/lib/orcamento/margem";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  formulaDaLinha,
  totalDaLinha,
  type TipoDeEscala,
} from "@/lib/orcamento/escala";
import CriarAPartirDe from "./CriarAPartirDe";
import ModelosParciais from "./ModelosParciais";
import EditorDeEscolhas from "./EditorDeEscolhas";
import NavEstudio from "./NavEstudio";
import { MenuDeAccoes } from "./ui/MenuDeAccoes";
import { hojeNoEstudio } from "@/lib/fuso";
import { nomeDoPasso, passoAoLado, passoDaSeccao } from "@/lib/orcamento/passos-do-estudio";
import {
  capituloDoTema,
  composicaoEmPalavras,
  MAXIMO_POR_PAGINA,
  ordemDoDesenho,
  paginasDoTema,
} from "@/lib/pdf-editorial/plano";
import { disposicaoDoTema } from "@/lib/pdf-editorial/mosaico";
import { paletaDaProposta } from "@/lib/proposal-doc";
import { RepartoPorArtigo } from "./RepartoPorArtigo";
import {
  ARTIGOS,
  artigoDoAdicional,
  eArtigo,
  sugerirArtigoDaLinha,
  trazerServicosParaOOrcamento,
} from "@/lib/orcamento/artigos-de-faturacao";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { normalizarValor, somaDosExtrasSemIva } from "@/lib/proposal-budget";
import { eur, eurDocumento, montanteNaLingua, round2 } from "@/lib/money";
import { resumoDaPropostaParaCopiar } from "@/lib/email-proposta-textos";
import { randomId } from "./util";
import type { ActivityEntry, Quote, QuoteStatus } from "@/lib/orcamento/types";
import ThemePicker from "./ThemePicker";
import { estadoDaTraducao } from "@/lib/proposal-traducao";
import { camposPorRever } from "@/lib/proposal-doc-bilingue";
import { aquecerBiblioteca } from "./theme-picker-cache";
// A espera desenhada de uma maneira só. Ver `ui/EmCurso.tsx`: uma barra, um
// ponto a pulsar, e a contagem quando o código sabe contar — este ficheiro não
// inventa nenhuma espera sua.
import { Ajuda, Button, EmCurso, Field, Segmented } from "./ui";
import { eCasamento } from "@/lib/proposal-evento";
import { degrauDosAdicionais, type ContextoDoPreco } from "@/lib/preco-do-pedido";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useEnvioAdiado } from "./ui/envio-adiado";
import { useAvisoDeQualidade } from "./AvisoDeQualidade";
import { buildRef, type StudioDoc } from "@/lib/orcamento/estudio/documento-inicial";
import {
  semAsFotosNasPaginas,
  semOTema,
  temasLevadosPelasLinhas,
} from "@/lib/orcamento/estudio/temas-e-fotos";
import {
  avisoDeConteudoIncompleto,
  cortesDoCabecalho,
  textoDaGravacao,
  textoDoTotal,
  type EstadoDaGravacaoNoEcra,
} from "@/lib/orcamento/estudio/textos-do-estudio";
import {
  contagemDePrecos,
  modoDoAdicional,
  textoDoAdicional,
  type ModoDeIvaDoAdicional,
} from "@/lib/orcamento/estudio/precos-e-iva";
import {
  gravarRascunhoNoServidor,
  mandarPrecoAoPedido,
  type ResultadoDaGravacao,
  type ResultadoDoPreco,
} from "@/lib/orcamento/estudio/gravar";
import { PainelAdiado, VistaAdiada } from "./estudio/VistasAdiadas";
import {
  ADD_BTN,
  AVISO_DO_BOARD,
  INPUT_SM,
  PORTA_DE_COMECO,
  REMOVE_BTN,
  TITULO_DO_BOARD,
} from "./estudio/classes";
import { OPCOES_DO_CANAL } from "./estudio/envio/canal-de-envio";
import { guardarNoDisco } from "./estudio/envio/pdf-no-ecra";
import { AvisoDasTraducoes, RESSALVA_DO_INGLES } from "./estudio/formulario/AvisoDasTraducoes";
import { AvisoDeOrdem } from "./estudio/formulario/AvisoDeOrdem";
import { DescricaoQueCresce } from "./estudio/formulario/DescricaoQueCresce";
import { Section } from "./estudio/formulario/Section";
import { StepNav } from "./estudio/formulario/StepNav";
import { BarraDaSeleccao } from "./estudio/fotos/BarraDaSeleccao";
import { FantasmaDaFoto } from "./estudio/fotos/FantasmaDaFoto";
import { FotosDoBoard } from "./estudio/fotos/FotosDoBoard";
import { UploadArea } from "./estudio/fotos/UploadArea";
import { LinhaDeTotal } from "./estudio/orcamento/LinhaDeTotal";
import { MargemDoNegocio } from "./estudio/orcamento/MargemDoNegocio";
import { ResumoDasLinhas } from "./estudio/orcamento/ResumoDasLinhas";
import { SubpontosDaLinha } from "./estudio/orcamento/SubpontosDaLinha";
import { CustoDaGeracao } from "./estudio/resumo/CustoDaGeracao";
import { PreviewSummary } from "./estudio/resumo/PreviewSummary";
import type { Step } from "./estudio/tipos";
import { PassoServicos } from "./estudio/passos/PassoServicos";
import { SeccaoDaCapa } from "./estudio/passos/evento/SeccaoDaCapa";
import { SeccaoDoEvento } from "./estudio/passos/evento/SeccaoDoEvento";
import { EnviarAoCliente } from "./estudio/passos/rever/EnviarAoCliente";
import { EstaPronta } from "./estudio/passos/rever/EstaPronta";
import { PorOndeSegue } from "./estudio/passos/rever/PorOndeSegue";
import { SeccaoDoCronograma } from "./estudio/passos/inspiracao/SeccaoDoCronograma";
import { dataDoEnvioPorExtenso } from "@/lib/orcamento/estudio/data-do-envio";
import { esperaDaCopiaDeFotos, esperaDaTraducao } from "@/lib/orcamento/estudio/esperas";
import { CONFIRMAR_ENVIO_APOS_MS, MAX_HISTORICO } from "./estudio/limites";
import { useDocumentoDoEstudio } from "./estudio/documento/useDocumentoDoEstudio";
import { useAccoesReversiveis } from "./estudio/documento/useAccoesReversiveis";
import { useFasesDoCronograma } from "./estudio/passos/inspiracao/useFasesDoCronograma";
import { useCamposPorConfirmar } from "./estudio/versoes/useCamposPorConfirmar";
import { useTotalDaProposta } from "./estudio/passos/orcamento/useTotalDaProposta";
import { useSomarOTotal } from "./estudio/passos/orcamento/useSomarOTotal";
import { useContasDoOrcamento } from "./estudio/passos/orcamento/useContasDoOrcamento";
import { useMapasDasFotos } from "./estudio/fotos/useMapasDasFotos";
import { useConfirmacoes } from "./estudio/documento/useConfirmacoes";
import { useOrdemDoOrcamento } from "./estudio/passos/orcamento/useOrdemDoOrcamento";
import { useAdicionaisDoOrcamento } from "./estudio/passos/orcamento/useAdicionaisDoOrcamento";
import { useLinhasDoOrcamento } from "./estudio/passos/orcamento/useLinhasDoOrcamento";
import { useTotalAcompanhaOPedido } from "./estudio/passos/orcamento/useTotalAcompanhaOPedido";
import { useConferenciaComOEnviado } from "./estudio/versoes/useConferenciaComOEnviado";
import { useCopiaEModelos } from "./estudio/versoes/useCopiaEModelos";
import { useTraducoes } from "./estudio/traducoes/useTraducoes";
import { useCapa } from "./estudio/passos/evento/useCapa";
import {
  useSeleccaoDeFotos,
  useSeleccaoSegueAFotografia,
} from "./estudio/passos/inspiracao/useSeleccaoDeFotos";
import { useDobrasDosBoards } from "./estudio/passos/inspiracao/useDobrasDosBoards";
import { useMoodBoards } from "./estudio/passos/inspiracao/useMoodBoards";
import { useArrumacaoDosBoards } from "./estudio/passos/inspiracao/useArrumacaoDosBoards";
import { useFotosDosBoards } from "./estudio/passos/inspiracao/useFotosDosBoards";
import { usePassosDoEstudio } from "./estudio/passos/usePassosDoEstudio";
import { useTempoNaProposta } from "./estudio/passos/useTempoNaProposta";
import { useEscolhaDeFotos } from "./estudio/fotos/useEscolhaDeFotos";
import { useEstadoDoEnvio } from "./estudio/envio/useEstadoDoEnvio";
import { useDesfazer } from "./estudio/documento/useDesfazer";
import { useRestaurarVersao } from "./estudio/versoes/useRestaurarVersao";
import { useNotaDaSeccao } from "./estudio/documento/useNotaDaSeccao";
import { useLimparORascunho } from "./estudio/documento/useLimparORascunho";
import { useRascunhoSobreposto } from "./estudio/gravacao/useRascunhoSobreposto";
import { useRepeticoesDasFotos } from "./estudio/fotos/useRepeticoesDasFotos";
import { usePaginasDaProposta } from "./estudio/pdf/usePaginasDaProposta";
import { useFotosDaPagina } from "./estudio/pdf/useFotosDaPagina";
import { useDisposicaoDasPaginas } from "./estudio/pdf/useDisposicaoDasPaginas";
import { usePaletaDaProposta } from "./estudio/pdf/usePaletaDaProposta";
import { useBarraDoEstudio } from "./estudio/barra/useBarraDoEstudio";
import { useCarregarFotos } from "./estudio/fotos/useCarregarFotos";
import { useBibliotecaDeFotos } from "./estudio/fotos/useBibliotecaDeFotos";
import { useFotosUsadasNoutras } from "./estudio/fotos/useFotosUsadasNoutras";
import { usePdfDaProposta } from "./estudio/envio/usePdfDaProposta";
import { useSugestoesDoPedido } from "./estudio/passos/evento/useSugestoesDoPedido";
import { useLinkDaPropostaEnviada } from "./estudio/envio/useLinkDaPropostaEnviada";
import { useProntaParaEnviar } from "./estudio/envio/useProntaParaEnviar";
import { useBotaoDoEnvio } from "./estudio/envio/useBotaoDoEnvio";
import { useEnviarAProposta } from "./estudio/envio/useEnviarAProposta";
import { usePainelDaProposta } from "./estudio/painel/usePainelDaProposta";
import { useEstadoDoRascunho } from "./estudio/gravacao/useEstadoDoRascunho";
import { useGravarNoServidor } from "./estudio/gravacao/useGravarNoServidor";
import { useHidratarFotos } from "./estudio/fotos/useHidratarFotos";
import { useAberturaDoEstudio } from "./estudio/gravacao/useAberturaDoEstudio";

/*
 * A lógica pura do estúdio vive em `lib/orcamento/estudio/` (fase 1 de
 * `docs/ESTRUTURA-DO-CODIGO.md`). O que este ficheiro exportava continua a
 * sair daqui, para nenhum teste nem chamador ter de mudar.
 */
export { semAsFotosNasPaginas, semOTema, temasLevadosPelasLinhas };
export { avisoDeConteudoIncompleto, cortesDoCabecalho, textoDaGravacao, textoDoTotal };
export type { EstadoDaGravacaoNoEcra };
export { contagemDePrecos, modoDoAdicional, textoDoAdicional };
export type { ModoDeIvaDoAdicional };
export { gravarRascunhoNoServidor, mandarPrecoAoPedido };
export type { ResultadoDaGravacao, ResultadoDoPreco };

/**
 * O helper vive num módulo PRÓPRIO, e não dentro do Estúdio, por uma razão de
 * peso: o construtor de preços (`ProposalBuilder`) precisa dele e é montado
 * SEMPRE, enquanto o Estúdio entra por `dynamic()`. Importá-lo de lá arrastava
 * o Estúdio inteiro para o pacote inicial do back office.
 */
export { porqueFalhouOEnvio };

/**
 * Visual editor for the studio's multi-page proposal PDF. Produces a
 * {@link ProposalDoc}-shaped payload (minus the fixed boilerplate, which the
 * server fills via {@link withProposalDefaults}) and previews / e-mails it.
 */
interface Props {
  quote: Quote;
  /**
   * Os outros pedidos, só para o painel interno saber o que ela costuma cobrar
   * num casamento desta dimensão. Opcional: sem eles o estúdio funciona na
   * mesma e o aviso de "valor fora do habitual" simplesmente não aparece —
   * comparar com dois eventos seria pior do que não comparar.
   */
  quotes?: Quote[];
  onSent?: () => void;
  /**
   * O valor mudou aqui. O pai actualiza a sua cópia do pedido para o "Preço
   * final" da Gestão do pedido mostrar o mesmo número — porque é o MESMO
   * número: o estúdio grava-o no pedido, não guarda um segundo.
   */
  onQuoteUpdated?: (quote: Quote) => void;
  /**
   * O servidor mudou o ESTADO do pedido ao gravar o rascunho (6/11: «A
   * preparar proposta»). Só o estado, e não o pedido inteiro: a cópia que o
   * estúdio tem pode estar mais velha do que a do pai (o preço gravado entre
   * duas teclas), e devolvê-la inteira era desfazer essa gravação no ecrã.
   */
  onEstadoDoPedido?: (status: QuoteStatus) => void;
  /**
   * Para quem é a proposta, e as duas portas do pedido. Dado pelo «Fazer
   * proposta», o estúdio põe-no NA MESMA LINHA das suas acções — antes eram um
   * cartão inteiro, um traço e uma linha «Estúdio de propostas (PDF)» por cima
   * dos passos (360 px no computador, ~1 000 num telemóvel, antes do primeiro
   * campo). Pedido dela de 9/11: «está uma confusão brutal».
   */
  cliente?: { nome: string; onAbrirPedido: () => void; onTrocar: () => void };
}

export default function ProposalStudio({
  quote,
  quotes,
  onSent,
  onQuoteUpdated,
  onEstadoDoPedido,
  cliente,
}: Props) {
  const { toast } = useToast();
  const avisoDeQualidade = useAvisoDeQualidade();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  /** As gerações anteriores ensinam a estimativa do PDF — ver o gancho. */
  const { amostras, apontarGeracao } = useAmostrasDeGeracao();
  const documento = useDocumentoDoEstudio({ quote });
  const {
    camposTocadosRef,
    doc,
    docAssenteRef,
    historicoRef,
    patch,
    podeDesfazer,
    setDoc,
    setPodeDesfazer,
  } = documento;
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
  const perguntaDoEnvioDesde = useRef(0);
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
  const enviarAgora = useRef<() => void>(() => {});
  const camposPorConfirmar = useCamposPorConfirmar();
  const { confirmado, realce } = camposPorConfirmar;
  const reversiveis = useAccoesReversiveis();
  const { confirmacaoDeDinheiro, limpo, setConfirmacaoDeDinheiro } = reversiveis;
  const fotos = useMapasDasFotos();
  const {
    aspetosDasFotos,
    assetCores,
    assetMedias,
    assetOriginais,
    assetUrls,
    estadoDosUrls,
    marcarUrlMorto,
    registarAspeto,
    setAssetMedias,
    setAssetOriginais,
    setAssetUrls,
    themeOrigins,
  } = fotos;
  const capa = useCapa({ documento, fotos, quote });
  const { focoAutoDaCapa, idxDaCapa, removeCoverAt, setCoverAt, tamanhoDaCapa } = capa;
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
  const {
    aTraduzir,
    bilingue,
    caixaDeIngles,
    idiomaDoPdf,
    setBilingue,
    setIdiomaDoPdf,
    setTraducao,
    traducao,
    traducaoLigada,
    traducoesPorSeccao,
    traduzirTudo,
  } = traducoes;
  const envio = useEstadoDoEnvio({ busy, quote });
  const {
    assuntoDoEmail,
    avancoDaEnviada,
    bytesDoPdf,
    canal,
    confirmSend,
    corpoDoEmail,
    escolherCanal,
    fimDoPdf,
    linkDaProposta,
    pdfNoEcra,
    pdfVisto,
    sent,
    setAssuntoDoEmail,
    setConfirmSend,
    setCorpoDoEmail,
    setModeloDoEmail,
    setPdfNoEcra,
    setPdfVisto,
    setSent,
  } = envio;
  const passos = usePassosDoEstudio();
  const { formularioDosPassos, irParaPasso, passoDoEnvio, setStep, step } = passos;
  const escolha = useEscolhaDeFotos();
  const { aArrastar, lupa, picker, pickerNoEcra, setAArrastar, setLupa, setPicker } = escolha;
  const tempoNaProposta = useTempoNaProposta({ quote });
  const { anotarSeccao } = tempoNaProposta;

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
  const { seleccionadas, setSeleccionadas } = seleccao;
  const rascunho = useEstadoDoRascunho({ documento, refEdited, toast, traducoes });
  const {
    aAbrirRef,
    aGravarNoServidor,
    aberturaAssente,
    avisoDoSoLocalPorDar,
    avisouJuncaoRef,
    docDoServidorRef,
    flushDraftRef,
    gravacao,
    gravadoEm,
    hydratedRef,
    jaGravouRef,
    marcaDaAberturaRef,
    marcaDoTrabalho,
    montagemRef,
    nadaPorGravar,
    naoDuraAoDeploy,
    porGravar,
    porGravarRef,
    serverStampRef,
    setGravadoEm,
    setPorGravar,
    soNesteComputador,
    warnedOverwriteRef,
  } = rascunho;
  const total = useTotalDaProposta({ documento, onQuoteUpdated, quote });
  const {
    composeTotalText,
    desvio,
    duasFormas,
    erroDoTotal,
    escrito,
    money,
    onTotalInput,
    pctSinal,
    precoAGravar,
    precoPorChegar,
    setSinalEscrito,
    sinalAntesRef,
    sinalEscrito,
    split,
    tentarGravarOPreco,
    totais,
    totalInput,
    vatMode,
  } = total;
  const rascunhoSobreposto = useRascunhoSobreposto({ documento, quote, reversiveis, toast, total });
  const { aRepor, reporSobreposto, setSobreposto, sobreposto } = rascunhoSobreposto;
  const servidor = useGravarNoServidor({ documento, onEstadoDoPedido, quote, rascunho });
  const { enviarParaServidor } = servidor;
  const hidratar = useHidratarFotos({ fotos, quote, toast });
  const { hidratarAssets, tentarBuscarFotos } = hidratar;
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

  useEffect(() => {
    let alive = true;
    void hidratarAssets(() => alive, { daAbertura: true });
    return () => {
      alive = false;
    };
  }, [hidratarAssets]);

  /**
   * ── O ESTÚDIO ABERTO DE UM DIA PARA O OUTRO (14/11) ────────────────────
   * A hidratação corria UMA vez, à entrada. Com o separador aberto mais de
   * seis horas, as assinaturas da Biblioteca morriam com o ecrã à frente dela,
   * e cada célula nova (um passo aberto, uma pré-visualização) pedia ao
   * Storage um URL que ele recusa com 400.
   *
   * Ao voltar ao separador pergunta-se aos URLs que estão no ecrã se algum já
   * morreu; só então se pede a lista outra vez, e o `urlAindaBom` troca os
   * mortos e deixa os bons (a cache do browser continua a valer). Custo: zero
   * pedidos enquanto tudo serve; uma leitura do `/assets` por regresso depois
   * de expirar. Nenhum relógio a bater.
   */
  const urlsNoEcra = useRef<Record<string, string>[]>([]);
  useEffect(() => {
    urlsNoEcra.current = [assetUrls, assetOriginais, assetMedias];
  }, [assetUrls, assetOriginais, assetMedias]);
  useEffect(() => {
    // O `focus` e o `visibilitychange` chegam os dois no mesmo regresso: uma
    // leitura só, não duas.
    let aCaminho = false;
    const aoVoltar = () => {
      if (aCaminho || document.visibilityState !== "visible") return;
      if (!haAssinaturaMorta(urlsNoEcra.current)) return;
      aCaminho = true;
      void hidratarAssets()
        .then((fim) => {
          // Só depois de a lista ter VINDO. Uma lista que falhou (sessão
          // caducada, Storage em baixo, sem rede) não diz nada sobre as fotos:
          // fica tudo como estava, e o próximo regresso volta a tentar.
          if (fim !== "pronto") return;
          // O que a lista não trouxe de volta (uma foto que só está no
          // rascunho deste computador) continuava morto — e cada regresso
          // pedia a lista outra vez. Sai só o que JÁ morreu: um URL dentro da
          // margem de cinco minutos ainda desenha a fotografia.
          setAssetUrls((m) => semAssinaturasJaMortas(m));
          setAssetOriginais((m) => semAssinaturasJaMortas(m));
          setAssetMedias((m) => semAssinaturasJaMortas(m));
        })
        .finally(() => {
          aCaminho = false;
        });
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [hidratarAssets, setAssetMedias, setAssetOriginais, setAssetUrls]);

  /**
   * ── HÁ SERVIÇO DE TRADUÇÃO NESTE SERVIDOR? ────────────────────────────────
   *
   * Uma pergunta, uma vez, ao abrir. A chave vive do lado do servidor — nunca
   * pode chegar ao navegador —, portanto o estúdio não tem como saber sozinho.
   *
   * Falhando (sem rede, sessão caducada), o botão fica desligado — o lado
   * seguro, e é o que já fazia. O que MUDOU é que a falha se distingue de um
   * «não»: `"indisponivel"` e não `"desligada"`, para a frase por baixo do
   * botão não culpar a configuração de um problema que não é dela. Nada aqui lê
   * o `localStorage`, e por isso não pisa o efeito de restauro (ver o bloco
   * «CORRE UMA VEZ SÓ»).
   */
  useEffect(() => {
    let vivo = true;
    // Pela leitura partilhada: o `StrictMode` (e um segundo estúdio) pedia-a duas vezes.
    void estadoDaTraducao((url, init) => lerPartilhado(String(url), init)).then((estado) => {
      if (vivo) setTraducao(estado);
    });
    return () => {
      vivo = false;
    };
  }, [setTraducao]);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited, setDoc]);
  /**
   * E a abertura acaba no PRIMEIRO GESTO DELA — não num relógio.
   *
   * É o único sinal honesto: um relógio ou uma contagem de passagens fazia a
   * fronteira depender da velocidade da rede desta manhã, e a partir daí
   * haveria manhãs em que a primeira letra escrita não contava como trabalho.
   * Daqui para a frente, tudo o que mexer no documento é dela até prova em
   * contrário.
   */
  useEffect(() => {
    const fechar = () => {
      aAbrirRef.current = false;
    };
    // `input` e `change` estão aqui por uma razão que não é teórica: nem toda a
    // escrita passa por uma tecla. O preenchimento automático do browser, um
    // gestor de palavras-passe, a ditadura de voz e os passeios automáticos
    // escrevem o valor e disparam só `input` — sem `keydown`. Sem estes dois,
    // esse texto ficava do lado da «abertura» e não era gravado.
    const gestos = ["pointerdown", "keydown", "input", "change", "drop", "paste"] as const;
    for (const g of gestos) window.addEventListener(g, fechar, true);
    return () => {
      for (const g of gestos) window.removeEventListener(g, fechar, true);
    };
  }, [aAbrirRef]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (montagemRef.current) {
      montagemRef.current = false;
      return;
    }
    if (aAbrirRef.current) {
      // Enquanto durar a abertura, o que está no ecrã É a abertura. Não se
      // fixa na primeira passagem porque a abertura não é uma: o restauro (ou
      // a semeadura) é a primeira, e atrás dela vêm as derivadas — os
      // identificadores estáveis dos grupos e das linhas, o merge do rascunho
      // do servidor, as fotos que a hidratação vai buscar. Nenhuma delas é
      // trabalho dela, e fixar a marca antes de todas fazia o alarme acender
      // por causa de um `id` que o próprio estúdio acabou de escrever.
      marcaDaAberturaRef.current = marcaDoTrabalho();
      docAssenteRef.current = doc;
      return;
    }
    if (nadaPorGravar()) return;
    /**
     * ── JÁ ESTÁ MARCADO: NÃO VOLTAR A MANDAR ─────────────────────────────
     *
     * Sem isto, este efeito chamava `setPorGravar(true)` a CADA passagem
     * enquanto houvesse trabalho por gravar. O valor é sempre o mesmo, e por
     * isso parece inofensivo — só que a lista de dependências aqui em baixo
     * tem objectos que nascem outra vez a cada desenho (`doc`, `assetUrls`,
     * `themeOrigins`). Efeito que corre em todos os desenhos + `setState` sem
     * guarda = desenho → efeito → `setState` → desenho, e o React corta ao fim
     * de algumas dezenas com «Maximum update depth exceeded».
     *
     * Apanhado no CI, no passeio de esforço do editor (50 linhas escritas
     * seguidas), e antes disso na Biblioteca de Temas: dois erros de runtime
     * por corrida, INTERMITENTES — passavam à repetição. Um erro que passa à
     * repetição é o pior tipo: existe, faz o ecrã cair no aviso global, e
     * ninguém o vai investigar porque «às vezes passa».
     *
     * `porGravarRef` é um espelho fiel do estado — sobem juntos aqui e descem
     * juntos ao gravar — portanto perguntar-lhe é perguntar ao estado sem o
     * pôr nas dependências.
     */
    if (porGravarRef.current) return;
    porGravarRef.current = true;
    setPorGravar(true);
    // A primeira mudança desde o documento assente (a abertura, ou a última
    // gravação): ele entra no histórico, para a PRIMEIRA mudança também se
    // poder desfazer — e logo, sem esperar pela fotografia dos 800 ms.
    if (historicoRef.current.length === 0 && docAssenteRef.current) {
      historicoRef.current = [docAssenteRef.current];
    }
    if (historicoRef.current.length > 0) setPodeDesfazer(true);
    // A mensagem do envio conta como trabalho por gravar: sem ela nesta lista, o
    // indicador dizia «guardado às 14:32» com o texto dela ainda por escrever no
    // rascunho — e é essa frase que faz uma pessoa fechar o portátil descansada.
    // `marcaDoTrabalho` na lista não muda nada: o `nadaPorGravar` já depende
    // dela, e o efeito já corria quando ela mudava. Fica escrita para a regra
    // das dependências não ter de ser lida duas vezes.
  }, [
    doc,
    assetUrls,
    themeOrigins,
    refEdited,
    bilingue,
    nadaPorGravar,
    marcaDoTrabalho,
    hydratedRef,
    montagemRef,
    aAbrirRef,
    porGravarRef,
    setPorGravar,
    historicoRef,
    docAssenteRef,
    setPodeDesfazer,
    marcaDaAberturaRef,
  ]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    const save = () => {
      // Uma fotografia para o Cmd+Z, tirada quando ela pára de escrever. Se
      // fosse a cada tecla, desfazer andava letra a letra e não servia para
      // nada; se fosse só nas remoções, não desfazia um texto trocado.
      const ultimo = historicoRef.current[historicoRef.current.length - 1];
      if (!ultimo || JSON.stringify(ultimo) !== JSON.stringify(doc)) {
        historicoRef.current = [...historicoRef.current, doc].slice(-MAX_HISTORICO);
      }
      docAssenteRef.current = doc;
      // Dois, e não um: o último do histórico é o documento ACTUAL, portanto
      // com uma só fotografia não há nada anterior para onde voltar.
      setPodeDesfazer(historicoRef.current.length >= 2);

      // NADA DE MARCADORES PROVISÓRIOS NO RASCUNHO GRAVADO.
      //
      // Um `pending:<uuid>` é uma promessa viva na memória desta aba: a cópia
      // que lhe vai dar morada corre aqui, e mais ninguém a conhece. Gravado,
      // sobreviveria ao recarregar da página como um caminho que nunca vai
      // existir — uma foto fantasma no mood board, e um buraco silencioso no
      // PDF que ninguém volta a saber explicar. Sai do documento e sai também
      // dos mapas de apoio, que são gravados ao lado dele.
      const gravavel = stripPendingImages(doc);
      const semProvisorios = <T,>(mapa: Record<string, T>): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const [k, v] of Object.entries(mapa)) if (!isPendingImage(k)) out[k] = v;
        return out;
      };
      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RASCUNHO FICA NESTE COMPUTADOR — E ISSO É O QUE SE QUER
       * ══════════════════════════════════════════════════════════════════════
       *
       * O CodeQL assinala estas linhas com «Clear text storage of sensitive
       * information», severidade alta. O que ele vê é verdade: o documento tem
       * o nome do casal e a morada do espaço, e é gravado em claro no
       * `localStorage` desta máquina.
       *
       * É o comportamento pretendido, e a alternativa é pior. Uma proposta
       * demora horas a montar; a rede de casa dela cai; o portátil vai para a
       * quinta no dia da montagem. Sem esta cópia, uma gravação falhada ao
       * servidor é trabalho perdido — e foi exactamente isso que aconteceu
       * antes de isto existir. Cifrar não resolveria nada: a chave teria de
       * viver ao lado, no mesmo browser.
       *
       * O que NÃO está aqui, e é o que importa: não há segredos nenhuns. Nem
       * palavra-passe, nem sessão, nem chaves de armazenamento. Os marcadores
       * provisórios são filtrados acima (`semProvisorios`), e os preços de
       * custo, que são o único número verdadeiramente interno, nunca saem para
       * o cliente por outro caminho — ver `proposal-doc-pdf`.
       *
       * Quem tem acesso a este `localStorage` já tem acesso à sessão aberta do
       * back office no mesmo browser, e daí a tudo.
       */
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(gravavel));
        localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
        localStorage.setItem(
          SIDE_KEY,
          JSON.stringify({
            urls: semProvisorios(assetUrls),
            // O plano B viaja com o rascunho. Sem isto, reabrir num sítio sem
            // rede (ou antes de a hidratação responder) deixava as células sem
            // para onde cair — que é exactamente quando mais falta faz.
            originais: semProvisorios(assetOriginais),
            // E o degrau do meio, para uma reabertura sem rede não ter de cair
            // de 20 KB direita a 1099 — que é precisamente quando não há linha
            // para os pagar.
            medias: semProvisorios(assetMedias),
            // As cores viajam com o rascunho pela mesma razão que o plano B:
            // reabrir sem rede (ou antes de a hidratação responder) deixava o
            // aviso de paleta mudo justamente quando ele ainda faz falta.
            cores: semProvisorios(assetCores),
            themeOrigins: semProvisorios(themeOrigins),
            refEdited,
            // O interruptor das caixas inglesas. É CONVENIÊNCIA e não
            // correcção: se este `meta` se perder, o interruptor abre ligado na
            // mesma quando o documento tem traduções lá dentro. Nenhum trabalho
            // dela depende de isto sobreviver.
            bilingue,
            // A língua escolhida. Ao lado do rascunho e não dentro dele: não é
            // conteúdo da proposta — o mesmo documento sai nas duas línguas —,
            // é a escolha que ela fez para ESTE envio. E é a única das três
            // linhas daqui que, perdida, muda o que o cliente recebe.
            idioma: idiomaDoPdf,
          }),
        );
        setGravadoEm(new Date());
        // A partir daqui há rascunho gravado, e voltar ao estado de abertura
        // deixa de ser «nada por gravar» — ver o bloco da abertura.
        jaGravouRef.current = true;
        porGravarRef.current = false;
        setPorGravar(false);
      } catch {
        /* quota / unavailable — non-fatal */
      }
      // E no servidor, que é o que sobrevive à mudança de dispositivo. Falhar
      // aqui não interrompe o trabalho: a cópia local continua a valer e a
      // gravação seguinte tenta de novo. O que NÃO pode acontecer é falhar sem
      // se ver — era isso que fazia o indicador dizer «guardado» a uma proposta
      // que só existia neste portátil.
      return (async () => {
        const r = await enviarParaServidor(gravavel);
        if (r.estado === "so-local") return r;
        // Alguém gravou entre a nossa leitura e esta escrita. A nossa versão
        // fica (a última vence), mas dizê-lo é o mínimo — desaparecer com o
        // trabalho de outra pessoa em silêncio, não.
        // Juntou-se sem pisar ninguém: dizê-lo uma vez, para ela saber porque
        // é que apareceu no ecrã texto que não escreveu.
        if (r.juntou && !r.overwrote && !avisouJuncaoRef.current) {
          avisouJuncaoRef.current = true;
          const quem = r.previousBy ? `por ${r.previousBy}` : "noutro sítio";
          toast(
            `Este rascunho estava a ser alterado ${quem}. Juntei as duas versões: o que mudaste ficou teu, e o que mudaram lá já está no ecrã.`,
            "info",
          );
        }
        if (r.overwrote && !warnedOverwriteRef.current) {
          warnedOverwriteRef.current = true;
          /**
           * ── A FRASE MUDOU, E A MUDANÇA É O PONTO ─────────────────────────
           *
           * Dizia «Ficou a tua versão.» e acabava ali. É verdade, e mesmo
           * assim era a pior coisa a dizer: quem lê aquilo conclui que o
           * trabalho da outra pessoa acabou. Não acabou — o servidor guarda-o
           * sempre —, mas ninguém tinha como saber, e sobretudo ninguém tinha
           * como lá chegar.
           *
           * Quando há gaveta (`r.resgate`), a frase deixa de fechar a porta e
           * manda-a olhar para a barra, que é onde a decisão vive. Quando não
           * há — o servidor não conseguiu guardar a cópia, e regista-o —, a
           * frase antiga é a honesta e fica.
           */
          const quem = r.previousBy ? `por ${r.previousBy}` : "noutro sítio";
          toast(
            r.resgate
              ? `Este rascunho tinha sido alterado ${quem}. Ficou a tua versão, e a outra está guardada — vê em cima.`
              : `Este rascunho tinha sido alterado ${quem}. Ficou a tua versão.`,
            "info",
          );
        }
        // A barra, ao contrário do aviso, actualiza-se a cada sobreposição: a
        // gaveta tem UMA ranhura e guarda sempre a última, portanto apontar
        // para uma anterior seria apontar para o sítio errado.
        if (r.overwrote && r.resgate) {
          setSobreposto({ chave: r.resgate, quem: r.previousBy, quando: r.resgateEm });
        }
        return r;
      })();
    };
    flushDraftRef.current = save;
    // A abertura não se grava. O `flushDraft` fica montado à mesma — o
    // Ctrl/Cmd+Enter dos Serviços tem de continuar a poder gravar à ordem —,
    // mas o relógio dos 800 ms não arranca por causa de um documento que
    // ninguém escreveu. Ver o bloco «A ABERTURA TAMBÉM NÃO É TRABALHO POR
    // GRAVAR».
    if (nadaPorGravar()) return;
    const t = setTimeout(save, 800);
    return () => clearTimeout(t);
  }, [
    doc,
    assetUrls,
    assetOriginais,
    assetMedias,
    assetCores,
    themeOrigins,
    refEdited,
    // O mesmo para o interruptor: sem ele aqui, ligá-lo e fechar o separador
    // devolvia o ecrã de uma língua só na abertura seguinte.
    bilingue,
    // E o mesmo para a língua: sem ela aqui, escolher «Inglês» não voltava a
    // agendar a gravação, e o `meta` guardado continuava a dizer «pt».
    idiomaDoPdf,
    DRAFT_KEY,
    SIDE_KEY,
    quote.id,
    toast,
    enviarParaServidor,
    nadaPorGravar,
    hydratedRef,
    flushDraftRef,
    historicoRef,
    docAssenteRef,
    setPodeDesfazer,
    setGravadoEm,
    jaGravouRef,
    porGravarRef,
    setPorGravar,
    avisouJuncaoRef,
    warnedOverwriteRef,
    setSobreposto,
  ]);

  /**
   * ── AO DESMONTAR, GRAVA-SE O QUE FALTAVA ──────────────────────────────
   *
   * A gravação acima é um `setTimeout` a 800 ms, e a sua limpeza corre em
   * QUALQUER desmontagem. A única protecção era um `beforeunload`, que apanha
   * fechar o separador — e mais nada.
   *
   * Só que o estúdio é desmontado por gestos normais, e frequentes: «Trocar de
   * cliente» (o `key` em `FazerProposta`), o link «Rápida» do `AdminClient`, e
   * mudar de separador de detalhe. O percurso: ela escreve a última linha de
   * um grupo e clica em «Trocar de cliente» dentro de 800 ms. A gravação era
   * cancelada, o indicador continuava a dizer «Guardado às 14:32» — a hora da
   * gravação ANTERIOR — e ao voltar faltava a linha. Um indicador que diz que
   * gravou aquilo que não gravou é pior do que não haver indicador nenhum.
   *
   * Corre DEPOIS da limpeza de cima (as limpezas seguem a ordem de declaração
   * dos efeitos), portanto o `setTimeout` já foi cancelado e não há gravação a
   * dobrar. E só grava quando há mesmo trabalho por gravar: sem o `ref`, cada
   * troca de separador pagava um PUT para reescrever o que já lá estava.
   *
   * O `flushDraft.current` é reatribuído a cada alteração do documento, por
   * isso o que aqui corre é a gravação da ÚLTIMA versão, não a da montagem.
   */
  useEffect(() => {
    return () => {
      if (porGravarRef.current) void flushDraftRef.current();
    };
  }, [flushDraftRef, porGravarRef]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * «GUARDAR AGORA» — O BOTÃO, O ⌘S E O CTRL/CMD+ENTER DOS SERVIÇOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «quero que haja um botão para guardar onde se ficou». O
   * estúdio grava sozinho ao fim de 800 ms — e isso é invisível. Um botão
   * continua a valer com o automático a funcionar: é o gesto de quem se vai
   * levantar da secretária e quer ter a CERTEZA antes de fechar o portátil.
   *
   * E é justamente por ser esse o gesto que este é o sítio da página onde uma
   * mentira custa mais caro. Três respostas, e nenhuma delas inventada:
   *
   *  · GUARDOU — di-lo depois de o SERVIDOR o ter confirmado, nunca no instante
   *    do clique. Dizia «Rascunho guardado» sem esperar por resposta nenhuma:
   *    era o mesmo erro do indicador, à escala de uma mensagem.
   *
   *  · NÃO CHEGOU AO SERVIDOR — di-lo com as palavras do indicador («guardado
   *    só neste computador»), porque ela não pode ter de aprender duas
   *    linguagens no mesmo back office. Cala-se apenas quando o aviso grande
   *    de `registarSoLocal` está a aparecer NESTE momento — esse diz tudo isto
   *    e mais o que fazer a seguir, e duas mensagens ao mesmo tempo seriam
   *    ruído. Mas o aviso grande só aparece UMA vez por avaria; à segunda vez
   *    que ela carregue no botão é esta mensagem que fala, senão um botão
   *    calado passaria por um botão que guardou.
   *
   *  · NÃO HAVIA NADA POR GRAVAR — di-lo. A alternativa era responder
   *    «guardado» a um gesto que não guardou coisa nenhuma, e ensinar que a
   *    palavra «guardado» aparece sempre, carregue-se quando se carregar.
   *
   * O `soNesteComputador` entra na conta do «nada por gravar» de propósito: com
   * o servidor a recusar, a cópia local está feita (portanto `porGravarRef` é
   * falso) e o trabalho continua a não existir em mais lado nenhum. É o caso em
   * que mais falta faz voltar a tentar — e entre gravar a mais e gravar a
   * menos, grava-se a mais.
   */
  const [aGuardarAgora, setAGuardarAgora] = useState(false);
  const guardarAgora = useCallback(() => {
    void (async () => {
      // `aGravarNoServidor` entra na conta com a mesma lógica: a cópia local é
      // síncrona e apaga o «por gravar» ANTES de o servidor responder. Nessa
      // janela, dizer «já está guardado no servidor» era dizer uma coisa que
      // ainda ninguém sabe — grava-se outra vez e responde-se pelo que voltar.
      if (!porGravarRef.current && !soNesteComputador && aGravarNoServidor === 0) {
        toast("Não havia nada por gravar — o rascunho já está guardado no servidor.", "info");
        return;
      }
      // Lido ANTES da gravação: é o que distingue «o aviso grande vai falar» de
      // «o aviso grande já falou e agora é comigo».
      const avisoGrandeVaiFalar = avisoDoSoLocalPorDar();
      setAGuardarAgora(true);
      try {
        const r = await flushDraftRef.current();
        if (r.estado === "guardado") {
          toast("Rascunho guardado no servidor.", "success");
        } else if (!avisoGrandeVaiFalar) {
          toast("Guardado só neste computador — não chegou ao servidor.", "error");
        }
      } finally {
        setAGuardarAgora(false);
      }
    })();
  }, [
    toast,
    soNesteComputador,
    aGravarNoServidor,
    avisoDoSoLocalPorDar,
    porGravarRef,
    flushDraftRef,
  ]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O ESTÚDIO NO REGISTO DO BACK OFFICE
   * ════════════════════════════════════════════════════════════════════════
   *
   * A inscrição é feita À MÃO, e não pelo hook partilhado
   * (`useGravacaoAutomatica`), porque este ecrã ainda tem a sua própria cópia
   * da máquina de gravar — reescrevê-la agora era mexer no ficheiro onde a
   * perda de trabalho já foi cara, para ganhar arrumação e arriscar o resto.
   * A inscrição não precisa de esperar por essa migração: são três linhas que
   * põem o estúdio dentro do gesto único, e no dia em que a máquina migrar,
   * isto sai daqui sem deixar buraco.
   *
   * O nome é o que ELA lhe chama: «Proposta de Rita & Tomás». Nunca o nome do
   * ecrã — a pergunta ao fechar o separador tem de dizer QUE proposta é que
   * está em risco, não que componente é que está montado.
   */
  const nomeNoRegisto = doc.clientNames?.trim()
    ? `Proposta de ${doc.clientNames.trim()}`
    : `Proposta do pedido ${quote.id}`;
  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: nomeNoRegisto,
    porGravar: porGravar || aGravarNoServidor > 0 || !!soNesteComputador,
    gravarJa: async (): Promise<ResultadoDoEcra> => {
      const r = await flushDraftRef.current();
      // A cópia local é feita SEMPRE (é síncrona e não depende de rede), por
      // isso o desfecho de uma recusa do servidor aqui é «só neste
      // computador» e nunca «não ficou guardado»: o trabalho existe, mas só
      // neste portátil — que é precisamente a diferença que fez perder uma
      // proposta inteira.
      return r.estado === "guardado"
        ? { estado: "guardado" }
        : { estado: "so-neste-computador", porque: r.porque };
    },
  });
  /**
   * O resumo para o botão «Copiar resumo» — três ou quatro linhas prontas a
   * colar no WhatsApp. Os números são os de `totais` (`totaisDaProposta`),
   * que é o MESMO bloco que a barra do fundo e o passo «Enviar» já mostram;
   * não há aqui uma segunda conta.
   *
   * `eurDocumento` + `montanteNaLingua`: o mesmo par que o gerador do PDF usa
   * para escrever o dinheiro na língua do documento (ver `money.ts`) — para o
   * valor aqui não discordar do valor que o documento em anexo mostra.
   */
  const resumoComLink = (link: string | undefined) =>
    resumoDaPropostaParaCopiar(
      {
        clientNames: doc.clientNames ?? "",
        eventDate: camposDoEventoNaLingua(doc, idiomaDoPdf).eventDate ?? "",
        aPagar: montanteNaLingua(eurDocumento(totais.aPagar), idiomaDoPdf),
        link,
      },
      idiomaDoPdf,
    );
  const resumoParaCopiar = resumoComLink(linkDaProposta ?? undefined);
  const somaDoTotal = useSomarOTotal({ camposPorConfirmar, documento, total });

  const contas = useContasDoOrcamento({ documento });
  const {
    artigosDoDoc,
    chaveDosCapitulos,
    contagem,
    convidados,
    escalasDoDoc,
    extrasDoDoc,
    linhasDoOrcamento,
    ordemDoOrcamento,
    servicosAOrcamentar,
    subpontosDoDoc,
  } = contas;
  const chaveDosTitulosDosBoards = JSON.stringify(doc.moodBoards.map((b) => b.title ?? ""));
  const ordemDosBoards = useMemo(
    () => ordemDeSaida(doc as ProposalDoc, doc.moodBoards, (b) => b.title ?? ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave diz o que decide
    [chaveDosTitulosDosBoards, chaveDosCapitulos, doc.ordemExplicita],
  );
  const paginasDaProposta = usePaginasDaProposta({
    documento,
    fotos,
    quote,
    tempoNaProposta,
    traducoes,
  });
  const {
    avisosDeTitulo,
    contagemDosBoards,
    fontesDasMiniaturas,
    fotosDaProposta,
    fotosDoPdf,
    planoDoPdf,
    totalDeFotos,
  } = paginasDaProposta;
  /**
   * ── A FOTOGRAFIA DE UMA PÁGINA DO PDF, ESCOLHIDA POR ELA ──────────────────
   *
   * Pedido dela (15/10): «queremos ser nós a meter as fotos… em qualquer sítio
   * do PDF». A folha abre da miniatura da página (a vista de conjunto). Cada
   * toque aplica-se logo, com «Anular»; o que fica gravado é
   * `fotosDasPaginas[chave]`. A capa continua a ser a «Fotografia da capa».
   */
  const anular = useAnular();
  const repeticoes = useRepeticoesDasFotos({ documento, escolha, fotos, quote });
  const { historiaDaFoto, origemDaFoto } = repeticoes;
  const ordem = useOrdemDoOrcamento({ contas, documento, ordemDosBoards, toast });
  const { fixarOrdem, ordemSugerida } = ordem;
  const linhas = useLinhasDoOrcamento({ contas, documento, reversiveis, somaDoTotal, total });
  const {
    addBudgetItem,
    addBudgetRow,
    definirEscala,
    definirUnitario,
    dividirEmSubpontos,
    mudarSubpontos,
    removeBudgetItem,
    removeBudgetRow,
    updateBudgetArtigo,
    updateBudgetExtraFlag,
    updateBudgetItem,
    updateBudgetPrice,
    updateBudgetRow,
    updateExtraArtigo,
  } = linhas;
  useTotalAcompanhaOPedido({ documento, hydratedRef, quote, total });

  function setTemplate(t: "decoracao" | "organizacao") {
    setDoc((d) => {
      // Recompõe o texto de display do total para o campo do template ativo, para
      // que o PDF nunca fique com o total em branco após uma troca de template.
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      const text = composeTotalText(d.totalAmount, mode);
      return {
        ...d,
        template: t,
        // «de Casamento» só num casamento: este título sai na página que o
        // cliente abre (o PDF não o usa).
        headerTitle:
          t === "organizacao"
            ? eCasamento(d.eventType)
              ? "Proposta de orçamento para Organização de Casamento"
              : "Proposta de orçamento para Organização do Evento"
            : undefined,
        ...(t === "organizacao" ? { totalEstimatedText: text } : { totalText: text }),
      };
    });
  }
  const accaoDeDesfazer = useDesfazer({
    documento,
    guardarAgora,
    oRegistoFalaPorMim,
    toast,
    total,
  });
  const { desfazer } = accaoDeDesfazer;
  const barra = useBarraDoEstudio({
    aGravarNoServidor,
    oRegistoFalaPorMim,
    passos,
    porGravar,
    reversiveis,
    soNesteComputador,
  });
  const {
    barraCompacta,
    barraDeBaixo,
    barraEscondida,
    caixaDoEstudio,
    fecharPainelDoEnvio,
    filaDasColunas,
    folgaDaBarra,
    folhaDoEnvio,
    painelDoEnvio,
    painelLateralCabe,
    pastilhaDoEnvio,
    setFolhaDoEnvio,
    setPainelDoEnvio,
  } = barra;
  const confirmacoes = useConfirmacoes({ documento, fotos, quote, reversiveis, toast, total });
  const { anularLimpeza, confirmarDinheiro, pedirConfirmacaoDeDinheiro, perguntaDeRemocao } =
    confirmacoes;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE MEXE EM DINHEIRO FICA ESCRITO NO HISTÓRICO DO PEDIDO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O mesmo sítio onde já ficam o estado, os pagamentos e as propostas
   * enviadas — o `activityLog` que o `ActivityLog.tsx` desenha. Nada de um
   * registo novo só para o estúdio: dois históricos sobre o mesmo negócio são
   * dois sítios onde procurar, e o segundo é sempre o que ninguém abre.
   *
   * `activityLogAppend` e não `activityLog`: o servidor junta a entrada ao
   * registo FRESCO (ver a rota `PATCH /api/orcamento/[id]`). Mandar o array
   * inteiro fazia duas ferramentas a gravar ao mesmo tempo apagarem as
   * entradas uma da outra.
   *
   * `price_set` porque é disso que se trata em todas elas: o número que muda é
   * o preço final do pedido. Falhar não interrompe nada — perde-se uma linha
   * de histórico, não o trabalho. A resposta NÃO é propagada com
   * `onQuoteUpdated`: pode cruzar-se com a gravação do preço (que tem o seu
   * próprio travão de 600 ms) e devolver um valor já velho.
   */
  /**
   * Marcar (ou desmarcar) «Vi a proposta e está tudo certo». Marcar deixa a
   * linha no histórico do pedido — quem verificou fica dito ali, ao lado do
   * envio que se segue. Falhar a linha não impede nada.
   */
  function confirmarPdfVisto(confirmado: boolean) {
    setPdfVisto((v) => (v ? { ...v, confirmado } : v));
    if (!confirmado) return;
    const entrada: ActivityEntry = {
      id: randomId(),
      at: new Date().toISOString(),
      kind: "proposal_reviewed",
      summary: `PDF final verificado antes de enviar (${idiomaDoPdf === "en" ? "inglês" : "português"})`,
    };
    void fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activityLogAppend: [entrada] }),
    }).catch(() => {
      /* sem rede: a confirmação vale na mesma, fica é sem linha no histórico */
    });
  }
  const versoesAntigas = useRestaurarVersao({
    confirmacoes,
    documento,
    envio,
    passos,
    reversiveis,
    setRefEdited,
    toast,
    total,
  });
  const { inserirParagrafoDoQueMudou, restaurarVersao } = versoesAntigas;
  const limpeza = useLimparORascunho({
    DRAFT_KEY,
    SIDE_KEY,
    camposPorConfirmar,
    confirmacoes,
    docDoServidorRef,
    documento,
    envio,
    fotos,
    passos,
    quote,
    reversiveis,
    serverStampRef,
    setRefEdited,
    toast,
    total,
    warnedOverwriteRef,
  });
  const { clearDraft, trabalhoNoDocumento } = limpeza;
  const nota = useNotaDaSeccao({ documento });
  const { notaDaSeccao } = nota;
  const carregar = useCarregarFotos({
    avisoDeQualidade,
    documento,
    fotos,
    quote,
    setUploading,
    toast,
  });
  const { handleUpload } = carregar;
  const fotosUsadasNoutras = useFotosUsadasNoutras({ documento, escolha, fotos, quote });
  const { usadasNoutras, usedThemePaths } = fotosUsadasNoutras;
  const moodBoards = useMoodBoards({
    anular,
    documento,
    hidratarAssets,
    quote,
    reversiveis,
    seleccao,
    setFotosACopiar,
    toast,
  });
  const { addBoard, inserirMoodBoardDeModelo, removeBoard, setServiceGroups, updateBoard } =
    moodBoards;
  const arrumacao = useArrumacaoDosBoards({ documento, ordem, toast });
  const { alternarBloqueio, duplicarBoard, moveBoard, moverBoardParaPosicao } = arrumacao;
  const fotosDosBoards = useFotosDosBoards({
    documento,
    fotos,
    reversiveis,
    seleccao,
    setLupa,
    setPicker,
    tentarBuscarFotos,
    toast,
    total,
  });
  const {
    addBoardImages,
    aoLargarFoto,
    arrumarPorCor,
    eventosDasFotos,
    moverSeleccaoParaBoard,
    seleccionadasDoBoard,
  } = fotosDosBoards;
  const dobras = useDobrasDosBoards({ campoAVisitar, documento, faltaAVisitar });
  const { alternarDobra, dobrados, dobrarTodos, escreverDobras } = dobras;
  useSeleccaoSegueAFotografia({ documento, seleccao });

  /**
   * ── IR AO SÍTIO ONDE A FALTA SE RESOLVE ─────────────────────────────────
   *
   * O irmão do `irParaCampo`, para a Conferência. A diferença é a matéria: ali
   * é um campo de PROSA identificado por um `CampoDeTexto`; aqui é uma falta
   * («Falta o valor»), que às vezes tem um controlo próprio e às vezes só tem
   * uma secção — as capas e os mood boards não são um campo.
   *
   * Três coisas, e só a última é o salto: voltar ao conteúdo, ABRIR a secção se
   * ela estiver dobrada (saltar para dentro de um cartão fechado deixava-a a
   * olhar para um cartão que «não abriu», e os campos continuam lá dentro
   * porque uma secção fechada esconde-os sem os desmontar), e só então levar a
   * vista e o foco.
   */
  function irParaAFalta(seccao?: string, campo?: string) {
    // O email e o canal vivem no passo do ENVIO, e não no conteúdo: o salto
    // ia para o «Conteúdo» e não encontrava nada para mostrar.
    setStep(passoDaSeccao(seccao));
    // Um campo de um mood board pode estar dentro de um cartão DOBRADO, e um
    // campo que não está desenhado não se foca: o salto morria na secção e
    // deixava-a a olhar para a lista de boards fechados. É a mesma abertura
    // que o `irParaCampo` já fazia — ver lá.
    const board = /^board[A-Za-z]*:(\d+)/.exec(campo ?? "");
    if (board) {
      const id = doc.moodBoards[Number(board[1])]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setFaltaAVisitar((antes) => ({ seccao, campo, pedido: (antes?.pedido ?? 0) + 1 }));
  }

  function irParaCampo(campo: CampoPublicado, versao: "pt" | "en" = "pt") {
    setStep(passoDaSeccao(seccaoDoCampo(campo)));
    // Saltar para uma caixa inglesa que não está desenhada deixava-a a olhar
    // para o campo português sem perceber porquê. O interruptor acende-se junto
    // com o salto.
    if (versao === "en") setBilingue(true);
    if (
      campo.tipo === "boardTitulo" ||
      campo.tipo === "boardSubtitulo" ||
      campo.tipo === "boardNota"
    ) {
      const id = doc.moodBoards[campo.bi]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setCampoAVisitar((antes) => ({ campo, pedido: (antes?.pedido ?? 0) + 1, versao }));
  }
  const fotosDaPagina = useFotosDaPagina({ anular, capa, documento, paginasDaProposta });
  const {
    enquadrarNaPagina,
    focosDaPagina,
    gravarFotosDaPagina,
    lugarDaFoto,
    lugaresDaPagina,
    paginaDaFoto,
    setLugarDaFoto,
    setPaginaDaFoto,
  } = fotosDaPagina;
  const disposicao = useDisposicaoDasPaginas({
    anular,
    capa,
    documento,
    fotosDaPagina,
    moodBoards,
    paginasDaProposta,
  });
  const { disposicaoEmTodos, mudarDisposicao, porFotoNaPagina, quantasNaPagina } = disposicao;
  const paleta = usePaletaDaProposta({
    anular,
    documento,
    fotos,
    fotosDaPagina,
    paginasDaProposta,
  });
  const { fotosDaPaleta, mudarPaleta, refsDaPaleta } = paleta;
  const biblioteca = useBibliotecaDeFotos({
    capa,
    disposicao,
    documento,
    escolha,
    fotos,
    fotosDaPagina,
    fotosDosBoards,
  });
  const { onDroppedFromLibrary, onPickedFromLibrary, onReservedFromLibrary } = biblioteca;
  const fases = useFasesDoCronograma({ documento, reversiveis, totalInput });
  const {
    addPhase,
    addPhaseItem,
    movePhase,
    removePhase,
    removePhaseItem,
    updatePhase,
    updatePhaseItem,
  } = fases;
  const adicionais = useAdicionaisDoOrcamento({ confirmacoes, documento, total });
  const {
    addBudgetExtra,
    definirExtras,
    definirIvaDoAdicional,
    definirValorDoAdicional,
    extrasAVista,
    removeBudgetExtra,
    soLinhaPorEscrever,
    trocarModoDosAdicionais,
    updateBudgetExtra,
  } = adicionais;
  const pdfDaProposta = usePdfDaProposta({
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
  });
  const { descarregarAEnviada, fotosPorConfirmar, preview } = pdfDaProposta;
  const sugestoesDoPedido = useSugestoesDoPedido({ documento });
  const { sugestoes } = sugestoesDoPedido;
  useLinkDaPropostaEnviada({ envio, quote });
  const conferencia = useConferenciaComOEnviado({
    DRAFT_KEY,
    aberturaAssente,
    confirmacoes,
    documento,
    quote,
    reversiveis,
    sent,
    toast,
    total,
  });
  const {
    aReporOEnviado,
    divergenciaDoEnviado,
    manterOsValoresDesteAparelho,
    reporOsValoresEnviados,
  } = conferencia;
  const copia = useCopiaEModelos({
    camposPorConfirmar,
    confirmacoes,
    documento,
    hidratarAssets,
    reversiveis,
    setRefEdited,
    toast,
    total,
  });
  const {
    aplicarCopia,
    copiaSubstitui,
    copiarAberto,
    guardarComoModelo,
    guardarValidadePadrao,
    nomeModelo,
    setCopiaSubstitui,
    setCopiarAberto,
    setNomeModelo,
  } = copia;
  const pronta = useProntaParaEnviar({
    busy,
    documento,
    envio,
    fotos,
    passos,
    pdfDaProposta,
    quote,
    total,
    traducoes,
  });
  const {
    aoSaberQueFaltam,
    fotosParaEscolhas,
    isDeco,
    pdfConfirmado,
    pdfVistoAgora,
    perguntas,
    seccoes,
    setEscolhidasQueFaltam,
    temErros,
  } = pronta;
  const enviar = useEnviarAProposta({
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
  });
  const { emailDoCliente, send } = enviar;
  const botaoDoEnvio = useBotaoDoEnvio({
    documento,
    envio,
    passos,
    pdfDaProposta,
    pronta,
    total,
    traducoes,
  });
  const {
    canSend,
    estadosDosPassos,
    faltasDoEnvio,
    modoDoBotao,
    noFormulario,
    oEnvioTrava,
    soFaltaVerOPdf,
  } = botaoDoEnvio;
  const painel = usePainelDaProposta({
    arrumacao,
    dobras,
    documento,
    escolha,
    fotosDaPagina,
    irParaAFalta,
    ordemDosBoards,
    passos,
    quote,
  });
  const {
    aVista,
    boardActivo,
    paginasParaOPainel,
    painelEscolherFotos,
    painelSaltar,
    pedidoComADataDoDoc,
    setBoardActivo,
    vistaIrParaSeccao,
    vistaMover,
    vistaMudarFoto,
    vistaSaltar,
  } = painel;

  /* ── `@container`: A CAIXA DE QUEM A BARRA DE BAIXO É FILHA ──────────────
     A barra de acção do estúdio é filha DESTE div, e não do
     `@container/estudio` — o que a deixava sem contentor nenhum acima dela:
     qualquer `@min-[…]:` escrito nela resolvia para nada, em silêncio.

     MEDIDO num Chromium, com a janela sempre a 1440:

         estúdio sozinho .......... esta caixa tem 1360 px
         com o painel de detalhe .. esta caixa tem  712 px

     É a diferença que o `o-estudio-pergunta-a-caixa.test.ts` existe para
     apanhar, e apanhou-me: escrevi a barra com `sm:` e a janela dizia «1440,
     larga» enquanto a caixa tinha 712.

     `container-type: inline-size` só contém o eixo em linha, e não há nada
     `fixed` neste ficheiro para a contenção prender — verificado antes de a
     pôr. */
  return (
    <div
      ref={caixaDoEstudio}
      className={`@container ${cliente ? "" : "border-t border-[var(--bo-hairline-strong)] pt-5"}`}
    >
      {/* EMPILHA no telemóvel, em vez de repartir a largura.
          O que estava aqui era um `flex` em linha com o texto de um lado e três
          botões do outro, marcados `shrink-0`. A 375 px os botões ficavam com
          ~330 px e o parágrafo com o que sobrava: encolhia até à largura da
          palavra mais comprida e passava a UMA PALAVRA POR LINHA — dois ecrãs
          de scroll para ler duas frases. O `min-w-0` do lado do texto, que
          existe para o truncar deixar de empurrar, aqui deixava-o chegar a zero.
          É o padrão a evitar em todo o back office: texto e barra de acções na
          mesma linha só a partir de `sm`. */}
      {/* ── E A FILA PERGUNTA À CAIXA (auditoria de 14/11, n.º 2) ─────────
          Com `sm:` a fila abria aos 640 px de JANELA. A 768 o grupo dos botões
          era `shrink-0` e pedia 794: a página ganhava scroll de lado, o
          «Trocar de cliente» ficava cortado e o nome do cliente encolhia para
          10 px. Os seis botões pedem ~740 px; a fila só abre quando a CAIXA
          tem 64rem, e até lá empilha — o nome em cima, os botões por baixo. */}
      <div className="mb-4 flex flex-col gap-3 @min-[64rem]:flex-row @min-[64rem]:items-start @min-[64rem]:justify-between">
        {/* ── O CABEÇALHO CUSTAVA UM TERÇO DO ECRÃ DELA ────────────────────
            Somando as classes num iPhone SE (375×667), gastavam-se ~702 px
            antes do primeiro campo onde ela escreve — ou seja, ele nascia
            abaixo da dobra. Este cabeçalho eram ~213 desses píxeis, e ~74 eram
            três linhas de instrução que se lêem UMA VEZ e depois ficam lá as
            outras cinquenta.

            A correcção é a mesma que a explicação do «Extra» já levou duzentas
            linhas abaixo, e o critério é o do `ui/Ajuda.tsx`: úteis na primeira
            vez, ruído a partir da segunda. Passa a estar onde a pergunta se faz
            — atrás de um «?» ao pé do nome da secção.

            UM texto num sítio só, e não duas cópias com um `hidden` a escolher:
            o que aqui se poupa é altura, e duas cópias não poupam altura
            nenhuma a quem lê o HTML. */}
        <div className="min-w-0">
          {cliente ? (
            <>
              {/* O nome da zona continua a existir para quem ouve o ecrã — e
                  para os passeios que o usam como sinal de que o estúdio
                  montou. À vista, o que se lê primeiro é para quem é. */}
              <h2 className="sr-only">Estúdio de propostas (PDF)</h2>
              <p className="flex items-center gap-1.5 text-caption text-[var(--bo-text-muted)]">
                Proposta para
                <Ajuda sobre="o que se faz no estúdio de propostas">
                  Monta aqui a proposta em PDF para o cliente, em cinco passos: Evento, Serviços,
                  Inspiração, Orçamento e Rever e enviar. Podes saltar entre eles à vontade — nada
                  se perde. A página à direita é a do PDF, tal e qual vai sair.
                </Ajuda>
              </p>
              <p className="truncate text-title3 font-semibold text-[var(--bo-text)]">
                {cliente.nome}
              </p>
            </>
          ) : (
            <p className="bo-eyebrow flex items-center gap-1.5">
              Estúdio de propostas (PDF)
              <Ajuda sobre="o que se faz no estúdio de propostas">
                Monta aqui a proposta em PDF para o cliente, em cinco passos: Evento, Serviços,
                Inspiração, Orçamento e Rever e enviar. Podes saltar entre eles à vontade — nada se
                perde.
              </Ajuda>
            </p>
          )}
        </div>
        {/* `flex-wrap` e não `shrink-0`: com três botões a 375 px, um deles
            saía pela margem direita e ficava cortado ("Limpa…"). */}
        <div className="flex flex-wrap items-center gap-2 @min-[64rem]:shrink-0">
          {/* A acção principal desta secção: quase todas as propostas são uma
              variação de uma anterior. É a única aqui a verde. */}
          <Button
            size="sm"
            onClick={() => {
              // Achado n.º 7: a cópia só pergunta se houver trabalho a perder
              // — escrito nesta sessão, ou num rascunho que já estava gravado.
              // Uma proposta acabada de abrir, com o que veio do pedido, não
              // pergunta nada (um aviso sempre ligado ensina a não o ler).
              const houveTrabalho =
                camposTocadosRef.current.size > 0 ||
                docDoServidorRef.current != null ||
                jaGravouRef.current;
              const partes = trabalhoNoDocumento(doc);
              setCopiaSubstitui(
                houveTrabalho ? (partes.length > 0 ? partes.join(", ") : "texto escrito") : null,
              );
              setCopiarAberto(true);
            }}
          >
            Criar a partir de…
          </Button>
          {/* DESFAZER TEM DE SE PODER TOCAR.
              Isto existia só como `Cmd+Z`, e num telemóvel não há `Cmd+Z`:
              desfazer um engano era uma coisa que só se podia fazer sentada ao
              computador. Fica ao lado de "Limpar rascunho" de propósito — é o
              par dela, e é onde se vai procurar depois de estragar alguma
              coisa. Apagado quando não há para onde voltar, para não prometer
              o que não faz. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={!podeDesfazer}
            onClick={() => {
              if (desfazer()) toast("Desfeito.", "info");
            }}
          >
            Desfazer
          </Button>
          {/* ── NUM ECRÃ ESTREITO, O RESTO VAI PARA O «⋯» ───────────────────
              Seis botões soltos eram três linhas de botões num telemóvel, por
              cima dos passos (9/11, «está uma confusão brutal»). Fica à vista o
              que se usa a meio do trabalho — «Criar a partir de…» e «Desfazer»
              — e o resto entra no menu. Num ecrã largo continua tudo à vista. */}
          <div className="contents @max-[40rem]:hidden">
            <Button variant="ghost" size="sm" onClick={() => setNomeModelo(doc.eventType || "")}>
              Guardar como modelo
            </Button>
            <Button variant="ghost" size="sm" onClick={clearDraft}>
              Limpar rascunho
            </Button>
            {cliente && (
              <>
                {/* As portas do pedido, separadas das do rascunho por um traço:
                  estas saem do estúdio, as de cima mexem nele. */}
                <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--bo-hairline-strong)]" />
                <Button variant="ghost" size="sm" onClick={cliente.onAbrirPedido}>
                  Abrir o pedido
                </Button>
                <Button variant="ghost" size="sm" onClick={cliente.onTrocar}>
                  Trocar de cliente
                </Button>
              </>
            )}
          </div>
          <div className="@min-[40rem]:hidden">
            <MenuDeAccoes
              sobre={cliente?.nome ?? "esta proposta"}
              sempreVisivel
              accoes={[
                ...(cliente
                  ? [
                      { id: "pedido", rotulo: "Abrir o pedido", onAccao: cliente.onAbrirPedido },
                      { id: "trocar", rotulo: "Trocar de cliente", onAccao: cliente.onTrocar },
                    ]
                  : []),
                {
                  id: "modelo",
                  rotulo: "Guardar como modelo",
                  onAccao: () => setNomeModelo(doc.eventType || ""),
                  separadorAntes: !!cliente,
                },
                { id: "limpar", rotulo: "Limpar rascunho", onAccao: clearDraft, destrutiva: true },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          O QUE SEGUIU PARA O CLIENTE, E O QUE ESTE APARELHO TEM
          ══════════════════════════════════════════════════════════════════

          Palavras dela: «eu quero igual o valor!!! até eu alterar por mim!».

          Os dois números lado a lado, com a data do envio, antes de qualquer
          decisão. Ver o bloco `divergenciaDoEnviado`, que explica porque é que
          nenhum dos dois se aplica sozinho: uma correcção de preço feita de
          propósito depois do envio produz exactamente esta mesma diferença, e
          escolher por ela era apagar trabalho em metade dos casos.

          No topo do estúdio, ao lado das outras perguntas de dinheiro e pela
          mesma razão que está escrita lá: uma pergunta que aparece cada vez
          noutro sítio é uma pergunta que se responde sem se ler.

          Empilhado abaixo dos 30rem e em linha acima — a caixa vive na coluna
          do estúdio, e não na janela. A conta: os dois blocos de número pedem
          ~13rem cada («Total a pagar» + «15 090,55 €» a 13px são ~11rem, mais
          o `gap-4` de 1rem e o respiro), portanto 26rem é onde os dois deixam
          de se apertar; 30rem é o degrau da casa logo acima, e dá folga para
          os números de seis dígitos que ela tem (202 889,00 €). */}
      {divergenciaDoEnviado?.elaMudou && (
        <div
          role="alert"
          /* O nome distingue-o dos outros avisos do estúdio — há mais do que um
             `role="alert"` neste ecrã, e um leitor que anuncie «alerta» sem
             dizer de quê obriga a ir procurar. */
          aria-label="O valor não é o que seguiu para o cliente"
          className="mb-4 rounded-xl border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
        >
          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            Esta proposta já seguiu para o cliente{" "}
            {dataDoEnvioPorExtenso(divergenciaDoEnviado.enviadaEm)}, e o valor que está neste ecrã
            NÃO é o que ele recebeu. Escolhe qual dos dois fica — nada muda até escolheres.
          </p>
          <div className="@container mt-2.5">
            <dl className="flex flex-col gap-2 @min-[30rem]:flex-row @min-[30rem]:gap-4">
              <div className="min-w-0 grow">
                <dt className="text-[11px] text-foreground/45">O que o cliente recebeu</dt>
                <dd className="text-sm font-semibold text-[var(--bo-text)]">
                  {eur(divergenciaDoEnviado.aPagarEnviado)}
                </dd>
              </div>
              <div className="min-w-0 grow">
                <dt className="text-[11px] text-foreground/45">O que está neste aparelho</dt>
                <dd className="text-sm font-semibold text-[var(--bo-text)]">
                  {eur(divergenciaDoEnviado.aPagarAqui)}
                </dd>
              </div>
            </dl>
          </div>
          {/* A espera desenhada da única maneira que esta casa desenha esperas.
              `estimadoMs` e não uma barra sabida: é um pedido e uma resposta, e
              no meio não há nada que se possa contar. */}
          {aReporOEnviado ? (
            <EmCurso
              className="mt-2.5 max-w-xs"
              titulo="A ir buscar a proposta que seguiu…"
              estimadoMs={2000}
              nota="Só os valores voltam atrás. O texto e as fotografias ficam como estão."
              notaDemorada="O servidor está a demorar. Se falhar, nada muda no que está no ecrã."
            />
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`alvo-toque text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={() => void reporOsValoresEnviados()}
              >
                Repor os valores que seguiram
              </button>
              <button
                type="button"
                className={`alvo-toque text-xs text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={manterOsValoresDesteAparelho}
              >
                Manter os deste aparelho
              </button>
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
            Repor mexe só nos valores — o texto, as fotografias e os mood boards ficam como estão, e
            podes anular durante 10 segundos.
          </p>
        </div>
      )}

      {limpo && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2">
          <span className="text-xs text-[var(--bo-tinta-72)]">
            {limpo.motivo} Pode anular durante {limpo.segundos}s.
          </span>
          <button
            type="button"
            className={`alvo-toque text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
            onClick={anularLimpeza}
          >
            Anular
          </button>
        </div>
      )}

      {/* ── A PERGUNTA COM OS DOIS NÚMEROS À VISTA ─────────────────────────
          Fica no topo do estúdio e não ao lado do botão que a levantou: as
          acções que mexem no dinheiro estão espalhadas por três secções (o
          «Usar X €», a deslocação do painel interno, o «×» de um valor
          adicional) e uma pergunta que aparece cada vez noutro sítio é uma
          pergunta que se responde sem procurar o que ela diz. Aqui é sempre
          o mesmo sítio, e é o primeiro que se vê.

          `assertive` porque interrompe mesmo: é uma pergunta, e ficar à espera
          de resposta sem ser anunciada seria deixar quem usa leitor de ecrã a
          carregar num botão que não fez nada. */}
      {confirmacaoDeDinheiro && confirmacaoDeDinheiro.docNoMomento === doc && (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmar alteração ao valor"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
        >
          <span className="min-w-[12rem] flex-1 text-xs leading-relaxed text-[var(--bo-text)]">
            {confirmacaoDeDinheiro.pergunta}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setConfirmacaoDeDinheiro(null)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmarDinheiro}>
            Substituir
          </Button>
        </div>
      )}

      {nomeModelo !== null && (
        <div className="mb-4 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3">
          <label className="flex-1 min-w-[14rem]">
            <span className="bo-eyebrow">Nome do modelo</span>
            <input
              autoFocus
              value={nomeModelo}
              onChange={(e) => setNomeModelo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void guardarComoModelo(nomeModelo);
                if (e.key === "Escape") setNomeModelo(null);
              }}
              placeholder="Casamento standard"
              className="bo-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>
          <Button
            size="sm"
            disabled={!nomeModelo.trim()}
            onClick={() => void guardarComoModelo(nomeModelo)}
          >
            Guardar
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(null)}>
            Cancelar
          </Button>
        </div>
      )}

      <CriarAPartirDe
        open={copiarAberto}
        onClose={() => setCopiarAberto(false)}
        quoteId={quote.id}
        clienteAtual={quote.name ?? ""}
        onEscolhido={aplicarCopia}
        toast={toast}
        substitui={copiaSubstitui}
      />

      {/* Passos do fluxo — sempre visível, dá o sentido de "onde estou / o que
          fazer a seguir". Clicável para saltar entre passos. */}
      <StepNav
        step={step}
        onSelect={irParaPasso}
        estados={estadosDosPassos}
        organizacao={!isDeco}
      />

      {/* ══════════ PASSOS 1 a 4 · Evento, Serviços, Inspiração, Orçamento ══════════ */}
      {/* ── A FOLGA POR BAIXO É A ALTURA MEDIDA DA BARRA, NÃO UM NÚMERO ─────
          Era `pb-20` — 80 px escritos à mão. A barra do fundo é `sticky` e
          desenha-se POR CIMA do conteúdo; sem folga suficiente, o que fica por
          baixo dela não se lê nem se toca. E ela NÃO tem 80 px: cresce com o
          que lhe está dentro (o total embrulha, o botão de tentar outra vez
          aparece) e cresce outra vez no telemóvel, onde a barra de navegação do
          back office lhe soma mais 56 px por baixo. Medido na captura desta
          missão: 66 px de barra num ecrã largo, mais os 56 da navegação — 122,
          contra os 80 reservados. A linha do Sinal ficava debaixo dela.

          Agora a folga sai de `getBoundingClientRect` da própria barra, mais o
          que a separa do fundo do ecrã, e volta a ser medida sempre que a barra
          muda de tamanho (`ResizeObserver`). Um número que se mede não pode
          ficar desactualizado por alguém acrescentar um botão. */}
      {/* ── A FILA SÓ EXISTE ONDE HÁ DUAS COLUNAS ────────────────────────
          Isto era `flex gap-6` em TODAS as larguras. Enquanto o `NavEstudio`
          era `hidden … lg:block`, a fila tinha um filho só e não se notava;
          agora que o índice existe também abaixo de 1024 (uma tira que rola de
          lado), ele passava a ficar AO LADO do conteúdo a 375 px e esmagava a
          coluna onde ela escreve.

          A direcção é do PAI: nenhuma classe no filho (`w-full`, tirar o
          `shrink-0`, `display:contents`) desfaz uma fila. É o mesmo padrão que
          o índice dos mood boards já usa aqui em baixo (`lg:grid lg:grid-cols-…`):
          abaixo de `lg` é um bloco simples e a tira empilha por cima do
          conteúdo; a partir de `lg` é a fila de hoje, ao pixel.

          O `min-w-0 flex-1` do irmão fica inerte fora de um contexto flex, e o
          `@container` dele continua a ser um contentor válido nas duas
          larguras — `container-type: inline-size` não pede flex nenhum. */}
      {/* ── O CONTENTOR VEM POR FORA, E TEM DE VIR ─────────────────────────
          A fila abaixo pergunta «tenho largura para três colunas?». Um elemento
          NÃO PODE consultar-se a si próprio — uma consulta de contentor responde
          sempre sobre um antepassado —, portanto o contentor é esta caixa e a
          pergunta é feita de dentro dela.

          Era `lg:flex`: 1024 DE JANELA. MEDIDO num Chromium, no painel que abre
          a partir do cartão de um cliente: a janela tinha 1280 e esta zona tinha
          498 px. A fila montava-se na mesma, o índice levava 192 dos 498 (38%) e
          a coluna onde ela escreve ficava com 282. A janela dizia que havia
          espaço; aqui dentro não havia. */}
      {/* ── O PASSO QUE CHEGA APRESENTA-SE ────────────────────────────────
          Palavras dela: «imagina, estamos na fazer proposta, passamos para a
          parte seguinte — o que é que metes de animação aí?».

          Até aqui, nada: os três passos trocavam com `hidden`, e o conteúdo
          seguinte aparecia no mesmo fotograma em que o anterior desaparecia.
          Passa a ser a `.view-in` da casa — 240 ms, oito píxeis,
          `cubic-bezier(0, 0, 0.2, 1)` —, que é a classe escrita para
          exactamente isto: «o cromado não sai do sítio, muda o conteúdo dentro
          dele».

          ── PORQUE É A CLASSE A ENTRAR E A SAIR, E NÃO UM `key` ────────────

          Um `key` remonta. E estes dois passos NÃO podem remontar: ficam
          montados de propósito (só `hidden`), porque o passo 1 guarda o
          formulário inteiro e o passo 3 guarda o estado do envio. Remontá-los
          a cada troca perdia o foco, o rolo e o trabalho a meio.

          Tirar e voltar a pôr a classe dá o mesmo efeito sem tocar na árvore:
          quando o passo sai, a classe sai com ele; quando volta, a animação
          recomeça. Sem JavaScript, sem temporizador, sem remontagem.

          A `.view-in` acaba em `transform: none` e usa `backwards` — não fica
          transform pendurado, que é o que quebraria o `position: fixed` de uma
          folha aberta aqui dentro. A barra `sticky` do fundo é IRMÃ destes
          três e não está lá dentro, portanto não a apanha. */}
      <div
        ref={formularioDosPassos}
        className={`@container/estudio scroll-mt-[var(--bo-colado-topo)] ${noFormulario ? "view-in" : ""}`}
        hidden={!noFormulario}
      >
        <div
          ref={filaDasColunas}
          /* 40rem (640 px) é o mínimo para uma fila fazer sentido: o índice pede
           12rem e o que sobra tem de dar uma coluna de escrita que se leia.
           Abaixo disso o índice volta a ser a tira que já existe para o
           telemóvel — e a coluna de escrita fica com a largura toda. */
          className="@min-[40rem]/estudio:flex @min-[40rem]/estudio:gap-6"
          style={{ paddingBottom: folgaDaBarra }}
        >
          {/* Na Inspiração o índice sai, e a coluna dos mood boards fica com
              a largura toda — é o passo onde as fotografias pedem espaço (A2). */}
          {step !== "inspiracao" && (
            <NavEstudio
              seccoes={seccoes}
              faltas={faltasDoEnvio}
              onSeccaoActual={anotarSeccao}
              porTraduzir={traducoesPorSeccao}
              onIr={(seccao) => irParaAFalta(seccao)}
            />
          )}
          {/* ── QUEM MANDA É A COLUNA ONDE ELA ESCREVE, NÃO A JANELA ─────────
            Esta coluna vive dentro de três outras: a barra lateral do back
            office (`w-64`, a partir de 1024), o índice do estúdio (`NavEstudio`,
            `w-48`, a partir de 1024) e o painel «O que vai sair» (`w-[21rem]`,
            a partir de 1440). Medida:

              janela   esta coluna
                375       ~351 px
                640       ~592 px
               1023       ~975 px
               1024       ~504 px   ← perde 471 px de um pixel para o outro
               1440       ~560 px

            É por isso que `sm:` mente aqui dentro: dispara aos 640 de JANELA e
            nunca mais volta atrás, portanto tudo o que decidiu «duas colunas»
            com 592 px de caixa continua a decidir duas colunas quando a caixa
            passa a ter 504. Este ficheiro tinha quarenta regras de largura e
            zero `@container`; era esse o defeito de fundo.

            O `@container` põe a pergunta onde ela existe — na largura DESTA
            coluna — e os limiares são os que a casa já usa (22, 24 e 26 rem),
            mais as 36 rem que o `PaymentsPanel` usa para o mesmo caso de uma
            fila de campos com colunas fixas. O método está escrito por extenso
            em `ProposalBuilder.tsx:973-1009`; aqui é a mesma conta noutra
            caixa. */}
          <div className="@container min-w-0 flex-1">
            {/* ══════════════════════════════════════════════════════════════
              O TRABALHO QUE ESTA GRAVAÇÃO ESMAGOU, E DE ONDE SE VAI BUSCAR
              ══════════════════════════════════════════════════════════════

              Isto não é um aviso: é uma decisão por tomar sobre trabalho de
              outra pessoa. Por isso não é um `toast` — fica aqui até alguém
              resolver.

              `aria-live="polite"` e não `assertive`: aparece depois de uma
              gravação automática, num momento em que ela está a escrever, e
              interromper um leitor de ecrã a meio de uma frase para dar uma
              notícia que não é urgente seria trocar o mal maior pelo menor.

              As duas saídas estão à vista e nenhuma esconde a outra: repor, ou
              dispensar. Dispensar não apaga nada no servidor — só tira o
              lembrete —, e é isso que o botão diz pelo nome. */}
            {sobreposto && (
              <div
                className="border-[var(--bo-hairline-strong)] bg-[var(--bo-surface-sunken)] mb-4 rounded-xl border p-3"
                aria-live="polite"
              >
                <p className="text-[var(--bo-text)] mb-1 text-sm font-medium">
                  {sobreposto.quem
                    ? `A versão de ${sobreposto.quem} ficou guardada.`
                    : "A versão que estava aqui ficou guardada."}
                </p>
                <p className="text-[var(--bo-text-muted)] mb-3 text-xs leading-relaxed">
                  Gravaste por cima de trabalho que tinha sido feito noutro sítio
                  {sobreposto.quando ? ` às ${quandoGravado(sobreposto.quando)}` : ""}. Ficou a tua
                  versão, e a outra não se perdeu.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" loading={aRepor} onClick={reporSobreposto}>
                    Repor essa versão
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSobreposto(null)}>
                    Dispensar o aviso
                  </Button>
                </div>
              </div>
            )}
            {/* Template selector */}
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3"
              hidden={step !== "evento"}
            >
              <Segmented
                ariaLabel="Modelo da proposta"
                value={isDeco ? "decoracao" : "organizacao"}
                onChange={setTemplate}
                options={[
                  { value: "decoracao", label: "Decoração" },
                  { value: "organizacao", label: "Organização" },
                ]}
              />
              {/* ══════════════════════════════════════════════════════════════
                PROPOSTA BILINGUE — O INTERRUPTOR
                ══════════════════════════════════════════════════════════════

                Ligado, cada campo de prosa ganha uma segunda caixa POR BAIXO,
                marcada «EN». Desligado, o ecrã é o de hoje ao pixel — e é essa
                a razão de haver um interruptor em vez de as caixas estarem lá
                sempre: esta secção é o ecrã mais escrito da casa, muitas vezes
                com o cliente ao telefone, e a maioria das propostas nunca vai a
                inglês.

                Não é derivado do «Idioma do PDF»: esse vive no passo SEGUINTE
                ao da escrita, e escolher «Inglês» só para tirar uma prova
                acendia as caixas todas de repente. */}
              <button
                type="button"
                onClick={() => setBilingue((v) => !v)}
                aria-pressed={bilingue}
                className={`alvo-toque inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium  ${
                  bilingue
                    ? "border-sage-600/40 bg-sage-600/[0.08] text-sage-600"
                    : "border-[var(--bo-hairline-strong)] text-[var(--bo-text-muted)] hover:border-foreground/30 hover:text-[var(--bo-text)]"
                } ${ESTADO} ${PRESSAO}`}
                title="Acrescenta uma caixa em inglês por baixo de cada campo de texto"
              >
                <span aria-hidden="true">{bilingue ? "✓" : "+"}</span>
                Proposta bilingue (PT + EN)
              </button>
            </div>

            {/* ══════════════════════════════════════════════════════════════════
              TRADUZIR PARA INGLÊS — O BOTÃO, E O MOTOR QUE AINDA NÃO EXISTE
              ══════════════════════════════════════════════════════════════════

              Decisão dela: «nós fazemos as propostas em português, e depois o
              próprio sistema faz uma tradução para inglês». As caixas «EN»
              deixam de ser trabalho obrigatório e passam a ser REVISÃO: ela
              corrige a que quiser, ou não lê nenhuma.

              O motor não existe — não há serviço de tradução escolhido nem
              chave nenhuma no projecto. A fronteira onde ele vai entrar está
              escrita (`proposal-traducao.ts`), e enquanto o motor não existir
              este botão DIZ-O e não faz nada.

              Um botão que fingisse traduzir — com um dicionário de palavras,
              por exemplo — mandava-a enviar uma proposta a acreditar que estava
              traduzida. É o único desfecho pior do que não haver botão nenhum:
              uma frase portuguesa numa proposta inglesa vê-se; inglês falso não.

              Só aparece com o bilingue ligado: é onde as caixas que ele
              preenche estão à vista. */}
            {bilingue && (
              <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {/* ── ENQUANTO A TRADUÇÃO VEM A CAMINHO ─────────────────────
                  O botão dizia «A traduzir…» e mais nada, durante uma ida à
                  rede que numa proposta cheia são vários segundos — e a única
                  coisa que aparecia a seguir era um toast. A caixa fica no
                  lugar do botão, que é onde o estado já vivia. Quantos campos
                  vão é do que o código sabe, e por isso é dito; quantos já
                  voltaram, não — ver `esperaDaTraducao`. */}
                {aTraduzir ? (
                  (() => {
                    // Os mesmos campos que o `traduzirParaIngles` vai buscar: os
                    // vazios e os que ficaram para trás do português.
                    const campos = camposPorRever(doc as ProposalDoc).length;
                    return (
                      <EmCurso
                        className="max-w-xs"
                        titulo="A traduzir para inglês…"
                        estimadoMs={esperaDaTraducao(campos)}
                        nota={
                          campos === 1
                            ? "Vai 1 campo ao serviço de tradução. O que já escreveste fica como está."
                            : `Vão ${campos} campos ao serviço de tradução. O que já escreveste fica como está.`
                        }
                        notaDemorada="O serviço está a demorar. As caixas «EN» preenchem-se assim que a resposta chegar."
                      />
                    );
                  })()
                ) : (
                  <button
                    type="button"
                    disabled={!traducaoLigada}
                    onClick={() => void traduzirTudo()}
                    className={`alvo-toque inline-flex items-center gap-2 rounded-lg border border-[var(--bo-hairline-strong)] px-3 py-1.5 text-xs font-medium text-[var(--bo-tinta-72)] hover:border-foreground/30 hover:text-[var(--bo-text)] disabled:cursor-not-allowed disabled:opacity-40 ${ESTADO} ${PRESSAO}`}
                  >
                    <span aria-hidden="true">⇄</span>
                    Traduzir para inglês
                  </button>
                )}
                {/* ── AS TRÊS FRASES, E PORQUE É QUE NÃO SÃO DUAS ─────────────
                  O botão fica desligado nos dois casos maus, e isso está certo.
                  A frase é que não pode ser a mesma: «ainda não está ligada
                  neste servidor» é uma afirmação sobre a CONFIGURAÇÃO, e quem a
                  lê ou vai pôr a chave ou desiste e escreve as caixas à mão.
                  Dita sobre uma sessão caducada ou uma rede que caiu, manda-a
                  resolver um problema que não existe enquanto o verdadeiro se
                  cura recarregando a página. */}
                {traducao === "ligada" ? (
                  <p className="text-[11px] leading-snug text-foreground/50">
                    Preenche as caixas «EN» que ainda estão vazias. O que já escreveste fica como
                    está — e vale a pena passar os olhos pelo que sair.
                  </p>
                ) : traducao === "desligada" ? (
                  <p className="text-[11px] leading-snug text-foreground/50">
                    A tradução automática ainda não está ligada neste servidor. Até lá, as caixas
                    «EN» escrevem-se à mão, e o que ficar em branco sai em português.
                  </p>
                ) : (
                  <p className="text-[11px] leading-snug text-foreground/50">
                    Não deu para saber se a tradução automática está ligada — o servidor não
                    respondeu. Recarrega a página; se continuar assim, entretanto as caixas «EN»
                    escrevem-se à mão e o que ficar em branco sai em português.
                  </p>
                )}
              </div>
            )}

            {/* Event fields */}
            <SeccaoDoEvento
              casamentoConfirmado={casamentoConfirmado}
              chaveDoCasamentoConfirmado={chaveDoCasamentoConfirmado}
              confirmado={confirmado}
              doc={doc}
              isDeco={isDeco}
              patch={patch}
              pedidoComADataDoDoc={pedidoComADataDoDoc}
              quote={quote}
              quotes={quotes}
              realce={realce}
              refEdited={refEdited}
              setCasamentoConfirmado={setCasamentoConfirmado}
              setDoc={setDoc}
              setRefEdited={setRefEdited}
              step={step}
              sugestoes={sugestoes}
            />

            {/* A fotografia da capa — ver `SeccaoDaCapa`. */}
            <SeccaoDaCapa
              aspetosDasFotos={aspetosDasFotos}
              assetMedias={assetMedias}
              assetOriginais={assetOriginais}
              assetUrls={assetUrls}
              doc={doc}
              estadoDosUrls={estadoDosUrls}
              focoAutoDaCapa={focoAutoDaCapa}
              handleUpload={handleUpload}
              idxDaCapa={idxDaCapa}
              marcarUrlMorto={marcarUrlMorto}
              notaDaSeccao={notaDaSeccao}
              patch={patch}
              registarAspeto={registarAspeto}
              removeCoverAt={removeCoverAt}
              setCoverAt={setCoverAt}
              setPicker={setPicker}
              step={step}
              tamanhoDaCapa={tamanhoDaCapa}
              tentarBuscarFotos={tentarBuscarFotos}
              uploading={uploading}
            />

            {/* Service groups */}
            <PassoServicos
              bilingue={bilingue}
              doc={doc}
              guardarAgora={guardarAgora}
              isDeco={isDeco}
              notaDaSeccao={notaDaSeccao}
              setServiceGroups={setServiceGroups}
              step={step}
            />

            {/* Mood boards — decoracao only */}
            {isDeco && (
              <Section
                title="Mood boards"
                id="moodboards"
                escondida={step !== "inspiracao"}
                nota={contagemDosBoards}
                rodape={notaDaSeccao("moodboards", "Nota sobre os mood boards")}
              >
                <p className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-text-muted)]">
                  grupos de imagens de inspiração para o cliente
                </p>
                <AvisoDeOrdem
                  mostrar={ordemSugerida}
                  onde="As páginas de inspiração"
                  onFixar={fixarOrdem}
                />
                <BarraDaSeleccao
                  quantas={seleccionadas.size}
                  boards={doc.moodBoards}
                  onMover={moverSeleccaoParaBoard}
                  onLimpar={() => setSeleccionadas(new Set())}
                />
                {/* ── O ÍNDICE ─────────────────────────────────────────────
                  Onde a caixa dá, é uma coluna fixa ao lado; onde não dá, uma
                  tira que se percorre por cima da lista — a 390 px, uma coluna
                  lateral roubava metade da grelha das fotos.

                  ── PORQUE É QUE «ONDE A CAIXA DÁ» NÃO É `lg:` ────────────
                  Isto era `lg:grid` — 1024 de JANELA — e era o último sítio do
                  ficheiro onde dois cortes se SOMAVAM em vez de se
                  compensarem: aos 1024 a coluna de conteúdo cai de 975 para
                  504 px (aparecem a barra lateral do back office e o índice do
                  estúdio) e era exactamente aí que esta coluna de 176 px se
                  abria. O cartão do board ficava com 276 px e as miniaturas
                  com 86; sem ela ficaria com 472 e 112.

                  ── E A INVERSÃO QUE ISTO OBRIGA A ESCREVER ───────────────
                  A coluna de conteúdo é MAIOR abaixo de 1024 (975 px) do que
                  acima (504 aos 1024, 560 aos 1440). Portanto a resposta certa
                  desliga esta coluna lateral em TODAS as larguras de desktop e
                  liga-a entre 640 e 1023. Parece ao contrário e não é: a caixa
                  a 1024 é mesmo mais estreita do que a 640, e um índice em
                  coluna custa-lhe 196 px — 39% do sítio onde ela escreve. Em
                  tira custa ~56 px de altura, uma vez.

                  ── DE ONDE VÊM AS 40 REM ─────────────────────────────────
                  A coluna custa 176 px mais os 20 do intervalo: 196. O que
                  sobra tem de continuar a servir a grelha de fotografias na
                  forma de quatro colunas, que pede 24 rem de cartão (384) mais
                  os 32 do `p-4` — 416. São 612 px, e 40 rem (640) é o degrau
                  acima. Medido: liga a 975 e desliga a 351, 504, 560 e 592.

                  O `MoodBoardIndice` lê o MESMO limiar, e é obrigatório que
                  leia: a forma dele (tira horizontal ou coluna `sticky`) e a
                  grelha que lhe dá a largura são duas metades da mesma
                  decisão, e metades da mesma decisão em sinais diferentes é o
                  defeito que o `useMedida.ts:16-21` conta por extenso. Aqui
                  seria uma tira de `overflow-x-auto` espremida em 176 px de um
                  lado, e um índice vertical à largura toda do outro. */}
                {/* Sem mood boards o índice não desenha nada, e a grelha dava a
                    coluna de 11 rem ao conteúdo — o começo nascia espremido
                    nela. A grelha só existe quando há o que indexar. */}
                <div
                  className={
                    doc.moodBoards.length > 0
                      ? "@min-[40rem]:grid @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:gap-5"
                      : undefined
                  }
                >
                  <MoodBoardIndice
                    boards={doc.moodBoards}
                    ordem={ordemDosBoards}
                    bloqueados={doc.moodBoards.map((b) => !!b.bloqueado)}
                    // A MESMA acção dos cartões e da vista de conjunto: três
                    // sítios onde se reordena, uma só maneira de reordenar.
                    onMover={(de, para) => moverBoardParaPosicao(de, para)}
                    onSaltar={(bi) => {
                      // Abrir a dobra ANTES de saltar: saltar para um board
                      // fechado deixava-a a olhar para uma linha de miniaturas
                      // sem perceber porque é que o board «não abriu».
                      const id = doc.moodBoards[bi]?.id;
                      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
                      rolarAteVer(document.getElementById(`mood-board-${bi}`), {
                        block: "start",
                      });
                    }}
                  />
                  <div className="min-w-0">
                    <ArrastoDosMoodBoards
                      ordemDosBoards={ordemDosBoards}
                      aArrastar={aArrastar}
                      onArrastoComeca={setAArrastar}
                      fantasma={<FantasmaDaFoto id={aArrastar} doc={doc} urls={assetUrls} />}
                      onLargarBoard={(de, para) => moverBoardParaPosicao(de, para)}
                      onLargarFoto={aoLargarFoto}
                    >
                      <ListaDeBoards ordem={ordemDosBoards} className="flex flex-col gap-3">
                        {/* Pela ordem que as páginas vão sair — ver `ordemDosBoards`. */}
                        {ordemDosBoards.map((bi, pos) => {
                          const b = doc.moodBoards[bi];
                          /**
                           * A ORDEM POR QUE A PÁGINA DESENHA — a mesma função do
                           * gerador (`ordemDoDesenho`): a fotografia do cartão à
                           * frente, sempre.
                           */
                          const principalDoTema = fotoPrincipalDe(b);
                          /**
                           * O que o PDF faz com este tema: a disposição que ela
                           * escolheu, ou a automática pelo número de fotografias
                           * (`pdf-editorial/mosaico.ts`); o capítulo sai do
                           * título (`grupos.ts`).
                           */
                          const fotosDoTema = b.images.length;
                          const disposicaoDesteTema = disposicaoDoTema(b);
                          const paginasDesteTema = paginasDoTema(fotosDoTema, disposicaoDesteTema);
                          /** A vez do tema no PDF — decide de que lado fica o texto. */
                          const vezDesteTema =
                            planoDoPdf.reduce(
                              (v, e) => (e.tipo === "tema" && e.bi === bi ? e.vez : v),
                              0,
                            ) || 1;
                          /** Esta página está fechada a alterações? */
                          const fechado = !!b.bloqueado;
                          /** E dobrada, que é só uma questão de espaço no ecrã? */
                          const dobrado = !!(b.id && dobrados[b.id]);
                          return (
                            <CartaoDeBoard
                              key={bi}
                              bi={bi}
                              // Qual é a página que ela está a editar — para o
                              // painel da direita mostrar ESSA. No foco e não no
                              // rato: o rato atravessa cartões a caminho de
                              // outro sítio, e o painel piscava.
                              onFocusCapture={() => setBoardActivo(bi)}
                              // O `id` é o alvo do índice lateral. Pelo ÍNDICE REAL:
                              // a ordem desenhada pode mudar debaixo do salto.
                              ancora={`mood-board-${bi}`}
                              // `@container`: a grelha das fotografias aqui
                              // dentro pergunta pela largura DESTE cartão, e não
                              // pela da janela — ver o comentário na grelha.
                              className={`@container rounded-2xl border p-4 ${
                                fechado
                                  ? "border-sage-600/35 bg-sage-600/[0.04]"
                                  : "border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)]"
                              }`}
                            >
                              {(pega) => (
                                <>
                                  <div className="flex flex-wrap items-center gap-2 mb-2">
                                    {/* A PEGA DO CARTÃO. Alvo próprio, sempre visível ao
                            toque: com oito boards, levar o último ao topo eram
                            sete cliques nas setas. */}
                                    <button
                                      type="button"
                                      {...pega}
                                      aria-label={`Arrastar o mood board ${pos + 1}`}
                                      className={`alvo-toque flex h-8 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] active:cursor-grabbing ${ESTADO} ${PRESSAO}`}
                                    >
                                      <span aria-hidden="true">⠿</span>
                                    </button>
                                    {/* ── A DOBRA ──────────────────────────────────
                                  Um board terminado ocupa um ecrã inteiro de
                                  altura. Fechado fica com o que basta para o
                                  reconhecer: título, subtítulo, quantas fotos
                                  tem e uma tira de miniaturas. */}
                                    <button
                                      type="button"
                                      onClick={() => b.id && alternarDobra(b.id)}
                                      aria-expanded={!dobrado}
                                      aria-label={
                                        dobrado
                                          ? `Abrir o mood board ${pos + 1}`
                                          : `Fechar o mood board ${pos + 1}`
                                      }
                                      className={`alvo-toque flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-foreground/40 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
                                    >
                                      <span aria-hidden="true">{dobrado ? "▸" : "▾"}</span>
                                    </button>
                                    <input
                                      // Num cartão estreito (telemóvel), o título desce para uma
                                      // linha inteira por baixo dos botões: ao lado deles
                                      // sobravam ~130 px e «Cerimónia» já não cabia.
                                      className={`bo-input ${TITULO_DO_BOARD} px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]`}
                                      value={b.title}
                                      onChange={(e) => updateBoard(bi, { title: e.target.value })}
                                      // A pega do aviso de ortografia: é por ela
                                      // que o «Ver no campo» encontra este
                                      // controlo (ver `chaveDoCampo`).
                                      data-campo={`boardTitulo:${bi}`}
                                      placeholder="Decoração Cerimónia"
                                      aria-label="Título do mood board"
                                      readOnly={fechado}
                                    />
                                    {/* A segunda caixa fica AO LADO em ecrã largo
                                      e por baixo abaixo de `xl` — ver `aoLado`,
                                      em `CaixaInglesa`. Só de leitura quando a
                                      página está fechada, como a portuguesa: um
                                      board terminado é terminado nas duas
                                      línguas. */}
                                    {caixaDeIngles(
                                      { tipo: "boardTitulo", bi },
                                      "Título do mood board",
                                      {
                                        className: `bo-input ${TITULO_DO_BOARD} px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]`,
                                        readOnly: fechado,
                                        placeholder: "Ceremony Decoration",
                                      },
                                    )}
                                    {/* ── FECHAR A PÁGINA ──────────────────────────
                                  Marcada como terminada, fica só de leitura e
                                  muda de cor. Reabrir é um clique — e não uma
                                  pergunta a que se responde sem ler. */}
                                    <button
                                      type="button"
                                      onClick={() => alternarBloqueio(bi)}
                                      aria-pressed={fechado}
                                      aria-label={
                                        fechado
                                          ? `Reabrir o mood board ${pos + 1} a alterações`
                                          : `Marcar o mood board ${pos + 1} como terminado`
                                      }
                                      className={`alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs  ${
                                        fechado
                                          ? "bg-sage-600/15 text-sage-600"
                                          : "text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)]"
                                      } ${ESTADO} ${PRESSAO}`}
                                    >
                                      <span aria-hidden="true">{fechado ? "🔒" : "🔓"}</span>
                                    </button>
                                    {/* ── O RESTO, NUM «⋯» ─────────────────────────────────
                                      Fase 3 do redesenho: a barra deste cartão tinha seis
                                      ícones soltos (setas, cor, duplicar, remover) e lia-se
                                      como um painel de controlo. Fica à vista o título e o
                                      cadeado — o que diz o estado da página —, e o que se
                                      usa de vez em quando entra no menu, com nomes. Mover
                                      à pressa continua a ser a pega (e o índice ao lado). */}
                                    <MenuDeAccoes
                                      sobre={`«${b.title.trim() || `mood board ${pos + 1}`}»`}
                                      sempreVisivel
                                      className="ml-auto shrink-0"
                                      accoes={[
                                        {
                                          id: "subir",
                                          rotulo: "Subir uma posição",
                                          onAccao: () => moveBoard(pos, -1),
                                          desativada: pos === 0,
                                        },
                                        {
                                          id: "descer",
                                          rotulo: "Descer uma posição",
                                          onAccao: () => moveBoard(pos, 1),
                                          desativada: pos === doc.moodBoards.length - 1,
                                        },
                                        // Arrumar por cor só quando há o que arrumar: três
                                        // fotos com cor conhecida (ver `arrumarPorCor`).
                                        ...(b.images.filter((p) => assetCores[p]).length >= 3
                                          ? [
                                              {
                                                id: "cor",
                                                rotulo: "Arrumar as fotografias por cor",
                                                onAccao: () => arrumarPorCor(bi),
                                                desativada: fechado,
                                              },
                                            ]
                                          : []),
                                        {
                                          id: "duplicar",
                                          rotulo: "Duplicar o mood board",
                                          onAccao: () => duplicarBoard(bi),
                                          separadorAntes: true,
                                        },
                                        {
                                          id: "remover",
                                          rotulo: "Remover o mood board",
                                          onAccao: () => removeBoard(bi),
                                          destrutiva: true,
                                          desativada: fechado,
                                        },
                                      ]}
                                    />
                                  </div>
                                  {/* O subtítulo numa segunda linha, alinhado com o título:
                                    quatro caixas na mesma linha liam-se como um formulário,
                                    e não como o cabeçalho de uma página. */}
                                  <div className="mb-2 flex flex-wrap items-center gap-2 @min-[32rem]:pl-16">
                                    {/* O SEGUNDO andar do cabeçalho da página.
                            A proposta feita à mão tem «Complementos dos Noivos»
                            e, por baixo, «Ramo de Noiva (a definir com a
                            Noiva)»: o primeiro diz o capítulo, o segundo diz o
                            que aquelas fotos são e o que ainda está por
                            decidir. Sem campo, ou se perdia a segunda frase ou
                            se enfiava tudo num título com parênteses. */}
                                    <input
                                      className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
                                      value={b.subtitulo ?? ""}
                                      onChange={(e) =>
                                        updateBoard(bi, { subtitulo: e.target.value })
                                      }
                                      data-campo={`boardSubtitulo:${bi}`}
                                      placeholder="Subtítulo (opcional) — ex.: Ramo de Noiva (a definir com a Noiva)"
                                      aria-label="Subtítulo do mood board"
                                      readOnly={fechado}
                                    />
                                    {caixaDeIngles(
                                      { tipo: "boardSubtitulo", bi },
                                      "Subtítulo do mood board",
                                      {
                                        className:
                                          "bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                                        readOnly: fechado,
                                      },
                                    )}
                                  </div>
                                  {/* A pergunta fica DENTRO do cartão, logo por
                                    baixo da barra que a levantou — e antes da
                                    tira de miniaturas, para se ver ao mesmo
                                    tempo a frase e as fotografias que ela
                                    conta. Ver `aRemover`. */}
                                  {perguntaDeRemocao(`board:${bi}`, "Remover a página")}
                                  {/* ── O QUE SE VÊ COM O BOARD FECHADO ───────────
                                Título e subtítulo já estão no cabeçalho; falta
                                o que diz se está pronto: quantas fotos, e quais.
                                Sem a tira, «Decoração Cerimónia · 6 fotos» podia
                                ser qualquer página. */}
                                  {dobrado ? (
                                    <div className="flex items-center gap-2">
                                      <p className="shrink-0 text-[11px] text-foreground/45">
                                        {b.images.length === 0
                                          ? "sem fotos"
                                          : b.images.length === 1
                                            ? "1 foto"
                                            : `${b.images.length} fotos`}
                                      </p>
                                      <div className="flex min-w-0 gap-1 overflow-hidden">
                                        {b.images.slice(0, 8).map((path, ii) => (
                                          <span
                                            key={ii}
                                            className="h-9 w-9 shrink-0 overflow-hidden rounded border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
                                          >
                                            {assetUrls[path] ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img
                                                src={assetUrls[path]}
                                                alt=""
                                                loading="lazy"
                                                className="h-full w-full object-cover"
                                              />
                                            ) : null}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      {/* Cresce com o texto — ver `DescricaoQueCresce`.
                                        Uma altura fixa de duas linhas escondia
                                        154 px dos 224 desta descrição, medidos a
                                        390 px. */}
                                      <DescricaoQueCresce
                                        className={`${INPUT_SM} mb-2 w-full resize-none leading-relaxed`}
                                        valor={b.annotation ?? ""}
                                        onChange={(e) =>
                                          updateBoard(bi, { annotation: e.target.value })
                                        }
                                        data-campo={`boardNota:${bi}`}
                                        placeholder="Descrição (opcional) — ex.: runner floral com hortênsias verdes, cravo verde, lisianthus branco…"
                                        aria-label="Descrição do mood board"
                                      />
                                      {caixaDeIngles(
                                        { tipo: "boardNota", bi },
                                        "Descrição do mood board",
                                        {
                                          className: `${INPUT_SM} mb-2 w-full resize-none leading-relaxed`,
                                          as: "textarea",
                                          // A inglesa cresce com a portuguesa: são
                                          // «a mesma caixa em duas línguas», e uma
                                          // delas a esconder 206 px deixava de o
                                          // ser. A `CaixaInglesa` já sabia fazê-lo.
                                          cresce: true,
                                        },
                                      )}
                                      {/* ── DUAS PÁGINAS COM O MESMO NOME ───────
                                        «"Complementos Dos Noivos" e
                                        "Complementos Noivos". Uma é bouquet,
                                        outra lapelas — mas na proposta aparecem
                                        dois títulos praticamente idênticos
                                        seguidos.»

                                        Não é vermelho e não trava nada: «Mesa
                                        1» e «Mesa 2» é uma decisão, não um
                                        descuido, e um aviso que trava uma
                                        escolha legítima ensina-se a ignorar. Diz
                                        o que viu, cita o outro título, e deixa-a
                                        decidir. */}
                                      {avisosDeTitulo[bi] && (
                                        <p className={`${AVISO_DO_BOARD} text-[var(--bo-aviso)]`}>
                                          {avisosDeTitulo[bi]}
                                        </p>
                                      )}
                                      {/* ── DUAS PÁGINAS, E NÃO FOTOS DE FORA ───────
                                        No PDF antigo uma página imprimia dez e
                                        as outras ficavam de fora. No novo
                                        nenhuma fica: acima de doze o tema passa
                                        a duas páginas, e a segunda diz «Mais
                                        ideias…». Não é um erro — diz-se em voz
                                        baixa, para ela decidir se a quer. */}
                                      {paginasDesteTema > 1 && (
                                        <p
                                          className={`${AVISO_DO_BOARD} text-[var(--bo-text-muted)]`}
                                        >
                                          {fotosDoTema} fotos: no PDF este tema ocupa{" "}
                                          {paginasDesteTema} páginas (a segunda diz «Mais ideias…»).
                                        </p>
                                      )}
                                      {/* ── A FOTO QUE DESTOA DA PALETA ────────────
                                        Não é um erro, e por isso não é vermelho:
                                        uma fotografia de cor diferente pode ser
                                        exactamente o que se quer. É uma coisa que
                                        se vê melhor dita do que olhando para uma
                                        grelha de miniaturas pequenas — e que só
                                        aparece quando salta à vista mesmo (ver
                                        `LIMIAR_DE_AVISO` em `cor-dominante.ts`).

                                        Cala-se sozinho quando não há cores que
                                        cheguem: as fotos carregadas antes de a
                                        cor existir não entram na conta. */}
                                      {(() => {
                                        const fora = fotosQueDestoam(
                                          b.images.map((p) => assetCores[p]),
                                        );
                                        if (fora.length === 0) return null;
                                        const quais = fora
                                          .slice(0, 3)
                                          .sort((x, y) => x - y)
                                          .map((i) => `${i + 1}.ª`);
                                        return (
                                          <p className="mb-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
                                            <span aria-hidden="true">◐ </span>
                                            {fora.length === 1
                                              ? `A ${quais[0]} fotografia destoa da paleta desta página.`
                                              : `A ${quais.slice(0, -1).join(", a ")} e a ${quais[quais.length - 1]} fotografias destoam da paleta desta página.`}{" "}
                                            Pode ser de propósito — se não for, troca-a ou arruma a
                                            página por cor.
                                          </p>
                                        );
                                      })()}
                                      {/* ── O ECRÃ GRANDE DAVA MINIATURAS MAIS
                                        PEQUENAS DO QUE O TELEMÓVEL ──────────
                                        `sm:grid-cols-4` dispara aos 640 de
                                        JANELA e nunca mais volta atrás. Aos
                                        1024 a coluna de conteúdo cai de 975
                                        para 504 px, o índice das páginas leva
                                        176 desses, e a grelha ficava com ~300
                                        px para desenhar QUATRO colunas:
                                        miniaturas de 68 px. A 375, com os
                                        mesmos ~300 px, desenhava três — 92 px.
                                        O portátil mostrava as fotografias mais
                                        pequenas do que o telemóvel.

                                        A pergunta é a largura do CARTÃO, que é
                                        onde a grelha vive: `@container` no
                                        cartão, e a quarta coluna só a partir de
                                        24 rem. Medido depois: ~92 px aos 1024,
                                        ~101 aos 375 e ~126 entre 640 e 1023 —
                                        nunca mais uma miniatura mais pequena
                                        num ecrã maior. */}
                                      {/* Memorizado (10/11): escrever o título ou a
                                        descrição desta página — ou de outra — já
                                        não redesenha as fotografias todas. Ver
                                        `FotosDoBoard`. */}
                                      <FotosDoBoard
                                        bi={bi}
                                        images={b.images}
                                        titulo={b.title}
                                        principal={principalDoTema}
                                        fechado={fechado}
                                        seleccionadasDoBoard={seleccionadasDoBoard(bi)}
                                        assetUrls={assetUrls}
                                        assetMedias={assetMedias}
                                        assetOriginais={assetOriginais}
                                        estadoDosUrls={estadoDosUrls}
                                        historiaDe={historiaDaFoto}
                                        origemDe={origemDaFoto}
                                        eventos={eventosDasFotos}
                                      />
                                      {/* ── A CAIXA DE ACRESCENTAR, FORA DA GRELHA ────────
                                        Estava DENTRO da grelha, como se fosse
                                        mais uma fotografia — uma célula quadrada
                                        tracejada entre fotos que têm a forma da
                                        caixa que vão ocupar na página. Num board
                                        de cinco fotos numa grelha de quatro
                                        colunas, ela caía a meio da segunda fila,
                                        e lia-se como um buraco: uma foto que
                                        faltava, não um botão.

                                        Fora da grelha e a toda a largura, é o
                                        que é — a acção que vem A SEGUIR às
                                        fotografias. E nunca mais pode aparecer
                                        no meio delas, porque já não é uma
                                        célula.

                                        Num board fechado não existe: o gesto de
                                        largar uma foto é exactamente o engano
                                        contra o qual o fecho existe. */}
                                      {!fechado && (
                                        <div className="mt-2">
                                          <UploadArea
                                            label="+ Imagens"
                                            progresso={uploading[`board-${bi}`]}
                                            multiple
                                            faixa
                                            onFiles={(files) =>
                                              handleUpload(
                                                `board-${bi}`,
                                                files,
                                                (paths) => addBoardImages(bi, paths),
                                                (marcadores) => addBoardImages(bi, marcadores),
                                              )
                                            }
                                          />
                                        </div>
                                      )}
                                      {/* ── A DISPOSIÇÃO DAS FOTOS ─────────────────
                                        Saiu no #173 e voltou a 15/10, a pedido
                                        dela, com as composições do PDF novo
                                        (`EscolherDisposicao`). O «Manter a forma»
                                        do PDF antigo não volta: cada célula do
                                        desenho novo já tem quase a forma da sua
                                        foto. */}
                                      <EscolherDisposicao
                                        valor={disposicaoDesteTema}
                                        aspectos={ordemDoDesenho(b).map(
                                          (k) =>
                                            aspetosDasFotos[b.images[k] ?? ""] ??
                                            ASPETO_POR_OMISSAO,
                                        )}
                                        vezPar={vezDesteTema % 2 === 0}
                                        desligado={fechado}
                                        onEscolher={(d) => mudarDisposicao(bi, d)}
                                        onAplicarATodos={
                                          doc.moodBoards.length > 1 && disposicaoDesteTema
                                            ? () => disposicaoEmTodos(disposicaoDesteTema)
                                            : undefined
                                        }
                                      />
                                      <p className="mt-2 text-xs leading-relaxed text-[var(--bo-text-muted)]">
                                        Capítulo:{" "}
                                        <strong className="font-medium text-[var(--bo-tinta-72)]">
                                          {capituloDoTema(
                                            b,
                                            eCasamento(doc.eventType),
                                            doc.moodBoards,
                                          )}
                                        </strong>
                                        <span className="text-foreground/35"> · </span>
                                        {composicaoEmPalavras(fotosDoTema, disposicaoDesteTema)}
                                      </p>
                                      {/* ── A PÁGINA, COMO VAI SAIR ───────────────
                                        Onde o painel da direita não cabe, a
                                        miniatura vive aqui, no cartão. Onde
                                        cabe, NÃO se monta — o painel mostra a
                                        mesma página, grande, e desenhá-la duas
                                        vezes (sete vezes, numa proposta de sete
                                        temas) foi o que já custou ao estúdio
                                        deixar de responder. */}
                                      {!painelLateralCabe &&
                                        (() => {
                                          const i = planoDoPdf.findIndex(
                                            (e) =>
                                              e.tipo === "tema" && e.bi === bi && e.parte === 0,
                                          );
                                          if (i < 0) return null;
                                          return (
                                            <figure className="m-0 mt-2 max-w-[15rem]">
                                              <PaginaEditorial
                                                pagina={planoDoPdf[i]}
                                                doc={doc as ProposalDoc}
                                                aspetos={aspetosDasFotos}
                                                capa={fontesDasMiniaturas.capa}
                                                fotosDoTema={fontesDasMiniaturas.fotosDoTema}
                                                outras={fontesDasMiniaturas.outrasDa(i)}
                                              />
                                              <figcaption className="mt-1 text-[10px] text-foreground/40">
                                                A página, como vai sair
                                              </figcaption>
                                            </figure>
                                          );
                                        })()}
                                      <div className="mt-2 flex flex-wrap items-center gap-4">
                                        <button
                                          type="button"
                                          className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                                          onClick={() => setPicker({ kind: "board", bi })}
                                          disabled={fechado}
                                          onPointerEnter={aquecerBiblioteca}
                                          onFocus={aquecerBiblioteca}
                                          onTouchStart={aquecerBiblioteca}
                                        >
                                          Escolher da biblioteca de temas
                                        </button>
                                        {/* GUARDAR ESTE, e não «o primeiro com título».
                          O controlo era único para a secção inteira e recebia
                          `doc.moodBoards.find(…)` — portanto guardava sempre o
                          PRIMEIRO mood board com título. Ela montava o
                          terceiro, carregava em «Guardar como modelo», e
                          guardava o primeiro; para o terceiro não havia
                          maneira nenhuma. Agora o botão vive ao lado do bloco
                          a que se refere, que é a única forma de a pergunta
                          "qual deles?" não ter de ser respondida por adivinha. */}
                                        {(b.title ?? "").trim() && (
                                          <ModelosParciais
                                            tipo="moodboard"
                                            mostrar="guardar"
                                            toast={toast}
                                            paraGuardar={b}
                                            nomeSugerido={b.title}
                                          />
                                        )}
                                      </div>
                                    </>
                                  )}
                                </>
                              )}
                            </CartaoDeBoard>
                          );
                        })}
                      </ListaDeBoards>
                    </ArrastoDosMoodBoards>
                    {/* ── O COMEÇO, QUANDO AINDA NÃO HÁ NADA ─────────────────────
                      Pedido dela de 9/11: «mesmo a parte da inspiração está uma
                      confusão». Sem mood boards, o passo abria com um
                      «+ Adicionar mood board» do tamanho de uma ligação, e a
                      primeira coisa grande era «À escolha do casal», que só
                      faz sentido depois. Agora a primeira coisa é dizer o que
                      é isto e um botão a sério para começar. */}
                    {doc.moodBoards.length === 0 && (
                      <div className="@container mt-2 rounded-2xl border border-dashed border-[var(--bo-hairline-strong)] px-5 py-8 text-center">
                        <p className="text-sm font-medium text-[var(--bo-text)]">
                          Ainda não há inspiração nesta proposta
                        </p>
                        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-[var(--bo-text-muted)]">
                          Cada mood board é uma página do PDF com um título (por exemplo
                          «Cerimónia») e as fotografias que mostram a ideia ao casal.
                        </p>
                        {/* ── TRÊS PORTAS (Fase 3, 10/11) ───────────────────
                          As três maneiras de começar, do mesmo tamanho e lado
                          a lado: em branco, de um modelo guardado, ou de um
                          tema da biblioteca. Antes era um botão e um «De um
                          modelo…» solto lá em baixo, e a biblioteca só aparecia
                          DEPOIS de haver uma página. */}
                        <div className="mx-auto mt-5 grid max-w-2xl grid-cols-1 gap-3 text-left @min-[34rem]:grid-cols-3">
                          <button
                            type="button"
                            className={`${PORTA_DE_COMECO} ${ESTADO} ${PRESSAO}`}
                            onClick={addBoard}
                          >
                            <span className="block text-sm font-medium text-[var(--bo-text)]">
                              Mood board em branco
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-[var(--bo-text-muted)]">
                              Uma página nova: escreves o título e pões as fotografias.
                            </span>
                          </button>
                          <ModelosParciais
                            tipo="moodboard"
                            mostrar="inserir"
                            toast={toast}
                            className="block"
                            porta={{
                              titulo: "Começar de um modelo",
                              texto: "Um mood board que já guardaste, com as fotos e o texto.",
                              className: PORTA_DE_COMECO,
                            }}
                            onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
                          />
                          <button
                            type="button"
                            className={`${PORTA_DE_COMECO} ${ESTADO} ${PRESSAO}`}
                            onClick={() => {
                              const bi = doc.moodBoards.length;
                              addBoard();
                              setPicker({ kind: "board", bi });
                            }}
                            onPointerEnter={aquecerBiblioteca}
                            onFocus={aquecerBiblioteca}
                            onTouchStart={aquecerBiblioteca}
                          >
                            <span className="block text-sm font-medium text-[var(--bo-text)]">
                              Da biblioteca de temas
                            </span>
                            <span className="mt-1 block text-xs leading-relaxed text-[var(--bo-text-muted)]">
                              Escolhes as fotografias de um tema e a página nasce com elas.
                            </span>
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      {doc.moodBoards.length > 0 && (
                        <button
                          type="button"
                          className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                          onClick={addBoard}
                        >
                          + Adicionar mood board
                        </button>
                      )}
                      {/* Fechar tudo é o gesto de quem acabou uma proposta e quer ver
                    a forma dela; abrir tudo, o de quem vai rever. Dois botões e
                    não um interruptor: o estado de cada board é seu, e um
                    interruptor teria de mentir sobre o conjunto. */}
                      {doc.moodBoards.length > 1 && (
                        <>
                          <button
                            type="button"
                            className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                            onClick={() => dobrarTodos(true)}
                          >
                            Fechar todos
                          </button>
                          <button
                            type="button"
                            className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                            onClick={() => dobrarTodos(false)}
                          >
                            Abrir todos
                          </button>
                        </>
                      )}
                      {/* Sem mood boards, o «De um modelo…» é uma das três
                        portas lá em cima — não se repete aqui. */}
                      {doc.moodBoards.length > 0 && (
                        <ModelosParciais
                          tipo="moodboard"
                          mostrar="inserir"
                          toast={toast}
                          onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
                        />
                      )}
                      {/* ── AS FOTOS DO MODELO A CHEGAR ────────────────────
                        Ao lado do botão que as pediu, e não em cima do bloco:
                        o bloco já está na lista com as fotografias à vista (é
                        o caminho de origem que ainda lá está), e uma caixa
                        entre os cartões empurrava a grelha para baixo a meio
                        do gesto seguinte. Sai sozinha quando a cópia acaba. */}
                      {fotosACopiar > 0 && (
                        <EmCurso
                          className="max-w-xs"
                          titulo={
                            fotosACopiar === 1
                              ? "A copiar 1 foto do modelo…"
                              : `A copiar ${fotosACopiar} fotos do modelo…`
                          }
                          estimadoMs={esperaDaCopiaDeFotos(fotosACopiar)}
                          nota="O bloco já está na proposta; as fotografias estão a passar para a pasta deste pedido."
                          notaDemorada="A cópia está a demorar. O bloco fica na proposta de qualquer maneira."
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── AS CORES DA PALETA, ESCOLHIDAS POR ELA (13/11) ─────────
                  «A minha mãe quer ser ela a escolher as cores.» À vista, aqui,
                  onde estão as fotografias — e não só no «Mudar fotografia» da
                  página. As mesmas cores vão para o PDF e para a proposta
                  online; sem escolha dela, saem as sugeridas pelas flores. */}
                {fotosDaPaleta.length > 0 && (
                  <div className="mt-8 border-t border-[var(--bo-hairline)] pt-6">
                    <CoresDaPaleta
                      quoteId={quote.id}
                      fotos={fotosDaPaleta}
                      refsDoPdf={refsDaPaleta}
                      cores={paletaDaProposta(doc)}
                      onMudar={mudarPaleta}
                    />
                  </div>
                )}

                {/* ── AS ALTERNATIVAS QUE O CASAL ESCOLHE (Fase 3) ───────────
                  Vive aqui dentro, e não numa secção própria: as alternativas
                  são visuais e as fotografias que as explicam já estão nestas
                  páginas. A razão longa está no cabeçalho do editor. */}
                {/* Só depois de haver inspiração — ou se já há alternativas
                    escritas, que nunca se escondem. */}
                {(doc.moodBoards.length > 0 || (doc.escolhas?.length ?? 0) > 0) && (
                  <EditorDeEscolhas
                    escolhas={doc.escolhas}
                    fotos={fotosParaEscolhas}
                    bilingue={bilingue}
                    onChange={(escolhas) => patch({ escolhas })}
                  />
                )}
              </Section>
            )}

            {/* Cronograma — organizacao only */}
            {!isDeco && (
              <SeccaoDoCronograma
                addPhase={addPhase}
                addPhaseItem={addPhaseItem}
                doc={doc}
                movePhase={movePhase}
                notaDaSeccao={notaDaSeccao}
                perguntaDeRemocao={perguntaDeRemocao}
                removePhase={removePhase}
                removePhaseItem={removePhaseItem}
                step={step}
                updatePhase={updatePhase}
                updatePhaseItem={updatePhaseItem}
              />
            )}

            {/* Budget */}
            <Section
              title="Orçamento Proposto"
              id="orcamento"
              escondida={step !== "orcamento"}
              rodape={notaDaSeccao("orcamento", "Nota sobre o orçamento")}
            >
              {isDeco ? (
                <>
                  <AvisoDeOrdem
                    mostrar={ordemSugerida}
                    onde="As linhas do orçamento"
                    onFixar={fixarOrdem}
                  />
                  <div className="@container flex flex-col gap-2 mb-3">
                    {/* ── OS CABEÇALHOS DAS COLUNAS ────────────────────────────
                      A caixa do fim não tinha nome nenhum: uma quadrícula com a
                      palavra «extra» ao lado, sem cabeçalho e sem uma frase que
                      dissesse o que faz. Palavras dela: «a caixa "extra" não
                      está explicada».

                      As larguras são as MESMAS das dos campos por baixo
                      (`w-32`, `w-28`, `w-16`) — é isso, e só isso, que faz um
                      cabeçalho apontar para a coluna certa. O campo do preço
                      unitário passou para a segunda linha de cada item, ao pé
                      da fórmula a que pertence: enquanto esteve no meio da
                      linha, aparecia só nas linhas que escalam e empurrava as
                      colunas dessas para fora do cabeçalho.

                      ── E PORQUE É QUE O LIMIAR É 36 REM DE CARTÃO ──────────
                      Era `sm:flex` — 640 de JANELA —, e a fila por baixo quebra
                      por CAIXA. Num portátil a 1024 a coluna de conteúdo tem
                      504 px e a fila já vai em duas linhas, mas o cabeçalho
                      continuava a nomear quatro colunas por cima delas: que é
                      literalmente a razão escrita duzentas linhas abaixo para o
                      esconder no telemóvel.

                      A conta da fila: o nome não desce dos `min-w-[12rem]`
                      (192), a escala leva `w-32` (128), o preço `w-28` (112), o
                      «Extra» `w-16` (64), o × `w-5` (20) e são quatro
                      intervalos de 8 — 548 px para caber tudo numa linha. Daí
                      as 36 rem (576), que é o mesmo limiar e a mesma razão do
                      `GRID` do `PaymentsPanel`. Os três sítios que decidem
                      sobre esta fila — este cabeçalho, a palavra «extra» e o
                      «?» — partilham-no, porque separá-los é como um cabeçalho
                      volta a mentir. */}
                    <div className="hidden items-center gap-2 text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:flex">
                      <span className="flex-1">Item</span>
                      <span className="w-32 shrink-0">Tipo de preço</span>
                      <span className="flex w-28 shrink-0 items-center justify-end gap-1">
                        Preço (sem IVA)
                        <Ajuda sobre="para que servem os preços por linha">
                          Os preços por linha são{" "}
                          <strong className="font-semibold text-[var(--bo-text)]">
                            só para ti
                          </strong>
                          : servem para somar e para avisar quando o total já não bate certo. O PDF
                          continua a mostrar as linhas sem preço e um «
                          {doc.totalLabel || "Valor Total"}» único, como nas tuas propostas.
                        </Ajuda>
                      </span>
                      {/* ── A EXPLICAÇÃO, AO PÉ DO CABEÇALHO E A PEDIDO ──────
                        Eram três linhas sempre visíveis por baixo das linhas do
                        orçamento. Palavras dela: «ocupa três linhas sempre
                        visíveis». Úteis na primeira vez, ruído a partir da
                        segunda — e a ocupar o espaço onde deviam estar as
                        linhas. Agora está onde a pergunta se faz: em cima da
                        coluna, atrás de um «?». */}
                      <span className="flex w-16 shrink-0 items-center justify-center gap-1">
                        Extra
                        <Ajuda sobre="o que faz a caixa Extra">
                          <strong className="font-semibold text-[var(--bo-text)]">Extra</strong>{" "}
                          marca uma linha como opcional: ela sai assinalada no quadro do PDF e, por
                          baixo do total, a proposta passa a mostrar também o valor <em>sem</em>{" "}
                          essa linha. Uma proposta só, com as duas versões lá dentro — em vez de
                          dois documentos a divergir.
                        </Ajuda>
                      </span>
                      <span className="w-5 shrink-0" />
                    </div>
                    {/* Pela ordem que vai SAIR — ver `ordemDoOrcamento`. O `i`
                      continua a ser o índice do array, que é o que os campos
                      escrevem; só a ordem de desenho muda. */}
                    {ordemDoOrcamento.map((i) => {
                      const l = linhasDoOrcamento[i];
                      const escala = escalasDoDoc[i];
                      const semPreco = l.preco === null;
                      return (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                          {/* ── O NOME DA LINHA NÃO ENCOLHE ABAIXO DE 12 REM ────
                            Do registo do audit, e é um dos oito bloqueios: «a
                            caixa do nome da linha do orçamento tem 62 px — 27
                            com a proposta bilingue ligada».

                            MEDIDO a 390 px: a fila tem 318 px dentro do cartão,
                            e as colunas fixas (a escala `w-32`, o preço `w-28`)
                            mais os espaços comem 264. Sobram 54 para os campos
                            de texto — e como eles são `flex-1` com `min-w-0`
                            escrito à mão, não quebram: ENCOLHEM. Escrever
                            «Decoração da Cerimónia» numa caixa de 62 px é
                            escrever às cegas, e o que ali se escreve é o texto
                            que o casal lê no PDF.

                            O `min-w` é o remédio da própria casa — é o que a
                            fase do cronograma faz cento e trinta linhas acima,
                            e o que o `ServicesEditor` faz nos títulos de grupo.
                            Com um mínimo, o `flex-wrap` que já cá estava passa a
                            fazer o que existe para fazer: o nome fica sozinho
                            numa fila inteira e a escala, o preço e o «Extra»
                            descem para a de baixo. Acima de 520 px nada muda —
                            aí já cabia. */}
                          <input
                            className={`${INPUT_SM} min-w-[12rem] flex-1`}
                            value={l.item}
                            onChange={(e) => updateBudgetItem(i, e.target.value)}
                            // Ao sair do nome, o artigo do Moloni que ele sugere
                            // (só se ainda não houver um escolhido).
                            onBlur={() => setDoc((d) => sugerirArtigoDaLinha(d, i))}
                            // A pega do salto. Faltava: o «Ver no campo» das
                            // gralhas caía na secção porque nenhuma rubrica a
                            // tinha, e o painel «Por traduzir» precisa dela para
                            // chegar à caixa ao lado.
                            data-campo={`linhaDeOrcamento:${i}`}
                            placeholder="Decor Cerimónia"
                            aria-label="Item de orçamento"
                          />
                          {/* A inglesa com o mesmo mínimo: com o bilingue ligado
                            eram os dois a repartir os mesmos 54 px, 27 para
                            cada. */}
                          {caixaDeIngles({ tipo: "linhaDeOrcamento", i }, "Item de orçamento", {
                            className: `${INPUT_SM} min-w-[12rem] flex-1`,
                            placeholder: "Ceremony Decor",
                          })}
                          {/* COMO É QUE ESTA LINHA ESCALA. Metade das linhas de um
                          orçamento de casamento não é um preço, é uma
                          multiplicação — e quando os convidados mudam, refazer
                          essas contas à mão é onde entra o erro que ninguém vê,
                          porque o resultado continua a parecer um preço. */}
                          {/* ── O RÓTULO NÃO DESAPARECE SEM SUBSTITUTO ────────
                            Sem o cabeçalho, «Tipo de preço» não voltava em lado
                            nenhum: ficava um `<select>` com três opções e
                            nenhuma palavra visível a dizer o que ele decide. O
                            nome existia para quem OUVE (`aria-label`) e não
                            para quem OLHA — é a mesma família do «Total» que se
                            corrigiu esta semana, e não se resolve com `hidden`.

                            Agora o rótulo está sempre num dos dois sítios, e
                            nunca nos dois: no cabeçalho enquanto a fila é uma
                            só, aqui por cima do campo quando ela quebra. Os
                            dois lêem o MESMO limiar de contentor, que é o que
                            impede haver um instante com ambos ou com nenhum.
                            `aria-hidden` porque o `aria-label` já o diz — dois
                            nomes seguidos era o leitor de ecrã a repetir-se. */}
                          <label className="flex w-32 shrink-0 flex-col gap-1">
                            <span
                              aria-hidden="true"
                              className="text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:hidden"
                            >
                              Tipo de preço
                            </span>
                            <select
                              value={escala?.tipo ?? "fixa"}
                              onChange={(e) => definirEscala(i, e.target.value as TipoDeEscala)}
                              aria-label={`Tipo de preço ${l.item || "a linha sem nome"}`}
                              className="bo-input w-full px-2 py-2 text-xs"
                            >
                              <option value="fixa">Valor fixo</option>
                              <option value="por-convidado">Por convidado</option>
                              <option value="por-mesa">Por mesa</option>
                            </select>
                          </label>
                          {/* A largura vai no invólucro e não no campo: `.bo-input`
                        tem `width: 100%` escrito em CSS, que ganha a um
                        `w-28` do Tailwind. Sem isto o preço comia a linha
                        toda e o nome ficava numa caixa de trinta pixels — foi
                        o que a captura de ecrã mostrou. */}
                          {/* A largura continua no invólucro e não no campo, pela
                            razão escrita aqui em cima; o invólucro é que passou
                            a ser um `<label>`, para o rótulo desta coluna voltar
                            quando a fila quebra — ver o `<select>` ao lado. */}
                          <label className="flex w-28 shrink-0 flex-col gap-1">
                            <span
                              aria-hidden="true"
                              className="text-[9px] uppercase tracking-[0.2em] text-foreground/25 @min-[36rem]:hidden"
                            >
                              Preço (sem IVA)
                            </span>
                            {/* ── PREENCHIDO E POR PREENCHER, INCONFUNDÍVEIS ──
                              Tinha aqui `placeholder="900"`. Palavras dela: «um
                              número redondo e plausível como placeholder num
                              campo de preço é perigoso — mais cedo ou mais
                              tarde alguém pensa que já está preenchido». E
                              tinha acontecido: quatro serviços por orçamentar
                              mostravam «900» a cinzento cada um.

                              O placeholder saiu, e as duas caixas passaram a
                              ser diferentes ao olhar, não só ao ler: a que tem
                              preço é sólida e escura, a que não tem é
                              tracejada, lavada, e diz «sem preço» — três
                              palavras que ninguém confunde com euros. */}
                            <input
                              /**
                               * ── A CHAVE TRAZ O PREÇO GRAVADO DE VOLTA AO CAMPO ──
                               * A linha é desenhada com `key={i}`, e o `i` é a
                               * POSIÇÃO: ao apagar a do meio, o React reaproveita
                               * o nó que sobrevive na posição e um `defaultValue`
                               * não se volta a aplicar a um nó que já existia. O
                               * campo ficava a mostrar o preço da linha ANTERIOR
                               * ao lado do nome da linha nova — e o `blur`
                               * seguinte GRAVAVA esse número por cima do
                               * verdadeiro. Com [Alfa, Beta, Gama] a 100/200/300,
                               * apagar a Beta e tocar no campo da Gama punha a
                               * Gama a valer 200 €, e daí ia para o PDF, para o
                               * sinal e para a factura. O mesmo acontecia no
                               * arrumar, no Cmd+Z, no anular a limpeza e no repor
                               * uma versão: o que estava no campo deixava de ser
                               * o que estava no documento.
                               *
                               * Pôr o valor gravado na chave resolve-o pela raiz —
                               * é o mesmo remédio que os valores adicionais já
                               * usam aqui em baixo. A chave só muda quando o
                               * DOCUMENTO muda, nunca a cada tecla: continua a
                               * poder escrever-se «1.500,50» sem o campo se
                               * reformatar a meio da escrita.
                               */
                              key={`preco:${i}:${l.preco}`}
                              className={`bo-input px-2.5 py-2 text-right text-xs ${
                                semPreco
                                  ? "border-dashed bg-[var(--bo-tinta-3)] text-foreground/40 placeholder:text-foreground/30 placeholder:italic"
                                  : "font-medium text-[var(--bo-text)]"
                              }`}
                              defaultValue={l.preco === null ? "" : String(l.preco)}
                              // Com subpontos, a linha vale a soma deles e
                              // escreve-se lá em baixo, em cada um (6/11).
                              readOnly={subpontosDoDoc[i].length > 0}
                              // `onBlur` e não `onChange`: normalizar a cada tecla
                              // apagava o que ela estava a escrever a meio ("1." vira
                              // 1, e o "500" seguinte já não tinha onde entrar).
                              onBlur={(e) => updateBudgetPrice(i, e.target.value)}
                              placeholder="sem preço"
                              inputMode="decimal"
                              aria-label={`Preço de ${l.item || "linha sem nome"}`}
                              // A pega do salto da regra do envio (5/11).
                              data-campo={`budgetPreco:${i}`}
                            />
                          </label>
                          {/* EXTRA OU NÃO. Uma caixa e não um menu: a pergunta é
                          de sim ou não, e um menu de duas entradas custa duas
                          carregadas para responder a uma pergunta de uma.
                          A palavra «extra» some onde o cabeçalho da coluna já a
                          diz, e fica onde não há cabeçalho nenhum — pelo MESMO
                          limiar de contentor que o cabeçalho usa, que é o que
                          impede a palavra e o cabeçalho de se cruzarem. */}
                          <label className="alvo-toque flex w-16 shrink-0 items-center justify-center gap-1.5 text-[11px] text-foreground/50">
                            <input
                              type="checkbox"
                              checked={extrasDoDoc[i] ?? false}
                              onChange={(e) => updateBudgetExtraFlag(i, e.target.checked)}
                              aria-label={`${l.item || "Linha sem nome"} é um extra opcional`}
                            />
                            <span className="@min-[36rem]:hidden">extra</span>
                          </label>
                          {/* Onde a fila quebra não há cabeçalho de coluna, e
                            portanto não há onde pendurar o «?» — o mesmo limiar
                            de contentor, pela mesma razão. Fica na PRIMEIRA linha,
                            que é o equivalente móvel do cabeçalho — e só nela:
                            um ponto de interrogação por linha seriam oito
                            botões a explicar a mesma coisa.

                            Fora do `<label>`: um botão lá dentro carregaria a
                            quadrícula ao ser carregado. */}
                          {ordemDoOrcamento[0] === i && (
                            <Ajuda className="@min-[36rem]:hidden" sobre="o que faz a caixa Extra">
                              <strong className="font-semibold text-[var(--bo-text)]">Extra</strong>{" "}
                              marca uma linha como opcional: ela sai assinalada no quadro do PDF e,
                              por baixo do total, a proposta passa a mostrar também o valor{" "}
                              <em>sem</em> essa linha. Uma proposta só, com as duas versões lá
                              dentro — em vez de dois documentos a divergir.
                            </Ajuda>
                          )}
                          <button
                            type="button"
                            className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                            onClick={() => removeBudgetItem(i)}
                            aria-label="Remover item"
                          >
                            ×
                          </button>
                          {/* ── O ARTIGO DO MOLONI DESTA LINHA (5/11) ─────────────
                            Ela: «quando estivéssemos a fazer a proposta, colocar
                            os valores para cada coisa … para depois no Moloni
                            estar tudo organizadinho». Só para a casa — o cliente
                            não vê. Uma fila própria por baixo, como a fórmula da
                            escala: a fila de cima tem a largura contada ao píxel. */}
                          {subpontosDoDoc[i].length === 0 ? (
                            <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1">
                              <label className="flex w-full items-center gap-2 pl-1 text-[11px] text-[var(--bo-text-muted)]">
                                <span className="shrink-0">Artigo do Moloni</span>
                                <select
                                  value={artigosDoDoc[i] ?? ""}
                                  onChange={(e) =>
                                    updateBudgetArtigo(
                                      i,
                                      eArtigo(e.target.value) ? e.target.value : null,
                                    )
                                  }
                                  data-campo={`budgetArtigo:${i}`}
                                  aria-label={`Artigo do Moloni de ${l.item || "linha sem nome"}`}
                                  className={`bo-input w-auto min-w-0 max-w-full px-2 py-1 text-[11px] ${
                                    artigosDoDoc[i]
                                      ? "text-[var(--bo-tinta-72)]"
                                      : "border-dashed text-[var(--bo-text-muted)]"
                                  }`}
                                >
                                  <option value="">Escolher…</option>
                                  {ARTIGOS.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.nome} · {a.ref}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="button"
                                onClick={() => dividirEmSubpontos(i)}
                                className={`alvo-toque text-[11px] text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                              >
                                + Subpontos
                              </button>
                            </div>
                          ) : (
                            <SubpontosDaLinha
                              i={i}
                              linha={l.item}
                              subs={subpontosDoDoc[i]}
                              aoMudar={(mudar) => mudarSubpontos(i, mudar)}
                            />
                          )}
                          {/* A fórmula ao lado do número: um total que muda sozinho
                          e não explica porquê é um total em que se deixa de
                          confiar à primeira surpresa. E o preço UNITÁRIO ao pé
                          dela, que é a única coisa da fórmula que se edita. */}
                          {escala && (
                            <div className="flex w-full flex-wrap items-center gap-2 pl-1">
                              <span className="w-24 shrink-0">
                                <input
                                  // A mesma chave do preço, e pela mesma razão: o
                                  // unitário é um `defaultValue` num nó que a
                                  // remoção de uma linha reaproveita, e sem isto
                                  // ficava a mostrar o unitário da linha anterior
                                  // — com a fórmula ao lado a explicar uma conta
                                  // que já não era a desta linha.
                                  key={`unitario:${i}:${escala.unitario}`}
                                  className="bo-input px-2.5 py-2 text-right text-xs text-[var(--bo-tinta-72)]"
                                  defaultValue={String(escala.unitario)}
                                  onBlur={(e) => definirUnitario(i, e.target.value)}
                                  placeholder="45"
                                  inputMode="decimal"
                                  aria-label={`Preço por ${escala.tipo === "por-mesa" ? "mesa" : "convidado"} de ${l.item || "linha sem nome"}`}
                                />
                              </span>
                              <span className="text-[10px] text-foreground/40">
                                {`${formulaDaLinha(
                                  escala,
                                  convidados,
                                  doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
                                )} = ${eur(
                                  totalDaLinha(
                                    escala,
                                    convidados,
                                    doc.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO,
                                  ) ?? 0,
                                )}`}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* OS SERVIÇOS JÁ ESCRITOS, COM O VALOR À FRENTE (5/11).
                      Ela: «serviço tal, valor tal, serviço tal, valor tal». Os
                      serviços estão no passo 2; aqui trazem-se de uma vez, com
                      o artigo do Moloni que o nome sugere, e só falta o valor. */}
                    {servicosAOrcamentar.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] px-3 py-2">
                        <span className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                          {servicosAOrcamentar.length === 1
                            ? `O serviço «${servicosAOrcamentar[0]}» ainda não está no orçamento.`
                            : `${servicosAOrcamentar.length} serviços da proposta ainda não estão no orçamento: ${servicosAOrcamentar.map((t) => `«${t}»`).join(", ")}.`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setDoc((d) => trazerServicosParaOOrcamento(d))}
                          className={`alvo-toque shrink-0 text-xs font-medium text-[var(--bo-accent)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                        >
                          {servicosAOrcamentar.length === 1
                            ? "Pôr no orçamento"
                            : "Pôr todos no orçamento"}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                        onClick={addBudgetItem}
                      >
                        + Adicionar item
                      </button>
                      {/* O CONTADOR, no lugar onde estava «Soma das linhas».
                        A soma mudou-se para o bloco de totais (que a mostra
                        pela ordem do PDF); aqui fica a única coisa que este
                        sítio pode responder melhor do que ele — quantas destas
                        caixas estão mesmo preenchidas.

                        ── «0 DE 4 LINHAS COM PREÇO» NÃO É UM AVISO ──────────
                        Palavras dela sobre uma proposta CORRECTA: o contador
                        lia-se como erro. E lia-se bem — «0 de 4» tem a forma
                        de um contador por preencher, mas há propostas em que
                        as linhas NUNCA levam valor: o preço vive no total e as
                        linhas são a lista do que está incluído. É, aliás, o
                        formato das propostas dela há anos.

                        As duas situações distinguem-se por um facto e não por
                        um palpite: nenhuma linha com preço E um total escrito é
                        «o preço está no total»; nenhuma linha com preço e nenhum
                        total é «ainda não comecei», e aí um contador a zero
                        também não diz nada que se aproveite. O contador fica
                        para o caso em que ele responde mesmo a alguma coisa —
                        quando há preços por linha para contar. */}
                      {contagem.total > 0 &&
                        (contagem.comPreco === 0 && parseMoneyText(totalInput) > 0 ? (
                          <span className="text-xs text-[var(--bo-text-muted)]">
                            Preço definido no total — as linhas não levam valor
                          </span>
                        ) : contagem.comPreco > 0 ? (
                          <span className="text-xs text-[var(--bo-text-muted)]">
                            {contagem.frase}
                          </span>
                        ) : null)}
                    </div>
                    {/* ── UMAS COM PREÇO, OUTRAS SEM: A SOMA ESTÁ INCOMPLETA ──
                      É o caso que mente sem parecer. Nenhuma linha com preço é
                      «ainda não orçamentei» e não soma nada; TODAS com preço é
                      uma soma verdadeira. O meio dá um número plausível que
                      está errado por baixo — e é a partir dele que o aviso de
                      desalinhamento e o botão que arruma o total falam. */}
                    {contagem.incompleta && (
                      <p className="flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                        <span aria-hidden="true">⚠</span>
                        <span>
                          {contagem.semPreco === 1
                            ? "1 linha ainda não tem preço"
                            : `${contagem.semPreco} linhas ainda não têm preço`}
                          , por isso a soma dos serviços está incompleta — o que aparece nos totais
                          conta só as {contagem.comPreco} que têm.
                        </span>
                      </p>
                    )}

                    {/* ── AS DUAS VERSÕES, SEM SEREM DUAS PROPOSTAS ──────────
                      Assim que uma linha é marcada como extra, esta proposta
                      passa a responder ao "e sem isso, quanto fica?" — e o PDF
                      leva os dois números. É de propósito que só o total com
                      extras é escrito à mão: o outro é a subtracção, e dois
                      números escritos podiam discordar no dia em que ela
                      corrigisse só um. */}
                    {(() => {
                      // Sem segundo argumento: a base sai do próprio documento, e é a
                      // mesma leitura que o PDF faz. Passar `totalAmount` cru dava a
                      // base em «acrescer» e o BRUTO em «IVA incluído» — o ecrã e o
                      // documento a discordarem sobre o mesmo casamento.
                      const v = totaisDasVersoes(doc as ProposalDoc);
                      if (!v) return null;
                      return (
                        <div className="mt-1 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2.5">
                          {/* O IMPACTO, na frase que ela pediu: quantos estão
                            marcados, e quanto vale a proposta com eles. */}
                          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                            {`${v.linhasExtra} ${v.linhasExtra === 1 ? "item marcado" : "itens marcados"} como extra · versão com extras: `}
                            <strong className="font-semibold text-[var(--bo-text)]">
                              {eur(v.comoOTotal.comExtras)}
                            </strong>
                            {" · versão base: "}
                            <strong className="font-semibold text-[var(--bo-text)]">
                              {eur(v.comoOTotal.base)}
                            </strong>
                          </p>
                          {v.extrasSemPreco > 0 && (
                            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--bo-aviso)]">
                              {v.extrasSemPreco === 1
                                ? "Um dos extras não tem preço, por isso não desce da versão base — e enquanto assim for o PDF não mostra o segundo valor."
                                : `${v.extrasSemPreco} extras não têm preço, por isso não descem da versão base — e enquanto assim for o PDF não mostra o segundo valor.`}
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-1 @min-[26rem]:grid-cols-2 gap-4">
                    {/* ── «LADO A LADO» É UMA PERGUNTA DE CONTENTOR ───────────
                      Era `xl:` — 1280 de JANELA —, e a janela não sabe nada
                      desta caixa: ela é METADE da coluna de conteúdo, ou seja
                      ~245 px aos 1024 e ~280 aos 1440. Duas colunas de 240 px
                      para um par PT/EN não é «lado a lado», é dois campos
                      apertados um contra o outro.

                      Sem ponto de corte nenhum: cada caixa pede a largura de
                      que precisa (14 rem a portuguesa, as 12 rem que a
                      `CaixaInglesa` já pede em `aoLado`) e o `flex-wrap`
                      põe-nas na mesma linha exactamente onde as duas cabem —
                      que é a primeira das respostas que o
                      `Cortes.contrato.test.ts` manda dar quando a pergunta é
                      sobre o contentor. */}
                    <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                      <Field
                        containerClassName="min-w-0 grow basis-[14rem]"
                        label="Nome do total no PDF"
                        value={doc.totalLabel ?? ""}
                        onChange={(e) => patch({ totalLabel: e.target.value })}
                        data-campo="totalLabel"
                        placeholder="Valor Total Decoração"
                      />
                      {/* «Valor Total Decoração» já sai «Decoration Total» por
                        reconhecimento; um rótulo reescrito à mão deixa de ser
                        reconhecido, e é para esse que a caixa existe. */}
                      {caixaDeIngles({ tipo: "totalLabel" }, "Nome do total no PDF", {
                        className: "bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                        placeholder: "Decoration Total",
                      })}
                    </div>
                  </div>

                  {/* Valores adicionais — linhas do orçamento que entram no total
                  (Deslocação, Wedding Coordinator, Tecidos, Mobiliário opção A/B, …).
                  Escrever um valor aqui SOMA-O ao total: ver `definirExtras`. */}
                  <div className="mt-5">
                    <span className="bo-eyebrow">Valores adicionais</span>
                    <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
                      Linhas mostradas na proposta antes do total (ex.: deslocação, coordenação,
                      tecidos). Entram no sinal e no que o casal paga.
                    </p>
                    {/**
                     * A ESCOLHA QUE VALE DINHEIRO, FEITA À VISTA.
                     *
                     * Palavras dela, sobre uma proposta já enviada: «aparece
                     * "Subtotal dos serviços 2.860" e depois "+140 de
                     * deslocação". Está mal, porque nós tínhamos dito três mil
                     * MAIS cento e quarenta, e depois mais o IVA.»
                     *
                     * As duas leituras são legítimas e a diferença é o que o
                     * casal paga, por isso escolhe-se aqui, por proposta, e a
                     * frase por baixo diz o que cada uma faz aos números que
                     * estão neste ecrã. Uma proposta antiga não muda: nasceu
                     * sem este campo e continua a ler-se como foi enviada.
                     */}
                    <div className="mb-3 flex flex-col gap-1.5">
                      {/* ── A EXPLICAÇÃO SAIU DE DENTRO DO `<option>` ─────────
                        MEDIDO a 375 px: a opção mais comprida — «é só dos
                        serviços, estas linhas somam-se» — precisa de 231 px de
                        letra numa caixa cujo texto tem 261 px de largura útil,
                        mas o `<select>` do iOS reserva ainda a seta e as
                        margens, e um `<option>` NÃO QUEBRA LINHA: a frase saía
                        cortada a meio, e o que se lia era «é só dos serviços,
                        estas linh…». Uma escolha que vale dinheiro não pode
                        ler-se por metade.

                        As opções passam a nomear o modo em duas ou três
                        palavras, e a explicação — que é uma frase, e as frases
                        pertencem ao texto corrido — desce para debaixo do
                        campo, onde pode quebrar à vontade e onde já estavam os
                        números que ela confere.

                        Texto visível num `span` e nome acessível no próprio
                        `select`, em vez de um `label` com as palavras «Valor
                        (sem IVA)» lá dentro: essas são as palavras do CAMPO do
                        total, e um segundo elemento a dizê-las tornava a
                        procura por etiqueta ambígua. Dezanove testes do
                        estúdio deixaram de encontrar o campo do preço por
                        causa disso. A frase de apoio aqui em baixo pode
                        dizê-las — é um `<p>`, e `findByLabelText` não lê
                        parágrafos. */}
                      <span
                        aria-hidden="true"
                        className="text-[9px] tracking-[0.2em] uppercase text-foreground/25"
                      >
                        Como entram no total
                      </span>
                      <select
                        id="adicionais-modo"
                        aria-label="Como contam os valores adicionais no preço final"
                        className="bo-input alvo-toque px-2.5 py-2 text-xs"
                        value={doc.budgetExtrasSomam ? "somam" : "dentro"}
                        onChange={(e) => trocarModoDosAdicionais(e.target.value === "somam")}
                      >
                        <option value="dentro">Já incluídas no valor</option>
                        <option value="somam">Somam ao valor</option>
                      </select>
                      <p className="text-xs leading-relaxed text-foreground/45">
                        {doc.budgetExtrasSomam ? (
                          <>
                            O valor que escreveste em «Valor (sem IVA)» é só dos serviços, e estas
                            linhas somam-se a ele. Subtotal dos serviços{" "}
                            <strong className="font-semibold">{eur(totais.servicos)}</strong>, mais{" "}
                            {eur(totais.adicionais)} destas linhas, dá {eur(totais.total)} sem IVA e{" "}
                            {eur(totais.aPagar)} a pagar.
                          </>
                        ) : (
                          <>
                            O valor que escreveste em «Valor (sem IVA)» já inclui estas linhas: o
                            subtotal dos serviços fica{" "}
                            <strong className="font-semibold">{eur(totais.servicos)}</strong> e o
                            total sem IVA continua {eur(totais.total)}.
                          </>
                        )}
                      </p>
                    </div>
                    <div className="@container flex flex-col gap-2">
                      {/* Os rótulos das colunas escondem-se onde as colunas não
                        existem: abaixo do limiar a linha passa a ser duas filas,
                        e um cabeçalho de quatro colunas por cima disso seria
                        uma legenda para uma grelha que não está lá.

                        O limiar é a largura DESTA lista e não a da janela. Era
                        `sm:` (640 de janela) e a janela não sabe nada desta
                        caixa: aos 1024 a coluna de conteúdo cai para 504 px e a
                        caixa da descrição — que é onde ela escreve o texto que
                        o casal lê — fica com 196 depois das duas colunas fixas
                        (7 rem + 9 rem) e do botão. O cabeçalho e a linha lêem o
                        MESMO limiar: separá-los é o que dá parágrafos a meia
                        largura numa grelha de uma coluna. */}
                      <div className="hidden @min-[26rem]:grid grid-cols-[minmax(0,1fr)_7rem_9rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
                        <span>Descrição</span>
                        <span className="text-right">Valor (€)</span>
                        <span>IVA da linha</span>
                        <span className="w-5" />
                      </div>
                      {extrasAVista.map((ex, i) => {
                        const modo = modoDoAdicional(
                          ex.valueText ?? "",
                          doc.vatRate ?? DEFAULT_VAT_RATE,
                        );
                        const numero = normalizarValor(ex.valueText);
                        return (
                          <div
                            key={i}
                            /**
                             * ── A CAIXA DA DESCRIÇÃO COM 22 px ────────────────
                             *
                             * Medido a 375 px: as duas colunas fixas (7rem do
                             * valor + 9rem do IVA) mais a coluna do botão comem
                             * a largura toda, e ao `minmax(0,1fr)` da descrição
                             * sobravam 22 px, uma caixa onde não cabe uma
                             * palavra, no campo que dá nome à linha que o casal
                             * vai ler.
                             *
                             * Abaixo de 26 rem DE LISTA (e não de janela) a linha
                             * passa a duas filas: a descrição sozinha em cima, e o
                             * valor, o IVA e o botão de apagar por baixo. Acima
                             * disso fica exactamente como estava.
                             */
                            className="grid grid-cols-[minmax(0,1fr)_auto] @min-[26rem]:grid-cols-[minmax(0,1fr)_7rem_9rem_auto] items-center gap-2"
                          >
                            {/* Um invólucro só para as duas caixas ficarem uma por
                              cima da outra DENTRO da primeira coluna — a linha é
                              uma grelha, e um filho solto abriria uma coluna
                              nova em vez de descer. */}
                            <div className="col-span-2 min-w-0 @min-[26rem]:col-span-1">
                              <input
                                className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
                                value={ex.label}
                                onChange={(e) => updateBudgetExtra(i, { label: e.target.value })}
                                data-campo={`extraRotulo:${i}`}
                                placeholder="Deslocação da equipa Líquen"
                                aria-label="Descrição da linha adicional"
                              />
                              {!soLinhaPorEscrever &&
                                caixaDeIngles(
                                  { tipo: "extraRotulo", i },
                                  "Descrição da linha adicional",
                                  {
                                    className:
                                      "bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                                    placeholder: "Líquen team travel",
                                    // EMPILHADA: esta já vive numa célula estreita
                                    // de uma grelha de dois (o rótulo à esquerda, o
                                    // valor à direita). Parti-la outra vez ao meio
                                    // dava duas caixas onde não cabe «Deslocação».
                                    empilhada: true,
                                  },
                                )}
                            </div>
                            {/* ── UM CAMPO DE DINHEIRO, NÃO UM CAMPO DE TEXTO ──
                              Chamava-se «Valor (texto)» e aceitava o que lhe
                              escrevessem — que é o que se pede a um campo cujo
                              conteúdo é impresso no PDF tal e qual. O preço
                              disso era «1.500» a valer mil e quinhentos ou um e
                              meio conforme quem o lê.

                              Agora entra um NÚMERO («1.500», «1500», «1 500 €»
                              dão os três 1500, por `normalizarValor`) e o «+
                              IVA» — que era a informação que vinha escondida no
                              texto — passou a ser o selector ao lado. O que se
                              grava continua a ser a frase que o PDF imprime;
                              ver `textoDoAdicional`.

                              `defaultValue` + `onBlur`, como no preço da linha:
                              normalizar a cada tecla apagava o que ela estava a
                              escrever a meio. O `key` traz o valor gravado de
                              volta ao campo quando ele muda por outra via (o
                              selector do IVA, a deslocação calculada, o anular). */}
                            <input
                              key={`${i}:${ex.valueText}`}
                              className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] text-right"
                              defaultValue={numero === null ? (ex.valueText ?? "") : String(numero)}
                              onBlur={(e) => definirValorDoAdicional(i, e.target.value)}
                              placeholder="896"
                              inputMode="decimal"
                              aria-label={`Valor de ${ex.label?.trim() || "linha adicional sem nome"}`}
                            />
                            <select
                              className="bo-input px-2 py-2 text-xs text-[var(--bo-tinta-72)]"
                              value={modo}
                              onChange={(e) =>
                                definirIvaDoAdicional(i, e.target.value as ModoDeIvaDoAdicional)
                              }
                              aria-label={`IVA de ${ex.label?.trim() || "linha adicional sem nome"}`}
                            >
                              <option value="documento">Como o total</option>
                              <option value="acrescer">+ IVA</option>
                              <option value="incluido">IVA incluído</option>
                            </select>
                            {soLinhaPorEscrever ? (
                              // A linha ainda não existe: não há o que remover.
                              // A célula fica, para a grelha não mudar de forma.
                              <span className="w-5" aria-hidden="true" />
                            ) : (
                              <button
                                type="button"
                                className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                                onClick={() => removeBudgetExtra(i)}
                                aria-label="Remover linha adicional"
                              >
                                ×
                              </button>
                            )}
                            {/* O que fica escrito na proposta, à letra. É a única
                              forma de ela ver que «1500» e «+ IVA» viram
                              «1 500,00 € + IVA» no papel — e de um texto livre
                              antigo («a definir») se ver que continua lá. */}
                            {(ex.valueText ?? "").trim() !== "" && (
                              <span className="col-span-full pl-1 text-[10px] text-foreground/35">
                                {`No PDF: ${ex.valueText}`}
                              </span>
                            )}
                            {/* O artigo do Moloni deste valor (5/11) — só quando
                              tem um número, que é quando entra no total. */}
                            {!soLinhaPorEscrever && /\d/.test(ex.valueText ?? "") && (
                              <label className="col-span-full flex items-center gap-2 pl-1 text-[11px] text-[var(--bo-text-muted)]">
                                <span className="shrink-0">Artigo do Moloni</span>
                                <select
                                  value={artigoDoAdicional(ex) ?? ""}
                                  onChange={(e) =>
                                    updateExtraArtigo(
                                      i,
                                      eArtigo(e.target.value) ? e.target.value : null,
                                    )
                                  }
                                  data-campo={`extraArtigo:${i}`}
                                  aria-label={`Artigo do Moloni de ${ex.label?.trim() || "linha adicional sem nome"}`}
                                  className={`bo-input w-auto min-w-0 max-w-full px-2 py-1 text-[11px] ${
                                    artigoDoAdicional(ex)
                                      ? "text-[var(--bo-tinta-72)]"
                                      : "border-dashed text-[var(--bo-text-muted)]"
                                  }`}
                                >
                                  <option value="">Escolher…</option>
                                  {ARTIGOS.map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.nome} · {a.ref}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                        onClick={addBudgetExtra}
                      >
                        + Adicionar valor adicional
                      </button>
                      {/* O «Somado ao total: X» que aqui estava saiu para o bloco
                        de totais, onde é a linha «Valores adicionais». A conta
                        continua à vista — deixou é de ser a terceira soma
                        diferente no mesmo ecrã. */}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="@container flex flex-col gap-2 mb-3">
                    {/* Os cabeçalhos só a partir das 26 rem DESTA lista: abaixo
                      disso a linha passa a duas filas, e três títulos por cima
                      de duas filas nomeiam colunas que ali não existem.

                      Era `sm:` — 640 de JANELA —, e a fila quebra por CAIXA:
                      aos 1024 a coluna de conteúdo tem 504 px e não 975. O
                      cabeçalho e a linha partilham o limiar de propósito. */}
                    <div className="hidden grid-cols-[minmax(0,1fr)_10rem_auto] gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25 @min-[26rem]:grid">
                      <span>Item</span>
                      <span className="text-right">Valor</span>
                      <span className="w-5" />
                    </div>
                    {(doc.budgetRows ?? []).map((r, i) => (
                      <div
                        key={i}
                        /* ── A DESCRIÇÃO SOZINHA EM CIMA, NO TELEMÓVEL ──────────
                         Do registo do audit: «a descrição da linha fica com 122
                         px numa grelha que não tem variante de telemóvel».

                         MEDIDO a 390 px: as duas colunas fixas (160 do valor,
                         ~20 do botão) mais os espaços comem 196 dos 318 px da
                         fila. É o irmão mais sortudo do nome da linha do
                         orçamento de Decoração — dá para ler três palavras em
                         vez de uma — mas é a mesma omissão no mesmo ecrã.

                         O desenho é o que as linhas adicionais aqui em cima já
                         fazem: a descrição a ocupar a fila toda, e o valor mais
                         o botão de apagar por baixo. Acima das 26 rem de lista
                         fica exactamente como estava. */
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 @min-[26rem]:grid-cols-[minmax(0,1fr)_10rem_auto]"
                      >
                        <input
                          className="bo-input col-span-2 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] @min-[26rem]:col-span-1"
                          value={r.item}
                          onChange={(e) => updateBudgetRow(i, { item: e.target.value })}
                          placeholder="Coordenação do dia"
                          aria-label="Item"
                          data-campo={chaveDoCampo({ tipo: "linhaEstimada", i })}
                        />
                        <input
                          className="bo-input px-2.5 py-2 text-xs text-[var(--bo-tinta-72)] text-right"
                          value={r.price}
                          onChange={(e) => updateBudgetRow(i, { price: e.target.value })}
                          placeholder="1.500,00 €"
                          aria-label="Valor"
                        />
                        <button
                          type="button"
                          className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                          onClick={() => removeBudgetRow(i)}
                          aria-label="Remover linha"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                      onClick={addBudgetRow}
                    >
                      + Adicionar linha
                    </button>
                  </div>
                  {/* O par PT/EN numa linha só quando as duas caixas cabem — ver
                    `aoLado`, em `CaixaInglesa`.

                    Era `xl:` (1280 de JANELA) e o que manda é a largura desta
                    caixa: com o painel «O que vai sair» aberto ela tem 560 px
                    aos 1440, e uma nota de orçamento repartida em duas colunas
                    de 274 px não é «lado a lado». Sem ponto de corte nenhum:
                    20 rem de base para a portuguesa (é um `textarea` de prosa),
                    as 12 rem que a inglesa já pede, e o `flex-wrap` decide. */}
                  <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                    <Field
                      containerClassName="min-w-0 grow basis-[20rem]"
                      as="textarea"
                      label="Nota do orçamento"
                      rows={2}
                      className="resize-none"
                      value={doc.budgetNote ?? ""}
                      onChange={(e) => patch({ budgetNote: e.target.value })}
                      data-campo="budgetNote"
                      placeholder="Os valores são estimativas e podem ser ajustados…"
                    />
                    {caixaDeIngles({ tipo: "budgetNote" }, "Nota do orçamento", {
                      className: `${INPUT_SM} w-full resize-none leading-relaxed`,
                      as: "textarea",
                      rows: 2,
                    })}
                  </div>
                </>
              )}
              {/* ── O RESUMO, COLADO ÀS LINHAS (Fase 2, 10/11) ─────────────
                O que estas linhas dão, logo por baixo delas: ela escreve um
                valor e vê o total a pagar, o sinal e o saldo sem descer ao
                «Total e validade». Só leitura — os números são os MESMOS
                `totais` do bloco «Totais» lá em baixo (a mesma chamada que
                o PDF faz); mudar o sinal continua a ser lá. */}
              {money.gross > 0 && (
                <ResumoDasLinhas
                  totais={totais}
                  pctSinal={pctSinal}
                  onMudar={() => irParaAFalta("total")}
                />
              )}
            </Section>

            {/* Total, IVA e validade — fonte de verdade do dinheiro. O valor + o modo
          de IVA eliminam a ambiguidade "3.000,00 €" (com IVA?) vs "+ IVA"; o
          texto do PDF é composto a partir daqui. */}
            <Section
              title="Total e validade"
              id="total"
              escondida={step !== "orcamento"}
              rodape={notaDaSeccao("total", "Nota sobre o total")}
            >
              <div className="grid grid-cols-1 @min-[26rem]:grid-cols-2 gap-4">
                {/**
                 * ── «HÁ UM NÚMERO SÓ» ERA MENTIRA, E CUSTOU-LHE UMA TARDE ─────
                 *
                 * Palavras dela: «sempre que vou à proposta os valores estão
                 * diferentes; não estão iguais àquilo que nós colocamos».
                 *
                 * Estava aqui. Esta frase prometia que este campo e o «Preço
                 * final» do pedido eram o mesmo número — e não são, sempre que
                 * há adicionais a somar. O pedido guarda o que o casal PAGA
                 * (serviços + deslocação); este campo é só os SERVIÇOS, porque a
                 * deslocação tem linha própria logo abaixo e somá-la aqui era
                 * contá-la duas vezes na mesma folha.
                 *
                 * Ela escrevia 3.000 na Gestão do pedido e o estúdio mostrava
                 * 2.860. Escrevia 3.000 aqui e a Gestão mostrava 3.140. Os dois
                 * números estavam certos; o ecrã é que jurava que eram um só.
                 *
                 * A aritmética não muda — mudaria o significado de um campo de
                 * dinheiro de que saem o sinal, a factura e o PDF. O que muda é
                 * o ecrã passar a dizer a verdade, com os DOIS números à vista
                 * para ela poder conferir num relance.
                 */}
                {(() => {
                  const degrau = degrauDosAdicionais(doc as unknown as ContextoDoPreco);
                  if (!(degrau > 0)) {
                    return (
                      <p className="text-xs leading-relaxed text-foreground/50 @min-[26rem]:col-span-2">
                        É o mesmo valor do <strong className="font-semibold">Preço final</strong> do
                        pedido — escrever aqui altera-o lá, e alterá-lo lá aparece aqui. Há um
                        número só.
                      </p>
                    );
                  }
                  // `money.base` já traz os adicionais somados (ver
                  // `dinheiroDaProposta`) — é o EFECTIVO, o que o pedido guarda.
                  // A parte dos serviços é a do resolvedor cru. Escrever aqui
                  // `money.base` somava a deslocação uma segunda vez e a nota
                  // dizia 3140 + 140 = 3280 a alguém que tem 3000 de serviços.
                  const efectivo = money.base;
                  const servicos = round2(efectivo - degrau);
                  return (
                    <p className="text-xs leading-relaxed text-[var(--bo-text-muted)] @min-[26rem]:col-span-2">
                      Este campo é <strong className="font-semibold">só os serviços</strong>. O{" "}
                      <strong className="font-semibold">Preço final</strong> do pedido mostra outro
                      número, porque leva também os adicionais:{" "}
                      <strong className="font-semibold tabular-nums">{eur(servicos)}</strong> +{" "}
                      <span className="tabular-nums">{eur(degrau)}</span> de adicionais ={" "}
                      <strong className="font-semibold tabular-nums">{eur(efectivo)}</strong>.
                      Escrever aqui altera-o lá, e alterá-lo lá aparece aqui — mas os dois ecrãs
                      mostram números diferentes, e é assim de propósito.
                    </p>
                  );
                })()}
                <Field
                  // Sempre a base: é o que o pedido guarda, e é o que o rótulo
                  // "(sem IVA)" da Gestão do pedido promete. O modo de IVA muda o
                  // que o cliente vê, não o significado deste campo.
                  label="Valor (sem IVA)"
                  inputMode="decimal"
                  value={totalInput}
                  // Com serviços com preço, o total é a SOMA deles (e dos
                  // adicionais) e não se escreve à mão — ver `somarOTotal`.
                  // Só fica aberto numa proposta antiga desalinhada, onde o
                  // «Usar …» aqui em baixo é o gesto que o arruma.
                  readOnly={contagem.comPreco > 0 && !desvio}
                  onChange={(e) => {
                    confirmado("totalAmount");
                    onTotalInput(e.target.value);
                  }}
                  placeholder="3000"
                  data-campo="totalAmount"
                  containerClassName={realce("totalAmount")}
                  error={erroDoTotal ?? undefined}
                  hint={
                    desvio
                      ? `Escrito à mão — a soma dos serviços com preço é ${eur(desvio.soma)}`
                      : contagem.comPreco > 0
                        ? !(doc.budgetExtras ?? []).some(
                            (e) => normalizarValor(e.valueText) !== null,
                          )
                          ? "Soma automática dos serviços."
                          : doc.budgetExtrasSomam
                            ? "Soma automática dos serviços. Os valores adicionais somam-se por cima."
                            : "Soma automática dos serviços e dos valores adicionais."
                        : undefined
                  }
                />
                {/* O aviso e o atalho para o corrigir andam juntos: dizer que está
                errado sem dar o gesto que o arruma é meio trabalho. */}
                {desvio && (
                  <div className="@min-[26rem]:col-span-2 -mt-1 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2">
                    <span className="text-xs text-[var(--bo-tinta-72)]">
                      O total está escrito à mão e difere da soma das linhas em{" "}
                      <strong className="font-semibold">{eur(Math.abs(desvio.diferenca))}</strong>.
                    </span>
                    {/**
                     * O BOTÃO ESCREVE A SOMA COM OS ADICIONAIS, e não a soma das
                     * linhas que está escrita ao lado.
                     *
                     * O campo onde ele escreve é o TOTAL, e o total desta casa
                     * inclui os valores adicionais — é o que o `definirExtras`
                     * faz quando se acrescenta uma deslocação, e é o que o PDF
                     * confirma ao subtrai-los para imprimir a linha «Valor
                     * Total». Escrever aqui a soma dos serviços apagava a
                     * deslocação do preço final e, com ela, do sinal e da
                     * factura que sai a seguir.
                     *
                     * E por isso o rótulo mostra o número que vai mesmo ser
                     * escrito: um botão que diz 75 € e escreve 2460 € é pior do
                     * que não haver botão nenhum.
                     *
                     * ── E PERGUNTA ANTES DE ESCREVER ─────────────────────────
                     * Palavras dela: «é um botão perigoso». Escrevia o número
                     * novo por cima do preço final — o valor de que saem a
                     * fatura, o sinal e o saldo — sem mostrar o que ia
                     * desaparecer. A pergunta traz OS DOIS, e depois de aplicada
                     * ficam dez segundos para a anular. Ver
                     * `pedirConfirmacaoDeDinheiro`.
                     */}
                    <button
                      type="button"
                      className={`alvo-toque -my-1 py-2 text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                      onClick={() =>
                        pedirConfirmacaoDeDinheiro({
                          oQue: "o total",
                          de: escrito.base,
                          para: desvio.sugerido,
                          registo: `Total alinhado com a soma das linhas no estúdio: preço final de ${eur(escrito.base)} para ${eur(desvio.sugerido)}.`,
                          motivo: "Total alinhado com a soma das linhas.",
                          aplicar: () => {
                            confirmado("totalAmount");
                            onTotalInput(textoDoTotal(desvio.sugerido));
                          },
                        })
                      }
                    >
                      Usar {eur(desvio.sugerido)}
                    </button>
                  </div>
                )}
                {/* ══════════════════════════════════════════════════════════════
                  SÓ HÁ UMA MANEIRA DE CONTAR O IVA: ACRESCE
                  ══════════════════════════════════════════════════════════════

                  Palavras dela: «retira com o IVA incluído. É apenas com o
                  valor sem IVA mais o IVA acresce».

                  Eram duas opções lado a lado, para escolher. A escolha não
                  valia nada — as propostas da casa são todas «valor sem IVA +
                  IVA» — e custava o pior engano que este ecrã pode ter: um
                  toque distraído no cartão errado mudava o que o casal paga
                  SEM mudar o número que ela está a olhar.

                  ── O QUE ISTO NÃO MUDA, E É O QUE INTERESSA ────────────────
                  O campo «Valor (sem IVA)» já mostrava a BASE nos dois modos
                  (`baseDoDoc` → `resolveProposalMoney`). Medido: um documento
                  em «IVA incluído» com 3280 guardado mostra base 2666,67, IVA
                  613,33 e 3280,00 a pagar — exactamente o mesmo que o mesmo
                  documento em «acresce» com base 2666,67. Tirar a opção não
                  mexe em número nenhum: nem no campo, nem no IVA, nem no que o
                  cliente paga, nem nas propostas que já seguiram.

                  Fica a LEITURA, que continua a valer — é onde ela confere que
                  o IVA e o total a pagar são os que espera. O que saiu foi o
                  controlo, não a informação. */}
                <div className="@container flex flex-col gap-1.5">
                  <span className="bo-eyebrow">IVA</span>
                  <div className="rounded-xl border border-[var(--bo-hairline-strong)] px-3 py-2.5 text-[11px]">
                    {/* A leitura é do modo DESTE documento, não do que a casa faz
                      hoje. Uma proposta antiga gravada em «IVA incluído» tem o
                      bruto no `totalAmount`; mostrar-lhe a leitura de «acresce»
                      dizia base 3280 e IVA 754,40 sobre um documento que vale
                      2666,67 e 613,33. Um quadro que mente sobre o dinheiro é
                      pior do que um quadro a menos. */}
                    <span className="block font-medium text-[var(--bo-tinta-72)]">
                      {vatMode === "acrescer" ? "+ IVA (acresce)" : "IVA incluído"}
                    </span>
                    {money.base > 0 && (
                      <>
                        <span className="mt-0.5 block text-[var(--bo-text-muted)]">
                          base {eur(duasFormas[vatMode].base)} · IVA {eur(duasFormas[vatMode].iva)}
                        </span>
                        <span className="block text-[var(--bo-text-muted)]">
                          o cliente paga{" "}
                          <strong className="font-semibold text-[var(--bo-text)]">
                            {eur(duasFormas[vatMode].total)}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-foreground/45">
                    {vatMode === "acrescer" ? (
                      "O valor acima é sempre sem IVA, e o PDF mostra-o com o IVA a somar por cima."
                    ) : (
                      /* E não se converte por ela: mudar o modo muda o TEXTO que
                       sai no PDF («3.280,00 €» passa a «2.666,67 € + IVA»).
                       Numa proposta que já seguiu, isso é o documento do casal
                       a deixar de bater certo com o que ele tem em mãos. */
                      <>
                        Esta proposta foi escrita com o IVA já dentro do valor. As novas são todas
                        «sem IVA + IVA acresce»; esta fica como seguiu, para o documento continuar
                        igual ao que o cliente tem.
                      </>
                    )}
                  </p>
                </div>
                <Field
                  label="Validade (dias)"
                  type="number"
                  min={1}
                  value={doc.validUntilDays ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    patch({ validUntilDays: Number.isFinite(n) && n > 0 ? n : undefined });
                  }}
                  // Os dias que a regra do evento dá (ver `diasDeValidadePeloEvento`):
                  // uma proposta para a semana que vem não diz «60».
                  placeholder={String(
                    diasDeValidade({ eventDate: doc.eventDate }, hojeNoEstudio()),
                  )}
                  aria-label="Dias de validade"
                  data-campo="validUntilDays"
                  // ── O ÚLTIMO CAMPO DO PASSO, LOGO ACIMA DA BARRA FIXA ───────
                  // MEDIDO num iPhone SE (375×667), a fechar este campo com o
                  // teclado aberto (~260 px): o teclado mais a barra de acção
                  // fixa tapavam-lhe uma fatia. O `scroll-margin-bottom` sozinho
                  // não resolve — só entra em jogo se ALGUÉM pedir um scroll, e
                  // um toque para abrir o teclado não pede nenhum. Por isso o
                  // `onFocus`: ao ganhar foco (é aí que o teclado nasce), o
                  // campo centra-se a si próprio no que sobra de ecrã — que já
                  // é o ecrã COM o teclado, porque o foco só chega depois de o
                  // sistema o ter aberto. `scroll-mb-72` (18 px a mais do que os
                  // 260 do teclado) é o cinto e as calças: cobre também quem lá
                  // chega por um caminho que não é este foco (uma hiperligação
                  // com âncora, um leitor de ecrã a saltar directamente).
                  onFocus={(e) => e.currentTarget.scrollIntoView({ block: "center" })}
                  containerClassName="scroll-mb-72"
                  hint={
                    <span className="flex flex-col items-start gap-0.5">
                      {/* A data a que a conta chega — com o evento perto, os
                          dias escritos podem não ser os que saem (ver
                          `diasDeValidade`). Uma data já fixada (proposta que
                          seguiu) tem o seu próprio aviso, mais abaixo. */}
                      {!doc.validUntil && (
                        <span data-testid="validade-calculada">
                          Válida até{" "}
                          {resolveValidUntil(doc as ProposalDoc)
                            .split("-")
                            .reverse()
                            .join("/")}
                          {diaDoEvento(doc.eventDate)
                            ? " — conta com a data do evento."
                            : " — sem data do evento, contam 60 dias."}
                        </span>
                      )}
                      {doc.validUntilDays ? (
                        <button
                          type="button"
                          /* `alvo-toque` + `py-2`: media 18 px de altura. Foi o CI
                           a apanhá-lo e não a máquina de quem escreveu — só
                           aparece quando a proposta tem uma validade diferente da
                           preferida, e os dados locais não a tinham. */
                          className={`alvo-toque -my-1 py-2 text-[11px] text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                          onClick={() => void guardarValidadePadrao(doc.validUntilDays!)}
                        >
                          Passar a usar {doc.validUntilDays} dias em todas as propostas novas
                        </button>
                      ) : null}
                    </span>
                  }
                />
              </div>
              {/* ── A VALIDADE QUE JÁ PASSOU (B1) ─────────────────────────────
                Uma proposta que já seguiu traz a data de validade FIXADA lá
                dentro — é o que faz o anexo do email e o PDF do link dizerem o
                mesmo. Reaberta para reenviar depois dessa data, sairia com uma
                validade que terminou, e é isso que trava o envio. O remédio é
                um gesto: voltar a contar os dias a partir de hoje. */}
              {doc.validUntil && doc.validUntil < hojeNoEstudio() && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                  <span>
                    A validade desta proposta terminou a{" "}
                    {doc.validUntil.split("-").reverse().join("/")}.
                  </span>
                  <button
                    type="button"
                    className={`alvo-toque relative font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                    onClick={() => patch({ validUntil: undefined })}
                  >
                    Contar {diasDeValidade(doc, hojeNoEstudio())} dias a partir de hoje
                  </button>
                </p>
              )}
              {/* ── AS CONDIÇÕES QUE NÃO SAEM (B1) ────────────────────────────
                Não há editor das Condições Gerais no estúdio: são os textos da
                casa, contratuais, e não se escrevem proposta a proposta. Se um
                rascunho as perdeu, a página não sai no PDF — e o remédio é
                repô-las tal como a casa as tem, sem tocar numa palavra. */}
              {!withProposalDefaults(doc).condicoesGerais.some((l) => l.trim()) && (
                <p
                  className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
                  data-campo="condicoesGerais"
                  tabIndex={-1}
                >
                  <span>As Condições Gerais estão vazias e a página não sai no PDF.</span>
                  <button
                    type="button"
                    className={`alvo-toque relative font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                    onClick={() => patch({ condicoesGerais: [...DEFAULT_CONDICOES_GERAIS] })}
                  >
                    Repor as Condições Gerais da casa
                  </button>
                </p>
              )}
              {/* ══════════════════════════════════════════════════════════════
                O BLOCO DE TOTAIS — UM SÓ, PELA ORDEM DO PAPEL
                ══════════════════════════════════════════════════════════════

                Substitui as três somas que apareciam ao mesmo tempo («Soma das
                linhas», «Somado ao total» e o resumo desta caixa) e segue a
                ordem exacta em que o PDF as imprime: subtotal dos serviços →
                valores adicionais → total sem IVA → IVA → total a pagar →
                sinal e saldo.

                Os números NÃO são calculados aqui. Saem de `totais`, que é
                `totaisDaProposta(doc, pctSinal)` — a mesma chamada que
                `proposal-doc-pdf.ts` faz. É essa a razão de este bloco existir
                assim: enquanto o ecrã tivesse a sua conta e o gerador a dele,
                divergiam, e já divergiram (ver `proposal-budget.ts`). */}
              {money.gross > 0 && (
                <div className="mt-5 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
                  <span className="bo-eyebrow">Totais</span>
                  <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
                    <LinhaDeTotal rotulo="Subtotal dos serviços" valor={eur(totais.servicos)} />
                    <LinhaDeTotal rotulo="Valores adicionais" valor={eur(totais.adicionais)} />
                    {/* A régua separa as parcelas dos resultados: é a mesma
                      leitura que a folha em papel dá, e sem ela as seis linhas
                      lêem-se como uma lista em que tudo tem o mesmo peso. */}
                    <LinhaDeTotal rotulo="Total sem IVA" valor={eur(totais.total)} forte regua />
                    <LinhaDeTotal
                      rotulo={`IVA (${Math.round(totais.taxa * 100)}%)`}
                      valor={eur(totais.iva)}
                    />
                    <LinhaDeTotal rotulo="Total a pagar" valor={eur(totais.aPagar)} forte />
                    <LinhaDeTotal
                      regua
                      rotulo={
                        <span className="inline-flex items-center gap-1">
                          Sinal
                          <input
                            type="number"
                            min={1}
                            max={99}
                            value={sinalEscrito ?? pctSinal}
                            onChange={(e) => {
                              // Achado n.º 17: «150» voltava a 30 sem mensagem (o
                              // motor só aceita de 1 a 99). Fica o que ela
                              // escreveu, com a razão por baixo, e só uma
                              // percentagem válida chega ao documento.
                              //
                              // Escrito tecla a tecla, «150» passa por «15», que é
                              // válido: por isso, quando o texto deixa de ser
                              // válido, volta-se ao valor de ANTES de ela começar.
                              const raw = e.target.value;
                              const n = Number.parseInt(raw, 10);
                              if (Number.isFinite(n) && n >= 1 && n <= 99) {
                                setSinalEscrito(null);
                                patch({ depositPercent: n });
                              } else {
                                setSinalEscrito(raw);
                                patch({ depositPercent: sinalAntesRef.current });
                              }
                            }}
                            onFocus={() => {
                              sinalAntesRef.current = pctSinal;
                            }}
                            onBlur={() => setSinalEscrito(null)}
                            aria-label="Percentagem do sinal"
                            aria-invalid={sinalEscrito != null || undefined}
                            aria-describedby={sinalEscrito != null ? "sinal-erro" : undefined}
                            className="bo-input w-16 px-1.5 py-0.5 text-center text-xs"
                          />
                          %
                        </span>
                      }
                      valor={eur(totais.sinal)}
                    />
                    {sinalEscrito != null && (
                      <p
                        id="sinal-erro"
                        role="alert"
                        className="text-[11px] text-[var(--bo-perigo)]"
                      >
                        O sinal é entre 1% e 99%. Fica nos {pctSinal}% enquanto não escreveres
                        outro.
                      </p>
                    )}
                    <LinhaDeTotal rotulo={`Saldo ${100 - pctSinal}%`} valor={eur(totais.saldo)} />
                  </dl>
                  {/* ── A BASE, DITA AQUI TAMBÉM ──────────────────────────────
                    A mesma frase que o PDF imprime no faseamento. Está aqui
                    porque é aqui que ela mexe na percentagem: com o cursor
                    dentro da caixa, «30%» de que é a pergunta óbvia, e a
                    resposta não pode obrigar a abrir o PDF para a confirmar. */}
                  <p className="mt-2.5 text-[11px] leading-relaxed text-foreground/45">
                    Sinal e saldo são calculados sobre o total a pagar ({eur(totais.aPagar)}), com
                    IVA incluído — é essa a base que a factura usa.
                  </p>
                  {/* ── SÓ PARA SI ────────────────────────────────────────────
                    O número que falta para decidir com noção. Os custos
                    escrevem-se no painel interno, aqui em cima; a decisão de
                    baixar (ou não) o preço toma-se AQUI, com o total à frente
                    — e era o único sítio onde a margem não estava. */}
                  <MargemDoNegocio doc={doc as ProposalDoc} />
                  {/* ── QUANDO AS SOMAS NÃO FECHAM ────────────────────────────
                    Por construção fecham sempre. Este aviso é a rede para o dia
                    em que deixarem de fechar — e nesse dia tem de se ver antes
                    de o PDF sair, não depois de o casal perguntar. As frases
                    vêm feitas de `totaisDaProposta`. */}
                  {!totais.fecha && (
                    <ul className="mt-3 flex flex-col gap-1 rounded-xl border border-[var(--bo-perigo)]/35 bg-[var(--bo-perigo)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-perigo)]">
                      {totais.porQueNaoFecha.map((porque) => (
                        <li key={porque}>⚠ As contas não fecham: {porque}.</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Section>

            {/* ── O painel que o cliente nunca vê ────────────────────────────
              Custos, margem, deslocação calculada e o aviso de valor fora do
              habitual. Vive AQUI, no fim do orçamento, porque é aqui que os
              números que ele comenta acabam de ser escritos. */}
            <div hidden={step !== "orcamento"}>
              <PainelInterno
                doc={doc as ProposalDoc}
                quote={quote}
                quotes={quotes}
                totalBruto={money.gross}
                onCusto={(i, custo) =>
                  setDoc((d) => ({
                    ...d,
                    // O array dos custos acompanha sempre o das linhas — se ficasse
                    // mais curto, o índice 3 passava a ser o custo da linha 4.
                    budgetCosts: custosDe(d as ProposalDoc).map((v, j) => (j === i ? custo : v)),
                  }))
                }
                /**
                 * Os quilómetros até ao local ficam no DOCUMENTO, não num estado
                 * do ecrã: é isso que os torna o número desta proposta e que
                 * impede que mudar a sede ou o preço do gasóleo lhes toque depois.
                 *
                 * `null` apaga o campo — «não decidi», e a tabela volta a sugerir.
                 * Escrever 0 aqui seria dizer «é em casa», que é outra coisa.
                 */
                onKm={(km) =>
                  setDoc((d) => {
                    if (km === null) {
                      const { kmDeslocacao: _fora, ...resto } = d;
                      void _fora;
                      return resto;
                    }
                    return { ...d, kmDeslocacao: km };
                  })
                }
                /**
                 * Quantas carrinhas vão — mesma casa e mesma razão que os
                 * quilómetros: é um facto DESTE evento, e fica congelado nele.
                 *
                 * `null` APAGA o campo, e apagado quer dizer uma. Escrever 1 aqui
                 * daria o mesmo preço, mas deixava no documento um número que
                 * ninguém decidiu — e nas propostas antigas a ausência é o que
                 * garante que nenhuma muda de preço por este campo existir.
                 */
                onCarrinhas={(n) =>
                  setDoc((d) => {
                    if (n === null) {
                      const { carrinhasDeslocacao: _fora, ...resto } = d;
                      void _fora;
                      return resto;
                    }
                    return { ...d, carrinhasDeslocacao: n };
                  })
                }
                onDeslocacao={(label, valueText) => {
                  // Se já lá está uma linha de deslocação, actualiza-se essa em
                  // vez de acrescentar uma segunda — duas linhas de deslocação
                  // numa proposta são uma pergunta do cliente ao telefone.
                  //
                  // Passa por `definirExtras` como todas as outras: aceitar a
                  // deslocação calculada tem de somar ao total, ou volta a haver
                  // um valor na proposta que não está no que se cobra.
                  const extras = [...(doc.budgetExtras ?? [])];
                  const i = extras.findIndex((e) => /desloca/i.test(e.label ?? ""));
                  if (i >= 0) extras[i] = { ...extras[i], label, valueText };
                  else extras.push({ label, valueText });
                  /**
                   * ── E PERGUNTA-SE, COM OS DOIS NÚMEROS À VISTA ────────────────
                   * «Pôr nos valores adicionais» é a segunda acção do editor que
                   * muda o preço final de uma só carregada: a deslocação calculada
                   * SOMA-SE ao total, e portanto ao sinal e à fatura. Levava
                   * nenhuma pergunta e nenhuma volta atrás — o mesmo desenho do
                   * «Usar X €», e por isso o mesmo tratamento.
                   */
                  const contexto = { mode: vatMode, vatRate: doc.vatRate };
                  const antes = parseMoneyText(totalInput);
                  const depois = Math.max(
                    0,
                    Math.round(
                      (antes +
                        somaDosExtrasSemIva(extras, contexto) -
                        somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
                        100,
                    ) / 100,
                  );
                  // Sem diferença nenhuma no dinheiro (a mesma deslocação outra
                  // vez) não há nada a confirmar: aplica-se e cala-se.
                  if (Math.abs(depois - antes) <= 0.01) {
                    definirExtras(extras);
                    return;
                  }
                  pedirConfirmacaoDeDinheiro({
                    oQue: "o total",
                    de: antes,
                    para: depois,
                    registo: `Deslocação calculada (${valueText}) posta nos valores adicionais no estúdio: preço final de ${eur(antes)} para ${eur(depois)}.`,
                    motivo: "Deslocação posta nos valores adicionais.",
                    aplicar: () => definirExtras(extras),
                  });
                }}
              />
              {/* A faturação por artigo é do Moloni e não do cliente: veio para
                  aqui, ao pé dos custos e da margem — tudo o que é só para nós
                  num sítio só, DEPOIS do total (pedido dela de 9/11: «uma grande
                  confusão» — estava a meio do que sai no PDF). */}
              {/* ── REPARTIR POR ARTIGO (5/11) ───────────────────────────
                Ela: «ter estes artigos nas propostas». O total sem IVA
                repartido pelos artigos do Moloni — só para ela e para o
                Moloni: não sai no PDF nem na página, e não mexe na versão
                aceite. Ver `RepartoPorArtigo.tsx`. */}
              {isDeco && (
                <div className="mt-3 rounded-2xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-4">
                  <span className="bo-eyebrow">Faturação por artigo</span>
                  <p className="mt-1.5 mb-3 text-xs leading-relaxed text-foreground/45">
                    O sinal e o saldo de cada artigo do Moloni, feitos a partir das linhas. Não
                    aparece na proposta do cliente.
                  </p>
                  <RepartoPorArtigo
                    doc={doc as ProposalDoc}
                    pct={pctSinal}
                    permitirManual={false}
                    aoMudar={(reparto) =>
                      setDoc((d) => ({ ...d, repartoPorArtigo: reparto }) as StudioDoc)
                    }
                  />
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════════
              AS PÁGINAS LADO A LADO — NO FIM, E SEM SE PEDIR
              ══════════════════════════════════════════════════════════════

              Palavras dela: «eu quero que apareça isto automaticamente no
              final sem pedirmos ou carregarmos para ver».

              Estava atrás de um botão («Ver as páginas lado a lado»), e o
              botão só existia com mais do que um mood board. Duas condições
              para ver o documento inteiro, e a segunda não fazia sentido
              nenhuma desde que esta vista deixou de ser dos mood boards e
              passou a ser da PROPOSTA: a capa, a apresentação, o orçamento,
              as condições e a contracapa existem com um board ou com zero.

              Fica no FIM da coluna onde ela escreve, que é onde a pergunta
              nasce — acabei, como é que isto ficou? Estava em cima, antes de
              tudo o que a responde.

              ── PORQUE É QUE ESTÁ AQUI E NÃO UM NÍVEL ACIMA ────────────────
              O passo 1 é uma FILA (`lg:flex`): o índice, esta coluna e o
              painel «O que vai sair». Um quarto filho ali seria uma quarta
              COLUNA, e as folhas lado a lado espremidas numa coluna deixam de
              se poder comparar — que é a única coisa que esta vista serve.
              Último filho da coluna de escrita é a largura toda, e é a mesma
              que ela já tinha quando estava em cima.

              ── E PORQUE É QUE NÃO LEVA `content-visibility` ──────────────
              Foi a primeira ideia — saltar o desenho enquanto ela não chega cá
              abaixo. Mas o `Paineis.contrato.test.ts` proíbe escrevê-lo à mão
              numa página, e tem razão medida: quem o usa tem de reservar a
              altura certa, e uma reserva errada faz a página encolher debaixo
              do dedo na primeira descida (576 px medidos em `/servicos`). O
              molde da casa, `.cv-panel`, FIXA a altura a `--cv-h` — serve
              bandas de altura conhecida, e esta vista tem tantas folhas quantas
              a proposta tiver. Fixá-la era cortá-la.

              Fica sem optimização nenhuma, que é o estado honesto: se algum dia
              pesar, mede-se primeiro. */}
            <div className="mt-6" hidden={step !== "inspiracao"}>
              <VistaAdiada
                // ADIADO (10/11): as folhas acompanham o que se escreve logo a
                // seguir, sem a letra ter de esperar por elas.
                doc={doc as ProposalDoc}
                fotosDoPdf={fotosDoPdf}
                onMudarFoto={vistaMudarFoto}
                ordem={ordemDosBoards}
                idioma={idiomaDoPdf}
                urls={assetUrls}
                originais={assetOriginais}
                aspetos={aspetosDasFotos}
                onMover={vistaMover}
                onSaltar={vistaSaltar}
                // O salto de uma folha de texto usa o MESMO caminho da
                // Conferência: abre a secção se estiver dobrada e só então
                // leva a vista. Uma segunda maneira de saltar era uma segunda
                // maneira de falhar a abertura da dobra.
                onIrParaSeccao={vistaIrParaSeccao}
              />
            </div>
          </div>
          {/*
           * ── A TERCEIRA ZONA ──────────────────────────────────────────────
           *
           * «Uma pré-visualização grande e fixa à direita, no espaço hoje
           * vazio.» O índice diz onde estou, a coluna do meio é o que escrevo, e
           * isto é o que vai sair. Ver `PainelDoEstudio` para o resto das razões
           * — em particular por que é um painel só e por que só aparece muito
           * largo.
           */}
          <PainelAdiado
            cabe={painelLateralCabe}
            paginas={paginasParaOPainel}
            activa={boardActivo ?? undefined}
            seccao={aVista.seccao}
            urls={assetUrls}
            originais={assetOriginais}
            aspetos={aspetosDasFotos}
            doc={doc as ProposalDoc}
            onSaltar={painelSaltar}
            onEscolherFotos={painelEscolherFotos}
            quoteId={quote.id}
            idioma={idiomaDoPdf}
          />
        </div>
      </div>
      {/* ══════════ /PASSOS 1 a 4 ══════════ */}

      {/* ══════════ PASSO 5 · Rever e enviar — «Está pronta?», LOGO EM CIMA ══════════
          Decisão dela a 10/11 (o plano de 9/11, fase 5): primeiro o que falta
          — a Conferência, as fotografias em falta, as gralhas, o que ficou por
          traduzir —, depois ver o PDF final, depois o resumo e o email, e só
          no fim por onde segue. Substitui a ordem de 14/10, em que «Por onde
          segue» vinha em cima: ela escolheu «Está pronta?» primeiro. */}
      <EstaPronta
        aoSaberQueFaltam={aoSaberQueFaltam}
        busy={busy}
        canal={canal}
        confirmarPdfVisto={confirmarPdfVisto}
        doc={doc}
        fotosPorConfirmar={fotosPorConfirmar}
        idiomaDoPdf={idiomaDoPdf}
        irParaAFalta={irParaAFalta}
        irParaCampo={irParaCampo}
        money={money}
        pdfConfirmado={pdfConfirmado}
        pdfVisto={pdfVisto}
        pdfVistoAgora={pdfVistoAgora}
        preview={preview}
        quote={quote}
        quotes={quotes}
        sent={sent}
        setDoc={setDoc}
        setEscolhidasQueFaltam={setEscolhidasQueFaltam}
        step={step}
        temErros={temErros}
        toast={toast}
      />

      {/* ══════════ PASSO 5 · Rever e enviar — o resumo, montado só aqui ══════════ */}
      {/* Only mount the preview while it's the active step. It was previously
          kept mounted (just `hidden`), so its filter/map over every service
          group + budget line re-ran on EVERY keystroke in the content step —
          the main source of typing lag on large proposals. */}
      {step === "enviar" && (
        // Este monta de raiz (ver o comentário aqui em cima), portanto a
        // `.view-in` corre sozinha na montagem — não precisa de sair e voltar.
        <div className="view-in">
          <PreviewSummary
            doc={doc}
            assetUrls={assetUrls}
            assetOriginais={assetOriginais}
            assetMedias={assetMedias}
            money={money}
            split={split}
            pctSinal={pctSinal}
          />
          <CustoDaGeracao fotos={totalDeFotos} amostras={amostras} />
        </div>
      )}

      {/* ══════════ PASSO 5 · Rever e enviar — o envio ══════════ */}
      <EnviarAoCliente
        amostras={amostras}
        assuntoDoEmail={assuntoDoEmail}
        bytesDoPdf={bytesDoPdf}
        canal={canal}
        corpoDoEmail={corpoDoEmail}
        doc={doc}
        idiomaDoPdf={idiomaDoPdf}
        inserirParagrafoDoQueMudou={inserirParagrafoDoQueMudou}
        passoDoEnvio={passoDoEnvio}
        patch={patch}
        quote={quote}
        restaurarVersao={restaurarVersao}
        resumoParaCopiar={resumoParaCopiar}
        sent={sent}
        setAssuntoDoEmail={setAssuntoDoEmail}
        setConfirmSend={setConfirmSend}
        setCorpoDoEmail={setCorpoDoEmail}
        setModeloDoEmail={setModeloDoEmail}
        setSent={setSent}
        step={step}
        totalDeFotos={totalDeFotos}
      />

      {/* ══════════ PASSO 5 · Rever e enviar — por onde segue, NO FIM (10/11) ══════════
          Até 10/11 vinha logo em cima, por um pedido dela de 14/10 que o
          comentário de baixo conta; a 10/11 ela escolheu «Está pronta?»
          primeiro, e este passou para depois do email.
          Palavras dela, a 14/10, com a captura deste bloco: «coloca isto em
          cima para se ver logo no início e coloca o logo do email e do
          WhatsApp». Estava a meio do passo, depois do resumo inteiro — a
          primeira escolha do envio era a última coisa que se via. Sempre
          montado e escondido como o envio aqui em baixo, para o salto de
          «Falta o email» (`#seccao-envio`) ter onde cair. */}
      <PorOndeSegue
        canal={canal}
        emailDoCliente={emailDoCliente}
        escolherCanal={escolherCanal}
        sent={sent}
        step={step}
      />

      {/* Ação principal — muda conforme o passo, para haver sempre UMA próxima
          ação óbvia. */}
      <div
        ref={barraDeBaixo}
        // `z-20` não é enfeite: sem ele os cartões das secções — que criam o seu
        // próprio contexto de empilhamento — desenham-se POR CIMA desta barra, e o
        // texto do total aparecia misturado com o do campo por baixo. Vê-se na
        // captura de ecrã antes desta linha existir; nenhum teste apanhava.
        /* A barra encosta ao fundo do CONTEÚDO, mas por baixo dela ainda vem a
           barra de navegação do back office (56 px, fixa, só abaixo de `lg`).
           Com `bottom-0` a acção principal — "Pré-visualizar", "Enviar" —
           ficava por baixo dela: tocar ali tocava na navegação e mudava de
           vista. Foi o cheque de oclusão a apanhá-lo; à vista não se distingue
           de um toque que não pegou.
           A partir de `lg` a navegação passa a barra lateral e a folga deixa de
           fazer sentido. */
        /* Esta barra pousa EM CIMA da barra de destinos do telemóvel, portanto
           a sua distância ao fundo é a altura dessa barra — que passou a viver
           no token `--bo-barra-inferior`. Era a quarta cópia do «56px», e com a
           barra a crescer para 72 px ficava a tapá-la. `lg:bottom-0` porque
           acima de 1024 não há barra nenhuma por baixo. */
        /* ── O AVISO E A BARRA JÁ NÃO DISPUTAM A MESMA FAIXA ───────────────
           MEDIDO a 375 px: um aviso («Este rascunho tinha sido alterado noutro
           sítio…») nasce fixo 12 px acima da navegação do telemóvel, e esta
           barra pousa nessa mesma navegação com ~64 px de altura — ou seja, o
           aviso nascia DENTRO da faixa desta barra, em cima do botão
           «Pré-visualizar» (`elementFromPoint` no centro do botão devolvia o
           texto do aviso) durante os 4 s em que fica no ecrã.
           A saída NÃO é levantar esta barra por cima do aviso: a barra é opaca
           e mais alta do que ele, e o aviso — que é como o estúdio diz que uma
           gravação falhou — desaparecia por completo no telemóvel. Quem se
           afasta é o aviso: esta barra publica a sua altura medida em
           `--bo-barra-accao` (ver o `ResizeObserver` lá em cima) e o
           `Toast.tsx` soma-a à distância a que já se punha do fundo. Ficam os
           dois visíveis, e nenhum tapa o outro. */
        /* ── E PASSOU A SER MATERIAL, COMO TUDO O QUE FLUTUA ──────────────
           Palavras dela, com uma captura desta barra ao lado da cápsula de
           vidro: «quero isto com o mesmo design da apple».

           Era uma laje branca de bordo a bordo com um risco por cima — a única
           superfície do estúdio que continuava a fingir que não flutua. Flutua:
           está `sticky`, o conteúdo passa mesmo por baixo dela, e é isso que a
           põe na camada FUNCIONAL do sistema de design, onde vive o material.

           `bo-material` traz o raio, o fio dos quatro lados e a superfície
           translúcida; `bo-material-desfoque` o desfoque. Sai o `border-t`
           (um risco de um lado só é o desenho de uma laje encostada, e a peça
           deixou de o ser) e sai a cor sólida — que se pintava POR CIMA do
           material e o apagava, como já tinha acontecido na coluna e na barra
           de topo.

           `mx-1` em vez de `-mx-1`: uma peça que flutua tem ar dos lados. Era
           negativo de propósito, para a laje ir de bordo a bordo do painel;
           com raio, ir de bordo a bordo era cortar-lhe os cantos contra a
           margem.

           Continua a publicar a sua altura em `--bo-barra-accao` para o aviso
           do `Toast` se afastar dela, e continua a pousar à altura da barra de
           destinos — as duas coisas que este bloco já garantia. */
        /* ── E DEIXOU DE SER UMA LAJE VAZIA DE BORDO A BORDO ──────────────
           Palavras dela, com a captura deste ecrã num portátil: «esta barra de
           pré-visualizar aqui não está muito bem».

           Estava, e era de medida: a barra ocupava a largura inteira do estúdio
           — as três colunas, o formulário e o painel do «que vai sair» — para
           transportar uma frase e um botão. Tudo o resto era vidro por encher.
           E logo por cima da cápsula dos destinos, que também flutua: duas
           lajes empilhadas a comerem o fundo do ecrã.

           `sm:w-fit` faz a barra medir o que tem. `sm:ml-auto` encosta-a à
           direita — e é ISSO que preserva a decisão que este bloco já tinha
           tomado e explicado: «o botão NÃO se mexe para a esquerda (…) a acção
           principal a saltar de sítio entre passos custa mais do que o vazio».
           Sendo o botão o elemento mais à direita de uma barra encostada à
           direita, a borda dele fica no mesmo x nos três passos — que é o que
           aquela decisão queria, e que a laje só conseguia à custa do vazio.

           `max-w-full` porque numa janela estreita o total escrito por extenso
           pode pedir mais do que há; aí volta a caber e o `truncate` do
           parágrafo faz o resto.

           ── E A PERGUNTA É À CAIXA, NÃO À JANELA ──────────────────────────
           Escrevi isto primeiro com `sm:`, e o `o-estudio-pergunta-a-caixa`
           chumbou-o — com razão, e é a rede a fazer o seu trabalho. O estúdio
           desenha-se em DOIS sítios: a página inteira e o painel de detalhe,
           que tem tecto próprio. Com a janela a 1440 a fila do painel tem 712,
           portanto um `sm:` (640 de JANELA) estaria satisfeito sem dizer nada
           sobre o espaço que a barra tem de facto.

           `@min-[40rem]:` pergunta à caixa mais próxima — o `@container` que este
           bloco passou a declarar, e que é mesmo a caixa de quem esta barra é
           filha. MEDIDA: 1360 px com o estúdio sozinho, 712 com o painel de
           detalhe aberto, a janela a 1440 nos dois casos. 40rem é a mesma
           medida que o ficheiro já usa noutras decisões de coluna.

           O `max-w-full` fica solto: não é uma decisão de largura, é uma rede
           para o total escrito por extenso não empurrar a barra para fora.

           Abaixo disso nada se aplica: a barra é a largura da caixa, e o
           `mr-auto` do parágrafo continua a ser quem separa o estado da
           decisão.

           ── E AR ENTRE AS DUAS PEÇAS QUE FLUTUAM ──────────────────────────
           MEDIDO a 1440×900 depois de a barra passar a abraçar o conteúdo: o
           fundo dela ficava aos 814 px e o topo da cápsula dos destinos aos
           816. DOIS píxeis. Duas superfícies de vidro a dois píxeis uma da
           outra não se lêem como duas coisas — lêem-se como uma mancha só com
           um risco no meio, que é o contrário do que flutuar quer dizer.

           A soma ganha o `--bo-barra-folga`: o MESMO ar que a cápsula já tem
           do bordo do ecrã. Não é um número afinado a olho — é o token do ar
           desta casa, aplicado ao vão entre duas peças em vez de ao vão entre
           uma peça e a moldura. Ficam 14 px, e lêem-se como duas. */
        // Escondida pelo teclado (barra compacta): fica no sítio, transparente e
        // inerte — o conteúdo não salta, e nada nela se deixa tocar.
        inert={barraEscondida}
        className={`bo-material bo-material-desfoque sticky bottom-[calc(var(--bo-barra-inferior)+var(--bo-barra-folga)+env(safe-area-inset-bottom))] z-20 mx-1 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-2 py-1.5 shadow-[var(--bo-sombra-suspensa)] max-w-full @min-[40rem]:ml-auto @min-[40rem]:w-fit ${ESTADO} ${
          barraEscondida ? "pointer-events-none opacity-0" : ""
        }`}
      >
        {noFormulario && (
          <>
            {/* O TOTAL SEMPRE À VISTA.
                Palavras dela: «não quero fazer scroll para saber quanto vai a
                proposta». O valor vive cinco ecrãs abaixo do sítio onde ela
                está a escrever os serviços; aqui acompanha-a por toda a
                página, e muda enquanto ela escreve. */}
            {/* UMA LINHA NO TELEMÓVEL.
                Esta barra é fixa, e por baixo dela ainda vem a barra de
                navegação e a do Safari. O texto completo ("Total 3000,00 € sem
                IVA · o cliente paga 3690,00 € · guardado às 12:34") embrulhava
                para três linhas e comia o pouco ecrã que sobrava.

                O que fica no telemóvel é só o número que decide — o que o
                CLIENTE paga —, e o resto do detalhe volta a partir de `sm`.
                O "guardado às 12:34" vira um visto: é uma confirmação, e um
                visto confirma tão bem como a frase, num décimo do espaço.
                A hora continua lá para quem a procurar, no `title`. */}
            {/* ── SÓ O ESSENCIAL ───────────────────────────────────────────
                Havia aqui uma TERCEIRA soma — «soma das linhas: 2.400,00 €»
                numa etiqueta cor de laranja — ao lado de um total de 2.460,00 €
                e de um «o cliente paga 3.025,80 €». Três números diferentes na
                mesma linha de rodapé, e nenhum deles a explicar-se: a barra
                existe para responder a «quanto vai a proposta», não para abrir
                a discussão que o bloco de totais já resolve.
                Ficam o total sem IVA, o total a pagar e o estado de guardado. */}
            {/* ══════════════════════════════════════════════════════════════
                O ESTADO FICA SOZINHO À ESQUERDA; O NÚMERO VAI TER COM A ACÇÃO
                ══════════════════════════════════════════════════════════════
            
                MEDIDO num Chromium, com 4.500,00 € escritos no «Valor (sem IVA)»:
                o texto acabava aos 371 px e o botão começava aos 1248 — 877 px de
                nada entre o número que decide e a acção que o consome. A 1920 eram
                1037. Mais de metade da barra era vazio, e ela olha para aqui
                dezenas de vezes por proposta.
            
                A causa era uma só: o `mr-auto` do parágrafo empurrava TUDO o que é
                texto para a borda esquerda e o botão ficava agarrado à direita. Dois
                cantos opostos de um ecrã largo — duas fixações do olho para ler uma
                pergunta só («quanto vai, e sigo?»).
            
                Agora a barra tem dois grupos com propósitos diferentes:
            
                  · à ESQUERDA, o ESTADO — o indicador de gravação e o aviso do preço
                    que não chegou ao pedido. Lê-se quando alguma coisa está mal, e
                    um canto é onde se procura um estado.
                  · à DIREITA, a DECISÃO — o total e o botão que o consome, lado a
                    lado, dentro de uma fixação.
            
                E é ISTO que separa o «guardado às 21:49» do total, que era a outra
                queixa: já não estão colados por um espaço a fingir de pontuação —
                estão em pontas diferentes porque são coisas diferentes. O vazio que
                sobra deixou de ser vazio no meio de uma frase e passou a ser a
                distância entre dois assuntos.
            
                O botão NÃO se mexe para a esquerda: os passos «prever» e «enviar»
                encostam o seu grupo de acções à direita (`ml-auto`), e a acção
                principal a saltar de sítio entre passos custa mais do que o vazio
                alguma vez custou. Quem viaja é o número. */}
            {/* ── OS ALARMES TÊM DE SER OUVIDOS, E NÃO SÓ VISTOS ───────────
                Ao descer no telemóvel, esta linha sai quando está tudo bem —
                mas SÓ À VISTA (`data-acessorio-so-a-vista`, que a esconde como
                o `sr-only`), e não com `display: none`. Uma região `aria-live`
                fora da árvore de acessibilidade não anuncia nada quando volta
                a entrar com o alarme já lá dentro: o alarme chegava calado.
                Pela mesma razão as regiões abaixo existem SEMPRE (vazias
                quando não há nada a dizer), e é o conteúdo que muda. */}
            <p
              className="mr-auto min-w-0 truncate text-xs text-[var(--bo-text-muted)]"
              data-acessorio-so-a-vista={
                precoPorChegar || soNesteComputador || naoDuraAoDeploy ? undefined : ""
              }
            >
              {/* ══════════════════════════════════════════════════════════
                  O PREÇO QUE NÃO CHEGOU AO PEDIDO
                  ══════════════════════════════════════════════════════════

                  Fica ao lado do indicador da gravação porque é da mesma
                  família — «onde é que o meu trabalho está» —, mas é um aviso
                  À PARTE e não um quarto estado daquele: o rascunho pode estar
                  guardado e o preço na mesma por chegar, e juntá-los obrigava
                  o indicador a escolher qual das duas verdades dizia.

                  Diz o que aconteceu, com o número, e o que fazer — a regra
                  dela. Sem o número isto era «algo correu mal» com outra
                  roupa: ela precisa de ver QUE valor ficou por gravar para
                  saber se o cartão do pedido está certo ou não.
              */}
              <span aria-live="assertive" data-alarme-do-preco="">
                {precoPorChegar && (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bo-perigo)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--bo-perigo)]"
                    title={
                      precoPorChegar.porque ??
                      "A proposta continua certa; o que não ficou gravado foi o valor no pedido."
                    }
                  >
                    <span>
                      {precoPorChegar.base == null
                        ? "O pedido ficou com o valor antigo"
                        : `O pedido ficou sem o valor de ${eur(precoPorChegar.base)}`}
                    </span>
                    {precoPorChegar.valeTentarDeNovo && (
                      <button
                        type="button"
                        className={`alvo-toque foco-largo underline underline-offset-2 disabled:opacity-60 ${ESTADO} ${PRESSAO}`}
                        disabled={precoAGravar}
                        onClick={() => void tentarGravarOPreco(precoPorChegar.base)}
                      >
                        {precoAGravar ? "A tentar…" : "Tentar de novo"}
                      </button>
                    )}
                  </span>
                )}
              </span>
              {(() => {
                const haEstado = haQueMostrar(gravadoEm, porGravar, gravacao);
                const estado = estadoNoEcra(porGravar, gravacao);
                const t = textoDaGravacao(estado, gravadoEm);
                return (
                  // Duas regiões fixas — uma `polite`, uma `assertive` só para
                  // os alarmes —, e nunca uma que troca de `aria-live`. Ver
                  // `EstadoDaGravacaoNaBarra`.
                  <EstadoDaGravacaoNaBarra
                    haEstado={haEstado}
                    estado={estado}
                    texto={t}
                    comMargem={!!precoPorChegar}
                    titulo={
                      estado === "so-neste-computador" && soNesteComputador?.porque
                        ? `${t.longo} — ${soNesteComputador.porque}`
                        : estado === "nao-dura-ao-deploy" && naoDuraAoDeploy?.aviso
                          ? `${t.longo} — ${naoDuraAoDeploy.aviso}`
                          : t.longo
                    }
                  />
                );
              })()}
            </p>
            {/* ── UM `mr-auto` SÓ, E NÃO DOIS AUTOS FRENTE A FRENTE ──────────
                A folga livre da fila é dada ao `mr-auto` acima, que a absorve toda e
                encosta este grupo à direita. Pôr aqui um `ml-auto` seria pior do que
                redundante: com margens automáticas dos dois lados o flexbox REPARTE
                a folga em partes iguais, e o grupo ficaria centrado — com o total a
                passear-se para o meio da barra sempre que o estado mudasse de
                largura. */}
            {/* ── A DICA SAI QUANDO NÃO CABE, EM VEZ DE FICAR COM UMA LETRA ──
                A 390 px, com «← Inspiração» e «Seguinte: Rever e enviar» ao
                lado, sobravam uns 30 px para a linha da esquerda, e o
                `truncate` deixava «Pree…» e depois só «P.» (auditoria de
                13/11, n.º 12) — e um total cortado a meio é pior: lê-se outro
                número. O grupo passa a contentor (`@container`, com a folga
                toda da barra, e `justify-end` para continuar encostado à
                direita), e a linha e a divisória saem quando a caixa não dá
                ~120 px à linha: 27rem com o «anterior», 20rem sem ele. */}
            {/* ── E O TOTAL NUNCA SAI (auditoria de 14/11, n.º 1) ──────────
                O `@container` deste grupo foi-se. Um contentor de tamanho
                inline MEDE ZERO para quem o embrulha a abraçar o conteúdo — e
                a barra, a partir de 40rem, é `w-fit`. MEDIDO a 1440 e a 768:
                o grupo ficava com 0 px, o `@max-[20rem]:hidden` apagava o
                total, e a barra encolhia para 26 px com os botões a sair por
                fora. A 390, a partir do passo 2, o «anterior» tirava-lhe o
                lugar na mesma.

                Palavras dela: «não quero fazer scroll para saber quanto vai a
                proposta». Por isso quem cede espaço numa caixa estreita são
                os BOTÕES — o nome do passo passa a só se ouvir (`sr-only`) e
                fica a seta —, e o total não cede nunca (`shrink-0`). As
                perguntas de largura são feitas à caixa de cima, que é um
                bloco e mede a sério. */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
              {/* ── A ETIQUETA VIAJA COM O NÚMERO ────────────────────────────
                    A escolha acima — no telemóvel, o que o CLIENTE paga — estava
                    certa. O que estava errado era a palavra: «Total» ficava FORA
                    do corte e servia os dois números. No telemóvel lia-se
                    «Total 3.025,80 €» (com IVA); no computador, «Total 2.460,00 €
                    sem IVA». A mesma proposta, a mesma palavra, dois valores —
                    e ela trabalha no telemóvel e confere no computador.

                    Não é a conta que muda: é a etiqueta que mentia num dos dois.
                    Em todo o resto do ficheiro `totais.aPagar` aparece sempre
                    como «total a pagar» (ver o bloco de totais e o gerador do
                    PDF); só esta barra lhe chamava «Total».

                    Por isso o rótulo e o valor passam a viver DENTRO do mesmo
                    ramo. Separá-los com dois `hidden` independentes foi o que
                    deixou a palavra emparelhar-se com o número errado — e é um
                    engano que volta sozinho se o par se voltar a separar. */}
              {/* ── O NÚMERO QUE DECIDE TEM DE SE DISTINGUIR DA MOLDURA ────────
                  Estava tudo a 12 px: rótulo, número e ressalva. Um `font-semibold`
                  no meio de uma linha inteira do mesmo tamanho não faz hierarquia
                  nenhuma a três metros de distância — e a esta barra olha-se de
                  relance, não se lê.
            
                  O valor sobe a 14 px e o resto fica nos 12; a caixa não cresce
                  porque a altura da barra é dada pelo botão (40 px) e não pelo texto
                  (16 px de linha, 20 com o valor maior).
            
                  QUAL dos dois números leva o tamanho não se mexe: continua a ser o
                  que já estava a `<strong>` em cada ramo. Escolher outro seria
                  decidir qual é «o» total da casa — decisão dela, não minha, e esta
                  barra já perdeu uma terceira soma por alguém a ter tomado sozinho.
            
                  `tabular-nums` porque o total muda ENQUANTO ela escreve os serviços:
                  com algarismos de larguras diferentes, cada tecla remede a linha e o
                  número dança. Em algarismos tabulares um 4 e um 1 ocupam o mesmo, e
                  a linha fica quieta. É o mesmo que o bloco de totais aqui em baixo
                  já faz (ver `LinhaDeTotal`). */}
              <p
                data-total-da-barra
                className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--bo-text-muted)]"
              >
                {money.base > 0 ? (
                  <>
                    <span className="@min-[48rem]:hidden">
                      <span className="text-foreground/45">A pagar</span>{" "}
                      <strong className="font-semibold text-[var(--bo-text)]">
                        {eur(totais.aPagar)}
                      </strong>
                    </span>
                    <span className="hidden @min-[48rem]:inline">
                      <span className="text-foreground/45">Total</span>{" "}
                      <strong className="font-semibold text-[var(--bo-text)]">
                        {eur(totais.total)}
                      </strong>{" "}
                      <span className="text-foreground/45">
                        sem IVA · a pagar {eur(totais.aPagar)}
                      </span>
                    </span>
                  </>
                ) : (
                  /* A instrução do estado vazio estava `hidden sm:inline`: quem
                       abre uma proposta em branco no telemóvel não via nada a dizer
                       o que fazer a seguir. Fica, numa versão curta que cabe na
                       barra sem ser cortada pelo `truncate` do `<p>`. */
                  <>
                    <span className="@min-[48rem]:hidden">Preenche e avança.</span>
                    <span className="hidden @min-[48rem]:inline">
                      Preenche este passo e avança para o seguinte.
                    </span>
                  </>
                )}
              </p>
              {/* ── UMA DIVISÓRIA A SÉRIO ENTRE O QUE SE LÊ E O QUE SE CARREGA ──
                  Um traço de 1 px com a altura do texto, no `--bo-hairline-strong`
                  da casa. Diz que o número e o botão são vizinhos de propósito e não
                  a mesma coisa — que é precisamente o que um espaço não conseguia
                  dizer. `aria-hidden` porque não há nada aqui para ouvir. */}
              <span aria-hidden className="h-5 w-px shrink-0 bg-[var(--bo-hairline-strong)]" />
              {/* ══════════════════════════════════════════════════════════════
                O «GUARDAR AGORA» SAIU — MENOS NO ÚNICO CASO EM QUE ERA A ÚNICA
                MANEIRA DE GRAVAR
                ══════════════════════════════════════════════════════════════

                Palavras dela: «"Guardar agora" ao lado de "Tudo guardado" é
                redundante e contraditório». É, e a gravação automática cobre
                MESMO o que o botão cobria — não é uma suposição: `guardarAgora`
                chama `flushDraft.current()`, que é exactamente a mesma função
                `save` que o temporizador de 800 ms chama. Botão e automático
                gravavam pelo mesmo caminho, com as mesmas regras. Além disso a
                desmontagem grava o que faltasse, e o registo do back office
                trava a saída da página com trabalho por gravar.

                ── O CASO EM QUE O BOTÃO NÃO ERA REDUNDANTE ──────────────────
                Quando o servidor RECUSA: a cópia local é síncrona e apaga o
                «por gravar», e o temporizador só volta a correr à tecla
                seguinte. Nesse estado — o mesmo em que uma proposta inteira já
                se perdeu — carregar aqui era a única forma de voltar a tentar.
                Tirar o botão por inteiro era tirar isso.

                Por isso ele fica, mas SÓ nesse estado, e com o nome do que faz
                nele: «Tentar guardar outra vez». Ao lado de «Tudo guardado» já
                não há botão nenhum — há o indicador, e mais nada. O ⌘S continua
                a valer sempre, para quem se levanta da secretária e quer a
                certeza sem esperar pelos 800 ms. */}
              {soNesteComputador && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={guardarAgora}
                  loading={aGuardarAgora}
                  title="Tentar guardar outra vez no servidor (⌘S)"
                >
                  Tentar outra vez
                </Button>
              )}
              {/* ── ANTERIOR E SEGUINTE (A2) ─────────────────────────────
                  O botão principal diz PARA ONDE vai («Seguinte: Serviços»),
                  e não só «Seguinte»: com cinco passos, o nome do próximo é o
                  que diz quanto falta. O anterior é discreto e só existe a
                  partir do 2.º. */}
              {passoAoLado(step, -1) && (
                <Button
                  data-acessorio-da-barra=""
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => irParaPasso(passoAoLado(step, -1) as Step)}
                  // O nome inteiro, dito de uma vez: com o nome do passo num
                  // `<span>` à parte o Chromium lia «Seguinte : Serviços».
                  aria-label={`← ${nomeDoPasso(passoAoLado(step, -1) as Step, !isDeco)}`}
                >
                  {/* Um <span> só à volta: o botão é `flex` com `gap`, e cada
                      filho solto ganhava um espaço à frente («Seguinte : …»). */}
                  <span>
                    ←
                    <span className="@max-[36rem]:sr-only">
                      {" "}
                      {nomeDoPasso(passoAoLado(step, -1) as Step, !isDeco)}
                    </span>
                  </span>
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                className="shrink-0"
                onClick={() => irParaPasso(passoAoLado(step, 1) as Step)}
                iconRight={<span aria-hidden="true">→</span>}
                aria-label={`Seguinte: ${nomeDoPasso(passoAoLado(step, 1) as Step, !isDeco)}`}
              >
                <span>
                  Seguinte
                  <span className="@max-[36rem]:sr-only">
                    : {nomeDoPasso(passoAoLado(step, 1) as Step, !isDeco)}
                  </span>
                </span>
              </Button>
            </div>
          </>
        )}

        {step === "enviar" && !sent && (
          <>
            <Button
              data-acessorio-da-barra=""
              size="sm"
              variant="ghost"
              onClick={() => irParaPasso("orcamento")}
              // A meio de um envio, voltar atrás não cancela nada — o pedido já
              // está a correr no servidor — e só serve para ela deixar de ver o
              // que está a acontecer.
              disabled={busy === "send"}
              // Compacta, a seta chega: o nome do passo está na barra dos passos
              // lá em cima, e cada letra aqui é largura tirada ao «Enviar».
              aria-label={barraCompacta ? `Voltar a ${nomeDoPasso("orcamento")}` : undefined}
            >
              {barraCompacta ? "←" : `← ${nomeDoPasso("orcamento")}`}
            </Button>
            {/* ── A LÍNGUA E O DESCARREGAR VIERAM DO ANTIGO «PRÉ-VISUALIZAR» (A2) ──
                O documento junta pré-visualizar e enviar num passo só, «Rever
                e enviar». O selector da língua fica encostado ao «Descarregar»,
                como ela pediu (ver o comentário lá dentro), e é o mesmo estado
                do selector do corpo do passo — mudar um muda o outro. */}
            {busy !== "send" && barraCompacta && (
              <>
                {/* ══════════════════════════════════════════════════════════════
                    A LÍNGUA ESCOLHE-SE EM CIMA DO BOTÃO QUE GERA
                    ══════════════════════════════════════════════════════════════

                    Palavras dela: «na parte de descarregar ou gerar, um botão para
                    escolher gerar em inglês».

                    Fica encostado ao «Descarregar PDF» e À VISTA — não num menu,
                    não nas definições da proposta. A escolha é sobre ESTE clique:
                    a mesma proposta sai agora em português e daqui a um minuto em
                    inglês, sem nada mudar no documento. Escondida, seria
                    descoberta depois de o PDF já ter saído na língua errada — e
                    gerar outra vez é um minuto de espera com fotografias a sério.

                    ── E A ESCOLHA TEM DE DIZER O QUE FAZ ──────────────────────
                    Só a MOLDURA é traduzida: rótulos, texto padrão da casa, datas
                    e dinheiro. Os títulos dos serviços, as descrições e as
                    legendas que ela escreveu saem tal e qual — foi decisão
                    explícita, e está escrita no cabeçalho de
                    `proposal-doc-textos`. Sem esta linha, quem carrega em «Inglês»
                    abre um PDF meio inglês e conclui que está avariado; com ela,
                    sabe que o remédio é escrever esses campos em inglês.

                    A linha está sempre no ecrã, e não só depois de escolher: serve
                    para DECIDIR, não para explicar um arrependimento. */}
                <ControlosDoEnvio
                  compacta={barraCompacta}
                  aberta={folhaDoEnvio}
                  onFechar={() => setFolhaDoEnvio(false)}
                  antes={
                    <PorqueNaoDaParaEnviar
                      naFolha
                      faltas={faltasDoEnvio}
                      fotosPorConfirmar={fotosPorConfirmar}
                      emailDoCliente={quote.email}
                      onIr={(f) => {
                        setFolhaDoEnvio(false);
                        irParaAFalta(f.seccao, f.campo);
                      }}
                    />
                  }
                >
                  <div className="flex flex-col gap-1.5">
                    <p className="bo-eyebrow text-[var(--bo-text-muted)]">Por onde segue</p>
                    <Segmented
                      size="sm"
                      ariaLabel="Por onde segue (em baixo)"
                      value={canal}
                      onChange={escolherCanal}
                      options={OPCOES_DO_CANAL}
                    />
                  </div>
                  <Segmented
                    size="sm"
                    ariaLabel="Idioma da proposta"
                    value={idiomaDoPdf}
                    onChange={setIdiomaDoPdf}
                    options={[
                      { value: "pt", label: "Português" },
                      {
                        value: "en",
                        label: "Inglês",
                        // Quem ouve o controlo em vez de o ver leva a mesma
                        // ressalva que está escrita por baixo — o aviso não pode
                        // viver só nos pixéis. Começa por «Inglês», que é o rótulo
                        // visível, para o nome falado e o nome escrito não
                        // divergirem.
                        ariaLabel:
                          "Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste",
                      },
                    ]}
                  />
                  {/* ══════════════════════════════════════════════════════════
                      ENQUANTO O PDF SE DESENHA
                      ══════════════════════════════════════════════════════════

                      É o MESMO desenho de documento que o envio faz, na mesma
                      rota, com a mesma espera de 10 a 60 segundos — e aqui havia
                      só um botão a rodar, que ao fim de meio minuto se lê como
                      «isto encravou». A caixa entra no lugar do botão (é onde o
                      estado já vivia, e assim não empurra o selector de idioma
                      nem a ressalva de baixo) e a estimativa é a mesma que o
                      `AEnviarAProposta` usa: aprendida das gerações anteriores
                      desta instalação, e não um número escrito à mão.

                      A espera é OPACA de propósito: é um pedido só, e do lado de
                      cá não há nada para contar até a resposta chegar. */}
                  {fimDoPdf.mostrar ? (
                    <EmCurso
                      className="max-w-xs"
                      concluido={fimDoPdf.concluido}
                      pronto="PDF pronto"
                      // A língua continua dita enquanto roda: são dezenas de
                      // segundos numa proposta cheia, tempo que chega para deixar
                      // de haver a certeza do que se escolheu — o português
                      // cala-se porque é o de sempre.
                      titulo={idiomaDoPdf === "en" ? "A gerar o PDF em inglês…" : "A gerar o PDF…"}
                      estimadoMs={tempoEstimado(totalDeFotos, amostras)}
                      nota="Assim que estiver desenhado, o PDF é descarregado."
                      notaDemorada="Com a rede fraca isto demora. Não feches a página — o PDF é descarregado assim que estiver."
                    />
                  ) : (
                    /* ── O PDF FINAL SÓ SAI SEM ERROS (B1) ─────────────────────
                        Com um erro na lista do «Rever e enviar», este botão passa
                        a dar o RASCUNHO, e di-lo no rótulo. A razão vai no
                        `title` e não numa frase por baixo: esta barra é fina por
                        pedido dela, e a lista com as razões está no passo a
                        seguir, com links para cada uma. */
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => preview({ rascunho: temErros })}
                      disabled={busy !== null}
                      title={
                        temErros
                          ? "Há erros por resolver em «Rever e enviar». O PDF final fica disponível quando a lista estiver sem erros; o rascunho sai com «RASCUNHO» no rodapé."
                          : undefined
                      }
                    >
                      {temErros ? "Descarregar rascunho" : "Descarregar PDF"}
                    </Button>
                  )}
                  {/* ══════════════════════════════════════════════════════════
                      A RESSALVA TEM DE SER VERIFICÁVEL NO PAPEL
                      ══════════════════════════════════════════════════════════

                      Quem a lê vai a seguir mandar o PDF a um cliente inglês.

                      Já esteve errada duas vezes, e das duas por prometer a
                      descoberta ao cliente: prometeu «datas» quando a data do
                      evento saía em português, e depois prometeu que os campos
                      preenchidos ficavam TODOS como estavam — quando a data e o
                      tipo de evento passaram a traduzir-se sozinhos e a prosa dela
                      passou a ter uma segunda caixa.

                      Diz agora as três coisas que são verdade, e nenhuma a mais:
                      o que ela traduziu sai em inglês, o que não traduziu sai em
                      português, e os valores ficam à portuguesa. */}
                  {/* ── ISTO É PROSA DENTRO DE UMA BARRA COLADA, E ISSO CUSTA ECRÃ ──
                      A barra do fundo é `sticky` e `flex-wrap`: um filho `w-full`
                      não ocupa uma linha, ocupa uma LINHA SÓ PARA ELE. A 375 px
                      estas três frases dão cinco linhas de texto, e a barra —
                      que já se sobrepõe ao conteúdo e já lhe rouba a folga por
                      baixo — cresce outro tanto. Ela mandou a fotografia: com a
                      barra de navegação por baixo, sobrava menos de metade do ecrã
                      para a proposta que estava a escrever.

                      Já havia uma máquina a MEDIR a barra e a reservar essa altura
                      ao conteúdo (ver o comentário do passo 1). Resolvia o sintoma
                      — o que ficava por baixo deixou de ser inalcançável — e
                      deixava a causa de pé: uma barra livre de crescer cresce.

                      Não se esconde. Mostra-se QUANDO É A PERGUNTA: este parágrafo
                      responde a «o que muda se eu escolher inglês?», e ela trabalha
                      em português. Com «Português» escolhido fica uma linha, que
                      chega para saber que há uma diferença e onde a ler; com
                      «Inglês» escolhido abre inteiro, porque aí é a consequência do
                      que ela acabou de fazer.

                      Em ecrã largo abre sempre: lá a barra tem espaço, e a única
                      razão para o encurtar era a que não existe. */}
                  {/* ── E AGORA UMA LINHA SÓ, EM QUALQUER ECRÃ ─────────────────
                      Palavras dela, com a captura desta barra e da do passo 3:
                      «coloca estas barras muito mais finas de modo a não estarem
                      a atrapalhar o trabalho de por trás». No ecrã largo o texto
                      inteiro ocupava uma linha só para ele, e a barra tinha três
                      andares (voltar · idioma e PDF · ressalva · «Rever e
                      enviar»).

                      Com «Português» fica a frase curta, À VISTA e na mesma fila
                      dos controlos — continua dito, antes do clique, que o inglês
                      muda o documento. O texto inteiro fica para o leitor de ecrã
                      (`sr-only`) e abre à vista quando se escolhe «Inglês», que é
                      quando passa a ser a consequência do que ela fez. */}
                  <p
                    className={
                      idiomaDoPdf === "en"
                        ? "w-full text-right text-[11px] leading-snug text-foreground/50"
                        : "order-first text-[11px] leading-snug text-foreground/50"
                    }
                  >
                    {idiomaDoPdf === "en" ? (
                      <>
                        Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a
                        data e o tipo de evento. Da tua prosa sai em inglês o que estiver nas caixas
                        «EN»; o que ficar em branco sai em português. Os valores continuam à
                        portuguesa (1.234,56 €).
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">Em inglês muda a moldura do documento.</span>
                        <span className="sr-only">
                          Em inglês sai a moldura do documento — rótulos, textos da casa, condições,
                          a data e o tipo de evento. Da tua prosa sai em inglês o que estiver nas
                          caixas «EN»; o que ficar em branco sai em português. Os valores continuam
                          à portuguesa (1.234,56 €).
                        </span>
                      </>
                    )}
                  </p>
                  {/* ── O QUE FALTA, DITO ANTES DO CLIQUE ──────────────────────
                      Este é o sítio onde o PDF nasce, e o primeiro PDF inglês sai
                      quase sempre antes de a Conferência ser vista. Um `toast` não
                      serviria: o toast conta o que ACONTECEU, e isto conta o que
                      vai acontecer — tem de estar à vista antes de se carregar.
                      `aria-live` porque o número muda com o selector ao lado. */}
                  {idiomaDoPdf === "en" && (
                    <AvisoDasTraducoes
                      doc={doc as ProposalDoc}
                      onVer={(campo) => irParaCampo(campo, "en")}
                    />
                  )}
                </ControlosDoEnvio>
              </>
            )}
            {/* ══════════════════════════════════════════════════════════════════
                NO ECRÃ LARGO, UMA LINHA SÓ (14/10, «melhora isto drasticamente»)
                ══════════════════════════════════════════════════════════════════

                Era um cartão de três andares: a frase do inglês, «Vai para…»,
                a caixa vermelha do que falta e o canal por baixo de tudo. Ela
                escolheu «uma linha só»: a pastilha do estado (a MESMA do
                telemóvel) abre um painel com o que a caixa dizia, e ao lado
                ficam a língua, o canal só com os logótipos e o PDF. Os nomes
                que se ouvem são os de sempre — «Idioma da proposta», «Por onde
                segue (em baixo)», «Descarregar PDF» —, só o que se VÊ encolhe. */}
            {busy !== "send" && !barraCompacta && (
              <div
                className="flex min-w-0 items-center gap-2"
                // Quando TODOS os filhos saem (painel fechado, nada trava), o
                // grupo sai também: vazio, continuava a ser um item da fila e
                // somava mais um `gap` ao lado do botão (2.ª revisão de 15/11).
                data-acessorio-da-barra={painelDoEnvio || oEnvioTrava ? undefined : ""}
              >
                {/* Com o painel da pastilha aberto, fica tudo: não se fecha um
                    painel debaixo do dedo só porque a página andou. E com uma
                    falta que trava, a pastilha fica (é um alarme); o resto sai. */}
                <span
                  className="inline-flex"
                  data-acessorio-da-barra={painelDoEnvio || oEnvioTrava ? undefined : ""}
                >
                  <PastilhaDoEnvio
                    ref={pastilhaDoEnvio}
                    aberta={painelDoEnvio}
                    faltas={faltasDoEnvio}
                    fotosPorConfirmar={fotosPorConfirmar}
                    idioma={idiomaDoPdf}
                    onAbrir={() => setPainelDoEnvio((v) => !v)}
                  />
                </span>
                <PainelDoEnvio
                  aberto={painelDoEnvio}
                  onFechar={fecharPainelDoEnvio}
                  ancora={pastilhaDoEnvio}
                >
                  <PorqueNaoDaParaEnviar
                    naFolha
                    faltas={faltasDoEnvio}
                    fotosPorConfirmar={fotosPorConfirmar}
                    emailDoCliente={quote.email}
                    onIr={(f) => {
                      setPainelDoEnvio(false);
                      irParaAFalta(f.seccao, f.campo);
                    }}
                  />
                  <p className="text-[11px] leading-snug text-foreground/50">
                    {RESSALVA_DO_INGLES}
                  </p>
                  {idiomaDoPdf === "en" && (
                    <AvisoDasTraducoes
                      doc={doc as ProposalDoc}
                      onVer={(campo) => {
                        setPainelDoEnvio(false);
                        irParaCampo(campo, "en");
                      }}
                      alinhar="esquerda"
                    />
                  )}
                </PainelDoEnvio>
                <span className="contents" data-acessorio-da-barra={painelDoEnvio ? undefined : ""}>
                  <Segmented
                    size="sm"
                    ariaLabel="Idioma da proposta"
                    value={idiomaDoPdf}
                    onChange={setIdiomaDoPdf}
                    options={[
                      { value: "pt", label: "PT", ariaLabel: "Português" },
                      {
                        value: "en",
                        label: "EN",
                        ariaLabel:
                          "Inglês — o documento, o email ao cliente e a página onde ele responde saem em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste",
                      },
                    ]}
                  />
                  <Segmented
                    size="sm"
                    ariaLabel="Por onde segue (em baixo)"
                    value={canal}
                    onChange={escolherCanal}
                    options={OPCOES_DO_CANAL.map((o) => ({
                      value: o.value,
                      label: "",
                      icon: o.icon,
                      ariaLabel: o.label,
                    }))}
                  />
                  {fimDoPdf.mostrar ? (
                    <EmCurso
                      emLinha
                      concluido={fimDoPdf.concluido}
                      pronto="PDF pronto"
                      titulo={idiomaDoPdf === "en" ? "A gerar o PDF em inglês…" : "A gerar o PDF…"}
                      estimadoMs={tempoEstimado(totalDeFotos, amostras)}
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => preview({ rascunho: temErros })}
                      disabled={busy !== null}
                      aria-label={temErros ? "Descarregar rascunho" : "Descarregar PDF"}
                      title={
                        temErros
                          ? "Há erros por resolver em «Rever e enviar». O PDF final fica disponível quando a lista estiver sem erros; o rascunho sai com «RASCUNHO» no rodapé."
                          : "Descarregar o PDF"
                      }
                      iconLeft={<span aria-hidden="true">↓</span>}
                    >
                      {temErros ? "Rascunho" : "PDF"}
                    </Button>
                  )}
                </span>
              </div>
            )}
            {/* ── ENQUANTO ESTÁ A IR ──────────────────────────────────────
                «Ao enviar a proposta quero que haja uma animação que eu perceba
                que está a ser enviado.» Não havia nenhuma: o `send()` fechava a
                confirmação e o ecrã voltava ao botão apagado, durante os
                dezenas de segundos que o desenho do PDF e o email demoram numa
                quinta com 4G fraco. */}
            {busy === "send" ? (
              <div className="ml-auto flex justify-end">
                <AEnviarAProposta
                  fotos={totalDeFotos}
                  amostras={amostras}
                  para={quote.email || undefined}
                />
              </div>
            ) : /* O servidor parou e perguntou (fotos em falta ou cortes) —
                ver `PerguntaAntesDoEnvio` e `usePerguntasDoEnvio`. */
            perguntas.pergunta ? (
              <PerguntaAntesDoEnvio
                pergunta={perguntas.pergunta}
                ocupado={busy !== null}
                onEnviarAssimMesmo={() => {
                  // Só vale para o documento que fez a pergunta: se mudou, a
                  // pergunta fecha e o envio volta a pedir o PDF.
                  if (perguntas.confirmar()) void send();
                }}
                onVoltarECorrigir={() => {
                  const p = perguntas.pergunta;
                  perguntas.fechar();
                  // Pela porta da barra dos passos: chega ao INÍCIO do passo
                  // onde se corrige, não a meio dele (revisão de 14/11).
                  if (p) irParaPasso(passoParaCorrigir(p));
                }}
              />
            ) : envioAdiado.aEsperar ? (
              <div
                className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-2"
                role="status"
                aria-live="polite"
              >
                <span className="text-right text-sm text-[var(--bo-text)]">
                  A enviar para {quote.email || "o cliente"} em {envioAdiado.restam} s…{" "}
                  <span className="text-xs text-[var(--bo-text-muted)]">
                    Se saíres deste ecrã antes disso, não sai nada.
                  </span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={envioAdiado.cancelar}>
                    Cancelar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={envioAdiado.enviarJa}>
                    Enviar já
                  </Button>
                </span>
              </div>
            ) : confirmSend ? (
              /* ── A ÚLTIMA PERGUNTA, COM O QUE VAI LÁ DENTRO ───────────────
                 Dizia «Enviar para maria@example.pt?» e mais nada. É a acção
                 mais irreversível da casa — o PDF é desenhado, o email sai, a
                 proposta fica gravada e o casal lê-a — e a pergunta só
                 confirmava a MORADA. Tudo o que se pode ter enganado sem dar
                 por isso ficava de fora: a língua (tirou-se uma prova em
                 inglês no passo anterior e o selector ficou lá), o valor (o
                 total mudou depois de se rever) e o tamanho do documento (uma
                 página de inspiração que se removeu sem se dar conta).

                 Passa a dizer as quatro coisas: PARA QUEM, QUANTAS páginas, QUE
                 total, e EM QUE LÍNGUA. São exactamente os quatro dados que o
                 cliente vai ver, e é a última vez que alguém os pode olhar.

                 Os números saem de onde já saíam antes: `planoDoPdf` é a
                 mesma conta do «PDF com cerca de N páginas» que a barra mostra,
                 e `totais.aPagar` é o mesmo bloco de totais que o gerador do
                 PDF usa. Uma segunda conta aqui era garantir que um dia a
                 pergunta e o documento diziam números diferentes.

                 «cerca de» porque é isso que é: um texto muito longo empurra
                 uma secção para a folha seguinte (ver `pdf-editorial/plano.ts`),
                 e prometer um número exacto seria mentir na última frase. */
              <div className="ml-auto flex max-w-lg flex-col items-end gap-2">
                <p className="text-right text-sm leading-relaxed text-[var(--bo-tinta-72)]">
                  {/* O canal e o contacto CERTOS (auditoria de 14/11, n.º 3):
                      com «WhatsApp» isto perguntava pelo email. */}
                  {destinoDoEnvio(canal, quote.email, quote.phone).map((p, i) =>
                    p.contacto ? (
                      <strong key={i} className="font-medium text-[var(--bo-text)]">
                        {p.texto}
                      </strong>
                    ) : (
                      p.texto
                    ),
                  )}
                  ? Vai um PDF de cerca de {planoDoPdf.length} páginas,{" "}
                  {idiomaDoPdf === "en" ? "em inglês" : "em português"}, com{" "}
                  <strong className="font-medium text-[var(--bo-text)]">
                    {eur(totais.aPagar)}
                  </strong>{" "}
                  a pagar.
                </p>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmSend(false)}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      // Achado n.º 3: o «Confirmar» aparece onde estava a ponta
                      // direita do «Gerar e enviar», e o segundo clique de um
                      // duplo clique enviava sem a pergunta chegar a ser vista.
                      // Confirmar pede um gesto NOVO, depois de a ler.
                      if (
                        performance.now() - perguntaDoEnvioDesde.current <
                        CONFIRMAR_ENVIO_APOS_MS
                      ) {
                        return;
                      }
                      if (canal === "whatsapp") {
                        void send();
                        return;
                      }
                      setConfirmSend(false);
                      envioAdiado.agendar(() => enviarAgora.current());
                    }}
                    disabled={busy !== null}
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            ) : (
              /* ── O BOTÃO, E POR CIMA DELE A RAZÃO ────────────────────────
                 «Quando falta alguma coisa na proposta, quero que apareça um
                 aviso a dizer que não dá para enviar porque não preenchi tal
                 coisa.» A razão já existia — vivia no `title`, que num iPhone
                 não aparece. Passa a estar escrita ao lado do botão, com cada
                 falta a saltar para onde se resolve. */
              /* «Vai para …» AO LADO do botão e não por cima: eram dois
                 andares para uma frase de uma linha («barras muito mais
                 finas»). Quando há faltas, a caixa que as explica quebra para
                 cima sozinha (`flex-wrap`) — aí a altura é a mensagem. */
              <div className="ml-auto flex items-center gap-x-3">
                {barraCompacta && (
                  // Com uma falta que trava, a pastilha é um alarme e fica: o
                  // botão ao lado está apagado, e é ela que diz porquê.
                  <span data-acessorio-da-barra={oEnvioTrava ? undefined : ""} className="contents">
                    <PastilhaDoEnvio
                      faltas={faltasDoEnvio}
                      fotosPorConfirmar={fotosPorConfirmar}
                      idioma={idiomaDoPdf}
                      onAbrir={() => setFolhaDoEnvio(true)}
                    />
                  </span>
                )}
                {/* ── O TOTAL TAMBÉM AQUI (auditoria de 14/11, n.º 1) ─────────
                    «Não quero fazer scroll para saber quanto vai a proposta» —
                    e o último passo é onde mais se pergunta. Fica encostado ao
                    botão, como nos outros quatro; na barra compacta só o
                    número se vê, e «A pagar» continua a ouvir-se. */}
                {money.base > 0 && (
                  <p
                    data-total-da-barra
                    className="shrink-0 whitespace-nowrap text-xs tabular-nums text-[var(--bo-text-muted)]"
                  >
                    <span className={barraCompacta ? "sr-only" : "text-foreground/45"}>
                      A pagar{" "}
                    </span>
                    <strong className="font-semibold text-[var(--bo-text)]">
                      {eur(totais.aPagar)}
                    </strong>
                  </p>
                )}
                {/* ── O BOTÃO QUE GUIA (14/10) ──────────────────────────────
                    Quando a ÚNICA coisa que falta é ver o PDF final, o botão
                    deixa de estar apagado e passa a ser esse passo: «Ver o PDF
                    final» descarrega-o; depois «Está certo — enviar» regista
                    que foi visto e confirmado (o mesmo `confirmarPdfVisto` da
                    caixa do corpo do passo, que continua lá) e abre a pergunta
                    de sempre. Com outra falta qualquer fica apagado e diz
                    porquê; com tudo pronto, envia. */}
                {modoDoBotao === "ver" ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void preview()}
                    disabled={busy !== null}
                    iconRight={<span aria-hidden="true">↓</span>}
                    aria-label={barraCompacta ? "Ver o PDF final" : undefined}
                  >
                    {barraCompacta ? "Ver o PDF" : "Ver o PDF final"}
                  </Button>
                ) : modoDoBotao === "confirmar" ? (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      confirmarPdfVisto(true);
                      perguntaDoEnvioDesde.current = performance.now();
                      setConfirmSend(true);
                    }}
                    disabled={busy !== null}
                    iconRight={<span aria-hidden="true">→</span>}
                    aria-label={barraCompacta ? "Está certo — enviar" : undefined}
                  >
                    {barraCompacta ? "Enviar" : "Está certo — enviar"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      perguntaDoEnvioDesde.current = performance.now();
                      setConfirmSend(true);
                    }}
                    disabled={busy !== null || !canSend}
                    /**
                     * ── O BOTÃO DIZ O QUE FALTA ────────────────────────────
                     * Sai do MESMO sítio que trava o botão, portanto não pode
                     * discordar dele. A lista inteira, com os saltos, está na
                     * pastilha ao lado.
                     */
                    title={
                      canSend
                        ? undefined
                        : fotosPorConfirmar > 0
                          ? "Há fotos ainda a entrar na proposta. Falta pouco."
                          : faltasDoEnvio
                              .filter((f) => f.trava)
                              .map((f) => f.texto)
                              .join(" · ") || "Falta preencher a proposta antes de enviar."
                    }
                    iconRight={<span aria-hidden="true">→</span>}
                    // Compacta, o rótulo encurta; o nome que se ouve não muda.
                    aria-label={barraCompacta ? "Gerar e enviar ao cliente" : undefined}
                  >
                    {barraCompacta ? "Enviar" : "Gerar e enviar ao cliente"}
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {step === "enviar" && sent && (
          <>
            <Button size="sm" variant="ghost" onClick={() => irParaPasso("evento")}>
              ← Voltar ao evento
            </Button>
            {fimDoPdf.mostrar ? (
              <EmCurso
                emLinha
                className="ml-auto"
                titulo="A descarregar o PDF…"
                concluido={fimDoPdf.concluido}
                pronto="PDF pronto"
                {...(avancoDaEnviada
                  ? { feito: avancoDaEnviada.feito, total: avancoDaEnviada.total }
                  : { estimadoMs: 2_000 })}
              />
            ) : (
              <Button
                size="sm"
                variant="secondary"
                className="ml-auto"
                onClick={() => void descarregarAEnviada()}
                disabled={busy !== null}
              >
                Descarregar PDF
              </Button>
            )}
          </>
        )}
      </div>

      {/* NOTA SOBRE A BARRA ACIMA, medida a 375 px num iPhone SE:
          o `flex-wrap` estava a partir de 640 px (`sm:flex-wrap`), e abaixo
          disso a barra era uma fila rígida. No último passo ela leva o
          «← Pré-visualizar» e o «Gerar e enviar ao cliente» lado a lado: 222 px
          de botão numa barra de 351 px, com o botão a acabar em 390 px de um
          ecrã de 375. O último toque de toda a jornada de escrever uma proposta
          ficava cortado, e a 320 px faltavam 70 px.

          O `flex-wrap` passa a valer em todas as larguras: quando não cabem
          lado a lado, o botão principal desce para a linha de baixo, inteiro.
          Acima de 640 px nada muda, porque aí já cabiam. */}

      {/* A fotografia em grande, com as setas a percorrer as deste board. */}
      {lupa && (
        <LupaDeFotos
          aberta
          titulo={doc.moodBoards[lupa.bi]?.title ?? ""}
          urls={(doc.moodBoards[lupa.bi]?.images ?? []).map(
            (p) => assetOriginais[p] ?? assetUrls[p],
          )}
          indice={lupa.ii}
          onFechar={() => setLupa(null)}
          onMudar={(ii) => setLupa((l) => (l ? { ...l, ii } : l))}
        />
      )}

      {pdfNoEcra && (
        <VerOPdfNoEcra
          key={pdfNoEcra.id}
          aberto
          blob={pdfNoEcra.blob}
          titulo={pdfNoEcra.rascunho ? "Rascunho da proposta" : "O PDF final"}
          onFechar={() => setPdfNoEcra(null)}
          accoes={
            <>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => guardarNoDisco(pdfNoEcra.blob, pdfNoEcra.nome)}
                iconRight={<span aria-hidden="true">↓</span>}
              >
                Descarregar
              </Button>
              {!pdfNoEcra.rascunho && pdfVistoAgora && !pdfVisto?.confirmado && (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy !== null}
                  onClick={() => {
                    confirmarPdfVisto(true);
                    setPdfNoEcra(null);
                    // Quando ver o PDF era a ÚNICA coisa que faltava, segue
                    // logo para a pergunta de sempre — como o botão da barra.
                    if (soFaltaVerOPdf) {
                      perguntaDoEnvioDesde.current = performance.now();
                      setConfirmSend(true);
                    }
                  }}
                  iconRight={<span aria-hidden="true">→</span>}
                >
                  {soFaltaVerOPdf ? "Está certo — enviar" : "Está certo"}
                </Button>
              )}
            </>
          }
        />
      )}

      {paginaDaFoto && (
        <EscolherFotoDaPagina
          aberto={paginaDaFoto !== null && picker === null}
          nome={paginaDaFoto.nome}
          max={paginaDaFoto.max}
          lugares={lugaresDaPagina(paginaDaFoto.chave).map((r) =>
            r
              ? {
                  ref: r,
                  url: assetUrls[r] ?? (r.startsWith("data:") ? r : undefined),
                  original: assetOriginais[r],
                }
              : null,
          )}
          escolhida={paginaDaFoto.chave === "capa" || !!doc.fotosDasPaginas?.[paginaDaFoto.chave]}
          podeVoltarAoAutomatico={paginaDaFoto.chave !== "capa"}
          lugar={lugarDaFoto}
          formas={paginaDaFoto.formas}
          focos={focosDaPagina(paginaDaFoto.chave)}
          focoDela={
            paginaDaFoto.chave === "capa"
              ? !!doc.focoDaCapa
              : !!doc.fotosDasPaginas?.[paginaDaFoto.chave]?.focos?.[lugarDaFoto]
          }
          aspetos={aspetosDasFotos}
          onFoco={(f) => enquadrarNaPagina(paginaDaFoto.chave, paginaDaFoto.nome, lugarDaFoto, f)}
          fotosDaProposta={fotosDaProposta}
          paleta={
            paginaDaFoto.chave === "ambiente" ? (
              // As MESMAS fotografias e a mesma sugestão da secção de cima — as
              // do PDF (13/11: aqui lia-se a miniatura, de outras fotografias).
              <CoresDaPaleta
                quoteId={quote.id}
                fotos={fotosDaPaleta}
                refsDoPdf={refsDaPaleta}
                cores={paletaDaProposta(doc)}
                onMudar={mudarPaleta}
              />
            ) : undefined
          }
          carregar={
            <UploadArea
              label="Carregar uma fotografia"
              progresso={uploading[`pagina-${paginaDaFoto.chave}`]}
              multiple={false}
              curto
              onFiles={(files) => {
                const p = paginaDaFoto;
                const lugar = lugarDaFoto;
                handleUpload(`pagina-${p.chave}`, files.slice(0, 1), (paths) => {
                  if (paths[0]) porFotoNaPagina(p.chave, p.nome, p.max, lugar, paths[0]);
                });
              }}
            />
          }
          onLugar={setLugarDaFoto}
          onEscolher={(ref) =>
            porFotoNaPagina(
              paginaDaFoto.chave,
              paginaDaFoto.nome,
              paginaDaFoto.max,
              lugarDaFoto,
              ref,
            )
          }
          onQuantas={(n) => quantasNaPagina(paginaDaFoto.chave, paginaDaFoto.nome, n)}
          onAutomatico={() =>
            gravarFotosDaPagina(
              paginaDaFoto.chave,
              null,
              `«${paginaDaFoto.nome}» volta a escolher sozinha.`,
            )
          }
          onBiblioteca={() =>
            setPicker({
              kind: "pagina",
              chave: paginaDaFoto.chave,
              lugar: lugarDaFoto,
              max: paginaDaFoto.max,
            })
          }
          onFechar={() => setPaginaDaFoto(null)}
        />
      )}

      {avisoDeQualidade.dialogo}
      {pickerNoEcra && (
        <ThemePicker
          aberto={picker !== null}
          quoteId={quote.id}
          // A trocar UMA foto no lugar, escolher várias não faz sentido: as
          // outras iriam para o fim e a troca deixava de ser uma troca.
          multiple={pickerNoEcra.kind === "board" && pickerNoEcra.substituir === undefined}
          usedThemePaths={usedThemePaths}
          usadasNoutras={usadasNoutras}
          onClose={() => setPicker(null)}
          onPicked={onPickedFromLibrary}
          onReserve={onReservedFromLibrary}
          onDropped={onDroppedFromLibrary}
          lugar={
            pickerNoEcra.kind === "board"
              ? "tema"
              : pickerNoEcra.kind === "cover"
                ? "capa"
                : "pagina"
          }
          /* ── A PÁGINA QUE SE ESTÁ A COMPOR ─────────────────────────────
             Só para os mood boards: um mood board É uma página do PDF, com
             `MAXIMO_POR_PAGINA` fotos por página (acima disso, duas). As
             capas são uma foto por espaço — não há conjunto nenhum a compor, e
             o canto não teria o que dizer.

             Fora também quando se está a TROCAR uma foto no lugar: aí a página
             não cresce, e um contador a somar mais uma seria mentira. */
          paginaEmConstrucao={
            pickerNoEcra.kind === "board" && pickerNoEcra.substituir === undefined
              ? {
                  titulo: doc.moodBoards[pickerNoEcra.bi]?.title,
                  fotos: (doc.moodBoards[pickerNoEcra.bi]?.images ?? []).map((path) => ({
                    path,
                    url: assetUrls[path],
                    // O plano B, como na grelha aqui ao lado: uma miniatura que
                    // não existe cai para o original em vez de dar o ícone de
                    // imagem partida.
                    planoB: assetOriginais[path],
                  })),
                  maximo: MAXIMO_POR_PAGINA,
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
