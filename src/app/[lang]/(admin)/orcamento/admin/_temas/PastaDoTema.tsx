"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ThemeCopyMode, ThemeImage, ThemeSummary } from "@/lib/theme-types";
import PhotoLightbox from "../PhotoLightbox";
import ThemeCopyDialog, { type ThemeCopyOutcome } from "../ThemeCopyDialog";
import { downloadMany, downloadName } from "../photo-download";
import { guardarBlob, useDescarga } from "../ui/descarregar";
import { THEME_PAGE_SIZE } from "@/lib/theme-types";
import { useToast } from "../Toast";
import { useAnular } from "../ui/anular";
import { useDepoisDeApagarVarios } from "../ui/depois-de-apagar";
import { Button, emGrupos, PerguntaDestrutiva, type AccaoDeItem } from "../ui";
import { type CapaDoCartao } from "../capa-do-cartao";
import { ESTADO, PRESSAO } from "../ui/movimento";
import { useSaidaDeUmSo } from "../ui/saida";
import { paginaDaResposta, usarAdiantada } from "../prefetch-de-tema";
import { MenuDeContexto, type PedidoDeMenu } from "../MenuDeContexto";
import { porqueNaoLeu, porqueNaoLeuDoErro, type LeituraFalhada } from "@/lib/porque-nao-leu";
import { fotoPelaTecla } from "@/lib/temas-grelha";
import { escreverCarga, fotosQueViajam, type CargaDeFotos } from "@/lib/temas-arrasto";
import { vestirOArrasto } from "./arrasto";
import { ABOVE_FOLD, Photo, objectUrl, revokeUrl } from "./FotoDaGrelha";
import { AccaoEmBloco, mergePage } from "@/lib/temas/listas-de-fotos";
import { photoCountLabel } from "@/lib/temas/textos-dos-temas";
import { GrelhaDaPasta } from "./GrelhaDaPasta";
import { BarraDaSeleccaoDaPasta } from "./BarraDaSeleccaoDaPasta";
import { AvisosDaPasta } from "./AvisosDaPasta";
import { CabecalhoDaPasta } from "./CabecalhoDaPasta";
import {
  Ahead,
  Failure,
  FolderState,
  PedidoAPasta,
  Pending,
  Skipped,
  ThumbJob,
} from "./tipos-da-pasta";
import { teclaDeMenu } from "../ui/tecla-de-menu";
import { plural } from "@/lib/plural";
import { useArrumacaoDaPasta } from "./useArrumacaoDaPasta";
import { useMoverEApagarFotos } from "./useMoverEApagarFotos";
import { PREFETCH_DELAY_MS } from "./tectos-da-pasta";
import { useSeleccaoDaPasta } from "./useSeleccaoDaPasta";
import { useRepeticaoDoEnvio } from "./useRepeticaoDoEnvio";
import { useMiniaturasDaPasta } from "./useMiniaturasDaPasta";
import { useEnvioDeFotos } from "./useEnvioDeFotos";
import { useNoEcraAteSair } from "./useNoEcraAteSair";

export const AVISO_DE_LOTE_A_MEIO =
  "Ainda há fotos a subir. Se sair agora, as que faltam não são carregadas. Sair mesmo assim?";

/** A pasta de UM tema: renomear, carregar fotos, remover fotos, eliminar. */
export function PastaDoTema({
  theme,
  themes,
  onBack,
  onFolderState,
  onRename,
  onCover,
  onCopiedTo,
  accoes,
  aoArrastar,
  aoSubir,
  pedidoDeMover,
  pedidoAPasta,
  aoServirPedido,
  usos,
}: {
  theme: ThemeSummary;
  /** Todos os temas — para o "Copiar para…" saber para onde pode levar. */
  themes: ThemeSummary[];
  onBack: () => void;
  onFolderState: (state: FolderState) => void;
  onRename: (name: string) => void;
  /** A capa mudou. Vai com os campos TODOS da fotografia nova — ver
   *  `capa-do-cartao.ts`, e o defeito que ele fecha. */
  onCover: (coverPath: string, capa: CapaDoCartao) => void;
  /** Chegaram `added` fotos ao tema `destId` — o cartão dele tem de somar.
   *  Um número NEGATIVO subtrai, que é o que o «Anular» de um arrasto pede. */
  onCopiedTo: (destId: string, added: number) => void;
  /** As acções do tema, para o «⋯» do cabeçalho — a mesma lista do cartão
   *  (`accoesDoTema`, sem «Abrir»). */
  accoes: readonly AccaoDeItem[];
  /** Começou (ou acabou) um arrasto de fotografias. Quem precisa de saber é a
   *  coluna da esquerda, que é irmã desta pasta e não a conhece. */
  aoArrastar?: (aArrastar: boolean) => void;
  /** Há um lote a subir? Quem precisa de saber é o `Temas`: as outras duas
   *  portas para fora desta pasta são dele. Ver `AVISO_DE_LOTE_A_MEIO`. */
  aoSubir?: (aSubir: boolean) => void;
  /** Um lote largado num tema da coluna. Ver a nota no `Temas`. */
  pedidoDeMover?: { destino: ThemeSummary; carga: CargaDeFotos; n: number } | null;
  /** «Adicionar fotografias…», «Renomear…» ou «Definir capa…», pedidos no
   *  menu do tema. Ver `pedirAPasta` no `Temas`. */
  pedidoAPasta?: PedidoAPasta | null;
  /** O pedido foi servido — o `Temas` esquece-o. */
  aoServirPedido?: (servido: PedidoAPasta) => void;
  /** Quantas propostas usam cada tema — a mesma contagem dos cartões. */
  usos?: Record<string, number> | null;
}) {
  const { toast } = useToast();
  const anular = useAnular();
  // Remover fotos deixa-as 30 dias na Reciclagem (R3b), com «Anular».
  const depoisDeApagarVarios = useDepoisDeApagarVarios();
  /** As fotos JÁ CARREGADAS, mais recentes primeiro. É sempre um PREFIXO da
   *  lista do servidor — ver `nextOffset` abaixo. */
  const [images, setImages] = useState<ThemeImage[]>([]);
  /** Total na pasta segundo o servidor; `null` = ainda não se sabe. */
  const [total, setTotal] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  /** A última página veio cheia → é provável que haja mais. */
  const [pageFull, setPageFull] = useState(false);
  /**
   * PORQUE é que a pasta não se deixou ler. A pasta ilegível já não era
   * confundida com uma pasta vazia — isso estava feito —, mas a razão era
   * sempre a mesma: «é uma falha temporária, recarrega a página daqui a
   * pouco». Com a sessão caída (o caso comum: este ecrã fica aberto horas)
   * isso é falso e o conselho não leva a lado nenhum — recarregar devolve o
   * mesmo 401. Com um 404 também: a pasta não volta por esperar.
   */
  const [falhaDaPasta, setFalhaDaPasta] = useState<LeituraFalhada | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lotes a decorrer — não um booleano: com dois lotes ao mesmo tempo, o
   *  primeiro a acabar desligava o indicador do outro. */
  const [uploadingCount, setUploadingCount] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<Failure[]>([]);
  /** As fotos deste arrasto que já estavam no tema. Ao lado do `failed` e com
   *  a mesma forma, mas NEUTRA: não é uma avaria, é o que ela pediu. */
  const [skipped, setSkipped] = useState<Skipped[]>([]);
  /** O tema tem fotos anteriores a esta funcionalidade — dito uma vez, sem
   *  drama, porque explica a única repetida que pode escapar. */
  const [legacyPhotos, setLegacyPhotos] = useState(false);
  /** A pasta não pôde ser lida toda na última verificação. As repetidas que se
   *  encontraram são reais, mas pode ter escapado alguma — e prometer o
   *  contrário seria anunciar uma verificação que não aconteceu. */
  const [partialCheck, setPartialCheck] = useState(false);
  /** A fase de impressão digital, antes de qualquer preparação ou upload. */
  const [verifying, setVerifying] = useState<{ done: number; total: number } | null>(null);
  /** O diálogo "Copiar para…" está aberto. */
  const [copyOpen, setCopyOpen] = useState(false);
  /** E em que modo abre: «Mover para…» do menu da fotografia abre em
   *  «mover», a barra da selecção em «copiar». Sem isto a folha abria sempre
   *  em «copiar» e o menu que dizia «Mover» copiava — ver `modoInicial` no
   *  `ThemeCopyDialog`. Só muda no instante de abrir, por isso não salta a
   *  meio da saída da folha. */
  const [copyMode, setCopyMode] = useState<ThemeCopyMode>("copiar");
  /** O que aconteceu à última cópia/mudança — fica no ecrã enquanto houver
   *  fotos por levar (um número em que ela tem de agir não pode desaparecer). */
  const [copyReport, setCopyReport] = useState<ThemeCopyOutcome | null>(null);
  /** As fotos deste lote que ainda não voltaram do servidor, já à vista com a
   *  imagem que está no disco dela — ver `Pending`. */
  const [pending, setPending] = useState<Pending[]>([]);
  /** `caminho → URL de objeto` das fotos carregadas NESTA sessão: a grelha
   *  mostra a cópia local em vez de ir buscar ao Storage o que já cá está. */
  const [localSrc, setLocalSrc] = useState<Map<string, string>>(new Map());
  /** A página seguinte, já pedida e guardada — ver `prefetch`. */
  const [ahead, setAhead] = useState<Ahead | null>(null);
  /** A geração de miniaturas em falta, quando está a decorrer ou acabou. */
  const [thumbJob, setThumbJob] = useState<ThumbJob | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Índice da foto que está a ser arrastada (null = arrasto parado). */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** Onde ela cairia se a largasse agora — é o que desenha o espaço aberto. */
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /**
   * As fotografias à espera de resposta à pergunta de as remover.
   *
   * Um estado só para os dois caminhos — a foto solta e o lote seleccionado —,
   * com o `emBloco` a dizer qual deles age. Dois estados separados seriam duas
   * janelas a poderem abrir ao mesmo tempo.
   */
  const [aRemover, setARemover] = useState<{ alvos: ThemeImage[]; emBloco: boolean } | null>(null);
  /** A ação em bloco que está a decorrer (transferir ou remover), com a
   *  contagem verdadeira. `null` = nada a acontecer. */
  const [emBloco, setEmBloco] = useState<AccaoEmBloco | null>(null);
  const [coverPath, setCoverPath] = useState<string | undefined>(theme.coverPath);
  /** Quantas arrumações da grelha já foram mandadas — ver `persistOrder`. */
  const ordemMandada = useRef(0);
  const [name, setName] = useState(theme.name);
  const [renaming, setRenaming] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * ── O MODO «ESCOLHER A CAPA» ───────────────────────────────────────────
   *
   * «Definir capa…» no menu do tema abre a pasta neste modo: uma faixa com a
   * instrução e «Cancelar» por cima da grelha, e o clique numa fotografia faz
   * dela a capa (o mesmo `setAsCover` do «Definir como capa» da foto) em vez
   * de a seleccionar. O Esc cancela. É a versão de um gesto só do que já se
   * fazia em três (seleccionar, procurar o botão, carregar).
   */
  const [escolherCapa, setEscolherCapa] = useState(false);
  /** O último pedido do menu do tema já servido — ver `pedidoAPasta`. */
  const pedidoAPastaServido = useRef<PedidoAPasta | null>(null);
  useEffect(() => {
    const p = pedidoAPasta;
    if (!p || p.temaId !== theme.id || p === pedidoAPastaServido.current) return;
    pedidoAPastaServido.current = p;
    aoServirPedido?.(p);
    // O seletor de ficheiros só abre com um gesto recente da pessoa — e o
    // clique no item do menu foi há uns milissegundos, no mesmo gesto.
    if (p.accao === "adicionar") inputRef.current?.click();
    else if (p.accao === "renomear") comecarARenomear();
    else comecarAEscolherCapa();
    // As duas acções são funções do corpo (fecham sobre o estado actual).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoAPasta, theme.id, aoServirPedido]);
  function comecarARenomear() {
    setName(theme.name);
    setRenaming(true);
  }
  function comecarAEscolherCapa() {
    setEscolherCapa(true);
  }
  /** Um PATCH de cada vez: confirmar o nome com o Enter dispara também o onBlur. */
  const renamingBusy = useRef(false);
  /** Passa a falso ao sair da pasta — um lote que só termine depois disso não
   *  pode voltar a escrever no estado deste ecrã. */
  const alive = useRef(true);
  /** Profundidade do arrasto: entrar numa foto dispara `dragleave` no
   *  contentor, e a moldura piscava a cada célula por baixo do ponteiro. */
  const dragDepth = useRef(0);
  /** O que a grelha faz à profundidade do arrasto — ver `GrelhaDaPasta`. */
  const arrasto = {
    entrar: () => {
      dragDepth.current += 1;
    },
    sair: () => {
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      return dragDepth.current;
    },
    zerar: () => {
      dragDepth.current = 0;
    },
  };
  /**
   * ── O QUE O ARRASTO ENTRE TEMAS PRECISA DE GUARDAR ────────────────────
   *
   * `aMover` é a espera: enquanto ela dura, a barra da selecção mostra a
   * contagem verdadeira em vez de um botão parado (é o mesmo `EmCurso` que a
   * transferência e a remoção já usam).
   *
   * `anuncio` é a região `role="status"` que a Parte 4 exige — «operações de
   * arrasto anunciadas em role="status"». Não é o toast: o toast é para quem
   * VÊ, e um leitor de ecrã não lê um aviso que aparece no canto e se vai
   * embora ao fim de quatro segundos.
   *
   * `recarga` obriga a pasta a reler a primeira página. Serve o «Anular»: as
   * fotografias voltam do tema de destino com CAMINHOS NOVOS no Storage (uma
   * cópia seguida de um apagar, não um renomear) e com URLs assinados novos.
   * Repô-las de memória com o `reinsertAt` desenhava uma grelha de imagens
   * partidas — o que se repõe é o pedido, não o objecto.
   */
  /**
   * ── O REGRESSO DE UM DROP FALHADO ─────────────────────────────────────
   *
   * «Falha no drop: REGRESSO ANIMADO à origem com `--ease-reposition`.»
   * [APPLE], Parte 4 e Parte 5 (475 ms).
   *
   * Metade disto é do browser e não se lhe toca: a imagem de arrasto a voar de
   * volta ao sítio é comportamento nativo do HTML5 drag-and-drop, e a única
   * forma de a substituir era trocar tudo isto por `pointer events` — o que
   * custaria o largar de FICHEIROS e de PASTAS do computador, que é o gesto
   * de origem desta grelha e o único que o HTML5 sabe fazer.
   *
   * A outra metade é nossa, e é a que faltava: a célula de onde a fotografia
   * saiu está a 40% enquanto o arrasto anda, e voltava a 100% num corte de
   * 150 ms — o degrau de um estado a mudar. Não é um estado: é um objecto que
   * voltou para o lugar, e por isso volta com a curva e a duração de
   * reposicionar. Guarda-se o `path` e não o índice, porque a grelha pode
   * ter-se arrumado pelo meio.
   *
   * `dropEffect === "none"` é o sinal que a norma dá para «isto não foi
   * largado em lado nenhum» — Esc a meio, ou largado fora de um destino.
   */
  const [aRegressar, setARegressar] = useState<string | null>(null);
  const [aMover, setAMover] = useState<{ feito: number; total: number } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [recarga, setRecarga] = useState(0);
  /** Âncora do Shift+clique (índice na grelha à vista). */
  const anchor = useRef<number | null>(null);

  /** Todos os URLs de objeto criados nesta pasta. Sair da pasta liberta-os
   *  todos de uma vez — é a única forma de garantir que nenhum fica pendurado,
   *  seja qual for o caminho por onde o lote acabou. */
  const objectUrls = useRef<Set<string>>(new Set());
  /** Pedido para parar a geração de miniaturas (o botão "Parar"). */
  const stopThumbs = useRef(false);

  useEffect(() => {
    alive.current = true;
    const urls = objectUrls.current;
    return () => {
      alive.current = false;
      for (const url of urls) revokeUrl(url);
      urls.clear();
    };
  }, []);

  /** Um URL de objeto para esta foto, já registado para ser libertado à saída. */
  const trackUrl = useCallback((file: File): string | undefined => {
    const url = objectUrl(file);
    if (url) objectUrls.current.add(url);
    return url;
  }, []);

  // `onFolderState` é recriada a cada render do pai; guardá-la numa ref deixa
  // o efeito de notificação depender só do que a pasta sabe.
  const notify = useRef(onFolderState);
  useEffect(() => {
    notify.current = onFolderState;
  });

  useEffect(() => {
    let active = true;
    (async () => {
      // Guardados para o `catch`: é lá que se escreve a frase, e sem estes
      // chegava lá um "falhou" que não diz nem o estado nem o que o servidor
      // explicou.
      let resposta: { status: number } | null = null;
      let corpo: unknown = null;
      try {
        // O rato já pousou neste cartão? Então a listagem pode já estar cá —
        // ver `adiantarTema`. `null` quer dizer «não havia, ou já não vale», e
        // aí paga-se a ida normal, exactamente como antes disto existir.
        //
        // Numa RECARGA não se usa: o que se está a pedir é justamente a
        // verdade nova do servidor (as fotografias que o «Anular» acabou de
        // mandar de volta), e uma página adiantada é, por definição, a de
        // antes.
        const adiantada = recarga === 0 ? await usarAdiantada(theme.id) : null;
        const pagina =
          adiantada ??
          (await (async () => {
            const res = await fetch(
              `/api/temas/${theme.id}/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
              { cache: "no-store" },
            );
            if (!res.ok) {
              resposta = res;
              corpo = await res.json().catch(() => null);
              throw new Error(String(res.status));
            }
            return paginaDaResposta(await res.json());
          })());
        if (!active) return;
        const page = pagina.images;
        setImages(page);
        setFalhaDaPasta(null);
        // `total: null` é uma pasta que NÃO pôde ser lida — ver
        // `paginaDaResposta`. Aceitá-la como zero faria a grelha dizer "arrasta
        // aqui as fotos" a um tema que pode ter 3000, e ela a carregá-las outra
        // vez.
        setTotal(pagina.total);
        setTruncated(pagina.truncated);
        setPageFull(page.length >= THEME_PAGE_SIZE);
      } catch (e) {
        // Sem lista não se avisa o pai: o cartão guarda a contagem que veio do
        // servidor (que pode ser "Fotos indisponíveis") em vez de dizer "0".
        if (!active) return;
        // A MESMA falha, dita de duas maneiras. O aviso passageiro flutua por
        // cima de qualquer ecrã e por isso nomeia a coisa; o painel que FICA na
        // grelha já tem o nome no título, e repeti-lo lá era dizer duas vezes o
        // que se está a ver.
        const frase = (oQue: string) =>
          resposta ? porqueNaoLeu(oQue, resposta, corpo) : porqueNaoLeuDoErro(oQue, e);
        setFalhaDaPasta(frase(""));
        toast(frase("as fotos deste tema").mensagem, "error");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [theme.id, toast, recarga]);

  /**
   * O offset da página seguinte é, sempre, quantas fotos já temos.
   *
   * Parece frágil e é o contrário: `images` é mantido como um PREFIXO exato da
   * lista do servidor (mais recentes primeiro). Uma foto nova entra à cabeça
   * das duas listas; uma foto removida sai das duas. Logo, o que o servidor
   * tem a seguir ao que já mostramos está exatamente em `offset =
   * images.length` — mesmo que subam 40 fotos entre uma página e a seguinte,
   * que é o caso em que uma contagem de páginas fixa saltava fotos. O
   * `mergePage` por `path` é a rede por baixo disto.
   */
  const nextOffset = images.length;
  const remaining = total === null ? null : Math.max(0, total - images.length);
  const hasMore = pageFull || (remaining !== null && remaining > 0);

  /** UM único sítio a avisar o pai (contagem + capa do cartão). Avisar também
   *  dentro do upload e da remoção punha o cartão a par de uma lista já
   *  ultrapassada — a contagem ficava a divergir da grelha. */
  const cover = coverPath ? images.find((i) => i.path === coverPath) : images[0];
  useEffect(() => {
    if (loading || total === null) return;
    notify.current({
      total,
      truncated,
      // Uma capa escolhida que ainda não foi carregada (está numa página
      // adiante) não se sabe resolver: melhor não mexer no cartão do que
      // trocar-lhe a capa pela foto mais recente.
      capa: coverPath && !cover ? undefined : (cover ?? null),
    });
  }, [loading, total, truncated, coverPath, cover]);

  // Enquanto sobem fotos, fechar o separador perde o que falta. O browser
  // mostra o seu próprio aviso — é o único que ele deixa aparecer aqui.
  useEffect(() => {
    if (uploadingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploadingCount]);

  const { upload } = useEnvioDeFotos({
    theme,
    toast,
    setImages,
    setTotal,
    setUploadingCount,
    setProgress,
    setFailed,
    setSkipped,
    setLegacyPhotos,
    setPartialCheck,
    setVerifying,
    setPending,
    setLocalSrc,
    alive,
    trackUrl,
  });

  const { runThumbJob } = useMiniaturasDaPasta({
    theme,
    toast,
    setImages,
    images,
    total,
    thumbJob,
    setThumbJob,
    alive,
    stopThumbs,
  });

  const { pick, retryFailed, addSkippedAnyway, handleDrop } = useRepeticaoDoEnvio({
    toast,
    failed,
    setFailed,
    skipped,
    setSkipped,
    alive,
    upload,
  });

  /** Junta ao ecrã uma página que já veio do servidor (pedida agora ou de
   *  antemão). Um só sítio a mexer nestes quatro estados. */
  const absorb = useCallback(
    (page: ThemeImage[], pageTotal: number | null, pageTruncated: boolean, full: boolean) => {
      setImages((prev) => mergePage(prev, page));
      if (pageTotal !== null) setTotal(pageTotal);
      setTruncated(pageTruncated);
      setPageFull(full);
    },
    [],
  );

  async function loadMore() {
    if (loadingMore) return;
    // A página seguinte já cá está: entra sem esperar por nada. É este o
    // caminho normal — o pedido foi feito 1,5 s depois de a pasta abrir.
    if (ahead && ahead.offset === images.length) {
      const next = ahead;
      setAhead(null);
      absorb(next.images, next.total, next.truncated, next.full);
      return;
    }
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/temas/${theme.id}/imagens?offset=${nextOffset}&limit=${THEME_PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!res.ok) throw new Error("falhou");
      const data = await res.json();
      if (!alive.current) return;
      const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
      absorb(
        page,
        typeof data?.total === "number" ? data.total : null,
        Boolean(data?.truncated),
        page.length >= THEME_PAGE_SIZE,
      );
    } catch {
      toast("Não foi possível carregar mais fotos.", "error");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }

  /**
   * A PÁGINA SEGUINTE, ANTES DE ELA A PEDIR.
   *
   * Só depois de a primeira estar no ecrã (`PREFETCH_DELAY_MS`), e só UMA: o
   * objetivo é que o "Mostrar mais" seja instantâneo, não descarregar o tema
   * todo às escondidas — um tema tem 4000 fotos e assinar URLs custa ao
   * servidor. A página guardada trava-se a um `offset`: se entretanto entrar
   * ou sair uma foto, deixa de encaixar e é deitada fora (o efeito volta a
   * correr e pede a certa).
   */
  // Uma página guardada só serve no sítio para onde foi pedida: se entretanto
  // entrou (ou saiu) uma foto, ela deixa de encaixar e volta a pedir-se a
  // certa. Isto lê-se, não se apaga — deitar fora o estado dentro do efeito
  // seria uma renderização a mais para dizer o que já se sabe daqui.
  const aheadFits = ahead !== null && ahead.offset === images.length;
  useEffect(() => {
    if (loading || loadingMore || !hasMore || aheadFits) return;
    let cancelled = false;
    const offset = images.length;
    const timer = window.setTimeout(() => {
      (async () => {
        try {
          const res = await fetch(
            `/api/temas/${theme.id}/imagens?offset=${offset}&limit=${THEME_PAGE_SIZE}`,
            { cache: "no-store" },
          );
          if (!res.ok) return;
          const data = await res.json();
          if (cancelled || !alive.current) return;
          const page: ThemeImage[] = Array.isArray(data?.images) ? data.images : [];
          if (page.length === 0) return;
          setAhead({
            offset,
            images: page,
            total: typeof data?.total === "number" ? data.total : null,
            truncated: Boolean(data?.truncated),
            full: page.length >= THEME_PAGE_SIZE,
          });
        } catch {
          // Falhar a adivinhar não é um erro que se mostre: o botão "Mostrar
          // mais" continua a fazer o pedido à mão, com a sua própria mensagem.
        }
      })();
    }, PREFETCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [theme.id, loading, loadingMore, hasMore, aheadFits, images.length]);

  const { clearSelection, toggleAt, estenderPeloTeclado } = useSeleccaoDaPasta({
    images,
    setSelected,
    anchor,
  });

  const { removeImages, moverParaTema, applyCopyOutcome } = useMoverEApagarFotos({
    theme,
    onCopiedTo,
    toast,
    anular,
    depoisDeApagarVarios,
    images,
    setImages,
    setTotal,
    setCopyOpen,
    setCopyReport,
    setSelected,
    setCoverPath,
    alive,
    setAMover,
    setAnuncio,
    setRecarga,
    anchor,
  });

  const {
    setAsCover,
    moveTo,
    pedirParaRemoverUma,
    rename,
    pedirParaRemoverAsSeleccionadas,
    removeSelected,
  } = useArrumacaoDaPasta({
    theme,
    onRename,
    onCover,
    toast,
    anular,
    setImages,
    images,
    selected,
    setBulkBusy,
    setARemover,
    setEmBloco,
    coverPath,
    setCoverPath,
    ordemMandada,
    name,
    setName,
    setRenaming,
    renamingBusy,
    alive,
    clearSelection,
    removeImages,
  });

  // O `aoSubir` é um `setState` do pai, portanto estável entre desenhos.
  useEffect(() => {
    aoSubir?.(uploadingCount > 0);
    return () => aoSubir?.(false);
  }, [uploadingCount, aoSubir]);

  /** Sair com um lote a meio abandona o que falta — é preciso dizê-lo. */
  function leave() {
    if (uploadingCount > 0 && !window.confirm(AVISO_DE_LOTE_A_MEIO)) return;
    onBack();
  }

  // Uma leitura bem sucedida põe SEMPRE um número em `total` (nem que seja o
  // tamanho da página que veio), por isso `null` aqui só pode querer dizer uma
  // coisa: a pasta não pôde ser lida. Escrever "0 fotos" nesse caso leria-se
  // como "as minhas fotos desapareceram".
  const unreadable = !loading && total === null;
  const countLine = unreadable
    ? photoCountLabel(null)
    : images.length < (total ?? 0)
      ? `${images.length} de ${photoCountLabel(total, truncated)}`
      : photoCountLabel(total ?? 0, truncated);
  const selectedCount = selected.size;
  /** Há para onde levar fotos? Sem outro tema, "Copiar para…" seria um botão
   *  que só sabe abrir um diálogo vazio. */
  const otherThemes = useMemo(() => themes.filter((t) => t.id !== theme.id), [themes, theme.id]);
  // Ver uma foto em grande. `null` = fechado. Guarda-se também o elemento que
  // estava focado, para o foco voltar ao mosaico de onde se abriu.
  const [zoomAt, setZoomAt] = useState<number | null>(null);
  /** O menu do botão direito desta pasta — um só, como na lista de temas. */
  const [menuDaFoto, setMenuDaFoto] = useState<PedidoDeMenu | null>(null);
  const fecharMenuDaFoto = useCallback(() => setMenuDaFoto(null), []);
  const zoomOpener = useRef<HTMLElement | null>(null);
  const [downloading, setDownloading] = useState(false);

  /**
   * ── DE ONDE É QUE A LUPA CRESCE ────────────────────────────────────────
   *
   * «Entrada com `--ease-quick` a partir da POSIÇÃO DA MINIATURA (FLIP), não
   * do centro do ecrã.» (Parte 3 do `docs/APPLE-TEMAS.md`.) Para isso é
   * preciso o rectângulo da célula no instante do gesto — e depois disso a
   * célula pode estar tapada, ou fora do ecrã, ou já não existir.
   *
   * As células registam-se aqui pelo índice. Um `Map` e não um array: as
   * células desmontam-se por baixo (o `content-visibility` da
   * `.celula-saltavel` não desmonta, mas a remoção de uma foto sim) e um
   * array com buracos é um array que engana quem o percorre.
   */
  const celulas = useRef(new Map<number, HTMLElement>());

  /* ════════════════════════════════════════════════════════════════════════
     A GRELHA PELO TECLADO — fase 11 (`docs/APPLE-TEMAS.md`, Parte 7)
     ════════════════════════════════════════════════════════════════════════

     O desenho do Calendário (`diaPelaTecla`): a grelha é UM sítio no fio do
     Tab, e lá dentro as setas andam. Sessenta fotos eram sessenta paragens do
     Tab — mais sessenta «⋯» — antes de se chegar ao que vem depois.

     As colunas MEDEM-SE: o `GRELHA_DE_FOTOS` é `auto-fill`, e o número muda
     com a largura da caixa (2 no telemóvel, 4 a 6 no computador). O browser
     já fez a conta — o `grid-template-columns` calculado traz uma largura por
     coluna —, e é essa conta que se lê. Sem `ResizeObserver` (jsdom) fica o 2
     da base, que é o que a classe diz antes de qualquer `@container`. */
  const grelha = useRef<HTMLDivElement | null>(null);
  const [colunas, setColunas] = useState(2);
  const [fotoComFoco, setFotoComFoco] = useState(0);
  const semFotos = images.length === 0;
  useEffect(() => {
    const el = grelha.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      // `none` é o que o jsdom (e uma caixa sem `display: grid`) responde: não
      // é uma coluna, é a ausência de grelha — fica o que estava.
      const v = getComputedStyle(el).gridTemplateColumns;
      if (!v || v === "none") return;
      const n = v.split(" ").filter(Boolean).length;
      if (n > 0) setColunas(n);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
    // A grelha só existe depois de carregar e com fotos: é quando ela aparece
    // (e não a cada foto) que há uma caixa nova a medir.
  }, [loading, semFotos]);
  const [origemDaLupa, setOrigemDaLupa] = useState<DOMRect | null>(null);
  const openZoom = useCallback((i: number) => {
    zoomOpener.current = document.activeElement as HTMLElement | null;
    const celula = celulas.current.get(i);
    setOrigemDaLupa(celula?.getBoundingClientRect() ?? null);
    setZoomAt(i);
  }, []);
  const closeZoom = useCallback(() => {
    setZoomAt(null);
    // O foco volta de onde veio; sem isto ficava no <body> e o teclado perdia-se.
    zoomOpener.current?.focus?.();
  }, []);

  /** Transfere uma foto (a do visualizador ou a de um mosaico). */
  // Uma foto é um original de vários MB: passa pelo `useDescarga`, que conta
  // os bytes à medida que chegam (o visualizador mostra-os no botão).
  const umaFoto = useDescarga();
  const downloadImage = useCallback(
    async (im: ThemeImage, i: number) => {
      try {
        const { blob } = await umaFoto.obter(im.url);
        // O nome é o NOSSO (tema + número), não o do armazenamento.
        guardarBlob(blob, downloadName(im, theme.name, i));
      } catch {
        toast("Não foi possível transferir a foto.", "error");
      }
    },
    [theme.name, toast, umaFoto],
  );

  /** Transfere as fotos selecionadas, uma de cada vez (ver photo-download.ts). */
  const downloadSelected = useCallback(async () => {
    const chosen = images.map((im, i) => ({ im, i })).filter(({ im }) => selected.has(im.path));
    if (chosen.length === 0) return;
    setDownloading(true);
    // O `downloadMany` já contava — e o `() => {}` que estava aqui deitava a
    // conta fora. Quarenta fotos são um a dois minutos: sem isto, o que ela vê
    // é um botão parado.
    setEmBloco({ tipo: "transferir", feito: 0, total: chosen.length });
    const res = await downloadMany(
      chosen.map(({ im, i }) => ({ url: im.url, filename: downloadName(im, theme.name, i) })),
      (p) => {
        if (alive.current) setEmBloco({ tipo: "transferir", feito: p.done, total: p.total });
      },
    );
    if (alive.current) setEmBloco(null);
    setDownloading(false);
    if (res.failed > 0) {
      toast(
        res.failed === res.total
          ? "Não foi possível transferir as fotos."
          : `${res.total - res.failed} de ${res.total} transferidas.`,
        "error",
      );
    } else {
      toast(plural(res.done, "foto transferida", "fotos transferidas"), "success");
    }
  }, [images, selected, theme.name, toast]);
  const pct =
    progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  /**
   * Há fotos a ser mostradas a partir do ORIGINAL — é o que acontece a tudo o
   * que foi carregado antes de as miniaturas existirem. Não é uma suposição: é
   * lido das fotos que estão à vista (as que subiram agora contam-se como
   * feitas, porque a miniatura foi com elas).
   */
  const missingThumbs = images.some((im) => !im.thumbUrl && !localSrc.has(im.path));
  const thumbPct =
    thumbJob && thumbJob.total && thumbJob.total > 0
      ? Math.min(100, Math.round((thumbJob.cursor / thumbJob.total) * 100))
      : 0;

  /* ── AS DUAS CAIXAS DESTA VISTA FICAM MONTADAS A SAIR ────────────────────
     A folha de copiar fotos e o visualizador. Os dois fechavam a seco porque
     era este componente que os desmontava; agora o fecho continua a acontecer
     no instante do gesto e o que se segura, 200 ms, é só a imagem.

     Os dados vão CONGELADOS (ver `useNoEcraAteSair`), e aqui isso não é zelo:
     o `applyCopyOutcome` fecha a folha e, na mesma volta, tira da grelha as
     fotos que foram movidas. Sem congelar, a folha passava os 200 ms da saída
     a dizer «0 fotos selecionadas» — a última coisa que se lia dela era uma
     contagem errada. */
  /* Memorizada porque tem de ser ESTÁVEL entre desenhos — ver a nota do
     `useNoEcraAteSair`. E pela ordem da GRELHA, não pela ordem por que ela
     clicou: é assim que a lista do relatório se lê como a grelha se vê. */
  const seleccionadas = useMemo(
    () => images.filter((im) => selected.has(im.path)).map((im) => im.path),
    [images, selected],
  );
  const aSairDaCopia = useSaidaDeUmSo(copyOpen);
  const copiaNoEcra = useNoEcraAteSair(copyOpen, aSairDaCopia, seleccionadas);

  /**
   * ── ⌘A SELECIONA TUDO, ESC LIMPA ───────────────────────────────────────
   *
   * Os dois atalhos que faltavam à selecção desta pasta (ponto 15 da auditoria
   * e a `SelectionBar` da Parte 3 do `docs/APPLE-TEMAS.md`: «Esc limpa a
   * seleção»). Com 312 fotos numa pasta, escolher todas era 312 cliques.
   *
   * ── O QUE ESTE OUVINTE NÃO PODE ROUBAR ────────────────────────────────
   *
   *  · o ⌘A DENTRO DE UM CAMPO — renomear o tema é um `<input>`, e lá o ⌘A
   *    selecciona o texto. Roubá-lo seria tirar um atalho para dar outro;
   *  · o Esc de quem tem uma janela aberta por cima — a pergunta de remover, o
   *    «Copiar para…», a lupa e o próprio menu de contexto fecham-se com Esc, e
   *    quem carrega está a fechar ESSA e não a desfazer a selecção que fez
   *    antes de a abrir. Por isso os quatro travam aqui;
   *  · o ⌘A com a pasta vazia — sem fotos não há nada a seleccionar, e
   *    `preventDefault` sem fazer nada seria só um atalho estragado.
   *
   * `Escape` sem selecção não faz nada e NÃO trava o evento: o teclado do
   * back office tem outros donos por cima deste ecrã.
   */
  useEffect(() => {
    const janelaAberta = copyOpen || aRemover !== null || zoomAt !== null || renaming;
    const noTeclado = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const aEscrever =
        !!alvo &&
        (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.isContentEditable);
      // No modo «escolher a capa» o Esc cancela o modo — e só isso: a
      // selecção que houvesse fica como estava.
      if (e.key === "Escape" && escolherCapa && !janelaAberta) {
        setEscolherCapa(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "a" || e.key === "A")) {
        if (aEscrever || janelaAberta || escolherCapa || images.length === 0) return;
        e.preventDefault();
        setSelected(new Set(images.map((im) => im.path)));
        // A âncora fica na última: um Shift+clique a seguir a um ⌘A encurta a
        // selecção a partir do fim, que é o que um gestor de ficheiros faz.
        anchor.current = images.length - 1;
        return;
      }
      if (e.key === "Escape" && !janelaAberta) {
        // Actualizador funcional: assim o ouvinte não precisa de conhecer a
        // selecção actual e não se volta a registar a cada foto escolhida.
        setSelected((prev) => (prev.size > 0 ? new Set() : prev));
        anchor.current = null;
      }
    };
    document.addEventListener("keydown", noTeclado);
    return () => document.removeEventListener("keydown", noTeclado);
  }, [images, copyOpen, aRemover, zoomAt, renaming, escolherCapa]);

  /**
   * ── A LARGADA CHEGA DA COLUNA DA ESQUERDA ──────────────────────────────
   *
   * O `dragstart` é aqui, o `drop` é lá, e o `pedidoDeMover` é o que os liga
   * (ver a nota no `Temas`). O efeito dispara pelo CONTADOR e não pelo
   * objecto: dois arrastos seguidos para o mesmo tema com as mesmas fotos são
   * dois pedidos, e um `useEffect` que comparasse o destino não via o segundo.
   *
   * O `spring loading` pode ter aberto OUTRO tema antes da largada, e nesse
   * caso esta pasta já não é a origem do lote — por isso o pedido só é servido
   * quando a carga saiu mesmo daqui.
   */
  const pedidoServido = useRef(0);
  useEffect(() => {
    if (!pedidoDeMover || pedidoDeMover.n === pedidoServido.current) return;
    pedidoServido.current = pedidoDeMover.n;
    if (pedidoDeMover.carga.origem !== theme.id) return;
    void moverParaTema(pedidoDeMover.destino, pedidoDeMover.carga.paths);
    // `moverParaTema` fecha sobre o estado actual da grelha de propósito — é
    // uma função do corpo, como o `moveTo` e o `setAsCover`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoDeMover, theme.id]);

  /**
   * ── O MENU DE UMA FOTOGRAFIA ───────────────────────────────────────────
   *
   * «Menu de contexto no tema e NA FOTOGRAFIA» (ponto 8 da auditoria). As
   * quatro acções são as que já estão desenhadas em cima da célula — é a regra
   * da Apple que o documento cita: «tudo o que está no menu de contexto existe
   * também na interface principal». Aqui ganham nome escrito, que é o que os
   * três círculos sem rótulo do ponto 18 nunca tiveram.
   *
   * Os botões da célula FICAM (ao contrário dos chips do cartão de tema, que
   * saíram): cada um é o único caminho de DEDO para o que faz — o arrasto de
   * reordenar é HTML5 e não pega no telemóvel — e um menu de contexto sem
   * botão direito não existe. A razão está escrita por extenso na célula.
   */
  const accoesDaFoto = useCallback(
    (im: ThemeImage, i: number): AccaoDeItem[] =>
      emGrupos(
        /* ── PELA ORDEM DO DOCUMENTO ──────────────────────────────────────
           Parte 3 do `docs/APPLE-TEMAS.md`: «Pré-visualizar · Abrir tamanho
           real — separador — Mover para… · Duplicar para… · Definir como
           capa — separador — Remover do tema». O «Remover do tema…» guarda
           as reticências porque continua a perguntar antes de remover.

           «Pôr no início» voltou ao menu a 14/10, quando o ↑ da célula
           saiu com os outros dois círculos: é o caminho de dedo para isso
           (com teclado também há o Alt+Home). */
        [
          { id: "ver", rotulo: "Pré-visualizar", onAccao: () => openZoom(i) },
          {
            id: "original",
            rotulo: "Abrir tamanho real",
            // O original, num separador novo — o que o browser faz com ele é
            // dele (ver, guardar, imprimir). `noopener`: a página aberta não
            // fica com a mão nesta.
            onAccao: () => void window.open(im.url, "_blank", "noopener"),
          },
        ],
        [
          /* ── A ALTERNATIVA POR MENU É OBRIGATÓRIA ─────────────────────
             «Alternativa por menu obrigatória — "Mover para…" faz o mesmo sem
             arrastar.» [APPLE], Parte 4. Abre a folha que já existe
             (`ThemeCopyDialog`) no modo certo, e leva a foto do menu se ela
             não estiver na selecção. «Duplicar para…» é a mesma folha em
             «Copiar». Só com outros temas para onde levar. */
          ...(otherThemes.length > 0
            ? [
                {
                  id: "mover",
                  rotulo: "Mover para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("mover");
                    setCopyOpen(true);
                  },
                },
                {
                  id: "duplicar",
                  rotulo: "Duplicar para…",
                  onAccao: () => {
                    setSelected((prev) => (prev.has(im.path) ? prev : new Set([im.path])));
                    setCopyMode("copiar");
                    setCopyOpen(true);
                  },
                },
              ]
            : []),
          ...(im.path === coverPath
            ? []
            : [{ id: "capa", rotulo: "Definir como capa", onAccao: () => void setAsCover(im) }]),
          /* Era o ↑ da célula, que saiu com os outros dois círculos (14/10):
             passa a ser uma linha do menu, para continuar a haver um caminho
             de dedo — o arrasto de reordenar é HTML5 e não pega no
             telemóvel. Na primeira foto não aparece: já está no início. */
          ...(i > 0
            ? [{ id: "inicio", rotulo: "Pôr no início", onAccao: () => moveTo(i, 0) }]
            : []),
        ],
        [
          {
            id: "remover",
            rotulo: "Remover do tema…",
            destrutiva: true,
            onAccao: () => pedirParaRemoverUma(im),
          },
        ],
      ),
    // `setAsCover` e `pedirParaRemoverUma` são funções do corpo do componente
    // e mudam a cada desenho de propósito (fecham sobre o estado actual da
    // grelha). O que importa fixar é a foto e a capa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverPath, openZoom, otherThemes.length],
  );

  /* AS FOTOS QUE ELA ACABOU DE LARGAR, já à vista, ainda a caminho do
     servidor. Não são selecionáveis nem removíveis (ainda não existem lá), e o
     leitor de ecrã segue a barra de progresso — não 300 células a
     anunciarem-se. Ocupam as primeiras casas da grelha, e é por isso que a
     conta das linhas (e das setas) começa nelas. */
  const pendentes = pending.map((p) => (
    <div
      key={p.id}
      aria-hidden
      title={`${p.name} — a carregar`}
      className="relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border border-[var(--bo-hairline-strong)] bg-[var(--bo-tinta-6)]"
    >
      {p.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.src}
          alt=""
          decoding="async"
          className="h-full w-full object-cover opacity-60"
        />
      ) : (
        <div className="bo-skeleton h-full w-full" />
      )}
      <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/55 px-1.5 py-0.5 text-center text-[10px] uppercase tracking-[0.06em] text-white">
        A carregar
      </span>
    </div>
  ));

  /** Uma célula da grelha: a foto `i` de `images`. */
  /** A foto que está no fio do Tab — uma só; as outras chegam-se pelas setas. */
  const focoNaGrelha = Math.max(0, Math.min(fotoComFoco, images.length - 1));
  const focarFoto = (k: number) => {
    setFotoComFoco(k);
    celulas.current.get(k)?.querySelector<HTMLElement>('[role="checkbox"]')?.focus();
  };

  const celulaDaFoto = (im: ThemeImage, i: number) => {
    const isSelected = selected.has(im.path);
    const isCover = im.path === coverPath;
    return (
      <div
        key={im.path}
        role="gridcell"
        aria-selected={isSelected}
        aria-rowindex={Math.floor((pending.length + i) / colunas) + 1}
        aria-colindex={((pending.length + i) % colunas) + 1}
        ref={(no) => {
          if (no) celulas.current.set(i, no);
          else celulas.current.delete(i);
        }}
        draggable
        onDragStart={(e) => {
          setDragFrom(i);
          e.dataTransfer.effectAllowed = "move";
          // Alguns navegadores só iniciam o arrasto com dados lá
          // dentro; o valor não é usado por ninguém.
          e.dataTransfer.setData("text/plain", String(i));
          /* ── E O MESMO GESTO SERVE OS DOIS DESTINOS ─────────
               «Dentro do mesmo tema REORDENA; para outro tema
               MOVE.» [APPLE] É um arrasto só, com duas cargas: o
               índice em `text/plain`, que é o que as células
               vizinhas lêem para reordenar, e o lote de caminhos no
               tipo próprio, que é o que a coluna da esquerda lê
               para mover. Quem decide é o destino onde ele acaba.

               E o lote é a SELECÇÃO quando se pega numa foto que
               está nela — ver `fotosQueViajam`. */
          const lote = fotosQueViajam(
            im.path,
            selected,
            images.map((x) => x.path),
          );
          escreverCarga(e.dataTransfer, { origem: theme.id, paths: lote });
          vestirOArrasto(e, lote.length);
          aoArrastar?.(true);
        }}
        onDragEnd={(e) => {
          // Ver a nota do `aRegressar`: `none` é a norma a dizer
          // que isto não foi largado em destino nenhum.
          const falhou = e.dataTransfer?.dropEffect === "none";
          setDragFrom(null);
          setDragOver(null);
          aoArrastar?.(false);
          setARegressar(falhou ? im.path : null);
        }}
        // O regresso acaba quando acaba — sem temporizador a
        // repetir o número que já está no token. Deixá-lo aceso
        // punha esta célula (e só ela) a responder ao rato em
        // 475 ms para sempre.
        onTransitionEnd={() => setARegressar((p) => (p === im.path ? null : p))}
        onDragOver={(e) => {
          if (dragFrom === null) return;
          // Sem isto o browser recusa a largada.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          if (dragOver !== i) setDragOver(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragFrom !== null) moveTo(dragFrom, i);
          setDragFrom(null);
          setDragOver(null);
        }}
        // `celula-saltavel`: fora do ecrã, o browser não desenha
        // nem descodifica esta célula. A altura não depende disso
        // (é `aspect-[4/3]` numa coluna de largura fixa), por
        // isso a barra de deslocamento não mexe. Ver globals.css.
        /* O botão direito abre as mesmas quatro acções que os
             botões da célula — ver `accoesDaFoto`. O menu é `fixed`,
             portanto o `overflow-hidden` desta célula (que a recorta
             aos cantos redondos) não o corta. */
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuDaFoto({
            x: e.clientX,
            y: e.clientY,
            sobre: `foto ${i + 1} de ${images.length}`,
            accoes: accoesDaFoto(im, i),
          });
        }}
        className={`celula-saltavel group relative aspect-[4/3] min-h-[104px] overflow-hidden rounded-lg border bg-[var(--bo-tinta-6)] ${ESTADO} ${
          isSelected
            ? "border-sage-600 ring-2 ring-sage-600/40"
            : "border-[var(--bo-hairline-strong)]"
        } ${dragFrom === i ? "opacity-40" : ""} ${
          dragOver === i && dragFrom !== null && dragFrom !== i ? "ring-2 ring-sage-600" : ""
        } ${
          // Os tokens do documento, lidos do `:root` — nem o
          // número nem a curva se escrevem aqui.
          aRegressar === im.path
            ? "motion-safe:[transition-duration:var(--transition-duration-reposition)] motion-safe:[transition-timing-function:var(--ease-reposition)]"
            : ""
        }`}
      >
        {/* A célula já tem `aspect-[4/3]`, por isso adiar a foto
              não salta nada. E o que se mostra é a MINIATURA: com o
              original, uma página de 60 fotos puxava ~150 MB. As da
              primeira dobra não esperam pela vez de ninguém. */}
        <Photo image={im} alt="" priority={i < ABOVE_FOLD} localSrc={localSrc.get(im.path)} />
        {/* A célula inteira é o alvo da seleção — um alvo pequeno
              numa grelha de 60 fotos seria um exercício de pontaria. */}
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onFocus={() => setFotoComFoco(i)}
          aria-label={
            escolherCapa
              ? `Usar a foto ${i + 1} de ${images.length} como capa`
              : `Selecionar foto ${i + 1} de ${images.length}`
          }
          onClick={(e) => {
            // No modo «escolher a capa», o clique escolhe-a.
            if (escolherCapa) {
              setEscolherCapa(false);
              void setAsCover(im);
              return;
            }
            // `ctrlKey` ao lado do `metaKey` porque o back office
            // também se abre em Windows e em Linux, onde o gesto
            // de somar à selecção é o Ctrl.
            toggleAt(i, { shift: e.shiftKey, somar: e.metaKey || e.ctrlKey });
          }}
          // ── `ESPAÇO` PRÉ-VISUALIZA ──────────────────────────
          // «É o gesto que qualquer utilizador de Mac tenta
          // primeiro» (ponto 23), e o critério 5 do documento.
          // Anunciado, para não ser um segredo: um atalho que só
          // quem leu o documento conhece não existe.
          aria-keyshortcuts="Space"
          onKeyDown={(e) => {
            /* ── O `ESPAÇO` É DO QUICK LOOK, O `ENTER` ALTERNA ──────
                 Fase 11 (`docs/APPLE-TEMAS.md`, Parte 7): a célula é
                 um `role="gridcell"` com `aria-selected`, e numa
                 grelha o `Espaço` não é de ninguém — fica para o
                 Quick Look, como o documento manda duas vezes. Marcar
                 e desmarcar é o `Enter`, que num `<button>` dispara o
                 `click`. A caixa de seleção cá dentro continua (é o
                 alvo do dedo e do rato, a célula inteira), e o
                 `aria-checked` dela diz o mesmo que o `aria-selected`
                 da célula. */
            if (e.key === " " || e.key === "Spacebar") {
              e.preventDefault();
              openZoom(i);
              return;
            }
            // Shift+F10 e a tecla de menu: o botão direito do
            // teclado, ancorado ao canto de baixo da célula.
            if (teclaDeMenu(e)) {
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuDaFoto({
                x: r.left,
                y: r.bottom,
                sobre: `foto ${i + 1} de ${images.length}`,
                accoes: accoesDaFoto(im, i),
              });
              return;
            }
            // SEM o Alt, as setas andam entre as fotos (`fotoPelaTecla`),
            // e o `Shift` leva a selecção com elas. As fotos a carregar
            // ocupam as primeiras casas: entram na conta das linhas, mas
            // o foco não pára nelas.
            if (!e.altKey) {
              const P = pending.length;
              const v = fotoPelaTecla(
                P + i,
                e.key,
                colunas,
                P + images.length,
                e.metaKey || e.ctrlKey,
              );
              if (v === null) return;
              e.preventDefault();
              const para = Math.max(P, v) - P;
              if (para === i) return;
              if (e.shiftKey && e.key.startsWith("Arrow")) estenderPeloTeclado(i, para);
              focarFoto(para);
              return;
            }
            // Alt + setas move a foto.
            const to =
              e.key === "ArrowLeft" || e.key === "ArrowUp"
                ? i - 1
                : e.key === "ArrowRight" || e.key === "ArrowDown"
                  ? i + 1
                  : e.key === "Home"
                    ? 0
                    : null;
            if (to === null) return;
            e.preventDefault();
            const destino = Math.max(0, Math.min(images.length - 1, to));
            // O foco vai com a foto (a célula é a mesma, pela `key`), e o
            // fio do Tab também.
            setFotoComFoco(destino);
            moveTo(i, destino);
          }}
          className={`absolute inset-0 h-full w-full ${ESTADO} ${PRESSAO}`}
        >
          {/* O círculo da selecção, à maneira da app Fotografias:
                um anel branco fino sobre um véu escuro leve (sem
                sombra: esta casa não põe sombras em conteúdo — ver
                `sombras-do-back-office.test.ts`), e cheio com o
                visto quando está escolhida (14/10, «tipo apple»). */}
          <span
            aria-hidden
            className={`absolute left-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-white ${ESTADO} ${
              isSelected
                ? "bg-sage-600 text-white opacity-100"
                : "bg-black/25 text-transparent opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100"
            }`}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </button>
        {isCover && (
          <span className="bo-vidro-claro pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">
            Capa
          </span>
        )}
        {/* ── UM SÓ «⋯», EM VIDRO CLARO ───────────────────────────
              Eram três círculos escuros (↑, ⤢, ×) por cima de cada
              fotografia. O documento dela manda um só, e ela
              escolheu-o (14/10, «tipo apple»): «um botão discreto ⋯
              no canto superior direito, em vidro claro, que abre o
              mesmo menu do botão direito» (APPLE-TEMAS, ponto 9 e
              critério 3). As acções passam a ter nome escrito.

              O desenho é o do «⋯» do cartão de tema — 28 px à vista,
              `.bo-vidro-claro`, glifo branco, sem desfoque (um por
              foto eram centenas) — e o alvo cresce para os 44 no
              dedo sem o disco crescer (`.alvo-invisivel`). O painel
              é o `MenuDeContexto`, que é `fixed`: o do
              `MenuDeAccoes` é `absolute` e esta célula é
              `overflow-hidden`, portanto sairia cortado.

              Continua tudo a um caminho de dedo: Pré-visualizar,
              Pôr no início, Remover… estão no menu. Com rato, só
              aparece por cima da foto ou com o foco lá dentro. */}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuDaFoto?.de === im.path}
          aria-label={`Acções da foto ${i + 1} de ${images.length}`}
          tabIndex={i === focoNaGrelha ? 0 : -1}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenuDaFoto({
              x: r.left,
              y: r.bottom + 4,
              de: im.path,
              sobre: `foto ${i + 1} de ${images.length}`,
              accoes: accoesDaFoto(im, i),
            });
          }}
          className={`bo-vidro-claro alvo-invisivel absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:group-focus-within:opacity-100 com-rato:focus-visible:opacity-100 ${
            menuDaFoto?.de === im.path ? "com-rato:opacity-100" : ""
          } ${ESTADO} ${PRESSAO}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
          </svg>
        </button>
      </div>
    );
  };

  const aSairDaLupa = useSaidaDeUmSo(zoomAt !== null);
  const indiceDaLupa = useNoEcraAteSair(zoomAt !== null, aSairDaLupa, zoomAt);

  return (
    <div>
      <CabecalhoDaPasta
        theme={theme}
        accoes={accoes}
        usos={usos}
        loading={loading}
        uploadingCount={uploadingCount}
        name={name}
        setName={setName}
        renaming={renaming}
        setRenaming={setRenaming}
        inputRef={inputRef}
        rename={rename}
        leave={leave}
        countLine={countLine}
      />

      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = "";
        }}
      />

      <AvisosDaPasta
        envio={{
          progress,
          failed,
          setFailed,
          skipped,
          setSkipped,
          legacyPhotos,
          partialCheck,
          verifying,
          trackUrl,
          retryFailed,
          addSkippedAnyway,
          pct,
        }}
        copia={{ setCopyOpen, setCopyMode, copyReport, setCopyReport }}
        miniaturas={{
          thumbJob,
          pararMiniaturas: () => {
            stopThumbs.current = true;
          },
          runThumbJob,
          missingThumbs,
          thumbPct,
        }}
        theme={theme}
        unreadable={unreadable}
        selectedCount={selectedCount}
      />

      <BarraDaSeleccaoDaPasta
        images={images}
        setCopyOpen={setCopyOpen}
        setCopyMode={setCopyMode}
        selected={selected}
        bulkBusy={bulkBusy}
        emBloco={emBloco}
        aMover={aMover}
        anuncio={anuncio}
        clearSelection={clearSelection}
        pedirParaRemoverAsSeleccionadas={pedirParaRemoverAsSeleccionadas}
        setAsCover={setAsCover}
        selectedCount={selectedCount}
        otherThemes={otherThemes}
        downloading={downloading}
        downloadSelected={downloadSelected}
      />

      {copiaNoEcra && (
        <ThemeCopyDialog
          aberto={copyOpen}
          modoInicial={copyMode}
          sourceTheme={theme}
          themes={themes}
          // Congelada no instante do fecho, para a contagem não mudar a meio
          // da saída — o `applyCopyOutcome` tira da grelha, na mesma volta, as
          // fotos que foram movidas.
          paths={copiaNoEcra}
          onClose={() => setCopyOpen(false)}
          onDone={applyCopyOutcome}
        />
      )}

      <MenuDeContexto pedido={menuDaFoto} onFechar={fecharMenuDaFoto} />

      {indiceDaLupa !== null && images[indiceDaLupa] && (
        <PhotoLightbox
          aberto={zoomAt !== null}
          images={images}
          index={indiceDaLupa}
          onIndexChange={setZoomAt}
          onClose={closeZoom}
          onDownload={downloadImage}
          downloading={downloading || umaFoto.aCorrer}
          transferencia={umaFoto.mostrar ? umaFoto.barra : null}
          // De onde a lupa cresce. `null` quando a célula já não está no ecrã
          // — aí abre como abria, do centro.
          origem={origemDaLupa}
        />
      )}

      {/* A faixa do modo «escolher a capa». Opaca, como a grelha por baixo
          dela — vidro só no que flutua (`docs/LIQUID-GLASS.md`, Parte 5), e
          esta vista já tem a sua camada na barra da selecção. */}
      {escolherCapa && (
        <div
          data-escolher-capa
          className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--bo-raio-conteudo)] bg-[var(--bo-accent-lavagem)] px-3 py-2"
        >
          <p role="status" className="text-sm text-[var(--bo-text)]">
            Escolhe a fotografia da capa.
          </p>
          <Button variant="ghost" size="sm" onClick={() => setEscolherCapa(false)}>
            Cancelar
          </Button>
        </div>
      )}

      <GrelhaDaPasta
        leitura={{
          images,
          truncated,
          falhaDaPasta,
          loading,
          loadingMore,
          remaining,
          hasMore,
          loadMore,
        }}
        largar={{ setDrag, drag, arrasto, handleDrop }}
        theme={theme}
        pending={pending}
        unreadable={unreadable}
        grelha={grelha}
        colunas={colunas}
        pendentes={pendentes}
        celulaDaFoto={celulaDaFoto}
      />

      {/* ── A PERGUNTA É A DA CASA ────────────────────────────────────────
          Uma janela para os dois caminhos — a foto solta e o lote. Folha
          inferior no telemóvel, ao pé do polegar; o verbo no botão. */}
      <PerguntaDestrutiva
        aberto={!!aRemover}
        onFechar={() => setARemover(null)}
        titulo={
          !aRemover
            ? ""
            : aRemover.alvos.length === 1
              ? "Remover esta fotografia do tema?"
              : `Remover ${plural(aRemover.alvos.length, "fotografia", "fotografias")} de «${theme.name}»?`
        }
        aviso="As propostas já feitas com estas fotos não são afectadas. Ficam 30 dias na Reciclagem, de onde podem voltar."
        rotuloConfirmar={
          aRemover && aRemover.alvos.length > 1 ? "Remover as fotografias" : "Remover a fotografia"
        }
        // Fecha primeiro e só depois age: a grelha é optimista, e no lote a
        // barra de progresso toma o lugar da selecção — uma caixa por cima
        // taparia precisamente o que diz que ainda há pedidos a caminho.
        onConfirmar={() => {
          const pedido = aRemover;
          setARemover(null);
          if (!pedido) return;
          if (pedido.emBloco) void removeSelected(pedido.alvos);
          else void removeImages(pedido.alvos);
        }}
      />
    </div>
  );
}
