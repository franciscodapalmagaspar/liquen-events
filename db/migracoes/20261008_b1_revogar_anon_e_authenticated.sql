-- ════════════════════════════════════════════════════════════════════════════
-- B1 (auditoria externa, Outubro 2026) — as roles `anon` e `authenticated`
-- deixam de ter privilégios nas tabelas, sequências e funções de `public`
-- ════════════════════════════════════════════════════════════════════════════
--
-- APLICADA a 10/11/2026 (decisão dela: «Sim, aplica»), pela ferramenta de
-- migrações do Supabase, com o nome `b1_revogar_anon_e_authenticated`.
-- Verificado depois: `anon` e `authenticated` sem privilégios em `public`;
-- `service_role` intacto; /api/health em produção a responder 200.
--
-- Hoje as duas roles têm SELECT, INSERT, UPDATE e DELETE em todas as tabelas
-- de `public` (são os privilégios que o Supabase dá por omissão), e a única
-- coisa que as trava é o RLS ligado SEM políticas. Basta uma política mal
-- escrita, ou uma tabela nova criada sem `enable row level security`, para
-- esses privilégios passarem a valer.
--
-- CONFIRMADO NO CÓDIGO antes de escrever isto: o servidor fala com a base de
-- dados por um único cliente, `getSupabase()` em src/lib/supabase.ts, que usa
-- sempre `SUPABASE_SERVICE_ROLE_KEY` (a chave secreta, role `service_role`).
-- Não há nenhum cliente Supabase no browser, nem nenhum uso da chave anon /
-- publishable para ler ou escrever tabelas. O `service_role` tem os seus
-- próprios privilégios e não é tocado por esta migração.
--
-- O que NÃO cobre: o Storage (schema `storage`) fica como está — as fotos
-- públicas continuam a abrir pelo endereço público do bucket.
--
-- Nota: o `alter default privileges` aplica-se aos objectos criados no futuro
-- PELA ROLE QUE CORRE ESTE SCRIPT (no SQL Editor, `postgres`). Se alguma
-- tabela vier a ser criada por outra role (por exemplo `supabase_admin`), é
-- preciso repetir as três linhas com `for role <essa role>`.

begin;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

commit;

-- Verificação (deve devolver zero linhas):
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and grantee in ('anon', 'authenticated');
