# PDF editorial — o redesenho da proposta

Este é o documento dela, tal como o mandou no chat a 9 de outubro de 2026, com
o exemplo «Mafalda & João» e o `referencia-liquen.zip` — na versão ATUALIZADA
(o `PROMPT-Claude-Code-Proposta-Liquen.md` novo), que substitui a primeira. Fica aqui para não se
perder, como os outros: **um documento que ela manda guarda-se em `docs/` no
mesmo dia.**

As referências (`referencia/` na raiz) **não vão para o git**: são 22 MB e
trazem fotografias de clientes. Estão no `.gitignore`. Quem continuar este
trabalho precisa de lhas pedir outra vez se a pasta não estiver lá.

O código está em `src/lib/pdf-editorial/`. **Ela aprovou o desenho novo** («Sim,
passa a enviar o novo», 9 de outubro): é ele que o estúdio descarrega, que
segue no envio e que o link do casal desenha. O gerador antigo
(`src/lib/proposal-doc-pdf.ts`) fica no código, sem uso nas rotas, e apaga-se
num PR à parte depois de ela enviar algumas propostas no desenho novo.

## Parte −1 — o que ela decidiu e onde a execução se afastou do texto

**A referência mudou a 9 de outubro.** Ela substituiu o `referencia-liquen.zip`
por um com o exemplo NOVO (5,5 MB, 26 páginas): o índice com um painel de
fotografia nítida à esquerda, «A proposta» com fotografia nítida a página
inteira, separadores com DUAS fotografias grandes e título a 72 px, e páginas
com faixa de fotografia à direita no orçamento e nas condições. O CSS não
mudou; mudou a composição de cada página. É esta versão que conta, e o texto
do prompt aqui em baixo é o atualizado, que acompanha o exemplo novo.

**O que já está feito, e o que falta** (auditado no código):

| O quê | Estado |
|---|---|
| Capa (só a fotografia de fundo), índice, «A proposta», «O que propomos», paleta e ambiente | feito |
| Separadores dos capítulos e as páginas dos temas (0, 1, 2–3, 4, 5, 6–12, > 12 fotografias) | feito |
| Citação a meio da inspiração | feito |
| Investimento: separador, quadro, total com sinal e saldo | feito (só quando há orçamento) |
| Condições: notas, condições gerais, pagamento e cancelamento, contactos | feito (SEMPRE) |
| Contracapa (só a fotografia de fundo) | feito |
| Regra geral: nenhuma página só texto sobre fundo liso, nenhum fundo desfocado | feito |
| Rodapé com o logótipo da Líquen | feito |
| Modelo Organização: cronograma e linhas com preço | feito, sem exemplo visual para comparar |
| O envio, o link do casal e o aquecimento nocturno usam o desenho novo | feito (aprovado por ela) |
| O estúdio adaptado ao desenho novo (ver «O estúdio», em baixo) | feito |

**Decisões dela:**

- **Grupos de inspiração: «Pelo nome do tema».** O sistema não guarda o grupo
  de cada tema; lê-se das palavras do título (`grupos.ts`). Nenhum campo novo.
  O que não encaixa vai para «Ambiente».
- **A paleta e o ambiente vêm das mesas (20/10).** A colaboradora viu que as
  cinco cores batiam com a cerimónia e não com as mesas: as cores saíam das 40
  primeiras fotografias, e a cerimónia vem primeiro. Ela: «muitas vezes as
  cores que se colocam na cerimónia não são as cores depois do jantar… foca-te
  nas paletas de cor das mesas de jantar». Agora as cores, a fila de seis e a
  fotografia grande dessa página saem dos temas das mesas — o grupo «jantar»
  (mesa, centro, jantar, banquete, bolo) e qualquer «buffet» fora da cerimónia
  (`eDasMesas` em `grupos.ts`). Ela escolheu que as fotografias acompanham as
  cores. Sem nenhum tema das mesas com fotografias, fica como antes. Os
  capítulos do PDF não mudam.
- **Fora dos casamentos, cada mood board é um capítulo (13/10).** Com uma
  proposta para um restaurante no Halloween, o PDF punha «Noivos» e arrumava
  «Bar» em «Cocktail» e «Arco de abóboras» em «Cerimónia». Ela escolheu: os
  **casamentos ficam como estão**; o resto adapta-se ao que se escreve — cada
  mood board abre o seu capítulo com o título que lhe deram, pela ordem dela,
  e a página «A proposta» diz «Cliente», sem «Cerimónia», e «Uma decoração
  pensada para {cliente}» (ou «para o vosso evento»). Quem decide se é casamento
  é o «Tipo de evento» da proposta, numa regra só (`src/lib/proposal-evento.ts`)
  que o PDF, o `plano.ts` e o estúdio lêem. O estúdio deixou de escrever
  «Casamento» sozinho num pedido sem tipo, e avisa quando a proposta diz
  casamento num pedido que não o parece. Os textos das Condições (texto da
  casa) não mudaram. A mesma regra vale fora do PDF: a página da proposta que
  o cliente abre («Cliente», sem o título «Organização de Casamento»), o email
  da proposta («o vosso evento», e saúda a pessoa que fez o pedido) e as setas
  da Vista de conjunto (fora dos casamentos contam todos como um capítulo).
- **Nenhuma página com fundo desfocado, e nenhuma só texto sobre fundo liso.**
  Palavras dela, com o exemplo novo à frente: «Nenhuma página tem fundo
  desfocado a encher a página.» Vale também para as duas páginas onde o
  próprio exemplo o tem — «O que propomos» (cartões com fotografia) e o tema
  de cinco fotografias desalinhadas —, que ficam com o fundo escuro liso e as
  fotografias à vista. Um tema SEM fotografias leva um painel nítido à
  esquerda, de outro tema do capítulo.
- **A capa e a contracapa só com a fotografia de fundo.** O exemplo tem uma
  segunda fotografia num painel alto à direita; ela viu a capa com as fotos
  dela e pediu: «retira esta foto da página capa… deixa apenas a de fundo».
- **O rodapé leva o logótipo da Líquen.** Foi primeiro o símbolo sozinho (o
  texto do prompt pede «símbolo pequeno») — «demasiado pequeno e quase não se
  lê»; depois «LÍQUEN EVENTS» em letra, como o exemplo; e ela, ao ver o PDF:
  «troca pelo logo da Líquen nas páginas». É o logótipo inteiro, a 32 px de
  altura (26 px no mosaico de texto dos temas), ASSENTE na linha da frase —
  «coloca mais para cima para ficar ao nível da frase».
- **«A proposta» não tem o bloco «Serviços».** Contava os GRUPOS de serviços
  («Serviços: 1»); o exemplo novo já não o tem, e saiu.

**Onde a execução se afasta do texto, e porquê:**

1. **A cor de destaque é uma só, `#d8bd5a`** — o dourado do logótipo
   (`#cfb12a`) aclarado para o fundo escuro. O exemplo tem um segundo dourado
   (`#e6d28a`); o texto diz «uma cor de destaque, não duas».
2. **Os tamanhos dos títulos são os do exemplo**, não os «cerca de 39 px» do
   texto: o exemplo é «o alvo».
3. **Os tipos 6 e 8 do kit** pedem «fotografia desfocada» por trás da tabela e
   das condições; a estrutura (§ 9, 11–13) e a regra geral pedem painel
   nítido, que é o que o exemplo novo tem. Fica o painel nítido.
4. **A página de valor** tem os DOIS marcos que existem (sinal e saldo), como
   a estrutura (§ 10) diz — o kit fala em três blocos.
5. **O logótipo é a única imagem com transparência.** Todos os degradés estão
   fundidos nas JPEG; o teste `montar.test.ts` conta as máscaras e as
   opacidades.
6. **A Cormorant tem os algarismos direitos cozidos no ficheiro** (o pdf-lib
   não aplica `lnum`) — ver o cabeçalho de `letras.ts`.
7. **Peso:** página inteira até 1 800 px, células até 1 250 px, JPEG mozjpeg
   70–78; uma foto que aparece duas vezes na mesma forma entra uma vez no
   ficheiro. Medido com 72 fotografias de 1 800 px fabricadas: 5,5 MB e
   ~11 s de desenho. O limite é o do anexo de email (8 MB).
8. **A fotografia de fundo da capa** é a que ela escolheu no estúdio
   («Fotografia da capa») se for deitada e tiver pelo menos 1 200 px no lado
   maior (`regra-da-capa.ts`); senão, a deitada de maior resolução da
   inspiração. Era 1 600 px antes de ela escolher «Usa a minha, com aviso».
9. **As fotografias dos painéis e fundos** saem das de inspiração (`fotos.ts`):
   da forma que o lugar pede, as de maior resolução primeiro, nunca a mesma em
   duas páginas seguidas. **Os separadores** levam as duas de MAIOR resolução
   do capítulo, sem olhar à forma, como o texto pede.
   - **Isto é agora o que acontece quando ELA NÃO ESCOLHE (15/10).** Pedido
     dela: «as fotos de fundo que estão por trás dos títulos [Cocktail…] são
     completamente automáticas… queremos ser nós a meter as fotos… em qualquer
     sítio do PDF». Escolhe-se **nas miniaturas** da vista de conjunto
     («Mudar fotografia»), **de qualquer sítio** (as desta proposta, a
     biblioteca de temas ou carregada na hora), e **no separador uma (a página
     inteira) ou duas (lado a lado)** — as três respostas dela. Fica em
     `fotosDasPaginas`, pela chave estável de cada página (`chavesDasPaginas`,
     em `plano.ts`). Não se escolhe nas páginas de um tema com fotografias
     (são as do mood board) nem nos cartões de «O que propomos» (a ★ de cada
     tema): isso já era escolha dela.
   - **E as miniaturas mostram o que o PDF põe (15/10).** A colaboradora dela
     viu fotografias «que não têm nada a ver» com as do PDF: a miniatura
     adivinhava (o separador mostrava as duas primeiras do capítulo — as que o
     PDF evita). Agora o estúdio pergunta à rota `fotos-do-pdf`, que corre o
     MESMO plano do PDF sem o desenhar (`fotosDoEditorial`), com as MESMAS
     medidas (as da biblioteca à escala do desenho; sem elas, as da fotografia
     reduzida). Dois testes prendem isto: o PDF desenhado e o plano dão as
     mesmas fotografias página a página, com e sem escolhas dela. Enquanto a
     resposta não chega, os painéis ficam lisos em vez de adivinhados.
   - **Fica por fazer:** o enquadramento à mão das fotografias escolhidas para
     as páginas (o `focos` já existe no documento e o PDF já o usa; falta a
     caixa de arrastar no estúdio, como a da capa).
   - **E a disposição das fotos de cada tema escolhe-se outra vez (15/10).**
     Palavras dela: «antigamente dava para escolher os mosaicos… a disposição
     das fotos no slide… mas com o mesmo design que está agora no PDF», e
     depois «quero poder escolher aquilo que eu quiser… um mosaico como nós
     tínhamos no PDF anterior, mas agora para este novo». No editor de cada
     tema há «Disposição das fotos», com um desenho pequeno de cada opção feito
     pela MESMA `composicao()` do PDF (`EscolherDisposicao.tsx`). Fica no campo
     novo `disposicao` do mood board — não no `layout` antigo, que as propostas
     anteriores ao PDF novo têm gravado e que, se passasse a contar, lhes
     mudava o PDF sozinho. Sem escolha, é a automática do quadro de
     `mosaico.ts`, igual a antes. As disposições, todas com as peças do desenho
     novo (o bloco de texto de 330 px, o vão de 4 px, a largura de cada foto na
     proporção da sua forma):

     | Disposição | Fotos por página | Como fica |
     |---|---|---|
     | Uma fila (a «fila única» antiga) | 2–5 | o texto de um lado, uma fila a toda a altura |
     | Duas filas | 3–12 | o mosaico automático (com 4, o tijolo) |
     | Três filas (as «filas» antigas) | 6–12 | o texto a toda a altura, três filas ao lado |
     | Soltas | 3–6 | ao alto, desalinhadas; com 5 são as do exemplo, tal e qual |
     | Destaque (o «destaque» antigo) | 3–7 | o texto, a ★ grande, as outras numa coluna |
     | Grelha (o «mosaico» antigo) | 3–10 | cortes sucessivos numa grelha de 8 × 8, a maior célula para a ★ |
     | Texto e imagem (o antigo) | 1–4 | o texto mais largo (45%), as fotos empilhadas ao lado |

     Acima do máximo, o tema reparte-se por mais páginas (`repartir(n, d)`, o
     MESMO no PDF e no plano — o `plano.test.ts` prende-o); uma página abaixo
     do mínimo fica com a automática. O «Manter a forma (não corta)» do PDF
     antigo não volta: cada célula do desenho novo já tem quase a forma da sua
     foto.
10. **As células do mosaico têm a forma da sua fotografia** (a largura é
    proporcional ao aspecto, como o `flex` do exemplo), e todas as de uma fila
    têm a mesma altura (395 px). Por isso a «troca por falta de resolução» que
    o texto pede não daria mais pixéis a foto nenhuma, e não se faz: cada foto
    fica na sua ordem, recortada o mínimo.
11. **O subtítulo do orçamento diz só «Seis serviços».** O exemplo acrescenta
    «com montagem e desmontagem incluídas»; isso não está nos dados da
    proposta, e não se escreve o que os dados não dizem.
12. **O tijolo de quatro fotografias tem o texto sempre em cima à esquerda**
    (como as duas páginas de quatro do exemplo); só o mosaico de seis ou mais
    alterna de lado.

**O estúdio, adaptado ao PDF novo** («altera tudo à volta de forma a que o
sistema de fazer proposta se adapte à forma como agora está o PDF»). As três
perguntas que lhe pus, e as respostas:

- **«Sim, passa a enviar o novo».** O envio, o link do casal (`proposal-pdf-
  cache.ts`) e o aquecimento nocturno desenham com o gerador novo. **A chave dos
  ficheiros guardados (`chaveDoPdf`) NÃO mudou**: as propostas já enviadas
  continuam a servir o PDF que receberam. As enviadas que nunca tiveram
  ficheiro guardado (as anteriores a 26/08 que o aquecimento ainda não tratou)
  passam a ser desenhadas no novo quando o casal abrir o link — quantas ainda
  há, não verificado (não se consultaram dados de produção).
- **Capa: «Usa a minha, com aviso».** Um lugar, «Fotografia da capa», em vez de
  «Esquerda/Direita». Se for ao alto ou pequena, o estúdio di-lo ao lado da
  fotografia e o PDF usa a melhor deitada dos temas. A segunda fotografia das
  propostas antigas fica guardada e não sai.
  - **E «Usar esta na mesma» (10/10).** O aviso não chegou: a caixa do estúdio
    recortava a fotografia ao alto para ficar deitada, ela parecia servir, e o
    PDF saía com outra («diz que é esta a foto de capa mas depois quando abro o
    pdf está outra foto»). Agora a fotografia que não vai leva «Não vai para o
    PDF» por cima, e o aviso oferece «Usar esta na mesma» (`capaMesmoAssim` no
    documento): vai a dela, recortada como o estúdio a mostra. Trocar a
    fotografia apaga a escolha.
  - **E o enquadramento (10/10).** «Não ficou com o carro… quero que o sistema
    fique inteligente para saber identificar isto.» O PDF recortava pela
    «atenção» do sharp (escolheu os vasos e o céu) e o estúdio mostrava o meio.
    Ela escolheu «Automático + ajustar à mão»: a caixa da capa mostra agora o
    recorte que o PDF faria (`focoAutomaticoDaCapa`, a mesma conta e os mesmos
    bytes), e ela arrasta a fotografia para a enquadrar (`focoDaCapa`, em
    fracções, como o `object-position`). O PDF recorta com esse número
    (`recortarComFoco`). Por agora só na capa; as outras de página inteira vêm
    com a A3.
- **Estrela: «Passa a ser a foto do cartão».** A fotografia principal de cada
  tema é a do cartão em «O que propomos» e a primeira do mosaico — sempre
  (`ordemDoDesenho`, em `plano.ts`).

O que mudou à volta:

- **`plano.ts`** — a sequência de páginas do PDF novo sem desenhar o PDF. O
  estúdio conta por ele («PDF com cerca de N», a confirmação do envio, a
  posição dos temas nos avisos), e a Vista de conjunto e o painel «O que vai
  sair» desenham-no. Um teste desenha o PDF e compara página a página. O texto
  que transborda (orçamento, condições) é estimado por caracteres.
- **`PaginaEditorial.tsx`** — a miniatura de uma página, na folha escura
  (tokens `--bo-papel-pdf*`, presos aos `HEX` por um teste). Os temas têm as
  caixas exactas do mosaico; as outras páginas, a sua estrutura. Saíram a
  `PreviaDaPagina`, a `FolhaDaProposta` e o `proposal-paginas.ts`.
- **Os temas** — saíram a disposição, o «Manter a forma», os avisos de recorte
  e da última fila, e o limite de 10 fotografias. Fica uma linha só de leitura
  com o capítulo e a composição, e «ocupa 2 páginas» acima de 12.
- **A Conferência** — o desenho novo não imprime folhas vazias; o aviso passou
  a dizer as listas fixas que não saem por estarem vazias.
- **`custo-do-pdf.ts`** — recalibrado no desenho novo, medido num processador:
  6 fotos 8,5 s, 80 fotos 12,1 s e 5,3 MB. O tecto é o `maxDuration` da rota do
  casal (60 s), lido do ficheiro por um teste; o chão do aquecimento subiu de
  15 para 20 s. As amostras de tempo do estúdio mudaram de chave.

---

# Redesenho do PDF de proposta da Líquen Events

## O que quero

O back office da Líquen Events já gera um PDF de proposta de decoração para cada cliente. Eu preencho os dados do evento, escrevo os títulos e as notas de cada tema, carrego as fotografias de inspiração, e o sistema monta o documento.

Quero mudar **só o aspeto e a paginação** desse PDF. O conteúdo, os dados, os cálculos e a forma como eu preencho a proposta ficam como estão. O objetivo é que todas as propostas da Líquen passem a sair com o nível de design gráfico da proposta de referência que te dou, adaptado à marca Líquen.

Hoje o PDF é branco, com as fotografias em grelhas pequenas e o texto em Carlito. Parece um documento de escritório. Quero que pareça uma peça editorial de uma marca de casamentos: fundo escuro, fotografia em grande, títulos em letra serifada, páginas só de imagem a separar as partes.

## Ficheiros de referência

Pus três PDF na pasta `referencia/` na raiz do projeto. Lê os três antes de escrever código, abrindo as páginas como imagem, porque o que interessa é o aspeto.

- `referencia/Proposta-Bouquet-de-Liz.pdf`: **a referência de design**. É uma proposta que fiz para outro cliente, de outro tipo (um website). Copia dela a linguagem visual e os tipos de página. Não copies o conteúdo nem a estrutura de secções, que não têm nada a ver com a Líquen.
- `referencia/Maquetes-Bouquet-de-Liz.pdf`: mais exemplos da mesma linguagem visual, sobretudo páginas com fotografia a página inteira e separadores.
- `referencia/Exemplo-Proposta-Liquen-Events.pdf`: **o alvo**. É a proposta da Mafalda e do João já no novo design, montada à mão como exemplo. É assim que quero que o sistema passe a gerar. As fotografias deste exemplo foram tiradas de dentro do PDF antigo, onde são muito pequenas, e as maiores foram ampliadas artificialmente; por isso algumas parecem suaves. Com os originais do back office têm de ficar nítidas.
- `referencia/modelo-html/`: o HTML e o CSS com que esse exemplo foi feito (`proposta-exemplo.html`), os dados usados (`dados-exemplo.json`), as imagens e os tipos de letra. Usa-o como implementação de referência dos tipos de página: podes aproveitar o CSS e a estrutura, adaptando-os à tecnologia do projeto. Os fundos escurecidos já vêm fundidos nas imagens (ficheiros `bg3_*` e `bk_*`), pela razão explicada mais abaixo.
- `referencia/Proposta-Liquen-atual.pdf`: **o que o sistema gera hoje**. É a fonte do conteúdo, da ordem das secções e de todos os textos legais.

Se a pasta não existir ou estiver vazia, pára e pede-me os ficheiros.

## Antes de mexer: perceber o que existe

Não sei dizer-te de cor como o gerador está feito, por isso começa por o descobrir:

1. Encontra o código que gera o PDF da proposta (procura por «PROPOSTA · DECORAÇÃO», «Orçamento Proposto», «Faseamento do Pagamento», «de 17», ou pelo nome do ficheiro gerado, do tipo `Proposta-Liquen-Events-<noivos>-<data>.pdf`).
2. Percebe com que tecnologia o PDF é produzido (HTML renderizado por um browser, uma biblioteca de PDF, outra coisa) e que dados recebe: campos do evento, lista de serviços, temas de inspiração com as suas fotografias, linhas de orçamento, deslocação, IVA, datas.
3. Percebe como as fotografias chegam ao gerador (URL, ficheiro, base64), que resolução têm, e quantas pode haver por tema.
4. Escreve-me um resumo curto do que encontraste e do plano, e **espera pela minha confirmação antes de alterar ficheiros**. Se a tecnologia atual não conseguir fazer o que peço abaixo (fotografia a sangrar a página, tipos de letra próprios, sobreposições), diz-me isso nesse resumo e propõe a alternativa, em vez de a trocar por tua conta.

## O que não pode mudar

- **Os dados e o formulário do back office.** Não quero campos novos obrigatórios. Se precisares de um campo novo opcional (por exemplo, escolher a fotografia de capa), propõe-no e dá-lhe um comportamento por omissão que funcione sem eu lhe tocar.
- **Os cálculos.** Subtotal, deslocação, total sem IVA, IVA a 23%, total a pagar, sinal de 30% e saldo de 70% continuam a ser calculados pelo código que já existe. Tu só mudas a forma como aparecem.
- **Os textos legais.** Condições gerais, notas importantes, incluído e não incluído, próximos passos, observações gerais, faseamento do pagamento e cancelamento ficam **palavra por palavra** como estão hoje. São texto contratual. Podes mudar a paginação e a tipografia, nunca a redação.
- **Os contactos e a identificação da marca** que o sistema já usa (logótipo, e-mail, telefone, a frase da contracapa). Usa os ficheiros de logótipo que já estão no projeto; não redesenhes o logótipo.

## A linguagem visual a aplicar

Estes são os valores usados na proposta de referência. Usa-os como ponto de partida e ajusta o que for preciso para a Líquen.

**Formato.** A4 ao alto deitado (paisagem), 1123 × 794 px a 96 dpi, sem margens de impressão: as imagens vão até ao limite da página. Margem interior do conteúdo de 98 px à esquerda e à direita.

**Cor.**
- Fundo das páginas: quase preto quente, `#1f2022`.
- Texto principal: marfim, `#f3f0ea`. Texto secundário: `#e2ddd3` e `#d2cdc3`.
- Cor de destaque para etiquetas e números: na referência é um dourado claro, `#e0cfa8`. Para a Líquen, **tira a cor de destaque do logótipo da Líquen** (o verde-azeitona/dourado do símbolo) e usa-a só aí. Uma cor de destaque, não duas.
- Linhas divisórias: branco a 18–30% de opacidade, 1 px.

**Tipografia.**
- Títulos: Cormorant Garamond, peso 500, com algarismos alinhados (`font-feature-settings: 'lnum'`). Títulos de página a cerca de 39 px, títulos de capa e de separador entre 52 e 78 px, entrelinha apertada (1,0 a 1,1).
- Texto corrente: Inter, 13 a 15 px, entrelinha 1,55 a 1,6.
- Etiquetas (o pequeno texto por cima de cada título, como «INSPIRAÇÃO»): Inter 11,5 px, peso 600, maiúsculas, espaçamento entre letras de 0,2em, na cor de destaque.
- Citações e frases de marca: Cormorant Garamond itálico.
- Os dois tipos de letra são livres (Google Fonts). Inclui os ficheiros no projeto para o PDF não depender de rede.

**Rodapé de todas as páginas de conteúdo.** Símbolo pequeno da marca à esquerda, uma linha vertical fina, o texto «Proposta de decoração · <noivos> · <data do evento>», e o número da página à direita com dois algarismos. Fica a 38 px do fundo, em 12 px, numa cor discreta. Capa, separadores e contracapa não têm rodapé.

**Fotografia.** É o elemento principal. Sem filtros de cor, sem cantos muito arredondados (0 a 4 px), sem molduras nem sombras decorativas. Quando há texto por cima de uma fotografia, a fotografia é escurecida por um degradé só do lado ou da base onde está o texto, e fica quase intacta no resto.

## Tipos de página (o «kit»)

A proposta de referência é feita com um conjunto pequeno de tipos de página, que se repetem. Constrói estes tipos como componentes reutilizáveis e monta a proposta com eles.

1. **Capa.** Uma fotografia a página inteira. Degradé escuro da esquerda para a direita. Símbolo da marca em cima à esquerda, título muito grande em serifada, uma linha de descrição, e em baixo uma faixa com três blocos de dados separados por uma linha fina.
2. **Separador.** Página só de fotografia: uma imagem a página inteira, ou duas ou três lado a lado com 4 a 6 px de intervalo. Em baixo à esquerda, sobre um degradé escuro, uma etiqueta pequena e o título da parte que se segue em serifada grande. Sem mais texto.
3. **Página com fotografia de fundo e texto ao lado.** A fotografia ocupa a página inteira; um degradé escuro cobre o lado do texto (cerca de 60% da largura) e desaparece para o outro lado. Serve para as páginas de texto curto.
4. **Página de galeria editorial.** É o tipo mais importante para a Líquen, porque é onde entram as fotografias de inspiração. Três variantes, descritas na secção seguinte.
5. **Página de citação.** Fotografia a página inteira, sem escurecimento exceto na base, com uma frase em serifada itálica e o nome da marca.
6. **Página de tabela.** Fundo escuro com uma fotografia desfocada e muito escurecida por trás (ou uma faixa de quatro fotografias no topo, com cerca de 72 a 104 px de altura). Tabela com linhas finas, cabeçalhos em etiqueta, valores alinhados à direita.
7. **Página de valor.** O total em serifada muito grande (cerca de 100 px), com a descrição por baixo e os marcos de pagamento em três blocos.
8. **Página de condições.** Texto em duas colunas, em listas com linhas finas a separar os pontos, sobre fundo escuro com fotografia desfocada.
9. **Contracapa.** Fotografia a página inteira ou painel lateral com o logótipo, a frase de agradecimento, e os contactos.

## Como as fotografias de inspiração se arrumam sozinhas

Hoje cada tema de inspiração mostra as fotografias numa grelha de miniaturas iguais, com margens brancas à volta. No exemplo, as fotografias **ocupam a página de ponta a ponta**, sem margens, e o texto do tema vive num mosaico escuro que faz parte da composição. É esta a mudança mais importante.

O sistema escolhe a composição conforme **o número de fotografias que eu carreguei nesse tema**, sem eu ter de decidir nada:

| Fotografias no tema | Composição |
|---|---|
| 1 | Uma fotografia a página inteira, com o título por cima, em baixo à esquerda, sobre um escurecimento só na base |
| 2 ou 3 | Uma só fila a toda a altura da página: o mosaico de texto e as fotografias lado a lado |
| 4 | Duas filas em «tijolo»: em cima o mosaico de texto e duas fotografias; em baixo outras duas, com larguras diferentes das de cima |
| 5 | Cinco fotografias ao alto, lado a lado, **desalinhadas em altura**, sobre um fundo desfocado, com o título em baixo. É a única composição com margens, e serve para quebrar o ritmo |
| 6 ou mais | **Mosaico de ponta a ponta** em duas filas de altura igual. Uma fila leva o mosaico de texto e cerca de 40% das fotografias; a outra leva as restantes |
| Mais de 12 | Reparte por duas páginas do mesmo tema; a segunda leva o subtítulo «Mais ideias» |

Regras do mosaico de ponta a ponta:

- A página é uma coluna de duas filas com 4 px de intervalo, cada fila com metade da altura da página. Dentro de cada fila, as fotografias crescem em largura **na proporção do seu formato** (uma fotografia mais larga ocupa mais largura), e são cortadas para encher a célula (`object-fit: cover`). Assim nunca há espaço vazio nem imagens deformadas.
- O **mosaico de texto** tem largura fixa (330 px), fundo `#1f2022`, e leva: a etiqueta «INSPIRAÇÃO · <grupo>», o título em serifada, o subtítulo em itálico, a nota que eu escrevo, o número do tema em grande a 9% de opacidade no canto, e em baixo «LÍQUEN EVENTS» e o número da página. Estas páginas não têm o rodapé normal.
- **O mosaico de texto alterna de posição**: nos temas ímpares fica em cima à esquerda; nos pares, em baixo à direita. Dá ritmo ao folhear.
- A fotografia com maior resolução do tema vai para a célula maior. Se uma fotografia tiver resolução insuficiente para a célula que lhe calhou, troca-a por outra do mesmo tema em vez de a esticar.
- Uma nota muito longa faz o texto do mosaico diminuir de tamanho até caber; nunca transborda nem tapa fotografias.
- Um tema sem fotografias gera uma página só de texto, sem caixas vazias.

## Estrutura da nova proposta

Segue a estrutura do exemplo `Exemplo-Proposta-Liquen-Events.pdf`, página a página. O conteúdo é o da proposta atual; as páginas novas são todas geradas a partir de dados que o sistema já tem.

**Regra geral: nenhuma página é só texto sobre fundo liso.** Todas as páginas de texto têm fotografia nítida à vista, de uma de duas formas: um **painel de fotografia a toda a altura** encostado a um lado da página, ou uma **fotografia a página inteira** escurecida apenas do lado onde está o texto. Nada de fundos desfocados e acinzentados a encher a página.

1. **Capa.** Fotografia de fundo a página inteira, escurecida do lado do texto, e uma segunda fotografia ao alto num painel à direita, com sombra. Logótipo, etiqueta «PROPOSTA · DECORAÇÃO», nomes dos noivos em serifada grande com o «&» na cor de destaque, e a faixa com evento, data e local.
2. **Índice.** Painel de fotografia à esquerda (cerca de 440 px, a toda a altura) e a lista à direita, gerada automaticamente: «A proposta», uma linha por grupo de inspiração, «Investimento» e «Condições», com os números de página reais.
3. **A proposta.** Fotografia a página inteira, escurecida à esquerda. Título em serifada («Uma decoração pensada para o dia de <primeiro nome> e <primeiro nome>») e os dados do evento em seis blocos de etiqueta e valor.
4. **O que propomos.** Um cartão por serviço, com fotografia, número e nome. A fotografia de cada cartão é a primeira do tema de inspiração correspondente.
5. **Paleta e ambiente.** Painel de fotografia à direita. Cinco cores **extraídas automaticamente** das fotografias de inspiração dessa proposta (quantização das imagens, descartando os tons quase pretos e quase brancos e as cores demasiado parecidas entre si), em amostras altas com o código hexadecimal, e uma fila de miniaturas. Se eu vier a ter um campo para escolher as cores à mão, esse campo tem prioridade.
6. **Inspiração, por grupos.** Cada grupo (Cerimónia, Cocktail, Jantar, Complementos) abre com um **separador de duas fotografias grandes lado a lado**, a página inteira, com o número e o nome do grupo em serifada muito grande (cerca de 72 px) sobre a base escurecida. O sistema escolhe para o separador as duas fotografias de maior resolução do grupo. Seguem-se os temas desse grupo, cada um com a composição automática descrita acima, numerados em sequência (01, 02, 03…). Se o sistema não guardar o grupo de cada tema, propõe-me como o obter (um campo opcional, ou uma regra pelo nome do tema) em vez de inventar.
7. **Página de citação**, a meio da inspiração: **uma fotografia a página inteira**, escurecida só na base, com a frase «Decoramos eventos, eternizamos memórias.» em serifada itálica grande. O sistema escolhe para ela a fotografia horizontal de maior resolução da proposta. Sem rodapé.
8. **Separador «Investimento»**, igual aos dos grupos.
9. **Orçamento proposto.** Lista numerada dos itens à esquerda, painel de fotografia à direita.
10. **Total.** Fotografia a página inteira, escurecida à esquerda. O total a pagar em serifada muito grande (cerca de 110 px), com subtotal, deslocação, total sem IVA e IVA por baixo, e os dois blocos de sinal e saldo, com os valores que o sistema já calcula.
11. **Notas, condições de reserva e próximos passos**, em três colunas, com um painel de fotografia estreito (cerca de 230 px) à direita.
12. **Condições gerais**, em duas colunas, com painel de fotografia estreito.
13. **Pagamento e cancelamento**, com os contactos, e painel de fotografia estreito.
14. **Contracapa.** Mesmo tratamento da capa: agradecimento, frase da marca, logótipo, contactos e validade.

Os textos das páginas 11 a 13 são os de hoje, palavra por palavra. Nas páginas com painel de fotografia, o rodapé termina onde o painel começa.

**De onde vêm as fotografias de fundo, capa e separadores.** Não quero ter de carregar fotografias a mais. Por omissão, o sistema escolhe-as de entre as fotografias de inspiração já carregadas nessa proposta, dando preferência às de maior resolução e de orientação horizontal, e sem repetir a mesma imagem em duas páginas seguidas. Se o projeto já tiver um conjunto de fotografias da própria Líquen (as da capa e da contracapa atuais, por exemplo), usa essas para a capa e a contracapa.

## Dois problemas que já me aconteceram e que quero evitados

- **Sobreposições que mudam de cor.** Na proposta de referência, os degradés escuros por cima das fotografias estavam feitos com transparência (CSS `linear-gradient` com `rgba`). Num leitor de PDF apareceram **cor-de-rosa** em vez de pretos. A solução foi fundir o escurecimento na própria imagem antes de a pôr no PDF, de modo que o ficheiro final não tenha camadas transparentes por cima de fotografias. Faz o mesmo: escurecimentos e degradés são aplicados à imagem (no servidor, ao gerar), e o PDF recebe uma imagem já final.
- **Peso do ficheiro.** O PDF de referência ficou com 13 MB e não cabia num e-mail com outro anexo. Redimensiona cada fotografia para o tamanho a que vai ser usada (no máximo cerca de 1250 px no lado maior para células, 2000 px para página inteira) e grava em JPEG de qualidade 62 a 80. O objetivo é uma proposta normal ficar **abaixo de 10 MB**.

## Como sei que está pronto

- Gero a proposta de teste com os mesmos dados da `Proposta-Liquen-atual.pdf` e o resultado tem todo o conteúdo dela: os mesmos campos, os mesmos temas, as mesmas fotografias, os mesmos valores (3.200,00 €, 460,00 €, 3.660,00 €, 841,80 €, 4.501,80 €, 1.350,54 €, 3.151,26 €) e os textos legais iguais, palavra por palavra.
- Gero propostas de teste com temas de 1, 2, 3, 4, 5, 8 e 12 fotografias e com um tema sem fotografias, e nenhuma página tem texto por cima do rodapé, fotografias deformadas, caixas vazias ou texto ilegível sobre a imagem.
- Uma nota muito longa num tema e uns nomes de noivos muito compridos na capa não partem a paginação.
- Converte as páginas do PDF gerado em imagem e **olha para elas** antes de me dizeres que acabaste. Compara-as com a referência. Diz-me o que verificaste e o que não conseguiste verificar.
- O fluxo no back office é o mesmo de hoje: preencho, carrego fotografias, gero.

## Como quero que trabalhes

1. Lê as referências e o código, e manda-me o resumo e o plano. Espera pela minha resposta.
2. Faz primeiro os componentes de página e a capa, gera um PDF de teste e mostra-me.
3. Depois as composições automáticas de fotografias, que é a parte mais delicada.
4. Depois o orçamento e as condições.
5. Trabalha num ramo próprio e mantém o gerador antigo a funcionar até eu aprovar o novo, para eu poder continuar a enviar propostas entretanto.

Se alguma coisa do que peço for contra a forma como o sistema está construído, pergunta-me antes de decidir.
