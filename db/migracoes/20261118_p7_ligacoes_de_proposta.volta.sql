-- VOLTA de 20261118_p7_ligacoes_de_proposta.sql — SÓ DE EMERGÊNCIA.
--
-- Apaga a tabela e a função (e com ela o P7b). Só se o código já tiver voltado
-- a ler só do `app_state`: com o código do P7 no ar, a leitura cai para o
-- `app_state` sozinha, mas as escritas novas deixam de ir para a tabela.
--
-- O `app_state` continua completo enquanto o tempo (4) do P7 não se fizer: o
-- código lê de lá quando a tabela não responde. Por isso a volta é, primeiro,
-- o código (voltar a ler só do `app_state`) e, depois, isto. A tabela é uma
-- cópia; apagá-la não perde nada que não esteja no `app_state`.

begin;

drop function if exists public.gravar_ligacao_de_proposta(text, uuid, timestamptz, timestamptz);
drop table if exists public.ligacoes_de_proposta;

commit;
