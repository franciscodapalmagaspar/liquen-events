# As verificações de cada mudança (CI)

> Palavras dela, a 15/10: «porque é que demora muito?… tornar tudo super
> eficiente, super rápido… para que não estejamos à espera muito tempo, que
> tudo funcione perfeitamente bem».

Antes de uma mudança entrar no site, o GitHub corre as verificações em
`.github/workflows/`. Até 15/10 um PR esperava **~28 minutos**. A espera estava
no CI do GitHub; a Vercel publica em ~1,5–2 minutos.

## Onde estava o tempo (medido com `gh api`, PRs #228 e #229)

| Job | Duração | Bloqueia? |
|---|---|---|
| E2E (Playwright): **11 invocações em fila** | 27–28 min | sim |
| · o passo «informativo» | 12 min | **não** |
| · `dados` (servidor `dev`, 1 worker) | 4,5–5 min | sim |
| · `@imagens` (118 passeios) | 4,5 min | sim |
| · os outros oito passos | ~4 min | sim |
| Lint · Typecheck · Test · Build | 12–15 min | sim |
| · testes de unidade (881 ficheiros, um processo) | 9–12 min | sim |
| Lighthouse (desktop e telemóvel, seguidos) | 15 min | não |

Quase metade do tempo era um passo que nem pode pôr um PR vermelho.

## Como passou a ser (15/10)

O trabalho é o mesmo: **nenhum teste saiu, nenhum se salta, nenhum orçamento
mudou**. As partes deixaram de esperar em fila, e cada uma tem o seu runner.

| Job | O que corre |
|---|---|
| `estatico` | audit, lint, typecheck, build, peso das rotas |
| `unitarios` ×3 | `vitest --shard=1/3`, `2/3`, `3/3` |
| `quality` | **«Lint · Typecheck · Test · Build»**: passa só se as quatro de cima passarem |
| `e2e-imagens` ×2 | `@imagens --shard=1/2`, `2/2` |
| `e2e-producao` | `@desempenho`, `@galeria`, `@movimento`, `@vidro`, `@semrede` (contra `next start`) |
| `e2e-dados` | `test:e2e:dados` (servidor `dev`, grava) |
| `e2e-gravam` | `test:e2e:movel`, `:propostas`, `:passkeys` (servidor `dev`) |
| `e2e` | **«E2E (Playwright)»**: passa só se os quatro de cima passarem |
| `e2e-informativo` ×3 | o resto da suite, em três partes, sem bloquear (como sempre) |
| Lighthouse ×2 | desktop e telemóvel ao mesmo tempo (informativo, como sempre) |

- **Os dois nomes de sempre ficam.** Não consegui ler que verificações o GitHub
  exige para juntar (a leitura dá 403 com o acesso desta casa). Por isso os jobs
  «Lint · Typecheck · Test · Build» e «E2E (Playwright)» continuam a existir e
  só passam se todas as suas partes passarem. Se forem obrigatórios, continuam a
  sê-lo, com o mesmo significado.
- **O começo de cada job é um só**, a acção `.github/actions/preparar`: Node,
  dependências, a cache das miniaturas e, se pedido, o Chromium e o build. Assim
  nenhum job diverge no que instala nem na chave da cache, como já tinha
  acontecido ao Lighthouse.
- **Os jobs que usam o servidor `dev` não fazem build**, porque não precisam
  dele.

## O que custa

- **Com a cache das miniaturas quente** (quase sempre), cada build leva ~1
  minuto. Há mais builds do que antes (um por job contra `next start`), mas
  correm em paralelo.
- **Com a cache fria** (a primeira corrida depois de entrarem fotografias novas),
  cada job que constrói paga o encode das miniaturas (~13 min), em paralelo. É o
  mesmo que antes pagava o job maior, sozinho.
- **Mais minutos de runner no total.** O repositório é público, e os minutos do
  GitHub Actions não se pagam.

## Os tempos depois da 1.ª volta (#231, medidos)

| Job | Tempo |
|---|---|
| Lint · Typecheck · Build | 3:43 |
| Testes unitários 1/3 · 2/3 · 3/3 | 2:55 · 3:49 · **7:59** |
| E2E · imagens 1/2 · 2/2 | 4:07 · 5:21 |
| E2E · peso, galeria, molas, vidro, sem rede | 4:44 |
| E2E · telemóvel, propostas, passkeys | 3:37 |
| E2E · dados | 6:59 |

Espera total de cerca de 8 minutos, contra 28. Os dois mais lentos eram a parte
3/3 dos testes de unidade (lá calhou o ficheiro do estúdio, que levava ~6
minutos sozinho) e os `dados`.

## A 2.ª volta: inteligente (15/10)

Ela pediu «2 minutos, 3 minutos… quero tornar o sistema mesmo inteligente», e
escolheu **«inteligente + completa depois»**:

- **Num PR, verifica-se o que a mudança pode afectar.** Quem decide é o job
  `decidir`, com a regra em `scripts/ci/o-que-correr.mjs` (um teste por caso;
  na dúvida, corre tudo):
  - **só documentos** (`docs/`, `*.md`) → só o lint, o typecheck e o build;
  - **os testes de unidade** → só os ligados a um ficheiro mudado (`vitest
    related`, que segue o grafo de imports);
  - **os passeios no browser, por área** → uma mudança só no sítio público não
    corre os passeios que gravam do back office (`dados`, telemóvel, propostas,
    passkeys); uma mudança no back office corre tudo o que é browser; o que é
    partilhado (`src/lib`…) corre tudo;
  - **configuração, dependências, o próprio CI, os passeios** → tudo.
- **Depois de juntar, todas as noites (03:17) e à mão** → a verificação
  **completa**. É isto que a rapidez troca: uma avaria que um PR inteligente
  não apanhasse aparece na corrida seguinte do `main`, e o GitHub avisa por
  email.
- **Mais depressa mesmo quando corre tudo:**
  - o ficheiro do estúdio (339 testes, ~6 min) e o do `montar` (~2 min) correm
    em partes (`test/em-partes.ts`): os casos ficam num `*.casos.test.tsx` (que o vitest não corre sozinho), e cada
    `*.parte-N.test.tsx` corre uma fatia dos `describe`;
  - testes de unidade em 5 partes, imagens em 3, `dados` em 3, informativo
    em 4;
  - lint e typecheck ao mesmo tempo, com cache (`eslint --cache`,
    `tsc --incremental`);
  - o Chromium guardado entre corridas.
- **Os totais à vista:** cada parte de unidade, de imagens e de dados escreve
  uma anotação com o que correu, para se conferir que a soma é tudo (887
  ficheiros de unidade desde esta volta).

## Os tempos da 2.ª volta (#232, medidos no próprio PR, que corre tudo)

O PR muda o `.github/`, por isso o `decidir` mandou correr **tudo** — é o pior
caso, o mesmo que corre depois de juntar e à noite.

| Job | Tempo |
|---|---|
| O que verificar (`decidir`) | 0:19 |
| Lint · Typecheck · Build | 2:18 |
| Testes unitários 1/5 · 2/5 · 3/5 · 4/5 · 5/5 | 1:58 · **4:12** · 3:38 · 2:54 · 2:04 |
| E2E · imagens 1/3 · 2/3 · 3/3 | 3:33 · 3:40 · 3:07 |
| E2E · dados 1/3 · 2/3 · 3/3 | 2:46 · 2:53 · 2:36 |
| E2E · peso, galeria, molas, vidro, sem rede | 4:24 |
| E2E · telemóvel, propostas, passkeys | 3:41 |

**Espera para juntar: 6 minutos** (do empurrão ao último job que bloqueia),
contra 8 na 1.ª volta e 28 antes. Os totais conferem: as cinco partes de
unidade somam **887 ficheiros**, 11 861 testes passados, 3 saltados, 0 falhas;
as três de imagens somam 128 passeios, 0 falhas.

**O que ainda segura o tempo, e porquê:** o GitHub só corre **20 jobs ao mesmo
tempo** num repositório público, e uma corrida completa pede 25. As partes 1/5
e 3/5 dos testes esperaram 1 a 2 minutos por um runner livre antes de
começarem. Num PR típico (só o sítio, ou só o back office) correm menos jobs, e
essa fila não existe.

**O caminho rápido (só documentos, ou só um ecrã) ainda não está medido.** O
`decidir` olha para o PR inteiro, e este PR mexe no `.github/` — por isso todos
os commits dele correm tudo. Mede-se no primeiro PR depois de este entrar, e o
número fica aqui.

## As pré-visualizações da Vercel só se constroem quando se pedem (22/10)

A conta da Vercel é a grátis (Hobby). A 22/10 passou os limites — 17,35 GB de
publicações guardadas (o limite são 10 GB) e 258 mil «ISR Writes» (o limite são
200 mil) — e a Vercel **bloqueou todas as publicações de produção**: nada do que
entrava no `main` chegava ao site, durante mais de um dia, sem aviso nenhum do
lado do GitHub. Ela escolheu «ficar no grátis e emagrecer».

- Cada push a um ramo de PR criava uma pré-visualização de centenas de MB. Agora
  o `vercel.json` tem `ignoreCommand: node scripts/vercel-construir.mjs`:
  **produção constrói sempre; uma pré-visualização só se constrói num ramo
  `preview/…` ou com `[preview]` na mensagem do commit.**
- Para pedir uma pré-visualização de um PR: um commit com `[preview]` na
  mensagem, ou empurrar o mesmo commit também para `preview/<nome>`.
- A página de cada serviço (`servicos/[slug]`) regenerava-se de 30 em 30 s — era a
  origem das escritas ISR. Passou a uma vez por dia, e um teste impede outra rota
  de ganhar `revalidate` sem se dizer.
- **Antes de dizer «está no site»:** confirmar de fora. O `age` da resposta da
  página inicial tem de ser pequeno e o HTML tem de trazer a mudança.

### A causa verdadeira do bloqueio (23/10): o autor que a Vercel deixou de reconhecer

O «Redeploy» da produção mostrou a razão: «The deployment was blocked because
the commit author doesn't have permission to create deployments for this
project. Hobby teams do not support collaboration.» Não eram os limites.

- Todos os commits do `main` vêm da mesma conta do GitHub (id 302690961). A
  20/10 essa conta mudou de nome («Liquen Events» → «franciscodapalmagaspar») e
  o repositório passou a responder por `franciscodapalmagaspar/liquen-events`.
  O último deploy de produção que passou é de 21/10, ~13h; desde aí, «Blocked».
- O remédio, feito por ela a 23/10: na Vercel, Account Settings →
  Authentication → voltar a ligar o GitHub, e no projecto, Settings → Git,
  confirmar o repositório. Um deploy bloqueado não se volta a publicar pelo
  «Redeploy» (no Hobby só oferece «Upgrade to Pro»): é preciso um commit novo no
  `main`.
- **Se voltar a acontecer** (todos os deploys de produção «Blocked» com o mesmo
  aviso): ver se a conta do GitHub mudou de nome ou de dono antes de olhar para
  os limites.
