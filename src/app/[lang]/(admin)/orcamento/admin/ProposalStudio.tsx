"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { quandoGravado } from "@/lib/quando-gravado";
import { rolarAteVer } from "@/lib/motion/rolar";
import { SAIDA_FUNDO, useSaidaDeUmSo } from "./ui/saida";
import { porqueFalhouOEnvio } from "./porque-falhou-o-envio";
import { useToast } from "./Toast";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import {
  withProposalDefaults,
  DEFAULT_CONDICOES_GERAIS,
  resolveProposalMoney,
  totalAmountParaBase,
  detectVatMode,
  parseMoneyText,
  normaliseCoverImages,
  countPendingImages,
  isPendingImage,
  stripPendingImages,
  DEFAULT_VAT_RATE,
  DEFAULT_VALID_DAYS,
  diasDeValidade,
  diaDoEvento,
  resolveValidUntil,
  soMudaramOsIds,
  type MoodBoard,
  type VatMode,
} from "@/lib/proposal-doc";
import {
  IDIOMA_POR_OMISSAO,
  camposDoEventoNaLingua,
  dataDoEventoPorExtenso,
  ehIdiomaDaProposta,
  isoDaDataPorExtenso,
  referenciaDoDocumento,
  type IdiomaDaProposta,
} from "@/lib/proposal-doc-textos";
import { ordemDeSaida, eAOrdemEscrita, aplicarOrdem, ORDEM_EXPLICITA } from "@/lib/proposal-ordem";
import {
  CONTAGEM_VAZIA,
  comAcontecimento,
  emPalavras,
  totalAte,
  type Contagem,
} from "@/lib/tempo-activo";
import { ehRefDeTema } from "@/lib/theme-ref";
import { linhasDeOrcamento } from "@/lib/orcamento/decoracao";
import {
  guestRangeLabel,
  ceremonyTypeLabel,
  spaceTypeLabel,
  eventTypeName,
} from "@/lib/orcamento/data";
import { log } from "@/lib/logger";
import { camposMudados, mesmoValor } from "@/lib/rascunho-juntar";
import { urlAindaBom } from "./assinatura";
import { relatarFalhaDeImagem } from "./relatar-falha";
import { pedirVezDeImagemPesada } from "./fila-de-imagens";
import PainelInterno from "./PainelInterno";
import Conferencia from "./Conferencia";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import EmailDoEnvio from "./EmailDoEnvio";
import Gralhas from "./Gralhas";
import MoodBoardIndice from "./MoodBoardIndice";
import PainelDoEstudio from "./PainelDoEstudio";
import { useLarguraDaZona } from "./useMedida";
import { useFotoComPlanoB } from "@/lib/useFotoComPlanoB";
import AEnviarAProposta from "./AEnviarAProposta";
import { BotaoWhatsApp } from "./ui/BotaoWhatsApp";

/** Por onde a proposta segue. Ver a nota longa no `canal`, dentro do estúdio. */
type CanalDeEnvio = "email" | "whatsapp" | "ambos";
/** Onde fica a última escolha dela. */
const CANAL_GUARDADO = "liquen-canal-de-envio";
import PorqueNaoDaParaEnviar from "./PorqueNaoDaParaEnviar";
import { ControlosDoEnvio, PainelDoEnvio, PastilhaDoEnvio } from "./BarraDoEnvioCompacta";
import VistaDeConjunto from "./VistaDeConjunto";
import EscolherDisposicao from "./EscolherDisposicao";
import PaginaEditorial, { fontesDasFolhas } from "./PaginaEditorial";
import { useFotosDoPdf } from "./useFotosDoPdf";
import EscolherFotoDaPagina from "./EscolherFotoDaPagina";
import { VerOPdfNoEcra } from "./VerOPdfNoEcra";
import { useAnular } from "./ui/anular";
import LupaDeFotos from "./LupaDeFotos";
import {
  ArrastoDosMoodBoards,
  CartaoDeBoard,
  CelulaDeFoto,
  GrelhaDeFotos,
  ListaDeBoards,
  type LargadaDeFoto,
} from "./MoodBoardFotos";
import { fotoPrincipalDe, marcaDepoisDeMexer } from "@/lib/proposal-moodboard";
import {
  chaveDoCampo,
  corrigirGralha,
  corrigirTudo,
  gralhasDoDocumento,
  seccaoDoCampo,
  tirarSimbolos,
  type CampoDeTexto,
  type CampoPublicado,
} from "@/lib/proposal-ortografia";
import { fotosQueDestoam, ordemPorCor } from "@/lib/cor-dominante";
import {
  comNovaAmostra,
  orcamentoDeTempo,
  passaDoAnexo,
  tamanhoEmPalavras,
  tamanhoEstimado,
  tempoEmPalavras,
  tempoEstimado,
  type AmostraDeGeracao,
} from "@/lib/custo-do-pdf";
import Versoes, { type VersaoEnviada } from "./Versoes";
import { comoSeDiz, noMesmoEspaco, type FotoRepetida } from "@/lib/orcamento/fotos-repetidas";
import { marcarExtra, opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { custosDe, margemTotal } from "@/lib/orcamento/margem";
import { useDefinicoesDaProposta } from "./definicoes-da-proposta";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  convidadosDoDoc,
  escalasDe,
  formulaDaLinha,
  recalcular,
  totalDaLinha,
  type TipoDeEscala,
} from "@/lib/orcamento/escala";
import CriarAPartirDe, { type Escolha } from "./CriarAPartirDe";
import ModelosParciais from "./ModelosParciais";
import EditorDeEscolhas, { type FotoDisponivel } from "./EditorDeEscolhas";
import NavEstudio from "./NavEstudio";
import NotasInternas from "./NotasInternas";
import AvisoDataOcupada from "./AvisoDataOcupada";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "@/lib/proposal-progress";
import { hojeNoEstudio } from "@/lib/fuso";
import {
  FRASE_DO_ESTADO,
  PASSOS,
  estadoDosPassos,
  nomeDoPasso,
  passoAoLado,
  passoDaSeccao,
  type EstadoDoPasso,
  type Passo,
} from "@/lib/orcamento/passos-do-estudio";
import {
  capituloDoTema,
  composicaoEmPalavras,
  MAXIMO_POR_PAGINA,
  ordemDoDesenho,
  paginasDoTema,
  planoDaProposta,
  temasComPagina,
} from "@/lib/pdf-editorial/plano";
import { NOME_DA_DISPOSICAO, disposicaoDoTema, type Disposicao } from "@/lib/pdf-editorial/mosaico";
import { avisoDeTituloParecido, titulosParecidos } from "@/lib/proposal-titulos-parecidos";
import { depositPercentOf } from "@/lib/proposal-doc";
import { ASPETO_POR_OMISSAO, PERDA_QUE_SE_AVISA } from "@/lib/proposal-geometria";
import {
  LADO_MINIMO_DA_CAPA,
  perdaNaFolha,
  problemaDaCapa,
  ASPETO_DA_FOLHA,
} from "@/lib/pdf-editorial/regra-da-capa";
import { useTamanhoDoOriginal } from "./tamanhoDoOriginal";
import { ArrastarParaEnquadrar } from "./ArrastarParaEnquadrar";
import { LogotipoEmail, LogotipoWhatsApp } from "./LogotiposDosCanais";
import { tecladoAberto } from "@/lib/orcamento/barra-de-destinos";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { CampoAMudar } from "@/lib/proposal-copy";
import {
  adicionarLinha,
  definirItem,
  definirPreco,
  desalinhamento,
  linhasDe,
  normalizarValor,
  precosDe,
  removerLinha,
  somaDosExtrasSemIva,
  totaisDaProposta,
  dinheiroDaProposta,
  asDuasFormas,
} from "@/lib/proposal-budget";
import { eur, eurDocumento, montanteNaLingua, round2, SINAL_POR_OMISSAO } from "@/lib/money";
import { resumoDaPropostaParaCopiar } from "@/lib/email-proposta-textos";
import { linkDoWhatsApp } from "@/lib/whatsapp";
import { randomId } from "./util";
import type { ActivityEntry, Quote } from "@/lib/orcamento/types";
import { prepareImageWithThumb, type ImageKind } from "./image-prep";
import ThemePicker, { type ImportedImage, type ReservedImage } from "./ThemePicker";
import ServicesEditor, { MoveBtns } from "./ServicesEditor";
import CaixaInglesa from "./CaixaInglesa";
import PorTraduzir from "./PorTraduzir";
import FotosEmFalta from "./FotosEmFalta";
import {
  aplicarTraducao,
  estadoDaTraducao,
  motorPelaRota,
  traduzirParaIngles,
  type EstadoDaTraducao,
} from "@/lib/proposal-traducao";
import {
  camposPorRever,
  camposPorTraduzir,
  docTemIngles,
  confirmarTraducao,
  escreverEn,
  estadoDoIngles,
  lerEn,
  porTraduzirPorSeccao,
} from "@/lib/proposal-doc-bilingue";
import { aquecerBiblioteca, aquecerFotosEmSegundoPlano } from "./theme-picker-cache";
// A espera desenhada de uma maneira só. Ver `ui/EmCurso.tsx`: uma barra, um
// ponto a pulsar, e a contagem quando o código sabe contar — este ficheiro não
// inventa nenhuma espera sua.
import { Ajuda, Button, Card, EmCurso, Field, FolhaOuDialogo, Segmented } from "./ui";
import { useFimVisivel } from "./ui/EmCurso";
import { descarregar, type Avanco } from "./ui/descarregar";
import { useAlturaDoConteudo } from "./ui/altura-do-conteudo";
import {
  eCasamento,
  pedidoECasamento,
  SUGESTOES_DE_TIPO,
  tipoDoEventoDoPedido,
} from "@/lib/proposal-evento";
import {
  baseParaOEstudio,
  degrauDosAdicionais,
  precoDoPedidoParaBase,
  type ContextoDoPreco,
} from "@/lib/preco-do-pedido";
import { ESTADO, PRESSAO } from "./ui/movimento";
import { useEnvioAdiado } from "./ui/envio-adiado";

/**
 * Visual editor for the studio's multi-page proposal PDF. Produces a
 * {@link ProposalDoc}-shaped payload (minus the fixed boilerplate, which the
 * server fills via {@link withProposalDefaults}) and previews / e-mails it.
 */
type StudioDoc = Parameters<typeof withProposalDefaults>[0];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O painel «O que vai sair» aparece a partir daqui.
 *
 * A PERGUNTA MUDOU: NÃO É QUE LARGURA TEM A JANELA, É QUE LARGURA TEM A FILA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era `(min-width: CORTES.largo)` — uma consulta à JANELA. A regra que
 * aqui estava escrita continua de pé, e é a que evita o defeito que já custou
 * uma vez (a miniatura da página e o painel a aparecerem os DOIS entre 1440 e
 * 1535): há UM número só, e um só sítio a respondê-lo — aqui, com o
 * `PainelDoEstudio` a receber a resposta em vez de a repetir. O número estava
 * certo; a PERGUNTA é que estava errada.
 *
 * Palavras dela, com uma captura do estúdio: «isto no back office está tudo com
 * bugs e todo desformatado».
 *
 * MEDIDO num Chromium, no painel que abre a partir do cartão de um cliente —
 * que é por onde ela lá chega:
 *
 *     janela 1366   a coluna onde ela escreve tem 368 px   legível
 *     janela 1440   a coluna onde ela escreve tem  82 px   ← alargar PIOROU
 *     janela 1600   ...............................136 px
 *     janela 2000   ...............................136 px
 *
 * A conta: o painel de detalhe tem um tecto próprio (`max-w-3xl`) que corta a
 * fila a 712 px, por mais largo que seja o ecrã. As duas colunas laterais são
 * `shrink-0` e pedem, sem negociar, 192 + 24 + 336 + 24 = 576. Sobram 136 para
 * a coluna onde se escreve — e o `min-w-0` dela, que existe para um filho longo
 * não rebentar a caixa, deixa-a descer até lá sem se queixar.
 *
 * A 1440 é ainda pior (82 px) porque é exactamente aí que o painel entra: a
 * janela cresce 74 px e a coluna perde 286.
 *
 * ── O NÚMERO, E DE ONDE VEM ───────────────────────────────────────────────
 *
 * A fila precisa de caber as duas colunas que não encolhem (192 + 336), as
 * duas folgas (24 + 24) e uma coluna de escrita que se leia. O `@min-[26rem]`
 * é o degrau que as grelhas desta coluna usam para passarem a duas colunas —
 * portanto 26rem (416 px) é a largura abaixo da qual ela deixa de fazer o que
 * foi desenhada para fazer. 576 + 416 = 992.
 *
 * Abaixo disso o painel não se monta, e a coluna de escrita fica com a fila
 * inteira. É a mesma decisão de sempre — «quando o painel é desenhado é porque
 * cabe» — mas agora medida onde ele aterra.
 */
const LARGURA_MINIMA_DA_FILA = 992;
/** Abaixo disto (a caixa do estúdio, não a janela) a barra do envio fica
 *  compacta — uma linha, e o resto numa folha. 40rem, a mesma medida que a
 *  barra já usa para deixar de ocupar a largura toda. */
const LARGURA_DA_BARRA_INTEIRA = 640;

// ── Shared styling (matches ProposalBuilder / PaymentsPanel) ──
/**
 * Fotos a preparar/enviar ao mesmo tempo num carregamento. Quatro é o mesmo
 * número que a Biblioteca de Temas usa: chega para a rede nunca ficar parada à
 * espera do processador (nem o contrário) sem encher a ligação da Catarina, que
 * é a mesma por onde ela está a trabalhar.
 */
const UPLOAD_CONCURRENCY = 4;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DEMORA UMA TRADUÇÃO — E PORQUE É QUE ISTO É UM PALPITE E NÃO UMA CONTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A espera da tradução é OPACA vista daqui, e não por preguiça: o estúdio faz
 * UM pedido à rota (`motorPelaRota` só parte em vários acima de 300 campos, e
 * uma proposta pesada tem ~218). Os lotes de 50 que se veem no código são do
 * outro lado da rota — é o motor do serviço que os manda, um a seguir ao
 * outro, e do lado de cá não há nenhum sinal de que o terceiro acabou.
 *
 * Partir o pedido aqui para poder contar os lotes seria trocar um pedido por
 * cinco: mais viagens na rede dela para desenhar uma barra. Uma animação que
 * atrasa a tarefa que retrata não se faz, e por isso isto fica um palpite.
 *
 * O palpite, escrito para poder ser corrigido: uma ida à rota mais a resposta
 * do serviço rondam o segundo, e cada lote de 50 campos que o serviço manda a
 * seguir custa outro tanto. Sobra por cima do que se mede num portátil, porque
 * quem espera está numa quinta com 4G — e a curva do `EmCurso` perdoa um erro
 * de dois para um: o que ela não perdoa é uma barra que chega ao fim e fica lá.
 */
const TRADUCAO_MS_FIXOS = 800;
const TRADUCAO_MS_POR_LOTE = 1_500;
/** O tamanho do lote do motor do serviço (`MAX_TEXTOS_POR_PEDIDO`, no DeepL). */
const TRADUCAO_CAMPOS_POR_LOTE = 50;

/** Quanto tempo, mais ou menos, traduzir `campos` campos de prosa. */
function esperaDaTraducao(campos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, campos) / TRADUCAO_CAMPOS_POR_LOTE));
  return TRADUCAO_MS_FIXOS + TRADUCAO_MS_POR_LOTE * lotes;
}

/**
 * Quanto demora copiar `fotos` fotografias de um modelo para este pedido.
 *
 * Também opaca, e também um pedido só (`/api/propostas/copiar`): o servidor
 * copia OITO de cada vez (`EM_PARALELO`, em `proposal-storage`), cada foto são
 * duas cópias no armazenamento — o original e a miniatura —, e nada disso é
 * observável daqui. O palpite é essa aritmética, com a folga de sempre para a
 * rede de quem espera.
 */
const COPIA_FOTOS_EM_PARALELO = 8;
function esperaDaCopiaDeFotos(fotos: number): number {
  const lotes = Math.max(1, Math.ceil(Math.max(0, fotos) / COPIA_FOTOS_EM_PARALELO));
  return 900 + 1_500 * lotes;
}

const INPUT_SM = "bo-input min-w-0 px-3 py-2 text-xs text-[var(--bo-text)]";
const ADD_BTN =
  "alvo-toque !justify-start gap-1 text-xs font-medium text-sage-600 hover:text-[var(--bo-accent-hover)] inline-flex items-center";
const REMOVE_BTN =
  "alvo-toque text-foreground/30 hover:text-[var(--bo-perigo)] text-base leading-none shrink-0";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM AVISO QUE NÃO PODE SER CORTADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"9 fotos numa página: cada uma fica peque…" — cortado à
 * direita, no editor de mood boards, por cima da grelha de fotos dessa página».
 *
 * ── Porque é que um parágrafo que quebra saía cortado ─────────────────────
 *
 * Porque `white-space` e `text-overflow` HERDAM-SE. Um `truncate` em qualquer
 * antepassado deste parágrafo — e o cartão de um board tem cabeçalhos, tiras e
 * linhas de resumo que o usam — desce até aqui como `white-space: nowrap` mais
 * `text-overflow: ellipsis`, e o `overflow: hidden` desse antepassado faz o
 * resto. O parágrafo não precisa de ter classe nenhuma para sair com «…»: basta
 * estar debaixo de alguém que a tenha.
 *
 * Por isso a defesa é aqui e é explícita: este parágrafo declara que quebra,
 * seja o que for que lhe esteja por cima. `whitespace-normal` corta a herança
 * do `nowrap`, e o `overflow-wrap: anywhere` garante que uma palavra comprida
 * também não empurra a linha para fora.
 *
 * ── E porque é que é uma constante ────────────────────────────────────────
 *
 * Porque são dois avisos irmãos — «a página está a ficar cheia» e «estas não
 * são impressas» — e o segundo é o mais grave dos dois. Corrigir um e deixar o
 * outro à mercê do mesmo antepassado era resolver metade do problema no sítio
 * onde ele importa menos.
 */
const AVISO_DO_BOARD =
  // Sem cor: os dois avisos têm cores diferentes, e duas classes `text-*` na
  // mesma string não se resolvem pela ordem em que estão escritas — quem ganha
  // é a que aparece depois na FOLHA DE ESTILO. O aviso vermelho podia sair
  // cinzento sem ninguém perceber porquê.
  "mb-2 text-xs leading-relaxed whitespace-normal [overflow-wrap:anywhere]";

/* ── Os campos que o estúdio semeia a partir do pedido ─────────────────────
 *
 * O tipo, a data e a referência nascem escritos por NÓS, em português — e é
 * exactamente por isso que o gerador do PDF os sabe reescrever na língua do
 * casal quando ninguém lhes mexeu (ver «OS CAMPOS QUE O NOSSO CÓDIGO ESCREVEU»,
 * em `proposal-doc-textos.ts`). Esse reconhecimento é uma COMPARAÇÃO com o que
 * estas três funções produzem: uma cópia local do nome do tipo, dos meses ou da
 * forma da referência divergia um dia da de lá, e a partir desse dia a proposta
 * inglesa voltava a sair com a data em português — sem erro nenhum pelo
 * caminho. Por isso nenhuma delas escreve texto seu: pedem-no a quem o tem. */

/* Nunca «Casamento» por omissão: era o que fazia um pedido «Outro» — um
 * restaurante no Halloween — abrir como um casamento (ver `proposal-evento.ts`). */
function eventTypeLabel(q: Quote): string {
  return tipoDoEventoDoPedido(q);
}

/** yyyy-mm-dd → "12 de setembro de 2026"; passes through anything else. */
function formatEventDate(d?: string): string {
  if (!d) return "";
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(d);
  return iso ? dataDoEventoPorExtenso(iso[0]) : d;
}

function buildRef(d: StudioDoc): string {
  return referenciaDoDocumento(d);
}

/** "Maria & Zé" a partir dos nomes que o casal deu, ou "" se não deu nenhum.
 *  Com um só nome escrito, devolve esse — meio par continua a ser melhor do que
 *  o nome de quem preencheu o formulário. */
function nomesDoCasal(quote: Quote): string {
  const par = [quote.partnerA, quote.partnerB].map((n) => n?.trim()).filter(Boolean);
  return par.join(" & ");
}

function initialDoc(quote: Quote): StudioDoc {
  const base: StudioDoc = {
    template: "decoracao",
    ref: "",
    // Se o casal escreveu os dois nomes no pedido, a proposta abre dirigida a
    // ELES. O `quote.name` é de quem escreveu — pode ser a mãe da noiva ou uma
    // planner, e uma proposta endereçada a quem preencheu o formulário em vez
    // de a quem casa lê-se como um erro de quem a mandou.
    clientNames: nomesDoCasal(quote) || (quote.name ?? ""),
    eventType: eventTypeLabel(quote),
    eventDate: formatEventDate(quote.date),
    /**
     * ── O LOCAL LEVA O ESPAÇO ATRÁS ──────────────────────────────────────────
     *
     * «Quero que o sistema coloque logo isto no back office, nos espaços a
     * fazer a proposta.» Fui contar o que o pedido responde contra o que a
     * proposta recebia: das sete respostas, SEIS já chegavam sozinhas — o
     * casal, a data, os convidados, o local, a cerimónia, e os pontos de
     * decoração, que viram as linhas do orçamento.
     *
     * Faltava o ESPAÇO. O casal responde «Exterior», «Interior» ou «Interior e
     * exterior», e essa resposta morria no pedido: quem escrevia a proposta
     * tinha de voltar lá para se lembrar se era ao ar livre.
     *
     * Vai junto ao local, com um ponto a separar — «Setúbal Alentejo ·
     * Exterior» — e não num campo novo. Uma linha a mais no documento do casal
     * é uma decisão sobre o papel que sai; um local mais completo é a mesma
     * linha a dizer mais. E o casal, ao ler, vê que percebemos o que respondeu.
     *
     * Como tudo o resto aqui, é uma SEMENTE: o campo continua editável, e o
     * local da proposta acaba quase sempre mais preciso do que o do pedido
     * («Herdade da Malhadinha» em vez de «Alentejo»). Quando ela o reescrever,
     * reescreve a linha inteira, que é o que já fazia.
     *
     * Sem espaço respondido, fica só o local — nunca um ponto pendurado no fim.
     */
    location: [quote.location ?? "", spaceTypeLabel(quote.spaceType)]
      .map((p) => p.trim())
      .filter(Boolean)
      .join(" · "),
    // Sem número exacto, vale a ordem de grandeza que o casal deu ("100 a 150").
    // Escrever "0 pax" era pior do que não escrever nada.
    guests: quote.guests ? `${quote.guests} pax` : guestRangeLabel(quote.guestsRange),
    // A cerimónia que o casal escolheu no pedido, já escrita no documento.
    // O campo existe desde sempre («Civil, simbólica») e abria vazio, para ela
    // preencher à mão a partir do que estivesse no pedido — que era exactamente
    // onde a resposta se perdia. Continua editável: isto é uma semente, não uma
    // trave, e um casal que muda de ideias muda-se aqui.
    //
    // Em português mesmo quando o pedido veio em inglês: o documento do estúdio
    // é escrito em português.
    // Só num casamento: «Cerimónia» numa proposta para um restaurante é um
    // campo de outro evento.
    ceremony: eCasamento(eventTypeLabel(quote)) ? ceremonyTypeLabel(quote.ceremonyType) : "",
    time: "",
    serviceGroups: [],
    moodBoards: [],
    cronograma: [],
    budgetItems: [],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    budgetRows: [],
    totalEstimatedText: "",
    budgetNote: "",
    coverImages: normaliseCoverImages(),
  };
  base.ref = buildRef(base);
  return base;
}

/**
 * Passos do fluxo guiado do estúdio — os cinco do documento dela (A2). O que
 * vive em cada passo, e o estado de cada um, está em `passos-do-estudio.ts`.
 */
type Step = Passo;
/**
 * Em que pé está a leitura dos URL das fotografias.
 *
 * Três estados e não um booleano, porque a diferença entre «vem a caminho» e
 * «não veio» é a diferença entre esperar e agir — e era exactamente essa que o
 * ecrã não tinha (ver `estadoDosUrls`).
 */
type EstadoDosUrls = "a-caminho" | "pronto" | "falhou";

/** Os passos do formulário — os quatro que vivem no contentor sempre montado. */
const PASSOS_DO_FORMULARIO: readonly Step[] = ["evento", "servicos", "inspiracao", "orcamento"];

/** Numa proposta nova/vazia, semeia um grupo de serviços com um item — para que
 *  o estúdio não abra como uma parede de botões "+ Adicionar" vazios. Nunca
 *  toca num rascunho que já tenha conteúdo. */
/**
 * Põe a BASE (o "Preço final (sem IVA)" do pedido) no documento, respeitando o
 * modo de IVA em vigor.
 *
 * `resolveProposalMoney` lê `totalAmount` como a base em "acrescer" e como o
 * BRUTO em "incluído" — por isso o valor guardado tem de ser derivado, para a
 * base ser sempre o número do pedido nos dois modos.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO DO PEDIDO NÃO É O NÚMERO QUE ELA ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com «estes valores somam-se», estes dois números são DIFERENTES:
 *
 *   · o que ela escreve em «Valor (sem IVA)» — só os serviços;
 *   · o «Preço final (sem IVA)» do pedido — o que o casal paga, ou seja os
 *     serviços MAIS os adicionais. É de lá que a Visão Geral, as Estatísticas
 *     e o dossier leem o dinheiro, e guardar lá só os serviços fazia as
 *     deslocações desaparecerem desses ecrãs em silêncio.
 *
 * Há portanto duas conversões, inversas uma da outra:
 *
 *   escrito → pedido   soma os adicionais   (`baseDoEcraParaOPedido`)
 *   pedido  → escrito  tira-os              (esta)
 *
 * ── O DEFEITO QUE ISTO VEIO FECHAR ────────────────────────────────────────
 *
 * Palavras dela: «ao voltar à mesma proposta, o valor total está diferente».
 * Numa proposta observada: 3.000 → 3.140 → 3.280 → 3.420, com uma deslocação
 * de 140 €. Três visitas, três somas.
 *
 * A causa era esta função existir e NÃO ser usada na abertura. A montagem
 * fazia `setTotalInput(textoDoTotal(quote.quotedPrice))` — punha no campo do
 * ESCRITO um número que já trazia os adicionais lá dentro. A partir daí tudo
 * o que lesse esse campo como «os serviços» voltava a somar-lhes a deslocação:
 * a gravação seguinte punha 3.140 + 140 no pedido, e a visita seguinte
 * começava daí.
 *
 * Vive no topo do módulo, e não dentro do componente, por causa disso mesmo:
 * era uma função interna que dois caminhos deviam usar e só um usava. Aqui
 * fora, os dois vêem-na e o teste também.
 */
/**
 * A conta vive agora em `lib/preco-do-pedido`, ao lado da sua INVERSA.
 *
 * Estavam separadas — a ida aqui, a volta dentro do componente — e nada as
 * obrigava a concordar. Quando não concordam, o preço da proposta desloca-se a
 * cada abertura, e a deslocação acumula: 3.000 → 3.140 → 3.280 → 3.420, com
 * uma deslocação de 140 €. O que estava errado não era a conta; era haver duas.
 *
 * E devolve `null` — não zero — quando o preço do pedido é MENOR do que os
 * adicionais escritos. Zero era uma mentira com consequências: a volta mandava
 * 0 + 140 = 140 € para o pedido, e um pedido de 100 € passava a 140 € sem
 * ninguém lhe ter tocado. Ver o cabeçalho de lá.
 */
function baseDoPedidoParaOEcra(base: number, d: StudioDoc): number | null {
  return baseParaOEstudio(base, d as unknown as ContextoDoPreco);
}

function aplicarBase(d: StudioDoc, base: number): StudioDoc {
  const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
  const rate = d.vatRate ?? DEFAULT_VAT_RATE;
  // A conta é a partilhada, e não uma cópia: arredondar a base ANTES de a
  // multiplicar é o que faz base → bruto → base devolver o mesmo número. Feita
  // à mão aqui, uma base com mais de dois decimais perdia um cêntimo em cada
  // ida e volta, e o campo mudava sozinho debaixo dos dedos dela.
  const amount = totalAmountParaBase(base, mode, rate);
  const text = mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  return d.template === "organizacao"
    ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
    : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
}

/**
 * A BASE (sem IVA) de um documento, seja qual for o modo.
 *
 * O campo do estúdio mostra SEMPRE a base — é o número que o pedido guarda e o
 * que o rótulo "(sem IVA)" promete. Mas `totalAmount` só é a base em modo
 * "acrescer"; em "incluído" é o BRUTO. Encher o campo com o valor cru mostrava
 * 9963 onde o pedido dizia 8100. Medido.
 */
function baseDoDoc(d: Partial<StudioDoc>): number | undefined {
  const m = resolveProposalMoney(d as StudioDoc);
  return m.base > 0 ? m.base : undefined;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CAMPOS QUE DECIDEM O DINHEIRO — E SÓ ESSES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o conjunto exacto que `totaisDaProposta` lê para desenhar o quadro do PDF:
 * o valor, o modo e a taxa de IVA, os textos de display, as linhas adicionais e
 * a regra com que elas contam, e a percentagem do sinal. Nada mais.
 *
 * Existe para repor o dinheiro de uma proposta ENVIADA sem lhe repor o resto: o
 * texto, as fotografias e os mood boards podem ter sido escritos DEPOIS do
 * envio, são trabalho dela, e nunca estiveram em causa. «Se falhar, não perder
 * trabalho» é a regra da casa, e trocar o documento inteiro para acertar um
 * número era perdê-lo.
 *
 * Os campos são copiados MESMO QUANDO NÃO EXISTEM no documento enviado (fica
 * `undefined`), e é de propósito: uma proposta que seguiu sem `vatRate` não
 * pode ficar com a taxa que o rascunho deste aparelho entretanto ganhou.
 */
/** «em 12 de setembro de 2026». Uma data sem dia lê-se mal ao lado de dois
 *  números; uma data ilegível não se escreve de todo. */
function dataDoEnvioPorExtenso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "num envio anterior";
  return `em ${d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}`;
}

const CAMPOS_DO_DINHEIRO = [
  "totalAmount",
  "totalVatMode",
  "vatRate",
  "totalText",
  "totalEstimatedText",
  "budgetExtras",
  "budgetExtrasSomam",
  "depositPercent",
] as const;

function dinheiroDoDocumento(d: Partial<StudioDoc>): Partial<StudioDoc> {
  const saida: Record<string, unknown> = {};
  const origem = d as unknown as Record<string, unknown>;
  for (const campo of CAMPOS_DO_DINHEIRO) saida[campo] = origem[campo];
  return saida as Partial<StudioDoc>;
}

function seedDefaults(d: StudioDoc, quote: Quote): StudioDoc {
  const quotedPrice = quote.quotedPrice;
  // O que o casal marcou no pedido de orçamento. É a razão de ser desta
  // funcionalidade: a proposta da Catarina Martins saiu com cinco pontos, ela
  // pediu para refazer com três, e o trabalho teve de ser todo repetido. Se o
  // casal já disse o que quer, a proposta abre com esses pontos e mais nenhum.
  const linhas = linhasDeOrcamento(quote.decorPoints ?? []);
  let next = d;
  if (next.serviceGroups.length === 0) {
    next = {
      ...next,
      serviceGroups: [
        linhas.length > 0
          ? {
              letter: "a)",
              title: "Decoração Floral e Decoração",
              items: linhas.map((label) => ({ label, desc: "" })),
            }
          : { letter: "a)", title: "", items: [{ label: "", desc: "" }] },
      ],
    };
  }
  // O quadro "3. Orçamento Proposto" com as mesmas linhas. Sem preços: o valor
  // continua a ser um só, no total, tal como nas propostas dela.
  if (next.budgetItems.length === 0 && linhas.length > 0) {
    next = { ...next, budgetItems: [...linhas] };
  }
  /**
   * ── OS ADICIONAIS SOMAM, NAS PROPOSTAS NOVAS ─────────────────────────────
   *
   * Palavras dela, a olhar para o quadro que dizia «Subtotal 2.860 +
   * Deslocação 140 = Total 3.000»: «não quero que a parte dos serviços apareça
   * como base somada à deslocação; quero que seja três mil mais a deslocação da
   * equipa, que dá três mil e cento e quarenta».
   *
   * O selector por proposta continua a existir, e continua a poder ser mudado
   * nos dois sentidos. O que muda é o lado para que ele nasce virado, porque
   * ter de o trocar em cada proposta transforma a decisão dela num passo que se
   * esquece — e um passo esquecido aqui é uma deslocação que a casa não cobra.
   *
   * ── E AS PROPOSTAS QUE JÁ EXISTEM ────────────────────────────────────────
   * Não mudam. Isto só escreve quando o campo AINDA NÃO EXISTE no documento, e
   * o `seedDefaults` só corre quando não há rascunho gravado. Uma proposta já
   * enviada continua a ler-se exactamente como o casal a recebeu, e um rascunho
   * a meio mantém a regra com que nasceu — quem a quiser mudar tem o selector.
   */
  if (next.budgetExtrasSomam === undefined) {
    next = { ...next, budgetExtrasSomam: true };
  }
  // O valor vem do "Preço final (sem IVA)" do pedido, e é o mesmo número —
  // não há aqui um segundo. A condição `== null` que aqui estava era a origem
  // do defeito: uma vez semeado, o estúdio deixava de acompanhar o pedido e os
  // dois números separavam-se em silêncio. Agora semeia-se SEMPRE, e o efeito
  // de sincronização trata das alterações posteriores.
  if (typeof quotedPrice === "number" && quotedPrice > 0) {
    // `totalAmount` NÃO é o preço do pedido: é a base em «acrescer» e o BRUTO
    // em «IVA incluído». Escrever aqui o líquido cru fazia uma proposta já em
    // «IVA incluído» perder 23% em silêncio — o número do pedido passava a ser
    // lido como se já trouxesse o imposto dentro.
    const modo: VatMode = next.totalVatMode ?? "acrescer";
    // Pela mesma razão da abertura: o preço do pedido traz os adicionais lá
    // dentro e este campo significa só os serviços. Num pedido virgem não há
    // adicionais e a conversão não faz nada — mas um pedido cujo rascunho foi
    // limpo TEM preço com adicionais somados, e sem isto voltava a nascer
    // inflacionado.
    const escrito = baseDoPedidoParaOEcra(quotedPrice, next);
    // `null` = a conta não dá (o preço do pedido é menor do que os adicionais).
    // Deixa-se o documento como está: o aviso de desalinhamento já diz o que se
    // passa, e inventar um zero aqui fazia o preço do PEDIDO subir na gravação
    // seguinte.
    if (escrito != null) {
      next = {
        ...next,
        totalAmount: totalAmountParaBase(escrito, modo, next.vatRate ?? DEFAULT_VAT_RATE),
        totalVatMode: modo,
      };
    }
  }
  return next;
}

/**
 * Quantos passos atrás o Cmd+Z consegue ir.
 *
 * Cada passo é um documento inteiro em memória. Cinquenta chegam de sobra
 * para desfazer um engano — ninguém carrega em Cmd+Z cinquenta vezes seguidas
 * — e mantêm a conta de memória modesta mesmo numa proposta com muitos mood
 * boards (os documentos guardam caminhos de fotos, não bytes).
 */
const MAX_HISTORICO = 50;

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/**
 * Reescreve TODAS as posições de foto do documento (capas + mood boards) com
 * `f`, que devolve o caminho novo ou `null` para a foto sair.
 *
 * Um só sítio a andar por dentro do documento à procura de fotos, porque as
 * duas operações do estado provisório — trocar o marcador pelo caminho
 * definitivo e tirar o marcador que ficou sem foto — têm de tratar os DOIS
 * sítios da mesma maneira, e falhar um deles deixaria um `pending:` para trás.
 *
 * Numa capa, "sair" é ficar `""` e NÃO encolher o array: é a posição que decide
 * o lado onde a foto é impressa. Num mood board é ordem, e sai mesmo.
 *
 * Devolve o mesmo objeto quando nada muda — uma entrega que já não encontra o
 * seu lugar (a foto foi removida à mão entretanto) não pode marcar o rascunho
 * como alterado.
 */
function mapImagePaths(d: StudioDoc, f: (path: string) => string | null): StudioDoc {
  let changed = false;
  const cover = normaliseCoverImages(d.coverImages).map((p) => {
    if (!p) return p;
    const next = f(p);
    if (next === p) return p;
    changed = true;
    return next ?? "";
  });
  const boards = d.moodBoards.map((b) => {
    let touched = false;
    const images: string[] = [];
    for (const p of b.images) {
      const next = f(p);
      if (next !== p) touched = true;
      if (next !== null) images.push(next);
    }
    if (!touched) return b;
    changed = true;
    return { ...b, images };
  });
  // As que ela escolheu para as páginas do PDF (`fotosDasPaginas`): como num
  // mood board, a que sai deixa a página com menos uma (e, sem nenhuma, a
  // página volta a escolher sozinha).
  let paginas = d.fotosDasPaginas;
  if (paginas) {
    const novas: NonNullable<StudioDoc["fotosDasPaginas"]> = {};
    for (const [chave, e] of Object.entries(paginas)) {
      const fotos: string[] = [];
      const focos: ({ x: number; y: number } | null)[] = [];
      let mexeu = false;
      e.fotos.forEach((p, k) => {
        const next = f(p);
        if (next !== p) mexeu = true;
        if (next !== null) {
          fotos.push(next);
          focos.push(e.focos?.[k] ?? null);
        }
      });
      if (mexeu) changed = true;
      if (fotos.length) novas[chave] = mexeu ? { fotos, ...(e.focos ? { focos } : {}) } : e;
    }
    paginas = novas;
  }
  return changed ? { ...d, coverImages: cover, moodBoards: boards, fotosDasPaginas: paginas } : d;
}

// ── O que o PDF não leva ──
//
// Há duas maneiras de uma proposta seguir para o cliente incompleta, e a
// Catarina tem de ver as DUAS antes de a enviar:
//
//  1. a foto não chegou — o servidor não a conseguiu ir buscar (`missingImages`);
//  2. o conteúdo chegou e NÃO COUBE — a sétima foto de um mood board, a
//     terceira linha do "Local", uma descrição comprida de mais (`truncations`).
//
// O caso 2 era completamente mudo: as fotos eram carregadas, descarregadas com
// sucesso, e simplesmente nunca desenhadas. Vem agora do gerador já com o sítio
// e a quantidade; aqui só se escreve a frase.

/** Uma perda por composição, tal como o gerador a relata (o tipo vive em
 *  `proposal-doc-pdf`, que é `server-only` e por isso não se importa aqui). */
interface Corte {
  where: string;
  dropped: number;
  unit: "fotos" | "linhas";
}

/** Aceita só o que tem forma de corte — o resto é ignorado em vez de rebentar
 *  a mensagem (uma resposta estranha nunca pode tapar o aviso). */
function normalizaCortes(raw: unknown): Corte[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is Corte =>
      !!c &&
      typeof c === "object" &&
      typeof (c as Corte).where === "string" &&
      typeof (c as Corte).dropped === "number" &&
      (c as Corte).dropped > 0 &&
      ((c as Corte).unit === "fotos" || (c as Corte).unit === "linhas"),
  );
}

/** Lê o cabeçalho `X-Conteudo-Cortado` da pré-visualização (JSON em base64 —
 *  o corpo da resposta é o PDF e os nomes dos campos trazem acentos). */
export function cortesDoCabecalho(header: string | null): Corte[] {
  if (!header) return [];
  try {
    const bytes = Uint8Array.from(atob(header), (ch) => ch.charCodeAt(0));
    return normalizaCortes(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/** "Mood board «Cerimónia»: 3 fotos não entram no PDF". */
function fraseDeCorte(c: Corte): string {
  if (c.unit === "fotos") {
    return `${c.where}: ${c.dropped === 1 ? "1 foto não entra" : `${c.dropped} fotos não entram`} no PDF`;
  }
  return `${c.where}: ${c.dropped === 1 ? "1 linha cortada" : `${c.dropped} linhas cortadas`}`;
}

/**
 * O helper vive num módulo PRÓPRIO, e não dentro do Estúdio, por uma razão de
 * peso: o construtor de preços (`ProposalBuilder`) precisa dele e é montado
 * SEMPRE, enquanto o Estúdio entra por `dynamic()`. Importá-lo de lá arrastava
 * o Estúdio inteiro para o pacote inicial do back office.
 */
export { porqueFalhouOEnvio };

/**
 * A frase única do aviso, ou `null` quando o documento vai completo.
 *
 * As duas perdas aparecem JUNTAS porque, para quem vai carregar em "Enviar", o
 * problema é o mesmo — o documento vai incompleto — mas ficam DISTINTAS na
 * frase, porque a correcção não é a mesma: uma foto que não chegou tenta-se de
 * novo, um mood board com fotos a mais tem de perder fotos.
 */
export function avisoDeConteudoIncompleto(emFalta: number, cortes: Corte[]): string | null {
  const partes: string[] = [];
  if (emFalta > 0) {
    // "buscá-la OU desenhá-la": a contagem cobre as duas avarias — a foto que
    // não se conseguiu ir buscar ao armazenamento e a que se foi buscar e não
    // se conseguiu imprimir (um WebP antigo da biblioteca, bytes corrompidos).
    // Para quem envia é a mesma perda e a mesma correcção: recarregar a foto.
    partes.push(
      emFalta === 1
        ? "1 foto não entrou (não foi possível ir buscá-la ou desenhá-la)"
        : `${emFalta} fotos não entraram (não foi possível ir buscá-las ou desenhá-las)`,
    );
  }
  for (const c of cortes) partes.push(fraseDeCorte(c));
  return partes.length ? partes.join("; ") : null;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS ESTADOS DO INDICADOR DE GRAVAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tinha dois — «a guardar…» e «guardado às 14:32» — e o segundo era dito
 * também quando a gravação no servidor tinha falhado, porque a cópia local
 * tinha corrido bem e mais nada era verificado. «Guardado» é a palavra que faz
 * uma pessoa fechar o portátil descansada, e foi exactamente isso que
 * aconteceu: uma proposta inteira ficou num `localStorage` e o ecrã disse, o
 * tempo todo, que estava guardada.
 *
 * O terceiro estado tem de ser LIDO, não decifrado. Por isso não é um visto de
 * outra cor: são as palavras «só neste computador», por extenso, também no
 * telemóvel — é a única forma de a informação mudar o que a pessoa faz a
 * seguir.
 */
/**
 * ── E O QUARTO, QUE É O DO DEPLOYMENT ─────────────────────────────────────
 *
 * `nao-dura-ao-deploy` é o desfecho do meio, e não é uma subtileza: a gravação
 * CHEGOU ao servidor (não é `so-neste-computador` — noutro computador a
 * proposta abre), e mesmo assim o próximo deploy leva-a, porque em produção sem
 * base de dados o rascunho fica no disco da função.
 *
 * Precisa de palavras próprias exactamente por isso. «Guardado» era falso pelo
 * lado do tempo, e «só neste computador» seria falso pelo lado do sítio —
 * mandaria alguém copiar o trabalho para outra máquina, que é o gesto que não
 * resolve nada aqui.
 */
export type EstadoDaGravacaoNoEcra =
  | "a-guardar"
  | "so-neste-computador"
  | "nao-dura-ao-deploy"
  | "guardado";

export function textoDaGravacao(
  estado: EstadoDaGravacaoNoEcra,
  gravadoEm: Date | null,
): { curto: string; longo: string; leitor: string } {
  if (estado === "a-guardar") {
    return { curto: "…", longo: "a guardar…", leitor: "a guardar" };
  }
  const horas = gravadoEm ? quandoGravado(gravadoEm) : "";
  if (estado === "so-neste-computador") {
    // A hora entra na frase porque a pergunta seguinte dela é sempre «desde
    // quando?» — é o que lhe diz quanto trabalho está em risco.
    return {
      curto: "⚠ guardado só neste computador",
      longo: horas ? `guardado só neste computador às ${horas}` : "guardado só neste computador",
      leitor: "atenção: o rascunho está guardado só neste computador e não chegou ao servidor",
    };
  }
  if (estado === "nao-dura-ao-deploy") {
    // A hora fica, como no estado de cima e pela mesma razão. O que muda é a
    // segunda metade da frase: o problema não é ONDE está, é ATÉ QUANDO.
    return {
      curto: "⚠ guardado até ao próximo deploy",
      longo: horas
        ? `guardado às ${horas}, num sítio que o próximo deploy apaga`
        : "guardado num sítio que o próximo deploy apaga",
      leitor: "atenção: o rascunho está guardado num sítio que o próximo deploy apaga",
    };
  }
  return { curto: "✓", longo: `guardado às ${horas}`, leitor: "rascunho guardado no servidor" };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTAS LINHAS JÁ TÊM PREÇO — E PORQUE É QUE ISSO PRECISA DE SER DITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o `placeholder="900"` que estava no campo do preço: «um
 * número redondo e plausível como placeholder num campo de preço é perigoso —
 * mais cedo ou mais tarde alguém pensa que já está preenchido». Tinha razão, e
 * o caso já tinha acontecido: uma proposta de 2.460,00 € com QUATRO serviços
 * sem preço nenhum mostrava «900» a cinzento em todos eles, e a única coisa
 * legível no orçamento inteiro era uma deslocação de 75,00 €.
 *
 * O placeholder saiu. Mas tirar a mentira não chega — é preciso dizer a
 * verdade, e a verdade é um número: quantas das linhas têm mesmo preço. Um
 * contador responde à pergunta de uma vez, sem obrigar a percorrer o formulário
 * a contar caixas vazias.
 *
 * `incompleta` é o caso que faz uma soma mentir sem parecer: UMAS linhas com
 * preço e outras sem. Nem tudo por orçamentar (aí não há soma nenhuma, e a
 * biblioteca devolve `null`), nem tudo orçamentado — o meio, que é onde a soma
 * dá um número plausível que está errado por baixo.
 */
export function contagemDePrecos(precos: (number | null)[]): {
  comPreco: number;
  total: number;
  semPreco: number;
  incompleta: boolean;
  frase: string;
} {
  const total = precos.length;
  const comPreco = precos.filter((p) => p !== null).length;
  const semPreco = total - comPreco;
  return {
    comPreco,
    total,
    semPreco,
    // Só há soma incompleta quando há mesmo uma soma a fazer: zero linhas com
    // preço é «ainda não orçamentei», não «orçamentei mal».
    incompleta: comPreco > 0 && semPreco > 0,
    frase: `${comPreco} de ${total} ${total === 1 ? "linha" : "linhas"} com preço`,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O IVA QUE UM VALOR ADICIONAL DECLARA — PERGUNTADO À BIBLIOTECA, NÃO ADIVINHADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os valores adicionais são texto («896,00 €», «895,00 € + IVA») e esse texto é
 * impresso no PDF tal e qual. Quem decide o que ele quer dizer é
 * `somaDosExtrasSemIva`, em `proposal-budget.ts`: uma linha que diz «+ IVA» é
 * líquida, uma que diz «IVA incluído» é bruta, e uma calada segue o modo do
 * documento.
 *
 * Para o ecrã poder mostrar essa escolha num selector é preciso LER de volta o
 * que a linha declara — e isso podia ser feito com uma cópia da expressão
 * regular que está lá dentro. Não é: uma segunda cópia diverge no dia em que
 * alguém acrescentar uma forma de escrever «sem IVA», e o selector passaria a
 * mostrar uma coisa e a soma a fazer outra, em silêncio.
 *
 * Em vez disso pergunta-se à própria função, duas vezes, com contextos
 * opostos. Uma linha CALADA responde de maneira diferente conforme o contexto
 * (é essa a definição de calada); uma linha que declara responde o mesmo às
 * duas. E o valor devolvido diz qual das duas declarações é.
 */
export type ModoDeIvaDoAdicional = "documento" | "acrescer" | "incluido";

export function modoDoAdicional(valueText: string, vatRate: number): ModoDeIvaDoAdicional {
  const cru = normalizarValor(valueText);
  // Sem número legível («a definir») não há IVA nenhum a declarar.
  if (cru === null || cru === 0) return "documento";
  const linha = [{ label: "", valueText }];
  const comoLiquido = somaDosExtrasSemIva(linha, { mode: "acrescer", vatRate });
  const comoBruto = somaDosExtrasSemIva(linha, { mode: "incluido", vatRate });
  if (comoLiquido !== comoBruto) return "documento";
  // Responde o mesmo aos dois contextos: a linha declara. Se o que responde é
  // o próprio número escrito, declarou-se líquida («+ IVA»); se responde menos,
  // declarou-se bruta e a função converteu-a («IVA incluído»).
  return Math.abs(comoLiquido - cru) < 0.005 ? "acrescer" : "incluido";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO ESCRITO NO CAMPO DO TOTAL — COM VÍRGULA, SEMPRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é TEXTO (aceita «1.500» e «1 500 €» a meio de serem
 * escritos) e é relido com `parseMoneyText`, que segue o português: o ponto é
 * separador de MILHARES, a vírgula é o decimal.
 *
 * Quem escrevia neste campo por código usava `String(n)`, e o JavaScript
 * escreve os decimais com PONTO. `String(3355.98)` dava «3355.98», que
 * `parseMoneyText` relê como 335 598 — cem vezes mais. Media-se assim:
 *
 *     parseMoneyText(String(3355.98))  →  335598
 *     parseMoneyText("3355,98")        →  3355.98
 *
 * Aconteceu de verdade no botão «Usar X €»: com uma proposta de 2.460,00 € e
 * uma deslocação de 75,00 € lida com IVA incluído, a sugestão é 3.355,98 € e o
 * campo ficava com 335.598,00 € — e esse número seguia para o preço final do
 * pedido, para o sinal e para a fatura. O mesmo valia para qualquer total com
 * cêntimos escrito por um valor adicional, por uma versão reposta ou por uma
 * proposta copiada.
 *
 * Um número inteiro sai como sempre saiu («2460»), para não mudar o que ela vê
 * no caso normal.
 */
export function textoDoTotal(base: number): string {
  return Number.isInteger(base) ? String(base) : String(base).replace(".", ",");
}

/**
 * O texto que fica GRAVADO num valor adicional — o mesmo que o PDF imprime.
 *
 * O campo do valor passou a ser numérico (ela escrevia «1.500», «1500» e
 * «1 500 €» conforme a pressa, e as três tinham de dar o mesmo número), mas o
 * documento continua a guardar TEXTO: é o que o gerador desenha, e é lá que
 * mora a informação de «+ IVA» que não se pode perder. Este é o único sítio
 * onde os dois se juntam.
 *
 * Um valor que não se consegue ler («a definir», «sob consulta») fica exactamente
 * como foi escrito: é uma frase que o casal tem de ver na proposta, não um
 * número que se possa formatar.
 */
export function textoDoAdicional(escrito: string, modo: ModoDeIvaDoAdicional): string {
  const valor = normalizarValor(escrito);
  if (valor === null) return escrito;
  if (modo === "acrescer") return `${eur(valor)} + IVA`;
  if (modo === "incluido") return `${eur(valor)} (IVA incluído)`;
  return eur(valor);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RASCUNHO NO SERVIDOR — E O QUE SE FAZ QUANDO ELE NÃO LÁ CHEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta gravação era um `fetch` seco: `if (!res.ok) return`, e um `catch` vazio
 * com o comentário «offline — a cópia local guarda o trabalho até haver rede».
 * A cópia local guarda mesmo — mas só naquele computador. Uma colaboradora
 * montou uma proposta inteira com esta chamada a falhar de cada vez, o
 * indicador a dizer «guardado às 14:32» o tempo todo, e quem a foi abrir noutra
 * máquina encontrou o ecrã vazio.
 *
 * Duas coisas mudam. A primeira é REPETIR: uma gravação que morre por causa de
 * uma ligação que caiu não pode morrer à primeira. É o mesmo desenho de
 * `proposal-storage.descarregar` e da segunda tentativa do envio — tentativas
 * com pausa curta e crescente, e um tecto de tempo por tentativa para um pedido
 * pendurado não segurar o resto. A segunda é DIZER o que aconteceu, que é a
 * parte que faltava por inteiro.
 *
 * O que não se repete: um 4xx (o pedido é que está errado — sessão expirada,
 * rascunho grande demais) e um 503 marcado como `permanente` (a instalação não
 * tem a tabela, ou a chave não a pode escrever). Nesses, tentar outra vez dá
 * exactamente a mesma resposta e só atrasa o aviso.
 */
/**
 * Quanto tempo a pergunta do envio tem de estar à vista antes de o «Confirmar»
 * aceitar um clique. Um duplo clique são ~120 ms entre os dois; 400 ms tira o
 * segundo de lá com folga e é menos do que alguém demora a ler a frase.
 */
const CONFIRMAR_ENVIO_APOS_MS = 400;

const GRAVACAO_TENTATIVAS = 3;
const GRAVACAO_PAUSA_MS = 400;
const GRAVACAO_TECTO_MS = 10000;

export type ResultadoDaGravacao =
  | {
      estado: "guardado";
      updatedAt?: string;
      overwrote?: boolean;
      previousBy?: string;
      /**
       * A gaveta onde ficou o trabalho que esta gravação esmagou.
       *
       * ── PORQUE É QUE ISTO ESTAVA A SER DEITADO FORA ─────────────────────
       *
       * O servidor guarda, desde sempre, a versão que ia desaparecer numa
       * chave irmã, e devolve o nome dela aqui. O estúdio lia o `overwrote` e
       * o `previousBy` — e ignorava estes dois. Resultado: o aviso dizia «ficou
       * a tua versão» e mais nada, portanto quem o lia concluía, com toda a
       * razão, que as duas horas da outra pessoa tinham acabado.
       *
       * Não tinham. Estavam guardadas num sítio que nenhuma parte do produto
       * conseguia abrir — a lista de gavetas que a leitura aceita não tinha
       * esta lá dentro. Metade da regra da casa («se falhar, não perder
       * trabalho») cumprida, e a metade que se vê por cumprir.
       */
      resgate?: string;
      /** Quando é que essa versão tinha sido gravada — é a hora que dá à
       *  pessoa a noção do que está em jogo antes de decidir. */
      resgateEm?: string;
      /** O servidor juntou esta gravação com a de outra pessoa, campo a campo
       *  (achado n.º 6 — ver `rascunho-juntar.ts`), e `doc` é como ficou. */
      juntou?: boolean;
      doc?: Record<string, unknown>;
      /**
       * O sítio onde ficou sobrevive a um deploy?
       *
       * ── PORQUE É QUE ISTO NÃO PODE FICAR DE FORA ────────────────────────
       *
       * Há um terceiro desfecho entre «guardado» e «não guardado», e é o que
       * fez desaparecer uma proposta montada: produção sem Supabase escreve o
       * rascunho no `data/app-state.json`, que em Vercel é o disco da função. A
       * escrita ACONTECE — por isso a rota responde 200 e isto não é um
       * `so-local` —, e o próximo deploy apaga-a. A rota diz-o desde sempre
       * (`duradouro: false`, com a frase em `aviso`); era esta leitura que
       * faltava, e sem ela o indicador escrevia «guardado às 14:32» por cima do
       * trabalho de horas de alguém.
       *
       * As fotos em si não se perdem — os bytes estão no bucket. O que se perde
       * é a MONTAGEM: quais entraram, por que ordem, em que mood board.
       *
       * `undefined` quando o servidor não o disse. Só um `false` explícito
       * alarma: inventar um alarme a partir de uma ausência era pôr um aviso
       * permanente em instalações sãs, que é como se ensina a ignorá-lo.
       */
      duradouro?: boolean;
      /** A frase do servidor para o caso de cima — diz o que fazer e nomeia as
       *  variáveis que o resolvem. Vem escrita de lá para não haver duas
       *  versões da mesma verdade. */
      aviso?: string;
    }
  /** Não ficou no servidor. O trabalho está no ecrã e na cópia local — e é isso
   *  mesmo que a pessoa tem de ouvir, com estas palavras. */
  | {
      estado: "so-local";
      porque?: string;
      /** O servidor recusou porque a sessão caiu (401) — não é avaria nenhuma:
       *  basta entrar outra vez (achado n.º 34). */
      sessaoExpirada?: boolean;
    };

function ehObjecto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Um `fetch` com tecto de tempo próprio. Sem ele, uma rede que aceita a
 *  ligação e nunca responde deixa a gravação pendurada para sempre — e o
 *  indicador ficaria eternamente em «a guardar…», que é outra maneira de
 *  mentir. */
async function fetchComTecto(url: string, init: RequestInit, ms: number): Promise<Response> {
  const abortador = new AbortController();
  const t = setTimeout(() => abortador.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: abortador.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Grava o rascunho no servidor, repetindo enquanto fizer sentido, e devolve a
 * VERDADE sobre onde ele ficou. Nunca lança.
 */
export async function gravarRascunhoNoServidor(
  quoteId: string,
  corpo: {
    doc: unknown;
    baseUpdatedAt: string | null;
    campos?: string[];
    base?: Record<string, unknown>;
  },
): Promise<ResultadoDaGravacao> {
  let porque: string | undefined;
  let sessaoExpirada = false;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      const res = await fetchComTecto(
        `/api/orcamento/${quoteId}/proposta-rascunho`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        },
        GRAVACAO_TECTO_MS,
      );
      const dados = await res.json().catch(() => null);
      if (res.ok) {
        return {
          estado: "guardado",
          updatedAt: typeof dados?.updatedAt === "string" ? dados.updatedAt : undefined,
          overwrote: Boolean(dados?.overwrote),
          previousBy: typeof dados?.previousBy === "string" ? dados.previousBy : undefined,
          resgate: typeof dados?.resgate === "string" ? dados.resgate : undefined,
          resgateEm: typeof dados?.resgateEm === "string" ? dados.resgateEm : undefined,
          juntou: dados?.juntou === true,
          doc:
            dados?.juntou === true && dados.doc && typeof dados.doc === "object"
              ? (dados.doc as Record<string, unknown>)
              : undefined,
          duradouro: typeof dados?.duradouro === "boolean" ? dados.duradouro : undefined,
          aviso: typeof dados?.aviso === "string" ? dados.aviso : undefined,
        };
      }
      porque = typeof dados?.erro === "string" ? dados.erro : undefined;
      sessaoExpirada = res.status === 401;
      // Um 4xx é o pedido que está errado, e repeti-lo dá o mesmo. Um 503
      // `permanente` é a instalação que está incompleta — também dá o mesmo.
      if (res.status < 500 || dados?.permanente === true) break;
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar.
      porque = undefined;
    }
    if (tentativa < GRAVACAO_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, GRAVACAO_PAUSA_MS * tentativa));
    }
  }
  return { estado: "so-local", porque, ...(sessaoExpirada ? { sessaoExpirada } : {}) };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO QUE FICAVA SÓ NO ESTÚDIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era um `fetch` seco com um `catch` vazio, e o comentário dizia «a
 * gravação seguinte volta a tentar». NÃO HÁ GRAVAÇÃO SEGUINTE: esta chamada só
 * parte quando alguém MEXE no valor. Se a rede piscar na única vez que ela
 * escreve o preço, ninguém volta a tentar nada.
 *
 * O que se via, e está na auditoria da casa (2.3): o Estúdio e o PDF a dizerem
 * 9.500 €, e o cartão do pedido, a margem, as Estatísticas e as facturas a
 * dizerem 8.000 €. Sem aviso nenhum, porque o `catch` estava vazio. É a queixa
 * dela — «o valor enviado para o cliente tem de ser o valor que fica na
 * proposta» — com a causa por baixo.
 *
 * Duas coisas mudam, e são as mesmas do rascunho aqui em cima, de propósito:
 *
 *  · REPETIR. Uma gravação que morre porque a ligação caiu não pode morrer à
 *    primeira. Mesmas tentativas, mesma pausa crescente, mesmo tecto por
 *    tentativa.
 *  · DIZER. Quando nem à terceira chega, o ecrã passa a saber e a mostrar — com
 *    os dois valores à vista e um botão para tentar outra vez.
 *
 * O que NÃO se repete é o mesmo que ali: um 4xx é o pedido que está errado
 * (sessão caída, sobretudo), e repeti-lo dá exactamente a mesma resposta. Aí
 * `valeTentarDeNovo` vem `false` e o ecrã não oferece um botão que não pode
 * funcionar — é a regra que o `AvisoDeFalha` já segue.
 *
 * Nunca lança: quem chama está no meio da escrita de uma proposta.
 */
export type ResultadoDoPreco =
  | {
      estado: "gravado";
      /**
       * O pedido actualizado, para propagar ao resto do ecrã. Falta quando o
       * servidor respondeu 200 com um corpo que não se leu — gravou na mesma,
       * e é isso que decide o estado; o que não há é número novo para
       * espalhar.
       */
      quote?: Quote;
    }
  | { estado: "falhou"; porque?: string; valeTentarDeNovo: boolean };

export async function mandarPrecoAoPedido(
  quoteId: string,
  base: number | null,
): Promise<ResultadoDoPreco> {
  let porque: string | undefined;
  let valeTentarDeNovo = true;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    try {
      const res = await fetchComTecto(
        `/api/orcamento/${quoteId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // `null` e não `undefined`: apagar o preço tem de chegar ao servidor,
          // e `undefined` desaparece no JSON (o merge parcial mantinha o valor
          // antigo). É a mesma razão que está escrita na Gestão do pedido.
          body: JSON.stringify({ quotedPrice: base }),
        },
        GRAVACAO_TECTO_MS,
      );
      if (res.ok) {
        // Um 200 com corpo ilegível é um 200: o servidor gravou. Insistir aqui
        // punha um alarme vermelho por cima de trabalho que está são — e ela
        // deixava de acreditar no alarme quando ele for verdade.
        const atualizado = (await res.json().catch(() => null)) as Quote | null;
        return atualizado ? { estado: "gravado", quote: atualizado } : { estado: "gravado" };
      } else {
        const dados = await res.json().catch(() => null);
        porque = typeof dados?.error === "string" ? dados.error : undefined;
        if (res.status < 500) {
          valeTentarDeNovo = false;
          break;
        }
      }
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar.
      porque = undefined;
    }
    if (tentativa < GRAVACAO_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, GRAVACAO_PAUSA_MS * tentativa));
    }
  }
  return { estado: "falhou", porque, valeTentarDeNovo };
}

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
}

export default function ProposalStudio({ quote, quotes, onSent, onQuoteUpdated }: Props) {
  const { toast } = useToast();
  const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;
  const SIDE_KEY = `${DRAFT_KEY}:meta`;

  /**
   * ── O QUE AS GERAÇÕES ANTERIORES ENSINARAM ──────────────────────────────
   *
   * Cada PDF gerado deixa uma amostra `{fotos, ms, bytes}`, e é dela que sai a
   * estimativa que aparece antes do botão. Vive fora do rascunho e SEM o id do
   * pedido: o que se aprende com uma proposta serve para a seguinte — é a
   * mesma máquina, a mesma ligação e o mesmo servidor.
   */
  const [amostras, setAmostras] = useState<AmostraDeGeracao[]>([]);
  useEffect(() => {
    try {
      const cru = localStorage.getItem(AMOSTRAS_KEY);
      const lidas = cru ? JSON.parse(cru) : null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(lidas)) setAmostras(lidas.filter((x) => x && typeof x.ms === "number"));
    } catch {
      /* sem amostras — a estimativa usa o modelo de arranque */
    }
  }, []);

  /** Aponta uma geração e guarda-a para a próxima estimativa. */
  const apontarGeracao = useCallback((fotos: number, ms: number, bytes: number) => {
    setAmostras((antes) => {
      const proximas = comNovaAmostra(antes, { fotos, ms, bytes });
      try {
        localStorage.setItem(AMOSTRAS_KEY, JSON.stringify(proximas));
      } catch {
        /* sem espaço: a estimativa desta sessão continua a valer */
      }
      return proximas;
    });
  }, []);

  const [doc, setDoc] = useState<StudioDoc>(() => initialDoc(quote));
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
  /**
   * O documento COMO ESTÁ AGORA, para quem volta de uma ida à rede.
   *
   * Uma função `async` guarda o `doc` que existia quando ela CARREGOU no botão.
   * Se a resposta demorar segundos — e a tradução demora —, esse documento já é
   * história: entretanto entraram fotos, saíram fotos, arrumou-se a grelha. Lê-lo
   * para decidir o que dizer, ou pô-lo de volta no estado, é apagar tudo isso.
   *
   * Isto é só para LER (contar, comparar). Quem ESCREVE continua a escrever pela
   * forma funcional do `setDoc`, que é a única que o React garante actualizada.
   */
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);
  const [copiarAberto, setCopiarAberto] = useState(false);
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
  const [copiaSubstitui, setCopiaSubstitui] = useState<string | null>(null);
  /**
   * Os campos que vieram de OUTRA proposta e ainda não foram confirmados.
   *
   * Depois de copiar, estes cinco são os únicos que mudam de casamento para
   * casamento — e são exactamente aqueles cujo erro só se descobre com o PDF
   * já enviado. Ficam marcados até ela lhes tocar.
   */
  const [porConfirmar, setPorConfirmar] = useState<Set<CampoAMudar>>(() => new Set());
  /** Caixa do nome, aberta pelo "Guardar como modelo" do cabeçalho. */
  const [nomeModelo, setNomeModelo] = useState<string | null>(null);
  /** Quando foi gravado — para o indicador discreto "Guardado às 14:32". */
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  /** Há alterações à espera do debounce? É o que o aviso de saída lê. */
  const [porGravar, setPorGravar] = useState(false);
  /**
   * ── O TERCEIRO ESTADO DO INDICADOR ────────────────────────────────────────
   *
   * O indicador tinha dois: «a guardar…» e «guardado às 14:32». Faltava o que
   * de facto acontecia quando o servidor recusava a gravação — o rascunho ficava
   * no `localStorage` DESTE computador e em mais lado nenhum, e o ecrã dizia
   * «guardado», que é a palavra que faz uma pessoa fechar o portátil descansada.
   *
   * É por isso que este estado existe e é por isso que o que ele mostra tem de
   * ser lido de longe: quem está a trabalhar não vai investigar um visto cinzento
   * — só muda de comportamento se lhe disserem, com estas palavras, que o
   * trabalho está guardado SÓ NESTE COMPUTADOR.
   *
   * `porque` é o que se sabe da causa (a tabela em falta, as permissões), para o
   * aviso poder dizer o que resolver em vez de só que não deu.
   */
  const [soNesteComputador, setSoNesteComputador] = useState<{ porque?: string } | null>(null);
  /** Já dissemos isto em voz alta? O indicador diz-o sempre; o aviso grande
   *  aparece UMA vez, para não virar ruído a cada 800 ms. */
  const avisouSoLocal = useRef(false);
  /**
   * O rascunho CHEGOU ao servidor e o próximo deploy apaga-o (produção sem base
   * de dados — ver `duradouro` em `ResultadoDaGravacao`). `aviso` é a frase que
   * o servidor manda, com o nome das variáveis que resolvem.
   */
  const [naoDuraAoDeploy, setNaoDuraAoDeploy] = useState<{ aviso?: string } | null>(null);
  /**
   * O preço da proposta que não chegou ao pedido — ver `mandarPrecoAoPedido`.
   * `null` é o normal: ou nunca falhou, ou a última tentativa passou.
   */
  const [precoPorChegar, setPrecoPorChegar] = useState<{
    base: number | null;
    porque?: string;
    valeTentarDeNovo: boolean;
  } | null>(null);
  const [precoAGravar, setPrecoAGravar] = useState(false);
  /** O mesmo contrato do `avisouSoLocal`: o indicador di-lo sempre, o aviso
   *  grande uma vez. */
  const avisouNaoDura = useRef(false);
  /**
   * Quantas gravações estão AGORA a caminho do servidor.
   *
   * Sem isto havia uma janela em que o ecrã dizia «guardado às 14:32» sem
   * ninguém saber ainda se tinha ficado guardado: a cópia local corre primeiro
   * e é síncrona, o pedido ao servidor demora — e com as repetições demora
   * mais. Uma contagem e não um booleano porque a gravação de saída (a da
   * desmontagem) pode sobrepor-se à do debounce.
   */
  const [aGravarNoServidor, setAGravarNoServidor] = useState(0);
  /**
   * O rascunho que o "Limpar" deitou fora, à espera de ser resgatado.
   *
   * Dez segundos e um botão, em vez de uma caixa de confirmação. A caixa
   * pergunta ANTES, quando ela ainda não viu o que ia perder, e a resposta
   * certa é quase sempre "sim" — por isso carrega-se sem ler. A anulação
   * pergunta DEPOIS, quando o ecrã já mostra o estrago.
   */
  const [limpo, setLimpo] = useState<{
    doc: StudioDoc;
    total: string;
    segundos: number;
    /** O que aconteceu, para o aviso poder dizê-lo. O "Limpar" não é o único
     *  gesto que deita fora o que estava no ecrã: repor uma versão antiga
     *  também, e um aviso a dizer "rascunho limpo" depois de um restauro
     *  mandava procurar um problema que não houve. */
    motivo: string;
  } | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA ACÇÃO QUE MEXE NO DINHEIRO PERGUNTA COM OS DOIS NÚMEROS À VISTA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela sobre o «Usar X €»: «é um botão perigoso». E era: um clique
   * substituía o preço final da proposta — o número de que saem a fatura, o
   * sinal e o saldo — sem dizer o que ia sair dali para fora. O rótulo mostrava
   * o valor NOVO; o valor que se perdia não estava escrito em lado nenhum.
   *
   * A pergunta traz os DOIS: «Substituir 2.460,00 € por 2.535,00 €?». É a única
   * forma de a resposta ser uma decisão em vez de um reflexo — e é diferente de
   * um «tem a certeza?», que se responde sem ler porque não acrescenta
   * informação nenhuma.
   *
   * Depois de aplicada, a anulação de dez segundos (a mesma do «Limpar») fica
   * disponível: a confirmação protege de carregar por engano, a anulação
   * protege de confirmar por engano.
   */
  const [confirmacaoDeDinheiro, setConfirmacaoDeDinheiro] = useState<{
    /** O que aparece na pergunta, já composto. */
    pergunta: string;
    /** O que fica no histórico do pedido quando for aplicada. */
    registo: string;
    /** O que a anulação dirá que foi desfeito. */
    motivo: string;
    /**
     * O documento no instante em que a pergunta foi feita.
     *
     * A pergunta guarda o gesto que a vai aplicar, e esse gesto foi composto
     * com os números desse instante. Se entretanto se escrever no formulário,
     * «substituir 2.460,00 € por 2.535,00 €» passa a falar de um documento que
     * já não existe — e aplicá-la escrevia por cima do que se acabou de
     * escrever. Por isso a pergunta só se DESENHA enquanto o documento for este
     * (ver a marcação); caducada, desaparece, e volta a perguntar-se se for
     * preciso. Comparado por identidade porque o documento é imutável: cada
     * alteração devolve um objecto novo.
     */
    docNoMomento: StudioDoc;
    aplicar: () => void;
  } | null>(null);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE SE APAGA E NÃO VOLTA: OU UMA PERGUNTA QUE CONTA, OU UM «ANULAR»
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A regra desta casa, escrita de uma vez para não ser decidida gesto a gesto:
   *
   *  · PERGUNTA-SE o que é RARO E CARO. Uma página de inspiração leva consigo
   *    as fotografias todas que se escolheram para ela, uma a uma, e uma folha
   *    do PDF; uma fase do cronograma leva as tarefas todas que lhe estão
   *    dentro. Fazem-se poucas vezes por proposta e refazê-las é meia hora. A
   *    pergunta NOMEIA a coisa, CONTA o que vai com ela e diz a consequência —
   *    nunca «Tens a certeza?», que não acrescenta informação nenhuma e por
   *    isso se responde sem ler.
   *
   *  · OFERECE-SE ANULAR o que é FREQUENTE E BARATO de refazer. Uma linha de
   *    orçamento, uma tarefa do cronograma, uma fotografia de uma grelha: são
   *    os gestos de que uma tarde de trabalho é feita, e uma caixa a perguntar
   *    em cada um é um editor que ninguém usa. Faz-se, e fica o «Anular» dos
   *    dez segundos (ver `limpo`) a dizer o que saiu.
   *
   * Uma coisa OU a outra, nunca as duas — a excepção está escrita em
   * `confirmacaoDeDinheiro` e vale só para o dinheiro, onde a pergunta protege
   * de carregar por engano e a anulação de confirmar por engano.
   *
   * E nada disto atrasa o que não é destrutivo: uma página em branco, uma fase
   * sem título nem tarefas, uma linha por escrever — saem sem pergunta nenhuma
   * e sem barra nenhuma. Perguntar por nada ensina a responder sem ler.
   *
   * ── PORQUE É QUE A PERGUNTA SE DESENHA ONDE O DEDO CARREGOU ───────────────
   * Ao contrário da do dinheiro, que vive no topo do estúdio de propósito: as
   * acções do dinheiro estão espalhadas por três secções e uma pergunta que
   * aparecesse cada vez noutro sítio responder-se-ia sem se procurar o que ela
   * diz. Estas são o contrário — com oito páginas escritas, o topo do estúdio
   * está a metros do «×» que se carregou, e uma pergunta fora do ecrã é um
   * botão que não fez nada. Portanto fica dentro do cartão, encostada ao gesto.
   *
   * `chave` é o que decide ONDE se desenha (`board:2`, `fase:0`), e o
   * `docNoMomento` é a mesma cautela da pergunta do dinheiro: a frase foi
   * composta com os números daquele instante, e se o documento mudar por baixo
   * dela deixa de falar do que está no ecrã. Caducada, desaparece.
   */
  const [aRemover, setARemover] = useState<{
    chave: string;
    pergunta: string;
    docNoMomento: StudioDoc;
    aplicar: () => void;
  } | null>(null);
  /**
   * Histórico para o Cmd+Z. Guardado num `ref` e não em estado: crescer o
   * histórico não pode redesenhar a página, ou escrever numa caixa de texto
   * passava a redesenhar o formulário inteiro a cada tecla.
   */
  const historico = useRef<StudioDoc[]>([]);
  /**
   * Há alguma coisa para desfazer? Isto É estado, ao contrário do histórico:
   * é o que acende e apaga o botão "Desfazer".
   *
   * O botão existe porque o `Cmd+Z` não existe num telemóvel. Enquanto desfazer
   * foi só um atalho de teclado, desfazer era uma coisa que só se podia fazer
   * ao computador — e ela escreve propostas no telemóvel. Custa um redesenho a
   * cada 800 ms (o mesmo instante em que o rascunho é gravado), não a cada
   * tecla, que é a razão de o histórico continuar num `ref`.
   */
  const [podeDesfazer, setPodeDesfazer] = useState(false);
  /** O modo de arrumar a ordem dos grupos de serviços. Só existe no telemóvel
   *  — a razão está escrita ao lado do botão "Reordenar". */
  /** Qual o grupo cujo menu de acções está aberto (por toque longo). */
  /**
   * O que ela já escreveu antes, para não voltar a escrever.
   *
   * Sai das propostas anteriores em vez de um catálogo à parte: um catálogo
   * precisava de ser mantido, e um catálogo que ninguém mantém fica pior do
   * que não existir. O que ela usou é, por definição, o que ela usa.
   */
  const [sugestoes, setSugestoes] = useState<{ locais: string[] }>({ locais: [] });
  // Free-typed mirror of the structured total, so pt-PT formatting ("3.000,00")
  // survives keystrokes. Parsed into `doc.totalAmount` (the money source of truth).
  const [totalInput, setTotalInput] = useState<string>("");
  /** Porque é que o que está escrito no «Valor (sem IVA)» não conta — ver
   *  `onTotalInput`. */
  const [erroDoTotal, setErroDoTotal] = useState<string | null>(null);
  /** O que está escrito na caixa do sinal enquanto não é uma percentagem
   *  válida (achado n.º 17) — `null` mostra a do documento. */
  const [sinalEscrito, setSinalEscrito] = useState<string | null>(null);
  /** A percentagem do sinal quando ela entrou na caixa — é para lá que se volta
   *  se o que escrever deixar de ser válido. */
  const sinalAntes = useRef(SINAL_POR_OMISSAO);
  // path → signed url, so freshly-uploaded images render as thumbnails.
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A HIDRATAÇÃO OU CORREU, OU AINDA VAI A CAMINHO, OU FALHOU — E ISSO VÊ-SE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
   * quando estava a fazer a proposta e não consigo» — e, nas capturas, células
   * cinzentas com a palavra «Imagem».
   *
   * Essa caixa é o ramo do `Thumb` em que NÃO HÁ URL. Num telemóvel que nunca
   * abriu esta proposta não há `localStorage` nenhum, portanto o mapa começa
   * vazio e as células dependem inteiramente desta única leitura. E ela era
   * silenciosa nos dois sentidos: enquanto ia a caminho a célula dizia
   * «Imagem», e se falhasse (`!res.ok`, sessão caducada, rede a cair) a função
   * fazia `return` e a célula dizia «Imagem» PARA SEMPRE. As duas coisas com o
   * mesmo aspecto, e nenhuma delas com uma explicação ou uma saída.
   *
   * Com isto, a célula sabe distinguir «vem a caminho» de «não veio», e há um
   * botão para tentar outra vez em vez de recarregar a página.
   */
  const [estadoDosUrls, setEstadoDosUrls] = useState<EstadoDosUrls>("a-caminho");
  /**
   * O ORIGINAL de cada foto — o plano B da célula.
   *
   * O `assetUrls` guarda o que é MELHOR desenhar (a miniatura, quando existe).
   * Uma miniatura pode não existir: as fotos anteriores às miniaturas não têm
   * nenhuma, e assinar um caminho no Storage não verifica que o ficheiro lá
   * está — devolve um URL bem formado para um objecto que dá 404. Quem
   * descobre isso é o navegador, e até aqui o que acontecia a seguir era a
   * célula desistir e dizer "não foi possível pré-visualizar".
   *
   * Este mapa é para onde ela cai. É a mesma rede que a grelha dos temas e o
   * seletor já tinham, e que só ao estúdio faltava.
   */
  const [assetOriginais, setAssetOriginais] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DEGRAU DO MEIO: A DERIVADA DE 1200 px
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A cascata de cada célula tinha DOIS degraus e nada entre eles — a miniatura
   * e, a falhar essa, o ORIGINAL. Os pesos, medidos no estúdio a 1,6 Mbps com
   * 24 células:
   *
   *     miniatura (400 px)     20 KB por célula   →   0,4 MB nas 24
   *     derivada  (1200 px)  ~200 KB por célula   →   4,8 MB nas 24
   *     original  (2200 px)   1099 KB por célula  →  26,4 MB nas 24
   *
   * E as células destas grelhas medem, medido no navegador: **~101 px aos 375,
   * ~126 px entre 640 e 1023, ~92 px aos 1024** (as fotografias dos mood
   * boards) — nenhuma delas com o que fazer a 2200 px de largura.
   *
   * Uma miniatura falha por coisas banais: a assinatura de seis horas de uma
   * foto da Biblioteca que caducou, um pedido que expirou, um `sharp` que não
   * correu. O que não era banal era a queda — de 20 KB para 1099 KB, na rede em
   * que ela está a trabalhar. Daqui em diante cai-se para 150.
   *
   * Ausente quer dizer «essa derivada ainda não foi fabricada»: a célula cai
   * directa ao original, como sempre caiu. Ver `mediasAssinadas` no `/assets`.
   */
  const [assetMedias, setAssetMedias] = useState<Record<string, string>>({});
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS URL QUE ESTA SESSÃO JÁ VIU MORRER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `urlAindaBom` prefere o URL guardado ao fresco «enquanto servir», e quem
   * decide se serve é o prazo escrito no token. Isso está certo para o caso que
   * ele veio resolver (não deitar fora assinaturas boas e pagar trinta
   * downloads ao reabrir um rascunho) e está errado para este: um URL pode ter
   * o prazo em dia e mesmo assim dar 403 ou 404 — pasta mudada, objecto que
   * nunca chegou a subir, chave do bucket rodada.
   *
   * Sem esta memória o «Tentar novamente» de uma célula morta era um beco
   * fechado a três voltas: ia buscar a lista outra vez, recebia URLs frescos,
   * e o mapa PREFERIA o mesmo URL morto que já tinha — a `string` não mudava,
   * portanto o `useFotoComPlanoB` não via URL novo, portanto não recomeçava
   * nada. O botão pedia ao servidor e não podia usar o que ele respondia.
   *
   * Uma `ref` e não estado: só é lida DENTRO da hidratação, e um redesenho por
   * cada foto que morre numa grelha de vinte e quatro era um redesenho por
   * nada.
   */
  const urlsMortos = useRef<Set<string>>(new Set());
  /** Esta célula provou que este URL não abre. Ver `urlsMortos`. */
  const marcarUrlMorto = useCallback((url: string) => {
    urlsMortos.current.add(url);
  }, []);
  /**
   * A cor dominante de cada fotografia, `caminho → "#rrggbb"`.
   *
   * Vem do servidor (que a leu da linha da foto), e não de um `canvas` daqui:
   * estas fotos chegam por URLs assinados de OUTRO domínio, e ler-lhes os
   * píxeis lançaria — ver o cabeçalho de `cor-dominante.ts`. É com isto que se
   * avisa que uma foto destoa da paleta do board e se arruma um board por cor.
   *
   * As fotos anteriores a isto existir não estão no mapa, e não entram em
   * nenhuma das duas coisas: nunca se inventa uma cor para poder arrumar.
   */
  const [assetCores, setAssetCores] = useState<Record<string, string>>({});
  // Foto NESTA proposta → foto da BIBLIOTECA de onde foi copiada.
  //
  // A importação copia os bytes para um uuid novo, por isso o caminho de
  // destino não guarda memória nenhuma da origem — e sem essa memória o
  // seletor não consegue dizer "esta já está nesta proposta", que é
  // exatamente o que evita o mesmo ramo de eucalipto duas vezes no mesmo mood
  // board. Vive no lado ("meta") do rascunho e não no documento: é auxiliar,
  // não vai para o PDF, e um rascunho antigo — que não o tem — abre na mesma,
  // apenas sem as marcas.
  const [themeOrigins, setThemeOrigins] = useState<Record<string, string>>({});
  /**
   * ── A FORMA DE CADA FOTO, MEDIDA NA CÉLULA QUE JÁ A MOSTRA ────────────────
   *
   * Os diagramas do selector de disposição precisam do aspecto (largura ÷
   * altura) de cada fotografia: é isso que faz uma vertical sair vertical e é
   * disso que `caixasDoMoodboard` vive. A informação já está no browser — a
   * miniatura da grelha do estúdio está descodificada e sabe o seu
   * `naturalWidth`/`naturalHeight` —, por isso mede-se ALI, no `onLoad` da
   * célula (ver `Thumb`), e não se pede nada de novo ao servidor. Um pedido por
   * foto só para saber a forma seria pagar outra vez o que já foi pago, e na
   * ligação por onde ela está a trabalhar.
   *
   * Chave: o caminho no documento — a mesma foto usada em dois mood boards é
   * medida uma vez só. Não vai para o rascunho: é uma medida do ficheiro, não
   * uma decisão dela, e volta sozinha quando a célula carregar outra vez.
   *
   * O que fica de fora fica com {@link ASPETO_POR_OMISSAO}: as células são
   * `loading="lazy"` e uma que nunca chegou ao ecrã não tem medidas.
   */
  const [aspetosDasFotos, setAspetosDasFotos] = useState<Record<string, number>>({});
  /** Regista a medida de uma foto. Estável (o `Thumb` guarda-a numa `ref`) e
   *  silencioso quando o valor não mudou, para medir não redesenhar a secção. */
  const registarAspeto = useCallback((ref: string, aspeto: number) => {
    setAspetosDasFotos((m) => (m[ref] === aspeto ? m : { ...m, [ref]: aspeto }));
  }, []);
  /** O lugar da fotografia da capa: a primeira que houver (ver a secção). */
  const idxDaCapa = Math.max(0, (doc.coverImages ?? []).findIndex(Boolean));
  const caminhoDaCapa = doc.coverImages?.[idxDaCapa] || undefined;
  /** Os pixéis do original da capa — para o aviso «é pequena». */
  const tamanhoDaCapa = useTamanhoDoOriginal(
    caminhoDaCapa ? assetOriginais[caminhoDaCapa] : undefined,
  );
  /**
   * O recorte que o PDF faria SOZINHO da fotografia da capa — perguntado ao
   * servidor, que faz a mesma conta que o desenho (`focoAutomaticoDaCapa`).
   *
   * Palavras dela: «não ficou com o carro». A caixa mostrava o meio da
   * fotografia e o PDF recortava pela «atenção» do sharp. Com isto mostra o
   * mesmo — e é daqui que ela arrasta, se não gostar.
   */
  const [focoAutoDaCapa, setFocoAutoDaCapa] = useState<{
    caminho: string;
    foco: { x: number; y: number };
  } | null>(null);
  useEffect(() => {
    if (!caminhoDaCapa || isPendingImage(caminhoDaCapa)) return;
    let vivo = true;
    fetch(
      `/api/orcamento/${encodeURIComponent(quote.id)}/foco-da-capa?caminho=${encodeURIComponent(caminhoDaCapa)}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { foco?: { x: number; y: number } } | null) => {
        if (vivo && j?.foco) setFocoAutoDaCapa({ caminho: caminhoDaCapa, foco: j.foco });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [caminhoDaCapa, quote.id]);
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
  /**
   * ── A LÍNGUA ESCOLHE-SE AO GERAR ──────────────────────────────────────────
   *
   * Não entra no `doc` e não é gravada no rascunho, de propósito: o documento
   * guardado é UM só, em português, e a língua é uma decisão que se toma sobre
   * ESTE clique — como escolher a impressora. Guardá-la era passar a ter uma
   * proposta com uma língua colada, que ninguém voltaria a rever.
   */
  const [idiomaDoPdf, setIdiomaDoPdf] = useState<IdiomaDaProposta>(IDIOMA_POR_OMISSAO);
  /**
   * ── A PROPOSTA É BILINGUE: CADA CAMPO DE PROSA COM DUAS CAIXAS ────────────
   *
   * Estado do ECRÃ, não do documento — como as dobras dos mood boards, o
   * `refEdited` e os mapas de URLs, e pela mesma razão: não diz nada sobre a
   * proposta. Posto no `doc`, ia para a coluna `proposals.doc`, para a cópia de
   * segurança, para a cópia entre pedidos e para a comparação de versões.
   *
   * Desligado por omissão, e desligado o ecrã é o de hoje ao pixel: o
   * `ServicesEditor` é o ecrã mais escrito da casa, e dobrar-lhe a altura para
   * toda a gente — incluindo as propostas que nunca vão a inglês — era pagar
   * todos os dias por um caso ocasional.
   *
   * ── E ABRE LIGADO QUANDO O DOCUMENTO JÁ TRAZ INGLÊS ──────────────────────
   * O `meta` fica neste computador. Abrir a proposta noutro portátil,
   * restaurá-la do servidor ou copiá-la de outra deixa-o para trás — e sem essa
   * regra os textos ingleses existiam no documento e o ecrã não os mostrava:
   * invisíveis e editáveis por acidente, que é a pior combinação. A regra
   * aplica-se no restauro (ver o efeito «CORRE UMA VEZ SÓ») e aqui, para a
   * proposta que já abre com inglês vindo do pedido.
   */
  const [bilingue, setBilingue] = useState(() => docTemIngles(initialDoc(quote)));
  /** A tradução automática está a correr. Trava o botão para não haver duas a
   *  escrever no mesmo documento — a segunda escreveria por cima da primeira. */
  const [aTraduzir, setATraduzir] = useState(false);
  /**
   * O servidor tem serviço de tradução configurado?
   *
   * Pergunta-se, não se adivinha: a chave vive do lado do servidor e o estúdio
   * corre no navegador, onde ela nunca pode chegar. Começa em `"desligada"` — o
   * lado seguro: um botão desligado que diz porquê é melhor do que um botão que
   * promete uma tradução que não vai acontecer.
   *
   * ── E SÃO TRÊS ESTADOS E NÃO DOIS, PORQUE A FRASE MUDA ────────────────────
   *
   * `"indisponivel"` — a pergunta não chegou a ter resposta — desliga o botão
   * exactamente como `"desligada"`, e isso está certo. O que não pode ser igual
   * é o que se lê por baixo: «ainda não está ligada neste servidor» é uma
   * afirmação sobre a CONFIGURAÇÃO, e dita sobre uma sessão caducada manda-a
   * procurar uma chave em falta em vez de recarregar a página.
   */
  const [traducao, setTraducao] = useState<EstadoDaTraducao>("desligada");
  const traducaoLigada = traducao === "ligada";
  const [confirmSend, setConfirmSend] = useState(false);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * POR ONDE É QUE A PROPOSTA SEGUE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Quero colocar aqui a opção de enviar por email e por WhatsApp. E quero que
   * seja possível escolher enviar apenas só para o email, apenas só para o
   * WhatsApp, ou para os dois.»
   *
   * ── OS DOIS CANAIS NÃO FUNCIONAM DA MESMA MANEIRA, E ISSO VÊ-SE ─────────
   *
   * O **email** sai do SERVIDOR: leva o PDF em anexo e parte sozinho quando ela
   * carrega em enviar.
   *
   * O **WhatsApp** não. Nenhuma página consegue mandar uma mensagem por
   * alguém — o que se pode é abrir o WhatsApp com a mensagem escrita e a lista
   * de contactos à espera. Ou seja, o WhatsApp é sempre um SEGUNDO gesto, dela,
   * a seguir a este. E não pode ser automático: uma janela aberta depois de um
   * `await` é bloqueada pelo browser (a mesma razão pela qual o «Imprimir folha
   * do dia» vive onde vive).
   *
   * Por isso a escolha faz duas coisas diferentes: decide se o email SAI, e
   * decide se o passo do WhatsApp fica em destaque no fim. Não finge que os
   * dois são a mesma coisa.
   *
   * ── E LEMBRA-SE DA ÚLTIMA ──────────────────────────────────────────────
   *
   * A omissão é «Email», que é como isto sempre funcionou — ninguém que não
   * peça nada pode passar a ter uma janela do WhatsApp a abrir-se. Mas se ela
   * escolher WhatsApp, é isso que encontra da próxima: uma escolha que se
   * repete todos os dias e se pede todos os dias é uma escolha mal feita.
   */
  const [canal, setCanal] = useState<CanalDeEnvio>("email");
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CANAL_GUARDADO);
      if (guardado === "email" || guardado === "whatsapp" || guardado === "ambos") {
        setCanal(guardado);
      }
    } catch {
      /* Uma janela privada ou o armazenamento desligado dão erro aqui. A
         omissão serve, e não vale um ecrã partido. */
    }
  }, []);
  const escolherCanal = useCallback((c: CanalDeEnvio) => {
    setCanal(c);
    try {
      localStorage.setItem(CANAL_GUARDADO, c);
    } catch {
      /* Ver acima: não poder lembrar-se não é razão para não obedecer agora. */
    }
  }, []);
  /**
   * O que a composição cortou no documento que estava a seguir — `null`
   * enquanto ninguém perguntou nada.
   *
   * Não é um estado de erro: é uma pergunta que o servidor devolveu com o PDF
   * já desenhado e nada ainda gravado nem enviado. Ver `send`.
   */
  const [cortesPorConfirmar, setCortesPorConfirmar] = useState<Corte[] | null>(null);
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
  const [pdfVisto, setPdfVisto] = useState<{
    chave: string;
    retrato: string;
    confirmado: boolean;
  } | null>(() => lerPdfVisto(quote.id));
  /**
   * Fica guardado nesta aba (`sessionStorage`), por pedido. Num telemóvel, o
   * PDF aberto por cima do back office e o «voltar» recarregavam o estúdio, e
   * o «já vi» perdia-se — o botão voltava a «Ver o PDF», sem fim (23/10). A
   * regra continua a mesma: só vale para o documento EXACTO que foi visto
   * (`retrato`), e o servidor confere a `chave`.
   */
  useEffect(() => {
    guardarPdfVisto(quote.id, pdfVisto);
  }, [quote.id, pdfVisto]);
  /**
   * O PDF aberto DENTRO do estúdio (`VerOPdfNoEcra`) — no telemóvel, em vez
   * de o descarregar. Ver o comentário desse ficheiro.
   */
  const [pdfNoEcra, setPdfNoEcra] = useState<{
    blob: Blob;
    nome: string;
    rascunho: boolean;
  } | null>(null);
  /**
   * O PDF FINAL da versão que está no ecrã, pedido antes de ela carregar no
   * botão (ver o efeito «PREPARADO ANTES DE ELA CARREGAR»). `retrato` diz de
   * que versão é; uma versão diferente não o usa.
   */
  const pdfPreparado = useRef<{ retrato: string; promessa: Promise<PdfPronto> } | null>(null);
  /**
   * O que seguiu no último envio: a proposta gravada (para ir buscar o PDF
   * guardado) e, se ainda estiver à mão, o próprio ficheiro.
   */
  const enviada = useRef<{ id: string | null; pdf: Promise<PdfPronto> | null } | null>(null);
  // Fluxo guiado: Conteúdo → Pré-visualizar → Enviar.
  const [step, setStep] = useState<Step>("evento");
  // Qual o destino das fotos escolhidas na biblioteca de temas (null = fechado).
  const [picker, setPicker] = useState<
    // `substituir` é a posição a TROCAR no lugar: a foto escolhida entra ali em
    // vez de ir para o fim. Sem isto, trocar uma foto era removê-la, escolher
    // outra, e arrastá-la de volta ao sítio onde a primeira estava.
    | { kind: "board"; bi: number; substituir?: number }
    | { kind: "cover"; idx: number }
    /** Uma página do PDF (`fotosDasPaginas`): a foto vai para o lugar `lugar`. */
    | { kind: "pagina"; chave: string; lugar: number; max: number }
    | null
  >(null);

  /* ── A BIBLIOTECA DE TEMAS TAMBÉM SE FECHA ────────────────────────────────
     Era a última folha da casa sem saída, e a única que precisava de uma
     alteração DESTE lado: as outras desapareciam por um `return null` próprio,
     esta desaparece porque o `picker` fica nulo aqui.

     O `ultimoPicker` existe porque a folha continua a desenhar-se durante os
     200 ms da saída e precisa de saber o que estava a mostrar — sem ele, lia
     `picker.kind` de um nulo. Guarda-se no desenho e não num efeito: num efeito
     o React já teria desenhado o nulo.

     E é o MESMO nó a sair, nunca um recriado: esta folha rouba o foco ao
     montar, e um nó novo a meio da saída roubava-o outra vez para uma caixa que
     já se está a apagar. */
  const aSairDoPicker = useSaidaDeUmSo(picker !== null);
  const [ultimoPicker, setUltimoPicker] = useState(picker);
  if (picker !== null && picker !== ultimoPicker) setUltimoPicker(picker);
  const pickerNoEcra = picker ?? (aSairDoPicker ? ultimoPicker : null);
  /** O que está a ser arrastado agora (identificador do dnd-kit), ou nada. */
  /** As fotos de biblioteca já usadas noutras propostas, com onde e quando. */
  const [repetidas, setRepetidas] = useState<FotoRepetida[]>([]);
  const [aArrastar, setAArrastar] = useState<string | null>(null);
  /** A fotografia aberta em grande: o board e a posição. */
  const [lupa, setLupa] = useState<{ bi: number; ii: number } | null>(null);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO QUE ESTA PROPOSTA CUSTOU MESMO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «não relógio de parede: tempo com a página em foco».
   *
   * A contagem vive numa `ref` e não em estado: um acontecimento por tecla
   * escrita a redesenhar o estúdio inteiro seria pagar em fluidez o preço de
   * medir a fluidez. O ecrã lê-a de meio em meio minuto, que é o passo a que o
   * número muda.
   *
   * A regra do que conta está em `tempo-activo.ts`, com relógio injectado e
   * testes — incluindo o caso que estraga qualquer medição destas: o ecrã que
   * ficou aberto enquanto ela foi ao telefone.
   */
  const tempo = useRef<Contagem>(CONTAGEM_VAZIA);
  const [tempoMostrado, setTempoMostrado] = useState(0);
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEMPO SOBE PARA O SERVIDOR — E SOBE EM PEDAÇOS, NÃO EM TOTAIS
   * ════════════════════════════════════════════════════════════════════════
   *
   * A pergunta que motiva tudo isto é «que boards custam mais tempo?», e essa
   * pergunta atravessa PROPOSTAS e APARELHOS. Guardado no `localStorage`, o
   * total seria o deste computador — e uma proposta começada no portátil e
   * acabada no tablet contaria metade em cada sítio.
   *
   * Envia-se o INCREMENTO desde o último envio, e o servidor soma. Se se
   * enviasse o total, dois separadores abertos na mesma proposta escreviam um
   * por cima do outro e ficava só o do último a falar.
   *
   * O que já foi enviado vive numa `ref`: é o ponto de referência do próximo
   * incremento, e não tem nada que redesenhar o ecrã quando muda.
   */
  const tempoEnviado = useRef(0);
  /**
   * A secção onde ela está agora, vinda da coluna lateral (que já a calcula).
   *
   * Numa `ref` e não em estado: muda a cada scroll, e o número que ela alimenta
   * só é lido de meio em meio minuto. Em estado, rolar a página redesenhava o
   * estúdio inteiro para não mudar nada no ecrã.
   */
  const seccaoActivaRef = useRef<string | null>(null);
  const anotarSeccao = useCallback((id: string | null) => {
    seccaoActivaRef.current = id;
  }, []);
  const reportarTempo = useCallback(
    (total: number, aFechar = false) => {
      const delta = Math.round(total - tempoEnviado.current);
      // Menos de um segundo não vale um pedido. A `ref` não avança, portanto
      // este bocadinho não se perde: vai no envio seguinte.
      if (delta < 1000) return;
      tempoEnviado.current = total;
      const seccao = seccaoActivaRef.current;
      const corpo = JSON.stringify({ ms: delta, ...(seccao ? { seccao } : {}) });
      const url = `/api/orcamento/${quote.id}/tempo-activo`;
      if (aFechar && typeof navigator !== "undefined" && navigator.sendBeacon) {
        // O beacon sobrevive à página; um `fetch` não.
        try {
          navigator.sendBeacon(url, new Blob([corpo], { type: "application/json" }));
          return;
        } catch {
          /* sem beacon — tenta pelo caminho normal, que ainda pode chegar */
        }
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
        keepalive: aFechar,
      }).catch(() => {
        // Sem rede o pedaço perde-se, e isso é aceitável: é uma MEDIÇÃO, não
        // trabalho. Interromper quem está a montar uma proposta para lhe falar
        // de um número que ela não pediu seria trocar o essencial pelo
        // acessório.
      });
    },
    [quote.id],
  );
  useEffect(() => {
    const sinal = (tipo: "vida" | "pausa") => () => {
      tempo.current = comAcontecimento(tempo.current, { tipo, em: Date.now() });
    };
    const vivo = sinal("vida");
    const parado = sinal("pausa");
    const aoMudarDeFoco = () => (document.hidden ? parado() : vivo());
    for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
      window.addEventListener(ev, vivo, { passive: true });
    }
    window.addEventListener("focus", vivo);
    window.addEventListener("blur", parado);
    document.addEventListener("visibilitychange", aoMudarDeFoco);
    vivo();
    // Meio minuto: o número mostrado é em minutos, portanto qualquer passo mais
    // curto seria trabalho para não mudar nada no ecrã. É também o passo a que
    // o tempo sobe para o servidor — o mesmo relógio serve as duas coisas.
    const relogio = setInterval(() => {
      const total = totalAte(tempo.current, Date.now());
      setTempoMostrado(total);
      reportarTempo(total);
    }, 30_000);
    /**
     * ── AO FECHAR, O QUE FALTAVA ─────────────────────────────────────────
     *
     * O passo é de meio minuto, portanto fechar o separador deixava sempre
     * para trás até meio minuto — e, num dia de trabalho partido em muitas
     * aberturas curtas, «até meio minuto de cada vez» deixa de ser arredondar
     * e passa a ser um viés sempre para baixo.
     *
     * `sendBeacon` e não `fetch`: um `fetch` disparado no `pagehide` é
     * cancelado com a página. O beacon é entregue pelo browser depois de o
     * separador morrer, que é precisamente o que aqui se quer.
     */
    const aoFechar = () => reportarTempo(totalAte(tempo.current, Date.now()), true);
    window.addEventListener("pagehide", aoFechar);
    return () => {
      for (const ev of ["pointerdown", "keydown", "wheel", "scroll"] as const) {
        window.removeEventListener(ev, vivo);
      }
      window.removeEventListener("focus", vivo);
      window.removeEventListener("blur", parado);
      document.removeEventListener("visibilitychange", aoMudarDeFoco);
      window.removeEventListener("pagehide", aoFechar);
      clearInterval(relogio);
      // Trocar de cliente também fecha esta medição: sem isto, o tempo desde o
      // último passo ficava por contar em todas as trocas.
      aoFechar();
    };
  }, [reportarTempo]);

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
  /** A vista com as páginas lado a lado está aberta? */
  /** As fotos escolhidas para serem movidas em conjunto — chaves `bi:ii`. */
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const hydrated = useRef(false);
  /** `updatedAt` do rascunho do servidor tal como o lemos — é com isto que o
   *  servidor deteta que alguém gravou por cima entretanto. */
  const serverStamp = useRef<string | null>(null);
  /** O documento tal como o servidor o tem, da última vez que se falou com
   *  ele. É a base contra a qual se diz «mudei estes campos» — ver
   *  `camposMudados`. */
  const docDoServidor = useRef<Record<string, unknown> | null>(null);
  /** Já avisámos desta gravação cruzada? (uma vez chega; não a cada gravação) */
  const warnedOverwrite = useRef(false);
  const avisouJuncao = useRef(false);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O TRABALHO QUE ESTA SESSÃO ESMAGOU, E DE ONDE SE VAI BUSCAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O aviso da gravação cruzada é um `toast`, e um `toast` desaparece. Para
   * dizer «ficou a tua versão» isso chega — é uma notícia, não uma tarefa.
   *
   * Isto é outra coisa: é trabalho de outra pessoa à espera de uma decisão.
   * Uma notícia que se apaga sozinha ao fim de uns segundos não serve para
   * uma decisão que a pessoa pode querer tomar dez minutos depois, quando
   * perceber o que aconteceu. Por isso o `toast` continua a dar a notícia, e
   * isto fica no ecrã até alguém resolver — repondo ou dispensando.
   *
   * Fica só em memória, de propósito: não é um estado do documento, é uma
   * coisa desta sessão. Se ela fechar o separador sem decidir, o trabalho
   * continua guardado no servidor e o próximo aviso de sobreposição volta a
   * apontar para lá. O que se perde é o lembrete, não o trabalho.
   */
  const [sobreposto, setSobreposto] = useState<{
    /** A gaveta, tal como o servidor a nomeou. */
    chave: string;
    /** Quem tinha escrito aquilo, quando se sabe. */
    quem?: string;
    /** Quando é que tinha sido gravado. */
    quando?: string;
  } | null>(null);
  /** A repor: a leitura da gaveta demora, e o botão tem de o dizer. */
  const [aRepor, setARepor] = useState(false);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE SEGUIU PARA O CLIENTE, E O QUE ESTE APARELHO TEM
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, com três pontos de exclamação: «eu quero igual o valor!!!
   * até eu alterar por mim!». O PDF que o casal tem em mãos dizia 13.257,85 € a
   * pagar; a proposta reabria a dizer 15.090,55 €.
   *
   * As contas que faziam o número mexer sozinho estão corrigidas (ver os três
   * blocos «AQUI ESTAVA O VALOR A CRESCER SOZINHO» e o merge do rascunho do
   * servidor). Isto é a REDE por baixo delas: o estúdio nunca olhava para o
   * documento que SEGUIU. O que reabria era o rascunho deste aparelho com o
   * «Preço final» do pedido por cima — dois números que ninguém obriga a
   * continuar iguais ao terceiro, o que o casal recebeu.
   *
   * Agora, ao abrir, compara-se com a última proposta ENVIADA. Havendo
   * diferença, ela aparece ESCRITA, com os dois números lado a lado, antes de
   * qualquer decisão.
   *
   * ── PORQUE É QUE NÃO SE REPÕE SOZINHO ────────────────────────────────────
   *
   * Porque duas coisas legítimas produzem exactamente a mesma diferença, e o
   * código não as distingue:
   *
   *   · o valor mexeu sozinho — e repor o enviado é o que ela quer;
   *   · ela CORRIGIU o preço de propósito depois do envio, na Gestão do pedido
   *     ou aqui, para a proposta seguinte — e repor o enviado apagava-lhe a
   *     correcção sem uma palavra.
   *
   * Escolher por ela seria acertar em metade dos casos e destruir trabalho na
   * outra metade, em silêncio nos dois. O que a rede garante é que nenhum dos
   * dois números ganha sem ela saber: estão os dois no ecrã, com as datas, e o
   * botão de repor é dela.
   */
  const [divergenciaDoEnviado, setDivergenciaDoEnviado] = useState<{
    /** Quando é que a proposta seguiu para o cliente. */
    enviadaEm: string;
    /** O total a pagar (com IVA) que ia no PDF que ele recebeu. */
    aPagarEnviado: number;
    /** O total a pagar que este ecrã mostra agora. */
    aPagarAqui: number;
    /** O identificador da versão, para ir buscar o documento ao repor. */
    versaoId: string;
    /**
     * ── A ÚNICA PERGUNTA QUE INTERESSA: FOI ELA? ──────────────────────────
     *
     * Palavras dela: «ISTO E SIMPLES, O VALOR NAO ALTERA CASO EU NAO MUDO».
     *
     * `false` — não há registo de ninguém ter mexido no preço depois do envio,
     * portanto o número mexeu-se SOZINHO. Não há nada a perguntar: repõe-se o
     * que seguiu para o cliente, com aviso e com dez segundos para anular.
     *
     * `true` — há um `price_set` no histórico do pedido posterior ao envio.
     * Ela corrigiu o preço de propósito depois de a proposta ter saído, e esse
     * é trabalho dela: repor por cima apagava-o em silêncio. Só nesse caso é
     * que os dois números vão ao ecrã com a escolha.
     */
    elaMudou: boolean;
  } | null>(null);
  /** A ir buscar o documento que seguiu, para o repor. */
  const [aReporOEnviado, setAReporOEnviado] = useState(false);
  /** A conferência com o enviado corre UMA vez por abertura. */
  const conferidoComOEnviado = useRef(false);
  /** A abertura assentou (o rascunho local e o do servidor já foram lidos)?
   *  Sem isto a conferência olhava para um ecrã a meio de ser montado. */
  const [aberturaAssente, setAberturaAssente] = useState(false);

  // ── Restore draft on mount ──
  //
  // ════════════════════════════════════════════════════════════════════════
  // CORRE UMA VEZ SÓ, E O `return` DE CIMA É O QUE O GARANTE
  // ════════════════════════════════════════════════════════════════════════
  //
  // As dependências vazias não chegam. Em desenvolvimento o React monta,
  // limpa e volta a montar cada componente de propósito (`reactStrictMode`),
  // e este efeito corria as duas vezes — mas a SEGUNDA já não lia o rascunho
  // dela. Lia o que a gravação automática tinha entretanto escrito por cima.
  //
  // A sequência medida, com um rascunho de 2 boards no `localStorage`:
  //
  //   1ª passagem   lê 2 boards, põe `setDoc` na fila, `hydrated = true`
  //   (a limpeza)   `hydrated` já é `true`, portanto a desmontagem simulada
  //                 grava — e o documento que ela tem à mão ainda é o de
  //                 ANTES do restauro: escreve 0 boards por cima dos 2
  //   2ª passagem   lê os 0 boards que acabaram de ser escritos e mete-os
  //                 na fila também
  //   fim           as duas actualizações correm por ordem: 0 → 2 → 0
  //
  // Resultado: o estúdio abria vazio com o trabalho todo no `localStorage`, e
  // a gravação seguinte tornava a perda definitiva. Era isto que impedia
  // qualquer teste de ponta-a-ponta de partir de um rascunho semeado — a
  // suite das propostas corre contra o servidor de DESENVOLVIMENTO, que é
  // precisamente onde a segunda passagem existe.
  //
  // Um efeito de restauro tem de ser idempotente: correr outra vez não pode
  // significar ler outra vez. Lido uma vez, fica lido.
  useEffect(() => {
    if (hydrated.current) return;
    let hadDraft = false;
    /** O rascunho deste aparelho, já lido — e a BASE que ele traz. Guardam-se
     *  aqui fora porque o ramo do «o pedido ainda não tem preço», lá em baixo,
     *  precisa dos dois: ler `totalInput` ali daria SEMPRE a cadeia vazia (o
     *  `setTotalInput` de cima só entra em vigor na render seguinte), e a
     *  conversão para o pedido precisa dos adicionais DO RASCUNHO, não dos do
     *  documento em branco que ainda está no estado. */
    let rascunhoLocal: StudioDoc | null = null;
    let baseDoRascunho: number | undefined;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          hadDraft = true;
          // Rascunhos antigos guardaram a capa esparsa (`[null, "foto"]`) ou
          // curta (`["foto"]`) — normalizar já aqui mantém a foto da direita
          // na posição da direita.
          setDoc((d) => {
            const merged = { ...d, ...parsed };
            // `stripPendingImages` também aqui: gravar já os filtra, mas um
            // rascunho escrito por uma versão anterior (ou por outra aba) não
            // pode fazer aparecer no ecrã um caminho que nunca vai existir.
            return stripPendingImages({
              ...merged,
              coverImages: normaliseCoverImages(merged.coverImages),
            });
          });
          rascunhoLocal = parsed as StudioDoc;
          // A BASE, não o `totalAmount` cru — ver `baseDoDoc`.
          const base = baseDoDoc(parsed);
          baseDoRascunho = base;
          if (base != null) setTotalInput(textoDoTotal(base));
          // Um rascunho que já traz traduções abre com as caixas inglesas à
          // vista, haja `meta` ou não: texto que existe no documento e não
          // aparece no ecrã é texto que se perde sem ninguém dar por isso.
          if (docTemIngles(parsed)) setBilingue(true);
        }
      }
      const rawMeta = localStorage.getItem(SIDE_KEY);
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        if (meta?.urls && typeof meta.urls === "object") setAssetUrls(meta.urls);
        // Rascunhos gravados antes de o plano B existir não o têm: abrem na
        // mesma, e a hidratação preenche-o assim que responder.
        if (meta?.originais && typeof meta.originais === "object") {
          setAssetOriginais(meta.originais);
        }
        // O degrau do meio viaja com o rascunho pela mesma razão que o plano B,
        // e rascunhos gravados antes de ele existir não o têm: abrem na mesma,
        // com a cascata de dois degraus, até a hidratação responder.
        if (meta?.medias && typeof meta.medias === "object") {
          setAssetMedias(meta.medias);
        }
        // Rascunhos guardados antes de as cores existirem não as têm: abrem na
        // mesma, e a hidratação preenche-as assim que o servidor responder.
        if (meta?.cores && typeof meta.cores === "object") setAssetCores(meta.cores);
        // Rascunhos guardados antes de isto existir não têm `themeOrigins` —
        // abrem na mesma, só sem as marcas de "já nesta proposta".
        if (meta?.themeOrigins && typeof meta.themeOrigins === "object") {
          setThemeOrigins(meta.themeOrigins);
        }
        if (typeof meta?.refEdited === "boolean") setRefEdited(meta.refEdited);
        /**
         * O interruptor «Proposta bilingue» volta com o rascunho — e lê-se AQUI
         * pela razão que o bloco de cima conta: um `useEffect` novo a ler o
         * `localStorage` é a porta por onde o defeito do restauro voltaria a
         * entrar. Uma linha, no mesmo bloco, com a mesma tolerância a rascunhos
         * antigos que não o têm.
         *
         * `if (…) setBilingue(true)` e não `setBilingue(meta.bilingue)`: um
         * `meta` gravado com `false` não pode desligar um interruptor que o
         * documento restaurado acabou de acender (ver logo a seguir).
         */
        if (meta?.bilingue === true) setBilingue(true);
        /**
         * ── A LÍNGUA ESCOLHIDA VOLTA COM O RASCUNHO ─────────────────────────
         *
         * Aqui dentro, no efeito que corre uma vez só, pela razão que o bloco
         * de cima conta.
         *
         * E ao contrário do interruptor bilingue, esta lê-se NOS DOIS SENTIDOS
         * (`setIdiomaDoPdf(meta.idioma)` e não `if (…=== "en")`): o interruptor
         * tem uma segunda fonte — o documento com traduções lá dentro acende-o
         * sozinho —, a língua não tem nenhuma. Guardar só o «en» era guardar
         * metade da escolha, e voltar atrás para português deixava de pegar.
         *
         * Porque é que isto tem de sobreviver: a língua vai GRAVADA com o
         * envio. Decide o email que o casal recebe, o nome do anexo, a página
         * onde ele responde e a segunda descarga. Reposta em silêncio, uma
         * proposta escrita e revista em inglês seguia em português para um
         * casal que não lê português — e no ecrã nada tinha dito que a escolha
         * se perdeu. Rascunhos guardados antes disto existir não trazem o
         * campo: abrem em português, que é o que já faziam.
         */
        if (ehIdiomaDaProposta(meta?.idioma)) setIdiomaDoPdf(meta.idioma);
      }
    } catch {
      /* ignore corrupt draft */
    }
    // Só semeia defaults quando NÃO havia rascunho guardado — um rascunho
    // existente (mesmo sem grupos) nunca é sobrescrito.
    if (!hadDraft) {
      setDoc((d) => seedDefaults(d, quote));
      // E NÃO marca nada. A razão está por extenso no `realce`, mais abaixo:
      // marcar o que vem do pedido acendia seis anéis em TODAS as propostas, e
      // um aviso que está sempre ligado deixa de ser um aviso.
      setPorConfirmar(new Set());
    }

    // O VALOR é a excepção, e de propósito: vem SEMPRE do pedido, haja rascunho
    // ou não. Era aqui que os dois números se separavam — com rascunho, o
    // estúdio nunca mais olhava para o "Preço final", e uma alteração feita na
    // Gestão do pedido não chegava ao PDF.
    const doPedido = quote.quotedPrice;
    if (typeof doPedido === "number" && doPedido > 0) {
      precoEnviado.current = doPedido;
      /**
       * ── AQUI ESTAVA O VALOR A CRESCER SOZINHO ──────────────────────────
       *
       * Isto punha o preço do PEDIDO no campo do ESCRITO, sem lhe tirar os
       * adicionais. O pedido guarda o que o casal paga (serviços + deslocação);
       * o campo diz «Valor (sem IVA)» e significa só os serviços. Com os dois
       * a receber o mesmo número, a gravação seguinte somava a deslocação
       * outra vez — e a visita seguinte começava do número já inflacionado.
       *
       * 3.000 → 3.140 → 3.280 → 3.420. Uma soma por visita.
       *
       * A conversão é a mesma que o outro sentido da sincronização já fazia
       * (ver o efeito de `quote.quotedPrice`). O que faltava era usá-la aqui.
       *
       * O `setTotalInput` vai DENTRO do `setDoc` porque a conversão precisa do
       * documento — dos adicionais e do modo de IVA — e ler `doc` fora do
       * actualizador daria o estado anterior à hidratação do rascunho.
       */
      setDoc((d) => {
        const paraOEcra = baseDoPedidoParaOEcra(doPedido, d);
        // `null` = a conta não dá. NÃO se esvazia o campo: um campo em branco
        // numa proposta que tem preço é ela a ver desaparecer o que escreveu, e
        // a gravação seguinte levava o branco à frente. Fica o que o documento
        // já diz, e o aviso de desalinhamento explica a diferença.
        if (paraOEcra == null) return d;
        setTotalInput(textoDoTotal(paraOEcra));
        return aplicarBase(d, paraOEcra);
      });
    } else if (hadDraft) {
      // O pedido ainda não tem preço mas o rascunho tem um valor escrito antes
      // de isto existir. Não se deita fora: adopta-se, e GRAVA-SE no pedido —
      // é o que faz os dois convergirem numa verdade só, em vez de escolher
      // uma e perder a outra.
      //
      // ── E LIA O CAMPO ERRADO ────────────────────────────────────────────
      //
      // Estava `parseMoneyText(totalInput)`, e `totalInput` aqui é SEMPRE "":
      // começa vazio e o `setTotalInput` de cima só entra em vigor na render
      // seguinte. O ramo nunca gravava nada — a promessa escrita nele («os dois
      // convergem numa verdade só») não se cumpria uma única vez, e um pedido
      // sem preço com uma proposta escrita continuava a aparecer sem dinheiro
      // nenhum na Visão Geral, no Kanban e no dossier.
      //
      // Lê-se agora a base DO RASCUNHO, e a conversão para o pedido é feita
      // contra o rascunho — que é quem tem os adicionais. Ver
      // `baseDoEcraParaOPedido`.
      if (baseDoRascunho != null && baseDoRascunho > 0) {
        persistirPreco(baseDoRascunho, rascunhoLocal ? { doc: rascunhoLocal } : undefined);
      }
    }
    hydrated.current = true;
    // SÓ quando não havia rascunho nenhum. Ver o bloco «A ABERTURA TAMBÉM NÃO
    // É TRABALHO POR GRAVAR»: abrir um pedido virgem é semear o que veio do
    // pedido, e isso não se grava; abrir um pedido COM rascunho é outra coisa
    // — o restauro corrige o que lá está (tira marcadores provisórios de fotos
    // que nunca chegaram a existir, acerta o total pelo «Preço final» do
    // pedido) e essas correcções TÊM de ficar gravadas.
    if (!hadDraft) aAbrir.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * O rascunho não chegou ao servidor. Duas coisas acontecem, e são diferentes
   * de propósito:
   *
   *  1. o INDICADOR passa a dizê-lo, e continua a dizê-lo enquanto for verdade —
   *     é o que está à vista quando ela olha para o ecrã;
   *  2. um aviso grande, UMA vez. À segunda seria ruído a cada 800 ms, e um
   *     aviso que aparece sempre é um aviso que se aprende a ignorar.
   */
  const registarSoLocal = useCallback(
    (porque?: string, sessaoExpirada = false) => {
      setSoNesteComputador({ porque });
      if (avisouSoLocal.current) return;
      avisouSoLocal.current = true;
      // Achado n.º 34: com a sessão caída, «fala com quem gere a instalação»
      // mandava procurar uma avaria que não existe. Basta entrar outra vez.
      toast(
        sessaoExpirada
          ? "A tua sessão expirou e este rascunho ficou guardado SÓ NESTE COMPUTADOR. Não feches o separador: entra outra vez e continua — a gravação seguinte já chega ao servidor."
          : `Este rascunho está guardado SÓ NESTE COMPUTADOR — não chegou ao servidor.${
              porque ? ` ${porque}` : ""
            } Não feche o separador sem falar com quem gere a instalação: noutro dispositivo esta proposta não existe.`,
        "error",
      );
    },
    [toast],
  );

  /** A gravação chegou ao servidor. Limpa o aviso E rearma-o: se voltar a
   *  falhar mais tarde, ela tem de ouvir outra vez — a rede pode ter voltado a
   *  cair e o segundo silêncio custaria tanto como o primeiro. */
  const marcarGuardadoNoServidor = useCallback(() => {
    setSoNesteComputador(null);
    avisouSoLocal.current = false;
  }, []);

  /**
   * O rascunho chegou ao servidor, e o servidor disse que o sítio não dura.
   *
   * Mesmo desenho do `registarSoLocal`, e de propósito: o indicador passa a
   * dizê-lo enquanto for verdade, e o aviso grande sai UMA vez. A frase é a do
   * servidor — quem lê isto é quem vai ter com quem gere a instalação, e uma
   * frase com o nome da variável poupa-lhe a viagem de descobrir qual é.
   *
   * NÃO se oferece «tentar outra vez»: a tentativa seguinte cai no mesmo disco.
   * O que resolve isto é ligar a base de dados, e é isso que a frase diz.
   */
  const registarNaoDura = useCallback(
    (aviso?: string) => {
      setNaoDuraAoDeploy({ aviso });
      if (avisouNaoDura.current) return;
      avisouNaoDura.current = true;
      toast(
        aviso ??
          "Este rascunho ficou guardado apenas no disco do servidor, que é apagado no próximo deploy.",
        "error",
      );
    },
    [toast],
  );

  /** O sítio voltou a durar (ligaram a base de dados). Limpa e rearma, pela
   *  mesma razão do `marcarGuardadoNoServidor`. */
  const marcarQueDura = useCallback(() => {
    setNaoDuraAoDeploy(null);
    avisouNaoDura.current = false;
  }, []);

  /**
   * Manda o rascunho ao servidor e ARRUMA a verdade que voltar: o carimbo, o
   * indicador, o aviso. Está num sítio só porque são dois os caminhos que
   * gravam — o debounce de cada alteração e o resgate da abertura — e um deles
   * a esquecer-se de dizer que falhou é exactamente o problema que isto veio
   * resolver.
   */
  const enviarParaServidor = useCallback(
    async (docGravavel: unknown): Promise<ResultadoDaGravacao> => {
      setAGravarNoServidor((n) => n + 1);
      try {
        // O que mudou desde a última conversa com o servidor — é isto que lhe
        // deixa juntar esta gravação com a de outra pessoa campo a campo, em
        // vez de a última escrita levar o documento inteiro (achado n.º 6).
        const enviado = ehObjecto(docGravavel) ? docGravavel : null;
        const desde = docDoServidor.current;
        const r = await gravarRascunhoNoServidor(quote.id, {
          doc: docGravavel,
          baseUpdatedAt: serverStamp.current,
          ...(enviado && desde ? camposMudados(desde, enviado) : {}),
        });
        if (r.estado === "guardado") {
          if (r.updatedAt) serverStamp.current = r.updatedAt;
          docDoServidor.current = r.doc ?? enviado;
          // O que veio da outra pessoa vai para o ecrã — mas só nos campos em
          // que esta não mexeu entretanto (a gravação demora; ela pode ter
          // continuado a escrever).
          const junto = r.doc;
          if (junto && enviado) {
            setDoc((d) => {
              const atual = d as unknown as Record<string, unknown>;
              const novo: Record<string, unknown> = { ...atual };
              let mudou = false;
              for (const k of new Set([...Object.keys(junto), ...Object.keys(enviado)])) {
                if (mesmoValor(junto[k], enviado[k])) continue;
                if (!mesmoValor(atual[k], enviado[k])) continue;
                // Nunca se APAGA um campo do ecrã por causa de uma junção: o
                // documento do estúdio tem a forma inteira, e um campo que lhe
                // falte (os Serviços, por exemplo) deita abaixo o editor que o
                // desenha. Vindo vazio do servidor, fica o que está.
                if (junto[k] === undefined) continue;
                novo[k] = junto[k];
                mudou = true;
              }
              return mudou ? (novo as unknown as StudioDoc) : d;
            });
          }
          marcarGuardadoNoServidor();
          // Só um `false` EXPLÍCITO alarma — ver `duradouro`. Um servidor que
          // não diga nada é tratado como sempre foi.
          if (r.duradouro === false) registarNaoDura(r.aviso);
          else marcarQueDura();
        } else {
          registarSoLocal(r.porque, r.sessaoExpirada);
        }
        return r;
      } finally {
        setAGravarNoServidor((n) => Math.max(0, n - 1));
      }
    },
    [quote.id, marcarGuardadoNoServidor, registarSoLocal, registarNaoDura, marcarQueDura],
  );

  // ── O rascunho que está no SERVIDOR ──
  // A cópia local abre primeiro (é instantânea e funciona sem rede); logo a
  // seguir vai-se buscar a do servidor e, se for mais recente, é essa que
  // vale. É isto que faz começar no portátil e continuar no tablet — e que
  // impede limpar o histórico de apagar trabalho.
  useEffect(() => {
    let active = true;
    (async () => {
      // O que este navegador tem guardado, e de quando. Lê-se ANTES de falar
      // com o servidor porque é isto que decide se há alguma coisa para
      // resgatar — ver o bloco do resgate, mais abaixo.
      let localStamp = 0;
      let docLocal: unknown = null;
      try {
        localStamp = Number(localStorage.getItem(`${DRAFT_KEY}:at`) ?? 0);
        const cru = localStorage.getItem(DRAFT_KEY);
        if (cru) docLocal = JSON.parse(cru);
      } catch {
        /* localStorage indisponível ou rascunho ilegível — fica a valer o servidor */
      }

      let leituraOk = false;
      let draft: { doc?: unknown; updatedAt?: string } | null = null;
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/proposta-rascunho`, {
          cache: "no-store",
        });
        if (res.ok) {
          leituraOk = true;
          const data = await res.json().catch(() => null);
          const d = data?.draft;
          if (d?.doc && typeof d.doc === "object") draft = d;
        }
      } catch {
        /* sem rede: continua-se com a cópia local, como antes */
      }
      if (!active) return;
      if (draft) {
        serverStamp.current = typeof draft.updatedAt === "string" ? draft.updatedAt : null;
        docDoServidor.current = ehObjecto(draft.doc) ? draft.doc : null;
      }

      const carimboDoServidor = draft ? Date.parse(draft.updatedAt ?? "") || 0 : 0;
      const localMaisRecente = localStamp > carimboDoServidor;

      /**
       * ══════════════════════════════════════════════════════════════════════
       * O RESGATE DO QUE FICOU PRESO NESTE NAVEGADOR
       * ══════════════════════════════════════════════════════════════════════
       *
       * Este é o caminho por onde o trabalho da colaboradora volta. Enquanto o
       * servidor recusou as gravações, tudo o que ela montou ficou no
       * `localStorage` daquele portátil — intacto, e invisível para toda a
       * gente. O estúdio abria, via que o servidor não tinha rascunho nenhum, e
       * não fazia nada com essa informação: esperava pela próxima tecla.
       *
       * Agora, ao abrir, se a cópia deste navegador for mais recente do que a
       * do servidor — ou se o servidor não tiver nenhuma e esta existir —
       * tenta-se ENVIÁ-LA outra vez. É o gesto que a pessoa faria se soubesse
       * que tinha de o fazer, feito sem ela ter de saber.
       *
       * Só quando a leitura CORREU BEM. Se o `GET` falhou não se sabe o que
       * está lá; escrever por cima às cegas podia apagar uma versão mais
       * recente feita noutro dispositivo, e trocar uma perda por outra não é
       * resgate nenhum.
       */
      if (leituraOk && docLocal && typeof docLocal === "object" && (localMaisRecente || !draft)) {
        // Os marcadores provisórios saem, como em qualquer gravação. Mas se o
        // rascunho preso for de uma versão antiga e não tiver a forma toda, o
        // que se envia é o que lá está: entre enviar com um marcador a mais e
        // não enviar de todo, envia-se — é isto que está a resgatar trabalho.
        let paraEnviar: unknown = docLocal;
        try {
          paraEnviar = stripPendingImages(docLocal as StudioDoc);
        } catch {
          /* fica o original */
        }
        void (async () => {
          const r = await enviarParaServidor(paraEnviar);
          // Dizer que o resgate aconteceu é metade do resgate: sem isto ela não
          // tem como saber que o que estava preso já está a salvo, e continua a
          // não fechar o portátil.
          if (active && r.estado === "guardado") {
            toast(
              "O rascunho que estava guardado só neste computador foi enviado para o servidor. Já pode ser aberto noutro dispositivo.",
              "success",
            );
          }
        })();
      }

      if (!draft?.doc || typeof draft.doc !== "object") return;
      // A local só ganha se for MESMO mais recente; em empate vale a do
      // servidor, que é a que os outros dispositivos veem.
      if (localMaisRecente) return;
      // ── O VALOR É A EXCEPÇÃO, AQUI TAMBÉM ───────────────────────────
      //
      // A montagem aplica o "Preço final" do PEDIDO por cima do rascunho,
      // de propósito e com a razão escrita lá em cima: é o mesmo número
      // visto de dois sítios. Este merge, 100–300 ms depois, punha o
      // `totalAmount` do rascunho por cima outra vez — e ganhava quase
      // sempre, porque o carimbo local é escrito ANTES do PUT e o
      // `updatedAt` do servidor DEPOIS, portanto a comparação de datas
      // acima está estruturalmente a favor do servidor.
      //
      // O percurso: ela corrigia o preço de 8.100 para 9.400 na Gestão do
      // pedido, voltava ao estúdio, e o campo voltava sozinho a 8.100. Ao
      // enviar, gravava 8.100 e a correcção desaparecia dos DOIS lados.
      //
      // O rascunho traz o texto, as fotos e as condições — tudo menos o
      // valor. Quem manda no valor é o pedido, e só quando ele tem um.
      const doPedido = quote.quotedPrice;
      const mandaOPedido = typeof doPedido === "number" && doPedido > 0;
      const doDoServidor = draft.doc as Partial<StudioDoc>;
      /**
       * ── E OS CAMPOS EM QUE ELA JÁ ESTÁ COM AS MÃOS FICAM DE FORA ────────
       *
       * Ver o bloco do `camposTocados`, mais abaixo. Sem isto, escrever no
       * primeiro segundo depois de o ecrã abrir perdia o princípio da frase —
       * medido, sete rondas em oito.
       */
      const semOsQueElaTocou = Object.fromEntries(
        Object.entries(doDoServidor).filter(([chave]) => !camposTocados.current.has(chave)),
      ) as Partial<StudioDoc>;
      // A abertura ACABA AQUI quando há rascunho no servidor.
      //
      // Sem isto, o que este merge produz — o rascunho do servidor com o preço
      // do pedido por cima, e sem os marcadores provisórios — ficava por
      // gravar: era «a abertura», e a abertura não se grava. Mas isto não é
      // uma abertura derivada do pedido, é trabalho vindo de outro dispositivo
      // com uma correcção aplicada em cima. Ver o bloco «A ABERTURA TAMBÉM NÃO
      // É TRABALHO POR GRAVAR».
      aAbrir.current = false;
      setDoc((d) => {
        const merged = { ...d, ...semOsQueElaTocou };
        const limpo = stripPendingImages({
          ...merged,
          coverImages: normaliseCoverImages(merged.coverImages),
        });
        /**
         * ── E O PREÇO DO PEDIDO ATRAVESSA PELA CONVERSÃO, COMO NA MONTAGEM ──
         *
         * Aqui estava `aplicarBase(limpo, doPedido)`: o «Preço final» do pedido
         * — que é o que o casal paga, adicionais INCLUÍDOS — escrito em cru no
         * campo que significa só os SERVIÇOS. `dinheiroDaProposta` somava-lhe
         * a deslocação outra vez por baixo, e o total subia exactamente o valor
         * dos adicionais. Medido numa proposta já enviada, com 895,00 € de
         * deslocação: o PDF dizia 10.778,74 € sem IVA e o estúdio reabria a
         * dizer 11.673,74 €.
         *
         * É o MESMO defeito que a montagem já tinha fechado (ver «AQUI ESTAVA
         * O VALOR A CRESCER SOZINHO») — sobrevivia neste segundo efeito, que é
         * o que corre quase sempre: o carimbo local é escrito ANTES do PUT e o
         * `updatedAt` do servidor DEPOIS, portanto a comparação de datas está
         * estruturalmente a favor do servidor. E é também o caminho do
         * telemóvel que abre dias depois sem rascunho guardado nenhum.
         *
         * E ESCALAVA: o número inflacionado ficava no `totalAmount` do rascunho
         * gravado a seguir, e a visita seguinte partia de lá.
         *
         * `null` = a conta não dá (o preço do pedido é menor do que os
         * adicionais escritos). Deixa-se o documento como está, pela razão que
         * está escrita em `baseParaOEstudio`: o aviso de desalinhamento já diz
         * o que se passa, e inventar um número aqui fazia o preço do PEDIDO
         * subir na gravação seguinte.
         */
        const paraOEcra = mandaOPedido ? baseDoPedidoParaOEcra(doPedido, limpo) : null;
        // O campo do total é estado à parte e a conversão precisa do documento
        // MERGIDO (dos adicionais e do modo de IVA que vieram do servidor), por
        // isso lê-se aqui dentro — a mesma razão que a montagem tem escrita.
        const base = mandaOPedido ? paraOEcra : (baseDoDoc(doDoServidor) ?? null);
        if (base != null && !camposTocados.current.has("__total")) {
          setTotalInput(textoDoTotal(base));
        }
        return paraOEcra == null ? limpo : aplicarBase(limpo, paraOEcra);
      });
      // O que estava marcado como «vindo do pedido» deixou de estar no ecrã: o
      // que se vê agora é o rascunho dela, feito noutro dispositivo. Manter os
      // anéis pedia confirmação de texto que ela já escreveu — e o anel só vale
      // enquanto quiser dizer «isto não é teu».
      setPorConfirmar(new Set());
      // O documento do servidor pode trazer traduções que este computador nunca
      // viu — é o caso de abrir a proposta noutro portátil. As caixas inglesas
      // acendem-se, pela mesma razão do restauro local.
      if (docTemIngles(doDoServidor)) setBilingue(true);
    })()
      // A abertura ASSENTOU — o rascunho local já foi restaurado e o do
      // servidor já foi lido (ou já se sabe que não há, ou que não dá para
      // perguntar). É a partir daqui que a conferência com o documento que
      // seguiu para o cliente pode olhar para números estáveis; antes disto
      // olhava para um ecrã a meio de ser montado e acusava diferenças que se
      // desfaziam sozinhas 200 ms depois.
      .finally(() => {
        if (active) setAberturaAssente(true);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote.id]);

  // ── Hydrate signed URLs for images already in this draft ──
  // Fills in signed URLs for any image already used in the draft (covers / mood
  // boards) so thumbnails render even on a fresh device or after the cached URL
  // expired. Uploaded images are NOT offered back as a re-pickable gallery.
  //
  // É uma função e não só um efeito porque há um segundo momento em que a
  // pasta do pedido ganha fotos SEM ser por carregamento: quando um modelo
  // parcial traz fotos de outro pedido e elas são recopiadas para cá. Sem uma
  // segunda leitura, as células ficavam sem miniatura até recarregar a página.
  const hidratarAssets = useCallback(
    async (vivo: () => boolean = () => true): Promise<EstadoDosUrls> => {
      {
        // «A caminho» também no reenvio: uma segunda tentativa que aparecesse
        // como «falhou» até responder era um botão que parece não fazer nada.
        setEstadoDosUrls("a-caminho");
        try {
          const res = await fetch(`/api/orcamento/${quote.id}/assets`);
          if (!res.ok) {
            // Um 401 (sessão caducada) e um 500 (Storage em baixo) davam os
            // dois a mesma coisa: nada. O registo diz qual foi, e o ecrã diz
            // que não conseguiu — em vez de o esconder atrás de uma caixa
            // cinzenta que se lê como «esta foto não existe».
            log.warn("estúdio: não deu para ir buscar as fotografias", {
              estado: res.status,
            });
            if (vivo()) setEstadoDosUrls("falhou");
            return "falhou";
          }
          const data = await res.json().catch(() => null);
          const imgs: {
            path: string;
            url: string;
            thumbUrl?: string;
            midUrl?: string;
            cor?: string;
          }[] = Array.isArray(data?.images) ? data.images : [];
          // Saiu de cena a meio: não há veredicto nenhum a dar a ninguém.
          if (!vivo()) return "a-caminho";
          // Zero fotografias É uma resposta: uma proposta sem fotos nenhumas
          // não tem células, e um pedido que respondeu vazio não é um pedido
          // que falhou.
          if (imgs.length === 0) {
            setEstadoDosUrls("pronto");
            return "pronto";
          }
          /**
           * O guardado só conta se ainda for um candidato: um URL que uma
           * célula desta sessão já viu morrer (403/404) não pode ganhar ao
           * fresco só por ter o prazo em dia. Ver `urlsMortos`.
           */
          const vivo_ = (u?: string) => (u && urlsMortos.current.has(u) ? undefined : u);
          setAssetUrls((prev) => {
            const next = { ...prev };
            // A miniatura ganha ao original: é este o caminho que corre quando se
            // REABRE uma proposta, que é onde a grelha mais pesa.
            //
            // E o guardado só ganha ao fresco ENQUANTO SERVIR. Antes era um
            // `!next[im.path]` seco, que deitava fora a assinatura fresca mesmo
            // quando a guardada já estava morta — as fotos de tema assinam a 6
            // horas, e um rascunho aberto de um dia para o outro voltava com a
            // grelha inteira a pedir URLs que o Supabase recusa. Ver
            // `assinatura.ts` para porque é que não bastava substituir sempre.
            for (const im of imgs)
              if (im.path && im.url)
                next[im.path] = urlAindaBom(vivo_(next[im.path]), im.thumbUrl || im.url);
            return next;
          });
          // O original fica guardado à parte, para a célula ter para onde cair
          // quando a miniatura não existir.
          setAssetOriginais((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.url) next[im.path] = urlAindaBom(vivo_(next[im.path]), im.url);
            return next;
          });
          // O degrau do meio, pela mesma regra do original: o guardado só
          // ganha ao fresco enquanto o prazo servir.
          //
          // Uma foto que volte SEM `midUrl` não apaga a que já se sabia: a
          // ausência quer dizer «ainda não foi fabricada», e uma resposta que
          // não a traz não é prova de que a que já se tinha morreu.
          setAssetMedias((prev) => {
            const next = { ...prev };
            for (const im of imgs)
              if (im.path && im.midUrl)
                next[im.path] = urlAindaBom(vivo_(next[im.path]), im.midUrl);
            return next;
          });
          // As cores não expiram (não são URLs assinados): uma vez conhecidas,
          // ficam. Uma foto que volte sem cor não apaga a que já se sabia.
          setAssetCores((prev) => {
            const next = { ...prev };
            for (const im of imgs) if (im.path && im.cor) next[im.path] = im.cor;
            return next;
          });
          setEstadoDosUrls("pronto");
          return "pronto";
        } catch (e) {
          // Offline, ou o Storage em baixo. O estúdio continua a servir para
          // carregar fotos — o que não continua a servir é fingir que as que já
          // lá estão simplesmente não existem.
          log.warn("estúdio: não deu para ir buscar as fotografias", { erro: String(e) });
          if (vivo()) setEstadoDosUrls("falhou");
          return "falhou";
        }
      }
    },
    [quote.id],
  );

  /**
   * O «Tentar» de uma célula que não carregou.
   *
   * ── QUANDO RESULTA, NÃO SE DIZ NADA ───────────────────────────────────────
   * A fotografia aparece na própria célula onde ela carregou. Um aviso a dizer
   * «pronto» por cima de uma foto que já se vê é ruído.
   *
   * ── QUANDO NÃO RESULTA, TEM DE SE DIZER ───────────────────────────────────
   * E era este o buraco: falhar outra vez devolve exactamente a mesma caixa
   * cinzenta de antes do clique — indistinguível de um botão que não fez nada.
   * Ela carregava três, quatro vezes, sem maneira de saber se estava a pedir
   * alguma coisa ao servidor.
   */
  const tentarBuscarFotos = useCallback(async () => {
    const fim = await hidratarAssets();
    if (fim === "falhou") {
      toast(
        "Também não deu desta vez. As fotografias estão guardadas — é a lista que não vem.",
        "error",
      );
    }
  }, [hidratarAssets, toast]);

  useEffect(() => {
    let alive = true;
    void hidratarAssets(() => alive);
    return () => {
      alive = false;
    };
  }, [hidratarAssets]);

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
    void estadoDaTraducao().then((estado) => {
      if (vivo) setTraducao(estado);
    });
    return () => {
      vivo = false;
    };
  }, []);

  // ── Auto-compose the reference until the user overrides it ──
  useEffect(() => {
    if (refEdited) return;
    setDoc((d) => {
      const next = buildRef(d);
      return d.ref === next ? d : { ...d, ref: next };
    });
  }, [doc.template, doc.eventType, doc.clientNames, doc.eventDate, refEdited]);

  // ── Debounced draft persistence ──
  //
  // `flushDraft` guarda a MESMA gravação que o debounce ia fazer, para o
  // Ctrl/Cmd+Enter dos Serviços a poder disparar já (sem duplicar a lógica nem
  // encurtar o debounce, que é o que segura a escrita durante a escrita).
  // Devolve o que o SERVIDOR respondeu, e não `void`: é o que permite ao
  // Ctrl/Cmd+Enter dizer «guardado» só quando o for mesmo, em vez de o dizer
  // por ter escrito no `localStorage` — que era o erro original, em ponto
  // pequeno.
  const flushDraft = useRef<() => Promise<ResultadoDaGravacao>>(async () => ({
    estado: "so-local",
  }));

  // Assim que o documento muda há trabalho por gravar. Volta a false quando a
  // gravação local acontece, oitocentos milissegundos depois.
  //
  // O `ref` ao lado do estado existe para a limpeza da desmontagem (mais
  // abaixo) o poder ler: essa corre uma vez só, com as dependências vazias, e
  // portanto ficaria para sempre com o `porGravar` do primeiro desenho.
  const porGravarRef = useRef(false);
  /**
   * A montagem NÃO é trabalho por gravar.
   *
   * Este efeito também corre no desenho da montagem, e ali o `doc` ainda é o
   * de antes do restauro — o restauro deixou o `setDoc` na fila e ele só
   * chega ao desenho seguinte. Marcar «por gravar» já aqui dava à limpeza da
   * desmontagem (mais abaixo) autorização para gravar esse documento, que é
   * o documento VAZIO: quem abrisse o estúdio e saísse no mesmo instante
   * escrevia-o por cima do rascunho guardado.
   *
   * Saltar a primeira passagem não adia nada do que interessa: o restauro (ou
   * o `seedDefaults`, quando não há rascunho) muda o documento e faz este
   * efeito correr outra vez — aí sim, com a versão boa à mão. O que essa
   * segunda passagem NÃO é está logo a seguir.
   */
  const montagem = useRef(true);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A ABERTURA TAMBÉM NÃO É TRABALHO POR GRAVAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A segunda passagem deste efeito é sempre a da ABERTURA: o restauro do
   * rascunho, ou — quando não há rascunho — o `seedDefaults` com o que veio do
   * PEDIDO (os pontos de decoração que o casal marcou, o preço final, a regra
   * dos adicionais). Nenhuma dessas coisas foi escrita por ela, e marcá-las
   * como trabalho por gravar custava duas coisas:
   *
   *   1. cada pedido ABERTO PARA LER deixava uma linha de rascunho gravada, e
   *      cada troca de separador pagava um PUT para reescrever o que já lá
   *      estava — que é o que o comentário de cima já descrevia;
   *   2. o «Guardar tudo (1)» acendia por nada, várias vezes por hora. É esse
   *      botão que ela olha antes de fechar o portátil, e um alarme que mente é
   *      um alarme que se deixa de ver.
   *
   * Nada se perde: a semeadura é DERIVADA do pedido e reabrir volta a produzir
   * o mesmo documento, e o restauro é a leitura do que já está gravado. Assim
   * que ela escrever a primeira letra, grava-se tudo — semeadura incluída.
   *
   * ── PORQUE É QUE ISTO NÃO PODE ENGOLIR TRABALHO A SÉRIO ───────────────────
   *
   * O silêncio só vale enquanto o documento for IGUAL ao da abertura, e só até
   * à primeira gravação. Depois de haver rascunho gravado, voltar ao estado de
   * abertura é uma alteração como outra qualquer — e tem de ser gravada, senão
   * o que fica no servidor é a versão do meio.
   */
  const aAbrir = useRef(false);
  const marcaDaAbertura = useRef<string | null>(null);
  const jaGravou = useRef(false);
  /** O que se compara com a abertura: só o que é TRABALHO DELA. Os mapas de
   *  apoio (`assetUrls`, `themeOrigins`) ficam de fora de propósito — são
   *  memória de endereços que a hidratação vai buscar ao servidor, e mudam
   *  sozinhos depois de o ecrã abrir. */
  const marcaDoTrabalho = useCallback(
    () => JSON.stringify([doc, refEdited, bilingue, idiomaDoPdf]),
    [doc, refEdited, bilingue, idiomaDoPdf],
  );
  /** Não há nada por gravar: o que está no ecrã é a abertura, e ainda não se
   *  gravou nada. Vale para o indicador E para a gravação — se só valesse para
   *  o indicador, o alarme calava-se e o PUT continuava a sair, que é meia
   *  correcção com o aspecto de uma inteira. */
  const nadaPorGravar = useCallback(
    // `null` (a marca ainda não foi tirada) NUNCA é igual a uma marca: quando
    // há rascunho guardado a abertura não se marca de todo, e o estúdio grava
    // como sempre gravou.
    () => !jaGravou.current && marcaDaAbertura.current === marcaDoTrabalho(),
    [marcaDoTrabalho],
  );
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
      aAbrir.current = false;
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
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    if (montagem.current) {
      montagem.current = false;
      return;
    }
    if (aAbrir.current) {
      // Enquanto durar a abertura, o que está no ecrã É a abertura. Não se
      // fixa na primeira passagem porque a abertura não é uma: o restauro (ou
      // a semeadura) é a primeira, e atrás dela vêm as derivadas — os
      // identificadores estáveis dos grupos e das linhas, o merge do rascunho
      // do servidor, as fotos que a hidratação vai buscar. Nenhuma delas é
      // trabalho dela, e fixar a marca antes de todas fazia o alarme acender
      // por causa de um `id` que o próprio estúdio acabou de escrever.
      marcaDaAbertura.current = marcaDoTrabalho();
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
    // A mensagem do envio conta como trabalho por gravar: sem ela nesta lista, o
    // indicador dizia «guardado às 14:32» com o texto dela ainda por escrever no
    // rascunho — e é essa frase que faz uma pessoa fechar o portátil descansada.
    // `marcaDoTrabalho` na lista não muda nada: o `nadaPorGravar` já depende
    // dela, e o efeito já corria quando ela mudava. Fica escrita para a regra
    // das dependências não ter de ser lida duas vezes.
  }, [doc, assetUrls, themeOrigins, refEdited, bilingue, nadaPorGravar, marcaDoTrabalho]);

  useEffect(() => {
    if (!hydrated.current) return;
    const save = () => {
      // Uma fotografia para o Cmd+Z, tirada quando ela pára de escrever. Se
      // fosse a cada tecla, desfazer andava letra a letra e não servia para
      // nada; se fosse só nas remoções, não desfazia um texto trocado.
      const ultimo = historico.current[historico.current.length - 1];
      if (!ultimo || JSON.stringify(ultimo) !== JSON.stringify(doc)) {
        historico.current = [...historico.current, doc].slice(-MAX_HISTORICO);
      }
      // Dois, e não um: o último do histórico é o documento ACTUAL, portanto
      // com uma só fotografia não há nada anterior para onde voltar.
      setPodeDesfazer(historico.current.length >= 2);

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
        jaGravou.current = true;
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
        if (r.juntou && !r.overwrote && !avisouJuncao.current) {
          avisouJuncao.current = true;
          const quem = r.previousBy ? `por ${r.previousBy}` : "noutro sítio";
          toast(
            `Este rascunho estava a ser alterado ${quem}. Juntei as duas versões: o que mudaste ficou teu, e o que mudaram lá já está no ecrã.`,
            "info",
          );
        }
        if (r.overwrote && !warnedOverwrite.current) {
          warnedOverwrite.current = true;
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
    flushDraft.current = save;
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
      if (porGravarRef.current) void flushDraft.current();
    };
  }, []);

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
      const avisoGrandeVaiFalar = !avisouSoLocal.current;
      setAGuardarAgora(true);
      try {
        const r = await flushDraft.current();
        if (r.estado === "guardado") {
          toast("Rascunho guardado no servidor.", "success");
        } else if (!avisoGrandeVaiFalar) {
          toast("Guardado só neste computador — não chegou ao servidor.", "error");
        }
      } finally {
        setAGuardarAgora(false);
      }
    })();
  }, [toast, soNesteComputador, aGravarNoServidor]);

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
      const r = await flushDraft.current();
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
   * ════════════════════════════════════════════════════════════════════════
   * O QUE ELA JÁ ESCREVEU NÃO É SUBSTITUÍDO PELO RASCUNHO QUE VEM A CAMINHO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O estúdio vai buscar o rascunho ao servidor ao abrir, e o merge chega
   * 100–300 ms depois. Até aqui esse merge era `{ ...d, ...doServidor }` —
   * campo a campo, o servidor ganhava. Se ela começasse a escrever nesse
   * primeiro segundo, o princípio do que escreveu era apagado.
   *
   * MEDIDO: escrever `ABCDEFGHIJKLMNOPQRST` meio segundo depois de o ecrã
   * abrir, oito rondas — SETE perderam texto. Ficaram coisas como
   * `HIJKLMNOPQRST`, `MNOPQRST`, `QRST`. Em quatro caixas diferentes, e uma
   * delas (a «Cerimónia») ficou COMPLETAMENTE vazia. Não há erro nem aviso: a
   * frase fica truncada pela frente e é assim que vai no PDF para o casal.
   *
   * Guarda-se aqui QUE CAMPOS ela tocou desde que o ecrã abriu. O merge
   * continua a trazer tudo o resto do rascunho — as fotos, as condições, as
   * traduções feitas noutro computador — e deixa em paz só aquilo em que ela
   * está com as mãos.
   *
   * Só marcam os caminhos por onde a PESSOA escreve (`patch` e o editor de
   * serviços). Os `setDoc` do sistema — semear os textos fixos, aplicar o
   * preço do pedido, o próprio merge — não marcam nada, de propósito.
   */
  const camposTocados = useRef<Set<string>>(new Set());

  const patch = (p: Partial<StudioDoc>) => {
    for (const chave of Object.keys(p)) camposTocados.current.add(chave);
    setDoc((d) => ({ ...d, ...p }));
  };

  // ── Total estruturado + IVA ──
  // O modo efetivo: explícito no doc, senão detetado a partir do texto livre
  // (retrocompatibilidade com propostas antigas só com "3.000,00 € + IVA").
  /**
   * ── E UM DOCUMENTO NOVO NASCE EM «ACRESCE» ────────────────────────────
   *
   * O `detectVatMode` devolve "incluido" quando não há texto nenhum para ler —
   * é a retrocompatibilidade com propostas antigas só com «3.000,00 €». Mas um
   * documento ACABADO DE COMEÇAR também não tem texto, e caía nessa mesma
   * porta: nascia em «IVA incluído», que é o modo que a casa deixou de usar.
   *
   * A detecção fica onde serve — havendo texto livre, é ele que manda.
   */
  const vatMode: VatMode =
    doc.totalVatMode ??
    (doc.totalText || doc.totalEstimatedText
      ? detectVatMode(doc.totalText || doc.totalEstimatedText)
      : "acrescer");

  /** Compõe o texto de DISPLAY do PDF a partir do valor + modo estruturados,
   *  no formato do estúdio ("3.000,00 € + IVA" ou "3.000,00 €"). */
  function composeTotalText(amount: number | undefined, mode: VatMode): string {
    if (amount == null || !(amount > 0)) return "";
    return mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
  }

  /** Escreve o valor + modo estruturados e sincroniza o texto de display do
   *  template ativo (totalText p/ Decoração, totalEstimatedText p/ Organização). */
  function writeTotal(amount: number | undefined, mode: VatMode) {
    const text = composeTotalText(amount, mode);
    patch(
      doc.template === "organizacao"
        ? { totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { totalAmount: amount, totalVatMode: mode, totalText: text },
    );
  }

  /**
   * O VALOR É UM SÓ, e é o "Preço final (sem IVA)" do pedido.
   *
   * ── O que estava errado ─────────────────────────────────────────────────
   * Havia duas caixas com o mesmo número: aqui e na Gestão do pedido. Pior do
   * que duplicado — podiam DISCORDAR. O estúdio só copiava o preço do pedido
   * quando ainda não havia rascunho (ver `seedDefaults`), e a partir daí
   * alterar o preço na Gestão do pedido não mexia aqui. O PDF seguia para o
   * cliente com o valor antigo, e nada no ecrã o dizia.
   *
   * Agora escrever aqui GRAVA no pedido, e uma alteração feita na Gestão do
   * pedido aparece aqui. É o mesmo número, visto de dois sítios.
   *
   * ── E o IVA ─────────────────────────────────────────────────────────────
   * O número partilhado é sempre a BASE, sem IVA — é o que o pedido diz que é.
   * O modo de IVA muda o que o PDF MOSTRA (e portanto o que o cliente paga),
   * e o `totalAmount` do documento é derivado da base: em "acrescer" é a
   * própria base, em "incluído" é a base já com o IVA somado, porque é assim
   * que `resolveProposalMoney` o lê. Em qualquer dos modos a base continua a
   * ser o número do pedido, que é o que o rótulo "(sem IVA)" promete.
   */
  function amountParaBase(base: number, mode: VatMode): number {
    return totalAmountParaBase(base, mode, money.vatRate);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CAMPO DO ESTÚDIO E O PREÇO DO PEDIDO PODEM NÃO SER O MESMO NÚMERO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Enquanto os adicionais estavam DENTRO do valor escrito, eram o mesmo: ela
   * escrevia 3.000, o pedido guardava 3.000, e a deslocação saía de lá de
   * dentro.
   *
   * Com «estas linhas somam-se», o campo passa a ser SÓ os serviços e o que o
   * casal paga é serviços mais adicionais. O «Preço final (sem IVA)» do pedido
   * tem de continuar a ser o que o casal paga sem IVA — é dele que a Visão
   * Geral, as Estatísticas e o dossier leem o dinheiro dos pedidos que ainda
   * não têm proposta enviada. Guardar lá só os serviços fazia as deslocações
   * DESAPARECEREM desses ecrãs, sem ninguém dar por isso.
   *
   * Por isso há duas conversões, e são inversas uma da outra:
   *   escrito -> pedido   soma os adicionais
   *   pedido  -> escrito  tira-os
   *
   * Quando os adicionais estão dentro do valor, as duas não fazem nada, e o
   * comportamento é exactamente o de sempre.
   */
  /**
   * A INVERSA da de cima, e vive no mesmo ficheiro que ela — ver
   * `lib/preco-do-pedido`.
   *
   * ── O DOCUMENTO É UM ARGUMENTO, E TEM DE SER ────────────────────────────
   *
   * Lia `doc` da closure, e havia três chamadores em que `doc` é precisamente
   * o documento ERRADO: repor uma versão, copiar uma proposta e anular uma
   * limpeza trocam o documento inteiro com um `setDoc` e chamam isto na linha
   * a seguir — quando `doc` ainda é o que se acabou de substituir. Os
   * adicionais somados eram os do documento ANTIGO.
   *
   * Repor a versão que seguiu para o cliente é o caso que dói: a versão traz
   * 1.490,00 € de adicionais, o rascunho no ecrã tinha 895,00 €, e o pedido
   * ficava a 595,00 € de distância do que o casal recebeu — sem nada no ecrã
   * a dizê-lo, e à espera da abertura seguinte para o mostrar.
   */
  function baseDoEcraParaOPedido(base: number, deQue: StudioDoc = doc): number {
    return precoDoPedidoParaBase(base, deQue as unknown as ContextoDoPreco);
  }

  /** O que se grava no pedido, com a mão travada: escrever "3000" são quatro
   *  teclas e não podem ser quatro gravações. */
  const gravarPreco = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O último valor que ESTE ecrã mandou gravar — para a resposta que volta do
   *  servidor não disparar outra vez a sincronização e entrar em ciclo. */
  const precoEnviado = useRef<number | undefined>(quote.quotedPrice);
  /**
   * ── E O QUE CHEGOU NO `quote`, QUE É COISA DIFERENTE ────────────────────
   *
   * O `precoEnviado` diz o que daqui SAIU; este diz o que de lá VEIO. Eram o
   * mesmo ref, e a sincronização de baixo usava-o como detector de mudança do
   * `quote.quotedPrice` — o que quer dizer que quem lhe MEXESSE fabricava uma
   * mudança que nunca houve.
   *
   * E passou a haver quem lhe mexesse: o ramo do «o pedido ainda não tem
   * preço» adopta o valor do rascunho e chama `persistirPreco`, que marca
   * 3.250 como enviado. O PATCH só volta 600 ms depois, portanto a
   * sincronização corre na montagem com `quotedPrice` ainda por preencher, lê
   * `undefined ≠ 3.250`, conclui que o preço foi APAGADO na Gestão do pedido —
   * e limpava o total do ecrã. Medido: o campo ficava em branco até a resposta
   * chegar, e se a rede estivesse em baixo ficava em branco e era assim que o
   * rascunho gravava. O valor dela desaparecia por não haver rede.
   *
   * Com os dois separados, a pergunta que a sincronização faz volta a ser a
   * certa: «o número que veio é diferente do último que veio?». Na montagem
   * não é — a hidratação já aplicou o que havia a aplicar.
   */
  const doPedidoVisto = useRef<number | undefined>(quote.quotedPrice);

  function persistirPreco(
    escrito: number | undefined,
    opcoes?: {
      /** O número já é o que o casal paga: não se lhe somam adicionais nenhuns. */
      jaEfectivo?: boolean;
      /** Contra que documento se faz a conversão. Ver `baseDoEcraParaOPedido`:
       *  quem acabou de trocar o documento tem de o dizer, senão a soma é feita
       *  com os adicionais do que já lá não está. */
      doc?: StudioDoc;
    },
  ) {
    const base =
      escrito == null || opcoes?.jaEfectivo
        ? escrito
        : baseDoEcraParaOPedido(escrito, opcoes?.doc ?? doc);
    precoEnviado.current = base;
    if (gravarPreco.current) clearTimeout(gravarPreco.current);
    gravarPreco.current = setTimeout(() => {
      void tentarGravarOPreco(base ?? null);
    }, 600);
  }

  /**
   * A ida ao servidor, separada do travão das teclas — porque o botão «Tentar
   * de novo» precisa de a chamar sem esperar 600 ms por nada.
   */
  async function tentarGravarOPreco(base: number | null) {
    setPrecoAGravar(true);
    try {
      const r = await mandarPrecoAoPedido(quote.id, base);
      if (r.estado === "gravado") {
        setPrecoPorChegar(null);
        // `quote` pode faltar num 200 de corpo ilegível — ver `ResultadoDoPreco`.
        if (r.quote) onQuoteUpdated?.(r.quote);
        return;
      }
      /**
       * ── E AQUI DEIXA DE SE CALAR ──────────────────────────────────────
       *
       * O comentário antigo dizia que avisar a cada tecla seria pior do que o
       * problema — e tinha razão. Só que a alternativa que escolheu foi não
       * avisar de todo, e o preço ficava a divergir em silêncio.
       *
       * O aviso não é por tecla: é UM estado, que fica enquanto o pedido tiver
       * um valor diferente do da proposta, e desaparece sozinho assim que uma
       * gravação passe. Enquanto ele estiver de pé, o ecrã mostra os dois
       * números e um botão — que é o que ela precisa de ver para decidir.
       */
      setPrecoPorChegar({
        base,
        porque: r.porque,
        valeTentarDeNovo: r.valeTentarDeNovo,
      });
    } finally {
      setPrecoAGravar(false);
    }
  }

  function onTotalInput(raw: string) {
    // O total não vive no `doc` (é um texto à parte), mas a regra é a mesma:
    // ver `camposTocados`. Sem esta marca, o merge do rascunho reescrevia a
    // caixa do total a meio de ela estar a escrever o valor.
    camposTocados.current.add("__total");
    setTotalInput(raw);
    /**
     * ── O QUE NÃO É UM VALOR DIZ-SE, E NÃO SE GRAVA ─────────────────────────
     *
     * Achado n.º 5: «-500» via-se -500 e contava +500 (o `parseMoneyText` lê
     * os algarismos e deixa o sinal de fora) — e era +500 que ia para o pedido.
     * Achado n.º 16: «0» voltava sozinho ao valor anterior, sem uma palavra.
     * Nos dois casos o campo fica com o que ela escreveu, diz porquê, e nada
     * se grava até haver um valor a sério.
     */
    const negativo = /-\s*[\d.,]/.test(raw);
    const lido = raw.trim() === "" ? undefined : parseMoneyText(raw);
    if (negativo) {
      setErroDoTotal(
        "O valor não pode ser negativo. Um desconto escreve-se como linha do orçamento.",
      );
      return;
    }
    if (lido === 0) {
      setErroDoTotal("Com 0 € não há proposta a enviar — escreve o valor dos serviços.");
      return;
    }
    setErroDoTotal(null);
    const base = lido;
    writeTotal(base == null ? undefined : amountParaBase(base, vatMode), vatMode);
    persistirPreco(base);
  }

  /**
   * O dinheiro EFECTIVO deste documento: já com a regra dos valores adicionais
   * aplicada (dentro do valor escrito, ou a somar-lhe). É o que o casal vai
   * ver e pagar, portanto é o que o estúdio mostra e o que trava o envio.
   *
   * O `escrito` é o outro número, e existe para uma coisa só: o campo «Valor
   * (sem IVA)» e o que se diz ao alinhá-lo com a soma das linhas. Aí o que
   * interessa é o que ELA escreveu, não o total com os adicionais somados.
   */
  const money = dinheiroDaProposta(doc);
  const escrito = resolveProposalMoney(doc);
  // A percentagem do sinal é do DOCUMENTO, e é a mesma que as rotas de
  // facturação leem quando emitem o sinal e o saldo (ver `depositPercentOf`).
  // Sem isso, a proposta dizia 40% e a factura saía a 30% — que é pior do que
  // não a poder mudar de todo.
  const pctSinal = depositPercentOf(doc as ProposalDoc);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS NÚMEROS DO ECRÃ SÃO OS NÚMEROS DO PAPEL — A MESMA FUNÇÃO, UMA VEZ SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «um bloco de totais inequívoco». O ecrã mostrava TRÊS somas
   * ao mesmo tempo — «Soma das linhas: 2.400,00 €», «Somado ao total: 970,00 €»
   * e, na barra do fundo, «Total 2.460,00 € · o cliente paga 3.025,80 € · soma
   * das linhas 2.400,00 €» — e nenhuma delas era o quadro que o casal recebe.
   * Três números a competir pela mesma pergunta ensinam a não confiar em
   * nenhum.
   *
   * Agora há um bloco só, pela ordem do PDF, e sai de `totaisDaProposta` — a
   * MESMA chamada que `proposal-doc-pdf.ts` faz para desenhar o quadro
   * (`totaisDaProposta(doc, depositPercentOf(doc))`). Enquanto o ecrã fizesse
   * as suas contas e o gerador as dele, o dia em que divergissem chegava — foi
   * exactamente assim que a proposta da Tara e do Marty saiu com o sinal e o
   * saldo a somarem 3.025,80 € e o «Valor Total» a dizer 2.950,79 €.
   */
  const totais = totaisDaProposta(doc, pctSinal);
  // O sinal e o saldo saem daí também, e não de uma segunda chamada a
  // `splitSinal`: eram a mesma divisão feita em dois sítios, e duas
  // implementações da mesma divisão podem arredondar para lados diferentes.
  const split = { sinal: totais.sinal, saldo: totais.saldo };
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
  // O desvio do total escrito à mão. Vive aqui em cima porque é lido em dois
  // sítios: na dica do campo e no aviso com o botão que o arruma.
  const desvio = desalinhamento(doc, money.base);
  /**
   * Quantas linhas do orçamento já têm preço.
   *
   * Sai de `precosDe` e não de contar campos no ecrã: os preços são um array
   * paralelo às linhas, e é a biblioteca que garante que os dois têm o mesmo
   * comprimento.
   */
  const precos = precosDe(doc);
  const contagem = contagemDePrecos(precos);
  /** Quantas pessoas, lido do campo do documento ("125 pax" → 125). */
  const convidados = convidadosDoDoc(doc as ProposalDoc);
  const escalasDoDoc = escalasDe(doc as ProposalDoc);
  const extrasDoDoc = opcionaisDe(doc as ProposalDoc);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A ORDEM QUE VAI SAIR IMPRESSA, MOSTRADA AQUI
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, duas vezes: na lista de Serviços é Cerimónia →
   * Complementos → Cocktail → Jantar, no Orçamento é Cerimónia → Cocktail →
   * Jantar → Complementos. As mesmas rubricas, duas ordens.
   *
   * A regra que as alinha já existia — mas dentro de `proposal-doc-pdf.ts`,
   * que é `server-only`. O PDF saía certo e o ECRÃ continuava a mostrar a
   * ordem de escrita, portanto o que ela via era a divergência, sempre. A
   * regra mudou-se para `proposal-ordem.ts` e é agora a MESMA chamada dos
   * dois lados: estas duas linhas e as duas do gerador.
   *
   * As listas por baixo percorrem estes índices e não `map((_, i) =>`. O
   * índice que sai daqui é o VERDADEIRO — o do array — e é esse que os
   * botões recebem: o que muda é a ordem por que se desenham, não onde se
   * escreve.
   */
  const linhasDoOrcamento = linhasDe(doc);
  const ordemDoOrcamento = ordemDeSaida(doc as ProposalDoc, linhasDoOrcamento, (l) => l.item ?? "");
  const ordemDosBoards = ordemDeSaida(doc as ProposalDoc, doc.moodBoards, (b) => b.title ?? "");
  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUANTO PESA ESTA PROPOSTA, SEMPRE À VISTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «Contagem de fotos por board e total da proposta, sempre
   * visível. Número estimado de páginas do PDF.»
   *
   * As páginas de inspiração são exactamente uma por board COM fotos — um board
   * vazio não imprime nada (o gerador salta-o, para nunca mostrar uma folha em
   * branco a um cliente).
   *
   * O total do PDF sai do PLANO do desenho novo (`pdf-editorial/plano.ts`):
   * a mesma sequência que o gerador desenha, presa a ele por um teste. Só o
   * texto que transborda (o orçamento e as condições) é estimado, e é por isso
   * que se diz «cerca de».
   */
  const fotosPorBoard = doc.moodBoards.map((b) => b.images.length);
  const totalDeFotos = fotosPorBoard.reduce((a, b) => a + b, 0);
  const planoDoPdf = useMemo(() => planoDaProposta(doc as ProposalDoc), [doc]);
  /** Que fotografia o PDF põe em cada página — perguntado ao PDF (`useFotosDoPdf`). */
  const fotosDoPdf = useFotosDoPdf(quote.id, doc as ProposalDoc, idiomaDoPdf);
  /** De onde vêm as fotografias das miniaturas do PDF novo (`PaginaEditorial`). */
  const fontesDasMiniaturas = useMemo(
    () => fontesDasFolhas(doc as ProposalDoc, planoDoPdf, assetUrls, assetOriginais, fotosDoPdf),
    [doc, planoDoPdf, assetUrls, assetOriginais, fotosDoPdf],
  );
  /**
   * ── A FOTOGRAFIA DE UMA PÁGINA DO PDF, ESCOLHIDA POR ELA ──────────────────
   *
   * Pedido dela (15/10): «queremos ser nós a meter as fotos… em qualquer sítio
   * do PDF». A folha abre da miniatura da página (a vista de conjunto). Cada
   * toque aplica-se logo, com «Anular»; o que fica gravado é
   * `fotosDasPaginas[chave]`. A capa continua a ser a «Fotografia da capa».
   */
  const anular = useAnular();
  const [paginaDaFoto, setPaginaDaFoto] = useState<{
    chave: string;
    nome: string;
    max: number;
  } | null>(null);
  const [lugarDaFoto, setLugarDaFoto] = useState(0);
  /** O que está AGORA em cada lugar de uma página: a escolha dela, ou a do PDF. */
  const lugaresDaPagina = (chave: string): (string | null)[] =>
    chave === "capa"
      ? [caminhoDaCapa ?? fotosDoPdf?.capa?.[0]?.ref ?? null]
      : (doc.fotosDasPaginas?.[chave]?.fotos ?? (fotosDoPdf?.[chave] ?? []).map((f) => f.ref));
  /** Grava a escolha de uma página (ou apaga-a, com `null`), com «Anular». */
  function gravarFotosDaPagina(chave: string, fotos: string[] | null, frase: string) {
    const antes = doc.fotosDasPaginas;
    const seguintes = { ...(antes ?? {}) };
    if (fotos && fotos.length) seguintes[chave] = { fotos };
    else delete seguintes[chave];
    patch({ fotosDasPaginas: seguintes });
    anular(frase, () => patch({ fotosDasPaginas: antes }));
  }
  /**
   * A disposição das fotografias de um tema (ou a automática, com `null`), com
   * «Anular». Ela pediu-a de volta a 15/10 — ver `EscolherDisposicao`.
   */
  function mudarDisposicao(bi: number, d: Disposicao | null) {
    const antes = doc.moodBoards[bi]?.disposicao;
    updateBoard(bi, { disposicao: d ?? undefined });
    anular(d ? `Disposição: ${NOME_DA_DISPOSICAO[d]}.` : "Disposição automática.", () =>
      updateBoard(bi, { disposicao: antes }),
    );
  }
  /** A mesma disposição em todos os temas que não estão fechados, com «Anular». */
  function disposicaoEmTodos(d: Disposicao) {
    const antes = doc.moodBoards.map((b) => b.disposicao);
    setDoc((x) => ({
      ...x,
      moodBoards: x.moodBoards.map((b) => (b.bloqueado ? b : { ...b, disposicao: d })),
    }));
    anular(`«${NOME_DA_DISPOSICAO[d]}» em todos os temas.`, () =>
      setDoc((x) => ({
        ...x,
        moodBoards: x.moodBoards.map((b, i) => ({ ...b, disposicao: antes[i] })),
      })),
    );
  }
  /** Põe `ref` no lugar `lugar` da página — os outros lugares ficam como estão. */
  function porFotoNaPagina(chave: string, nome: string, max: number, lugar: number, ref: string) {
    if (chave === "capa") {
      setCoverAt(idxDaCapa, ref);
      return;
    }
    const agora = lugaresDaPagina(chave).slice(0, max);
    const fotos = [...agora];
    fotos[Math.min(lugar, max - 1)] = ref;
    gravarFotosDaPagina(
      chave,
      fotos.filter((f): f is string => !!f),
      `Fotografia de «${nome}» trocada.`,
    );
  }
  /** Uma ou duas no separador. */
  function quantasNaPagina(chave: string, nome: string, n: 1 | 2) {
    const agora = lugaresDaPagina(chave).filter((f): f is string => !!f);
    let fotos = agora.slice(0, n);
    if (n === 2 && fotos.length < 2) {
      // A segunda: a que o PDF lá tinha, ou a primeira de outra que haja.
      const outra = [
        ...(fotosDoPdf?.[chave] ?? []).map((f) => f.ref),
        ...doc.moodBoards.flatMap((b) => b.images),
      ].find((r): r is string => !!r && !fotos.includes(r) && !isPendingImage(r));
      if (outra) fotos = [...fotos, outra];
    }
    gravarFotosDaPagina(
      chave,
      fotos,
      n === 1 ? `«${nome}» com uma fotografia.` : `«${nome}» com duas fotografias.`,
    );
    setLugarDaFoto(0);
  }
  /** As fotografias desta proposta, para escolher (capa e temas, sem repetir). */
  const fotosDaProposta = useMemo(() => {
    const vistas = new Set<string>();
    const lista: { ref: string; url?: string; original?: string }[] = [];
    for (const r of [
      ...(doc.coverImages ?? []),
      ...doc.moodBoards.flatMap((b) => b.images),
      ...Object.values(doc.fotosDasPaginas ?? {}).flatMap((e) => e.fotos),
    ]) {
      if (!r || vistas.has(r) || isPendingImage(r)) continue;
      vistas.add(r);
      lista.push({
        ref: r,
        url: assetUrls[r] ?? (r.startsWith("data:") ? r : undefined),
        original: assetOriginais[r],
      });
    }
    return lista;
  }, [doc.coverImages, doc.moodBoards, doc.fotosDasPaginas, assetUrls, assetOriginais]);
  const paginasDeInspiracao = planoDoPdf.filter((p) => p.tipo === "tema").length;
  const tempoDaProposta = tempoMostrado > 0 ? ` · ${emPalavras(tempoMostrado)} de trabalho` : "";
  const contagemDosBoards =
    `${paginasDeInspiracao} ${paginasDeInspiracao === 1 ? "página" : "páginas"} · ` +
    `${totalDeFotos} ${totalDeFotos === 1 ? "foto" : "fotos"} · ` +
    // O número sai da MESMA lista que a vista de conjunto desenha. Eram duas
    // contas sobre o mesmo documento — «7 páginas» na vista e «cerca de 14» na
    // frase — e discordavam porque contavam coisas diferentes.
    `PDF com cerca de ${planoDoPdf.length}${tempoDaProposta}`;

  /**
   * ── OS TÍTULOS QUE SE LÊEM COMO O MESMO NOME ────────────────────────────
   *
   * Um por board, e `undefined` na esmagadora maioria. Calculado uma vez para
   * a lista toda e não board a board: a pergunta é sobre PARES, e fazê-la
   * dentro do cartão dava um varrimento de todos os títulos por cada cartão
   * desenhado — oito páginas, sessenta e quatro comparações, a cada tecla
   * escrita num título.
   */
  const avisosDeTitulo = useMemo(() => {
    const por: Record<number, string> = {};
    for (const grupo of titulosParecidos(doc as ProposalDoc)) {
      for (const bi of grupo.bis) {
        const aviso = avisoDeTituloParecido(doc as ProposalDoc, bi);
        if (aviso) por[bi] = aviso;
      }
    }
    return por;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.moodBoards, doc.serviceGroups, doc.ordemExplicita]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ONDE É QUE ESTA FOTOGRAFIA JÁ ESTEVE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Duas perguntas diferentes, e só uma delas é um aviso:
   *
   *  · JÁ ESTÁ NOUTRO BOARD desta proposta — quase sempre um engano, e é o
   *    único caso em que o casal vê a mesma fotografia duas vezes no mesmo
   *    documento;
   *  · JÁ FOI a outra proposta, e, dentro dessas, as que foram para um
   *    casamento NO MESMO ESPAÇO. É a repetição que alguém nota: a equipa da
   *    quinta, o fotógrafo da casa, os convidados que vão aos dois.
   *
   * As outras repetições — outro casal, outro sítio, outro mês — não são aviso
   * nenhum: a biblioteca existe para ser usada.
   */
  const ondeEstaCadaFoto = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const b of doc.moodBoards)
      for (const p of b.images) {
        if (p) contagem.set(p, (contagem.get(p) ?? 0) + 1);
      }
    return contagem;
  }, [doc.moodBoards]);

  const repetidasPorOrigem = useMemo(
    () => new Map(repetidas.map((f) => [f.origem, f])),
    [repetidas],
  );

  /**
   * ── A ÚNICA REPETIÇÃO QUE SE DESENHA NA GRELHA ──────────────────────────
   *
   * A mesma fotografia em duas páginas do MESMO documento. É quase sempre um
   * engano, é o único caso em que o casal vê a mesma fotografia duas vezes na
   * proposta que recebe, e é a única das três perguntas que se resolve sem
   * sair desta página — está ali, na grelha ao lado.
   *
   * Marcada NAS DUAS: a contagem é sobre o documento inteiro, portanto as duas
   * células acendem. Assinalar só a segunda obrigava a procurar a primeira.
   *
   * ── E PORQUE É QUE AS OUTRAS DUAS NÃO ACENDEM AQUI ──────────────────────
   * «Já usada noutro casamento» e «já usada no mesmo espaço» são verdadeiras e
   * úteis, mas esta página já pode acender sete avisos ao mesmo tempo (página
   * cheia, fotos fora do PDF, fila desequilibrada, fotos cortadas, foto que
   * destoa da paleta…). Cada aviso novo torna os outros menos lidos. As duas
   * vivem onde a decisão se toma — no selector da biblioteca, que já as mostra
   * — e aqui contam-se ao rato, em `passadoDaFoto`, sem acender nada.
   */
  function repeticaoNestaProposta(caminho: string): { texto: string; grave: boolean } | null {
    const vezesAqui = ondeEstaCadaFoto.get(caminho) ?? 0;
    if (vezesAqui <= 1) return null;
    // CURTO porque a tira é `truncate` e a célula, a 390 px numa grelha de três
    // colunas, tem ~110 px de largura: «Esta fotografia está 2 vezes nesta
    // proposta.» a 8 px sai «Esta fotografia es…», que é uma frase que não diz
    // nada. A frase inteira fica no texto do rato, onde há espaço.
    return { texto: `${vezesAqui}× nesta proposta`, grave: true };
  }

  /**
   * O que se conta ao passar o rato: de que foto da biblioteca veio esta, e para
   * onde ela já foi. Não acende nada no ecrã — é a resposta à pergunta «esta
   * foto já não a usei?», dada a quem a faz.
   */
  function passadoDaFoto(caminho: string): string | undefined {
    const origem = themeOrigins[caminho];
    const f = origem ? repetidasPorOrigem.get(origem) : undefined;
    if (!f) return origem;
    const mesmoEspaco = noMesmoEspaco(f, quote.location || undefined);
    // A repetição DENTRO desta proposta não vem aqui: a `CelulaDeFoto` já lhe
    // cola o texto da tira ao fim do título. Repeti-la era dizer duas vezes a
    // mesma coisa no mesmo balão.
    return [
      origem,
      mesmoEspaco.length > 0
        ? `Já foi para ${mesmoEspaco[0].cliente}, no mesmo espaço.`
        : `Já usada — ${comoSeDiz(f)}.`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  /** Alguma das duas listas sai por ordem diferente da que está escrita? */
  const ordemSugerida = !eAOrdemEscrita(ordemDoOrcamento) || !eAOrdemEscrita(ordemDosBoards);

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * Escreve os arrays já ordenados e acende `ordemExplicita` — a partir daí a
   * sugestão cala-se e a ordem escrita vale sozinha, aqui e no PDF. É o que
   * torna o arrasto possível: enquanto a sugestão mandasse, arrastar um board
   * era pô-lo num sítio e vê-lo voltar na página seguinte.
   *
   * Os preços, os custos, as escalas e as marcas de extra são arrays PARALELOS
   * às linhas — viajam todos com a mesma permutação ou o orçamento trocava os
   * preços de sítio, que é um erro que só se vê quando o cliente pergunta.
   *
   * ── PORQUE É QUE A LISTA NÃO SE ESCREVE AQUI À MÃO ────────────────────────
   * Escrevia-se, e faltava-lhe um: o `budgetOpcional`. A marca de «extra»
   * ficava para trás na permutação, portanto «Arrumar eu» deixava-a na rubrica
   * errada — o PDF imprimia «extra» ao lado da linha que não era, e a versão
   * sem extras ficava cem euros ao lado da verdade. Uma segunda lista dos
   * arrays paralelos é uma lista que se esquece do array seguinte.
   *
   * A lista verdadeira é a de `proposal-budget` (o `PARALELOS` que o
   * `adicionarLinha`/`removerLinha` usam). Não é exportada, mas o TIPO dela é
   * alcançável pela assinatura do `adicionarLinha` — e com o `satisfies` lá em
   * baixo a exigir que estejam cá todas, esquecer uma passa a ser erro de
   * compilação em vez de um extra na linha errada.
   */
  type ArrayParaleloDaLinha = Omit<Parameters<typeof adicionarLinha>[0], "budgetItems">;

  function arrumadoEExplicito(d: StudioDoc): StudioDoc {
    const linhas = linhasDe(d);
    const ordemL = ordemDeSaida(d as ProposalDoc, linhas, (l) => l.item ?? "");
    const ordemB = ordemDeSaida(d as ProposalDoc, d.moodBoards, (b) => b.title ?? "");
    const paralelo = <T,>(arr: T[] | undefined) =>
      arr === undefined ? undefined : aplicarOrdem(arr, ordemL);
    // `satisfies` e não uma anotação de tipo: exige que estejam cá TODAS as
    // chaves paralelas, sem trocar o tipo exacto de cada array por um tipo
    // comum — que era o que faria o spread lá em baixo deixar de casar.
    const paralelos = {
      budgetAmounts: paralelo(d.budgetAmounts),
      budgetCosts: paralelo(d.budgetCosts),
      budgetScales: paralelo(d.budgetScales),
      budgetOpcional: paralelo(d.budgetOpcional),
      // A rubrica em inglês vai com a rubrica. Sem esta linha, «Alinhar pelos
      // Serviços» punha a tradução da Cerimónia na linha do Cocktail — e o PDF
      // inglês saía com a rubrica errada, sem nada a assinalá-lo. Foi o
      // `satisfies` daqui de baixo que obrigou a escrevê-la.
      budgetItemsEn: paralelo(d.budgetItemsEn),
    } satisfies Record<keyof ArrayParaleloDaLinha, unknown>;
    return {
      ...d,
      ordemExplicita: ORDEM_EXPLICITA,
      budgetItems: aplicarOrdem(d.budgetItems ?? [], ordemL),
      ...paralelos,
      moodBoards: aplicarOrdem(d.moodBoards, ordemB),
    };
  }

  /**
   * Fixa no documento a ordem que está a ser mostrada.
   *
   * AS DUAS LISTAS DE UMA VEZ, sempre. Acender `ordemExplicita` a arrumar só
   * os mood boards congelava o orçamento na ordem por arrumar — ressuscitava
   * a divergência que isto veio fechar, e desta vez sem sugestão nenhuma a
   * corrigi-la.
   */
  function fixarOrdem() {
    setDoc(arrumadoEExplicito);
    // ── O QUE ARRUMOU, E NÃO «PRONTO» ──────────────────────────────────────
    // As duas listas JÁ estão à vista pela ordem de saída (é o que a sugestão
    // faz), portanto o clique não mexe um pixel no ecrã: o que se vê é o aviso
    // desaparecer. «Ordem fixada.» deixava por responder a única pergunta que
    // se faz a seguir — o que é que isto foi arrumar?
    //
    // A conta é das que MUDARAM DE LUGAR, e não das que existem: numa lista de
    // catorze linhas com duas trocadas, «14 linhas arrumadas» seria uma
    // mentira pequena a estragar a confiança no resto dos avisos.
    //
    // As duas listas contam-se em separado porque o gesto arruma SEMPRE as
    // duas (ver `arrumadoEExplicito`) e o botão vive só numa delas — quem
    // carrega no aviso do orçamento tem de saber que os mood boards também
    // andaram.
    const linhas = ordemDoOrcamento.filter((idx, i) => idx !== i).length;
    const paginas = ordemDosBoards.filter((idx, i) => idx !== i).length;
    const partes = [
      linhas > 0 ? `${linhas} ${linhas === 1 ? "linha do orçamento" : "linhas do orçamento"}` : "",
      paginas > 0
        ? `${paginas} ${paginas === 1 ? "página de inspiração" : "páginas de inspiração"}`
        : "",
    ].filter(Boolean);
    const mudaram = linhas + paginas;
    toast(
      partes.length === 0
        ? "Já estava tudo pela ordem dos Serviços. Daqui para a frente manda a ordem que aqui está."
        : `${partes.join(" e ")} ${mudaram === 1 ? "mudou" : "mudaram"} de sítio. Daqui para a frente manda a ordem que aqui está.`,
      "info",
    );
  }

  /**
   * Trocar o tipo de escala de uma linha.
   *
   * Ao passar a escalonável, o unitário nasce do preço que já lá estava
   * dividido pelas unidades — para o total não dar um salto no instante em que
   * ela escolhe a opção. Ao voltar a fixa, o preço fica onde está: era o
   * resultado da última multiplicação, e é um número que ela reconhece.
   */
  function definirEscala(i: number, tipo: TipoDeEscala) {
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const porMesa = d.convidadosPorMesa ?? CONVIDADOS_POR_MESA_OMISSAO;
      const proximas = escalas.map((e, j) => {
        if (j !== i) return e;
        if (tipo === "fixa") return null;
        const unidades =
          tipo === "por-mesa"
            ? Math.max(1, Math.ceil(convidados / porMesa))
            : Math.max(1, convidados);
        const precoActual = (d.budgetAmounts ?? [])[i];
        const base =
          typeof precoActual === "number" && precoActual > 0 ? precoActual / unidades : 0;
        return { tipo, unitario: Math.round(base * 100) / 100 };
      });
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }

  function definirUnitario(i: number, texto: string) {
    const n = normalizarValor(texto);
    setDoc((d) => {
      const escalas = escalasDe(d as ProposalDoc);
      const proximas = escalas.map((e, j) => (j === i && e ? { ...e, unitario: n ?? 0 } : e));
      return recalcular({ ...d, budgetScales: proximas }, convidados);
    });
  }
  const duasFormas = asDuasFormas(money.base, doc.vatRate ?? DEFAULT_VAT_RATE);

  // ── O preço mudou na Gestão do pedido: aparece aqui ─────────────────────
  // O outro sentido do mesmo número. Sem isto voltava a haver duas verdades:
  // alterar o "Preço final" no pedido não mexia no estúdio, e o PDF saía com o
  // valor antigo.
  //
  // `precoEnviado` evita o ciclo: quando a mudança veio DAQUI, o valor que
  // volta é o que acabámos de mandar e não há nada a fazer.
  useEffect(() => {
    const doPedido = quote.quotedPrice;
    // Primeiro a pergunta certa: MUDOU o que vem de fora? A montagem também
    // corre este efeito, e na montagem não mudou nada. Ver `doPedidoVisto`.
    const mudou = doPedido !== doPedidoVisto.current;
    doPedidoVisto.current = doPedido;
    if (!hydrated.current) return;
    if (!mudou) return;
    if (doPedido === precoEnviado.current) return;
    precoEnviado.current = doPedido;
    setDoc((d) => {
      const mode: VatMode = d.totalVatMode ?? detectVatMode(d.totalText || d.totalEstimatedText);
      // O pedido guarda o que o casal paga sem IVA; o campo do estúdio mostra
      // só a parte dos serviços quando os adicionais somam. Ver o par de
      // conversões acima.
      const paraOEcra =
        typeof doPedido === "number" && doPedido > 0 ? baseDoPedidoParaOEcra(doPedido, d) : null;
      // Pela mesma razão da abertura: quando a conta não dá, não se apaga o que
      // lá está. Antes, o campo esvaziava-se e o total do documento ia com ele.
      if (paraOEcra == null && typeof doPedido === "number" && doPedido > 0) return d;
      setTotalInput(paraOEcra != null ? textoDoTotal(paraOEcra) : "");
      const amount =
        paraOEcra != null
          ? totalAmountParaBase(paraOEcra, mode, d.vatRate ?? DEFAULT_VAT_RATE)
          : undefined;
      const text = amount == null ? "" : mode === "acrescer" ? `${eur(amount)} + IVA` : eur(amount);
      return d.template === "organizacao"
        ? { ...d, totalAmount: amount, totalVatMode: mode, totalEstimatedText: text }
        : { ...d, totalAmount: amount, totalVatMode: mode, totalText: text };
    });
  }, [quote.quotedPrice]);

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

  /**
   * Volta ao documento anterior. Chamada pelo `Cmd/Ctrl+Z` e pelo botão
   * "Desfazer" — o teclado é um atalho, não o caminho.
   *
   * O último elemento do histórico É o documento actual (foi lá posto pela
   * gravação); por isso desfazer tira DOIS e usa o penúltimo.
   */
  function desfazer(): boolean {
    if (historico.current.length < 2) return false;
    const anterior = historico.current[historico.current.length - 2];
    historico.current = historico.current.slice(0, -1);
    setPodeDesfazer(historico.current.length >= 2);
    setDoc(anterior);
    // O campo do total é estado à parte (aceita texto a meio de ser escrito),
    // por isso tem de acompanhar — senão desfazer devolvia o documento antigo
    // e deixava o valor novo na caixa.
    const base = baseDoDoc(anterior);
    setTotalInput(base === undefined ? "" : textoDoTotal(base));
    return true;
  }

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      /**
       * ⌘/Ctrl+S — o MESMO gesto do botão «Guardar agora».
       *
       * É o atalho que toda a gente já tem nos dedos de outros programas, e o
       * que o browser faz com ele por omissão («guardar a página») não serve
       * aqui a ninguém — daí o `preventDefault`. Ao contrário do ⌘Z, vale
       * TAMBÉM com o cursor dentro de uma caixa de texto: é precisamente a
       * meio de escrever um parágrafo que apetece guardar, e não há um
       * «guardar» do browser dentro de um campo para lhe ficar no caminho.
       *
       * DENTRO DO BACK OFFICE ESTE ATALHO NÃO É DAQUI. Passou a ser o gesto
       * único, tratado pelo registo, que grava o estúdio E tudo o resto que
       * tenha coisa por gravar — e responde por todos de uma vez. Dois
       * tratadores para a mesma tecla dariam duas gravações e duas respostas
       * diferentes ao mesmo gesto, que é como se ensina uma pessoa a
       * desconfiar das duas.
       *
       * Fica aqui como recurso para quando o estúdio é montado FORA do registo
       * (o dossier do evento, um teste): um atalho que desaparecesse em
       * silêncio nesses sítios seria trocar uma duplicação por uma perda.
       */
      if (!oRegistoFalaPorMim && e.key.toLowerCase() === "s" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        guardarAgora();
        return;
      }
      if (e.key.toLowerCase() !== "z" || e.shiftKey) return;
      // Dentro de uma caixa de texto, o Cmd+Z do browser desfaz a escrita —
      // que é o que ela espera. Só se assume o comando fora dos campos, ou
      // quando o browser já não tem nada para desfazer nesse campo.
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      if (aEscrever) return;
      if (desfazer()) {
        e.preventDefault();
        toast("Desfeito.", "info");
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  /**
   * Depois de o estúdio assentar, vai buscando as miniaturas da biblioteca em
   * segundo plano. É neste ecrã que o seletor de temas se abre — uma vez por
   * mood board —, e é aqui que faz sentido pagar esse trabalho adiantado.
   *
   * Os travões (dados poupados, ligação lenta) estão no próprio
   * `aquecerFotosEmSegundoPlano`, não aqui: quem decide se vale a pena gastar
   * bytes é quem sabe como está a rede, não quem sabe que ecrã é este.
   */
  useEffect(() => {
    aquecerFotosEmSegundoPlano();
  }, []);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A PRÉ-VISUALIZAÇÃO DA PÁGINA SÓ SE MONTA ONDE ELA SE VÊ
   * ════════════════════════════════════════════════════════════════════════
   *
   * A miniatura de cada mood board era desenhada SEMPRE e escondida por CSS
   * (`2xl:hidden`). É exactamente o que o `PainelDoEstudio.tsx:52-57` deixou de
   * fazer, e a razão está lá escrita: numa proposta no tecto do gerador,
   * desenhar as páginas num ecrã onde elas nem se veem foi o suficiente para o
   * estúdio deixar de responder em cinco segundos. Aqui são SETE cópias — uma
   * por mood board —, cada uma com as URLs de todas as fotografias. Num 4G, de
   * pé numa quinta, isso é trabalho e são bytes que não dão nada em troca.
   *
   * E o número estava errado: o comentário justificava-se com «a partir de
   * `2xl` o painel da direita mostra a mesma página», mas o painel passou a
   * `CORTES.largo` (1440). Entre 1440 e 1535 apareciam AS DUAS.
   *
   * Como no painel, no servidor responde `false` — o HTML sai pelo caminho
   * estreito (com a miniatura) e ela desaparece na hidratação. É o lado seguro
   * dos dois: quem tem ecrã largo perde uma miniatura que já tinha ao lado,
   * quem não tem nunca fica sem ela.
   */
  /**
   * A fila das três colunas, para ela poder perguntar quanto mede a SI PRÓPRIA
   * em vez de perguntar à janela. É a correcção de fundo — ver
   * `LARGURA_MINIMA_DA_FILA`, e o `PainelDoEstudio`, que deixou de decidir.
   *
   * UM nome só para a resposta, e é este: o comentário aqui em cima conta o que
   * custou haver dois sítios a responder à mesma pergunta com números
   * diferentes. Continua a ser um número só; mudou a pergunta.
   *
   * Zero é a resposta do servidor e do primeiro fotograma, e quer dizer «ainda
   * não sei» — aí o painel NÃO se monta. O caminho estreito nunca pode depender
   * de haver espaço, que é a mesma regra do `useMedida`.
   */
  const filaDasColunas = useRef<HTMLDivElement | null>(null);
  const painelLateralCabe = useLarguraDaZona(filaDasColunas) >= LARGURA_MINIMA_DA_FILA;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A FOLGA POR BAIXO DO FORMULÁRIO É A ALTURA MEDIDA DA BARRA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ver o comentário ao lado do `paddingBottom`, na marcação. O que aqui se
   * mede são duas coisas somadas: a altura da barra e a distância a que ela
   * está do fundo do ecrã (o `bottom-[calc(56px+…)]` que a levanta por cima da
   * navegação do telemóvel). Sem a segunda, a folga era curta exactamente nos
   * ecrãs onde a barra está mais alta.
   *
   * Começa em 80 px — o número que aqui estava escrito à mão — para o primeiro
   * desenho não ficar sem folga nenhuma antes de a medição correr.
   */
  const barraDeBaixo = useRef<HTMLDivElement | null>(null);
  /**
   * ── A BARRA COMPACTA DO TELEMÓVEL ─────────────────────────────────────────
   *
   * Palavras dela (14/10), com a captura do «Rever e enviar» num iPhone: «esta
   * aba de enviar ao cliente no telemóvel tapa tudo… transforma isto em algo
   * inteligente que se adapte». A barra levava o voltar, a língua, o
   * descarregar, o «Vai para», a lista do que falta e o enviar — meio ecrã.
   *
   * Numa caixa estreita fica uma linha só: «←», uma pastilha com o estado
   * («Faltam 3 ›») e «Enviar». A pastilha abre uma folha com tudo o resto,
   * inteiro. A pergunta é à CAIXA do estúdio e não à janela (ver
   * `o-estudio-pergunta-a-caixa`); uma largura ainda por medir (zero, no
   * servidor e no jsdom) conta como larga, que é a barra de sempre.
   */
  const caixaDoEstudio = useRef<HTMLDivElement | null>(null);
  const larguraDoEstudio = useLarguraDaZona(caixaDoEstudio);
  const barraCompacta = larguraDoEstudio > 0 && larguraDoEstudio < LARGURA_DA_BARRA_INTEIRA;
  const [folhaDoEnvio, setFolhaDoEnvio] = useState(false);
  /** No ecrã largo: o painel da pastilha do estado, e a pastilha onde se ancora. */
  const [painelDoEnvio, setPainelDoEnvio] = useState(false);
  const pastilhaDoEnvio = useRef<HTMLButtonElement>(null);
  const fecharPainelDoEnvio = useCallback(() => setPainelDoEnvio(false), []);
  /**
   * Com o teclado aberto, a barra compacta sai da frente: no telemóvel, o
   * teclado e a barra juntos deixavam uma tira de ecrã para o campo onde ela
   * está a escrever. É a mesma conta da cápsula dos destinos
   * (`tecladoAberto`, em `barra-de-destinos.ts`); sem `visualViewport` (jsdom,
   * browsers antigos) fica tudo como antes.
   */
  const [tecladoNoEcra, setTecladoNoEcra] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const ver = () => setTecladoNoEcra(tecladoAberto(window.innerHeight, vv.height));
    ver();
    vv.addEventListener("resize", ver);
    return () => vv.removeEventListener("resize", ver);
  }, []);
  const barraEscondida = barraCompacta && tecladoNoEcra;
  const [folgaDaBarra, setFolgaDaBarra] = useState(80);
  useEffect(() => {
    const el = barraDeBaixo.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      /**
       * ── O QUE SOBRA POR BAIXO DA BARRA É O `bottom` DELA, E NÃO A DISTÂNCIA
       *    AO FUNDO DA JANELA ────────────────────────────────────────────────
       *
       * Isto era `Math.max(0, window.innerHeight - r.bottom)`, e a intenção
       * está escrita duas linhas acima: «a distância a que ela está do fundo do
       * ecrã (o `bottom-[calc(56px+…)]` que a levanta por cima da navegação do
       * telemóvel)». Ou seja — o `bottom` do `sticky`. A conta pela janela dá
       * esse número só quando quem rola É a janela.
       *
       * MEDIDO num Chromium, no painel que abre a partir do cartão de um
       * cliente, onde quem rola é o painel e não a janela: o fundo da barra
       * ficava a 384 px e o fundo da caixa que rola a 876 — quase 500 px de
       * diferença que entravam na conta como se fossem folga a reservar.
       *
       *     folga reservada    893 a 962 px
       *     folga necessária   ~569 px
       *
       * E realimentava-se: mais folga faz a coluna mais alta, a barra sobe na
       * janela, a distância ao fundo cresce, a folga cresce outra vez. Daí os
       * valores a saltar entre larguras (420, 962, 421, 913, 893) e o vazio de
       * quase mil píxeis no fim do passo 1.
       *
       * O `bottom` calculado é a mesma resposta sem depender de quem rola: é o
       * que o `sticky` reserva por baixo, resolvido em píxeis, com o
       * `env(safe-area-inset-bottom)` já dentro.
       */
      const porBaixo = Math.max(0, Number.parseFloat(getComputedStyle(el).bottom) || 0);
      setFolgaDaBarra(Math.ceil(r.height + porBaixo + 12));
      // ── E A MESMA MEDIDA SERVE A QUEM FLUTUA POR CIMA ──────────────────
      // O aviso do `Toast.tsx` põe-se a uma distância fixa do fundo — a altura
      // da navegação do telemóvel mais um respiro — e essa distância cai
      // exactamente dentro desta barra, que pousa nessa mesma navegação. Sem
      // isto, um aviso de gravação falhada nasce por cima do botão
      // «Pré-visualizar» e come-lhe o toque durante quatro segundos.
      // Publicamos a altura MEDIDA (a barra quebra em duas linhas quando o
      // passo o pede, e aí é mais alta) para o aviso se afastar tanto quanto
      // preciso e nem um pixel mais. Só existe enquanto o estúdio estiver
      // aberto: a limpeza do efeito devolve-a a zero.
      // Escondida pelo teclado, a barra não ocupa nada: o aviso desce.
      const altura = barraEscondida ? 0 : Math.ceil(r.height);
      document.documentElement.style.setProperty("--bo-barra-accao", `${altura}px`);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
      document.documentElement.style.removeProperty("--bo-barra-accao");
    };
    // O passo muda o conteúdo da barra (e portanto a altura); remedir aí.
  }, [step, barraEscondida]);

  // ── Aviso ao sair com trabalho por gravar ─────────────────────────────
  // A janela é estreita (a gravação é a 800ms), mas existe: fechar o
  // separador logo a seguir a escrever perdia essas últimas palavras.
  //
  // E também quando o rascunho ficou SÓ NESTE COMPUTADOR: aí a janela não é
  // estreita nenhuma — é todo o tempo em que o servidor recusar as gravações.
  // Fechar o separador nesse estado não perde o `localStorage`, mas perde a
  // única pessoa que ainda podia fazer alguma coisa acerca disso.
  //
  // DENTRO DO BACK OFFICE QUEM TRAVA É O REGISTO: um travão só para todos os
  // ecrãs, e capaz de nomear o que se perde («Proposta de Rita & Tomás») em vez
  // de dizer apenas que se perde alguma coisa. Este continua a valer onde não
  // há registo — o dossier do evento, um teste — porque um travão que
  // desaparecesse em silêncio seria a pior troca possível.
  useEffect(() => {
    if (oRegistoFalaPorMim) return;
    if (!porGravar && !soNesteComputador && aGravarNoServidor === 0) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, porGravar, soNesteComputador, aGravarNoServidor]);

  // ── A contagem dos dez segundos para anular a limpeza ─────────────────
  useEffect(() => {
    if (!limpo) return;
    if (limpo.segundos <= 0) {
      setLimpo(null);
      return;
    }
    const t = setTimeout(
      () => setLimpo((l) => (l ? { ...l, segundos: l.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [limpo]);

  /** Devolve o rascunho que o "Limpar" deitou fora. */
  function anularLimpeza() {
    if (!limpo) return;
    setDoc(limpo.doc);
    setTotalInput(limpo.total);
    // E o preço volta ao pedido com ele: quem repôs o rascunho repôs o valor
    // que lá estava, e deixá-lo só no ecrã era voltar a ter duas verdades.
    const base = parseMoneyText(limpo.total);
    // Com o documento REPOSTO, e não com o que está a sair do ecrã — ver
    // `baseDoEcraParaOPedido`.
    persistirPreco(base > 0 ? base : undefined, { doc: limpo.doc });
    setLimpo(null);
    toast("Rascunho reposto.", "success");
  }

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

  /**
   * Repõe no estúdio uma versão que já tinha sido enviada.
   *
   * Passa pela MESMA anulação de dez segundos do "Limpar", e pela mesma razão:
   * o gesto deita fora o que estava no ecrã, e quem carrega só vê o que perdeu
   * depois de carregar. Uma caixa a perguntar "tem a certeza?" seria respondida
   * sem ser lida.
   *
   * Não envia nada. Fica um rascunho igual ao que seguiu naquele dia, para se
   * mexer e voltar a passar pelo Enviar.
   *
   * ── PORQUE É QUE ESTA NÃO GANHOU CAIXA DE CONFIRMAÇÃO ──────────────────
   * É uma das acções que mudam o preço final, e portanto entra na lista das
   * que têm de ser reversíveis e ficar no histórico — e ficam as duas coisas.
   * O que não ganha é a PERGUNTA: a razão está escrita três linhas acima e não
   * mudou. Perguntar antes de repor uma versão que ela acabou de escolher numa
   * lista, pelo nome e pela data, era pedir para confirmar a leitura.
   */
  function restaurarVersao(antiga: ProposalDoc) {
    setLimpo({
      doc,
      total: totalInput,
      segundos: 10,
      motivo: "Versão anterior reposta no rascunho.",
    });
    const reposto = antiga as StudioDoc;
    setDoc(reposto);
    // O campo do total é texto (aceita "1.500" e "1 500 €"), por isso não sai de
    // graça do documento: deriva-se a base do que foi reposto, senão ficava com
    // o número da versão que se acabou de substituir.
    const base = baseDoDoc(reposto);
    setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
    // E GRAVA-SE no pedido. Escrever no campo do valor já gravava — é a
    // promessa que está escrita ao lado dele, «Há um número só» — e repor uma
    // versão trocava o documento inteiro, valor incluído, sem gravar nada. O
    // estúdio passava a dizer 8.000 e a Gestão do pedido, o Kanban e o dossier
    // continuavam a dizer 9.400 até ela enviar. Duas verdades sobre o mesmo
    // negócio, e a errada era a que aparecia em todos os outros ecrãs.
    // Com a versão REPOSTA, e não com o rascunho que ela acabou de substituir:
    // os adicionais que contam são os da versão. Ver `baseDoEcraParaOPedido`.
    persistirPreco(typeof base === "number" && base > 0 ? base : undefined, { doc: reposto });
    // A referência é composta a partir dos campos ATÉ alguém lhe mexer. Uma
    // versão reposta traz a referência com que seguiu, e recompô-la por cima
    // trocava o número da proposta que o cliente tem em mãos.
    setRefEdited(true);
    setConfirmSend(false);
    setSent(false);
    setStep("evento");
    // Só se o preço tiver MESMO mudado: repor uma versão com o mesmo valor não
    // é um acontecimento do dinheiro, e uma linha por cada não-mudança ensina a
    // saltar o histórico todo.
    const anterior = parseMoneyText(totalInput);
    const novo = typeof base === "number" && base > 0 ? base : 0;
    if (Math.abs(novo - anterior) > 0.01) {
      registarNoHistorico(
        `Versão anterior reposta no estúdio: preço final de ${eur(anterior)} para ${eur(novo)}.`,
      );
    }
    toast("Versão reposta. Podes anular durante 10 segundos.", "info");
  }

  /**
   * Insere o parágrafo do que mudou (painel Versões) na caixa "Mensagem para
   * o cliente" — NUNCA directamente no email. É a mesma caixa que já viaja
   * com o envio (ver `send`, mais abaixo), por isso não é preciso mais nada
   * para ela poder acompanhar a proposta.
   *
   * Uma caixa vazia recebe o parágrafo tal como está. Uma caixa que já tem
   * algo escrito por ela (uma nota pessoal, por exemplo) NÃO é substituída —
   * o parágrafo entra a seguir, com uma linha em branco pelo meio, para não
   * apagar trabalho.
   */
  function inserirParagrafoDoQueMudou(texto: string) {
    /* A caixa da mensagem saiu do passo 5 (14/10): o parágrafo entra no TEXTO
       do email, que é o que segue — a seguir ao «Olá …,», com uma linha em
       branco de cada lado. Sem texto ainda (o rascunho do email está a vir),
       diz-se e não se escreve por cima de nada. */
    if (!corpoDoEmail.trim()) {
      toast("O email ainda está a ser preparado — tenta daqui a um instante.", "info");
      return;
    }
    const partes = corpoDoEmail.split(/\n\s*\n/);
    const novo = [partes[0], texto, ...partes.slice(1)].join("\n\n");
    setCorpoDoEmail(novo);
    toast("Parágrafo inserido no email para o cliente. Revê antes de enviar.", "info");
  }

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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REPOR O TRABALHO QUE ESTA SESSÃO ESMAGOU
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A gaveta já existia e já estava cheia; o que faltava era isto e a porta do
   * lado do servidor. Aqui vai-se buscar o documento pelo nome que a própria
   * gravação devolveu.
   *
   * ── E REPOR NÃO É UM SENTIDO ÚNICO ────────────────────────────────────────
   *
   * Repor é, por definição, escrever por cima do que está no ecrã — ou seja, o
   * mesmo gesto que criou este problema. Duas coisas impedem que seja uma
   * troca de um estrago por outro:
   *
   *  1. O «desfazer» de dez segundos desta casa (`limpo`), que já existe para
   *     os outros gestos que substituem o documento — o próprio código diz que
   *     nasceu também para «repor uma versão antiga». Fica com o motivo
   *     escrito, para a barra poder dizer o que aconteceu.
   *
   *  2. E a gravação seguinte volta a passar pelo mesmo mecanismo do servidor:
   *     o documento que está agora no ecrã passa a ser ELE o sobreposto, e vai
   *     para a mesma gaveta. Ou seja, o resgate protege nos dois sentidos sem
   *     ninguém ter escrito código para isso.
   */
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A NOTA QUE PERTENCE A UMA SECÇÃO, E NÃO AO NEGÓCIO INTEIRO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O campo `notasPorSeccao` existia há muito: tipado no documento, protegido
   * no gerador do PDF («as notas por secção nunca são desenhadas»), e limpo na
   * cópia para outro pedido — três sítios a tratar bem de uma coisa que
   * NINGUÉM ESCREVIA. Não havia caixa nenhuma no estúdio.
   *
   * O `notasInternas` que já existe é sobre o negócio: «recusaram em 2025 por
   * preço». Estas são outra coisa e vivem noutra escala: «as capas são as duas
   * do mesmo ângulo, trocar a segunda», «o cronograma tem de bater com a hora
   * do padre», «esta linha é a que dá a margem toda». Escritas ao lado do
   * campo geral, perdiam-se num parágrafo; escritas na secção, estão onde a
   * dúvida nasce.
   *
   * ── E O DOCUMENTO NÃO PODE ENCHER-SE DE VAZIOS ─────────────────────────
   *
   * Uma caixa vazia por secção que gravasse `""` punha seis chaves em todos os
   * documentos, todas sem conteúdo, e ainda por cima faziam o `resgate` e as
   * comparações de versões acusarem diferenças que não existem. Apagar a
   * entrada quando a nota fica vazia é o que mantém o documento igual ao que
   * era antes desta funcionalidade existir — e é isso que o teste prende.
   */
  function notaDaSeccao(chave: string, titulo: string) {
    const notas = doc.notasPorSeccao ?? {};
    return (
      <NotasInternas
        compacta
        titulo={titulo}
        valor={notas[chave] ?? ""}
        placeholder="Só para a equipa. Nunca sai na proposta."
        onChange={(v) => {
          const seguintes = { ...notas };
          if (v.trim()) seguintes[chave] = v;
          else delete seguintes[chave];
          patch({
            notasPorSeccao: Object.keys(seguintes).length > 0 ? seguintes : undefined,
          });
        }}
      />
    );
  }

  async function reporSobreposto() {
    if (!sobreposto || aRepor) return;
    setARepor(true);
    try {
      // A rota recebe a VARIANTE, não a chave inteira: a chave é
      // `<pedido>--<variante>`, e é o servidor que a volta a montar.
      const variante = sobreposto.chave.startsWith(`${quote.id}--`)
        ? sobreposto.chave.slice(`${quote.id}--`.length)
        : null;
      if (!variante) {
        toast("Não reconheço o sítio onde essa versão ficou guardada.", "error");
        return;
      }
      const res = await fetch(
        `/api/orcamento/${quote.id}/proposta-rascunho?variante=${encodeURIComponent(variante)}`,
      );
      const dados = await res.json().catch(() => null);
      const recuperado = dados?.draft?.doc;
      if (!res.ok || recuperado == null) {
        // Dizer o que aconteceu e o que fazer, e NÃO limpar a barra: se não se
        // conseguiu abrir agora, a gaveta continua lá e vale a pena insistir.
        toast(
          res.status === 401
            ? "A sessão expirou. Entra outra vez e essa versão continua guardada."
            : "Não consegui abrir essa versão agora. Ela continua guardada — tenta daqui a pouco.",
          "error",
        );
        return;
      }
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo: sobreposto.quem
          ? `Reposta a versão de ${sobreposto.quem}.`
          : "Reposta a versão que tinha sido substituída.",
      });
      setDoc(recuperado as StudioDoc);
      setSobreposto(null);
    } catch {
      toast("Não consegui abrir essa versão agora. Ela continua guardada.", "error");
    } finally {
      setARepor(false);
    }
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
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: oQueOLimparLevou(doc) });
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
    setStep("evento");
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

  // ── Image upload ──
  // Uma imagem por pedido: um lote inteiro num só POST rebentava o limite de
  // corpo do alojamento (~4,5 MB) com fotos reais de telemóvel — o upload
  // "às vezes não funcionava". Cada ficheiro é comprimido no navegador
  // (image-prep) e enviado individualmente, com uma repetição automática em
  // falha de rede; um ficheiro mau nunca deita fora os restantes.
  async function uploadOne(
    file: File,
    thumb: File | null,
    cor?: string | null,
    lqip?: string | null,
    mid?: File | null,
  ): Promise<{ path: string; url: string; thumbUrl?: string; cor?: string }> {
    const post = () => {
      const form = new FormData();
      form.append("files", file);
      // O LQIP — a mancha de cor que ocupa a célula enquanto a fotografia não
      // chega. Sai da MESMA descodificação que já calculou a cor e a miniatura
      // (`image-prep`), portanto não custa nada, e sem ele a página do casal
      // abre com rectângulos vazios: o caminho da Biblioteca de Temas gravava-o
      // e este não, e por isso a mesma página tinha metade das células com
      // placeholder e a outra metade sem.
      if (lqip) form.append("lqips", lqip);
      // A cor dominante, calculada na mesma descodificação que encolheu a foto
      // (ver `image-prep`). É aqui que ela pode ser calculada — do lado do
      // estúdio as fotos já vêm de outro domínio e o `canvas` fica manchado.
      if (cor) form.append("cores", cor);
      // A miniatura viaja ao lado do original, no mesmo pedido: sai da MESMA
      // descodificação que já se fez para encolher a foto, portanto não custa
      // tempo nenhum, e ~30–60 KB não se notam ao lado de uma foto de 2 MB.
      // Sem ela, a grelha voltava a puxar 1130 KB por célula para desenhar
      // 174 px (medido em IMAGES-BEFORE.md).
      if (thumb) form.append("thumbs", thumb);
      // A de 1200 px — a que a PÁGINA DO CASAL mostra. Sai da mesma
      // descodificação que fez a miniatura, portanto não custa tempo nenhum, e
      // ~250 KB não se notam ao lado de uma foto de 2 MB.
      //
      // Sem ela, esta fotografia só ganha a de 1200 quando ALGUÉM OLHAR para
      // ela — e numa proposta acabada de enviar essa pessoa é o casal, com um
      // download do original e uma conversão a acontecer no servidor enquanto
      // eles olham para um rectângulo vazio.
      if (mid) form.append("medias", mid);
      return fetch(`/api/orcamento/${quote.id}/assets`, { method: "POST", body: form });
    };
    let res: Response;
    try {
      res = await post();
    } catch {
      // Soluço de rede — tenta uma segunda vez antes de desistir.
      res = await post();
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.error ||
          (res.status === 413
            ? "Imagem demasiado grande para envio."
            : "Falha ao carregar a imagem."),
      );
    }
    const im: { path: string; url: string; thumbUrl?: string; cor?: string } | undefined =
      data?.images?.[0];
    if (!im) throw new Error("Falha ao carregar a imagem.");
    // A grelha desenha pela miniatura quando existe; o original fica para o
    // detalhe e para o PDF.
    setAssetUrls((prev) => ({ ...prev, [im.path]: im.thumbUrl || im.url }));
    setAssetOriginais((prev) => ({ ...prev, [im.path]: im.url }));
    if (im.cor) setAssetCores((prev) => ({ ...prev, [im.path]: im.cor as string }));
    return im;
  }

  async function handleUpload(key: string, files: File[], onPaths: (paths: string[]) => void) {
    if (files.length === 0) return;
    setUploading((u) => ({ ...u, [key]: { feito: 0, total: files.length } }));
    /**
     * Mais uma arrumada — e conta tanto a que subiu como a que falhou.
     *
     * A barra retrata o que JÁ NÃO SE ESPERA, e uma foto que falhou também
     * deixou de se esperar: contar só as boas deixava a barra a faltar-lhe um
     * bocado para sempre, num lote com um ficheiro mau. O que correu mal
     * continua a ser dito pelo `toast`, no fim e com o número.
     */
    const maisUma = () =>
      setUploading((u) => {
        const p = u[key];
        if (!p) return u;
        return { ...u, [key]: { ...p, feito: Math.min(p.total, p.feito + 1) } };
      });
    // Cover photos print large (the document's hero) so they keep more pixels and
    // a higher JPEG quality; mood-board photos render as small collage cells and
    // use a tighter cap. The upload key encodes which is which ("cover-…"/"board-…").
    const kind: ImageKind = key.startsWith("board-") ? "board" : "cover";
    // Preparar e enviar em VIAS PARALELAS. Em sequência, o processador ficava
    // parado à espera da rede e a rede parada à espera do processador; assim a
    // foto N+1 é preparada enquanto a N sobe. A preparação em si já corre fora
    // do fio principal (image-prep → image-worker), por isso a interface
    // continua a responder durante o lote.
    const results: ({ path: string } | null)[] = new Array(files.length).fill(null);
    const errors: string[] = [];
    let next = 0;
    async function lane() {
      for (;;) {
        const i = next++;
        if (i >= files.length) return;
        const f = files[i];
        try {
          const prepared = await prepareImageWithThumb(f, kind);
          const im = await uploadOne(
            prepared.file,
            prepared.thumb,
            prepared.cor,
            prepared.lqip,
            prepared.mid,
          );
          // Guardado pelo ÍNDICE: as vias acabam fora de ordem e a ordem das
          // fotos escolhidas é a que a Catarina vê no documento.
          results[i] = { path: im.path };
        } catch (e) {
          errors.push(e instanceof Error ? e.message : `Falha ao carregar "${f.name}".`);
        } finally {
          maisUma();
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, lane));
      const paths = results.filter((r): r is { path: string } => r !== null).map((r) => r.path);
      if (paths.length > 0) onPaths(paths);
      if (errors.length > 0) {
        toast(
          errors.length === files.length
            ? errors[0]
            : `${paths.length} de ${files.length} carregadas. ${errors[0]}`,
          "error",
        );
      } else if (paths.length > 1) {
        toast(`${paths.length} imagens carregadas`, "success");
      }
    } finally {
      // A chave SAI do mapa: «não está a carregar nada» é a ausência, e não um
      // `{feito, total}` velho à espera de ser lido como se fosse de agora.
      setUploading((u) => {
        if (!(key in u)) return u;
        const resto = { ...u };
        delete resto[key];
        return resto;
      });
    }
  }

  // ── Biblioteca de temas ──
  //
  /** As fotos da biblioteca que já estão nesta proposta, para o seletor as
   *  marcar. Sai do DOCUMENTO (capas + mood boards) e não do mapa de origens:
   *  uma foto removida do rascunho deixa de contar no instante em que é
   *  removida, mesmo que a origem fique lá guardada. */
  /**
   * Os caminhos de ORIGEM das fotos de biblioteca que estão neste documento.
   *
   * Origem e não caminho da proposta: as fotos da proposta são cópias com
   * caminho próprio, e comparar cópias nunca diria que duas propostas mostraram
   * a mesma imagem.
   */
  function origensNoDocumento(): string[] {
    const noDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) noDoc.add(p);
    for (const b of doc.moodBoards ?? []) for (const p of b.images) if (p) noDoc.add(p);
    const origens = new Set<string>();
    for (const p of noDoc) {
      const de = themeOrigins[p];
      if (de) origens.add(de);
    }
    return [...origens];
  }

  /**
   * As fotos da biblioteca que já foram para OUTROS casamentos, e para onde.
   *
   * Lê-se uma vez por pedido: o que já foi enviado não muda enquanto se escreve
   * esta proposta. Falhar não impede nada — sem a resposta a grelha é a de
   * antes, e escolher uma foto repetida continua a ser possível, que é como
   * deve ser.
   */
  const [usadasNoutras, setUsadasNoutras] = useState<Record<string, string>>({});
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}/fotos-repetidas`);
        if (!res.ok) return;
        const data = (await res.json()) as { fotos?: FotoRepetida[] };
        if (!vivo || !Array.isArray(data.fotos)) return;
        setUsadasNoutras(Object.fromEntries(data.fotos.map((f) => [f.origem, comoSeDiz(f)])));
        // A lista inteira, e não só a frase: é dela que sai o aviso do MESMO
        // ESPAÇO, que precisa do `local` de cada uso.
        setRepetidas(data.fotos);
      } catch {
        /* a grelha fica a de antes */
      }
    })();
    return () => {
      vivo = false;
    };
  }, [quote.id]);

  const usedThemePaths = useMemo(() => {
    if (!picker) return [];
    const inDoc = new Set<string>();
    for (const p of doc.coverImages ?? []) if (p) inDoc.add(p);
    for (const b of doc.moodBoards) for (const p of b.images) inDoc.add(p);
    const sources: string[] = [];
    for (const p of inDoc) {
      const from = themeOrigins[p];
      if (from) sources.push(from);
    }
    return sources;
  }, [picker, doc.coverImages, doc.moodBoards, themeOrigins]);

  /**
   * O INSTANTE DO CLIQUE — a foto ocupa já o seu lugar.
   *
   * O seletor entrega um marcador por foto (`pending:<uuid>`), que não é
   * caminho de coisa nenhuma, e a miniatura que ele JÁ tem desenhada em
   * memória. O marcador entra no documento no sítio para onde o seletor foi
   * aberto e o `assetUrls` aponta-o a essa miniatura: a foto aparece no mood
   * board (ou na capa) sem um único pedido de rede novo, na célula certa e com
   * o mesmo `aspect-ratio` das outras — nada salta quando ela assentar.
   *
   * A origem entra AQUI e não só na confirmação: uma foto a caminho já conta
   * como "já nesta proposta" (ver `usedThemePaths`), senão dava para a escolher
   * outra vez enquanto a primeira cópia ainda ia a caminho.
   */
  function onReservedFromLibrary(reservas: ReservedImage[]) {
    if (reservas.length === 0) return;
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.thumbUrl) next[r.marcador] = r.thumbUrl;
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const r of reservas) if (r.sourcePath) next[r.marcador] = r.sourcePath;
      return next;
    });
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, reservas[0].marcador);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        reservas.map((r) => r.marcador),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, reservas[0].marcador);
    } else if (picker?.kind === "pagina" && paginaDaFoto) {
      porFotoNaPagina(
        picker.chave,
        paginaDaFoto.nome,
        picker.max,
        picker.lugar,
        reservas[0].marcador,
      );
    }
  }

  // As fotos escolhidas vêm REFERENCIADAS (`tema:<caminho>`) pela rota
  // /assets/importar — deixaram de ser copiadas. Para o documento é
  // indiferente: continua a ser uma string por foto, e quem a resolve (a grelha
  // aqui, o gerador de PDF lá) sabe ler as duas famílias. O porquê está em
  // `src/lib/theme-ref.ts`.
  //
  // O seletor entrega as fotos LOTE A LOTE (é assim que a barra de progresso
  // pode ser verdadeira), por isso isto corre várias vezes por importação.
  //
  // Cada foto que traz o seu `marcador` é uma TROCA NO LUGAR: o marcador provisório
  // dá lugar ao caminho definitivo na mesma célula, sem reordenar nada. As que
  // vêm sem `marcador` — quem não reservou lugar, ou um lote que o servidor não
  // deixou emparelhar com segurança — são acrescentadas, como sempre foram.
  //
  // Um marcador que já não esteja no documento (ela removeu a foto enquanto a
  // cópia ia a caminho) não volta a entrar: a decisão dela é mais recente.
  function onPickedFromLibrary(images: ImportedImage[]) {
    if (images.length === 0) return;
    const trocas = new Map<string, string>();
    const novas: ImportedImage[] = [];
    for (const im of images) {
      if (!im.path) continue;
      if (im.marcador) trocas.set(im.marcador, im.path);
      else novas.push(im);
    }
    setAssetUrls((prev) => {
      const next = { ...prev };
      // A miniatura é a DO TEMA — o mesmo `theme-thumbs/<pasta>/<x>.jpg` que o
      // seletor acabou de mostrar. É esse o ganho da referência: o service
      // worker já a tem no disco (guarda por caminho, sem marcador), portanto a
      // célula desenha sem tocar na rede.
      for (const im of images) if (im.path && im.url) next[im.path] = im.thumbUrl || im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setAssetOriginais((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.url) next[im.path] = im.url;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const im of images) if (im.path && im.sourcePath) next[im.path] = im.sourcePath;
      for (const marcador of trocas.keys()) delete next[marcador];
      return next;
    });
    if (trocas.size > 0) {
      setDoc((d) => mapImagePaths(d, (p) => trocas.get(p) ?? p));
    }
    if (novas.length === 0) return;
    if (picker?.kind === "board" && picker.substituir !== undefined) {
      substituirFotoDoBoard(picker.bi, picker.substituir, novas[0].path);
    } else if (picker?.kind === "board") {
      addBoardImages(
        picker.bi,
        novas.map((im) => im.path),
      );
    } else if (picker?.kind === "cover") {
      setCoverAt(picker.idx, novas[0].path);
    } else if (picker?.kind === "pagina" && paginaDaFoto) {
      porFotoNaPagina(picker.chave, paginaDaFoto.nome, picker.max, picker.lugar, novas[0].path);
    }
  }

  /**
   * A cópia falhou (ou foi parada): o lugar reservado desaparece.
   *
   * SEM AVISO NENHUM daqui — a pastilha do seletor já diz quantas não entraram,
   * porquê, e oferece "Repetir". Um segundo aviso a dizer o mesmo só ensinaria
   * a ignorar os dois.
   */
  function onDroppedFromLibrary(marcadores: string[]) {
    if (marcadores.length === 0) return;
    const perdidos = new Set(marcadores);
    setDoc((d) => mapImagePaths(d, (p) => (perdidos.has(p) ? null : p)));
    setAssetUrls((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
    setThemeOrigins((prev) => {
      const next = { ...prev };
      for (const t of marcadores) delete next[t];
      return next;
    });
  }

  // ── Serviços ──
  // O editor da secção vive em `ServicesEditor.tsx` (teclado, arrasto, anular).
  // Aqui fica só a ponte para o documento.
  const setServiceGroups = useCallback(
    (update: (prev: StudioDoc["serviceGroups"]) => StudioDoc["serviceGroups"]) => {
      // Ver `camposTocados`: o editor de serviços é o outro caminho por onde a
      // PESSOA escreve, e é onde o texto perdido foi medido primeiro.
      //
      // MAS SÓ QUANDO ELA ESCREVEU. O editor também passa por aqui ao montar,
      // para dar ids às linhas que vêm sem eles — e contar isso como escrita
      // fazia o merge do rascunho do servidor pôr de lado os Serviços que ele
      // trazia; a gravação seguinte apagava-os do servidor. Medido: abrir a
      // proposta noutro computador deixava os Serviços vazios (relatório da
      // auditoria, n.º 1). `soMudaramOsIds` separa as duas coisas.
      setDoc((d) => {
        const next = update(d.serviceGroups);
        if (next === d.serviceGroups) return d;
        if (!soMudaramOsIds(d.serviceGroups, next)) camposTocados.current.add("serviceGroups");
        return { ...d, serviceGroups: next };
      });
    },
    [],
  );

  // ── Mood boards (decoracao) ──
  /**
   * Um mood board NOVO nasce a manter a forma das fotografias.
   *
   * O campo está no documento e não no código de desenho justamente para os
   * documentos ANTIGOS não mudarem (o PDF é redesenhado a cada abertura do link
   * do casal, e uma proposta já enviada não pode mudar de aspecto por baixo
   * dele). Mas uma página que ainda não existe não tem passado nenhum a
   * proteger — e o que ela pediu, por escrito e em duas páginas, foi que as
   * fotografias deixassem de sair cortadas. Portanto o que nasce hoje nasce
   * assim; o que já lá está muda quando ela quiser, no interruptor de cada
   * bloco.
   */
  function addBoard() {
    setDoc((d) => ({
      ...d,
      moodBoards: [
        ...d.moodBoards,
        { title: "", annotation: "", images: [], enquadramento: "forma-da-foto" },
      ],
    }));
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * INSERIR UM MOOD BOARD GUARDADO COMO MODELO
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Porque é que isto não é um `setDoc` de uma linha ────────────────────
   * Era. E as fotos do modelo vêm com o caminho que tinham onde foram
   * guardadas — `<quoteIdOrigem>/<uuid>.jpg`, debaixo de OUTRO pedido.
   * Inseridas tal e qual, o documento novo ficava a apontar para a pasta
   * alheia: as células abriam sem miniatura (a listagem de fotos é por
   * pedido), e no dia em que esse pedido fosse apagado a proposta — a essa
   * altura já enviada — ficava sem imagens, sem ninguém dar por nada.
   *
   * É o mesmo problema que o «Criar a partir de…» já resolvia com
   * `duplicarFotosParaPedido`, e que ao inserir um BLOCO ninguém resolvia.
   *
   * ── O que NÃO se recopia ────────────────────────────────────────────────
   * As referências à Biblioteca (`tema:…`) não vivem debaixo de pedido nenhum
   * — são estáveis por construção e copiá-las seria desfazer o que a
   * referência veio ganhar (ver `theme-ref.ts`). As embutidas (`data:`) viajam
   * dentro do documento. E as que já são deste pedido ficam onde estão.
   *
   * ── E se a cópia falhar ─────────────────────────────────────────────────
   * O bloco fica na mesma, com os caminhos de origem, e diz-se. É a mesma
   * política do «Criar a partir de…»: uma proposta acoplada à pasta de outro
   * pedido é pior do que uma proposta com fotos — mas é muito melhor do que um
   * mood board vazio e um gesto que não fez nada.
   */
  async function inserirMoodBoardDeModelo(modelo: MoodBoard) {
    const novo: MoodBoard = { ...modelo, images: [...(modelo.images ?? [])] };
    setDoc((d) => ({ ...d, moodBoards: [...d.moodBoards, novo] }));

    // ── ONDE É QUE O BLOCO FICOU ──────────────────────────────────────────
    // O botão «De um modelo…» está ao FUNDO da secção e o bloco entra no fim
    // do array — mas o que sai impresso obedece à ordem dos capítulos, e um
    // bloco chamado «Cerimónia na igreja» aterra a meio da lista, muitas vezes
    // acima da dobra. Num documento comprido, «bloco inserido» é a única coisa
    // que não interessa saber: o que interessa é a página em que ele calhou.
    //
    // A posição SAI do `temasComPagina`, a mesma lista que o gerador do PDF
    // usa — contar cartões no ecrã dizia «a 3.ª» de uma página que é a 5.ª no
    // documento. Um tema sem fotografias e sem texto não chega a sair, e a
    // frase di-lo em vez de inventar um número.
    const depois = { ...doc, moodBoards: [...doc.moodBoards, novo] } as ProposalDoc;
    const saem = temasComPagina(depois);
    const pos = saem.indexOf(doc.moodBoards.length);
    const nome = (novo.title ?? "").trim() || `Inspiração ${doc.moodBoards.length + 1}`;
    toast(
      pos >= 0
        ? `«${nome}» entrou como a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.`
        : `«${nome}» entrou no fim das páginas de inspiração. Sem fotografias nem texto, não sai no PDF.`,
      "success",
    );

    // O predicado é uma função à parte, e a referência à Biblioteca fica para
    // ÚLTIMO: `ehRefDeTema` é um type guard (`ref is string`), portanto negá-lo
    // a meio estreita a string até `never` e o TypeScript recusa tudo o que
    // venha a seguir sobre a mesma variável.
    const precisaDeCopia = (p: string): boolean => {
      if (!p || p.startsWith("data:") || isPendingImage(p)) return false;
      if (p.startsWith(`${quote.id}/`)) return false;
      return !ehRefDeTema(p);
    };
    const deOutroPedido = novo.images.filter(
      (p): p is string => typeof p === "string" && precisaDeCopia(p),
    );
    if (deOutroPedido.length === 0) return;

    // ── ISTO DEIXA DE SER MUDO ────────────────────────────────────────────
    // O bloco aparece na proposta no instante do clique e as fotos vêm a
    // seguir, num pedido só que demora de dois a vinte segundos. Não havia
    // sinal nenhum disso — só um toast lá ao fim, e apenas quando corria mal.
    setFotosACopiar((n) => n + deOutroPedido.length);
    try {
      const res = await fetch("/api/propostas/copiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteId: quote.id, fotos: deOutroPedido }),
      });
      const dados = await res.json().catch(() => null);
      const mapa = (dados?.fotos ?? {}) as Record<string, string>;
      const copiadas = Object.keys(mapa);
      if (!res.ok || copiadas.length === 0) throw new Error("sem cópias");
      // A troca é feita no documento INTEIRO e por caminho: se ela já tiver
      // mexido no bloco entretanto (arrastado, removido uma foto), a troca
      // acompanha na mesma em vez de escrever por cima do que ela fez.
      setDoc((d) => mapImagePaths(d, (p) => mapa[p] ?? p));
      // As fotos novas ainda não têm assinatura nenhuma neste ecrã.
      void hidratarAssets();
      const ficaram = deOutroPedido.length - copiadas.length;
      if (ficaram > 0) {
        toast(`${ficaram} foto(s) do modelo ficaram na pasta da proposta de origem.`, "error");
      }
    } catch {
      toast(
        "As fotos deste modelo ficaram na pasta da proposta de origem — volta a escolhê-las se essa proposta for apagada.",
        "error",
      );
    } finally {
      setFotosACopiar((n) => Math.max(0, n - deOutroPedido.length));
    }
  }
  function updateBoard(bi: number, p: Partial<StudioDoc["moodBoards"][number]>) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => (i === bi ? { ...b, ...p } : b)),
    }));
  }
  /**
   * Remover uma página de inspiração — COM PERGUNTA, e a pergunta conta.
   *
   * É a acção mais cara do estúdio inteiro: leva com ela as fotografias todas
   * daquela página, escolhidas uma a uma de entre a biblioteca e os mood boards
   * (e às vezes carregadas do telemóvel à beira do cliente), mais a folha que
   * elas ocupam no PDF. Refazê-la não é escrever outra vez um título — é voltar
   * a curar uma página inteira.
   *
   * Por isso PERGUNTA e não anulação: é rara (uma proposta tem três a oito
   * páginas e removem-se poucas), é cara, e dez segundos de «Anular» são pouco
   * para quem só dá pelo estrago ao chegar à pré-visualização.
   *
   * A frase nomeia a página pelo nome que ela lhe deu, conta as fotografias e
   * diz ONDE ela estava a sair no documento — que é a parte que decide a
   * resposta, e a única que não se vê a olhar para o cartão.
   *
   * Uma página em branco (sem título, sem descrição e sem fotos) sai sem
   * pergunta nenhuma: não há ali nada a perder, e perguntar por nada é ensinar
   * a responder que sim sem ler.
   */
  function removeBoard(bi: number) {
    const b = doc.moodBoards[bi];
    const apagar = () =>
      setDoc((d) => ({ ...d, moodBoards: d.moodBoards.filter((_, i) => i !== bi) }));
    if (!b) return;
    const nome = (b.title ?? "").trim();
    const fotos = b.images.length;
    const temTexto = nome !== "" || (b.annotation ?? "").trim() !== "";
    if (fotos === 0 && !temTexto) {
      apagar();
      return;
    }
    // A posição SAI da mesma lista que o gerador do PDF usa (`temasComPagina`),
    // e não de contar cartões no ecrã: a ordem de saída respeita os capítulos
    // dos serviços, e as páginas sem fotos não chegam a sair. Uma segunda
    // contagem aqui dizia «a página 3» de uma página que é a 5.ª no documento.
    const saem = temasComPagina(doc as ProposalDoc);
    const pos = saem.indexOf(bi);
    const conta =
      fotos > 0
        ? `Leva com ela ${fotos} ${fotos === 1 ? "fotografia" : "fotografias"}` +
          (pos >= 0 ? `, e é a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.` : ".")
        : "Ainda não tem fotografias nenhumas — leva o título e a descrição, e mais nada.";
    setARemover({
      chave: `board:${bi}`,
      pergunta: `Remover a página «${nome || `Inspiração ${bi + 1}`}»? ${conta}`,
      docNoMomento: doc,
      aplicar: apagar,
    });
  }
  /**
   * Move o board que está NA POSIÇÃO `pos` do ecrã.
   *
   * Recebe a posição visível e não o índice do array porque, enquanto a ordem
   * vier sugerida pelos Serviços, os dois números são diferentes — e mover
   * «o terceiro que vejo» tem de mover o terceiro que se vê.
   *
   * Arrumar à mão é uma decisão: materializa a ordem mostrada e acende
   * `ordemExplicita`. Sem isso, ela punha o board no sítio e a sugestão
   * devolvia-o ao lugar de onde saiu.
   */
  function moveBoard(pos: number, dir: -1 | 1) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      return { ...arrumado, moodBoards: move(arrumado.moodBoards, pos, dir) };
    });
  }
  function addBoardImages(bi: number, paths: string[]) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: [...b.images, ...paths] } : b,
      ),
    }));
    // Quem passa das doze fotografias fica a saber nesse instante que o tema
    // vai ocupar duas páginas no PDF — não é um erro (nenhuma fica de fora),
    // mas é uma página a mais, e decide-se melhor a escolher do que no PDF.
    const antes = doc.moodBoards[bi]?.images.length ?? 0;
    const total = antes + paths.length;
    const disposicao = disposicaoDoTema(doc.moodBoards[bi]);
    if (paginasDoTema(total, disposicao) > paginasDoTema(antes, disposicao) && antes > 0) {
      toast(
        `Este tema fica com ${total} fotos e passa a ocupar ${paginasDoTema(total, disposicao)} páginas no PDF.`,
        "info",
      );
    }
  }
  /**
   * Remover uma foto — PELA POSIÇÃO, e com dez segundos para voltar atrás.
   *
   * Era por caminho (`filter((p) => p !== path)`), e a mesma fotografia pode
   * estar duas vezes no mesmo board: remover uma removia as duas. Com a grelha
   * a poder ser reordenada e a receber fotos de outros boards, a posição passou
   * a ser a única coisa que identifica uma célula.
   *
   * A anulação é a mesma dos dez segundos do «Limpar» (`setLimpo`): guarda o
   * documento inteiro antes de mexer. Sem diálogo a perguntar — é a regra desta
   * casa, e uma pergunta antes de tirar uma foto de uma grelha de quarenta
   * seria respondida sem ser lida.
   */
  function removeBoardImageAt(bi: number, ii: number) {
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografia removida." });
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi
          ? {
              ...b,
              images: b.images.filter((_, j) => j !== ii),
              // A marca da principal acompanha: sem isto, tirar a foto de cima
              // fazia «a principal» passar a ser a que calhou àquele índice.
              principal: marcaDepoisDeMexer(b, (antigo) =>
                antigo === ii ? null : antigo > ii ? antigo - 1 : antigo,
              ),
            }
          : b,
      ),
    }));
  }

  /**
   * Trocar UMA fotografia no lugar.
   *
   * Palavras dela: «Substituir uma foto sem a apagar primeiro: abre a
   * biblioteca e troca no lugar.» Sem isto, trocar era remover (perdendo a
   * posição), escolher outra — que ia para o fim — e arrastá-la de volta.
   *
   * A marca da principal não se toca: o lugar continua a ser o mesmo, e quem
   * troca a foto que manda na página quer que a nova mande na mesma.
   */
  function substituirFotoDoBoard(bi: number, ii: number, path: string) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, images: b.images.map((p, j) => (j === ii ? path : p)) } : b,
      ),
    }));
    setPicker(null);
  }

  /** Reordenar dentro do mesmo board. */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * ARRUMAR UM BOARD POR COR
   * ════════════════════════════════════════════════════════════════════════
   *
   * A ordem das fotos É a composição da página (ver `proposal-moodboard.ts`),
   * e uma página lê-se melhor quando as cores fazem uma transição em vez de
   * saltarem. Isto arruma-as por parecença — ver `ordemPorCor`, que encadeia
   * cada foto com a mais próxima da anterior.
   *
   * Não é destrutivo nem definitivo: entra no histórico como qualquer outra
   * alteração, e o Cmd+Z desfaz. Por isso não há caixa de confirmação.
   *
   * As fotos sem cor conhecida (as carregadas antes de a cor existir) ficam no
   * fim, pela ordem em que estavam — nunca se lhes inventa uma cor.
   */
  function arrumarPorCor(bi: number) {
    const board = doc.moodBoards[bi];
    if (!board) return;
    const ordem = ordemPorCor(board.images.map((p) => assetCores[p]));
    if (ordem.every((idx, i) => idx === i)) {
      toast("Esta página já está arrumada por cor.", "info");
      return;
    }
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        return {
          ...b,
          images: ordem.map((idx) => b.images[idx]),
          // A foto que manda na página continua a ser a MESMA fotografia, no
          // sítio novo. Sem isto, arrumar por cor promovia a destaque outra
          // foto qualquer — a que calhasse cair na posição marcada.
          principal: marcaDepoisDeMexer(b, (antigo) => {
            const novo = ordem.indexOf(antigo);
            return novo < 0 ? antigo : novo;
          }),
        };
      }),
    }));
    toast("Fotografias arrumadas por cor. Cmd+Z desfaz.", "success");
  }

  function reordenarFotos(bi: number, de: number, para: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) => {
        if (i !== bi) return b;
        const imagens = [...b.images];
        const [foto] = imagens.splice(de, 1);
        if (foto === undefined) return b;
        imagens.splice(para, 0, foto);
        return {
          ...b,
          images: imagens,
          principal: marcaDepoisDeMexer(b, (antigo) => {
            if (antigo === de) return para;
            // As que ficam entre o sítio de onde saiu e aquele para onde foi
            // deslizam uma posição — para que lado depende da direcção.
            if (de < antigo && antigo <= para) return antigo - 1;
            if (para <= antigo && antigo < de) return antigo + 1;
            return antigo;
          }),
        };
      }),
    }));
  }

  /**
   * Mover uma foto de um board para outro.
   *
   * `paraIndice = -1` quer dizer «no fim» — é o que chega de uma largada na
   * grelha em vez de sobre uma foto, que é o único caminho possível quando o
   * board de destino está vazio.
   */
  function moverFotoDeBoard(
    deBoard: number,
    deIndice: number,
    paraBoard: number,
    paraIndice: number,
  ) {
    setDoc((d) => {
      const origem = d.moodBoards[deBoard];
      const foto = origem?.images[deIndice];
      if (foto === undefined) return d;
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          if (i === deBoard) {
            return {
              ...b,
              images: b.images.filter((_, j) => j !== deIndice),
              principal: marcaDepoisDeMexer(b, (antigo) =>
                antigo === deIndice ? null : antigo > deIndice ? antigo - 1 : antigo,
              ),
            };
          }
          if (i === paraBoard) {
            const imagens = [...b.images];
            const onde = paraIndice < 0 ? imagens.length : Math.min(paraIndice, imagens.length);
            imagens.splice(onde, 0, foto);
            return {
              ...b,
              images: imagens,
              principal: marcaDepoisDeMexer(b, (antigo) => (antigo >= onde ? antigo + 1 : antigo)),
            };
          }
          return b;
        }),
      };
    });
  }

  /** Mover VÁRIAS de uma vez — a selecção múltipla, sem passar pela biblioteca. */
  function moverSeleccaoParaBoard(paraBoard: number) {
    const escolhidas = [...seleccionadas]
      .map((k) => {
        const [b, i] = k.split(":").map(Number);
        return { bi: b, ii: i };
      })
      .filter((s) => s.bi !== paraBoard);
    if (escolhidas.length === 0) {
      setSeleccionadas(new Set());
      return;
    }
    setLimpo({ doc, total: totalInput, segundos: 10, motivo: "Fotografias movidas." });
    setDoc((d) => {
      // Os caminhos são lidos ANTES de mexer em nada: mover uma foto muda os
      // índices das outras, e uma lista de índices lida a meio do caminho
      // apanharia as fotos erradas.
      const caminhos = escolhidas
        .map(({ bi, ii }) => ({ bi, ii, path: d.moodBoards[bi]?.images[ii] }))
        .filter((c): c is { bi: number; ii: number; path: string } => typeof c.path === "string");
      const aTirar = new Map<number, Set<number>>();
      for (const c of caminhos) {
        if (!aTirar.has(c.bi)) aTirar.set(c.bi, new Set());
        aTirar.get(c.bi)!.add(c.ii);
      }
      return {
        ...d,
        moodBoards: d.moodBoards.map((b, i) => {
          const tirar = aTirar.get(i);
          const semAsQueSaem = tirar
            ? {
                ...b,
                images: b.images.filter((_, j) => !tirar.has(j)),
                principal: marcaDepoisDeMexer(b, (antigo) =>
                  tirar.has(antigo) ? null : antigo - [...tirar].filter((j) => j < antigo).length,
                ),
              }
            : b;
          if (i !== paraBoard) return semAsQueSaem;
          return {
            ...semAsQueSaem,
            images: [...semAsQueSaem.images, ...caminhos.map((c) => c.path)],
          };
        }),
      };
    });
    setSeleccionadas(new Set());
    toast(
      escolhidas.length === 1
        ? "Fotografia movida. Podes anular durante 10 segundos."
        : `${escolhidas.length} fotografias movidas. Podes anular durante 10 segundos.`,
      "info",
    );
  }

  /**
   * Uma foto foi largada — dentro do board ou noutro.
   *
   * Um só sítio a decidir, e é aqui e não dentro do contexto de arrasto: o
   * `MoodBoardFotos.tsx` sabe de gestos e de identificadores, não sabe o que é
   * um documento de proposta.
   */
  function aoLargarFoto(largada: LargadaDeFoto) {
    if (largada.tipo === "reordenar") {
      reordenarFotos(largada.bi, largada.de, largada.para);
      return;
    }
    moverFotoDeBoard(largada.deBoard, largada.deIndice, largada.paraBoard, largada.paraIndice);
  }

  /** Um mood board largado noutra POSIÇÃO do ecrã — ver `moveBoard`. */
  function moverBoardParaPosicao(de: number, para: number) {
    setDoc((d) => {
      const arrumado = arrumadoEExplicito(d);
      const boards = [...arrumado.moodBoards];
      const [board] = boards.splice(de, 1);
      if (board === undefined) return d;
      boards.splice(para, 0, board);
      return { ...arrumado, moodBoards: boards };
    });
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * OS BOARDS FECHADOS — NESTA SESSÃO, E SÓ NESTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * A mesma regra das secções (ver `Section`), e pela mesma razão: um mood
   * board fechado é uma pilha de fotografias que não se vê, e reabrir a
   * proposta tem de mostrar a proposta.
   *
   * Isto ficava guardado no `localStorage` por proposta. Um «Fechar todos» de
   * há três semanas — feito uma vez para chegar depressa ao fundo da página —
   * continuava a esconder as páginas de inspiração hoje, sem nada no ecrã que
   * o explicasse. E foi a mesma memória que apareceu no relato dela como
   * «secções colapsadas».
   *
   * O gesto fica: fechar um board, ou fechá-los todos, continua a valer
   * enquanto ela lá está. Deixa é de atravessar visitas.
   *
   * A chave é o ID do board e não a posição: arrastar um board para outro
   * sítio trocaria as dobras todas de lugar.
   */
  const [dobrados, setDobrados] = useState<Record<string, boolean>>({});

  function escreverDobras(proximas: Record<string, boolean>) {
    setDobrados(proximas);
  }

  /**
   * O salto para o campo, DEPOIS de ele estar desenhado.
   *
   * O controlo leva a chave num `data-campo`; quando o campo não tem controlo
   * próprio no editor — as linhas do quadro do orçamento são semeadas a partir
   * do pedido — cai-se na SECÇÃO, que é onde a resposta está. Não fazer nada
   * seria a pior das três hipóteses.
   *
   * `focus` depois do `scrollIntoView` e com `preventScroll`: o foco sozinho
   * salta a página de golpe e sem margem nenhuma; assim o campo fica ao centro
   * e a escrita começa onde ela está a olhar.
   */
  useEffect(() => {
    if (!campoAVisitar) return;
    // A caixa inglesa leva o mesmo `data-campo` com `:en` colado — o salto
    // encontra-a com a maquinaria que já existe, sem uma segunda.
    const chave = chaveDoCampo(campoAVisitar.campo) + (campoAVisitar.versao === "en" ? ":en" : "");
    const alvo =
      document.querySelector<HTMLElement>(`[data-campo="${chave}"]`) ??
      document.getElementById(`seccao-${seccaoDoCampo(campoAVisitar.campo)}`);
    rolarAteVer(alvo, { block: "center" });
    if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
      alvo.focus({ preventScroll: true });
      alvo.select();
    }
  }, [campoAVisitar]);

  /** O salto da Conferência, depois de a secção estar aberta e desenhada. */
  useEffect(() => {
    if (!faltaAVisitar) return;
    const { seccao, campo } = faltaAVisitar;
    const cartao = seccao ? document.getElementById(`seccao-${seccao}`) : null;
    // `:scope > div >` e não um `querySelector` solto: dentro de uma secção há
    // outros botões com `aria-expanded` (os mood boards têm as suas dobras), e
    // o primeiro fechado que aparecesse era o que abria — que podia ser outro
    // qualquer, algures no meio do cartão.
    cartao
      ?.querySelector<HTMLButtonElement>(':scope > div > button[aria-expanded="false"]')
      ?.click();
    // Num tique a seguir: o campo só está VISÍVEL depois de o clique acima ter
    // sido processado, e focar um elemento escondido não faz nada.
    const espera = setTimeout(() => {
      const alvo =
        (campo && document.querySelector<HTMLElement>(`[data-campo="${campo}"]`)) || cartao;
      rolarAteVer(alvo, { block: "center" });
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) {
        alvo.focus({ preventScroll: true });
        alvo.select();
      }
    }, 0);
    return () => clearTimeout(espera);
  }, [faltaAVisitar]);

  function alternarDobra(id: string) {
    escreverDobras({ ...dobrados, [id]: !dobrados[id] });
  }

  function dobrarTodos(fechar: boolean) {
    const proximas: Record<string, boolean> = {};
    for (const b of doc.moodBoards) if (b.id) proximas[b.id] = fechar;
    escreverDobras(proximas);
  }

  /**
   * ── IR AO CAMPO ONDE A PALAVRA ESTÁ ─────────────────────────────────────
   *
   * Do aviso de ortografia (que vive no passo do envio) até ao controlo (que
   * vive no do conteúdo, e pode estar dentro de um mood board fechado).
   *
   * Três coisas antes do salto, e só a última é o salto: voltar ao conteúdo,
   * abrir a dobra do board se for um campo de board — saltar para dentro de uma
   * dobra fechada deixava-a a olhar para um cartão que «não abriu» —, e só
   * então marcar o alvo, para o efeito o encontrar depois de desenhado.
   */
  /**
   * A caixa inglesa de um campo — ou nada, com o interruptor desligado.
   *
   * Um só sítio a desenhá-las: são catorze famílias de campo espalhadas por
   * duas secções e dois ficheiros, e catorze cópias desta caixa eram catorze
   * sítios onde o `data-campo`, o `aria-label` ou a marca de «por traduzir`
   * podiam divergir. Ver `CaixaInglesa.tsx`.
   */
  function caixaDeIngles(
    campo: CampoDeTexto,
    rotulo: string,
    opts: {
      className?: string;
      as?: "input" | "textarea";
      rows?: number;
      /** A caixa cresce com o texto, a partir de uma linha — ver `CaixaInglesa`. */
      cresce?: boolean;
      readOnly?: boolean;
      placeholder?: string;
      /**
       * Este par NÃO fica lado a lado.
       *
       * A marca é ao contrário — todas ficam, e diz-se quais não — porque o
       * desenho normal passa a ser o par numa linha só, e uma excepção que se
       * esquece de se declarar é uma caixa empilhada no meio de doze ao lado,
       * que se vê. Uma que se esquecesse ao contrário era uma caixa ao lado de
       * uma coisa que não é o seu par, que também se vê.
       */
      empilhada?: boolean;
    } = {},
  ) {
    if (!bilingue) return null;
    const en = lerEn(doc as ProposalDoc, campo) ?? "";
    /**
     * Vazia, para trás, ou em dia — e as três leem-se diferentes.
     *
     * Era `pt !== "" && en === ""`, que só sabia responder «vazia». Um inglês
     * escrito contra um português que entretanto mudou passava por bom, e é
     * esse o defeito que ela apanhou: «Reunião Inicial» com «Ceremony Decor».
     */
    const estado = estadoDoIngles(doc as ProposalDoc, campo);
    // `empilhada` é desta função e não da caixa: separa-se antes de passar o
    // resto, para não escorregar para o DOM como um atributo inventado.
    const { empilhada, ...daCaixa } = opts;
    return (
      <CaixaInglesa
        campo={campo}
        rotulo={rotulo}
        valor={en}
        onChange={(texto) => setDoc((d) => escreverEn(d, campo, texto))}
        porTraduzir={estado === "por-traduzir"}
        desactualizada={estado === "desactualizado"}
        aoConfirmar={() => setDoc((d) => confirmarTraducao(d, campo))}
        aoLado={!empilhada}
        {...daCaixa}
      />
    );
  }

  /**
   * Manda traduzir tudo o que ainda não tem versão inglesa.
   *
   * O documento só muda se a resposta vier ALINHADA — a trava vive na fronteira
   * (`traduzirParaIngles`), e a razão está lá escrita: uma resposta a que
   * faltem textos punha a tradução de um campo noutro campo, em silêncio.
   * Falhando, o que se vê é uma frase a dizê-lo e o documento como estava.
   *
   * ── E O QUE ELA FIZER ENQUANTO A TRADUÇÃO VEM A CAMINHO ──────────────────
   *
   * Fica. O relato que trouxe isto, à letra: «quando alterou para inglês, deu,
   * mas já estava a alterar fotos». A tradução DEU — e as fotos que ela mexeu
   * nos segundos da ida à rede desapareceram, porque o que voltava era o
   * documento de há dez segundos, posto de volta inteiro. A gravação automática
   * gravava a versão amputada logo a seguir, no `localStorage` e no servidor:
   * trabalho perdido nos dois sítios, sem uma palavra.
   *
   * Por isso o que se aplica NÃO é o documento traduzido: são as traduções, uma
   * a uma, escritas no documento como ele estiver neste instante — e só nos
   * campos cujo português ainda é o que foi mandado traduzir (ver
   * `aplicarTraducao`). É a mesma disciplina da cópia de fotos de um modelo
   * parcial, aqui ao lado.
   */
  async function traduzirTudo() {
    if (!traducaoLigada || aTraduzir) return;
    setATraduzir(true);
    try {
      const r = await traduzirParaIngles(doc as ProposalDoc, motorPelaRota());
      if (r.porqueFalhou) {
        toast(`Não deu para traduzir: ${r.porqueFalhou}. O documento ficou como estava.`, "error");
        return;
      }
      // «Não havia nada por traduzir» só é verdade quando não se pediu nada ao
      // serviço. Pedir e não receber é outra coisa — e dizer-lhe que não havia
      // nada a fazer sobre uma proposta que ficou inteira em português é a
      // mentira mais cara que este botão pode contar.
      if (r.escritos === 0 && r.naoVieram === 0) {
        toast("Não havia nada por traduzir.", "info");
        return;
      }
      // O documento de AGORA, e não o que foi mandado traduzir. A contagem sai
      // daqui; a escrita passa pela forma funcional, que é a que o React
      // garante actualizada mesmo que este `ref` esteja um instante atrás.
      const antes = docRef.current;
      const aplicado = aplicarTraducao(antes, r.escritas);
      setDoc((d) => (d === antes ? aplicado.doc : aplicarTraducao(d, r.escritas).doc));
      if (aplicado.escritos > 0) {
        toast(
          aplicado.escritos === 1
            ? "1 campo traduzido. Vale a pena passar os olhos."
            : `${aplicado.escritos} campos traduzidos. Vale a pena passar os olhos.`,
          "success",
        );
      }
      /**
       * ── O QUE FOI PEDIDO AO SERVIÇO E NÃO VOLTOU ─────────────────────────
       *
       * O motor manda os textos em lotes de 50 e um lote que falhe volta VAZIO
       * nas suas posições, de propósito: os que já vieram não se deitam fora
       * nem se pagam duas vezes. Só atira quando NENHUM lote passa.
       *
       * Sem esta frase, uma proposta grande com um 429 (ou uma quota que acaba
       * no segundo lote) mostrava «50 campos traduzidos», a verde, e deixava 70
       * em português sem uma palavra. Do lado dela isso é «não está a dar» —
       * dá numa proposta pequena e não dá numa grande, e o número que aparece
       * está certo.
       *
       * Diz-se também que vale a pena insistir, porque vale: o que já veio está
       * escrito, e a carregada seguinte só manda o que falta.
       */
      if (r.naoVieram > 0) {
        toast(
          r.naoVieram === 1
            ? "1 campo não voltou do serviço de tradução e ficou em português. Carrega outra vez — o que já veio fica como está."
            : `${r.naoVieram} campos não voltaram do serviço de tradução e ficaram em português. Carrega outra vez — o que já veio fica como está.`,
          "error",
        );
      }
      // Os campos que mudaram debaixo da tradução ficam por traduzir, e é isso
      // que eles são. Dizê-lo aqui evita a única leitura errada possível — «eu
      // traduzi isto» sobre um campo que ficou em português.
      if (aplicado.ignorados.length > 0) {
        toast(
          aplicado.ignorados.length === 1
            ? "1 campo mudou enquanto a tradução vinha e ficou por traduzir."
            : `${aplicado.ignorados.length} campos mudaram enquanto a tradução vinha e ficaram por traduzir.`,
          "info",
        );
      }
    } finally {
      setATraduzir(false);
    }
  }

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

  /**
   * Duplicar um board inteiro — fotos, textos, disposição.
   *
   * As fotos são CAMINHOS, e o mesmo caminho pode estar em dois boards sem
   * custo nenhum: não há bytes a copiar e o gerador resolve cada um por si. É
   * o que torna «esta página outra vez, com duas fotos trocadas» num gesto.
   *
   * O id NÃO é copiado (`id: undefined`): dois boards com a mesma identidade
   * partilhariam a dobra e a chave de React. É preenchido a partir da posição
   * na gravação seguinte.
   */
  function duplicarBoard(bi: number) {
    setDoc((d) => {
      const original = d.moodBoards[bi];
      if (!original) return d;
      const copia = {
        ...original,
        id: undefined,
        title: original.title?.trim() ? `${original.title} (cópia)` : "",
        images: [...original.images],
      };
      const boards = [...d.moodBoards];
      boards.splice(bi + 1, 0, copia);
      return { ...d, moodBoards: boards };
    });
    // QUAL DELES, E ONDE FICOU A CÓPIA. «Mood board duplicado.» não dizia
    // nenhuma das duas coisas, e numa secção de oito páginas são as duas que
    // interessam: o botão é um ícone de 28 px repetido em cada cartão, e a
    // cópia sai pela ordem dos capítulos como tudo o resto — num cartão alto
    // (uma grelha de seis fotos mais os campos), ela nasce abaixo da dobra.
    const original = doc.moodBoards[bi];
    if (!original) return;
    const nome = (original.title ?? "").trim() || `Inspiração ${bi + 1}`;
    const copiado = { ...original, title: nome ? `${nome} (cópia)` : "" };
    const depois = {
      ...doc,
      moodBoards: [...doc.moodBoards.slice(0, bi + 1), copiado, ...doc.moodBoards.slice(bi + 1)],
    } as ProposalDoc;
    const saem = temasComPagina(depois);
    const pos = saem.indexOf(bi + 1);
    toast(
      pos >= 0
        ? `«${nome}» duplicado — a cópia é a ${pos + 1}.ª das ${saem.length} páginas de inspiração do PDF.`
        : `«${nome}» duplicado — a cópia ficou logo a seguir. Sem fotografias nem texto, não sai no PDF.`,
      "info",
    );
  }

  /** Fechar (ou reabrir) um board a alterações — ver `MoodBoard.bloqueado`. */
  function alternarBloqueio(bi: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        i === bi ? { ...b, bloqueado: b.bloqueado ? undefined : true } : b,
      ),
    }));
  }

  /** Escolher (ou desescolher) uma foto para o conjunto que se move de uma vez. */
  function alternarSeleccao(bi: number, ii: number) {
    setSeleccionadas((antes) => {
      const proxima = new Set(antes);
      const chave = `${bi}:${ii}`;
      if (proxima.has(chave)) proxima.delete(chave);
      else proxima.add(chave);
      return proxima;
    });
  }

  /** A foto que manda na página — ver `proposal-moodboard.ts`. */
  function marcarPrincipal(bi: number, ii: number) {
    setDoc((d) => ({
      ...d,
      moodBoards: d.moodBoards.map((b, i) =>
        // Voltar a carregar na que já é principal DESMARCA: sem isso, marcar
        // seria uma porta de sentido único e a única saída era marcar a
        // primeira à mão.
        i === bi ? { ...b, principal: b.principal === ii ? undefined : ii } : b,
      ),
    }));
  }

  // ── A fotografia da capa ──
  // Escreve-se NA POSIÇÃO e não se compacta a lista: as propostas antigas têm
  // duas, e a segunda fica guardada como estava (o PDF novo usa uma só).
  function setCoverAt(idx: number, path: string) {
    setDoc((d) => {
      const cover = normaliseCoverImages(d.coverImages);
      cover[idx] = path;
      // «Usar esta na mesma» é sobre a fotografia que lá estava. Uma nova volta
      // à regra até ela a ver e decidir — ver `capaMesmoAssim`.
      return { ...d, coverImages: cover, capaMesmoAssim: undefined, focoDaCapa: undefined };
    });
  }
  function removeCoverAt(idx: number) {
    setCoverAt(idx, "");
  }

  // ── Cronograma (organizacao) ──
  function addPhase() {
    setDoc((d) => ({ ...d, cronograma: [...(d.cronograma ?? []), { title: "", items: [] }] }));
  }
  function updatePhase(pi: number, p: Partial<{ title: string; items: string[] }>) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) => (i === pi ? { ...ph, ...p } : ph)),
    }));
  }
  /**
   * Remover uma fase — COM PERGUNTA, pela mesma razão da página de inspiração.
   *
   * Uma fase não é uma linha: é um título e a lista de tarefas que lhe está
   * dentro, e o «×» que a apaga fica ao lado dos «×» das tarefas, dois
   * centímetros acima e do mesmo tamanho. Carregar no de cima em vez do de
   * baixo levava seis tarefas escritas à mão sem dizer nada a ninguém.
   *
   * Rara (um cronograma tem três ou quatro fases, escritas uma vez) e cara
   * (voltar a escrever a lista toda) — portanto pergunta. E a pergunta conta as
   * tarefas, que é exactamente o que o cartão não mostra quando a fase está
   * cheia e o ecrã cortado.
   *
   * A fase que ainda não tem nome nem tarefas sai sem perguntar: uma fase
   * acabada de acrescentar por engano não é trabalho a proteger.
   */
  function removePhase(pi: number) {
    const ph = (doc.cronograma ?? [])[pi];
    const apagar = () =>
      setDoc((d) => ({ ...d, cronograma: (d.cronograma ?? []).filter((_, i) => i !== pi) }));
    if (!ph) return;
    const nome = (ph.title ?? "").trim();
    const escritas = (ph.items ?? []).filter((it) => (it ?? "").trim() !== "");
    if (nome === "" && escritas.length === 0) {
      apagar();
      return;
    }
    // A MESMA regra do gerador: uma fase sem tarefas não imprime nada, e um
    // cronograma sem nenhuma fase com tarefas não tem página nenhuma no PDF
    // (o PDF salta-a — ver o cronograma em `pdf-editorial/plano.ts`). Se esta é a última que
    // ainda tem tarefas, o documento perde uma folha inteira — e isso é a
    // consequência que decide a resposta.
    const comTarefas = (doc.cronograma ?? []).filter((f) =>
      (f.items ?? []).some((it) => (it ?? "").trim() !== ""),
    ).length;
    const ultima = escritas.length > 0 && comTarefas === 1;
    const conta =
      escritas.length > 0
        ? `Leva com ela ${escritas.length} ${escritas.length === 1 ? "tarefa" : "tarefas"}` +
          (ultima ? ", e o cronograma deixa de ter página no PDF." : " do cronograma.")
        : "Ainda não tem tarefas nenhumas — leva o título, e mais nada.";
    setARemover({
      chave: `fase:${pi}`,
      pergunta: `Remover a fase «${nome || `fase ${pi + 1}`}»? ${conta}`,
      docNoMomento: doc,
      aplicar: apagar,
    });
  }
  function movePhase(pi: number, dir: -1 | 1) {
    setDoc((d) => ({ ...d, cronograma: move(d.cronograma ?? [], pi, dir) }));
  }
  function addPhaseItem(pi: number) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: [...ph.items, ""] } : ph,
      ),
    }));
  }
  function updatePhaseItem(pi: number, ii: number, value: string) {
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph, i) =>
        i === pi ? { ...ph, items: ph.items.map((it, j) => (j === ii ? value : it)) } : ph,
      ),
    }));
  }
  /**
   * Remover uma tarefa — ANULAR, e não pergunta.
   *
   * É o gesto frequente desta secção: escreve-se a lista de uma fase às
   * apalpadelas, acrescentam-se cinco tarefas e tiram-se duas. Refazer uma é
   * escrever outra vez meia dúzia de palavras. Uma caixa por cada «×» seria
   * cinco caixas para compor uma fase — e uma caixa respondida cinco vezes
   * seguidas deixa de ser lida, o que é o oposto do que ela existe para fazer.
   *
   * Vai pela anulação dos dez segundos que já serve o «Limpar» e o «×» das
   * fotografias (`setLimpo`): guarda o documento inteiro antes de mexer, e a
   * barra diz QUAL tarefa saiu e com quantas a fase fica.
   *
   * A tarefa em branco sai calada — não há nada para trazer de volta.
   */
  function removePhaseItem(pi: number, ii: number) {
    const ph = (doc.cronograma ?? [])[pi];
    const tarefa = (ph?.items ?? [])[ii] ?? "";
    if (tarefa.trim() !== "") {
      const ficam = (ph?.items ?? []).filter((_, j) => j !== ii).length;
      const fase = (ph?.title ?? "").trim();
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Tarefa «${tarefa.trim()}» removida` +
          (fase ? ` de «${fase}»` : "") +
          ` — a fase fica com ${ficam}.`,
      });
    }
    setDoc((d) => ({
      ...d,
      cronograma: (d.cronograma ?? []).map((ph2, i) =>
        i === pi ? { ...ph2, items: ph2.items.filter((_, j) => j !== ii) } : ph2,
      ),
    }));
  }

  // ── Budget: decoracao (grouped) ──
  // Tudo passa pelos ajudantes de `proposal-budget`: os nomes e os preços são
  // dois arrays paralelos, e mexer num sem mexer no outro faz os preços
  // deslizarem uma posição — o preço da cerimónia acabaria no ramo da noiva,
  // sem nada a assinalar.
  function addBudgetItem() {
    setDoc((d) => adicionarLinha(d));
  }
  function updateBudgetItem(i: number, value: string) {
    setDoc((d) => definirItem(d, i, value));
  }
  /**
   * Remover uma linha do orçamento — ANULAR, e não pergunta.
   *
   * É o gesto mais repetido do estúdio: um orçamento de decoração compõe-se
   * linha a linha com o cliente ao telefone, e tira-se e põe-se enquanto se
   * fala. Perguntar em cada «×» é atrito diário, e o preço desse atrito
   * paga-se todo no mesmo sítio: uma caixa que se despacha vinte vezes numa
   * tarde é uma caixa que não protege nada na vigésima primeira.
   *
   * ── E PORQUE É QUE A LINHA ADICIONAL LEVA PERGUNTA E ESTA NÃO ────────────
   * Parecem irmãs e não são. Apagar um VALOR ADICIONAL muda o preço final do
   * pedido — e portanto o sinal e a factura que saem a seguir —, e por isso
   * passa pela pergunta do dinheiro com os dois números à vista (ver
   * `removeBudgetExtra`). Esta não: o total desta proposta é um campo escrito à
   * parte, e tirar uma linha daqui mexe na soma das linhas, que o ecrã já
   * mostra e assinala quando as duas divergem. É trabalho de escrita, não
   * dinheiro cobrado.
   *
   * A barra diz o nome da linha e o que ela valia — sem isso, «linha removida»
   * numa lista de catorze não diz qual.
   */
  function removeBudgetItem(i: number) {
    const linha = linhasDe(doc)[i];
    const nome = (linha?.item ?? "").trim();
    const preco = precosDe(doc)[i];
    if (nome !== "" || (typeof preco === "number" && preco > 0)) {
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Linha «${nome || `sem nome (${i + 1})`}» removida do orçamento` +
          (typeof preco === "number" && preco > 0 ? ` — valia ${eur(preco)}.` : "."),
      });
    }
    setDoc((d) => removerLinha(d, i));
  }
  function updateBudgetPrice(i: number, texto: string) {
    setDoc((d) => definirPreco(d, i, normalizarValor(texto)));
  }
  /**
   * Marca (ou desmarca) uma linha como EXTRA.
   *
   * É isto que faz a mesma proposta ter uma versão base e uma versão com
   * extras: o casal pede "uma coisa mais simples e outra com tudo", e a
   * alternativa era duas propostas — dois documentos a divergir, e ao fim de
   * duas semanas ninguém saber qual é a que vale.
   */
  function updateBudgetExtraFlag(i: number, extra: boolean) {
    setDoc((d) => marcarExtra(d as ProposalDoc, i, extra) as StudioDoc);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * MEXER NUM VALOR ADICIONAL MEXE NO TOTAL
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «colocámos a deslocação da equipa Líquen, que são mil
   * quinhentos e cinquenta euros, e depois no total, naquela aba onde diz total
   * IVA e validade, isto não soma. Eu quero que o back office tenha
   * inteligência suficiente para ver os valores que nós colocamos em cada aba e
   * faça a soma com o valor total.»
   *
   * O problema era maior do que o ecrã. Este total é também o PREÇO FINAL do
   * pedido, e é dele que saem a factura, o sinal de 30% e o saldo: uma
   * deslocação de 1.550 € escrita aqui aparecia na proposta que o cliente lê e
   * não entrava em nada do que se cobra. O sinal era pedido a menos e a factura
   * era emitida a menos.
   *
   * ── PORQUE É QUE SE SOMA A DIFERENÇA, E NÃO O TOTAL DOS EXTRAS ───────────
   *
   * Aplica-se ao total o que MUDOU (o depois menos o antes), e nunca o valor
   * inteiro. É isso que torna a conta imune a ser feita duas vezes: escrever
   * «1550» são quatro teclas, e quatro somas do valor inteiro dariam um total
   * absurdo. Assim, cada tecla soma o que acrescentou e o resultado final é
   * exactamente a diferença entre o que lá estava e o que ficou.
   *
   * Também é o que respeita um total escrito à mão: quem apagar um extra vê o
   * total descer o mesmo que ele subiu, e mais nada é tocado.
   */
  function definirExtras(novos: { label: string; valueText: string }[]) {
    /**
     * ── O IVA QUE A LINHA DECLARA CONTA ─────────────────────────────────────
     *
     * Este campo é a base (o rótulo diz «Preço final (sem IVA)»), por isso o que
     * se lhe soma tem de ser base. A soma pegava no número e somava-o tal e
     * qual: «895,00 € + IVA» e «895,00 €» acabavam exactamente no mesmo sítio.
     *
     * Só a primeira estava certa. Numa proposta que se lê COM IVA, a segunda
     * promete ao casal que aquela linha custa 895 — e fazia o total subir 895 de
     * BASE, que são 1.101 do que eles vão pagar. A linha e o total a dizerem
     * números diferentes sobre a mesma coisa, no mesmo documento.
     *
     * `somaDosExtrasSemIva` lê o que cada linha declara e, quando ela não
     * declara nada, segue o modo do documento — que é a leitura que o casal faz,
     * porque é a que está impressa ao lado do total.
     */
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const delta =
      Math.round(
        (somaDosExtrasSemIva(novos, contexto) -
          somaDosExtrasSemIva(doc.budgetExtras ?? [], contexto)) *
          100,
      ) / 100;
    setDoc((d) => ({ ...d, budgetExtras: novos }));
    /**
     * Quando os adicionais SOMAM ao valor escrito, o campo do total é só dos
     * serviços e não se mexe: acrescentar uma deslocação de 140 deixa os 3.000
     * onde estão e faz o total subir para 3.140. Enquanto isto não existia, o
     * campo era empurrado para cima e os serviços encolhiam por baixo — que é
     * exactamente o quadro que ela viu e que não queria.
     */
    if (doc.budgetExtrasSomam) {
      /**
       * O campo não mexe, mas o PEDIDO tem de mexer.
       *
       * O «Preço final (sem IVA)» do pedido é de onde a Visão Geral, as
       * Estatísticas e o dossier leem o dinheiro dos pedidos que ainda não têm
       * proposta enviada. Se ele ficasse com os serviços apenas, uma deslocação
       * de 140 € deixava de aparecer nesses ecrãs — e o pior de tudo é que
       * desaparecia em silêncio, num número que já ninguém confere.
       *
       * A soma é feita com os adicionais NOVOS, e não com os que estão no
       * documento: o `setDoc` acima é assíncrono, e ler `doc` aqui daria o
       * estado anterior. É a mesma armadilha que o `delta` já evita.
       */
      const escrito = parseMoneyText(totalInput);
      const efectivo = Math.round((escrito + somaDosExtrasSemIva(novos, contexto)) * 100) / 100;
      persistirPreco(efectivo > 0 ? efectivo : undefined, { jaEfectivo: true });
      return;
    }
    if (delta === 0) return;
    // Um total não pode ficar negativo por causa de um extra apagado.
    const base = Math.max(0, Math.round((parseMoneyText(totalInput) + delta) * 100) / 100);
    setTotalInput(base > 0 ? textoDoTotal(base) : "");
    writeTotal(base > 0 ? amountParaBase(base, vatMode) : undefined, vatMode);
    persistirPreco(base > 0 ? base : undefined);
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * TROCAR «COMO CONTAM OS ADICIONAIS» É MEXER NO DINHEIRO
   * ════════════════════════════════════════════════════════════════════════
   *
   * O selector decide se a deslocação está DENTRO do valor escrito ou se lhe
   * SOMA — ou seja, decide se o casal paga 3.000 ou 3.140. A frase debaixo
   * dele diz isso mesmo, com os dois números.
   *
   * E era um `setDoc` a seco: mudava o total no ecrã e não gravava nada no
   * pedido. A partir daí o estúdio dizia um número e o «Preço final» dizia
   * outro, em silêncio — até à abertura seguinte, em que quem manda no valor é
   * o pedido e o total saltava sozinho o valor inteiro dos adicionais. É «o
   * valor está diferente do que enviámos», pela porta do lado.
   *
   * A conta é a do `definirExtras`, e de propósito a mesma: o campo do escrito
   * NÃO mexe (é sempre só os serviços); o que muda é o efectivo, e é o
   * efectivo que o pedido guarda.
   */
  function trocarModoDosAdicionais(somam: boolean) {
    setDoc((d) => ({ ...d, budgetExtrasSomam: somam }));
    const escrito = parseMoneyText(totalInput);
    // Os adicionais do documento que está no ecrã — o `setDoc` acima é
    // assíncrono e só mexe na REGRA, não nas linhas.
    const adicionais = somaDosExtrasSemIva(doc.budgetExtras ?? [], {
      mode: vatMode,
      vatRate: doc.vatRate,
    });
    const efectivo = round2(somam ? escrito + adicionais : escrito);
    persistirPreco(efectivo > 0 ? efectivo : undefined, { jaEfectivo: true });
  }

  // ── Budget extras: linhas adicionais (Deslocação, Coordenação, Tecidos…) ──
  /**
   * ── A TABELA ABRE COM UMA LINHA PRONTA ─────────────────────────────────
   *
   * Palavras dela, com a captura dos cabeçalhos sem nada por baixo: «eu quero
   * que isto aqui esteja aberto por definição». Sem adicionais, a secção
   * mostrava «Descrição · Valor · IVA» e um «+ Adicionar» — um clique a mais
   * para começar a escrever.
   *
   * A linha vazia é SÓ do ecrã: não entra na proposta até se escrever nela
   * (`updateBudgetExtra` cria-a nesse momento), e mesmo que entrasse vazia o
   * PDF já salta as linhas sem descrição nem valor (`proposal-doc-pdf`).
   */
  const extrasAVista: { label: string; valueText: string }[] =
    (doc.budgetExtras ?? []).length > 0 ? (doc.budgetExtras ?? []) : [{ label: "", valueText: "" }];
  const soLinhaPorEscrever = (doc.budgetExtras ?? []).length === 0;

  function addBudgetExtra() {
    // Uma linha nova nasce vazia: não há valor nenhum para somar ainda.
    definirExtras([...(doc.budgetExtras ?? []), { label: "", valueText: "" }]);
  }
  function updateBudgetExtra(i: number, p: Partial<{ label: string; valueText: string }>) {
    const extras = doc.budgetExtras ?? [];
    // A linha que se mostra aberta sem existir (ver `extrasAVista`): a primeira
    // coisa escrita nela é o que a cria.
    if (extras.length === 0 && i === 0) {
      definirExtras([{ label: "", valueText: "", ...p }]);
      return;
    }
    definirExtras(extras.map((r, j) => (j === i ? { ...r, ...p } : r)));
  }
  /**
   * O valor escrito no campo numérico, já normalizado e com o IVA da linha.
   *
   * «1.500», «1500» e «1 500 €» dão os três 1500 — é o que a missão pede e é o
   * que `normalizarValor` já sabia fazer para os preços das linhas. O que se
   * GRAVA continua a ser texto, porque é ele que o PDF imprime; ver
   * `textoDoAdicional`.
   */
  function definirValorDoAdicional(i: number, escrito: string) {
    const linha = extrasAVista[i];
    if (!linha) return;
    const modo = modoDoAdicional(linha.valueText ?? "", doc.vatRate ?? DEFAULT_VAT_RATE);
    updateBudgetExtra(i, { valueText: textoDoAdicional(escrito, modo) });
  }
  /** Troca o IVA que a linha declara, mantendo o número que lá está. */
  function definirIvaDoAdicional(i: number, modo: ModoDeIvaDoAdicional) {
    const linha = extrasAVista[i];
    if (!linha) return;
    updateBudgetExtra(i, { valueText: textoDoAdicional(linha.valueText ?? "", modo) });
  }
  /**
   * Apagar um valor adicional TIRA-O do total — e portanto do sinal e da
   * fatura. Uma deslocação de 1.550 € desaparecia do preço final com um clique
   * num «×» de doze pixéis, sem pergunta e sem volta atrás; é exactamente o
   * mesmo estrago do «Usar X €» e leva o mesmo tratamento.
   *
   * Uma linha sem valor legível (a que se acabou de acrescentar, ou uma que
   * diga «a definir») sai sem perguntar: não mexe em dinheiro nenhum, e
   * perguntar aí seria ensinar a responder que sim sem ler.
   */
  function removeBudgetExtra(i: number) {
    const linha = (doc.budgetExtras ?? [])[i];
    const contexto = { mode: vatMode, vatRate: doc.vatRate };
    const vale = linha ? somaDosExtrasSemIva([linha], contexto) : 0;
    const apagar = () => definirExtras((doc.budgetExtras ?? []).filter((_, j) => j !== i));
    if (!linha || vale === 0) {
      apagar();
      return;
    }
    const base = parseMoneyText(totalInput);
    const nome = linha.label?.trim() || "esta linha";
    pedirConfirmacaoDeDinheiro({
      oQue: "o total",
      de: base,
      para: Math.max(0, Math.round((base - vale) * 100) / 100),
      registo: `«${nome}» removida dos valores adicionais no estúdio: preço final de ${eur(base)} para ${eur(Math.max(0, base - vale))}.`,
      motivo: `«${nome}» removida dos valores adicionais.`,
      aplicar: apagar,
    });
  }

  // ── Budget: organizacao (per-item rows) ──
  function addBudgetRow() {
    setDoc((d) => ({ ...d, budgetRows: [...(d.budgetRows ?? []), { item: "", price: "" }] }));
  }
  function updateBudgetRow(i: number, p: Partial<{ item: string; price: string }>) {
    setDoc((d) => ({
      ...d,
      budgetRows: (d.budgetRows ?? []).map((r, j) => (j === i ? { ...r, ...p } : r)),
    }));
  }
  /**
   * Remover uma linha do orçamento de organização — ANULAR, pela mesma razão
   * escrita em `removeBudgetItem`: é frequente, é barato de refazer, e uma
   * pergunta por linha é um editor que ninguém usa.
   *
   * Aqui o valor é TEXTO («1.500,00 €», às vezes «a combinar»), por isso a
   * barra diz o que lá estava escrito, à letra, em vez de o tentar somar.
   */
  function removeBudgetRow(i: number) {
    const linha = (doc.budgetRows ?? [])[i];
    const nome = (linha?.item ?? "").trim();
    const valor = (linha?.price ?? "").trim();
    if (nome !== "" || valor !== "") {
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo:
          `Linha «${nome || `sem nome (${i + 1})`}» removida do orçamento` +
          (valor ? ` — valia ${valor}.` : "."),
      });
    }
    setDoc((d) => ({ ...d, budgetRows: (d.budgetRows ?? []).filter((_, j) => j !== i) }));
  }

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
    if (res.headers.get("X-Pdf-Da-Memoria") !== "1") {
      apontarGeracao(totalDeFotos, Date.now() - comecou, blob.size);
    }
    return {
      blob,
      chave: rascunho ? null : res.headers.get("X-Chave-Do-Pdf"),
      emFalta: Number(res.headers.get("X-Fotos-Em-Falta") ?? "0"),
      cortes: res.headers.get("X-Conteudo-Cortado"),
    };
  }

  // A preparação em segundo plano corre num efeito, e o efeito quer sempre o
  // `pedirOPdf` deste render (o idioma e o pedido de agora).
  const pedirOPdfAgora = useRef(pedirOPdf);
  useEffect(() => {
    pedirOPdfAgora.current = pedirOPdf;
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
        !rascunho && pdfPreparado.current?.retrato === retrato
          ? await pdfPreparado.current.promessa.catch(() => null)
          : null;
      const pdf = jaPedido ?? (await pedirOPdf(desenhado, rascunho));
      if (!rascunho) pdfPreparado.current = { retrato, promessa: Promise.resolve(pdf) };
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
      if (noEcra) setPdfNoEcra({ blob, nome: nomeFinal, rascunho });
      else guardarNoDisco(blob, nomeFinal);
      setPdfSaiu(true);
      // O gerador SALTA a foto que não consegue ir buscar E CORTA o que não
      // cabe no desenho, por isso um PDF incompleto sai na mesma, com ar de
      // estar bem. Sem este aviso, a primeira pessoa a dar pela falta era o
      // cliente. O servidor conta as duas coisas e devolve-as nos cabeçalhos.
      // Só o PDF FINAL conta como visto — o rascunho é o que ainda não pode
      // seguir. Um PDF novo pede uma confirmação nova.
      const chave = rascunho ? null : pdf.chave;
      if (chave) setPdfVisto({ chave, retrato, confirmado: false });
      const emFalta = pdf.emFalta;
      const cortes = cortesDoCabecalho(pdf.cortes);
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
      } else {
        toast(
          noEcra
            ? rascunho
              ? "Rascunho aberto (marcado como rascunho)"
              : "PDF final aberto — percorre as páginas"
            : rascunho
              ? "Rascunho gerado (PDF descarregado, marcado como rascunho)"
              : "Pré-visualização gerada (PDF descarregado)",
          "success",
        );
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro na pré-visualização.", "error");
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
      const doEnvio = enviada.current;
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
  async function send(cortesConfirmados = false) {
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
    try {
      const comecou = Date.now();
      const res = await fetch(`/api/orcamento/${quote.id}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          ...(cortesConfirmados ? { cortesConfirmados: true } : {}),
          /* Só viaja quando é «não», pela mesma razão do `cortesConfirmados`
             aqui em cima — e porque a rota trata a AUSÊNCIA como «sim», para
             nenhum envio antigo deixar de sair por causa de um campo novo. */
          ...(canal === "whatsapp" ? { porEmail: false } : {}),
          // A chave do PDF final que foi visto e confirmado — o servidor
          // recusa o envio sem ela (ver `chaveDoQueChegou` na rota).
          ...(pdfVisto?.confirmado ? { pdfVisto: pdfVisto.chave } : {}),
        }),
      });
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
      if (res.status === 409 && data?.precisaConfirmarCortes) {
        setCortesPorConfirmar(normalizaCortes(data.truncations));
        return;
      }
      if (!res.ok) throw new Error(data?.error || porqueFalhouOEnvio(res.status));
      setCortesPorConfirmar(null);
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
      toast(e instanceof Error ? e.message : "Erro ao enviar a proposta.", "error");
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

  // Sugestões e a validade por omissão. Uma leitura só, ao abrir; se falhar,
  // o estúdio funciona como antes — nenhuma destas coisas é indispensável.
  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch("/api/propostas?resumo=1").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/propostas/preferencias").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([lista, prefs]) => {
        if (!vivo) return;
        const unicos = (vals: unknown[]) =>
          [...new Set(vals.map((v) => String(v ?? "").trim()).filter(Boolean))].sort();
        if (Array.isArray(lista)) {
          setSugestoes({
            locais: unicos(lista.map((p: { location?: string }) => p.location)),
          });
        }
        // A validade só se aplica a um documento que ainda NÃO tem uma: mexer
        // numa proposta já escrita porque a política mudou seria alterar-lhe
        // as condições nas costas de quem a escreveu.
        const dias = Number(prefs?.validUntilDays);
        // A omissão NÃO se escreve: sem dias escritos, a validade sai da regra
        // do evento (`diasDeValidadePeloEvento`), que dá os mesmos 60 quando o
        // evento está longe. Escrevê-la chegava depois de o estúdio abrir e
        // mudava o documento sozinho — e um PDF acabado de ver deixava de ser
        // «o que se viu» (medido no browser, com «Ver o PDF primeiro»).
        if (Number.isFinite(dias) && dias > 0 && dias !== DEFAULT_VALID_DAYS) {
          setDoc((d) => (d.validUntilDays ? d : { ...d, validUntilDays: dias }));
        }
      })
      .catch(() => {
        /* sem sugestões e com a validade de sempre */
      });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * O link da proposta já enviada, lido UMA vez ao abrir o estúdio — para o
   * botão «Copiar resumo» funcionar mesmo sem passar pelo «Enviar» nesta
   * sessão (reabrir o estúdio de uma proposta enviada ontem, por exemplo).
   * Se falhar, o botão simplesmente sai sem o link — o resumo continua a
   * servir sem ele, que é o comportamento normal de uma proposta por enviar.
   */
  useEffect(() => {
    let vivo = true;
    fetch(`/api/orcamento/${quote.id}/proposta-doc`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { acceptUrl?: string | null } | null) => {
        if (vivo && data?.acceptUrl) setLinkDaProposta(data.acceptUrl);
      })
      .catch(() => {
        /* sem link, o resumo sai sem ele */
      });
    return () => {
      vivo = false;
    };
  }, [quote.id]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A CONFERÊNCIA COM O QUE SEGUIU PARA O CLIENTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ver o bloco `divergenciaDoEnviado`, que conta o porquê. Aqui é a mecânica,
   * e ela é de propósito barata: a LISTA das versões traz o total de cada
   * envio (`total`, o bruto que ia no PDF) e mais nada. Quando bate certo — que
   * é o caso normal — não se descarrega documento nenhum.
   *
   * `versoes[0]` é a mais recente: a rota devolve da mais nova para a mais
   * velha, e está escrito lá.
   */
  const chaveDoEnviadoVisto = `${DRAFT_KEY}:enviado-visto`;
  /** Esta MESMA diferença já lhe foi mostrada e ela ficou com o que tem? */
  function divergenciaJaVista(aPagarAqui: number): boolean {
    try {
      const cru = localStorage.getItem(chaveDoEnviadoVisto);
      return cru != null && Math.abs(Number(cru) - aPagarAqui) <= 0.01;
    } catch {
      // Sem `localStorage` a pergunta volta na abertura seguinte. É o lado
      // certo para falhar: repetir uma pergunta custa um clique, calá-la custa
      // o número que o casal recebeu.
      return false;
    }
  }

  useEffect(() => {
    if (!aberturaAssente || conferidoComOEnviado.current) return;
    // Enviar NESTA sessão põe no ecrã exactamente o documento que seguiu — não
    // há nada para conferir, e a lista de versões ainda nem o conhece.
    if (sent) return;
    // Uma proposta a meio de ser escrita não tem total nenhum para comparar.
    if (!(totais.aPagar > 0)) return;
    conferidoComOEnviado.current = true;
    let vivo = true;
    const aPagarAqui = round2(totais.aPagar);
    (async () => {
      try {
        const r = await fetch(`/api/orcamento/${quote.id}/versoes`, { cache: "no-store" });
        if (!r.ok || !vivo) return;
        const dados = (await r.json()) as { versoes?: VersaoEnviada[] } | null;
        const ultima = dados?.versoes?.[0];
        if (!ultima || !(Number(ultima.total) > 0)) return;
        const enviado = round2(Number(ultima.total));
        // Um cêntimo de tolerância, a mesma do resto da casa: os dois lados
        // passaram por arredondamentos, e um cêntimo não é uma divergência.
        if (Math.abs(enviado - aPagarAqui) <= 0.01) return;
        if (divergenciaJaVista(aPagarAqui)) return;
        if (!vivo) return;
        /**
         * O histórico do pedido é quem sabe. Cada alteração de preço feita à
         * mão deixa lá um `price_set` (ver `registarNoHistorico`) — no estúdio
         * e na Gestão do pedido. Uma posterior ao envio quer dizer que a
         * mudança foi decidida; não havendo nenhuma, o número mexeu-se
         * sozinho, e aí não há escolha nenhuma a oferecer-lhe.
         */
        const elaMudou = (quote.activityLog ?? []).some(
          (e) => e.kind === "price_set" && e.at > ultima.enviadaEm,
        );
        setDivergenciaDoEnviado({
          enviadaEm: ultima.enviadaEm,
          aPagarEnviado: enviado,
          aPagarAqui,
          versaoId: ultima.id,
          elaMudou,
        });
      } catch {
        /* sem rede: o estúdio abre como sempre abriu, só sem a rede por baixo */
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberturaAssente, sent, totais.aPagar, quote.id]);

  /**
   * Repõe no ecrã os VALORES que seguiram para o cliente — e só os valores.
   *
   * O texto, as fotografias e os mood boards ficam exactamente como estão: são
   * trabalho dela, podem ser posteriores ao envio, e nunca estiveram em causa.
   * O que volta é o conjunto de campos que decide o dinheiro — o mesmo que
   * `totaisDaProposta` lê para desenhar o quadro do PDF.
   *
   * Reversível durante dez segundos, como todas as outras acções que mexem no
   * preço, e com uma linha no histórico do pedido pela mesma razão: um valor
   * que muda, visto três semanas depois, tem de ter onde se explicar.
   */
  async function reporOsValoresEnviados() {
    const d = divergenciaDoEnviado;
    if (!d || aReporOEnviado) return;
    setAReporOEnviado(true);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/versoes?doc=${d.versaoId}`, {
        cache: "no-store",
      });
      const dados = (await res.json().catch(() => null)) as { doc?: ProposalDoc } | null;
      if (!res.ok || !dados?.doc) {
        throw new Error(
          "Não foi possível ir buscar a proposta que seguiu para o cliente. A ligação falhou ou a versão já não está no servidor — tenta outra vez daqui a pouco, ou fala com quem gere a instalação. Nada mudou no que está no ecrã.",
        );
      }
      const enviado = dados.doc as StudioDoc;
      setLimpo({
        doc,
        total: totalInput,
        segundos: 10,
        motivo: `Valores repostos como seguiram para o cliente — total a pagar de ${eur(d.aPagarAqui)} para ${eur(d.aPagarEnviado)}.`,
      });
      setDoc((dd) => ({ ...dd, ...dinheiroDoDocumento(enviado) }));
      const base = baseDoDoc(enviado);
      setTotalInput(typeof base === "number" && base > 0 ? textoDoTotal(base) : "");
      // Com o documento ENVIADO, e não com o que estava no ecrã — ver
      // `baseDoEcraParaOPedido`. É isto que volta a pôr o «Preço final» do
      // pedido de acordo com o que o casal recebeu.
      persistirPreco(typeof base === "number" && base > 0 ? base : undefined, { doc: enviado });
      registarNoHistorico(
        `Valores repostos no estúdio como seguiram para o cliente: total a pagar de ${eur(d.aPagarAqui)} para ${eur(d.aPagarEnviado)}.`,
      );
      /**
       * ── E O «ANULAR» TEM DE FICAR ANULADO ────────────────────────────────
       *
       * A reposição é reversível durante dez segundos. Se ela a anular, o ecrã
       * volta a `aPagarAqui` — e, sem esta linha, a abertura seguinte via outra
       * vez uma divergência que ninguém tinha decidido e repunha de novo. Ela
       * ficava a lutar com o ecrã, e a anulação não valia nada.
       *
       * Guardar `aPagarAqui` (o valor de ANTES) diz exactamente isto: «se
       * acabares neste número, é porque o escolheste». Se não anular, o ecrã
       * fica no valor enviado e não há divergência nenhuma para conferir.
       */
      try {
        localStorage.setItem(chaveDoEnviadoVisto, String(d.aPagarAqui));
      } catch {
        /* sem `localStorage` a reposição vale na mesma; o que se perde é a
           memória de ela a ter anulado */
      }
      setDivergenciaDoEnviado(null);
      toast(
        "Os valores voltaram ao que seguiu para o cliente. Podes anular durante 10 segundos.",
        "success",
      );
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Não foi possível repor os valores enviados.",
        "error",
      );
    } finally {
      setAReporOEnviado(false);
    }
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O VALOR QUE SE MEXEU SOZINHO VOLTA SOZINHO — SEM PERGUNTAR NADA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «eu quero que o valor enviado para o cliente seja o valor
   * que fica na proposta e não quero depois se eu for à proposta no back
   * office já esteja outro valor naquele pedido. ISTO É SIMPLES, O VALOR NÃO
   * ALTERA CASO EU NÃO MUDO».
   *
   * Antes isto punha os dois números no ecrã e esperava por ela. A razão
   * escrita era boa — duas causas diferentes dão a mesma diferença — mas a
   * conclusão estava errada, e ela disse-o: nos dois casos QUEM DECIDE JÁ
   * DECIDIU. Se mudou o preço, mudou-o de propósito e isso está no histórico.
   * Se não mudou, o número que vale é o que o casal tem em mãos, e perguntar
   * é fazê-la escolher entre um valor certo e um valor avariado.
   *
   * Portanto: `elaMudou === false` repõe, e a pergunta só sobrevive no caso em
   * que responder por ela apagava trabalho dela.
   *
   * O que ela vê continua a ser tudo: o aviso do que aconteceu, o valor velho
   * e o novo, dez segundos para anular e uma linha no histórico do pedido.
   * Nada disto é silencioso — é só uma coisa a menos para decidir.
   */
  useEffect(() => {
    if (!divergenciaDoEnviado || divergenciaDoEnviado.elaMudou) return;
    if (aReporOEnviado) return;
    void reporOsValoresEnviados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divergenciaDoEnviado]);

  /** Fica o que está neste aparelho — e a pergunta não se repete enquanto o
   *  número não voltar a mexer. */
  function manterOsValoresDesteAparelho() {
    const d = divergenciaDoEnviado;
    if (!d) return;
    try {
      localStorage.setItem(chaveDoEnviadoVisto, String(d.aPagarAqui));
    } catch {
      /* sem `localStorage` a pergunta volta na abertura seguinte */
    }
    setDivergenciaDoEnviado(null);
  }

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
    if (Math.abs((temValor ? base! : 0) - anterior) > 0.01) {
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
   * O realce de um campo por confirmar, e a forma de o desmarcar.
   *
   * Laranja e não verde: é um AVISO de coisa por rever, não uma acção. O
   * `DESIGN-TOKENS.md` fixa esta regra para a página toda.
   *
   * ── E ACENDE-SE NUMA OCASIÃO SÓ ──────────────────────────────────────────
   *
   * Quando a proposta foi COPIADA DE OUTRA. É aí que os campos trazem mesmo o
   * casal de outra pessoa, e é a única forma de a duplicação fazer mal em vez
   * de bem: uma proposta enviada com o nome ou a data de outro casamento. Esse
   * caso fica marcado, e tem passeio próprio a guardá-lo.
   *
   * Acendia-se TAMBÉM ao abrir qualquer proposta, para assinalar o que o casal
   * tinha escrito no formulário do pedido. A intenção era boa e o resultado não
   * era: seis anéis à volta de seis campos, em todas as propostas, sempre — e
   * ela a ter de tocar num a um para os apagar. Palavras dela: «fica com essas
   * coisas à volta amarelas e eu quero tirar isso».
   *
   * Um aviso que está sempre ligado não é um aviso; é decoração que ensina a
   * não olhar. E o que ele marcava ali não era perigoso: os dados do formulário
   * são deste casal, estão certos, e ela lê-os no ecrã de qualquer maneira. O
   * perigo é o outro caso, e esse continua marcado.
   */
  /**
   * ── E UMA MARCA QUE NÃO É TINTA ────────────────────────────────────────
   *
   * A `bo-por-confirmar` não pinta nada — não tem regra nenhuma no CSS. É um
   * GANCHO, e existe por uma avaria concreta: o passeio
   * `e2e/proposta-fluxos.spec.ts` procurava estes campos por
   * `.ring-\[\#c98a2e\]\/45`, ou seja, pela COR. Quando a fase 03 do sistema
   * de design trocou o literal pelo token `--bo-aviso-tom`, o selector deixou
   * de casar, o passeio contou zero campos marcados e o CI ficou vermelho — não
   * porque o realce tivesse desaparecido, mas porque o teste estava a apontar
   * para a tinta em vez de apontar para o significado.
   *
   * Um teste amarrado à cor chumba a cada mudança de cor. Esta classe é o que
   * ele passa a procurar, e sobrevive à próxima.
   */
  const realce = (campo: CampoAMudar) =>
    porConfirmar.has(campo)
      ? "bo-por-confirmar rounded-lg ring-2 ring-[var(--bo-aviso-tom)]/45 ring-offset-2 ring-offset-white"
      : undefined;
  const confirmado = (campo: CampoAMudar) => {
    // Tocar-lhe É a confirmação. Um botão "confirmar" ao lado de cada campo
    // seria mais um clique para dizer o que o gesto já disse.
    setPorConfirmar((atual) => {
      if (!atual.has(campo)) return atual;
      const proximo = new Set(atual);
      proximo.delete(campo);
      return proximo;
    });
  };

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

  const isDeco = doc.template !== "organizacao";
  /** Fotos que ocupam já o seu lugar no documento mas ainda não têm caminho.
   *  Nome distinto do `porConfirmar` dos CAMPOS (acima): são coisas diferentes
   *  e partilhar o nome era o caminho para uma delas passar a mentir. */
  const fotosPorConfirmar = countPendingImages(doc);
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
  const fotosParaEscolhas: FotoDisponivel[] = (doc.moodBoards ?? []).flatMap((b) =>
    (b.images ?? [])
      .filter((caminho) => !!caminho && !isPendingImage(caminho))
      .map((caminho) => ({
        caminho,
        url: assetUrls[caminho],
        onde: (b.title ?? "").trim() || "Mood board",
      })),
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
  const contextoDoEnvio = useMemo(
    () => ({ idioma: idiomaDoPdf, canal, emailDoCliente: quote.email }),
    [idiomaDoPdf, canal, quote.email],
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
  const pdfConfirmado = pdfVistoAgora && !!pdfVisto?.confirmado;
  /**
   * ── PREPARADO ANTES DE ELA CARREGAR ──────────────────────────────────────
   *
   * No passo «Rever e enviar», sem erros, o PDF final desta versão pede-se em
   * segundo plano 1,5 s depois de ela parar de mexer — uma vez por versão.
   * Quando ela carrega em «Descarregar o PDF final», ou já está pronto, ou já
   * vai a meio; e o envio a seguir sai da memória do servidor em vez de o
   * desenhar outra vez. Uma falha aqui não diz nada a ninguém: o botão volta a
   * pedir, e é lá que um erro se mostra.
   */
  useEffect(() => {
    if (step !== "enviar" || sent || temErros || fotosPorConfirmar > 0 || busy !== null) return;
    if (!retratoAgora || pdfPreparado.current?.retrato === retratoAgora) return;
    const espera = setTimeout(() => {
      const desenhado = stripPendingImages(doc);
      const retrato = retratoDoPdf(desenhado, idiomaDoPdf);
      const promessa = pedirOPdfAgora.current(desenhado, false);
      pdfPreparado.current = { retrato, promessa };
      promessa.catch(() => {
        if (pdfPreparado.current?.promessa === promessa) pdfPreparado.current = null;
      });
    }, 1500);
    return () => clearTimeout(espera);
  }, [step, sent, temErros, fotosPorConfirmar, busy, retratoAgora, doc, idiomaDoPdf]);
  /**
   * As faltas DO BOTÃO DE ENVIAR: as de cima mais «falta ver o PDF final».
   * Ficam separadas de propósito — o `temErros` decide se se descarrega o
   * rascunho ou o PDF final, e se o «ver o PDF» entrasse nele o PDF final
   * nunca se podia descarregar para ser visto.
   */
  const contextoDoBotao = useMemo(
    () => ({ ...contextoDoEnvio, pdfVisto: pdfConfirmado }),
    [contextoDoEnvio, pdfConfirmado],
  );
  const faltasDoEnvio = oQueFaltaParaEnviar(doc as ProposalDoc, money.gross, contextoDoBotao);
  /** O sinal de cada passo na barra de cima — das mesmas duas listas. */
  const estadosDosPassos = estadoDosPassos(seccoes, faltas, sent);
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
  /**
   * Quantas traduções faltam em cada secção, para o índice.
   *
   * SÓ com a proposta a sair em inglês — é a mesma condição do painel «Por
   * traduzir» do passo do envio, e pela mesma razão: numa proposta portuguesa
   * não há nada por traduzir, e uma fila de contagens debaixo de cada secção
   * seria ruído no índice de quem nunca faz propostas inglesas.
   */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A DATA QUE ELA ESCREVE AQUI TAMBÉM PODE CHOCAR
   * ════════════════════════════════════════════════════════════════════════
   *
   * O aviso de dia ocupado já existia, e disparava ao ESCOLHER o cliente — a
   * partir do `quote.date`. Só que a data que sai impressa é a que está neste
   * documento, e este campo é texto livre: o casal liga a mudar o dia, ela
   * corrige aqui, e o aviso continuava a olhar para a data do formulário.
   *
   * ── CALA-SE QUANDO NÃO CONSEGUE LER A DATA ──────────────────────────────
   * `isoDaDataPorExtenso` só reconhece a forma que o estúdio escreve («12 de
   * setembro de 2026») e devolve `null` para tudo o resto: «a definir»,
   * «18.09.2027», «Set.», ou uma data a meio de ser escrita. Um aviso ERRADO
   * sobre uma data é pior do que nenhum — diz que há um casamento noutro dia,
   * e o dia é inventado por uma leitura falhada.
   *
   * ── E CALA-SE QUANDO É A MESMA DATA DO PEDIDO ───────────────────────────
   * Aí o aviso já está no ecrã, por cima do estúdio (ver `FazerProposta`). O
   * mesmo cartão duas vezes na mesma página é a maneira de se aprender a
   * saltar os dois.
   */
  const dataEscritaNoDoc = isoDaDataPorExtenso(doc.eventDate ?? "");
  const pedidoComADataDoDoc = useMemo(
    () =>
      dataEscritaNoDoc && dataEscritaNoDoc !== quote.date
        ? ({
            ...quote,
            date: dataEscritaNoDoc,
            // O fim de um evento de vários dias é do PEDIDO e não desta data:
            // arrastá-lo para aqui inventava um intervalo que ninguém escreveu.
            endDate: "",
            // E o local também é o do documento quando ele diz outro: a
            // distância por estrada é metade da resposta.
            location: doc.location || quote.location,
          } as Quote)
        : null,
    [dataEscritaNoDoc, quote, doc.location],
  );

  /**
   * A página que ela está a editar — para o painel da direita mostrar ESSA.
   *
   * Marcada quando o foco entra no cartão de um board, e não quando o rato lá
   * passa: o rato atravessa cartões a caminho de outro sítio, e um painel que
   * mudasse de página ao atravessar era um painel a piscar.
   */
  const [boardActivo, setBoardActivo] = useState<number | null>(null);

  /** As páginas COM fotografias, pela ordem em que saem — a ordem do PDF. */
  const paginasParaOPainel = useMemo(
    () =>
      ordemDeSaida(doc as ProposalDoc, doc.moodBoards ?? [], (b) => b.title ?? "")
        .map((bi) => ({ bi, board: (doc.moodBoards ?? [])[bi] }))
        .filter((p) => p.board && (p.board.images ?? []).length > 0),
    [doc],
  );

  const traducoesPorSeccao = useMemo(
    () => (idiomaDoPdf === "en" ? porTraduzirPorSeccao(doc as ProposalDoc) : undefined),
    [idiomaDoPdf, doc],
  );

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
      className="@container border-t border-[var(--bo-hairline-strong)] pt-5"
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
          <p className="bo-eyebrow flex items-center gap-1.5">
            Estúdio de propostas (PDF)
            <Ajuda sobre="o que se faz no estúdio de propostas">
              Monta aqui a proposta em PDF para o cliente, em cinco passos: Evento, Serviços,
              Inspiração, Orçamento e Rever e enviar. Podes saltar entre eles à vontade — nada se
              perde.
            </Ajuda>
          </p>
        </div>
        {/* `flex-wrap` e não `shrink-0`: com três botões a 375 px, um deles
            saía pela margem direita e ficava cortado ("Limpa…"). */}
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
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
                camposTocados.current.size > 0 || docDoServidor.current != null || jaGravou.current;
              const partes = trabalhoNoDocumento(doc);
              setCopiaSubstitui(
                houveTrabalho ? (partes.length > 0 ? partes.join(", ") : "texto escrito") : null,
              );
              setCopiarAberto(true);
            }}
          >
            Criar a partir de…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNomeModelo(doc.eventType || "")}>
            Guardar como modelo
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
          <Button variant="ghost" size="sm" onClick={clearDraft}>
            Limpar rascunho
          </Button>
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
      <StepNav step={step} onSelect={setStep} estados={estadosDosPassos} organizacao={!isDeco} />

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
      <div className={`@container/estudio ${noFormulario ? "view-in" : ""}`} hidden={!noFormulario}>
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
              faltas={faltas}
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
            <Section title="Evento" id="evento" escondida={step !== "evento"}>
              {/* ── «ESTE PEDIDO NÃO PARECE UM CASAMENTO» ──────────────────
                O estúdio escrevia «Casamento» sozinho em qualquer pedido sem
                tipo — e com isso o PDF punha «Noivos» e arrumava os mood boards
                em Cerimónia e Cocktail numa proposta para um restaurante. Os
                rascunhos feitos até 13/10 ficaram com essa palavra; o aviso é o
                que os deixa corrigir com um toque, sem adivinhar. */}
              {eCasamento(doc.eventType) &&
                !pedidoECasamento(quote) &&
                !eCasamento(tipoDoEventoDoPedido(quote)) &&
                !(quote.partnerA || quote.partnerB) &&
                !casamentoConfirmado && (
                  <div
                    role="status"
                    className="mb-4 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] p-3 text-sm"
                  >
                    <p className="font-medium">Este pedido não parece um casamento.</p>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--bo-text-muted)]">
                      A proposta diz «{doc.eventType}», e por isso o PDF chama «Noivos» ao cliente e
                      arruma os mood boards em Cerimónia, Cocktail e Jantar.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          confirmado("eventType");
                          patch({ eventType: tipoDoEventoDoPedido(quote) });
                          document
                            .querySelector<HTMLInputElement>('input[data-campo="eventType"]')
                            ?.focus();
                        }}
                      >
                        {tipoDoEventoDoPedido(quote)
                          ? `Mudar para «${tipoDoEventoDoPedido(quote)}»`
                          : "Escrever o tipo de evento"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCasamentoConfirmado(true);
                          try {
                            localStorage.setItem(chaveDoCasamentoConfirmado, "1");
                          } catch {
                            /* sem localStorage: cala-se só até reabrir */
                          }
                        }}
                      >
                        É mesmo um casamento
                      </Button>
                    </div>
                  </div>
                )}
              <div className="grid grid-cols-1 @min-[26rem]:grid-cols-2 gap-4">
                <Field
                  label="Clientes"
                  value={doc.clientNames ?? ""}
                  onChange={(e) => {
                    confirmado("clientNames");
                    patch({ clientNames: e.target.value });
                  }}
                  containerClassName={realce("clientNames")}
                  data-campo="clientNames"
                  placeholder="Maria & Zé"
                />
                <Field
                  label="Tipo de evento"
                  value={doc.eventType ?? ""}
                  onChange={(e) => {
                    confirmado("eventType");
                    patch({ eventType: e.target.value });
                  }}
                  containerClassName={realce("eventType")}
                  data-campo="eventType"
                  list="sug-tipos-de-evento"
                  placeholder="Casamento, festa, jantar…"
                  hint={
                    eCasamento(doc.eventType)
                      ? "Casamento: o PDF arruma os mood boards em Cerimónia, Cocktail, Jantar e Complementos."
                      : "O PDF diz «Cliente», e cada mood board abre o seu capítulo, com o título que lhe deram."
                  }
                />
                <Field
                  label="Data"
                  value={doc.eventDate ?? ""}
                  onChange={(e) => {
                    confirmado("eventDate");
                    patch({ eventDate: e.target.value });
                  }}
                  containerClassName={realce("eventDate")}
                  data-campo="eventDate"
                  placeholder="12 de setembro de 2026"
                />
                <Field
                  label="Local"
                  list="sug-locais"
                  value={doc.location ?? ""}
                  onChange={(e) => {
                    confirmado("location");
                    patch({ location: e.target.value });
                  }}
                  containerClassName={realce("location")}
                  data-campo="location"
                  placeholder="Monte da Oliveirinha"
                />
                <Field
                  label="Convidados"
                  value={doc.guests ?? ""}
                  onChange={(e) => {
                    confirmado("guests");
                    patch({ guests: e.target.value });
                  }}
                  containerClassName={realce("guests")}
                  data-campo="guests"
                  placeholder="150 pax"
                />
                {isDeco && (
                  <>
                    {/* ── ESTES TRÊS NÃO TINHAM ANEL NENHUM ────────────────
                      A cerimónia vem do que o casal escolheu no formulário e a
                      hora vem, quando vem, de uma proposta copiada — texto de
                      outra pessoa, exactamente como os quatro de cima. Eram os
                      únicos campos do Evento onde a marca não acendia, e por
                      isso os únicos onde um valor de terceiros se lia como um
                      valor escrito. */}
                    {/* Só num casamento — ou se já tiver texto, para não o
                      esconder de quem o escreveu. */}
                    {(eCasamento(doc.eventType) || (doc.ceremony ?? "").trim() !== "") && (
                      <Field
                        label="Cerimónia"
                        value={doc.ceremony ?? ""}
                        onChange={(e) => {
                          confirmado("ceremony");
                          patch({ ceremony: e.target.value });
                        }}
                        containerClassName={realce("ceremony")}
                        data-campo="ceremony"
                        placeholder="Civil, simbólica"
                      />
                    )}
                    <Field
                      label="Hora"
                      value={doc.time ?? ""}
                      onChange={(e) => {
                        confirmado("time");
                        patch({ time: e.target.value });
                      }}
                      containerClassName={realce("time")}
                      data-campo="time"
                      placeholder="A definir"
                    />
                  </>
                )}
              </div>

              {/* O que já está marcado à volta da data que ESTÁ ESCRITA AQUI —
                ver `pedidoComADataDoDoc`. O mesmo cartão do ecrã de escolher o
                cliente, com a mesma leitura de distância por estrada. */}
              {pedidoComADataDoDoc && (
                <div className="mt-4">
                  <AvisoDataOcupada
                    quote={pedidoComADataDoDoc}
                    quotes={quotes ?? []}
                    motivo="Não impede nada — a decisão é tua. Esta é a data que escreveste na proposta, e não a do pedido."
                  />
                </div>
              )}

              {/* As sugestões. `datalist` e não um `select`: ela TEM de poder
                escrever um espaço novo — a lista ajuda, não fecha a porta. */}
              <datalist id="sug-tipos-de-evento">
                {SUGESTOES_DE_TIPO.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              <datalist id="sug-locais">
                {sugestoes.locais.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>

              {/* Reference (advanced) */}
              <div className="mt-4">
                {refEdited && (
                  <div className="mb-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setRefEdited(false);
                        setDoc((d) => ({ ...d, ref: buildRef(d) }));
                      }}
                      className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                    >
                      ↺ Automática
                    </button>
                  </div>
                )}
                <Field
                  label="Título interno (opcional)"
                  value={doc.ref ?? ""}
                  onChange={(e) => {
                    setRefEdited(true);
                    patch({ ref: e.target.value });
                  }}
                  data-campo="ref"
                  hint="sobretudo para uso interno; aparece apenas em letra pequena no topo de cada página da proposta."
                />
              </div>

              {/* ── O QUE SE SABE E NÃO SE ESCREVE AO CLIENTE ────────────────
                «Quer ficar por baixo dos 8.000 €.» «Quem decide é a mãe.»
                Frases que hoje vivem na cabeça de quem escreveu a proposta e
                que se perdem quando é outra pessoa a pegar nela — ou quando são
                seis meses depois.

                Vive na secção do EVENTO e não ao pé do dinheiro: é sobre o
                negócio inteiro, e é a primeira secção — a nota tem de estar
                onde se dá com ela sem a procurar.

                O aspecto de papel amarelo é a garantia de que não se confunde
                com um campo que sai na proposta; o teste
                (`notas-internas-ficam-em-casa.test.ts`) garante que não sai
                mesmo. */}
              <NotasInternas
                valor={doc.notasInternas ?? ""}
                onChange={(v) => patch({ notasInternas: v })}
              />
            </Section>

            {/* ── A FOTOGRAFIA DA CAPA — uma, a cobrir a folha ──────────────
                Eram duas, «Esquerda» e «Direita», as tiras altas do PDF antigo.
                O desenho novo tem UMA fotografia a cobrir a folha deitada
                inteira, e ela escolheu: «Usa a minha, com aviso». O PDF usa a
                que ela escolher; se não servir para a página inteira (ao alto,
                ou pequena), usa a melhor deitada dos temas — e isso diz-se
                AQUI, ao lado da fotografia, antes de o PDF existir. A regra é a
                mesma do servidor (`regra-da-capa.ts`).

                O lugar é a primeira fotografia que houver: há propostas antigas
                só com a «Direita». A segunda que exista fica guardada e não sai. */}
            <Section
              title="Fotografia da capa"
              id="capas"
              escondida={step !== "evento"}
              rodape={notaDaSeccao("capas", "Nota sobre a capa")}
            >
              {(() => {
                const idx = idxDaCapa;
                const path = doc.coverImages?.[idx];
                const aspeto = path ? aspetosDasFotos[path] : undefined;
                const problema = tamanhoDaCapa
                  ? problemaDaCapa(tamanhoDaCapa.w, tamanhoDaCapa.h)
                  : aspeto && aspeto < 1
                    ? "ao-alto"
                    : null;
                /** Ela disse «usa esta na mesma»: vai, recortada como aqui. */
                const mesmoAssim = !!problema && !!doc.capaMesmoAssim;
                /** A fotografia que se vê aqui NÃO é a que vai para o PDF. */
                const naoVai = !!problema && !mesmoAssim;
                const perda = aspeto && (!problema || mesmoAssim) ? perdaNaFolha(aspeto) : 0;
                if (!path) {
                  return (
                    <div className="max-w-md">
                      <UploadArea
                        label="Fotografia da capa"
                        progresso={uploading[`cover-${idx}`]}
                        multiple={false}
                        curto
                        onFiles={(files) =>
                          handleUpload(`cover-${idx}`, files.slice(0, 1), (paths) =>
                            setCoverAt(idx, paths[0]),
                          )
                        }
                      />
                      <button
                        type="button"
                        className={`${ADD_BTN} mt-1.5 ${ESTADO} ${PRESSAO}`}
                        onClick={() => setPicker({ kind: "cover", idx })}
                        // Ao passar o rato já se vai buscar o que o diálogo
                        // precisa. `focus` para o teclado, `touchstart` para o
                        // telemóvel, onde não há hover nenhum.
                        onPointerEnter={aquecerBiblioteca}
                        onFocus={aquecerBiblioteca}
                        onTouchStart={aquecerBiblioteca}
                      >
                        Da biblioteca de temas
                      </button>
                      <p className="mt-2 text-caption text-[var(--bo-text-muted)]">
                        Uma fotografia deitada, a cobrir a primeira página e a última.
                      </p>
                    </div>
                  );
                }
                /**
                 * O enquadramento que se VÊ é o que sai: o escolhido à mão, ou
                 * o que o PDF escolheria sozinho (perguntado ao servidor), ou o
                 * centro enquanto a resposta não chega.
                 */
                const focoVisto = doc.focoDaCapa ??
                  (focoAutoDaCapa?.caminho === path ? focoAutoDaCapa.foco : undefined) ?? {
                    x: 0.5,
                    y: 0.5,
                  };
                return (
                  <div className="max-w-md">
                    <ArrastarParaEnquadrar
                      aspeto={aspeto}
                      aspetoDaCaixa={ASPETO_DA_FOLHA}
                      foco={focoVisto}
                      activo={!naoVai}
                      onFoco={(f) => patch({ focoDaCapa: f })}
                    >
                      {(posicao) => (
                        <div className="relative">
                          <Thumb
                            posicao={naoVai ? undefined : posicao}
                            url={assetUrls[path]}
                            // A cascata, do mais leve para o mais pesado. Ver
                            // `assetMedias`: o degrau do meio poupa ~900 KB por
                            // célula sempre que a miniatura falha.
                            planoB={[assetMedias[path], assetOriginais[path]]}
                            estadoDosUrls={estadoDosUrls}
                            aoTentarDeNovo={() => void tentarBuscarFotos()}
                            aoMorrer={marcarUrlMorto}
                            // A capa está no topo do passo: nunca espera pela fila
                            // das fotos que estão fora do ecrã.
                            priority
                            onRemove={() => removeCoverAt(idx)}
                            // A forma da folha do PDF (1123 × 794): o que se vê
                            // aqui é o recorte que sai.
                            className="aspect-[1123/794] w-full"
                            onMedida={(a) => registarAspeto(path, a)}
                            pendente={isPendingImage(path)}
                            onde="capa"
                            refDoc={path}
                          />
                          {/* ── O QUE SE VÊ AQUI TEM DE SER O QUE SAI ─────────────
                          A caixa recorta-a deitada, e assim parece servir. Ela
                          leu-a como a capa e o PDF saiu com outra. Quando não
                          vai, di-lo em cima dela, e não só por baixo. */}
                          {naoVai && (
                            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-caption whitespace-nowrap text-white">
                              Não vai para o PDF
                            </span>
                          )}
                          {perda > PERDA_QUE_SE_AVISA && (
                            <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-caption whitespace-nowrap text-white tabular-nums">
                              perde {Math.round(perda * 100)}% da área
                            </span>
                          )}
                        </div>
                      )}
                    </ArrastarParaEnquadrar>
                    {doc.focoDaCapa && !naoVai && (
                      <button
                        type="button"
                        className={`alvo-toque relative mt-1 text-caption font-medium text-sage-600 underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                        onClick={() => patch({ focoDaCapa: undefined })}
                      >
                        Voltar ao enquadramento automático
                      </button>
                    )}
                    {mesmoAssim && (
                      <p
                        role="status"
                        className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
                      >
                        <span>
                          {problema === "ao-alto"
                            ? "Vai para a capa recortada para ficar deitada, como aqui. "
                            : "Vai para a capa, e numa página inteira pode ver-se o grão. "}
                          <button
                            type="button"
                            className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                            onClick={() => patch({ capaMesmoAssim: undefined })}
                          >
                            Usar a melhor deitada dos temas
                          </button>
                        </span>
                      </p>
                    )}
                    {naoVai && (
                      <p
                        role="status"
                        className="mt-2 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]"
                      >
                        <span aria-hidden="true">⚠</span>
                        <span>
                          {problema === "ao-alto"
                            ? "É ao alto, e a capa é deitada. "
                            : `É pequena para a capa (${Math.max(tamanhoDaCapa?.w ?? 0, tamanhoDaCapa?.h ?? 0)} px; pede ${LADO_MINIMO_DA_CAPA}). `}
                          Por isso o PDF usa a melhor fotografia deitada dos temas, e não esta.{" "}
                          <button
                            type="button"
                            className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                            onClick={() => patch({ capaMesmoAssim: true })}
                          >
                            Usar esta na mesma
                          </button>
                          {" · "}
                          <button
                            type="button"
                            className={`alvo-toque relative font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
                            onClick={() => setPicker({ kind: "cover", idx })}
                            onPointerEnter={aquecerBiblioteca}
                            onFocus={aquecerBiblioteca}
                          >
                            Trocar
                          </button>
                        </span>
                      </p>
                    )}
                  </div>
                );
              })()}
            </Section>

            {/* Service groups */}
            <Section
              title="Serviços"
              id="servicos"
              escondida={step !== "servicos"}
              rodape={notaDaSeccao("servicos", "Nota sobre os serviços")}
            >
              {/* O editor com teclado, arrasto e anular vive em ServicesEditor. */}
              <ServicesEditor
                groups={doc.serviceGroups}
                onGroupsChange={setServiceGroups}
                showDesc={!isDeco}
                // O Ctrl/Cmd+Enter dos Serviços é o MESMO gesto do botão
                // «Guardar agora» — e por isso a mesma função, não uma segunda
                // gravação com outras regras e outras palavras.
                onSave={guardarAgora}
                // As caixas inglesas dos grupos e das linhas. O editor não sabe
                // o que é uma proposta bilingue: recebe o interruptor e desenha
                // uma caixa a mais por campo, com a mesma pega e o mesmo rótulo
                // do resto da casa.
                bilingue={bilingue}
              />
            </Section>

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
                <div className="@min-[40rem]:grid @min-[40rem]:grid-cols-[11rem_minmax(0,1fr)] @min-[40rem]:gap-5">
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
                                      className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
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
                                        className:
                                          "bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]",
                                        readOnly: fechado,
                                        placeholder: "Ceremony Decoration",
                                      },
                                    )}
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
                                    {/* A POSIÇÃO NO ECRÃ, não o índice do array: ver
                            `moveBoard`. */}
                                    <MoveBtns
                                      onUp={() => moveBoard(pos, -1)}
                                      onDown={() => moveBoard(pos, 1)}
                                      disUp={pos === 0}
                                      disDown={pos === doc.moodBoards.length - 1}
                                    />
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
                                    {/* ── ARRUMAR POR COR ──────────────────────
                                      Só aparece quando há mesmo o que arrumar:
                                      três fotos com cor conhecida. Com menos, o
                                      botão não teria nada para fazer e seria só
                                      mais um ícone a ocupar a barra. Fica
                                      escondido — e não desactivado — porque um
                                      botão desactivado que nunca se explica é
                                      pior do que um botão que não está lá. */}
                                    {b.images.filter((p) => assetCores[p]).length >= 3 && (
                                      <button
                                        type="button"
                                        onClick={() => arrumarPorCor(bi)}
                                        aria-label={`Arrumar por cor as fotografias do mood board ${pos + 1}`}
                                        title="Arrumar as fotografias por cor"
                                        disabled={fechado}
                                        className={`alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] disabled:opacity-40 ${ESTADO} ${PRESSAO}`}
                                      >
                                        <span aria-hidden="true">◑</span>
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => duplicarBoard(bi)}
                                      aria-label={`Duplicar o mood board ${pos + 1}`}
                                      className={`alvo-toque flex h-8 w-7 shrink-0 items-center justify-center rounded-md text-xs text-foreground/35 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO}`}
                                    >
                                      <span aria-hidden="true">⧉</span>
                                    </button>
                                    <button
                                      type="button"
                                      className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                                      onClick={() => removeBoard(bi)}
                                      aria-label="Remover mood board"
                                      disabled={fechado}
                                    >
                                      ×
                                    </button>
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
                                      <GrelhaDeFotos
                                        bi={bi}
                                        quantas={b.images.length}
                                        className="grid grid-cols-3 @min-[24rem]:grid-cols-4 gap-2"
                                      >
                                        {b.images.map((path, ii) => (
                                          <CelulaDeFoto
                                            // A chave é a POSIÇÃO, não o caminho: quando o
                                            // marcador provisório dá lugar ao caminho definitivo,
                                            // uma chave com o caminho faria o React desmontar a
                                            // célula e a foto piscava a meio da troca.
                                            key={ii}
                                            bi={bi}
                                            ii={ii}
                                            principal={principalDoTema === ii}
                                            seleccionada={seleccionadas.has(`${bi}:${ii}`)}
                                            // Fechado, a foto vê-se mas não se mexe: é
                                            // isso que «terminado» quer dizer.
                                            bloqueada={fechado}
                                            // A tira e o texto do rato — ver
                                            // `repeticaoNestaProposta` logo por
                                            // cima, e porque é que só uma das
                                            // três perguntas acende.
                                            historia={repeticaoNestaProposta(path)}
                                            origem={passadoDaFoto(path)}
                                            accoes={
                                              fechado ? null : (
                                                <AccoesDaFoto
                                                  nome={`Fotografia ${ii + 1} de «${b.title || "mood board sem título"}»`}
                                                  podeRecuar={ii > 0}
                                                  podeAvancar={ii < b.images.length - 1}
                                                  seleccionada={seleccionadas.has(`${bi}:${ii}`)}
                                                  principal={principalDoTema === ii}
                                                  onRecuar={() => reordenarFotos(bi, ii, ii - 1)}
                                                  onAvancar={() => reordenarFotos(bi, ii, ii + 1)}
                                                  onAmpliar={() => setLupa({ bi, ii })}
                                                  onSubstituir={() =>
                                                    setPicker({ kind: "board", bi, substituir: ii })
                                                  }
                                                  onPrincipal={() => marcarPrincipal(bi, ii)}
                                                  onSeleccionar={() => alternarSeleccao(bi, ii)}
                                                  onRemover={() => removeBoardImageAt(bi, ii)}
                                                />
                                              )
                                            }
                                          >
                                            <Thumb
                                              url={assetUrls[path]}
                                              // Do mais leve para o mais pesado —
                                              // ver `assetMedias`. É esta grelha
                                              // que tem 24 células e é aqui que a
                                              // queda de 20 KB para 1099 doía.
                                              planoB={[assetMedias[path], assetOriginais[path]]}
                                              estadoDosUrls={estadoDosUrls}
                                              aoTentarDeNovo={() => void tentarBuscarFotos()}
                                              aoMorrer={marcarUrlMorto}
                                              // A PRIMEIRA DOBRA do primeiro
                                              // board. Medido: sem prioridade
                                              // nenhuma, as 24 células repartiam
                                              // o canal e a primeira fotografia
                                              // só aparecia aos 34,0 s. Estas
                                              // quatro são as que ela está mesmo
                                              // a olhar quando desce às fotos.
                                              priority={bi === 0 && ii < 4}
                                              onde="mood-board"
                                              refDoc={path}
                                              // A remoção mudou-se para a barra de acções, que
                                              // é visível ao toque — o × só aparecia em hover, e
                                              // num telemóvel isso é um botão que não existe.
                                              semRemover
                                              onRemove={() => removeBoardImageAt(bi, ii)}
                                              onMedida={(a) => registarAspeto(path, a)}
                                              // ── TODAS AS CÉLULAS COM A MESMA FORMA ──────────
                                              // Pedido dela, a olhar para a grelha: «as fotos
                                              // umas são maiores que outras. coloca tudo igual
                                              // aqui».
                                              //
                                              // O que estava aqui era a forma da CAIXA que esta
                                              // foto vai ocupar na página: a do destaque é alta,
                                              // as da grelha da direita são baixas, e por isso a
                                              // grelha ficava aos degraus. Não era descuido —
                                              // existia para ela não escolher uma foto pelo que
                                              // via e o cliente receber a MESMA foto cortada
                                              // noutro sítio (ver o `aspeto` no `Thumb`).
                                              //
                                              // Foi-lhe dito o que se perdia, com estas palavras,
                                              // e ela escolheu igualar à mesma. Fica escrito
                                              // porque quem vier a seguir encontra o `aspeto`
                                              // documentado no `Thumb` e pergunta porque é que
                                              // este sítio não o usa: não é esquecimento.
                                              //
                                              // E igualar aqui não a deixa às cegas: o diagrama
                                              // da disposição continua a desenhar as caixas
                                              // verdadeiras, e o `cortadas` aqui em cima continua
                                              // a dizer, foto a foto, quanto é que cada uma perde
                                              // no recorte. Perdeu-se ver a forma; não se perdeu
                                              // ser avisada.
                                              aspeto={1}
                                              pendente={isPendingImage(path)}
                                            />
                                          </CelulaDeFoto>
                                        ))}
                                      </GrelhaDeFotos>
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
                                              handleUpload(`board-${bi}`, files, (paths) =>
                                                addBoardImages(bi, paths),
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
                                          {capituloDoTema(b, eCasamento(doc.eventType))}
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
                    <div className="mt-3 flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                        onClick={addBoard}
                      >
                        + Adicionar mood board
                      </button>
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
                      <ModelosParciais
                        tipo="moodboard"
                        mostrar="inserir"
                        toast={toast}
                        onInserir={(b) => void inserirMoodBoardDeModelo(b as MoodBoard)}
                      />
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

                {/* ── AS ALTERNATIVAS QUE O CASAL ESCOLHE (Fase 3) ───────────
                  Vive aqui dentro, e não numa secção própria: as alternativas
                  são visuais e as fotografias que as explicam já estão nestas
                  páginas. A razão longa está no cabeçalho do editor. */}
                <EditorDeEscolhas
                  escolhas={doc.escolhas}
                  fotos={fotosParaEscolhas}
                  bilingue={bilingue}
                  onChange={(escolhas) => patch({ escolhas })}
                />
              </Section>
            )}

            {/* Cronograma — organizacao only */}
            {!isDeco && (
              <Section
                title="Cronograma de Organização"
                id="cronograma"
                escondida={step !== "inspiracao"}
                rodape={notaDaSeccao("cronograma", "Nota sobre o cronograma")}
              >
                <div className="flex flex-col gap-3">
                  {(doc.cronograma ?? []).map((ph, pi) => (
                    <div
                      key={pi}
                      className="rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <input
                          className="bo-input min-w-[12rem] flex-1 px-2.5 py-2 text-xs text-[var(--bo-tinta-72)]"
                          value={ph.title}
                          onChange={(e) => updatePhase(pi, { title: e.target.value })}
                          placeholder="6-12 meses antes do casamento"
                          aria-label="Título da fase"
                          /* O salto das gralhas encontra o campo por aqui. Ver
                           `chaveDoCampo` — o cronograma entrou na varredura
                           depois de se medir que era texto dela a sair
                           publicado sem passar por corrector nenhum. */
                          data-campo={chaveDoCampo({ tipo: "cronogramaTitulo", pi })}
                        />
                        <MoveBtns
                          onUp={() => movePhase(pi, -1)}
                          onDown={() => movePhase(pi, 1)}
                          disUp={pi === 0}
                          disDown={pi === (doc.cronograma?.length ?? 0) - 1}
                        />
                        <button
                          type="button"
                          className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                          onClick={() => removePhase(pi)}
                          aria-label="Remover fase"
                        >
                          ×
                        </button>
                      </div>
                      {/* Entre o título da fase e a lista de tarefas: a frase
                        conta-as, e elas estão logo por baixo. Ver `aRemover`. */}
                      {perguntaDeRemocao(`fase:${pi}`, "Remover a fase")}
                      <div className="flex flex-col gap-2 pl-1">
                        {ph.items.map((it, ii) => (
                          <div key={ii} className="flex items-center gap-2">
                            <input
                              className={INPUT_SM}
                              value={it}
                              onChange={(e) => updatePhaseItem(pi, ii, e.target.value)}
                              placeholder="Definição do conceito"
                              aria-label="Tarefa"
                              data-campo={chaveDoCampo({ tipo: "cronogramaItem", pi, ii })}
                            />
                            <button
                              type="button"
                              className={`${REMOVE_BTN} ${ESTADO} ${PRESSAO}`}
                              onClick={() => removePhaseItem(pi, ii)}
                              aria-label="Remover tarefa"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          className={`${ADD_BTN} ${ESTADO} ${PRESSAO}`}
                          onClick={() => addPhaseItem(pi)}
                        >
                          + Adicionar tarefa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${ADD_BTN} mt-3 ${ESTADO} ${PRESSAO}`}
                  onClick={addPhase}
                >
                  + Adicionar fase
                </button>
              </Section>
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
                      <span className="w-32 shrink-0">Como escala</span>
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
                            Sem o cabeçalho, «Como escala» não voltava em lado
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
                              Como escala
                            </span>
                            <select
                              value={escala?.tipo ?? "fixa"}
                              onChange={(e) => definirEscala(i, e.target.value as TipoDeEscala)}
                              aria-label={`Como escala ${l.item || "a linha sem nome"}`}
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
                              // `onBlur` e não `onChange`: normalizar a cada tecla
                              // apagava o que ela estava a escrever a meio ("1." vira
                              // 1, e o "500" seguinte já não tinha onde entrar).
                              onBlur={(e) => updateBudgetPrice(i, e.target.value)}
                              placeholder="sem preço"
                              inputMode="decimal"
                              aria-label={`Preço de ${l.item || "linha sem nome"}`}
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
                        label="Rótulo do total"
                        value={doc.totalLabel ?? ""}
                        onChange={(e) => patch({ totalLabel: e.target.value })}
                        data-campo="totalLabel"
                        placeholder="Valor Total Decoração"
                      />
                      {/* «Valor Total Decoração» já sai «Decoration Total» por
                        reconhecimento; um rótulo reescrito à mão deixa de ser
                        reconhecido, e é para esse que a caixa existe. */}
                      {caixaDeIngles({ tipo: "totalLabel" }, "Rótulo do total", {
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
                        Como contam no preço final
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
            </Section>

            {/* Total, IVA e validade — fonte de verdade do dinheiro. O valor + o modo
          de IVA eliminam a ambiguidade "3.000,00 €" (com IVA?) vs "+ IVA"; o
          texto do PDF é composto a partir daqui. */}
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
            </div>

            <Section
              title="Total, IVA e validade"
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
                        ? "Bate certo com a soma dos serviços com preço."
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
                                patch({ depositPercent: sinalAntes.current });
                              }
                            }}
                            onFocus={() => {
                              sinalAntes.current = pctSinal;
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
              <VistaDeConjunto
                doc={doc as ProposalDoc}
                fotosDoPdf={fotosDoPdf}
                onMudarFoto={(chave, nome, max) => {
                  setLugarDaFoto(0);
                  setPaginaDaFoto({ chave, nome, max });
                }}
                ordem={ordemDosBoards}
                idioma={idiomaDoPdf}
                urls={assetUrls}
                originais={assetOriginais}
                aspetos={aspetosDasFotos}
                onMover={(de, para) => moverBoardParaPosicao(de, para)}
                onSaltar={(bi) => {
                  const id = doc.moodBoards[bi]?.id;
                  if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
                  rolarAteVer(document.getElementById(`mood-board-${bi}`), { block: "start" });
                }}
                // O salto de uma folha de texto usa o MESMO caminho da
                // Conferência: abre a secção se estiver dobrada e só então
                // leva a vista. Uma segunda maneira de saltar era uma segunda
                // maneira de falhar a abertura da dobra.
                onIrParaSeccao={(seccao) => irParaAFalta(seccao)}
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
          <PainelDoEstudio
            cabe={painelLateralCabe}
            paginas={paginasParaOPainel}
            activa={boardActivo ?? undefined}
            urls={assetUrls}
            originais={assetOriginais}
            aspetos={aspetosDasFotos}
            doc={doc as ProposalDoc}
            onSaltar={(bi) => irParaAFalta("moodboards", `boardTitulo:${bi}`)}
            onEscolherFotos={(bi) => setPicker({ kind: "board", bi })}
          />
        </div>
      </div>
      {/* ══════════ /PASSOS 1 a 4 ══════════ */}

      {/* ══════════ PASSO 5 · Rever e enviar — por onde segue, LOGO EM CIMA ══════════
          Palavras dela, a 14/10, com a captura deste bloco: «coloca isto em
          cima para se ver logo no início e coloca o logo do email e do
          WhatsApp». Estava a meio do passo, depois do resumo inteiro — a
          primeira escolha do envio era a última coisa que se via. Sempre
          montado e escondido como o envio aqui em baixo, para o salto de
          «Falta o email» (`#seccao-envio`) ter onde cair. */}
      <div
        className={step === "enviar" && !sent ? "view-in mb-4" : undefined}
        hidden={step !== "enviar" || sent}
      >
        <Section title="Por onde segue">
          {/* ── POR ONDE SEGUE ────────────────────────────────────────────
                  A escolha vem ANTES do resumo e do botão (e, desde 14/10, no
                  topo do passo), porque muda o que o
                  resumo quer dizer: com «só WhatsApp», a linha «Para: <email>»
                  deixa de ser o destino e passa a ser só um dado do pedido.

                  Os rótulos dizem o CANAL e não o verbo — «Email», «WhatsApp»,
                  «Os dois» — porque o verbo já está no botão a seguir, e repetir
                  «enviar» três vezes numa fila de três não ajuda a escolher. */}
          <div className="scroll-mt-24" id="seccao-envio">
            <Segmented
              size="sm"
              ariaLabel="Por onde é que a proposta segue"
              value={canal}
              onChange={escolherCanal}
              options={OPCOES_DO_CANAL}
            />
            {/* ── O QUE CADA ESCOLHA FAZ, DITO ANTES DO GESTO ────────────
                    Sem esta linha, «WhatsApp» prometia um envio automático que
                    não existe: nenhuma página consegue mandar uma mensagem por
                    alguém. O que acontece é o WhatsApp ABRIR com a mensagem
                    escrita, e ser ela a escolher a quem — e isso é um segundo
                    gesto, dela, depois deste. Dizê-lo aqui é a diferença entre
                    uma expectativa cumprida e uma surpresa. */}
            <p className="bo-text-muted mt-2 text-xs leading-relaxed">
              {canal === "email"
                ? "O cliente recebe a proposta em PDF por email."
                : canal === "whatsapp"
                  ? "Não sai email. A proposta é gerada e o link fica pronto — a seguir abres o WhatsApp e escolhes a quem o mandas."
                  : "O cliente recebe o PDF por email, e a seguir abres o WhatsApp com o link para lho mandares também."}
            </p>
          </div>
          {/* ── SEM DESTINATÁRIO, DIZ-SE AQUI E NÃO DEPOIS ──────────────
                  Um pedido que entrou por telefone não tem email. Até aqui só
                  se sabia DEPOIS de carregar em Enviar: a proposta ficava
                  gravada, o email não saía, e o aviso vinha a seguir ao gesto.

                  Agora está antes do dedo, e diz ONDE se resolve — no painel do
                  pedido, que passou a deixar corrigir os contactos. */}
          {/* ── E O AVISO DO EMAIL EM FALTA CALA-SE QUANDO NÃO É POR AÍ ──
                  Com «só WhatsApp», não ter email de cliente deixou de ser um
                  problema — é o caso NORMAL de um pedido que entrou por
                  telefone. Um aviso cor de laranja a apontar para uma coisa
                  que não faz falta ensina a ignorar avisos. */}
          {!emailDoCliente && canal !== "whatsapp" && (
            <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
              <span aria-hidden="true">⚠</span>
              <span>
                Este pedido não tem email de cliente, e sem ele a proposta não pode seguir por
                email. Acrescenta-o nos <strong className="font-medium">contactos do pedido</strong>
                , em Detalhes — ou escolhe «WhatsApp».
              </span>
            </p>
          )}
        </Section>
      </div>

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
      <div className={step === "enviar" ? "view-in" : undefined} hidden={step !== "enviar"}>
        {sent ? (
          <Section title="Enviar ao cliente">
            {/* ── O FIM DA JORNADA MERECE SER VISTO ────────────────────────
               Depois de uma barra a encher durante dezenas de segundos numa
               quinta com 4G, a proposta dava-se por enviada num fotograma: um
               `✓` de texto aparecia, e mais nada.

               É o único momento do estúdio que pertence à banda de
               apresentação (600–1500 ms), e é o único que não tinha nada. O
               gesto já existe nesta casa e está a ser usado no ecrã que o
               CASAL vê ao pedir orçamento (`ConfirmacaoClient.tsx`): o anel
               desenha-se em 0,7 s e o traço do visto vem a seguir, em
               `stroke-dashoffset` puro, sem JavaScript e com
               `prefers-reduced-motion` já tratado no `globals.css`.

               Passa a ser o mesmo dos dois lados — ela vê o que o casal vê. */}
            <div className="bo-cena flex flex-col items-start gap-3 rounded-2xl border border-sage-600/25 bg-sage-600/[0.06] p-5">
              <p className="flex items-center gap-2 font-display text-base text-sage-600">
                <svg
                  viewBox="0 0 52 52"
                  className="h-5 w-5 shrink-0"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="confirm-ring"
                    cx="26"
                    cy="26"
                    r="24"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeOpacity="0.4"
                  />
                  <path
                    className="confirm-check"
                    d="M15 27l7.5 7.5L38 18"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>{" "}
                {canal === "whatsapp" ? "Proposta pronta" : "Proposta enviada"}
              </p>
              {/* ── O QUE SE DIZ NO FIM DEPENDE DO QUE SE FEZ ──────────────
                  «Não precisas de fazer mais nada» era verdade quando só havia
                  email. Com o WhatsApp escolhido é falso — falta o gesto dela,
                  e é o gesto que entrega a proposta. Uma frase que diz «está
                  tudo feito» por cima de uma coisa por fazer é a maneira mais
                  rápida de a proposta não chegar a ninguém. */}
              <p className="text-sm leading-relaxed text-[var(--bo-text-muted)]">
                {canal === "whatsapp"
                  ? "A proposta está gerada e o link está pronto. Falta mandá-lo — é o botão aqui em baixo."
                  : canal === "ambos"
                    ? `O email seguiu para ${quote.email || "o cliente"}. Falta o WhatsApp, se o quiseres mandar também.`
                    : `A proposta foi gerada e enviada para ${quote.email || "o cliente"}. Não precisas de fazer mais nada.`}
              </p>
              {/* ── QUANDO O CASAL PREFERE WHATSAPP ─────────────────────────
                  A comunicação sai toda por email, e em Portugal é normal o
                  casal preferir WhatsApp. É aqui, mesmo depois de enviar, que
                  o link fica mais fresco — sem esperar por um segundo pedido.

                  «E o mesmo quando enviamos proposta no fazer proposta.» O
                  «Copiar resumo» já cá estava e obrigava-a a ir ao WhatsApp,
                  abrir uma conversa e colar. O botão abre-o com a mensagem já
                  escrita e a lista de contactos à espera — os mesmos dois
                  passos, menos os três do meio. O copiar FICA, para quem quer
                  o texto noutro sítio qualquer. */}
              <div className="flex flex-wrap items-center gap-2">
                <BotaoWhatsApp texto={resumoParaCopiar} />
                <CopiarResumo texto={resumoParaCopiar} />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSent(false);
                  setConfirmSend(false);
                }}
              >
                Enviar de novo / nova revisão
              </Button>
            </div>
          </Section>
        ) : (
          <div>
            {/* ── O PASSO 5 FICOU SÓ COM O EMAIL (14/10) ──────────────────
                  Pedido dela: tirar o bloco «Enviar ao cliente» — o resumo
                  (Para, Clientes, Total, Sinal), o «Copiar resumo» e o
                  WhatsApp de antes do envio, as notas do WhatsApp e da língua
                  e a «Mensagem para o cliente» — e deixar só o email que o
                  cliente vai receber. O que se escrevia na mensagem escreve-se
                  agora no próprio texto do email, que é editável e é o que
                  segue. O «Para» continua no cabeçalho do email; o total, o
                  sinal e as faltas, na Conferência por baixo. Depois de
                  enviada, o WhatsApp e o «Copiar resumo» continuam no painel
                  do «Proposta enviada». */}
            {/* ══════════════════════════════════════════════════════════
                  O EMAIL, ANTES DE ALGUÉM CARREGAR EM ENVIAR
                  ══════════════════════════════════════════════════════════

                  Depois da mensagem (que é um dos dados de que o texto parte) e
                  ANTES da conferência: a passagem de olhos do documento e a do
                  email fazem-se seguidas, com o dedo já a caminho do botão.

                  O `activo` existe porque este passo fica MONTADO enquanto se
                  escreve o conteúdo — sem ele, cada tecla do passo 1 mandava
                  uma leitura do rascunho para o servidor. */}
            <EmailDoEnvio
              quoteId={quote.id}
              doc={doc as ProposalDoc}
              idioma={idiomaDoPdf}
              // A caixa da mensagem saiu (14/10): escreve-se no texto do email.
              mensagem=""
              activo={step === "enviar"}
              corpo={corpoDoEmail}
              onCorpo={setCorpoDoEmail}
              assunto={assuntoDoEmail}
              onAssunto={setAssuntoDoEmail}
              onModelo={setModeloDoEmail}
              // Medido quando houve pré-visualização; estimado quando não —
              // e o ecrã diz qual dos dois é.
              bytesDoAnexo={bytesDoPdf ?? tamanhoEstimado(totalDeFotos, amostras)}
              bytesMedidos={bytesDoPdf !== null}
              // Vazio quer dizer «compõe-o tu», e por isso o campo sai do
              // documento em vez de lá ficar como cadeia vazia: um `""`
              // gravado era indistinguível de uma escolha, e o dia em que a
              // composição mudasse não chegava às propostas que passaram por
              // aqui.
              onNomeDoFicheiro={(nome) => patch({ nomeDoFicheiro: nome.trim() ? nome : undefined })}
            />
            {/* As fotos a caminho têm a sua própria linha, e não a genérica
                  dos campos por preencher: aqui não há nada a fazer senão
                  esperar uns segundos — dizer-lhe para "preencher" seria
                  mandá-la procurar um campo que está bem. */}
            {fotosPorConfirmar > 0 && (
              <p
                aria-live="polite"
                className="mt-4 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--bo-perigo)]"
              >
                <span aria-hidden="true">⏳</span>
                <span>
                  {fotosPorConfirmar === 1
                    ? "1 foto ainda está a entrar na proposta."
                    : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta.`}{" "}
                  O envio fica disponível mal ela assente — assim a proposta segue completa.
                </span>
              </p>
            )}
            {/* A PASSAGEM DE OLHOS. Depois do resumo (que diz o que vai
                  seguir) e antes do botão (que o torna irreversível). */}
            <Conferencia
              doc={doc as ProposalDoc}
              quote={quote}
              quotes={quotes}
              totalBruto={money.gross}
              // A língua escolhida aqui ao lado. Sem ela, a lista falava do
              // pedido que veio em inglês e calava-se sobre a metade da
              // proposta que ia sair em português.
              idioma={idiomaDoPdf}
              // O canal e o email: sem eles a lista não sabia que uma
              // proposta por email sem email não chega a ninguém (B1).
              canal={canal}
              emailDoCliente={quote.email}
              onIr={(v) => irParaAFalta(v.seccao, v.campo)}
            />
            {/* ── ANTES DE ENVIAR: VER O PDF FINAL (14/10) ───────────────
                  «Quero que haja algo que antes de enviar para os clientes
                  obrigue os colaboradores da Líquen a verificar se está tudo
                  bem.» A escolha dela foi «Ver o PDF primeiro». O PDF final
                  só sai sem erros (B1); depois de descarregado, pede-se a
                  confirmação; e mudar o documento depois de o ver volta a
                  pedir as duas coisas. O servidor confere a mesma chave. */}
            <div
              data-testid="ver-antes-de-enviar"
              data-campo="pdf-visto"
              className="mt-4 flex flex-col items-start gap-2 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-3"
            >
              <p className="bo-eyebrow text-[var(--bo-text-muted)]">Antes de enviar</p>
              {temErros ? (
                <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                  Primeiro corrige o que está na lista acima — o PDF final só sai sem erros. Depois
                  descarrega-o e vê-o com atenção.
                </p>
              ) : !pdfVistoAgora ? (
                <>
                  <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                    {pdfVisto
                      ? "A proposta mudou depois de veres o PDF. Descarrega-o outra vez e vê-o antes de enviar."
                      : "Descarrega o PDF final e vê-o com atenção, página a página — é exactamente o que o cliente vai receber."}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void preview()}
                    disabled={busy !== null}
                  >
                    {busy === "preview" ? "A gerar o PDF…" : "Descarregar o PDF final"}
                  </Button>
                </>
              ) : (
                <label className="alvo-toque flex cursor-pointer items-start gap-2 text-sm leading-snug text-[var(--bo-text)]">
                  <input
                    type="checkbox"
                    checked={!!pdfVisto?.confirmado}
                    onChange={(e) => confirmarPdfVisto(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-sage-600"
                  />
                  <span>Vi a proposta e está tudo certo</span>
                </label>
              )}
            </div>
            {/* ── AS FOTOGRAFIAS ESTÃO MESMO LÁ? ─────────────────────────
                  Primeiro de todos os avisos deste passo, e é de propósito: é
                  o único que fala de uma coisa que já não se vê no ecrã. As
                  gralhas e as traduções lêem-se no documento; um ficheiro que
                  desapareceu do armazenamento só se descobre perguntando.

                  Foi o defeito que a fez escrever: quatro fotos que não
                  existiam seguiram numa proposta, e a primeira pessoa a dar por
                  isso foi o casal. */}
            <FotosEmFalta quoteId={quote.id} doc={doc as ProposalDoc} />

            {/* Os acentos que faltam nos campos que saem impressos. Aqui, ao
                  pé da Conferência, e não a meio de escrever: a palavra ainda
                  está a ser escrita quando o aviso apareceria. */}
            <Gralhas
              doc={doc as ProposalDoc}
              onCorrigir={(g) => {
                setDoc((d) => corrigirGralha(d, g));
                // A palavra muda num campo que pode estar a catorze páginas
                // daqui, dentro de uma secção que não se está a ver. No sítio
                // do clique só se vê a linha sair desta lista — e uma linha a
                // desaparecer não diz o que ficou escrito lá em cima.
                //
                // Com as duas palavras e o campo, é a mesma prestação de
                // contas que o «Corrigir as N» ao lado já fazia com o número.
                toast(`«${g.escrita}» passou a «${g.sugerida}» — ${g.rotulo}.`, "info");
              }}
              onIr={(g) => irParaCampo(g.campo)}
              onTirarSimbolos={(s) => {
                setDoc((d) => tirarSimbolos(d, s));
                toast(`Tirei ${s.simbolos.join(" ")} — ${s.rotulo}.`, "info");
              }}
              onIrAosSimbolos={(s) => irParaCampo(s.campo)}
              onCorrigirTudo={() => {
                const quantas = gralhasDoDocumento(doc as ProposalDoc).length;
                setDoc((d) => corrigirTudo(d));
                toast(
                  quantas === 1 ? "1 palavra corrigida." : `${quantas} palavras corrigidas.`,
                  "info",
                );
              }}
            />
            {/* ── O QUE VAI SAIR EM PORTUGUÊS ─────────────────────────────
                  Logo a seguir às Gralhas, e SÓ com «Inglês» escolhido: numa
                  proposta portuguesa não há nada por traduzir, e uma secção
                  vazia a dizê-lo era ruído no ecrã de toda a gente. */}
            {idiomaDoPdf === "en" && (
              <PorTraduzir
                doc={doc as ProposalDoc}
                onFicarEmPortugues={(c) => setDoc((d) => escreverEn(d, c.campo, c.texto))}
                onFicarTodosEmPortugues={() => {
                  const faltam = camposPorTraduzir(doc as ProposalDoc);
                  setDoc((d) => {
                    let saida = d;
                    for (const c of faltam) saida = escreverEn(saida, c.campo, c.texto);
                    return saida;
                  });
                  toast(
                    faltam.length === 1
                      ? "1 campo fica em português."
                      : `${faltam.length} campos ficam em português.`,
                    "info",
                  );
                }}
                onIr={(c) => irParaCampo(c.campo, "en")}
              />
            )}
            {/* ── O QUE JÁ SEGUIU ────────────────────────────────────────
                  Depois da conferência (que olha para ESTA proposta) e antes
                  do botão: é aqui que a pergunta "o que é que eles vão ver de
                  diferente?" se faz, com o dedo já a caminho do Enviar.

                  O `key` muda quando se envia — assim o painel volta a ler o
                  histórico e a proposta que acabou de sair aparece nele, em vez
                  de ficar com a lista de antes do envio. */}
            <Versoes
              key={String(sent)}
              quoteId={quote.id}
              doc={doc as ProposalDoc}
              onRestaurar={restaurarVersao}
              // A língua escolhida ao lado (ver a Conferência, aqui em cima):
              // o parágrafo do que mudou nasce na língua em que a proposta
              // vai mesmo sair.
              idioma={idiomaDoPdf}
              onInserirNaMensagem={inserirParagrafoDoQueMudou}
            />
            {/* ── A FRASE ESTÁTICA SAIU DAQUI ──────────────────────────
                  Dizia «Preenche clientes, referência e um total maior que 0
                  (no passo «Conteúdo») antes de enviar» — sempre as mesmas
                  palavras, mesmo quando só faltava uma das três, sem link para
                  nenhuma e a repetir uma lista que já existia duas vezes (a
                  Conferência aqui em cima e a coluna lateral, que só existe
                  acima de 1280 px).

                  Agora o que trava está na Conferência, em primeiro e a
                  vermelho, com o nome do que falta e um link que põe o cursor
                  dentro do campo. Uma lista, um vocabulário, e visível em
                  qualquer largura — ver `conferencia.ts`. */}
          </div>
        )}
      </div>

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
            <p className="mr-auto min-w-0 truncate text-xs text-[var(--bo-text-muted)]">
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
              {precoPorChegar && (
                <span
                  className="ml-2 inline-flex first:ml-0 items-center gap-1.5 rounded-full bg-[var(--bo-perigo)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--bo-perigo)]"
                  aria-live="assertive"
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
              {(gravadoEm || porGravar || soNesteComputador || naoDuraAoDeploy) &&
                (() => {
                  const estado: EstadoDaGravacaoNoEcra =
                    porGravar || aGravarNoServidor > 0
                      ? "a-guardar"
                      : soNesteComputador
                        ? "so-neste-computador"
                        : // Depois do `so-neste-computador` e não antes: não
                          // chegar ao servidor é pior do que chegar a um sítio
                          // que não dura, e o indicador só diz uma coisa.
                          naoDuraAoDeploy
                          ? "nao-dura-ao-deploy"
                          : "guardado";
                  const t = textoDaGravacao(estado, gravadoEm);
                  const alarme =
                    estado === "so-neste-computador" || estado === "nao-dura-ao-deploy";
                  return (
                    <span
                      // O aviso não pode ter o cinzento discreto dos outros dois:
                      // este é para dar nas vistas, e o `aria-live` faz com que
                      // também seja anunciado a quem não olha para aqui.
                      className={
                        alarme
                          ? "ml-2 first:ml-0 rounded-full bg-[var(--bo-perigo)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--bo-perigo)]"
                          : "ml-2 first:ml-0 text-[11px] text-foreground/35"
                      }
                      aria-live={alarme ? "assertive" : "polite"}
                      title={
                        estado === "so-neste-computador" && soNesteComputador?.porque
                          ? `${t.longo} — ${soNesteComputador.porque}`
                          : estado === "nao-dura-ao-deploy" && naoDuraAoDeploy?.aviso
                            ? `${t.longo} — ${naoDuraAoDeploy.aviso}`
                            : t.longo
                      }
                    >
                      {/* No telemóvel os outros dois estados são um glifo; este
                          NÃO, e é de propósito: um triângulo sozinho não avisa
                          de nada. */}
                      <span aria-hidden className="sm:hidden">
                        {t.curto}
                      </span>
                      <span className="hidden sm:inline">{t.longo}</span>
                      {/* O visto sozinho não diz nada a quem usa leitor de ecrã. */}
                      <span className="sr-only">{t.leitor}</span>
                    </span>
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
            <div className="flex min-w-0 items-center gap-3">
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
              <p className="min-w-0 truncate text-xs tabular-nums text-[var(--bo-text-muted)]">
                {money.base > 0 ? (
                  <>
                    <span className="sm:hidden">
                      <span className="text-foreground/45">A pagar</span>{" "}
                      <strong className="font-semibold text-[var(--bo-text)]">
                        {eur(totais.aPagar)}
                      </strong>
                    </span>
                    <span className="hidden sm:inline">
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
                    <span className="sm:hidden">Preenche e avança.</span>
                    <span className="hidden sm:inline">
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
                  size="sm"
                  variant="ghost"
                  onClick={() => setStep(passoAoLado(step, -1) as Step)}
                >
                  ← {nomeDoPasso(passoAoLado(step, -1) as Step, !isDeco)}
                </Button>
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => setStep(passoAoLado(step, 1) as Step)}
                iconRight={<span aria-hidden="true">→</span>}
              >
                Seguinte: {nomeDoPasso(passoAoLado(step, 1) as Step, !isDeco)}
              </Button>
            </div>
          </>
        )}

        {step === "enviar" && !sent && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setStep("orcamento")}
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
              <div className="flex min-w-0 items-center gap-2">
                <span className="inline-flex">
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
            ) : /* ── O QUE FICA DE FORA, PERGUNTADO ANTES DE SEGUIR ────────
                O servidor desenhou o documento, viu o que a composição cortou e
                parou. O email ainda não saiu e a proposta ainda não foi gravada
                — é o último instante em que voltar atrás não custa nada. A
                frase de cada corte é a mesma que o aviso da pré-visualização
                usa; o que muda é a altura em que aparece. */
            cortesPorConfirmar ? (
              <div className="ml-auto flex flex-col items-end gap-2">
                <div className="max-w-lg rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
                  <p className="font-medium">O documento sai com conteúdo cortado:</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {cortesPorConfirmar.map((c) => (
                      <li key={`${c.where}:${c.unit}`}>· {fraseDeCorte(c)}</li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[var(--bo-text-muted)]">
                    Volta atrás para encurtar o que ficou cortado, ou envia assim mesmo se for de
                    propósito.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => void send(true)}
                    disabled={busy !== null}
                  >
                    Enviar assim mesmo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      // Leva ao passo onde o corte se corrige: as fotos a
                      // mais estão nos mood boards, o nome comprido está na
                      // capa (o passo do Evento), e as outras linhas cortadas
                      // são de serviços.
                      const corte = cortesPorConfirmar?.[0];
                      setStep(
                        !corte
                          ? "evento"
                          : corte.unit === "fotos"
                            ? "inspiracao"
                            : /capa/i.test(corte.where)
                              ? "evento"
                              : "servicos",
                      );
                      setCortesPorConfirmar(null);
                    }}
                  >
                    Voltar e corrigir
                  </Button>
                </div>
              </div>
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
                  Enviar para{" "}
                  <strong className="font-medium text-[var(--bo-text)]">
                    {quote.email || "o cliente"}
                  </strong>
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
                  <PastilhaDoEnvio
                    faltas={faltasDoEnvio}
                    fotosPorConfirmar={fotosPorConfirmar}
                    idioma={idiomaDoPdf}
                    onAbrir={() => setFolhaDoEnvio(true)}
                  />
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
            <Button size="sm" variant="ghost" onClick={() => setStep("evento")}>
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
          fotosDaProposta={fotosDaProposta}
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

// ── Small presentational helpers ──

/**
 * As páginas que uma proposta tem SEM contar com a inspiração.
 *
 * MEDIDO, não estimado: gerou-se o PDF de um documento com 0, 1 e 3 mood
 * boards e contaram-se as folhas — 7, 8 e 10. Sete fixas, mais uma por página
 * de inspiração.
 *
 * Um texto muito longo (condições reescritas à mão, uma lista de serviços
 * enorme) pode empurrar uma secção para a folha seguinte. Daí o «cerca de» na
 * frase que mostra este número: é um piso honesto, não uma promessa.
 */

/**
 * As medições das gerações de PDF, partilhadas por TODAS as propostas.
 *
 * Sem o id do pedido de propósito: o que se aprende numa proposta serve para a
 * seguinte — é a mesma máquina, a mesma ligação e o mesmo servidor. Preso à
 * proposta, a primeira geração de cada uma seria sempre uma adivinha.
 *
 * A chave mudou com o desenho novo do PDF (`pdf-editorial`): as medições do
 * antigo — ~1 s e ~190 KB por foto — ensinavam a recta errada ao novo, que
 * custa quase tudo à cabeça. As antigas ficam esquecidas no navegador.
 */
const AMOSTRAS_KEY = "liquen-proposal-studio:geracoes-editorial";

/**
 * Uma linha do bloco de totais: o nome à esquerda, o número à direita.
 *
 * `dt`/`dd` e não duas `span`: são pares de rótulo e valor, e é isso que faz um
 * leitor de ecrã ler «Total a pagar, 3.025,80 €» em vez de duas coisas soltas.
 * Os números vão com `tabular-nums` para as vírgulas ficarem uma por baixo da
 * outra — num quadro de dinheiro, colunas desalinhadas leem-se como erros.
 */
function LinhaDeTotal({
  rotulo,
  valor,
  /** O resultado de uma soma, e não uma parcela. */
  forte,
  /** Traço por cima, a separar as parcelas do que elas dão. */
  regua,
}: {
  rotulo: React.ReactNode;
  valor: string;
  forte?: boolean;
  regua?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        regua ? "border-t border-[var(--bo-hairline-strong)] pt-1.5" : ""
      }`}
    >
      <dt className={forte ? "text-[var(--bo-tinta-72)]" : "text-[var(--bo-text-muted)]"}>
        {rotulo}
      </dt>
      <dd
        className={`tabular-nums ${
          forte ? "text-sm font-semibold text-[var(--bo-text)]" : "text-[var(--bo-tinta-72)]"
        }`}
      >
        {valor}
      </dd>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ISTO NÃO SAI PELA ORDEM QUE AQUI VÊS» — DITO, E COM SAÍDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Enquanto a ordem vier sugerida pela lista de Serviços, a lista desenhada por
 * baixo NÃO é a ordem em que os campos estão guardados. É a ordem certa — a
 * que sai impressa — mas uma lista que se reordena sozinha sem dizer nada é
 * uma lista em que não se confia.
 *
 * A frase diz o que está a acontecer; o botão dá a saída, que é passar a
 * mandar nela (`ordemExplicita`). Nem sequer é uma acção destrutiva: escreve
 * exactamente a ordem que já está à vista.
 */
/**
 * A fotografia que vai na mão, enquanto se arrasta.
 *
 * Sem isto, arrastar de um board para outro é mover um buraco: a célula de
 * origem esvazia-se e não há nada a acompanhar o cursor até ao destino — o que
 * numa página com oito boards quer dizer largar às cegas.
 */
function FantasmaDaFoto({
  id,
  doc,
  urls,
}: {
  id: string | null;
  doc: StudioDoc;
  urls: Record<string, string>;
}) {
  if (!id) return null;
  const partes = id.split(":");
  if (partes[0] !== "foto") return null;
  const caminho = doc.moodBoards[Number(partes[1])]?.images[Number(partes[2])];
  const url = caminho ? urls[caminho] : undefined;
  return (
    <div className="h-24 w-24 overflow-hidden rounded-lg border border-white/40 bg-[var(--bo-tinta-10)] shadow-[var(--bo-sombra-suspensa)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : null}
    </div>
  );
}

/**
 * A barra do conjunto: «3 fotografias escolhidas → mover para…».
 *
 * Palavras dela: «Também com seleção múltipla, para mover várias de uma vez.»
 * Arrastar uma a uma resolve o engano de uma foto; quando um board inteiro foi
 * parar ao sítio errado — o que acontece ao colar uma pasta da biblioteca —,
 * são vinte gestos.
 *
 * Só aparece quando há alguma coisa escolhida: uma barra permanentemente ali é
 * uma linha de ruído em todas as outras vezes.
 */
function BarraDaSeleccao({
  quantas,
  boards,
  onMover,
  onLimpar,
}: {
  quantas: number;
  boards: StudioDoc["moodBoards"];
  onMover: (paraBoard: number) => void;
  onLimpar: () => void;
}) {
  if (quantas === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-sage-600/35 bg-sage-600/[0.06] px-3 py-2">
      <p className="text-xs font-medium text-[var(--bo-tinta-72)]">
        {quantas === 1 ? "1 fotografia escolhida" : `${quantas} fotografias escolhidas`}
      </p>
      <label className="flex items-center gap-1.5 text-xs text-[var(--bo-text-muted)]">
        Mover para
        <select
          // Volta sempre a «—» depois de mover: é uma acção, não um estado, e
          // um selector que ficasse a mostrar o último destino leria como se a
          // selecção ainda lá estivesse.
          value=""
          onChange={(e) => {
            const bi = Number(e.target.value);
            if (Number.isInteger(bi)) onMover(bi);
          }}
          className="bo-input w-44 px-2 py-1 text-xs"
          aria-label="Mover as fotografias escolhidas para outro mood board"
        >
          <option value="">—</option>
          {boards.map((b, bi) => (
            <option key={bi} value={bi}>
              {b.title?.trim() || `Mood board ${bi + 1}`}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onLimpar}
        className={`alvo-toque text-xs font-medium text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
      >
        Limpar
      </button>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA DESCRIÇÃO QUE SE VÊ INTEIRA — A CAIXA É QUE CRESCE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A descrição de um mood board tinha `rows={2}` e o resto rolava lá dentro.
 * MEDIDO a 390 px, na proposta de que a dona do negócio mandou fotografia:
 *
 *     campo (pt)   70 px de altura   224 px de conteúdo   →  154 px escondidos
 *     campo (en)   70 px de altura   276 px de conteúdo   →  206 px escondidos
 *
 * Sessenta e nove por cento do texto português fora de vista, e sete por cento
 * do que se vê é meia frase — a captura lê-se «…cores escolhida pelos noivos,
 * em jarras de vidro que podem ser transparentes ou de cor . Integração de
 * velas…», com o princípio cortado por cima. Uma barra de deslocação dentro de
 * uma caixa de 70 px, num telemóvel, não é uma forma de ler: é texto invisível
 * com um sinal de que existe.
 *
 * Uma linha por omissão (uma caixa vazia é mais pequena do que era) e cresce
 * com o que lá está. É o mesmo remédio — e a mesma conta das bordas — do
 * `CampoQueCresce` do `ServicesEditor` e do `TextareaQueCresce` da
 * `CaixaInglesa`; aqui não se importa de nenhum dos dois porque nenhum deles é
 * exportado e um export só para quatro linhas ataria o estúdio ao editor de
 * serviços.
 *
 * `useLayoutEffect` e não `useEffect`: com o segundo, a caixa aparecia com uma
 * linha e saltava para as suas à frente de quem escreve.
 */
function DescricaoQueCresce({
  valor,
  ...resto
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "rows" | "ref"> & {
  valor: string;
}) {
  const meu = useRef<HTMLTextAreaElement | null>(null);
  // ── VAZIA É UMA LINHA, E ISSO TEVE DE SER DITO ────────────────────────
  // MEDIDO: um `<textarea>` VAZIO com este `placeholder` devolve
  // `scrollHeight: 120` no Chrome — o placeholder é maquetizado como texto e
  // conta. Sem altura escrita à mão, o `rows={1}` manda, e o mínimo de toque
  // (44 px, globals.css) faz o resto. E só se mede quando se vê — ver
  // `ui/altura-do-conteudo.ts`.
  useAlturaDoConteudo(meu, valor, { vaziaSemAltura: true });
  return <textarea {...resto} value={valor} rows={1} ref={meu} />;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE PODE FAZER A UMA FOTOGRAFIA, SEM A TIRAR DE LÁ PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Antes havia um botão só, o × de remover, e só aparecia ao passar o rato.
 * Num telemóvel — que é onde metade deste trabalho é feito — isso é um botão
 * que não existe; e no computador era a única resposta para «esta foto está no
 * sítio errado», o que fazia de remover a ferramenta para tudo.
 *
 * ── PORQUE É QUE COM RATO ESTÁ NUMA BARRA E AO TOQUE NUM «⋯» ──────────────
 *
 * MEDIDO a 375 px, template Decoração, dois mood boards com 3 e 4 fotografias,
 * proposta bilingue ligada — o ecrã de que a dona do negócio mandou fotografia:
 *
 *     célula da miniatura            84 × 72 px
 *     botão (o `alvo-toque` no dedo) 44 × 44 px
 *     sete botões, a quebrar         84 × 328 px
 *     sobe acima da própria foto        256 px
 *     z-index                              20
 *
 * Sete alvos de 44 px NÃO CABEM numa célula de 84: o `flex-wrap` empilhava-os
 * numa coluna quatro vezes e meia mais alta do que a miniatura, e o
 * `absolute bottom-0` fazia essa coluna crescer PARA CIMA, por cima do que
 * estivesse lá — com `z-20`, portanto por cima e não por baixo. Com sete
 * fotografias na página eram sete colunas de quadrados escuros a atravessar o
 * subtítulo, a caixa EN e a descrição. Medido: 13 pedaços de texto tapados,
 * entre eles «Two columns with Roman vase…» com 53 × 29 px de letra por baixo
 * de um quadrado preto.
 *
 * A regra antiga (`[@media(hover:none)]:opacity-100`) estava certa no
 * princípio — num ecrã táctil, «aparece no hover» quer dizer «não existe» — e
 * errada no resultado: tornou visíveis sete botões que não têm onde caber.
 *
 * Agora a FORMA muda com o apontador, e não só a opacidade:
 *   · com rato  — a barra de sete ícones de 24 px, revelada ao passar por
 *                 cima, exactamente como sempre esteve;
 *   · com dedo  — UM «⋯» de 44 px no canto da miniatura, que abre a folha
 *                 inferior com as sete acções escritas por extenso.
 *
 * Tudo em CSS e não com o `usePodeEsconderNoHover()`: um hook lê `false` no
 * servidor e no primeiro desenho, e o computador via o «⋯» a piscar antes de a
 * barra aparecer. A media query não tem primeiro desenho errado.
 *
 * ── E A PERGUNTA É `com-rato`, NÃO `(hover: none)` — ISTO VOLTOU ──────────
 *
 * A barra voltou a aparecer por cima das células, e a dona do negócio mandou a
 * fotografia. A causa é uma pergunta MAL PARTIDA em duas: a barra escondia-se
 * com `(hover: none)`, mas o tamanho dos botões cresce com `(pointer: coarse)`
 * (`.alvo-toque`, em globals.css). São duas perguntas diferentes, e há
 * aparelhos que respondem SIM à segunda e NÃO à primeira: um iPhone ou um iPad
 * com AssistiveTouch, com rato ou com trackpad ligados, e um portátil de ecrã
 * táctil. Nesses, `(hover: none)` é falso — a barra fica — e
 * `(pointer: coarse)` é verdadeiro — cada ícone salta de 24 px para 44.
 *
 * MEDIDO num Chromium com `primaryPointerType=coarse` e `primaryHoverType=hover`,
 * a 390 px, na proposta das capturas (nove fotos, um mood board):
 *
 *     célula                                   89 × 104 px
 *     barra                                    89 × 328 px
 *     sobe acima do topo da própria célula         209 px
 *     cada um dos sete botões                   44 × 44 px
 *     «⋯» (o caminho do dedo)               display: none
 *     pedaços de texto tapados                          5
 *
 * — incluindo o «Imagem guardada» e o «Não consegui mostrá-la neste ecrã.» da
 * própria célula. E, mesmo a `opacity: 0`, a barra continua a APANHAR o toque:
 * `elementFromPoint` no meio do «Tentar novamente» devolvia o botão «Mover para
 * trás». O botão que explica a avaria estava debaixo de um botão invisível.
 *
 * A casa já tem a pergunta inteira, e é uma só: `com-rato`
 * (`(hover: hover) and (pointer: fine)`, globals.css). Os dois lados penduram-se
 * nela — `hidden com-rato:flex` na barra, `com-rato:hidden` no «⋯» — pela razão
 * escrita lá: um browser que não perceba de ponteiros mostra as DUAS formas,
 * feio mas inteiro, em vez de não mostrar nenhuma.
 *
 * E os sete botões da barra deixaram de ser `alvo-toque`. A barra só existe
 * onde há rato, e com rato o mínimo de 44 px nunca se aplica — mas era ele que,
 * quando a media query falhava, transformava 7 × 24 px numa coluna de 328. Sem
 * ele, o pior caso deixa de poder acontecer.
 *
 * ── E REMOVER FICOU MAIS DIFÍCIL DE ACERTAR POR ENGANO, NÃO MAIS FÁCIL ─────
 * Estava um × de 44 px encostado ao ✓ de escolher, dentro de uma célula de 84 —
 * dois alvos a 4 px um do outro, num sítio onde o dedo tapa os dois. Passa a
 * ser uma linha escrita «Remover fotografia», em baixo, separada por um traço
 * das que não apagam nada, e a vermelho. É a mesma regra que o `MenuDeAccoes`
 * já aplica às linhas das tabelas.
 *
 * ── AS SETAS NÃO SÃO UM ADORNO ────────────────────────────────────────────
 * São o caminho do teclado (e do dedo trémulo). Arrastar exige apontar, mover e
 * largar sem falhar; mover uma foto uma casa é um toque, e é o gesto que se faz
 * dez vezes seguidas ao afinar uma página.
 */
function AccoesDaFoto({
  nome = "esta fotografia",
  podeRecuar,
  podeAvancar,
  principal,
  seleccionada,
  onRecuar,
  onAvancar,
  onAmpliar,
  onSubstituir,
  onPrincipal,
  onSeleccionar,
  onRemover,
}: {
  /** Como se chama esta fotografia na folha do telemóvel («Fotografia 2 de
   *  Decoração Cerimónia»). Sete linhas escritas precisam de dizer a QUEM se
   *  aplicam — a barra de ícones não precisava, porque está em cima da foto. */
  nome?: string;
  podeRecuar: boolean;
  podeAvancar: boolean;
  /** `undefined` = esta disposição não tem lugar de destaque; o botão não aparece. */
  principal?: boolean;
  seleccionada: boolean;
  onRecuar: () => void;
  onAvancar: () => void;
  onAmpliar: () => void;
  onSubstituir: () => void;
  onPrincipal: () => void;
  onSeleccionar: () => void;
  onRemover: () => void;
}) {
  const [folhaAberta, setFolhaAberta] = useState(false);
  /* SEM `alvo-toque`, e é o coração da correcção: esta barra só existe onde há
     rato (`com-rato`), e ali o mínimo de 44 px nunca se aplicaria de qualquer
     maneira. O que ele fazia era garantir que, no dia em que a media query
     falhasse, sete ícones de 24 px se tornassem sete quadrados de 44 — que é a
     coluna de 328 px medida em cima. */
  const botao =
    "flex h-6 w-6 items-center justify-center rounded-md bg-black/55 text-[11px] leading-none text-white hover:bg-black/75 disabled:opacity-30";

  /* A MESMA lista para os dois caminhos. Duas listas seriam duas versões da
     verdade — a acção acrescentada num sítio e esquecida no outro é a forma
     mais barata de o telemóvel voltar a ficar para trás. */
  const accoes: {
    id: string;
    rotulo: string;
    glifo: string;
    onAccao: () => void;
    desativada?: boolean;
    activa?: boolean;
    destrutiva?: boolean;
  }[] = [
    {
      id: "recuar",
      rotulo: "Mover para trás",
      glifo: "←",
      onAccao: onRecuar,
      desativada: !podeRecuar,
    },
    {
      id: "avancar",
      rotulo: "Mover para a frente",
      glifo: "→",
      onAccao: onAvancar,
      desativada: !podeAvancar,
    },
    { id: "ampliar", rotulo: "Ver em grande", glifo: "⤢", onAccao: onAmpliar },
    { id: "substituir", rotulo: "Trocar por outra fotografia", glifo: "⇄", onAccao: onSubstituir },
    ...(principal !== undefined
      ? [
          {
            id: "principal",
            rotulo: principal
              ? "Deixar de ser a fotografia do cartão"
              : "Fotografia do cartão (a primeira do tema no PDF)",
            glifo: "★",
            onAccao: onPrincipal,
            activa: principal,
          },
        ]
      : []),
    {
      id: "seleccionar",
      rotulo: seleccionada ? "Retirar da selecção" : "Escolher para mover em conjunto",
      glifo: "✓",
      onAccao: onSeleccionar,
      activa: seleccionada,
    },
    {
      id: "remover",
      rotulo: "Remover fotografia",
      glifo: "×",
      onAccao: onRemover,
      destrutiva: true,
    },
  ];

  return (
    <>
      {/* ── O CAMINHO DO DEDO: um alvo, e as sete acções por extenso ────────
          `flex com-rato:hidden` — existe por omissão e desaparece só onde há
          MESMO rato. Antes era `hidden [@media(hover:none)]:flex`, e num
          telemóvel com trackpad ou AssistiveTouch (onde `(hover: none)` é
          falso) isto ficava em `display: none`: sem barra utilizável e sem
          «⋯», a célula não tinha acção nenhuma. Fica no canto inferior direito
          da miniatura e mede 44 px numa célula de 84×72: cabe, e é o único que
          cabe. */}
      <button
        type="button"
        onClick={() => setFolhaAberta(true)}
        aria-label={`Acções de ${nome}`}
        aria-haspopup="dialog"
        className={`alvo-toque pointer-events-auto absolute right-0.5 bottom-0.5 z-20 flex h-11 w-11 items-center justify-center rounded-lg bg-black/60 text-white com-rato:hidden ${ESTADO} ${PRESSAO}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
      </button>

      <FolhaOuDialogo
        aberto={folhaAberta}
        onFechar={() => setFolhaAberta(false)}
        titulo={nome}
        descricao="O que se pode fazer a esta fotografia."
        largura="sm"
      >
        <div className="flex flex-col">
          {accoes.map((a, i) => {
            // Um traço antes da primeira que apaga: é o que impede o toque
            // distraído em «Remover» quando se queria a linha de cima.
            const primeiraDestrutiva =
              a.destrutiva && !accoes.slice(0, i).some((x) => x.destrutiva);
            return (
              <button
                key={a.id}
                type="button"
                disabled={a.desativada}
                onClick={() => {
                  setFolhaAberta(false);
                  a.onAccao();
                }}
                className={`alvo-toque !justify-start flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm  disabled:opacity-30 ${
                  a.destrutiva
                    ? "text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)]/[0.07]"
                    : "text-[var(--bo-text)] hover:bg-[var(--bo-tinta-6)]"
                } ${primeiraDestrutiva ? "mt-1 border-t border-[var(--bo-hairline)] pt-3" : ""} ${ESTADO} ${PRESSAO}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[13px] ${
                    a.activa
                      ? "bg-sage-600 text-white"
                      : "bg-[var(--bo-tinta-6)] text-[var(--bo-text-muted)]"
                  }`}
                >
                  {a.glifo}
                </span>
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </FolhaOuDialogo>

      {/* ── O CAMINHO DO RATO: DUAS ACÇÕES, E O RESTO A UM TOQUE ───────────
          Palavras dela: «controlos sobrepostos à imagem». Eram seis círculos
          escuros a tapar a faixa de baixo da fotografia — que é onde costuma
          estar o que interessa numa foto de mesa posta —, e tapavam-na
          precisamente enquanto ela está a olhar para ela.

          Ficam duas: as setas. São o gesto que se faz cem vezes por proposta, e
          mandá-las para dentro de uma folha era trocar um clique por dois no
          trabalho de todos os dias. As outras quatro — ver em grande, trocar,
          principal, escolher — e a que APAGA passam para a folha, que já existe
          e já é a única coisa que o dedo vê. Uma lista escrita por extenso, com
          o «Remover» separado por um traço, é melhor sítio para o botão
          destrutivo do que um círculo de 24 px ao lado de outros cinco iguais.

          `hidden com-rato:flex`: não existe até haver rato — nem desenhada nem
          a apanhar toques. */}
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden flex-wrap items-center justify-center gap-0.5 p-1 opacity-0 ${ESTADO} group-hover/foto:opacity-100 focus-within:opacity-100 com-rato:flex`}
      >
        <span className="pointer-events-auto flex flex-wrap items-center justify-center gap-0.5">
          <button
            type="button"
            className={`${botao} ${ESTADO} ${PRESSAO}`}
            onClick={onRecuar}
            disabled={!podeRecuar}
            aria-label="Mover para trás"
          >
            <span aria-hidden="true">←</span>
          </button>
          <button
            type="button"
            className={`${botao} ${ESTADO} ${PRESSAO}`}
            onClick={onAvancar}
            disabled={!podeAvancar}
            aria-label="Mover para a frente"
          >
            <span aria-hidden="true">→</span>
          </button>
          {/* A MESMA folha do dedo, e não uma segunda lista: a acção
              acrescentada num sítio e esquecida no outro é a forma mais barata
              de os dois caminhos divergirem. */}
          {/* SEM tom de estado: a célula já diz o que está ligado — anel verde
              à volta quando está escolhida, etiqueta «principal» no canto. Um
              «⋯» verde ler-se-ia como se o próprio botão estivesse ligado. */}
          <button
            type="button"
            className={`${botao} ${ESTADO} ${PRESSAO}`}
            onClick={() => setFolhaAberta(true)}
            aria-haspopup="dialog"
            aria-label={`Mais acções de ${nome}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
          </button>
        </span>
      </div>
    </>
  );
}

function AvisoDeOrdem({
  mostrar,
  onde,
  onFixar,
}: {
  mostrar: boolean;
  /** «As linhas do orçamento», «As páginas de inspiração». */
  onde: string;
  onFixar: () => void;
}) {
  if (!mostrar) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] px-3 py-2">
      <p className="min-w-[16rem] flex-1 text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
        {onde} estão pela ordem da lista de <strong className="font-medium">Serviços</strong>, que é
        a ordem por que o PDF sai — e não pela ordem em que foram escritas. Arruma os Serviços e
        isto acompanha.
      </p>
      <button
        type="button"
        onClick={onFixar}
        className={`alvo-toque shrink-0 rounded-lg border border-[var(--bo-hairline-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--bo-tinta-72)] hover:border-foreground/30 hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
      >
        Arrumar eu
      </button>
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UMA SECÇÃO NUNCA APARECE FECHADA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «as secções aparecem colapsadas». E aparecer colapsada é o
 * mesmo que não existir — a proposta abria com o Evento, as Capas, os
 * Serviços, os Mood boards, o Orçamento e o Total todos dobrados, e o que se
 * via era uma pilha de títulos.
 *
 * ── O QUE ISTO ERA, E PORQUE É QUE PARECIA BOA IDEIA ──────────────────────
 *
 * Havia um automatismo escrito a partir de um pedido antigo — «secções
 * concluídas recolhem-se automaticamente» — que tirava uma fotografia do que
 * já estava preenchido quando a proposta abria e fechava essas. Numa proposta
 * a meio, funciona. Numa proposta ACABADA, que é o caso de todas as que ela
 * reabre para conferir antes de enviar, está tudo preenchido — portanto
 * fechava-se tudo. O automatismo era mais certeiro precisamente onde fazia
 * mais estrago.
 *
 * E havia uma segunda camada: a dobra ficava guardada no `localStorage`. Um
 * «fechar» de há três semanas, feito para chegar depressa ao fundo da página,
 * continuava a fechar a secção hoje — sem nada no ecrã que dissesse porquê.
 *
 * ── O QUE FICA ────────────────────────────────────────────────────────────
 *
 * A dobra continua a existir e continua a ser útil: dobrar os Serviços para
 * chegar ao Total num telemóvel é um gesto legítimo. O que deixa de existir é
 * a dobra que ninguém pediu AGORA — nem o automatismo, nem a memória entre
 * visitas. Abrir a proposta mostra a proposta.
 *
 * E DEIXOU DE HAVER EXCEPÇÃO. O «Só para ti» (`PainelInterno.tsx`) nascia
 * fechado por outra razão — são custos e margem, e não é isso que se quer no
 * ecrã quando alguém está ao lado a ver. Ela pediu-o aberto («coloca esta barra
 * já aberta por definição»), e a razão antiga continua verdadeira: o que mudou
 * é quem decide se vale a troca. O princípio passa a valer sem ressalvas.
 */
/**
 * As três maneiras de a proposta seguir, com os logótipos a cores (#212). São
 * as MESMAS no topo do passo 5 e na barra de baixo (14/10): dois controlos do
 * mesmo estado não podem dizer coisas diferentes.
 */
const OPCOES_DO_CANAL: { value: CanalDeEnvio; label: string; icon: React.ReactNode }[] = [
  { value: "email", label: "Email", icon: <LogotipoEmail /> },
  { value: "whatsapp", label: "WhatsApp", icon: <LogotipoWhatsApp /> },
  {
    value: "ambos",
    label: "Os dois",
    icon: (
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        <LogotipoEmail />
        <LogotipoWhatsApp />
      </span>
    ),
  },
];

function Section({
  title,
  children,
  /** Chave estável — a âncora do salto da Conferência. */
  id,
  /** Marca à direita do título — "3 linhas", "por preencher". */
  nota,
  /** Um controlo à direita do título — o "Reordenar" dos Serviços, por
   *  exemplo. Fica FORA do botão que dobra a secção: um botão dentro de outro
   *  botão não é HTML válido, e clicar num fecharia o outro. */
  accao,
  /**
   * O que fica no FUNDO da secção, depois do conteúdo — hoje, a nota interna
   * daquela secção.
   *
   * ── PORQUE É UMA RANHURA DA SECÇÃO E NÃO MAIS UM FILHO ──────────────────
   *
   * Podia ser escrito como último filho em cada uma das seis. Seria a mesma
   * coisa até ao dia em que uma delas ficasse com a nota no meio do conteúdo
   * — e uma nota interna que aparece onde calha, ao pé de campos que SAEM na
   * proposta, é exactamente o que o papel amarelo do `NotasInternas` existe
   * para evitar. A ranhura garante que está sempre no mesmo sítio, por baixo
   * de tudo, e que se dobra com a secção como o resto.
   */
  rodape,
  /**
   * A secção é de OUTRO passo (A2). Fica montada e só se esconde — o
   * formulário é um só, e um campo desmontado perdia o foco e o trabalho a
   * meio. Ver `passos-do-estudio.ts`.
   */
  escondida = false,
}: {
  title: string;
  children: React.ReactNode;
  id?: string;
  nota?: string;
  accao?: React.ReactNode;
  rodape?: React.ReactNode;
  escondida?: boolean;
}) {
  const [fechada, setFechada] = useState(false);
  /**
   * ── E O CORPO ENTRA QUANDO ELA ABRE — NUNCA AO CARREGAR ─────────────────
   *
   * A secção fechada continua a ter os campos no formulário (é o `hidden` aqui
   * em baixo, e a razão está escrita lá): abrir e fechar é uma troca de
   * `display`, e uma troca de `display` é o corte mais seco que há. Passa a
   * haver a `.bo-entrada` da casa — 240 ms, quatro píxeis, a curva de quem
   * apresenta.
   *
   * O que este estado guarda, e é a parte que importa, é que a entrada SÓ
   * corre depois de ela tocar no título. Se a classe estivesse ligada apenas
   * ao `!fechada`, as nove secções — que abrem todas abertas, de propósito —
   * animavam ao mesmo tempo no instante em que a proposta abre, por cima da
   * `.view-in` que o passo já traz. Duas apresentações do mesmo ecrã ao mesmo
   * tempo lê-se como um salto, não como uma entrada.
   *
   * Depois do primeiro toque a classe fica, e é isso que faz a entrada correr
   * de cada vez que a secção volta: um elemento que sai de `display: none`
   * recomeça a animação sozinho, sem temporizador e sem remontar nada.
   *
   * A `.bo-entrada` acaba sem `fill-mode`, portanto não deixa `transform`
   * pendurado — o que quebraria a barra `sticky` do fundo se ela estivesse cá
   * dentro. Não está: é irmã dos três passos, e não filha de nenhuma secção.
   */
  const [jaAbriuAMao, setJaAbriuAMao] = useState(false);

  function alternar() {
    if (!id) return;
    if (fechada) setJaAbriuAMao(true);
    setFechada((v) => !v);
  }

  const corpoId = id ? `sec-${id}` : undefined;
  return (
    <Card className="mb-4" id={id ? `seccao-${id}` : undefined} hidden={escondida}>
      {/* `flex-wrap`: SEM ela, um `nota` comprido («Mood boards», com "0
          páginas · 0 fotos · PDF com cerca de 7" ao lado) e o título competiam
          pela MESMA linha sem ninguém a ceder por inteiro — o `nota` já vinha
          `shrink-0` (não podia encolher), portanto era sempre o título a levar
          com o aperto. MEDIDO a 375 px: o botão do título ficava com 66×56 px
          e o `h3` com 49×40 — «Mood boards» a partir-se em «Mood» / «boards».
          «Só para ti», ao lado (`PainelInterno.tsx`), tinha o mesmo problema
          por uma razão parecida.

          Com a quebra ligada e o BOTÃO do título também `shrink-0` (a seguir),
          o título deixa de ceder espaço nenhum: quando não cabem os dois lado
          a lado, é o `nota` — que já não encolhe — a descer inteiro para a
          linha de baixo, como já acontecia nas linhas de Serviços. */}
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        {id ? (
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!fechada}
            aria-controls={corpoId}
            /* `alvo-toque` + `py-2`: o cabeçalho de uma secção É o interruptor
               que a abre e fecha, e media 20 px de altura — metade do mínimo de
               44. Num telemóvel, abrir "Serviços" era acertar numa faixa da
               espessura de uma linha de texto. O `items-baseline` mantém-se para
               a seta e o título continuarem alinhados pela base.
               `shrink-0`: ver o comentário acima do invólucro — o título nunca
               é quem cede espaço a um `nota` comprido. */
            className={`alvo-toque group -my-1 flex shrink-0 items-baseline gap-2 py-2 text-left ${ESTADO} ${PRESSAO}`}
          >
            {/* ── A SETA DEMORA O QUE AS IRMÃS DEMORAM ────────────────────
                Tinha `motion-safe:transition-transform` e mais nada — sem
                duração, o Tailwind cai no seu `--default-transition-duration`,
                que são 150 ms que ninguém escolheu (é a mesma avaria que o
                `ui/movimento.ts` conta por extenso, e a razão de os números
                dele estarem escritos um a um).

                As duas setas irmãs desta casa já escolheram: a do «Mais do
                painel» (`Overview.tsx`, pela `.bo-mais-seta` do `globals.css`)
                e a dos «Detalhes (opcional)» (`Tarefas.tsx:810`) rodam as duas
                em 200 ms com a `cubic-bezier(0, 0, 0.2, 1)` — o registo do
                back office, o mesmo dos 240/600 ms. Esta passa a ser a
                terceira, e não uma quarta velocidade.

                ── E A LISTA COBRE MESMO O `rotate` ────────────────────────
                No Tailwind v4 `rotate-90` emite a propriedade AUTÓNOMA
                `rotate: 90deg`, não um `transform` — a armadilha que já mordeu
                esta casa duas vezes. O que a fecha é a forma NOMEADA:
                compilado com o Tailwind 4.3.0 deste repositório,
                `transition-transform` sai como
                `transition-property: transform, translate, scale, rotate`, e
                cobre-a. Quem NÃO a cobre é a forma entre parênteses rectos —
                `transition-[transform]` sai literal e deixa o `rotate` de fora.
                Por isso fica a nomeada, e uma varredura prende-a. */}
            <span
              aria-hidden
              className={`text-[10px] text-foreground/35 motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0,0,0.2,1)] ${fechada ? "" : "rotate-90"}`}
            >
              ▶
            </span>
            <h3 className="font-display text-base leading-tight text-[var(--bo-text)] group-hover:text-foreground">
              {title}
            </h3>
          </button>
        ) : (
          <h3 className="font-display shrink-0 text-base leading-tight text-[var(--bo-text)]">
            {title}
          </h3>
        )}
        {nota && <span className="shrink-0 text-xs text-foreground/45">{nota}</span>}
        {accao && <div className="shrink-0">{accao}</div>}
      </div>
      {/* `hidden` e não desmontar: uma secção fechada continua a ter os campos
          no formulário, e fechá-la não pode apagar o que lá está escrito.
          A `.bo-entrada` entra por cima disso e não em vez disso — ver
          `jaAbriuAMao`, lá em cima, para o porquê de ela só chegar ao primeiro
          toque dela. */}
      <div
        id={corpoId}
        hidden={fechada}
        /* `bo-entrada-folha` — oito píxeis e não quatro, o mesmo que a dobra da
           disposição: quatro é a distância de um item de menu, e isto é um
           bloco de conteúdo a descer para dentro da página. */
        className={jaAbriuAMao ? "bo-entrada bo-entrada-folha" : undefined}
      >
        {children}
        {rodape}
      </div>
    </Card>
  );
}

/**
 * Indicador de passos "1 · Conteúdo → 2 · Pré-visualizar → 3 · Enviar".
 *
 * ── NO TELEMÓVEL, OS NÚMEROS E SÓ O NOME DO PASSO ONDE SE ESTÁ ────────────
 * MEDIDO a 375 px: os três botões com os nomes por extenso, mais as duas setas
 * e os intervalos, pedem 396 px de fila num espaço de 343 — a fila quebrava e
 * o «3 Enviar» ficava sozinho numa segunda linha, sem seta a ligá-lo, a
 * parecer outra coisa em vez do terceiro passo.
 *
 * O nome dos passos onde NÃO se está passa a `sr-only` abaixo de 640 px: fica
 * o número, que é o que dá o sentido de percurso, e o passo activo continua a
 * dizer o nome — que é a única pergunta a que isto responde quando se está a
 * meio («onde estou?»). Acima de 640 px não muda nada.
 *
 * `sr-only` e NÃO `hidden`: `display: none` tira o texto da árvore de
 * acessibilidade, e o botão passava a chamar-se «2» para quem usa leitor de
 * ecrã — e para os testes que o procuram por «Pré-visualizar».
 */
/**
 * ── A BARRA DOS CINCO PASSOS ─────────────────────────────────────────────────
 *
 * Do documento dela (A2): «a navegação dos passos sempre visível», e «cada
 * passo diz se está completo, incompleto ou com erro». Fica colada ao topo do
 * estúdio, por baixo do cabeçalho do back office (`--bo-cabecalho`, que o
 * `AdminClient` publica), e salta-se livremente entre passos — o formulário é
 * um só e está sempre montado, por isso nada se perde.
 *
 * O sinal não fala só pela cor: ✓, • e ! têm forma própria, e o leitor de
 * ecrã ouve «completo», «por completar» ou «com erros» a seguir ao nome.
 *
 * No telemóvel fica o número e o sinal; o nome só no passo activo, como já era.
 */
const SINAL_DO_ESTADO: Record<EstadoDoPasso, { sinal: string; cor: string }> = {
  completo: { sinal: "✓", cor: "text-[var(--bo-sucesso)]" },
  incompleto: { sinal: "•", cor: "text-[var(--bo-aviso)]" },
  erro: { sinal: "!", cor: "text-[var(--bo-perigo)]" },
};

function StepNav({
  step,
  onSelect,
  estados,
  organizacao,
}: {
  step: Step;
  onSelect: (s: Step) => void;
  estados: Record<Step, EstadoDoPasso>;
  organizacao: boolean;
}) {
  return (
    <nav
      aria-label="Passos da proposta"
      className="sticky top-[var(--bo-cabecalho,0px)] z-10 -mx-1 mb-5 flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b border-[var(--bo-hairline)] bg-[var(--bo-surface)] px-1 py-2 [scrollbar-width:none] [&>button]:shrink-0"
    >
      {PASSOS.map((p, i) => {
        const active = p === step;
        const estado = estados[p];
        const { sinal, cor } = SINAL_DO_ESTADO[estado];
        const nome = nomeDoPasso(p, organizacao);
        return (
          <Fragment key={p}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              aria-current={active ? "step" : undefined}
              data-estado={estado}
              className={`alvo-toque gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-xs font-medium  inline-flex items-center ${
                active
                  ? "bg-sage-600 text-white"
                  : "text-foreground/50 hover:bg-[var(--bo-tinta-6)] hover:text-[var(--bo-text)]"
              } ${ESTADO} ${PRESSAO}`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                  active
                    ? "bg-[var(--bo-surface)]/25 text-white"
                    : "bg-[var(--bo-tinta-10)] text-foreground/50"
                }`}
              >
                {i + 1}
              </span>
              {/* Um `span` só, com o rótulo INTEIRO lá dentro. Partir a frase
                  em pedaços dentro de um `inline-flex` põe cada pedaço na sua
                  própria coluna. */}
              <span className={active ? undefined : "max-sm:sr-only"}>{nome}</span>
              <span
                aria-hidden="true"
                className={`text-[11px] font-semibold ${active ? "text-white" : cor}`}
              >
                {sinal}
              </span>
              <span className="sr-only">, {FRASE_DO_ESTADO[estado]}</span>
            </button>
            {/* As setas saem no telemóvel: com cinco passos, eram elas que
                partiam a barra em duas linhas a 390 px. */}
            {i < PASSOS.length - 1 && (
              <span aria-hidden="true" className="text-foreground/20 max-sm:hidden">
                →
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Linha "rótulo → valor" para os resumos (pré-visualização e envio). */
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--bo-hairline)] pb-1.5">
      <dt className="text-foreground/45">{label}</dt>
      <dd className="text-right text-[var(--bo-text)]">{value}</dd>
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO «COPIAR RESUMO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três ou quatro linhas prontas a colar no WhatsApp (o texto já vem pronto de
 * fora — `resumoDaPropostaParaCopiar` — este componente só sabe COPIAR, e o
 * que fazer quando copiar falha).
 *
 * ── QUANDO A ÁREA DE TRANSFERÊNCIA FALHA ───────────────────────────────────
 * O Safari recusa `navigator.clipboard.writeText` fora de um gesto directo do
 * utilizador (um `await` a mais pelo meio já chega para deixar de contar como
 * um), e há quem tenha as permissões desligadas. Nenhum dos dois pode virar um
 * erro seco: o texto fica visível E SELECCIONADO, pronto a copiar à mão com
 * Cmd/Ctrl+C — nunca uma mensagem a mandá-la "tentar outra vez" sem dar outra
 * saída.
 */
function CopiarResumo({ texto }: { texto: string }) {
  const { toast } = useToast();
  const [falhou, setFalhou] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  async function copiar() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Sem área de transferência.");
      await navigator.clipboard.writeText(texto);
      setFalhou(false);
      toast("Resumo copiado.", "success");
    } catch {
      setFalhou(true);
    }
  }

  // A caixa só aparece quando falhou, e é aí que o texto se selecciona
  // sozinho — é o gesto que substitui o botão que não funcionou.
  useEffect(() => {
    if (falhou) areaRef.current?.select();
  }, [falhou]);

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={() => void copiar()}>
        Copiar resumo
      </Button>
      {falhou && (
        <div className="mt-2 max-w-md rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] p-3">
          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            Não foi possível copiar automaticamente. O texto está seleccionado: copia com
            Cmd/Ctrl+C.
          </p>
          <textarea
            ref={areaRef}
            aria-label="Resumo da proposta, para copiar à mão"
            readOnly
            value={texto}
            onFocus={(e) => e.currentTarget.select()}
            rows={4}
            className="bo-input mt-2 w-full px-3 py-2 text-xs text-[var(--bo-text)]"
          />
        </div>
      )}
    </div>
  );
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O ESQUELETO ESBATE-SE — A ÚNICA SAÍDA DESTA CASA QUE SAI DE GRAÇA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * As duas miniaturas do estúdio — a do resumo (`PreviewThumb`) e a das grelhas
 * de mood board (`Thumb`) — põem um `<span absolute inset-0>` cinzento POR CIMA
 * da imagem, e não no lugar dela. Isso é uma decisão antiga e está contada nos
 * dois sítios: a caixa nunca muda de tamanho, e o `src` está posto muito antes
 * de os bytes chegarem, portanto há sempre alguma coisa a dizer «isto está a
 * acontecer».
 *
 * O efeito colateral, que ninguém tinha aproveitado: quando a fotografia chega,
 * ela JÁ ESTÁ PINTADA POR BAIXO. O esqueleto desaparecia num fotograma e a
 * fotografia dava um salto para dentro do ecrã — quando o que se passou foi
 * apenas que o pano que a tapava se pode levantar. Em toda a casa esta é a
 * única saída que não precisa de segurar nada montado à espera: o que está por
 * baixo é o destino final.
 *
 * ── A CLASSE É A `.bo-saida-fundo`, E NÃO A `.bo-saida` ───────────────────
 *
 * Zero de deslocação. Um esqueleto não vem de sítio nenhum nem vai para sítio
 * nenhum — está exactamente por cima do que vai ficar, e quatro píxeis a subir
 * fariam a mancha cinzenta DESLIZAR sobre a fotografia, que é uma coisa a
 * mover-se onde não se moveu nada. O que ele faz é apagar-se, nos 200 ms e na
 * `--ease-in` de tudo o que sai nesta casa.
 *
 * E não conflitua com o brilho: o `bo-shimmer` corre no `::after` do
 * `.bo-skeleton`, não no elemento — as duas animações vivem em nós diferentes e
 * a `animation` da `.bo-saida` não pisa nenhuma. O brilho continua até ao fim do
 * esbatimento, que é o que se quer: ele diz «ainda vem», e o que se está a ver
 * é ele a ir-se embora.
 *
 * ── E O ESQUELETO NÃO LEVA ENTRADA. NUNCA. ────────────────────────────────
 *
 * Meio segundo antes de aparecer conteúdo é o oposto do que um esqueleto existe
 * para fazer — ele é a promessa de que já está a acontecer alguma coisa, e uma
 * promessa que se apresenta chega tarde. Por isso `jaSeViu`: uma célula que
 * nunca esteve a carregar (uma foto que já falhou quando o ecrã abriu) não
 * desenha esqueleto nenhum, em vez de desenhar um só para o esbater — o que
 * seria pôr uma entrada onde ela está proibida, disfarçada de saída.
 *
 * ── E NÃO SE DESMONTA ─────────────────────────────────────────────────────
 *
 * A `.bo-saida` é `forwards`: acabada a animação o nó fica em `opacity: 0` e
 * sem `pointer-events` — invisível e inerte, sobre a fotografia que já lá
 * estava. Não há aqui o problema que o `ui/saida.ts` existe para resolver
 * (segurar montado um nó que o React ia deitar fora), e trazê-lo para cá era
 * pôr um temporizador por miniatura numa grelha que pode ter vinte e quatro.
 * Deixá-lo montado é também o que faz a volta funcionar: se a célula voltar a
 * carregar — um URL reassinado, um «Tentar novamente» —, a classe sai e o
 * esqueleto reacende no fotograma seguinte, sem entrada nenhuma.
 */
function EsqueletoPorCima({ aCarregar, comPega }: { aCarregar: boolean; comPega?: boolean }) {
  /**
   * Um trinco que só anda para um lado: já esteve à espera alguma vez?
   *
   * Ajustado NO DESENHO e não num `useEffect`. É o caminho que o React
   * documenta para acertar estado quando uma propriedade muda: ele reentra
   * neste componente antes de pintar o que quer que seja, portanto não há
   * fotograma nenhum desenhado com a resposta velha nem um segundo commit. Com
   * um efeito, a saída começava um fotograma depois da fotografia chegar — e
   * numa grelha de vinte e quatro miniaturas isso é vinte e quatro efeitos a
   * acordar por nada.
   *
   * O valor inicial já vem certo, portanto no caso normal — a célula nasce à
   * espera — este ajuste nunca chega a correr.
   */
  const [jaSeViu, setJaSeViu] = useState(aCarregar);
  if (aCarregar && !jaSeViu) setJaSeViu(true);
  if (!aCarregar && !jaSeViu) return null;
  return (
    <span
      className={`bo-skeleton pointer-events-none absolute inset-0 ${aCarregar ? "" : SAIDA_FUNDO}`}
      aria-hidden
      // A pega dos testes diz «esta célula está À ESPERA», e não «este nó
      // existe»: a partir daqui ele fica montado a esbater-se e, depois, calado.
      data-a-carregar={comPega && aCarregar ? "" : undefined}
    />
  );
}

/** Miniatura só de leitura (sem botão de remover) para o resumo. */
function PreviewThumb({
  url,
  planoB,
  pendente = false,
}: {
  url?: string;
  /** Para onde cair, do mais leve para o mais pesado. Ver `planoB` no `Thumb`. */
  planoB?: string | readonly (string | undefined)[];
  pendente?: boolean;
}) {
  const { alvo, desistiu: failed, aoFalhar } = useFotoComPlanoB(url, planoB);
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  // Enquanto não está pintada, esta caixa dizia «Imagem» e mais nada — o mesmo
  // ecrã que uma foto avariada dá. Ver `Thumb` para o porquê de isto importar.
  const aCarregar = !pintada && !failed;
  return (
    <div
      aria-busy={pendente || aCarregar || undefined}
      className={`relative aspect-[4/3] overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)] ${
        pendente ? "opacity-45" : ""
      }`}
    >
      {alvo && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={alvo}
          alt=""
          // Este resumo vive no fim do passo, e as suas duas células estão
          // quase sempre fora do ecrã quando a página abre: `lazy` é o que
          // impede que disputem a ligação com as fotos que ela está a ver.
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          // A `ref` E o `onLoad`, pela razão que o `medir` do `Thumb` explica:
          // uma imagem vinda da cache pode já estar completa quando o `onLoad`
          // é ligado, e aí só a referência a apanha.
          ref={(img) => {
            if (img?.complete && img.naturalWidth > 0) setPintada(true);
          }}
          onLoad={() => setPintada(true)}
          onError={aoFalhar}
        />
      ) : (
        !aCarregar && (
          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-[0.15em] text-foreground/30">
            Imagem
          </div>
        )
      )}
      <EsqueletoPorCima aCarregar={aCarregar} />
    </div>
  );
}

/** Resumo em página: a "forma" da proposta (capa, serviços, total sem IVA/IVA/
 *  com IVA, sinal/saldo) sem ter de descarregar o PDF. */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO VAI DEMORAR, E SE O EMAIL AGUENTA O ANEXO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «tempo estimado de geração do PDF, calculado a partir do
 * número de fotos e de gerações anteriores» e «aviso se o PDF ultrapassar o
 * limite de anexo de email (8 MB)».
 *
 * Sem número nenhum, dez segundos e sessenta são a mesma coisa — uma barra a
 * rodar — e não há como distinguir «está a demorar» de «isto encravou». Com
 * número, ela decide se espera.
 *
 * O aviso do anexo é o mais valioso dos dois, porque a alternativa é descobrir
 * pelo casal: o servidor de email do cliente recusa a mensagem, e do lado dela
 * o envio parece ter corrido bem. A sugestão é a que resolve mesmo — menos
 * fotografias nas páginas mais pesadas — e diz-se também o que NÃO se perde: o
 * link da proposta serve na mesma, com o PDF inteiro do outro lado.
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * SÓ PARA SI — QUANTO É QUE ISTO DEIXA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Falta o número que permite decidir com noção» — dentro do
 * bloco dos totais.
 *
 * A margem já era calculada: os custos escrevem-se por linha no painel interno,
 * e ele mostra a conta. O que faltava era ela estar ONDE A DECISÃO SE TOMA. O
 * bloco dos totais é o ecrã que se olha ao decidir se se baixa o preço, e era o
 * único sítio onde o número que responde a isso não estava.
 *
 * ── PARCIAL DIZ-SE PARCIAL ────────────────────────────────────────────────
 * Com custos em três linhas de dez, a conta é sobre essas três — e é declarada
 * como tal. Uma margem calculada sobre metade dos custos, apresentada como «a
 * margem», seria uma mentira sempre optimista, e das que só se descobrem no
 * fim do ano.
 *
 * ── E NUNCA SAI DAQUI ─────────────────────────────────────────────────────
 * Os custos vivem em `budgetCosts`, que o desenhador do PDF não lê — com um
 * teste em `proposal-doc-pdf.test.ts` a comparar as instruções de desenho com e
 * sem custos para garantir que continua assim.
 */
function MargemDoNegocio({ doc }: { doc: ProposalDoc }) {
  const limite = useDefinicoesDaProposta().margemMinima;
  const total = useMemo(() => margemTotal(doc), [doc]);
  // Sem uma única linha com preço E custo não há nada a dizer — e dizer «sem
  // margem» seria dizer que é zero, que é outra coisa.
  if (!total) return null;
  const magra = total.percentagem < limite;

  return (
    <div className="mt-3 border-t border-[var(--bo-hairline)] pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="bo-eyebrow">Só para si</span>
        <span className="text-xs text-[var(--bo-tinta-72)]">
          Margem{" "}
          <strong
            className={`font-semibold ${magra ? "text-[var(--bo-perigo)]" : "text-sage-600"}`}
          >
            {eur(total.margem)} · {Math.round(total.percentagem)}%
          </strong>
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-foreground/45">
        {total.parcial
          ? `Sobre as ${total.linhasComCusto} de ${total.linhasTotais} linhas que já têm custo (${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados).`
          : `${eur(total.custo)} de custos em ${eur(total.precoComparavel)} cobrados.`}{" "}
        Não sai no PDF nem em nada que vá para o cliente.
      </p>
      {magra && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-[11px] leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Abaixo dos {limite}% que definiu
            {total.parcial ? " — e ainda faltam custos, portanto pode ser menos" : ""}. Não impede
            nada; é para se saber antes de enviar.
          </span>
        </p>
      )}
    </div>
  );
}

function CustoDaGeracao({ fotos, amostras }: { fotos: number; amostras: AmostraDeGeracao[] }) {
  if (fotos === 0) return null;
  const ms = tempoEstimado(fotos, amostras);
  const bytes = tamanhoEstimado(fotos, amostras);
  const pesado = passaDoAnexo(bytes);
  /**
   * ── E O TECTO DA ROTA, QUE É OUTRA COISA ────────────────────────────────
   *
   * O tempo acima é o que ELA espera, medido daqui. Este é o que o SERVIDOR
   * gasta — e o servidor tem um tecto que ela não tem como saber: a rota que
   * redesenha o documento para o casal morre ao fim de `TECTO_DA_ROTA_MS`. Não é a mesma
   * conta nem a mesma pergunta, e por isso não se mistura com a frase de cima:
   * uma diz «vais esperar isto», a outra diz «isto está a chegar ao limite».
   */
  const orcamento = orcamentoDeTempo(fotos);
  // Com medições, diz-se que são medições — «cerca de» com uma amostra atrás é
  // outra coisa do que «cerca de» com um modelo por omissão.
  const medido = amostras.length >= 2;

  return (
    <div className="mt-3">
      <p className="text-xs leading-relaxed text-foreground/50">
        Gerar este PDF demora {tempoEmPalavras(ms)} e dá um ficheiro de {tamanhoEmPalavras(bytes)}
        {medido ? ", pelas últimas gerações neste computador" : ""}.
      </p>
      {pesado && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Um anexo deste tamanho pode ser recusado pelo servidor de email do cliente — muitos
            param nos 8 MB, e o anexo viaja ~33% maior do que o ficheiro. Tira algumas fotografias
            das páginas mais cheias. O link da proposta continua a servir na mesma, com o PDF
            inteiro do outro lado.
          </span>
        </p>
      )}
      {orcamento.aperta && (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-xl border border-[var(--bo-aviso-tom)]/35 bg-[var(--bo-aviso-tom)]/[0.06] px-3 py-2 text-xs leading-relaxed text-[var(--bo-tinta-72)]">
          <span aria-hidden="true">⚠</span>
          <span>
            Com esta quantidade de fotografias, o servidor demora{" "}
            {tempoEmPalavras(orcamento.msOptimista)} a {tempoEmPalavras(orcamento.msPessimista)} a
            desenhar o documento — e a página onde o casal o abre desiste ao fim de{" "}
            {tempoEmPalavras(orcamento.tectoMs).replace(/^cerca de /, "")}. O PDF do envio sai na
            mesma (tem mais tempo); quem pode ficar sem ele é o casal, ao carregar no link. Tira
            algumas fotografias das páginas mais cheias.
          </span>
        </p>
      )}
    </div>
  );
}

function PreviewSummary({
  doc,
  assetUrls,
  assetOriginais,
  assetMedias,
  money,
  split,
  pctSinal,
}: {
  doc: StudioDoc;
  assetUrls: Record<string, string>;
  /** O ORIGINAL de cada foto — o último degrau da cascata das células. */
  assetOriginais: Record<string, string>;
  /** A derivada de 1200 px, o degrau do meio. Ver `assetMedias` no estúdio. */
  assetMedias: Record<string, string>;
  money: ReturnType<typeof resolveProposalMoney>;
  /** O sinal e o saldo, tal como `totaisDaProposta` os devolve. */
  split: { sinal: number; saldo: number };
  /** A percentagem do sinal DESTA proposta (`depositPercentOf`), não um 30 fixo. */
  pctSinal: number;
}) {
  // UMA capa no desenho novo: a primeira que houver (a segunda das propostas
  // antigas fica guardada e não sai no PDF — não se mostra como se saísse).
  const covers = (doc.coverImages ?? []).filter(Boolean).slice(0, 1) as string[];
  const groups = doc.serviceGroups.filter((g) => (g.title ?? "").trim() || g.items.length > 0);
  const extras = (doc.budgetExtras ?? []).filter(
    (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
  );
  /** Calculado aqui e não recebido: este resumo só conhece o documento. */
  const fotosPorConfirmar = countPendingImages(doc);
  return (
    <Section title="Resumo da proposta">
      <p className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-text-muted)]">
        Esta é a forma da proposta que o cliente vai receber. Para o documento completo, usa
        «Descarregar PDF».
      </p>

      {/* O resumo mostra as fotos a caminho esbatidas; dizer quantas são evita
          que um PDF gerado agora — que não as leva — pareça um erro. */}
      {fotosPorConfirmar > 0 && (
        <p
          aria-live="polite"
          className="-mt-2 mb-4 text-sm leading-relaxed text-[var(--bo-perigo)]"
        >
          {fotosPorConfirmar === 1
            ? "1 foto ainda está a entrar na proposta e não entra num PDF gerado agora."
            : `${fotosPorConfirmar} fotos ainda estão a entrar na proposta e não entram num PDF gerado agora.`}
        </p>
      )}

      {covers.length > 0 && (
        <div className="mb-5 max-w-sm">
          {covers.map((path, i) => (
            <PreviewThumb
              key={i}
              url={assetUrls[path]}
              planoB={[assetMedias[path], assetOriginais[path]]}
              pendente={isPendingImage(path)}
            />
          ))}
        </div>
      )}

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <SummaryRow label="Clientes" value={doc.clientNames || "—"} />
        <SummaryRow label="Tipo de evento" value={doc.eventType || "—"} />
        <SummaryRow label="Data" value={doc.eventDate || "—"} />
        <SummaryRow label="Local" value={doc.location || "—"} />
        {doc.guests ? <SummaryRow label="Convidados" value={doc.guests} /> : null}
      </dl>

      {groups.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Serviços</p>
          <ul className="flex flex-col gap-1 text-sm text-[var(--bo-tinta-72)]">
            {groups.map((g, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-foreground/40">{g.letter || `${i + 1}.`}</span>
                <span>
                  {g.title || "(sem título)"}
                  {g.items.length > 0 && (
                    <span className="text-foreground/40">
                      {" "}
                      · {g.items.length} {g.items.length === 1 ? "item" : "itens"}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {extras.length > 0 && (
        <div className="mt-5">
          <p className="bo-eyebrow mb-2">Valores adicionais</p>
          <ul className="flex flex-col gap-1 text-sm text-[var(--bo-tinta-72)]">
            {extras.map((e, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3">
                <span>{e.label || "—"}</span>
                <span className="text-[var(--bo-text-muted)]">{e.valueText || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-[var(--bo-hairline)] bg-[var(--bo-tinta-3)] p-4">
        {money.gross > 0 ? (
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">Sem IVA</dt>
              <dd className="text-[var(--bo-text)]">{eur(money.base)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-foreground/50">IVA ({Math.round(money.vatRate * 100)}%)</dt>
              <dd className="text-[var(--bo-text)]">{eur(money.vat)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-[var(--bo-hairline)] pt-1.5">
              <dt className="font-medium text-[var(--bo-tinta-72)]">Com IVA</dt>
              <dd className="text-base text-[var(--bo-text)]">{eur(money.gross)}</dd>
            </div>
            {/* A PERCENTAGEM É A DO DOCUMENTO. Este resumo dizia «Sinal 30%»
                escrito à letra ao lado do valor certo: numa proposta a 40%
                mostrava 30% e o número de 40% — o mesmo defeito que o PDF e o
                portal já tinham corrigido, deixado para trás aqui. */}
            <div className="mt-1 flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Sinal {pctSinal}%</dt>
              <dd>{eur(split.sinal)}</dd>
            </div>
            <div className="flex items-baseline justify-between text-xs text-foreground/50">
              <dt>Saldo {100 - pctSinal}%</dt>
              <dd>{eur(split.saldo)}</dd>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-foreground/40">
              Sobre o valor com IVA.
            </p>
          </dl>
        ) : (
          <p className="text-sm text-foreground/50">
            Ainda sem total. Define o valor no passo «Orçamento» → «Total, IVA e validade».
          </p>
        )}
      </div>
    </Section>
  );
}

/**
 * A foto de uma célula, com a URL a trocar SEM a célula piscar.
 *
 * Quando uma foto provisória assenta, o caminho muda e com ele a URL assinada —
 * mesmos pixéis, morada nova. Pôr a nova no `src` de imediato deixava a célula
 * branca durante o download: a foto desaparecia para voltar igual, que é o
 * salto que este ecrã não pode ter. Por isso a nova só entra depois de estar
 * descarregada; até lá continua a ver-se a que já estava.
 *
 * Só quando JÁ há foto desenhada: a primeira nunca espera por nada.
 */
function useSrcSemPiscar(url?: string): string | undefined {
  /** A última URL que já esteve mesmo desenhada nesta célula. */
  const [pronta, setPronta] = useState<string | undefined>(url);
  useEffect(() => {
    if (!url || url === pronta) return;
    let alive = true;
    const pre = new window.Image();
    // Falhar também troca: a célula tem o seu próprio estado de erro, e ficar
    // presa à foto antiga seria mostrar uma coisa que já não está no documento.
    const swap = () => {
      if (alive) setPronta(url);
    };
    pre.onload = swap;
    pre.onerror = swap;
    pre.decoding = "async";
    pre.src = url;
    return () => {
      alive = false;
    };
    // `pronta` é o que já está no ecrã: entrar nas dependências reexecutaria
    // isto no momento exato em que a troca acabou de acontecer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  // Sem nada desenhado, a URL nova entra já — a primeira foto nunca espera.
  return pronta && url ? pronta : url;
}

/** Pela ordem em que aparecem no selector — do mais usado ao mais especial. */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO NÃO É A FOTOGRAFIA — É O SÍTIO QUE NÃO A DEIXA APARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma célula que não desenha nada podia ser três coisas (ver os «três estados»
 * mais abaixo); afinal são quatro, e a quarta é de outra natureza.
 *
 * A `Content-Security-Policy` deste sítio traz uma directiva `img-src`, e ela
 * nomeia de onde é que uma imagem pode vir. Quando a origem do Storage não está
 * na lista, o browser RECUSA a fotografia — e recusa-a antes de a pedir. Não há
 * pedido, não há código de estado, não há linha no painel de rede e não há nada
 * para o servidor registar: do lado do JavaScript o único sinal é o `onerror`
 * do `<img>`, exactamente igual ao de um 404. Foi assim que uma proposta com as
 * fotografias todas guardadas e a sair bem no PDF apareceu no telemóvel dela
 * com nove células a dizer «Não consegui mostrá-la neste ecrã».
 *
 * As duas avarias têm donos e remédios OPOSTOS — uma resolve-se com um botão de
 * tentar outra vez, a outra nunca, por mais vezes que se carregue — e por isso
 * não podem dizer a mesma frase. Um «Tentar novamente» que vai falhar sempre da
 * mesma maneira é uma promessa vazia, e é pior do que não haver botão nenhum.
 *
 * ── COMO É QUE SE SABE ────────────────────────────────────────────────────
 * O browser diz, e ninguém o ouvia: `document.addEventListener(
 * "securitypolicyviolation", …)`. MEDIDO no Chromium, com `img-src 'self'
 * data:` e duas imagens de outra origem: dois eventos, `violatedDirective` e
 * `effectiveDirective` os dois `"img-src"`, e o `blockedURI` INTEIRO — caminho
 * e token incluídos.
 *
 * ── E CASA-SE POR ORIGEM, NÃO POR URL ─────────────────────────────────────
 * Porque o `blockedURI` inteiro é o caso do Chromium, e não a regra: a norma
 * deixa o browser entregá-lo cortado à origem (é o que o WebKit faz em vários
 * casos, e o telemóvel dela é um iPhone). Casar por URL completo funcionaria na
 * máquina onde isto se mediu e falhava calado onde interessa. A origem é o que
 * os dois formatos têm em comum, e chega: quem recusa uma fotografia do Storage
 * recusa-as todas.
 *
 * E se nem a origem der para ler (um `blockedURI` vazio, ou o literal
 * `"self"`), fica a marca sem morada — e aí é o ECRÃ inteiro que passa a dizer
 * isto, em vez de uma célula. Uma célula morta ao mesmo tempo que o browser
 * anuncia uma recusa de `img-src` é a mesma avaria com altíssima probabilidade;
 * calar-se seria voltar à frase errada, que é o defeito que isto veio corrigir.
 *
 * Vive fora do React, como a fila das imagens e pela mesma razão: o evento é do
 * documento, é um só, e um ouvinte por célula numa grelha de vinte e quatro
 * eram vinte e quatro ouvintes para a mesma notícia.
 */
const origensRecusadasPelaPolitica = new Set<string>();
/** Houve uma recusa de `img-src` que não deu para atribuir a uma origem. */
let houveRecusaSemMorada = false;
const ouvintesDaRecusa = new Set<() => void>();
let escutaDaPoliticaLigada = false;

function origemDe(url: string | undefined): string {
  if (!url || typeof window === "undefined") return "";
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return "";
  }
}

function ligarEscutaDaPolitica(): void {
  if (escutaDaPoliticaLigada || typeof document === "undefined") return;
  escutaDaPoliticaLigada = true;
  document.addEventListener("securitypolicyviolation", (e) => {
    // `effectiveDirective` é o nome moderno e `violatedDirective` o antigo; os
    // browsers não concordam sobre qual preenchem, e um deles pode vir com a
    // lista de origens colada («img-src 'self' data:»). Daí o `startsWith`.
    const directiva = e.effectiveDirective || e.violatedDirective || "";
    if (!directiva.startsWith("img-src")) return;
    const origem = origemDe(e.blockedURI);
    if (origem && origem !== window.location.origin) origensRecusadasPelaPolitica.add(origem);
    else houveRecusaSemMorada = true;
    for (const avisar of ouvintesDaRecusa) avisar();
  });
}

function subscreverRecusa(avisar: () => void): () => void {
  ligarEscutaDaPolitica();
  ouvintesDaRecusa.add(avisar);
  return () => {
    ouvintesDaRecusa.delete(avisar);
  };
}

/** Esta fotografia foi recusada pelas regras do próprio sítio? */
function useRecusaDaPolitica(url?: string): boolean {
  const ler = useCallback(
    () => houveRecusaSemMorada || origensRecusadasPelaPolitica.has(origemDe(url)),
    [url],
  );
  // No servidor não há política nem recusa nenhuma — e não pode haver desencontro
  // de hidratação por causa disto.
  return useSyncExternalStore(subscreverRecusa, ler, () => false);
}

function Thumb({
  url,
  planoB,
  onRemove,
  className = "",
  aspeto,
  onMedida,
  foraDoPdf = false,
  pendente = false,
  semRemover = false,
  onde = "estúdio",
  estadoDosUrls = "pronto",
  aoTentarDeNovo,
  aoMorrer,
  priority = false,
  // `refDoc` e não `ref`: o React trata `ref` como prop especial, e uma string
  // ali dentro é o padrão antigo das string refs, que ele recusa.
  refDoc,
  posicao,
}: {
  /** O `object-position` da imagem — o enquadramento da capa (`focoDaCapa`). */
  posicao?: string;
  url?: string;
  /**
   * PARA ONDE CAIR, do mais leve para o mais pesado.
   *
   * Uma cadeia é o caso antigo («cai para o original»). Uma lista é a cascata
   * inteira — nas grelhas do estúdio, `[derivada de 1200 px, original]`. Ver
   * `assetMedias`: entre a miniatura de 20 KB e o original de 1099 KB não havia
   * nada, e a queda custava cinquenta e cinco vezes o peso para desenhar a
   * mesma caixa de ~100 px.
   */
  planoB?: string | readonly (string | undefined)[];
  /** Em que pé está a leitura dos URL — ver `estadoDosUrls` no estúdio. */
  estadoDosUrls?: EstadoDosUrls;
  /** Ir buscar os URL outra vez, a pedido dela. */
  aoTentarDeNovo?: () => void;
  /**
   * Este URL não abre — dito ao estúdio, para a hidratação seguinte deixar de
   * o preferir ao fresco. Ver `urlsMortos`.
   */
  aoMorrer?: (url: string) => void;
  /** Está na primeira dobra: não espera pela fila nem pelo `lazy`. */
  priority?: boolean;
  onRemove: () => void;
  className?: string;
  /**
   * O ASPECTO DA CAIXA QUE ESTA FOTO VAI OCUPAR NO PDF.
   *
   * A célula pré-visualizava as capas em 4:3 e as fotos dos mood boards em
   * quadrado — e o documento não desenha NENHUMA foto em 4:3 nem NENHUMA em
   * quadrado. As capas são tiras altas (≈ 0,47:1, quase 1:2) e as células do
   * collage mudam de forma consoante o número de fotos do board.
   *
   * O resultado era ela escolher uma foto pelo que via e o cliente receber
   * outra coisa: a MESMA fotografia, cortada noutro sítio. Com uma tira de capa
   * tão estreita, os dois recortes podem não ter nada em comum — é a definição
   * de «desconfigurada», e não havia como descobri-lo sem gerar o PDF.
   *
   * Vem de `proposal-geometria`, a mesma função que o desenho usa. Em falta,
   * mantém-se o que o `className` disser.
   */
  aspeto?: number;
  /**
   * A FORMA REAL DESTA FOTOGRAFIA, dita assim que a célula consegue medi-la.
   *
   * A imagem que está aqui já foi descodificada pelo navegador — tem
   * `naturalWidth`/`naturalHeight` e não custa mais nada perguntar. É daqui que
   * o selector de disposição tira os aspectos com que desenha os diagramas (ver
   * `aspetosDasFotos`), em vez de haver um pedido novo por foto só para saber a
   * forma. Quando o URL é o da miniatura serve na mesma: a miniatura é gerada
   * dentro de uma caixa, conservando as proporções (ver `image-prep`).
   */
  onMedida?: (aspeto: number) => void;
  /** Esta foto está no rascunho mas a página do PDF já não a desenha. */
  foraDoPdf?: boolean;
  /** A foto já ocupa este lugar mas a cópia ainda não confirmou. */
  pendente?: boolean;
  /** Onde está esta célula, para os registos do servidor dizerem qual falhou. */
  onde?: string;
  /** O caminho no documento — o que se procura no Storage quando isto falha. */
  refDoc?: string;
  /**
   * Não desenhar o × desta célula.
   *
   * Nas grelhas dos mood boards a remoção passou para a barra de acções, que é
   * visível ao toque; o × da miniatura só aparecia em hover, e num telemóvel um
   * botão que só aparece em hover é um botão que não existe. As capas continuam
   * com ele — ali há duas células e nenhuma barra.
   */
  semRemover?: boolean;
}) {
  /**
   * Não foi a fotografia: foi este sítio que a recusou. Ver a escuta acima.
   *
   * Perguntado com `planoB ?? url` e ANTES da cascata, de propósito: a resposta
   * é por ORIGEM, e as duas moradas desta foto têm a mesma — portanto sabe-se
   * já, sem esperar pelo `ultimoAlvo`, e a cascata pode receber a resposta em
   * vez de gastar uma volta a descobrir o que já se sabia.
   */
  /**
   * O último degrau da cascata — o ficheiro grande. É por ele que se pergunta a
   * recusa da política (todas as moradas desta foto têm a mesma origem) e é ele
   * que o «Abrir ficheiro» abre.
   */
  const original = [...(Array.isArray(planoB) ? planoB : [planoB])].reverse().find(Boolean);
  const recusadaPeloSitio = useRecusaDaPolitica(original ?? url);
  const {
    alvo,
    desistiu: failed,
    aoFalhar,
    tentarDeNovo,
    ultimoAlvo,
  } = useFotoComPlanoB(url, planoB, recusadaPeloSitio);

  /**
   * UMA FOTO A CAMINHO NÃO É UMA FOTO PARTIDA.
   *
   * Enquanto a cópia não confirma, a célula desenha a miniatura que o seletor
   * já tinha — e essa é provisória por natureza. Dizer «não foi possível
   * pré-visualizar» a meio disso é acusar de avaria o que ainda está a
   * acontecer. Espera-se pelo caminho definitivo, que traz URL novo e uma
   * oportunidade nova.
   */
  const semRemedio = failed && !pendente;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CÉLULA QUE PUXA O ORIGINAL ESPERA PELA VEZ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * «Pesada» é `alvo === planoB`, e é literalmente isso: o URL que esta célula
   * está prestes a pedir É o do original. Acontece nos dois casos que importam
   * — a foto não tem derivada leve nenhuma, ou a que tinha falhou e a cascata
   * caiu para o original (`useFotoComPlanoB`). É o caso caro: medido no estúdio
   * a 1,6 Mbps com 24 células, cada original pesa **1099 KB** (26,4 MB nas 24),
   * a primeira fotografia chega aos **34,0 s** e a grelha que está no ecrã só
   * fica completa aos **67,6 s** — porque as vinte e quatro repartem o mesmo
   * canal e acabam todas no fim. Com a fila: 13,3 MB e 49,4 s.
   *
   * A fila (`fila-de-imagens`) deixa passar três de cada vez, pela ordem da
   * grelha. É o mesmo desenho que a Biblioteca de Temas já usa, e é lá que está
   * medido o que ele vale: a primeira foto passou de 26 s para 1,4 s.
   *
   * ── A PRIORIDADE NÃO FURA A FILA ──────────────────────────────────────────
   * A primeira versão deixava as células da primeira dobra passar à frente sem
   * pedir vez. MEDIDO: quatro prioritárias mais três da fila são sete originais
   * em voo, e a grelha do ecrã ficou completa aos **56,5 s** contra os 49,4 s
   * do tecto de três. Com sete a repartir o canal, cada uma continua a esperar
   * pelas outras seis.
   *
   * A ordem da fila JÁ é a ordem da grelha (as células pedem vez pela ordem em
   * que montam), portanto as de cima são servidas primeiro sem precisarem de
   * excepção. O que a prioridade faz é o que deve fazer: `eager` e
   * `fetchPriority="high"`, para o navegador não as adiar nem as despriorizar.
   * É também o que a Biblioteca de Temas faz, e é lá que está medido o que
   * vale — a primeira foto passou de 26 s para 1,4 s.
   */
  /**
   * ── O QUE É «PESADA» DEPOIS DE HAVER TRÊS DEGRAUS ────────────────────────
   *
   * Era `alvo === planoB`, que com dois degraus queria dizer exactamente «é o
   * original». Com três, o plano B do meio é a derivada de 1200 px — ~200 KB,
   * dez vezes a miniatura — e essa também não pode ir vinte e quatro ao mesmo
   * tempo para o mesmo canal.
   *
   * Portanto: pesada é TUDO menos o primeiro degrau. E é também o primeiro
   * degrau quando ele É o original — uma fotografia sem miniatura nenhuma chega
   * aqui com o mesmo endereço nos dois lugares, e a cascata guarda-o uma vez
   * só; sem esta segunda metade da condição, essa célula deixava de esperar
   * pela vez e voltávamos às 24 a repartir o canal.
   */
  const pesada = alvo != null && (alvo !== url || alvo === original);
  /**
   * A vez, uma vez por célula e para sempre.
   *
   * Não volta a `false` quando o URL é reassinado, e é deliberado: mandar de
   * volta para a fila uma célula que JÁ tem fotografia no ecrã apagava-a — e
   * uma foto que desaparece para voltar igual é exactamente o salto que este
   * ecrã não pode ter (ver `useSrcSemPiscar`). O custo é um download a mais no
   * momento raro em que as assinaturas se renovam.
   */
  const [temVez, setTemVez] = useState(false);
  /**
   * O mesmo, numa referência, para o efeito o poder ler sem o ter nas
   * dependências — tê-lo lá faria a própria concessão da vez desmontar o
   * efeito e largá-la no instante seguinte.
   */
  const temVezRef = useRef(false);
  /** A fotografia já está no ecrã — é o que apaga o esqueleto por cima. */
  const [pintada, setPintada] = useState(false);
  const largarVez = useRef<(() => void) | null>(null);
  useEffect(() => {
    /**
     * ── UM LUGAR NA FILA POR CÉLULA, E SÓ ENQUANTO SERVE PARA ALGUMA COISA ──
     *
     * `temVez` não volta a `false` depois do primeiro arranque (é deliberado —
     * ver acima), e portanto o `src` desta célula JÁ é o alvo e o download já
     * começou. Uma célula que volte aqui — porque o URL foi reassinado, porque
     * a cascata caiu para o original, porque ela carregou em «Tentar
     * novamente» — pedia na mesma vez, e ficava com um dos TRÊS lugares sem
     * precisar dele: o download dela já ia a caminho, e o lugar só se largava
     * ao fim de `ESPERA_MAXIMA_MS`.
     *
     * Numa grelha onde as fotos falham em cadeia é o pior momento possível
     * para isso: as três vagas ficam com células que não estão à espera de
     * nada, e as que ainda não têm um único pixel no ecrã esperam por uma vaga
     * que já não é vaga nenhuma. A fila existe para reger quem ainda não
     * começou.
     *
     * ── O RELÓGIO DO TECTO NÃO ESTÁ AQUI, E É DE PROPÓSITO ─────────────────
     * Estava: um `setTimeout` montado à volta deste pedido, que devolvia a vaga
     * ao fim do tecto. Escrito assim, a invariante que importa — **o tecto
     * conta o DOWNLOAD e nunca a ESPERA** — dependia de o `setTimeout` estar
     * dentro do arranque e não fora dele, o que ninguém vê ao ler e ninguém
     * apanha ao mudar. Passou para dentro da `fila-de-imagens`, que o arma no
     * instante em que concede a vaga e tem um caso a fixá-lo.
     */
    if (!pesada || temVezRef.current) return;
    const largar = pedirVezDeImagemPesada(() => {
      temVezRef.current = true;
      setTemVez(true);
    });
    largarVez.current = largar;
    return () => {
      largarVez.current?.();
      largarVez.current = null;
    };
    // `alvo` nas dependências para uma foto reassinada voltar a pedir vez em
    // vez de ficar com um URL que o Storage já recusa.
  }, [pesada, alvo]);
  const largarAVez = () => {
    largarVez.current?.();
    largarVez.current = null;
  };
  /**
   * O URL EFECTIVO — e é aqui que a fila vale alguma coisa.
   *
   * Uma célula à espera de vez fica sem URL nenhum. Não basta não desenhar a
   * imagem: o `useSrcSemPiscar` PRÉ-CARREGA o que lhe passarem (`new Image()`),
   * e passar-lhe o alvo enquanto ela espera era começar o download que a fila
   * está ali para adiar — a fila ficava a contar vezes e o canal continuava
   * repartido pelas vinte e quatro.
   */
  const src = useSrcSemPiscar(pesada && !temVez ? undefined : alvo);

  // O registo sai UMA vez por célula que desiste, com o caminho e o código de
  // estado — que é o que nem ela nem eu tínhamos quando isto apareceu.
  useEffect(() => {
    if (semRemedio && ultimoAlvo) {
      void relatarFalhaDeImagem({ onde, ref: refDoc, url: ultimoAlvo });
      // E fica sabido AQUI dentro também: sem isto, a leitura seguinte da
      // lista devolvia URLs frescos e o mapa continuava a preferir este, que
      // acabou de dar erro. Ver `urlsMortos` no estúdio.
      //
      // MENOS quando quem recusou foi o sítio: aí o URL está impecável e
      // marcá-lo como morto fazia a hidratação seguinte deitar fora
      // assinaturas boas — trinta downloads a mais para corrigir um problema
      // que não é do endereço.
      if (!recusadaPeloSitio) {
        aoMorrer?.(ultimoAlvo);
        if (url && url !== ultimoAlvo) aoMorrer?.(url);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semRemedio]);

  /**
   * Mede e diz. Vive numa `ref` para o `ref={}` da imagem poder ser uma função
   * ESTÁVEL: uma função nova a cada desenho fazia o React desligar e voltar a
   * ligar a referência da imagem em cada tecla escrita na secção.
   *
   * Chamado nos dois momentos possíveis — quando a imagem acaba de carregar, e
   * quando o elemento aparece já completo (o navegador serviu-a da cache, que é
   * o caso normal aqui: o `useSrcSemPiscar` pré-carrega-a antes de a desenhar).
   */
  const medidaRef = useRef(onMedida);
  useEffect(() => {
    medidaRef.current = onMedida;
  }, [onMedida]);
  const medir = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const { naturalWidth: w, naturalHeight: h } = img;
    if (w > 0 && h > 0) medidaRef.current?.(w / h);
    // E JÁ ESTÁ PINTADA. Uma imagem servida da cache pode chegar completa antes
    // de o `onLoad` ter a quem tocar — e sem isto o esqueleto por cima ficava
    // lá para sempre, sobre uma fotografia que está a ser desenhada por baixo.
    if (w > 0) setPintada(true);
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * OS TRÊS ESTADOS DE UMA CÉLULA SEM FOTOGRAFIA, QUE ERAM UM SÓ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Tudo o que não fosse uma imagem pintada dava a MESMA caixa cinzenta com a
   * palavra «Imagem». As capturas dela mostram exactamente isso — e essa caixa
   * pode querer dizer três coisas com três respostas diferentes:
   *
   *   · a caminho     → esperar (medido: a primeira foto sem miniatura demorou
   *                     34,0 s em 4G, e a grelha do ecrã 67,6 s);
   *   · não veio      → tentar outra vez a leitura da lista;
   *   · não abre      → tentar outra vez ESTA foto, ou abri-la à parte.
   *
   * Uma caixa parada com «Imagem» é indistinguível de uma que falhou, e foi
   * isso que fez a dona do negócio concluir que não conseguia ver as
   * fotografias — quando, em parte, o que se passava era estarem a caminho.
   */
  /**
   * Não há URL, e a leitura da lista JÁ ACABOU — portanto não vem mais nenhum.
   *
   * Duas maneiras de aqui chegar, e as duas davam a mesma caixa cinzenta com a
   * palavra «Imagem»: a leitura falhou (rede, sessão caducada, Storage em
   * baixo), ou a leitura correu e esta fotografia não veio na lista. A segunda
   * é a mais traiçoeira — o `listProposalImages` devolve `[]` em vez de atirar
   * quando não alcança o bucket, e uma grelha inteira sem uma única fotografia
   * lia-se como «as fotos desapareceram».
   */
  const semUrlEFalhou = !alvo && estadoDosUrls !== "a-caminho";
  const desenhaImagem = Boolean(src) && !semRemedio;
  const aCarregar = !pintada && !semRemedio && !semUrlEFalhou;

  return (
    <div
      // `aria-busy` e não só a opacidade: quem não vê a célula esbatida tem de
      // saber na mesma que esta foto ainda está a entrar (a pastilha «X a
      // caminho» diz o total, isto diz QUAL).
      //
      // SÓ o `pendente`, e é deliberado: aqui `aria-busy` quer dizer «esta foto
      // ainda não está na proposta», que é um estado do NEGÓCIO. Juntar-lhe «os
      // bytes ainda vêm a caminho» dava o mesmo sinal a duas coisas com
      // consequências opostas — uma impede o envio, a outra passa sozinha — e
      // os testes que lêem este atributo para contar fotos por confirmar
      // passariam a contar fotos que já lá estão. Quem diz que a fotografia vem
      // a caminho é o esqueleto, que é visível e não precisa de ser lido.
      aria-busy={pendente || undefined}
      // A PEGA DOS TESTES. Uma célula de foto identificava-se pelo seu «×» —
      // e o × saiu daqui para a barra de acções, que é visível ao toque. Um
      // atributo próprio diz o que a célula É, em vez de a fazer depender de
      // que botões calha ter naquele sítio.
      data-foto=""
      // `self-start` com o aspecto: dentro de uma grelha, sem isto a célula
      // esticava-se à altura da linha e o `aspect-ratio` era ignorado — que é
      // exactamente o contrário do que se quer aqui.
      style={aspeto ? { aspectRatio: String(aspeto) } : undefined}
      className={`group relative overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] motion-safe:transition-opacity motion-safe:duration-500 ${
        foraDoPdf ? "border-[var(--bo-perigo)]/60 opacity-60" : "border-[var(--bo-hairline-strong)]"
      } ${pendente ? "opacity-45" : ""} ${aspeto ? "self-start" : ""} ${className}`}
    >
      {desenhaImagem ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          // A forma desta fotografia sai desta imagem, que já cá está e já foi
          // descodificada — ver `onMedida`.
          ref={medir}
          onLoad={(e) => {
            largarAVez();
            setPintada(true);
            medir(e.currentTarget);
          }}
          // As PESADAS são geridas pela fila; pô-las também em `lazy` fazia uma
          // célula fora do ecrã ficar com a vez sem chegar a pedir nada. As
          // leves (a miniatura, ~20 KB) continuam em `lazy`, que é o que impede
          // as fotos dos boards lá de baixo de disputarem o canal com as que
          // estão à vista. E a primeira dobra não espera por nenhum dos dois.
          loading={pesada || priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className="h-full w-full object-cover"
          style={posicao ? { objectPosition: posicao } : undefined}
          draggable={false}
          onError={(e) => {
            largarAVez();
            aoFalhar();
            void e;
          }}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1 text-center text-[9px] leading-tight text-foreground/40">
          {semRemedio && recusadaPeloSitio ? (
            /* ── NÃO É A FOTOGRAFIA: É O SÍTIO ──────────────────────────────
               Sem botão de tentar outra vez, e é a diferença que interessa: a
               recusa não muda por se insistir. O «Abrir ficheiro» fica, e
               funciona — abrir o endereço noutro separador é uma navegação, e
               as regras que barram uma imagem DENTRO desta página não têm nada
               a dizer sobre isso.

               A frase não diz «política», nem «directiva», nem o nome da
               regra: quem lê isto quer saber se a fotografia se perdeu (não se
               perdeu) e se o problema é dela (não é). O resto está escrito no
               `title` e, por extenso, no comentário da escuta lá em cima. */
            <>
              <span className="font-medium text-[var(--bo-text-muted)]">Fotografia guardada</span>
              {/* Curta porque tem de CABER: a caixa tem 104 px de altura e
                  `overflow-hidden`, e a frase inteira levava o «Abrir ficheiro»
                  para fora do corte. A explicação toda vai no `title` — é a
                  mesma decisão, e a mesma medição, do ramo «não veio na lista». */}
              <span title="A fotografia está guardada e inteira — sai bem no PDF. Quem a recusou aqui foi este site, por uma definição dele. Insistir dá sempre o mesmo.">
                O site não a deixa aparecer.
              </span>
              {ultimoAlvo && (
                <a
                  href={ultimoAlvo}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-1 underline underline-offset-2 text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                >
                  Abrir ficheiro
                </a>
              )}
            </>
          ) : semRemedio ? (
            <>
              {/* ── E TEM DE CABER NA CAIXA ────────────────────────────────
                  MEDIDO a 390 px, numa célula de 89 × 104 px: a etiqueta, a
                  frase, o botão e o link somavam 128 px de conteúdo e a caixa
                  tem `overflow-hidden` — 24 px cortados em baixo, e o que
                  ficava de fora era o «Abrir ficheiro». A última saída de uma
                  célula morta estava a ser cortada pela explicação de por que
                  é que ela morreu.

                  A frase passa para o `title`, exactamente como no ramo «não
                  veio na lista», que já tinha aprendido isto à sua custa: numa
                  caixa desta altura, cada linha custa uma coisa que já lá
                  estava. */}
              <span
                className="font-medium text-[var(--bo-text-muted)]"
                title="A fotografia está guardada. Não consegui mostrá-la neste ecrã."
              >
                Imagem guardada
              </span>
              <span className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {/* ── E TENTA MESMO ALGUMA COISA DIFERENTE ──────────────────
                    MEDIDO com a rede a devolver 503: o botão antigo repetia,
                    ao byte, os dois URL que acabavam de falhar — nenhum
                    pedido novo com um endereço novo. Contra a causa mais
                    provável de uma grelha inteira morta — assinaturas que já
                    não servem — isso é um botão que não pode funcionar.

                    Agora são as duas coisas, por esta ordem: pedir ao
                    servidor a lista outra vez (URLs frescos, e a memória dos
                    mortos garante que o mapa os aceita) e recomeçar a cascata
                    desta célula. */}
                <button
                  type="button"
                  onClick={() => {
                    aoTentarDeNovo?.();
                    tentarDeNovo();
                  }}
                  className={`rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-[var(--bo-tinta-72)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
                >
                  Tentar novamente
                </button>
                {ultimoAlvo && (
                  <a
                    href={ultimoAlvo}
                    target="_blank"
                    rel="noreferrer"
                    className={`underline underline-offset-2 text-[var(--bo-text-muted)] hover:text-[var(--bo-text)] ${ESTADO} ${PRESSAO}`}
                  >
                    Abrir ficheiro
                  </a>
                )}
              </span>
            </>
          ) : semUrlEFalhou ? (
            /* ── NÃO HÁ URL, E NÃO VAI HAVER ────────────────────────────────
               Este é o ramo que ela viu — só que dizia «Imagem» e mais nada. A
               fotografia está guardada; o que falhou foi a leitura da lista.
               Dizê-lo, e dar um botão, é a diferença entre um ecrã avariado e
               um ecrã que explica.

               ── PORQUE É QUE A FRASE É TÃO CURTA ────────────────────────────
               MEDIDO a 375 px: uma célula de um mood board com oito fotos tem
               ~110×75 px, e a caixa tem `overflow-hidden`. A primeira versão
               dizia «Não consegui ir buscar as fotografias desta proposta.» —
               quatro linhas a 9 px mais o botão, e o que se via na captura era
               «as fotografias desta», com a primeira linha E o botão cortados.
               Uma explicação que não cabe não é uma explicação: é a mesma caixa
               cinzenta com outras palavras.

               Cabe uma etiqueta e o botão. A frase inteira vai no `title` e no
               `aria-label` do botão — que é onde ainda serve para alguma coisa
               (leitor de ecrã, rato) sem roubar o espaço a quem só precisa de
               saber que ISTO FALHOU e onde carregar. */
            <>
              {/* Sem ícone: MEDIDO, o ⚠ ocupava a linha que faltava ao botão e
                  a captura mostrava o «Tentar» encostado ao corte de baixo. Numa
                  caixa de 75 px, cada linha custa uma coisa que já lá estava. */}
              <span
                className="font-medium text-[var(--bo-text-muted)]"
                title={
                  estadoDosUrls === "falhou"
                    ? "Não consegui ir buscar as fotografias desta proposta."
                    : "Esta fotografia está no documento, mas não veio na lista que o servidor devolveu."
                }
              >
                {estadoDosUrls === "falhou" ? "Não carregou" : "Não veio na lista"}
              </span>
              {aoTentarDeNovo && (
                <button
                  type="button"
                  onClick={aoTentarDeNovo}
                  aria-label="Ir buscar outra vez as fotografias desta proposta"
                  className={`mt-0.5 rounded border border-foreground/20 px-1.5 py-0.5 text-[9px] text-[var(--bo-tinta-72)] hover:bg-[var(--bo-tinta-6)] ${ESTADO} ${PRESSAO}`}
                >
                  Tentar
                </button>
              )}
            </>
          ) : null}
        </div>
      )}
      {/* ── ENQUANTO A FOTOGRAFIA VEM ─────────────────────────────────────
          Por CIMA e em posição absoluta, e não no fluxo: pôr o esqueleto no
          lugar da imagem obrigava a célula a mudar de conteúdo no instante em
          que a foto chega, e o `src` está posto muito antes de os bytes
          chegarem — a caixa ficava cinzenta e calada durante os 34 s medidos.
          Assim há sempre alguma coisa a dizer «isto está a acontecer». */}
      <EsqueletoPorCima aCarregar={aCarregar} comPega />
      {/* Sobreposta, nunca no fluxo: a célula tem de ter exatamente o mesmo
          tamanho antes e depois de a foto assentar. */}
      {pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-black/65 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          a entrar…
        </span>
      )}
      {foraDoPdf && !pendente && (
        <span className="absolute inset-x-0 bottom-0 bg-[var(--bo-perigo)]/85 px-1 py-0.5 text-center text-[8px] tracking-[0.12em] uppercase text-white">
          fora do PDF
        </span>
      )}
      {!semRemover && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover imagem"
          /**
           * ── INVISÍVEL E TOCÁVEL AO MESMO TEMPO ────────────────────────
           *
           * Isto era `opacity-0 group-hover:opacity-100`. Num ecrã táctil não
           * há hover nenhum, portanto o botão NUNCA se via — e `opacity: 0`
           * não desliga o toque: um dedo no canto da miniatura apagava a
           * fotografia sem que nada tivesse aparecido primeiro. É o único
           * botão destrutivo do back office assim, e no telemóvel o engano nem
           * se desfaz (o Cmd+Z do estúdio não existe lá).
           *
           * O par é o da casa (`globals.css:98`), e é o mesmo que o
           * `ServicesEditor` e os `Fornecedores` já usam: à vista no dedo,
           * escondido até ao hover só onde HÁ rato.
           *
           * 20 px é menos de metade do mínimo de toque, e o `alvo-toque` (44
           * px) não serve aqui: a miniatura tem pouco mais de 100 px de largo
           * e um alvo de 44 px no canto engolia um terço dela — num botão que
           * APAGA, um alvo grande de mais é tão mau como um pequeno de mais.
           * 32 px no dedo é o meio-termo, e é o que cabe.
           */
          className={`absolute top-1 right-1 flex h-5 w-5 pointer-coarse:h-8 pointer-coarse:w-8 items-center justify-center rounded-full bg-black/55 text-white text-xs leading-none opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100 ${ESTADO} ${PRESSAO}`}
        >
          ×
        </button>
      )}
    </div>
  );
}

function UploadArea({
  label,
  progresso,
  multiple,
  compact = false,
  curto = false,
  faixa = false,
  onFiles,
}: {
  label: string;
  /**
   * O lote que está a subir, ou nada.
   *
   * Era um `busy: boolean`, e a caixa só sabia escrever «A carregar…» — em
   * cima de vinte fotografias de telemóvel numa rede de quinta, que são
   * minutos, «ocupado» e «preso» leem-se exactamente igual. A contagem já
   * existia no `handleUpload`; passa a chegar ao ecrã.
   */
  progresso?: { feito: number; total: number };
  multiple: boolean;
  compact?: boolean;
  /**
   * Caixa BAIXA em vez de proporcional.
   *
   * Uma zona de largar com `aspect-[4/3]` numa coluna de 520px fica com 391px
   * de altura — medido. Duas dessas, lado a lado, são metade da janela de
   * trabalho gasta a não mostrar nada. Vazia é uma faixa; ao ganhar uma foto,
   * a miniatura é que traz a proporção de volta.
   */
  curto?: boolean;
  /**
   * Uma FAIXA por baixo da grelha, e não uma célula dentro dela.
   *
   * É a forma que a caixa de acrescentar fotos tem num mood board. Como célula
   * quadrada, caía a meio de uma fila e lia-se como uma foto em falta; a toda a
   * largura e baixa, lê-se pelo que é: o que se faz A SEGUIR às que já lá
   * estão.
   */
  faixa?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function pick(list: FileList | null) {
    if (!list) return;
    // Alguns sistemas entregam HEIC/ficheiros de câmara com `type` vazio —
    // aceitar também por extensão, em vez de os descartar em silêncio.
    const files = Array.from(list).filter(
      (f) =>
        f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i.test(f.name),
    );
    if (files.length) onFiles(files);
  }

  /**
   * A ALTURA É A MESMA, esteja a carregar ou não.
   *
   * A caixa de espera vai EXACTAMENTE onde o «A carregar…» já vivia, e no
   * mesmo tamanho: uma faixa de 56 px que crescesse a meio de um lote
   * empurrava a grelha de fotografias para baixo debaixo do dedo dela — que é
   * a maneira mais certa de uma animação de progresso piorar o telemóvel. Por
   * isso a medida sai daqui e serve os dois estados; o que muda lá dentro é só
   * o conteúdo.
   */
  const caixa = faixa ? "h-14" : curto ? "h-24" : compact ? "aspect-square" : "aspect-[4/3]";

  if (progresso) {
    return (
      <div className={`flex w-full items-center justify-center ${caixa}`}>
        <EmCurso
          titulo={progresso.total === 1 ? "A carregar a foto…" : "A carregar as fotos…"}
          // A contagem a sério, que o `handleUpload` sempre soube e nunca disse.
          feito={progresso.feito}
          total={progresso.total}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files);
      }}
      // `flex-row`/`flex-col` e `gap` são escolhidos AQUI, e não acrescentados
      // por cima: duas utilidades da mesma propriedade decidem-se pela ordem na
      // folha de estilo e não pela ordem na string, e um `flex-col` de base
      // ganharia ao `flex-row` da faixa sem nada o denunciar.
      className={`flex w-full items-center justify-center rounded-lg border border-dashed text-center  focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-600/55 ${caixa} ${
        faixa
          ? "flex-row gap-2 p-2"
          : curto
            ? "flex-col gap-1 p-2"
            : compact
              ? "flex-col gap-1 p-2"
              : "flex-col gap-1 p-3"
      } ${
        drag
          ? "border-sage-600/60 bg-sage-600/[0.06]"
          : "border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-3)] hover:border-sage-600/45"
      } ${ESTADO} ${PRESSAO}`}
    >
      <span className="text-[9px] tracking-[0.15em] uppercase text-foreground/35">{label}</span>
      {!compact && <span className="text-[9px] text-foreground/25">arraste ou clique</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}

/**
 * O documento e a língua de um PDF, numa só cadeia — para saber se o que se
 * vai enviar ainda é o que foi visto.
 *
 * CANÓNICA (chaves por ordem, sem `undefined`), como a `chaveDoPdf` do
 * servidor: a gravação do rascunho devolve o mesmo documento com as chaves
 * noutra ordem, e uma comparação crua dava «mudou» sem nada ter mudado —
 * medido no browser, a confirmação nunca chegava a aparecer.
 */
/** O PDF que o servidor devolveu, com o que veio nos cabeçalhos. */
interface PdfPronto {
  blob: Blob;
  /** `X-Chave-Do-Pdf` — só no PDF final. */
  chave: string | null;
  emFalta: number;
  /** `X-Conteudo-Cortado`, por ler. */
  cortes: string | null;
}

/**
 * Descarregar o PDF (anexo) em vez de abrir numa aba nova: a CSP do site
 * (object-src 'none', sem frame-src) bloqueia mostrar um blob:PDF numa aba ou
 * iframe, o que fazia «não acontecer nada». Um download nunca é bloqueado e
 * abre no leitor de PDF do dispositivo.
 */
function guardarNoDisco(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * O PDF abre dentro do estúdio (`VerOPdfNoEcra`) em vez de se descarregar?
 * Num telemóvel, sim: a barra está compacta, ou o ponteiro é o dedo.
 */
function verPdfNoEcra(barraCompacta: boolean): boolean {
  if (barraCompacta) return true;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    return false;
  }
}

const CHAVE_DO_PDF_VISTO = (quoteId: string) => `liquen-pdf-visto:${quoteId}`;

/** O «já vi o PDF final» desta aba, se houver (ver `pdfVisto`). */
function lerPdfVisto(
  quoteId: string,
): { chave: string; retrato: string; confirmado: boolean } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_DO_PDF_VISTO(quoteId)) ?? "null");
    return v && typeof v.chave === "string" && typeof v.retrato === "string"
      ? { chave: v.chave, retrato: v.retrato, confirmado: v.confirmado === true }
      : null;
  } catch {
    return null;
  }
}

function guardarPdfVisto(
  quoteId: string,
  v: { chave: string; retrato: string; confirmado: boolean } | null,
): void {
  try {
    if (v) sessionStorage.setItem(CHAVE_DO_PDF_VISTO(quoteId), JSON.stringify(v));
    else sessionStorage.removeItem(CHAVE_DO_PDF_VISTO(quoteId));
  } catch {
    /* sem armazenamento (modo privado cheio): vale só nesta página, como antes */
  }
}

function retratoDoPdf(doc: unknown, idioma: string): string {
  const canonico = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === "object") {
      const saida: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) saida[k] = canonico(x);
      }
      return saida;
    }
    return v;
  };
  return `${idioma}|${JSON.stringify(canonico(doc))}`;
}

/** O que muda em inglês — a mesma frase na folha do telemóvel e no painel da pastilha. */
const RESSALVA_DO_INGLES =
  "Em inglês sai a moldura do documento — rótulos, textos da casa, condições, a data e o tipo de evento. Da tua prosa sai em inglês o que estiver nas caixas «EN»; o que ficar em branco sai em português. Os valores continuam à portuguesa (1.234,56 €).";

/**
 * O QUE FALTA TRADUZIR, DITO ANTES DO CLIQUE.
 *
 * As duas contas, e as duas frases: «vai sair em português» é verdade sobre um
 * campo VAZIO e é falso sobre um desactualizado — esse tem inglês, só que no
 * inglês errado. Uma traduz-se, a outra relê-se. Vive aqui para a folha do
 * telemóvel e o painel do ecrã largo dizerem o mesmo.
 */
function AvisoDasTraducoes({
  doc,
  onVer,
  alinhar = "direita",
}: {
  doc: ProposalDoc;
  onVer: (campo: CampoPublicado) => void;
  alinhar?: "direita" | "esquerda";
}) {
  const faltam = camposPorTraduzir(doc);
  const velhas = camposPorRever(doc).filter((c) => c.estado === "desactualizado");
  if (faltam.length === 0 && velhas.length === 0) return null;
  const primeiro = faltam[0] ?? velhas[0];
  return (
    <p
      aria-live="polite"
      className={`w-full ${alinhar === "direita" ? "text-right" : "text-left"} text-[11px] leading-snug text-[var(--bo-aviso)]`}
    >
      {faltam.length > 0 &&
        (faltam.length === 1
          ? "1 campo ainda não tem versão inglesa — vai sair em português."
          : `${faltam.length} campos ainda não têm versão inglesa — vão sair em português.`)}{" "}
      {velhas.length > 0 &&
        (velhas.length === 1
          ? "1 tradução ficou para trás do português."
          : `${velhas.length} traduções ficaram para trás do português.`)}{" "}
      <button
        type="button"
        onClick={() => onVer(primeiro.campo)}
        className={`font-medium underline underline-offset-2 ${ESTADO} ${PRESSAO}`}
      >
        Ver quais
      </button>
    </p>
  );
}
