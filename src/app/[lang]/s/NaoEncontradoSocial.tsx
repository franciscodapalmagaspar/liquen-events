"use client";

import Link from "next/link";
import { localizeHref } from "@/lib/i18n/config";
import { useTranslations } from "@/components/LocaleProvider";
import { waHref } from "@/data";
import AvisoLegal from "@/components/AvisoLegal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O 404 DO RAMO DOS ANÚNCIOS — /s/*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O QUE ESTAVA ANTES. O `/s/[slug]` faz `notFound()` para um slug que não
 * resolve, e este ramo não tinha `not-found` nenhum. O `notFound()` subia até
 * ao do próprio Next — e MEDIDO num Chromium, em `/s/portugal`:
 *
 *   estado       404
 *   <title>      "404: This page could not be found."
 *   <html lang>  vazio
 *   <h1>         "404"
 *   ligações     0
 *
 * Uma página em inglês, sem folha de estilo, sem uma única saída, e com o
 * `lang` em branco (um leitor de ecrã não sabe em que língua a ler). Nada disto
 * é hipotético: o `[...caminho]` do ramo `(site)` existe exactamente para
 * corrigir os mesmos três sintomas — este ramo é que nunca foi visitado por
 * nenhuma das duas baterias, e ficou de fora.
 *
 * PORQUE É QUE DÓI MAIS AQUI DO QUE NO RESTO DO SÍTIO. Quem chega a `/s/…`
 * chegou de um clique PAGO. Um erro de dedo no URL final de um anúncio, uma
 * variante retirada que ainda tem criativos a correr, ou o endereço da variante
 * internacional partilhado sem o `/en` (`/s/portugal` é 404 de propósito —
 * `soEm: "en"`) põem dinheiro já gasto a aterrar num beco sem saída. E como o
 * ramo não tem barra de navegação nem rodapé por decisão de desenho, este ecrã
 * é a ÚNICA coisa que a pessoa vê.
 *
 * ── PORQUE É QUE ISTO É UM COMPONENTE DE CLIENTE ───────────────────────────
 * Um `not-found.tsx` não recebe `params`, portanto o segmento `[lang]` não
 * chega cá por essa via. A primeira tentativa foi um componente de servidor a
 * ler o cookie `liquen-lang` e o `Accept-Language` — e NÃO FUNCIONA: o
 * `/s/[slug]` declara `dynamic = "force-static"`, e nessa renderização as APIs
 * dinâmicas do Next ficam vazias. MEDIDO: `/en/s/comporta-c` com
 * `Accept-Language: en-GB` saía em português.
 *
 * A via que funciona é a que o `NotFoundView` do ramo `(site)` já usa: o
 * `LocaleProvider` do layout de raiz, que recebe a língua do SEGMENTO e a serve
 * por contexto. Sai no HTML do servidor (nada pisca, e lê-se sem JavaScript
 * depois de hidratar) e é sempre a mesma língua que o `<html lang>` do
 * documento — que é o que aqui interessa.
 */
export default function NaoEncontradoSocial() {
  const { locale, t } = useTranslations();

  return (
    <section className="min-h-[100svh] flex flex-col items-center justify-center gap-8 bg-surface px-6 py-20 text-center">
      <div>
        {/*
          `/68` e não `/60`: a `/60` sai #7f7d79 sobre branco, que a 10 px dá
          4,1:1 — MEDIDO com o axe, e abaixo dos 4,5:1 da WCAG AA. É a mesma
          disciplina do `NotFoundView` do ramo `(site)`.
        */}
        <p className="text-foreground/68 text-miuda tracking-[0.5em] uppercase mb-4">
          {t.errors.notFoundEyebrow}
        </p>
        <h1
          className="text-foreground font-bold leading-tight"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 7vw, 40px)" }}
        >
          {t.errors.notFoundTitle}
        </h1>
        <p className="mt-5 max-w-sm mx-auto text-foreground/68 text-sm leading-[1.8]">
          {t.errors.notFoundText}
        </p>
      </div>

      {/*
        Três saídas, e a ordem é a do ramo: quem vem de um anúncio decide em
        segundos, e o WhatsApp é o canal que estas páginas empurram. `min-h-12`
        nas três — são alvos de toque num ecrã que é quase sempre um telemóvel.
      */}
      <div className="flex flex-col sm:flex-row flex-wrap items-stretch justify-center gap-3 w-full max-w-sm sm:max-w-none">
        <a
          href={waHref(t.common.whatsappPrefill)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-12 items-center justify-center px-8 bg-moss text-white text-sm tracking-widest uppercase transition-colors hover:bg-moss-dark"
        >
          {t.common.falarConnosco}
        </a>
        <Link
          href={localizeHref("/orcamento", locale)}
          className="inline-flex min-h-12 items-center justify-center px-8 border border-foreground/20 text-foreground/72 text-sm tracking-widest uppercase transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {t.common.pedirOrcamento}
        </Link>
        <Link
          href={localizeHref("/", locale)}
          className="inline-flex min-h-12 items-center justify-center px-8 border border-foreground/20 text-foreground/72 text-sm tracking-widest uppercase transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {t.common.voltarInicio}
        </Link>
      </div>

      {/* O fim legal (17/11): este ramo não tem o rodapé do sítio, e o Livro
          de Reclamações, as ligações legais e a resolução de litígios são
          obrigatórios em todas as páginas. A mesma peça (`AvisoLegal.tsx`). */}
      <AvisoLegal
        lingua={locale}
        className="mt-10 text-foreground/68"
        classeDasLigacoes="alvo-toque hover:text-foreground transition-colors"
      />
    </section>
  );
}
