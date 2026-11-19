"use client";

import { memo, useState, type CSSProperties } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { IconeFacebook, IconeInstagram, IconeLinkedIn } from "@/components/IconesDasRedes";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { SITE } from "@/lib/site";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import type { ChromeDict } from "@/lib/i18n";
import { track } from "@/lib/track";
import { EASE_OUT } from "@/lib/motion/tokens";
import { useArmadilhaDoFoco } from "./useArmadilhaDoFoco";
import { DESTINOS_DO_MENU, destinoAtivo, sentidoDaPassagem } from "./destinos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MENU DO TELEMÓVEL — «CAPA» (19/11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Escolhido pelo dono entre cinco maquetas: uma fotografia de decoração a
 * ecrã inteiro, a escurecer para baixo (o mesmo véu das fotografias do site),
 * e por cima dela as cinco páginas em maiúsculas espaçadas, com a página onde
 * se está a branco e em negrito (sem números: ele, 19/11, «retira os números
 * do menu»). Depois, o «Pedir
 * proposta» de contorno (o do rodapé) e as redes AO CENTRO.
 *
 * O que ele pediu ao aprovar: sem a frase «Decoramos eventos», e o logótipo
 * do tamanho e no sítio do de todas as páginas — por isso o logótipo NÃO é
 * deste painel: é o da barra, que com o menu aberto fica como em repouso
 * (`Navbar.tsx`). Saem os cartões de serviços que o menu tinha.
 *
 * Custo: a fotografia só se pede da primeira vez que o menu abre (e fica
 * montada para o fecho se esvair com ela); quem nunca abre o menu não a
 * descarrega.
 */

const FOTO_DO_MENU = "/imagens/galeria-outubro-52.jpg";

/** O véu: escurece o topo (para o logótipo e o «fechar») e a metade de baixo
 *  (para a lista). Os mesmos tons do rodapé. */
const VEU =
  "linear-gradient(to bottom, rgba(7,8,7,0.7), rgba(7,8,7,0.25) 18%, rgba(7,8,7,0) 32%)," +
  "linear-gradient(to bottom, rgba(7,8,7,0) 28%, rgba(7,8,7,0.8) 66%, rgba(7,8,7,0.9))";

const REDE =
  "alvo-toque inline-flex items-center justify-center p-2 -m-2 text-white/65 hover:text-white transition-colors duration-300";

type Props = {
  isOpen: boolean;
  pathname: string;
  locale: Locale;
  t: ChromeDict;
  reduce: boolean;
  onClose: () => void;
};

const MenuDoTelemovel = memo(function MenuDoTelemovel({
  isOpen,
  pathname,
  locale,
  t,
  reduce,
  onClose,
}: Props) {
  const menuRef = useArmadilhaDoFoco(isOpen, onClose);

  // O toque tem resposta no mesmo instante (16/10): o destino acende e os
  // outros esmorecem enquanto a página nova se monta. Fechado o menu,
  // esquece-se o destino (ajuste no próprio render, sem efeito).
  const [destino, setDestino] = useState<string | null>(null);
  const [abertoAntes, setAbertoAntes] = useState(isOpen);
  // A fotografia monta-se na primeira abertura e fica: desmontá-la no fecho
  // cortava-a a meio do esvair.
  const [jaAbriu, setJaAbriu] = useState(isOpen);
  if (abertoAntes !== isOpen) {
    setAbertoAntes(isOpen);
    if (!isOpen) setDestino(null);
    if (isOpen && !jaAbriu) setJaAbriu(true);
  }

  // Fechado, nada pré-carrega: o painel invisível continua «à vista» para o
  // observador do `<Link>` (medido: 383 KB em `/`). Aberto, a pré-carga por
  // omissão — arranca no toque que abre o menu.
  const preCarga = isOpen ? undefined : false;

  // A cascata de entrada: uma fonte só para a lista, o botão e as redes.
  const revelar = (atraso: number): CSSProperties =>
    reduce
      ? {
          opacity: isOpen ? 1 : 0,
          transition: `opacity ${isOpen ? 0.3 : 0.15}s ${EASE_OUT}`,
        }
      : {
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "none" : "translateY(24px)",
          transition: isOpen
            ? `opacity 0.6s ${EASE_OUT} ${atraso}ms, transform 0.6s ${EASE_OUT} ${atraso}ms`
            : `opacity 0.15s ${EASE_OUT}, transform 0.15s ${EASE_OUT}`,
        };

  const novaJanela = t.common.newWindow;

  return (
    <div
      ref={menuRef}
      // Recebe o foco à abertura, só por programa (ver `useArmadilhaDoFoco`).
      tabIndex={-1}
      role="dialog"
      // Não modal para os leitores de ecrã: a barra (idiomas, «fechar») fica à
      // vista por cima do painel e tem de ser alcançável; o foco fica preso ao
      // menu e à barra pela armadilha do `Tab` (`useArmadilhaDoFoco`).
      aria-modal={false}
      aria-label={t.nav.menuLabel}
      aria-hidden={!isOpen}
      // `100dvh`: a altura VISÍVEL, para o fim do painel não ficar por trás da
      // barra do browser quando ela aparece.
      className={`lg:hidden fixed inset-x-0 top-0 h-[100dvh] -z-10 flex flex-col bg-[#0c0e0b] transition-[opacity,visibility] duration-500 ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
      }`}
    >
      {jaAbriu && (
        <SafeImage
          src={FOTO_DO_MENU}
          alt=""
          fill
          sizes="100vw"
          quality={70}
          className="object-cover"
        />
      )}
      <div aria-hidden className="absolute inset-0" style={{ backgroundImage: VEU }} />

      {/* A lista encosta ao fundo; num ecrã baixo (telemóvel deitado) o painel
          rola por dentro em vez de cortar. A área que rola COMEÇA abaixo da
          barra (e não por baixo dela com `pt`): a barra é transparente, e ao
          rolar os links passavam por trás do logótipo — e um toque nessa faixa
          caía no logótipo e ia para a entrada (revisão de 19/11). O esbatido
          dos primeiros 24 px faz a lista sumir em vez de ser cortada a direito. */}
      <div className="relative flex-1 min-h-0 mt-[calc(150px+env(safe-area-inset-top))] overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,black_24px)]">
        <div
          className="min-h-full flex flex-col justify-end pt-6 pl-[calc(2rem+env(safe-area-inset-left))] pr-[calc(2rem+env(safe-area-inset-right))]"
          style={{ paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
        >
          <nav aria-label={t.nav.menuLabel}>
            {DESTINOS_DO_MENU.map(({ href, chave }, i) => {
              const aqui = destinoAtivo(pathname, href);
              const aceso = destino ? destino === href : aqui;
              const esmorece = destino !== null && destino !== href;
              return (
                <Link
                  key={href}
                  href={localizeHref(href, locale)}
                  prefetch={preCarga}
                  transitionTypes={[sentidoDaPassagem(pathname, href)]}
                  onClick={() => setDestino(href)}
                  aria-current={aqui ? "page" : undefined}
                  className={`alvo-toque flex justify-start items-baseline text-[25px] leading-[1.62] uppercase transition-colors duration-300 ${
                    aceso
                      ? "text-white font-semibold tracking-[0.2em]"
                      : "text-white/60 font-light tracking-[0.26em] hover:text-white"
                  }`}
                  style={
                    esmorece
                      ? { ...revelar(0), opacity: 0.3, transition: `opacity 0.15s ${EASE_OUT}` }
                      : revelar(80 + i * 60)
                  }
                >
                  {t.nav[chave]}
                </Link>
              );
            })}
          </nav>

          <div style={revelar(80 + DESTINOS_DO_MENU.length * 60)}>
            <Link
              href={localizeHref("/orcamento", locale)}
              onClick={() => track("CTAClick", { source: "nav-mobile" })}
              className="toque alvo-toque group mt-8 flex items-center justify-between w-full border border-white/35 px-5 py-3.5 text-white/90 text-miuda tracking-[0.25em] uppercase transition-colors duration-300 hover:bg-white hover:text-[#0c0e0b] hover:border-white"
            >
              <span>{t.nav.pedirOrcamento}</span>
              <span
                aria-hidden
                className={
                  reduce ? "" : "transition-transform duration-300 group-hover:translate-x-1"
                }
              >
                →
              </span>
            </Link>

            {/* As redes ao centro (pedido dele, 19/11), com o traço do rodapé. */}
            <div className="mt-7 flex items-center justify-center gap-8">
              <a
                href={SITE.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram (${novaJanela})`}
                className={REDE}
              >
                <IconeInstagram />
              </a>
              <a
                href={SITE.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Facebook (${novaJanela})`}
                className={REDE}
              >
                <IconeFacebook />
              </a>
              {SITE.linkedin ? (
                <a
                  href={SITE.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`LinkedIn (${novaJanela})`}
                  className={REDE}
                >
                  <IconeLinkedIn />
                </a>
              ) : null}
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp (${novaJanela})`}
                className={REDE}
              >
                <WhatsAppIcon className="w-[19px] h-[19px]" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export default MenuDoTelemovel;
