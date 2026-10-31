# Medições — depois da Fase 1 (31/10/2026)

O ramo `melhoria/nivel-estudio`, construído com `next build` e servido por `next start` NESTA máquina. Lighthouse 12.8.2, perfil de telemóvel, Chromium sem cabeça. As páginas e os dois perfis são os mesmos da Fase 0 (ver `../antes/LEIA-ME.md`).

## Porque há um «controlo»
A Fase 0 mediu o site publicado, servido pela rede da Vercel. Isto aqui é um servidor local, e o Lighthouse simula a rede a partir do que observa: em `localhost` chega tudo em ~0,2 s, e a simulação põe na conta do LCP todo o JavaScript que chegou antes dele. Resultado: o LCP sai ~1 s pior em TODAS as páginas, até nas que este ramo não mexe.

Por isso o `main` (com o #318) foi construído e medido ao lado, na mesma máquina e da mesma maneira. A comparação justa é **ramo contra controlo**, e não ramo contra a Fase 0.

Nesta pasta:
- `ramo/`: as corridas do ramo. Tem um `.json` compacto por corrida e o relatório inteiro em `completos/`, e o mesmo para o perfil lento em `processador-lento/`.
- `controlo-main/`: as do `main`, só os compactos.

## Perfil normal (CPU ÷4, 3 corridas, mediana)

| Página | | Desempenho | Acess. | LCP (s) | Speed Index (s) | TBT (s) | Peso (MB) |
|---|---|---|---|---|---|---|---|
| inicio | `main` | 76 | 100 | 5,1 | 4,4 | 0,14 | 8,0 |
| inicio | ramo | **85** | 100 | 4,3 | **1,9** | 0,13 | **2,6** |
| orcamento | `main` | 91 | 100 | 3,2 | 3,4 | 0,09 | 0,5 |
| orcamento | ramo | 90 | 96 ¹ | 3,6 | 1,1 | 0,07 | 0,5 |
| servicos | `main` | 88 | 100 | 3,4 | 4,4 | 0,12 | 0,9 |
| servicos | ramo | 85 | 100 | 4,1 | 1,7 | 0,16 | 0,9 |
| galeria | `main` | 84 | 100 | 4,2 | 4,2 | 0,08 | 0,8 |
| galeria | ramo | 86 | 100 | 4,1 | 1,6 | 0,07 | 0,8 |

## Perfil «processador lento» (CPU ÷10, 2 corridas, a pior)

| Página | | Desempenho | LCP (s) | Speed Index (s) | TBT (s) | Peso (MB) |
|---|---|---|---|---|---|---|
| inicio | `main` | 57 | 5,4 | 4,8 | 0,83 | 7,6 |
| inicio | ramo | **74** | 5,2 | **2,3** | 1,36 ² | 4,1 ³ |
| orcamento | `main` | 82 | 3,9 | 3,8 | 0,41 | 0,5 |
| orcamento | ramo | 79 | 3,9 | 1,4 | 0,49 | 0,5 |
| servicos | `main` | 72 | 4,4 | 4,6 | 0,64 | 0,9 |
| servicos | ramo | 73 | 4,4 | 1,7 | 0,78 | 0,9 |
| galeria | `main` | 67 | 4,5 | 4,5 | 0,58 | 0,8 |
| galeria | ramo | 72 | 4,4 | 1,7 | 0,52 | 0,8 |

¹ O ramo foi construído antes de o #318 entrar no `main`, por isso ainda não tinha a correcção do contraste do «Escolher a data». O controlo já a tinha.

² O TBT vem quase todo de dois pedaços que são o próprio React e o router do Next. Varia muito de corrida para corrida: no ramo, 0,62 s numa e 1,36 s na outra. Com duas corridas, a tabela mostra a pior.

³ Medido antes do último commit. Nessa altura, a cópia do take de abertura ainda se pedia no arranque (+1 MB); agora só se pede quando ele sai do ecrã.

## E o mesmo no CI do GitHub (outra máquina, a mesma conta)
O passo «Performance / A11y / SEO budgets (telemóvel)» corre o Lighthouse 3 vezes por página sobre o `next start` da máquina do CI, e publica a mediana. Compara-se o PR #318 (o `main`, 31/10 00:01) com o #319 (este ramo, 31/10 01:00):

| Página | Desempenho `main` | Desempenho ramo | LCP (s) `main` → ramo | Speed Index (s) | TBT (ms) | Peso (MB) |
|---|---|---|---|---|---|---|
| inicio | 61 | **72** | 4,7 → 5,0 | 5,1 → 2,4 | 797 → 379 | 8,0 → 2,8 |
| servicos | 72 | **85** | 5,2 → 4,0 | 4,6 → 1,5 | 276 → 156 | 0,8 → 0,9 |
| contacto | 82 | 84 | 3,7 → 4,4 | 4,4 → 1,5 | 248 → 106 | 1,0 → 1,0 |
| clientes | 56 | **82** | 5,9 → 3,3 | 4,8 → 1,8 | 771 → 420 | 1,1 → 1,1 |
| galeria | 80 | **86** | 4,2 → 4,1 | 4,4 → 1,4 | 218 → 80 | 0,8 → 0,8 |
| sobre | 78 | **85** | 4,6 → 4,3 | 4,4 → 1,6 | 218 → 111 | 1,2 → 1,2 |

O CI também mede em `localhost`, por isso o LCP sai inflacionado do mesmo modo. A acessibilidade do `/contacto` dá 96 nos dois: é um problema que já existia, e fica para a Fase 3.

## A medição que decide: com a rede travada A SÉRIO (31/10)
As duas séries acima simulam a rede (o Lighthouse «lantern»): em `localhost` toda a JavaScript chega antes do LCP e entra na conta, e o LCP sai ~4 s em todas as páginas, até nas que não mudaram. Por isso a medição que decide é a outra que o Lighthouse tem: `--throttling-method=devtools`, com a rede e o processador travados de verdade (4G lento, CPU ÷4) e o que o browser passa medido, e não estimado. O guião está em `scratchpad/lh/medir-devtools.sh`; os relatórios em `rede-real/` (o `main` de 31/10 de madrugada, com o #318, em `rede-real/controlo-main/`).

O ramo já com tudo da Fase 1: os vídeos v8 a 50 fps, a capa primeiro e sem cortina, a Google só ao primeiro toque, e o `main` com o #320 e o #321. 3 corridas, mediana:

| Página | `main` | ramo | LCP (s) | Speed Index (s) | TBT (s) | Peso (MB) |
|---|---|---|---|---|---|---|
| inicio | 78 | **93** | 1,0 → 1,0 | 7,4 → 4,0 | 0,58 → 0,25 | 4,4 → 2,5 |
| servicos | 93 | **94** | 1,0 → 1,0 | 3,2 → 1,4 | 0,30 → 0,28 | 1,0 → 0,7 |
| galeria | — | **98** | 2,1 | 1,4 | 0,10 | 0,7 |
| orcamento | — | **100** | 1,0 | 1,7 | 0,07 | 0,5 |

**A Fase 1 chega aos 90 nas quatro páginas.** O que levou a página inicial dos 88 aos 93 foi a Google passar a entrar só ao primeiro toque (ela escolheu, 31/10): eram ~265 ms dos ~440 ms de tempo bloqueado.

A acessibilidade do `/orcamento` dá 96: a página voltou ao desenho de antes (#321), e o rótulo «Telemóvel» em repouso tem 3,06:1 (precisa de 4,5:1); e o botão da bandeira diz ao leitor de ecrã um nome que não começa pelo texto que se vê. Tratados à parte, porque são da página que está no ar.

O ecrã «loading» (`(site)/loading.tsx`) foi posto à prova: sem ele a página inicial deu 85, com ele 88 — ruído entre corridas. Fica.

## O que estes números dizem, e o que não dizem
- **Dizem:**
  - a página inicial ficou muito mais leve: 8 MB passaram a 2,6 MB;
  - a capa aparece muito antes: o Speed Index caiu para menos de metade em todas as páginas, porque a cortina saiu;
  - o Desempenho da página inicial subiu 9 pontos no perfil normal e 17 no lento.
- **Não dizem** se o site chega aos 90 do pedido. O LCP daqui não é o da Vercel: é a medição na pré-visualização que decide (`[preview]` no último commit do PR).
