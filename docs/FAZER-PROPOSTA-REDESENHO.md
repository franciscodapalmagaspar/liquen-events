# Redesenho do «Fazer proposta» — pedido dela de 9/11/2026

## O pedido, nas palavras dela

> «Lê o painel todo da Liquen da fazer a proposta. Analisa tudo, mas tudo, mas
> tudo. […] eu preciso mesmo que a parte de fazer a proposta esteja incrível. E
> neste momento está uma confusão brutal. […] Tem que ser muito melhor, muito
> mais profissional […] Não se percebe nada. E quem não percebe de, sei lá,
> mexer em computadores, aquilo vai ser uma grande confusão. […] O tornar mais
> acessível para a forma não é piorar. É melhorar ainda mais.»

> «É mesmo importante que a visualização do slide ao lado é em tempo real […]
> que aquilo que se está a ver é aquilo que vai sair.»

> (antes, no mesmo dia) «isto aparece assim meio, parece que está tipo cortado
> […] à medida que vamos fazendo scroll, estas fotos, as páginas vão mudando […]
> na parte do orçamento, está uma grande confusão […] Mesmo a parte da
> inspiração está uma confusão.»

O que NÃO muda (vale o `docs/FAZER-PROPOSTA-MELHORIAS.md`, «O que não pode
mudar», e as decisões dela já registadas): os cálculos do orçamento, do IVA, do
sinal e do saldo; os textos das condições; o desenho do PDF; as propostas já
enviadas; a barra de baixo («Fica a barra de baixo»); a regra única do envio
(`oQueFaltaParaEnviar`) e os cinco passos (`passos-do-estudio.ts`).

## Parte −1 — o estado

| Fase | O quê | Estado |
|---|---|---|
| 0 | A página ao lado: não cortada, segue o scroll, só a real, 1 s | **feito** — PR #389 |
| 1 | A moldura: menos coisas antes do formulário | **feito** — PR #389 (ver em baixo) |
| 2 | Orçamento: o que o cliente vê, o resumo, e o que é só para nós separados | **parcial** — PR #389: a ordem (linhas → valores adicionais → total → só para nós) e as palavras «Total e validade» / «Como entram no total». Falta: o resumo colado às linhas e as palavras «Como escala» e «Extra» |
| 3 | Inspiração: começar é óbvio, cada mood board lê-se de relance | **parcial** — PR #389: sem mood boards, um começo com o que é e «Começar um mood board»; «À escolha do casal» só depois. A «Vista de conjunto» FICA (tem o «Mudar fotografia» de cada página, que o painel não tem). Falta: o cartão de cada mood board |
| 4 | Serviços e Evento: grupos e linhas que se leem como uma lista | por fazer |
| 5 | Rever e enviar: o que falta primeiro, depois o PDF, depois o email | por fazer |

### Onde a fase 1 se afastou do plano

- **O índice da esquerda fica no telemóvel.** Escondê-lo partia uma decisão
  anterior com testes próprios («existe em todas as larguras», `NavEstudio`).
  Com o cabeçalho a uma linha e as ações no «⋯», o primeiro campo já sobe de
  ~1 000 px para ~430 num iPhone. Fica para ela decidir.
- **As barras de baixo continuam a flutuar por cima do formulário a meio do
  scroll** — é o que uma barra que flutua faz; no fim da página há espaço para
  nada ficar tapado.
- **A nota do negócio («Notas internas», no Evento) fica aberta**; as outras
  cinco fecham-se quando estão vazias.

## O que a análise encontrou (capturas a 1440 px e num iPhone, 9/11)

### Em todos os passos

1. **Muita coisa antes do formulário.** No computador, 360 px de cabeçalho,
   cartão «Proposta para», linha «Estúdio de propostas (PDF)» com quatro
   botões, e a barra dos passos. No telemóvel são ~1 000 px — o primeiro campo
   aparece ao segundo ecrã.
2. **Duas navegações a dizer o mesmo.** A barra dos passos (1–5) e o índice da
   esquerda (Evento, Capas, Serviços, Mood boards, Orçamento, Total) — no
   telemóvel o índice vira uma fila de pastilhas por baixo dos passos.
3. **As barras de baixo tapam campos.** A barra do estúdio (guardado · total ·
   seguinte) e a barra do back office ficam por cima do formulário: na captura
   do Evento, o campo «Cerimónia» e o «Título interno» ficam por baixo delas.
4. **Notas «só para ti» em cada secção.** Uma caixa cor de pêssego, aberta, em
   cada cartão (Evento, Capa, Serviços, Mood boards, Orçamento, Total) — seis
   caixas vazias que parecem campos por preencher.
5. **Linguagem de quem fez o sistema**, não de quem o usa: «Como escala»,
   «Extra», «Rótulo do total», «Como contam no preço final», «Secções do
   documento», «De um modelo…».
6. **Dois «Decoração / Organização»**: a escolha do tipo de proposta vive dentro
   do passo Evento, ao lado de «Proposta bilingue», como se fosse um campo.

### Orçamento (o passo pior)

7. **Sete blocos seguidos sem hierarquia**: linhas → rótulo do total → valores
   adicionais (com um selector e uma frase de três linhas) → faturação por
   artigo (interno, a meio do que o cliente vê) → nota → «Só para ti» (custos,
   margem, deslocação) → «Total, IVA e validade» → totais.
8. **O total está longe das linhas** — no fim do passo, três ecrãs abaixo.
9. **O valor está escrito duas vezes**: a soma das linhas, e outra vez em
   «Valor (sem IVA)», com uma frase a explicar que é o mesmo número.
10. **Os campos internos (artigo do Moloni, subpontos) misturados** com os que
    saem no PDF, com o mesmo peso visual.
11. **Selectores nativos** (cinzentos do sistema) ao lado dos campos da casa.

### Inspiração

12. **Começar não é óbvio**: sem mood boards, o passo mostra «+ Adicionar mood
    board» como uma ligação pequena e «De um modelo…» como texto solto; e logo
    a seguir «À escolha do casal», que só faz sentido depois.
13. **A «Vista de conjunto» repete o painel da direita** (as mesmas páginas, em
    grelha, por baixo do formulário).

### Rever e enviar

14. **A conferência vem no fim**, depois do email inteiro, e lista doze coisas
    certas para uma errada.
15. **«Por onde segue» é a primeira coisa**, antes de se saber se a proposta
    está pronta.

## O plano, por fases — uma por PR, com capturas antes e depois

Cada fase mexe só no desenho do estúdio. Nenhuma toca no PDF, nos cálculos, nem
nos dados gravados: um rascunho de antes abre igual depois.

- **Fase 1 — a moldura.** Uma só linha em cima: «Proposta para Sofia e Tiago»,
  o tipo (Decoração/Organização) e um menu «⋯» com Criar a partir de, Guardar
  como modelo, Limpar rascunho, Abrir o pedido e Trocar de cliente. O índice da
  esquerda sai no telemóvel (os passos chegam). Espaço por baixo do formulário
  para as barras nunca taparem um campo. As notas «só para ti» passam a uma
  ligação «+ Nota só para nós» que abre a caixa — aberta quando já há nota.
- **Fase 2 — Orçamento.** Três blocos com nomes claros: «O que o cliente vê»
  (as linhas, com o preço à frente, e os valores adicionais como mais linhas),
  «Resumo» (subtotal, IVA, total, sinal e saldo, colado às linhas), e «Só para
  nós» (artigos do Moloni, subpontos, custos e margem, deslocação, faturação
  por artigo) — fechado por omissão. As palavras passam a ser as dela.
- **Fase 3 — Inspiração.** Sem mood boards, três portas grandes: «Começar de um
  modelo», «Mood board em branco», «Da biblioteca». A «Vista de conjunto» sai
  onde o painel da direita está à vista. «À escolha do casal» vai para o fim.
- **Fase 4 — Serviços e Evento.** Os grupos de serviços como cartões com o
  título grande e as linhas por baixo; campos do evento agrupados (quem, quando,
  onde).
- **Fase 5 — Rever e enviar.** Primeiro «Está pronta?» (só o que falta, e uma
  linha a dizer que o resto está certo), depois o PDF, depois o email e por
  onde segue.

## Como se prova cada fase

Capturas antes e depois a 1440 px e num iPhone, os testes do estúdio verdes, e
um rascunho antigo aberto para ver que nada se perdeu.
