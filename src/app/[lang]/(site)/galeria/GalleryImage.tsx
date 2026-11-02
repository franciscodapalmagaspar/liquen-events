"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { galleryLoadQueue } from "./load-queue";
import { anteciparQuandoPerto, esquecer, promoverQuandoAVista } from "./prioridade-a-vista";
import {
  CORTE_TELEMOVEL,
  ESCADA_ECRA_GRANDE,
  ESCADA_TELEMOVEL,
  ficheiroDaGaleria,
  srcsetDaGaleria,
} from "./gallery-srcset";

/**
 * A foto de um mosaico da galeria, com re-tentativa.
 *
 * PORQUÊ ESTE COMPONENTE EXISTE. A queixa da dona ("nem todas as fotos
 * carregam") tem uma causa mecânica medida: `grep -c onError` na pasta da
 * galeria dava 0. Injectando UM único HTTP 500 em 23 de 176 pedidos
 * `/_next/image`, ficaram 22 mosaicos em branco no fim da sessão e o número de
 * tentativas por URL falhado foi {min:1, max:1} — o browser NUNCA voltou a
 * pedir nenhum deles, nem ao passar por cima da mesma foto uma segunda vez. Um
 * 5xx pontual da infraestrutura era portanto permanente para aquele visitante.
 *
 * O que este componente faz, por ordem de importância:
 *  1. `onError` -> re-tenta com recuo exponencial (600ms, 1800ms, 5400ms) até
 *     um tecto de 4 tentativas, cada uma com um cache-buster (`?r=N`) para não
 *     apanhar a resposta falhada em cache;
 *  2. esgotado o tecto, mostra algo digno (o blur da própria foto, ou o fundo
 *     musgo da grelha, com a legenda por cima) em vez do ícone partido;
 *  3. mesmo depois disso, volta a tentar quando a foto REENTRA no ecrã ou
 *     quando a ligação volta (`online`) — a recuperação que faltava e que fazia
 *     o buraco ser para sempre;
 *  4. só arranca o pedido quando a foto se aproxima do ecrã E há vaga na fila
 *     (ver load-queue.ts), para não recriar a rajada que gerou as falhas.
 */

/** 1 tentativa + 3 re-tentativas. Tecto: passado isto mostra-se o fallback. */
const MAX_ATTEMPTS = 4;
/** Recuo exponencial (x3). O 5xx medido era pontual; 600ms já chega, e os
    passos seguintes dão tempo ao optimizador de esvaziar a fila de encode. */
const BACKOFF_MS = [600, 1800, 5400];
/**
 * Antecipação do carregamento. Generosa de propósito: o que passou a travar a
 * rajada é a FILA (6 em voo), não esta margem, por isso pode-se pedir cedo sem
 * voltar a empilhar pedidos. 1200px alinha com o limiar do lazy-loading nativo
 * do Chrome em 4G — com 300px, medido, um scroll rápido saltava mosaicos entre
 * frames e 180 de 427 ficavam por pedir no fim da travessia.
 */
const NEAR_VIEWPORT = "1200px 0px";

export type GalleryImageProps = {
  src: string;
  alt: string;
  /**
   * A largura da CAIXA por classe de ecrã. Continua a ser preciso (é o que diz
   * ao browser que candidato escolher DENTRO da escada), mas já não decide o
   * tecto: isso é do `<source media>` — ver `gallery-srcset.ts`.
   */
  sizes: string;
  className: string;
  /** Proporção real da foto, para o `<img>` levar `width`/`height` e a caixa
      nunca depender de a fotografia ter chegado. */
  aspectRatio?: string;
  /**
   * Para onde se recorta (`object-position`, ex. `"40% 30%"`) — o ponto de
   * interesse que o build encontrou na foto (gallery-meta.json). Só serve onde
   * a foto é recortada: o mosaico do topo e as miniaturas do lightbox.
   */
  foco?: string;
  blurDataURL?: string;
  /** Candidato a LCP: salta a fila e a espera pelo viewport. */
  priority?: boolean;
  /**
   * ── A ORDEM VALE TANTO COMO OS BYTES ──────────────────────────────────────
   *
   * MEDIDO: no telemóvel são pedidas 5 fotografias antes de a primeira estar
   * pronta; na secretária, 8. Todas com `fetchpriority="auto"`, ou seja todas
   * iguais aos olhos do browser — a que está debaixo do polegar reparte o tubo
   * com a que está três filas abaixo.
   *
   * Aritmética dos ficheiros reais a 1,6 Mbit/s: doze mosaicos × 49,4 KB são
   * 593 KB ≈ 3,0 s. Em paralelo justo, as doze ficam à espera ~3,0 s e chegam
   * quase todas ao mesmo tempo. Por ordem, a primeira estaria pronta a ~250 ms.
   * **Os mesmos bytes, e menos de metade da espera na que se está a olhar.**
   *
   * `longe` marca o que ainda vai longe do ecrã: passa a `low` e deixa de
   * disputar a ligação com o que já se vê. Não é adiar — o pedido sai na mesma;
   * é deixar de o pôr em pé de igualdade com o que está à frente dos olhos.
   */
  longe?: boolean;
  /**
   * O elemento cuja proximidade do ecrã decide quando carregar: o próprio
   * botão do mosaico. Não se usa um wrapper aqui por duas razões: (a) o botão
   * leva `content-visibility: auto`, portanto os seus descendentes nem sequer
   * têm caixa enquanto está fora do ecrã e um observer sobre eles nunca
   * dispararia; (b) o mosaico-herói envolve esta imagem num `<ViewTransition>`,
   * que precisa de UM elemento-filho real para fazer o morph.
   */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Texto mostrado se, esgotadas as tentativas, a foto continuar sem vir. */
  unavailableLabel: string;
  onLoaded?: () => void;
};

export default function GalleryImage({
  src,
  alt,
  sizes,
  className,
  aspectRatio,
  foco,
  blurDataURL,
  priority = false,
  longe = false,
  anchorRef,
  unavailableLabel,
  onLoaded,
}: GalleryImageProps) {
  const releaseRef = useRef<(() => void) | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  /** A `<img>` que está montada agora — só para a poder LARGAR quando sair. */
  const imgRef = useRef<HTMLImageElement | null>(null);
  /**
   * `armed` = o <Image> está montado com src (o pedido está a ser feito).
   *
   * ARRANCA LIGADO. Antes só arrancava ligado nas fotos `priority`, e o resto
   * esperava por um IntersectionObserver — que só corre DEPOIS da hidratação.
   * O efeito medido: o HTML vindo do servidor passou a trazer ZERO fotografias
   * (contadas com `curl … | grep -c "<img"`). Numa galeria isso é grave em três
   * frentes: quem tem a ligação lenta não vê nada até o JavaScript chegar, quem
   * navega sem JavaScript não vê nada de todo, e os motores de busca deixam de
   * encontrar as imagens da página cujo conteúdo SÃO as imagens.
   *
   * A fila continua a proteger da rajada: a limitação de pedidos em voo é feita
   * pelo browser e pela fila nas RE-TENTATIVAS, não por esconder o `src` até
   * alguém correr JavaScript. O `loading="lazy"` do próprio browser já adia o
   * que está longe do ecrã, e esse não precisa de hidratação nenhuma.
   */
  const [armed, setArmed] = useState(true);
  // Nº do cache-buster: 0 = URL original, N = `?r=N` na re-tentativa N.
  const [bust, setBust] = useState(0);
  // Esgotou o tecto de tentativas: mostra-se o fallback digno.
  const [exhausted, setExhausted] = useState(false);
  /**
   * ÚLTIMO RECURSO: o ficheiro original em tamanho inteiro.
   *
   * As miniaturas já são ficheiros estáticos pré-gerados (ver `retryLoader`),
   * por isso este caminho deixou de ser a defesa contra o optimizador e passou
   * a ser a defesa contra uma miniatura em falta: se `/_img/g/<chave>-<w>.webp`
   * não existir (uma foto acrescentada a photos-data.ts sem correr o pregen,
   * um deploy truncado), serve-se `/imagens/x.jpg`. Custa mais bytes, mas a
   * escolha aqui é entre uma fotografia pesada e nenhuma fotografia.
   */
  const [raw, setRaw] = useState(false);
  /**
   * A fotografia já pintou? Serve duas coisas: tirar o blur de baixo (senão
   * fica lá para sempre a gastar memória de composição) e correr o
   * esbatimento de entrada — nunca um corte seco entre o desfocado e o nítido.
   */
  const [carregada, setCarregada] = useState(false);

  const releaseSlot = useCallback(() => {
    releaseRef.current?.();
    releaseRef.current = null;
  }, []);

  // Volta ao estado inicial quando a foto muda (o mesmo nó pode ser reutilizado
  // ao trocar de filtro/coleção) e liberta tudo ao desmontar, para um mosaico
  // que sai do DOM não reter um lugar da fila.
  useEffect(() => {
    return () => {
      releaseSlot();
      if (retryTimerRef.current !== null) clearTimeout(retryTimerRef.current);
    };
  }, [releaseSlot]);

  /** Põe a próxima tentativa na fila (o pedido só sai quando houver vaga). */
  const enqueue = useCallback(() => {
    releaseSlot();
    releaseRef.current = galleryLoadQueue.acquire(() => setArmed(true));
  }, [releaseSlot]);

  // ── Arranque: perto do ecrã + vaga na fila ──────────────────────────────
  useEffect(() => {
    if (priority || armed || exhausted) return;
    const target = anchorRef.current;
    if (!target) return;
    if (typeof IntersectionObserver === "undefined") {
      enqueue();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        enqueue();
      },
      { rootMargin: NEAR_VIEWPORT },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [priority, armed, exhausted, enqueue, anchorRef]);

  // ── Recuperação depois de esgotar as tentativas ─────────────────────────
  // Uma nova ENTRADA no ecrã (saiu e voltou) ou o regresso da rede voltam a dar
  // uma oportunidade à foto. Sem isto, o mosaico ficava vazio para o resto da
  // visita mesmo que a infraestrutura já tivesse recuperado.
  useEffect(() => {
    if (!exhausted) return;
    const reset = () => {
      attemptsRef.current = 0;
      setRaw(false);
      setExhausted(false);
      setCarregada(false);
      setBust((b) => b + 1);
      // Re-armar SEMPRE pela fila (mesmo a foto com prioridade): já não estamos
      // no caminho do LCP, estamos a recuperar de uma falha, e nesse momento a
      // rede pode estar a servir dezenas de outros mosaicos.
      enqueue();
    };
    window.addEventListener("online", reset);
    let left = false;
    let io: IntersectionObserver | null = null;
    const target = anchorRef.current;
    if (target && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) left = true;
          else if (left) reset();
        }
      });
      io.observe(target);
    }
    return () => {
      window.removeEventListener("online", reset);
      io?.disconnect();
    };
  }, [exhausted, anchorRef, enqueue]);

  const handleLoad = useCallback(() => {
    releaseSlot();
    attemptsRef.current = 0;
    setCarregada(true);
    onLoaded?.();
  }, [releaseSlot, onLoaded]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A FOTOGRAFIA NÃO PODE DEPENDER DO REACT PARA APARECER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * MEDIDO, e é um defeito, não uma lentidão: no primeiro ecrã havia
   * fotografias DESCARREGADAS E DESCODIFICADAS que ficavam invisíveis para
   * sempre — 3 de 3 em secretária e 2 de 2 em telemóvel, ainda presas aos
   * 9,6 s de observação.
   *
   * O mecanismo é este. A classe `g-foto` põe o `<img>` a `opacity: 0`, e quem
   * lhe devolve a opacidade é `g-foto-pronta`, posta pelo `onLoad` do React. Só
   * que a fotografia vem no HTML do servidor: se acabar de descarregar ANTES de
   * a hidratação ligar os ouvintes, o `onLoad` do React **nunca dispara**. A
   * foto está lá, descodificada, por baixo de uma opacidade zero que ninguém
   * volta a mexer.
   *
   * É o pior caso possível — acontece precisamente às fotos mais rápidas, que
   * são as do primeiro ecrã, que é o que a visitante vê primeiro. E lê-se
   * exactamente como a queixa dela: um rectângulo de cor que nunca resolve.
   *
   * A correcção não é esperar melhor pelo React: é não esperar por ele. No
   * instante em que o elemento existe pergunta-se-lhe se JÁ está carregado
   * (`complete` + `naturalWidth`, que é a única forma honesta de o saber) e,
   * se não estiver, escuta-se o `load` NATIVO. A classe entra no elemento
   * directamente, sem passar por um commit — o mesmo padrão que o
   * `useBlurTardio` já usa para tirar o desfocado, e pela mesma razão.
   *
   * O `setCarregada` continua a ser chamado para o resto do componente saber;
   * o que deixou de acontecer é a IMAGEM depender disso para se ver.
   */
  const aoMontarImg = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) {
        // A fotografia que ESTAVA aqui, guardada num ref nosso: quando o React
        // chama isto com `null`, o `anchorRef` do botão já foi anulado (ele
        // desliga os refs de pai para filho) e usá-lo aqui não largava nada.
        esquecer(imgRef.current);
        imgRef.current = null;
        return;
      }
      imgRef.current = el;
      /**
       * Nasce `low`, sobe a `auto` quando o mosaico chega ao ecrã. Ver
       * `prioridade-a-vista.ts`: sem isto, 415 das 427 fotografias ficavam
       * `low` para sempre — a que está debaixo do polegar incluída.
       */
      if (longe && !priority) promoverQuandoAVista(anchorRef.current, el);
      // E começa a descarregar um ecrã e meio antes (ver `prioridade-a-vista`).
      if (!priority) anteciparQuandoPerto(anchorRef.current, el);
      const revelar = () => {
        el.classList.add("g-foto-pronta");
        handleLoad();
      };
      // `naturalWidth > 0` e não só `complete`: um `<img>` que falhou também
      // fica `complete`, e revelar uma imagem partida é trocar um mosaico de
      // cor por um ícone de imagem partida.
      if (el.complete && el.naturalWidth > 0) {
        revelar();
        return;
      }
      el.addEventListener("load", revelar, { once: true });
    },
    [handleLoad, longe, priority, anchorRef],
  );

  const handleError = useCallback(() => {
    releaseSlot();
    /**
     * A MINIATURA FALHOU: VAI-SE JÁ AO FICHEIRO ORIGINAL, sem esperar.
     *
     * A escada de recuo existia para o `/_next/image`, onde uma falha era quase
     * sempre passageira (encode a frio, rajada, fila cheia) e esperar resolvia.
     * As miniaturas já não são isso: são ficheiros estáticos, e a maneira de
     * um ficheiro estático falhar é NÃO EXISTIR. Um 404 não melhora por se
     * esperar 600 ms, depois 1800, depois 5400.
     *
     * O preço de tratar os dois casos como um só era o que se via no site: com
     * as miniaturas em falta (um deploy onde o pré-gerador não correu, uma foto
     * acrescentada sem o correr), CADA mosaico gastava 4 pedidos e 7,8 s antes
     * de chegar ao `/imagens/x.jpg` — que está no repositório e portanto existe
     * sempre. Vezes 427 mosaicos, através de uma fila de 6 em voo, dá uma
     * galeria a mostrar "foto indisponível" por todo o lado.
     *
     * Assim, o primeiro erro passa directamente ao original e a fotografia
     * aparece. A escada fica para o original, que é onde uma falha volta a ser
     * plausivelmente passageira.
     */
    if (!raw) {
      attemptsRef.current = 0;
      setArmed(false);
      setRaw(true);
      setBust((b) => b + 1);
      enqueue();
      return;
    }
    attemptsRef.current += 1;
    if (attemptsRef.current >= MAX_ATTEMPTS) {
      // Falhou até o ficheiro original: aí sim, não há foto para mostrar.
      setArmed(false);
      setExhausted(true);
      return;
    }
    const delay = BACKOFF_MS[Math.min(attemptsRef.current - 1, BACKOFF_MS.length - 1)];
    // Desarmar desmonta o <img> falhado; ao voltar a armar, o browser cria um
    // elemento novo com um URL novo, por isso o pedido SAI mesmo (foi a falta
    // deste par desmontar/remontar que fez retry_attempts ficar em 1).
    setArmed(false);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      // Incrementar, não copiar o nº da tentativa: `attemptsRef` é reposto a
      // zero na passagem para o original, e `setBust(attemptsRef.current)`
      // voltava então a produzir o MESMO `?r=1` que acabara de falhar. A
      // primeira re-tentativa do original pedia o URL exacto que falhou e podia
      // apanhá-lo em cache — ou seja, o cache-buster não bustava nada.
      setBust((b) => b + 1);
      enqueue();
    }, delay);
    // `raw` TEM de estar nas dependências: sem ele o fecho via sempre o valor
    // inicial (false) e a passagem pelo ficheiro original repetia-se para
    // sempre, em vez de ser a última tentativa.
  }, [releaseSlot, enqueue, raw]);

  /**
   * O URL de cada candidato do srcset.
   *
   * NUNCA PASSA PELO OPTIMIZADOR. Cada miniatura aponta para um WebP estático
   * gerado no build (`/_img/g/<chave>-<largura>.webp`, ver
   * gallery-image-loader.ts + scripts/pregen-gallery.mjs). É a mudança que
   * resolve a queixa de raiz: um ficheiro estático no CDN não tem quota
   * mensal, não tem encode a frio nem pode esgotar o tempo sob rajada — as
   * três maneiras medidas de o `/_next/image` falhar. Uma travessia completa
   * da galeria passou de 442 pedidos ao optimizador para 4.
   *
   * O cache-buster das re-tentativas (`?r=N`) pode agora ir no URL final sem
   * problema nenhum: é um ficheiro estático, e a query é ignorada pelo
   * servidor de estáticos mas conta como URL novo para o browser. (Com o
   * optimizador não podia ir no `src` por causa do `localPatterns` por defeito
   * do Next 16, `[{ pathname:"**", search:"" }]`, que devolvia 400.)
   *
   * `raw` continua a ser a rede de segurança final: se até o ficheiro
   * pré-gerado faltar, serve-se o original de `/imagens/x.jpg`.
   */
  const sufixo = bust ? `?r=${bust}` : "";

  /**
   * As quatro fontes do `<picture>`, por ordem de preferência do browser.
   *
   * A ordem importa e é esta: **telemóvel-AVIF, telemóvel-WebP, grande-AVIF,
   * grande-WebP**. O browser fica com a primeira `<source>` cujo `media` case
   * E cujo `type` ele saiba ler, portanto quem não souber AVIF cai na linha
   * seguinte — do MESMO tamanho — em vez de saltar para a escada errada.
   *
   * `raw` (o último recurso) não tem `<source>` nenhuma: aí o que interessa é
   * servir o ficheiro original tal e qual, e um `<picture>` a apontar para
   * derivadas que já se sabe que faltam só voltaria a falhar.
   */
  const fontes = useMemo(() => {
    if (raw) return [];
    return [
      { media: CORTE_TELEMOVEL, escada: ESCADA_TELEMOVEL, tipo: "avif" as const },
      { media: CORTE_TELEMOVEL, escada: ESCADA_TELEMOVEL, tipo: "webp" as const },
      { media: undefined, escada: ESCADA_ECRA_GRANDE, tipo: "avif" as const },
      { media: undefined, escada: ESCADA_ECRA_GRANDE, tipo: "webp" as const },
    ];
  }, [raw]);

  /**
   * O `src` do `<img>`, que é o que vale quando nenhuma `<source>` serve (um
   * browser antigo, ou o `raw`). Fica no maior degrau da escada de ecrã grande:
   * é o candidato mais seguro para quem não sabe interpretar `srcset`.
   */
  const srcFinal = raw
    ? `${src}${sufixo}`
    : ficheiroDaGaleria(src, ESCADA_ECRA_GRANDE[ESCADA_ECRA_GRANDE.length - 1], "webp") + sufixo;

  // `width`/`height` explícitos a partir da proporção real: o browser reserva a
  // caixa antes de a fotografia chegar, e o mosaico não pode saltar (CLS).
  const [propW, propH] = (aspectRatio ?? "3 / 2").split("/").map((n) => parseFloat(n) || 1);

  // Fragmento com no máximo UM elemento montado de cada vez (a foto OU o
  // fallback): é o que o `<ViewTransition>` do mosaico-herói precisa para
  // conseguir nomear o filho e fazer o morph.
  return (
    <>
      {armed && (
        // `key` inclui o nº da tentativa: garante um <img> NOVO por tentativa
        // em vez de uma mudança de atributo num elemento em estado de erro.
        <picture
          key={bust}
          /**
           * ══════════════════════════════════════════════════════════════════
           * O DESFOCADO VIVE AQUI, E NÃO NO <img>
           * ══════════════════════════════════════════════════════════════════
           *
           * Esteve no `<img>` — o mesmo elemento que a classe `g-foto` põe a
           * `opacity: 0` à espera do `load`. A opacidade apaga o elemento
           * inteiro, o fundo dele incluído, portanto o desfocado nunca foi
           * visto: medido no sítio construído, 16 mosaicos de 16 traziam-no no
           * HTML e 0 de 16 o mostravam, em telemóvel e em secretária.
           *
           * É um erro que se esconde bem, porque a página não fica feia: fica
           * apenas com o castanho liso do mosaico onde devia estar a sombra da
           * fotografia, que é exactamente o que a dona descreve como "estar à
           * espera". E a tabela do GALERIA-AFTER dizia "Placeholder no 1.º ecrã
           * 16 de 16" — que era verdade sobre o DOM e falso sobre o ecrã.
           *
           * Aqui em baixo não há opacidade nenhuma a apagá-lo, e o `<img>`
           * continua a esbater por cima. Ver `.g-moldura` em globals.css.
           */
          className="g-moldura"
          style={blurDataURL && !carregada ? { backgroundImage: `url(${blurDataURL})` } : undefined}
        >
          {fontes.map((f, i) => (
            <source
              key={i}
              {...(f.media ? { media: f.media } : {})}
              type={`image/${f.tipo}`}
              srcSet={srcsetDaGaleria(src, f.escada, f.tipo, sufixo)}
              sizes={sizes}
            />
          ))}
          <img
            ref={aoMontarImg}
            src={srcFinal}
            alt={alt}
            width={Math.round(propW * 100)}
            height={Math.round(propH * 100)}
            // `g-foto` em TODAS: a fotografia assenta por cima do que estiver
            // por baixo — a cor média do mosaico na galeria — num esbatimento
            // curto. Até 2/11 só esbatiam as que traziam desfocado, e da 49.ª
            // em diante a foto aparecia de um fotograma para o outro (ela: «a
            // forma como aparecem… está muito feia»). O `opacity: 0` não
            // deixa o mosaico vazio: a cor dele continua lá; e sem JavaScript
            // `(scripting: none)` em globals.css devolve-lhe a opacidade.
            className={`absolute inset-0 h-full w-full g-foto ${
              carregada ? "g-foto-pronta" : ""
            } ${className}`}
            /**
             * O adiamento é do BROWSER, não nosso.
             *
             * Isto esteve "eager" para todos, o que fazia sentido quando o
             * `src` só era montado depois de um IntersectionObserver decidir
             * que o mosaico estava perto. Agora que a foto vem no HTML do
             * servidor (para existir sem JavaScript), "eager" em todos os
             * mosaicos mandaria os doze primeiros pedidos de uma vez — a mesma
             * rajada que estamos a tentar evitar.
             *
             * `lazy` devolve essa decisão ao browser, que a toma com informação
             * que nós não temos (velocidade da ligação, direcção do scroll) e
             * sem esperar por hidratação nenhuma. Quem garante que o mosaico
             * EXISTE a tempo de o lazy poder disparar cedo é a antecipação do
             * GaleriaClient.
             */
            loading={priority ? "eager" : "lazy"}
            // O `low` é o ESTADO INICIAL, não uma sentença: quem o levanta é o
            // observador de `prioridade-a-vista`, no instante em que o mosaico
            // entra no ecrã. Escrito no elemento, sem re-render.
            fetchPriority={priority ? "high" : longe ? "low" : "auto"}
            /**
             * `async` em TODAS, incluindo a de prioridade. O que trava o scroll
             * não é o download — é a descodificação: medida nesta galeria em
             * 45,4 ms de mediana por fotografia num telemóvel estrangulado,
             * quase três frames. Com `sync` (o valor por omissão para uma
             * imagem já visível) esse custo entra na thread principal no meio
             * do scroll; com `async` o browser pode tirá-lo de lá.
             */
            decoding="async"
            // O desfocado subiu para o `<picture>`, que é onde se vê. Aqui em
            // baixo fica só o recorte pelo ponto de interesse, quando o há.
            style={foco ? { objectPosition: foco } : undefined}
            onLoad={handleLoad}
            onError={handleError}
          />
        </picture>
      )}
      {exhausted && (
        <span
          className="absolute inset-0 flex items-end justify-start p-3"
          // Com blur disponível mostra-se a própria foto desfocada (a "algo
          // digno" que o utilizador reconhece); sem ele fica o fundo musgo do
          // .g-tile, nunca o ícone de imagem partida.
          style={
            blurDataURL
              ? {
                  backgroundImage: `url(${blurDataURL})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          <span className="rounded bg-black/55 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-white/85">
            {unavailableLabel}
          </span>
        </span>
      )}
    </>
  );
}
