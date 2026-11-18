-- P7, tempo (2): copiar os códigos do `app_state` para `ligacoes_de_proposta`.
--
-- Corre dentro de 20261118_p7_ligacoes_de_proposta.sql e corre-se OUTRA VEZ
-- depois de o código do P7 chegar a produção: entre a migração e o deploy, o
-- código antigo cunha códigos só no `app_state`. Pode correr-se quantas vezes
-- se quiser: não muda nenhuma linha do `app_state`, não duplica códigos, e
-- acerta a coluna `atual` pelo inverso do `app_state`, que até ao tempo (4)
-- é a fonte.
--
-- Só entram códigos de propostas que existem e com datas que se leem (uma
-- data estragada não aborta a cópia: esse código fica de fora, e o app_state
-- continua a abri-lo). Um código sem inverso entra com `atual = false`: é o que
-- o `app_state` diz dele, sem inventar. Uma linha que já cá está acerta a
-- validade e o corte pelos do app_state, que até ao tempo (4) é a fonte.

begin;

insert into public.ligacoes_de_proposta (codigo, proposal_id, criada_em, expira_em, revogada_em)
select
  substr(a.key, length('ligacao-proposta:') + 1),
  p.id,
  (a.value ->> 'criadaEm')::timestamptz,
  case when a.value ->> 'expiraEm' ~ '^\d{4}-\d{2}-\d{2}T' then (a.value ->> 'expiraEm')::timestamptz end,
  case when a.value ->> 'revogadaEm' ~ '^\d{4}-\d{2}-\d{2}T' then (a.value ->> 'revogadaEm')::timestamptz end
from public.app_state a
join public.proposals p on p.id::text = a.value ->> 'propostaId'
where a.key like 'ligacao-proposta:%'
  and substr(a.key, length('ligacao-proposta:') + 1) ~ '^[0-9a-z]{1,64}$'
  and a.value ->> 'criadaEm' ~ '^\d{4}-\d{2}-\d{2}T'
on conflict (codigo) do update
  set expira_em = excluded.expira_em, revogada_em = excluded.revogada_em
  where (ligacoes_de_proposta.expira_em, ligacoes_de_proposta.revogada_em)
    is distinct from (excluded.expira_em, excluded.revogada_em);

-- O `atual` segue o inverso do app_state, onde a proposta tem um que aponta
-- para um código da tabela. Primeiro desliga-se, depois liga-se: o índice
-- único `ligacoes_de_proposta_uma_atual` nunca vê duas ao mesmo tempo.
with inverso as (
  select p.id as proposal_id, i.value ->> 'codigo' as codigo
  from public.app_state i
  join public.proposals p on 'ligacao-de-proposta:' || p.id::text = i.key
  join public.ligacoes_de_proposta l on l.codigo = i.value ->> 'codigo' and l.proposal_id = p.id
)
update public.ligacoes_de_proposta l set atual = false
from inverso
where l.proposal_id = inverso.proposal_id and l.atual and l.codigo <> inverso.codigo;

with inverso as (
  select p.id as proposal_id, i.value ->> 'codigo' as codigo
  from public.app_state i
  join public.proposals p on 'ligacao-de-proposta:' || p.id::text = i.key
)
update public.ligacoes_de_proposta l set atual = true
from inverso
where l.proposal_id = inverso.proposal_id and l.codigo = inverso.codigo and not l.atual;

commit;
