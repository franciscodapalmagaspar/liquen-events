# A estrutura dos dados

Pergunta do dono (17/11): «como está a estrutura dos dados?». A fasquia é a dele
(regra `codigo.md`): código e dados ao nível da Vercel, da Linear e da Stripe.

Este documento nasceu **só análise e plano**. Desde 18/11 o P1, o P2 e o P3
estão feitos **no código** (ramo `dados/p1-a-p3`); a base de dados continua
sem nenhuma migração aplicada.

## −1. O que está feito

Auditado no código, não de memória. «Feito» quer dizer no ramo, com testes;
nada disto está no `main` sem o lote.

| Passo | Estado | O que ficou | Onde se afastou do texto |
|---|---|---|---|
| **P1** Tipos gerados | **feito** | `src/lib/db/tipos-da-base.ts` gerado da base viva (ferramenta `generate_typescript_types`); `src/lib/db/base.ts` com a única correção (`app_state.value` é `unknown`); `getSupabase()` devolve `SupabaseClient<Database>`; `Mapper.table` só aceita tabelas que existem. `src/lib/db/tipos-da-base.test.ts` fica vermelho quando o `db/schema.sql` e os tipos discordam — **sem rede** (lê os dois ficheiros; o dos tipos pela árvore do compilador). O teste dos mappers passou a usar o mesmo leitor do `schema.sql`. `npm run tipos:base` (`scripts/tipos-da-base.mjs`, explicado em `db/README.md`) regenera-os com a CLI do Supabase **da máquina de quem aplicou a migração**, fora do CI (que não tem nem deve ter chave). O comparador (`test/comparar-esquemas.ts`) vive fora de `src/`, e uma regra do ESLint impede a aplicação de o importar. Os mappers ainda recebem `Record<string, unknown>` (o `Repository` é genérico); passar cada um a `Linha<"tabela">` fica para quando se mexer em cada store. |
| **P1, achado** | **por aplicar** | O `schema.sql` tem `tasks.notas`, `subtarefas`, `anexos` e `posicao` desde 22/10 (PR #265) e **a produção não as tem**: gravar uma tarefa com o Supabase responde «coluna não existe». A última tarefa criada em produção é de 10/9. A migração está escrita e **não aplicada**: `db/migracoes/20261117_tarefas_painel_de_detalhe.sql`. As quatro linhas estão em `DIVERGENCIAS_CONHECIDAS` no teste, que fica vermelho quando os tipos forem regenerados depois de a aplicar. | — |
| **P2** Registo dos espaços | **feito** | `src/lib/app-state/espacos.ts`: 30 espaços, cada um com a chave, o esquema zod raso, o dono, o prazo e a cópia. Derivam dele: os conjuntos do `app_state` na cópia (`LEITURAS_DO_APP_STATE` em `api/backup`, com o compilador a obrigar a uma leitura por conjunto), `PREFIXOS_QUE_NAO_SAO_MENCAO`, `PREFIXOS_DE_INDICE_DE_FOTOS`, o que o `juntar-fotos-duplicadas` não conta como uso, e os prefixos que as guardas da reposição usam. `app-state/vigiar.ts`: cada leitura passa pelo esquema e o que não bate só fica **registado** (um aviso por espaço), nunca recusado. `espacos.test.ts` varre `src/` e falha com uma chave por registar. | Os esquemas são **rasos** (o topo do valor), de propósito: medido, ~0,003 ms por rascunho de 500 KB e ~6 ms por 2 000 linhas — contra centenas de ms de ida ao Supabase. Conferidos com a produção (só tipos e nomes de campos): 0 linhas fora da forma. As funções `lerEspaco`/`gravarEspaco` não se fizeram: a vigia está dentro do `getState` e companhia, e apanha todos os sítios sem mudar nenhum. O segundo tempo (recusar) fica para depois de uma semana sem avisos. |
| **P3** Lápides e caches | **feito (código)** | `clearProposalDraft` e as reposições dos rascunhos e dos envios **apagam** a linha (`apagarEstado`) em vez de gravar `null`. A tarefa da noite que já existia (`api/cron/backup`) decide ANTES de a cópia se fechar e põe o que vai sair **dentro dela** (`saiDoAppState`, com o valor cru que tinha; a reposição não o escreve sozinha). Só apaga depois de o email sair e com a cópia completa; o que não se conseguiu copiar não sai. Regras em `app-state/limpeza.ts` (puras); a varredura leve em `app-state/varrer.ts` (só chave, versão e um ou dois campos de topo); os apagares condicionais em `app-state/apagar.ts`; o resto em `app-state/limpeza-da-noite.ts`. Travas: 200 linhas e 2 MB de valores por noite; 15 s para o plano (a cópia não espera por ele); se a lista não couber no anexo, a cópia sai sem ela e a noite não apaga nada; o apagar tem prazo tirado do arranque da rota (até 20 s, nunca além dos 200 s) e cada pedido é cortado no tempo esgotado (`AbortSignal`); o registo valida-se com zod e, fora da forma, a noite fica a seco; a lista na cópia valida-se na reposição (`formas-da-limpeza.ts`); **a primeira noite é a seco** (só conta e escreve `limpeza:app-state`); uma leitura falhada ou truncada não apaga nada; nenhum órfão com menos de 24 h sai; cada linha sai só se ainda estiver como se leu (lápides: «ainda é nula»; o resto: o mesmo `updated_at`). | Ver a correção às contagens em baixo. Os 26 `tempo-activo:` sem pedido ficam (não autorizados). «Substituídos» da proposta online quer dizer **retratos expirados**: o resto da cache (`conteudo`, `cores`, `pontos`, a paleta) fica enquanto a proposta existir, porque a impressão na chave mistura a língua e as fotografias e «a linha mais nova» não diz qual é a atual (revisão de 18/11). As `ligacao-*` saem pela noite, não quando a proposta sai. «Existe» inclui a Reciclagem, e as propostas que foram para lá com o pedido (`retrato.propostas`). |
| P4–P11 | por fazer | — | — |

**Próximo passo de P1 e P2 (não feito, de propósito, a 18/11).** O júri pediu
dois passos grandes que mexem em todos os stores e em todos os sítios que leem
o `app_state`; ficaram de fora desta ronda para não pôr em risco o resto:

1. **`Mapper` tipado por tabela.** `Mapper<T, Tabela extends NomeDaTabela>`
   com `toRow(t): Linha<Tabela>["Insert"]` e `fromRow(r: Linha<Tabela>["Row"])`,
   em vez de `Record<string, unknown>`. Faz-se store a store (um PR cada, com o
   teste do mapper a provar a ida e a volta), começando pelos que têm colunas
   novas (`tasks`, `quotes`), e o `Repository` passa a genérico na tabela.
2. **`lerEspaco` / `gravarEspaco` inferidos do zod.** `lerEspaco("rascunhos", id)`
   devolve `z.infer<typeof ESPACOS.rascunhos.valor>` (ou `null`) e
   `gravarEspaco` só aceita esse tipo — o `getState<T>` de hoje confia no `T`
   de quem chama. Depende de os esquemas deixarem de ser rasos onde se lê mais
   do que o topo, e só depois de uma semana de vigia sem avisos (o «segundo
   tempo» do P2). Migra-se um espaço de cada vez; `getState` fica para os
   espaços sem esquema próprio.

**As contagens do G3, refeitas a 18/11 com as regras do código:**

| O quê | O G3 dizia | O código tira | Porquê a diferença |
|---|---:|---:|---|
| lápides `proposal-draft:` | 103 | 103 | — |
| rascunhos com conteúdo sem pedido | 23 | **10** | o estúdio guarda quatro chaves por pedido (`<id>`, `<id>--orcamento-linhas`, `--sobreposto`, `--orcamento-linhas--sobreposto`); a consulta do G3 comparava a chave inteira e contava **13 rascunhos de pedidos vivos** como órfãos |
| envios sem pedido | 3 | **1** | 2 são de pedidos que estão na Reciclagem (podem voltar) |
| `ligacao-*` de propostas apagadas | 19 + 19 | ≤ 18 + 18 | as da Reciclagem ficam (o pedido apagado leva as propostas para lá) |
| `proposta-web:retrato` | 23 substituídos | **34 expirados** | um retrato expirado (`validoAte`) nunca mais é servido; os substituídos expiram todos em 7 dias |
| outra cache da proposta online | — | 0 | fica enquanto a proposta existir (ver acima); a paleta (`refs` no lugar da proposta) nunca é órfã |

Primeira noite (a seco): ~184 linhas contadas, nenhuma apagada. Segunda noite
em diante: até 200 por noite. **Custo:** a varredura traz alguns kB (sem os
valores); os valores só se leem para o que sai
(~0,9 MB na primeira vez, sobretudo os 34 retratos; depois, quase nada). A
base de dados desce ~1,2 MB.

**Lições para os próximos projetos** (vão para o `docs/ESTRUTURA-DO-CODIGO.md`
quando esse ficheiro chegar a este ramo):

- Um teste que compara o esquema escrito com os tipos gerados, sem rede,
  encontrou no primeiro dia uma funcionalidade partida em produção há quatro
  semanas. Gerar os tipos não chega: é preciso compará-los.
- Uma regra de órfãos escrita em SQL à mão errou por 13 em 23. A regra vive
  num sítio só, numa função pura, e o mesmo código conta e apaga.
- «Apagar o que já não existe» tem de contar com a Reciclagem: o que está lá
  existe.
- Ler às páginas pára na página VAZIA, nunca na «curta»: o `listStateByPrefix`
  parava na curta e, com um `max-rows` abaixo de 1000, dizia-se completo com
  parte das linhas. Agora há um leitor só (`app-state/paginas.ts`).

**Como se mediu** (17/11, projeto `fvbafdezhslqojjsjgwi`): só consultas de
leitura, só de estrutura e de contagens (nomes de tabelas e colunas, tamanhos,
formas das chaves com letras e números trocados por `x`, contagens de órfãos).
Nenhum nome, email ou valor de cliente foi lido nem copiado para aqui. As
consultas estão no fim (§7), para se poderem repetir.

---

## 0. Em resumo

**Nota de hoje: 6 em 10.**

A base é sã e está bem defendida: RLS em todas as tabelas com acesso só pela
chave de serviço, `CHECK` nos estados, as relações principais com chave
estrangeira, um teste que prende cada mapper ao `db/schema.sql`, prazos nas
caches mais pesadas, e uma cópia de segurança que sabe o que leva e porquê.
É mais do que a maior parte dos projetos deste tamanho tem.

O que a separa de um 9 são cinco coisas, por ordem de gravidade:

1. **Nenhum tipo é gerado da base de dados.** O cliente do Supabase não tem tipo
   (`SupabaseClient` sem `<Database>`), por isso cada leitura é um `as`. A
   fronteira de escrita do pedido tem zod; a de **leitura** não tem em lado
   nenhum.
2. **O `app_state` é um segundo banco de dados escondido dentro do primeiro.**
   20 espaços de nomes, ~2 000 linhas, sem registo central, sem esquema, sem
   chaves estrangeiras — e as listas de prefixos estão copiadas à mão em
   pelo menos cinco ficheiros.
3. **Dados órfãos e lápides:** 103 rascunhos com valor `NULL` (nunca apagados),
   23 rascunhos de pedidos que já não existem, 26 `tempo-activo` e 3
   `envio-de-proposta` sem pedido, 19 códigos de ligação de propostas apagadas,
   23 retratos da proposta online substituídos e nunca limpos.
4. **O pedido inteiro vive num `jsonb` sem esquema na leitura**, com pagamentos,
   lista de convidados, mapa de mesas, checklists e histórico lá dentro.
5. **Faltam garantias no Postgres que o código já assume:** 4 relações sem chave
   estrangeira, 20 `CHECK` nunca validados (`NOT VALID`), 5 índices de chaves
   estrangeiras escritos e nunca aplicados, uma coluna morta.

Os primeiros três passos do plano (§4) não precisam de migração nenhuma e não se
veem: **tipos gerados**, **registo dos espaços do `app_state` com esquema**, e
**garantias baratas no Postgres** (validar os `CHECK` e aplicar os índices).

---

## 1. Mapa

### 1.1 Tamanhos

Base de dados: **40 MB** no total (`pg_database_size`, inclui o catálogo do
sistema); as 30 tabelas de `public` somam **~10,5 MB**. O plano gratuito dá
500 MB: estamos a **2 %** dele na base de dados. O que importa no custo é o
**armazenamento de ficheiros** e a **saída**, não isto — ver
`docs/GASTAR-POUCO-DESDE-O-INICIO.md`, «O Supabase».

### 1.2 As tabelas

Legenda das colunas:
**Tipo** — o tipo TypeScript existe; «à mão» quer dizer escrito à mão, nenhum é
gerado da base de dados.
**Fronteira** — onde há validação: E = escrita (rota), L = leitura (da base de
dados). «zod E» quer dizer zod na rota de escrita e nada na leitura.
**Prazo/tecto** — o que impede de crescer sem fim.

| Tabela | Linhas | Tamanho | O que guarda | Quem escreve / lê | Tipo | Fronteira | Prazo / tecto |
|---|---:|---:|---|---|---|---|---|
| `app_state` | 2 007 | 4,1 MB | chave/valor para tudo o resto (ver §1.3) | `src/lib/app-state.ts` e ~40 módulos | `getState<T>` — o `T` é afirmado, não verificado | nenhuma em geral; zod só no `diagnostico-video` | varia por prefixo (§1.3) |
| `biblioteca_fotos` | 1 473 | 2,4 MB | as fotografias da Biblioteca (caminho, medidas, cor, LQIP, `urls jsonb`) | `biblioteca-fotos-store.ts`; Temas, estúdio, PDF | à mão (`biblioteca-types.ts`) | mapper | não precisa: uma linha por foto |
| `biblioteca_foto_etiquetas` | 1 160 | 0,9 MB | foto ↔ etiqueta | `biblioteca-foto-etiquetas-store.ts` | à mão | mapper | — |
| `registo_de_acoes` | 3 176 | 0,9 MB | o registo de quem fez o quê no back office | `registo-de-acoes.ts` | à mão | — | **sim**: `limparRegistoAntigo` (meses) |
| `proposals` | 52 | 0,8 MB | propostas: 27 colunas + `doc jsonb` (o documento do estúdio) + `line_items jsonb` | `proposals-store.ts`; estúdio, PDF, proposta online, envio | à mão (`ProposalDoc` em `proposal-doc.ts:439`) | E: só tamanho (512 KB) no restauro; L: `r.doc as Proposal["doc"]` | não precisa |
| `quotes` | 47 | 0,35 MB | o pedido: `id`, `status`, `name`, `email` + **o pedido inteiro em `data jsonb`** | `quotes-store.ts`; quase tudo | à mão (`Quote`, `orcamento/types.ts:488`) | **zod E** (`quotePayloadSchema`, `quoteUpdateSchema`); **L nenhuma** (`r.data as Quote`) | não precisa |
| `reciclagem` | — | 0,2 MB | o que se apagou, 30 dias (`retrato jsonb`, `ficheiros jsonb`) | `reciclagem-store.ts`, `reciclagem.ts` | à mão | mapper | **sim**: 30 dias |
| `contracts` | — | 0,15 MB | contratos (registo fiscal) | `contracts-store.ts` | à mão (`contract-types.ts`) | — | não se apagam (lei) |
| `proposal_themes` | 42 | 0,13 MB | os Temas (`photo_order`, `filter_rule`, `manual_paths` em jsonb) | `themes-store.ts` | à mão (`theme-types.ts`) | mapper | — |
| `invoices` | — | 0,1 MB | faturas | `invoices-store.ts` | à mão | — | não se apagam (lei) |
| `tasks` | — | 64 kB | tarefas | `tasks-store.ts` | à mão | zod E | — |
| `biblioteca_etiquetas` | — | 64 kB | as etiquetas | `biblioteca-etiquetas-store.ts` | à mão | — | — |
| `suppliers` | — | 48 kB | fornecedores | `suppliers-store.ts` | à mão | zod E | — |
| `passkeys` | — | 48 kB | chaves de acesso | `passkeys-store.ts` | à mão | zod E | — |
| `event_material` (+ `_items`, `_log`) | — | ~100 kB | material por evento | `event-material*-store.ts` | à mão | — | — |
| `service_catalog` | — | 48 kB | catálogo de serviços | `servicos-catalogo-store.ts` | à mão | zod E | — |
| `material_items`, `material_lists`, `material_list_items`, `material_rules` | — | ~90 kB | material e regras | `material*-store.ts` | à mão | — | — |
| `proposal_settings` | — | 32 kB | definições da proposta (`value jsonb`) | `proposta-definicoes-store.ts` | à mão | zod E | — |
| `calendar_events`, `email_templates`, `inventory_items`, `invoice_counters`, `message_links`, `push_subscriptions`, `overview_settings` | — | ≤ 32 kB cada | o que o nome diz | o `*-store.ts` de cada | à mão | parcial | — |

**Relações com chave estrangeira (12):** `proposals.quote_id`,
`message_links.{quote_id, proposal_id}`, `event_material.quote_id`,
`event_material_{items,log}.event_id`, `material_list_items.{list_id, item_id}`,
`material_rules.{list_id, item_id}`, `biblioteca_foto_etiquetas.{path, etiqueta_id}`.

**Segurança:** RLS ligado nas 30, **nenhuma política** — ou seja, só a chave
`service_role` lê e escreve (`src/lib/supabase.ts`). É a escolha certa para um
back office de um só servidor (o Supabase avisa «RLS sem políticas», nível INFO,
e é intencional). Não é um problema; fica dito para ninguém o «corrigir».

### 1.3 Os espaços de nomes do `app_state`

Medido a 17/11. «Forma» é a chave com letras e números trocados por `x`.

| Prefixo | Linhas | Bytes | Forma | O que guarda | Quem escreve / lê | Validação | Prazo / tecto |
|---|---:|---:|---|---|---|---|---|
| `proposta-web:` | 169 | 1,54 MB | `proposta-web:<tipo>:<proposta>:<impressão>` | cache da proposta online: `retrato` (51, 1,18 MB), `conteudo` (34), `pontos` (28), `cores` (31), `paleta-do-pdf` (25) | `proposta-web/guardado.ts:34-63`, `proposta-web/retrato.ts:93-275`, `paleta-do-pdf.ts` | `getState<T>` sem verificação | **nenhum**: a impressão muda, a linha velha fica (até 6 retratos por proposta) |
| `diagnostico-video:` | 1 215 | 0,77 MB | `diagnostico-video:<dia>:<sessão>` | registo anónimo do vídeo da entrada | `api/diagnostico-video/route.ts` | **zod** (`.strict()`) | **sim**: desligado desde 4/11 (`diagnostico-video.ts:31`), apagado aos 30 dias (`limpar-diagnosticos-video.ts:18`). Sai tudo até 4/12 |
| `proposal-draft:` | 166 | 0,23 MB | `proposal-draft:<pedido>` | rascunhos do «Fazer proposta» | `proposal-drafts.ts`; `api/orcamento/[id]/proposta-rascunho` | à mão: `"doc" in stored` (`proposal-drafts.ts:83`); `doc: unknown` | **nenhum**; ver P3 |
| `foto-visual:` | 64 | 0,13 MB | `foto-visual:<00–3f>` | índice visual das fotos parecidas (64 baldes) | `fotos-parecidas.ts:86` | `getState<T>` | tecto pela forma (64 linhas) |
| `envio-de-proposta:` | 25 | 30 kB | `envio-de-proposta:<pedido>` | cópia do email de proposta enviado | `envios-de-proposta.ts:52` | `getState<T>` | nenhum (vai na cópia de segurança) |
| `proposal-templates` | 1 | 23 kB | chave fixa | modelos de proposta | `proposal-templates.ts:84` | à mão (`saoModelos`) | uma linha |
| `ligacao-proposta:` | 74 | 14 kB | `ligacao-proposta:<código>` | código curto do link → proposta | `proposta-link-curto.ts:78` | `getState<LigacaoCurta>` | expira (`expiraEm`), mas a linha fica |
| `ligacao-de-proposta:` | 71 | 2 kB | `ligacao-de-proposta:<uuid da proposta>` | o **inverso**: proposta → código | `proposta-link-curto.ts:88,292` | idem | idem |
| `limpeza:` | 3 | 13 kB | fixas | registos das limpezas da noite | `registos-das-limpezas.ts` | `getState<T>` | substitui-se |
| `tempo-activo:` | 68 | 13 kB | `tempo-activo:<pedido>` | tempo ativo por proposta (medição) | `tempo-activo-servidor.ts:44` | `getState<T>` | nenhum |
| `foto-resumo:` | 148 | 12 kB | `foto-resumo:<32 hex>` | índice anti-duplicados (resumo → caminhos) | `fotos-resumo.ts:76` | à mão (`caminhosValidos`) | ≤ 6 caminhos por resumo |
| `aquecimento-pdf:` | 1 | 4 kB | fixa | estado do aquecimento dos PDFs | `aquecimento-de-pdf.ts:108` | `getState<T>` | substitui-se |
| `armazenamento:` | 2 | 0,8 kB | fixas | ocupação medida | `ocupacao-do-armazenamento.ts:42` | `getState<T>` | substitui-se |
| `admin-recuperacao`, `copia-de-seguranca:ultima`, `diagnostico-de-armazenamento`, `inbox-last-uid` | 1 cada | < 1 kB | fixas | marcadores de operação | o módulo do mesmo nome | `getState<T>` | substitui-se |
| `trinco:`, `blob:i:`, `armazenamento-blob:uso`, `sessoes-revogadas`, `guiao-templates`, `proposal-prefs`, `invoice-seq-<ano>` | 0 hoje | — | — | trincos, índice do Blob, revogações, modelos de guião, preferências, numeração de dev | os módulos do mesmo nome | `getState<T>` | variam |

---

## 2. Problemas, com prova

Ordenados por gravidade. Cada um com a prova (ficheiro e linha, ou a consulta
do §7). Nenhum é sobre pagamentos ou contactos em falta (regra `dados.md`).

### G1 — Nenhum tipo é gerado da base de dados; todas as leituras são `as`

- `src/lib/supabase.ts:14-22`: `createClient(url, key, …)` sem `<Database>`.
  Cada `.from("…").select()` devolve linhas sem tipo.
- `src/lib/quotes-store.ts:48`: `fromRow: (r) => r.data as Quote`. O pedido
  inteiro entra na aplicação sem verificação nenhuma.
- `src/lib/proposals-store.ts:57-93`: 15 `as` campo a campo
  (`r.status as Proposal["status"]`, `r.doc as Proposal["doc"]`, …).
- `src/lib/app-state.ts:256,265,320,333,389,404,438,449`: `as T` em todas as
  leituras do `app_state`. **69 sítios** chamam `getState<…>`,
  `getStates<…>`, `listStateByPrefix<…>` ou `lerEstadoComVersao<…>` com um tipo
  afirmado (`grep`, fora dos testes).
- **69 sítios** fazem `… as ProposalDoc` (fora dos testes), vários ao sair da
  base de dados ou do corpo de um pedido (ex.: `api/propostas/route.ts:27`,
  `api/orcamento/[id]/moloni/route.ts:58,70,93`,
  `api/orcamento/[id]/versoes/route.ts:79`).
- 46 `as unknown as` em `src/` (fora dos testes).

O que mitiga: o `mapeamento-e-schema.test.ts` cruza os 26 mappers com o
`db/schema.sql` — mas com o **ficheiro**, não com a base de dados viva, e
apanha colunas, não tipos.

**Porque é o mais grave:** um tipo escrito à mão que não bate com a base de
dados não dá erro nenhum; dá um `undefined` silencioso três ecrãs depois.
A boa prática documentada (Supabase: «Generating TypeScript Types»;
`supabase gen types typescript`) é o tipo vir DA base de dados, e o zod validar
o que o tipo não consegue prometer (o conteúdo dos `jsonb`).

### G2 — O `app_state` é um segundo banco de dados sem esquema nem registo

- 20 espaços de nomes vivos (§1.3), com formas de chave diferentes, sem uma
  lista única. A lista existe **copiada à mão** em pelo menos cinco sítios, e
  cada prefixo novo tem de ser acrescentado a todos:
  - `api/backup/route.ts:168-241` (o que vai na cópia);
  - `limpar-pdfs-substituidos.ts:281` (`PREFIXOS_QUE_NAO_SAO_MENCAO`);
  - `indices-de-fotos.ts:17-19`;
  - `juntar-fotos-duplicadas.ts:131-132`;
  - `proposal-drafts.ts:77` / `backup-restore.ts:460` (as guardas da reposição).
- Três espaços têm forma de **tabela relacional** e estão como chave/valor:
  - `ligacao-proposta:` + `ligacao-de-proposta:` (§G4);
  - `proposal-draft:` (um por pedido; devia ter chave estrangeira para
    `quotes` e apagar-se com ele);
  - `envio-de-proposta:` e `tempo-activo:` (um por pedido, idem).
- O `value` é anulável (`app_state.value jsonb` sem `not null`), o que deixou
  nascer as lápides do G3.

### G3 — Órfãos e lápides que nunca saem

Contagens de 17/11 (consultas Q5, Q6, Q9 no §7):

| O quê | Quantos | Porquê | Prova |
|---|---:|---|---|
| `proposal-draft:` com `value` **NULL** | **103** | `clearProposalDraft` grava `null` em vez de apagar a linha | `proposal-drafts.ts:127-128`, chamado por `apagar-pedido.ts:226-227` |
| `proposal-draft:` com conteúdo, de pedido que já não existe | 23 | apagamentos anteriores a `apagar-pedido.ts` | Q6 |
| `tempo-activo:` sem pedido | 26 | `apagar-pedido.ts` não lhe toca | Q6 |
| `envio-de-proposta:` sem pedido | 3 | idem | Q6 |
| `ligacao-*` de propostas apagadas | 19 + 19 | ninguém as limpa quando a proposta sai | Q5 |
| `ligacao-proposta:` sem inverso | 3 | o inverso foi reescrito para outro código | Q5 |
| `proposta-web:retrato` substituídos | 23 de 51 (até 6 por proposta) | a impressão muda e a linha antiga fica; ninguém apaga `proposta-web:` | Q9; `grep apagarEstadoPorPrefixo` só encontra o diagnóstico |

Em bytes é pouco (~1 MB). O problema é de **forma**: cada um destes é uma
relação que o Postgres saberia manter sozinho com `on delete cascade`, e que o
código tem de lembrar-se de manter à mão — e não se lembra.

**Atenção à regra «não apagar dados de clientes sem pedido»:** as lápides
(`NULL`) e as caches (`proposta-web:`) não têm dados de ninguém e refazem-se.
Os 23 rascunhos com conteúdo e os 3 envios sem pedido **são** dados de
clientes de pedidos apagados — só saem com decisão do dono (P3).

### G4 — Os dois `ligacao-*` NÃO são duplicados: são um índice nos dois sentidos, mantido à mão

`proposta-link-curto.ts:76-88`: `ligacao-proposta:<código>` → `{propostaId,
pedidoId, criadaEm, expiraEm, revogadaEm?}`, e `ligacao-de-proposta:<proposta>`
→ `{codigo}`, para cada proposta ter um só código. São escritos em duas
chamadas separadas (`:280` e `:292`), sem transação: se a segunda falhar, ficam
desencontrados — e há 3 desencontrados hoje.

Em Postgres isto é **uma tabela** com duas chaves únicas:
`ligacoes_de_proposta(codigo pk, proposal_id uuid unique references proposals
on delete cascade, quote_id, criada_em, expira_em, revogada_em)`. O inverso
deixa de existir porque é só um índice; a transação deixa de ser precisa porque
é uma linha só; os órfãos deixam de poder nascer.

### G5 — O pedido inteiro num `jsonb` sem esquema na leitura

- `quotes` tem 7 colunas; dentro de `data` vivem **51 chaves diferentes**
  (Q8), incluindo coleções que são negócio a sério: `payments` (3 pedidos),
  `guestList` (1), `mapaDeMesas` (1), `checklist` (14), `productionPlan` (14),
  `activityLog` (37, até 19 entradas), `dayCoordination`, `timeline`.
- `id`, `status`, `name` e `email` estão **duas vezes** — na coluna e dentro de
  `data` (`quotes-store.ts:47`). Hoje batem (0 divergências, Q7), mas nada no
  Postgres o garante.
- A **escrita** está bem defendida (`validation.ts`: `quotePayloadSchema`,
  `quoteUpdateSchema` com `paymentSchema`, `guestSchema`, `mapaDeMesasSchema`…).
  A **leitura** não usa nenhum destes esquemas (G1).
- A data do evento, o tipo e a categoria — o que se filtra e ordena — só
  existem dentro do JSON. Hoje carrega-se tudo e filtra-se em memória; com 47
  pedidos não custa nada, com 2 000 custa saída do Supabase.

Isto não é, por si, errado: o Supabase e o Postgres recomendam `jsonb` para
dados com forma variável. É errado quando o JSON não tem esquema verificado e
quando lá dentro estão coisas que se consultam ou que se relacionam.

### G6 — `ProposalDoc` (o documento do estúdio) não tem esquema em lado nenhum

`proposal-doc.ts:439` define o tipo; a única validação é a do restauro
(`backup-restore.ts:213`: `z.looseObject({})` + tecto de 512 KB). O documento
tem hoje 53 chaves de topo diferentes entre as 52 propostas (Q8) — várias só
em algumas (`budgetAmounts` em 20, `fotosDasPaginas` em 24), porque o formato
foi crescendo sem número de versão. O `withProposalDefaults` normaliza na
leitura, o que ajuda, mas não substitui um esquema.

### G7 — Garantias que o Postgres podia dar e não dá

- **Chaves estrangeiras em falta** (Q3), todas com **0 órfãos** hoje — podem
  pôr-se sem limpar nada:
  - `tasks.quote_id` → `quotes` (sem FK e **sem índice**);
  - `invoices.quote_id` → `quotes`;
  - `contracts.quote_id` → `quotes` (sem índice);
  - `contracts.proposal_id` → `proposals` — **e é `text` enquanto
    `proposals.id` é `uuid`**, por isso nem pode ter FK sem mudar o tipo.
  O código já implementa à mão o que a FK faria: `apagar-pedido.ts:132-141`
  recusa apagar um pedido com contrato — isso é exatamente um
  `on delete restrict`.
- **20 `CHECK` com `NOT VALID`** (Q2, Q10): protegem as linhas novas mas nunca
  verificaram as antigas. Medido: **0 linhas** os violam — podem validar-se já.
- **`db/migracoes/20261008_b4_indices_das_chaves_estrangeiras.sql` diz «NÃO
  APLICADA»** (linha 6) e o aconselhador de desempenho do Supabase confirma os
  mesmos 5 índices em falta (`message_links.proposal_id`,
  `material_rules.{item_id, list_id}`, `material_list_items.item_id`,
  `biblioteca_foto_etiquetas.path`).
- `contracts_proposal_id_idx` é redundante com a chave única
  `contracts_proposal_id_uk` (o aconselhador marca-o como nunca usado).

### G8 — Coluna morta e totais em duas versões

- `proposals.line_items jsonb not null`: **vazia nas 52 propostas** (Q7). O
  orçamento vive em `doc.budgetRows`. O mapper continua a lê-la
  (`proposals-store.ts:63`).
- `proposals.subtotal/vat/total` repetem o que se calcula do `doc`. O ramo
  `codigo/rota-e-esquemas` já começou a derivar o dinheiro do documento
  (`3b44f606`); falta um teste que prenda as colunas ao cálculo.

### G9 — O esquema não se reconstrói a partir das migrações

`list_migrations` tem **7** migrações, a primeira de 11/10. Tudo o que existia
antes vive em `db/schema.sql` (1 257 linhas, escrito à mão, corrido no SQL
Editor). Não há forma de saber, sem comparar à mão, se o `schema.sql` bate com
a base de dados viva; e o teste dos mappers confia no ficheiro. Não verifiquei
coluna a coluna se há divergências hoje (P1 di-lo-á sozinho).

### G10 — Menores

- `listStateByPrefix` usa `like 'prefixo%'` (`app-state.ts:384`). Com a
  ordenação `en_US.UTF-8`, o Postgres não usa o índice como intervalo: percorre
  o índice inteiro e filtra (Q11, `Index Only Scan … Filter`). Com 2 000 linhas
  é instantâneo; com 200 000 não seria. `gte(prefixo)` + `lt(prefixo + '￿')`
  resolve sem migração.
- `apagar-pedido.ts:132` lê **todos** os contratos para saber se um pedido tem
  contrato. Com a FK do P5 passa a ser o Postgres a dizê-lo.
- 14 índices que o aconselhador diz nunca usados (`tasks_done_idx`,
  `invoices_status_idx`, …). Em tabelas destas, não custam nada; não mexer.

---

## 3. A nota

### Hoje: 6 / 10

| Critério (o que a Stripe, a Linear e a Vercel fazem) | Hoje | Peso |
|---|---|---|
| Segurança da base de dados (RLS, chave só no servidor, `revoke` ao `anon`) | 9 | alto |
| Integridade relacional (FK, `CHECK` validados, `NOT NULL`) | 6 | alto |
| Tipos gerados da base de dados | 2 | alto |
| Validação nas fronteiras (zod na escrita **e** na leitura dos `jsonb`) | 5 | alto |
| Modelo de dados (o que é relação é tabela; JSON só para forma variável e com esquema) | 5 | alto |
| Ciclo de vida (prazos, órfãos, caches que se apagam) | 6 | médio |
| Migrações reprodutíveis e sem deriva | 5 | médio |
| Custo (≤ 500 MB, saída) | 9 | médio |
| Testes dos dados (mappers ↔ esquema, restauro, regras) | 8 | médio |

**O que leva ao 9:** P1–P7 do plano. Tipos gerados e verificados no CI; cada
espaço do `app_state` registado num sítio, com zod e prazo; os órfãos que o
Postgres sabe impedir, impedidos por FK; os `CHECK` validados; o pedido e o
documento do estúdio lidos com esquema; as ligações numa tabela.

**O que leva ao 10:** P8–P10. Os rascunhos, envios e tempos numa tabela com FK;
as coleções do pedido que se consultam (pagamentos, convidados, histórico) fora
do JSON; o `ProposalDoc` com número de versão e migrações de forma; o esquema
reconstruído das migrações e comparado com a base viva em cada PR.

---

## 4. O plano

Cada passo é pequeno, reversível, e **invisível para a Catarina** salvo onde se
diz o contrário. Por ordem de impacto ÷ risco. Os passos com migração seguem o
padrão da casa (`docs/TUDO-REVERSIVEL.md`, regra `autonomia.md`): testada antes
numa cópia, com plano de volta escrito, dita no relatório.

Custo: nenhum passo acrescenta mais do que alguns kB à base de dados (hoje
40 MB de 500). A saída **desce** nos passos P2, P3 e P7.

### P1 — Tipos gerados da base de dados  ·  sem migração  ·  invisível

- `supabase gen types typescript --project-id …` → `src/lib/db/tipos-da-base.ts`
  (gerado, nunca editado à mão). `getSupabase()` passa a devolver
  `SupabaseClient<Database>`.
- Os mappers passam a receber `Tables<"quotes">` em vez de `Record<string,
  unknown>`: o compilador apanha logo coluna errada, tipo errado, `null` não
  tratado.
- Um script `npm run tipos:base` e um teste no CI que regenera e compara: se a
  base de dados mudar sem o ficheiro, o PR fica vermelho (fecha o G9 do lado dos
  tipos).
- **Volta:** apagar o ficheiro e o genérico. **Testes:** `tsc`, os testes dos
  mappers. **Custo:** zero (corre no build/CI, não em produção). **Decisão do
  dono:** nenhuma.

### P2 — Registo único dos espaços do `app_state`, com esquema e prazo  ·  sem migração  ·  invisível

- `src/lib/app-state/espacos.ts`: uma entrada por espaço — prefixo, forma da
  chave, **esquema zod do valor**, dono (o módulo), prazo, se vai na cópia de
  segurança, se conta como «menção» na limpeza dos PDFs.
- `lerEspaco(espaco, id)` / `gravarEspaco(espaco, id, valor)` validam com o
  esquema. Como no ramo `codigo/rota-e-esquemas`: **primeiro só regista** as
  falhas (uma semana), depois recusa.
- As cinco listas copiadas à mão (G2) passam a derivar do registo. Um teste
  varre `src/` à procura de literais `"<prefixo>:"` passados ao `getState` /
  `setState` e falha se algum não estiver registado.
- **Volta:** o registo é aditivo; desligar a validação é uma linha.
  **Testes:** um por espaço (valor bom passa, valor mau é registado/recusado);
  o teste de varrimento. **Custo:** zero. **Decisão:** nenhuma.

### P3 — Lápides e caches velhas fora; órfãos com dados, só com o dono  ·  sem migração  ·  invisível

- `clearProposalDraft` passa a **apagar a linha** em vez de gravar `null`
  (`proposal-drafts.ts:128`). Ler uma chave que não existe já devolve `null`,
  por isso ninguém nota diferença.
- Na tarefa da noite (que já corre, `api/cron/backup`): apagar as 103 lápides;
  apagar os `proposta-web:` cuja impressão já não é a atual, e os de propostas
  que já não existem (são cache, refazem-se — regra `custo.md`).
- `apagar-pedido.ts` passa a levar `tempo-activo:` (medição, não dado de
  cliente). Os `ligacao-*` de propostas apagadas saem quando a proposta sai.
- **Precisa de decisão do dono:** os **23 rascunhos com conteúdo** e os **3
  envios** de pedidos que já não existem. São dados de clientes de pedidos que
  ela apagou; a regra é não apagar sem pedido. Proposta: apagar, porque o
  pedido já foi apagado por ela; ou deixá-los, e o plano segue sem eles.
- **Volta:** antes de apagar, a noite grava o que sai num JSON na cópia de
  segurança desse dia (já existe o mecanismo). **Testes:** apagar um pedido
  não deixa nenhuma chave com o id dele (exceto contratos/faturas); a limpeza
  das caches não toca na impressão atual. **Custo:** −1,2 MB na base de dados;
  menos linhas a ler em cada `listStateByPrefix`.

### P4 — Garantias baratas no Postgres  ·  migração  ·  invisível

```sql
-- 1) Validar os 20 CHECK (medido: 0 linhas os violam)
alter table public.quotes validate constraint quotes_status_chk;
-- … um por cada um dos 20 (Q10 lista-os)

-- 2) Aplicar a b4 que está escrita e nunca correu
\i db/migracoes/20261008_b4_indices_das_chaves_estrangeiras.sql

-- 3) Índice redundante
drop index if exists public.contracts_proposal_id_idx;  -- a _uk cobre-o
```

- **Volta:** `validate` não muda dados; voltar atrás é `drop constraint` +
  `add constraint … not valid` (copiado do `schema.sql`). Os índices saem com
  `drop index`. **Testes:** a migração corre numa base vazia criada do
  `schema.sql` e na cópia de segurança da véspera. **Custo:** 5 índices em
  tabelas com dezenas de linhas — kB. **Decisão:** nenhuma.

### P5 — As chaves estrangeiras que faltam  ·  migração  ·  invisível

```sql
alter table public.tasks
  add constraint tasks_quote_id_fkey foreign key (quote_id)
  references public.quotes(id) on delete cascade not valid;   -- apagar-pedido.ts:172 já apaga as tarefas
alter table public.tasks validate constraint tasks_quote_id_fkey;
create index if not exists tasks_quote_id_idx on public.tasks (quote_id);

alter table public.contracts
  add constraint contracts_quote_id_fkey foreign key (quote_id)
  references public.quotes(id) on delete restrict not valid;  -- é o que apagar-pedido.ts:132 já faz à mão
alter table public.contracts validate constraint contracts_quote_id_fkey;
create index if not exists contracts_quote_id_idx on public.contracts (quote_id);

-- contracts.proposal_id: text → uuid (medido: 0 órfãos, 0 valores fora da forma uuid)
alter table public.contracts alter column proposal_id type uuid using proposal_id::uuid;
alter table public.contracts
  add constraint contracts_proposal_id_fkey foreign key (proposal_id)
  references public.proposals(id) on delete restrict;
```

- **`invoices.quote_id` precisa de decisão do dono.** Hoje, um pedido com
  fatura mas sem contrato **pode** ser apagado (o código só verifica
  contratos). Uma FK `restrict` mudava isso — é uma mudança de comportamento
  que ela veria (o botão «apagar» passava a recusar). Alternativa invisível:
  `on delete set null`, que é o que acontece hoje na prática (a fatura fica, o
  pedido sai). Recomendo `restrict`, pela mesma razão fiscal que já trava os
  contratos — mas a decisão é dele.
- **Volta:** `drop constraint`; o tipo volta com `using proposal_id::text`.
  **Testes:** os testes de `apagar-pedido` (com tarefa, com contrato) contra
  uma base de testes; o teste dos mappers (o `contract-types.ts` passa a
  `string` com forma de uuid). **Custo:** kB.

### P6 — Ler o pedido e o documento do estúdio com esquema  ·  sem migração  ·  invisível

- `quoteSchema` (leitura) derivado dos esquemas de escrita que já existem em
  `validation.ts`, com `.passthrough()` para não perder chaves antigas.
  `quotes-store.ts:48` passa a `parse` em vez de `as`.
- `proposalDocSchema` de verdade (em `src/lib/proposal-doc.esquema.ts`), com
  `versao` no documento e `withProposalDefaults` como a migração da versão 0
  para a 1.
- Os 69 `as ProposalDoc` (G1) passam a uma função `lerProposalDoc(x)`.
- Sempre em dois tempos: uma semana a **registar** as falhas (log), só depois a
  recusar — e, a recusar, recusa-se o documento estragado **na rota**, nunca no
  ecrã dela.
- **Testes:** o esquema aceita as 52 propostas e os 47 pedidos de produção
  (teste que corre contra a cópia de segurança, sem a copiar para o git).
  **Custo:** CPU de validar ~2–12 kB por leitura — desprezável. **Decisão:**
  nenhuma.

### P7 — As ligações curtas numa tabela  ·  migração  ·  invisível

```sql
create table public.ligacoes_de_proposta (
  codigo       text primary key,
  proposal_id  uuid not null references public.proposals(id) on delete cascade,
  quote_id     text references public.quotes(id) on delete set null,
  criada_em    timestamptz not null default now(),
  expira_em    timestamptz not null,
  revogada_em  timestamptz
);
create unique index ligacoes_de_proposta_uma_ativa
  on public.ligacoes_de_proposta (proposal_id) where revogada_em is null;
alter table public.ligacoes_de_proposta enable row level security;
```

- Em quatro tempos, cada um num PR: (1) escrever nos dois sítios; (2) copiar as
  74 existentes (as 19 de propostas apagadas não entram — a FK não deixa);
  (3) ler da tabela, com o `app_state` de reserva; (4) deixar de escrever no
  `app_state` e, 30 dias depois, apagar os dois prefixos.
- **Volta:** até ao tempo 4, basta voltar a ler do `app_state`, que continua
  completo. **Testes:** os de `proposta-link-curto*.test.ts` passam sem
  mudança; um link antigo continua a abrir (o código não muda). **Custo:**
  ~15 kB. **Decisão:** nenhuma (o casal vê o mesmo link).

### P8 — Rascunhos, envios e tempos numa tabela  ·  migração  ·  invisível

O mesmo desenho do P7 para `proposal-draft:`, `envio-de-proposta:` e
`tempo-activo:`: uma tabela cada (ou uma `rascunhos_de_proposta` com
`quote_id` FK `on delete cascade` e `doc jsonb` validado pelo esquema do P6),
com o `updated_at` como versão para o compare-and-set que o estúdio já usa
(`app-state.ts:454`, `gravarEstadoSeNaoMudou`). Atenção à Reciclagem: o pedido
apagado fica 30 dias recuperável, e o rascunho tem de voltar com ele — a FK
`cascade` só pode chegar quando a Reciclagem guardar o rascunho no seu
`retrato` (verificar em `reciclagem.ts` antes de começar).

### P9 — Tirar do JSON do pedido o que se consulta  ·  migração  ·  invisível

Por ordem: `event_date date` e `event_type text` como colunas espelhadas
(escritas pelo `toRow`, como o `status` já é), com índice; depois, só se for
preciso, `activityLog` numa tabela própria (é a única coleção que cresce
sempre). `payments`, `guestList` e `mapaDeMesas` ficam no JSON enquanto
nenhuma consulta os atravessar: com o esquema do P6, JSON é a escolha certa
para eles. Duas datas hoje estão vazias (Q12) — a coluna nasce anulável.

### P10 — Migrações reprodutíveis  ·  sem migração  ·  invisível

- Uma migração de base gerada da base viva (`pg_dump --schema-only`), que passa
  a ser o início da história; `db/schema.sql` passa a ser gerado, não escrito.
- No CI: criar uma base vazia a partir das migrações, gerar os tipos, comparar
  com `tipos-da-base.ts`. Se diferirem, há deriva.
- **Custo:** zero na Vercel e no Supabase (corre no CI, numa base local).
- **Por verificar antes:** se o CI tem Docker para o `supabase start`; sem
  isso, compara-se só o ficheiro de tipos com o da base viva (P1).

### P11 — Menores, quando se passar por lá

- `listStateByPrefix` e `apagarEstadoPorPrefixo` com `gte`/`lt` em vez de
  `like` (G10).
- `proposals.line_items`: deixar de a ler; depois `drop not null`; depois, num
  lote à parte, `drop column` (G8).
- Um teste que prenda `proposals.total` ao total calculado do `doc`.

---

## 5. O que não verifiquei

- Se o `db/schema.sql` bate coluna a coluna com a base viva (G9). Os nomes e
  tipos das 9 tabelas principais conferem com o que o código usa; não comparei
  as 30. O P1 vai dizê-lo sozinho.
- Se a Reciclagem guarda o rascunho do estúdio quando um pedido vai para lá
  (relevante para o P8; não li `reciclagem.ts` inteiro).
- A saída do Supabase atribuível a cada tabela: não há ferramenta para a ler
  daqui; a estimativa de 10/11 está no `GASTAR-POUCO-DESDE-O-INICIO.md`.
- Quantas das 56 rotas que leem um corpo JSON sem mencionar zod validam à mão
  (a contagem é por `grep`: 134 rotas, 80 leem um corpo, 56 não falam em
  `zod`/`Schema`/`safeParse`/`validation`). O ramo `codigo/rota-e-esquemas`
  trata disto.

---

## 6. Ligações

- `docs/GASTAR-POUCO-DESDE-O-INICIO.md` — o custo do Supabase.
- `ONDE-FICA-GUARDADO.md` — onde vive cada coisa, do ponto de vista dela.
- `docs/TUDO-REVERSIVEL.md` — como se faz uma mudança com volta.
- `src/lib/mapeamento-e-schema.test.ts` — o teste que prende os mappers ao esquema.
- Supabase: «Generating TypeScript Types»; «Database linter» (lints 0001 e 0008).
- PostgreSQL: `ALTER TABLE … VALIDATE CONSTRAINT`; `NOT VALID` em chaves
  estrangeiras; operadores de padrão e ordenação (`text_pattern_ops`).

---

## 7. As consultas (só leitura, só estrutura e contagens)

```sql
-- Q1 tabelas, linhas, tamanho, colunas jsonb
select c.relname, c.reltuples::bigint, pg_total_relation_size(c.oid)
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by 3 desc;

-- Q2 restrições (FK, CHECK, UNIQUE)
select conrelid::regclass, conname, pg_get_constraintdef(oid)
from pg_constraint where connamespace = 'public'::regnamespace and contype in ('f','c','u');

-- Q3 colunas *_id com e sem FK / índice  (ver o histórico do ramo)

-- Q4 app_state por prefixo
select split_part(key, ':', 1), count(*), sum(pg_column_size(value)),
       min(updated_at)::date, max(updated_at)::date
from app_state group by 1 order by 3 desc;

-- Q5 as ligações: códigos, inversos, órfãos
with f as (select substr(key,18) codigo, value->>'propostaId' pid from app_state where key like 'ligacao-proposta:%'),
     i as (select substr(key,21) pid, value->>'codigo' codigo from app_state where key like 'ligacao-de-proposta:%')
select (select count(*) from f where not exists (select 1 from i where i.codigo = f.codigo)) sem_inverso,
       (select count(*) from f where not exists (select 1 from proposals p where p.id::text = f.pid)) de_proposta_apagada;

-- Q6 órfãos por pedido
select count(*) from app_state a where key like 'tempo-activo:%'
  and not exists (select 1 from quotes q where 'tempo-activo:' || q.id = a.key);
-- (o mesmo para envio-de-proposta: e proposal-draft:, e `value is null` para as lápides)

-- Q7 coerência e coluna morta
select (select count(*) from quotes where data->>'status' is distinct from status),
       (select count(*) from proposals where jsonb_array_length(line_items) > 0);

-- Q8 chaves de topo dos jsonb (só os NOMES das chaves, nunca os valores)
select k, count(*) from quotes, jsonb_object_keys(data) k group by k;

-- Q9 a cache da proposta online por tipo
select split_part(key,':',2), count(*), count(distinct split_part(key,':',3))
from app_state where key like 'proposta-web:%' group by 1;

-- Q10 CHECK por validar e quantas linhas os violam (0 a 17/11)
select count(*) from pg_constraint where connamespace = 'public'::regnamespace and not convalidated;

-- Q11 o prefixo não usa o índice como intervalo
explain select key from app_state where key like 'proposal-draft:%' order by key;

-- Q12 datas do pedido fora do formato
select count(*) from quotes where coalesce(data->>'date','') !~ '^\d{4}-\d{2}-\d{2}';
```

Mais o aconselhador do Supabase (`get_advisors`): desempenho (5 FK sem índice,
14 índices nunca usados) e segurança (30 × «RLS sem políticas», intencional).
