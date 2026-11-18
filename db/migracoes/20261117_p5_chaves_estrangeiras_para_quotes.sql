-- ════════════════════════════════════════════════════════════════════════════
-- P5 (docs/ESTRUTURA-DOS-DADOS.md) — as chaves estrangeiras para `quotes` que
-- faltavam: tarefas, faturas e contratos
-- ════════════════════════════════════════════════════════════════════════════
--
-- Estado: ver a tabela «O que está feito» em docs/ESTRUTURA-DOS-DADOS.md.
--
-- Medido antes (17/11): 0 tarefas, 0 faturas e 0 contratos apontam para um
-- pedido que não existe, e nenhum guarda um `quote_id` vazio (''). A consulta
-- está no fim. Se houvesse um, o VALIDATE falhava e a transação não mudava nada.
--
-- O que acontece ao apagar um pedido (decisão do dono: «o apagar continua como
-- hoje»):
--
--   · tarefas   → ON DELETE CASCADE. É o que o código JÁ faz:
--                 `apagarPedidoSemContrato` apaga as tarefas do pedido antes de
--                 o apagar (src/lib/apagar-pedido.ts, «As tarefas do pedido»),
--                 e a Reciclagem guarda-as no retrato e repõe-nas com ele.
--   · faturas   → ON DELETE SET NULL. Hoje a fatura fica e o pedido sai; passa
--                 a ficar com o `quote_id` vazio em vez de apontar para nada.
--   · contratos → ON DELETE SET NULL, pela mesma razão. O código continua a
--                 recusar apagar um pedido com contrato (apagar-pedido.ts, «O
--                 contrato manda parar»): esta chave não muda isso, só garante
--                 que o contrato nunca fica a apontar para um pedido inexistente.
--
-- `contracts.proposal_id` (text contra o uuid de `proposals.id`) NÃO muda aqui:
-- ver o fim deste ficheiro e docs/ESTRUTURA-DOS-DADOS.md, P5.
--
-- Em duas fases (`not valid` + `validate`), como manda a documentação do
-- Postgres para não bloquear escritas enquanto se verifica. Tabelas pequenas:
-- instantâneo. Índices: kB.
--
-- VOLTA: 20261117_p5_chaves_estrangeiras_para_quotes.volta.sql

begin;

-- tarefas
alter table public.tasks drop constraint if exists tasks_quote_id_fkey;
alter table public.tasks
  add constraint tasks_quote_id_fkey foreign key (quote_id)
  references public.quotes (id) on delete cascade not valid;
alter table public.tasks validate constraint tasks_quote_id_fkey;
create index if not exists tasks_quote_id_idx on public.tasks (quote_id);

-- faturas (o índice `invoices_quote_id_idx` já existe)
alter table public.invoices drop constraint if exists invoices_quote_id_fkey;
alter table public.invoices
  add constraint invoices_quote_id_fkey foreign key (quote_id)
  references public.quotes (id) on delete set null not valid;
alter table public.invoices validate constraint invoices_quote_id_fkey;
create index if not exists invoices_quote_id_idx on public.invoices (quote_id);

-- contratos
alter table public.contracts drop constraint if exists contracts_quote_id_fkey;
alter table public.contracts
  add constraint contracts_quote_id_fkey foreign key (quote_id)
  references public.quotes (id) on delete set null not valid;
alter table public.contracts validate constraint contracts_quote_id_fkey;
create index if not exists contracts_quote_id_idx on public.contracts (quote_id);

commit;

-- A consulta que se corre ANTES (tudo a 0; só contagens):
--
-- select
--   (select count(*) from tasks t     where quote_id is not null and not exists (select 1 from quotes q where q.id = t.quote_id)) as tarefas,
--   (select count(*) from invoices f  where quote_id is not null and not exists (select 1 from quotes q where q.id = f.quote_id)) as faturas,
--   (select count(*) from contracts c where quote_id is not null and not exists (select 1 from quotes q where q.id = c.quote_id)) as contratos;
--
-- ── PROPOSTO, NÃO FEITO: contracts.proposal_id text → uuid ─────────────────
--
-- A conversão está provada (17/11: 0 valores fora da forma uuid, 0 órfãos, e a
-- base local converte e volta sem perder nada), mas mudar o tipo não é seguro
-- só do lado da base de dados: com a coluna `uuid`, `getContractByProposal`
-- com um id que não tem forma de uuid (um link estragado) passava de «não há
-- contrato» a erro 22P02, e o `toRow` dos contratos escreve '' quando não há
-- proposta. Fica para um passo com essas duas guardas no código e os testes:
--
-- alter table public.contracts alter column proposal_id type uuid using nullif(proposal_id, '')::uuid;
-- alter table public.contracts
--   add constraint contracts_proposal_id_fkey foreign key (proposal_id)
--   references public.proposals (id) on delete set null;
-- Volta: alter table public.contracts drop constraint contracts_proposal_id_fkey;
--        alter table public.contracts alter column proposal_id type text using proposal_id::text;
