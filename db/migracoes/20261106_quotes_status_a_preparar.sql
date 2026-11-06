-- ════════════════════════════════════════════════════════════════════════════
-- O estado «A preparar proposta» (6/11) — a restrição dos estados do pedido
-- ════════════════════════════════════════════════════════════════════════════
--
-- ✔ APLICADA a 6/11/2026, com a autorização dela («Sim, aplica»), e
-- confirmada a seguir lendo `pg_constraint` (a restrição lista `a_preparar`).
--
-- Pedido dela (6/11): «nas propostas, quero que também haja um estado a dizer,
-- a fazer proposta, ou a preparar proposta». Escolheu o estado do PEDIDO, e o
-- valor novo é `a_preparar` (ver o cabeçalho de
-- src/lib/orcamento/estado-do-pedido.ts).
--
-- O que muda: a restrição `quotes_status_chk` passa a aceitar `a_preparar`.
-- Sem isto, a base RECUSA o valor novo — gravar o rascunho no estúdio continua
-- a funcionar (a mudança de estado é melhor esforço e nunca derruba a
-- gravação), mas o pedido não muda de coluna, e escolher «A preparar
-- proposta» à mão no painel dá erro ao gravar.
--
-- Não apaga nem muda nenhuma linha: troca a restrição por outra que aceita
-- tudo o que a antiga aceitava e mais um valor. `not valid`, como a original,
-- para não varrer a tabela. O mesmo bloco está em db/schema.sql.
--
-- Pode correr-se mais do que uma vez.

begin;

alter table public.quotes drop constraint if exists quotes_status_chk;
alter table public.quotes add constraint quotes_status_chk
  check (status in ('pendente','em_revisao','a_preparar','cotado','aceite','rejeitado')) not valid;

commit;
