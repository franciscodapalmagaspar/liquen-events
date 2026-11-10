-- ════════════════════════════════════════════════════════════════════════════
-- B2 (auditoria externa, Outubro 2026) — `public.next_invoice_seq` com o
-- `search_path` fixo
-- ════════════════════════════════════════════════════════════════════════════
--
-- APLICADA a 10/11/2026 (autorização dela: «vamos resolver isto tudo»), pela
-- ferramenta de migrações do Supabase, com o nome `b2_next_invoice_seq_search_path`.
-- Verificado depois: `proconfig` = {search_path=""}.
--
-- Sem `search_path` fixo, a função resolve os nomes pelo caminho de quem a
-- chama — e quem consiga pôr um objecto com o mesmo nome num schema que venha
-- antes de `public` faz a função usá-lo. Com `search_path = ''` não há caminho
-- nenhum: cada nome tem de vir qualificado, e todos já vêm (`public.…`).
--
-- O corpo é EXACTAMENTE o de db/schema.sql; muda só a cláusula `set`.
-- O db/schema.sql foi acertado no mesmo commit, para que voltar a corrê-lo
-- não desfaça isto.

create or replace function public.next_invoice_seq(p_year int)
returns int
language sql
set search_path = ''
as $$
  insert into public.invoice_counters (year, n)
  values (p_year, 1)
  on conflict (year) do update set n = public.invoice_counters.n + 1
  returning n;
$$;

-- Verificação (deve mostrar search_path=""):
--   select proname, proconfig from pg_proc
--    where proname = 'next_invoice_seq' and pronamespace = 'public'::regnamespace;
