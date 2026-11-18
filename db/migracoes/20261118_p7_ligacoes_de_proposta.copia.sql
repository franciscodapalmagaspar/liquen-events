-- P7, tempo (2): copiar os códigos do `app_state` para `ligacoes_de_proposta`.
--
-- Corre dentro de 20261118_p7_ligacoes_de_proposta.sql e corre-se OUTRA VEZ
-- depois de o código do P7 chegar a produção: entre a migração e o deploy, o
-- código antigo cunha códigos só no `app_state`. Pode correr-se quantas vezes
-- se quiser: não muda nenhuma linha do `app_state`, não duplica códigos, e
-- acerta a coluna `atual` pelo inverso do `app_state`, que até ao tempo (4)
-- é a fonte.
--
-- Só entram códigos de propostas que existem. Um código sem inverso entra com
-- `atual = false`: é o que o `app_state` diz dele, sem inventar.

begin;

insert into public.ligacoes_de_proposta (codigo, proposal_id, criada_em, expira_em, revogada_em)
select
  substr(a.key, length('ligacao-proposta:') + 1),
  p.id,
  (a.value ->> 'criadaEm')::timestamptz,
  (a.value ->> 'expiraEm')::timestamptz,
  (a.value ->> 'revogadaEm')::timestamptz
from public.app_state a
join public.proposals p on p.id::text = a.value ->> 'propostaId'
where a.key like 'ligacao-proposta:%'
  and substr(a.key, length('ligacao-proposta:') + 1) ~ '^[0-9a-z]{1,64}$'
  and a.value ->> 'criadaEm' is not null
on conflict (codigo) do nothing;

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
