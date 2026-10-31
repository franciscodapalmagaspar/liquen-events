# Inventário do site público da Líquen Events

Descrição factual do código do sítio público (`liquen-events.com`), sem juízos nem recomendações. Feita a 31/10/2026 a partir do ramo `melhoria/nivel-estudio` (PR #319), já com as Fases 1, 2 e 3 do pedido «nível estúdio». Os caminhos são relativos à raiz do repositório. Onde algo não foi confirmado, está escrito «não verificado».

O inventário foi lido no código, com `ls`, `grep`, `wc` e `ffprobe`. Dois pontos foram depois confirmados (num browser a correr o ramo, ou no ficheiro), e estão marcados como confirmados. Os números de desempenho não estão aqui: estão em `docs/medicoes/RESUMO.md`.

---

## 1. Pilha, versões e alojamento

### Gestor de pacotes e ambiente
- **npm** (`package-lock.json`, `lockfileVersion: 3`). Não há `pnpm-lock`, `yarn.lock` nem `bun.lock`.
- Node: `.nvmrc` = `22`; `engines.node` = `>=20`.
- `husky` + `lint-staged` (prettier + eslint antes de cada commit).

### Dependências de execução (`dependencies`, versões do `package.json`; as instaladas estão entre parênteses quando diferem)
| Pacote | Versão |
|---|---|
| next | 16.4.3 |
| react / react-dom | 19.2.4 |
| gsap | 3.15.0 |
| lenis | 1.3.27 |
| @dnd-kit/core · /modifiers · /sortable · /utilities | ^6.3.1 · ^9.0.0 · ^10.0.0 · ^3.2.2 |
| @pdf-lib/fontkit | ^1.1.1 |
| @simplewebauthn/browser · /server | ^13.3.0 · ^13.3.2 |
| @supabase/supabase-js | ^2.106.2 |
| @types/nodemailer | ^8.0.0 |
| bcryptjs | ^3.0.3 |
| country-flag-icons | 1.6.20 |
| hyphen | ^1.14.1 |
| libphonenumber-js | 1.13.15 |
| nodemailer | ^10.2.1 |
| pdf-lib | ^1.17.1 |
| pdfjs-dist | ^6.2.108 |
| sharp | ^0.35.4 (instalado 0.35.5) |
| web-push | ^3.6.7 |
| web-vitals | ^4.2.4 |
| zod | ^4.6.7 |

Do lado do sítio público usam-se sobretudo: `next`, `react`, `gsap` (+ `@gsap/react`, só registado), `lenis`, `libphonenumber-js` e `country-flag-icons` (campo de telefone), `hyphen` (hifenização no servidor), `web-vitals`, `zod` (validação na API). As restantes servem o back office, o PDF e as propostas.

### Dependências de desenvolvimento relevantes
- `tailwindcss` ^4 (instalado **4.3.0**) + `@tailwindcss/postcss` ^4.
- `@playwright/test` e `playwright` ^1.60.0; `@axe-core/playwright` ^4.11.3.
- `vitest` ^4.1.7, `@vitest/coverage-v8`, `jsdom` ^29, `@testing-library/react` ^16.3.2, `@testing-library/jest-dom`, `@testing-library/user-event`.
- `eslint` ^9 + `eslint-config-next` 16.2.11; `prettier` ^3.8.3; `typescript` ^5; `@next/bundle-analyzer`.
- **Não existe** `framer-motion`/`motion`, `@vercel/analytics` nem `@vercel/speed-insights` (ver §15).

### Alojamento e configuração
- **Vercel** (conta grátis/Hobby, segundo `scripts/vercel-construir.mjs`). `vercel.json`: `ignoreCommand` (`scripts/vercel-construir.mjs` decide que publicações se constroem) e dois `crons` (ambos do back office).
- Alternativa em contentor: `Dockerfile` (Node 22 Alpine) com `output: "standalone"` só quando `BUILD_STANDALONE=1`.
- `next.config.ts` (877 linhas, muito comentado):
  - `images`: `loader: "custom"` com `loaderFile: ./src/lib/site-image-loader.ts` (o `/_next/image` deixa de existir — devolve 404 com loader custom); `formats: ["image/webp"]`; `qualities: [50, 55, 65, 70, 72, 75]`; `deviceSizes: [360…1920]`; `imageSizes: [16…384]`; `minimumCacheTTL` de um ano.
  - `experimental.globalNotFound: true` e `experimental.inlineCss: true` (o CSS vai dentro do HTML).
  - `poweredByHeader: false`, `reactStrictMode: true`, sem source maps em produção, `devIndicators: false`.
  - Cabeçalhos de segurança aplicados a todas as rotas (CSP, HSTS, Permissions-Policy, COOP/CORP, etc. — não detalhados aqui).
  - `Cache-Control: public, max-age=31536000, immutable` para `/imagens/*`, `/videos/*`, `/logos/*`, `/_img/*` e para a imagem OG e os ícones PWA; `private, no-cache` para `/proposta/:token`.
  - `redirects()`: endereços antigos (`/eventos`, `/serviços`, `/contactos`, `/portfólio-de-eventos`) → novos, e `www.` → domínio sem `www`, todos 308.
- `src/proxy.ts` (o «middleware» do Next 16): faz o encaminhamento de língua (ver §2.1), redirecciona `/pt/*` → `/*` (308) e `/admin` → `/orcamento/admin`.
- `src/instrumentation.ts`: valida a configuração de ambiente no arranque do servidor.

---

## 2. Rotas públicas

### 2.1 Como funciona o i18n
- Duas línguas: `pt` (por omissão, servida em `/`) e `en` (espelho em `/en/*`). Configuração em `src/lib/i18n/config.ts`; dicionários em `src/lib/i18n/pt.ts` (919 linhas) e `src/lib/i18n/en.ts` (799 linhas); acesso por `getDictionary(locale)` em `src/lib/i18n/index.ts`.
- Internamente as páginas vivem em `src/app/[lang]/…` (`generateStaticParams` com `pt` e `en`, `dynamicParams = false`): ambas as línguas são pré-renderizadas.
- `src/proxy.ts` reescreve `/` → `/pt` (ou `/en` se o cookie `liquen-lang=en` existir) e grava esse cookie ao visitar `/en/*`. Logo, um visitante que já abriu `/en` vê inglês ao voltar a `/` (confirmado num browser a 31/10: depois de abrir `/en`, `/servicos` mostra o título inglês).
- `localizeHref()` prefixa `/en` aos links; `LocaleProvider` + `pickChromeDict()` (`nav`, `langToggle`, `common`, `errors`, `footer`) passam só a parte do dicionário que o cromado precisa ao cliente.
- `<html lang>` = `pt-PT` ou `en`. Botão de língua: `src/components/LanguageToggle.tsx` (no `Navbar`).
- Testes do dicionário: paridade PT/EN (`parity.test.ts`), proibição de travessões no texto (`no-dashes*.test.ts`), entre outros, em `src/lib/i18n/`.

### 2.2 Cromado comum (`src/app/[lang]/(site)/layout.tsx` → `src/components/CromadoDoSitio.tsx`)
Montado em todas as páginas do grupo `(site)`, por esta ordem: `SmoothScroll`, `SpeculationRules`, `HeroWarm`, `ServiceWorkerRegister`, `ErrosDoSite`, ligação «saltar para o conteúdo», `ScrollProgress`, `LinhaDeCarregamento`, `AnelSoDoTeclado`, `MolaAoLargar`, `StickyCTA`, `Navbar`, `<main id="conteudo" tabIndex={-1}>` com `PageTransition`, `Footer`, `WhatsAppButton`. A «cortina» de entrada foi retirada do sítio público a 30/10 (continua no back office).

O layout de raiz (`src/app/[lang]/layout.tsx`) acrescenta a todas as rotas: tipos de letra, `StructuredData`, `Analytics` (Plausible), `GoogleTag`, `LeadSourceCapture`, `WebVitals`, `ConsentBanner`, e um script em linha no `<head>` que marca `com-javascript`, `consentimento-decidido` e `fontes-por-assentar` no `<html>` antes da primeira pintura.

- **Navbar** (`src/components/Navbar.tsx`, 903 linhas): itens Sobre, Serviços, Galeria, Clientes, Contacto (+ atalhos para Casamentos e Eventos Corporativos); transparente sobre heróis escuros, fundo `moss-dark` depois de 30 px de scroll; menu em ecrã inteiro como `role="dialog"` com `aria-modal`, armadilha de Tab, Escape, `inert` no `main` e no rodapé, foco devolvido ao botão; CTA com `Magnetic`.
- **Footer** (`src/components/Footer.tsx`): CTA para `/orcamento`, Instagram, Facebook, LinkedIn (`IconesDasRedes.tsx`), WhatsApp, lista de serviços, email, telefone (`TrackedAnchor`), Livro de Reclamações Eletrónico, Privacidade, Termos, «Gerir cookies» (`ManageCookiesLink.tsx`).
- **StickyCTA** (`src/components/StickyCTA.tsx`): «Pedir orçamento» flutuante que aparece depois de ~75% de um ecrã de scroll e se esconde no rodapé.
- **WhatsAppButton** (`src/components/WhatsAppButton.tsx`): pílula flutuante, aparece com 1,5 s de atraso.

### 2.3 Páginas do grupo `(site)` — secções por ordem
Todas têm espelho em `/en/…` com o mesmo código e o texto do dicionário inglês. Os heróis usam `HeroImage` + `Parallax`; o `<h1>` dos heróis interiores usa `TituloPalavraAPalavra`; os títulos de secção mais abaixo usam `RevealText`; os blocos entram com `AnimateIn`/`Reveal`.

| Rota | Ficheiro | Secções (por ordem) e componentes |
|---|---|---|
| `/` | `src/app/[lang]/(site)/page.tsx` | 1) Herói 100svh fundo `#080808`: fotografia `entrada-floresta-clara.jpg` (`HeroImage priority`) + `EntradaEmVideo` por cima, dentro de `Parallax drift`; `<h1>` em maiúsculas com a última palavra a musgo; duas ligações («Pedir orçamento», «Ver galeria»). 2) `ClientMarquee` (fita de logótipos). 3) Três painéis de serviço a toda a largura (Casamentos, Eventos Corporativos, Serviços), cada um com `Reveal variant="zoom"`, `<h2>`, botão de contorno e `SetaDeDescer` (excepto o último). 4) CTA final sobre fotografia com `RevealText`, texto e dois botões. Metadados vêm do layout de raiz (`t.meta.homeTitle`). |
| `/sobre` | `sobre/page.tsx` | Herói 100svh; manifesto (imagem + texto, `RevealText`); faixa de declaração sobre foto com `TitleReveal`; secção da fundadora (`Reveal`); CTA final. `BreadcrumbJsonLd`. |
| `/servicos` | `servicos/page.tsx` | Herói; duas categorias («Celebrações» 01, com Casamentos, Batizados e Comunhões, Festas e Aniversários, Aluguer de Viaturas Clássicas; «Empresas» 02, com Eventos Corporativos), cada uma com painel de abertura em ecrã inteiro e uma faixa (`ServiceBand`) por serviço; bloco de texto SEO (`ts.seoTitle`); CTA final. `BreadcrumbJsonLd` + `ServiceJsonLd`. Hifenização no servidor (`src/lib/hifenizar.ts`). |
| `/servicos/[slug]` | `servicos/[slug]/page.tsx` | 5 serviços de `src/lib/services-data.ts`: `casamentos`, `aluguer-de-viaturas-classicas`, `eventos-corporativos`, `festas-e-aniversarios`, `batizados-e-comunhoes`. Secções: herói 70svh; introdução + «o que inclui» + CTA; faixa de viaturas clássicas (só em casamentos); portefólio (`pickServiceGallery`, `Reveal`); FAQ sobre fotografia (quando há); serviços relacionados; CTA final. `BreadcrumbJsonLd`, `ServiceJsonLd`, `FaqJsonLd`. `revalidate = 86400`. |
| `/galeria` | `galeria/page.tsx` + `GaleriaClient.tsx` | Herói 100svh (80svh em `lg`); galeria escura (ver §6); CTA do Instagram. `TempoNaGaleria` (mede o tempo passado), JSON-LD `ItemList` de `ImageObject` com as 12 primeiras fotografias, `BreadcrumbJsonLd`, `<link rel="preload" as="image" type="image/avif">` para a primeira foto (telemóvel e ecrã grande). |
| `/clientes` | `clientes/page.tsx` | Herói; `ClientMarquee`; declaração; grelha de logótipos (`ClientLogoGrid`, 19 logótipos em `src/data/index.ts`); grelha de testemunhos (4, do dicionário); mosaico de fotografias (`RotatingPhotoGrid`); CTA sobre fotografia. |
| `/contacto` | `contacto/page.tsx` + `contacto/FAQ.tsx` | Herói; canais directos (esquerda) + chamada para o formulário único `/orcamento` (direita), com `RatingBadge` (média 5,0, sem contagem); faixa de três imagens; «o que acontece a seguir»; FAQ em acordeão (`aria-expanded`, 6 perguntas em PT) sobre fotografia; CTA do WhatsApp. `BreadcrumbJsonLd` + `FaqJsonLd`. Não há formulário nesta página. |
| `/orcamento` | `orcamento/page.tsx` + `OrcamentoForm.tsx` | Formulário de pedido de orçamento com painel de imagem à esquerda (ver §7). Envolto em `data-orcamento-mode` (`orcamento/layout.tsx`); `PageTransition` não anima esta rota. |
| `/orcamento/confirmacao/[id]` | `orcamento/confirmacao/[id]/page.tsx`, `ConfirmacaoClient.tsx`, `loading.tsx` | Confirmação do pedido; `noindex, nofollow`; título localizado; dispara a conversão (§9). |
| `/privacidade`, `/termos` | `privacidade/page.tsx`, `termos/page.tsx` | Texto legal via `legal/LegalDocView.tsx` e `legal/legal-content.ts`; `BreadcrumbJsonLd`. |

### 2.4 Páginas de anúncios (Google) — `src/lib/ads/polos.ts`
Dentro do grupo `(site)` (com o cromado normal). Todas usam `PedidoRapido` (formulário curto) no herói e `BreadcrumbJsonLd`; título SEO vem do catálogo (`conteudoPolo`). Slug inexistente → `notFound()` + `noindex`.
- **`/casamentos/[polo]`** (`casamentos/[polo]/page.tsx`) — **13 pólos**: `alentejo`, `lisboa`, `algarve`, `porto-douro`, `comporta`, `minho`, `centro`, `oeste`, `ribatejo`, `madeira`, `tras-os-montes`, `beira-interior`, `acores`. Secções: 1) herói 92svh com formulário; 2) espaços da região (quando há); 3) portefólio; 4) «saídas» (ligações).
- **`/casamentos/estilo/[estilo]`** — **3 estilos**: `minimalista`, `boho`, `campo`. Herói com formulário; secção de conteúdo; lista de pólos.
- **`/casamentos/destination`** — 1 página (casamentos de destino): herói com formulário; secções de conteúdo; lista dos pólos.
- Total: **17 páginas** × 2 línguas = 34 URLs, todas no sitemap.

### 2.5 Páginas de anúncios (Meta) — `/s/[slug]`
`src/app/[lang]/s/[slug]/page.tsx`, dados em `src/lib/meta/variantes.ts`. **Fora** do cromado do sítio (`s/layout.tsx`: sem menu, rodapé, transições nem barra de progresso), `robots: noindex, follow`, **sem canónico nem hreflang**, `force-static`. 5 variantes (`comporta`, `alentejo`, `lisboa`, `algarve`, `portugal` — esta só em inglês, `soEm: "en"`), cada uma com dois «ganchos» (`slug` e `slug-b`) = 10 caminhos. Componentes: `MetaPixel`, `BarraFixa`, `VideoCiclo`, `PedidoRelampago` (4 campos), `RatingBadge`. Página 404 própria (`s/not-found.tsx`, `NaoEncontradoSocial.tsx`).

### 2.6 Outras rotas públicas
- `/proposta/[token]` — página web privada de cada proposta (grupo `(privado)`), sem cromado do sítio e com `Cache-Control: private, no-cache`.
- `/llms.txt` — `src/app/llms.txt/route.ts`, `force-static`, `text/plain`, `max-age=3600, s-maxage=86400`. Texto em inglês: resumo da empresa, avaliação, contacto, Instagram, lista das páginas PT, do espelho EN e das legais.
- `/robots.txt` — `src/app/robots.ts` (§8).
- `/sitemap.xml` — `src/app/sitemap.ts` (§8).
- `/manifest.webmanifest` — `src/app/manifest.ts`: `display: standalone`, `lang: pt-PT`, `start_url: /`, fundo e tema `#ffffff`, ícones 192, 512 e 512 maskable (`public/icon-*.png`).
- Ícones: `src/app/favicon.ico`, `src/app/icon.png`, `src/app/apple-icon.png`; `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (gerados por `scripts/gen-favicons.mjs`). `appleWebApp` com título «Líquen».
- Imagem OG: `public/og-liquen-2026.jpg` (196 553 B, 1200×630, feita pela dona). **Não há** `opengraph-image.tsx` nem `twitter-image` gerados por código.
- 404: `src/app/global-not-found.tsx` (estado 404 real, legível sem JS, corpo em `NotFoundConteudo.tsx`), `src/app/[lang]/(site)/not-found.tsx` (título «404 | Líquen Events», `noindex`), `NotFoundView.tsx`.
- Erros: `src/app/[lang]/(site)/error.tsx`, `src/app/global-error.tsx` (HTML e estilos próprios).
- Espera: `src/app/[lang]/(site)/loading.tsx` (ecrã escuro que imita o fundo dos heróis), `orcamento/confirmacao/[id]/loading.tsx` (esqueleto).
- `public/offline.html` (página sem rede do service worker) e `public/.well-known/security.txt`.

---

## 3. Sistema de design do sítio público

### Tipos de letra (`src/app/[lang]/layout.tsx`)
- `next/font/google`, auto-alojados (servidos pelo próprio domínio), `subsets: ["latin"]`, variáveis (um ficheiro por família), `display: "swap"`, `adjustFontFallback: true`, pilhas de recurso métricas.
  - **Inter** → `--font-inter` → `--font-sans` (texto).
  - **Playfair Display** romano → `--font-playfair` → `--font-display`.
  - **Playfair Display itálico** → `--font-playfair-italico`, `preload: false` (só usado na confirmação do pedido).
  - **Archivo** → `--font-spacex`, `preload: false` (só no back office).
- A barra de cookies espera pelas fontes (`fontes-por-assentar`, tecto de 2,5 s) para não saltar.
- Títulos: maiúsculas, `.tracking-display` (`src/app/globals.css:1335`), tamanhos com `clamp()` escritos em linha (ex.: herói da página inicial `clamp(40px, 7vw, 88px)`); variáveis `--hero-display`, `--hero-section`, `--hero-detail` em `:root`.

### Ficheiros de estilo
- `src/app/globals.css` (4 116 linhas): `@import "tailwindcss"`, `@source not` para pastas que não desenham (admin, docs, testes, scripts…), `@import "./tema.css"`, regras base, utilitários próprios, animações.
- `src/app/tema.css` (589 linhas): o `@theme` do Tailwind v4 partilhado pelo sítio e pelo back office.
- `src/app/admin.css` (3 200 linhas): só no back office.

### Tokens de cor
- `@theme` (`tema.css`): `--color-cream #f7f4ee`, `--color-cream-dark #ece7dc`, `--color-ink #2a2620`, `--color-moss #637a5f`, `--color-moss-light #86997f`, `--color-moss-dark #4c6150`, `--color-noite #12160f`, `--color-gold #d6ab3a`, `--color-gold-dark #b88f28`, `--color-gold-text #8a6a1d`, `--color-surface #ffffff` (+ `-raised`, `-elevated`), `--color-foreground #2a2620`, escala `--color-sage-50…900`.
- `:root` (`globals.css`): família semântica `--bg-base/surface/elevated/elevated-2/subtle`, `--fg-primary/secondary/tertiary/placeholder` (com contraste anotado: 15,8:1, 5,9:1, 4,7:1), `--border`, `--border-strong`, `--accent #4c6752` (6,2:1), `--accent-hover`, `--accent-subtle`, `--focus-ring`, `--success/--warning/--danger/--info`, `--glass-*`, `--shadow-raised`, `--shadow-overlay`.
- Véus sobre fotografias escritos como gradientes em linha nas páginas (ex.: `PANEL_VEIL`, `VEU_DAS_PONTAS` em `src/lib/ui-classes.ts`, `.veu-texto`, `.text-veil-shadow`).
- `theme-color` do browser: `#f7f4ee` (claro) e `#1b2119` (escuro); `colorScheme: "light"`.

### Espaço, raio, tipo
- `--spacing: 0.25rem`.
- Raios: `--radius-badge 6px`, `--radius-control 10px`, `--radius-tile 12px`, `--radius-card 16px`, `--radius-panel 20px`, `--radius-sheet 26px`.
- Escala tipográfica estilo Apple em `@theme`: `--text-caption2` (11 px) … `--text-display` (30 px), com entrelinha e espaçamento próprios.
- Variáveis `--bo-*` (espaçamento do back office) também vivem em `globals.css`.

### Durações e curvas
- `@theme`: `--transition-duration-micro 120ms`, `-elemento 250ms`, `-vista 350ms`, `-toque 20ms`, `-foto-zoom 400ms`, `-foto-chega 300ms`, `-carregar 100ms`, e `smooth/snappy/bouncy/default/interactive/quick/press/sheet/reposition/nav` (150–650 ms).
- Curvas de mola em `linear()`: `--ease-mola-100/95/86/85/80/70`, com aliases `--ease-smooth`, `--ease-nav`, `--ease-sheet`, etc. `--default-transition-timing-function: cubic-bezier(0.16, 1, 0.3, 1)`.
- `:root`: `--ease-out cubic-bezier(0.16,1,0.3,1)`, `--ease-in cubic-bezier(0.4,0,1,1)`, `--ease-in-out cubic-bezier(0.42,0,0.58,1)`.
- `src/lib/motion/tokens.ts` (espelho em JS, com teste de coerência `tokens.coerencia.test.ts`): `EASE_OUT`, `EASE_IN`, `DUR_MICRO_MS 120`, `DUR_ELEMENTO_MS 250`, `DUR_VISTA_MS 350`, `REVEAL_MS 750`, `STAGGER_S 0.09` (tecto 4), `WORD_STAGGER_MS 50` (tecto 6), `SENTENCE_GAP_MS 80`, `PHOTO_REVEAL_FULL_S 1.15`, `PHOTO_REVEAL_LARGE_S 0.9`, `MOLA {400, 38, 1}`, `MOLA_CHEGADA {2000, 51, 1}`, `CHEGADA_MS 240`, e `molaEmLinear()` que converte uma mola numa curva `linear()`.

### Modo escuro
- Existe um bloco `.dark { … }` no fim de `globals.css` que redefine os tokens semânticos (`--bg-*`, `--fg-*`, `--accent`, `--glass-*`, sombras). O próprio comentário diz que fica **inerte até alguém pôr a classe `dark` na raiz**; não se encontrou código que a ponha, nem regras `prefers-color-scheme` activas, nem classes `dark:` nos componentes públicos. Há um passeio `e2e/o-modo-escuro-existe.spec.ts` (`@movimento`).

### Selecção, foco, scrollbar
- `::selection`: fundo `rgba(214,171,58,0.28)` (dourado) e texto `#2a2620`.
- `:focus-visible`: `outline: 2px solid rgba(76,97,80,0.95)`, `outline-offset: 2px` (segue o `border-radius` do elemento); variantes `.foco-largo`, `.focus-quiet`, `[data-foco-do-rato]`, e versão sem transição em movimento reduzido.
- Scrollbar WebKit de 3 px (polegar `#b8b0a0`, `#637a5f` ao passar).

---

## 4. Camada de movimento

Pastas: `src/components/motion/`, `src/components/`, `src/lib/motion/`. Regra geral: o servidor envia o estado final visível; o que já está à vista ao abrir não se esconde (`src/lib/motion/primeiro-ecra.ts`, `jaEstaAVista`); `prefersReducedMotion()` em `src/lib/motion/useReducedMotion.ts`.

| Componente | Ficheiro | O que faz | Onde se usa |
|---|---|---|---|
| `AnimateIn` | `src/components/AnimateIn.tsx` | Entrada (de baixo, esquerda, fade) com um único `IntersectionObserver` partilhado; CSS `transition`; nada com movimento reduzido. | Todas as páginas. |
| `Reveal` | `src/components/motion/Reveal.tsx` | Revelação única ao entrar (`zoom`, clip, fade, `stagger`) com `IntersectionObserver` + CSS; substituiu um GSAP ScrollTrigger antigo. | Início, Sobre, Serviço. |
| `RevealText` | `src/components/motion/RevealText.tsx` | **GSAP SplitText** (`type: "lines"`, `mask: "lines"`, `autoSplit`), cada linha sobe `yPercent 110` com `expo.out`, `stagger` 0,09 s, ScrollTrigger `top 88%`, `once`. O GSAP só é importado depois do `load` (`depoisDeCarregar`) e quando o título está a um ecrã de distância; nunca no `<h1>` do herói; `revert` ao sair; nada com movimento reduzido. | Títulos de secção em Início, Sobre, Serviços, Serviço, Clientes, Contacto. |
| `src/lib/motion/gsap.ts` | — | Regista `ScrollTrigger`, `SplitText`, `useGSAP`; exporta `ease` (`expo.out`, `power1.inOut`), `dur`, `stagger`. Único ponto de entrada do GSAP. | Só `RevealText`. |
| `TituloPalavraAPalavra` | `src/components/TituloPalavraAPalavra.tsx` | `<h1>` palavra a palavra só em HTML+CSS (`.palavra-sobe`), atrasos escritos pelo servidor; texto intacto para leitores de ecrã. | Heróis de Sobre, Serviços, Serviço, Galeria, Clientes, Contacto. |
| `TitleReveal` | `src/components/TitleReveal.tsx` | Revelação por palavras do lado do cliente. | Só Sobre. |
| `SmoothScroll` | `src/components/motion/SmoothScroll.tsx` | **Lenis** (`lerp 0.16`, `smoothWheel`, `syncTouch: false`), só com ponteiro fino (rato/trackpad), carregado depois do `load`; pára quando o menu ou a galeria trancam o corpo; deixa caixas com scroll próprio em paz; não monta com movimento reduzido. Toque = scroll nativo. | Cromado. |
| `Parallax` | `src/components/Parallax.tsx` | Um ouvinte de scroll + um rAF para todas as instâncias, posições medidas uma vez, só `transform`, `IntersectionObserver` para activar só as camadas perto do ecrã; inerte com movimento reduzido. Só no computador: `parallaxWanted()` exige `(pointer: fine)` e nenhum «reduzir movimento» (confirmado no ficheiro). | Heróis de 7 páginas. |
| `PageTransition` | `src/components/PageTransition.tsx` | Transição de rota em CSS: `.route-fade` = `transform: scale(1.015) → 1` em 0,4 s com `--ease-out`, **sem opacidade** (para não haver clarão branco); só em navegações do lado do cliente (nunca na primeira pintura); desligada em `/orcamento`. **View Transitions desligadas** (`USE_VIEW_TRANSITIONS = false`): segundo o comentário, a API tira uma fotografia da página inteira, que nos heróis pesados colidia com a hidratação e a descodificação da imagem nova e fazia a transição engasgar; o código e as regras `::view-transition-*` ficaram para se poder religar. Acesso ao `ViewTransition` do React em `src/components/vt.ts`. | Cromado. |
| `HeroWarm` | `src/components/HeroWarm.tsx` | Aquece as capas de outras páginas, detectando AVIF com um AVIF de 1×1. | Cromado. |
| `SpeculationRules` | `src/components/SpeculationRules.tsx` | Speculation Rules (`prerender`, `eagerness: "moderate"`) para ligações da mesma origem; exclui back office, orçamento, portais e propostas; `data-no-prerender` para excluir. | Cromado. |
| `ScrollProgress` | `src/components/ScrollProgress.tsx` | Linha musgo no topo, escrita por rAF sem re-render. | Cromado. |
| `LinhaDeCarregamento` | `src/components/LinhaDeCarregamento.tsx` | Linha de 2 px no topo enquanto a página seguinte não chega (tecto de 8 s). | Cromado. |
| `MolaAoLargar` | `src/components/motion/MolaAoLargar.tsx` | Ao largar um botão `.toque`, regressa com a mola `MOLA_CHEGADA` (240 ms) via Web Animations; um ouvinte delegado; nada com movimento reduzido. O premir é CSS (`.toque:active`, `scale(.97)`). | Cromado. |
| `Magnetic` | `src/components/motion/Magnetic.tsx` | Atracção do botão ao ponteiro (rAF, só ponteiro fino, nada com movimento reduzido). | CTA do Navbar. |
| `SetaDeDescer` | `src/components/motion/SetaDeDescer.tsx` | Seta «descer» em ciclo de 5 s, pausada fora do ecrã. | Painéis da página inicial. |
| `ClientMarquee` | `src/components/ClientMarquee.tsx` | Fita de logótipos em movimento, pausada fora do ecrã. | Início, Clientes. |
| `RotatingPhotoGrid` | `src/components/RotatingPhotoGrid.tsx` | Mosaico de fotografias que roda. | Clientes. |
| Zoom de hover | `.hero-settle`, `ZOOM_CLASS` na galeria (`scale 1.03`, 400 ms) | Capa em repouso a `scale(1.06)`; zoom das miniaturas desligado em movimento reduzido. | — |

- **Liquid Glass**: o motor `src/lib/liquid-glass.ts` e a ponte `src/app/[lang]/(admin)/orcamento/admin/ui/Glass.tsx` só são importados no back office. **Não é usado no sítio público.** Os tokens `--glass-*` existem em `:root`.
- **Movimento reduzido**: >20 blocos `@media (prefers-reduced-motion: reduce)` em `globals.css`; os componentes acima verificam-no em JS. Excepção deliberada: os vídeos da entrada **tocam mesmo com movimento reduzido** (decisão da dona, 16/10 e 31/10).

---

## 5. Vídeo de entrada da página inicial

- Componente: `src/components/EntradaEmVideo.tsx` (1 963 linhas). Regras sem browser: `src/lib/entrada-em-video.ts` (673 linhas). Passeio: `e2e/entrada-em-video.spec.ts`.
- Pasta versionada `public/videos/entrada/v8/` (41 MB no total, cache de um ano; vídeo novo vai para `v9`):

| Ficheiro | Bytes | Codec | Medidas | fps | Duração |
|---|---|---|---|---|---|
| entrada-1-paisagem.mp4 | 2 834 352 | H.264 | 1920×960 | 50 | 9,94 s |
| entrada-1-paisagem.webm | 2 613 492 | VP9 | 1920×960 | 50 | 9,94 s |
| entrada-1-paisagem-leve.mp4 | 1 970 404 | H.264 | 1280×640 | 50 | 9,94 s |
| entrada-1-retrato.mp4 | 1 156 916 | H.264 | 720×1280 | 50 | 9,94 s |
| entrada-1-retrato.webm | 1 057 893 | VP9 | 720×1280 | 50 | 9,94 s |
| entrada-1-paisagem-animada.webp | 5 792 062 | WebP animado | — | — | — |
| entrada-1-retrato-animada.webp | 3 560 914 | WebP animado | — | — | — |
| entrada-2-paisagem.mp4 | 1 235 208 | H.264 | 1920×960 | 50 | 4,18 s |
| entrada-2-paisagem.webm | 1 095 888 | VP9 | 1920×960 | 50 | 4,18 s |
| entrada-2-paisagem-leve.mp4 | 822 222 | H.264 | 1280×640 | 50 | 4,18 s |
| entrada-2-retrato.mp4 | 502 852 | H.264 | 720×1280 | 50 | 4,18 s |
| entrada-2-retrato.webm | 437 264 | VP9 | 720×1280 | 50 | 4,18 s |
| entrada-2-paisagem-animada.webp | 1 549 446 | WebP animado | — | — | — |
| entrada-2-retrato-animada.webp | 1 224 122 | WebP animado | — | — | — |
| entrada-3-paisagem.mp4 | 2 853 362 | H.264 | 1920×960 | 50 | 9,94 s |
| entrada-3-paisagem.webm | 2 618 511 | VP9 | 1920×960 | 50 | 9,94 s |
| entrada-3-paisagem-leve.mp4 | 2 016 405 | H.264 | 1280×640 | 50 | 9,94 s |
| entrada-3-retrato.mp4 | 1 144 786 | H.264 | 720×1280 | 50 | 9,94 s |
| entrada-3-retrato.webm | 1 063 150 | VP9 | 720×1280 | 50 | 9,94 s |
| entrada-3-paisagem-animada.webp | 3 871 280 | WebP animado | — | — | — |
| entrada-3-retrato-animada.webp | 2 913 510 | WebP animado | — | — | — |

(Codec, medidas, fps e duração lidos com `ffprobe`; os WebP animados não foram sondados.)

- **v8 (31/10)**: refeitos a partir dos originais 4K com imagens intermédias inventadas até 50 fps (`minterpolate`); cortes e tectos da v7 (vídeos 1 e 3 cortados a 10 s, o 2 inteiro; ~0,8 Mbit/s ao alto, ~2,2 Mbit/s deitado). Saíram a versão `grande`, o HEVC e o AV1 (o tipo de dados ainda os prevê).
- **Formato**: H.264 primeiro (`canPlayType`), VP9/WebM como recurso; `retrato` no telemóvel ao alto, `paisagem` no resto; `paisagem-leve` quando a reprodução perde >10% dos fotogramas (decidido depois de 6 s e 250 fotogramas; a escolha fica guardada em `localStorage`).
- **Capa e LCP**: a fotografia `public/imagens/entrada-floresta-clara.jpg` (`HeroImage` com `priority`, `<picture>` AVIF/WebP de `/_img/`, `fetchPriority="high"`) é o primeiro fotograma do vídeo 1 com a mesma curva de cor; os vídeos entram por cima com `opacity` (passagem de 800 ms) e `scale(1.06)`.
- **Quando começa**: o HTML traz três `<video preload="none" muted playsinline>` vazios. Só depois do evento `load` e de um `requestIdleCallback` (tecto 2 s) — `src/lib/depois-de-carregar.ts` — é que o componente põe as fontes e arranca **só o primeiro** vídeo; os seguintes descarregam-se depois. Ordem 1 → 2 → 3 → 1, a começar no seguinte ao último visto (`localStorage`).
- **Poupar dados** (`navigator.connection.saveData`): fica só a fotografia, sem vídeo (`soACapa()`).
- **Movimento reduzido**: o vídeo toca na mesma.
- **iPhone em poupança de bateria** (`NotAllowedError`): entra o WebP/MP4 animado num `<img>`, e o vídeo arranca ao primeiro toque, clique ou tecla.
- Pára fora do ecrã ou com o separador escondido; um vigia por segundo retoma-o se o sistema o parar ou se ficar encravado. `aria-hidden`, sem controlos, fora do Tab.

---

## 6. Imagens

### Galeria (`src/app/[lang]/(site)/galeria/`)
- Dados: `photos-data.ts` — **896 fotografias** (`Casamento` 652, `Evento` 204, `Corporativo` 24, `Conferência` 9, `Aéreo` 7). `collections.json` — 12 colecções (todas «Casamento»), associadas por padrão no nome do ficheiro (`collections.ts`, `collectionFor`). `gallery-meta.json` (861 entradas: cena, preto-e-branco, destaque, ponto de interesse), `tile-colors.json` (896 cores de mosaico), `interleave.ts` (mistura por colecção, semente fixa).
- Filtros: Todos, Casamento, Corporativo, Conferência, Aéreo, Evento, e «ver este casamento» por colecção; filtro reflectido no `#hash` do URL.
- Grelha em mosaico (2×2 e satélites, `object-cover` pelo ponto de interesse), navegação por setas na grelha, desfoque só nas primeiras 48 (`BLUR_WINDOW`), cor de mosaico nas restantes, fila de carregamento com tecto de pedidos (`load-queue.ts`), prioridade às que entram no ecrã (`prioridade-a-vista.ts`), antecipação conforme a velocidade do scroll (`useAntecipacao.ts`), desfoque tardio sem re-render (`useBlurTardio.ts`), restauro da posição do scroll.
- Visualizador (`Lightbox` dentro de `GaleriaClient.tsx`, 2 754 linhas): portal `role="dialog"` `aria-modal`, armadilha de foco, Escape, ← →, Home/End, `F` para ecrã inteiro, arrastar para baixo para fechar, «voo» FLIP da miniatura até ao visualizador e de volta (`voo.ts`, com `clip-path: inset()`), barra e tira de miniaturas que se escondem sem movimento, pré-carga dos vizinhos. Sem slideshow (retirado a pedido; teste `GaleriaClient.sem-slideshow.test.tsx`). Deslize horizontal entre fotos: não verificado.
- `GalleryImage.tsx`: `<picture>` AVIF + WebP com `srcset` de `/_img/g/` em `GALLERY_WIDTHS = [384, 640, 768, 1024, 1280]` (`gallery-image-loader.ts`, `gallery-srcset.ts`; 768 no telemóvel, 1024 a partir de `sm`).

### Restantes imagens
- `public/imagens/`: 1 031 entradas (328 MB). `public/_img/` (gerada no build, fora do git): 10 803 ficheiros (668 MB) — heróis em `640/1080/1536/2048` AVIF+WebP, `/_img/g/` com 1 030 fotos × 5 larguras × 2 formatos, `/_img/l/` com 130 logótipos.
- `src/lib/blur-map.json` e `src/lib/image-dims.json`: 1 030 entradas cada (desfoque e medidas reais). `src/lib/logo-dims.json`.
- `next/image` em 9 ficheiros públicos, sempre através de:
  - `src/lib/site-image-loader.ts` (carregador global: aponta para `/_img/…` estáticos; recurso = ficheiro original);
  - `src/lib/hero-image-loader.ts` + `src/components/HeroImage.tsx` (heróis);
  - `src/components/SafeImage.tsx` (`<picture>` AVIF à frente e WebP por baixo, recuperação em caso de erro).
- Logótipos: `public/logos/`, `public/logo-liquen*.png`.

### Scripts (`scripts/`, 59 entradas)
- `pregen-heroes.mjs` (+ `pregen-heroes.manifest.json`), `pregen-gallery.mjs`, `pregen-logos.mjs`: geram `/_img/` (AVIF e WebP) com cache em `.next/cache/` — correm em `npm run dev` e `npm run build`.
- `gallery-sync.mjs` (`npm run gallery:sync`): junta fotos de `public/imagens/_intake/` à galeria, escolhe a categoria, actualiza `photos-data.ts`, `collections.json`, blur e medidas.
- `gen-blur.mjs`, `gen-image-dims.mjs`, `gen-logo-dims.mjs`, `gen-favicons.mjs`, `compress-sources.mjs`, `optimize-images.mjs`, `warm-image-cache.mjs`, `upload-images-to-supabase.mjs`, `galeria-analise.mjs` (o que o build «vê» em cada foto), `custo-dom-galeria.mjs`, `medir-galeria.mjs`, `medir-lcp-galeria.mjs`, `medir-lcp-landing.mjs`, `video-galeria.mjs`, `ver-placeholder-galeria.mjs`, `peso-das-rotas.mjs`, `folhas-que-existem.mjs`, `sem-cache-do-compilador.mjs`, `exportar-lps.mjs`.
- Guia: `docs/adicionar-fotos.md`.

---

## 7. Formulários

- **`/orcamento`** — `src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx` (1 718 linhas). Campos: tipo de evento (Casamento, Corporativo, Aniversário, Batizado / Comunhão, Jantar de Gala, Outro — `QUOTE_EVENT_OPTIONS` em `src/lib/orcamento/data.ts`), nome, email, telefone, data (com opção «data flexível»), nº de pessoas (com «ainda não sei»), local/região, mensagem. Rótulos flutuantes, erros por campo com `role="alert"`, `aria-describedby`. Validação no cliente (nome ≥ 2, email por expressão, telefone pelas regras do país, data ≥ hoje no fuso de quem preenche, pessoas > 0, local ≥ 2, mensagem não vazia). Rascunho em `sessionStorage`; origem do lead (`LeadSourceCapture`, UTM/referrer da primeira página) enviada com o pedido; ligação de recurso para WhatsApp com o que já foi escrito; proteção anti-spam (não detalhada aqui). Depois do envio, navega para `/orcamento/confirmacao/[id]`.
- **Calendário**: `orcamento/CalendarioDaData.tsx` — calendário próprio ao estilo Apple só no computador (teclado completo: setas, Início/Fim, PageUp/PageDown, Enter, Escape); no telemóvel fica o `<input type="date">` do sistema.
- **Telefone**: `src/components/CampoTelefone.tsx` — bandeira (`country-flag-icons`) + número, Portugal por omissão, validado com `libphonenumber-js`; entrega E.164 quando válido. O servidor repete a validação (`normalizarTelefone`).
- **`PedidoRapido`** (`src/components/ads/PedidoRapido.tsx`): formulário curto das páginas `/casamentos/*` (data, convidados, local, nome, email, telemóvel), envia também o identificador do clique pago.
- **`PedidoRelampago`** (`src/components/meta/PedidoRelampago.tsx`): 4 campos das páginas `/s/*` (data, local, contacto único email-ou-telefone, nome).
- **Destino**: os três formulários enviam `POST` para a rota de API `/api/orcamento` (`src/app/api/orcamento/route.ts`), que valida com `zod`, devolve erros na língua de quem escreve e com o nome do campo, guarda o pedido para o back office, envia email(s) e notificação push. A confirmação lê `GET /api/orcamento/[id]`.
- `/contacto` não tem formulário: aponta para `/orcamento`, WhatsApp, telefone e email.

---

## 8. SEO / AEO

- **Metadados**: layout de raiz (`generateMetadata` em `src/app/[lang]/layout.tsx`) com `metadataBase`, título por omissão e modelo `%s | Líquen Events`, descrição, `keywords` (`SITE_KEYWORDS`, só termos nacionais), `robots` `index, follow` com `max-image-preview: large`, Open Graph, Twitter `summary_large_image`, `appleWebApp`, verificação do Search Console por `GOOGLE_SITE_VERIFICATION`. Cada página usa `pageMetadata()` (`src/lib/page-metadata.ts`) com título e descrição de `t.meta.*` nos dicionários (ou do catálogo de pólos/serviços).
- **Canónico e hreflang**: PT canonicaliza em `/caminho`, EN em `/en/caminho`; `alternates.languages` `pt-PT`, `en`, `x-default` (→ PT). `/s/*` sem canónico nem hreflang, de propósito.
- **noindex**: confirmação do pedido, 404, `/s/*`, slugs inexistentes, back office.
- **Sitemap** (`src/app/sitemap.ts`): 9 páginas base + 5 serviços + 13 pólos + 3 estilos + 1 destination = 31 entradas, cada uma em PT e EN = **62 URLs**, com `lastModified` tirado do `git log` do ficheiro de origem, `changeFrequency`, `priority`, `alternates` e sitemap de imagens (a galeria declara as 896 fotos).
- **robots** (`src/app/robots.ts`): `*` permite tudo menos `/api/`; regra explícita igual para `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` (lista `ROBOS_DAS_RESPOSTAS`); aponta para o sitemap. O back office não é bloqueado no robots (tem `noindex` próprio).
- **JSON-LD**:
  - `src/components/StructuredData.tsx` (todas as páginas): nó `["Organization", "ProfessionalService"]` com `@id`, fundadora (`Person`), `hasMap` (Perfil de Empresa Google), `OpeningHoursSpecification`, `sameAs` (Instagram, Facebook, LinkedIn, Google), `ContactPoint`, `OfferCatalog` de `Service`; e nó `WebSite` com `inLanguage` e `publisher`. Sem `SearchAction`.
  - `src/components/JsonLd.tsx`: `JsonLd` genérico, `BreadcrumbJsonLd` (`BreadcrumbList`), `FaqJsonLd` (`FAQPage`), `ServiceJsonLd` (`Service` com `provider`). Galeria: `ItemList` de `ImageObject`. Serialização segura em `src/lib/jsonld.ts`.
  - **Ausências deliberadas** (`src/lib/site.ts`): sem `aggregateRating` — «o Google desaconselha marcação de review auto-declarada em Organization/LocalBusiness (sem estrela rich result e risco de ação manual); as estrelas em pesquisa vêm do Perfil de Empresa Google»; sem `areaServed`, `address` nem `geo` — «Ela quis a geografia fora do site»; e por isso sem `LocalBusiness`: «o nó deixa de poder ser `LocalBusiness` (o schema.org exige morada) e passa a `Organization` + `ProfessionalService`. Isso custa a elegibilidade para os resultados locais do Google». A geografia vive só nas páginas de pólos.
- **`/llms.txt`**: ver §2.6.
- **OG**: `public/og-liquen-2026.jpg` 1200×630; algumas páginas passam imagem própria (ex.: `/orcamento`).

---

## 9. Medição e terceiros

- **Google tag** (`src/components/GoogleTag.tsx`): Consent Mode v2 com tudo negado por omissão (script em linha, síncrono), a menos que `localStorage['liquen-consent'] === 'granted'`. Configura Google Ads e GA4 (identificadores públicos no código). A biblioteca `gtag.js` só é pedida depois do **primeiro gesto** (`pointerdown`, `keydown`, `touchstart`, `wheel`, `scroll`) e depois de o scroll sossegar. `page_location` limpo em rotas privadas.
- **Conversão**: `src/lib/ads-conversion.ts` dispara `generate_lead` na página de confirmação, com deduplicação pelo id do pedido. Identificador do clique pago guardado (`src/lib/ads/click-id.ts`) e enviado com os formulários das landing pages.
- **Plausible** (`src/components/Analytics.tsx`, `PlausibleTracker.tsx`): inerte até existir `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`; se ligado, carrega `lazyOnload`, não conta pré-renderizações. Se está ligado em produção: não verificado.
- **Pixel da Meta** (`src/components/meta/MetaPixel.tsx`): só nas páginas `/s/*`, só com `NEXT_PUBLIC_META_PIXEL_ID` e só com consentimento (mesma chave `liquen-consent`); o `fbclid` é guardado no dispositivo sempre. Conversões do lado do servidor em `src/lib/meta/capi.ts`.
- **Aviso de cookies** (`src/components/ConsentBanner.tsx`): barra `role="region"` desenhada no servidor (escondida antes da primeira pintura a quem já escolheu), Aceitar/Recusar + «Saber mais» (política de privacidade); reabre por «Gerir cookies» no rodapé; reserva espaço no fundo (`--reserva-consentimento`) para não tapar os botões do herói.
- **Web Vitals reais** (`src/components/WebVitals.tsx`): LCP, CLS, INP, TTFB, FCP por `sendBeacon` para `/api/vitals`, só em produção, nunca nas rotas com token.
- **Erros do browser** (`src/components/ErrosDoSite.tsx`): até 5 por página, só do código do próprio domínio, para `/api/erro-do-site`.
- **Tempo na galeria** (`src/components/ads/TempoNaGaleria.tsx`).
- **Tipos de letra e CDNs**: fontes auto-alojadas; nenhum CDN de terceiros para JS/CSS. `preconnect` para o Storage de imagens quando configurado e para um CDN de imagem opcional (`NEXT_PUBLIC_IMAGE_CDN`).

---

## 10. Desempenho

- **Adiado para depois do `load` + tempo livre** (`src/lib/depois-de-carregar.ts`): vídeos da entrada, Lenis, GSAP/SplitText. Em `requestIdleCallback`: registo do service worker, `StickyCTA`, `WhatsAppButton`. Depois do primeiro gesto: `gtag.js`. `web-vitals` importado dinamicamente.
- **Fontes**: itálico do Playfair e Archivo sem `preload`.
- **CSS**: `inlineCss`; o CSS do back office separado em `admin.css`; `@source not` para não gerar classes de docs/testes.
- **Cache**: um ano `immutable` para imagens, vídeos, logótipos, `/_img`, ícones e OG; `llms.txt` 1 h / 1 dia na CDN; páginas de serviço `revalidate = 86400`; restantes páginas estáticas.
- **Service worker** `public/sw.js` (registado por `ServiceWorkerRegister.tsx`, só produção): navegações rede-primeiro, recursos com hash e imagens cache-primeiro, pré-cache de `/`, `/offline.html` e logótipo, cache de fotografias com tecto de 600; serve também as notificações push do back office. Manifest PWA (§2.6).
- **Imagens**: tudo estático em `/_img/` (sem optimizador em tempo real), AVIF com WebP de recurso, pré-carga da primeira foto da galeria e do herói.
- **Navegação**: Speculation Rules (`prerender` moderado), `HeroWarm`, `loading.tsx` escuro, `LinhaDeCarregamento`.
- **Tectos**: `scripts/peso-das-rotas.mjs` no CI (peso de JS por rota), `e2e/galeria-desempenho.spec.ts`, `e2e/fluidity.spec.ts`, Lighthouse (§12).
- **Números**: não recalculados aqui. Ver `docs/medicoes/antes/LEIA-ME.md`, `docs/medicoes/depois-fase-1/LEIA-ME.md`, `docs/medicoes/depois-fase-2/LEIA-ME.md` (Lighthouse telemóvel por página, série normal e «processador lento»), `docs/RAPIDEZ.md` e `docs/desempenho.md`.

---

## 11. Acessibilidade

- Ligação «saltar para o conteúdo» (texto do dicionário `t.skipLink`) para `<main id="conteudo" tabIndex={-1}>`.
- Um só `<h1>` por página; `<h2>` por capítulo.
- Menu móvel como diálogo modal (armadilha de Tab, Escape, `inert` no resto, foco devolvido); visualizador da galeria igual; FAQ com `aria-expanded`; erros de formulário com `role="alert"`; vídeos e decoração com `aria-hidden`.
- Anel de foco que segue a forma do elemento (§3); `AnelSoDoTeclado.tsx` esconde-o a quem está a usar rato ou dedo e mantém-no para quem usa teclado.
- Alvos de toque: `.alvo-toque` → `min-height/min-width: 44px` com `(pointer: coarse)` (em `@layer components`); campos de escrever com 44 px mínimos; passeios `geometria-dos-alvos`, `alvos-de-24-com-rato` (≥ 24 px com rato), `toque-do-sitio`, `idioma-no-telemovel`, e `src/components/alvos-de-toque-do-sitio.test.tsx`.
- Contraste: valores anotados nos tokens; véus calculados contra o mínimo de 3:1 (títulos) e 4,5:1 (texto pequeno) segundo os comentários; `ConsentBanner.contraste.test.ts`, `e2e/o-texto-sobre-a-fotografia.spec.ts`.
- Movimento reduzido respeitado em todo o movimento, excepto os vídeos da entrada (§4, §5).
- Sem JavaScript: conteúdo servido visível; `e2e/sem-javascript.spec.ts`.
- axe-core: `e2e/a11y.spec.ts` corre `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` em `/`, `/sobre`, `/servicos`, `/galeria`, `/contacto`, `/clientes`, `/casamentos/alentejo`, `/casamentos/destination`, `/casamentos/estilo/minimalista`. Lighthouse acessibilidade com mínimo 0,9 (erro) em computador.

---

## 12. Testes e CI

- **Unitários (Vitest)**: 943 ficheiros `*.test.ts(x)` (940 em `src/`, os restantes em `test/` e `scripts/`); `vitest.config.ts` inclui `src/`, `e2e/**/*.test.ts`, `test/`, `scripts/`; cobertura v8 sobre `src/lib/`.
- **E2E (Playwright)**: 59 `*.spec.ts` em `e2e/` (+ 3 em `e2e/caca/`), 8 configurações (`playwright.config.ts`, `.movel`, `.toque`, `.dados`, `.propostas`, `.passkeys`, `.caca`, `.medicao`). Os que dizem respeito ao sítio público:
  - `home.spec.ts` — título da marca, ir a Serviços pelo menu, Contacto leva ao formulário.
  - `o-sitio-inteiro.spec.ts` — todas as páginas do sitemap, não só as do menu.
  - `i18n.spec.ts` — o espelho `/en/*` serve as mesmas páginas em inglês.
  - `idioma-no-telemovel.spec.ts` — no telemóvel o «EN» recebe o toque.
  - `a11y.spec.ts` — axe nas 9 páginas acima.
  - `sem-javascript.spec.ts` — o conteúdo está lá sem JS.
  - `endereco-que-nao-existe.spec.ts` — 404 com estado e `noindex` corretos.
  - `orcamento.spec.ts` — o formulário de orçamento de ponta a ponta.
  - `contacto.spec.ts` — a página de contacto e o caminho para `/orcamento`.
  - `escolha.spec.ts` — o campo de escolher num browser real.
  - `cta-flutuante.spec.ts` — o «Pedir orçamento» flutuante.
  - `consentimento-geometria.spec.ts` — o aviso de cookies não tapa os botões do herói.
  - `entrada-em-video.spec.ts` — os três vídeos tocam, e só quando devem.
  - `entrada-retratos.spec.ts` — capturas da página de entrada para antes/depois.
  - `heroi-avif.spec.ts` — o herói em AVIF.
  - `imagens.spec.ts` — a rede de segurança das imagens.
  - `galeria-desempenho.spec.ts` (`@galeria`) — a galeria não engorda.
  - `fluidity.spec.ts` — fluidez em tempo de execução.
  - `social.spec.ts` — o fluxo de conversão das páginas `/s/*` no browser da Meta.
  - `sem-scroll-horizontal.spec.ts` — as páginas de serviço não rolam para o lado.
  - `geometria-dos-alvos.spec.ts`, `alvos-de-24-com-rato.spec.ts`, `toque-do-sitio.spec.ts` — alvos e resposta ao toque.
  - `anel-de-foco.spec.ts` — o anel de foco.
  - `o-texto-sobre-a-fotografia.spec.ts` — contraste do texto sobre fotografia.
  - `o-ecra-volta-vivo-sem-rede.spec.ts` (`@semrede`) — recarregar sem rede volta a hidratar.
  - `o-modo-escuro-existe.spec.ts`, `o-movimento-chega-ao-elemento.spec.ts`, `o-ponteiro-tem-significado.spec.ts`, `resposta-ao-toque.spec.ts` (`@movimento`) — partilhados com o back office; até que ponto cobrem páginas públicas: não verificado.
  - Guiões `.mjs` em `e2e/` (scroll, inércia, gestos, aviso, fotogramas) — medição manual.
  - Os restantes (`admin-*`, `proposta*`, `temas`, `passkeys`, `tarefas-*`, `guiao-do-dia`, etc.) são do back office ou das propostas.
- **CI** (`.github/workflows/`):
  - `ci.yml` (push a `main`, PR, diário 03:17, manual): escolhe o que correr pelos ficheiros mudados; `npm audit`; lint, typecheck e build; `peso-das-rotas.mjs`; unitários em 5 partes; E2E informativo em 4 partes; E2E `@imagens` em 3 partes; E2E de produção `@desempenho`, `@galeria`, `@movimento`, `@vidro`, `@semrede`; E2E de dados em 3 partes; E2E telemóvel/propostas/passkeys.
  - `lighthouse.yml` (PR e push a `main`, `continue-on-error: true`, informativo): matriz computador (`lighthouserc.json`) e telemóvel (`lighthouserc.mobile.json`) sobre `/`, `/servicos`, `/contacto`, `/clientes`, `/galeria`, `/sobre`, 3 corridas em computador.
    - Computador: desempenho ≥ 0,8 (aviso), acessibilidade ≥ 0,9 (erro), boas práticas ≥ 0,9 (aviso), SEO ≥ 0,9 (erro), LCP ≤ 2 500 ms, CLS ≤ 0,1, TBT ≤ 200 ms, TTI ≤ 3 500 ms, Speed Index ≤ 3 400 ms (avisos).
    - Telemóvel: desempenho ≥ 0,6, LCP ≤ 4 000 ms, CLS ≤ 0,1, TBT ≤ 600 ms, TTI ≤ 7 000 ms, Speed Index ≤ 5 800 ms (todos avisos).
  - `publicar-vercel.yml` (push a `main`), `container.yml` (imagem, SBOM, análise), `codeql.yml`, `semgrep.yml`, `gitleaks.yml`, `scorecard.yml` (OpenSSF).
  - Descrição das verificações: `docs/VERIFICACOES.md`.

---

## 13. Documentos sobre o sítio público

Em `docs/`:
- `PADRAO-PALUMEN.md` — a fasquia de qualidade (secções B0–B23) e as fases do pedido «nível estúdio» neste ramo.
- `PLANO-SITE-E-GALERIA.md` — plano de 11/10 com códigos GAL-, DES-, TXT-, PED-, NAV-, IA-, CON-, POS-, NEG-, SEG- (lista para a dona escolher).
- `RAPIDEZ.md` — a rapidez do sítio público: o que foi medido.
- `desempenho.md` — o que se mede e o que atrasa.
- `medicoes/` — `antes/`, `depois-fase-1/`, `depois-fase-2/` (Lighthouse por página, 158 ficheiros).
- `AUDITORIA-EXTERNA-2026-10.md` e `AUDITORIA-EXTERNA-2026-10-ENTREGA.md` — auditoria externa do sítio e do back office, e o que foi feito.
- `adicionar-fotos.md` — como juntar fotos à galeria.
- `VERIFICACOES.md` — as verificações de cada mudança (CI).
- `TUDO-REVERSIVEL.md` — regra de que tudo tem volta atrás.
- `PROPOSTA-WEB.md` — a página `/proposta/[token]`.
- `DESIGN-SYSTEM.md` e `LIQUID-GLASS.md` — do back office (o sítio público partilha os tokens).

Na raiz:
- `README.md`, `HANDOFF-LIQUEN.md` (passagem de testemunho), `TOM-DE-VOZ.md`, `LP-AUDIT.md` (landing pages para a Meta), `UTM-PLAN.md` (URLs dos anúncios), `GALERIA-BEFORE.md` / `GALERIA-AFTER.md`, `DESIGN-TOKENS.md` (cor e tipo, back office), `RESILIENCE.md`, `RUNBOOK.md`, `SECURITY*.md`.
- Pastas `ads-output/` e `meta-ads/` (documentação das campanhas) e `remotion/` (projecto Remotion à parte, com `package.json` próprio, para um «filme promocional cinematográfico do site» em duas versões, segundo o `README.md`; não faz parte do build do sítio; o resto não verificado).

---

## 14. O back office (resumo)

Existe um back office em `/orcamento/admin` (grupo `src/app/[lang]/(admin)/`, com CSS próprio em `src/app/admin.css`, `noindex`, sessão protegida). As áreas principais são: pedidos de orçamento e clientes, o estúdio «Fazer proposta» e o PDF editorial da proposta, a proposta web do casal, a biblioteca de temas e mood boards, tarefas, calendário, guiões do dia, mapa de mesas, material e inventário, contratos e faturas, modelos de email, fornecedores e visão geral. Segue o seu próprio sistema de design (`docs/DESIGN-SYSTEM.md`) e é o único sítio onde se usa o Liquid Glass.

---

## 15. O que o sítio NÃO tem (verificado)

- **CMS**: nenhum pacote de CMS no `package.json` (procurados sanity, contentful, prismic, payload, strapi, mdx, contentlayer). Os textos vivem em `src/lib/i18n/pt.ts`/`en.ts`, `src/lib/services-data.ts`, `src/lib/ads/polos.ts`, `src/lib/meta/variantes.ts`, `src/data/index.ts`.
- **Blog / notícias / artigos**: nenhuma pasta de rota com esses nomes em `src/app` (`find`); nenhuma rota assim no sitemap.
- **Pesquisa no sítio**: nenhum `type="search"`/`role="search"` fora do back office; nenhum pacote de pesquisa (algolia, fuse, flexsearch).
- **Newsletter**: nenhuma ocorrência de «newsletter» em componentes públicos (só no back office e num ficheiro de confirmação).
- **Preços / várias moedas**: nenhum `€` nem `Intl.NumberFormat` nas páginas de `(site)`; nenhum pacote de pagamento.
- **Mapas e iframes**: nenhum `<iframe>` nem Google Maps incorporado nas páginas públicas.
- **Feed do Instagram**: só uma ligação para o perfil (CTA na galeria e rodapé); nenhuma incorporação.
- **Chat de terceiros / heatmaps**: nenhum Intercom, Crisp, Tawk, Hotjar ou Clarity em `src/components` nem no layout; só o botão de WhatsApp.
- **View Transitions nas rotas**: desligadas (`USE_VIEW_TRANSITIONS = false` em `src/components/PageTransition.tsx`).
- **Modo escuro activo**: o bloco `.dark` existe mas nada põe a classe; nenhum `prefers-color-scheme` activo; `colorScheme: "light"` no viewport.
- **Liquid Glass no sítio público**: `liquid-glass.ts`/`Glass.tsx` só importados no back office.
- **Biblioteca de animação React** (framer-motion/motion), three.js / react-three-fiber: ausentes do `package.json`. (O `ogl`, instalado sem uso, saiu a 31/10.)
- **Vercel Analytics / Speed Insights**: ausentes do `package.json` e de `node_modules/@vercel`.
- **Biblioteca de i18n** (next-intl, i18next): ausente; o i18n é próprio.
- **Carrossel** (swiper, embla): ausente do `package.json`. (O `TestimonialsCarousel.tsx`, sem uso, saiu a 31/10, com o `KineticHeading`, o `TiltCard` e o `PhotoWall`.)
- **Imagem OG gerada por código** (`opengraph-image.tsx`): nenhum ficheiro (`find`); é uma imagem estática.
- **`LocalBusiness`, `areaServed`, `aggregateRating`, `address`, `geo`, `SearchAction`** no JSON-LD: ausentes (grep em `StructuredData.tsx` e `JsonLd.tsx`); as três primeiras de propósito (§8).
- **Slideshow na galeria**: retirado (teste `GaleriaClient.sem-slideshow.test.tsx`).
- **Cortina/ecrã de entrada no sítio público**: retirada a 30/10 (comentário em `CromadoDoSitio.tsx`).
- **Aviso de cookies**: existe (não é uma ausência), em `src/components/ConsentBanner.tsx`.
