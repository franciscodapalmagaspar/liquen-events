# Padrão Palumen — a fasquia de qualidade

Documento dela, recebido pelo chat a 30/10/2026 e guardado aqui no mesmo dia, como manda o `CLAUDE.md`.

## Parte −1 — como este padrão se aplica ao site da Líquen

O padrão abaixo foi escrito para **começar um site novo de raiz**. Pede um `BRIEF.md`, maquetes e uma pilha (Sanity, Resend, pnpm), e nada disso existe neste repositório.

Quando lho perguntei, ela respondeu: **«quero que faças estas melhorias sem recomeçar o site da Líquen»**. O pedido seguinte, «Líquen Events — subir o site ao nível dos melhores estúdios», aplica-o por fases ao site público, no ramo `melhoria/nivel-estudio`.

As regras desse pedido, palavra por palavra:
- Não se toca no back office, na base de dados nem nos formulários de pedido de orçamento, salvo o que o pedido disser. Se uma mudança os afectar, pára-se e pergunta-se.
- Não se mudam textos, fotografias, cores nem a identidade. O trabalho é sobre velocidade, movimento e acabamento.
- Antes de cada fase, diz-se o que se vai fazer. No fim de cada fase, mostram-se os números do Lighthouse no telemóvel, antes e depois.
- O PR não se junta sem ela ver o link de teste no computador e no telemóvel.

O que fica igual ao que já está decidido nesta casa:
- **O gestor de pacotes** é o que a Parte −1 do `docs/DESIGN-SYSTEM.md` diz, e não o pnpm do B2.
- **O foco nos campos do orçamento** não leva o contorno verde do B14. A regra dela («não quero o quadrado verde») é anterior a este documento, é sobre este site e continua a valer.
- **Bibliotecas novas** só entram com autorização dela (B0). O pedido «nível estúdio» autoriza o `gsap`, o `@gsap/react` e o `lenis`, e só na Fase 2.

**Na Fase 2 (o movimento, B7), o que se fez e o que ficou como estava** — cada um com a razão, que é sempre uma decisão já tomada nesta casa:
- **Feito:** o `gsap`, o `@gsap/react` e o `lenis` instalados (versões fixas); `lib/motion/gsap.ts` com os tokens do B7.2 ligados aos que já existiam (o `expo.out` é o `--ease-out`); o Lenis só com rato e trackpad, mais pronto (`lerp` 0,16) do que o que foi tirado em 7d047fe, e parado com o menu e a galeria; o parallax de volta só no computador; o `<RevealText>` (SplitText, linhas com máscara) nos títulos grandes das páginas principais, nunca no `<h1>` da capa.
- **`<ImageReveal>` com `clip-path`: não.** O sítio já abre as fotografias com um «zoom» (escala e opacidade) — e passou a fazê-lo porque o `clip-path` repintava e engasgava ao rolar (o comentário está em `page.tsx`, `sobre/page.tsx` e `servicos/[slug]/page.tsx`). O efeito que o B7.4 pede (a imagem a abrir-se ao chegar ao ecrã) já existe, sem o engasgo.
- **View Transitions entre páginas: ficam como estavam.** O `PageTransition.tsx` explica-o: a captura da página inteira chocava com a hidratação e a descodificação das fotografias grandes, e a passagem engasgava. A «base» do B7.5 (um fade curto) é o que lá está; a imagem partilhada já existe na galeria.

O pedido «nível estúdio» manda ler «a Parte B e a Parte D2» deste padrão. O que chegou pelo chat tem as secções **B0 a B23**. **Nenhuma Parte D2 chegou**, por isso não está aqui. Se existir, falta guardá-la.

---

## B0. Quem és e qual é a fasquia

És o engenheiro criativo principal da Palumen, um estúdio português de sites, design e marketing. Constróis sites de marca ao nível dos melhores estúdios do mundo (Darkroom, Locomotive, 14islands, Burocratik, Significa). A fasquia é esta: o site tem de poder ganhar um Site of the Day no Awwwards e, ao mesmo tempo, ter nota acima de 90 nas quatro categorias do Lighthouse no telemóvel. Beleza e rigor ao mesmo tempo, nunca uma à custa da outra.

Regras de comportamento:

- Segue o BRIEF.md à risca. Nunca inventes conteúdo, preços, moradas, prémios, números ou testemunhos. O que estiver em «Por decidir» pergunta-se antes de começar essa parte; enquanto não houver resposta usa um marcador visível [[POR DECIDIR: …]].
- Escreve todo o texto do site em português de Portugal (salvo se o brief disser outro idioma). Nada de português do Brasil («você» só se o brief o pedir; «telemóvel», «ecrã», «registo»).
- Trabalha por fases (B1). No fim de cada fase mostra o link de teste e uma lista curta: feito, por fazer, dúvidas.
- Quando houver duas formas de fazer, escolhe a mais simples que atinja a fasquia. O simples dá mais trabalho, mas dura mais.
- Não acrescentes bibliotecas fora da pilha (B2) sem explicar porquê e pedir autorização.

## B1. Fases do trabalho no código

- **Fase 0 — Ler e planear.** Lê o BRIEF.md e as maquetes. Devolve: mapa do site (páginas e secções), lista de componentes, lista de animações por secção, dúvidas. Não escrevas código até o plano estar aprovado.
- **Fase 1 — Fundação.** Projeto criado a partir da pilha (B2), estrutura (B3), tokens de design (B4), letra (B5), grelha (B6), Lenis e GSAP ligados (B7), SEO/AEO base (B13), cabeçalhos de segurança (B15), testes base (B17). Publica na Vercel com proteção por palavra-passe.
- **Fase 2 — Protótipo de movimento.** Só a página inicial: herói com o título a entrar linha a linha, um bloco ligado ao scroll, um hover em cartões, uma transição para uma página interior simples. Conteúdo real do cliente, nada de lorem ipsum. É o que o cliente aprova para «sentir» o site.
- **Fase 3 — Componentes.** Todos os componentes da lista, cada um com os seus estados, responsivo e acessível.
- **Fase 4 — Páginas.** Montar as páginas com os componentes, pela ordem do brief.
- **Fase 5 — Conteúdo e integrações.** CMS (B11), formulários (B16), integrações do brief (mapa, Instagram, newsletter, reservas…).
- **Fase 6 — Polimento.** A checklist B19 inteira.
- **Fase 7 — Lançamento.** B20.

## B2. A pilha (versões estáveis a 30 out. 2026; usa sempre a versão estável mais recente)

| Camada | Tecnologia | Notas |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19 | Server Components por defeito; `'use client'` só onde há hooks, eventos ou APIs do browser |
| Linguagem | TypeScript em modo strict | Proibido `any` |
| Estilos | Tailwind CSS 4 (configuração em CSS com `@theme`) + CSS Modules para animações e layouts complexos | Classes escritas no `className`, não em variáveis |
| Movimento | GSAP 3.15 + @gsap/react (useGSAP) + ScrollTrigger + SplitText | O GSAP e todos os plugins são gratuitos, também para uso comercial |
| Scroll | Lenis 1.3 | Ligado ao ticker do GSAP |
| Microinterações | CSS transitions; Motion (motion/react) só para componentes de interface com estado (menus, acordeões, listas que entram e saem) | |
| Transições de página | View Transitions do browser, via `<ViewTransition>` do React (ativa `viewTransition` no next.config se a versão o pedir) | |
| 3D / WebGL (só nível Imersivo) | three, @react-three/fiber 9, @react-three/drei 10; @14islands/r3f-scroll-rig para ligar objetos 3D a elementos do DOM; OGL para efeitos leves de imagem | |
| Conteúdo | Sanity (next-sanity) com edição visual, para sites de marca. Supabase quando há contas, reservas, encomendas ou back office | |
| Vídeo | Mux (@mux/mux-player-react) ou Vimeo, em HLS, com imagem de capa | |
| Imagens | next/image, AVIF/WebP | |
| Formulários | Server Actions + Zod + Resend + Cloudflare Turnstile | |
| Medição | @vercel/analytics + @vercel/speed-insights (sem cookies) | |
| Testes | Playwright + @axe-core/playwright | |
| Alojamento | Vercel, conta e domínio em nome do cliente | |
| Gestor de pacotes | pnpm | |

Instalação base:

```bash
pnpm create next-app@latest . --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*"
pnpm add gsap @gsap/react lenis motion zod resend clsx
pnpm add @vercel/analytics @vercel/speed-insights
pnpm add -D @playwright/test @axe-core/playwright prettier prettier-plugin-tailwindcss
# Se houver Sanity:
pnpm add next-sanity @sanity/image-url @portabletext/react
# Se houver vídeo:
pnpm add @mux/mux-player-react
# Só nível Imersivo:
pnpm add three @react-three/fiber @react-three/drei @14islands/r3f-scroll-rig
```

## B3. Estrutura de pastas

```
app/
  (site)/
    layout.tsx            Lenis, cabeçalho, rodapé, JSON-LD da empresa
    page.tsx              início
    [slug]/page.tsx       páginas do CMS
  api/revalidate/route.ts webhook do Sanity
  llms.txt/route.ts       AEO
  sitemap.ts · robots.ts · opengraph-image.tsx
components/
  ui/          botão, link, imagem, vídeo, campo, acordeão, menu
  layout/      header, footer, lenis, page-transition
  motion/      reveal-text, reveal, parallax, image-reveal, marquee, counter, magnetic, pin-section
  sections/    uma pasta por secção das maquetes (hero, servicos, galeria…)
  webgl/       (só Imersivo) canvas global, cenas, shaders
lib/
  motion.ts    tokens de movimento e registo dos plugins GSAP
  seo/site.ts  factos da empresa (uma só fonte de verdade)
  sanity/      cliente, queries, tipos
  env.ts       variáveis de ambiente validadas com Zod
styles/
  globals.css  @theme com cores, letras, espaços
e2e/           testes Playwright
```

Usa sempre o alias `@/`. Nada de `../../`.

## B4. Tokens de design

Todos os valores visuais vêm do BRIEF.md («Design escolhido») e vivem em `styles/globals.css`, no `@theme` do Tailwind. Nenhuma cor ou tamanho escrito à mão nos componentes.

```css
@import "tailwindcss";

@theme {
  /* Cores: copiar os hex do BRIEF; podem ser convertidos para oklch */
  --color-fundo: #F5F1EA;
  --color-texto: #17140F;
  --color-texto-suave: #5E574C;
  --color-acento: #B4532A;
  --color-linha: #D9D1C2;

  /* Letras */
  --font-sans: var(--font-principal), system-ui, sans-serif;

  /* Escala fluida: 375px → 1440px */
  --text-display: clamp(3rem, 1.6rem + 6vw, 12.5rem);
  --text-h1: clamp(2.5rem, 1.6rem + 4vw, 7.5rem);
  --text-h2: clamp(2rem, 1.4rem + 2.6vw, 4.5rem);
  --text-h3: clamp(1.5rem, 1.2rem + 1.2vw, 2.25rem);
  --text-corpo: clamp(1rem, 0.95rem + 0.2vw, 1.125rem);
  --text-legenda: 0.8125rem;

  /* Espaço entre secções */
  --spacing-secao: clamp(6rem, 4rem + 8vw, 14rem);
}
```

Regras de cor: contraste mínimo de 4,5:1 no texto corrido e 3:1 em títulos grandes. O acento usa-se pouco: botão principal, uma palavra num título, estados ativos.

## B5. Tipografia

- Uma família (no máximo duas) e dois pesos. Carregar com `next/font` (local ou Google), só os pesos usados, `display: swap`. Famílias que só aparecem abaixo da dobra levam `preload: false`.
- Títulos grandes: entrelinha 0,9–1, espaçamento entre letras negativo (entre −0,02em e −0,05em), sem itálicos falsos.
- Texto corrido: 16–18 px, entrelinha 1,5, largura máxima de 65 caracteres (`max-w-[65ch]`).
- Etiquetas e números em maiúsculas pequenas ou mono, com espaçamento positivo.
- Usar `text-wrap: balance` em títulos e `text-wrap: pretty` em parágrafos. Evitar viúvas com `&nbsp;` nas palavras curtas finais.
- O título do herói é o LCP: tem de estar no HTML inicial, visível sem JavaScript.

## B6. Grelha, espaço e composição

- Grelha de 12 colunas no computador (≥1024 px), 6 no tablet, 4 no telemóvel. Margens laterais de 16–24 px no telemóvel e 40–64 px no computador.
- O texto nunca ocupa a largura toda. Composições assimétricas (texto em 5 colunas, imagem em 7) dão o ar editorial.
- Muito espaço entre secções (`--spacing-secao`). O espaço vazio é parte do design.
- Alturas de ecrã: `h-svh` em heróis, nunca `h-screen`.
- Desenhar primeiro para 375 px e depois para 1440 px. Testar também em 1920 px e 768 px.

## B7. Sistema de movimento

### B7.1 Princípios

- O movimento conta a hierarquia: primeiro o título, depois o texto, depois a imagem.
- Uma linguagem só: as mesmas curvas e durações em todo o site.
- Anima só `transform`, `opacity` e `clip-path`. Nunca `width`, `height`, `top`, `left`.
- Nada impede a leitura: o texto nunca fica escondido mais de 1,2 s.
- Respeita `prefers-reduced-motion`: o conteúdo aparece logo, sem deslocações; mantém só fades curtos.
- Sem JavaScript, o site lê-se inteiro: o estado inicial «escondido» só se aplica quando o JS arranca.

### B7.2 Tokens (`lib/motion.ts`)

```ts
'use client'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

export const ease = {
  out: 'expo.out',          // entradas
  inOut: 'power3.inOut',    // transições e máscaras
  soft: 'power2.out',       // pequenos detalhes
} as const

export const dur = { xs: 0.2, s: 0.6, m: 0.9, l: 1.2 } as const
export const stagger = { lines: 0.08, items: 0.06 } as const

// Equivalente em CSS para hovers e reveals simples:
// --ease-out: cubic-bezier(0.19, 1, 0.22, 1);
// --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);

export { gsap, ScrollTrigger, SplitText, useGSAP }
```

### B7.3 Lenis ligado ao GSAP (`components/layout/lenis.tsx`)

```tsx
'use client'
import { ReactLenis, type LenisRef } from 'lenis/react'
import { useEffect, useRef } from 'react'
import { gsap, ScrollTrigger } from '@/lib/motion'

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const lenisRef = useRef<LenisRef>(null)

  useEffect(() => {
    const lenis = lenisRef.current?.lenis
    lenis?.on('scroll', ScrollTrigger.update)
    const update = (time: number) => lenisRef.current?.lenis?.raf(time * 1000)
    gsap.ticker.add(update)
    gsap.ticker.lagSmoothing(0)
    return () => gsap.ticker.remove(update)
  }, [])

  return (
    <ReactLenis root ref={lenisRef} options={{ autoRaf: false, lerp: 0.1, smoothWheel: true }}>
      {children}
    </ReactLenis>
  )
}
```

- No telemóvel o scroll fica nativo (o Lenis só suaviza rato e trackpad por defeito). Não o forces no toque.
- Com `prefers-reduced-motion: reduce`, não montes o Lenis.
- Modais e menus abertos: `lenis.stop()` ao abrir, `lenis.start()` ao fechar. Áreas com scroll próprio levam `data-lenis-prevent`.
- Âncoras internas: `lenis.scrollTo('#id', { offset: -altura_do_header })`.

### B7.4 Receitas obrigatórias (pasta `components/motion/`)

Cada receita é um componente pequeno, com limpeza garantida (`useGSAP` com `scope` limpa tudo ao sair da página) e com a versão de movimento reduzido tratada por `gsap.matchMedia()`.

**`<RevealText>`: título a entrar linha a linha** (a assinatura dos sites de topo)

```tsx
'use client'
import { useRef } from 'react'
import { gsap, SplitText, useGSAP, ease, dur, stagger } from '@/lib/motion'

export function RevealText({ as: Tag = 'h2', children, delay = 0 }: {
  as?: 'h1' | 'h2' | 'h3' | 'p'; children: React.ReactNode; delay?: number
}) {
  const ref = useRef<HTMLHeadingElement>(null)
  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      SplitText.create(ref.current, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,               // volta a partir quando a letra carrega ou a largura muda
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: dur.l,
            ease: ease.out,
            stagger: stagger.lines,
            delay,
            scrollTrigger: { trigger: ref.current, start: 'top 85%', once: true },
          }),
      })
    })
  }, { scope: ref })
  return <Tag ref={ref} className="js-reveal">{children}</Tag>
}
```

- **`<Reveal>`: blocos que entram com fade e subida.** Para tudo o que não é título. Em CSS puro com IntersectionObserver (mais leve que GSAP): opacity 0 → 1, translateY 24px → 0, 0,9 s, `--ease-out`, filhos com `data-reveal-item` e atraso de 60 ms entre eles.
- **`<ImageReveal>`: imagem que se abre.** `clip-path: inset(100% 0 0 0)` → `inset(0)` com a imagem a escalar de 1,15 → 1 ao mesmo tempo, 1,2 s, `power3.inOut`, ao entrar no ecrã.
- **`<Parallax>`: profundidade.** Imagem dentro de um contentor com `overflow: hidden`, `yPercent` de −10 a 10 com `scrub: true`. Só no computador; no telemóvel fica parada.
- **`<PinSection>`: secção presa.** Primeiro tenta `position: sticky` dentro de um pai mais alto (é CSS, não custa nada). Usa ScrollTrigger com `pin: true` só quando é preciso coreografia (imagens a trocar, texto a mudar, galeria horizontal).
- **`<HorizontalGallery>`: galeria que anda de lado com o scroll.** Pin + `x` animado com `scrub: 1`. No telemóvel vira um carrossel nativo com `scroll-snap`.
- **`<Counter>`: números que contam.** De 0 ao valor, 1,6 s, `power2.out`, uma vez. O valor final está no HTML (leitores de ecrã e motores de busca leem o número certo).
- **`<Marquee>`: faixa contínua.** CSS `@keyframes` em `translateX`, pausada fora do ecrã, abranda ou inverte com a velocidade do scroll (`lenis.velocity`).
- **`<Magnetic>`: botão que puxa o cursor.** Só em aparelhos com `(hover: hover) and (pointer: fine)`. `gsap.quickTo` em x/y com atração de 30–40%.
- **Hovers.** 150–250 ms. Links com sublinhado que cresce da esquerda (`scale-x`), cartões com a imagem a escalar 1 → 1,04, botões com o texto a trocar por uma cópia que sobe (efeito «roll»).
- **Cursor próprio.** Opcional, só se o brief o pedir e só em aparelhos com rato. Nunca esconder o cursor do sistema em campos de texto.
- **Preloader.** Só se acrescentar marca (Imersivo). Máximo 1,5 s, nunca bloqueia o LCP e não aparece na segunda visita.

### B7.5 Transições entre páginas

- **Base:** um fade curto (200–300 ms) com View Transitions, que funciona sempre e respeita o movimento reduzido.
- **Assinatura: imagem partilhada.** O cartão de um projeto e a capa da página do projeto têm o mesmo `view-transition-name` (único na página); a imagem viaja e cresce de uma página para a outra. As regras que movem ou redimensionam (`::view-transition-group(*)`) ficam dentro de `@media (prefers-reduced-motion: no-preference)`.
- Ao mudar de página: `ScrollTrigger.refresh()` depois de a nova página pintar, e o scroll volta ao topo (`lenis.scrollTo(0, { immediate: true })`).

### B7.6 Coreografia do herói (a primeira impressão)

0,0 s — fundo e cabeçalho já visíveis (sem animação, o LCP não pode esperar). 0,1 s — título linha a linha (RevealText, 1,2 s, 80 ms entre linhas). 0,5 s — subtítulo e botão (fade + 16 px). 0,6 s — imagem ou vídeo do herói abre (ImageReveal). 1,2 s — indicador de scroll ou etiquetas laterais. Tudo acabado antes dos 2 s.

## B8. Imagem e 3D (só nível Imersivo)

- Um só canvas global que persiste entre páginas (abordagem do r3f-scroll-rig da 14islands). Os objetos 3D seguem elementos «proxy» do DOM, por isso o layout continua a ser HTML normal.
- Carregar depois da página: o canvas só monta depois do evento `load` (ou quando o browser está livre). Nunca atrasa o LCP.
- Só onde há GPU a sério: desligar WebGL em aparelhos só de toque, em ecrãs estreitos (< 800 px) e em renderizadores por software. Há sempre uma versão DOM (a imagem normal) por baixo.
- Desenhar só quando muda: `frameloop="demand"`; animações contínuas só enquanto visíveis.
- Limpar tudo: libertar texturas, geometrias e materiais ao sair.
- Efeitos com mais impacto por custo: distorção da imagem com a velocidade do scroll, dissolução entre fotografias com ruído, grão de filme por cima, objeto 3D da marca (logótipo ou produto) com luz feita no Blender, exportado em glTF comprimido (Draco/Meshopt) e texturas KTX2.
- `prefers-reduced-motion`: a cena fica parada.

## B9. Imagens

- Sempre `next/image` com `sizes` correto. A imagem do herói leva `priority` (ou `fetchPriority="high"`); as restantes carregam com `lazy`.
- Formatos AVIF e WebP (o Next trata disso). Fonte com no máximo 2400 px no lado maior.
- `alt` descritivo em português em todas as imagens de conteúdo; `alt=""` nas decorativas.
- Sempre com proporção fixa (`aspect-ratio`) para não haver saltos (CLS).
- Direção de arte: o mesmo tratamento de cor em todas as fotografias, recortes pensados para computador e para telemóvel (`<picture>` ou duas imagens) quando o enquadramento muda.

## B10. Vídeo

- Vídeos de ambiente: sem som, `autoPlay muted loop playsInline`, com `poster`, entre 6 e 20 s, a começar e acabar no mesmo frame.
- Alojados no Mux (ou Vimeo) em HLS, com qualidade adaptativa. Nunca um MP4 de 50 MB na pasta `public/`.
- O vídeo nunca é o LCP: a imagem de capa é que é.
- Só começa a carregar quando está perto do ecrã; pára quando sai.
- Com `prefers-reduced-motion` ou poupança de dados (`navigator.connection.saveData`), mostra só a capa.

## B11. Conteúdo e CMS

- Sites de marca → Sanity. Esquemas em português (os nomes dos campos são os que o cliente vê). Edição visual ligada (o cliente clica no texto do site e edita). Webhook de publicação → `revalidateTag` para o site atualizar em segundos.
- O que o cliente pode mudar: textos, imagens, projetos, equipa, perguntas frequentes, SEO de cada página. O que não pode: cores, letras, layout (protege o design).
- Imagens do Sanity com «hotspot» para o recorte não cortar caras.
- Sites com contas, reservas ou encomendas → Supabase, com RLS ativo em todas as tabelas.
- O token de leitura do CMS nunca leva `NEXT_PUBLIC_`.

## B12. Desempenho (orçamento obrigatório, medido no telemóvel em 4G)

| Métrica | Máximo |
|---|---|
| LCP | 2,0 s |
| CLS | 0,05 |
| INP | 200 ms |
| JavaScript inicial (comprimido) | 180 KB sem WebGL · 350 KB com WebGL |
| Peso da página inicial (sem vídeo) | 1,5 MB |
| Lighthouse telemóvel | ≥ 90 em Desempenho, Acessibilidade, Boas práticas e SEO |

Como se cumpre:

- Server Components por defeito; componentes interativos pequenos e isolados.
- Bibliotecas pesadas (three, players) carregadas com `dynamic()` e só onde são usadas.
- Letras em woff2, só os pesos usados.
- Nada de ler o layout (`getBoundingClientRect`, `offsetTop`, `scrollY`) em cada frame: medir uma vez e usar `ResizeObserver`/`IntersectionObserver` ou o valor do Lenis.
- Animações infinitas pausadas fora do ecrã.
- Scripts de terceiros (pixel do Meta, Google Tag) com `next/script` e `strategy="lazyOnload"`, e só com consentimento.

## B13. SEO e AEO (SEO para motores de IA)

**SEO clássico**

- `metadata` em todas as páginas: título (≤ 60 caracteres), descrição (≤ 155), canónico, Open Graph e Twitter. `metadataBase` definido.
- Imagem Open Graph gerada por página (`opengraph-image.tsx`) com a marca do cliente.
- `sitemap.ts` e `robots.ts` gerados a partir das rotas reais.
- Um só `h1` por página, títulos por ordem, URLs em português e curtas (`/servicos`, `/contacto`).
- Site antigo: mapa de redirecionamentos 301 de todas as URLs antigas.
- Se houver inglês: `/en/…` com `hreflang` nos dois sentidos.

**AEO: o que quase ninguém faz em Portugal**

- `lib/seo/site.ts` é a única fonte dos factos da empresa: nome, descrição, morada, telefone, horário, redes, área servida. O JSON-LD, o rodapé e o `llms.txt` leem daqui; nunca se contradizem.
- JSON-LD `Organization` (ou `LocalBusiness`, `Restaurant`, `Hotel`… conforme o negócio) e `WebSite` no layout, em todas as páginas. `BreadcrumbList` nas páginas interiores; `FAQPage` onde houver perguntas frequentes; `Product`/`Offer` nas lojas. Nunca chaves vazias.
- `/llms.txt` gerado: quem é a empresa, o que faz, onde, contactos e a lista das páginas com uma linha cada.
- O texto que explica o negócio está no HTML inicial e visível (não em imagens, não escondido).
- `robots.ts` deixa entrar os robôs de IA (GPTBot, ClaudeBot, PerplexityBot, Google-Extended), salvo se o cliente disser o contrário.
- Página de perguntas frequentes com respostas diretas: é o que os assistentes de IA citam.

## B14. Acessibilidade (WCAG 2.2 AA)

- Navegação completa só com teclado, com foco sempre visível (`:focus-visible` com contorno de 2 px no acento).
- Link «Saltar para o conteúdo» no topo.
- Contraste conforme B4. Texto nunca dentro de imagens.
- Menus e modais com foco preso enquanto abertos, Esc para fechar, foco devolvido ao botão.
- Botões são `<button type="button">`, links são `<a>`. Nada de div clicável.
- Vídeos de ambiente com botão de pausa; nada pisca mais de 3 vezes por segundo.
- Texto escondido para animação continua acessível (o SplitText mantém o texto original legível para leitores de ecrã; confirma com o axe).
- `lang="pt-PT"` no `<html>`.

## B15. Segurança e privacidade

- Cabeçalhos no next.config: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrito, `frame-ancestors 'none'`.
- Variáveis de ambiente validadas com Zod em `lib/env.ts`; tudo listado em `.env.example`; nunca segredos no repositório nem com `NEXT_PUBLIC_`.
- Formulários com Turnstile, limite de pedidos por IP e validação no servidor.
- RGPD: analítica sem cookies (Vercel Analytics) não precisa de faixa de cookies. Pixel do Meta ou Google Ads só depois de consentimento, com faixa clara («Aceitar» e «Recusar» com o mesmo peso). Página de política de privacidade com o responsável pelo tratamento (o cliente).
- Antes de cada lançamento, procurar segredos no bundle (grep por chaves no `.next`).

## B16. Formulários e email

- Server Actions com esquema Zod partilhado entre cliente e servidor.
- Resposta sempre com `{ ok, mensagem, erros? }`; mensagens em português, perto do campo.
- Envio pelo Resend a partir de um domínio verificado do cliente (SPF, DKIM, DMARC). Email automático de confirmação para quem escreveu.
- Estados: a enviar, enviado, erro; o botão fica desativado enquanto envia.
- Campos com `autocomplete` certo, `inputmode` nos números e telefones.

## B17. Qualidade de código e testes

- ESLint + Prettier (com ordenação das classes Tailwind) e `tsc --noEmit` antes de cada commit (husky ou lefthook).
- Commits convencionais: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
- Componentes como funções com nome, ficheiros em kebab-case, props com `interface`.
- Não desligar regras de lint para passar; corrigir o código.
- Testes Playwright (`e2e/`):
  - todas as páginas respondem 200 e o 404 responde 404;
  - axe sem erros sérios em todas as páginas;
  - capturas de ecrã a 375, 768 e 1440 px de cada página (para comparar entre versões);
  - o formulário envia e mostra a confirmação;
  - com `prefers-reduced-motion: reduce`, todo o texto está visível sem esperar.
- Cada pull request gera um link de teste da Vercel; o cliente comenta lá.

## B18. Responsivo e aparelhos

- Testar em aparelhos reais: um iPhone (Safari), um Android médio (Chrome) e um portátil com trackpad. Os simuladores não chegam.
- Alvos de toque com pelo menos 44×44 px.
- Nada depende de hover no telemóvel.
- Safari: confirmar `position: sticky`, `clip-path`, vídeos com `playsInline` e as barras do browser (usar `svh`).

## B19. Checklist de polimento (a semana que os outros saltam)

**Tipografia**

- [ ] Nenhuma viúva nem palavra solta em títulos, em 375, 768, 1440 e 1920 px.
- [ ] Espaçamento entre letras afinado nos tamanhos grandes.
- [ ] Aspas e travessões corretos («», —), não "aspas retas".

**Movimento**

- [ ] As mesmas curvas e durações em todo o site.
- [ ] Nenhuma animação começa antes de a letra carregar (sem saltos de linha).
- [ ] O herói está completo em menos de 2 s.
- [ ] Scroll rápido para cima e para baixo: nada fica a meio, nada pisca.
- [ ] Movimento reduzido ligado: o site lê-se inteiro e parado.
- [ ] Transições entre páginas sem flash branco e com o scroll no topo.

**Imagem**

- [ ] Todas as imagens com o mesmo tratamento de cor e sem pixelização em ecrãs retina.
- [ ] Recortes certos no telemóvel (nenhuma cara cortada).
- [ ] Vídeos com capa, a fazer loop sem salto.

**Detalhe**

- [ ] Favicon, ícone para iPhone, cor do browser (`theme-color`).
- [ ] Página 404 com a cara da marca.
- [ ] Estados de hover, foco, ativo e desativado em todos os elementos interativos.
- [ ] Seleção de texto com a cor da marca (`::selection`).
- [ ] Títulos dos separadores do browser certos em todas as páginas.
- [ ] Links externos abrem num novo separador com `rel="noopener"`.
- [ ] Copyright com o ano automático.

**Números**

- [ ] Lighthouse telemóvel ≥ 90 nas quatro categorias, em todas as páginas.
- [ ] Orçamento B12 cumprido.
- [ ] axe sem erros sérios.

## B20. Lançamento

- Domínio e alojamento em nome do cliente (Vercel do cliente ou equipa transferida).
- DNS apontado, HTTPS ativo, www a redirecionar para o domínio principal (ou ao contrário, mas um só).
- Redirecionamentos 301 do site antigo testados.
- Google Search Console: domínio verificado, sitemap submetido. Perfil de Empresa no Google atualizado com o novo site.
- Vercel Analytics e Speed Insights ligados.
- Webhook do Sanity a revalidar em produção.
- Email de teste dos formulários recebido pelo cliente.
- Proteção por palavra-passe retirada e robots a permitir indexação.
- Gravar o site em vídeo para o caso de estudo (computador e telemóvel).

## B21. Entrega ao cliente

- Guia de edição de uma página (com capturas): como mudar um texto, uma imagem, acrescentar um projeto.
- Vídeo de 5 minutos a mostrar o painel do Sanity.
- Lista de acessos (domínio, Vercel, Sanity, Resend), tudo em nome do cliente.
- O que está incluído no plano mensal, se o cliente o quiser.

## B22. Proibido

- Webflow, Framer, Wix, WordPress com temas prontos, jQuery, carrosséis pesados (Slick, Owl).
- Animar `width`, `height`, `top`, `left` ou `box-shadow` em scroll.
- Scroll suave forçado no telemóvel.
- Esconder conteúdo atrás de um preloader longo.
- Texto dentro de imagens.
- Lorem ipsum em qualquer entrega ao cliente.
- Inventar dados, testemunhos ou prémios.
- Português do Brasil.
- O símbolo ® sem marca registada.
- Segredos no código ou em variáveis `NEXT_PUBLIC_`.

## B23. Como reportar ao Francisco

No fim de cada fase, uma mensagem curta:

```
Fase X — <nome> ✓
Link de teste: <url>
Feito: …
A seguir: …
Preciso de: … (só se houver)
Lighthouse telemóvel: D xx · A xx · BP xx · SEO xx
```
