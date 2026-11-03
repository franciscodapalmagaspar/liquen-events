"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, htmlLang, type Locale } from "@/lib/i18n/config";
import { useTranslations } from "./LocaleProvider";

/**
 * PT | EN switch. Navigates to the chosen language's URL space — English lives
 * under /en/* (shareable & crawlable), Portuguese at the un-prefixed path — and
 * writes the cookie so the choice sticks. `light` mirrors the navbar's dark-hero
 * treatment so it stays legible over imagery.
 */
const INGLES_NUM_CAMINHO_NU = "liquen-ingles-num-caminho-nu";

export default function LanguageToggle({ light = false }: { light?: boolean }) {
  const { locale, t } = useTranslations();
  // O idioma pedido, enquanto a troca não chega: o toque foi recebido.
  const [pedido, setPedido] = useState<Locale | null>(null);
  const pending = pedido !== null && pedido !== locale;

  const router = useRouter();
  // Inglês servido num caminho SEM `/en` (o proxy reescreve-o pelo cookie): a
  // cache do router fica com uma página inglesa guardada num endereço que, a
  // partir da troca, passa a ser português. Marca-se a sessão, e nela a troca
  // volta a ser uma navegação inteira (ver `choose`).
  useEffect(() => {
    if (locale !== "en" || /^\/en(\/|$)/.test(window.location.pathname)) return;
    try {
      sessionStorage.setItem(INGLES_NUM_CAMINHO_NU, "1");
    } catch {
      /* armazenamento bloqueado: fica a navegação do sítio */
    }
  }, [locale]);
  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // English lives at /en/* (shareable & crawlable), Portuguese at the bare path.
    const bare = window.location.pathname.replace(/^\/en(?=\/|$)/, "") || "/";
    const dest = next === "en" ? (bare === "/" ? "/en" : `/en${bare}`) : bare;
    setPedido(next);
    // ── SEM RECARREGAR (1/11) ─────────────────────────────────────────────
    // Era um `location.assign`: a página inteira caía e voltava — branco,
    // depois o preto da capa, depois a fotografia, e o vídeo recomeçava noutro
    // take. Ela: «ficou tudo bugado, tudo preto, eu quero tudo super suave».
    //
    // Agora é uma navegação do próprio sítio, como qualquer outra ligação: o
    // layout de `[lang]` volta a desenhar-se com o idioma novo (o `lang` do
    // `<html>`, o dicionário, os metadados), a página fica onde estava, e o
    // vídeo da entrada CONTINUA — é o mesmo motor que já o mantém vivo entre
    // páginas (`motorDaSessao`, EntradaEmVideo). O `lang` do `<html>` vai já
    // aqui, para o leitor de ecrã não ler a página nova com a pronúncia velha
    // durante o instante em que ela chega.
    //
    // Dois casos ficam com a navegação inteira (que já não pisca: o fundido
    // entre documentos e a capa desfocada, em globals.css e na página inicial):
    // quando o endereço não muda (inglês num caminho nu → o mesmo caminho em
    // português), e quando a sessão já guardou uma página inglesa num caminho
    // nu (ver o efeito acima) — a cache do router podia servi-la em português.
    const alvo = dest + window.location.search + window.location.hash;
    let inteira = dest === window.location.pathname;
    try {
      inteira ||= sessionStorage.getItem(INGLES_NUM_CAMINHO_NU) === "1";
    } catch {
      /* sem armazenamento: a navegação do sítio */
    }
    if (inteira) {
      window.location.assign(alvo);
      return;
    }
    document.documentElement.lang = htmlLang(next);
    router.push(alvo, { scroll: false });
    // A REDE (1/11, à noite). Ela: «o site online em inglês não funciona». No
    // Chrome a troca chega em ~0,3 s; o Safari do iPhone não se consegue medir
    // daqui. Se em 1,5 s o endereço ainda não é o pedido, a navegação do sítio
    // não chegou: faz-se a inteira, que funciona sempre.
    window.setTimeout(() => {
      if (window.location.pathname !== dest) window.location.assign(alvo);
    }, 1500);
  }
  // px/py enlarge the hit area to the 24×24 minimum (WCAG 2.5.8); the negative
  // vertical margin keeps the navbar's height unchanged.
  //
  // `alvo-toque` leva os dois de 31×29 para 44×44 NO DEDO, e só no dedo (ver
  // globals.css). MEDIDO a 375 px com toque emulado, antes: 31×29 px cada — dois
  // terços da altura mínima, encostados um ao outro, e presentes em TODAS as
  // páginas do sítio. É também o alvo mais fácil de falhar por engano de todos:
  // errar o PT e acertar no EN recarrega a página inteira noutro idioma.
  // Com rato o toggle fica exactamente como estava.
  const base =
    "alvo-toque px-1.5 py-1.5 -my-1.5 text-[11px] tracking-[0.2em] uppercase transition-colors duration-300";
  const activeCls = light ? "text-white" : "text-moss";
  const idleCls = light
    ? "text-white/60 hover:text-white/90"
    : "text-foreground/68 hover:text-moss";

  return (
    <div
      className={`flex items-center gap-1.5 pointer-coarse:gap-0 ${pending ? "opacity-60" : ""}`}
      role="group"
      aria-label={t.langToggle.label}
    >
      <button
        type="button"
        onClick={() => choose("pt")}
        aria-pressed={locale === "pt"}
        // Accessible name must contain the visible text ("PT") — WCAG 2.5.3
        // Label in Name — so speech-input users can target it and the two names
        // don't conflict. Visible text first, then the action for context.
        aria-label={`${t.langToggle.pt}: ${t.langToggle.switchToPt}`}
        className={`${base} ${locale === "pt" ? activeCls : idleCls}`}
      >
        {t.langToggle.pt}
      </button>
      <span className={light ? "text-white/25" : "text-foreground/20"} aria-hidden>
        /
      </span>
      <button
        type="button"
        onClick={() => choose("en")}
        aria-pressed={locale === "en"}
        aria-label={`${t.langToggle.en}: ${t.langToggle.switchToEn}`}
        className={`${base} ${locale === "en" ? activeCls : idleCls}`}
      >
        {t.langToggle.en}
      </button>
    </div>
  );
}
