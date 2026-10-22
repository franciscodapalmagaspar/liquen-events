"use client";

import Image, { getImageProps, type ImageLoaderProps, type ImageProps } from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import siteImageLoader, { siteImageAvifUrl } from "@/lib/site-image-loader";

/**
 * Uma imagem do sítio que não fica partida por causa de UM erro de rede.
 *
 * PORQUÊ ESTE COMPONENTE EXISTE. A queixa da dona ("as fotos falham imenso,
 * muitas vezes nem aparecem") já foi resolvida DENTRO da galeria
 * (src/app/[lang]/galeria/GalleryImage.tsx). O resto do sítio não tinha nada
 * disso: `grep -c onError src/components src/app/[lang]/servicos` dava 0, e um
 * `<Image>` do Next sem `onError` é definitivo — ao falhar, o próprio next/image
 * faz `setShowAltText(true)`, ou seja PINTA O TEXTO ALTERNATIVO por cima do
 * ícone de imagem partida. É exactamente o que se vê nas capturas de ecrã que
 * ela mandou: as miniaturas do menu partidas e o "Momentos que criámos" com o
 * texto alternativo à vista.
 *
 * O QUE SE HERDOU DA GALERIA (o padrão que lá está medido):
 *  1. ao PRIMEIRO erro vai-se já ao ficheiro original, sem esperar. Todas as
 *     imagens deste sítio vivem em `public/` (`/imagens/…`, `/logo-liquen.png`)
 *     e portanto estão versionadas no repositório: existem sempre. O que falha
 *     é a DERIVADA — hoje o WebP pré-gerado em `/_img/…` (que pode faltar: uma
 *     foto acrescentada sem correr o pré-gerador, um deploy truncado), ontem o
 *     `/_next/image` (encode a frio, rajada, quota). Uma escada de espera contra
 *     um 404 só gasta segundos: na galeria isso custava 4 pedidos e 7,8 s POR
 *     mosaico antes de se chegar ao ficheiro que existia desde o início;
 *  2. ao original, sim, aplica-se o recuo exponencial (600 ms, 1800 ms,
 *     5400 ms, tecto de 4 tentativas). Aqui uma falha volta a ser plausivelmente
 *     passageira (a rede do visitante), e esperar resolve;
 *  3. cada tentativa leva um anti-cache (`?r=N`) E desmonta/remonta o `<img>`
 *     (`key={bust}`). Sem o par desmontar/remontar o browser NÃO repete o
 *     pedido — está medido na galeria: tentativas por URL falhado {min:1,max:1};
 *  4. esgotado tudo, mostra-se algo digno — nunca o ícone partido;
 *  5. recupera-se quando a imagem reentra no ecrã ou quando a rede volta.
 *
 * O ESPAÇO NUNCA COLAPSA — e isto custou um defeito para se aprender. Entre
 * tentativas o `<img>` está desmontado de propósito (ponto 3), e na primeira
 * versão deste componente esse intervalo não desenhava NADA. Numa imagem `fill`
 * isso é inofensivo (a caixa do pai é que tem a altura), mas o logótipo do
 * rodapé não é `fill`: os seus 80 px saíam do fluxo durante 600, 1800 e 5400 ms.
 * Medido num Pixel 7, com o pedido do logótipo a falhar e o visitante parado no
 * fim da página: `document.scrollHeight` caía de 4502 para 4422 e o browser
 * ENCURTAVA o scroll — `window.scrollY` recuava de 3663 para 3583 sem o dedo
 * lhe tocar. É a queixa "vai um pouco para cima", ao milímetro. Por isso o
 * intervalo de espera desenha a MESMA superfície do último recurso: mesma
 * `className`, mesmas dimensões, logo a mesma caixa. Ver o teste
 * "o espaço da imagem é reservado…" em SafeImage.test.tsx.
 *
 * O QUE FICOU DELIBERADAMENTE DE FORA (a galeria tem exigências que não são
 * genéricas — ver o relatório):
 *  • a FILA de pedidos em voo (load-queue.ts). Existe porque a galeria monta
 *    427 fotos numa página e a rajada media 116 pedidos simultâneos. As páginas
 *    deste sítio têm menos de dez imagens cada; uma fila partilhada só criaria
 *    acoplamento entre páginas e um risco de bloqueio de cabeça de fila mesmo à
 *    frente do herói (o candidato a LCP);
 *  • o IntersectionObserver de ARRANQUE + `NEAR_VIEWPORT`. Só faz sentido a
 *    acompanhar a fila; sem ela, quem adia o que está longe do ecrã é o
 *    `loading="lazy"` do próprio browser, que nem precisa de hidratação;
 *  • o `galleryImageUrl` (miniaturas WebP pré-geradas em `/_img/g/`) e o
 *    `<ViewTransition>` do mosaico-herói, que obrigam a galeria a ter no máximo
 *    UM filho montado de cada vez. Aqui o primeiro pedido é feito pelo loader
 *    que o sítio tiver configurado — não se toma nenhuma decisão sobre ele.
 *
 * NOTA SOBRE HIDRATAÇÃO: um erro que aconteça ANTES de o React hidratar
 * perder-se-ia. Não se perde porque o próprio next/image trata disso — ao
 * montar, e só quando existe `onError`, refaz `img.src = img.src` para o erro
 * voltar a disparar (ver node_modules/next/dist/client/image-component.js:141).
 * É mais uma razão para o `onError` deste componente existir.
 */

/** 1 tentativa + 3 re-tentativas AO ORIGINAL. Depois disto, o recurso digno. */
const MAX_ATTEMPTS = 4;
/** Recuo exponencial (x3), o mesmo da galeria. */
const BACKOFF_MS = [600, 1800, 5400];
/**
 * Quantas vezes reentrar no ecrã pode recomeçar a escada. Duas.
 *
 * O tecto existe porque não o haver era visível: uma foto que falha sempre
 * recomeçava 4 tentativas de cada vez que reaparecia, sem fim. E o efeito é
 * assimétrico, porque descer não faz nada reentrar e subir faz — medido com
 * uma única foto avariada, uma só subida deu 17 pedidos falhados e dezenas de
 * ciclos de desmontar/remontar o `<img>`. A imagem treme e pisca, e só a
 * subir.
 *
 * Duas e não uma: a segunda tentativa é a que apanha o caso que motivou esta
 * recuperação — a falha passageira (a derivada ainda a ser gerada, um pico de
 * rede) que já passou quando a pessoa volta a olhar. A terceira, a quarta e a
 * quinta não acrescentam nada senão barulho no ecrã. Com o tecto, o pior caso
 * por imagem e por visita é 3 escadas × 4 tentativas = 12 pedidos, em vez de
 * ilimitado. O `online` continua sem tecto — ver o efeito de recuperação.
 */
const MAX_REENTRY_RECOVERIES = 2;

/**
 * Superfície neutra para o último recurso quando quem chama não passa um
 * `blurDataURL`. É o mesmo WebP escuro que `src/lib/blur.ts` usa como omissão,
 * copiado (e não importado) de propósito: `blurFor` puxa o `blur-map.json`
 * (108 KB) e este componente corre no browser, inclusive no Navbar, que está em
 * todas as páginas.
 */
const NEUTRAL_BLUR =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vOdgAA=";

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PORQUE É QUE O ERRO É OUVIDO À MÃO E NÃO PELO `onError` DO next/image
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Passar `onError` a um `<Image>` custa UM PEDIDO DE REDE REPETIDO por cada
 * imagem da página. Não é opinião — está no próprio next/image
 * (node_modules/next/dist/client/image-component.js:140):
 *
 *     if (onError) {
 *       // If the image has an error before react hydrates, then the error is
 *       // lost. The workaround is to wait until the image is mounted...
 *       img.src = img.src;
 *     }
 *
 * O truque serve para RECUPERAR um erro anterior à hidratação (o React ainda
 * não tinha ouvinte nenhum ligado quando o evento passou), e a intenção é
 * boa. O efeito colateral é que, quando a hidratação apanha a imagem AINDA A
 * DESCARREGAR — que é o caso normal numa aterragem a frio —, reatribuir o
 * `src` ABORTA o pedido em voo e manda outro. A resposta ainda não está na
 * cache, portanto o segundo pedido vai mesmo à rede.
 *
 * MEDIDO em /clientes, build de produção, 1440x900, cache fria, 6 corridas:
 * em 4 delas TODAS as imagens que vêm no HTML servido foram pedidas duas
 * vezes — o herói EW1_1393, os dois fundos de secção e os 18 logótipos, 21
 * URLs repetidos. Página: 1276 KB nas corridas limpas, 1447 KB nas outras.
 * A repetição só não acontece quando a hidratação chega TARDE o suficiente
 * para as imagens já terem terminado (aí a reatribuição é um acerto na
 * cache). Ou seja: quanto mais rápida a máquina, mais caro custava.
 *
 * A ALTERNATIVA, que faz exactamente o mesmo trabalho sem pedido nenhum:
 *  • o ouvinte de `error` é ligado por nós no próprio elemento, na `ref` —
 *    ou seja no MESMO instante em que o next/image faria a reatribuição;
 *  • o erro anterior à hidratação, que é o que o truque do next/image
 *    resgata, lê-se do ESTADO do elemento em vez de se provocar outra vez:
 *    um `<img>` que já terminou (`complete`) e não trouxe pixels
 *    (`naturalWidth === 0`) falhou. É o mesmo sinal que o próprio
 *    next/image usa duas linhas abaixo para decidir se já carregou.
 *
 * O `onError` interno do next/image continua ligado ao `<img>` (é ele que
 * põe o texto alternativo à vista); o que deixámos de passar é o NOSSO, que
 * era o único gatilho da reatribuição.
 */
export function useImageErrorRef(aoErro: () => void) {
  const ultimo = useRef(aoErro);
  useEffect(() => {
    ultimo.current = aoErro;
  }, [aoErro]);

  return useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    const ouvinte = () => ultimo.current();
    img.addEventListener("error", ouvinte);
    // Já terminou e não trouxe pixels: falhou antes de aqui chegarmos. O `src`
    // declarado é a guarda contra o caso degenerado de um `<img>` sem origem
    // nenhuma, que também dá `complete` verdadeiro.
    if (img.complete && img.naturalWidth === 0 && img.getAttribute("src")) ultimo.current();
    return () => img.removeEventListener("error", ouvinte);
  }, []);
}

export type SafeImageProps = Omit<ImageProps, "src" | "loader" | "onError" | "onLoad"> & {
  /** Caminho da imagem em `public/` (é ele o recurso final: existe sempre). */
  src: string;
  /**
   * Legenda do último recurso. OMITIR quando não há espaço para ela ser digna:
   * numa miniatura de 56 px do menu uma etiqueta de texto não cabe e lê-se como
   * mais um defeito. Nesse caso o recurso é silencioso — a superfície da própria
   * imagem, desfocada, e nada mais. Numa foto de portefólio, pelo contrário, a
   * legenda é o que explica ao visitante o que aconteceu.
   */
  unavailableLabel?: string;
  /**
   * Carregador para a PRIMEIRA tentativa, quando quem chama tem um caminho
   * próprio para a versão optimizada. É o caso dos heróis de página, que têm a
   * sua escada até 2048 px (`heroImageLoader`) e não a das fotos comuns.
   *
   * Só afecta a primeira tentativa: o recurso continua a ser o ficheiro
   * original, que é o mesmo para todos. Sem isto, os heróis — a maior imagem de
   * cada página — eram os únicos que ficavam sem rede, e mediu-se: das 12
   * imagens que ainda partiam com a avaria simulada, 10 eram heróis.
   */
  initialLoader?: (p: ImageLoaderProps) => string;
  /**
   * O desfoque passa à fotografia em 300 ms, em vez de num salto (auditoria
   * externa, A6). Só para imagens `fill` com `blurDataURL`.
   *
   * Não se esconde a fotografia à espera do JavaScript — sem JavaScript, ou
   * numa hidratação lenta, ela nunca apareceria. Faz-se o contrário: DEPOIS de
   * hidratar, e só se a fotografia ainda não chegou, põe-se por CIMA dela uma
   * cópia do desfoque (o mesmo que o `next/image` já desenha por baixo); quando
   * ela chega, essa cópia esbate-se. O HTML do servidor fica igual ao de
   * sempre, e uma fotografia que já tinha chegado não ganha camada nenhuma.
   * É opacidade, não movimento: fica também com movimento reduzido.
   *
   * Desde 16/10 é o comportamento POR OMISSÃO de qualquer imagem `fill` com
   * desfoque. Ela: «ainda dá para ver a foto desfocada… a entrada nas páginas
   * não está muito boa». Só uma página o tinha; nas outras a fotografia
   * substituía o desfoque num salto. `aparecer={false}` desliga-o.
   */
  aparecer?: boolean;
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVIF À FRENTE, O WEBP POR BAIXO — o mesmo `<picture>` do herói, para todas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui só o `HeroImage` servia AVIF; o resto do sítio passava por este
 * componente e recebia WebP, apesar de o gémeo AVIF de cada fotografia já
 * estar em `/_img/` (os pré-geradores escrevem os dois). O `<picture>` e o
 * pré-carregamento que o herói tinha passaram para AQUI em vez de se escrever
 * um segundo mecanismo ao lado: o `HeroImage` ficou só com o seu carregador.
 *
 * MEDIDO em `next start` (Chromium, cache fria, um contexto por página), KB de
 * imagem depois de percorrer a página toda, antes → depois desta mudança:
 *
 *                 390×844 a 3x            1440×900
 *   /             940 →  772  (−18 %)    1518 →  960  (−37 %)
 *   /servicos     862 →  601  (−30 %)    1340 → 1022  (−24 %)
 *   /sobre       1438 →  960  (−33 %)    1166 → 1007  (−14 %)
 *   /contacto    1096 →  783  (−29 %)    1479 →  727  (−51 %)
 *   /clientes     638 →  591  ( −7 %)    1642 →  524  (−68 %)
 *
 * Os dois lados levam os mesmos ~396 KB que já eram AVIF — os heróis de outras
 * páginas que o `HeroWarm` aquece —, e o que fica em WebP depois são só os
 * logótipos. Zero imagens partidas e CLS 0 nos vinte casos, antes e depois.
 *
 * ── PORQUE É QUE O `srcset` AVIF SAI DO `getImageProps` ───────────────────
 *
 * Um `<source>` que casa DESLIGA o `srcset` do `<img>` ao lado — o browser
 * escolhe o candidato só pela lista da `<source>`. Se a lista AVIF tivesse
 * outros degraus, ou outro `sizes`, a fotografia mudava de resolução ao mudar
 * de formato (é a conta do `portao-do-avif.test.ts` da proposta, que paga 5x
 * os bytes quando a oferta AVIF tem menos degraus do que a WebP). Por isso a
 * lista NÃO é escrita à mão: parte da do próprio `next/image`, com os MESMOS
 * `src`/`width`/`height`/`fill`/`sizes`, só com o carregador trocado — os
 * mesmos degraus, o mesmo `sizes`, cada ficheiro AVIF gémeo de um WebP da
 * lista do `<img>`. (Os descritores são depois acertados à largura real de
 * cada ficheiro — ver o fim de `fonteAvif`.)
 *
 * ── O PORTÃO: SÓ HÁ `<source>` QUANDO HÁ GÉMEO EM TODAS AS LARGURAS ───────
 *
 * Um browser escolhe a `<source>` pelo `type`, não por o ficheiro existir.
 * Um AVIF em falta num único degrau era uma imagem partida nesse ecrã. Por
 * isso, para cada candidato, exige-se duas coisas:
 *   · que haja AVIF para aquela origem (`siteImageAvifUrl`, que só diz que sim
 *     onde um pré-gerador garante o ficheiro e falha o build se faltar);
 *   · que esse AVIF seja o gémeo EXACTO do WebP que o `<img>` vai pedir — mesmo
 *     caminho, mesma largura, só a extensão diferente. É isto que torna seguro
 *     um `initialLoader` (o do herói): se um dia um carregador servir outro
 *     ficheiro, a comparação falha e a fotografia fica-se pelo WebP, inteira.
 * Basta UM candidato falhar para não haver `<source>` nenhuma.
 *
 * ── O CUSTO, QUE NÃO É ZERO ───────────────────────────────────────────────
 *
 * O AVIF poupa bytes mas custa processador a descodificar — num telemóvel
 * fraco, mais do que o WebP do mesmo tamanho. Aceita-se aqui porque o que se
 * poupa é rede (metade dos bytes, que num 4G é o que demora) e porque o
 * `loading="lazy"` continua a espalhar as descodificações pelo scroll. Se um
 * dia se medir a descodificação a pesar num aparelho real, o sítio para cortar
 * é este portão — o WebP continua por baixo, intacto.
 */
type FonteAvif = { srcSet: string; sizes?: string; maior: string };

/** As duas caixas do `<picture>` — ver o porquê junto do `return`. Fora do
    componente para não criar um objecto novo por render. */
const PICTURE_FILL = { position: "absolute", inset: 0 } as const;
const PICTURE_SEM_CAIXA = { display: "contents" } as const;

function fonteAvif(
  p: Pick<SafeImageProps, "src" | "width" | "height" | "fill" | "sizes" | "quality" | "unoptimized">,
  primeiro: (p: ImageLoaderProps) => string,
): FonteAvif | null {
  if (p.unoptimized) return null;
  // Pergunta barata antes da conta inteira: a maior parte das origens que não
  // têm AVIF (os logótipos) sai aqui, sem chamar o `getImageProps`.
  if (siteImageAvifUrl(p.src, 640) === null) return null;
  let gemeos = true;
  const { props } = getImageProps({
    src: p.src,
    alt: "",
    width: p.width,
    height: p.height,
    fill: p.fill,
    sizes: p.sizes,
    quality: p.quality,
    loader: (q) => {
      const avif = siteImageAvifUrl(q.src, q.width);
      if (avif === null || avif.replace(/\.avif$/, ".webp") !== primeiro(q)) gemeos = false;
      return avif ?? q.src;
    },
  });
  if (!gemeos || !props.srcSet || typeof props.src !== "string") return null;

  /**
   * Descritores `w`: cada candidato passa a dizer a largura VERDADEIRA do seu
   * ficheiro, e os repetidos saem. O `next/image` escreve `/…-1536.avif 1280w`
   * (pediu 1280, a escada arredondou para 1536) — com o descritor mentiroso, o
   * browser julga que o ficheiro é mais pequeno do que é e sobe um degrau a
   * mais quando a caixa cai entre os dois. Com o descritor certo escolhe o
   * ficheiro mais pequeno que ainda cobre a caixa: nunca abaixo do que a caixa
   * pede, nunca acima do que o WebP daria, e IGUAL ao WebP na escada da
   * galeria, que é um subconjunto das larguras do Next (o 1024 entrou nela por
   * isso — ver `GALLERY_WIDTHS`). Só a escada dos heróis tem degraus fora
   * dessa lista (1080, 2048), e é aí que o descritor certo poupa um degrau. Para um herói a `100vw` a lista
   * que sai é, letra a letra, a escada fixa que o `HeroImage` escrevia à mão.
   *
   * Descritores `x` (largura fixa, sem `sizes`) ficam como vêm: aí a escolha é
   * pela densidade do ecrã e o candidato AVIF é o gémeo do WebP na mesma
   * posição.
   */
  const candidatos = props.srcSet.split(", ").map((c) => c.split(" "));
  let srcSet = props.srcSet;
  if (candidatos.every(([, d]) => d?.endsWith("w"))) {
    const porFicheiro = new Map<string, string>();
    for (const [url] of candidatos) {
      const largura = /-(\d+)\.avif$/.exec(url)?.[1];
      if (!largura) return null;
      porFicheiro.set(url, `${url} ${largura}w`);
    }
    srcSet = [...porFicheiro.values()].join(", ");
  }
  // `src` é o candidato mais largo — o mesmo papel do `src` do `<img>`.
  return { srcSet, sizes: props.sizes, maior: props.src };
}

export default function SafeImage({
  src,
  alt,
  className,
  blurDataURL,
  unavailableLabel,
  initialLoader,
  aparecer: aparecerPedido,
  fill,
  width,
  height,
  sizes,
  quality,
  unoptimized,
  priority,
  preload,
  loading,
  fetchPriority,
  ...rest
}: SafeImageProps) {
  const aparecer = aparecerPedido ?? Boolean(fill && blurDataURL);
  /** Já se desistiu da versão optimizada e está-se a pedir o ficheiro original. */
  const [original, setOriginal] = useState(false);
  /** Nº do anti-cache: 0 = URL normal, N = `?r=N` na tentativa N. */
  const [bust, setBust] = useState(0);
  /** A aguardar o recuo: o `<img>` está desmontado de propósito. */
  const [waiting, setWaiting] = useState(false);
  /** Esgotaram-se as tentativas: mostra-se o recurso digno. */
  const [exhausted, setExhausted] = useState(false);

  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackRef = useRef<HTMLImageElement | null>(null);
  /**
   * Quantas vezes já se recomeçou a escada por a imagem ter voltado ao ecrã.
   *
   * Sem tecto, a recuperação por reentrada era infinita: uma foto que falha
   * sempre recomeça 4 tentativas de CADA vez que reaparece. E é assimétrico —
   * descer nunca faz nada reentrar, subir faz. Medido com UMA única foto
   * avariada, numa só subida: 17 pedidos falhados e dezenas de ciclos de
   * desmontar/remontar o `<img>`. Isso vê-se como a imagem a tremer e a
   * piscar, e só a subir, que foi exactamente a queixa.
   */
  const recoveriesRef = useRef(0);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  /** A6: «espera» = o véu de desfoque está por cima; «saida» = a esbater-se. */
  const [veu, setVeu] = useState<"nenhum" | "espera" | "saida">("nenhum");

  const handleLoad = useCallback(() => {
    attemptsRef.current = 0;
    setVeu((v) => (v === "espera" ? "saida" : v));
  }, []);

  const handleError = useCallback(() => {
    // 1.ª falha: passa-se JÁ ao ficheiro original, sem esperar recuo nenhum.
    // O original está no repositório; o que falhou foi a derivada.
    if (!original) {
      attemptsRef.current = 0;
      setOriginal(true);
      setBust((b) => b + 1);
      return;
    }
    attemptsRef.current += 1;
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      setExhausted(true);
      return;
    }
    const delay = BACKOFF_MS[Math.min(attemptsRef.current - 1, BACKOFF_MS.length - 1)];
    // Desmontar o `<img>` falhado é obrigatório: ao voltar a montar, o browser
    // cria um elemento novo com um URL novo e o pedido SAI mesmo.
    setWaiting(true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setBust((b) => b + 1);
      setWaiting(false);
    }, delay);
    // `original` TEM de estar nas dependências: sem ele o fecho via sempre
    // `false` e a passagem ao ficheiro original repetia-se para sempre.
  }, [original]);

  const ligarAoErro = useImageErrorRef(handleError);

  // A `ref` do `<img>`: o ouvinte de erro de sempre, e — com `aparecer` — o
  // véu, que só se põe se a fotografia ainda não tiver chegado.
  const ligarImg = useCallback(
    (img: HTMLImageElement | null) => {
      const largar = ligarAoErro(img);
      if (aparecer && blurDataURL && img && !(img.complete && img.naturalWidth > 0)) {
        setVeu((v) => (v === "nenhum" ? "espera" : v));
      }
      return largar;
    },
    [ligarAoErro, aparecer, blurDataURL],
  );

  // ── Recuperação depois de esgotar as tentativas ─────────────────────────
  // Reentrar no ecrã (saiu e voltou) ou o regresso da rede dão nova
  // oportunidade. Sem isto, um erro pontual ficava para o resto da visita.
  //
  // A reentrada tem TECTO, o regresso da rede não. São sinais de qualidade
  // diferente: "a foto voltou ao ecrã" é um palpite (a segunda tentativa já
  // diz quase tudo, e a partir daí insistir é barulho visível); "a rede
  // voltou" é uma mudança de estado real do dispositivo, e nesse caso vale
  // sempre a pena tentar de novo — e traz consigo a reposição da contagem.
  useEffect(() => {
    if (!exhausted) return;
    const reset = () => {
      attemptsRef.current = 0;
      setOriginal(false);
      setExhausted(false);
      setWaiting(false);
      setBust((b) => b + 1);
    };
    const onOnline = () => {
      recoveriesRef.current = 0;
      reset();
    };
    window.addEventListener("online", onOnline);
    let left = false;
    let io: IntersectionObserver | null = null;
    // Observa-se o próprio elemento de recurso: existe exactamente enquanto
    // `exhausted` for verdadeiro, que é quando este observador é preciso.
    const target = fallbackRef.current;
    if (target && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) left = true;
          else if (left) {
            if (recoveriesRef.current >= MAX_REENTRY_RECOVERIES) return;
            recoveriesRef.current += 1;
            left = false;
            reset();
          }
        }
      });
      io.observe(target);
    }
    return () => {
      window.removeEventListener("online", onOnline);
      io?.disconnect();
    };
  }, [exhausted]);

  /**
   * O loader.
   *
   * Enquanto se está na versão optimizada NÃO se passa loader nenhum: o
   * primeiro pedido continua a ser feito pelo caminho normal do sítio (o
   * optimizador, ou o que estiver configurado em `images.loader`). Este
   * componente não escolhe por ninguém, e assim não entra em conflito com o
   * pré-gerador nem com a configuração de imagens.
   *
   * No recurso, sim: aponta-se ao ficheiro tal e qual, com o anti-cache. A
   * query é ignorada pelo servidor de estáticos mas conta como URL novo para o
   * browser — sem ela a re-tentativa apanhava a resposta falhada em cache e a
   * escada corria sem nunca fazer um pedido novo.
   */
  const loader = useMemo(
    () =>
      original
        ? ({ src: s }: ImageLoaderProps) => (bust > 0 ? `${s}?r=${bust}` : s)
        : initialLoader,
    [original, bust, initialLoader],
  );

  /**
   * A `<source>` AVIF (ver `fonteAvif`, lá em cima). Só na PRIMEIRA tentativa:
   * mal se passa ao ficheiro original, ela sai — se ficasse, o browser
   * continuava a escolhê-la pelo `type` e cada re-tentativa da escada voltava
   * a pedir o mesmo AVIF que acabou de falhar, com o anti-cache só no `<img>`.
   * Era o buraco do `<picture>` do herói, que embrulhava este componente por
   * fora e por isso não sabia quando a rede tinha entrado em acção.
   */
  const avif = useMemo(
    () =>
      original
        ? null
        : fonteAvif(
            { src, width, height, fill, sizes, quality, unoptimized },
            initialLoader ?? siteImageLoader,
          ),
    [original, src, width, height, fill, sizes, quality, unoptimized, initialLoader],
  );

  /**
   * O PRÉ-CARREGAMENTO TEM DE SER DO FORMATO QUE O `<picture>` ESCOLHE.
   *
   * Veio do `HeroImage`, com a medição que lá ficou: o `priority`/`preload` do
   * `next/image` pré-carrega o `srcset` do `<img>`, que é WebP, e um browser
   * com AVIF escolhia depois a `<source>` — dois downloads da maior imagem da
   * página. Por isso, havendo AVIF, o do Next é desligado e substituído por um
   * nosso com `type="image/avif"` e a MESMA lista da `<source>` (é ela que o
   * browser vai usar, e uma lista diferente era um pré-carregamento de um
   * ficheiro que ninguém pede). `ReactDOM.preload` e não um `<link>` em JSX:
   * o `HeroImage` mediu que o `<link>` aterrava no byte 31 982 do documento,
   * dentro do corpo; o `preload` vai para o `<head>`, deduplicado pelo `href`.
   *
   * Hoje isto apanha os heróis E o `<SafeImage priority>` das capas de
   * /servicos/[slug], que pré-carregava o WebP e passava a usar o AVIF.
   */
  const precarregar = avif !== null && Boolean(priority || preload);
  if (precarregar) {
    ReactDOM.preload(avif.maior, {
      as: "image",
      type: "image/avif",
      imageSrcSet: avif.srcSet,
      imageSizes: avif.sizes,
      fetchPriority: "high",
    });
  }

  /**
   * A superfície que ocupa a caixa da imagem quando não há `<img>` real: entre
   * tentativas (`waiting`) e depois de esgotadas (`exhausted`). É a mesma nos
   * dois casos DE PROPÓSITO — mesma `className` e mesmas dimensões que a
   * imagem verdadeira, portanto a caixa não muda de tamanho em nenhum momento
   * da escada e nada por baixo se mexe.
   *
   * É um `<img>` simples: o `blurDataURL` é um `data:` URI, não tem nada para
   * optimizar, e um `next/image` aqui voltaria a passar pelo caminho que acabou
   * de falhar. Mantém o texto alternativo distinto de cada foto (não se degrada
   * a acessibilidade: a imagem que se mostra continua a ser aquela foto,
   * degradada).
   */
  const reserva = (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      // A `ref` só é usada pelo observador de recuperação, que corre apenas com
      // `exhausted`; deixá-la sempre ligada não custa nada e evita um segundo
      // elemento só para isso.
      ref={fallbackRef}
      src={blurDataURL || NEUTRAL_BLUR}
      alt={alt}
      className={className}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={
        fill
          ? {
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100%",
              height: "100%",
            }
          : undefined
      }
    />
  );

  const imagem = !exhausted && !waiting && (
    <Image
      // A `key` inclui o nº da tentativa: garante um `<img>` NOVO por
      // tentativa em vez de uma troca de atributo num elemento em erro.
      key={bust}
      src={src}
      alt={alt}
      className={className}
      fill={fill}
      width={width}
      height={height}
      sizes={sizes}
      quality={quality}
      unoptimized={unoptimized}
      // Com AVIF e prioridade: o pré-carregamento do Next sai (apontaria para
      // o WebP que o `<picture>` não vai usar) e fica o que ele fazia de útil
      // ao `<img>` — `eager` e prioridade alta. Sem AVIF, tudo passa como veio.
      priority={precarregar ? false : priority}
      preload={precarregar ? false : preload}
      loading={precarregar ? "eager" : loading}
      fetchPriority={precarregar ? (fetchPriority ?? "high") : fetchPriority}
      blurDataURL={blurDataURL}
      loader={loader}
      onLoad={handleLoad}
      // NÃO passar `onError` aqui. Ver a nota grande acima: é ele que faz o
      // next/image reatribuir `img.src = img.src` na montagem e abortar o
      // pedido em voo. O erro é ouvido pela `ref`, que cobre o mesmo caso.
      ref={ligarImg}
      {...rest}
    />
  );

  return (
    <>
      {avif && imagem ? (
        /**
         * ── A CAIXA DO `<picture>` TEM DE SER A MESMA QUE A DO `<img>` ──────
         *
         * Com `fill`: `absolute inset-0`, como o `HeroImage` já fazia, e pela
         * razão que lá ficou medida — uma imagem `fill` cola-se ao antepassado
         * POSICIONADO mais próximo, e um `<picture>` estático no meio passava
         * esse papel para cima (o next/image queixa-se na consola: «parent
         * element with invalid "position"»). Posicionado e a cobrir o pai de
         * bordo a bordo, é a mesma caixa, os mesmos pixels.
         *
         * Sem `fill`: `display: contents` — o `<picture>` não gera caixa
         * nenhuma e o `<img>` fica, para o desenho, filho directo do pai como
         * sempre foi. Um `<picture>` em linha mudava pouco, mas mudava: num pai
         * `flex` passava a ser ele o item, e um `space-y-*` deixava de dar
         * margem ao `<img>`. A escolha da `<source>` é feita pela árvore do
         * DOM, não pelo desenho, por isso `contents` não lhe tira nada.
         */
        <picture style={fill ? PICTURE_FILL : PICTURE_SEM_CAIXA}>
          <source type="image/avif" srcSet={avif.srcSet} sizes={avif.sizes} />
          {imagem}
        </picture>
      ) : (
        imagem
      )}
      {fill && veu !== "nenhum" && !exhausted && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={blurDataURL}
          alt=""
          aria-hidden
          // A mesma `className` da fotografia (enquadramento, escala de
          // repouso…) para o desfoque ficar exactamente por cima dela; a
          // opacidade vai no `style`, para nenhuma classe a contrariar.
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-foto-chega ${className ?? ""}`}
          style={{ opacity: veu === "saida" ? 0 : 1 }}
          onTransitionEnd={() => setVeu("nenhum")}
        />
      )}
      {/*
        UMA só posição para os dois estados sem `<img>` real — a espera entre
        tentativas e o fim da escada. Assim a passagem de `waiting` para
        `exhausted` reaproveita o mesmo nó do DOM (nada desmonta, nada colapsa)
        e a `fallbackRef` que o observador de recuperação usa fica estável.
      */}
      {(waiting || exhausted) && reserva}
      {/*
        A legenda é SÓ do fim da escada. A meio de um recuo de 600 ms ainda não
        se desistiu: dizer "foto indisponível" seria mentira, e piscaria no ecrã.
      */}
      {exhausted && unavailableLabel && (
        <span className="pointer-events-none absolute inset-0 flex items-end justify-start p-3">
          <span className="rounded bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/85">
            {unavailableLabel}
          </span>
        </span>
      )}
    </>
  );
}
