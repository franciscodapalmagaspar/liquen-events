# Passagem de sessão — 18/11/2026

Para a sessão nova do Claude que continua o trabalho da Líquen. Lê primeiro o
CLAUDE.md e TODAS as regras em `.claude/rules/` (sobretudo `autonomia.md`,
`codigo.md`, `custo.md`, `zero-erros.md`). Fala com o Francisco SEMPRE em
português de Portugal, sem pedir confirmações (só as mudanças VISUAIS se
mostram antes). O repositório chama-se agora `franciscodapalmagaspar/liquen-events`.

## Onde está o site

- `main` = lote de 18/11 (PR #487), publicado e READY (dpl_2kyTuAtcByUenpkefTirVxpNe2cM).
- **Lote de 19/11** aberto: ramo `lote/2026-11-19`, PR **#488** (rascunho), CI por ver.
  Leva: rota da proposta partida em etapas (júri 9/10, 81/81 respostas iguais à
  de produção), o gerador antigo do PDF APAGADO (−12 500 linhas; o teste de ouro
  continua igual), regras novas, catraca do tamanho acertada.
  → Ver o CI; corrigir a causa do que falhar; publicar UMA vez (merge commit) e
  confirmar 1 deployment READY.

## Base de dados (Supabase `fvbafdezhslqojjsjgwi`) — aplicado em produção

- P4 (17/11 23:52): 20 CHECK validados + 5 índices. Volta em `db/migracoes/*p4*.volta.sql` (ramo `dados/migracoes`).
- P5 (17/11 23:55): FKs tasks (cascade), invoices e contracts (set null) → quotes.
- P7/P7b (18/11 00:06/00:31): tabela `ligacoes_de_proposta` (55 códigos, 0 divergências). O código ainda não a usa.
- **18/11 (esta sessão): `tasks` + colunas `notas`, `subtarefas`, `anexos`, `posicao`.**
  Desde 22/10 NÃO se gravava nenhuma tarefa em produção (as colunas faltavam).
  Falta: regenerar `src/lib/db/tipos-da-base.ts` e tirar as 4 linhas `tasks.*`
  de `DIVERGENCIAS_CONHECIDAS` (ramo `dados/p1-a-p3`), e confirmar no site que
  uma tarefa se grava.

## Frentes em curso (todas paradas, trabalho guardado no ramo)

| Ramo | Cabeça | Estado | Falta |
|---|---|---|---|
| `codigo/admin-e-temas-local` | 8f1b9148 | AdminClient 9536→3096, Temas 6464→2887, ThemePicker 3181→1527; painel 502 KB; corrigiu 5 erros antigos | capturas 0 px, `e2e:dados`, BO 4, júri 8,5 → ≥9 |
| `codigo/estudio-fases-3-a-4` | c410508e (WIP) | ProposalStudio 16 868 → **75** linhas; 38 peças em `estudio/ecra/` | verificar c410508e (as 4 correções APROVADAS pelo dono), partir 6 peças >250, index.ts, e2e propostas, vitest, build, madge, revisão + júri |
| `dados/p1-a-p3` | 73d358fd | tipos gerados, registo do `app_state`, limpeza na tarefa da noite (dono autorizou apagar restos com cópia) | júri 8,5 → ≥9 (6 achados no relatório), vitest inteiro |
| `dados/migracoes` | 173c8703 (WIP) | código das FKs/ligações/esquemas | 2 achados no `apagar-pedido` (faturas antes de apagar; propostas antes das fotos), vitest, júri 8 → ≥9 |
| `dados/plano-da-estrutura` | 28234a2b | `docs/ESTRUTURA-DOS-DADOS.md` (nota 6/10, plano P1–P11) | — |

Ainda por começar: Tarefas.tsx / Calendario.tsx / Overview.tsx (script de
capturas em scratchpad, perdido), `proposta-de-pdf/campos.ts` (2 202 linhas),
GaleriaClient, EntradaEmVideo, e os ~180 ficheiros entre 400 e 1 500 linhas.
Progresso: ~21 % das 114 mil linhas a mais (nos ramos); a rota e o PDF antigo entram com o lote de 19/11.

## Regras de trabalho com agentes (aprendidas a 17/11)

- Cada agente: SÓ o seu ramo; NUNCA juntar ao `lote/*` nem ao `main`;
  NUNCA `create_session` nem agentes (duas sessões criadas por um agente juntaram
  código sem júri ao lote e foi preciso tirá-lo).
- Revisor/júri só LÊ e escreve relatório.
- Tudo entra com revisão independente + segunda passagem + júri ≥ 9 + capturas a 0 px.
- Parar aos **55 %** do limite semanal do plano (estava nos ~45 % a 18/11 de madrugada).
- Disco: worktrees com `node_modules` por hardlinks; apagar `.next`; manter < 85 %.

## Pendentes do dono

- Criar SENTRY_DSN, UPSTASH_REDIS_REST_URL/TOKEN e VAPID_PUBLIC/PRIVATE_KEY na Vercel (passos dados no chat; grátis, sem cartão).
- Visuais por aprovar: a mensagem 409 «O pedido desta tarefa já foi apagado.» (ramo `dados/migracoes`); os plurais errados nos avisos dos lotes do back office.
- Livre resolução de 14 dias (legal) e os gclid antigos — decisão dele.
- Rodar a chave do Supabase que foi colada no chat a 17/11.
- Blob da Vercel: criado (`liquen-ficheiros`, privado) mas DESLIGADO (modo supabase). Só se liga se as manhas grátis não chegarem.
