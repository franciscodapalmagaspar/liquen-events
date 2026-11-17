# Estrutura do código — de onde estamos até ao nível de topo

Pedido do Francisco (17/11): «uma estrutura de código e um código a nível
mundial de topo mesmo, tanto no back-office como no site», ao ponto de um
programador de topo olhar e dizer «isto está incrível». E que sirva para os
projetos futuros. A regra que nasceu desse pedido está em
`.claude/rules/codigo.md`; este documento é o mapa: o que os melhores fazem
(Parte 1), o que o nosso código é hoje, medido (Parte 2), e o caminho por
fases, sem ela ver nada mudar (Parte 3). No fim, as lições para o primeiro dia
de um projeto novo (Parte 4).

**Nesta fase não se mudou código de produção.** As medições foram feitas a
17/11 sobre o commit `1f15511d` (`main`), com os comandos que estão na §2.9,
para se poderem repetir e comparar.

---

## Parte −1 · O estado deste documento

| O quê | Estado |
|---|---|
| Parte 1, princípios com fontes | feito (17/11) |
| Parte 2, raio-X medido | feito (17/11), commit `1f15511d` |
| Parte 3, plano por fases | fases 0 e 1 feitas (17/11, ramo `codigo/fase-0-e-1`); fase 7 e a parte estrutural da 8 feitas (17/11, ramo `codigo/admin-e-temas`); as outras por começar |
| Parte 4, lições para projetos futuros | feito; cresce com cada lição (regra de `codigo.md`) |

Cada fase que se fizer acrescenta aqui uma linha: a data, o PR, e as medidas
antes e depois (linhas, complexidade, peso das rotas).

| Fase | Data · ramo | Antes → depois |
|---|---|---|
| 0 · guardas | 17/11 · `codigo/fase-0-e-1` | teste de ouro do PDF (`lib/pdf-editorial/ouro.test.ts`, três PDFs, `sha256` preso, Linux x64); catraca do tamanho (`test/tamanho-dos-ficheiros.test.ts` + `.json`, 193 ficheiros com tecto); `madge` só de valores no CI (`scripts/ci/ciclos-de-importacao.mjs`, os 3 ciclos de hoje na lista, ~14 s no job estático); `complexity` (30) e `max-lines-per-function` (400) em aviso no ESLint (137 avisos, 0 erros). Cada guarda foi vista a falhar de propósito: uma letra a mais na capa, um ciclo para o estúdio, o `ProposalStudio` a encolher sem descer o tecto. |
| 1 · domínio do estúdio | 17/11 · `codigo/fase-0-e-1` | `ProposalStudio.tsx` 17 008 → 16 063 linhas; a função `ProposalStudio` fica igual (complexidade 279, 7 043 linhas de código — é a fase 3). Saíram para `lib/orcamento/estudio/` seis ficheiros (1 042 linhas, todos abaixo das 400). Peso das rotas igual (proposta 88 KB, painel 505 KB). Capturas do estúdio a 390/768/1440, claro e escuro: 0 píxeis diferentes. |
| 7 · `AdminClient` por secções | 17/11 · `codigo/admin-e-temas` | `AdminClient.tsx` 9 505 → 4 111 linhas (9 129 antes do merge do BO 4, que lhe juntou 376). A função `AdminClient`: complexidade 223 → 62, linhas de código 4 877 → 2 048. O `saveChanges`: complexidade 105 → abaixo de 30 (três passos puros em `lib/orcamento/pedidos/gravar-o-pedido.ts` e uma casca). O `QuoteCard`: 43 → 39. Saíram 25 ficheiros para `admin/_pedidos/` (a lista e o painel, este em `_pedidos/painel/`), 11 para `admin/_casca/` (menu, cabeçalho, barra de baixo, vistas) e 8 para `lib/orcamento/pedidos/` — todos abaixo das 400 linhas. Dois hooks de domínio: `useEdicaoDoPedido` (os onze campos do painel) e `useFiltrosDosPedidos` (os doze filtros e a lista filtrada). |
| 8 · Temas e ThemePicker (sem a fila) | 17/11 · `codigo/admin-e-temas` | `Temas.tsx` 6 464 → 4 037 linhas; `ThemeFolder` complexidade 93 → abaixo de 30, linhas de código 2 020 → 1 599; `Temas` 38 → abaixo de 30, 1 121 → 823. `ThemePicker.tsx` 3 181 → 2 556 linhas; a função 72 → 50, 1 093 → 876. Saíram 20 ficheiros para `admin/_temas/` (com `_temas/seletor/`) e 2 para `lib/temas/`. A fila das fotografias pesadas passou a UM código (`criarFilaDeImagens`) com TRÊS instâncias, cada uma com o seu tecto de 3 — exactamente como antes; juntá-las numa só espera pela aprovação dela. |

**Desvios das fases 7 e 8 ao texto:**

- **O que ficou para a fase seguinte.** O `AdminClient` ainda é o dono do
  estado partilhado e dos efeitos: abrir, gravar, apagar e arquivar pedidos, a
  revalidação, os atalhos, o histórico do navegador. Partiu-se o JSX inteiro e
  saiu o estado de dois domínios (edição e filtros); os efeitos ficaram onde
  estavam, de propósito — a ordem dos efeitos é comportamento, e mudá-la é o
  passo seguinte, com testes de caracterização próprios. O mesmo no `Temas.tsx`
  (o `ThemeFolder` continua com o carregamento, a verificação e a geração de
  miniaturas) e no `ThemePicker.tsx`: o «runtime» das importações (`runJob`, a
  pastilha, as caches de módulo que o `__resetThemePickerState` limpa) e a
  coluna dos temas, que depende dele, ficaram — partir estado de módulo sem
  mudar o que os testes limpam é uma fase própria.
- **Nomes.** Os nomes movidos ficam os de lá (`QuoteCard`, `editPrice`,
  `filterStatus`, `Photo`…), mesmo os que estão em inglês: mudar o nome no
  mesmo passo em que se muda a casa é o diff que não se revê (§3.0, regra 3).
  Os nomes NOVOS (casas, componentes que nasceram de blocos, funções puras que
  saíram de expressões soltas) são em português.
- **Duas listas que eram uma.** `STATUS_OPTIONS` (as pastilhas) e
  `ROTULO_DO_ESTADO` (o histórico) eram as mesmas seis palavras escritas duas
  vezes, presas por um comentário. Os rótulos da pastilha passam a vir de
  `ROTULO_DO_ESTADO`; um teste prende que são iguais.
- **Os testes que leem o texto.** Quarenta testes liam o TEXTO do
  `AdminClient.tsx`, do `Temas.tsx` ou do `ThemePicker.tsx`. Passaram a ler pela
  porta `admin/fonte-do-admin.testkit.ts` (`fonteDe`, `fonteDaCasa`,
  `fonteComposta`), que junta o ficheiro e as casas dele. Nenhuma asserção foi
  afrouxada; as listas de excepções que nomeavam o `AdminClient.tsx` passaram a
  nomear a casa nova, com a soma igual (`Cortes.contrato`: 4 = 3 + 1).
- **A catraca e o BO 4.** O `bo4/procura-lotes-atalhos` foi escrito antes de a
  catraca existir e fez crescer onze ficheiros acima do tecto dela. No merge, os
  tectos desses onze ficaram no tamanho com que o BO 4 os deixou (é a
  fotografia do dia, não um crescimento novo); o do `AdminClient.tsx`, o do
  `Temas.tsx` e o do `ThemePicker.tsx` desceram para o tamanho de agora.

**Desvios da fase 1 ao texto:** além do que a tabela da fase 1 nomeia, saíram
com as funções as ajudantes privadas de que elas precisam (`eventTypeLabel`,
`formatEventDate`, `buildRef`, `nomesDoCasal`, `baseDoPedidoParaOEcra`,
`normalizaCortes`, `fraseDeCorte`, `marcarLimpas` e as duas memórias fracas do
redutor, `fetchComTecto` e as constantes `GRAVACAO_*`), senão a casa nova
importaria de volta o componente. Ficaram no componente as puras que a tabela
não nomeia (`aplicarBase`, `baseDoDoc`, `dinheiroDoDocumento`,
`dataDoEnvioPorExtenso`, `move`, `idsTirados`, `ehObjecto`), para a fase
seguinte. Dois testes liam o TEXTO do componente e passaram a ler também a casa
nova (`espaco-na-proposta.test.ts`, e a varredura do preço em
`o-valor-que-ela-poe-e-o-valor-que-fica.test.ts`, agora por ficheiro); os que
importam funções continuam a importá-las do `ProposalStudio`, que as reexporta.

---

## Parte 1 · Como os melhores fazem

Doze princípios curtos. Cada um diz o que é, de onde vem e o que quer dizer aqui.

### 1.1 As pastas dizem o negócio, não a técnica

A estrutura de topo deve «gritar» o que a aplicação faz (propostas, pedidos,
temas, pagamentos), não o framework (`components/`, `hooks/`, `utils/`). É a
*Screaming Architecture* de Robert C. Martin [1]. Na prática do React, isto
traduz-se em pastas por funcionalidade: cada uma tem a sua interface, o seu
estado, os seus pedidos à rede e os seus testes. É assim no Bulletproof React
[2], no Feature-Sliced Design (camadas → fatias → segmentos `ui`, `model`,
`api`, `lib`) [3] e no Cal.com, onde a lógica de cada domínio vive em
`packages/features/<domínio>` (marcações, pagamentos, calendários) e a
aplicação web só a monta [4].

**Aqui:** `src/features/<domínio>/` (ou `src/lib/<domínio>/` + uma pasta
privada `_<domínio>/` ao lado da rota), nunca mais uma pasta plana com 255
ficheiros.

### 1.2 As dependências só descem, e uma ferramenta verifica-o

O FSD só deixa importar de camadas abaixo da sua, e cada fatia expõe uma API
pública (`index.ts`) [3]. A Shopify, com um dos maiores monólitos do mundo,
escolheu **não** o partir em serviços: manteve um «monólito modular» com
fronteiras entre componentes, e verificou-as com uma ferramenta estática
(Packwerk), porque sem ela as fronteiras não se aguentavam [5][6]. A lição é
dela: uma fronteira que nenhuma ferramenta verifica acaba por ser atravessada.

**Aqui:** `domínio puro ← estado/hooks ← interface ← rota/página`. A lógica
pura não importa React nem Supabase. Verifica-o o ESLint
(`no-restricted-imports`, que esta casa já usa para o `server-only`) e o
`madge --circular` no CI.

### 1.3 Junto o que muda junto

«Pôr o código tão perto quanto possível de onde é relevante» [7]. O Next.js
diz o mesmo à sua maneira: os ficheiros podem viver dentro da pasta da rota
sem passarem a ser rotas, e as pastas `_privadas` deixam isso explícito [8].
Junto não quer dizer *no mesmo ficheiro*: quer dizer na mesma pasta.

### 1.4 Núcleo puro, casca fina

O *Functional Core, Imperative Shell* de Gary Bernhardt [9]: as decisões
(preços, IVA, o que falta para enviar, que capítulos o PDF tem) são funções
puras, sem rede nem relógio nem `localStorage`, testáveis sem duplos. A casca
(componente, rota) só lê, chama o núcleo e escreve. A casca tem poucos
caminhos e muitas dependências; o núcleo tem muitos caminhos e nenhuma
dependência.

**Aqui:** já é a regra de `codigo.md` («cada regra de negócio vive num sítio
só, numa função pura com testes»), e já é assim em `proposal-progress.ts`,
`passos-do-estudio.ts`, `mapa-de-mesas.ts` e `paleta-cores.ts`. O problema é
que boa parte da lógica ainda não saiu dos componentes (Parte 2, §2.7).

### 1.5 Server Components por omissão, `"use client"` só nas folhas

A documentação do Next (a desta versão, em `node_modules/next/dist/docs/`)
diz: um ficheiro marcado `"use client"` leva para o browser **tudo o que
importa e tudo o que desenha**; para reduzir o JavaScript enviado, marca-se o
componente interativo, não grandes partes da interface
(`01-getting-started/05-server-and-client-components.md`, «Reducing JS bundle
size»). E o guia novo `02-guides/server-and-client-boundary.md` explica que a
fronteira decide onde o código corre e se viaja para o browser.

**Aqui:** o back office é um ecrã de cliente por natureza (é uma aplicação),
mas o que é preparação de dados (contar, ordenar, formatar) não tem de viajar
dentro do mesmo ficheiro que o desenha.

### 1.6 Uma camada de acesso aos dados, só no servidor

O guia de segurança do Next recomenda, para projetos novos, uma *Data Access
Layer*: corre só no servidor, verifica a autorização e devolve objetos
mínimos e seguros (DTO) (`02-guides/data-security.md`, «Data Access Layer»).

**Aqui:** já existe o embrião (`repository.ts`, os `*-store.ts`, e a guarda
do ESLint que impede um componente de cliente de os importar por valor). Falta
que a leitura valide a forma (1.7).

### 1.7 Analisar na fronteira, não validar por todo o lado

*Parse, don't validate*, de Alexis King [10]: na entrada (corpo de um pedido,
linha da base de dados, ficheiro, `localStorage`) transforma-se o dado cru num
tipo forte **uma vez**; daí para dentro ninguém volta a perguntar
`typeof x === "string"`. A dispersão de verificações pelo código chama-se
*shotgun parsing* e é a fonte clássica de erros de estado. O Next diz o mesmo
para as rotas: validar sempre o que vem do cliente
(`02-guides/data-security.md`, «Validating client input»). Em TypeScript a
ferramenta de referência é o zod (já instalado aqui, versão 4), e o tipo
sai do esquema (`z.infer`), nunca o contrário.

### 1.8 O estado: o do servidor não é o do cliente, e o derivado não é estado

- **Estado do servidor** (pedidos, propostas, temas) é uma *cópia* de algo
  que outra pessoa pode mudar; tem cache, revalidação e conflitos. **Estado do
  cliente** (que passo está aberto, que diálogo) é só nosso. Misturá-los no
  mesmo `useState` é a origem de metade dos erros de sincronização [11].
- **O que se calcula a partir de outro estado não é estado**: calcula-se no
  corpo do componente, e um `useEffect` que só faz `setState` de um valor
  derivado está a mais [12].
- **Quando várias variáveis mudam juntas, é um `useReducer`** (as ações dizem o
  que aconteceu; o redutor decide o estado seguinte, e é uma função pura que se
  testa sozinha) [13]. Quando há fases (a gravar, gravado, falhou, só neste
  computador), é uma **máquina de estados**, uma união discriminada de
  TypeScript, para que os estados impossíveis não se possam escrever
  («make impossible states impossible», David Khourshid, contado por Kent C.
  Dodds) [14].

### 1.9 Postgres: colunas para o que se procura, JSON para o que varia

O consenso: colunas (com tipos, `check`, chaves estrangeiras) para o que é
estável, se filtra, ordena, junta ou tem de ser garantido pela própria base;
`jsonb` para o que varia de linha para linha e se lê inteiro [15][16]. O
Postgres não guarda estatísticas dos campos dentro de um `jsonb`, por isso o
planeador adivinha quando se filtra por eles [16]. E o `jsonb` guarda
qualquer coisa, que é exatamente o problema quando se precisa de garantias.
O caminho do meio é aceite e barato: o documento fica em `jsonb`, e os poucos
campos que se procuram sobem para colunas (ou colunas geradas com índice).

### 1.10 Partir um gigante sem mudar o comportamento

1. **Primeiro os testes de caracterização** (Michael Feathers): testes que
   registam o que o código *faz hoje*, não o que devia fazer. Servem de
   detetor de mudanças [17].
2. **Depois a figueira estranguladora** (*Strangler Fig*, Martin Fowler): o
   novo cresce à volta do velho, peça a peça, e o velho vai encolhendo até
   desaparecer; nunca uma reescrita de uma vez. A razão principal que Fowler
   dá é o risco [18].
3. **Mover antes de melhorar.** Um PR move código tal e qual (o diff mostra
   linhas iguais a sair e a entrar); outro, depois, melhora-o. Nunca os dois
   no mesmo PR.

### 1.11 Limites de tamanho e complexidade

- **Ficheiro:** o ESLint traz `max-lines` com 300 por omissão [19]. A nossa
  regra (`codigo.md`) diz ~400 por ficheiro e ~250 por componente.
- **Complexidade ciclomática:** `complexity` do ESLint, 20 por omissão [20].
- **PR:** a Google considera ~100 linhas um tamanho razoável e 1000 linhas
  normalmente demasiado; um revisor pode recusar um PR só por ser grande [21].
- O que os repositórios de referência têm em comum não é um número mágico: é
  o limite **verificado por uma ferramenta**, e uma *catraca* (o que já é grande
  só pode encolher; o que é novo nasce dentro do limite).

Sobre a Linear e a Vercel: não encontrei documentação pública da estrutura
interna do código da Linear, e não invento uma. Da Vercel, o que conta é a
documentação do Next citada acima, que é a deles.

### 1.12 Comentários que explicam o porquê, junto do código

Esta casa já faz uma coisa que muitas equipas de topo não fazem: cada decisão
tem o porquê escrito, com a data e a medição. Isso é para manter. O que muda é
o sítio: o porquê viaja com a função que ele explica, quando ela sai do ficheiro
gigante (1.3).

---

## Parte 2 · Raio-X do nosso código (medido a 17/11)

### 2.0 Em números

| Medida | Valor |
|---|---|
| Ficheiros `.ts`/`.tsx` em `src/` | 1976 (920 de produção, 1056 de teste) |
| Linhas de produção | 293 178 |
| Linhas de teste (unidade) | 233 890 (rácio 0,80), mais 61 passeios Playwright em `e2e/` |
| Ficheiros de produção com mais de 400 linhas | 193 |
| Ficheiros de produção com mais de 1000 linhas | 47 |
| Ficheiros `"use client"` | 277 |
| `any` explícito em produção | 0 (o único resultado é a palavra *any* num texto em inglês, `lib/i18n/en.ts:744`) |
| `@ts-ignore` / `@ts-expect-error` | 0 |
| `strict` no `tsconfig.json` | sim (linha 7) |
| `useReducer` em todo o código | 1 (`ProposalStudio.tsx:1674`) |

**O que já está ao nível de topo, e deve ficar:** tipos sem `any`, `strict`,
nenhum ciclo de importação de valores estático (§2.5), duplicação literal
baixíssima (§2.3), muitos testes (rácio 0,8 linhas de teste por linha de
código), um PDF que dá os mesmos bytes para o mesmo documento
(`lib/pdf-editorial/determinismo.test.ts`), e uma guarda do ESLint que impede
um componente de cliente de puxar código do servidor (`eslint.config.mjs`).
O problema não é a qualidade das linhas: é **onde elas estão**.

### 2.1 Os 30 maiores ficheiros (linhas, sem testes)

| # | Linhas | Ficheiro |
|---|---:|---|
| 1 | 17 008 | `src/app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx` |
| 2 | 9 129 | `src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx` |
| 3 | 6 449 | `src/app/[lang]/(admin)/orcamento/admin/Temas.tsx` |
| 4 | 3 469 | `src/lib/proposal-doc-pdf.ts` |
| 5 | 3 181 | `src/app/[lang]/(admin)/orcamento/admin/ThemePicker.tsx` |
| 6 | 2 803 | `src/app/[lang]/(admin)/orcamento/admin/Tarefas.tsx` |
| 7 | 2 738 | `src/app/[lang]/(site)/galeria/GaleriaClient.tsx` |
| 8 | 2 658 | `src/app/[lang]/(admin)/orcamento/admin/Calendario.tsx` |
| 9 | 2 416 | `src/app/[lang]/(admin)/orcamento/admin/Overview.tsx` |
| 10 | 2 202 | `src/lib/proposta-de-pdf/campos.ts` |
| 11 | 2 102 | `src/components/EntradaEmVideo.tsx` |
| 12 | 2 065 | `src/app/api/orcamento/[id]/proposta-doc/route.ts` |
| 13 | 1 939 | `src/lib/theme-storage.ts` |
| 14 | 1 726 | `src/app/[lang]/(site)/orcamento/OrcamentoForm.tsx` |
| 15 | 1 708 | `src/lib/proposal-doc.ts` |
| 16 | 1 681 | `src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx` |
| 17 | 1 591 | `src/lib/backup-restore.ts` |
| 18 | 1 543 | `src/lib/importar-proposta/ia/verificar.ts` |
| 19 | 1 541 | `src/app/[lang]/(admin)/orcamento/admin/mesas/EditorDoMapa.tsx` |
| 20 | 1 493 | `src/app/[lang]/(privado)/proposta/[token]/Documento.tsx` |
| 21 | 1 428 | `src/app/[lang]/(admin)/orcamento/admin/EventTimeline.tsx` |
| 22 | 1 380 | `src/app/[lang]/(admin)/orcamento/admin/ServicesEditor.tsx` |
| 23 | 1 340 | `src/lib/proposal-storage.ts` |
| 24 | 1 315 | `src/app/[lang]/(admin)/orcamento/admin/ImportarProposta.tsx` |
| 25 | 1 309 | `src/app/[lang]/(admin)/orcamento/admin/PaymentsPanel.tsx` |
| 26 | 1 305 | `src/lib/pdf-editorial/montar.ts` |
| 27 | 1 281 | `src/app/[lang]/(admin)/orcamento/admin/AdminLogin.tsx` |
| 28 | 1 240 | `src/lib/proposal-geometria.ts` |
| 29 | 1 212 | `src/app/[lang]/(admin)/orcamento/admin/StatsDashboard.tsx` |
| 30 | 1 209 | `src/lib/derivadas.ts` |

Uma parte grande destas linhas são comentários (no `ProposalStudio.tsx`,
5 997 das 17 008 começam por `//`, `*` ou `{/*`). Por isso a tabela seguinte,
do ESLint, conta só **linhas de código** (sem comentários nem linhas em branco),
e é ela que mede o problema real.

### 2.2 As funções mais complexas (ESLint, `complexity` e `max-lines-per-function`)

| Função | Ficheiro:linha | Complexidade | Linhas de código |
|---|---|---:|---:|
| `ProposalStudio` | `ProposalStudio.tsx:1622` | **279** | **7 043** |
| `AdminClient` | `AdminClient.tsx:1329` | **216** | **4 613** |
| `POST_semMedida` | `api/orcamento/[id]/proposta-doc/route.ts:214` | **163** | 705 |
| `renderProposalDocPdfWithReport` | `lib/proposal-doc-pdf.ts:784` | 134 | 1 151 |
| `saveChanges` | `AdminClient.tsx:3927` | 105 | — |
| `ThemeFolder` | `Temas.tsx:3397` | 93 | 2 020 |
| `send` | `ProposalStudio.tsx:7991` | 72 | — |
| `planRestore` | `lib/backup-restore.ts:1187` | 46 | — |
| `QuoteCard` | `AdminClient.tsx:853` | 43 | — |
| `validateBackupFile` | `lib/backup-restore.ts:1008` | 43 | — |
| `Thumb` | `ProposalStudio.tsx:16071` | 42 | — |
| `Temas` | `Temas.tsx:945` | 38 | 1 112 |

O limite por omissão do ESLint é 20 [20]. O componente do estúdio está a 14×
isso, e tem 28× o tamanho de componente que a nossa regra admite (~250).

### 2.3 Componentes com mais estado e efeitos

Linhas que mencionam o hook (inclui a linha do `import`, por isso é uma
aproximação por excesso de 1):

| Componente | `useState` | `useEffect`/`useLayoutEffect` | `useRef` | `useCallback` |
|---|---:|---:|---:|---:|
| `ProposalStudio.tsx` | 90 | 50 | 54 | 26 |
| `Temas.tsx` | 69 | 20 | 20 | 21 |
| `AdminClient.tsx` | 59 | 30 | 23 | 18 |
| `GaleriaClient.tsx` (site) | 25 | 19 | 32 | 26 |
| `ThemePicker.tsx` | 24 | 16 | 13 | 4 |
| `OrcamentoForm.tsx` (site) | 26 | 9 | 15 | 2 |
| `Tarefas.tsx` | 22 | 12 | 16 | 23 |
| `EmailTemplatesBilingue.tsx` | 22 | 3 | 5 | 5 |
| `ImportarProposta.tsx` | 22 | 2 | 4 | 0 |
| `AdminLogin.tsx` | 18 | 5 | 2 | 3 |

O exemplo mais claro de estado que devia ser uma máquina de estados é a
gravação do estúdio: `gravadoEm` (`ProposalStudio.tsx:1727`), `porGravar`
(1729), `soNesteComputador` (1746), `naoDuraAoDeploy` (1755), `precoPorChegar`
(1760), `precoAGravar` (1765) e `aGravarNoServidor` (1778) são sete variáveis
para uma pergunta só: «em que estado está a gravação?». Sete booleanos e
nulos combinam-se em dezenas de estados, quase todos impossíveis (1.8).

### 2.4 Duplicação

Medido com um detetor próprio (janelas de 12 linhas de código normalizadas, sem
comentários nem `import`; o `jscpd` não se pôde descarregar, §2.10):
**208 janelas repetidas em 117 030**, cerca de 0,2 %. A duplicação literal
quase não existe. A que existe, por ordem de gravidade:

1. **A fila das fotografias pesadas está três vezes.** Existe a versão
   partilhada, `admin/fila-de-imagens.ts:128` (`pedirVezDeImagemPesada`), cujo
   cabeçalho diz que saiu para um ficheiro próprio para não haver «uma terceira
   cópia». Mas as duas cópias de onde veio continuam lá: `Temas.tsx:165` e
   `:3156`, e `ThemePicker.tsx:168` e `:196` (`HEAVY_IMAGE_CONCURRENCY = 3` e
   `pumpHeavy`). Como cada cópia tem o seu tecto, com as três vivas o separador
   pode ter 9 originais em voo, e não 3. É o defeito que a regra «cada regra
   vive num sítio só» quer evitar.
2. **Formulários rápidos dos anúncios:** `components/meta/PedidoRelampago.tsx:332`
   e `components/ads/PedidoRapido.tsx:264` (14 janelas em comum).
3. **Diálogos de temas:** `FundirTemas.tsx:134` e `ThemeCopyDialog.tsx:146` (10).
4. **O documento raiz:** `app/global-not-found.tsx:51` e `app/[lang]/layout.tsx:40` (10).
5. **Listas do evento:** `EventMaterial.tsx:401` e `EventChecklist.tsx:586` (5).
6. **Visualizador de PDF:** `proposta/[token]/PaginasNoBrowser.tsx:218` e
   `admin/VerOPdfNoEcra.tsx:174` (4).
7. **Valores suspeitos:** `admin/ValoresSuspeitos.tsx:46` e `lib/valores-inflacionados.ts:202`
   (4): uma regra de negócio com uma cópia num componente.
8. **O preço vazio de um pedido:** `api/orcamento/manual/route.ts:200` repete à mão
   o `PriceBreakdown` vazio de `lib/orcamento/pricing.ts:32`.

### 2.5 Dependências circulares (`npx madge@8.0.0 --circular`)

- **Contando os `import type`:** 12 ciclos. Nove são só de tipos (por
  exemplo `lib/orcamento/types.ts:2` ↔ `lib/orcamento/mapa-de-mesas.ts:30`, e
  `lib/proposal-doc.ts:436` ↔ `lib/orcamento/artigos-de-faturacao.ts:1`). Os
  tipos apagam-se na compilação, por isso não partem nada, mas mostram que
  `proposal-doc.ts` e `orcamento/types.ts` são «tipos de tudo» de que todos
  dependem e que dependem de todos.
- **Só valores** (`skipTypeImports`): 3 ciclos, e os três passam por um
  `import()` dinâmico, portanto não há ciclo no arranque:
  - `admin/lazy.tsx:158` → `FazerProposta.tsx:12` → `lazy.tsx`;
  - `lib/admin-auth.ts:861` → `lib/sessoes-revogadas.ts:4` → `admin-auth.ts`;
  - `lib/proposta-web/modelo.ts:253` → `retrato.ts:210` → `modelo.ts`.
- **O ficheiro com mais importações** é o `ProposalStudio.tsx` (108 módulos), depois
  o `AdminClient.tsx` (73). Os mais importados: `lib/logger.ts` (207),
  `admin/Toast.tsx` (194), `lib/admin-auth.ts` (142), `lib/proposal-doc.ts` (100).

### 2.6 `any` e `as`

- `any`: zero. É de topo.
- Asserções `as T` (sem `as const` nem `import … as`): **428** em produção. As
  que pesam são as que estão **na fronteira**, onde um `as` diz ao compilador
  «confia em mim» sobre dados que vieram de fora:
  - `lib/quotes-store.ts:48`: `fromRow: (r) => r.data as Quote`. É **a**
    leitura do registo central (o pedido, com pagamentos, convidados, Timeline
    e mapa de mesas), e não tem validação nenhuma;
  - `lib/repository.ts:512` e `:572` (`as unknown as Record<string, unknown>`);
  - **44** `await r.json() as …` / `JSON.parse(…) as …`, por exemplo
    `admin/PerguntaDeDesfecho.tsx:157` (`as Quote`),
    `admin/EmailTemplatesBilingue.tsx:277`, `:318` e `:490`,
    `site/orcamento/OrcamentoForm.tsx:390`, `api/admin/passkeys/confirmar/route.ts:42`;
  - `api/orcamento/[id]/proposta-doc/route.ts:422`: `semOrigens as ProposalDoc`.
- `as unknown as`: 41, com 6 no `ProposalStudio.tsx` e 4 no `lib/backup-restore.ts`.
- **Validação na fronteira:** das **79 rotas que leem o corpo** (`req.json()`/`formData()`),
  **61 não usam esquema** e verificam campo a campo com `typeof`, por exemplo
  `proposta-doc/route.ts:306`, `:505` e `:1784`. O zod está em 16 ficheiros.
- O tipo central do estúdio é tirado do parâmetro de uma função:
  `type StudioDoc = Parameters<typeof withProposalDefaults>[0]`
  (`ProposalStudio.tsx:313`). Funciona, mas a forma do documento devia ter um
  nome e um esquema, e as funções seguirem-na, não o contrário.

### 2.7 Onde a lógica de negócio está misturada com a interface

1. **`ProposalStudio.tsx:851–1622`**: 770 linhas de lógica pura e de rede
   exportadas de um ficheiro de interface: `temasLevadosPelasLinhas` (851),
   `semOTema` (907), `semAsFotosNasPaginas` (945), `cortesDoCabecalho` (1041),
   `avisoDeConteudoIncompleto` (1083), `textoDaGravacao` (1136),
   `contagemDePrecos` (1189), `modoDoAdicional` (1234), `textoDoTotal` (1274),
   `textoDoAdicional` (1291), `gravarRascunhoNoServidor` (1429),
   `mandarPrecoAoPedido` (1543). E, antes, `initialDoc` (501), `seedDefaults`
   (724), `mapImagePaths` (956) e o redutor `escreverODocumento` (882). Os
   testes já as importam do componente (`preco-chega-ao-pedido.test.ts`,
   `gravar-rascunho.razao.test.ts`): é a prova de que são domínio.
2. **`ProposalStudio.tsx:1622–8986`**: dentro do componente, 7 300 linhas de
   hooks e funções antes do `return` (8986): 40 `useEffect`, cerca de 38 funções de
   ação, **20 `fetch`** diretos (de 2115 a 8666: rascunho, assets, versões,
   preferências, modelos, envio), e 40 acessos a `localStorage`.
   `send` (7991) tem complexidade 72.
3. **`ProposalStudio.tsx:4937`**: o cálculo do preço unitário
   (`Math.round(base * 100) / 100`) está dentro do componente.
4. **`AdminClient.tsx:3927`**: `saveChanges`, complexidade 105, a gravar o pedido
   a partir do ecrã; `AdminClient.tsx:620` (`COLUNAS_DE_PEDIDOS`, 233 linhas) e
   `:410` (`detailNextAction`, 140 linhas) são regras de negócio no ficheiro do ecrã.
5. **`api/orcamento/[id]/proposta-doc/route.ts:214–2063`**: o POST inteiro
   (pré-visualização, gravação, envio, email, trinco, chave do que foi visto,
   validade) numa função de 1 850 linhas físicas e complexidade 163.
6. **`admin/ValoresSuspeitos.tsx:46`** repete parte de `lib/valores-inflacionados.ts:202` (§2.4).

### 2.8 As pastas

- `src/lib/` tem **255 ficheiros de produção soltos na raiz** (549 com os testes):
  `proposal-doc.ts`, `proposal-budget.ts`, `proposal-ordem.ts`,
  `proposal-moodboard.ts`, `proposta-escolhas.ts`… são um domínio
  (a proposta) espalhado por nomes com prefixos, em vez de uma pasta.
- `src/app/[lang]/(admin)/orcamento/admin/` tem **143 componentes `.tsx`** e mais
  de 560 ficheiros numa pasta só. As subpastas são 5 (`carregamento`, `evento`,
  `mesas`, `recuperar`, `ui`).
- O back office é uma única rota (`orcamento/admin/page.tsx`) com as secções
  pelo `?v=` e carregadas por `lazy.tsx` (21 importações dinâmicas). Isso é uma
  decisão defensável (é o que mantém o cookie da última secção, AGENTS.md), mas
  quer dizer que a estrutura de pastas não pode vir da rota e tem de vir do domínio.
- Há exemplos bons a seguir: `lib/pdf-editorial/` (27 ficheiros, o maior com
  1 305 linhas), `lib/orcamento/`, `lib/arquivo-de-pdfs/`, `lib/proposta-web/`.

### 2.9 Testes por área

| Área | Ficheiros prod | Linhas prod | Ficheiros teste | Linhas teste | Rácio |
|---|---:|---:|---:|---:|---:|
| back office (componentes) | 253 | 126 386 | 415 | 96 220 | 0,76 |
| `lib/` (raiz) | 255 | 68 647 | 295 | 64 557 | 0,94 |
| rotas API | 131 | 20 825 | 105 | 25 858 | 1,24 |
| `lib/orcamento` | 50 | 13 872 | 52 | 10 945 | 0,79 |
| site público | 40 | 13 620 | 33 | 4 982 | **0,37** |
| `components` | 56 | 11 361 | 36 | 7 605 | 0,67 |
| `lib/importar-proposta` | 25 | 7 699 | 14 | 3 580 | 0,46 |
| `lib/pdf-editorial` | 27 | 6 882 | 20 | 2 921 | **0,42** |
| proposta online | 14 | 6 758 | 24 | 6 065 | 0,90 |
| `lib/proposta-de-pdf` | 6 | 4 055 | 5 | 2 001 | 0,49 |
| `lib/i18n` | 4 | 1 842 | 7 | 472 | **0,26** |

O estúdio tem uma rede de caracterização **que já existe e é grande**:
`ProposalStudio.casos.test.tsx`, 11 188 linhas, **369 casos**, repartido pelos
ficheiros `parte-1` a `parte-6` para o CI. E há 6 passeios Playwright das
propostas (`e2e/proposta*.spec.ts`, `fazer-proposta-cliente.spec.ts`). É
esta rede que torna a Parte 3 possível sem medo. As áreas mais frágeis são o
site público e o motor do PDF, em proporção.

### 2.10 O modelo de dados (`db/schema.sql`, 1 257 linhas, e 8 migrações em `db/migracoes/`)

O que está bem, pelos critérios da §1.9:

- `check` nos estados (`schema.sql:250`, `:868`, `:873`), nos montantes
  (`:878`, `total >= 0`) e no idioma (`:218`);
- índices nas chaves estrangeiras (migração `20261008_b4`), RLS ativa (30
  `enable row level security`), revogação do `anon`/`authenticated` (`b1`);
- tabelas normalizadas onde há relações a sério: `material_*`,
  `biblioteca_fotos` + `biblioteca_etiquetas` + `biblioteca_foto_etiquetas`
  (muitos-para-muitos com tabela de ligação, `:952–1032`), `invoices` +
  `invoice_counters`, `registo_de_acoes`.

O que fica abaixo do nível de topo:

1. **O pedido é um documento sem esquema.** `quotes` (`schema.sql:12`) tem 6
   colunas e um `data jsonb not null`. Dentro desse JSON vive quase tudo o que o
   back office gere: pagamentos, convidados, Timeline, mapa de mesas, mensagens,
   Checklist, plano de produção, fornecedores do evento (`lib/orcamento/types.ts:487`
   e seguintes, 74 campos, quase todos opcionais). É lido com `as Quote`
   (`quotes-store.ts:48`) sem validação. Pela §1.9 isto é aceitável para o
   que se lê inteiro (a Timeline, o mapa), mas **os pagamentos** são dinheiro, se
   somam e se comparam ao cêntimo (`.claude/rules/dinheiro.md`), e um `jsonb`
   não garante nada sobre eles.
2. **`app_state` é um armazém chave-valor genérico** (`schema.sql:358`, `key`,
   `value jsonb`) que guarda coisas de naturezas muito diferentes: rascunhos de
   propostas (`proposal-draft:`, `lib/proposal-drafts.ts:60`), envios
   (`envio-de-proposta:`, `lib/envios-de-proposta.ts:52`), tempo ativo,
   modelos, preferências, a paleta, a última cópia de segurança, estados das
   limpezas. O próprio esquema avisa que a tabela tem «duas naturezas»
   (comentário antes de `:358`). Funciona, mas o tipo de cada valor só existe
   no código que o lê.
3. **Dinheiro em `numeric` de euros, e em `number` no TypeScript.**
   `proposals.subtotal/vat/total` (`schema.sql:37–39`) e `invoices.amount`
   (`:437`) são `numeric` em euros; no código são `number` com `round2`
   (`lib/money.ts:37`). O `numeric` do Postgres é exato, por isso a base está
   bem; o risco está no lado do JavaScript, onde `0,1 + 0,2 ≠ 0,3`. A regra da casa
   já manda comparar em cêntimos inteiros; falta o **tipo** que o obrigue.
4. **`proposals` (`:26`) quase não se usa como fonte**: a proposta a sério vive
   no rascunho do `app_state` e nos ficheiros do armazenamento. Duas casas para
   a mesma coisa pedem uma decisão escrita sobre qual manda.

**Não proponho migrar a base agora.** O plano gratuito do Supabase (500 MB) e
a regra de custo pedem que qualquer tabela nova diga quanto ocupa; e o ganho
grande e sem risco está no código (validar o que se lê) e não no esquema. A
fase 9 da Parte 3 diz como chegar lá.

### 2.11 Como se repetem estas medições, e o que não consegui medir

Comandos (a partir da raiz do repositório):

```bash
# tamanhos
find src \( -name '*.ts' -o -name '*.tsx' \) | grep -vE '\.test\.' | xargs wc -l | sort -rn | head -31
# complexidade e tamanho de funções (o ESLint que já está instalado)
npx eslint --no-warn-ignored -f json \
  --rule '{"complexity":["warn",30],"max-lines-per-function":["warn",{"max":400,"skipComments":true,"skipBlankLines":true}]}' \
  <ficheiros>
# ciclos (com um .madgerc temporário {"detectiveOptions":{"ts":{"skipTypeImports":true},"tsx":{"skipTypeImports":true}}} para os de valores)
npx madge@8.0.0 --circular --extensions ts,tsx --ts-config tsconfig.json src
```

**Não consegui medir:**

- **O `graphify`**: o `CLAUDE.md` manda consultá-lo antes de ler código, mas
  não está instalado neste ambiente (nem o comando nem o módulo Python). As
  medições foram feitas com leitura direta.
- **Duplicação com o `jscpd`**: o descarregamento do pacote foi recusado pelo
  ambiente. Usei um detetor próprio (janelas de 12 linhas); deteta cópias
  literais, não cópias com nomes trocados. A duplicação **semântica** (a mesma
  regra escrita de duas maneiras) só se encontra a ler, e a §2.4 só tem a que vi.
- **O tamanho real das linhas na base** (quantos KB tem um `quotes.data` típico,
  quanto ocupa o `app_state`): não toquei na base de produção de propósito.
- **A cobertura de testes** (`vitest --coverage`): a suite tem ~11 000 testes e
  não a corri nesta fase; o rácio de linhas da §2.9 é uma aproximação, não cobertura.
- **O peso de cada rota no browser**: existe `scripts/peso-das-rotas.mjs` no
  CI, mas precisa de um `next build`, que não corri. É a medida a tirar antes da
  fase 1.

---

## Parte 3 · O plano por fases

### 3.0 As regras de todas as fases

1. **Ela não vê nada mudar.** Nenhuma fase muda um texto, uma cor, um espaço, uma
   ordem, um comportamento. Uma fase que precise de mudar um comportamento
   (há uma, a 8) di-lo no título e espera pelo sim.
2. **Caracterização antes de mexer** (1.10). Cada fase começa por um PR, ou por
   commits à frente no mesmo PR, que só acrescenta testes do que existe; esses
   testes passam *antes* e *depois* da mudança.
3. **Mover antes de melhorar.** Um PR move código tal e qual (`git diff
   --color-moved` mostra-o como movido). Melhorar (tipos, nomes, redutor) é
   outro PR.
4. **O PDF não muda nem um byte.** O desenho do PDF é dela e não se mexe sem a
   aprovação dela (`CLAUDE.md`, `docs/PDF-DESIGN-NOVO.md`). Como o PDF é
   determinístico (`lib/pdf-editorial/determinismo.test.ts`), a prova é um
   **teste de ouro**: três documentos de exemplo (com fotografias fabricadas,
   nunca de clientes), e o `sha256` de cada PDF preso no teste. Se uma fase
   mudar um byte, o teste fica vermelho e a fase não entra.
5. **O sistema de design não se toca.** Partir componentes não cria classes,
   tokens nem valores novos (`docs/DESIGN-SYSTEM.md`). Uma classe muda de
   ficheiro, não de valor.
6. **Custo zero.** Nenhuma fase acrescenta uma rota, um polling, uma tarefa
   agendada, uma tabela, nem um serviço. As três perguntas da regra 7 respondem-se
   no PR com «nenhuma vez a mais / nenhum processador a mais / não se aplica».
   O que corre a mais é no CI do GitHub (as guardas da fase 0), que não conta
   para a Vercel nem para o Supabase. **E o peso das rotas** (`scripts/peso-das-rotas.mjs`)
   mede-se antes e depois: partir ficheiros não pode engordar o que o browser descarrega.
7. **Lotes.** Cada fase é um PR pequeno (alvo: < 1 000 linhas de diff, e de
   preferência só linhas movidas) que entra num `lote/AAAA-MM-DD`, nunca direto
   no `main`. Não há urgência nenhuma aqui: estas fases nunca passam à frente.
8. **A prova é sempre a mesma lista**, e vai no PR:
   - `npm run typecheck`, `npm run lint` e `npm test` verdes (os 369 casos do
     estúdio incluídos);
   - `npm run test:e2e:propostas` (e o passeio da área mexida) verde;
   - o teste de ouro do PDF verde;
   - o peso das rotas igual (±1 %);
   - capturas Playwright a 390/768/1440 px, claro e escuro, do ecrã mexido,
     comparadas antes e depois **localmente** (não se guardam no repositório: o
     estúdio mostra fotografias de clientes);
   - revisão independente e segunda passagem (`.claude/rules/zero-erros.md`);
   - e a medição desta Parte 2 refeita para o ficheiro mexido (linhas e
     complexidade antes e depois), registada na Parte −1.

### Fase 0 · As guardas (antes de partir o que quer que seja)

**O que muda:** nada no produto. Entram:
- o **teste de ouro do PDF** (regra 4 acima);
- uma **catraca de tamanho**: um teste que lê os ficheiros de `src/` e falha se
  um ficheiro novo passar das 400 linhas, ou se um dos que já passam crescer
  acima do tamanho que tem hoje (a lista fica num ficheiro com o número de hoje
  de cada um; só pode descer);
- o ESLint com `complexity` e `max-lines-per-function` em **aviso**, para se ver;
- o `madge --circular` (só valores) no CI, a falhar com um ciclo novo.

**Risco:** mínimo. O único é a catraca ficar vermelha por um ficheiro que cresceu
de boa-fé noutro PR; a resposta é parti-lo, não subir o número.

**Prova:** as guardas falham de propósito num ramo de ensaio (um ficheiro de
401 linhas, um ciclo, um byte mudado no PDF) e passam no `main`.

### Fase 1 · O domínio do estúdio sai do componente (o maior ganho, o menor risco)

**O que muda:** as 770 linhas de lógica pura de `ProposalStudio.tsx:851–1622`,
mais `initialDoc` (501), `seedDefaults` (724), `mapImagePaths` (956) e o
redutor `escreverODocumento` (882), saem **tal e qual** para ficheiros de
domínio, por assunto:

| Ficheiro novo | O que leva |
|---|---|
| `lib/orcamento/estudio/documento-inicial.ts` | `initialDoc`, `seedDefaults`, `mapImagePaths`, o tipo `StudioDoc` com nome próprio |
| `lib/orcamento/estudio/escrever-o-documento.ts` | o redutor `escreverODocumento` |
| `lib/orcamento/estudio/temas-e-fotos.ts` | `temasLevadosPelasLinhas`, `semOTema`, `semAsFotosNasPaginas` |
| `lib/orcamento/estudio/textos-do-estudio.ts` | `cortesDoCabecalho`, `avisoDeConteudoIncompleto`, `textoDaGravacao`, `textoDoTotal` |
| `lib/orcamento/estudio/precos-e-iva.ts` | `contagemDePrecos`, `modoDoAdicional`, `textoDoAdicional`, `ModoDeIvaDoAdicional` |
| `lib/orcamento/estudio/gravar.ts` | `gravarRascunhoNoServidor`, `mandarPrecoAoPedido`, e os tipos dos resultados |

O `ProposalStudio.tsx` passa a importá-las e **reexporta-as** (`export { … }
from …`), para que nenhum teste nem nenhum ficheiro que as importe hoje mude
(é a figueira estranguladora: a porta antiga continua aberta enquanto houver
quem passe por ela). Num segundo PR, os testes passam a importar da casa nova
e as reexportações saem.

A pasta é `lib/orcamento/estudio/` e não `features/` para já: segue a casa
(`lib/orcamento/` já tem `passos-do-estudio.ts`) e não obriga a uma decisão de
pastas antes de tempo (fase 10).

**Risco:** baixo. São funções puras, já testadas, movidas sem mudar uma
linha. O único risco real é um ciclo de importação novo (uma função movida que
importava algo do próprio componente); o `madge` da fase 0 apanha-o.

**Prova:** a lista da §3.0, ponto 8. O diff tem de ser só linhas movidas, mais
as importações. O `ProposalStudio.tsx` desce de 17 008 para cerca de 16 000
linhas, e as funções passam a ter um teste por ficheiro na casa nova.

### Fase 2 · Os componentes pequenos do estúdio saem para ficheiros próprios

**O que muda:** as 2 665 linhas de componentes que já estão separados *dentro*
do ficheiro (`ProposalStudio.tsx:14343–17008`) passam a ficheiros seus numa
pasta `admin/estudio/`: `Thumb` (16071, 568 linhas), `AccoesDaFoto` (14819),
`Section` (15134), `PreviewSummary` (15786), `UploadArea` (16639),
`DescricaoQueCresce` (14565), `CopiarResumo` (15461), `PreviewThumb` (15592),
`StepNav` (15339), `FotosDoBoard` (14725), `AvisoDeOrdem` (15048),
`BarraDaSeleccao` (14487), `ResumoDasLinhas` (14343), `LinhaDeTotal` (14398),
`useSrcSemPiscar` (15945), `CustoDaGeracao` (15733), `MargemDoNegocio` (15692),
`AvisoDasTraducoes` (16873).

**Risco:** baixo. Já recebem tudo por props. O cuidado: um `memo` (o
`FotosDoBoard`) e o `Thumb` (complexidade 42) têm de sair com as mesmas
dependências e a mesma identidade, ou o React volta a montar células da
grelha das fotografias (que se veria como um piscar).

**Prova:** §3.0 ponto 8, com atenção às capturas da grelha de fotografias no
telemóvel, e a um toque longo e um arrastar a sério (`npm run test:e2e:toque`).

### Fase 3 · O estado do estúdio passa a hooks por domínio, e a gravação a uma máquina de estados

**O que muda**, em PRs separados, um por domínio:

1. **`useGravacaoDoEstudio`**: as sete variáveis da gravação (§2.3) mais o
   rascunho no `localStorage` (`DRAFT_KEY`, `:1632`) e a gravação no servidor.
   Primeiro PR: o hook move o estado tal e qual. Segundo PR: as sete variáveis
   passam a uma união discriminada (`{ fase: "gravado", em } | { fase: "a-gravar" }
   | { fase: "so-neste-computador", porque } | …`) com um `useReducer`, e um
   teste de tabela que percorre todas as transições.
2. **`useEnvioDaProposta`**: o canal (`CANAL_GUARDADO`, `:2245`), a
   pré-visualização, a chave do que foi visto e o `send` (`:7991`,
   complexidade 72), que se parte em passos puros (que falta, para onde, com que
   corpo) e uma casca com o `fetch`.
3. **`useVersoesDaProposta`**: o que está à volta de `:8320–8440`.
4. **`useFotosDoEstudio`**: carregamentos, fotos repetidas (`:6078`), cópia
   (`:6425`).
5. Os 20 `fetch` passam a funções com nome num `lib/orcamento/estudio/api.ts`
   (uma por rota), com a resposta validada por zod (1.7). O componente deixa de
   saber endereços.

**Risco:** médio. É aqui que se mexe na ordem dos efeitos, e a ordem dos efeitos
é comportamento (por exemplo, um efeito que grava antes de outro ler). Por isso
o primeiro PR de cada hook **move**, mantendo a ordem dos `useEffect` dentro do
hook igual à ordem que tinham no componente, e só o segundo melhora.

**Prova:** §3.0 ponto 8, mais os casos feios da `zero-erros.md` *a correr no
browser*: rede que não responde durante a gravação, recarregar a meio, dois
separadores, duplo clique no enviar. São exatamente as situações que o estado da
gravação decide.

### Fase 4 · O ecrã parte-se pelos cinco passos

**O que muda:** o JSX de `ProposalStudio.tsx:8986–14343` reparte-se pelos
passos que já têm marcos no código e regras em `passos-do-estudio.ts`:

| Componente novo | De onde sai |
|---|---|
| `PassoEvento.tsx` | `Section` «Evento» (`:9616`) e «Fotografia da capa» (`:9871`) |
| `PassoServicos.tsx` | «Serviços» (`:10049`) |
| `PassoInspiracao.tsx` | «Mood boards» (`:10074`) e «Cronograma de Organização» (`:10871`) |
| `PassoOrcamento.tsx` | «Orçamento Proposto» (`:10957`), «Total e validade» (`:11872`), o bloco de totais (`:12194`) |
| `PassoRever.tsx` | «Está pronta?» (`:12537`), o resumo (`:12699`), «Enviar ao cliente» (`:12728`), «Por onde segue» (`:12907`) |
| `BarraDoEstudio.tsx` | a barra de baixo, do estado à ação (`:13111–14343`) |

O que não muda, de propósito: **os cinco passos continuam a ser um
formulário só, sempre montado** (`CLAUDE.md`, e `escondida={step !== …}` em cada
`Section`). Partir o JSX não pode passar a desmontar um passo escondido: perder-se-ia
o que ela escreveu e o foco. E **fica a barra de baixo** (Parte −1 do
`docs/FAZER-PROPOSTA.md`).

Os passos recebem o documento e as ações por um contexto do estúdio
(`EstudioContexto`), com os valores memorizados, para não passar 40 props por cada
um nem voltar a desenhar os cinco passos a cada tecla.

**Risco:** médio. O risco é de desempenho (um contexto mal feito faz tudo
redesenhar a cada tecla) e de foco/scroll ao mudar de passo.

**Prova:** §3.0 ponto 8, mais a medição de fluidez que a casa já tem
(`npm run measure:fluidity`) antes e depois, e escrever um parágrafo comprido
numa descrição no telemóvel (a tecla não pode atrasar).

**No fim da fase 4**, o `ProposalStudio.tsx` é uma casca de algumas centenas de
linhas que liga hooks e passos, dentro do limite de `codigo.md`.

### Fase 5 · A rota da proposta (`proposta-doc`) parte-se por etapas

**O que muda:** `POST_semMedida` (`route.ts:214`, complexidade 163) passa a um
orquestrador curto que chama etapas com nome, cada uma num ficheiro de
`lib/orcamento/envio/`: ler e validar o corpo (um esquema zod do corpo, com os
mesmos campos opcionais e as mesmas tolerâncias de hoje: «uma proposta que não
segue é um negócio parado», `route.ts:303`), o trinco do envio (`:286`), a
chave do que foi visto (`:410`), a validade (`:430`), gerar o PDF, mandar o
email, registar. O `comCpu` continua por fora (`route.ts:2064`).

**Risco:** médio-alto, porque é o envio ao casal. Por isso vem depois do
estúdio, com a fase 0 a guardar o PDF.

**Prova:** §3.0 ponto 8, os testes da rota que já existem, e um teste novo
por cada recusa que a rota faz hoje (409 do trinco, chave do PDF que não bate,
o que falta para enviar), escrito *antes*. O esquema zod do corpo entra
primeiro em **modo de observar**: aceita tudo o que hoje se aceita e regista
(`log`) o que não bateria; só passa a recusar depois de uma semana sem registos.

### Fase 6 · A fronteira dos dados passa a ter esquema

**O que muda:**
1. um esquema zod do `Quote` e do `ProposalDoc` (o tipo sai do esquema). A
   leitura em `quotes-store.ts:48` passa a `safeParse`, em **modo de observar**
   (devolve os dados como hoje, regista o que não bate), porque há pedidos
   antigos com formas antigas que não se podem partir;
2. as 44 leituras `json() as` / `JSON.parse() as` (§2.6) passam a esquemas,
   começando pelo `localStorage` (que é o sítio onde dados velhos de outra versão
   aparecem de certeza);
3. as 61 rotas sem esquema, por ordem de risco (as que escrevem primeiro).

**Risco:** baixo enquanto em modo de observar; médio quando passa a recusar.

**Prova:** testes com os pedidos reais em forma (anonimizados, sem nomes nem
contactos) e com formas antigas, que têm de continuar a abrir. Nenhum dado é
reescrito na base.

### Fase 7 · O `AdminClient` parte-se por secções

**O que muda:** o `AdminClient` (`:1329`, complexidade 216, 4 613 linhas de
código) já carrega as secções com `lazy.tsx`; o que fica nele é a lista de
pedidos, o detalhe e o estado partilhado. Saem: `QuoteCard` (`:853`, 405
linhas), `COLUNAS_DE_PEDIDOS` (`:620`) e `detailNextAction` (`:410`) para
domínio puro em `lib/orcamento/pedidos/`, `saveChanges` (`:3927`,
complexidade 105) para um hook com as etapas puras à parte, e o estado de cada
secção para junto dela. A mesma ordem: caracterizar, mover, melhorar.

**Risco:** médio. O cuidado especial é o cookie da última secção
(`liquen-admin-view`): a tabela do `AGENTS.md` diz que no `next dev` ele se
reescreve para `overview`. As provas dessa parte fazem-se com `next start`.

**Prova:** §3.0 ponto 8, e os passeios da Visão Geral e dos pedidos.

### Fase 8 · Temas e ThemePicker (com a única mudança de comportamento do plano)

**O que muda:**
1. `ThemeFolder` (`Temas.tsx:3397`, complexidade 93, 2 020 linhas de código) e
   `Temas` (`:945`) partem-se como o estúdio: domínio, hooks, componentes.
2. **As duas cópias da fila das fotografias pesadas** (`Temas.tsx:165/3156`,
   `ThemePicker.tsx:168/196`) passam a usar `fila-de-imagens.ts`. **Isto muda
   um comportamento**: hoje cada cópia tem o seu tecto de 3, e com a fila
   partilhada o separador inteiro passa a ter 3 no total. O cabeçalho da
   `fila-de-imagens.ts` diz que é isso que se quer, e a medição dele mostra que
   o visível chega antes. Mas, por ser uma mudança, vai num PR só dela, com a
   medição antes e depois num telemóvel com rede lenta, e espera pelo sim.

**Risco:** médio (é a Biblioteca de Temas, com milhares de fotografias).

**Prova:** §3.0 ponto 8, e a medição da primeira foto visível a 1,6 Mbps (o
número que o cabeçalho da fila usa).

### Fase 9 · O dinheiro com tipo, e as decisões sobre a base

**O que muda:**
1. um tipo `Centimos` (um `number` com marca, só criado por `paraCentimos()`)
   para as somas e comparações de pagamentos, para que «tudo pago» só possa
   comparar cêntimos inteiros (`.claude/rules/dinheiro.md`). Entra primeiro nas
   funções de `lib/money.ts`, sem mudar um resultado (testes de propriedade com
   milhares de montantes ao acaso, a comparar o antes e o depois);
2. **uma decisão escrita, não uma migração**: que dados saem do `quotes.data`
   para colunas ou tabelas, se algum sair (os pagamentos são o candidato), e qual
   das duas casas da proposta manda (`proposals` ou o rascunho do `app_state`).
   Uma migração só se fizer com a medição do que ocupa (regra do Supabase no
   `CLAUDE.md`) e o sim dele.

**Risco:** baixo no ponto 1; o ponto 2 é só papel.

### Fase 10 · As pastas por domínio

**O que muda:** quando as fases 1 a 8 tiverem dado forma aos domínios, os
ficheiros mudam de casa com `git mv` (o histórico segue) e as importações
reescrevem-se de forma automática:
- `src/lib/` raiz → `lib/propostas/`, `lib/pedidos/`, `lib/temas/`,
  `lib/pagamentos/`, `lib/armazenamento/`, `lib/contas/`…;
- `admin/` → uma pasta privada por secção (`admin/_estudio/`, `admin/_temas/`,
  `admin/_pedidos/`…), que o Next garante que não viram rotas (1.3);
- e a regra das setas (1.2) no ESLint: a lógica pura não importa React nem
  Supabase, e uma secção não importa o interior de outra, só o `index.ts` dela.

**Risco:** baixo no comportamento (o compilador prova as importações), alto em
conflitos com trabalho em curso. Por isso faz-se **uma pasta de cada vez**,
num dia sem outros PRs nessa área.

**Prova:** typecheck e build verdes, o diff só com renomeações, e o peso das rotas igual.

### Depois: o resto da lista

Com o método provado no estúdio, o mesmo percorre a lista da §2.1 por ordem de
complexidade: `Tarefas.tsx`, `Calendario.tsx`, `Overview.tsx`, `GaleriaClient.tsx`
(site), `EntradaEmVideo.tsx`, `OrcamentoForm.tsx` (site), `backup-restore.ts`
(`planRestore` e `validateBackupFile`). O `proposal-doc-pdf.ts` (o gerador
antigo, `renderProposalDocPdfWithReport`, complexidade 134) **não** se parte:
ainda o importam `pdf-editorial/montar.ts`, `pdf-editorial/moldura.ts`,
`proposal-preview-cache.ts` e `proposal-doc-render.ts`, portanto primeiro tiram-se
de lá as peças que o PDF novo usa (com o teste de ouro a guardar), e depois o
resto apaga-se no PR à parte que o `CLAUDE.md` já prevê.

---

## Parte 4 · Lições para projetos futuros

Para copiar para o primeiro dia de um projeto novo, ao lado do
`docs/GASTAR-POUCO-DESDE-O-INICIO.md`. Cada lição vem de um erro ou de um
acerto medido aqui.

### No primeiro dia

1. **Guardas antes de código.** O ESLint com `max-lines: 400`,
   `complexity: 20` e `max-lines-per-function` em **erro** desde o primeiro
   commit; `strict` e `noUncheckedIndexedAccess` no TypeScript; `madge
   --circular` no CI. Um limite que nasce com o projeto não custa nada; um
   limite posto depois de um ficheiro ter 17 000 linhas custa meses.
   *(Aqui: o ProposalStudio cresceu porque nada o parou.)*
2. **Pastas por domínio desde o início:** `features/<domínio>/{dominio,estado,ui,api}`
   e um `index.ts` por domínio como única porta. Nunca uma pasta plana para «tudo
   o que é do back office».
3. **O esquema primeiro, o tipo depois.** Cada dado que entra (rota, base,
   ficheiro, `localStorage`, resposta de `fetch`) tem um esquema zod, e o tipo
   TypeScript sai dele. Nenhum `as` numa fronteira.
   *(Aqui: `quotes-store.ts:48`, `r.data as Quote`.)*
4. **Dinheiro em cêntimos inteiros, com tipo próprio**, desde a primeira linha.
5. **A base de dados: colunas para o que se procura e se garante, `jsonb` para o
   que varia e se lê inteiro.** Um armazém chave-valor genérico só para
   preferências, nunca para dados do negócio.
6. **Uma função pura para cada regra de negócio, com teste, antes do ecrã que a
   usa.** O ecrã, o PDF e a rota leem a mesma. *(Aqui: `proposal-progress.ts`
   com `oQueFaltaParaEnviar` é o exemplo certo; a fila de imagens em três cópias
   é o errado.)*
7. **Estado:** o que vem do servidor é cache, não `useState`; o que se calcula
   não se guarda; o que muda junto é um `useReducer`; o que tem fases é uma
   união discriminada.
8. **Um componente faz uma coisa.** Se para o descrever se usa «e», parte-se.
   Um ecrã com passos tem um componente por passo desde o primeiro passo.
9. **Rotas finas:** a rota lê, valida, chama o domínio, responde. A orquestração
   vive em funções com nome, testáveis sem servidor.

### Ao crescer

10. **Catraca:** um ficheiro que já passou do limite só pode encolher. Um PR que
    lhe acrescenta linhas parte-o primeiro.
11. **Mover antes de melhorar, em PRs diferentes.** Um diff de linhas movidas
    revê-se em minutos; um diff que move e muda não se revê.
12. **Caracterização antes de partir** (Feathers), e um teste de ouro para o que
    é produto final (o PDF: o mesmo documento dá os mesmos bytes, preso num `sha256`).
13. **Medir, não lembrar.** Esta Parte 2 tem os comandos; repetir a medição em
    cada fase e escrever o antes e o depois.
14. **O porquê fica junto do código que explica**, com a data e a medição. É
    um dos pontos fortes desta casa; quando a função muda de ficheiro, o
    comentário vai com ela.

15. **Partir um ficheiro gigante faz-se com o compilador, não à mão.** Nas
    fases 7 e 8, cada bloco de JSX saiu por um script que pergunta ao
    TypeScript que nomes o bloco usa e de que tipo são (a mesma pergunta que o
    editor faz ao «Extrair componente»), e que escreve o componente e a chamada.
    Três armadilhas que custaram tempo: (a) cada extracção acrescenta uma
    importação no topo, por isso as linhas de baixo deslocam-se — calculam-se
    sempre de novo, por âncoras de texto, e nunca de memória; (b) o tipo de uma
    variável é o do SÍTIO do bloco (dentro de `{x ? (…)` o `x` já não é nulo), e
    não o da declaração; (c) quando várias props vêm do mesmo hook, passa-se o
    objecto do hook (`edicao`, `filtros`) — 26 props soltas não são uma
    interface, são um sintoma.
16. **O topo do ficheiro sai ANTES do JSX.** Um componente novo que importe
    uma constante do ficheiro gigante de onde saiu cria um ciclo (o gigante
    importa o componente). Primeiro mudam-se as constantes, os tipos e as
    peças pequenas do topo para casas próprias; só depois o JSX que as usa.
17. **Um teste que lê o texto de um ficheiro precisa de uma porta, não do
    caminho.** Quarenta testes tinham o caminho do `AdminClient.tsx` escrito à
    mão. Uma porta única (`fonte-do-admin.testkit.ts`) torna a mudança de casa
    seguinte uma linha, e — mais importante — impede o teste de ficar verde por
    deixar de encontrar o que procurava.
18. **Removedores de comentários ingénuos mentem.** Uma string com «/*» (o
    `accept="image/*"` de um campo de ficheiros) abria um «comentário» que só
    fechava no `*/` seguinte; enquanto esse `*/` esteve no mesmo ficheiro, o
    teste passava por acaso. Tira-se o comentário ficheiro a ficheiro, e as
    strings primeiro.
19. **A catraca e os ramos antigos.** Uma guarda nova (a catraca do tamanho)
    encontra, no primeiro merge, ramos escritos antes dela. Decide-se uma vez,
    por escrito, que os tectos desse merge são a fotografia do dia — e a
    partir daí só descem.
20. **Uma instância por dono, um código para todos.** A fila das fotografias
    estava três vezes. Juntar as três numa só mudava um comportamento (quantas
    descarregam ao mesmo tempo); o passo sem risco foi primeiro dar-lhes O MESMO
    código, com uma instância cada uma. A decisão de as juntar passa a ser uma
    linha, e fica com quem a deve tomar.

---

## Fontes

Documentação do Next.js 16.4.3 instalada em `node_modules/next/dist/docs/`
(lida a 17/11):
`01-app/01-getting-started/02-project-structure.md` (organização, colocação,
pastas privadas, «Split project files by feature or route»),
`01-app/01-getting-started/05-server-and-client-components.md` («Reducing JS
bundle size», «Preventing environment poisoning»),
`01-app/02-guides/server-and-client-boundary.md`,
`01-app/02-guides/data-security.md` («Data Access Layer», «Validating client input»).

1. Robert C. Martin, «Screaming Architecture», 30/09/2011 — https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html
2. Bulletproof React, «Project Structure» — https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
3. Feature-Sliced Design, documentação oficial (camadas, fatias, segmentos, API pública) — https://feature-sliced.design/docs/get-started/overview
4. Cal.com, «Monorepo / Turborepo» (handbook) — https://handbook.cal.com/engineering/codebase/monorepo-turborepo
5. Shopify Engineering, «Deconstructing the Monolith» — https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity
6. Shopify Engineering, «Enforcing Modularity in Rails Apps with Packwerk» — https://shopify.engineering/enforcing-modularity-rails-apps-packwerk ; e «A Packwerk Retrospective» — https://shopify.engineering/a-packwerk-retrospective
7. Kent C. Dodds, «Colocation» — https://kentcdodds.com/blog/colocation
8. Next.js, «Project Structure» (a mesma da documentação instalada) — https://nextjs.org/docs/app/getting-started/project-structure
9. Gary Bernhardt, «Functional Core, Imperative Shell» e a palestra «Boundaries» (SCNA 2012) — https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell
10. Alexis King, «Parse, don't validate», 05/11/2019 — https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/
11. Dominik Dorfmeister (TkDodo), «Practical React Query» («Keep server and client state separate») — https://tkdodo.eu/blog/practical-react-query
12. React, «You Might Not Need an Effect» — https://react.dev/learn/you-might-not-need-an-effect
13. React, «Extracting State Logic into a Reducer» — https://react.dev/learn/extracting-state-logic-into-a-reducer
14. Kent C. Dodds, «Make Impossible States Impossible» (a frase de David Khourshid, React Rally 2017) — https://kentcdodds.com/blog/make-impossible-states-impossible
15. Heap/Contentsquare, «When To Avoid JSONB In A PostgreSQL Schema» — https://contentsquare.com/blog/when-to-avoid-jsonb-in-a-postgresql-schema/
16. Appwrite, «Data modeling» (desnormalização controlada com JSONB) — https://appwrite.io/docs/products/databases/postgresql/concepts/data-modeling
17. «Characterization test» (Michael Feathers, *Working Effectively with Legacy Code*) — https://en.wikipedia.org/wiki/Characterization_test
18. Martin Fowler, «Strangler Fig Application» — https://martinfowler.com/bliki/StranglerFigApplication.html
19. ESLint, `max-lines` (300 por omissão) — https://eslint.org/docs/latest/rules/max-lines
20. ESLint, `complexity` (20 por omissão) — https://eslint.org/docs/latest/rules/complexity
21. Google Engineering Practices, «Small CLs» — https://google.github.io/eng-practices/review/developer/small-cls.html

As fontes 2, 3 e 4 foram confirmadas por espelhos e resumos (a pesquisa não
devolveu sempre a página original); as afirmações delas que este documento usa
são as que aparecem igual em várias. As 19 e 20 foram lidas na página oficial.
