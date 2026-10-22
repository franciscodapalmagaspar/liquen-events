import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { getDictionary, htmlLang, localizeHref, LANG_COOKIE, type Locale } from "@/lib/i18n";
import { CABECALHO_DA_LINGUA } from "@/lib/lingua-do-pedido";
import { waHref } from "@/data";
import NotFoundConteudo from "./[lang]/(site)/NotFoundConteudo";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O 404 DO SÍTIO — COM ESTADO 404 E LEGÍVEL SEM JAVASCRIPT (auditoria externa)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os endereços que não existiam respondiam 200. Havia uma rota apanha-tudo em
 * `(site)/[...caminho]` que DESENHAVA o `NotFoundView`, e não podia fazer
 * outra coisa: debaixo do `loading.tsx` do `(site)` a resposta vai em
 * streaming e o estado 200 já seguiu quando a página corre. E `/.env` ou
 * `/backup.zip` (um só segmento, com ponto) nem lá chegavam: passavam pelo
 * `[lang]`, que aceitava qualquer valor, e saía a PÁGINA INICIAL com 200.
 *
 * Medido com `notFound()` num grupo sem `loading.tsx`: o estado passava a 404,
 * mas o corpo vinha vazio (`<div hidden><!--$--><!--/$--></div>`) e o 404 só se
 * desenhava depois de o JavaScript chegar — sem JavaScript, um ecrã em branco.
 *
 * Este ficheiro é a saída que a documentação do Next indica para um layout de
 * raiz num segmento dinâmico (`app/[lang]/layout.tsx`): o Next não renderiza
 * rota nenhuma, devolve esta página pronta com 404. Ligado em next.config.ts
 * (`experimental.globalNotFound`). Recebe tudo o que não casa com rota nenhuma:
 *   · um `[lang]` que não seja `pt` nem `en` (`dynamicParams = false` no
 *     layout de `[lang]`) — `/.env`, `/backup.zip`;
 *   · e qualquer caminho sem página — `/pagina-que-nao-existe`, `/en/x/y`.
 *
 * Como não passa pelo layout, traz o que precisa: a folha global, as duas
 * fontes do primeiro ecrã, o logótipo a levar ao início, o corpo de sempre do
 * 404 (`NotFoundConteudo`) e o WhatsApp. A língua não vem de parâmetros (não
 * há) — ver `lingua()`, logo abaixo.
 *
 * ── SEM COMPONENTES CLIENTE, E É DE PROPÓSITO ─────────────────────────────
 * A primeira versão punha à volta o cromado inteiro do sítio (menu, rodapé,
 * flutuantes). O Next junta os componentes cliente do 404 global ao pacote de
 * TODAS as rotas: a proposta do casal passou de 160 KB para 185 KB e o painel
 * de 520 para 548 — o `scripts/peso-das-rotas.mjs` parou o CI. Aqui só há
 * servidor: o `next/link` do corpo já vai em todas as páginas de qualquer
 * maneira. O preço é este 404 não ter o menu: tem o logótipo, os sete
 * caminhos do corpo e o WhatsApp.
 */

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  fallback: [
    "system-ui",
    "-apple-system",
    "Segoe UI",
    "Roboto",
    "Helvetica Neue",
    "Arial",
    "sans-serif",
  ],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal"],
  display: "swap",
  adjustFontFallback: true,
  fallback: ["Georgia", "Times New Roman", "Times", "serif"],
});

/**
 * A língua do 404: o cabeçalho do proxy primeiro, o cookie depois.
 *
 * ERA SÓ O CABEÇALHO, porque o proxy corria em todos os pedidos de página e
 * escrevia-o sempre: `en` em `/en/…`, e no caminho nu a língua do cookie
 * (o mesmo cookie que o reescrevia para `/en/…` ou `/pt/…`).
 *
 * O caminho nu deixou de passar pelo proxy — a reescrita é agora um
 * `rewrites()` do next.config, que não sabe pôr cabeçalhos no pedido (ver
 * `src/lib/rotas-da-lingua.ts`). Sem esta segunda linha, quem escolheu inglês
 * e abre um endereço partido (`/pagina-que-nao-existe`, um link antigo com uma
 * gralha) passava a receber o 404 em português. O cookie é a MESMA fonte que a
 * reescrita usa, portanto a resposta é a mesma de antes. Ler o cookie não
 * custa nada: esta página já é dinâmica por ler o cabeçalho.
 *
 * A diferença que fica, e só em endereços-lixo: os que o proxy deixava passar
 * sem cabeçalho nenhum — com «extensão» (`/backup.zip`, `/wp-login.php`,
 * `/servicos/x.jpg`, `/en/x.jpg`) ou dentro das pastas de ficheiros
 * (`/imagens/…`, `/_img/…`) — respondiam SEMPRE em português, e para quem tem
 * o cookie `en` passam a responder em inglês. Para um caminho nu com
 * extensão (`/backup.zip`) é até a consequência directa da reescrita: ele
 * agora é reescrito para `/en/backup.zip`, como qualquer outro.
 */
async function lingua(): Promise<Locale> {
  const doProxy = (await headers()).get(CABECALHO_DA_LINGUA);
  if (doProxy) return doProxy === "en" ? "en" : "pt";
  return (await cookies()).get(LANG_COOKIE)?.value === "en" ? "en" : "pt";
}

/**
 * O título é FIXO, e de propósito sem língua. Lê-lo do cabeçalho (como o corpo)
 * tornava estes metadados dinâmicos, e o Next deixava de os usar como recurso
 * para os 404 pré-gerados de outros ramos — o `/s/portugal` (variante que só
 * existe em inglês) passava a sair com o título da página inicial. «404» lê-se
 * nas duas línguas. Completo à mão: aqui não há o molde `%s | Líquen Events` do
 * layout de raiz, que é o que punha a marca duas vezes no 404 de antes.
 */
export const metadata: Metadata = {
  title: "404 | Líquen Events",
  robots: { index: false, follow: false },
};

export default async function GlobalNotFound() {
  const locale = await lingua();
  const t = getDictionary(locale);
  return (
    <html lang={htmlLang(locale)} className={`${inter.variable} ${playfair.variable}`}>
      <body className="flex flex-col min-h-screen antialiased bg-surface">
        <header className="flex justify-center px-6 pt-8">
          <a href={localizeHref("/", locale)} aria-label={t.common.voltarInicio}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/_img/l/logo-liquen-256.webp" alt="Líquen Events" width={148} height={88} />
          </a>
        </header>
        <main id="conteudo" className="flex-1">
          <NotFoundConteudo locale={locale} t={t} />
        </main>
        <footer className="pb-10 text-center">
          <a
            href={waHref(t.common.whatsappPrefill)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground/68 hover:text-moss text-xs tracking-[0.2em] uppercase transition-colors"
          >
            {t.common.contactWhatsApp}
          </a>
        </footer>
      </body>
    </html>
  );
}
