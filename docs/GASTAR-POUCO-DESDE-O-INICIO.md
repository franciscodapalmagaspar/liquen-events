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

