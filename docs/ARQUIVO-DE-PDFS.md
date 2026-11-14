# Arquivo de PDFs: guardar menos sem apagar nenhuma proposta

> **Pedido (14/11):** o bucket `proposal-pdfs` cresce ~100 MB por mês no plano
> gratuito do Supabase (1 GB). O Francisco NÃO quer apagar propostas: «imagina
> que precisamos de ver outra vez».
> **O que se estudou:** o «arquivo com prova», em que as propostas aceites
> guardam o PDF e as outras guardam a «receita» (o documento exacto). O PDF
> refaz-se a pedido, e o binário só sai quando se prova que a receita dá os
> mesmos bytes (`pdf_sha256`).
> **Estado:** investigação. **Nada foi apagado.** A única alteração de código é
> a correcção do determinismo (ver §1). Mexe no PDF sem mudar o aspecto, e
> precisa da aprovação dela antes de entrar num lote.

---

## Resumo: a recomendação

1. **A receita sozinha NÃO serve de arquivo com prova.** O gerador passou a ser
   determinístico (corrigido aqui), mas a igualdade byte a byte também depende
   de quatro coisas que mudam com o tempo:
   - o código do desenho: 19 commits em 22 dias;
   - as fotografias: nas 2 propostas verificadas em produção, uma foto referida
     está hoje na Reciclagem;
   - as medidas da biblioteca;
   - as versões do `sharp`/libvips.

   Uma proposta de há um mês já não se refaz igual com o código de hoje.
   Nenhum dos 65 PDFs guardados se consegue reproduzir byte a byte (ver §4).
2. **Recomendado: o «PDF desmontado».** 98 % dos bytes de um PDF são imagens
   JPEG embutidas tal e qual. Guarda-se:
   - cada imagem UMA vez, pelo resumo do conteúdo;
   - o resto do ficheiro (o «esqueleto», ~35 KB comprimido).

   Remontar é concatenar. **A prova faz-se no próprio dia**: remonta-se, e
   compara-se com o `pdf_sha256` antes de tirar o original. Não depende do
   código, das fontes, das fotos nem da paleta. Medido (§6):
   - **byte a byte igual em 5 de 5 PDFs**, incluindo um gerado antes da
     correcção;
   - **72 %** de espaço poupado num conjunto com versões da mesma proposta;
   - **0,2 %** num PDF sozinho: a poupança vem de partilhar imagens entre PDFs.
3. **O que se mantém sempre inteiro:**
   - **o PDF aceite** (decisão dele);
   - **o PDF «quente»**: os primeiros 30 dias depois do envio, quando o casal
     ainda abre o link.
4. **Se mesmo assim não chegar:** os PDF frios inteiros passam para fora do
   Supabase, para o Cloudflare R2 (10 GB grátis, saída grátis) ou para o
   Google Drive. É uma cópia dos mesmos bytes, verificada pelo `sha256`, sem
   perder a prova.

---

## 1. Determinismo: a geração dá os mesmos bytes?

**Antes da correcção, não.** O teste foi o documento TESTE de
`montar.casos.test.ts`, com 24 fotografias de `public/imagens` (não há fotos
de clientes). Gerou-se 3 vezes no mesmo processo e 1 vez noutro:

| geração | sha256 (início) | bytes |
|---|---|---|
| a-0 | `a9a494afa830…` | 2 066 904 |
| a-1 (+1,5 s) | `a42e296cff8d…` | 2 066 903 |
| b-0 (outro processo) | outro | 2 066 902 |

Comparadas objecto a objecto com o `pdf-lib`, havia 21 a 23 objectos
diferentes, e **duas fontes de variação**:

1. **A data** (`CreationDate`/`ModDate`). O `PDFDocument.create()` carimba o
   instante. Isto já estava medido em `proposta-versao.ts`.
2. **A ordem das imagens.** O conjunto das 53 imagens era o MESMO nas três
   gerações (resumo do conjunto `1a19940acc69` em todas). O que mudava era a
   ordem:
   - `fotoNaCaixa` embutia cada imagem quando a preparação dela ACABAVA;
   - as páginas pedem as fotos em `Promise.all`;
   - por isso as imagens trocavam de número de objecto, e de nome na página,
     entre gerações (16 a 18 trocadas).

   Em produção é pior, porque a latência do Storage baralha a ordem a cada
   geração.

O que NÃO varia (verificado):
- as fontes (subconjunto do Jost e da Bodoni, nome com gerador de semente fixa
  do `pdf-lib`);
- a compressão;
- o grão (semente fixa, `comGrao`);
- as JPEG do `sharp`;
- os ids das fotos (`proximoId`, atribuídos antes de qualquer `await`);
- a validade (`validUntil`, que o envio congela dentro do `doc`).

### A correcção (neste ramo)

- **`moldura.ts` (`fotoNaCaixa`):**
  - a preparação (o `sharp`, a parte cara) continua em paralelo;
  - embutir e desenhar passam a seguir a ordem em que as fotos foram PEDIDAS,
    através de uma «vez» no contexto, marcada antes do primeiro `await`;
  - custo: nenhum processador a mais, porque só a escrita no PDF fica em fila.
- **`montar.ts`:**
  - nova opção `criadoEm?: Date`;
  - com ela, a data gravada é essa;
  - sem ela, fica como sempre (o instante do desenho). Nenhuma rota mudou.
- **`texto.ts`:**
  - as duas letras embutem-se uma a seguir à outra, e não em `Promise.all`;
  - já saíam pela mesma ordem, mas agora fica garantido;
  - não se perde tempo: é trabalho do processador.
- **Teste novo, `pdf-editorial/determinismo.test.ts`:**
  - põe um atraso ao acaso na preparação, como o do Storage;
  - exige o mesmo sha256 em duas gerações;
  - **sem a correcção falha** (`48fae267…` ≠ `c81cf867…`), e com ela passa.

**A prova** (depois da correcção, `criadoEm` = 2026-11-14T10:00:00Z):

| geração | sha256 |
|---|---|
| c-0, c-1 (mesmo processo, 1,5 s entre as duas) | `26dcbfcdaf9a517e42b48119a839aa5ea6e3c3ec21bbc48dfb189d052e987340` |
| d-0, d-1 (outro processo) | `26dcbfcdaf9a517e42b48119a839aa5ea6e3c3ec21bbc48dfb189d052e987340` |

**O aspecto não mudou.** As 18 páginas do PDF de ANTES (a-0) e do de DEPOIS
(c-0) foram rasterizadas com `pdftoppm`:
- a 100 ppp, **18 de 18 PNG iguais byte a byte**;
- as páginas 4 a 9 a 200 ppp, também iguais.

Os 270 testes de `pdf-editorial`, `paleta-do-pdf` e `proposal-doc-render`
passam, e o `tsc` está limpo.

> Fica por decidir (é dela): passar o `criadoEm` no envio. Sem ele, o PDF
> continua com a data do instante, e a receita teria de guardar essa data.
> Pode tirar-se do próprio PDF guardado no dia de arquivar (`getCreationDate`,
> ao segundo).

---

## 2. A receita: fica guardado o documento EXACTO do envio?

**Quase.** O que está garantido:
- `proposals.doc` é gravado no envio, com os caminhos do Storage (`tema:…` ou
  `<pedido>/<uuid>.jpg`), a validade congelada e o `idioma`;
- **uma proposta que já seguiu nunca é reescrita.** Um reenvio é uma proposta
  nova, e só a `rascunho` (por enviar) é reaproveitada (rota
  `proposta-doc`, «REENVIAR NÃO PODE SER GERAR OUTRA»);
- em produção, `versao_em > sent_at` dá **0 de 48** propostas;
- `pdf_sha256`/`pdf_bytes` = o resumo do `pdfBuffer` que seguiu em anexo;
- o ficheiro fica em `proposal-pdfs/<proposta>/<chaveDoPdf>.pdf`, e a chave é
  o resumo do `doc` canónico + língua (`proposal-pdf-chave.ts`);
- `envio-de-proposta:<pedido>` no `app_state` guarda o EMAIL (destinatário,
  corpo, nome e tamanho do anexo), não o documento.

**Mas o `doc` de uma proposta enviada PODE mudar depois.** Três sítios
escrevem nele:
1. `theme-materializar.ts`: quando uma foto sai da Biblioteca, copia os bytes
   para a pasta do pedido e troca `tema:x` por `<pedido>/<uuid>.jpg`. Os bytes
   são iguais, mas as **medidas** passam a vir de outro sítio (ver §3);
2. `propostas/[id]/reparto`: escreve `repartoPorArtigo`, que a chave do PDF
   ignora de propósito (`semFaturacao`);
3. `contrato-do-ganho`: só selos.

Por isso, a receita que conta não é o `doc` de hoje: é **uma cópia congelada
no envio** (o `doc`, a língua, `criadoEm`, a versão do desenho, os resumos das
fotos). Ainda não existe. Seria uma linha JSON por proposta: ~20 KB com 80
fotos, ou seja, < 1 MB por ano.

---

## 3. Dependências da reprodução: o que parte a igualdade com o tempo

| dependência | onde vive | muda com o tempo? | como fixar |
|---|---|---|---|
| **código do desenho** (`pdf-editorial/`, textos fixos, `SITE`, contas) | o deploy | **sim, ~1× por dia**: 19 commits desde 23/10 nos ficheiros do desenho e dos textos | uma «versão do desenho» gravada no envio. Antes de cada mudança de desenho, gerar e guardar o PDF de todas as arquivadas. Ou manter o código antigo vivo, o que é impraticável a este ritmo |
| **fotografias originais** | `theme-assets` / `proposal-assets` | **sim**: a Reciclagem leva-as e a junção dos duplicados troca caminhos | marcar as fotos das receitas como «presas», para as limpezas da noite não as levarem. Hoje `materializar` protege as propostas, mas ver o achado abaixo |
| **foto que não se encontra** | `resolveImages` | — | **perigoso**: em `fotosDasPaginas` cai em SILÊNCIO para a escolha automática, e o PDF refeito sai com OUTRA foto, sem erro |
| **fotos reduzidas e tratadas** | `fotos-editoriais` (cache, apagada aos 30 dias) | refazem-se a partir dos originais | deterministas com o mesmo `sharp`/libvips (`preparadas-guardadas.ts`, `VERSAO_DO_TRATAMENTO`) |
| **medidas da biblioteca** | `biblioteca_fotos.largura/altura` por caminho | **sim**: um caminho novo (materializar, junção) pode não ter linha, e cai na medida lida da reduzida | guardar as medidas usadas na receita |
| **fontes** | base64 dentro do código (`letras.ts`) | só com o código | entram na versão do desenho |
| **paleta** | calculada das fotos (`paleta-das-fotos.ts`) ou escolhida no `doc` | segue as fotos e o código | idem |
| **`sharp` / libvips / `pdf-lib`** | `package-lock.json` (`^0.35.4`, `^1.17.1`) | sim, numa actualização | entram na versão do desenho |
| **data de criação** | dentro do PDF | sempre | `criadoEm` (§1) |

**Achado em produção (só leitura):** as duas propostas verificadas em §4
referem `tema:8990318f…/bbd2fa5c….jpg` em `fotosDasPaginas`
(`separador:tema-7` e `-8`):
- uma delas está ENVIADA e a outra ACEITE;
- a foto foi para a Reciclagem da Biblioteca a 6/11
  (`theme-assets/reciclagem/96d76de9…/`);
- as duas propostas foram enviadas a 12/11, já com a foto fora. O PDF de então
  saiu com a escolha automática nesse lugar.

É o caso que mostra o perigo. **Se a foto voltar da Reciclagem, o PDF refeito
passa a ter OUTRA imagem nesse separador, e nada avisa.**

---

## 4. Teste em produção (só SELECT, pelo MCP, a 14/11)

| | valor |
|---|---|
| ficheiros em `proposal-pdfs` | **65 (138,4 MB)**, em 58 pastas, de 22/08 a 12/11 |
| por mês | ago 18 (18,6 MB, 1,04 MB/PDF) · set 8 (9,2 MB) · out 20 (57,5 MB, **2,87 MB/PDF**) · nov até 12/11: 19 (53,1 MB, 2,79 MB/PDF) |
| propostas | 48, todas com `doc` e `pdf_sha256` (10 em inglês) |
| enviadas | 38 propostas → 40 ficheiros, 97,3 MB |
| aceites | 8 propostas → 10 ficheiros, 21,9 MB (8 contratos, todos com selo) |
| rejeitadas | 2 propostas → 2 ficheiros, 3,3 MB |
| pastas sem proposta | 10 pastas, 13 ficheiros, 15,9 MB (a limpeza da noite só as leva se ninguém as mencionar) |
| pedidos com várias versões | 10 de 32, com **69,2 MB**: é aqui que o «desmontado» poupa |
| fotos nos `doc` | 2 061 usos, mas só **1 053** fotos distintas (958 da Biblioteca) |

**As duas propostas tentadas:**
- `cbec4522…`: enviada a 12/11, 2,7 MB, 20 fotos referidas;
- `39f1a314…`: a aceite mais recente com o ficheiro do selo.

Em cada uma, todas as fotos têm medida em `biblioteca_fotos`. **Falta 1 foto em
cada uma**: está na Reciclagem (ver o achado acima).

O que seria preciso para tentar reproduzir de facto:
- **a chave de serviço** (`SUPABASE_SERVICE_ROLE_KEY`) num ambiente local, ou
  uma rota de admin só de leitura, para descarregar o PDF e os originais. Não
  há chave aqui;
- **o código do deploy desse dia**: o commit pela hora do envio, em
  `list_deployments` da Vercel;
- **e mesmo assim falharia.** Os 65 PDFs foram gerados ANTES da correcção do
  §1, com as imagens pela ordem de chegada do Storage, e essa ordem não se
  repete.

**Conclusão: nenhum PDF existente se reproduz byte a byte.** Só a partir do
deploy desta correcção, e apenas enquanto o código do desenho não mudar.

---

## 5. Custo

**Processador para refazer um PDF a pedido.** Medido nesta máquina, com o
documento TESTE de 24–25 fotos (18 páginas, ~2 MB):

| situação | tempo | CPU |
|---|---|---|
| a frio (tudo preparado de novo) | 6,5–8,9 s | 6,7–6,8 s |
| a quente (preparadas em memória) | 0,7–0,9 s | 0,6–0,8 s |

Em produção, a 3/11, cada PDF inteiro custava ~10 s de CPU
(`preparadas-guardadas.ts`). Com as preparadas no Storage fica entre os dois
valores, e acrescenta ~2–3 MB de leitura do Storage por PDF (a saída conta
para os 5 GB/mês).

**Quantas vezes se abrem propostas antigas.** Não se mede: a casa não regista
aberturas, por decisão dela (`envios-de-proposta.ts`). A estimativa é de
poucas por mês: uma dúvida do casal, uma comparação, o contrato. Mesmo a 20
por mês, a ~10 s cada, são ~3 min de CPU por mês, cêntimos no Pro. **O custo
não é o processador: é a prova**, que se perde (§3).

**Espaço.** Hoje são 138 MB, e crescem ~100 MB por mês (~36 envios a 2,8 MB).

| plano | o que fica no Supabase | poupança estimada |
|---|---|---|
| receita, para todas menos as aceites | aceites + 30 dias quentes | ~80 % do crescimento, **sem prova** |
| **desmontado** (recomendado) | imagens únicas + esqueletos | medido **72 %** com versões; em produção **estimo 35–55 %**, por medir |
| desmontado + frios no R2/Drive | só o quente no Supabase | ~100 % do crescimento fora do plano gratuito |

**O quente e o frio.** O link do casal é aberto sobretudo nos primeiros dias.
Proposta:
- PDF inteiro durante **30 dias** depois do envio;
- depois desmonta-se, ou passa para fora, se não for aceite;
- a aceite fica sempre inteira.

---

## 6. Alternativas sem apagar, com números

| alternativa | medido | prova | veredicto |
|---|---|---|---|
| **deduplicar imagens DENTRO de um PDF** | 0 imagens repetidas em 53, porque o `pdf-lib` já embute cada chave uma vez (`ctx.embutidas`) | — | **0 %**: não há o que tirar |
| **imagens partilhadas ENTRE PDFs (desmontado)** | 5 PDFs (v1, v2 com outro preço, v3 com menos uma foto, c-0, a-0): **10,32 MB → 2,86 MB (−72 %)**, com **sha256 igual em 5/5** depois de remontar. Esqueleto: ~35 KB (gzip). Um PDF sozinho: −0,2 % | **byte a byte, verificada no momento** | **recomendado** |
| **Google Drive (15 GB)** | 15 GB ≈ 5 500 PDFs ≈ 4,5 anos a 100 MB/mês | bytes iguais, `sha256` | precisa de uma credencial OAuth da conta dele guardada na Vercel. Uma conta de serviço não tem quota própria no Drive pessoal (a confirmar). Dados de clientes na Google: dizer-lhe |
| **Cloudflare R2 (10 GB grátis, saída grátis, API S3)** | 10 GB ≈ 3 600 PDFs ≈ 3 anos a 100 MB/mês, ou muito mais se desmontados | bytes iguais | **a melhor casa para o frio**. Já é a referência em `GASTAR-POUCO` («No R2 (90% de 10 GB)»). Pedir a activação exige um meio de pagamento na conta Cloudflare |
| receita e refazer a pedido | — | **não se mantém** (§3) | só como recurso, nunca como prova |
| baixar a qualidade das imagens do PDF | — | muda o aspecto | **não**: o PDF tem a aprovação dela |

**Porque é que o desmontado funciona:**
- o `pdf-lib` grava cada JPEG (`DCTDecode`) tal como o `sharp` a fez, ou
  seja, os mesmos bytes da `preparada:<sha>`;
- a mesma foto, na mesma caixa e com o mesmo tratamento, dá a mesma JPEG
  (determinística). É o que acontece entre versões de uma proposta e quando
  duas propostas usam a mesma foto da Biblioteca na mesma disposição;
- cortar essas sequências do ficheiro e guardá-las pelo resumo é reversível
  por concatenação, porque não se reinterpreta nada.

A prova de conceito (`desmontar.mjs`, ~60 linhas, não está no commit):
- lê os objectos `/Image` com o `pdf-lib`;
- localiza cada um no ficheiro (`indexOf`) e só corta o que é inequívoco;
- comprime o esqueleto;
- remonta e compara o `sha256`.

**Limite:** o fundo «arrastado» depende do número da página
(`anguloDaPagina`). Uma versão com uma página a mais antes dele gera outra
imagem de fundo, que já não se partilha.

---

## 7. Plano proposto (por fases; nada apaga sem a autorização dele)

1. **Lote seguinte, com a aprovação dela por mexer no PDF:** a correcção do
   determinismo (este ramo). Não muda o aspecto, como provado no §1.
2. **Arquivo desmontado, ao lado** (sem apagar):
   - bucket privado `proposal-pdfs-arquivo`;
   - `img/<sha256>.jpg` para as imagens e `esq/<proposta>/<chave>.gz` para os
     esqueletos;
   - uma tabela ou linha `app_state` com os cortes.

   A tarefa da noite desmonta, remonta, compara com o `pdf_sha256` (ou com o
   selo do contrato) e regista «provado». Nas primeiras semanas mede-se a
   poupança REAL sem tocar no original.
3. **Só depois, com a autorização dele:**
   - o original de uma proposta NÃO aceite, com mais de 30 dias e «provada»,
     sai do `proposal-pdfs`;
   - as rotas do link e do portal servem a remontada (concatenar: ~0 CPU,
     ~50 leituras pequenas do Storage);
   - a aceite fica sempre inteira;
   - a mesma espera de 7 dias e as mesmas portas de `limpar-pdfs-substituidos`.
4. **Quando o Supabase apertar:** as imagens únicas e os esqueletos frios
   passam para o R2. São os mesmos bytes, com a mesma prova.
5. **Independentemente disto:**
   - congelar a receita no envio (§2), como documentação;
   - ligar o `criadoEm`;
   - tornar RUIDOSA a foto em falta em `fotosDasPaginas`, que hoje cai em
     silêncio para a escolha automática.

As três perguntas da regra 7, para a fase 2:
1. **Quantas vezes corre:** uma por PDF novo, na noite seguinte. Hoje são
   ~1–2 por noite, e os 65 antigos uma vez só, em lotes.
2. **Quanto processador:** carregar com o `pdf-lib` + `indexOf` + gzip +
   `sha256` ≈ < 0,5 s por PDF (não medido em produção). A leitura do PDF ao
   Storage é ~2,8 MB de saída por PDF, uma vez.
3. **Guardar / build / navegador:** guarda-se. É o próprio arquivo.

---

## 8. Riscos

- **Remontar depende de o desmontado estar inteiro:** uma imagem única que se
  perca estraga todos os PDFs que a usam. Por isso:
  - as imagens do arquivo nunca entram nas limpezas da noite;
  - nada se apaga sem a remontagem provada;
  - fica uma contagem de referências por imagem.
- **Sem a correcção, os PDFs novos não são reproduzíveis**, mas o desmontado
  NÃO precisa dela: funciona sobre os bytes, de qualquer geração (provado com
  a-0).
- **Serviços fora do Supabase (R2, Drive):** uma credencial nova e dados de
  clientes noutro fornecedor. É decisão dele.
- **O que ficou por verificar:**
  - a poupança real nos 65 PDFs de produção (falta a chave de serviço para os
    descarregar);
  - a frequência real de abertura de propostas antigas;
  - a quota de uma conta de serviço no Google Drive;
  - o determinismo entre máquinas diferentes. Aqui foi Linux x64 com o mesmo
    `node_modules`; a Vercel também é Linux x64, mas não foi medido lá.
