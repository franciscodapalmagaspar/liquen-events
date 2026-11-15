# Reconstruir o ecrã «Fazer proposta» segundo o sistema da Apple

> **Âmbito:** a rota `/orcamento/admin/propostas/nova` e `/propostas/[id]/editar`.
> Não toques em mais nada.
> **Pré-requisito:** os tokens do `docs/DESIGN-SYSTEM.md` já existem.
> **Marcações:** **[APPLE]** = regra publicada pela Apple · o resto é tradução para web.

Este é o ecrã onde a Catarina passa mais tempo. Tem hoje cerca de **8 000 px de
altura**, seis secções abertas em simultâneo, sete mood boards expandidos, cinco
caixas de nota idênticas, três níveis de navegação a competir e duas barras
fixas empilhadas no fundo. Nada disto é um problema de cor ou de raio de canto —
é um problema de arquitetura. As primeiras nove correções mudam o que o ecrã
**é**.

---

## PARTE −1 — A DECISÃO DELA QUE ALTERA ESTE DOCUMENTO

**O ponto 3 não se aplica, e é ela que o diz.**

O documento manda a barra de separadores do fundo desaparecer e a navegação
global passar toda para uma sidebar de vidro à esquerda, com a regra da Apple
atrás («máximo cinco separadores; nunca gerar um separador "Mais"»).

Só que essa barra é dela. Numa ronda anterior, posta a escolher entre manter a
coluna da esquerda e substituí-la pela barra inferior de vidro, ela escolheu
**«A barra substitui o menu»** — e essa barra foi construída, está em todos os
ecrãs e é o que ela usa todos os dias.

Perguntei-lhe outra vez, com o documento novo na mão e as três saídas em cima
da mesa. Resposta: **«Fica a barra de baixo.»**

Portanto, neste repositório:

* a **fase 01** da ordem de execução (Parte 10) **não se faz**;
* a navegação global continua na barra inferior;
* o **rail de secções** deste ecrã mantém-se e passa a navegação (fase 03), que
  é a parte do desenho que resolve o scroll — e essa não depende da sidebar;
* a proibição «barra de separadores no fundo» (Parte 11) **não vale aqui**.

**E a barra de acção do «Rever e enviar» encolhe no telemóvel** (14/10). Palavras
dela: «esta aba de enviar ao cliente no telemóvel tapa tudo… transforma isto em
algo inteligente que se adapte». Numa caixa com menos de 640 px, a barra fica com
uma linha: «←», uma pastilha com o estado («Faltam 3 ›», «Ver o PDF ›»,
«PT · pronto ›») e «Enviar». A pastilha abre uma folha com o resto — o «Vai
para», o que falta, a língua e o descarregar. Com o teclado aberto, a barra sai
da frente (`BarraDoEnvioCompacta.tsx`).

**E no ecrã largo também passa a uma linha** (14/10, com a captura do cartão de
três andares: «melhora isto drasticamente»). Ela escolheu «uma linha só»: «←»,
a MESMA pastilha do estado — que no computador abre um painel por cima dela com
«Vai para», o que falta (cada falta salta para onde se resolve) e o que o inglês
muda —, a língua (PT · EN), o canal só com os logótipos, o PDF e o botão. E «o
botão guia»: quando a única coisa que falta é ver o PDF final, o botão diz «Ver
o PDF final» e, depois de descarregado, «Está certo — enviar», que regista a
confirmação e abre a pergunta de sempre. A caixa «Antes de enviar» do corpo do
passo continua, e a falta «ver o PDF» passou a saltar para ela (antes ia dar ao
«Por onde segue»).

**E no telemóvel as barras encolhem ao descer** (15/11, aprovado por ela). A
390 × 664, a descer, só 59 % do ecrã era formulário. Agora, ao DESCER, o
cabeçalho do back office sai por cima e ficam só os passos, compactos; a barra
de destinos fica («Fica a barra de baixo») e a de acção fica só com o total «A
pagar» e o botão principal. Ao SUBIR, ou no topo, volta tudo. Medido: 69 % de
formulário. Só por `translate` (nada empurra o formulário), só no telemóvel ou
num tablet de toque, e com «reduzir movimento» muda sem animar
(`ui/barras-que-encolhem.ts`, «As barras que encolhem» no `admin.css`, caso 9
do `e2e/o-iphone-com-barras.spec.ts`).

Tudo o resto do documento vale como está escrito, com uma segunda ressalva, que
veio depois:

**O PDF mudou de desenho, e o estúdio com ele** (9 de outubro; ver
`docs/PDF-EDITORIAL.md`, «O estúdio, adaptado ao PDF novo»). Onde este
documento fala do inspector «O que vai sair» ou das miniaturas das páginas,
são agora as páginas do PDF novo (`PaginaEditorial.tsx`, pelo `plano.ts`). A
disposição de cada tema e o «Manter a forma» saíram da toolbar dos temas: o PDF
decide a composição pelo número de fotografias, e o cartão di-lo só de leitura.
A capa passou a ter um lugar só.

---

## PARTE 1 — AUDITORIA

### A. Arquitetura

**1. Tudo aberto ao mesmo tempo.**
Seis secções expandidas em simultâneo, sete mood boards abertos, cada um com
quatro a nove fotografias, e no fim uma grelha de treze miniaturas. A página tem
oito mil píxeis.
Regra: *se não cabe tudo, mostrar um controlo de expansão; esconder detalhes até
serem relevantes; manter no topo o que é mais usado.* **[APPLE, Layout +
Disclosure controls]**
Correção: **uma secção de cada vez**. O rail da esquerda já lista exatamente as
seis secções — mas hoje é um resumo passivo. Passa a ser **navegação**. Só essa
mudança elimina 85% do scroll.

**2. Três níveis de navegação a competir.**
O stepper (1 Conteúdo · 2 Pré-visualizar · 3 Enviar), o rail lateral com seis
secções, e o segmented «Decoração | Organização». Nenhum tem precedência visual
sobre o outro.
Regra: *é mais importante do que nunca ter uma estrutura de navegação clara e
consistente, distinta do conteúdo.* **[APPLE]**
Correção: hierarquia explícita. **Nível 1** = stepper, na toolbar de topo.
**Nível 2** = rail de secções, na coluna esquerda. **Decoração/Organização não é
navegação — é um filtro de conteúdo** e desce para a toolbar da secção que
afeta.

**3. A barra de separadores do fundo tem onze itens.**
*(Ver a Parte −1: neste repositório este ponto não se aplica, por decisão dela.)*

**4. Duas barras fixas empilhadas no fundo.**
A barra de resumo («guardado às 13:08 · Total 3140,00 € · Pré-visualizar») mais
a barra de separadores. Cerca de 100 px de altura combinada a comer o
formulário.
Regra: *evitar controlos ou informação crítica no fundo da janela.* **[APPLE,
Layout]**
Correção: a barra de resumo passa a **48 px de vidro** com o total, e o estado
de gravação sobe para a toolbar. *(Com a barra de destinos a ficar, são duas —
mas a de resumo emagrece e deixa de repetir o que está em cima.)*

**5. Ações do documento espalhadas por quatro sítios.**
«Criar a partir de…», «Guardar como modelo», «Desfazer», «Limpar rascunho» numa
linha; «Abrir o pedido» e «Trocar de cliente» noutra; «Pré-visualizar» no fundo;
«Tudo guardado» e «Pesquisar» no topo.
Regra: *máximo três grupos de controlos numa toolbar; uma e uma só ação
primária, sempre no fim.* **[APPLE, Toolbars]**
Correção: **uma toolbar única**, três grupos — [voltar · título · cliente] ·
[estado de gravação · pesquisa] · [menu «⋯» com as ações do documento ·
**Pré-visualizar**].

**6. Dois botões verdes preenchidos ao mesmo tempo.**
«Criar a partir de…» no topo e «Pré-visualizar →» no fundo.
Regra: *máximo um a dois botões proeminentes por vista; distinguir por estilo,
nunca por posição.* **[APPLE]**
Correção: um. «Criar a partir de…» passa a item do menu «⋯», porque é uma ação
de arranque, usada uma vez por proposta.

**7. Nove parágrafos de instrução dentro dos formulários.**
Contei nove. O pior tem quatro linhas a explicar como os valores adicionais
entram no total, e ainda repete os números — *«Subtotal dos serviços 3000,00 €,
mais 140,00 € destas linhas, dá 3140,00 € sem IVA e 3882,20 € a pagar.»*
Regra: *não explicar como funcionam componentes-padrão;* e a mais dura de todas:
***se a linguagem não chega, repensar a interação.*** **[APPLE, Writing]**
Correção: cada parágrafo destes é a cicatriz de uma decisão de design que não foi
tomada. Não os reescrevas — **elimina a necessidade deles**. A soma dos valores
adicionais não se explica: mostra-se, com a tabela de totais visível e a linha a
aparecer nela em tempo real ao escrever. O que sobrar vai para tooltips e para o
botão «?» de ajuda contextual.

**8. Cinco caixas de nota idênticas.**
«Nota sobre as capas», «Nota sobre os serviços», «Nota sobre os mood boards»,
«Nota sobre o orçamento», «Nota sobre o total» — cada uma com o mesmo aviso *«só
para ti, nunca sai na proposta»*, e todas com peso visual de bloco.
Regra: *agrupar itens relacionados; dar espaço à informação essencial e empurrar
o secundário para outra zona.* **[APPLE]** Cinco repetições da mesma frase é a
definição de ruído.
Correção: **um painel de notas** no inspector à direita, com as notas por secção
lá dentro, e o aviso escrito **uma vez**. No cabeçalho de cada secção fica um
botão discreto de nota, com ponto quando tem conteúdo.

**9. A «Vista de conjunto» está no sítio errado.**
As treze miniaturas do PDF — a coisa mais útil do ecrã, a única que responde a
«o que é que o cliente vai receber?» — estão a 7 500 px do topo.
Regra: *o mais importante em cima e do lado inicial.* **[APPLE]**
Correção: passa a **inspector permanente à direita**, sempre visível, com a
página atual destacada e clique para saltar. Substitui o painel «O que vai sair»,
que hoje ocupa uma coluna inteira para mostrar **uma** inspiração de sete.

### B. Material e forma

**10. Zero camada funcional.** Não há vidro em lado nenhum; toolbar e barra do
fundo são superfícies opacas com borda. Correção: toolbar de topo, rail de
secções e barra de resumo em `.glass`; conteúdo opaco por baixo;
`scroll-edge-hard` na toolbar, porque tem cabeçalhos e controlos com texto a
passar por baixo. **[APPLE]**

**11. Cartões brancos sobre fundo branco, delimitados por borda.** Elevação em
modo claro faz-se por **sombra**. **[APPLE]** Correção: `--shadow-raised`, sem
borda.

**12. A cor creme das notas não existe na paleta.** Um bege que não significa
aviso, nem informação, nem sucesso. Correção: as notas vão para o inspector
(ponto 8); onde restarem, `--bg-subtle` com barra lateral de 2 px em `--warning`
e ícone.

**13. O aviso do recorte da capa é um parágrafo vermelho solto.** *«A tira de
capa é quase duas vezes mais alta do que larga; esta fotografia perde 69% da
área.»* A informação é excelente e a apresentação é uma acusação sem saída.
Correção: **badge sobre a miniatura** com ícone e o número em destaque, mais
**dois botões de ação directa** — «Recortar» e «Escolher outra». *Mostrar quando
um comando não pode ser cumprido **e** ajudar a perceber porquê.* **[APPLE,
Feedback]**

**14. Quatro alturas de campo no mesmo ecrã.** Campos do Evento a ~42 px, linhas
de Serviços a ~28 px, campos EN mais pequenos que os PT, campos de mood board
mais pequenos ainda. Correção: **duas** alturas, ligadas à densidade — 34 px
confortável, 26 px compacta. Mais nenhuma.

**15. Os pares PT/EN não têm forma consistente.** Ora lado a lado, ora
empilhados, com o marcador «EN» ora fora ora dentro do campo. Correção: **um
componente único**, `BilingualField`: PT em cima, EN em baixo, marcador «EN» fixo
de 24 px à esquerda, sempre a mesma geometria, em todo o ecrã.

**16. Larguras de campo arbitrárias.** «Valor (€)» com ~60 px, «Descrição» com
~350 px, «IVA da linha» com ~90 px. Regra: *a largura do campo é uma pista visual
da quantidade de texto esperada.* **[APPLE]** Correção: escala de quatro
larguras — 80 · 128 · 240 · 420 — repetida em todo o lado.

**17. Cabeçalhos de secção indistinguíveis do conteúdo.** Um triângulo minúsculo
e texto do mesmo peso. Correção: `text-title3/600`, com o disclosure a 12 px,
toda a linha clicável, `aria-expanded`.

**18. Serviços e Orçamento são grelhas de `div`.** Têm colunas, cabeçalhos e
totais — são tabelas. Correção: `<table>` real, com `<th scope="col">`, totais em
`<tfoot>` com `aria-live="polite"`.

**19. As grelhas de fotografias misturam rácios.** 4:3, 3:4 e quadrados na mesma
fila. Correção: rácio fixo em toda a grelha com `object-fit: cover`; o «não
cortar» muda **a grelha inteira**, não fotografia a fotografia.

### C. Comportamento

**20. Dois indicadores do mesmo estado, em extremos opostos.** «✓ Tudo guardado»
no topo e «guardado às 13:08» no fundo. Correção: um só, na toolbar: «A
guardar…» → «Guardado às 13:08».

**21. «Desfazer» é um botão desativado.** Regra: *rotular a ação — «Desfazer
Eliminar linha»; mostrar o resultado, fazendo scroll até ele se estiver fora do
ecrã; permitir desfazer várias vezes, sem limite artificial.* **[APPLE]**
Correção: `⌘Z` real, com pilha, rótulo dinâmico no menu, e destaque de 1,2 s no
elemento restaurado.

**22. Sete mood boards abertos, com os mesmos controlos sete vezes.**
«Disposição: Filas · recorta», a checkbox «Manter a forma», «Escolher da
biblioteca de temas», «Guardar como modelo» — repetidos sete vezes. Correção:
**um board de cada vez**; o rail já os lista; os controlos comuns sobem para a
toolbar da secção.

**23. Sem estados de arrasto.** As pegas existem, mas não há linha de inserção,
nem realce de destino válido, nem estado inválido, nem animação de regresso
quando falha. **[APPLE, Drag and drop]**

**24. Os atalhos de teclado estão enterrados** num link dentro da secção
Serviços. Esta é a página onde mais valem. Correção: atalhos reais, listados no
menu, com `⌘/` a abrir a folha de referência.

**25. «Falta para enviar · A secção Serviços está vazia»** é a informação mais
accionável do ecrã, em letra pequena, no fundo do rail. Correção: sobe para o
topo do rail como bloco de estado, com contagem e ligação directa à secção em
falta.

**26. Os totais recalculam em silêncio.** Sem `aria-live`, sem transição, sem
destaque. Correção: `aria-live="polite"` no total, e um realce de 400 ms no valor
que mudou.

**27. Nada responde a `prefers-reduced-motion`, `prefers-reduced-transparency`
nem `prefers-contrast`.**

---

## PARTE 2 — A ARQUITETURA NOVA

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⟨  Fazer proposta · Melanie e Sebastien        ✓ Guardado 13:08   ⌘K  ⋯  │ toolbar vidro 52
│     ①  Conteúdo  ──  ②  Pré-visualizar  ──  ③  Enviar          Pré-visualizar│
├──────────────────┬────────────────────────────────┬─────────────────────┤
│                  │                                │                     │
│  RAIL DE SECÇÕES │  EDITOR DA SECÇÃO ATIVA        │  INSPECTOR          │
│  220px · vidro   │  (uma de cada vez)             │  300px              │
│                  │                                │                     │
│  ⚠ Falta enviar  │  ▾ Evento                      │ ▣ Vista de conjunto │
│    Serviços vazia│    [campos, 2 colunas]         │   13 págs · ↑ atual │
│                  │                                │                     │
│  ● Evento        │                                │ ▤ Notas internas    │
│  ● Capas 2 fotos │                                │                     │
│  ⚠ Serviços      │                                │ ▨ Fotos             │
│  ● Mood boards 7 │                                │                     │
│  ● Orçamento     │                                │                     │
│  ● Total 3882,20 │                                │                     │
├──────────────────┴────────────────────────────────┴─────────────────────┤
│  Total 3 140,00 € sem IVA  ·  a pagar 3 882,20 €                        │ resumo vidro 48
└──────────────────────────────────────────────────────────────────────────┘
   (e por baixo, a barra de destinos de vidro que já existe — Parte −1)
```

**Seis decisões que isto encerra** *(a sétima, a sidebar, saiu pela Parte −1)*:

1. O rail de secções passa de resumo a **navegação**: clicar muda o editor, não
   faz scroll.
2. **Uma secção visível de cada vez.** Zero acordeões abertos em simultâneo.
3. **Um mood board de cada vez**, escolhido no sub-rail que já existe dentro da
   secção.
4. O inspector da direita tem três painéis comutáveis — **Vista de conjunto**
   (predefinido), **Notas internas**, **Fotografias**. As cinco caixas de nota
   tornam-se um painel.
5. A barra de resumo fica com 48 px: total, e mais nada. O estado de gravação
   sobe para a toolbar.
6. `Decoração | Organização` desce para a toolbar da secção, porque é um filtro
   do conteúdo, não navegação.

**Larguras:** rail 220 · editor flexível com `max-width: 760px` para o texto não
esticar · inspector 300 (colapsável). Abaixo de 1440 px esconde-se o inspector;
abaixo de 1200 px o rail vira um select no topo do editor; abaixo de 900 px é uma
coluna só com navegação por sheet. **Adia a vista compacta o máximo possível.**
**[APPLE]**

---

## PARTE 3 — SECÇÃO A SECÇÃO

### Evento
Duas colunas, campos na escala de quatro larguras, `text-footnote/600` nos
rótulos. «Título interno (opcional)» — marca o **opcional**, nunca o obrigatório.
**[APPLE]** A ajuda passa a tooltip no rótulo. `Data` usa picker compacto com
granularidade de 15 minutos e semana a começar à segunda. **[APPLE]**

### Capas
Miniaturas com rácio fixo. O aviso de recorte passa a **badge sobre a imagem**:

```
┌─────────────────┐
│                 │
│   [fotografia]  │
│                 │
│ ⚠ perde 69%     │  ← badge, --warning, canto inferior
└─────────────────┘
   Recortar   Trocar     ← ações directas, sempre visíveis quando há aviso
```

O número é o protagonista, não a frase. E há sempre uma saída — *mostrar quando
algo não pode ser cumprido e ajudar a perceber porquê.* **[APPLE]**

### Serviços
`<table>` real. Colunas: arrastar · Serviço (PT/EN) · Grupo · ações. Linha de
40 px. `+ Adicionar linha` como última linha da tabela, não como link solto. `Da
biblioteca` abre um popover de escolha, não navega. Cada linha nova **herda os
valores da anterior**. Suporta colar do Excel.

### Mood boards
Um board aberto de cada vez. O sub-rail à esquerda da secção mantém-se, com o
número de fotografias e o ponto de estado. Os controlos comuns — disposição,
manter forma, biblioteca, guardar como modelo — sobem para a **toolbar da
secção** e aplicam-se ao board activo. `+ Adicionar mood board`, `Fechar todos` e
`Abrir todos` desaparecem: deixam de fazer sentido quando só há um aberto.

Grelha de fotografias com rácio fixo, `object-fit: cover`, e **linha de
inserção** visível ao arrastar. Máximo três animações em simultâneo na grelha.

### Orçamento
`<table>` com `<tfoot>`. O bloco de quatro linhas que explica como os valores
adicionais somam **desaparece** — em vez disso, a tabela de totais fica visível
no inspector e a linha nova aparece nela ao escrever, com realce de 400 ms. A
explicação torna-se supérflua porque a soma passa a ser visível.

O select «Somam ao valor» precisa de rótulo introdutório que torne as opções
previsíveis sem abrir. **[APPLE]**

### Total, IVA e validade
O parágrafo de cinco linhas com números repetidos sai. Fica a tabela de totais,
com `tabular-nums`, e um `?` que abre um popover com a fórmula. «Passar a usar
60 dias em todas as propostas novas» é uma **definição**, não pertence a este
ecrã: move-se para Definições → Propostas, e aqui fica só o campo. *Opções
específicas de uma tarefa ficam no ecrã que afetam; definições gerais vão para as
Definições.* **[APPLE]**

---

## PARTE 4 — COMPONENTES NOVOS

**`BilingualField`** — o mais repetido do ecrã, e hoje o mais inconsistente.

```tsx
<BilingualField
  label="Decoração Floral de Casamento"
  valuePt={pt} valueEn={en}
  onChangePt={...} onChangeEn={...}
  multiline={false}
/>
```

```css
.bi { display: grid; gap: 6px; }
.bi-en { display: grid; grid-template-columns: 24px 1fr; gap: 8px; align-items: center; }
.bi-en::before {
  content: "EN"; font: 600 10px/1 var(--font-sans); letter-spacing: .08em;
  color: var(--fg-tertiary); text-align: center;
}
.bi-en input { background: var(--bg-subtle); }   /* o EN é derivado, não primário */
```

O campo EN tem fundo subtil e o mesmo tamanho do PT. Nunca mais pequeno — tamanho
menor lê-se como menos importante, e uma proposta bilingue não tem uma língua
menos importante.

**`SectionHeader`** — `text-title3/600`, disclosure de 12 px que roda 150 ms,
linha inteira clicável, `aria-expanded`, e à direita um botão de nota com ponto
quando tem conteúdo.

**`NotePanel`** — no inspector. Uma lista das seis secções, com a nota de cada
uma, e o aviso *«Estas notas são só para ti. Nunca saem na proposta.»* escrito
**uma vez**, no topo.

**`PageOverview`** — o inspector predefinido. Treze miniaturas em grelha de dois,
com número e nome, a página actual com anel de 2 px em `--accent`, clique salta
para a secção que a gera. Actualiza ao vivo enquanto se escreve.

**`StatusRail`** — o rail de secções. Cada item: ponto de estado (`--success`
pronto · `--warning` por preencher · `--danger` vazio e obrigatório), nome, e uma
linha de resumo em `text-caption`. No topo, o bloco «Falta para enviar» com
contagem e ligação.

---

## PARTE 5 — MOVIMENTO

| Interação | Duração | Curva |
|---|---|---|
| Trocar de secção no rail | 200 ms | `--ease-out`, fade cruzado sem deslocação |
| Trocar de mood board | 200 ms | idem |
| Abrir/fechar disclosure | 325 ms | `--ease-quick`, `grid-template-rows: 0fr → 1fr` |
| Linha de tabela a entrar/sair | 475 ms | `--ease-reposition` |
| Reordenar por arrasto | 475 ms | `--ease-reposition`, sem ressalto |
| Realce do total que mudou | 400 ms | `--ease-out`, `background` a esbater |
| Realce do elemento restaurado por Anular | 1200 ms | `--ease-out` |
| Press de qualquer botão | 80 ms ida | `--ease-out`, regresso `--ease-press` |
| Inspector a colapsar | 320 ms | `--ease-sheet` |

**Nunca animes** a troca de secção com deslocação — é a interacção mais frequente
do ecrã e movimento numa interação de alta frequência cansa. **[APPLE]** Fade
cruzado e mais nada.

**Nunca animes** as treze miniaturas do inspector quando o conteúdo muda.
Actualiza-as em silêncio.

---

## PARTE 6 — ESTADOS

**Gravação.** Um indicador, na toolbar: `A guardar…` → `Guardado às 13:08`.
Debounce de 2 s. Espelho local em IndexedDB. Ao reabrir com divergência:
*«Recuperámos alterações não guardadas de há 5 minutos — Repor / Descartar.»*

**Validação.** O rail é o mapa de estado. Ponto verde = pronto · âmbar = por
preencher, mas opcional · vermelho = obrigatório e vazio. O bloco no topo diz
`Falta 1 secção para enviar` e liga.

**Erro numa linha.** Inline, sob o campo, `aria-invalid`, `role="alert"`. Nunca
em toast.

**A gerar PDF / a enviar.** O botão fica ocupado com fase: `A compor…` → `A gerar
PDF…` → `A enviar…`. Acima de 10 s, passa a segundo plano com notificação. **O
erro nunca destrói o rascunho.** PDF gerado e email falhado são **dois estados**,
não um.

**Vazio.** Secção Serviços sem linhas: `Ainda não há serviços nesta proposta.`
mais `Adicionar linha` e `Escolher da biblioteca`. Nunca uma tabela vazia sem
explicação. **[APPLE]**

---

## PARTE 7 — TECLADO

Esta é a página onde os atalhos valem mais. `⌘/` abre a folha de referência.

| Ação | Atalho |
|---|---|
| Guardar | `⌘S` |
| Desfazer / Refazer | `⌘Z` / `⇧⌘Z` |
| Secção seguinte / anterior | `⌘↓` / `⌘↑` |
| Adicionar linha na tabela activa | `⌘⏎` |
| Duplicar linha focada | `⌘D` |
| Eliminar linha focada | `⌘⌫` — com Anular de 10 s |
| Saltar entre PT e EN do mesmo campo | `⌥→` / `⌥←` |
| Pré-visualizar | `⌘P` |
| Pesquisar | `⌘K` |
| Mostrar/ocultar inspector | `⌥⌘I` |
| Fechar popover, menu ou sheet | `Esc` |

**Grupos de foco:** rail · editor · inspector. **Tab salta entre grupos, as setas
navegam dentro do grupo.** **[APPLE]** Ao entrar no editor, foca o primeiro campo
por preencher — não o primeiro campo.

---

## PARTE 8 — MICROCOPY

| Atual | Novo |
|---|---|
| Escolhe o cliente e escreve a proposta | *(fora — a página já se chama «Fazer proposta»)* |
| Tudo guardado | Guardado às 13:08 |
| Criar a partir de… | *(vai para o menu ⋯)* Começar a partir de um modelo… |
| Limpar rascunho | Eliminar rascunho *(com confirmação nomeada)* |
| Preenche ou deixa as caixas «EN» que ainda estão vazias. O que já escreveste fica como está — e vale a pena passar os olhos pelo que saiu. | Traduzir os campos vazios *(o resto é um tooltip)* |
| Notas internas — só para ti, nunca sai na proposta | *(uma vez, no topo do painel de notas)* Estas notas são só para ti. Nunca saem na proposta. |
| A tira de capa é quase duas vezes mais alta do que larga; esta fotografia perde 69% da área. Uma fotografia ao alto perde menos. | **Perde 69%** · badge na imagem, com «Recortar» e «Trocar» |
| O valor que escreveste em «Valor (sem IVA)» é o dos serviços, e estas linhas somam-se a ele. Subtotal dos serviços 3000,00 €, mais 140,00 € destas linhas, dá 3140,00 € sem IVA e 3882,20 € a pagar. | *(fora — a tabela de totais no inspector mostra-o)* |
| Passar a usar 60 dias em todas as propostas novas | *(move-se para Definições → Propostas)* |
| Falta para enviar · A secção Serviços está vazia | Falta 1 secção para enviar → **Serviços** |
| Só para ti: custos, margem, deslocação — nunca sai no PDF | Custos e margem *(o resto é tooltip)* |

Regra transversal: **o rótulo diz o que é; a explicação vive num tooltip de 60–75
caracteres que começa por verbo.** **[APPLE]** Se um tooltip de 75 caracteres não
chega, a interação está errada — corrige a interação.

---

## PARTE 9 — ACESSIBILIDADE

- `<table>` real em Serviços, Orçamento e Totais, com `<th scope>`, `<caption>` e
  `<tfoot>`.
- Total a pagar em `aria-live="polite"`; anúncio ao recalcular.
- Rail de secções como `<nav>` com `aria-current="page"` na activa.
- Disclosure com `aria-expanded` e `aria-controls`.
- Cada botão só de ícone com `aria-label` em português.
- Estado de arrasto anunciado: `role="status"` com «Linha 3 movida para a posição 1».
- Miniaturas do inspector com `alt` que nomeia a página.
- Grelhas de fotografias com `alt` descritivo — campo obrigatório no upload.
- Anel de foco de 3 px visível **sobre o vidro** da toolbar e do rail.
- Zoom a 200% sem scroll horizontal com o inspector escondido.
- Percurso completo só com teclado: escolher cliente, preencher evento, adicionar
  serviço, escrever board, pôr valores, pré-visualizar.

---

## PARTE 10 — ORDEM DE EXECUÇÃO

| # | Fase | Entrega |
|---|---|---|
| 00 | **Bug dos valores** | O bug em que os totais crescem sozinhos ao reabrir. Antes de tudo. |
| 01 | ~~**Shell**~~ | *Não se faz — ver a Parte −1. A barra de baixo fica, por decisão dela.* |
| 02 | **Toolbar** | Uma toolbar, três grupos, uma ação primária, estado de gravação único. |
| 03 | **Rail navegável** | O rail passa de resumo a navegação; uma secção de cada vez. |
| 04 | **Inspector** | Vista de conjunto sempre visível; painel de notas absorve as cinco caixas. |
| 05 | **Tabelas** | Serviços, Orçamento e Totais passam a `<table>` semântica. |
| 06 | **BilingualField** | Um componente, aplicado em todo o ecrã. |
| 07 | **Purga de texto** | Os nove parágrafos: eliminar, ou converter em tooltip, ou mudar a interação. |
| 08 | **Mood boards** | Um de cada vez; controlos comuns na toolbar da secção. |
| 09 | **Capas** | Badge de recorte com ações directas. |
| 10 | **Movimento** | A tabela da Parte 5, com `prefers-reduced-motion` no mesmo commit. |
| 11 | **Teclado** | Atalhos, grupos de foco, `⌘/`. |
| 12 | **Arrasto** | Linha de inserção, destino válido, regresso animado, Anular. |
| 13 | **Acessibilidade** | A lista da Parte 9. |

**Critérios de aceitação**

1. A página cabe em **menos de 2 000 px** de altura em qualquer secção. Hoje tem
   8 000.
2. **Uma** secção expandida, **um** mood board aberto, **um** botão preenchido,
   **um** indicador de gravação.
3. Zero barras fixas no fundo além da barra de resumo de 48 px *(e da barra de
   destinos, que fica — Parte −1)*.
4. Zero parágrafos de instrução com mais de duas linhas dentro de um formulário.
5. A frase «só para ti, nunca sai na proposta» aparece **uma vez** em toda a
   aplicação.
6. Duas alturas de campo em todo o ecrã, não quatro.
7. O total a pagar está sempre visível sem scroll.
8. Percurso completo só com teclado, do cliente ao «Pré-visualizar».
9. O build passa, Playwright verde, Lighthouse de acessibilidade ≥ 95.
10. Com `prefers-reduced-motion`, `prefers-reduced-transparency` e
    `prefers-contrast: more`, tudo continua legível e utilizável.

---

## PARTE 11 — PROIBIÇÕES NESTE ECRÃ

Mais de uma secção expandida · mais de um mood board aberto · ~~barra de
separadores no fundo~~ *(ver a Parte −1)* · duas barras fixas · dois botões
preenchidos · dois indicadores de gravação · parágrafos de instrução dentro de
formulários · a mesma explicação repetida em mais de um sítio · grelha de `div`
onde há colunas e totais · campos EN mais pequenos que os PT · mais de duas
alturas de campo · larguras de campo fora da escala de quatro · rácios de imagem
misturados na mesma grelha · avisos sem ação associada · definições globais
dentro de um ecrã de tarefa · animação na troca de secção · desfazer sem rótulo e
sem mostrar o resultado · totais que mudam em silêncio · vidro na camada de
conteúdo · qualquer valor literal fora dos tokens.
