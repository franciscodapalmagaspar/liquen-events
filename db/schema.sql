-- ════════════════════════════════════════════════════════════════
-- Líquen Events — esquema da base de dados (Supabase / PostgreSQL)
-- Como usar:
--   1. Crie um projeto grátis em https://supabase.com
--   2. Abra "SQL Editor" → "New query"
--   3. Cole TODO este ficheiro e clique "Run"
--   4. Copie SUPABASE_URL e SERVICE_ROLE_KEY (Settings → API) para as
--      variáveis de ambiente do Vercel
-- ════════════════════════════════════════════════════════════════

-- ── Pedidos de orçamento (recebidos pelo site) ──────────────────
create table if not exists public.quotes (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  status      text not null default 'pendente',
  name        text,
  email       text,
  data        jsonb not null
);

create index if not exists quotes_created_at_idx on public.quotes (created_at desc);
create index if not exists quotes_status_idx      on public.quotes (status);

-- ── Propostas (criadas internamente pela equipa) ────────────────
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  quote_id    text references public.quotes (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  status      text not null default 'rascunho',  -- rascunho | enviada | aceite | rejeitada
  client_name text,
  client_email text,
  currency    text not null default 'EUR',
  line_items  jsonb not null default '[]'::jsonb, -- [{ description, qty, unitPrice }]
  vat_rate    numeric not null default 0.23,
  subtotal    numeric not null default 0,
  vat         numeric not null default 0,
  total       numeric not null default 0,
  valid_until date,
  notes       text,
  sent_at     timestamptz,
  responded_at timestamptz  -- quando o cliente aceitou/recusou pelo link público
);

-- Migração para instalações existentes (a tabela acima só é criada se não existir).
alter table public.proposals add column if not exists responded_at timestamptz;

-- ── O SELO DO DOCUMENTO ────────────────────────────────────────────────────
-- A impressão digital (SHA-256) do PDF EXACTO que foi enviado ao casal, e o
-- tamanho dele em bytes. Calculada no momento em que a proposta segue — os
-- bytes já estão em memória, portanto não custa nada — e copiada para o
-- contrato quando o casal aceita.
--
-- Para que serve: o aceite já guarda o nome escrito, a hora, o IP e o texto
-- congelado dos termos, o que em Portugal já é uma assinatura electrónica
-- simples. O que faltava era provar QUAL documento foi aceite. Numa discussão
-- do género "o arco não estava incluído", isto é a diferença entre ganhar e
-- ceder — e custa zero.
--
-- O selo é do PDF QUE SEGUIU, e o mesmo documento pode ser desenhado em duas
-- línguas (ver a coluna `idioma`, mais abaixo): para o reproduzir é preciso
-- redesenhar na língua gravada. Continua a haver um selo só — é o do ficheiro
-- que o casal recebeu.
alter table public.proposals add column if not exists pdf_sha256 text;
alter table public.proposals add column if not exists pdf_bytes integer;

-- Documento do Estúdio de Propostas: o PDF que o casal recebe, em estrutura —
-- capa, mood boards, serviços, orçamento, condições e observações. As fotos NÃO
-- estão aqui: guarda-se o CAMINHO de cada uma no bucket `proposal-assets`.
--
-- Sem esta coluna o `doc` era montado, usado para gerar o PDF do email e
-- deitado fora ao gravar. Consequências medidas: o botão "ver a proposta em
-- PDF" do link do cliente NUNCA podia aparecer (depende de o `doc` existir ao
-- reler), e a proposta ENVIADA não tinha cópia nenhuma do lado do servidor — só
-- o rascunho do estúdio em `app_state`, que a equipa apaga no "Limpar rascunho"
-- e que, na altura, também NÃO ia na cópia de segurança (hoje vai — ver o
-- conjunto `proposalDrafts`). Perdido esse, a proposta que o cliente recebeu
-- deixava de existir em lado nenhum.
--
-- TAMANHO (medido com as formas reais): 4,3 KB só com o texto fixo; ~13 KB numa
-- proposta cheia de 1 mood board; 18,5 KB no tecto de 80 fotos por documento
-- (MAX_IMAGES_PER_DOC, em proposal-doc-render.ts). São caminhos e texto, nunca
-- bytes de imagem — a aplicação recusa acima de 512 KB
-- (MAX_PROPOSAL_DOC_BYTES), o mesmo tecto que o rascunho do estúdio já tinha.
-- Nada disto incomoda o jsonb; onde se sente é na cópia de segurança (ver
-- src/app/api/backup/restore/route.ts, que já a aceita comprimida).
--
-- Idempotente (`if not exists`) e SEM `not null`: as propostas antigas ficam com
-- `doc` a null, que se lê como "não há documento" e é exatamente o que a
-- aplicação já fazia com todas elas — a página do cliente continua a abrir,
-- apenas sem o botão do PDF.
alter table public.proposals add column if not exists doc jsonb;

-- ── A LÍNGUA EM QUE A PROPOSTA FOI APRESENTADA AO CASAL ────────────────────
-- 'pt' ou 'en', escolhida no estúdio ao gerar. NÃO é uma segunda cópia do
-- documento: o `doc` continua a ser um só, escrito em português, e isto é a
-- moldura com que ele foi desenhado no PDF que o casal recebeu.
--
-- Guarda-se porque tudo o que vem DEPOIS do envio depende da resposta: o email
-- que leva a proposta, a página onde o casal a aceita, o portal e a segunda
-- descarga do PDF (pelo link do cliente e pelo portal). Enquanto era só um
-- parâmetro do pedido, uma proposta inglesa chegava dentro de um email
-- português e voltava a descarregar-se em português.
--
-- Idempotente e SEM `not null`: as propostas antigas ficam a null, que a
-- aplicação lê como "não há língua gravada" e trata como PORTUGUÊS — que é o
-- que essas propostas sempre foram. Não há migração nenhuma a correr sobre
-- elas.
--
-- A restrição é `not valid` como as outras desta tabela: aplica-se ao que se
-- escrever de agora em diante e não obriga a varrer as linhas que já lá estão.
alter table public.proposals add column if not exists idioma text;

-- ── A VERSÃO DESTA PROPOSTA ────────────────────────────────────────────────
-- Três colunas para uma pergunta só: «este documento é o mesmo que o casal viu
-- da última vez?». É dela que dependem as duas metades da página do casal — a
-- ligação viva (o que ela muda aparece lá sem reenviar nada) e o congelamento
-- no aceite (o que foi aceite fica imutável; o que mudar depois é uma versão
-- nova, que tem de ser aceite outra vez).
--
-- `versao_selo` é um sha256 do CONTEÚDO VISÍVEL — não dos bytes do PDF. O
-- `pdf_sha256` aqui em cima não servia para isto e a razão foi medida: a
-- pdf-lib carimba a data de criação dentro do ficheiro, portanto dois PDFs de
-- conteúdo idêntico dão selos diferentes, e a página diria «esta proposta foi
-- revista» de cada vez que ela carregasse em gravar. Ver `proposta-versao.ts`.
--
-- `versao_numero` é o que se diz em voz alta ao telefone («estou a olhar para
-- a versão 2»). Sobe SÓ quando o selo muda: gravar cinco vezes sem mexer não
-- leva à versão 6.
--
-- `versao_em` é quando o conteúdo mudou pela última vez — não quando a linha
-- foi tocada. É o que a página mostra ao casal («atualizada a 20 de agosto»),
-- e é sobre a proposta, nunca sobre quem a lê: nada aqui regista visitas.
--
-- Idempotentes e SEM `not null`: as propostas anteriores ficam a null, e o
-- código lê isso como «ainda não tem versão» — a primeira gravação a seguir
-- dá-lhes a versão 1.
alter table public.proposals add column if not exists versao_selo text;
alter table public.proposals add column if not exists versao_numero integer;
alter table public.proposals add column if not exists versao_em timestamptz;

-- ── Contratos / aceitação de Termos & Condições ─────────────────
-- Registo, por proposta, da aceitação das condições pelo cliente ao confirmar
-- a proposta no link público: quem aceitou, quando, de que IP, a versão dos
-- termos e um snapshot imutável do texto acordado (prova/auditoria).
--
-- ── PORQUE É QUE A TABELA ESTÁ AQUI, E NÃO LÁ MAIS ABAIXO ─────────────────
-- Porque as colunas que vêm a seguir são DESTA tabela, e um `alter table` só
-- corre depois de a tabela existir. Estava criada 550 linhas mais abaixo: numa
-- base que já tinha tudo ninguém dava por isso, mas numa instalação de raiz o
-- ficheiro parava aqui — e parava calado a meio, com metade do esquema criado.
-- O `src/lib/ordem-do-esquema.test.ts` passa a impedir que a ordem se volte a
-- trocar, em qualquer tabela.
create table if not exists public.contracts (
  id             text primary key,
  quote_id       text,
  proposal_id    text,
  client_name    text,
  client_email   text,
  terms_version  text,
  terms_snapshot text,
  status         text not null default 'pendente',  -- pendente | aceite
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  accepted_name  text,
  accepted_ip    text
);

-- ── QUE VERSÃO É QUE O CASAL ACEITOU ──────────────────────────────────────
-- O par de cima, copiado para o contrato no momento do aceite. É o que
-- distingue «o documento de agora é o que foi aceite» de «foi revisto depois
-- do sim» — e sem isso não se pode dizer nem uma coisa nem a outra, só
-- adivinhar.
--
-- NÃO se guarda aqui uma cópia do documento, e é uma decisão: uma revisão
-- nesta casa é uma proposta NOVA (a rota do estúdio nunca reescreve uma
-- proposta que já seguiu), portanto a linha aceite JÁ É o congelamento. Uma
-- segunda cópia em jsonb custava 13 a 18 KB por contrato para garantir o que
-- já está garantido pela forma como as propostas são gravadas.
--
-- O `proposta_pdf_sha256`, que já lá está, continua a ser outra coisa: é a
-- impressão digital dos BYTES do ficheiro, e serve de prova. Este é a
-- identidade do CONTEÚDO, e serve para comparar.
alter table public.contracts add column if not exists proposta_versao_selo text;
alter table public.contracts add column if not exists proposta_versao_numero integer;

-- ── UM ACEITE QUE ACONTECEU FORA DAQUI ────────────────────────────────────
-- Um contrato nasce `pendente` porque este sistema não presenciou o sim: o
-- botão de aceitar pelo link foi retirado (decisão dela — «um casamento não se
-- fecha num botão»), e o que existe é uma conversa, um email, um papel
-- assinado. Sem uma porta para registar isso, NENHUM contrato chegava alguma
-- vez a `aceite`, e o portal do casal nunca oferecia o contrato em PDF.
--
-- `registado_por` é o nome de quem, na casa, registou; `registado_como` é como
-- a casa soube («assinado em papel», «por email a 12/05»). Juntos são o que
-- distingue este aceite de um aceite ELECTRÓNICO — e é por eles que o PDF do
-- contrato decide qual bloco imprimir, para não afirmar uma assinatura
-- electrónica que ninguém deu.
--
-- Idempotentes e sem `not null`: os contratos anteriores ficam a null, que se
-- lê como «não foi registado à mão» — e são precisamente os que, se algum dia
-- houve aceite pelo botão antigo, têm `accepted_ip` e nome escrito pelo casal.
alter table public.contracts add column if not exists registado_por text;
alter table public.contracts add column if not exists registado_como text;

-- A LÍNGUA DO CONTRATO — a da proposta que lhe deu origem, copiada quando o
-- contrato nasce. Decide o texto dos termos congelado em `terms_snapshot` e a
-- língua em que o PDF é desenhado.
--
-- Idempotente e sem `not null`: os contratos anteriores ficam a null, que se
-- lê como português — que é o que eles são e o que sempre foi impresso. A
-- versão portuguesa dos termos prevalece numa divergência, e é o próprio texto
-- inglês que o diz (ponto 9).
alter table public.contracts add column if not exists idioma text;
alter table public.contracts drop constraint if exists contracts_idioma_chk;
alter table public.contracts add constraint contracts_idioma_chk
  check (idioma is null or idioma in ('pt','en')) not valid;
alter table public.proposals drop constraint if exists proposals_idioma_chk;
alter table public.proposals add constraint proposals_idioma_chk
  check (idioma is null or idioma in ('pt','en')) not valid;

-- ── O acompanhamento depois de a proposta seguir ───────────────────────────
-- Quando voltar a falar com esta pessoa, e porque é que se perdeu. São dados
-- dela, não derivados: o motivo de recusa de um casamento de 2026 não se
-- reconstrói de mais lado nenhum.
--
-- `follow_up_at` é uma DATE e não um timestamptz de propósito. É "quinta-feira",
-- não "quinta-feira às 14:07 UTC" — guardar hora obrigava a escolher um fuso
-- para a mostrar, e ao pé da meia-noite mostrava o dia errado.
alter table public.proposals add column if not exists follow_up_at date;
alter table public.proposals add column if not exists follow_up_note text;
alter table public.proposals add column if not exists lost_reason text;
alter table public.proposals add column if not exists lost_note text;

-- Qual das duas versões o casal ficou, quando a proposta tinha extras
-- assinalados. Registada à mão por quem recebe a resposta — deduzi-la do valor
-- facturado dava a versão errada em todas as propostas em que se negociou um
-- desconto depois. Ver `orcamento/versoes-da-proposta.ts`.
alter table public.proposals add column if not exists chosen_version text;
alter table public.proposals drop constraint if exists proposals_chosen_version_chk;
alter table public.proposals add constraint proposals_chosen_version_chk
  check (chosen_version is null or chosen_version in ('base','extras')) not valid;

-- O estado "em_negociacao" nasceu depois da restrição de estados. Numa base já
-- instalada, o `if not exists` mais abaixo não a substitui — é preciso deixá-la
-- cair e voltar a criá-la, senão marcar "em negociação" rebenta com um 23514.
alter table public.proposals drop constraint if exists proposals_status_chk;
alter table public.proposals add constraint proposals_status_chk
  check (status in ('rascunho','enviada','em_negociacao','aceite','rejeitada')) not valid;

-- A mesma lista fechada do lado da aplicação (`MotivoDeRecusa`). Está aqui
-- porque o objetivo é poder CONTAR — "perdi seis por preço" — e texto livre
-- numa coluna que se conta é a maneira de nunca mais se poder contar.
alter table public.proposals drop constraint if exists proposals_lost_reason_chk;
alter table public.proposals add constraint proposals_lost_reason_chk
  check (
    lost_reason is null
    or lost_reason in ('preco','data','escolheram-outro','sem-resposta','outro')
  ) not valid;

create index if not exists proposals_quote_id_idx on public.proposals (quote_id);
create index if not exists proposals_created_at_idx on public.proposals (created_at desc);

-- ── Tarefas internas (back office) ──────────────────────────────
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  title       text not null,
  done        boolean not null default false,
  priority    text not null default 'normal',  -- baixa | normal | alta
  due_date    date,
  quote_id    text,
  client_name text,
  assignee    text,
  area        text
);

-- If upgrading an existing database, add the new columns:
alter table public.tasks add column if not exists assignee text;
alter table public.tasks add column if not exists area text;
-- ── O PAINEL DE DETALHE E A ORDEM À MÃO (docs/APPLE-TAREFAS.md, fases 08/09) ──
-- `notas` é texto corrido; `subtarefas` e `anexos` são listas de objectos
-- pequenos e SEMPRE lidas inteiras com a tarefa — nunca se pesquisa dentro
-- delas nem se junta com outra tabela —, portanto `jsonb` e não duas tabelas
-- filhas. `posicao` é a ordem manual: `double precision` porque uma linha
-- largada entre duas outras fica com a MÉDIA das vizinhas (ver
-- `src/lib/tarefas/posicoes.ts`), e é isso que faz um arrasto custar UMA
-- gravação em vez de uma por linha.
alter table public.tasks add column if not exists notas text;
alter table public.tasks add column if not exists subtarefas jsonb;
alter table public.tasks add column if not exists anexos jsonb;
alter table public.tasks add column if not exists posicao double precision;

create index if not exists tasks_done_idx on public.tasks (done);
create index if not exists tasks_due_idx  on public.tasks (due_date);

-- ── Fornecedores / parceiros ────────────────────────────────────
create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  category    text not null default 'Outro',
  email       text,
  phone       text,
  location    text,
  notes       text,
  -- Avaliação de 1 a 5 estrelas; nulo = por avaliar (que NÃO é zero estrelas).
  rating      smallint,
  -- Fornecedor de recurso — o ecrã filtra por "Preferidos" e ordena-os à frente.
  preferred   boolean not null default false
);

-- ── AS DUAS METADES DESTE PAR ANDAM JUNTAS ──────────────────────
-- QUEM ESCREVE são estas colunas; QUEM PROJECTA é o `toRow` do
-- `src/lib/suppliers-store.ts`. Faltando as colunas, cada gravação de um
-- fornecedor rebenta com `column "rating" does not exist`; faltando a
-- projecção, as estrelas e o "preferido" gravam-se com 200 e desaparecem no
-- recarregamento seguinte — que foi o que aconteceu enquanto o tipo, a rota e o
-- `supplierUpdateSchema` já aceitavam os dois campos e só a base de dados não
-- os conhecia. Em desenvolvimento nunca se via: o backend de ficheiro guarda o
-- objecto de domínio tal e qual. Há um teste que prende o par
-- (src/lib/suppliers-store.test.ts).
--
-- If upgrading an existing database, add the new columns:
alter table public.suppliers add column if not exists rating    smallint;
alter table public.suppliers add column if not exists preferred boolean not null default false;

create index if not exists suppliers_category_idx on public.suppliers (category);

-- ── Eventos de calendário (entradas próprias, não ligadas a pedidos) ──
create table if not exists public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  event_date  date not null,
  title       text not null,
  kind        text not null default 'evento',  -- reuniao | evento | bloqueio | nota
  event_time  text,
  note        text
);

-- ── Subscrições de notificações push (Web Push) ─────────────────
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- ── Estado operacional (marcadores pequenos, ex.: último email notificado) ──
--
-- E, DESDE ENTÃO, mais uma coisa que não é operacional nenhuma: os RASCUNHOS do
-- Estúdio de Propostas, nas chaves `proposal-draft:<pedido>` (ver
-- src/lib/proposal-drafts.ts). Uma proposta por acabar — fotos escolhidas, mood
-- boards, textos — é trabalho de horas que não existe em mais lado nenhum, e é
-- por isso que a cópia de segurança leva ESTE espaço de nomes e deixa de fora o
-- resto da tabela (ver PARTIALLY_BACKED_UP em src/app/api/backup/route.ts).
-- Quem mexer aqui tem as duas naturezas para ter em conta, não uma.
create table if not exists public.app_state (
  key         text primary key,
  value       jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Visão Geral: notas da equipa e meta de receita ──────────────
-- Uma linha por campo ('notas', 'meta'). Estes dois textos viviam no
-- localStorage do browser que os escrevia — invisíveis nos outros
-- dispositivos e apagados com o histórico. `revision` sobe a cada gravação
-- aceite e é o testemunho do compare-and-set: quem gravar sobre uma revisão
-- antiga é recusado (409) e vê as duas versões, em vez de apagar o texto de
-- outra pessoa sem ninguém dar por isso.
create table if not exists public.overview_settings (
  id          text primary key,          -- notas | meta
  value       text not null default '',
  revision    integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- ── A biblioteca de serviços ──
-- O mesmo serviço aparecia escrito de maneira diferente conforme o dia. Não é
-- um problema de arrumação: é o cliente a receber, na proposta, uma descrição
-- escrita à pressa quando existia uma escrita com tempo.
--
-- Os dois idiomas vivem na MESMA linha. Um serviço com o português feito e o
-- inglês por fazer é um serviço incompleto, não dois serviços — e separá-los
-- deixava-os a divergir sem nada a assinalá-lo.
create table if not exists public.service_catalog (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  description    text not null default '',
  name_en        text not null default '',
  description_en text not null default '',
  category       text not null default 'Outros',
  -- Arquivado sai do seletor e continua nas propostas antigas, que é onde as
  -- palavras dele ainda fazem sentido.
  archived       boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists service_catalog_name_idx on public.service_catalog (name);

-- ── Os números com que o estúdio faz contas ──
-- O preço do combustível, o resto do custo por quilómetro, e a margem mínima
-- abaixo da qual o estúdio avisa.
--
-- Vivem aqui e não no código pela razão que ela deu: "depende também de que
-- valor está a gasolina". O gasóleo muda todas as semanas e o código muda
-- quando alguém se lembra — um número de 2026 a calcular deslocações de 2027
-- não dá erro nenhum, dá um preço silenciosamente errado, para menos, em todas
-- as propostas.
--
-- `updated_at` é metade do ponto: é o que permite ao ecrã dizer "o preço do
-- gasóleo foi definido há quatro meses" em vez de calcular em silêncio.
create table if not exists public.proposal_settings (
  id          text primary key,          -- deslocacao | margem
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Modelos de email (transacionais, editáveis no back office) ──
create table if not exists public.email_templates (
  id          text primary key,          -- slug: proposta-enviada, sinal-recebido…
  name        text not null,
  subject     text not null,
  body        text not null,             -- HTML com {merge} fields
  updated_at  timestamptz not null default now()
);

-- ── Faturas (livro de faturação, numeração sequencial) ──────────
create table if not exists public.invoices (
  id           text primary key,
  number       text not null,            -- FT 2026/0007
  quote_id     text,
  client_name  text,
  client_email text,
  kind         text not null default 'total',  -- sinal | saldo | total
  amount       numeric not null default 0,     -- com IVA
  vat_rate     numeric not null default 0.23,
  issued_at    date,
  due_at       date,
  paid_at      date,
  status       text not null default 'emitida', -- emitida | paga | anulada
  note         text
);

create index if not exists invoices_quote_id_idx on public.invoices (quote_id);
create index if not exists invoices_status_idx   on public.invoices (status);

-- Backstop de unicidade sinal/saldo (defesa em profundidade sobre a app) ──────
-- Invariante: no máximo UMA fatura de sinal e UMA de saldo NÃO anuladas por
-- pedido. A app já verifica-e-recusa antes de inserir, mas duas emissões
-- concorrentes (dois sinal→paga em simultâneo a auto-emitir o saldo, ou o
-- operador a emitir à mão no mesmo instante) passam ambas a verificação e
-- inserem — TOCTOU. Estes índices parciais únicos fecham a janela na própria
-- base de dados: só uma linha vence, a outra apanha uma violação de unicidade
-- (23505) que a app trata como "já emitido" (ver isUniqueViolation +
-- maybeAutoIssueSaldo + rota /faturas). As faturas anuladas ficam FORA do índice
-- (status <> 'anulada'), para permitir reemitir um saldo/sinal fresco depois de
-- anular o anterior. Os quote_id nulos (faturas manuais sem pedido) não colidem.
--
-- ⚠️ OPERACIONAL: numa instalação que já acumulou sinais/saldos duplicados do
-- bug antigo, a CRIAÇÃO destes índices FALHA. É preciso reconciliar primeiro
-- (anular os duplicados, deixando um único ativo por tipo/pedido) e só depois
-- correr este ficheiro.
create unique index if not exists invoices_one_active_sinal_uk
  on public.invoices (quote_id)
  where kind = 'sinal' and status <> 'anulada';
create unique index if not exists invoices_one_active_saldo_uk
  on public.invoices (quote_id)
  where kind = 'saldo' and status <> 'anulada';

-- ── Contador atómico de numeração de faturas (por ano) ──────────
-- A numeração fiscal portuguesa tem de ser única e estritamente sequencial.
-- Fazer o incremento na aplicação (ler → +1 → gravar, com um `await` no meio)
-- é uma corrida: duas emissões em simultâneo leem o mesmo valor e ambas gravam
-- n+1, produzindo um FT duplicado/saltado. Delegamos o incremento à base de
-- dados. Uma linha por ano — o reset anual fica embutido na chave.
create table if not exists public.invoice_counters (
  year  int primary key,
  n     int not null default 0
);

-- Devolve, de forma atómica, o próximo número de sequência para o ano dado.
-- `insert … on conflict … do update … returning` é UMA só instrução: o lock de
-- linha do Postgres serializa emissões concorrentes, cada uma recebe um `n`
-- distinto e consecutivo, nunca o mesmo. A aplicação formata depois `FT AAAA/NNNN`.
-- Idempotente (create or replace) — seguro correr o ficheiro as vezes que forem.
-- `search_path = ''` (auditoria externa, B2): a função não resolve nomes pelo
-- caminho de quem a chama; todos os nomes do corpo já vêm com `public.`.
create or replace function public.next_invoice_seq(p_year int)
returns int
language sql
set search_path = ''
as $$
  insert into public.invoice_counters (year, n)
  values (p_year, 1)
  on conflict (year) do update set n = public.invoice_counters.n + 1
  returning n;
$$;

-- ── Inventário de adereços / materiais de decoração ─────────────
create table if not exists public.inventory_items (
  id          text primary key,
  name        text not null,
  category    text not null default 'Outro',
  quantity    integer not null default 0,
  unit        text,
  condition   text not null default 'bom',   -- novo | bom | usado | danificado
  location    text,
  notes       text,
  updated_at  timestamptz not null default now()
);

create index if not exists inventory_category_idx on public.inventory_items (category);

-- ── Catálogo de material de LOGÍSTICA ───────────────────────────
-- O que faz a montagem acontecer: escadote, extensões, ferramentas, fita-cola,
-- sacos do lixo, luvas. NÃO são adereços — esses vivem em `inventory_items`,
-- acima, e são outra coisa: um berbequim e um vaso não se gerem da mesma
-- maneira, não se compram pelas mesmas razões e não interessam às mesmas
-- pessoas. As duas tabelas são deliberadamente separadas (ver MATERIAL.md §0.1).
--
-- `kind` é a coluna que decide o comportamento todo:
--   consumivel   → desconta do stock quando é usado, e dispara reposição;
--   reutilizavel → não desconta, mas TEM de voltar, e é isso que o regresso
--                  controla. Esquecer um escadote a 200 km custa horas.
create table if not exists public.material_items (
  id          text primary key,
  name        text not null,
  category    text not null default 'Ferramentas',
  kind        text not null default 'reutilizavel',
  unit        text,                              -- unidade | metro | rolo | par | caixa
  stock       numeric not null default 0,
  -- Abaixo disto entra na lista de compras. Nulo = não vigiar este item.
  min_stock   numeric,
  notes       text,
  photo_path  text,
  updated_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'material_items_kind_ck') then
    alter table public.material_items
      add constraint material_items_kind_ck check (kind in ('consumivel', 'reutilizavel'));
  end if;
end $$;

create index if not exists material_items_category_idx on public.material_items (category);
create index if not exists material_items_kind_idx     on public.material_items (kind);

-- ── Listas base de material (conjuntos reutilizáveis) ───────────
-- "Essenciais de carrinha" (`is_default`) vai SEMPRE, em todos os eventos. As
-- outras são criadas por tipo de montagem e entram por regra ou à mão.
create table if not exists public.material_lists (
  id          text primary key,
  name        text not null,
  is_default  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.material_list_items (
  id          text primary key,
  list_id     text not null references public.material_lists(id) on delete cascade,
  -- `restrict` de propósito: apagar do catálogo um item que está em listas tem
  -- de doer, senão as listas esvaziam-se sozinhas sem ninguém dar por isso.
  item_id     text not null references public.material_items(id) on delete restrict,
  qty         numeric not null default 1,
  -- Escala com o número de convidados: 0.02 (=1/50) → um saco por cada 50 pax.
  -- A conta é ceil(pax × qty_per_pax), nunca abaixo de `qty`.
  qty_per_pax numeric,
  critical    boolean not null default false,
  position    integer not null default 0
);

create index if not exists material_list_items_list_idx
  on public.material_list_items (list_id);
-- A outra chave estrangeira (auditoria externa, B4).
create index if not exists material_list_items_item_idx
  on public.material_list_items (item_id);

-- ── Regras: o que a PROPOSTA implica em material ────────────────
-- Editáveis pela equipa, de propósito. Uma condição por regra, sem E/OU:
-- condições compostas são uma linguagem de programação com outro nome, e o
-- sítio onde isto deixa de ser depurável. Duas condições fazem-se com duas
-- regras, e a checklist mostra qual delas disparou.
create table if not exists public.material_rules (
  id          text primary key,
  name        text not null,
  enabled     boolean not null default true,
  match_kind  text not null,          -- sempre | servico | texto | pax
  match_value text,
  action      text not null default 'add_list',   -- add_list | add_item
  list_id     text references public.material_lists(id) on delete cascade,
  item_id     text references public.material_items(id) on delete cascade,
  qty         numeric,
  qty_per_pax numeric,
  position    integer not null default 0,
  updated_at  timestamptz not null default now()
);

-- As duas chaves estrangeiras (auditoria externa, B4).
create index if not exists material_rules_item_id_idx on public.material_rules (item_id);
create index if not exists material_rules_list_id_idx on public.material_rules (list_id);

-- ── Checklist de material POR EVENTO ────────────────────────────
-- É uma CÓPIA das listas base, não uma referência: mudar uma lista base não
-- pode mexer na checklist de um evento já preparado.
create table if not exists public.event_material (
  id           text primary key,
  quote_id     text not null references public.quotes(id) on delete cascade,
  status       text not null default 'preparada',  -- preparada|carregada|devolvida
  generated_at timestamptz not null default now(),
  vehicles     jsonb not null default '[]',
  notes        text,
  updated_at   timestamptz not null default now()
);

-- UMA checklist por evento, imposta pela base de dados e não pela boa vontade
-- de quem chama. Dois pedidos de "gerar" ao mesmo tempo — duas pessoas, ou dois
-- separadores — liam ambos "ainda não há" e criavam ambos; ficavam duas
-- checklists e as marcações dividiam-se entre elas, sem ninguém dar por isso.
create unique index if not exists event_material_quote_uidx
  on public.event_material (quote_id);

create table if not exists public.event_material_items (
  id          text primary key,
  event_id    text not null references public.event_material(id) on delete cascade,
  -- Sem chave estrangeira apertada: a checklist do dia não pode depender de o
  -- item continuar a existir no catálogo. Serve para descontar stock e para
  -- relatórios; o NOME copiado é que faz a lista sobreviver a tudo.
  item_id     text,
  name        text not null,
  category    text not null,
  unit        text,
  kind        text not null,
  qty         numeric not null,
  critical    boolean not null default false,
  -- Para o ecrã poder responder a "porque é que isto está aqui?". Sem isto,
  -- uma lista gerada por regras é uma lista que ninguém percebe e toda a gente
  -- começa a ignorar.
  origin      text not null,          -- base | regra | manual
  origin_ref  text,                   -- id da lista ou da regra
  -- O rótulo legível, copiado como o nome e pela mesma razão: a regra pode ser
  -- renomeada ou apagada, e a checklist do dia tem de continuar a explicar-se.
  origin_label text not null default '',
  vehicle_id  text,
  loaded_at   timestamptz,
  loaded_by   text,
  returned_at timestamptz,
  returned_by text,
  missing     boolean not null default false,
  used_qty    numeric,
  note        text
);

create index if not exists event_material_items_event_idx
  on public.event_material_items (event_id);

-- Quem marcou o quê e quando. Guarda TAMBÉM as marcações que perderam um
-- conflito: uma marcação que desaparece sem rasto é o que faz duas pessoas
-- discutirem sobre quem carregou o escadote.
create table if not exists public.event_material_log (
  id         text primary key,
  event_id   text not null references public.event_material(id) on delete cascade,
  item_id    text not null,
  action     text not null,          -- loaded|unloaded|returned|missing|note|used
  value      text,
  actor      text not null,
  -- Relógio de QUEM MARCOU. Pode vir do passado: o telemóvel esteve offline.
  marked_at  timestamptz not null,
  -- Relógio do servidor, quando a marcação finalmente chegou.
  synced_at  timestamptz not null default now(),
  -- A marcação chegou mas perdeu para uma mais recente. Fica registada.
  superseded boolean not null default false
);

create index if not exists event_material_log_event_idx
  on public.event_material_log (event_id);

-- ── Biblioteca de temas (fotos de inspiração reutilizáveis) ─────
-- Só os METADADOS de cada tema ("Itália", "Terracotta"). As fotos vivem no
-- bucket privado de Storage `theme-assets`, uma pasta por id de tema — a
-- pasta é a única fonte de verdade do que existe, por isso não há aqui
-- nenhuma lista de imagens que possa dessincronizar.
create table if not exists public.proposal_themes (
  id          text primary key,
  name        text not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists proposal_themes_name_idx on public.proposal_themes (name);

-- Foto ESCOLHIDA para o cartão do tema (caminho dentro do bucket,
-- `<id do tema>/<ficheiro>.jpg`). Sem ela o cartão mostra a foto mais recente,
-- que muda sozinha a cada carregamento — com milhares de fotos por tema, a
-- capa passa a ser uma decisão e não um acidente.
-- Coluna adicionada depois da tabela: `if not exists` para o ficheiro poder ser
-- colado outra vez inteiro. Enquanto não correr, a aplicação continua a
-- funcionar (a capa é a foto mais recente) e só escolher uma capa é que
-- responde 503 a pedir este passo.
alter table public.proposal_themes add column if not exists cover_path text;

-- Ordem manual das fotos de um tema: só os caminhos que a equipa ARRUMOU à
-- mão, pela ordem escolhida. A pasta do Storage continua a ser a única fonte
-- de verdade do que existe — isto é a ordem preferida de um prefixo dela, e
-- tudo o que não estiver aqui continua a vir das mais recentes para as mais
-- antigas. Sem a coluna, o tema simplesmente não tem ordem manual.
alter table public.proposal_themes add column if not exists photo_order jsonb;

-- Um tema por nome — a garantia fica na própria base de dados. As rotas
-- POST /api/temas e PATCH /api/temas/[id] já recusam um nome repetido, mas
-- entre essa leitura e a escrita cabe outra criação: só este índice impede
-- que duas fiquem lá as duas. Quem perde apanha um 23505, que as rotas
-- traduzem para o mesmo 409 de nome duplicado.
--
-- Compara lower(btrim(name)) — maiúsculas e espaços à volta não fazem um tema
-- novo. Os ACENTOS não entram aqui (precisaria da extensão `unaccent`, que
-- nem todas as instalações têm): a verificação da aplicação é mais estrita e
-- é ela que impede "Itália" ao lado de "Italia".
--
-- ── O AVISO QUE ERA SÓ UM COMENTÁRIO ────────────────────────────────────
-- Dizia aqui: numa base já em uso este índice NÃO se aplica se já existirem
-- nomes duplicados. Verdade — e o que o comentário não dizia é o que isso
-- CUSTA: o `create unique index` aborta a transação, e o resto do ficheiro
-- deixa de correr. Mediu-se o que fica por criar a partir deste ponto: seis
-- colunas de `proposal_themes` (kind, filter_rule, favorito, arquivado,
-- manual_paths, ordem), a biblioteca de fotografias inteira (três tabelas), os
-- contratos, o Inbox, as passkeys, as restrições e TODO o `enable row level
-- security` do fim. Uma instalação parada aqui parece feita — a lista de temas
-- até se lê na mesma — e vai partindo uma funcionalidade de cada vez, sem
-- ninguém ligar o defeito a um índice que falhou há semanas.
--
-- Por isso o índice passa a ser uma TENTATIVA: se houver duplicados, deixa um
-- aviso (visível no SQL Editor) e o ficheiro segue. O que fica por garantir é
-- só a unicidade — que as rotas POST /api/temas e PATCH /api/temas/[id] já
-- verificam antes de escrever —, e resolve-se renomeando os duplicados e
-- correndo o ficheiro outra vez, que é o que a consulta abaixo serve para
-- encontrar:
--   select lower(btrim(name)) as nome, count(*), array_agg(id)
--     from public.proposal_themes
--    group by 1 having count(*) > 1;
do $$ begin
  create unique index if not exists proposal_themes_name_uk
    on public.proposal_themes (lower(btrim(name)));
exception when others then
  raise warning 'proposal_themes_name_uk não criado (%). Há temas com o mesmo nome: renomeie-os e volte a correr este ficheiro. O resto do schema continuou.', sqlerrm;
end $$;

-- ── Contratos, continuação ──────────────────────────────────────
-- A tabela é criada mais acima, junto às colunas do selo da versão (a razão
-- está lá escrita). O que fica aqui é o resto do que ela ganhou desde então.

-- O selo do documento aceite: a impressão digital do PDF que o casal viu,
-- copiada da proposta no momento do aceite. Ver a nota nas colunas homónimas
-- da tabela `proposals`.
alter table public.contracts add column if not exists proposta_pdf_sha256 text;
alter table public.contracts add column if not exists proposta_pdf_bytes integer;

create index if not exists contracts_proposal_id_idx on public.contracts (proposal_id);

-- Um contrato por proposta — garantia de unicidade na própria base de dados.
-- É o lock do aceite: dois aceites concorrentes passam ambos o
-- getContractByProposal (nenhum vê contrato ainda), mas só um vence este índice
-- no insert; o outro apanha o conflito e sai sem emitir um 2.º sinal (ver
-- createContractIfAbsent). Idempotente (IF NOT EXISTS). Os proposal_id nulos não
-- colidem entre si no Postgres, por isso um contrato sem proposta não é bloqueado.
create unique index if not exists contracts_proposal_id_uk on public.contracts (proposal_id);

-- ── Sobreposição local do Inbox (ligações CRM, etiquetas, arquivo) ──
--
-- ⚠ TABELA ÓRFÃ, DE PROPÓSITO. A caixa de entrada de email foi APAGADA a
-- pedido dela (agosto de 2026): não há rota, ecrã, store nem cópia de
-- segurança que escreva ou leia isto. As linhas que cá estão apontam para
-- Message-IDs de um ecrã que já não existe.
--
-- A tabela FICA — não se deita abaixo dados de ninguém por arrumação. Quem a
-- quiser mesmo ver pelas costas do sistema pode; quem a quiser apagar de vez
-- corre `drop table public.message_links;` à mão, e mais nada se parte.
--
-- O que era: camada de anotação PRÓPRIA sobre os emails, chaveada pelo
-- Message-ID (chave durável — o uid IMAP não é estável). Não tocava na caixa
-- de correio: "arquivar"/"apagar" aqui significavam ESCONDER (preencher
-- `archived_at`), NUNCA um expunge no IMAP.
create table if not exists public.message_links (
  id           text primary key,          -- Message-ID do email (chave durável)
  quote_id     text references public.quotes (id) on delete set null,
  proposal_id  uuid references public.proposals (id) on delete set null,
  labels       jsonb not null default '[]'::jsonb,
  pinned       boolean not null default false,
  archived_at  timestamptz,               -- arquivo = esconder; nunca um delete real
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create index if not exists message_links_quote_id_idx on public.message_links (quote_id);
create index if not exists message_links_proposal_id_idx on public.message_links (proposal_id);

-- ── Passkeys (WebAuthn) ─────────────────────────────────────────
-- Uma linha por DISPOSITIVO registado, não por pessoa: quem tem telemóvel e
-- portátil regista os dois, e perder um não fecha a porta ao outro.
--
-- `public_key` é a chave PÚBLICA — não é um segredo. A privada nunca sai do
-- aparelho (fica no Secure Enclave / TEE), e é por isso que uma cópia desta
-- tabela não deixa ninguém entrar.
--
-- `rp_id` é guardado com a credencial e verificado à entrada: uma passkey
-- registada num domínio não serve noutro, nem que a linha seja copiada.
--
-- `counter` é o contador de assinaturas do autenticador. Se um dia vier igual
-- ou menor do que o guardado, é sinal de credencial clonada (ver o store).
create table if not exists public.passkeys (
  id            text primary key,          -- credential ID em base64url
  user_name     text not null,             -- a conta a que o dispositivo pertence
  public_key    text not null,             -- COSE em base64url (não é segredo)
  counter       bigint not null default 0,
  transports    jsonb not null default '[]'::jsonb,
  rp_id         text not null,
  device_label  text not null default '',  -- nome dado por quem registou
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index if not exists passkeys_user_name_idx on public.passkeys (lower(user_name));

-- ── Reciclagem (R3 do «tudo reversível», 10/10) ─────────────────
-- O que se apaga no back office fica aqui 30 dias, com um retrato que deixa
-- repor tal e qual (com o mesmo id). A limpeza diária corre dentro de
-- /api/cron/backup, depois da cópia de segurança. A migração própria está em
-- db/migracoes/20261010_r3_reciclagem.sql.
create table if not exists public.reciclagem (
  id          uuid primary key default gen_random_uuid(),
  tipo        text not null,
  rotulo      text not null,
  origem_id   text not null,
  apagado_em  timestamptz not null default now(),
  apagado_por text,
  retrato     jsonb not null,
  ficheiros   jsonb not null default '[]'::jsonb
);

create index if not exists reciclagem_apagado_em_idx on public.reciclagem (apagado_em);

-- ── Restrições de integridade (CHECK) ───────────────────────────
-- Garantem, na própria base de dados, que os campos de estado/tipo só
-- aceitam os valores que a aplicação conhece e que os montantes não são
-- negativos — mesmo que algo escreva fora da app. Adicionadas de forma
-- idempotente (só se ainda não existirem) e como NOT VALID, para nunca
-- falharem numa instalação já existente com dados antigos: passam a ser
-- aplicadas a partir da próxima escrita, sem varrer as linhas atuais.
do $$ begin
  -- «A preparar proposta» (6/11): uma instalação com a restrição antiga, sem
  -- `a_preparar`, troca-a pela nova (db/migracoes/20261106_quotes_status_a_preparar.sql).
  if exists (
    select 1 from pg_constraint
    where conname = 'quotes_status_chk'
      and pg_get_constraintdef(oid) not like '%a_preparar%'
  ) then
    alter table public.quotes drop constraint quotes_status_chk;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'quotes_status_chk') then
    alter table public.quotes add constraint quotes_status_chk
      check (status in ('pendente','em_revisao','a_preparar','cotado','aceite','rejeitado')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposals_status_chk') then
    alter table public.proposals add constraint proposals_status_chk
      check (status in ('rascunho','enviada','em_negociacao','aceite','rejeitada')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposals_amounts_chk') then
    alter table public.proposals add constraint proposals_amounts_chk
      check (vat_rate >= 0 and subtotal >= 0 and vat >= 0 and total >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_chk') then
    alter table public.tasks add constraint tasks_priority_chk
      check (priority in ('baixa','normal','alta')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'calendar_events_kind_chk') then
    alter table public.calendar_events add constraint calendar_events_kind_chk
      check (kind in ('reuniao','evento','bloqueio','nota')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_status_chk') then
    alter table public.invoices add constraint invoices_status_chk
      check (status in ('emitida','paga','anulada')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_kind_chk') then
    alter table public.invoices add constraint invoices_kind_chk
      check (kind in ('sinal','saldo','total')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'invoices_amount_chk') then
    alter table public.invoices add constraint invoices_amount_chk
      check (amount >= 0 and vat_rate >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'inventory_condition_chk') then
    alter table public.inventory_items add constraint inventory_condition_chk
      check (condition in ('novo','bom','usado','danificado')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'overview_settings_id_chk') then
    alter table public.overview_settings add constraint overview_settings_id_chk
      check (id in ('notas','meta')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'overview_settings_revision_chk') then
    alter table public.overview_settings add constraint overview_settings_revision_chk
      check (revision >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contracts_status_chk') then
    alter table public.contracts add constraint contracts_status_chk
      check (status in ('pendente','aceite')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'passkeys_counter_chk') then
    alter table public.passkeys add constraint passkeys_counter_chk
      check (counter >= 0) not valid;
  end if;
end $$;

-- ── Biblioteca visual: etiquetas por eixo ───────────────────────
-- O que isto resolve: os temas misturavam três eixos diferentes no mesmo
-- nível — "Bouquets Branco e Amarelo" (tipo + paleta), "Itália" (estilo),
-- "Terracotta" (paleta) — numa estrutura de PASTAS, onde cada foto vive num
-- sítio só. Um seating plan em terracotta tinha de estar em dois temas ao
-- mesmo tempo, e "seating plans em terracotta" era uma pergunta que não se
-- podia fazer.
--
-- A partir daqui: a FOTO tem etiquetas em três eixos independentes, e um TEMA
-- é uma pergunta com nome (ver `filter_rule` mais abaixo). A mesma foto
-- responde a várias perguntas sem existir duas vezes.
--
-- O QUE ISTO NÃO É: uma segunda fonte de verdade sobre o que existe. A pasta
-- do bucket continua a mandar nisso (ver src/lib/theme-storage.ts). Uma linha
-- sem ficheiro é um fantasma; um ficheiro sem linha é uma foto por etiquetar,
-- e a linha nasce sozinha ao listar. Nenhum byte se move por causa disto.

-- Os valores de cada eixo. É uma TABELA e não uma lista no código porque o
-- vocabulário é da equipa: acrescentar "champanhe" à paleta não pode obrigar
-- a um deploy.
create table if not exists public.biblioteca_etiquetas (
  id          text primary key,          -- 'paleta:terracotta' — legível no SQL Editor
  eixo        text not null,             -- 'tipo' | 'paleta' | 'estilo'
  nome        text not null,             -- 'terracotta'
  ordem       int  not null default 0,   -- ordem de apresentação dentro do eixo
  created_at  timestamptz not null default now()
);

-- Um valor por eixo: "Terracotta" e "terracotta" não são duas etiquetas.
create unique index if not exists biblioteca_etiquetas_uk
  on public.biblioteca_etiquetas (eixo, lower(btrim(nome)));

create index if not exists biblioteca_etiquetas_eixo_idx
  on public.biblioteca_etiquetas (eixo, ordem);

-- Uma linha por FICHEIRO do bucket `theme-assets`. Existe para haver onde
-- pendurar etiquetas — e, de lambuja, para a contagem de cada cartão deixar de
-- custar uma ida ao Storage por tema.
create table if not exists public.biblioteca_fotos (
  path        text primary key,          -- '<pasta>/<ficheiro>.jpg' dentro do bucket
  -- A pasta de ORIGEM. Depois da migração deixa de significar "tema" e passa a
  -- ser só a primeira parte do endereço — que é o que sempre foi de facto.
  pasta       text generated always as (split_part(path, '/', 1)) stored,
  fingerprint text,                      -- resumo do original, quando o nome o traz
  -- MD5 do conteúdo, vindo do eTag que a listagem do Storage já devolve. É o
  -- que permite reconhecer a MESMA foto carregada em duas pastas e juntar as
  -- etiquetas das duas sem olhar para a imagem.
  md5         text,
  largura     int,
  altura      int,
  lqip        text,                      -- placeholder curto servido inline (nulo até existir)
  -- ══════════════════════════════════════════════════════════════════════════
  -- O ENDEREÇO ASSINADO DESTE FICHEIRO, POR BALDE
  -- ══════════════════════════════════════════════════════════════════════════
  --
  -- `{"proposal-medias": "https://…?token=…", "proposal-thumbs": "…"}`.
  --
  -- Existe porque a página do casal assinava tudo de novo A CADA VISITA. O
  -- Supabase devolve um token novo de cada vez, portanto o endereço mudava
  -- sempre — e a chave da cache do navegador inclui o endereço inteiro. As
  -- fotografias estão gravadas com validade de um ano, e esse ano nunca valia
  -- nada: reabrir a proposta descarregava tudo outra vez. Numa proposta de 46
  -- fotografias são 6,6 a 9,2 MB, que num 4G rural são mais de meio minuto.
  --
  -- Guardar o endereço só é seguro porque o CONTEÚDO de um caminho nunca muda:
  -- cada ficheiro tem um uuid gerado no carregamento, trocar uma fotografia
  -- grava um caminho NOVO, e a única reescrita refaz os mesmos bytes a partir
  -- do mesmo original (ver `cache-das-fotos.ts`). Portanto caminho → bytes é
  -- imutável, e caminho → endereço pode ser permanente.
  --
  -- A chave é o CAMINHO, nunca a proposta: uma revisão muda QUE caminhos o
  -- documento lista, não o que um caminho significa. Por isso não há nada a
  -- invalidar quando ela revê uma proposta.
  --
  -- SE A CHAVE JWT DO SUPABASE FOR ALGUM DIA ROTACIONADA, todos estes endereços
  -- morrem de uma vez e as fotografias deixam de abrir. A reparação é uma linha:
  --     update public.biblioteca_fotos set urls = null;
  urls        jsonb,
  -- A cor dominante, '#rrggbb'. Calculada no NAVEGADOR de quem carrega a foto
  -- (ver `corDe` em image-worker.ts): do lado da proposta as fotos chegam por
  -- URLs assinados de outro domínio e ler-lhes os píxeis lançaria. É o que
  -- alimenta o aviso de paleta e o "arrumar por cor" do estúdio. Nula nas fotos
  -- anteriores a isto existir — e uma foto sem cor não entra em nenhum dos dois.
  cor         text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Para instalações que já tinham a tabela antes de a cor existir.
alter table public.biblioteca_fotos add column if not exists cor text;
-- E antes de os endereços assinados passarem a ser guardados (ver a coluna).
alter table public.biblioteca_fotos add column if not exists urls jsonb;

create index if not exists biblioteca_fotos_pasta_idx on public.biblioteca_fotos (pasta);
create index if not exists biblioteca_fotos_md5_idx
  on public.biblioteca_fotos (md5) where md5 is not null;

create table if not exists public.biblioteca_foto_etiquetas (
  path        text not null references public.biblioteca_fotos (path) on delete cascade,
  etiqueta_id text not null references public.biblioteca_etiquetas (id) on delete cascade,
  -- QUEM pôs esta etiqueta — a coluna mais importante da tabela:
  --   'migracao' — adivinhada a partir da pasta onde a foto estava
  --   'fusao'    — herdada de uma cópia byte-a-byte da mesma foto noutra pasta
  --   'upload'   — aplicada ao largar a foto num tema
  --   'manual'   — confirmada ou posta à mão
  -- É o que deixa a revisão em lote mostrar "por confirmar", e o que torna a
  -- migração reversível com um único DELETE.
  origem      text not null default 'manual',
  created_at  timestamptz not null default now(),
  -- A chave é DERIVADA das duas colunas acima, em vez de ser um par
  -- (path, etiqueta_id). Dá exactamente a mesma garantia — a mesma etiqueta
  -- não entra duas vezes na mesma foto — e dá mais uma: a linha passa a ter um
  -- `id` de texto, que é o que o Repository partilhado (src/lib/repository.ts)
  -- e a cópia de segurança precisam para saber ler, repor e apagar isto como
  -- lêem tudo o resto. Sem ele, esta tabela seria a única do sistema que a
  -- reposição não sabia tratar — e é aqui que mora o trabalho à mão de
  -- etiquetar as fotos, que é precisamente o que não se pode perder.
  id          text generated always as (path || '#' || etiqueta_id) stored,
  primary key (id)
);

create index if not exists biblioteca_foto_etiquetas_etiqueta_idx
  on public.biblioteca_foto_etiquetas (etiqueta_id);
-- A outra chave estrangeira (auditoria externa, B4).
create index if not exists biblioteca_foto_etiquetas_path_idx
  on public.biblioteca_foto_etiquetas (path);

-- ── Os temas passam a poder ser filtros ─────────────────────────
-- Colunas acrescentadas à tabela que já existe, em vez de uma tabela nova: é
-- onde já estão os 6 temas, as capas escolhidas, as ordens manuais e o índice
-- único de nome. Trocar de tabela seria mover dados reais para ganhar uma
-- palavra.
--
-- `kind` por omissão é 'pasta' — o comportamento de hoje. Correr este ficheiro
-- NÃO muda nada do que se vê; é a migração (scripts/migrar-temas.sql) que
-- converte os temas em filtros, e só quando for corrida.
alter table public.proposal_themes add column if not exists kind text not null default 'pasta';

-- A regra de um tema-filtro. Uma entrada por EIXO, e a foto tem de cumprir
-- TODAS as entradas (E entre eixos). Dentro de um eixo, `modo` decide:
--   'todas'    — a foto tem de ter todas as etiquetas listadas (o normal:
--                "Bouquets Branco e Amarelo" é branco E amarelo)
--   'qualquer' — basta uma delas
-- Um eixo ausente não restringe nada ("Terracotta" aceita qualquer tipo).
--   {"v":1,"eixos":[{"eixo":"tipo","modo":"todas","etiquetas":["tipo:bouquet"]}]}
alter table public.proposal_themes add column if not exists filter_rule jsonb;

alter table public.proposal_themes add column if not exists favorito boolean not null default false;
alter table public.proposal_themes add column if not exists arquivado boolean not null default false;

-- ── AS DUAS QUE AINDA NÃO TÊM A OUTRA METADE ────────────────────────────
-- Estas duas colunas estão criadas e VAZIAS: nenhum `toRow` as escreve, nenhum
-- `fromRow` as lê, nenhuma rota lhes toca. Estão aqui porque o plano (ver
-- TEMAS-PLANO.md §4.4) as previu à frente do código, e ficam — criá-las não
-- custa nada e apagá-las custaria a quem já as tiver preenchido um dia. O que
-- não pode ficar é a impressão de que funcionam.
--
--   manual_paths — a lista de fotos de um tema `kind = 'manual'`. O `kind`
--     aceita 'manual' (restrição mais abaixo) e o `themes-store` até o lê, mas
--     NENHUMA rota cria temas manuais: `POST /api/temas` só produz 'pasta' ou
--     'filtro'. É meia funcionalidade, não uma funcionalidade partida.
--   ordem — ordem manual dos TEMAS na lista (não confundir com `photo_order`,
--     que é a ordem das FOTOS dentro de um tema). A lista ordena-se por nome.
--
-- QUEM LHES DER USO faz as duas metades na mesma alteração, como o
-- `photo_order` já está feito: o campo em `ProposalTheme`, o par toRow/fromRow
-- com a mesma escrita condicional (para uma base sem a coluna continuar a
-- aceitar um simples renomear), e tira a coluna da lista `NAO_TOCADAS` em
-- src/lib/mapeamento-e-schema.test.ts — que é o teste que hoje as vigia.
alter table public.proposal_themes add column if not exists manual_paths jsonb;
alter table public.proposal_themes add column if not exists ordem int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'biblioteca_etiquetas_eixo_chk') then
    alter table public.biblioteca_etiquetas add constraint biblioteca_etiquetas_eixo_chk
      check (eixo in ('tipo','paleta','estilo')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'biblioteca_foto_etiquetas_origem_chk') then
    alter table public.biblioteca_foto_etiquetas add constraint biblioteca_foto_etiquetas_origem_chk
      check (origem in ('migracao','fusao','upload','manual')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'proposal_themes_kind_chk') then
    alter table public.proposal_themes add constraint proposal_themes_kind_chk
      check (kind in ('pasta','filtro','manual')) not valid;
  end if;
end $$;

-- O vocabulário inicial. `on conflict do nothing` para o ficheiro poder ser
-- colado outra vez sem desfazer o que a equipa entretanto mudou — e note-se
-- que APAGAR uma destas etiquetas na aplicação é definitivo: correr o ficheiro
-- de novo volta a criá-la.
insert into public.biblioteca_etiquetas (id, eixo, nome, ordem) values
  ('tipo:bouquet',        'tipo',   'bouquet',        10),
  ('tipo:seating-plan',   'tipo',   'seating plan',   20),
  ('tipo:centro-de-mesa', 'tipo',   'centro de mesa', 30),
  ('tipo:arco',           'tipo',   'arco',           40),
  ('tipo:cerimonia',      'tipo',   'cerimónia',      50),
  ('tipo:entrada',        'tipo',   'entrada',        60),
  ('tipo:mesa-de-doces',  'tipo',   'mesa de doces',  70),
  ('tipo:papelaria',      'tipo',   'papelaria',      80),
  ('tipo:iluminacao',     'tipo',   'iluminação',     90),
  ('tipo:espaco',         'tipo',   'espaço',        100),
  ('paleta:branco',       'paleta', 'branco',         10),
  ('paleta:amarelo',      'paleta', 'amarelo',        20),
  ('paleta:verde',        'paleta', 'verde',          30),
  ('paleta:terracotta',   'paleta', 'terracotta',     40),
  ('paleta:rosa',         'paleta', 'rosa',           50),
  ('paleta:colorido',     'paleta', 'colorido',       60),
  ('paleta:neutro',       'paleta', 'neutro',         70),
  ('estilo:minimalista',  'estilo', 'minimalista',    10),
  ('estilo:campo',        'estilo', 'campo',          20),
  ('estilo:mediterranico','estilo', 'mediterrânico',  30),
  ('estilo:classico',     'estilo', 'clássico',       40),
  ('estilo:boho',         'estilo', 'boho',           50),
  ('estilo:editorial',    'estilo', 'editorial',      60)
on conflict (id) do nothing;

-- ════════════════════════════════════════════════════════════════
-- ESCREVER POR CIMA DO TRABALHO DE OUTRA PESSOA
-- ════════════════════════════════════════════════════════════════
--
-- A perda que ninguém vê acontecer. Duas pessoas abrem a mesma factura: uma
-- marca-a como paga, a outra corrige a nota a partir de um ecrã que abriu dois
-- minutos antes. A segunda gravação reescreve a LINHA INTEIRA com o estado que
-- ela leu — a factura volta a "emitida", o `paid_at` fica vazio, e não há erro
-- nenhum, nem registo, nem aviso. O livro fiscal passa a dizer que não entrou
-- dinheiro que entrou.
--
-- A aplicação sabe impedir isto desde sempre (src/lib/repository.ts): a escrita
-- leva um `where updated_at = <o que foi lido>` e, se nenhuma linha for
-- afectada, alguém escreveu no meio — relê-se e volta a aplicar-se a alteração
-- por cima do que a outra pessoa gravou. Só que essa comparação precisa de uma
-- coluna onde se apoiar, e a maior parte destas tabelas não a tinha. Estas
-- colunas são essa metade.
--
-- ── AS DUAS METADES TÊM DE ANDAR JUNTAS ─────────────────────────
-- QUEM COMPARA é o `touch: true` no mapper do store; QUEM ESCREVE é esta
-- coluna. Uma sem a outra não é meia protecção:
--   · coluna sem `touch`  → a coluna fica a nulo e não protege nada;
--   · `touch` sem coluna  → TODAS as escritas da tabela falham com
--                           "column updated_at does not exist".
-- Há um teste que prende as duas (src/lib/bloqueio-optimista.test.ts): para
-- cada mapper com `touch`, procura a coluna NESTE ficheiro.
--
-- ── PORQUE É `timestamptz` NULO E NÃO `not null default now()` ──
-- Nulo é a verdade para uma linha que ainda nunca foi actualizada, e a
-- comparação sabe lidar com isso (`is null` na primeira escrita, `= <valor>`
-- daí em diante). Um `default now()` diria que todas as linhas antigas foram
-- tocadas no momento em que este ficheiro correu, o que não aconteceu. É também
-- a forma que `quotes`, `proposals` e `message_links` já usam.
--
-- IDEMPOTENTE: `add column if not exists` — este ficheiro é para ser colado
-- outra vez sempre que for preciso, e correr duas vezes não faz nada na segunda.
-- Correr isto NÃO muda nada do que se vê; só dá à comparação onde se apoiar.
--
-- `proposals` não aparece aqui: a coluna já nasce com a tabela lá em cima (e
-- estava lá desde o primeiro dia sem nunca ser escrita — a protecção montada e
-- desligada). `email_templates` e `proposal_settings` também já a têm, mas por
-- outra razão (mostrar "definido há quatro meses") e continuam sem comparação:
-- as duas escrevem a linha inteira, e nesse caso a repetição chegaria ao mesmo
-- resultado — o que falta ali é o cliente dizer sobre que versão escreveu, como
-- a Visão Geral faz. As tabelas que ficam de fora estão explicadas no mapper de
-- cada store.
alter table public.invoices             add column if not exists updated_at timestamptz;
alter table public.contracts            add column if not exists updated_at timestamptz;
alter table public.tasks                add column if not exists updated_at timestamptz;
alter table public.suppliers            add column if not exists updated_at timestamptz;
alter table public.material_list_items  add column if not exists updated_at timestamptz;
alter table public.event_material_items add column if not exists updated_at timestamptz;
alter table public.biblioteca_etiquetas add column if not exists updated_at timestamptz;
alter table public.calendar_events      add column if not exists updated_at timestamptz;

-- ── Segurança ───────────────────────────────────────────────────
-- Ativamos RLS sem políticas públicas: só o servidor (service_role key,
-- que ignora o RLS) consegue ler/escrever. Os dados ficam privados.
alter table public.quotes    enable row level security;
alter table public.proposals enable row level security;
-- Sem políticas: só a service_role lá chega, como em todas as outras.
alter table public.proposal_settings enable row level security;
alter table public.service_catalog enable row level security;
alter table public.tasks     enable row level security;
alter table public.suppliers enable row level security;
alter table public.calendar_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.app_state enable row level security;
alter table public.email_templates enable row level security;
alter table public.overview_settings enable row level security;
alter table public.invoices    enable row level security;
alter table public.invoice_counters enable row level security;
alter table public.inventory_items enable row level security;
alter table public.material_items  enable row level security;
alter table public.material_lists      enable row level security;
alter table public.material_list_items enable row level security;
alter table public.material_rules        enable row level security;
alter table public.event_material        enable row level security;
alter table public.event_material_items  enable row level security;
alter table public.event_material_log    enable row level security;
alter table public.proposal_themes enable row level security;
alter table public.biblioteca_etiquetas enable row level security;
alter table public.biblioteca_fotos enable row level security;
alter table public.biblioteca_foto_etiquetas enable row level security;
alter table public.contracts enable row level security;
alter table public.message_links enable row level security;
alter table public.passkeys enable row level security;
alter table public.reciclagem enable row level security;
