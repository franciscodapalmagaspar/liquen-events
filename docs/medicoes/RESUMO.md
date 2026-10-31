# «Nível estúdio» — o antes e o depois (31/10/2026)

O pedido teve três fases:
- **Fase 1 — velocidade**: chegar a ≥ 90 no telemóvel;
- **Fase 2 — movimento de estúdio**: GSAP, Lenis, títulos linha a linha, parallax, sem descer dos 90;
- **Fase 3 — AEO e acabamento**: robots, `llms.txt`, dados estruturados, Playwright em todo o sitemap, a lista B19.

Este ficheiro junta os números. O pormenor de cada medição está nas pastas indicadas.

## A tabela que decide
**Como se mediu.** Lighthouse 12.8.2, perfil de telemóvel, com a rede e o processador **travados a sério** (`--throttling-method=devtools`: 4G lento e CPU ÷4). Foram 3 corridas por página, e a tabela mostra a mediana. Mediram-se, na mesma máquina e no mesmo dia:
- **antes**: o `main` de hoje (`c9aaea8`, com o #320 e o #321);
- **depois**: este ramo, no fim da Fase 2.

A Fase 3 não mudou nada do que corre no browser.

| Página | Desempenho antes → depois | LCP (s) | Speed Index (s) | TBT (s) | CLS | Peso (MB) |
|---|---|---|---|---|---|---|
| início | 80 → **95** | 1,0 → 1,0 | 7,4 → **3,9** | 0,52 → **0,19** | 0 → 0 | 4,7 → **2,6** |
| serviços | 93 → **93** | 1,0 → 1,0 | 3,2 → **1,4** | 0,29 → 0,31 | 0 → 0 | 1,1 → **0,7** |
| galeria | 98 → **98** | 2,2 → 2,1 | 3,1 → **1,4** | 0,08 → 0,10 | 0 → 0 | 1,1 → **0,7** |
| orçamento | 99 → **100** | 1,0 → 1,0 | 2,8 → **1,6** | 0,07 → 0,09 | 0 → 0 | 0,9 → **0,5** |

As outras três categorias, depois:
- **Boas práticas** e **SEO**: 100 nas quatro páginas.
- **Acessibilidade**: 100 em três páginas. O `/orcamento` dá 96 antes e depois. A causa é o rótulo «Telemóvel» com 3,06:1, e corrige-se no PR #322, que está verde e à espera dela.

Os relatórios:
- antes: `depois/controlo-main/`;
- depois: `depois-fase-2/`;
- o caminho da Fase 1: `depois-fase-1/`.

## O que mudou, por ordem de peso
- **Início, de 80 para 95.**
  - Os vídeos da entrada foram refeitos (v8, 50 fps, a partir dos originais 4K) e só começam depois de a página carregar. A capa (a fotografia) é o LCP.
  - A cortina saiu.
  - A Google só entra ao primeiro toque, como ela escolheu.
  - O peso caiu de 4,7 para 2,6 MB.
- **Speed Index a metade ou menos em todas as páginas.** A cortina já não esconde a página no arranque.
- **O movimento da Fase 2 não custou pontos.**
  - O GSAP só se descarrega quando um título fica a um ecrã de chegar.
  - O Lenis só se descarrega com rato ou trackpad, e depois do `load`.
  - Quem abre no telemóvel e não desce não leva nenhum dos dois.

## E a medição da Fase 0 (o site publicado)
A Fase 0 mediu o site **publicado** com a rede simulada (`antes/`). Deu 91, 89, 91 e 95, porque a simulação desconta mal o que chega da Vercel. Essa série não se compara com esta. A medição publicada do depois faz-se no link de teste, que tem a proteção da Vercel e por isso só ela o abre.

## O que não chegou ao B12
O B12 do `docs/PADRAO-PALUMEN.md` é o orçamento de desempenho, medido no telemóvel em 4G:

| Métrica | Máximo do B12 | Depois | |
|---|---|---|---|
| LCP | 2,0 s | 1,0–2,1 s | a galeria fica 0,1 s acima (era 2,2 s antes) |
| CLS | 0,05 | 0 | cumprido |
| INP | 200 ms | — | **não verificado**: o INP só se mede com visitas reais (Speed Insights), não em laboratório. O TBT, que é o que o laboratório mede, desceu |
| JavaScript inicial (comprimido) | 180 kB | 208–226 kB | **não cumprido**: o grosso é o React e o router do Next, comum a todas as páginas |
| Peso do início sem vídeo | 1,5 MB | 0,87 MB | cumprido |
| Lighthouse telemóvel ≥ 90 nas quatro categorias | | ver acima | cumprido, excepto a Acessibilidade do `/orcamento` (96), que fica cumprida com o #322 |

## Fase 3, num relance
- O `robots.txt` diz pelo nome que o GPTBot, o OAI-SearchBot, o ClaudeBot, o PerplexityBot e o Google-Extended podem entrar. Há um teste.
- O `llms.txt` tem os cinco serviços: faltavam dois. Um teste prende cada serviço novo à lista.
- Os dados estruturados já existiam: empresa, site, perguntas frequentes, serviços e migalhas. Não se acrescentou `LocalBusiness`: o `src/lib/site.ts` regista que foi tirado de propósito, com a geografia, por decisão dela.
- O passeio `e2e/o-sitio-inteiro.spec.ts` percorre as 62 páginas do sitemap: todas respondem 200 e nenhuma tem erros estruturais no axe. Com `CAPTURAS=1`, tira as capturas a 375, 768 e 1440 px que estão em `capturas/`.
- A lista B19 está em `B19.md`, ponto a ponto.
