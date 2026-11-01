import type { Metadata } from "next";
import { Playfair_Display } from "next/font/google";
import { MovimentoDaProposta } from "./MovimentoDaProposta";
import SmoothScroll from "@/components/motion/SmoothScroll";

/**
 * O Playfair da proposta, PRÉ-CARREGADO só aqui. O sítio público deixou de o
 * pré-carregar (ver a nota «O PLAYFAIR ROMANO…» em `[lang]/layout.tsx`), mas
 * aqui o título do primeiro ecrã é Playfair. Esta instância redefine o
 * `--font-playfair` dentro do `<main>`, e a proposta fica como estava: o
 * ficheiro pedido em alta prioridade logo no `<head>`.
 */
const PLAYFAIR_DA_PROPOSTA = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RAMO PRIVADO — A PROPOSTA DE UM CASAL, SEM O SÍTIO À VOLTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A `/proposta/<token>` vivia dentro de `(site)`, e portanto o casal que
 * abrisse o link do email encontrava a proposta dele emoldurada pela
 * navegação institucional: menu, rodapé, botão flutuante de WhatsApp, CTA
 * fixo («Pedir orçamento»), barra de progresso e Speculation Rules a
 * pré-renderizar seis páginas do sítio.
 *
 * ── A DECISÃO: FOLHA LIMPA, E PORQUÊ ──────────────────────────────────────
 *
 *  1. **O menu é uma lista de sítios para onde ir que não são a proposta.**
 *     É a mesma frase que o `CromadoDoSitio.tsx` já escreve sobre `/s/*`, e
 *     aqui pesa mais: quem chega aqui não é um visitante a decidir se pede um
 *     orçamento — é um casal que JÁ tem um orçamento de vinte mil euros na
 *     mão. Oferecer-lhe «Pedir orçamento» num CTA fixo lê-se como o estúdio
 *     não saber quem ele é.
 *
 *  2. **A razão do projecto é o ecrã inteiro.** Palavras dela: «46 fotos de
 *     mood board comprimidas em páginas A4 ficam pequenas, quando o trabalho é
 *     visual e merece ecrã inteiro.» Uma barra de navegação fixa em cima e um
 *     CTA fixo em baixo comem, num telemóvel de 390 px, a altura que as
 *     fotografias existem para ocupar. Ganhar essa altura de volta é metade do
 *     trabalho desta fase.
 *
 *  3. **Menos peças é menos superfície para violar a regra do zero rastreio.**
 *     Hoje o `Analytics`, o `GoogleTag`, o `WebVitals` e o
 *     `LeadSourceCapture` desligam-se sozinhos nesta rota (`isTokenRoute`, em
 *     `src/lib/safe-path.ts`) — e essa guarda MANTÉM-SE, porque eles vivem no
 *     layout de raiz, por onde esta página continua a passar. O que este
 *     ramo acrescenta é estrutura: as peças do cromado não podem chegar aqui
 *     por acidente, porque não passam por este caminho.
 *
 * ── O QUE SE PERDE, DITO ──────────────────────────────────────────────────
 *
 * O `ServiceWorkerRegister` deixa de correr nesta rota. Não custa nada à
 * proposta: o `public/sw.js` recusa explicitamente guardar `/proposta` e os
 * buckets `proposal-assets` / `proposal-thumbs` («o que identifica um cliente
 * não vai para disco»), e um casal que chega pelo email nunca visitou o sítio,
 * portanto não havia service worker nenhum a servir esta primeira visita de
 * qualquer maneira. Em troca, um link privado deixa de instalar um service
 * worker para a origem inteira.
 *
 * ── `noindex` NO LAYOUT ───────────────────────────────────────────────────
 *
 * Declarado aqui, e não só na página, para valer para TUDO o que venha a ser
 * acrescentado a este ramo. A `page.tsx` continua a declará-lo por sua conta
 * (o `generateMetadata` dela substitui isto por inteiro) — são as duas metades
 * da mesma garantia, e nenhuma delas depende de o próximo autor se lembrar.
 *
 * `follow: false`, ao contrário de `/s/*`: aqui não há ligações internas a
 * passar sinal nenhum e o documento é de um casal.
 *
 * ── NUNCA `og:image` NESTA ROTA ───────────────────────────────────────────
 *
 * Não é esquecimento e não se acrescenta: uma imagem de partilha bonita fica
 * em cache num serviço de mensagens — WhatsApp, iMessage, Slack —, num
 * servidor que não é dela e que o `noindex` não alcança. O link é reenviável;
 * a fotografia do casamento de um casal não pode ficar a viver na
 * pré-visualização de terceiros.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function LayoutPrivado({ children }: { children: React.ReactNode }) {
  // Sem `<main>` com o `pt-24` do sítio: aqui não há barra de navegação por
  // cima, e a página começa onde a página começa.
  return (
    <main id="conteudo" className={`flex-1 ${PLAYFAIR_DA_PROPOSTA.variable}`}>
      {/*
        ── SEM CORTINA (22/10) ─────────────────────────────────────────────

        A cortina verde do sítio também abria a proposta, e tapava-a ~2 s na
        primeira visita. Ela pediu a proposta a «aparecer logo» e, posta a
        escolha à frente, respondeu «Sai só na proposta»: no sítio fica, aqui
        sai. Com as páginas a chegarem em ~1,5 s num 4G (ver `PaginasDoPdf`),
        o pano era a parte maior da espera.

        O esqueleto do `loading.tsx` passa a ser o que se vê enquanto a
        proposta chega — o logótipo e a forma, no mesmo sítio da página real.
      */}
      {/*
        ── O RELÓGIO DA ABERTURA VIVE AQUI, NO LAYOUT ─────────────────────

        A entrada do documento estava declarada na `page.tsx`. Parece
        arrumação; não é. Um `animation-delay` conta-se a partir do instante
        em que o ELEMENTO existe — e a `page.tsx` é `force-dynamic` com
        `loading.tsx`, portanto sai num jacto POSTERIOR ao deste layout.

        Os dois relógios não eram o mesmo, e afastavam-se por tanto tempo
        quanto o servidor demorasse a ir buscar a proposta. Numa rede lenta: o
        pano sai, a proposta fica à vista fora do sítio, e só depois — com o
        casal já a ler — é que ela desliza para o lugar. Uma coisa a mexer-se
        debaixo do polegar de quem lê é exactamente o que o briefing proíbe.

        Aqui o invólucro sai no primeiro jacto, e a entrada arranca logo (já
        não espera pelo pano). Quando o documento chega tarde, a animação já
        acabou e ele aparece simplesmente no sítio.

        `backwards` e NUNCA `forwards`: isto é agora o pai de tudo o que está
        no ramo privado, e um `transform` pendurado no fim faria dele o bloco
        de contenção de qualquer `position: fixed` lá dentro — a lupa das
        fotografias, medida a 3202 px num ecrã de 780 quando isso aconteceu.
      */}
      {/*
        ── O SCROLL SUAVE, COMO NO SÍTIO (31/10) ─────────────────────────
        Ela escolheu o movimento de estúdio também na proposta: o mesmo
        Lenis do sítio, só com rato ou trackpad, nunca no toque nem com
        «reduzir movimento», parado enquanto a lupa está aberta, e com as
        âncoras da barra a deslizar (ver `SmoothScroll.tsx`).
      */}
      <SmoothScroll />
      <div className="prop-abertura">{children}</div>
      {/*
        O guião que põe o documento a mexer. Depois dos filhos, de propósito:
        quando ele corre, o que há para medir já está no documento.

        O porquê inteiro — e sobretudo porque é que ele NUNCA pode deixar uma
        proposta em branco — está no ficheiro dele.
      */}
      <MovimentoDaProposta />
    </main>
  );
}
