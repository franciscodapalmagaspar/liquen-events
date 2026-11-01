# Medições — depois da Fase 2 (31/10/2026)

A Fase 2 acrescentou a camada de movimento: o GSAP, o `@gsap/react` e o Lenis; os títulos de secção a entrar linha a linha (`RevealText`); o scroll suave só com rato e trackpad; o parallax só no computador. A regra era não descer dos 90.

Medido da mesma maneira que a tabela que decide da Fase 1 (`../depois-fase-1/LEIA-ME.md`):
- o ramo construído com `next build` e servido por `next start` nesta máquina;
- Lighthouse 12.8.2, telemóvel, com a rede e o processador travados a sério (`--throttling-method=devtools`: 4G lento e CPU ÷4);
- 3 corridas por página; a tabela mostra a mediana.

Os `.json` desta pasta são compactos; os relatórios inteiros estão em `completos/`.

| Página | Fase 1 | Fase 2 | LCP (s) | Speed Index (s) | TBT (s) | Peso (MB) |
|---|---|---|---|---|---|---|
| inicio | 93 | **95** | 1,0 → 1,0 | 4,0 → 3,9 | 0,25 → 0,19 | 2,5 → 2,6 |
| servicos | 94 | **93** | 1,0 → 1,0 | 1,4 → 1,4 | 0,28 → 0,31 | 0,7 → 0,7 |
| galeria | 98 | **98** | 2,1 → 2,1 | 1,4 → 1,4 | 0,10 → 0,10 | 0,7 → 0,7 |
| orcamento | 100 | **100** | 1,0 → 1,0 | 1,7 → 1,6 | 0,07 → 0,09 | 0,5 → 0,5 |

O CLS é 0 nas quatro páginas. A acessibilidade do `/orcamento` continua a 96, pela razão que está na Fase 1 (o rótulo «Telemóvel» corrige-se no #322).

## O que custou chegar aqui
A primeira versão pedia o GSAP logo ao montar a página. O `/servicos` caiu de 94 para 90: o tempo bloqueado passou de 0,28 s para 0,40 s, porque o GSAP (~120 kB) era avaliado durante o arranque.

Passar o pedido para depois do `load` não chegou: deu 90 na mesma.

O que resolveu foi descarregar o GSAP **só quando um título fica a um ecrã de chegar** (um `IntersectionObserver` com um ecrã de margem por baixo). O Lighthouse não desce a página, e a maior parte das visitas que não descem também não o descarregam.

O Lenis também só se descarrega depois do `load`, e só com rato ou trackpad. No telemóvel nunca chega.

## O que estes números não dizem
O scroll suave e o parallax só existem com rato. O Lighthouse mede um telemóvel, por isso não os vê.

No computador, o que conta é ela experimentar no link de teste. Se a roda parecer «atrasada», desliga-se com uma linha (`INERCIA_NA_RODA` em `SmoothScroll.tsx`).
