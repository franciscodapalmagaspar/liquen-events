"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { semAnaliticos } from "@/lib/safe-path";
import Link from "next/link";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { ALTURA_BARRA_FIXA_PX, ehRotaSocial } from "@/lib/meta/barra";

// Minimal RGPD cookie-consent bar. It only governs the Google tag's Consent
// Mode signals (ad/analytics cookies) — the site's own first-party essentials
// don't need consent. Shown once; the choice is stored in localStorage and
// mirrored into gtag('consent','update',…). Denied by default (see GoogleTag),
// so doing nothing = no ad cookies.
type Gtag = (...args: unknown[]) => void;

/**
 * ── PORQUE É QUE ESTE TEXTO ENCOLHEU ──────────────────────────────────────
 * Era o dobro disto, e a barra media 191 px num telemóvel de 390×844 — 23% do
 * ecrã. O que lá estava a mais era DETALHE de segunda camada: a lista de
 * produtos («Google Analytics», «Google Ads, Instagram e Facebook») e a frase
 * «pode aceitar ou recusar e a sua escolha fica guardada», que os dois botões
 * ali ao lado já dizem melhor do que qualquer frase.
 *
 * O que a primeira camada de um aviso de cookies tem de dizer — e continua cá
 * — é PARA QUE SERVEM (estatísticas e medição de publicidade), QUEM os põe
 * (Google e Meta) e ONDE está o resto (o «Saber mais», que abre a política de
 * privacidade e é onde a lista de produtos vive por extenso). Encolher o
 * texto não encolhe o consentimento: encolhe o obstáculo.
 */
const COPY = {
  pt: {
    text: "Usamos cookies do Google e da Meta para estatísticas de visitas e para medir a nossa publicidade.",
    more: "Saber mais",
    accept: "Aceitar",
    decline: "Recusar",
    aria: "Aviso de cookies",
  },
  en: {
    text: "We use Google and Meta cookies for visit statistics and to measure our advertising.",
    more: "Learn more",
    accept: "Accept",
    decline: "Decline",
    aria: "Cookie notice",
  },
} as const;

export default function ConsentBanner({ locale }: { locale: Locale }) {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ARRANCA VISÍVEL — E É POR ISSO QUE ELE EXISTE NO HTML
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto era `useState(false)`: o servidor devolvia `null` e a barra só nascia
   * quando o React hidratava e o efeito lá em baixo lia o `localStorage`.
   * MEDIDO: o parágrafo desta barra era o elemento de LCP do telemóvel, a
   * 3348–3588 ms, e `grep "Usamos cookies"` no HTML construído dava zero. O
   * maior bloco de texto do primeiro ecrã esperava pelo JavaScript todo para
   * existir — em todas as páginas do sítio.
   *
   * Agora vem desenhado do servidor. Quem já escolheu não o chega a ver: um
   * script em linha no `<head>` (ver `[lang]/layout.tsx`) lê a escolha aos
   * ~11 ms e marca o `<html>`, e o CSS esconde a barra antes da primeira
   * pintura. Este efeito continua a existir para a TIRAR do DOM — o CSS só a
   * esconde; quem a remove é o React, e é ele que manda no fim.
   *
   * O estado inicial `true` é também o que mantém a hidratação coerente: o
   * primeiro render do cliente tem de desenhar exactamente o que o servidor
   * desenhou.
   */
  const [show, setShow] = useState(true);
  const pathname = usePathname();
  // The consent bar governs Google's public-visitor tracking; it has no place
  // over the authenticated back office (…/orcamento/admin[/…], locale-prefixed
  // in EN), where it would also sit on top of the mobile nav and intercept its
  // clicks. Staying out of that surface keeps it a marketing-site concern only.
  //
  // Esta regra estava aqui escrita à mão (`pathname.includes(...)`) e em mais
  // lado nenhum — era a única peça do layout que sabia o que é o back office,
  // enquanto os quatro analíticos ao lado não sabiam. Passou para
  // `safe-path.ts`, que diz de si próprio: uma só definição, para não haver
  // duas versões da verdade.
  //
  /**
   * ── E TAMBÉM FORA DAS ROTAS COM TOKEN, QUE É O RESTO DA MESMA FRASE ─────
   *
   * Isto lia `isBackOfficeRoute` — METADE do `semAnaliticos`. A outra metade
   * são as rotas com token: a proposta do casal e o portal. E nessas não é
   * montado analítico nenhum — o Plausible, o Google tag, os Web Vitals e a
   * captura de origem calam-se todos por `isTokenRoute`, que é a regra mais
   * antiga deste projecto.
   *
   * Ou seja: esta barra estava a pedir a um casal consentimento para cookies
   * que aquela página NUNCA PÕE.
   *
   * E não era só inútil, era caro. MEDIDO num 390×844, com a proposta a sério
   * e a página rolada até ao fim: a barra desenha 116 px encostados ao chão, e
   * debaixo dela ficavam as duas últimas linhas do documento — «Válida até …»
   * e «Emitida a …». A página já estava no fundo; aquelas linhas eram
   * inalcançáveis. Ela mandou a fotografia com o total tapado pelo aviso.
   *
   * O sítio público resolve a mesma geometria com uma reserva
   * (`--reserva-consentimento`), consumida pelo rodapé, pelo herói e pelos dois
   * botões flutuantes. O ramo privado não tem nenhum deles — foi desenhado sem
   * cromado, de propósito (ver `(privado)/layout.tsx`) —, portanto não havia lá
   * nada para consumir reserva nenhuma, e acrescentar-lha seria pagar espaço a
   * um aviso que não tem ali nada para avisar.
   *
   * Quem abrir depois o sítio público vê a barra como sempre: a escolha vive no
   * `localStorage` e ninguém a perde por a barra não aparecer aqui.
   */
  const foraDeSitio = semAnaliticos(pathname);

  useEffect(() => {
    // A lógica é a mesma de sempre, ao contrário: a barra já está desenhada, e
    // o que este efeito faz é TIRÁ-LA quando já houve escolha. O `catch`
    // mantém a decisão antiga (sem armazenamento, não se mostra a barra) —
    // e o script em linha do `<head>` já a tinha escondido, portanto isto só
    // acaba o trabalho, sem piscar.
    try {
      if (localStorage.getItem("liquen-consent")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(false);
      }
    } catch {
      setShow(false);
    }
  }, []);

  // Re-open on demand from the "Gerir cookies" footer link, so a visitor can
  // change or withdraw their choice at any time (RGPD: withdrawing consent must
  // be as easy as giving it).
  useEffect(() => {
    const open = () => {
      // Tirar TAMBÉM a marca do `<html>`: é ela que o CSS usa para esconder a
      // barra a quem já escolheu, e sem isto o "Gerir cookies" do rodapé
      // montava um elemento que ficava invisível — a retirada do consentimento
      // deixava de ser possível, que é precisamente o que o RGPD não permite.
      document.documentElement.classList.remove("consentimento-decidido");
      setShow(true);
    };
    window.addEventListener("liquen:open-consent", open);
    return () => window.removeEventListener("liquen:open-consent", open);
  }, []);

  const choose = (granted: boolean) => {
    const value = granted ? "granted" : "denied";
    try {
      localStorage.setItem("liquen-consent", value);
    } catch {
      /* ignore */
    }
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    gtag?.("consent", "update", {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    });
    // O pixel da Meta não tem Consent Mode: ou existe, ou não existe. Este
    // aviso é o que o faz nascer no instante em que a pessoa aceita, sem ela
    // ter de recarregar a página. O `storage` do browser só chega a OUTROS
    // separadores, por isso não servia para isto.
    try {
      window.dispatchEvent(new Event("liquen:consent-changed"));
    } catch {
      /* ambiente sem eventos sintéticos — o pixel nasce na próxima página */
    }
    setShow(false);
  };

  if (foraDeSitio || !show) return null;
  const t = COPY[locale === "en" ? "en" : "pt"];

  // Nas variantes sociais o banner SOBE a altura da barra fixa, em vez de se
  // sentar em cima dela. Ver o cabeçalho de src/lib/meta/barra.ts: os dois
  // eram `bottom: 0`, o banner tem z-index maior, e o resultado era o botão
  // de WhatsApp — a acção principal da página — invisível para toda a gente
  // que chega de um anúncio.
  const acimaDaBarra = ehRotaSocial(pathname);

  return (
    <div
      // role="region" (a labelled landmark), NOT "dialog": the bar is
      // non-modal — it doesn't trap focus or block the page, so a dialog role
      // would be a false modal claim. It also kept colliding with the real
      // modal dialogs on the page (gallery lightbox) under getByRole('dialog').
      role="region"
      aria-label={t.aria}
      // `barra-consentimento` é a alça do CSS que esconde isto a quem já
      // escolheu, antes da primeira pintura. Ver o script no `<head>`.
      /**
       * SEM desfoque também no computador (29/10). Ela: «o site no PC está a
       * travar mesmo imenso, principalmente na parte do vídeo». O aviso
       * aparece por cima do vídeo da entrada, e aí o `backdrop-filter` volta a
       * desfocar o vídeo a CADA fotograma dele, mesmo sem rolar. O verde fica
       * a 95 %, como já estava nos ecrãs de toque (globals.css).
       *
       * SEM `backdrop-blur-sm`, e é a melhor troca desta sessão inteira: custa
       * 5 % de um pixel e rende metade dos solavancos do scroll.
       *
       * O fundo é `bg-moss-dark/95` — 95 % opaco. O desfoque só actua nos
       * restantes 5 %, e para isso obriga o compositor a manter uma superfície
       * de render de LARGURA TOTAL e a reler o que está por baixo a cada frame
       * composto. Como a barra é `fixed`, isso acontece durante todo o scroll
       * da galeria, que é a página que mais pinta do sítio.
       *
       * MEDIDO na bancada rápida (100 passos × 3, CPU 4×, 4G lento), no mesmo
       * build e de seguida:
       *
       *                          telemóvel >32ms   pior    secretária >32ms
       *   como estava                 2,5 %       183 ms        32,5 %
       *   sem os três desfoques       0,8 %        50 ms        17,3 %
       *   SÓ esta barra sem desfoque  1,0 %        50 ms        18,3 %
       *
       * Ou seja: esta barra sozinha explica quase todo o custo dos três. Os
       * outros dois `backdrop-filter` (o botão de voltar ao topo e o círculo da
       * legenda de sobrevoo) ficam — esses vêem-se, e o que rendem já está
       * dentro da variância entre corridas.
       */
      /**
       * ── A GEOMETRIA, QUE ERA O DEFEITO ────────────────────────────────
       * Esta barra é `fixed` e continua a sê-lo: pô-la no fluxo faria a
       * página refluir no instante em que ela aparece (ela espera pelas
       * fontes, ver `fontes-por-assentar`), e esse refluxo é CLS medido.
       *
       * O que mudou é que o espaço que ela ocupa passou a ser RESERVADO
       * pelo resto do sítio, através de `--reserva-consentimento`
       * (globals.css, ao pé de `html.consentimento-decidido`). A reserva é
       * uma constante por medida — como o `ALTURA_BARRA_FIXA_PX` da barra
       * social —, existe desde a primeira pintura e não depende de medir
       * nada em JavaScript, portanto não custa um pixel de CLS.
       *
       * `py-3.5` e `gap-2.5` em vez de `py-4`/`gap-3`: com o texto curto, a
       * barra do telemóvel passa de 191 px para ~110 px. O ESSENCIAL é que a
       * reserva declarada no CSS continue a ser maior do que esta caixa —
       * `e2e/consentimento-geometria.spec.ts` mede as duas e obriga a isso.
       */
      /**
       * ── PEQUENO, NUM CANTO, TRANSLÚCIDO ───────────────────────────────
       * Palavras dela, com a captura da barra verde de bordo a bordo: «quero
       * isto pequeno num canto transparente tipo apple».
       *
       * Passa a um cartão: no telemóvel com ar dos lados e cantos redondos;
       * a partir de 640 px com 22 rem, encostado ao canto de baixo à
       * esquerda — o direito é dos botões flutuantes (WhatsApp e o pedido de
       * orçamento). O fundo é o verde da Líquen («coloca isto da cor da
       * liquen, aquele verde») a 85 % com desfoque: lê-se o que está por
       * trás. É o `sage-700` e não o `sage-500` da marca porque o texto é
       * branco: 85 % de #39513f sobre uma página branca dá ~#576b5c, e o
       * branco a 90 % fica perto de 5:1 por cima dele; o verde da marca no
       * mesmo sítio não chegava aos 4,5.
       *
       * O desfoque que o bloco de cima tirou por custo volta, mas sobre uma
       * fracção da área: era uma superfície de largura total (1440 × 74);
       * agora é um cartão de 352 × ~150. A reserva de espaço (ver
       * `--reserva-consentimento` em globals.css) foi medida outra vez para
       * esta forma.
       */
      className="barra-consentimento fixed inset-x-3 z-[70] rounded-2xl border border-white/12 bg-sage-700/95 px-4 py-3.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)] sm:inset-x-auto sm:left-5 sm:w-[22rem]"
      style={{
        // Fora das rotas sociais nada muda: `bottom: 0` (da classe) e o
        // preenchimento a respeitar a zona segura do iPhone.
        //
        // Nas sociais o banner ASSENTA EM CIMA da barra fixa. A altura da
        // barra soma-se à zona segura porque a própria barra já a reserva por
        // dentro — sem isso, o banner ficaria a tapar-lhe a parte de baixo
        // num telefone com barra de gestos.
        // O cartão flutua: a zona segura entra na DISTÂNCIA ao fundo, e não
        // no enchimento de dentro (que era o desenho da barra encostada).
        bottom: acimaDaBarra
          ? `calc(${ALTURA_BARRA_FIXA_PX}px + 0.75rem + env(safe-area-inset-bottom))`
          : "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex flex-col gap-3">
        {/* `text-white` e não `/85` (auditoria externa, C5): o aviso tem de
            ficar acima dos 4,5:1 sobre qualquer página por trás, e o branco
            inteiro dá folga sobre o verde translúcido do cartão. */}
        <p className="text-[12.5px] leading-relaxed text-white">
          {t.text}{" "}
          <Link
            href={localizeHref("/privacidade", locale)}
            className="whitespace-nowrap text-white underline underline-offset-2 hover:text-white/90"
          >
            {t.more}
          </Link>
        </p>
        {/* Accept and Decline are given equal visual weight (same border, size
            and contrast). CNPD cookie guidance requires refusing to be as easy
            and as prominent as accepting — a low-contrast "decline" would be a
            dark pattern that undermines freely-given consent.
            Por isso `alvo-toque` nos DOIS: mediam 108×35 e 102×35 px a 375 px
            com toque emulado, e a igualdade que a CNPD pede também é de alvo —
            se recusar fosse mais fácil de falhar do que aceitar, o
            consentimento deixava de ser livre por via do dedo. */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => choose(false)}
            className="toque alvo-toque rounded-full border border-white/55 px-4 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-sage-800"
          >
            {t.decline}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="toque alvo-toque rounded-full border border-white/55 px-4 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white transition-colors hover:bg-white hover:text-sage-800"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
