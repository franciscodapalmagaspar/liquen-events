-- ════════════════════════════════════════════════════════════════════════════
-- Tarefas: as quatro colunas do painel de detalhe e da ordem à mão
-- ════════════════════════════════════════════════════════════════════════════
--
-- NÃO APLICADA. Achada a 17/11 pelo teste que compara `db/schema.sql` com os
-- tipos gerados da base viva (src/lib/db/tipos-da-base.test.ts,
-- docs/ESTRUTURA-DOS-DADOS.md, P1).
--
-- O `db/schema.sql` tem estas quatro colunas desde 22/10 (PR #265, fases 08/09
-- de docs/APPLE-TAREFAS.md) e o `tasks-store.ts` escreve-as em cada gravação;
-- a base de dados de produção NÃO as tem. Com o Supabase, gravar uma tarefa
-- responde `column "notas" … does not exist` (o `isMissingTable` traduz para
-- «a funcionalidade não está instalada»). A última tarefa criada em produção é
-- de 10/9.
--
-- Não apaga nem muda nenhuma linha: as que existem ficam com `null`, que o
-- mapper já lê como «não há». `if not exists`: pode correr-se mais do que uma
-- vez. Volta: `alter table public.tasks drop column …` (as quatro).
--
-- Depois de aplicar: regenerar src/lib/db/tipos-da-base.ts e tirar as quatro
-- linhas `tasks.*` de DIVERGENCIAS_CONHECIDAS no teste. Com os tipos novos e as
-- linhas ainda na lista, o teste fica vermelho — de propósito: uma divergência
-- resolvida não pode continuar escrita como se existisse.

alter table public.tasks add column if not exists notas text;
alter table public.tasks add column if not exists subtarefas jsonb;
alter table public.tasks add column if not exists anexos jsonb;
alter table public.tasks add column if not exists posicao double precision;
