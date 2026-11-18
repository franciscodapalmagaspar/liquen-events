-- VOLTA de 20261117_p4_validar_checks_e_indices.sql
--
-- Um CHECK validado não se «desvalida»: volta-se atrás trocando-o pela mesma
-- restrição `not valid` (é o que o db/schema.sql faz, em cada execução, a cinco
-- deles). Não há razão prática para o fazer — a regra é a mesma —, por isso a
-- volta real deste passo são os índices.

begin;

drop index if exists public.message_links_proposal_id_idx;
drop index if exists public.material_rules_item_id_idx;
drop index if exists public.material_rules_list_id_idx;
drop index if exists public.material_list_items_item_idx;
drop index if exists public.biblioteca_foto_etiquetas_path_idx;

create index if not exists contracts_proposal_id_idx on public.contracts (proposal_id);

-- Só se for mesmo preciso voltar a ter um CHECK por validar (exemplo):
-- alter table public.quotes drop constraint quotes_status_chk;
-- alter table public.quotes add constraint quotes_status_chk
--   check (status in ('pendente','em_revisao','a_preparar','cotado','aceite','rejeitado')) not valid;

commit;
