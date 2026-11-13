-- ════════════════════════════════════════════════════════════════════════════
-- O REGISTO DE «QUEM FEZ O QUÊ» (13/11) — auditoria de segurança
-- ════════════════════════════════════════════════════════════════════════════
--
-- ✔ APLICADA a 13/11/2026, com a autorização dele («sim, aplica»), e
-- confirmada a seguir: RLS ligado, 0 permissões para anon/authenticated.

-- Pedido do Francisco (13/11, «faz isto tudo»): a auditoria de segurança
-- apontou que não há registo duradouro de quem mudou o quê no back office —
-- só os registos da Vercel, que se apagam ao fim de dias. Uma empresa grande
-- responde a «quem apagou este pedido?» em segundos.
--
-- Uma linha por cada ALTERAÇÃO feita no back office (POST/PUT/PATCH/DELETE com
-- sessão válida): quem, quando, o método e o caminho. Não guarda o conteúdo
-- (nem dados de clientes). Só se acrescenta; sai ao fim de 12 meses na tarefa
-- da noite. Estimativa: ~200 bytes por linha, algumas centenas por dia —
-- poucos MB por ano, muito abaixo do plano gratuito (500 MB, hoje em 37 MB).
--
-- Fechada como as outras (migração B1): RLS ligado e nenhuma permissão para as
-- chaves públicas; só o servidor, com a chave secreta, lê e escreve.
--
-- Pode correr-se mais do que uma vez.

begin;

create table if not exists public.registo_de_acoes (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  quem text not null,
  metodo text not null,
  caminho text not null
);

create index if not exists registo_de_acoes_quando_idx on public.registo_de_acoes (quando desc);

alter table public.registo_de_acoes enable row level security;
revoke all on public.registo_de_acoes from anon, authenticated;

commit;
