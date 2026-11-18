-- VOLTA de 20261117_p5_chaves_estrangeiras_para_quotes.sql
--
-- Tirar uma chave estrangeira não muda nenhuma linha. O `invoices_quote_id_idx`
-- já existia antes do P5 e fica.

begin;

alter table public.tasks     drop constraint if exists tasks_quote_id_fkey;
alter table public.invoices  drop constraint if exists invoices_quote_id_fkey;
alter table public.contracts drop constraint if exists contracts_quote_id_fkey;

drop index if exists public.tasks_quote_id_idx;
drop index if exists public.contracts_quote_id_idx;

commit;
