# Melhorias ao fluxo «Fazer proposta» do back office da Líquen Events

(Documento dela, recebido no chat a 9 de outubro de 2026. Texto integral a
partir de «Contexto». Esta primeira parte é nossa: o estado e as decisões.)

## Parte −1 — o estado, e o que ela decidiu

Ordem escolhida por ela: **B1 → A2 → C → A1 → A3/A4 → D1**, uma entrega por
ramo e por PR.

A 10/10 ela pôs «Ver as enviadas» e a A1 à frente da A2. A 11/10 pediu
«avança com a A2», e a A2 fez-se antes da A1.

| Ponto | Estado | Onde |
|---|---|---|
| B1 — lista do que falta e bloqueio | **feito** (entrega 1) | `proposal-progress.ts`, `conferencia.ts`, `ProposalStudio.tsx`, rota `proposta-doc` |
| A2 — cinco passos | **feito** (entrega 2) | `passos-do-estudio.ts`, `ProposalStudio.tsx`, `NavEstudio.tsx`, `FazerProposta.tsx` |
| C1 — medir | **feito** (os números estão no plano da entrega 3) | |
| C2 / C3 — rapidez e progresso | **parcial** (pedido de 14/10, «descargas no back office») — o PDF final de cada versão desenha-se uma vez (o «Descarregar o PDF final», o que o estúdio prepara em segundo plano no último passo e o envio a seguir saem do mesmo desenho); depois de enviada, «Descarregar PDF» entrega o que seguiu sem desenhar; as fotografias reduzidas a 1 800 px ficam em memória. Ficam por fazer as caixas tratadas guardadas, a versão de 1 800 px guardada ao carregar, e o progresso por página (C3) | `proposal-preview-cache.ts`, `cache-por-bytes.ts`, `proposal-doc-render.ts` (`fotoEditorial`), rota `proposta-doc` (`X-Pdf-Da-Memoria`), `ProposalStudio.tsx` (`pdfPreparado`, `descarregarAEnviada`) |
| A1 — pré-visualização real | por fazer | |
| A3 / A4 — papel e resolução das fotografias | parcial | 15/10: a fotografia de cada página do PDF (separadores, painéis, fundos) escolhe-se nas miniaturas (`fotosDasPaginas`), e as miniaturas mostram as do PDF — ver `PDF-EDITORIAL.md`, ponto 9. 28/10, A4 em parte: ela pediu «que avise mesmo, não coloque esta foto porque vai ficar com uma qualidade péssima», e escolheu «Avisa, não bloqueia». A régua é uma só, `src/lib/qualidade-da-foto.ts` (`avaliarFoto`): página inteira pelo lado maior (má < 1200, fraca < 1800), mood boards pelo lado mais curto (má < 800, fraca < 1100), e as larguras do Pinterest sempre más. Carregar uma foto má abre o aviso (`AvisoDeQualidade.tsx`) com «Escolher outra» / «Usar na mesma»; na biblioteca, as más levam o sinal «Má qualidade» e adicioná-las pergunta no rodapé; a conferência antes do envio usa a mesma régua e passou a incluir as `fotosDasPaginas`. As fotos dos mood boards passam a subir com 2200 px (eram 1600). Falta: o sistema escolher sozinho a foto pela forma do sítio (o resto do A3) e o enquadramento à mão dessas fotos. |
| D1 — pedidos duplicados | por fazer | |
| B1+ — ver o PDF final antes de enviar (pedido de 14/10, «Ver o PDF primeiro») | **feito** | `proposal-progress.ts` (`pdfVisto`, impedimento `visto`), rota `proposta-doc` (`X-Chave-Do-Pdf` na pré-visualização final; o envio recusa sem a mesma chave), `ProposalStudio.tsx` (caixa «Antes de enviar»; a confirmação cai se o documento ou a língua mudarem), histórico `proposal_reviewed` |
| Passo 5 mais limpo (pedido de 14/10) | **feito** — saiu o bloco «Enviar ao cliente» (o resumo Para/Clientes/Total/Sinal, o «Copiar resumo» e o WhatsApp de antes do envio, as notas do WhatsApp e da língua, e a «Mensagem para o cliente»); fica o email que o cliente vai receber, cujo texto é editável e é o que segue. A mensagem deixou de ir no envio, e um rascunho antigo com mensagem gravada já não a manda. O «Inserir» das versões escreve agora no texto do email. «Por onde segue» também na barra de baixo, debaixo de «Gerar e enviar ao cliente» (no telemóvel, na folha «Antes de enviar»), com o mesmo estado do topo | `ProposalStudio.tsx` (`OPCOES_DO_CANAL`, `inserirParagrafoDoQueMudou`), `Versoes.tsx` |
| A barra do «Rever e enviar» numa linha, também no computador (14/10, «melhora isto drasticamente») | **feito** — ←, a pastilha do estado (abre um painel com «Vai para», as faltas e o que o inglês muda), PT · EN, o canal só com os logótipos, o PDF e o botão. O botão guia o PDF: «Ver o PDF final» → «Está certo — enviar» (regista a confirmação e abre a pergunta de sempre). A falta «ver o PDF» salta para a caixa «Antes de enviar» | `ProposalStudio.tsx`, `BarraDoEnvioCompacta.tsx` (`PainelDoEnvio`), `ui/EmCurso.tsx` (`emLinha`) |

Decisões dela, nas perguntas antes de começar:

- **Capa:** só a fotografia de fundo (mantém-se a de 9/10).
- **Destaque:** vai à frente, sem mudar o mosaico.
- **Armazenamento:** versões guardadas ao carregar e caixas tratadas guardadas.
  A passagem pelas fotografias que já existem só **cria** ficheiros.

Onde a execução da B1 se afasta do texto, e porquê:

- **«Validade por definir»** não acontece: sem data fixada, a validade conta
  60 dias (ou os que ela escrever) a partir do envio. O que trava é a validade
  FIXADA que já passou — uma proposta reaberta para reenviar.
- **«Orçamento vazio»** é o total a zero: o PDF salta a secção do investimento
  quando não há total nem linhas.
- **«Tema sem fotografias»** era um erro e passou a aviso, como ela pediu — no
  desenho novo o tema sem fotos é uma página de texto, e não sai em branco.
- **As condições** não se editam no estúdio (são os textos da casa). Se um
  rascunho as perdeu, o estúdio oferece «Repor as Condições Gerais da casa».
- **O rascunho** leva «RASCUNHO» à frente do rodapé de cada página que tem
  rodapé, no título do PDF e no nome do ficheiro. A capa, os separadores dos
  capítulos e a contracapa não têm rodapé no desenho, e por isso não levam a
  marca.
- **O servidor também recusa** o envio (422) quando falta o nome, o valor, a
  data, a validade, o email ou as condições — o botão desligado é só a porta do
  lado do ecrã.
- **Condições extra que já travavam** e se mantêm: o título interno, os
  serviços, os marcadores `{{…}}`, o inglês por traduzir e as fotografias ainda
  a entrar.

Onde a execução da A2 se afasta do texto, e porquê:

- **O 3.º passo chama-se «Cronograma»** numa proposta de Organização. Lá não há
  mood boards; o que vive nesse passo é o cronograma.
- **Os passos 1 a 4 são um formulário só, sempre montado.** Mudar de passo
  esconde e mostra secções; não remonta nada. É isso que garante que nada se
  perde ao saltar, e o rascunho continua a ser gravado de 800 em 800 ms como
  antes.
- **«Rever e enviar» junta o antigo «Pré-visualizar» e o antigo «Enviar».** O
  «Descarregar PDF/rascunho» está na barra de baixo desse passo, com o
  selector da língua encostado, como ela pediu («na parte de descarregar ou
  gerar, um botão para escolher gerar em inglês»).
- **O estado de cada passo** sai das mesmas duas listas que o índice e o envio
  já usavam: erro quando há uma falta que trava nesse passo, por completar
  quando há uma secção vazia ou um conselho, completo no resto. O «Rever e
  enviar» fica em erro se alguma coisa trava em qualquer passo.
- **Na Inspiração o índice da esquerda sai**, e a coluna dos mood boards fica
  com a largura toda. O índice salta entre passos: carregar numa secção de
  outro passo muda de passo e leva lá.
- **Corrigido de passagem:** o salto para um campo que não está desenhado
  procurava a secção pelo id sem o prefixo (`evento` em vez de `seccao-evento`)
  e não ia a lado nenhum. Com cinco passos, saltar entre eles dependia disto.
- **O «Fazer proposta» deixou de dizer «Passo 1 de 2».** Escolher o cliente
  fica antes dos passos, como o documento pede.

## Contexto
O back office tem uma área «Fazer proposta» com dois momentos: primeiro escolhe-se o cliente numa lista de pedidos; depois preenche-se a proposta (evento, fotografia de capa, serviços, moodboard com temas e fotografias, orçamento, notas, totais), pré-visualiza-se e envia-se. No fim, o sistema gera um PDF com o novo desenho editorial da Líquen.
Quem usa isto todos os dias é a minha mãe, que não é técnica. O objetivo destas alterações é que ela monte uma proposta mais depressa, veja o que o cliente vai receber enquanto a monta, e não consiga enviar uma proposta incompleta.
São sete alterações, agrupadas em quatro blocos. Estão por ordem de prioridade dentro de cada bloco.

## Antes de mexer
1. Lê o código da área «Fazer proposta»: a lista de pedidos, o formulário, a pré-visualização, o envio e o gerador do PDF.
2. Diz-me o que encontraste que afete este plano: como o formulário guarda o estado, como as fotografias são carregadas e guardadas, onde e como o PDF é gerado (no browser ou no servidor), e quanto tempo demora hoje cada fase da geração.
3. Propõe a ordem de trabalho e espera pela minha confirmação antes de alterar ficheiros. Se alguma destas alterações obrigar a mudar a base de dados ou o armazenamento de ficheiros, diz-mo nesse plano.

Trabalha num ramo próprio e entrega bloco a bloco, para eu ir testando. O fluxo atual tem de continuar a funcionar entre entregas.

## Bloco A · O ecrã de preencher a proposta
### A1. Pré-visualização ao lado, em tamanho legível
Hoje o resultado aparece em miniaturas muito pequenas na coluna da direita e outra vez numa grelha no fundo da página. Não dá para ver o que o cliente vai receber.
Quero o ecrã dividido em dois: o formulário à esquerda e, à direita, a página real da proposta em tamanho legível. A pré-visualização:
- mostra a página correspondente ao que está a ser editado, e muda sozinha quando eu passo para outro tema ou secção;
- atualiza pouco depois de eu parar de escrever ou de carregar uma fotografia, sem eu ter de carregar em nenhum botão;
- deixa navegar pelas páginas (anterior, seguinte, e uma fila de miniaturas para saltar);
- pode ser aberta em ecrã inteiro.

Tem de ser a mesma composição que sai no PDF, não uma aproximação. Se desenhar a pré-visualização e o PDF com código diferente, as duas coisas vão divergir; diz-me como garantes que são iguais.
Em ecrãs estreitos, a pré-visualização passa para um separador ou um painel que se abre.

### A2. Partir a coluna comprida em passos
Hoje está tudo numa só página muito comprida. Quero cinco passos, com a navegação sempre visível no topo:
1. Evento
2. Serviços
3. Inspiração
4. Orçamento
5. Rever e enviar

Cada passo mostra se está completo, incompleto ou com erro. Pode saltar-se livremente entre passos; nada se perde ao mudar. O passo da inspiração, onde se gasta mais tempo, usa toda a largura disponível do formulário.
A contagem de passos tem de ser a mesma em todo o fluxo. Hoje a lista de pedidos diz «Passo 1 de 2» e o ecrã seguinte mostra três passos.

### A3. Escolher o papel de cada fotografia
O novo desenho depende de fotografias grandes: o fundo e o painel da capa, os separadores, os fundos das páginas de texto, a célula maior de cada mosaico. Hoje o sistema escolhe sozinho, e já saiu uma capa com fundo desfocado.
- Em cada tema, posso arrastar as fotografias para as ordenar e marcar uma como destaque. A de destaque vai para a célula maior do mosaico e é a preferida para o separador do grupo.
- Na capa, posso escolher a fotografia de fundo e a do painel.
- Se eu não escolher nada, o sistema decide como hoje. A escolha manual só corrige.

### A4. Avisar quando uma fotografia é pequena demais
Cada miniatura no formulário leva uma indicação da resolução, em relação ao tamanho a que vai ser usada:
- verde: aguenta página inteira;
- amarela: serve para mosaico, não para página inteira;
- vermelha: vai ficar desfocada mesmo em mosaico.

A indicação tem uma legenda curta ao passar o rato. Não bloqueia nada: é um aviso. O sistema nunca escolhe automaticamente uma fotografia vermelha ou amarela para página inteira quando existe uma verde.

## Bloco B · Verificação antes de enviar
### B1. Lista do que falta, e bloqueio do envio
Já saiu um PDF sem orçamento e sem condições, e nada no ecrã o impediu.
No passo «Rever e enviar», mostra uma lista de verificação calculada sobre a proposta. Cada linha diz o que falta e leva ao sítio onde se corrige.
Erros, que impedem o envio:
- orçamento vazio ou total a zero;
- secção de condições em falta no PDF;
- data do evento ou nomes dos clientes por preencher;
- validade da proposta por definir, ou já ultrapassada;
- e-mail do destinatário em falta.

Avisos, que não impedem:
- tema sem fotografias;
- tema com fotografias de resolução insuficiente;
- data do evento já ocupada por outro evento;
- nota ou título de um tema por preencher.

Com um erro por resolver, o botão de enviar fica desativado e diz porquê. O mesmo vale para descarregar o PDF «final»; um rascunho pode ser descarregado, marcado como rascunho.
Esta lista é a minha proposta. Se o sistema tiver outras condições que tornem uma proposta inválida, acrescenta-as e diz-me quais.

## Bloco C · Rapidez e animação ao gerar o PDF
### C1. Medir antes de otimizar
Antes de mudar código, mede quanto tempo leva cada fase da geração de uma proposta real com cerca de 60 fotografias: ir buscar as imagens, tratá-las (redimensionar, escurecer, desfocar), compor as páginas, gravar o ficheiro, descarregar. Mostra-me os números. As alterações seguintes são as que eu espero que ajudem; se a medição apontar para outro sítio, diz-me e ajusta o plano.

### C2. Tornar a geração mais rápida
1. Tratar as fotografias no momento em que são carregadas, e não quando se gera o PDF. Cada fotografia fica guardada já nas versões necessárias: página inteira (cerca de 2000 px no lado maior), painel, e célula de mosaico (cerca de 1250 px), em JPEG. Gerar o PDF passa a ser só montar. As fotografias que já estão no sistema precisam de uma passagem única para criar estas versões.
2. Usar sempre a versão do tamanho certo. Uma fotografia de 4000 px numa célula de 300 px é tempo e peso desperdiçados. O PDF final de uma proposta normal deve ficar abaixo de 10 MB.
3. Tratar várias imagens em paralelo, com um limite razoável, em vez de uma de cada vez.
4. Gerar em segundo plano enquanto se edita. Quando eu paro de mexer durante uns segundos, o sistema começa a preparar o PDF. Se eu alterar alguma coisa, refaz só o que mudou. Quando carrego em «Descarregar», o ficheiro já está pronto ou quase.
5. Reaproveitar o que não mudou. Guarda cada página composta com uma chave calculada a partir do seu conteúdo; se eu só alterar um preço, não se refazem as páginas de fotografias.

O PDF gerado em segundo plano nunca pode ser entregue se a proposta mudou entretanto: confirma sempre que corresponde ao estado atual antes de o descarregar ou enviar.
Diz-me o tempo antes e depois, com a mesma proposta.

### C3. Animação de progresso
Hoje aparece uma barra genérica com o texto «A gerar o PDF… Assim que estiver desenhado, o PDF é descarregado». Não diz em que ponto vai.
- Progresso real, por página: «A desenhar a página 7 de 24 · Mesas de jantar». A barra avança quando uma página fica concluída, e não por tempo.
- Miniaturas a aparecer: à medida que cada página fica pronta, a sua miniatura surge numa fila.
- Fases com nome, quando não houver progresso por página: «A preparar as fotografias», «A compor as páginas», «A finalizar».
- Fim claro: quando termina, a caixa muda para «PDF pronto · 24 páginas · 6,2 MB», com os botões «Abrir» e «Descarregar outra vez». Não desaparece sozinha.
- Erro explicado: se falhar, diz em que página e porquê («a fotografia 3 do tema Cocktail não carregou»), com «Tentar de novo». Tentar de novo retoma de onde falhou, sem refazer tudo.
- Não bloquear: posso continuar a editar ou avançar para «Rever e enviar» enquanto o PDF é gerado.

A animação deve ser discreta e no estilo do resto do back office. Respeita a preferência do sistema por movimento reduzido.

## Bloco D · Lista de pedidos
### D1. Avisar de pedidos duplicados
Na lista aparecem «Ana Serra Lobo» e «Ana lobo», com o mesmo tipo de evento, a mesma data (6 de novembro de 2026) e o mesmo local, uma como «Aguardar resposta» e outra como «Novo». Parece o mesmo pedido feito duas vezes.
- Quando dois pedidos têm a mesma data de evento e nomes parecidos (ignorando maiúsculas, acentos e nomes do meio), ou o mesmo e-mail ou telefone, mostra em ambos uma etiqueta «Possível duplicado», com ligação ao outro.
- Deixa-me juntar os dois num só, escolhendo qual fica como principal. O que foi escrito em cada um (mensagens, notas, propostas já feitas) não se perde.
- Deixa-me também dizer «não são o mesmo», para a etiqueta desaparecer e não voltar.
- Nunca juntes pedidos automaticamente.

Diz-me se já existem duplicados na base de dados atual e quantos, antes de implementar a junção.

## Como sei que está pronto
- A1: altero o título de um tema e, em poucos segundos, vejo a página desse tema atualizada ao lado, igual à que sai no PDF.
- A2: percorro os cinco passos, saio e volto, e nada se perdeu; cada passo mostra o seu estado.
- A3: marco outra fotografia como destaque e ela passa para a célula maior, na pré-visualização e no PDF.
- A4: carrego uma fotografia pequena e aparece a vermelho; o sistema não a usa em página inteira.
- B1: numa proposta sem orçamento, o envio está bloqueado e a lista diz porquê; preencho o orçamento e desbloqueia.
- C2: a mesma proposta gera em menos tempo do que hoje, com os números à vista; o ficheiro fica abaixo de 10 MB.
- C3: vejo o progresso página a página, o estado final com o tamanho do ficheiro, e uma mensagem clara se provocar uma falha.
- D1: os dois pedidos da Ana aparecem marcados; junto-os e fica um só, com o histórico dos dois.

Testa tu próprio cada um destes pontos no browser antes de me dizeres que está feito, e diz-me o que testaste e o que não conseguiste testar. Se alguma coisa não ficou como pedido, diz-mo em vez de a dares como concluída.

## O que não pode mudar
- Os cálculos do orçamento, do IVA, do sinal e do saldo.
- Os textos das condições, que são contratuais.
- O desenho do PDF, que está a ser tratado noutro pedido.
- As propostas já enviadas e os seus ficheiros.
