-- ════════════════════════════════════════════════════════════════════════════
-- B4 (auditoria externa, Outubro 2026) — índices para as chaves estrangeiras
-- que não os tinham
-- ════════════════════════════════════════════════════════════════════════════
--
-- ✔ APLICADA a 17/11/2026 (23:52 UTC), dentro da migração
-- 20261117_p4_validar_checks_e_indices.sql; o aconselhador de desempenho deixou
-- de apontar «FK sem índice».
--
-- Confirmado em db/schema.sql: nenhuma destas colunas tem índice, nem é a
-- primeira coluna de outro índice ou da chave primária. Sem índice, apagar uma
-- linha da tabela referenciada (uma proposta, um item, uma lista, uma foto)
-- obriga o Postgres a varrer a tabela inteira para aplicar o
-- `on delete cascade / set null / restrict`.
--
-- `if not exists`: pode correr-se mais do que uma vez. Em tabelas destes
-- tamanhos um `create index` normal é instantâneo; se alguma crescer muito,
-- usar `create index concurrently` (fora de uma transacção).

create index if not exists message_links_proposal_id_idx
  on public.message_links (proposal_id);

create index if not exists material_rules_item_id_idx
  on public.material_rules (item_id);

create index if not exists material_rules_list_id_idx
  on public.material_rules (list_id);

create index if not exists material_list_items_item_idx
  on public.material_list_items (item_id);

create index if not exists biblioteca_foto_etiquetas_path_idx
  on public.biblioteca_foto_etiquetas (path);
