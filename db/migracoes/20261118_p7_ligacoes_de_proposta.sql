-- ════════════════════════════════════════════════════════════════════════════
-- P7 (docs/ESTRUTURA-DOS-DADOS.md) — os códigos curtos das propostas numa tabela
-- ════════════════════════════════════════════════════════════════════════════
--
-- Estado: ver a tabela «O que está feito» em docs/ESTRUTURA-DOS-DADOS.md.
--
-- Até aqui viviam no `app_state` em DOIS espaços escritos em duas chamadas, sem
-- transação: `ligacao-proposta:<código>` → {propostaId, pedidoId, criadaEm,
-- expiraEm, revogadaEm?} e o inverso `ligacao-de-proposta:<proposta>` →
-- {codigo} (o código que a proposta reaproveita). Se a segunda falhasse ficavam
-- desencontrados, e ninguém os limpava quando a proposta saía.
--
-- Aqui passam a UMA linha por código, com chave estrangeira para a proposta.
-- O inverso deixa de ser outra linha: é a coluna `atual` (no máximo uma por
-- proposta, garantido por índice), escrita na mesma transação que o código
-- (`gravar_ligacao_de_proposta`).
--
-- O pedido NÃO se copia: lê-se de `proposals.quote_id`, que é a fonte.
--
-- Em quatro tempos (P7): (1) o código escreve nos dois sítios, (2) a cópia (`….copia.sql`),
-- (3) lê da tabela com o `app_state` de reserva — os três neste passo —, e (4)
-- deixar de escrever no `app_state`, e 30 dias depois apagar os dois prefixos.
-- O (4) NÃO está feito: até lá o `app_state` continua completo, e voltar atrás
-- é só voltar a ler dele.
--
-- `on delete cascade`: um código de uma proposta apagada não abre nada. Atenção
-- para o tempo (4): a Reciclagem repõe uma proposta com o MESMO id até 30 dias
-- depois; enquanto o `app_state` for escrito, o link volta a abrir por lá.
--
-- A CÓPIA (medida a 18/11, só contagens): 74 códigos, 55 de propostas que
-- existem. Os 19 de propostas apagadas NÃO entram (a chave estrangeira não
-- deixa, e não abriam nada). Dos 55, 52 são o código atual da sua proposta e 3
-- não têm inverso (o inverso foi reescrito para outro código): entram com
-- `atual = false` — exatamente o que o `app_state` diz deles, sem inventar.
--
-- Tamanho: ~55 linhas, kB. Sem custo.
--
-- VOLTA: 20261118_p7_ligacoes_de_proposta.volta.sql

begin;

create table if not exists public.ligacoes_de_proposta (
  codigo      text primary key check (codigo ~ '^[0-9a-z]{1,64}$'),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  criada_em   timestamptz not null,
  -- Anulável como o `expiraEm` do app_state: sem data, não expira.
  expira_em   timestamptz,
  -- Ninguém o escreve ainda (a «alavanca» de proposta-link-curto.ts); a leitura já o respeita.
  revogada_em timestamptz,
  -- O código que a proposta reaproveita no próximo envio (o antigo `ligacao-de-proposta:`).
  atual       boolean not null default false
);

create unique index if not exists ligacoes_de_proposta_uma_atual
  on public.ligacoes_de_proposta (proposal_id) where atual;
create index if not exists ligacoes_de_proposta_proposal_id_idx
  on public.ligacoes_de_proposta (proposal_id);

alter table public.ligacoes_de_proposta enable row level security;
revoke all on public.ligacoes_de_proposta from anon, authenticated;

-- Gravar um código novo e torná-lo o atual da proposta, numa transação.
-- `false` quando o código já existia (colisão de um código aleatório): nada muda.
create or replace function public.gravar_ligacao_de_proposta(
  p_codigo text,
  p_proposal_id uuid,
  p_criada_em timestamptz,
  p_expira_em timestamptz
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.ligacoes_de_proposta (codigo, proposal_id, criada_em, expira_em, atual)
  values (p_codigo, p_proposal_id, p_criada_em, p_expira_em, false)
  on conflict (codigo) do nothing;
  if not found then
    return false;
  end if;
  update public.ligacoes_de_proposta set atual = false
    where proposal_id = p_proposal_id and atual and codigo <> p_codigo;
  update public.ligacoes_de_proposta set atual = true where codigo = p_codigo;
  return true;
end;
$$;

revoke execute on function public.gravar_ligacao_de_proposta(text, uuid, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.gravar_ligacao_de_proposta(text, uuid, timestamptz, timestamptz)
  to service_role;

-- (2) A cópia do que existe está em 20261118_p7_ligacoes_de_proposta.copia.sql:
-- corre logo a seguir a esta, e outra vez depois de o código chegar a produção.

commit;

-- As consultas de ANTES e DEPOIS (só contagens):
--
-- with f as (select substr(key,18) codigo, value v from app_state where key like 'ligacao-proposta:%'),
--      i as (select substr(key,21) pid, value->>'codigo' codigo from app_state where key like 'ligacao-de-proposta:%')
-- select (select count(*) from f) codigos,
--        (select count(*) from f where exists (select 1 from proposals p where p.id::text = f.v->>'propostaId')) de_proposta_viva,
--        (select count(*) from f where not exists (select 1 from i where i.codigo = f.codigo)) sem_inverso,
--        (select count(*) from f where v->>'criadaEm' is null) sem_criada;
--
-- select count(*), count(*) filter (where atual) from ligacoes_de_proposta;   -- 55, 52
