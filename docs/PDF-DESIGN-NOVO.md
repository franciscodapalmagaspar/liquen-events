# PDF da proposta — o design novo (23/10)

Este é o documento dela, tal como o mandou no chat a 23 de outubro de 2026,
com o modelo `Modelo-Proposta-Liquen.pdf` (18 páginas, exemplo «Claudia Cruz»).
Fica aqui para não se perder: **um documento que ela manda guarda-se em `docs/`
no mesmo dia.**

O modelo **não vai para o git** (traz fotografias e um cliente): está em
`referencia/modelo-novo-23-10/`, que o `.gitignore` deixa de fora. Quem
continuar precisa de lho pedir outra vez se a pasta não estiver lá.

Substitui o desenho de `docs/PDF-EDITORIAL.md` (o escuro com o dourado). O que
lá está decidido sobre DADOS e LÓGICA continua a valer: capítulos de
inspiração, casamento e não casamento, a escolha das fotografias e das
disposições, e a paleta tirada das mesas. Onde este documento contradiz uma
decisão de desenho de lá, ganha este, porque é mais recente e é dela. Por
exemplo, o fundo desfocado passa a ser o fundo «arrastado» das páginas de
texto, e o dourado sai.

## Parte −1 — o que está feito e onde a execução se afasta do texto

Feito a 23/10 no PR `feat/pdf-design-novo` (#273). **Ela aprovou-o a 23/10:
«Sim, põe no site».**

**E escolheu «letra simples» para os sobretítulos e as notas (23/10).** Tudo o
que o documento pedia em Bodoni itálica — os sobretítulos («o investimento»,
«a proposta», «inspiração · 01», «obrigada»…), as notas descritivas e os
números do índice e dos serviços — passou à **Jost 400**. Os sobretítulos
ficam em minúsculas, no mesmo tamanho e no mesmo lugar, e a hierarquia faz-se
com a cor: o **Linho** nas páginas de texto e o **Papel** sobre as fotografias
(sobre a fotografia, no tecto de luz 0,12, o Linho não chegava aos 4,5:1). As
notas passaram de 17 para 15 px, porque a Jost é mais larga e mais alta do
que a Bodoni itálica ao mesmo corpo. O «&» da capa deixou de ser itálico. **A
Bodoni fica só no preço total** (opsz 6, peso 500), e a itálica saiu do
`letras.ts`: o PDF leva duas letras, e não três.
O código está em `src/lib/pdf-editorial/`; os dados e a lógica (o plano das
páginas, a escolha das fotografias, as disposições, os capítulos, a paleta das
mesas, PT/EN, o rascunho, as contas e os textos legais) não mudaram.

Verificado com PDF de TESTE (dados inventados, fotografias da galeria pública
do site), um casamento e um jantar de empresa, em português e em inglês, postos
lado a lado com o modelo página a página. O jantar de empresa sai com as mesmas
18 páginas do modelo. Peso com 65 fotografias: 3,9 MB (galeria) e 4,6 MB
(fotografias fabricadas com grão) — o tecto é 8 MB.

**O feedback dela de 23/10 (16h), sobre o modelo:**

- **«não aparecem todas as fotografias… pelo menos aqui no telemóvel».** Todas
  as fotografias do nosso PDF saem em JPEG simples — *baseline* (não
  progressivo: o `mozjpeg` do sharp liga os varrimentos progressivos, e
  desligou-se), RGB de 8 bits, sem perfil de cor nem máscara, nenhuma acima de
  1 800 px. O logótipo é a única imagem com transparência (PNG). Um teste
  prende isto (`montar.casos.test.ts`, «todas as fotografias são JPEG
  baseline»). Verificado em dois motores: o pdf.js (Firefox) e o PDFium
  (Chrome) descodificam todas as imagens dos quatro PDF de teste e do de 65
  fotografias, sem nenhuma falha. **Num iPhone não foi verificado** — não há
  um aqui; o JPEG baseline em RGB é o formato que o leitor do iOS lê sempre.
- **«a paleta de cores vai buscar cores que não são… os castanhos».** A
  extracção (`paleta-das-fotos.ts`) passou a pesar cada pixel pela cor que tem:
  um vermelho ou um bordeaux pesa até sete vezes um neutro, um castanho escuro
  e baço (mesa, sala, sombra) quase nada, e os neutros claros (toalha creme,
  velas) o normal. O corte faz-se pelos pesos. Um castanho só entra se
  dominar. As cores continuam a vir das MESAS, como ela decidiu. Um teste com
  fotografias fabricadas (fundo castanho escuro, toalha creme, flores
  vermelhas e bordeaux) exige vermelho, bordeaux e creme na paleta.
- **A decisão dela sobre a paleta (23/10): «as paletas de cores é de acordo
  com as cores usadas nas mesas de jantar, em cima das mesas, e de acordo com
  o material de decoração utilizado / flores».** As cores saem do que está
  POUSADO nas mesas — flores, velas, castiçais, toalhas, louça, tecidos —, e
  não da sala, do chão, das paredes nem do céu. Em cada fotografia (das mesas,
  como antes): o recorte de «atenção» do sharp, e dentro dele o terço central e
  de baixo pesa por inteiro e o topo e os bordos quase nada; uma cor que vive
  no alto das fotografias (a parede) perde o peso. Tons quase iguais juntam-se.
  Um teste: uma sala de parede azul viva, e em cima da mesa flores vermelhas,
  toalha creme e castiçais dourados — a paleta dá vermelho, creme e dourado, e
  nenhum azul. Num PDF de teste com mesas fabricadas a paleta saiu creme,
  creme, terracota, vermelho e bordeaux.
- **«estes números não dá para perceber nada»** (a página do total, aberta no
  iPhone). No tamanho óptico 96 do documento, o traço fino da Bodoni mede
  0,2 % do corpo: a página inteira num iPhone tem ~390 px de largura, e o traço
  fino do preço de 85 px ficava com 0,06 px de ecrã; o «€» e as vírgulas
  desapareciam. Medido (o horizontal do «0» e a barra do «H», a 390 px):

  | Letra | traço fino | preço 85 px | marcos 32 px | sobretítulo 29 px | 24 px | 17 px |
  |---|---|---|---|---|---|---|
  | Bodoni opsz 96 (o documento) | 0,2 % | 0,06 px | 0,02 | 0,02 | 0,02 | 0,01 |
  | Bodoni opsz 28 | 0,7 % | 0,21 | 0,08 | 0,07 | 0,06 | 0,04 |
  | Bodoni opsz 11 | 1,8 % | 0,53 | 0,20 | 0,18 | 0,15 | 0,11 |
  | **Bodoni opsz 6** (agora) | 3,4–3,6 % | **1,00** | 0,38 | 0,36 | 0,30 | 0,21 |
  | Jost 400 | 8 % | 2,36 | **0,89** | 0,81 | 0,67 | 0,47 |

  O peso 500 engrossa as hastes, não o traço fino (medido igual). Por isso:
  1. **a Bodoni passa ao tamanho óptico 6 (o mínimo do eixo), peso 500**, no
     preço e no itálico — o preço grande fica com 1 px de ecrã;
  2. **os valores pequenos passam à Jost**: os marcos (sinal e saldo, Jost
     28) e os valores do quadro do orçamento (Jost 16), como já estava a
     tabela do total. Só o preço grande fica na Bodoni;
  3. **os sobretítulos, as notas e os números do índice e dos serviços**
     ficaram primeiro na Bodoni itálica no opsz 6 (traço fino de 0,3–0,4 px,
     abaixo dos 0,6); ela decidiu, no mesmo dia, «letra simples»: passaram à
     Jost (0,7–0,9 px de traço fino a 390 px) — ver no topo desta Parte.
- **O fundo arrastado claro por trás dos números.** O brilho ×0,42 é uma
  média: numa fotografia de amarelos e vermelhos vivos o fundo continuava
  claro. Agora, nas páginas de texto, o fundo perde saturação (×0,6) e leva
  um **tecto de luz medido**: o 98.º percentil da luminância do fundo, já com o
  grão, não passa de 0,07 (a Cal a ≥ 7:1, o Linho a ≥ 4,5:1); se passar, a
  zona escurece até lá. Nas páginas de fotografia (capa, separadores,
  citação, fecho, os temas com bloco de título) o mesmo na zona do bloco, com
  o tecto 0,12; nos cartões de «O que propomos», no terço de baixo. Medido
  contra a ZONA REAL por trás de cada bloco (o texto e os fios tirados da
  página, desenhada a 1 123 px) nos dois PDF de teste: tudo ≥ 4,5:1, e os
  números da tabela do total a 7,7:1 e 9,5:1.

| O quê | Estado |
|---|---|
| §2 Cores (Tinta, Cal, Papel, Linho, Pedra) | feito — `paleta.ts`; sem dourado; um teste mede o contraste na Tinta |
| §3 Letras (Jost 400, Bodoni Moda 400 normal e itálico, opsz 96) | feito — `letras.ts`, gerado por `scripts/gerar-letras-do-pdf.py`, com as licenças OFL em `src/lib/fonts/` |
| §3 Tamanhos | feito, com os desvios abaixo (entrelinhas) |
| §4 Bloco de título, moldura afastada, logótipo creme, rodapé | feito — `moldura.ts` |
| §5 Edição quente, grão, arrastado (−8° a −24°, 8 %, gaussiano 5 px), brilhos, escurecimentos | feito — `imagens.ts`, tudo fundido na JPEG; o logótipo é a única transparência (há um teste) |
| §6.1 Capa | feito |
| §6.2 Índice | feito |
| §6.3 A proposta | feito |
| §6.4 O que propomos | feito — até 3 cartões por página, repartidos por igual |
| §6.5 Paleta e ambiente | feito — 5 cores, 5 quadradas e o painel. **Desde 23/10 escolhem-se as fotografias** («sim, retoma a paleta e o enquadrar»): 6 lugares no estúdio (os 5 quadrados e o painel grande, no 6.º); um lugar sem escolha fica automático. As cores continuam a vir das mesas |
| Enquadrar (23/10) | feito — em qualquer página com fotografia, o seletor da página mostra o lugar escolhido na forma da caixa onde sai nítido (`formasDosLugares`) e deixa arrastá-lo, como a capa. Grava `fotosDasPaginas[chave].focos[lugar]`; trocar a foto apaga o enquadramento desse lugar. As regras estão em `lugares-escolhidos.ts` |
| §6.6a Separadores | feito |
| §6.6b Temas em mosaico (1, 2, 3, 4–5, 6–12, >12) e as disposições à mão | feito — `mosaico.ts` |
| §6.7 Citação | feito |
| §6.8 Investimento | feito — o total e, a seguir, o quadro das linhas no mesmo desenho |
| §6.9 Condições (3 páginas) | feito — com os textos da casa cabem nas três (ver abaixo) |
| §6.10 Contracapa | feito |
| §7 PT/EN, sobretítulos traduzidos | feito — `textos.ts` |
| Miniaturas do estúdio (`PaginaEditorial.tsx`) | feito na estrutura: as mesmas caixas, molduras, blocos e fotografias; as cores da paleta e o desfoque direccional são só aproximados |

**Onde a execução se afasta do texto, e porquê:**

0. **A Bodoni no tamanho óptico 6, e não 96, e só no preço total; tudo o resto
   na Jost** — os marcos e os valores do quadro (a legibilidade no telemóvel)
   e os sobretítulos, as notas e os números (a escolha dela, «letra
   simples»). Ver em cima.
1. **Entrelinha das notas em Bodoni: 1,45, e não 1,2.** Medido no modelo: as
   linhas de 17 px vão de 25 em 25 px. A 1,2 o itálico encavalita-se.
2. **Entrelinha dos itens das condições: 1,15, como o texto — e não os ~1,36
   do modelo.** Os textos da casa são bem mais compridos do que os do modelo; a
   1,36 as condições passavam para 4 ou 5 páginas. E se nem a 1,15 couberem, a
   letra desce meio píxel de cada vez até 12,5 px (o «encolhe até caber» das
   notas, aplicado a texto que não pode perder uma palavra); só abaixo disso é
   que continua na página seguinte.
3. **As condições: as notas correm pelas três colunas**, em vez de uma secção
   por coluna, e um ponto comprido pode partir-se entre colunas. Pelo mesmo
   motivo: com uma secção por coluna, uma coluna transbordava e as outras
   ficavam meio vazias. Do título às colunas ficam 60 px, e não 75.
4. **Os contactos ficam lado a lado numa faixa por baixo das colunas** do
   pagamento (como os dados de «A proposta», que é o que o texto diz), e não
   empilhados na primeira coluna como no modelo — empilhados não cabiam ao
   lado do faseamento e do cancelamento da casa.
5. **Não há separador do investimento** (o modelo não o tem); a página do
   total é a entrada «Investimento» do índice, e **o quadro das linhas do
   orçamento vem a seguir**, no mesmo desenho — tirá-lo era perder dados. Os
   valores do quadro vão em Bodoni itálico (o texto); os da tabela do total
   em Jost (o modelo).
6. **A citação vem depois de todos os capítulos** (a ordem do §6), e não a
   meio deles.
7. **O título do bloco de fotografia vai até 680 px**, e não à largura toda:
   é o que o modelo faz («DECORAÇÃO E DECOR / FLORAL DO JANTAR») e o que
   impede o título do separador de passar por baixo da fotografia emoldurada.
8. **O logótipo do rodapé fica a 18 px da borda direita** (o modelo), e não
   na margem de 72; nas condições não aparece, porque cairia em cima da
   fotografia da direita.
9. **Num casamento, as metades e o tríptico levam o bloco de título** na
   primeira página do tema: o separador diz o capítulo («Jantar») e o nome do
   tema perdia-se. Fora de um casamento ficam sem texto, como o texto pede, e
   **a nota desse tema passa para o separador**, que é o próprio tema — senão
   perdia-se.
10. **O subtítulo do tema só aparece na célula de texto num casamento**; fora
    dele já está na linha pequena do separador (o modelo não o repete).
11. **Um tema com uma fotografia** sai a página inteira com o bloco de título,
    como o texto pede — e por isso repete o título do separador que o abre.
12. **O separador evita as fotografias da página que vem logo a seguir** (a
    regra «nunca a mesma fotografia em páginas vizinhas»): se o capítulo não
    tiver outras, vêm de outro capítulo.
13. **O grão é sempre o mesmo para a mesma fotografia** (ruído com semente):
    o mesmo PDF gerado duas vezes dá os mesmos bytes.
14. **A nota de «A proposta»** é a primeira nota que ela escreveu nos temas: o
    documento não tem um campo para ela.
15. **A paleta tem 6 lugares** (5 quadradas e o painel, no fim). O PR paralelo
    `feat/pdf-paleta-e-enquadrar` faz destes lugares escolhas dela; quem juntar
    o segundo resolve o conflito.
16. **A data curta** (DD.MM.AAAA) lê-se da data dela; se não se ler, vai a data
    como está escrita.

---

## O texto dela

Prompt — novo design pré-definido das propostas da Líquen Events

Sou a Líquen Events, uma empresa portuguesa de decoração e organização de eventos. As nossas propostas são um PDF gerado automaticamente pelo nosso sistema a partir do editor (dados do evento, mood boards, serviços, orçamento e condições). Quero SUBSTITUIR o design atual por um novo, mais fotográfico e editorial. A estrutura, os dados e a lógica de composição automática mantêm-se; muda o aspeto. Implementa exatamente os valores abaixo, na grelha de 1123 × 794 px (A4 deitada).

### 1. PRINCÍPIOS
- A fotografia manda: quase todas as páginas têm fotografia de fundo ou a toda a altura. Não há páginas de fundo liso, exceto como recurso quando não há fotos.
- Páginas de texto: o fundo é uma fotografia da própria proposta, arrastada em movimento e escurecida, com texto claro por cima.
- Sem cor de destaque dourada. A hierarquia faz-se com dois tipos de letra (maiúsculas espaçadas e itálico serifado), não com cor.
- Assinatura gráfica: o «bloco de título» (secção 3) e a «moldura afastada» à volta de fotografias nítidas pousadas sobre fundos desfocados.

### 2. CORES
- Tinta (fundo de recurso, sombras): #2A2620
- Cal (texto principal sobre foto): #FBFAF6
- Papel (texto suave): #F4EFE6
- Linho (texto secundário, rótulos, números de página): #D8D0C2
- Pedra (fios/linhas finas): #8C877C, 1 px
- Contraste mínimo de 4,5:1 em todo o texto. É garantido escurecendo as fotos de fundo (secção 5), não com caixas por trás do texto.

### 3. LETRAS
- Jost 400: títulos (SEMPRE em maiúsculas, espaçamento 0,10 em), corpo, rótulos e rodapé.
- Bodoni Moda Italic 400 (tamanho ótico 96): sobretítulos, números de índice e de serviço, notas descritivas, preços e valores do orçamento.
- Bodoni Moda 400 normal: só o preço total e os marcos de pagamento.
- O título de página é SEMPRE precedido de um sobretítulo em itálico minúsculo, por cima, encostado à esquerda. Exemplo: «a proposta» / «UMA DECORAÇÃO PENSADA PARA CLAUDIA CRUZ».
- Nunca centrar texto. Tudo alinhado à esquerda (os números de página do índice e os valores do orçamento alinham à direita).

Tamanhos (px na grelha 1123 × 794):

| Elemento | Letra | Tamanho | Notas |
|---|---|---|---|
| Sobretítulo em páginas de texto | Bodoni Italic | 24 | minúsculas, entrelinha 1,2, 8 px abaixo |
| Sobretítulo em páginas de foto | Bodoni Italic | 29 | |
| Título de página | Jost | 37 | maiúsculas, espaçamento 0,10 em, entrelinha 1,15, máx. 2 linhas |
| Título em páginas de foto (capa, separadores, citação, fecho) | Jost | 48 | maiúsculas, espaçamento 0,08 em, máx. 2 linhas |
| Linha pequena por baixo do filete | Jost | 12,5 | maiúsculas, espaçamento 0,40 em, separador « · » |
| Rótulo (CLIENTE, DATA…) | Jost | 11 | maiúsculas, espaçamento 0,30 em, cor Linho |
| Valor | Jost | 19 | Cal |
| Índice: número | Bodoni Italic | 21 | Linho |
| Índice: item | Jost | 17 | Cal |
| Índice: página | Jost | 13 | Linho, à direita |
| Nota descritiva (temas, «a proposta») | Bodoni Italic | 17 | Linho, entrelinha 1,2 |
| Cartão de serviço: nome | Jost | 14 | maiúsculas, espaçamento 0,20 em |
| Cartão de serviço: descrição | Jost | 14,5 | Linho |
| Preço total | Bodoni Moda | 85 | |
| Linhas do orçamento | Jost | 16 | |
| Marcos (sinal/saldo): valor | Bodoni Moda | 32 | texto Jost 13 Linho |
| Condições: título h3 | Jost | 12,5 | maiúsculas, espaçamento 0,30 em, Linho |
| Condições: itens | Jost | 14 | entrelinha 1,15, 10 px entre itens |
| Rodapé | Jost | 10,7 | Linho, espaçamento 0,05 em |

### 4. ELEMENTOS FIXOS
- Margem lateral: 72 px. Topo dos títulos de página: 67 px.
- Bloco de título das páginas de foto, ancorado em baixo à esquerda (x = 72): sobretítulo → título → filete → linha pequena. Filete: 120 px × 1 px, Cal, a 658 px do topo. Linha pequena a 672 px do topo. O título cresce para cima a partir do filete.
- Moldura afastada: retângulo de 1 px em Cal, a 13 px de distância à volta da foto nítida, sem preenchimento.
- Logótipo (versão creme): 53 px de altura no canto superior esquerdo das páginas de foto (x 72, y 53). No rodapé, 38 px de altura, encostado à margem direita.
- Rodapé das páginas de texto: número de página (x 72), depois «Proposta de decoração · {cliente} · {data}» (x 115), linha de base a 38 px do fundo. Num rascunho, «RASCUNHO · » à frente.
- Intervalo entre fotografias em mosaico: 6 px, com o fundo Tinta à vista.
- Fios das tabelas (índice, dados, orçamento): 1 px em Pedra, à largura da coluna.

### 5. TRATAMENTO DAS FOTOGRAFIAS (aplicar a todas)
- Edição quente: contraste ×1,06; pretos levantados 2%; canal vermelho ×1,03; canal azul ×0,95; grão leve (ruído σ ≈ 3,5/255).
- Fundo arrastado («desfoque de movimento»): desfoque direcional com ângulo entre −8° e −24° (variar de página para página) e comprimento ≈ 8% da largura, seguido de um desfoque gaussiano de 5 px.
   - Separadores: brilho ×0,80.
   - Fundo de páginas com texto: brilho ×0,40–0,45.
- Escurecimento de leitura nas páginas de foto nítida (capa, citação, fecho): gradiente vertical de preto de 0% (a 38% da altura) até 65% (no fundo), mais 25% no topo a desvanecer até 25% da altura (para o logótipo).
- Fotografias nos cartões de serviço: gradiente só no terço de baixo (0% a 55% → 75% no fundo), para o nome se ler por cima.
- Nunca deformar: recortar sempre à proporção da caixa (object-fit: cover), com o ponto focal escolhido no editor.
- Nunca a mesma fotografia em páginas vizinhas. O fundo arrastado pode ser a mesma foto que aparece nítida nessa página.

### 6. PÁGINAS (na ordem)
1. Capa — foto nítida a toda a página + escurecimento + logótipo + bloco de título. Sobretítulo «proposta de decoração» (ou «proposta de casamento»); título = cliente, ou «NOME & NOME» (o «&» em Bodoni Italic); linha pequena «{TIPO DE EVENTO} · DD.MM.AAAA · {LOCAL}».
2. Índice — fundo arrastado escuro. Foto nítida com moldura afastada à esquerda (x 91, y 96, 322 × 442). Lista à direita, a partir de x 504 com 547 px de largura: título a 82 px do topo; primeira linha a 235 px; linhas com 61 px de altura e fio por cima e por baixo.
3. A proposta — fundo arrastado escuro. Título «UMA DECORAÇÃO PENSADA PARA {CLIENTE}» (ou «PARA O DIA DE A & B»). Dados em duas colunas de 317 px (x 72 e x 418, a partir de y 264, 91 px por linha, rótulo + valor). Foto nítida com moldura à direita (x 797, y 96, 288 × 374) e, por baixo, uma nota em Bodoni Italic.
4. O que propomos — fundo Tinta. Cartões lado a lado a toda a largura útil, a partir de y 211 e até ao rodapé (2 cartões: 486 × 504 cada, com 7 px de intervalo; 3 cartões: dividir igual). Número em itálico + nome em maiúsculas + descrição, POR CIMA da foto, em baixo, com o gradiente da secção 5.
5. Paleta e ambiente — foto nítida a toda a altura à esquerda (442 px de largura). À direita, sobre fundo arrastado escuro: título, frase, 5 retângulos de cor (103 × 211, 8 px de intervalo, fio Pedra de 1 px) com o código hex por baixo, e uma fila de 5 fotos quadradas de 103 px.
6. Inspiração, por capítulos (mantém a lógica atual de capítulos e de casamento/não casamento):
   a. Separador: fundo arrastado (brilho ×0,80) + foto nítida com moldura afastada à direita (x 696, y 101, 346 × 430) + logótipo + bloco de título. Sobretítulo «inspiração · 01»; título do capítulo em maiúsculas; linha pequena com 3 palavras do tema (ex.: «COMPOSIÇÕES FLORAIS, VELAS E CASTIÇAIS»).
   b. Páginas de tema em mosaico de ponta a ponta (sem margens), com intervalos de 6 px. O bloco de texto do tema passa a ser uma «célula» do mosaico com fundo Tinta (346 px de largura, metade da altura), com sobretítulo, título (Jost 24 px, maiúsculas, nunca partir palavras) e nota em Bodoni Italic. Alterna entre o canto superior esquerdo e o superior direito de tema para tema. Composição automática pelo número de fotos:
      - 1: página inteira, com o bloco de título em baixo à esquerda;
      - 2: duas metades verticais;
      - 3: três colunas verticais a toda a altura (tríptico, sem texto);
      - 4–5: célula de texto + 4 fotos em 2 filas;
      - 6–12: célula de texto + mosaico de 2 filas;
      - mais de 12: várias páginas, alternando mosaico e tríptico.

   As disposições escolhidas à mão no editor mantêm-se e seguem as mesmas regras de intervalo e de célula.
7. Citação — foto nítida a toda a página + escurecimento + bloco de título. Sobretítulo «a nossa forma de ver», título «DECORAMOS EVENTOS, ETERNIZAMOS MEMÓRIAS», linha pequena «LÍQUEN EVENTS».
8. Investimento — fundo arrastado escuro. Sobretítulo «o investimento», título «TOTAL A PAGAR», preço em Bodoni 85 px, «Com IVA incluído.», tabela com 595 px de largura (linhas de 43 px) e, por baixo, os dois marcos lado a lado (sinal e saldo).
9. Condições (3 páginas: notas e próximos passos; condições gerais; pagamento e cancelamento + contactos) — fundo arrastado muito escuro (brilho ×0,30) + foto nítida a toda a altura à direita (374 px de largura). Texto em 2 ou 3 colunas com 29 px de intervalo, títulos h3 em maiúsculas espaçadas. Contactos em linhas de rótulo + valor, como na página «A proposta».
10. Contracapa — foto nítida a toda a página + escurecimento + logótipo + bloco de título: sobretítulo «obrigada», título «POR NOS DEIXAREM FAZER PARTE DESTE MOMENTO», linha pequena «E-MAIL · TELEFONE · VÁLIDA ATÉ DD.MM.AAAA».

### 7. REGRAS FIXAS
- Nada de dourado, cartões com borda, caixas com cantos arredondados, sombras fortes ou faixas de cor.
- Todos os títulos em maiúsculas Jost com sobretítulo em itálico por cima; nunca o contrário.
- Nunca escrever «Alentejo» junto ao nome da marca; só como local do evento, quando o evento for lá.
- Manter as duas línguas (PT/EN), traduzindo também os sobretítulos (ex.: «a proposta» / «the proposal»).
- Se uma foto tiver menos de 1 200 px no lado maior, não a usar a página inteira (capa, citação, fecho); usá-la em mosaico ou como fundo arrastado.
