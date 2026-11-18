-- ════════════════════════════════════════════════════════════════════════════
-- P4 (docs/ESTRUTURA-DOS-DADOS.md) — validar os 20 CHECK e aplicar a b4
-- ════════════════════════════════════════════════════════════════════════════
--
-- Estado: ver a tabela «O que está feito» em docs/ESTRUTURA-DOS-DADOS.md.
--
-- O que faz, e porque é seguro:
--
-- 1. VALIDATE CONSTRAINT nos 20 CHECK que nasceram `not valid`. Não muda
--    nenhuma linha: só lê a tabela e marca a restrição como verificada. Antes
--    de correr, a consulta do fim deste ficheiro deu 0 linhas a violar cada um.
--    Se alguma violasse, o VALIDATE falhava e a transação não mudava nada.
-- 2. Os 5 índices da b4 (20261008_b4_indices_das_chaves_estrangeiras.sql), que
--    o aconselhador de desempenho do Supabase aponta como «FK sem índice».
-- 3. `contracts_proposal_id_idx` sai: a chave única `contracts_proposal_id_uk`
--    é sobre a mesma coluna e serve as mesmas leituras (o aconselhador marca o
--    índice como nunca usado).
--
-- Tamanho: tabelas de dezenas de linhas; os índices são kB. Sem custo.
-- Pode correr-se mais do que uma vez (validar o que já está validado não faz
-- nada; `if not exists` / `if exists` nos índices).
--
-- VOLTA: 20261117_p4_validar_checks_e_indices.volta.sql

begin;

alter table public.biblioteca_etiquetas      validate constraint biblioteca_etiquetas_eixo_chk;
alter table public.biblioteca_foto_etiquetas validate constraint biblioteca_foto_etiquetas_origem_chk;
alter table public.calendar_events           validate constraint calendar_events_kind_chk;
alter table public.contracts                 validate constraint contracts_idioma_chk;
alter table public.contracts                 validate constraint contracts_status_chk;
alter table public.inventory_items           validate constraint inventory_condition_chk;
alter table public.invoices                  validate constraint invoices_amount_chk;
alter table public.invoices                  validate constraint invoices_kind_chk;
alter table public.invoices                  validate constraint invoices_status_chk;
alter table public.overview_settings         validate constraint overview_settings_id_chk;
alter table public.overview_settings         validate constraint overview_settings_revision_chk;
alter table public.passkeys                  validate constraint passkeys_counter_chk;
alter table public.proposal_themes           validate constraint proposal_themes_kind_chk;
alter table public.proposals                 validate constraint proposals_amounts_chk;
alter table public.proposals                 validate constraint proposals_chosen_version_chk;
alter table public.proposals                 validate constraint proposals_idioma_chk;
alter table public.proposals                 validate constraint proposals_lost_reason_chk;
alter table public.proposals                 validate constraint proposals_status_chk;
alter table public.quotes                    validate constraint quotes_status_chk;
alter table public.tasks                     validate constraint tasks_priority_chk;

create index if not exists message_links_proposal_id_idx      on public.message_links (proposal_id);
create index if not exists material_rules_item_id_idx         on public.material_rules (item_id);
create index if not exists material_rules_list_id_idx         on public.material_rules (list_id);
create index if not exists material_list_items_item_idx       on public.material_list_items (item_id);
create index if not exists biblioteca_foto_etiquetas_path_idx on public.biblioteca_foto_etiquetas (path);

drop index if exists public.contracts_proposal_id_idx;

commit;

-- A consulta que se corre ANTES (tem de dar 0 em todas as linhas). Lê só
-- contagens, nunca valores:
--
-- select conrelid::regclass as tabela, conname,
--        (xpath('/row/n/text()', query_to_xml(format(
--          'select count(*) as n from %s where not (%s)', conrelid::regclass,
--          regexp_replace(pg_get_constraintdef(oid), '^CHECK \((.*)\)( NOT VALID)?$', '\1')),
--          false, true, '')))[1]::text::int as violam
-- from pg_constraint
-- where connamespace = 'public'::regnamespace and contype = 'c' and not convalidated;
