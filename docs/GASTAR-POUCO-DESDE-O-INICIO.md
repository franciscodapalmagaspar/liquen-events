# Gastar pouco desde o início

Pedido dela a 3/11/2026, guardado aqui no mesmo dia, como manda o `CLAUDE.md`:

> «guarda isto na tua memória para futuros projetos, isto já não acontecer, e
> desde o início termos já estas coisas em consideração […] não temos que andar
> a corrigir estas coisas, ou a otimizar, ou a melhorar. […] se nós já tivemos
> isto como base desde o início, muita coisa já se prevê desde o início.»

Não existe uma memória que passe de um projeto para outro. **A memória é este ficheiro.**
- Num projeto novo, copia-se para `docs/` no primeiro dia.
- A secção «Regras» entra no `CLAUDE.md` desse projeto.
- Vale ao lado do `docs/PADRAO-PALUMEN.md`: o padrão diz quão bom o site tem de ser, e este ficheiro diz quanto pode custar.

---

## O que aconteceu, para não se repetir

- **2/11/2026:** a Vercel desligou o site («This deployment is temporarily paused»).
- **O motivo:** a conta grátis (Hobby) passou o limite de **Fluid Active CPU**, o tempo de processador das funções do servidor.
- **A consequência:** no Hobby, passar um limite deixa o site em baixo até ao fim do ciclo. Aqui, isso era **um mês inteiro**, até 2/12.
- **Não era a largura de banda:** estava em 39,55 GB de 100.
- **O que estava perto do limite:** as escritas ISR, com 177 mil de 200 mil.
- **A solução:** ela passou a Pro (20 USD/mês) e pôs um tecto de gasto, com o site a parar se o passar.

O processador ia para trabalho repetido, nunca para trabalho novo:
- fotografias reduzidas outra vez em cada instância nova da função;
- varreduras do back office que liam tudo só para concluir «já está feito», em cada abertura;
- pré-visualizações redesenhadas enquanto ela escrevia;
- relatórios do navegador sobre uma regra de segurança mal acertada;
- medições de cada visita, quando uma amostra chegava.

Nenhum destes pedidos era caro sozinho. O que pesou foi a soma, e foi a soma que desligou o site.

Os cortes estão nos PRs #359, #360 e #361, e o que se aprendeu com eles está nas regras abaixo.

---

## Regras (para o `CLAUDE.md` de cada projeto novo)

### 1. A conta, antes da primeira linha de código
- **Limites:** saber os do plano (Hobby ou Pro) e **o que acontece quando se passam**. No Hobby, o site pára até ao fim do ciclo.
- **Tecto de gasto:** ligá-lo no Pro desde o primeiro dia (Spend Management, com Pause On). O número é escolhido por quem paga.
- **Alertas:** o painel «Usage» lê-se uma vez por semana no primeiro mês, e há aviso aos 50 % e aos 80 % de cada linha.
- **Extras pagos** (Observability Plus e outros): só com autorização de quem paga.

### 2. Medir desde o primeiro dia, de graça
- **Por rota:** cada rota com trabalho pesado escreve uma linha com o processador gasto. Aqui foi `comCpu` (`src/lib/medir-cpu.ts`), que cabe em 50 linhas e se copia para outro projeto.
- **Porquê:** sem isso, a Vercel só mostra o processador por rota com um extra pago, e cortar passa a ser adivinhar.
- **Registos de diagnóstico:** nascem **com data de fim** escrita no código.

### 3. Trabalho pesado faz-se uma vez e guarda-se
Pesado é `sharp`, PDF, rasterizar, ou percorrer listas inteiras.
- **A memória da função não conta como guardar:** perde-se a cada instância nova. Guarda-se no armazenamento (Supabase Storage, Blob).
- **A chave** é um resumo da receita (tamanho, qualidade, brilho, versão) e da origem. Mudar a receita nunca serve uma versão velha.
- **Ordem de procura:** memória → armazenamento → fazer e guardar. Se o armazenamento falhar, faz-se como antes, sem lançar erro.
- **No build:** gera-se lá tudo o que se pode gerar lá (versões das fotografias, miniaturas, páginas estáticas). Nada de `/_next/image` a reduzir em cada visita o que podia vir pronto.

### 4. Páginas: estáticas por defeito
- **`force-dynamic`** só com razão escrita ao lado. Uma página que muda pouco é estática ou ISR, com revalidação **por evento** (quando o conteúdo muda) e não por relógio curto.
- **Escritas ISR:** contam para o limite. Uma revalidação a cada minuto numa página que muda uma vez por semana é desperdício.
- **Middleware (`proxy.ts`):** o `matcher` exclui logo os estáticos (`_next/static`, imagens, vídeos, logótipos, ficheiros de raiz).

### 5. O navegador não acorda o servidor sem razão
- **Debounce:** generoso no que reage à escrita. Aqui, 2,5 a 3 s antes de pedir uma pré-visualização, e nunca uma por tecla.
- **Separador escondido** (`document.hidden`): não se pede nada. Nada de polling nem de pré-visualizações.
- **Polling:** intervalos longos (minutos, não segundos). Aqui ficou em 5 minutos.
- **Varreduras em fundo:** quando uma termina «tudo feito», só volta a correr ao fim de um espaço. Aqui são 12 h, com `varredura-espacada.ts`. Se houver trabalho por fazer, continua.
- **Listas:** trazem o resumo, e o detalhe vem ao abrir o item.

### 6. O que o navegador manda sozinho, por amostra
- **Web Vitals e afins:** por amostra. Aqui, 10 % das visitas chegam.
- **CSP:** acertada antes de lançar, porque cada recurso bloqueado gera um relatório, e cada relatório é um pedido a uma função. Os relatórios lêem-se na primeira semana.

### 7. Em cada PR que acrescenta uma rota ou uma tarefa
Três perguntas, com a resposta escrita no PR:
1. **Quantas vezes corre?** Por visita, por tecla, por abertura do back office, por dia.
2. **Quanto processador gasta de cada vez?** Medido, ou «não medido» com a razão.
3. **Pode ser guardado, feito no build, ou feito no navegador?**

### 8. Depois de lançar
- **Ao dia 7 e ao dia 30:** lê-se a linha de processador por rota. O que estiver no topo sem razão corta-se, um PR por corte.
- **Cada corte confirma-se nos números do dia seguinte:** a rota tem de descer.

### 9. Publicar em lotes, e por um caminho só
Cada publicação de produção constrói o site inteiro e guarda mais uma cópia
dele. A 3/11 foram 26 construções (14 alterações, cada uma construída duas
vezes): 1,47 $ de minutos de construção num dia, mais do que tudo o resto
junto. Ela pediu a 4/11: **«passa a juntar as alterações em lotes»**.

- **Um caminho só para publicar.** Ou a ligação do GitHub à Vercel, ou um
  Deploy Hook — nunca os dois no mesmo push. Confirma-se em `list_deployments`:
  um commit em `main`, um deployment.
- **Cada pedido continua no seu PR**, com o CI dele e verde contra o `main`.
  O que muda é juntar: **um PR verde não entra logo no `main`**, espera pelo
  lote.
- **O lote:**
  1. um ramo `lote/AAAA-MM-DD` a partir do `main`;
  2. cada PR pronto muda de base para esse ramo e entra nele em squash (um
     ramo que não é o `main` não constrói produção, e as pré-visualizações já
     estão desligadas no `vercel-construir.mjs`);
  3. um PR `lote/…` → `main`, com a lista dos PRs que leva; com o CI verde,
     entra em squash — **uma** construção para o lote inteiro.
- **Quando se publica:** **uma vez por dia**, no fim do dia de trabalho
  (pedido dela de 10/11 — era «duas ou três»). Mais cedo só quando ela pede
  para ver no site («publica já», «já está online?»). A conta de 3–9/11 diz
  porquê: a construção (2,16 $) e as versões guardadas (1,71 $) eram as duas
  maiores linhas, e as duas crescem com cada publicação.
- **Fora do lote, logo:** o site em baixo, uma falha de segurança, ou um erro
  que um cliente está a ver neste momento.
- **O que mexe no PDF continua a precisar da aprovação dela antes de entrar no
  lote** — o lote não é atalho.
- **Os ramos de trabalho não arrancam construções na Vercel** (9/11). Uma
  pré-visualização «saltada» pelo `ignoreCommand` ainda abre uma máquina de
  construção ~22 s; num dia de trabalho eram ~40, mais minutos do que as
  construções de produção (~72 s cada). No `vercel.json`,
  `git.deploymentEnabled` só deixa o `main` e os `preview/…` (a Vercel
  constrói quando pelo menos uma regra diz `true`). O guião fica como segunda
  rede.
- **Medido na fatura de 3 a 9/11** (6 dias, 4,83 $ de uso, fora o plano):
  construção 2,16 $, armazenamento das publicações 1,71 $, armazenamento das
  funções 0,58 $, processador das funções 0,18 $. O que pesa é construir e
  guardar — não as visitas.

---

## Porque é que isto não baixa a qualidade

Nada destas regras mexe no que se vê:
- a mesma fotografia, guardada em vez de refeita;
- a mesma pré-visualização, pedida quando ela pára de escrever e não a cada letra;
- a mesma página, servida pronta em vez de montada a cada visita.

É a regra do B0 do padrão: **«escolhe a mais simples que atinja a fasquia»**. Aqui, a mais simples é também a mais barata.

## O Upstash (10/11)

Ela: «é mesmo importante manter muito abaixo o upstash — guarda isso de forma
sempre a melhorar». Cada `rateLimit` com Redis são 2–3 comandos; a proposta
online faz ~60 pedidos por visita, e se todos fossem ao Redis uma visita
gastava ~150 comandos. Por isso:

- **por omissão, memória** (custo zero): telemetria, imagens, páginas e PDF da
  proposta, códigos curtos (12 símbolos já não se adivinham), Meta, saúde;
- **`{ global: true }` só** em entrar, chave de acesso, recuperação, formulário
  do pedido e confirmação por email — poucas por dia;
- a lista vive em `src/lib/rate-limit.global.test.ts`. Mexer nela é decidir
  gastar, e diz-se no PR quanto (comandos por dia, contra o tecto do plano).

## O Supabase (10/11)

Ela: «é mesmo importante manter muito abaixo o supabase também — sempre a
melhorar a experiência com ele, mas sempre a evoluir na optimização».

O plano é o **gratuito**: 1 GB de ficheiros, 500 MB de base de dados, 5 GB de
saída por mês. Medido a 10/11: base de dados 36 MB; ficheiros **928 MB em
9 775 objectos** (theme-assets 284, fotos-editoriais 158, proposal-assets 147,
proposal-pdfs 121, theme-medias 120, proposal-medias 43, theme-thumbs 30 MB).

- Nada novo vai para o armazenamento sem o PR dizer quanto ocupa e como se
  limita. A cache das páginas do estúdio (#411) foi DESFEITA no próprio dia
  por isto: poupava cêntimos de processador e enchia o plano.
- As caches derivadas têm de se poder apagar e refazer sem perder nada.
- Antes de acrescentar, mede-se o que sobra (a consulta está no PR #414).

**«Eu não quero pagar nada»** (dela, 10/11): o Supabase e o Upstash ficam nos
planos gratuitos. Nada se faz que obrigue a subir de plano.

### O que se mediu e o que se fez (10/11)

- **Saída de dados (egress), medida nos registos do Supabase a 10/11** (24 h,
  um dia de trabalho dela): ~180 MB sem cache — ao ritmo de um dia assim,
  ~5,4 GB/mês, ACIMA dos 5 GB do plano gratuito. Não verificado no painel de
  uso (não há ferramenta para o ler daqui); é a soma dos `content-length`.
  De onde vem:
  · 118 MB: originais da biblioteca vistos no back office (visualizador e
    pré-visualização do seletor), 803 pedidos, 224 repetidos;
  · 23,5 MB: 1 702 listagens de pastas feitas pelo servidor (961 da
    `theme-assets`);
  · 16 MB: fotos tratadas lidas pelo servidor sem cache (+119 MB COM cache do
    Supabase, que conta noutra quota);
  · ~10 MB: miniaturas `.png`/`.webp` e médias, que o service worker não
    guardava.
  Feito: o service worker guarda agora as derivadas todas e os originais da
  biblioteca (gaveta própria, 200 ≈ 40 MB), sempre pelo caminho sem token.

- `fotos-editoriais` (cache, 158 MB numa semana): a tarefa da noite apaga o
  que tem mais de 30 dias (`limpar-fotos-tratadas.ts`). Pela idade, porque o
  Supabase não regista leituras (`last_accessed_at` = criação).
- Duplicados pelo conteúdo (eTag): **160 MB em 1 525 cópias** —
  proposal-assets ↔ theme-assets 45 MB, dentro de proposal-assets 38 MB,
  proposal-medias ↔ theme-medias 24 MB, dentro de theme-assets 22 MB, dentro
  de theme-medias 12 MB, o resto miniaturas. Por fazer: juntar numa cópia só,
  com as propostas a apontar para a biblioteca (precisa de mexer nos
  documentos — com cópia de segurança e autorização dela).
  **Feito a 13/11 (autorizado por ele nesse dia; ramo
  `supabase/juntar-duplicados`)**: `juntar-fotos-duplicadas.ts`, na tarefa da
  noite, com o manifesto que já se faz para o email (nenhuma listagem a mais).
  Duas fases à vista em `app_state` (`limpeza:fotos-duplicadas`): a Fase A
  agrupa por `eTag` + tamanho, reescreve os RASCUNHOS do estúdio com
  compare-and-set no `updated_at` (e `updatedAt` novo lá dentro, para o
  estúdio aberto juntar campo a campo em vez de repor o caminho antigo) e grava
  o valor antigo de cada campo; a Fase B, ≥ 24 h depois, relê as 15 tabelas e
  só apaga a cópia (e as derivadas, depois de copiadas para o caminho que fica
  se lá faltarem) que ninguém menciona. Recalcula no máximo uma vez por
  semana. Plano a seco: `GET /api/admin/fotos-duplicadas`.
  O que fica DE FORA, e porquê:
  · cópias referidas por PROPOSTAS GRAVADAS — reescrever uma proposta enviada
    mudava-lhe o selo da versão (uma aceite passava a «revista»), a chave do
    PDF guardado e contrariava o contrato (~15 MB a 13/11);
  · cópias referidas pela Reciclagem ou por qualquer outra tabela (~4 MB);
  · as cópias DENTRO da Biblioteca (theme-assets 31 MB, theme-medias 17 MB):
    cada uma é a foto num tema diferente — tirá-la tirava-a do tema;
  · entre pastas de pedidos diferentes, sem cópia na Biblioteca: apagar um
    pedido leva a pasta, e o outro ficava sem a foto;
  · a única cópia da pasta de um pedido que também está na Biblioteca, quando
    o rascunho desse pedido não a usa (~14 MB): a pasta é a galeria do pedido
    no estúdio, e a foto desaparecia de lá. Decisão dela, se quiser.
  Esperado (medido por SQL a 13/11): **~36 MB de originais (86 cópias) + ~9,5
  MB de derivadas (`proposal-medias` 8,1, `proposal-thumbs` 1,4) ≈ 45 MB**,
  ao longo de 2–4 noites (tecto de 20 s por noite). Não os 114 MB do total
  de duplicados: o resto é o que fica de fora acima.
  **Depende do PR #448** (`moverFotosDaBiblioteca`): é ele que reescreve as
  `tema:` que a Fase A escreve quando ela funde temas ou move fotos (teste de
  ponta a ponta em `juntar-fotos-duplicadas.mover.test.ts`). Depois de uma
  cópia sair, durante 60 dias, a tarefa da noite relê os rascunhos gravados
  desde a véspera (filtro por `updated_at`: dezenas de KB) e corrige o que
  voltou a escrever o caminho apagado (um separador antigo, uma reposição).
  Na Fase B, antes de cada lote, relê o que se gravou desde a leitura das
  tabelas. Um tema arquivado não serve de destino.
- **Uma fotografia nunca se guarda duas vezes (13/11, pedido dele: «ficar
  incrível e termos imenso espaço sem perder nada»; ramo
  `supabase/sem-duplicados-ao-carregar`)**. A junção da noite arruma as cópias
  que já existem; isto IMPEDE que nasçam novas (`fotos-resumo.ts`).
  · **Índice**: uma linha de `app_state` por resumo, `foto-resumo:<32 hex>` →
    até 6 caminhos (`<pedido>/<x>.jpg` ou `tema:<pasta>/<x>.jpg`). O resumo é
    o da Biblioteca (16 bytes do SHA-256). Escreve-se o dos bytes GUARDADOS
    (calculado no servidor) e, só na Biblioteca, o do ficheiro ORIGINAL quando
    o nome do ficheiro já o traz — é o que reconhece uma foto da Biblioteca,
    que lá foi preparada com outro tamanho. O resumo que o navegador manda
    serve só para PROCURAR (revisão do #454: errado, envenenava o índice).
    Tema apagado sai do índice; tema arquivado fica. Antes de gravar o
    rascunho, a importação volta a confirmar as `tema:` e sobe como nova a
    que tiver saído entretanto. Sem migração.
  · **Carregar para uma proposta** (`assets`): se a foto já está na pasta
    DESTE pedido, devolve esse caminho; se está na Biblioteca num tema vivo
    (não arquivado), devolve `tema:<caminho>` — a mesma referência do «escolher
    da Biblioteca», que já funciona no estúdio, no PDF, na proposta online e na
    galeria do pedido, e que o `theme-materializar` protege. Zero bytes
    guardados: nem a foto, nem a miniatura, nem a média. Na pasta de OUTRO
    pedido nunca (apagar esse pedido levava a foto).
  · **Biblioteca**: carregar a mesma foto no MESMO tema já não guardava outra
    cópia (o nome do ficheiro é o resumo, e o `upsert: false` dá 409; a rede do
    MD5/eTag apanha as antigas). Agora cada foto carregada (ou recusada como
    repetida) entra também no índice, e é assim que as propostas a reconhecem.
  · **Importar proposta antiga**: o navegador calcula os resumos e pergunta a
    `POST /api/orcamento/fotos-existentes` (só admin, `comCpu`) antes de
    preparar seja o que for. As que já existem não sobem um byte, não ocupam
    espaço e não contam para o tecto; o tecto passou de 8 (todas) para 20
    NOVAS. A janela diz «X já existem — não ocupam espaço» e os MB das novas.
  · **Quanto poupa**: cada foto repetida que deixa de se guardar são ~0,6–1,3
    MB (original + média + miniatura). Para ordem de grandeza: a 10/11 havia
    160 MB em 1 525 cópias iguais; parte delas vem do tempo em que escolher da
    Biblioteca copiava os bytes, por isso não se promete um número por mês —
    mede-se no manifesto da noite.
  · **Quanto custa**: ~150 B por foto na base de dados (< 1 MB para as ~3 000
    de hoje, dos 500 MB). Por foto carregada: uma leitura `key in (…)` e uma ou
    duas escritas pequenas; só quando há candidata, um `getTheme` e um HEAD ao
    Storage (zero bytes de saída). Nunca uma listagem do Storage. No navegador,
    ~40 ms por foto para o resumo. Um caminho que já não existe sai do índice
    na primeira vez que se tropeça nele; cada chave guarda no máximo 6.
  · **O que não faz**: o índice começa vazio — as fotos de antes de 13/11 só
    entram quando voltarem a ser carregadas (ou recusadas como repetidas na
    Biblioteca). As limpezas da noite (`juntar-fotos-duplicadas`,
    `limpar-pastas-orfas`, `limpar-pdfs-substituidos`) não contam as chaves
    `foto-resumo:` como menções: o índice nomeia caminhos, não os usa.
- **As fotografias pelo que mostram, e cada foto nova a ocupar o mínimo (13/11,
  pedido dele: «faz isso das fotografias pelo que mostram. e eu quero otimizar
  o máximo possível para ser possível colocar todas as fotos das propostas
  antigas»; ramo `supabase/fotos-pelo-que-mostram`, com as correcções da
  revisão do mesmo dia).**
  · **Reconhecer pelo que mostra** (`impressao-visual.ts`, puro, igual no
    navegador e no servidor). Sobre uma versão de 128 px em tons de cinzento,
    sem as margens lisas (até 20% por lado — a caixa branca do diapositivo),
    reduzida a 32 × 32 pela média das áreas no próprio código: o pHash de 64
    bits (a composição), o de 256 bits (o pormenor), a cor média (Cb, Cr,
    croma), e a luz e o contraste (luma média e desvio-padrão). 90 hex.
    pHash e não dHash: medido, o dHash aguenta a recompressão igual, mas com
    um corte de 4% já se aproxima das fotos diferentes.
  · **As fronteiras, medidas com as 1 057 fotografias de `public/imagens`**
    (a pergunta como o navegador a faria, contra a MINIATURA de 400 px da
    versão guardada a 2 200 px, que é o que a noite lê). «Mesma» =
    composição ≤ 4 bits E pormenor ≤ 16 E cor ≤ 2 E luz ≤ 4 E contraste ≤ 3;
    «talvez» = composição ≤ 12; acima, outra.

    | a mesma fotografia… | mesma | talvez | outra |
    |---|---|---|---|
    | o ficheiro tal e qual | 98,4% | 1,5% | 0,1% |
    | recomprimida q40 | 98,1% | 1,8% | 0,1% |
    | reduzida a 800 px q60 | 98,4% | 1,4% | 0,2% |
    | passada a PNG | 98,5% | 1,4% | 0,1% |
    | cortada 3% de cada lado | 0% | 97,7% | 2,3% |
    | com faixa branca de 6% | 9,3% | 86,8% | 4,0% |
    | **retocada:** exposição −10% / −20% / +10% | 0% / 0% / 0,6% | 99,8 / 99,4 / 98,6% | resto |
    | **retocada:** contraste ×1,15 / ×1,3 | 0,9% / 0% | 98,3 / 98,7% | resto |
    | **retocada:** branco mais quente (R×1,06, B×0,92) | 0,9% | 99,0% | 0,1% |
    | **retocada, leve:** branco quente (R×1,03, B×0,96) | 20,7% | 79,2% | 0,1% |
    | **retocada, leve:** saturação +20% | 39,9% | 60,0% | 0,1% |

    Antes da revisão (sem a luz e o contraste, e cor ≤ 8), a exposição −20%
    dava «mesma» em 96%, o contraste ×1,3 em 93% e o branco quente em 64% —
    era o defeito. **Fica por resolver**: os retoques MUITO leves de cor
    (saturação +20%, branco ligeiramente mais quente) ainda passam por «mesma»
    em 20–40% dos casos; a cor média não tem resolução para os separar sem
    começar a perguntar pela mesma foto recomprimida.
    Fotografias DIFERENTES: 1 116 192 pares (todos contra todos) → 48
    «mesma», e todas eram a mesma fotografia (24 pares: 18 com os bytes
    iguais — os «(1)» — e 6 vistos a olho: as cópias do WhatsApp e os
    `matilde-e-tomas` / `matilde-tomas`). As diferentes mais parecidas:
    rajada (`stephanie-mizio-765/766`: composição 4, pormenor 30), a mesa um
    passo ao lado (`EW1_1393/1394`: 8 e 40), a cores e a preto e branco
    (`405/406`: composição 0, pormenor 2, cor 17).
  · **No navegador a sério** (Chromium 153 pelo Playwright, o canvas com o
    mesmo código do importador): 50 fotos, impressão do canvas contra a do
    servidor sobre a miniatura guardada → 49 «mesma», 1 «talvez»; composição
    p95 2 (máx. 4), pormenor p95 8, cor máx. 1, luz máx. 3, contraste máx. 3.
    Num Safari não foi medido.
  · **Quem decide sem perguntar** — a revisão apertou isto:
    · o **estúdio** só reutiliza com o resumo dos BYTES igual
      (`fotos-resumo.ts`). Uma «mesma» pela imagem com bytes diferentes pode
      ser um retoque ou uma versão maior, e o estúdio não tem onde perguntar:
      guarda a nova. A impressão só se calcula para a foto que vai mesmo ser
      guardada;
    · o **importador** usa a «mesma» sem perguntar, mas só se a guardada for
      do tamanho que a nova precisa (o lado dela, até 1 800 num mood board e
      2 200 na capa). Uma guardada mais pequena nunca a substitui — sobe a
      nova; uma de lado desconhecido fica «talvez». A «talvez» mostra as duas
      lado a lado com «É a mesma» / «É outra»; sem resposta é NOVA. Se a
      criação falhar a meio e ela mudar de ideias (ou tirar uma foto) antes de
      «Continuar a importação», o que já não vale sai antes de continuar
      (`carregadasQueValem`) — uma foto recusada nunca fica na proposta.
  · **O índice** (`fotos-parecidas.ts`): 64 linhas `foto-visual:<00–3f>` em
    `app_state`, cada uma `caminho → "<impressão>:<lado>"` (o lado maior da
    foto guardada). ~150–200 B por foto com a chave; escrever é compare-and-
    set de UMA linha (~8–10 KB com 3 000 fotos). Escrevem SÓ o carregamento
    (impressão calculada no servidor sobre os bytes guardados, com o lado
    deles — `assets` e Biblioteca) e a noite (sobre a miniatura, com o lado
    das medidas guardadas em `biblioteca_fotos`; 0 se não houver). A do
    navegador só serve para procurar. Procurar lê o índice todo numa ida
    (**~0,5 MB com 3 000 fotos**), guardado 5 min na instância; só a
    importação procura. Os prefixos `foto-resumo:` e `foto-visual:` estão
    numa lista só (`indices-de-fotos.ts`) que as três limpezas da noite
    ignoram como menções — sem isso, o índice segurava todas as fotos e
    nenhuma limpeza voltava a apagar nada (achado da revisão).
  · **A noite** (`cron/backup`, `preencherImpressoes`): com o manifesto que já
    se faz, cada original sem impressão lê a MINIATURA (se faltar, ou se o
    `sharp` não a ler, a média; nunca o original), até 600 fotos ou 10 s de
    leitura. **O ritmo** (segunda revisão): lida uma a uma e gravada lote a
    lote dava ~40–60 fotos por noite. Agora lêem-se 6 ao mesmo tempo e grava-se
    no fim, UMA escrita por linha do índice (≤ 64, também 6 a 6). Medido num
    teste com 40 ms por leitura: 140 fotos num segundo. Com as ~150 ms reais de
    uma leitura do Storage são ~40 por segundo, **~400 por noite**: as ~3 000
    fotos de hoje entram em **~8 noites**. Uma leitura que falhe pela rede não
    marca nada (volta na noite seguinte); uma sem miniatura nem média
    (confirmado por HEAD), ou ilegível, fica marcada `sem:<data>` e volta a
    ser tentada passados 14 dias. A Reciclagem da Biblioteca
    (`reciclagem/<entrada>/…`) não entra. **Fica de fora, por decisão**: uma
    foto cujo nome não passe o `isThemePath` (um nível, letras, algarismos,
    `_` e `-`) não entra no índice — é a mesma regra que já decide o que é um
    caminho de tema e de pedido nesta casa; uma foto antiga com outro nome não
    é reconhecida pelo que mostra (sobe como nova, o lado seguro). O que a junção dos duplicados, as
    pastas órfãs e a Reciclagem apagaram nessa noite (depois do manifesto)
    não se calcula e sai do índice — só as pastas que saíram de facto: a de um
    pedido ou tema que voltou (o `largar` responde `"ficou-viva"`) fica.
  · **Cada foto nova de MOOD BOARD ocupa menos** (`image-prep.ts`). O PDF
    reduz tudo a 1 800 px; a proposta online usa a média de 1 200 e a
    miniatura. Medido com 49 fotos de 2 400–2 560 px (original + média +
    miniatura): antes 2 200 px JPEG + JPEG + JPEG = **0,67 MB** (517 + 154 +
    18 KB); agora 1 800 px q0,82 JPEG + WebP + WebP = **0,47 MB** (354 + 112
    + 15 KB), −30%. PDF (original → 1 800 q86) contra a fonte: 37,6 → 38,0 dB
    (pior 32,1 → 32,9). E o PDF real, gerado com 8 fotos à moda antiga e à
    nova (14 páginas), comparado com o PDF das fontes: 41,81 → 41,85 dB.
    Média e miniatura em WebP onde o navegador o codifica (Safari: JPEG,
    ~0,52 MB). Nada disto mexe em fotos já guardadas; a Biblioteca fica a
    2 200 px.
  · **A CAPA fica a 2 200 px** (achado da revisão: a capa web grande pede
    2 000). Medido com 8 fotos deitadas, a capa a toda a largura de um ecrã
    de 1 920 px contra a fonte: original a 2 000 px → 36,5 dB (pior 30,3),
    AVIF grande 212 KB; a 1 800 px → **29,5 dB** (pior 23,2), 181 KB. Sete
    decibéis vêem-se. As fotos de capa (do estúdio e da capa de uma
    importação) guardam-se como sempre (2 200 q0,90): perde-se ~0,2 MB de
    poupança por proposta. **Limite**: uma foto de mood board escolhida
    DEPOIS para capa tem 1 800 px, e a capa web grande dela sai a 1 800.
  · **Quanto cabe**: até ao travão de 90% (900 MB, contados em 10⁹), com
    ~695 MB depois das limpezas sobram ~205 MB — menos a folga de 40 MB do que
    o servidor guarda sozinho (ver «O travão»), ~165 MB → **~330 fotos novas**
    a 0,5 MB, mais todas as que já existem. No R2 (90% de 10 GB) seriam ~18 000.
  · **O travão** (`ocupacao-do-armazenamento*.ts`): a noite grava quanto ocupa
    cada bucket (os originais pelo manifesto; os outros, o de medição mais
    velha primeiro, com 6 s), e o `assets` e a rota da Biblioteca somam por
    bucket o que guardam depois disso. **O que o servidor guarda sozinho**
    (segunda revisão) não passa pelo contador — os PDF (`proposal-pdfs`), as
    fotos tratadas do PDF (`fotos-editoriais`, ~23 MB num dia de trabalho a
    10/11), as AVIF e as capas. Os dois que mais crescem medem-se TODAS as
    noites, antes dos outros, mas com no máximo metade dos 6 s — o resto vai
    para os outros, o mais velho primeiro, para nenhum ficar sem medição
    (terceira revisão; uma listagem cortada pelo tecto, mesmo a meio das
    páginas de uma pasta, não conta como medida); e entre medições o travão reserva uma folga
    fixa de **40 MB** (um dia inteiro desses dois, com margem). Uma medição com
    mais de 50 h já não serve (volta o tecto de 20). O importador sobe até
    **200 novas**, limitado pelo que cabe; o `assets` recusa (507) um
    carregamento da importação que passasse do travão, contando o original ×
    1,35 (média e miniatura) — mas só DEPOIS de ver que a foto não está já
    guardada (pelo resumo, ou por uma tentativa anterior com a mesma chave),
    para uma foto que não ocupa nada nunca levar 507. Ao primeiro 507 o
    importador pára e diz quantas ficaram de fora. Com a folga, o que cabe
    até ao travão desce para ~165 MB → ~330 fotos novas no Supabase.
  · **As três perguntas do custo**:
    1. *Quantas vezes corre*: a noite, uma vez (dentro da cópia); a impressão
       no servidor, uma vez por foto guardada; a pergunta do importador, uma
       por lote de 60 fotos.
    2. *Quanto processador*: por foto guardada, um `sharp` a 128 px (~10–20
       ms) e o pHash (<1 ms); a noite, ~5–10 ms por miniatura, ~400 por
       noite nas ~8 primeiras noites e quase nada depois; a medição, ≤ 6 s
       por noite. Storage: as miniaturas uma vez (~3 000 × ~30 KB ≈ 90 MB de
       saída em ~8 noites — o maior custo, e único); listagens ~0,4 KB por
       ficheiro, cada bucket uma vez por semana (~4 MB por semana). Base de
       dados: ~0,5 MB de índice com 3 000 fotos; cada procura lê-o (~0,5 MB),
       guardado 5 min.
    3. *Guardar / build / navegador*: a impressão da pergunta calcula-se no
       navegador; a do índice uma vez, e guarda-se; a ocupação mede-se de
       noite e guarda-se.
- `proposal-pdfs` (121 MB): ela escolheu guardar o PDF actual e o aceite de
  cada proposta. Lista mostrada a 10/11: 9 ficheiros (~9 MB), incluindo as
  pastas de 2 propostas que já não existem. O Supabase não deixa apagar
  ficheiros por SQL (`storage.protect_delete`), por isso apagam-se no painel.
- **Fotografias de pedidos apagados (autorizado por ela a 10/11)**: pastas de
  `proposal-assets` (+ derivadas) de pedidos apagados em julho e agosto, antes
  de a Reciclagem limpar as fotos. Ela pediu logo a seguir: «verifica tudo… não
  estarmos a apagar coisas que depois vamos ver e deviam estar lá». Verificado
  em TODAS as tabelas: de 10 pastas sem pedido, 4 têm rascunho guardado
  (`proposal-draft:<pedido>`, dois com fotos de lá) e FICAM; 6 (~112 MB com
  derivadas, 169 fotos, uma delas com 158 de 22–25/07) não são mencionadas em
  lado nenhum. A tarefa da noite (`limpar-pastas-orfas.ts`) passa-as por sete
  portas, a última das quais é uma ESPERA de 7 dias à vista em `app_state`
  (`limpeza:pastas-de-pedidos-apagados`): só sai o que continuar candidato.
  As fotografias não têm cópia dos bytes — o que sai não volta.

