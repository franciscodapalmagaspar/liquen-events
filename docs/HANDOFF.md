# Passagem de sessão — 18/11/2026 (tarde)

Para a sessão nova do Claude que continua o trabalho da Líquen. Lê primeiro o
CLAUDE.md e TODAS as regras em `.claude/rules/` (sobretudo `autonomia.md`,
`codigo.md`, `custo.md`, `zero-erros.md`). Fala com o Francisco SEMPRE em
português de Portugal, sem pedir confirmações (só as mudanças VISUAIS se
mostram antes). O repositório chama-se `franciscodapalmagaspar/liquen-events`.

**O dono mandou PARAR a 18/11 à tarde para gerir o limite semanal do plano.**
Não retomes os agentes até ele dizer. Quando disser, começa pela tabela abaixo.

## Onde está o site

- `main` = lote de 19/11 (PR #488, merge commit 1f4b029): rota da proposta em
  etapas, gerador antigo do PDF apagado, esquemas zod, regras. CI 28/28 verde.
  Deployment **dpl_399TsdN5UZEPqcon9DPCf8BmY76D READY**, o único desde o merge.
  `liquen-events.com` responde 200 em `/`, `/orcamento`, `/galeria`, `/orcamento/admin`.
- **Lote seguinte aberto:** ramo `lote/2026-11-20` (sem PR ainda). Leva o grafo
  do código atualizado (`graphify update`, só AST) e esta passagem.

## Base de dados (Supabase `fvbafdezhslqojjsjgwi`)

- As 4 colunas de `tasks` (`notas`, `subtarefas`, `anexos`, `posicao`) existem em
  produção. Uma gravação com a forma exata do `tasks-store` passou (numa
  transação desfeita). Ninguém criou tarefas desde então (a base tem 1, de 10/09):
  a prova final no site é ela ou ele criarem uma — não há entrada no back office
  a partir daqui.
- Sem erros «column»/«tasks» nos logs de produção das últimas 23 h (18/11).

## Frentes (todas PARADAS; cada uma com o trabalho no seu ramo)

**Problema comum:** os ramos `codigo/*` e `dados/migracoes` partiam de
`e8a4a94` (lote de 17/11). O `main` andou 56 commits. Cada um tem de fazer
`git merge origin/main` (nunca rebase) ANTES da revisão/júri final, e as
capturas a 0 px comparam contra o `main` ATUAL.

| Ramo | Cabeça ao parar | Estado | Júri | Falta |
|---|---|---|---|---|
| `dados/migracoes` | ver `git log` (c8d6f41d ou um WIP do merge) | revisão R1–R5 e júri J1–J10 corrigidos; PGlite no CI (~5 s) | 8,5 → por medir | acabar o merge do `main` (3 conflitos: `proposta-doc/route.ts` → etapas em `lib/orcamento/envio/`, `proposals-store.ts`, `quotes-store.ts`); depois SEGUNDA passagem da revisão + júri ≥ 9 |
| `dados/p1-a-p3` | 4cc217c2 | pontos 1–6 e 9–13 do júri feitos e verificados (tsc, lint, build, 572 testes); 3 erros reais corrigidos com teste (paginação que parava na 1.ª página curta; inversos das ligações acima do limite; lista do que sai acima do tecto do anexo); `db/README.md` novo | 8,5 → por medir | 7 e 8 (Mapper tipado, `lerEspaco`/`gravarEspaco`) escritos como próximo passo; merge do `main`; vitest inteiro; revisão independente + júri |
| `codigo/estudio-fases-3-a-4` | b25c8be6 | merge do `main` feito (a4f042bc, tabela na mensagem); tsc, lint, build, sem ciclos, 576/576 no subconjunto; **erro real corrigido**: ao abrir com um rascunho local e a leitura do servidor falhada, as correções automáticas gravavam por cima de uma versão mais recente de outro dispositivo (`esperaPorElaParaGravar`, com testes) — muda o comportamento face ao `main` (o indicador deixa de acender sem gesto dela); o vermelho de `parte-1` era só tempo (waitFor 3 → 10 s) | por medir | e2e das propostas depois do merge; capturas contra o `main` atual + estados com fotos/mood boards/capa/validade (intercetar `/assets` com `public/imagens`); vitest inteiro; graphify; revisão + júri |
| `codigo/admin-e-temas-local` | 80536732 (**WIP, `--no-verify`**) | merge do `main` feito (98b28fb5; tsc e catraca ok, 482/484, as 2 explicadas); `ThemeFolder` movido tal e qual para `_temas/PastaDoTema.tsx` (1 466) e `Temas.tsx` com 1 395 | **7** | verificar o WIP (tsc dos testes do Temas, catraca, `fonte-do-admin.testkit`, prettier/eslint); ponto 1 (reducer, `celulaDaFoto`, `accoesDaFoto`, `useLupaDaPasta`) e pontos 2–10 do júri (lista no relatório de 18/11: paginação das fotos num sítio, `useListaDosPedidos`, `useNotasDoPainel`, uma regra para mudar o estado, `useGavetaDoPedido`, casts, testes diretos dos hooks, `Temas()`, resto do AdminClient). Alvos: AdminClient ≤ 900, Temas ≤ 600, PastaDoTema ≤ 500, ThemePicker ≤ 700, nenhum hook com >8 entradas. A mudança `a-sair-da-pagina` no `ProposalStudio.tsx` (import ~l.70 e o `catch` do `hidratarAssets` ~l.2433) vai para a peça certa quando se juntar ao estúdio |
| `dados/plano-da-estrutura` | 28234a2b | `docs/ESTRUTURA-DOS-DADOS.md` | — | — |

Ordem para juntar ao lote, quando cada um tiver júri ≥ 9: `dados/migracoes` →
`dados/p1-a-p3` (o `db/` é igual) → `codigo/estudio-fases-3-a-4` →
`codigo/admin-e-temas-local` (resolver o `ProposalStudio.tsx` contra o estúdio).

As cabeças exatas: `git log -1 origin/<ramo>` (cada agente fez push ao parar;
um commit «WIP (não verificado)» diz o que faltava).

Por começar: Tarefas.tsx, Calendario.tsx, Overview.tsx, `proposta-de-pdf/campos.ts`,
GaleriaClient, EntradaEmVideo, e os ~180 ficheiros entre 400 e 1 500 linhas.
No `main`: 199 ficheiros acima de 400 linhas (~108 mil linhas a mais), 17 acima
de 1 500. Nota da estrutura em `docs/NOTAS-DA-LIQUEN.md`: 5/10.

## Regras de trabalho com agentes (aprendidas a 17–18/11)

- Cada agente: SÓ o seu ramo; NUNCA juntar ao `lote/*` nem ao `main`;
  NUNCA `create_session` nem agentes. Revisor/júri só LÊ.
- Tudo entra com revisão independente + segunda passagem + júri ≥ 9 + capturas a 0 px.
- **Antes de dar um ramo por pronto: merge do `main` atual** (o erro de 18/11).
- O vitest inteiro com 3–4 agentes na máquina dá falsos vermelhos de tempo nos
  testes de ecrã (47 min, 33 vermelhos; sozinhos passam). Corre à parte os que
  falharem; só um vermelho que falhe sozinho é real.
- Portas próprias por agente (3873/3874, 4417/4418…) e diretórios próprios no
  scratchpad: dois agentes partilharam a porta 3300/3301 e estragaram as capturas.
- Cada agente pára os servidores que lançou. A 18/11 ficaram dois `next-server`
  (PID 853 e 11765) que o classificador não deixou matar; o agente que os lançou parou-os.
- O `@playwright/test` 1.60 procura o chromium 1223: há ligações simbólicas em
  `/opt/pw-browsers` para o 1243 (fora do repositório; o contentor novo não as tem).
- Parar aos **55 %** do limite semanal; daqui não se lê a percentagem — o dono diz.
- Disco: worktrees com `node_modules` por hardlinks; apagar `.next`; manter < 85 % (54 % a 18/11).

## Pendentes do dono

- Criar SENTRY_DSN, UPSTASH_REDIS_REST_URL/TOKEN e VAPID_PUBLIC/PRIVATE_KEY na Vercel (grátis, sem cartão).
- Visuais por aprovar: a mensagem 409 «O pedido desta tarefa já foi apagado.»
  (hoje responde 404 «Não encontrado»); uma frase própria para um pedido preso
  por uma fatura do Moloni a meio; o número de «apagados» na reposição de uma
  cópia (`backup-restore.ts`, J11 do júri); os plurais errados nos avisos dos
  lotes do back office.
- Livre resolução de 14 dias (legal) e os gclid antigos — decisão dele.
- Rodar a chave do Supabase que foi colada no chat a 17/11.
- Blob da Vercel: criado (`liquen-ficheiros`, privado) mas DESLIGADO. Só se liga se as manhas grátis não chegarem.
