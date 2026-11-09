"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useImageErrorRef } from "./SafeImage";
import { clientLogos } from "@/data";
import { caixaNaParede, logoDimsFor, logoSizes } from "@/lib/logo";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useTranslations } from "./LocaleProvider";
import { FILTRO_DA_TINTA, TintaDosLogotipos } from "./TintaDosLogotipos";

/**
 * Scrolling band of client logos on the homepage. Each logo is drawn with the
 * SAME box it has on the /clientes wall at the same screen width
 * (`caixaNaParede`, without the wall's cell cap since 9/11), scaled down by one
 * number for the whole band (`--fita-escala`). A missing logo falls back to
 * the client name.
 *
 * Ela, 24/10, com a captura da fita: «a questão do tamanho dos logos ainda não
 * resolveste». A fita tinha uma conta própria e um tecto de 34 px de altura e
 * 170 de largura, que punha quase todos à mesma altura: a Deloitte, a Mainova e
 * a Pérez-Llorca enormes, a EDIA e a Universidade pequeninas. A parede já tinha
 * o peso certo (#246); a fita passa a ser a parede em ponto pequeno.
 *
 * The list is duplicated for a seamless loop — the second copy is `aria-hidden`
 * so a screen reader reads each client once, not twice.
 */
function Mark({
  name,
  logo,
  duplicate = false,
}: {
  name: string;
  logo: string;
  duplicate?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const refErro = useImageErrorRef(() => setFailed(true));
  const hidden = duplicate ? { "aria-hidden": true as const } : {};

  if (failed || !logo) {
    return (
      <div className="me-12 flex h-8 flex-shrink-0 items-center sm:me-16 sm:h-10" {...hidden}>
        <span className="text-foreground/68 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase whitespace-nowrap">
          {name}
        </span>
      </div>
    );
  }

  const d = logoDimsFor(logo);
  // A largura natural na parede, antes da trava da célula. A trava entra no
  // CSS da parede, mas a fita deixou de a usar a 9/11 (ver abaixo), e a altura sai da
  // proporção do logótipo.
  const natural = caixaNaParede(logo, Infinity).largura;

  return (
    <div className="me-12 flex flex-shrink-0 items-center justify-center sm:me-16" {...hidden}>
      <Image
        src={logo}
        alt={duplicate ? "" : name}
        width={d[0]}
        height={d[1]}
        // O `sizes` é POR LOGÓTIPO, não um valor único para a fita toda: a
        // altura é dada por área (logoHeight), portanto um logótipo alto e
        // estreito é desenhado a 28px e um wordmark fino a 170px. Declarar 170
        // para os dois fazia o browser ir buscar a mesma variante de 256px para
        // ambos — 27,8 KB para pintar 28px no caso do convento. Ver a nota
        // longa em src/lib/logo.ts; é a MESMA função que a parede usa, para os
        // três `<img>` do mesmo cliente em /clientes caírem no mesmo URL.
        sizes={logoSizes(logo)}
        // Rendered as flat black silhouettes (brightness-0), so encoder quality
        // is imperceptible — 50 just trims the bytes of every logo in the strip.
        quality={50}
        // A caixa da parede NO MESMO ECRÃ, à escala da fita: a largura natural
        // (sem a trava da célula — ver a nota de 9/11 logo abaixo), e a
        // altura pela proporção. Sem tecto de altura: era isso que, antes de
        // #282, punha todos à mesma altura.
        //
        // ── SEM A TRAVA DA CÉLULA, DESDE 9/11 ─────────────────────────────
        // Ela: «a barra ainda não tem os logos todos no mesmo tamanho». A trava
        // é da GRELHA de /clientes (uma célula de 2 colunas ao telemóvel); a fita
        // não tem células, e ao telemóvel a trava cortava a Mainova, a
        // Pérez-Llorca, o José de Mello e a Aernnova a metade da tinta dos
        // outros. Sem ela, a fita fica com a mesma tinta em todos (logo.ts,
        // `PESO_DA_TINTA`); a parede continua travada pela sua célula.
        style={{
          width: `calc(${Math.round(natural * 10) / 10}px * var(--fita-escala))`,
          height: "auto",
          aspectRatio: `${d[0]} / ${d[1]}`,
          filter: FILTRO_DA_TINTA,
        }}
        className="object-contain opacity-100 transition-opacity duration-300"
        // O erro é ouvido pela `ref` e NÃO pelo `onError` do next/image.
        // Passar `onError` faz o next/image reatribuir `img.src = img.src` na
        // montagem (image-component.js:140) para ressuscitar um erro anterior à
        // hidratação; quando a hidratação apanha a imagem ainda a descarregar,
        // isso ABORTA o pedido em voo e manda outro. Medido em /clientes: os 18
        // logótipos pedidos duas vezes em 3 de 8 corridas, +163 KB. O
        // `useImageErrorRef` cobre o mesmo caso lendo o estado do elemento.
        ref={refErro}
      />
    </div>
  );
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VELOCIDADE DA FITA, EM PÍXEIS POR SEGUNDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O CSS levava um TEMPO fixo (`30s`), e um tempo fixo numa fita que muda de
 * largura não é uma velocidade: é o que sobrar. MEDIDO na página inicial, com
 * os 19 clientes de hoje — a fita mede 3844 px a 390 px de ecrã e 5053 a 1440,
 * porque o intervalo entre logótipos é maior a partir de `sm`. A mesma
 * animação, duas velocidades. E no dia em que ela juntasse seis clientes a
 * fita alargava e passava a correr mais depressa, sem ninguém mexer em nada.
 *
 * ── PORQUE 110 E NÃO OUTRO NÚMERO ────────────────────────────────────────
 *
 * Ela mandou o site que quer imitar e disse que o nosso é lento. NÃO CONSEGUI
 * medir o dele: o proxy desta máquina não deixa sair para lá, e um número
 * inventado a dizer que é o deles seria pior do que não ter número nenhum.
 *
 * 110 px/s é quase o dobro do que a fita andava, e fica longe do ponto em que
 * um wordmark deixa de se ler de relance. Está aqui, com nome, para ela poder
 * pedir mais ou menos numa palavra.
 */
const PIXEIS_POR_SEGUNDO = 110;

/**
 * ── OS QUE ANDAM SEMPRE JUNTOS (9/11) ──────────────────────────────────────
 * Ela: «coloca a Torre de Palma ao lado da Deloitte na barra». A ordem é
 * sorteada a cada visita (ver o efeito no componente), e um sorteio simples
 * separava-os. Cada par entra no sorteio como UM lugar só, e sai lado a lado.
 */
export const PARES_NA_FITA: ReadonlyArray<readonly [string, string]> = [
  ["Deloitte", "Torre de Palma Wine Hotel"],
];

/** Baralha os clientes, mantendo cada par de `PARES_NA_FITA` lado a lado. */
export function sortearComPares<T extends { name: string }>(
  lista: readonly T[],
  aleatorio: () => number = Math.random,
): T[] {
  const segundos = new Map(PARES_NA_FITA.map(([a, b]) => [a, b]));
  const emPar = new Set(PARES_NA_FITA.map(([, b]) => b));
  const blocos: T[][] = [];
  for (const c of lista) {
    if (emPar.has(c.name) && lista.some((x) => segundos.get(x.name) === c.name)) continue;
    const segundo = segundos.get(c.name);
    const par = segundo ? lista.find((x) => x.name === segundo) : undefined;
    blocos.push(par ? [c, par] : [c]);
  }
  for (let i = blocos.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [blocos[i], blocos[j]] = [blocos[j], blocos[i]];
  }
  return blocos.flat();
}

export default function ClientMarquee() {
  const { t } = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  /**
   * O comando de parar, que continua a existir e deixou de se ver.
   *
   * Palavras dela: «o nosso tem até um botão para parar ou ligar e eu não
   * quero isso». O botão desenhado saiu.
   *
   * O comando não saiu, e a razão não é teimosia: a WCAG 2.2.2 («Pause, Stop,
   * Hide») é nível A e diz que um movimento que arranca sozinho e dura mais de
   * cinco segundos tem de poder ser parado. Esta fita anda sempre.
   *
   * Fica um botão que NÃO OCUPA ESPAÇO NENHUM e não se vê — só aparece se
   * alguém lhe chegar com o Tab, que é exactamente quem precisa dele. Quem
   * navega com o rato ou com o dedo nunca o encontra, e é isso que ela pediu.
   */
  const [userPaused, setUserPaused] = useState(false);

  // Shuffle the logo order once per visit so a DIFFERENT set of clients leads
  // each time — otherwise the same first few always hold the prime, first-
  // visible slot and the rest are rarely seen before the visitor scrolls on.
  // Starts as the server order (SSR-safe: initial client render matches), then
  // reshuffles after mount; the marquee still cycles the full set within a view.
  const [order, setOrder] = useState(clientLogos);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(sortearComPares(clientLogos));
  }, []);

  /**
   * A duração, a partir da largura REAL da fita.
   *
   * Metade do conteúdo é EXACTAMENTE uma cópia: o intervalo entre logótipos
   * vive dentro de cada marca (uma margem) e não no contentor, portanto o
   * conteúdo são duas cópias iguais, sem meio intervalo a sobrar. É a mesma
   * razão que faz o `-50%` do `@keyframes` fechar o ciclo.
   *
   * `ResizeObserver` e não uma medição única: a fita muda de largura quando a
   * janela cruza o `sm` (o intervalo passa de 48 para 64 px) e quando um
   * logótipo falha e é substituído pelo nome do cliente.
   */
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const medir = () => {
      const copia = el.scrollWidth / 2;
      if (copia <= 0) return;
      /**
       * Só se mudou, e não é zelo: mexer na `animation-duration` de uma
       * animação a correr obriga o browser a recalcular onde ela vai, e um
       * observador que dispare com frequência põe a fita a reajustar-se em vez
       * de andar.
       */
      const anterior = parseFloat(el.style.getPropertyValue("--fita-duracao"));
      const nova = copia / PIXEIS_POR_SEGUNDO;
      if (Number.isFinite(anterior) && Math.abs(anterior - nova) < 0.05) return;
      el.style.setProperty("--fita-duracao", `${nova}s`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [order]);

  // Pause the infinite scroll while the band is off-screen — no point
  // compositing a wide moving strip the user can't see (battery / GPU).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // Under prefers-reduced-motion the marquee animation is already `none`
    // (globals.css), so there's nothing to pause — skip the observer entirely
    // rather than run it to toggle a class that does nothing.
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => el.classList.toggle("marquee-paused", !e.isIntersecting),
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    /**
     * `--fita-escala`: a parede de /clientes em ponto pequeno. A escala está em
     * `ESCALA_DA_FITA` (logo.ts), e um teste prende-a. A `--fita-largura` (a
     * trava da célula da parede, 2/11) saiu a 9/11: com a tinta compensada por
     * inteiro, já não há wordmarks enormes a travar, e a trava cortava-os a
     * metade da tinta dos outros ao telemóvel.
     */
    <div className="relative min-h-16 py-3 [--fita-escala:0.75] sm:min-h-[4.5rem] sm:[--fita-escala:0.8] lg:[--fita-escala:0.85] border-y border-foreground/8 overflow-hidden flex items-center">
      {/* sr-only heading so heading-navigation users find the client band. */}
      <h2 className="sr-only">{t.nav.clientes}</h2>
      <TintaDosLogotipos />
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
      <div
        ref={trackRef}
        /**
         * `w-max` — a caixa cresce até ao conteúdo.
         *
         * É o que faz o `translateX(-50%)` do `@keyframes` significar «uma
         * cópia». Sem isto a caixa media o que a janela media (a banda é
         * `overflow-hidden`) e a fita saltava 1838 px em cada volta. E o
         * intervalo entre logótipos saiu do `gap` do contentor para uma
         * margem em cada marca, para que metade do conteúdo seja uma cópia
         * exacta e não uma cópia mais meio intervalo. O porquê inteiro está
         * no `globals.css`, ao pé do `@keyframes marquee`.
         */
        className="animate-marquee flex w-max shrink-0 items-center whitespace-nowrap"
        style={userPaused ? { animationPlayState: "paused" } : undefined}
      >
        {/*
          A CHAVE É O CLIENTE, NÃO A POSIÇÃO — e isso vale bytes, não é estilo.
          A ordem é sorteada DEPOIS de montar (o efeito acima). Com `key={i}` o
          React não move nada: mantém os mesmos 38 `<img>` e limita-se a trocar
          o `src` de cada um. Cada troca ABORTA o pedido em voo daquele
          elemento e lança outro — os mesmos 19 logótipos, pedidos duas vezes.
          Medido em /clientes, 1440x900, cache fria, 8 corridas: 17 a 18 URLs
          repetidos em 3 delas, 1237 KB contra 1074 KB nas corridas limpas.
          Com a chave no nome do cliente, o React REORDENA os nós que já
          existem e nenhum `src` muda: 0 repetidos em 8 corridas.
          O sufixo distingue a segunda passagem da fita (a cópia `aria-hidden`
          que fecha o ciclo), senão haveria chaves iguais.
        */}
        {[...order, ...order].map((c, i) => (
          <Mark
            key={`${c.name}-${i >= order.length ? "eco" : "1"}`}
            name={c.name}
            logo={c.logo}
            duplicate={i >= order.length}
          />
        ))}
      </div>
      {/**
       * ── O COMANDO QUE NÃO SE VÊ ────────────────────────────────────────
       *
       * Era um círculo com «❚❚» encostado ao canto da banda. Palavras dela:
       * «o nosso tem até um botão para parar ou ligar e eu não quero isso».
       *
       * O DESENHO saiu; o comando ficou. A WCAG 2.2.2 é nível A e pede que um
       * movimento que arranca sozinho e dura mais de cinco segundos possa ser
       * parado — e esta fita anda sempre.
       *
       * `sr-only` até receber foco: não ocupa espaço, não se vê, e não há como
       * lá chegar com o rato ou com o dedo. Quem navega por teclado dá com ele
       * no Tab e ele aparece.
       *
       * `motion-reduce:hidden` fica: nessa via a fita não anda (globals.css),
       * e um botão para parar o que já está parado é ruído.
       */}
      <button
        type="button"
        onClick={() => setUserPaused((p) => !p)}
        aria-pressed={userPaused}
        className="focus:border-foreground/30 focus:bg-surface focus:text-foreground sr-only focus:absolute focus:right-2 focus:bottom-1 focus:z-20 focus:rounded-full focus:border focus:px-3 focus:py-1.5 focus:text-xs focus:not-sr-only motion-reduce:hidden"
      >
        {userPaused ? t.common.retomarLogos : t.common.pausarLogos}
      </button>
    </div>
  );
}
