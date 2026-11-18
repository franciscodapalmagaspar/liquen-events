-- ════════════════════════════════════════════════════════════════════════════
-- P7b (18/11) — `gravar_ligacao_de_proposta` em fila, por proposta
-- ════════════════════════════════════════════════════════════════════════════
--
-- Achado da revisão do P7: duas gravações AO MESMO TEMPO para a mesma proposta
-- (duas pré-visualizações do email) inseriam cada uma o seu código e marcavam-no
-- `atual`; a segunda esbarrava no índice único `ligacoes_de_proposta_uma_atual`
-- (23505) e desfazia-se inteira, deixando a tabela com o código A como atual e
-- o app_state com o B.
--
-- Agora cada chamada espera pela anterior da MESMA proposta
-- (`pg_advisory_xact_lock`, solto no fim da transação), e a segunda vê a
-- primeira já gravada: desliga-a e fica ela como atual — a mesma ordem do
-- app_state, onde a última escrita do inverso ganha. Propostas diferentes não
-- esperam umas pelas outras.
--
-- Só troca o corpo da função; não toca em nenhuma linha.
--
-- VOLTA (só de emergência): voltar a correr o `create or replace function` de
-- 20261118_p7_ligacoes_de_proposta.sql — o corpo sem o `pg_advisory_xact_lock`,
-- que devolve a corrida que este ficheiro fecha. Não há outra razão para o
-- desfazer.
--
-- Precisa de Postgres ≥ 11 (`hashtextextended`); produção é ≥ 16 (a cópia do P7,
-- que usa `pg_input_is_valid`, correu lá a 18/11).
-- Numa transação: a função e as permissões mudam juntas ou não mudam.
-- (Aplicado em produção a 18/11; o `begin`/`commit` entrou depois, no
-- ficheiro, sem nada a reaplicar.)

begin;

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
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ligacoes_de_proposta:' || p_proposal_id::text, 0));
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

commit;
