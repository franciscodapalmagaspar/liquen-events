# Moloni — artigos nas propostas e rascunhos de fatura

> Pedido dela, 5/11/2026. Guardado no mesmo dia, como manda o `CLAUDE.md`.

## O pedido, nas palavras dela

- «Eu na faturação preciso de artigos. Tenho um artigo que é para materiais, outro artigo para decoração floral, um para montagem e desmontagem, um para transporte e outro artigo de serviços no Moloni. O que era interessante era ter estes artigos nas propostas.»
- «Quero mesmo fazer isso tudo o que estás a dizer, mais ligar ao Moloni.»
- «Que é para nos poupar trabalho … isso passa já tudo para o Moloni, mas não o faz. Apenas fica como rascunho. Depois é só chegarmos lá e aceitarmos e verificarmos se está tudo bem.»
- «Super simples, que é para não ser difícil.» «Que tudo bata certo.»
- E o custo da Vercel «otimizado ao máximo, mesmo com a API do Moloni».
- A Catarina (CEO), no mesmo dia: «os pagamentos é 30-70%. Não há 30-50, é sempre 30-70 para todos.»
- «Eu acho que nós não temos o plano que dá para a API … é bom que ou dê para copiar ou algo que tu achas que é mais fácil, para depois nos dar menos trabalho, mesmo sem API.»
- «Quando nós estivéssemos a fazer a proposta … colocar os valores para cada coisa para ficar para nós … nós não queremos que apareça para o cliente.» E: «não deixar enviar as propostas sem estabelecer um valor para cada coisa na proposta … para depois no Moloni estar tudo registado».

## O que ficou feito

| | O quê | Onde |
|---|---|---|
| 1 | Os seis artigos do Moloni dela, com o **nome e o código tal e qual estão lá** (capturas de 5/11) | `ARTIGOS` em `src/lib/orcamento/artigos-de-faturacao.ts` |
| 2 | No estúdio, cada linha do orçamento tem **preço** (só para nós) e **«Artigo do Moloni»**; cada valor adicional com número também tem artigo | `ProposalStudio.tsx`, `budgetArtigos`, `BudgetExtra.artigo` |
| 3 | **A proposta não se envia** sem preço e artigo em cada linha, e sem as linhas somarem o total — a Conferência marca-o, e a rota do envio recusa os mesmos erros | `oQueFaltaParaEnviar` (`precos-das-linhas`, `artigos-moloni`, `soma`) + `TRAVAM_NO_SERVIDOR` |
| 4 | No estúdio, o bloco **«Faturação por artigo»** mostra o sinal e o saldo de cada artigo, já calculados | `RepartoPorArtigo.tsx` (modo «linhas») |
| 5 | Nos pagamentos de cada cliente aceite (dossier e área Pagamentos), o cartão **«Faturação no Moloni»** | `PaymentsPanel.tsx` → `FaturacaoMoloni.tsx` |
| 6 | **Sem a API («Moloni por ligar»): passar à mão.** Cada fase mostra o cliente e o NIF, e cada artigo com o código e o valor sem IVA, cada um com o seu «Copiar» (o valor cola-se como `2535,00`); «Copiar tudo»; e **«Já está no Moloni»**, que regista a fase (com «Anular» no aviso) | `FaturacaoMoloni.tsx`, `POST …/moloni` com `manual: true` / `desmarcar: true` |
| 7 | **Com a API: «Criar rascunho no Moloni»** (sinal e saldo, um botão cada); «Ou passar à mão» continua lá | `POST /api/orcamento/[id]/moloni` → `src/lib/moloni.ts` |
| 8 | O sinal (30%) e o saldo (70%) por artigo, sem IVA, a somar ao cêntimo | `parcelasDaFatura` |
| 9 | **Propostas aceites ANTES disto** (sem preço por linha): o total reparte-se à mão pelos artigos no cartão, com «Sugerir» e «Pôr o resto em…» | `repartoPorArtigo`, `PATCH /api/propostas/[id]/reparto` |

### Os artigos (respostas dela, 5/11)

| No back office | Código no Moloni |
|---|---|
| Material | EXE.11 |
| Flores e Elementos de Decoração | EXE.2 |
| Serviço — inclui a montagem e desmontagem | EXE.4 |
| Transporte | EXE.5 |
| Alojamento | EXE.6 |
| Wedding Coordinator | EXE.10 |

Ficaram de fora, por escolha dela, os de catering (Bebidas EXE.7, Prestação de Serviço EXE.3, Coffeebreak EXE.8, Almoço EXE.9). Um artigo novo no Moloni entra aqui acrescentando uma linha a `ARTIGOS` com o código.

### Linha a linha nas novas; repartir o total só nas antigas

A primeira versão punha um artigo em cada linha. Medido nas propostas aceites (5/11, só leitura): **nenhuma tem preço por linha** — o dinheiro está no total escrito à mão, e três nem têm linhas. Por isso passou-se a repartir o total. Ela respondeu que o certo é o contrário: o valor de cada coisa põe-se **quando se faz a proposta**, e sem ele a proposta não sai — «para não andarmos a fazer contas». Ficou assim: as propostas novas faturam-se linha a linha (nada a repartir); a repartição do total fica só para as que já estavam aceites.

## As regras que não se negoceiam

- **Só rascunhos.** O código envia `status: 0` ao Moloni. Quem fecha a fatura (e lhe dá número) é ela, no Moloni. Nada é enviado ao cliente.
- **O preço de cada linha é só para nós.** Não sai no PDF nem na página do casal, tal como o artigo.
- **Tudo bate certo ou nada sai.** As linhas (ou a repartição, nas antigas) têm de dar o total sem IVA da proposta aceite (da versão escolhida, se tiver extras). Se não der, o cartão diz quanto falta ou sobra, e o Moloni não é chamado.
- **Os artigos encontram-se pelo CÓDIGO** (EXE.11, EXE.2…), e só o produto cuja referência é exactamente essa. O nome que vai para o rascunho é o do Moloni.
- **O IVA do artigo no Moloni tem de ser o da proposta.** Um artigo a 6% numa proposta a 23% pára tudo, com a frase a dizer qual.
- **O cliente encontra-se pelo NIF** (do pedido). Sem NIF, pelo nome exacto, e só se houver um. **Nunca se cria um cliente** daqui: o Moloni pede morada, país, prazo e meio de pagamento, e inventá-los numa fatura é pior do que pedir que o criem lá.
- **Uma fatura por fase.** Uma fase marcada «Já está no Moloni» (à mão) trava também o rascunho pela API, e vice-versa. O «Anular» só tira marcas feitas à mão — um rascunho criado pela API existe no Moloni, e apagá-lo do registo só esconderia que existe.
- **Um rascunho por fase.** Antes de falar com o Moloni, o pedido fica marcado «a criar» (caduca em 2 minutos): dois cliques ao mesmo tempo não dão dois rascunhos. Um segundo rascunho da mesma fase só com «Criar outro rascunho», que pede confirmação; o anterior fica guardado em `anteriores`. Cada rascunho fica no histórico do pedido.
- **Os preços por linha, os artigos e a repartição são internos.** Não saem no PDF nem na página do casal (`NUNCA_NO_PDF`), não conta para o selo da versão aceite, e **não entra na chave do PDF guardado** (`proposal-pdf-chave.ts`) — repartir depois do envio não obriga a redesenhar o PDF do casal.
- **Sinal 30%, saldo 70%.** Lido da proposta (`depositPercentOf`); todas as propostas na base estão a 30% (verificado a 5/11, só leitura).

## Custo (regra 7)

- **Quantas vezes corre:** só quando alguém carrega num botão. Não há tarefa agendada, polling, nem nada a correr sozinho.
- **Processador:** o cartão lê o pedido e as propostas quando abre (só para clientes com proposta aceite). Criar um rascunho são ~9 pedidos ao Moloni, quase tudo espera de rede.
- **Sem a API:** o «Copiar» é todo no navegador; «Já está no Moloni» é uma escrita no pedido, por gesto.
- **Guardado:** só o id do rascunho (ou a marca «à mão»), no pedido (`faturasMoloni`). O token do Moloni não se guarda: pede-se um por gesto, porque guardá-lo pedia armazenamento para poupar um pedido raro.

## Para ligar (é ela que o faz — as chaves nunca passam pelo código)

1. **Confirmar que o plano do Moloni inclui a API.** A documentação do Moloni diz que o acesso «depende do plano». **Não verificado** — não tenho acesso à conta.
2. No Moloni, em **Configurações → Developers**, ativar a API. Aparecem os campos «Developer ID» e «URI de resposta». Depois de os preencher e carregar em «Atualizar», o Moloni gera a **Chave Secreta** («Client Secret»). (Caminho segundo a documentação do Moloni; **não verificado** no ecrã.)
3. Na **Vercel** → projeto `liquen-events` → Settings → Environment Variables (Production), acrescentar:

   | Variável | O que é |
   |---|---|
   | `MOLONI_CLIENT_ID` | o Developer ID |
   | `MOLONI_CLIENT_SECRET` | a Chave Secreta |
   | `MOLONI_USERNAME` | o email de entrada no Moloni |
   | `MOLONI_PASSWORD` | a palavra-passe desse utilizador |
   | `MOLONI_COMPANY_ID` | o número da empresa no Moloni |
   | `MOLONI_DOCUMENT_SET_ID` | opcional — a série das faturas |

   Sugestão: um utilizador do Moloni só para isto, para não ser a palavra-passe pessoal de ninguém.
4. Voltar a publicar o site (as variáveis só entram numa publicação nova).
5. No cartão, o ponto passa a «Ligado ao Moloni». Os artigos procuram-se pelo código (tabela acima).

## O que fica por verificar

- **Se o Moloni aceita colar `2535,00`** (vírgula, sem milhares) no preço do artigo. É o formato português; **não verificado** no ecrã do Moloni.
- **A ligação verdadeira.** Os testes falam com um Moloni de mentira, construído pela documentação oficial (`https://www.moloni.pt/dev/`). A primeira fatura verdadeira é a prova: abrir o rascunho no Moloni e conferir cliente, artigos, valores e IVA antes de o fechar.
- **Revisão independente** (5/11): um revisor leu o código à procura de erros. As conclusões e o que se corrigiu estão no PR.
