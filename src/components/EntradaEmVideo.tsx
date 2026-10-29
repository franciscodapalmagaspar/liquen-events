"use client";

import { useEffect, useRef } from "react";
import {
  AQUECER_ANTES_S,
  ARRANQUE_S,
  CHAVE_DO_ULTIMO,
  CORTINA_ESPERA_MAX_MS,
  ENCRAVADO_MS,
  MEDIR_REDE_MS,
  NUMERO_DE_VIDEOS,
  DEIXAR_ACABAR_S,
  OCIOSO_MAX_MS,
  SEGUINTES_DEPOIS_DE_S,
  IMAGEM_PRESA_MS,
  SALTO_DE_DESTRAVAR_S,
  PASSAGEM_MS,
  PASSAGEM_PRESA_MS,
  SALTAR_SEM_DADOS_MS,
  TENTAR_DE_NOVO_MS,
  TAKE_DE_ENTRADA,
  duracaoDaSubida,
  eHoraDePassar,
  enderecoDoVideo,
  enderecoLeve,
  imagensAnimadas,
  ligacaoLenta,
  type Animadas,
  formatoDoEndereco,
  formatoQueToca,
  type Formato,
  melhorFormato,
  novaVolta,
  ALIVIAR_JA,
  ALIVIAR_DEPOIS_DE_MS,
  ALIVIAR_MIN_FOTOGRAMAS,
  CHAVE_DO_ALIVIO,
  CHAVE_SEM_GRANDE,
  ALIVIO_DURA_MS,
  alivioGuardado,
  deveAliviar,
  eComputador,
  enderecoLeveDeitado,
  grandeVale,
  perguntaDoNavegador,
  prazoDosSeguintesMs,
  primeiraVolta,
  tipoDoFormato,
  varianteConfirmada,
  varianteParaOEcra,
} from "@/lib/entrada-em-video";
import {
  ROTA_DO_DIAGNOSTICO,
  RegistoDoVideo,
  aparelho,
  diagnosticoLigado,
  formatoDoSrc,
  novaSessao,
  type EstadoDoVideo,
} from "@/lib/diagnostico-video";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DE FUNDO DA ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): os três vídeos na capa, «super fluidos, sem travar».
 * As regras puras (versões, formatos, sequência) estão em
 * `src/lib/entrada-em-video.ts`; aqui está só o que mexe nos `<video>`.
 *
 * ── COMEÇA LOGO QUE SE ENTRA, E NUM TAKE DIFERENTE DE CADA VEZ ─────────────
 * Ela (16/10): «eu quero que mal entremos no site o vídeo comece logo a
 * correr» e, no mesmo dia, «para as pessoas não se fartarem… vai alternando de
 * takes na entrada do site». Os três `<video>` vêm vazios no HTML, e um guião
 * pequeno ESCRITO NO PRÓPRIO HTML (`arrancarEntrada`) corre enquanto o browser
 * lê a página: escolhe o take de entrada (a 1.ª visita na floresta; depois,
 * nunca o da entrada anterior — `escolherPrimeiro`), põe-lhe as `<source>` e
 * manda-o tocar. Não espera pelo JavaScript da página. (É HTML e não JSX
 * porque o React não põe o atributo `muted` no HTML do servidor — e, sem ele,
 * nenhum browser arranca um vídeo antes do JavaScript.)
 *
 * Numa navegação dentro do sítio o React não corre guiões escritos em HTML; aí
 * é o componente que chama a mesma função, já com a página montada.
 *
 * ── A CORTINA SOBE COM O VÍDEO ──────────────────────────────────────────────
 * Ela (16/10): «quero que a coloques sincronizada com o vídeo… para não ficar
 * nada travado». Enquanto a frase está no ecrã, o take de entrada descarrega e
 * arranca ESCONDIDO até o descodificador ter imagem (`playing` com dados para
 * seguir), e pára no 1.º fotograma. No instante em que o pano começa a subir,
 * o vídeo arranca: o take começa do princípio à vista dela, já sem nada para
 * carregar. Se no instante da subida o vídeo ainda não está pronto (rede
 * lenta), o pano e a frase ficam parados no sítio — até o vídeo estar pronto,
 * ou no máximo `CORTINA_ESPERA_MAX_MS` — e sobem juntos. Sem JavaScript, ou
 * sem cortina (movimento reduzido, navegação dentro do sítio), o vídeo arranca
 * logo, como antes.
 *
 * ── A FOTOGRAFIA POR BAIXO, O VÍDEO POR CIMA ────────────────────────────────
 * A fotografia da capa (o `HeroImage` por baixo) é o primeiro fotograma da
 * floresta, e continua a ser o elemento de LCP. O vídeo entra por cima quando
 * JÁ está a tocar, só com opacidade. Nunca aparece um quadro preto. (Quando o
 * take de entrada é outro, a fotografia dissolve-se nele em 0,8 s — e na
 * primeira entrada isso acontece debaixo da cortina.)
 *
 * ── CADA TAKE DESCARREGADO INTEIRO ANTES DA SUA VEZ ─────────────────────────
 * Ela (16/10), num iPhone em 4G pelo Instagram: «o vídeo está a travar aqui».
 * Os takes seguintes eram tocados directamente da rede: em 4G com pouco sinal
 * a imagem podia ficar sem dados a meio e parar. Agora cada take seguinte é
 * DESCARREGADO INTEIRO (um de cada vez, a começar quando o de entrada já
 * chegou inteiro E já andou uns segundos à vista — ver «os seguintes esperam»,
 * mais abaixo) e só depois tocado — da memória do telemóvel, onde a rede já
 * não o pode fazer parar. Quando falta `AQUECER_ANTES_S` para o fim
 * do take à vista, o seguinte descodifica o 1.º fotograma escondido (é o
 * único jeito de o iPhone o preparar), e na passagem só falta arrancar.
 * Fazê-lo só então, e não logo, poupa ter dois vídeos a descodificar durante
 * o take inteiro. Se o browser não deixar descarregar assim, cai no caminho
 * antigo: toca da rede, preparado logo.
 *
 * Quando faltam `PASSAGEM_MS` para o fim, o seguinte arranca e, quando JÁ está
 * a tocar, sobe por cima só com opacidade. Se ainda não estiver pronto (uma
 * rede muito lenta), o actual REPETE-SE em vez de parar, e a passagem faz-se
 * na volta seguinte.
 *
 * ── NUNCA FICA PARADO (o vigia) ─────────────────────────────────────────────
 * Ela (16/10): «quando volta ao vídeo, ele continua sempre de forma super
 * fluida, sem travar, e não pára». Fora do ecrã (ou com o separador
 * escondido) os vídeos param, para a rolagem ficar leve e o telemóvel não
 * gastar bateria. Ao voltar, retomam onde estavam. E, enquanto a entrada se
 * vê, um vigia confirma uma vez por segundo que o vídeo está mesmo a andar:
 *   · se o browser o parou sozinho → volta a tocá-lo;
 *   · se ficou `ENCRAVADO_MS` sem avançar (rede, descodificador) → salta para
 *     o vídeo seguinte se já estiver pronto, ou recarrega este no mesmo ponto.
 *
 * ── UMA NOTIFICAÇÃO, O AVISO DA BATERIA: VOLTA SOZINHO ─────────────────────
 * Ela (16/10): «apareceu-me uma notificação no telemóvel enquanto estava a ver
 * o vídeo… ou a notificação da bateria fraca, e o vídeo parou; quando voltei,
 * não quero que isso aconteça». O sistema do telemóvel pára o vídeo por cima
 * da página (uma janela do sistema, uma chamada, o aviso da bateria) sem dizer
 * porquê. Por isso cada `pause()` NOSSO fica marcado; uma paragem que não é
 * nossa é do sistema, e o vídeo volta a tocar logo, e outra vez aos 0,3 s e
 * a 1 s (o sistema às vezes recusa o primeiro pedido enquanto o aviso ainda
 * está a fechar). Ao regressar (separador, janela, `pageshow`, `resume`),
 * confirma-se meio segundo depois que a imagem anda mesmo; se o descodificador
 * ficou preso (acontece no iPhone depois de um aviso), um salto para o mesmo
 * instante solta-o — sem esperar pelo vigia.
 *
 * Se a pessoa ligar a «Poupança de bateria» no próprio aviso, o iPhone deixa
 * de deixar o vídeo arrancar sozinho: aí volta ao primeiro toque (ver abaixo).
 *
 * ── TOCA SEMPRE, MESMO COM «REDUZIR MOVIMENTO» E POUPANÇA DE ENERGIA ───────
 * Decisão dela (16/10), depois de ver o sítio da Festa Aluga a tocar o vídeo
 * no computador dela com as animações reduzidas: «quero que mesmo para
 * telemóveis ou PCs que tenham estas coisas, e também poupanças de energia, os
 * vídeos continuem a correr». Por isso `prefers-reduced-motion` e «Poupar
 * dados» NÃO desligam os vídeos (o resto do sítio continua a respeitá-los).
 * Quando o próprio aparelho recusa arrancar sozinho (o iPhone em poupança de
 * bateria recusa o `play()` sem gesto — `NotAllowedError`), a floresta entra
 * logo como IMAGEM animada (`porImagemAnimada`, posta pelo próprio guião do
 * HTML, antes de o React chegar) e o vídeo arranca ao PRIMEIRO toque, clique
 * ou tecla da pessoa em qualquer sítio da página. Nenhum código consegue pôr
 * um `<video>` a tocar sem um gesto nesse modo — é uma regra do sistema.
 *
 * `aria-hidden`, sem controlos e fora do Tab: é fundo, mudo, sem nada que o
 * texto à volta não diga.
 */

/** A mesma escala de repouso da fotografia (`.hero-settle`, em globals.css). */
const ESTILO = `opacity:0;transform:scale(1.06);transition:opacity ${PASSAGEM_MS}ms ease`;

const COMUNS =
  'muted playsinline disablepictureinpicture disableremoteplayback tabindex="-1" ' +
  'aria-hidden="true" class="absolute inset-0 h-full w-full object-cover"';

const AO_ALTO = `media="(orientation: portrait)"`;

/**
 * As `<source>` do take `i` quando é o de entrada: ao alto a versão vertical,
 * deitado a larga — o browser fica com a primeira que sabe tocar.
 *
 * Ao alto (o telemóvel): HEVC, H.264, VP9. O HEVC vem primeiro porque é o da
 * casa da Apple, descodificado no chip em todos os iPhones.
 *
 * Deitado (o computador): **H.264 primeiro**, HEVC, VP9. Ela (29/10): «no PC
 * está a travar mesmo imenso, principalmente na parte do vídeo». O `<source>`
 * não pergunta ao aparelho se descodifica no chip: o Safari de um Mac Intel
 * diz que toca HEVC e descodifica-o no processador. O H.264 é descodificado no
 * chip em todos os computadores; o HEVC e o AV1 entram nos takes seguintes,
 * só depois de o aparelho dizer que os toca no chip (`melhorFormato`).
 */
export function fontesDeEntrada(i: number): string {
  const ordem = {
    retrato: ["hevc", "mp4", "webm"],
    paisagem: ["mp4", "hevc", "webm"],
  } as const;
  const de = (variante: "retrato" | "paisagem", media: string) =>
    ordem[variante]
      .map(
        (f) =>
          `<source ${media}src="${enderecoDoVideo(i, variante, f)}" type='${tipoDoFormato(f, variante)}'>`,
      )
      .join("");
  return de("retrato", `${AO_ALTO} `) + de("paisagem", "");
}

/**
 * As `<source>` da versão leve do take `i` (só ao alto): HEVC e H.264, sem
 * `media` — só se põem quando o ecrã já está ao alto. Ver `enderecoLeve`.
 */
export function fontesLeves(i: number): string {
  return (["hevc", "mp4"] as const)
    .map((f) => `<source src="${enderecoLeve(i, f)}" type='${tipoDoFormato(f, "retrato")}'>`)
    .join("");
}

/**
 * A `<source>` da versão leve deitada do take `i` (ver `enderecoLeveDeitado`):
 * só H.264, o mais leve de descodificar.
 */
export function fonteLeveDeitada(i: number): string {
  return `<source src="${enderecoLeveDeitado(i)}" type='${tipoDoFormato("mp4")}'>`;
}

type ComPrerender = Document & { prerendering?: boolean };

/**
 * Põe a floresta como IMAGEM animada por cima da fotografia (ver
 * `enderecoAnimada`): o MP4 num `<img>` no Safari/iPhone e, se falhar ou o
 * browser não for o Safari, o WebP animado. Se a raiz já tiver uma, devolve-a
 * (o guião do HTML põe-na antes de o React chegar, e o motor reconhece-a).
 *
 * Como o `arrancarEntrada`, é fechada em si mesma: vai no HTML como texto.
 */
export function porImagemAnimada(
  raiz: Element,
  animadas: Animadas,
  aoAlto: boolean,
  passagemMs: number,
): HTMLImageElement | null {
  const ja = raiz.querySelector("img[data-entrada-imagem]") as HTMLImageElement | null;
  if (ja) return ja;
  const k = aoAlto ? 0 : 1;
  const safari = /Apple/.test(navigator.vendor || "");
  const fontes = safari ? [animadas.mp4[k], animadas.webp[k]] : [animadas.webp[k]];
  const img = document.createElement("img");
  img.alt = "";
  img.setAttribute("aria-hidden", "true");
  img.setAttribute("data-entrada-imagem", "");
  img.decoding = "async";
  img.className = "absolute inset-0 h-full w-full object-cover";
  img.style.cssText =
    "opacity:0;transform:scale(1.06);transition:opacity " + passagemMs + "ms ease;z-index:1";
  let i = 0;
  img.addEventListener("load", () => {
    img.style.opacity = "1";
  });
  img.addEventListener("error", () => {
    i++;
    if (i < fontes.length) img.src = fontes[i];
    else img.remove();
  });
  img.src = fontes[0];
  raiz.appendChild(img);
  return img;
}
type ComLigacao = Navigator & {
  connection?: { effectiveType?: string; downlink?: number; saveData?: boolean };
};

/**
 * O GUIÃO DE ARRANQUE. Corre ESCRITO NO HTML, enquanto o browser lê a página
 * (antes de qualquer JavaScript do sítio), e por isso é uma função fechada em
 * si mesma: tudo o que precisa entra pelos argumentos, e é passada ao HTML
 * como texto (`.toString()`). Sem sintaxe que precise de ajudas do compilador.
 *
 *   1. escolhe o take de entrada (a mesma conta do `escolherPrimeiro`: a 1.ª
 *      visita na floresta, depois nunca o da entrada anterior) e guarda-o no
 *      browser, para a próxima entrada ser outro;
 *   2. põe-lhe as `<source>` e manda-o tocar;
 *   3. se a cortina estiver no ecrã, sincroniza-se com ela (ver o cabeçalho).
 */
export function arrancarEntrada(
  fontes: string[],
  chave: string,
  esperaMax: number,
  leves: string[] = [],
  medirMs = 1200,
  animadas?: Animadas,
  porImagem?: typeof porImagemAnimada,
  passagemMs = 800,
  levesDeitado: string[] = [],
  chaveAlivio = "",
  alivioMs = 0,
): void {
  const doc = document as ComPrerender;
  const guiao = doc.currentScript;
  const raiz = (guiao && guiao.parentElement) || doc.querySelector("[data-entrada]");
  if (!raiz || raiz.querySelector("[data-primeiro]")) return;
  let n = 0;
  try {
    const u = localStorage.getItem(chave);
    if (u !== null) {
      const ultimo = Number(u);
      if (ultimo >= 0 && ultimo < fontes.length && Math.floor(ultimo) === ultimo) {
        n = Math.floor(Math.random() * (fontes.length - 1));
        if (n >= ultimo) n++;
        if (n > fontes.length - 1) n = fontes.length - 1;
      }
    }
    localStorage.setItem(chave, String(n));
  } catch {
    // Janela privada ou armazenamento bloqueado: entra na floresta.
  }
  const vs = raiz.querySelectorAll("video");
  const v = vs[n] as HTMLVideoElement | undefined;
  if (!v) return;
  v.setAttribute("data-primeiro", "");
  v.muted = true;
  v.autoplay = true;
  v.preload = "auto";
  // ── REDE FRACA, AO ALTO: ARRANCA NA VERSÃO LEVE ────────────────────────
  // (ver `enderecoLeve`). A mesma conta de `ligacaoLenta`, escrita aqui
  // porque este guião não importa nada.
  const aoAlto = typeof matchMedia === "function" && matchMedia("(orientation: portrait)").matches;
  const lig = (navigator as ComLigacao).connection;
  const lenta =
    !!lig &&
    (!!lig.saveData ||
      /(^|-)(2g|3g)$/.test(lig.effectiveType || "") ||
      (typeof lig.downlink === "number" && lig.downlink > 0 && lig.downlink < 5));
  // Só se o browser a souber tocar: a leve é HEVC e H.264, e há browsers que
  // só tocam o WebM — esses ficam sempre na normal (sem isto ficavam sem vídeo).
  const tiposLeves = (leves[n] || "").match(/type='[^']+'/g) || [];
  let levePode = false;
  for (let i = 0; i < tiposLeves.length; i++) {
    if (v.canPlayType(tiposLeves[i].slice(6, -1))) levePode = true;
  }
  let leve = false;
  const porLeve = () => {
    leve = true;
    while (v.firstChild) v.removeChild(v.firstChild);
    v.insertAdjacentHTML("beforeend", leves[n]);
    v.setAttribute("data-leve", "");
  };
  // ── DEITADO, NUM COMPUTADOR QUE NÃO AGUENTOU A NORMAL ──────────────────
  // (ver `enderecoLeveDeitado`). O motor guardou-o da última vez; a mesma
  // conta de `alivioGuardado`, escrita aqui porque este guião não importa nada.
  let aliviado = false;
  if (!aoAlto && chaveAlivio && levesDeitado[n]) {
    try {
      const t = Number(localStorage.getItem(chaveAlivio));
      const agora = Date.now();
      aliviado = t > 0 && t <= agora && agora - t < alivioMs;
    } catch {
      // armazenamento bloqueado: começa na normal, e o motor mede
    }
    if (aliviado && !v.canPlayType("video/mp4")) aliviado = false;
  }
  if (aliviado) {
    v.insertAdjacentHTML("beforeend", levesDeitado[n]);
    v.setAttribute("data-aliviado", "");
  } else if (aoAlto && levePode && lenta) porLeve();
  else v.insertAdjacentHTML("beforeend", fontes[n]);
  // Um browser que não sabe tocar nenhuma das fontes fica com a fotografia.
  const fs = v.querySelectorAll("source");
  let tocavel = false;
  for (let i = 0; i < fs.length; i++) {
    if (v.canPlayType(fs[i].getAttribute("type") || "")) tocavel = true;
  }
  if (!tocavel) return;

  const c = doc.querySelector(".cortina") as HTMLElement | null;
  const cortinaNoEcra = () =>
    !!c &&
    c.isConnected &&
    !c.classList.contains("cortina--fora") &&
    typeof c.getAnimations === "function" &&
    getComputedStyle(c).display !== "none";

  /**
   * O take arranca escondido só até o descodificador ter o 1.º fotograma, e
   * fica PARADO nele enquanto junta reserva («pode tocar até ao fim sem
   * parar» — `canplaythrough`). MEDIDO num 4G fraco: deixado a tocar enquanto
   * carregava, gastava o pouco que chegava e, ao ficar à vista, parava e
   * arrancava várias vezes. Parado no 1.º fotograma, a reserva junta-se e o
   * take, quando arranca, já não pára.
   *
   * Com a cortina no ecrã, arranca com a subida do pano (ou o pano espera por
   * ele, no máximo `esperaMax`). Sem cortina, arranca quando tiver reserva, no
   * máximo `esperaMax` depois do 1.º fotograma.
   */
  const preparar = () => {
    const comCortina = !!c && cortinaNoEcra();
    const pano = comCortina && c ? c.getAnimations()[0] : undefined;
    let pronto = false;
    let largou = false;
    let segurou = false;
    const animacoes = () => {
      if (!c) return [];
      let a = c.getAnimations({ subtree: true });
      const fotos = doc.querySelectorAll(".hero-settle");
      for (let i = 0; i < fotos.length; i++) a = a.concat(fotos[i].getAnimations());
      return a;
    };
    // Enquanto este atributo existir, o componente não toca neste vídeo.
    v.setAttribute("data-a-espera", "");
    const largar = () => {
      if (largou) return;
      largou = true;
      v.removeAttribute("data-a-espera");
      const p = v.play();
      if (p) p.catch(() => undefined);
      if (segurou) {
        const a = animacoes();
        for (let i = 0; i < a.length; i++) a[i].play();
      }
    };
    const ficaPronto = () => {
      if (pronto || largou) return;
      pronto = true;
      // Sem cortina, ou com o pano já à espera dele: arranca agora.
      if (!pano || segurou) largar();
    };
    const segurar = () =>
      v.addEventListener(
        "playing",
        () => {
          if (largou) return;
          // O 1.º fotograma está pronto: pára nele e junta reserva.
          v.pause();
          try {
            v.currentTime = 0;
          } catch {
            // ainda sem dados para saltar: fica onde está
          }
          if (v.readyState >= 4) ficaPronto();
          else v.addEventListener("canplaythrough", ficaPronto, { once: true });
          if (!pano) setTimeout(largar, esperaMax);
        },
        { once: true },
      );
    segurar();
    // Ao alto e ainda na versão normal: mede-se a rede no arranque (é o que
    // conta no iPhone, que não diz como está a ligação). Se em `medirMs` chegou
    // menos de 1,3 s de vídeo por segundo de espera, a normal pararia — e
    // passa-se à leve, ainda antes de o take ficar à vista (ver `eRedeLenta`).
    if (aoAlto && !leve && levePode) {
      const t0 = Date.now();
      setTimeout(() => {
        if (largou || pronto || leve) return;
        const b = v.buffered;
        const chegou = b && b.length ? b.end(b.length - 1) : 0;
        if (chegou >= ((Date.now() - t0) / 1000) * 1.3) return;
        porLeve();
        v.load();
        segurar();
        const q = v.play();
        if (q) q.catch(() => undefined);
      }, medirMs);
    }
    const p = v.play();
    if (p) {
      p.catch((e: unknown) => {
        // O aparelho recusou (poupança de bateria): não se segura nada, e o
        // componente arranca-o ao primeiro toque. Entretanto, JÁ, a floresta
        // entra como imagem animada — antes de o React chegar, para não se
        // ver a fotografia parada (ver `enderecoAnimada`).
        if (e && (e as { name?: string }).name === "NotAllowedError" && animadas && porImagem) {
          porImagem(raiz, animadas, innerHeight > innerWidth, passagemMs);
        }
        pronto = true;
        largar();
      });
    }
    if (!pano) return;
    // O browser devolve o tempo como o normalizou («1.98s», não «1980ms»).
    const tempo = getComputedStyle(doc.documentElement).getPropertyValue("--cortina-sobe").trim();
    const sobe =
      (parseFloat(tempo) || 0) * (/ms$/.test(tempo) ? 1 : /s$/.test(tempo) ? 1000 : 0) || 1980;
    const decorrido = typeof pano.currentTime === "number" ? pano.currentTime : 0;
    setTimeout(
      () => {
        if (largou) return;
        if (pronto) {
          largar();
          return;
        }
        segurou = true;
        const a = animacoes();
        for (let i = 0; i < a.length; i++) a[i].pause();
        setTimeout(largar, esperaMax);
      },
      // Um pouco ANTES da subida: o pano anda na placa gráfica, sozinho, mas
      // este relógio corre no processador, que nesse segundo está ocupado a
      // montar a página — MEDIDO, chegava 0,1 a 0,4 s atrasado ao pano.
      // Arrancado 0,2 s antes, o vídeo já anda quando o pano o destapa
      // (medido: entre 0,2 e 0,45 s antes do pano, em sete formas de entrar).
      Math.max(0, sobe - decorrido - 200),
    );
  };

  // Uma página pré-desenhada (o sítio prepara a seguinte quando o dedo se
  // aproxima de uma ligação) ainda não é página: a cortina está parada à
  // espera, e a preparação também.
  if (doc.prerendering) {
    doc.addEventListener("prerenderingchange", preparar, { once: true });
  } else {
    preparar();
  }
}

/** As `<source>` de entrada de cada take, pela ordem dos `<video>`. */
const FONTES = Array.from({ length: NUMERO_DE_VIDEOS }, (_, i) => fontesDeEntrada(i));
/** E as da versão leve (ao alto, numa rede fraca). */
const LEVES = Array.from({ length: NUMERO_DE_VIDEOS }, (_, i) => fontesLeves(i));
const LEVES_DEITADO = Array.from({ length: NUMERO_DE_VIDEOS }, (_, i) => fonteLeveDeitada(i));

/** As imagens animadas do take de entrada, para quando o aparelho recusa o vídeo. */
const ANIMADAS = imagensAnimadas(TAKE_DE_ENTRADA);

/** O guião como texto, para ir no HTML (ver `arrancarEntrada`). */
export const GUIAO_DA_ENTRADA = `(${arrancarEntrada.toString()})(${JSON.stringify(FONTES)},${JSON.stringify(CHAVE_DO_ULTIMO)},${CORTINA_ESPERA_MAX_MS},${JSON.stringify(LEVES)},${MEDIR_REDE_MS},${JSON.stringify(ANIMADAS)},${porImagemAnimada.toString()},${PASSAGEM_MS},${JSON.stringify(LEVES_DEITADO)},${JSON.stringify(CHAVE_DO_ALIVIO)},${ALIVIO_DURA_MS});`;

/**
 * O HTML dos três vídeos, igual no servidor e no browser: os três vazios, e o
 * guião que escolhe o take de entrada e o põe a tocar.
 */
export const HTML_DOS_VIDEOS =
  Array.from(
    { length: NUMERO_DE_VIDEOS },
    (_, k) =>
      `<video data-entrada-video="${k}" preload="none" ${COMUNS} style="${ESTILO}"></video>`,
  ).join("") + `<script>${GUIAO_DA_ENTRADA}</script>`;

/**
 * O que toca os vídeos, e que SOBREVIVE a sair da página inicial.
 *
 * Ela (16/10): «quando vou a outra página do site e depois volto à página
 * inicial, ele fica ali um bocadinho parado numa foto… eu quero que continue a
 * correr o vídeo lindamente». Antes, sair da página deitava os vídeos fora, e
 * voltar começava do zero: escolher, descarregar, descodificar — e entretanto
 * via-se a fotografia. Agora os três `<video>` (com o que já descarregaram e
 * descodificaram) ficam guardados enquanto a pessoa anda pelo sítio; ao voltar,
 * os MESMOS elementos entram na página nova e o take continua de onde estava —
 * o fotograma já está pintado, e a fotografia nem chega a ver-se.
 *
 * `ligar` e `desligar` só tratam do que depende da página (o observador do
 * ecrã, o vigia, os ouvintes da janela); o resto vive enquanto o separador.
 */
interface Motor {
  videos: HTMLVideoElement[];
  ligar(raiz: HTMLElement): void;
  desligar(): void;
  destruir(): void;
}
let motorDaSessao: Motor | null = null;

/** Para os testes: esquece o motor guardado (como um separador novo). */
export function esquecerMotorDaSessao() {
  motorDaSessao?.destruir();
  motorDaSessao = null;
}

function criarMotor(raiz: HTMLElement): Motor | null {
  let raizAtual = raiz;
  const videos = [...raiz.querySelectorAll<HTMLVideoElement>("video")];
  if (videos.length < NUMERO_DE_VIDEOS) return null;
  let atual = Math.max(
    0,
    videos.findIndex((v) => v.hasAttribute("data-primeiro")),
  ); // o clip (= o <video>) que está à vista
  const primeiro = videos[atual];
  // Um browser que não toca nenhum dos formatos fica com a fotografia.
  const podeTocarTipo = (tipo: string) => primeiro.canPlayType(tipo);
  const talvez = formatoDoEndereco(primeiro.currentSrc) ?? formatoQueToca(podeTocarTipo);
  if (!talvez) return null;
  // O formato dos vídeos seguintes: para já o que o browser escolheu para o
  // de entrada; o aparelho é perguntado a seguir (ver `melhorFormato`), e a
  // preparação dos seguintes espera pela resposta (no máximo 1 s).
  let formato: Formato = talvez;
  let decidido = false;

  let vivo = true;
  // Com a página inicial à vista (ver `Motor`). Fora dela nada toca, mas os
  // downloads continuam — para estarem prontos quando ela voltar.
  let ligado = false;
  // A fila do que vem a seguir: a 1.ª volta começa no take de entrada e os
  // outros vêm sorteados; as voltas seguintes são sorteadas inteiras (ver
  // `primeiraVolta`/`novaVolta`). Mantém-se sempre com pelo menos dois à
  // frente, para a preparação em cadeia saber o que vem depois do próximo.
  const fila: number[] = primeiraVolta(atual).slice(1);
  const encherFila = () => {
    while (fila.length < 2) fila.push(...novaVolta(fila[fila.length - 1] ?? atual));
  };
  encherFila();
  const proximo = () => fila[0];
  let aPassar = false;
  /** A passagem em curso: até quando pode esperar pelo seguinte, e se ele já subiu. */
  let passagem: { limite: number; subiu: boolean } | null = null;
  /** Há um vídeo à vista (escondem-se todos quando o aparelho os recusa). */
  let mostrado = false;
  let ultimoTempo = -1; // para o vigia: o último tempo visto do vídeo à vista
  let paradoDesde = 0;
  let naTela = true;
  let separadorVisivel = document.visibilityState !== "hidden";
  const aTocar = new Set<HTMLVideoElement>();
  /** Pronto a arrancar: com o 1.º fotograma descodificado. */
  const pronto = videos.map(() => false);
  /** Já se pediu a fonte (o download, ou o endereço da rede). */
  const pedido = videos.map((_, i) => i === atual);
  /** De onde toca: o ficheiro já na memória (`blob:`), ou o endereço da rede. */
  const fonte: Array<string | null> = videos.map(() => null);
  const daMemoria = videos.map(() => false);
  const aquecido = videos.map((_, i) => i === atual);
  const aAquecer = new Set<HTMLVideoElement>();
  const naMemoria: string[] = [];
  /** De que endereço veio cada cópia na memória (`blob:` não diz se é ao alto). */
  const origemDoBlob = new Map<string, string>();
  // Os `pause()` feitos por nós. Uma paragem que não esteja aqui foi o
  // sistema (uma notificação, o aviso da bateria) — e o vídeo volta logo.
  const pausadoPorNos = new WeakSet<HTMLVideoElement>();
  const limpar: Array<() => void> = [];
  const depois = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      if (vivo) fn();
    }, ms);
    limpar.push(() => window.clearTimeout(t));
  };
  // No computador: um take à frente, da rede (a cache do browser), sem cópias
  // inteiras na memória — ver `eComputador`.
  const computador = eComputador(
    typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches,
    window.innerWidth,
  );
  const podeDescarregar =
    !computador &&
    typeof fetch === "function" &&
    typeof URL !== "undefined" &&
    typeof URL.createObjectURL === "function";

  const ouvir = <K extends keyof HTMLVideoElementEventMap>(
    el: HTMLVideoElement,
    ev: K,
    fn: (e: HTMLVideoElementEventMap[K]) => void,
    once = false,
  ) => {
    el.addEventListener(ev, fn, { once });
    limpar.push(() => el.removeEventListener(ev, fn));
  };

  for (const el of videos) {
    // Propriedade e atributo: o iPhone olha para os dois.
    el.muted = true;
    el.defaultMuted = true;
  }

  const ecraDeAgora = () => ({
    largura: window.innerWidth,
    altura: window.innerHeight,
    densidade: window.devicePixelRatio || 1,
  });
  // A versão grande (2560) só depois de o aparelho a confirmar no chip — ver
  // `grandeVale`. Até lá, e se ele não responder, os takes vão na de 1920.
  let grandeConfirmada = false;
  const variante = (i: number) => varianteConfirmada(ecraDeAgora(), i, grandeConfirmada);
  // Deitado, num aparelho que não aguenta a versão escolhida, desce-se por
  // degraus (ver `aliviar`): 0 é a de sempre (a grande, se o ecrã a pede),
  // 1 é sem a grande (a de 1920), 2 é a leve (1280). Começa no degrau que
  // ficou guardado da última vez — o 2 já o escolheu o guião do HTML.
  let nivel = primeiro.hasAttribute("data-aliviado") ? 2 : 0;
  if (nivel === 0) {
    try {
      if (alivioGuardado(localStorage.getItem(CHAVE_SEM_GRANDE), Date.now())) nivel = 1;
    } catch {
      // armazenamento bloqueado: começa no 0, e mede-se
    }
  }
  const enderecoDe = (i: number) =>
    nivel >= 2 && variante(i) !== "retrato"
      ? enderecoLeveDeitado(i)
      : enderecoDoVideo(i, variante(i), formato);

  // ── O REGISTO ANÓNIMO (ver `src/lib/diagnostico-video.ts`) ─────────────
  // Só observa: nada do que o motor faz depende dele.
  const registo =
    diagnosticoLigado() &&
    typeof navigator !== "undefined" &&
    typeof navigator.sendBeacon === "function"
      ? new RegistoDoVideo({
          agora: () => performance.now(),
          enviar: (corpo) => {
            try {
              navigator.sendBeacon(
                ROTA_DO_DIAGNOSTICO,
                new Blob([corpo], { type: "application/json" }),
              );
            } catch {
              // sem registo, sem problema
            }
          },
          depois: (ms, fn) => depois(ms, fn),
          aparelho: aparelho(
            navigator.userAgent,
            ecraDeAgora(),
            (navigator as ComLigacao).connection?.effectiveType ?? null,
          ),
          sessao: novaSessao(),
          fotogramasFinos:
            typeof HTMLVideoElement !== "undefined" &&
            "requestVideoFrameCallback" in HTMLVideoElement.prototype,
        })
      : null;
  const marcar = (k: string, v?: number) => registo?.acontecimento(k, v);

  const podeTocar = () => ligado && naTela && separadorVisivel;
  /** O take de entrada à espera da cortina: é o guião do HTML que o larga. */
  const aEsperaDaCortina = (el: HTMLVideoElement) => el.hasAttribute("data-a-espera");

  // O aparelho recusou arrancar sozinho (poupança de bateria): espera-se pelo
  // primeiro gesto da pessoa, em qualquer sítio, e tenta-se outra vez.
  const GESTOS = ["pointerdown", "touchstart", "keydown", "click"] as const;
  let aEsperarGesto = false;
  const largarGestos = () => {
    for (const g of GESTOS) window.removeEventListener(g, aoGesto, true);
  };
  function aoGesto() {
    if (!vivo) return;
    aEsperarGesto = false;
    largarGestos();
    retomar();
  }
  /**
   * ── RECUSADO: NUNCA O BOTÃO ▶ DO IPHONE ──────────────────────────────────
   * Ela (16/10), num iPhone com a poupança de energia ligada, a entrar pelo
   * Instagram: o vídeo parado, à vista, com o botão ▶ do sistema por cima —
   * «isto é que não pode acontecer». Com a poupança ligada o iPhone recusa
   * QUALQUER vídeo que arranque sozinho, e desenha esse botão em cima de um
   * vídeo parado que esteja à vista. Por isso, recusado: os vídeos saem da
   * vista (fica a fotografia, que é o primeiro fotograma da floresta) e, no
   * Safari/iPhone, entra a mesma floresta como IMAGEM animada
   * (`imagemAnimada`) — o Safari toca um MP4 num `<img>`, e a poupança de
   * energia não trava imagens. Ao primeiro toque o vídeo tenta outra vez; se
   * arrancar, a imagem sai.
   */
  const esconderVideos = () => {
    for (const el of videos) el.style.opacity = "0";
    mostrado = false;
  };
  let imagem: HTMLImageElement | null = null;
  const imagemAnimada = () => {
    if (imagem) {
      if (!imagem.isConnected) raizAtual.append(imagem);
      return;
    }
    const { largura, altura } = ecraDeAgora();
    imagem = porImagemAnimada(raizAtual, ANIMADAS, altura > largura, PASSAGEM_MS);
  };
  const tirarImagem = () => {
    // A que o guião do HTML pôs antes de o motor existir também conta.
    const img = imagem ?? raizAtual.querySelector<HTMLImageElement>("img[data-entrada-imagem]");
    if (!img) return;
    imagem = null;
    img.style.opacity = "0";
    window.setTimeout(() => img.remove(), PASSAGEM_MS + 50);
  };
  const esperarPorGesto = () => {
    // Só conta se o take à vista está mesmo parado: um vídeo que anda (o
    // browser arrancou-o pelo `autoplay` e recusou só um `play()` a mais) não
    // espera por nada — e esperar desligava o vigia.
    if (!videos[atual].paused) return;
    if (!aEsperarGesto) marcar("recusa", atual);
    esconderVideos();
    imagemAnimada();
    if (aEsperarGesto) return;
    aEsperarGesto = true;
    for (const g of GESTOS) window.addEventListener(g, aoGesto, { capture: true, passive: true });
  };
  limpar.push(largarGestos);
  limpar.push(() => imagem?.remove());

  function pausar(el: HTMLVideoElement) {
    if (!el.paused) pausadoPorNos.add(el);
    el.pause();
  }

  function tocar(el: HTMLVideoElement) {
    pausadoPorNos.delete(el);
    aAquecer.delete(el);
    aTocar.add(el);
    if (!podeTocar() || aEsperaDaCortina(el)) return;
    const p = el.play();
    p?.catch((e: unknown) => {
      const nome = (e as { name?: string })?.name;
      if (nome === "NotAllowedError") {
        // Recusado o take à vista: espera-se pelo toque. Recusado o SEGUINTE a
        // meio de uma passagem: desiste-se dela, e o que está à vista continua.
        if (el === videos[atual] && !aPassar) esperarPorGesto();
        else if (aPassar && el === videos[proximo()]) cancelarPassagem();
      }
      // AbortError (um `pause()` a meio do arranque) e erros de rede: o vigia
      // volta a tentar no segundo seguinte.
    });
  }

  function pararTudo() {
    for (const el of aTocar) pausar(el);
  }
  function retomar() {
    if (!vivo || !podeTocar()) return;
    for (const el of aTocar) tocar(el);
  }

  /**
   * Ao regressar (de outra aplicação, de um aviso do sistema): retoma, e
   * meio segundo depois confirma que a imagem anda. Se não anda e o vídeo
   * tem dados, o descodificador ficou preso — um salto para o mesmo
   * instante solta-o.
   */
  function retomarEConfirmar() {
    retomar();
    const el = videos[atual];
    const antes = el.currentTime;
    depois(500, () => {
      if (!podeTocar() || aEsperarGesto || el !== videos[atual] || aPassar) return;
      if (aEsperaDaCortina(el)) return;
      if (el.paused) tocar(el);
      else if (el.currentTime === antes && el.readyState >= 2) {
        el.currentTime = antes;
        tocar(el);
      }
    });
  }

  /** Falta pouco para o fim do take à vista: é hora de aquecer o seguinte. */
  const pertoDoFim = () => {
    const el = videos[atual];
    const d = el.duration;
    return !Number.isFinite(d) || d <= 0 || d - el.currentTime <= AQUECER_ANTES_S;
  };

  /**
   * Aquece o clip `i`: põe-lhe a fonte e toca-o escondido até ter o 1.º
   * fotograma pronto, e pára-o no início. É o único jeito de o iPhone o
   * preparar — ignora o `preload` de um vídeo que ninguém mandou tocar.
   */
  function aquecer(i: number) {
    const src = fonte[i];
    if (aquecido[i] || !src) return;
    aquecido[i] = true;
    marcar("aquecer", i);
    const el = videos[i];
    el.preload = "auto";
    el.src = src;
    el.load();
    const ficaPronto = () => {
      if (!vivo || pronto[i]) return;
      pronto[i] = true;
      if (aAquecer.has(el)) {
        aAquecer.delete(el);
        pausar(el);
        el.currentTime = 0;
      }
      prepararOQueVem();
    };
    ouvir(el, "canplaythrough", ficaPronto, true);
    aAquecer.add(el);
    el.play()?.catch(() => undefined);
  }

  /** Aquece o próximo da fila se já tiver fonte e for a altura. */
  function aquecerSeForHora() {
    const i = proximo();
    if (aquecido[i] || !fonte[i]) return;
    // Da rede: aquece-se logo (precisa de tempo para descarregar o início).
    // Da memória: só perto do fim do take à vista (ver o cabeçalho).
    if (!daMemoria[i] || pertoDoFim()) aquecer(i);
  }

  /**
   * Prepara o clip `i`: descarrega-o INTEIRO para a memória e, quando chega,
   * passa ao seguinte da fila. Se o browser não deixar descarregar assim,
   * fica com o endereço da rede e aquece-se logo (o caminho antigo).
   */
  function preparar(i: number) {
    if (i >= NUMERO_DE_VIDEOS || pedido[i]) return;
    pedido[i] = true;
    const endereco = enderecoDe(i);
    const daRede = () => {
      if (!vivo) return;
      fonte[i] = endereco;
      daMemoria[i] = false;
      aquecer(i);
    };
    if (!podeDescarregar) {
      daRede();
      return;
    }
    const corte = new AbortController();
    limpar.push(() => corte.abort());
    fetch(endereco, { signal: corte.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (!vivo) return;
        const u = URL.createObjectURL(b);
        naMemoria.push(u);
        origemDoBlob.set(u, endereco);
        fonte[i] = u;
        daMemoria[i] = true;
        aquecerSeForHora();
        prepararOQueVem();
      })
      .catch(() => {
        if (!vivo) return;
        daRede();
        prepararOQueVem();
      });
  }

  /**
   * ── O TAKE DE ABERTURA TAMBÉM PASSA PARA A MEMÓRIA ──────────────────────
   * Era o único que tocava sempre da rede: na primeira volta (não há outro
   * jeito de começar depressa) e também nas seguintes — e o iPhone deita fora
   * o que guardou dele, por isso cada volta voltava a depender do 4G. Quando
   * os outros já estão na memória, pede-se uma cópia inteira (o ficheiro tem
   * cache de um ano: quase sempre vem da cache do browser), e na volta
   * seguinte toca essa. Se arrancou na versão leve, a cópia é já a normal.
   */
  const abertura = atual;
  let aberturaPedida = false;
  let aberturaNaMemoria = false;
  function guardarAbertura() {
    if (aberturaPedida || !podeDescarregar) return;
    aberturaPedida = true;
    const endereco = enderecoDe(abertura);
    const corte = new AbortController();
    limpar.push(() => corte.abort());
    fetch(endereco, { signal: corte.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (!vivo) return;
        const u = URL.createObjectURL(b);
        naMemoria.push(u);
        origemDoBlob.set(u, endereco);
        fonte[abertura] = u;
        daMemoria[abertura] = true;
        passarAberturaParaAMemoria();
      })
      .catch(() => undefined); // fica a tocar da rede, como antes
  }
  /** Troca a fonte do take de abertura pela cópia na memória — fora da vista. */
  function passarAberturaParaAMemoria() {
    if (aberturaNaMemoria || !daMemoria[abertura] || !fonte[abertura]) return;
    const el = videos[abertura];
    if (el === videos[atual] || aTocar.has(el) || aAquecer.has(el)) return; // espera pela passagem
    aberturaNaMemoria = true;
    for (const f of [...el.querySelectorAll("source")]) f.remove();
    el.removeAttribute("data-leve");
    // O `aquecer` põe-lhe a fonte nova perto da sua vez, como aos outros.
    aquecido[abertura] = false;
    pronto[abertura] = false;
    aquecerSeForHora();
  }

  /** Prepara o primeiro da fila que ainda não foi pedido (um de cada vez). */
  function prepararOQueVem() {
    if (!decidido || !inicioAssente || !seguintesLivres) return;
    // No computador só o que vem a seguir; o depois desse prepara-se na
    // passagem (o `subir` volta a chamar isto).
    for (const i of computador ? fila.slice(0, 1) : fila) {
      if (i === abertura) continue; // tem o seu caminho (`guardarAbertura`)
      if (!pedido[i]) {
        preparar(i);
        return;
      }
      // Ainda a chegar: o seguinte espera (um de cada vez, para não dividir
      // a rede). Da rede, espera-se que esteja pronto a tocar.
      if (!fonte[i]) return;
      if (!daMemoria[i] && !pronto[i] && videos[i].readyState < 4) return;
    }
    // Os outros já estão (ou estão a chegar da memória): agora a abertura.
    guardarAbertura();
  }

  /** Pôr o vídeo `el` à vista, por cima dos outros. */
  const mostrar = (el: HTMLVideoElement) => {
    el.style.zIndex = "2";
    el.style.opacity = "1";
    tirarImagem();
  };

  /** O seguinte da fila pode arrancar já (da memória, ou com dados). */
  const seguintePronto = () => {
    const i = proximo();
    return pronto[i] || videos[i].readyState >= 3;
  };

  /** O máximo que uma passagem espera pelo fim do que sai (o início dela, em condições normais). */
  const ESPERA_MAX_S = PASSAGEM_MS / 1000 + ARRANQUE_S;

  /** A fonte da rede do take `i` (quando a da memória não serve). */
  const daRedeDe = (i: number) => enderecoDe(i);

  /**
   * Refaz o take `i` do zero: larga o que tinha carregado e volta a ser
   * aquecido (da memória, ou da rede) quando for a sua vez.
   */
  function refazer(i: number) {
    marcar("refazer", i);
    const el = videos[i];
    pausar(el);
    aTocar.delete(el);
    aAquecer.delete(el);
    el.style.opacity = "0";
    el.style.zIndex = "0";
    pronto[i] = false;
    aquecido[i] = false;
    if (!fonte[i]) {
      // Ainda com as `<source>` do HTML: passa a ter uma fonte sua (a da rede).
      for (const f of [...el.querySelectorAll("source")]) f.remove();
      fonte[i] = daRedeDe(i);
      daMemoria[i] = false;
    }
    el.removeAttribute("src");
    el.load();
  }

  /**
   * O seguinte não arrancou (ver `PASSAGEM_PRESA_MS`): desiste-se da
   * passagem. O que está à vista continua a tocar, em repetição, e o seguinte
   * é refeito para a volta seguinte.
   */
  function cancelarPassagem() {
    if (!aPassar || !passagem || passagem.subiu) return;
    marcar("cancelar", proximo());
    const velho = videos[atual];
    aPassar = false;
    passagem = null;
    refazer(proximo());
    velho.loop = true;
    velho.style.opacity = "1";
    if (velho.ended || velho.paused) {
      if (velho.ended) velho.currentTime = 0;
      tocar(velho);
    }
    ultimoTempo = -1;
    paradoDesde = 0;
    aquecerSeForHora();
  }

  const passar = () => {
    if (aPassar) return;
    const velho = videos[atual];
    const seguinte = proximo();
    const novo = videos[seguinte];
    // Ainda não chegou (rede lenta)? Este repete-se em vez de parar, e a
    // passagem tenta-se outra vez na próxima volta.
    if (!pronto[seguinte] && novo.readyState < 3) {
      velho.loop = true;
      if (fonte[seguinte]) aquecer(seguinte);
      else preparar(seguinte);
      return;
    }
    aPassar = true;
    marcar("passar", seguinte);
    // ── O QUE SAI NUNCA FICA PARADO NO FIM ───────────────────────────────
    // Ela (16/10, iPhone, depois do #243): «continua a parar» — «pára um
    // bocadinho» ao mudar de vídeo. Era a rede de segurança do #243: o
    // seguinte atrasava-se, o que sai chegava ao fim e ficava 0,4 s no último
    // fotograma antes de a passagem desistir (MEDIDO: 0,43–0,45 s, uma vez
    // por volta). Agora, enquanto espera pelo seguinte, o que sai REPETE-SE:
    // se o seguinte se atrasar, continua a andar (volta ao início) em vez de
    // congelar. Só deixa de repetir quando o seguinte já sobe por cima.
    velho.loop = true;
    // O prazo: o que falta ao que sai (normalmente ~1,5 s), mas nunca mais do
    // que isso — numa passagem forçada a meio (o vigia, sem dados) o que sai
    // está parado, e o resto dele não passa.
    const resto = velho.duration - velho.currentTime;
    const espera = Number.isFinite(resto) ? Math.min(Math.max(0, resto), ESPERA_MAX_S) : 0;
    const esta = {
      limite: performance.now() + espera * 1000 + PASSAGEM_PRESA_MS,
      subiu: false,
    };
    passagem = esta;
    const subir = () => {
      if (!vivo || esta.subiu || passagem !== esta) return;
      esta.subiu = true;
      marcar("subir", seguinte);
      velho.loop = false;
      novo.loop = false;
      velho.style.zIndex = "1";
      // Arrancou tarde (descodificador a acordar, CPU ocupada)? A subida
      // encolhe para acabar antes de o que sai chegar ao fim — um fotograma
      // parado por baixo do que entra é o que se vê como «parou».
      const sobe = duracaoDaSubida(velho.duration - velho.currentTime);
      novo.style.transitionDuration = `${sobe}ms`;
      mostrar(novo);
      const t = setTimeout(() => {
        if (!vivo) return;
        novo.style.transitionDuration = "";
        aTocar.delete(velho);
        velho.style.opacity = "0";
        velho.style.zIndex = "0";
        // ── O QUE SAIU NÃO LEVA PAUSA NEM SALTO PARA O 0 ─────────────────────
        // O registo do iPhone dela (17/10, já com o destravar): a imagem do que
        // está à vista prendia ~0,2 s depois de o motor pausar o que saiu e
        // lhe pôr o tempo a 0 — os dois a pedir ao mesmo descodificador. Agora,
        // perto do fim (o caso normal), o que saiu acaba sozinho, escondido; o
        // `passar` põe-no no 0 antes de o voltar a tocar, na vez dele. Só uma
        // passagem forçada a meio (o vigia) ainda o pausa — mas sem salto.
        const falta = velho.duration - velho.currentTime;
        if (!(Number.isFinite(falta) && falta <= DEIXAR_ACABAR_S)) pausar(velho);
        atual = seguinte;
        passagem = null;
        // O take de abertura tocava da rede; se a cópia na memória já
        // chegou, as voltas seguintes tocam-na (ver `guardarAbertura`).
        passarAberturaParaAMemoria();
        // O que saiu fica carregado (pausado no início). O #243 largava-lhe o
        // ficheiro aqui — e é exactamente neste instante que, no iPhone, a
        // imagem do que está à vista ficava presa 8 a 10 s (o registo, 17/10).
        fila.shift();
        encherFila();
        aPassar = false;
        ultimoTempo = -1;
        prepararOQueVem();
        aquecerSeForHora();
      }, sobe + 50);
      limpar.push(() => clearTimeout(t));
    };
    ouvir(novo, "playing", subir, true);
    // Rede de segurança: o que sai chegou ao fim e o novo ainda não avisou que
    // anda (o aviso pode chegar atrasado com a CPU ocupada). Se já tem imagem,
    // sobe já — um fotograma parado à vista é pior do que uma subida curta.
    ouvir(
      velho,
      "ended",
      () => {
        if (passagem !== esta) return;
        // Só se ANDA (o tempo saiu do 0 onde a passagem o pôs): ter imagem não
        // chega — um seguinte com imagem mas parado, posto à vista, era o
        // vídeo parado de vez (MEDIDO: 12 s seguidos, com o seguinte a nunca
        // arrancar).
        if (novo.readyState >= 2 && novo.currentTime > 0) {
          subir();
          return;
        }
        // Sem imagem do seguinte: mais `PASSAGEM_PRESA_MS` e desiste-se.
        esta.limite = Math.min(esta.limite, performance.now() + PASSAGEM_PRESA_MS);
        depois(PASSAGEM_PRESA_MS, () => {
          if (passagem === esta && !esta.subiu) cancelarPassagem();
        });
      },
      true,
    );
    // O prazo, por relógio: com o que sai em repetição o `ended` não chega.
    // Se o seguinte já anda (o tempo saiu do 0), sobe; senão desiste-se.
    depois(espera * 1000 + PASSAGEM_PRESA_MS, () => {
      if (passagem !== esta || esta.subiu) return;
      if (novo.readyState >= 2 && novo.currentTime > 0) subir();
      else cancelarPassagem();
    });
    novo.currentTime = 0;
    tocar(novo);
  };

  for (const el of videos) {
    ouvir(el, "timeupdate", () => {
      if (el !== videos[atual] || aPassar) return;
      if (eHoraDePassar(el.currentTime, el.duration)) passar();
      else aquecerSeForHora();
    });
    // Parado sem ter sido por nós: foi o sistema (uma notificação, o aviso
    // da bateria, uma chamada). Volta logo, e insiste aos 0,3 s e a 1 s.
    ouvir(el, "pause", () => {
      if (pausadoPorNos.has(el)) {
        pausadoPorNos.delete(el);
        return;
      }
      if (!vivo || el.ended || !podeTocar() || aEsperarGesto || aEsperaDaCortina(el)) return;
      if (aAquecer.has(el)) {
        el.play()?.catch(() => undefined);
        return;
      }
      if (!aTocar.has(el)) return;
      tocar(el);
      for (const ms of [300, 1000]) {
        depois(ms, () => {
          if (el.paused && !el.ended && aTocar.has(el) && podeTocar() && !aEsperarGesto) {
            tocar(el);
          }
        });
      }
    });
    // ── SEM DADOS: SALTA PARA UM TAKE QUE JÁ ESTÁ NA MEMÓRIA ───────────────
    // A rede não chegou a tempo (`waiting`). Esperar por ela era ficar parado
    // o tempo que levasse — à vista. Se o seguinte já está na memória e pronto,
    // passa-se para ele ao fim de `SALTAR_SEM_DADOS_MS`; o que parou continua a
    // descarregar e volta na sua vez.
    ouvir(el, "waiting", () => {
      if (el !== videos[atual] || !mostrado) return;
      const t = el.currentTime;
      depois(SALTAR_SEM_DADOS_MS, () => {
        if (el !== videos[atual] || aPassar || !podeTocar() || aEsperarGesto) return;
        if (el.currentTime !== t || el.readyState >= 3) return; // já anda
        if (seguintePronto()) passar();
      });
    });
    // Um erro (descodificação, ou o iPhone a recuperar memória): nunca fica
    // ninguém preso. O que vinha da memória passa a tocar da rede.
    ouvir(el, "error", () => {
      if (!vivo) return;
      const i = videos.indexOf(el);
      marcar("erro", i);
      if (!fonte[i]) return; // as `<source>` do HTML: o browser tenta as outras
      if (daMemoria[i]) {
        const u = fonte[i];
        fonte[i] = daRedeDe(i);
        daMemoria[i] = false;
        if (u) URL.revokeObjectURL(u);
      }
      if (aPassar && i === proximo()) {
        cancelarPassagem();
        return;
      }
      if (i === atual && !aPassar) {
        const t = el.currentTime;
        el.src = fonte[i] ?? daRedeDe(i);
        el.load();
        ouvir(el, "loadedmetadata", () => void (el.currentTime = t), true);
        tocar(el);
        return;
      }
      if (i !== atual) {
        refazer(i);
        aquecerSeForHora();
      }
    });
    // Depois de uma recusa (escondidos), o take à vista volta quando anda.
    ouvir(el, "playing", () => {
      if (el === videos[atual] && aEsperarGesto && !el.paused) {
        // Voltou a andar sem toque (a poupança foi desligada): já não se espera.
        aEsperarGesto = false;
        largarGestos();
      }
      if (el !== videos[atual] || aPassar || mostrado || el.style.opacity !== "0") return;
      if (aEsperaDaCortina(el)) return;
      mostrado = true;
      mostrar(el);
      verSeChegou(); // a preparação dos seguintes espera por isto
    });
    // Rede de segurança: se o `timeupdate` da recta final se perder.
    ouvir(el, "ended", () => {
      if (el !== videos[atual]) return;
      passar();
      if (!aPassar) {
        el.currentTime = 0;
        tocar(el);
      }
    });
  }

  // O take de entrada sobe por cima da fotografia quando JÁ está a tocar —
  // pode já estar, se começou antes de o JavaScript chegar. (`mostrado` é
  // declarado lá em cima, com o resto do estado.)
  // A preparação dos seguintes só começa quando o de entrada já chegou
  // INTEIRO. MEDIDO num 4G fraco (5 Mbit/s): começar logo que ele tinha
  // «dados para seguir» punha os dois a dividir a rede, e o take à vista
  // parava três vezes no primeiro segundo e meio. Numa rede tão lenta que ele
  // nunca chega inteiro antes do fim, o take repete-se (sem parar) e o
  // seguinte prepara-se nessa volta — porque, tocado até ao fim, chegou todo.
  let inicioAssente = false;

  // ── OS SEGUINTES ESPERAM QUE O DE ENTRADA ANDE (decisão dela, 22/10) ─────
  // Chegado inteiro não chegava: numa rede boa o de entrada está todo cá ao
  // fim de 1 a 2 s, e os seguintes (~2,4 MB ao alto) eram pedidos logo a
  // seguir — MEDIDO no Chromium a 12 Mbit/s, 390×844: aos 4,1–5,2 s, com o de
  // entrada à vista há dois ou três segundos e a página ainda a montar-se.
  // Agora, além de inteiro, o de entrada tem de ter andado
  // `SEGUINTES_DEPOIS_DE_S` À VISTA (o tempo do vídeo: se encravar, a conta
  // pára com ele), e o pedido sai num instante em que o browser esteja livre
  // (`requestIdleCallback`, no máximo `OCIOSO_MAX_MS`). Aconteça o que
  // acontecer, há um PRAZO (`prazoDosSeguintesMs`), contado do instante em que
  // o de entrada ficou à vista: a floresta (18,4 s) espera no máximo 6,4 s; os
  // takes curtos não esperam nada. MEDIDO depois, nas mesmas condições: os
  // seguintes pedidos aos 7,0–7,1 s (nada deles nos primeiros 5 s, contra
  // até 0,6 MB antes; aos 10 s já cá estão os 2,4 MB, como antes), e as
  // passagens sem imagem parada: em duas voltas de 65 s, seis passagens cada,
  // nenhum intervalo entre fotogramas acima de 150 ms. O prazo é de relógio,
  // e não do vídeo, de
  // propósito: com a página fora do ecrã o vídeo pára, mas os downloads
  // continuam (ver `ligado`), para estarem prontos quando ela voltar.
  //
  // Esta espera só ACRESCENTA a condição de cima (inteiro e à vista): numa
  // rede lenta, em que o de entrada chega tarde, não se começa mais cedo do
  // que antes. E fica fora dela, como estava, quem já anda no limite: a
  // versão leve (rede fraca medida no arranque), a ligação que se diz lenta
  // ou com «Poupar dados» (`ligacaoLenta`), e o «reduzir movimento» — nesses o
  // seguinte começa a descarregar quando o de entrada chegou inteiro, como
  // até 22/10.
  //
  // O que esta espera nunca atrasa: uma passagem que chega e o seguinte ainda
  // não pedido (o `passar` pede-o logo, e o que está à vista repete-se).
  let seguintesLivres = false;
  let esperaArmada = false;
  let ociosoPedido = false;
  const libertarSeguintes = () => {
    if (!vivo || seguintesLivres) return;
    seguintesLivres = true;
    prepararOQueVem();
  };
  /** Quem anda no limite da rede não espera (ver acima): fica como antes de 22/10. */
  const semEsperaDosSeguintes = () =>
    primeiro.hasAttribute("data-leve") ||
    ligacaoLenta((navigator as ComLigacao).connection) ||
    (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
  /** Pede `fn` para um instante em que o browser esteja livre (o Safari não tem o pedido: logo a seguir). */
  const quandoLivre = (fn: () => void) => {
    if (typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(
        () => {
          if (vivo) fn();
        },
        { timeout: OCIOSO_MAX_MS },
      );
      limpar.push(() => cancelIdleCallback(id));
    } else {
      depois(0, fn);
    }
  };
  /** O de entrada já andou o bastante à vista: os seguintes saem no próximo instante livre. */
  const verFolga = () => {
    if (!esperaArmada || seguintesLivres || ociosoPedido) return;
    if (!(primeiro.currentTime >= SEGUINTES_DEPOIS_DE_S)) return;
    ociosoPedido = true;
    quandoLivre(libertarSeguintes);
  };
  /** O de entrada acabou de ficar à vista a andar: começa a contar a espera, e o prazo. */
  const armarSeguintes = () => {
    if (esperaArmada) return;
    esperaArmada = true;
    const prazo = semEsperaDosSeguintes() ? 0 : prazoDosSeguintesMs(primeiro.duration);
    if (prazo <= 0) libertarSeguintes();
    else depois(prazo, libertarSeguintes);
  };

  const assentar = () => {
    if (!vivo || inicioAssente) return;
    inicioAssente = true;
    prepararOQueVem();
  };
  const chegouInteiro = () => {
    const d = primeiro.duration;
    const b = primeiro.buffered;
    if (!Number.isFinite(d) || d <= 0 || !b) return false;
    for (let k = 0; k < b.length; k++) {
      if (b.start(k) <= primeiro.currentTime + 0.5 && b.end(k) >= d - 0.3) return true;
    }
    return false;
  };
  const verSeChegou = () => {
    if (!mostrado) return;
    armarSeguintes();
    verFolga();
    if (chegouInteiro()) assentar();
  };
  const mostrarPrimeiro = () => {
    if (!vivo || mostrado) return;
    mostrado = true;
    mostrar(primeiro);
    verSeChegou();
  };
  ouvir(primeiro, "canplaythrough", () => {
    pronto[atual] = true;
    verSeChegou();
  });
  // O guião do HTML larga o take de entrada quando ele tem reserva (ou com o
  // pano); daí em diante é este motor que o toca — e que trata de uma recusa
  // do aparelho (poupança de bateria) esperando pelo primeiro toque.
  if (aEsperaDaCortina(primeiro)) {
    const mo = new MutationObserver(() => {
      if (aEsperaDaCortina(primeiro)) return;
      mo.disconnect();
      tocar(primeiro);
    });
    mo.observe(primeiro, { attributes: true, attributeFilter: ["data-a-espera"] });
    limpar.push(() => mo.disconnect());
  }
  ouvir(primeiro, "progress", verSeChegou);
  ouvir(primeiro, "timeupdate", verSeChegou);
  // SÓ QUANDO ANDA. Era mostrado parado no 1.º fotograma (à espera de reserva
  // ou da cortina) — e um vídeo parado à vista é onde o iPhone, com a poupança
  // de energia, desenha o botão ▶. A fotografia por baixo é esse mesmo
  // fotograma da floresta: esperar que ande não se vê.
  const seAnda = () => {
    if (!primeiro.paused && !aEsperaDaCortina(primeiro)) mostrarPrimeiro();
  };
  ouvir(primeiro, "playing", seAnda);
  ouvir(primeiro, "timeupdate", seAnda);
  seAnda();
  tocar(primeiro);

  // O aparelho é perguntado que formato descodifica no chip, para os vídeos
  // seguintes (o de entrada já vai no que o browser escolheu das `<source>`).
  const decidir = (f: Formato | null, grande = false) => {
    if (!vivo || decidido) return;
    if (f) formato = f;
    if (nivel >= 2) formato = "mp4";
    grandeConfirmada = grande && nivel === 0;
    decidido = true;
    prepararOQueVem();
  };
  const pergunta = perguntaDoNavegador();
  const querGrande = varianteParaOEcra(ecraDeAgora(), 1) === "grande";
  melhorFormato(
    podeTocarTipo,
    pergunta,
    varianteParaOEcra(ecraDeAgora(), 1),
    // O HEVC sem perguntar é para o iPhone; o Safari de um Mac pergunta, como
    // os outros computadores (um Mac Intel descodifica-o no processador).
    !computador && typeof navigator !== "undefined" && /Apple/.test(navigator.vendor || ""),
  )
    .then(async (f) => {
      const grande = querGrande && (await grandeVale(pergunta, f ?? formato));
      decidir(f, grande);
    })
    .catch(() => decidir(null));
  depois(1000, () => decidir(null));

  /**
   * ── O APARELHO NÃO AGUENTA: UM DEGRAU ABAIXO, COMO O YOUTUBE ────────────
   * Ver `enderecoLeveDeitado`. Primeiro sai a grande (2560), se era ela; se a
   * de 1920 também perde fotogramas, a leve (1280). Os takes ainda por tocar
   * descem já; o que está à vista também, mas só se estiver mesmo mau (`ja`)
   * — trocá-lo custa um instante parado no mesmo ponto, e isso só compensa a
   * quem está a perder um em cada cinco fotogramas. O degrau fica guardado
   * no browser uma semana, para a próxima entrada já começar nele.
   */
  let semMedirAte = -1; // o take que estava à vista quando se desceu sem o trocar
  function aliviar(motivo: string, ja: boolean) {
    if (nivel >= 2 || !vivo) return;
    const novo = nivel === 0 && grandeConfirmada ? 1 : 2;
    if (novo === 2 && !podeTocarTipo(tipoDoFormato("mp4"))) return; // a leve é só H.264
    nivel = novo;
    grandeConfirmada = false;
    if (nivel === 2) formato = "mp4";
    marcar(`aliviar-${nivel}`, atual);
    try {
      localStorage.setItem(nivel === 2 ? CHAVE_DO_ALIVIO : CHAVE_SEM_GRANDE, String(Date.now()));
    } catch {
      // janela privada: fica só para esta visita
    }
    for (let i = 0; i < videos.length; i++) {
      if (variante(i) === "retrato" || i === atual) continue;
      reapontar(i);
    }
    if (ja && !aPassar && variante(atual) !== "retrato") {
      reapontar(atual);
      medirDesde = performance.now() + ALIVIAR_DEPOIS_DE_MS;
    } else {
      semMedirAte = atual;
    }
    aquecerSeForHora();
  }

  /**
   * Põe o take `i` no endereço que lhe cabe agora (`enderecoDe`): a versão do
   * ecrã e o degrau de agora. O que está à vista troca no mesmo ponto; os
   * outros são refeitos e voltam a ser preparados na sua vez. Um take ainda
   * não pedido não precisa de nada: já sai no endereço certo.
   */
  function reapontar(i: number) {
    const el = videos[i];
    if (aPassar && i === proximo()) return; // a meio da subida: fica para a próxima
    if (!pedido[i] && !fonte[i] && !el.querySelector("source")) return;
    if (daMemoria[i] && fonte[i]) URL.revokeObjectURL(fonte[i]!);
    fonte[i] = enderecoDe(i);
    daMemoria[i] = false;
    pedido[i] = true;
    if (i === atual) {
      if (aPassar) return;
      const t = el.currentTime;
      for (const f of [...el.querySelectorAll("source")]) f.remove();
      el.removeAttribute("data-leve");
      el.src = fonte[i]!;
      el.load();
      ouvir(el, "loadedmetadata", () => void (el.currentTime = t), true);
      tocar(el);
      return;
    }
    if (el.getAttribute("src") || el.querySelector("source")) refazer(i);
  }

  /**
   * ── O ECRÃ RODOU: CADA TAKE NA VERSÃO DO ECRÃ NOVO ──────────────────────
   * Ela (29/10): pôs o computador em «modo telemóvel» e voltou ao «modo PC» —
   * e o vídeo ficou «ampliado, super desfocado». Era a versão AO ALTO (1080 de
   * largura, para um ecrã de telemóvel) esticada a um ecrã deitado: a escolha
   * fazia-se uma vez, ao preparar cada take, e nunca mais. O mesmo acontece a
   * quem roda um tablet ou um telemóvel. Agora, quando o ecrã passa de ao alto
   * a deitado (ou o contrário), cada take que já tinha fonte troca para a
   * versão certa — o que está à vista, no mesmo ponto.
   */
  const aoAltoDoEndereco = (src: string) => /-retrato/.test(origemDoBlob.get(src) ?? src);
  function reorientar() {
    if (!vivo) return;
    for (let i = 0; i < videos.length; i++) {
      const el = videos[i];
      const src = fonte[i] ?? el.currentSrc;
      if (!src) continue;
      const querAoAlto = variante(i) === "retrato";
      if (aoAltoDoEndereco(src) !== querAoAlto) reapontar(i);
    }
    aquecerSeForHora();
  }
  if (typeof matchMedia === "function") {
    const mq = matchMedia("(orientation: portrait)");
    if (mq && typeof mq.addEventListener === "function") {
      let espera = 0;
      const aoRodar = () => {
        window.clearTimeout(espera);
        // Espera que o redimensionar assente (o rodar dispara vários).
        espera = window.setTimeout(reorientar, 300);
      };
      mq.addEventListener("change", aoRodar);
      limpar.push(() => {
        mq.removeEventListener("change", aoRodar);
        window.clearTimeout(espera);
      });
    }
  }

  /** Os fotogramas do take à vista desde a última conta (ver `deveAliviar`). */
  const contados = new WeakMap<HTMLVideoElement, { total: number; perdidos: number }>();
  let janela = { total: 0, perdidos: 0 };
  // Os primeiros segundos não contam: a página ainda se está a montar, e um
  // computador capaz também perde fotogramas aí.
  let medirDesde = performance.now() + ALIVIAR_DEPOIS_DE_MS;
  function medirFotogramas(el: HTMLVideoElement) {
    if (nivel >= 2 || aPassar || el.paused || typeof el.getVideoPlaybackQuality !== "function")
      return;
    if (variante(atual) === "retrato" || performance.now() < medirDesde) return;
    // Desceu-se sem trocar o que está à vista: só conta o take seguinte, que
    // já vem no degrau novo.
    if (atual === semMedirAte) return;
    const q = el.getVideoPlaybackQuality();
    const antes = contados.get(el);
    contados.set(el, { total: q.totalVideoFrames, perdidos: q.droppedVideoFrames });
    if (!antes || q.totalVideoFrames < antes.total) return; // outro ficheiro: recomeça
    janela = {
      total: janela.total + q.totalVideoFrames - antes.total,
      perdidos: janela.perdidos + q.droppedVideoFrames - antes.perdidos,
    };
    if (janela.total < ALIVIAR_MIN_FOTOGRAMAS) return;
    if (deveAliviar(janela.total, janela.perdidos)) {
      aliviar("perdidos", janela.perdidos / janela.total > ALIVIAR_JA);
    }
    janela = { total: 0, perdidos: 0 };
  }

  // ── O vigia ─────────────────────────────────────────────────────────────
  let ultimaTentativa = 0;
  const vigiar = () => {
    if (!vivo || !podeTocar()) {
      paradoDesde = 0;
      return;
    }
    // À espera de um toque (o aparelho recusa): o vigia não se desliga — de
    // `TENTAR_DE_NOVO_MS` em `TENTAR_DE_NOVO_MS` tenta outra vez, em silêncio.
    // Se a poupança for desligada, o vídeo volta sozinho.
    if (aEsperarGesto) {
      paradoDesde = 0;
      const agora = performance.now();
      if (agora - ultimaTentativa >= TENTAR_DE_NOVO_MS) {
        ultimaTentativa = agora;
        tocar(videos[atual]);
      }
      return;
    }
    const el = videos[atual];
    if (aEsperaDaCortina(el)) {
      paradoDesde = 0;
      return;
    }
    medirFotogramas(el);
    // Parado pelo browser (não por nós): volta a tocar.
    if (el.paused && !el.ended) tocar(el);
    // A andar mas escondido (depois de uma recusa que afinal não parou nada):
    // volta à vista — nunca um vídeo a tocar por baixo da fotografia.
    if (!mostrado && !aPassar && !el.paused && el.currentTime !== ultimoTempo) {
      mostrado = true;
      mostrar(el);
      verSeChegou();
    }
    // A meio de uma passagem, quem tem de andar é o seguinte — e se passou o
    // prazo sem ele arrancar, desiste-se (ver `cancelarPassagem`).
    if (aPassar) {
      if (passagem && !passagem.subiu && performance.now() > passagem.limite) {
        cancelarPassagem();
        return;
      }
      const novo = videos[proximo()];
      if (novo.paused) tocar(novo);
      return;
    }
    const t = el.currentTime;
    if (t !== ultimoTempo) {
      ultimoTempo = t;
      paradoDesde = 0;
      return;
    }
    const agora = performance.now();
    if (!paradoDesde) {
      paradoDesde = agora;
      return;
    }
    if (agora - paradoDesde < ENCRAVADO_MS) return;
    paradoDesde = 0;
    // O seguinte está pronto: segue-se para ele — mesmo que este ainda esteja
    // a descarregar. Ficar à espera da rede era ficar parado à vista.
    if (mostrado && seguintePronto()) {
      passar();
      return;
    }
    // Sem para onde ir, e ainda a descarregar numa rede lenta: recarregar
    // deitava fora o que já chegou. Espera-se.
    if (el.networkState === el.NETWORK_LOADING && el.readyState < 3) return;
    // Recarrega este no mesmo ponto (o de entrada volta a tentar as suas
    // fontes; os outros a sua, da memória ou da rede).
    recarregarNoMesmoPonto(el, t);
  };

  /** Recarrega o take à vista no instante `t` (o de entrada volta às suas fontes). */
  function recarregarNoMesmoPonto(el: HTMLVideoElement, t: number) {
    marcar("recarregar", atual);
    if (el === primeiro && !fonte[atual]) el.load();
    else {
      el.src = fonte[atual] ?? enderecoDe(atual);
      el.load();
    }
    ouvir(el, "loadedmetadata", () => void (el.currentTime = t), true);
    tocar(el);
  }
  // ── O registo: os acontecimentos do vídeo, cada fotograma pintado do que
  // está à vista, e as paragens (de 250 em 250 ms). ─────────────────────────
  /** O estado do vídeo à vista, para a paragem que abre agora. */
  const estadoDoVideo = (): EstadoDoVideo => {
    const el = videos[atual];
    const src = el.currentSrc || el.getAttribute("src") || "";
    const b = el.buffered;
    let aFrente = 0;
    for (let k = 0; b && k < b.length; k++) {
      if (b.start(k) <= el.currentTime + 0.05 && b.end(k) >= el.currentTime) {
        aFrente = b.end(k) - el.currentTime;
      }
    }
    const blob = src.startsWith("blob:");
    return {
      take: atual,
      ct: el.currentTime,
      dur: Number.isFinite(el.duration) ? el.duration : null,
      rs: el.readyState,
      ns: el.networkState,
      paused: el.paused,
      ended: el.ended,
      fonte: blob
        ? "blob"
        : el.getAttribute("src")
          ? "rede"
          : el.querySelector("source")
            ? "source"
            : "nenhuma",
      // Da memória (`blob:`), o formato é o que o motor escolheu para os seguintes.
      formato: blob ? formato : formatoDoSrc(src),
      leve: el.hasAttribute("data-leve"),
      aPassar,
      aFrente,
    };
  };
  /** O browser diz quando pinta cada fotograma (iPhone desde o iOS 15.4, Chrome). */
  let comFotogramasFinos = false;
  /** A hora do último fotograma pintado do vídeo à vista (`null`: ainda não conta). */
  let ultimoFotograma: number | null = null;
  for (const el of videos) {
    const doVideoAVista = () => el === videos[atual] && el.style.opacity !== "0";
    const comFotogramas = el as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: () => void) => number;
    };
    if (typeof comFotogramas.requestVideoFrameCallback === "function") {
      comFotogramasFinos = true;
      const cb = () => {
        if (!vivo) return;
        if (doVideoAVista()) {
          ultimoFotograma = performance.now();
          registo?.fotograma();
        }
        comFotogramas.requestVideoFrameCallback?.(cb);
      };
      comFotogramas.requestVideoFrameCallback(cb);
    }
  }
  if (registo) {
    for (const el of videos) {
      for (const k of ["waiting", "stalled", "pause", "playing"] as const) {
        ouvir(el, k, () => marcar(k, videos.indexOf(el)));
      }
      const doVideoAVista = () => el === videos[atual] && el.style.opacity !== "0";
      if (!comFotogramasFinos) {
        // Sem fotogramas finos: o tempo a avançar conta como fotograma.
        let ultimo = -1;
        ouvir(el, "timeupdate", () => {
          if (!doVideoAVista() || el.currentTime === ultimo) return;
          ultimo = el.currentTime;
          registo.fotograma();
        });
      }
    }
  }
  let relogioDoRegisto = 0;
  /** O vídeo à vista devia estar a pintar imagens. */
  const deviaAndar = () =>
    podeTocar() &&
    !aEsperarGesto &&
    mostrado &&
    document.visibilityState === "visible" &&
    !aEsperaDaCortina(videos[atual]);
  const verificarRegisto = () => {
    if (!vivo) return;
    verImagem();
    registo?.verificar(deviaAndar(), estadoDoVideo);
  };

  // ── DESTRAVAR A IMAGEM PRESA (ver `IMAGEM_PRESA_MS`) ────────────────────
  // Sem fotograma pintado há mais de `IMAGEM_PRESA_MS`, com o vídeo à vista a
  // dever andar: (1) um salto ligeiro para a frente — obriga o descodificador
  // a entregar de novo; (2) ~0,6 s depois, ainda presa: passa ao seguinte,
  // se estiver pronto; (3) senão, recarrega no mesmo ponto.
  let degrau = 0;
  let ultimoDegrau = 0;
  const verImagem = () => {
    if (!comFotogramasFinos) return;
    const el = videos[atual];
    if (!deviaAndar() || aPassar || el.paused || el.ended) {
      ultimoFotograma = null;
      degrau = 0;
      return;
    }
    const agora = performance.now();
    if (ultimoFotograma === null) {
      ultimoFotograma = agora; // começa a contar agora
      return;
    }
    if (agora - ultimoFotograma < IMAGEM_PRESA_MS) {
      degrau = 0;
      return;
    }
    if (degrau && agora - ultimoDegrau < IMAGEM_PRESA_MS) return; // à espera do efeito do anterior
    ultimoDegrau = agora;
    degrau++;
    if (degrau === 1) {
      marcar("destravar", atual);
      // Um salto ligeiro PARA A FRENTE: saltar para o mesmo instante, no
      // WebKit, pode não fazer nada (o registo de 17/10: o 1.º degrau não
      // destravou nenhuma das duas paragens).
      try {
        const fim = Number.isFinite(el.duration) ? el.duration - 0.1 : Infinity;
        el.currentTime = Math.min(el.currentTime + SALTO_DE_DESTRAVAR_S, fim);
      } catch {
        // sem dados para saltar: o degrau seguinte trata
      }
      return;
    }
    degrau = 0;
    ultimoFotograma = null;
    if (seguintePronto()) {
      marcar("destravar-passar", atual);
      passar();
      return;
    }
    recarregarNoMesmoPonto(el, el.currentTime);
  };
  /** Ao sair (página escondida, fechada, ou outra página do sítio): envia o resumo. */
  const enviarResumo = () => {
    if (!registo) return;
    let perdidos = 0;
    let total = 0;
    for (const el of videos) {
      const q = (
        el as HTMLVideoElement & {
          getVideoPlaybackQuality?: () => { droppedVideoFrames: number; totalVideoFrames: number };
        }
      ).getVideoPlaybackQuality?.();
      if (q) {
        perdidos += q.droppedVideoFrames;
        total += q.totalVideoFrames;
      }
    }
    registo.medirQualidade(perdidos, total);
    registo.enviar("saida");
  };
  const aoEsconder = () => {
    if (document.visibilityState === "hidden") enviarResumo();
  };

  let relogio = 0;
  const io = new IntersectionObserver(
    ([e]) => {
      naTela = e.isIntersecting;
      if (naTela) retomar();
      else pararTudo();
    },
    { threshold: 0 },
  );
  const aoMudarSeparador = () => {
    separadorVisivel = document.visibilityState !== "hidden";
    if (separadorVisivel) retomarEConfirmar();
    else pararTudo();
  };
  const aoRegressar = () => retomarEConfirmar();

  const desligar = () => {
    if (!ligado) return;
    ligado = false;
    window.clearInterval(relogio);
    window.clearInterval(relogioDoRegisto);
    registo?.pausa();
    enviarResumo();
    document.removeEventListener("visibilitychange", aoEsconder);
    window.removeEventListener("pagehide", enviarResumo);
    io.disconnect();
    document.removeEventListener("visibilitychange", aoMudarSeparador);
    document.removeEventListener("resume", aoRegressar);
    window.removeEventListener("pageshow", aoRegressar);
    window.removeEventListener("focus", aoRegressar);
    // Pára sem esquecer quem estava a tocar: ao voltar, retoma esses.
    for (const el of aTocar) pausar(el);
  };

  return {
    videos,
    ligar(r: HTMLElement) {
      if (!vivo || ligado) return;
      raizAtual = r;
      if (imagem && !imagem.isConnected) r.append(imagem);
      ligado = true;
      naTela = true;
      separadorVisivel = document.visibilityState !== "hidden";
      relogio = window.setInterval(vigiar, 1000);
      relogioDoRegisto = window.setInterval(verificarRegisto, 250);
      if (registo) {
        document.addEventListener("visibilitychange", aoEsconder);
        window.addEventListener("pagehide", enviarResumo);
      }
      io.observe(r);
      document.addEventListener("visibilitychange", aoMudarSeparador);
      // `resume`: o Chrome do Android «congela» a página por trás de outra
      // aplicação e avisa assim quando a descongela.
      document.addEventListener("resume", aoRegressar);
      window.addEventListener("pageshow", aoRegressar);
      window.addEventListener("focus", aoRegressar);
      retomarEConfirmar();
    },
    desligar,
    destruir() {
      desligar();
      vivo = false;
      for (const f of limpar) f();
      for (const el of videos) el.pause();
      for (const u of naMemoria) URL.revokeObjectURL(u);
    },
  };
}

export default function EntradaEmVideo() {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = caixa.current;
    if (!raiz) return;
    // Voltou à página inicial sem recarregar: os mesmos vídeos, a continuar.
    if (motorDaSessao) {
      const m = motorDaSessao;
      if (m.videos[0].parentElement !== raiz) raiz.replaceChildren(...m.videos);
      m.ligar(raiz);
      return () => m.desligar();
    }
    // Numa navegação dentro do sítio o guião do HTML não correu: corre-se aqui.
    if (!raiz.querySelector("[data-primeiro]")) {
      arrancarEntrada(
        FONTES,
        CHAVE_DO_ULTIMO,
        CORTINA_ESPERA_MAX_MS,
        LEVES,
        MEDIR_REDE_MS,
        ANIMADAS,
        porImagemAnimada,
        PASSAGEM_MS,
      );
    }
    const m = criarMotor(raiz);
    if (!m) return;
    motorDaSessao = m;
    m.ligar(raiz);
    return () => m.desligar();
  }, []);

  return (
    <div
      ref={caixa}
      data-entrada=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      // O guião do HTML põe as `<source>` e marca o take de entrada antes de
      // o React chegar: o HTML deixa de ser igual ao que o servidor escreveu, de
      // propósito. Vale só para este elemento.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: HTML_DOS_VIDEOS }}
    />
  );
}
