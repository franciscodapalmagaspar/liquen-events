---
name: design-nivel-premium
description: Usar ao criar ou redesenhar qualquer site, landing page, página ou interface (Palumen, Líquen, clientes) — eleva o resultado ao nível dos estúdios mais premiados de Portugal (Bürocratik, Duall, Lavva, Pixelmatters, Significa…).
---

# Design nível premium

O alvo: um site que pudesse estar no portfólio dos melhores estúdios portugueses e ganhar Site of the Day no Awwwards. Não "bonito" — memorável.

Regras do projeto em `.claude/rules/` e a skill da marca (palumen-padrao, liquen-padrao) ganham a esta.

## A liga de referência (Portugal)
**Topo absoluto (mais premiados no Awwwards em Portugal)**
- **Bürocratik** — burocratik.com · o estúdio português mais premiado (dezenas de SOTD, 2 Sites of the Month: Couro Azul, Floema). Referência máxima de direção de arte e interação.
- **Duall Studio** — duallstudio.com · SOTD com One 24, Amuse Bouche e o próprio site.
- **Lavva** — lavva.pt · SOTD com ROM Boats; hotelaria e indústria.

**Muito fortes**
- Forwwward Studio (forwwward.studio), Antecâmara Studio (antecamarastudio.com), Lynksen (lynksen.com)
- Pixelmatters (fluidez e animação), Significa (produto digital), A Creatura (marcas "de conceito" de Lisboa)

**Fora de Portugal:** Apple (clareza, Liquid Glass, HIG), SpaceX, Aernova.

Com acesso à web: abre 2–3 projetos premiados destes estúdios (páginas deles em awwwards.com) e escreve, antes de desenhar, 5 técnicas concretas que vais aplicar. Nunca copies layouts, textos ou assets — aprende o princípio, cria original.

## Antes de desenhar
1. O conceito numa frase. Os melhores sites têm uma ideia, não só um layout.
2. Sentimento em 3 palavras.
3. A única ação que o visitante deve fazer.

## Tipografia
- Máx. 2 famílias: uma display com carácter + uma de leitura.
- Títulos grandes e confiantes, `letter-spacing` negativo, escala dramática (14 / 16 / 24 / 48 / 96 / 160+).
- Tipografia como imagem: palavras que se revelam e reagem ao scroll.
- Corpo: 55–75 caracteres por linha, `line-height` 1.5–1.7.

## Espaço e composição
- Espaço em branco generoso (secções 120–200px em desktop). Escala fixa de 4/8px.
- Grelha de 12 colunas, quebrada de propósito: assimetria, sobreposições, imagens a sangrar.

## Cor
- Paleta curta e corajosa: 1 cor de marca, 2–3 neutros quentes, 1 acento. Contraste AA. Evitar #000 e #FFF puros em grandes áreas.

## Imagem e vídeo
- Fotografia/vídeo grande, real e com direção de arte. Nada de stock genérico.
- AVIF/WebP, tamanhos corretos, lazy load abaixo da dobra, medidas definidas (sem layout shift).

## Movimento
- Cada animação conta algo: reveals ao scroll, transições entre páginas, microinterações em hover, cursor personalizado quando faz sentido.
- Easing natural (ex: `cubic-bezier(0.22, 1, 0.36, 1)`), 300–900ms, coreografia em sequência.
- Lenis para smooth scroll; GSAP/ScrollTrigger ou Framer Motion; WebGL só quando reforça o conceito.
- 60fps. Respeita `prefers-reduced-motion`.

## Detalhes que ganham prémios
- Preloader curto e memorável (ou nenhum). Hover, foco e carregamento desenhados.
- Footer tão cuidado como o hero. Favicon, Open Graph, título e 404 com personalidade.
- Mobile desenhado de raiz, não encolhido.

## Performance e acessibilidade
- Lighthouse ≥ 90 em tudo. CLS < 0.1, LCP < 2.5s em telemóvel. Teclado e leitores de ecrã funcionam.

## Critérios Awwwards (antes de entregar)
Nota 1–10, com screenshots mobile e desktop: **Design** (40%) · **Usabilidade** (30%) · **Criatividade** (20%) · **Conteúdo** (10%).
Nota < 8 → diz as 3 coisas que a puxam para baixo e corrige. Pergunta final: "A Bürocratik publicava isto?"
