# Medições — antes (Fase 0, 30/10/2026)

O site em produção, `https://liquen-events.com`, no commit `10ab60f` do `main`. Lighthouse 12.8.2, perfil de telemóvel (Moto G Power simulado, 4G lento), Chromium sem cabeça.

Nesta pasta:
- um `.json` compacto por corrida: as notas, as métricas, o elemento do LCP, os dez maiores pedidos e as auditorias que falham;
- o relatório inteiro, comprimido, em `completos/`.

## Duas séries, e porquê
Esta máquina mede **~2800–3200 de `benchmarkIndex`**, muito acima do telemóvel que o PageSpeed simula.

**Série normal** (o CPU 4× mais lento, a predefinição do Lighthouse, 3 corridas por página): aqui o JavaScript quase não pesa, e as notas saem altas de mais.

| Página | corridas | Desempenho | Acess. | Boas práticas | SEO | LCP (s) | Speed Index (s) | TBT (s) | CLS | Peso (MB) | Trabalho CPU (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| galeria | 3 | 91 | 100 | 100 | 100 | 3 | 4.6 | 0.06 | 0 | 0.7 | 1.5 |
| inicio | 3 | 91 | 100 | 100 | 100 | 2.9 | 4.7 | 0.09 | 0 | 7.9 | 2.1 |
| orcamento | 3 | 95 | 96 | 100 | 100 | 2.6 | 3.9 | 0.05 | 0 | 0.5 | 1.2 |
| servicos | 3 | 89 | 100 | 100 | 100 | 3 | 4.9 | 0.14 | 0 | 0.8 | 1.8 |

**Série «processador lento»** (`--throttling.cpuSlowdownMultiplier=10`, 2 corridas por página): aproxima-se do que o PageSpeed mediu. É esta a série a bater na Fase 1.

| Página | corridas | Desempenho | Acess. | Boas práticas | SEO | LCP (s) | Speed Index (s) | TBT (s) | CLS | Peso (MB) | Trabalho CPU (s) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| galeria | 2 | 79 | 100 | 100 | 100 | 3.4 | 4.9 | 0.55 | 0 | 0.7 | 4.2 |
| inicio | 2 | 75 | 100 | 100 | 100 | 2.9 | 6.4 | 3.24 | 0 | 7.9 | 10.7 |
| orcamento | 2 | 92 | 96 | 100 | 100 | 2.8 | 3.9 | 0.36 | 0 | 0.5 | 3.2 |
| servicos | 2 | 81 | 100 | 100 | 100 | 3.3 | 4.9 | 0.56 | 0 | 0.8 | 4.1 |

Nas duas tabelas, cada valor é a mediana das corridas; com duas corridas, é a maior das duas.

**O ponto de partida dela**, medido no PageSpeed a 30/10, página inicial:

| Desempenho | LCP | Speed Index | TBT | Peso | Trabalho CPU |
|---|---|---|---|---|---|
| 62 | 2,9 s | 5,9 s | 1,9 s | 4,2 MB | 8,6 s |

O PageSpeed oficial, chamado daqui, respondeu «quota diária esgotada». Por isso não há uma terceira série.

## O que já se vê
- **Página inicial, o peso:**
  - 6,9 MB dos 7,9 MB são o `videos/entrada/v6/entrada-1-retrato.mp4`.
  - Este Chromium pediu o MP4; o PageSpeed dela pediu o WebM, de 3,3 MB.
- **Página inicial, o processador** (série lenta):
  - 10,7 s de trabalho no fio principal e 3,2 s de TBT;
  - o maior bloco de JavaScript é um único pedaço, `2jqd0dpb7brv_.js`: 1,5 a 3,3 s de avaliação;
  - 1,6 a 2,6 s vão para o próprio documento, isto é, o HTML e o guião inline da entrada.
- **`/orcamento`, acessibilidade 96:** o contraste do «Escolher a data», que vem do #317. É a cor `--fg-tertiary` sobre o cinzento da caixa: 4,2:1, abaixo dos 4,5:1. O mesmo texto existe nos dois formulários dos anúncios.
- **Os componentes `'use client'`:** estão em `componentes-cliente.md`.
