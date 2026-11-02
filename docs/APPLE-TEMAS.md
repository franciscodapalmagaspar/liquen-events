> **Este documento é dela**, e está aqui inteiro a partir da Parte 1. A tabela
> em baixo é a única coisa acrescentada.
>
> ⚠️ **Não confundir com `docs/temas.md`**, que é outra coisa: esse descreve a
> biblioteca de temas como ela já funcionava. Este manda reconstruí-la.

## ISTO ESTÁ PROMETIDO, E A PROMESSA ESTÁ AQUI E NÃO NUMA CONVERSA

**10 de Setembro de 2026** — «não te esqueças mesmo de fazer depois os temas.»

Ficou de fora da primeira ronda de agentes por uma razão que é dela e não contra
ela: dos três ecrãs, este é o que já tinha mais feito ANTES do documento existir
(4346 linhas, quase todas as fases começadas e nenhuma acabada). Pôr um agente
aqui ao mesmo tempo que os outros dois era a maneira mais rápida de desfazer
trabalho que já estava bom.

Fica registado por escrito porque uma promessa dita numa conversa é exactamente
o que se perde — foi assim que este documento e os outros dois andaram meses sem
existir em lado nenhum. Quem abrir este ficheiro a seguir, com os outros dois
ecrãs entregues, **este é o próximo**.

---

## O QUE JÁ ESTÁ FEITO

Auditado no `Temas.tsx` (4346 linhas) contra a tabela da **Parte 8**.

| # | Fase | Estado |
|---|---|---|
| 01 | Barra de topo | **parcial** — «Rever etiquetas» existe; falta a arrumação da Parte 8 |
| 02 | Cartões | **parcial** — há `line-clamp`; falta a altura uniforme e a sombra. **14/10:** na grelha das fotografias de um tema, os três círculos escuros (↑, ⤢, ×) passaram a **um só «⋯» de vidro claro** (28 px à vista, 44 de alvo no dedo), que abre o mesmo menu do botão direito — critério 3 da Parte 8, escolhido por ela («tipo apple»). «Pôr no início» voltou ao menu, que é o caminho de dedo para isso. O círculo da selecção ficou à maneira da app Fotografias |
| 03 | Menus | **feito** (reauditado a 1/11) — o botão direito abre o `MenuDeContexto` da casa no cartão do tema e na fotografia, com as mesmas acções do `⋯` («Mover para…», «Duplicar para…», favorito, arquivar) |
| 04 | Filtros | **feito** (reauditado a 1/11) — os cinco âmbitos «Todos · Por usar · Usados este ano · Favoritos · Arquivados» (`lib/temas-filtros.ts`, `AMBITOS`; «Usados este ano» só aparece quando há datas de uso para o responder) e a ordenação com os quatro critérios «Nome · Mais recentes · Mais usados · Menos usados» |
| 05 | Seleção | **feito** (reauditado a 1/11) — clique, `Shift`, `⌘`/`Ctrl` para somar, `⌘A` (fora dos campos e das janelas; a âncora fica na última), `Esc` limpa, e a barra de seleção é a superfície de vidro |
| 06 | Split view | **feito** — `ListaDeTemas.tsx`: coluna de 16rem a partir de `lg`, com capa, contagem, estrela do fixado e `aria-current` na linha aberta. O corte é em `lg` (1024) e não nos 1200 px do documento, porque esta casa tem três larguras e o `Cortes.contrato.test.ts` prende-as — justificado por escrito no código. O «← Temas» ganhou `lg:hidden` e a saída passa a ser «Todos os temas», primeiro item da coluna |
| 07 | Grelha de fotografias | **feito** — `aspect-[4/3]`, `gap-3` e `repeat(auto-fill,minmax(180px,1fr))` a partir de 24rem de contentor, com `grid-cols-2` por baixo: o `auto-fill` sozinho dá UMA coluna nos 309 px que um telemóvel de 375 dá a esta grelha. O tracejado passou a existir só durante o arrasto de ficheiros |
| 08 | Arrasto | **feito** — carga própria (`application/x-liquen-fotos`), crachá do número no arrasto múltiplo, spring loading a 1 s, `role="status"` com a frase da Parte 4, e **Anular** que move de volta e RELÊ a pasta (os caminhos e os URLs assinados mudam no servidor; repor de memória dava imagens partidas). «Mover para…» entrou no menu da fotografia, que é a alternativa obrigatória sem rato |
| 09 | Quick Look | **feito** — `Espaço` na célula abre, e o FLIP parte do rectângulo da miniatura com as curvas do `:root`. O `PhotoLightbox` foi ESTENDIDO (ganhou a prop `origem`), não substituído — as setas, o `Esc`, o trinco do scroll e a cascata do plano B já lá estavam. **Ressalva:** a ARIA manda o `Espaço` alternar uma `role="checkbox"` e o documento manda-o abrir o Quick Look; ficou o Quick Look, e o alternar não se perde porque o `Enter` num `<button>` dispara `click`. Fechou-se na fase 11 (2/11): a célula é um `role="gridcell"`, o `Espaço` é do Quick Look e o `Enter` alterna |
| 10 | Estados | **feito** (reauditado a 1/11) — `skeleton` com a geometria da grelha (`aspect-[4/3]`), «Ainda não há temas» com «Criar tema», «Nenhum tema corresponde a “…”» com «Limpar filtros» (mensagem diferente da biblioteca vazia), e o erro por imagem (`onError` → plano B, sem ícone partido) |
| 11 | Teclado e acessibilidade | **feito** (2/11) — a grelha das fotografias é um `role="grid"` (`aria-multiselectable`) com células `gridcell` e `aria-selected`; um só elemento no fio do Tab (foco itinerante, com o `⋯` da foto com foco); setas, Home/End, ⌘/Ctrl+Home/End e PageUp/PageDown andam (`lib/temas-grelha.ts`, `fotoPelaTecla`, com as colunas MEDIDAS no `grid-template-columns`); `Shift`+setas estende a selecção; `Espaço` = Quick Look, `Enter` alterna, `Alt`+setas move a foto. **Desvio:** uma só `role="row"`, com a linha e a coluna em `aria-rowindex`/`aria-colindex` em cada célula — linhas a sério desmontavam as células sempre que o número de colunas muda (ao abrir, ao alargar, a cada foto removida), e a fila dos originais perdia a ordem. A caixa de seleção continua dentro da célula (é o alvo do dedo e do rato) |

**Reauditado a 1/11:** quatro linhas desta tabela (03, 04, 05, 10) estavam
desactualizadas — o código já as tinha feito e a tabela não acompanhou. A 11
ficou feita a 2/11; ficam parciais a 01 e a 02.

Nenhuma fase por acabar inteira, e nenhuma acabada: este ecrã já tinha muito
feito ANTES do documento, e o documento pede outra coisa por cima. É o mais
caro dos três de auditar, e o que mais precisa de ser lido antes de se lhe tocar.

**Nota:** a barra da selecção deste ecrã é a primeira superfície de Liquid Glass
da casa — ver `docs/LIQUID-GLASS.md`, Parte −1.

---

# PROMPT — Reconstruir o ecrã "Temas" segundo o sistema da Apple

> **Âmbito:** as rotas `/orcamento/admin/temas` e `/temas/[id]`. Não toques em mais nada.
> **Pré-requisito:** os tokens do `docs/DESIGN-SYSTEM.md` já existem.
> **Marcações:** **[APPLE]** = regra publicada pela Apple · o resto é tradução para web.
>
> Este ecrã tem um problema diferente dos outros. O editor de propostas peca por excesso; o Temas peca por **falta**. São 567 fotografias em 28 temas apresentadas como uma página de catálogo — sem seleção múltipla, sem menu de contexto, sem arrastar entre temas, sem pré-visualização rápida, sem filtros. É a biblioteca de trabalho da Líquen a funcionar como uma montra.
>
> A referência mental certa aqui não é uma página web de galeria. É a **app Fotografias do Mac**.

---

## PARTE 1 — AUDITORIA

### A. Identidade e barra de topo

**1. O logótipo está centrado na barra de topo.**
Regra: *resistir a repetir o logótipo pela aplicação — as pessoas sabem que app estão a usar; espaço gasto só a exibir um ativo de marca é espaço roubado ao conteúdo.* **[APPLE, Branding]** Uma toolbar de Mac tem título, não wordmark.
Correção: **fora**. O nome da aplicação vive na sidebar, uma vez. A barra de topo fica com o título da vista.

**2. Duas cores de marca outra vez.** Logótipo dourado, botão verde. *Escolher **uma** cor de acento.* **[APPLE]** Correção: o acento é o sálvia; o logótipo, onde existir, é monocromático.

**3. A hierarquia do cabeçalho está invertida.**
"Fotos de inspiração por tema, prontas para as propostas" está **acima** do título "Temas", em cinzento pequeno. A descrição está a ocupar a posição de maior destaque.
Regra: *título curto que identifica a vista; menos de 15 caracteres.* **[APPLE, Toolbars]**
Correção: `Temas` na toolbar, e mais nada. A descrição desaparece — quem entra na secção Temas sabe o que são temas. Se fizer falta, é ajuda no botão "?".

**4. "567 fotos em 28 temas" está solta por baixo do campo de pesquisa.**
É a informação mais útil da barra e está apresentada como legenda perdida.
Correção: passa a **estado da vista**, ao lado do campo, em `role="status" aria-live="polite"`, e **muda ao filtrar**: `28 temas · 567 fotos` → `4 temas · 61 fotos`. **[APPLE, Searching: manter o âmbito visível]**

**5. O campo de pesquisa é uma cápsula; o resto dos controlos são retângulos.**
Regra do Tahoe: *mini a medium são retângulos arredondados; cápsula só em large e extra-large.* **[APPLE]**
Correção: campo de pesquisa a 10 px, como tudo o resto. E alinhado na mesma linha e na mesma baseline dos outros controlos.

**6. "Rever etiquetas" é um link de texto entre botões.**
Uma ação de manutenção rara, com o mesmo peso visual dos controlos de vista.
Regra: *máximo três grupos de controlos numa toolbar.* **[APPLE]**
Correção: vai para o menu "⋯", com "Fundir temas…", "Exportar biblioteca…" e as outras ações raras.

### B. A coleção

**7. Não há seleção múltipla.** 567 fotografias e 28 temas, e não se consegue selecionar dois.
Regra: *suportar seleção; `⌘A`; `Shift+clique` para intervalo; `⌘+clique` para adicionar.* **[APPLE, Collections + Focus and selection]**
Correção: seleção com clique, intervalo com `Shift`, adicionar com `⌘`. Ao haver seleção, a toolbar troca para **modo de seleção**: `3 selecionados` · Mover para… · Favoritos · Arquivar · Eliminar. Sem isto, mover quarenta fotografias são quarenta operações.

**8. Não há menu de contexto.** Numa coleção, o botão direito é obrigatório.
Regra: *incluir só os comandos mais prováveis; **tudo o que está no menu de contexto existe também na interface principal**; ocultar itens indisponíveis em vez de os esbater; 5 a 8 itens; **nunca mostrar atalhos de teclado num menu de contexto**.* **[APPLE, Context menus]**
Correção: menu de contexto no tema e na fotografia. Em área vazia da grelha, oferece "Novo tema".

**9. Três botões circulares cinzentos aparecem sobre a fotografia no hover.**
Sem rótulo, sem tooltip, com ícones ambíguos — o terceiro é indecifrável. Círculos escuros de peso visual alto por cima da imagem que é o conteúdo.
Regra: *usar botões só de ícone apenas quando o ícone é universalmente compreendido; fornecer sempre descrição de acessibilidade; preferir menu de contexto para ações por item.* **[APPLE, Icons + Context menus]**
Correção: **um** botão discreto `⋯` no canto superior direito, em vidro claro, que abre o mesmo menu do botão direito. As três ações passam a itens de menu, com nome escrito.

**10. Cartões com altura desigual.** "Clássico Intemporal (Branco/Dourado)" ocupa duas linhas e empurra o cartão; a fila fica desalinhada.
Regra: *componentes repetidos compõem-se como um só objeto — mesmas arestas, mesmas baselines, mesmo padding interno.* **[APPLE]**
Correção: título com altura reservada de duas linhas (`-webkit-line-clamp: 2`) em todos os cartões, com tooltip quando trunca. Nenhuma fila desalinhada.

**11. Cartões delimitados por borda em vez de sombra.** Em modo claro a elevação faz-se por sombra. **[APPLE]**

**12. "por usar" é metadado sem filtro.**
A informação mais acionável da grelha — que temas nunca foram usados numa proposta — está escrita em cada cartão e não há forma de filtrar por ela.
Correção: um filtro na toolbar com âmbitos, à maneira das coleções inteligentes: **Todos · Por usar · Usados este ano · Favoritos · Arquivados**. É o padrão da app Fotografias e é o que transforma esta página de catálogo em ferramenta.

**13. Datas relativas sem data absoluta.** "há 1 mês", "há 19 dias". Num contexto de trabalho não chega. Correção: mantém o relativo e acrescenta `title` com a data completa; a partir de 30 dias mostra a data.

**14. Sem estados de carregamento, vazio ou erro.** 567 fotografias precisam de skeleton com a **geometria real** da grelha, `blur-up`, e `aspect-ratio` reservado para não haver layout shift. Vazio: "Ainda não há temas." mais `Novo tema`. Filtro sem resultados é uma mensagem **diferente** de biblioteca vazia. **[APPLE]**

**15. Sem atalhos.** Numa galeria: `⌘F` pesquisar · `⌘A` selecionar tudo · `Espaço` pré-visualizar · `⌘N` novo tema · setas para navegar · `Enter` abrir · `⌘⌫` eliminar com Anular.

### C. O detalhe do tema

**16. O detalhe é uma página nova com "← Temas".**
Isso é navegação de telemóvel aplicada a um ecrã de desktop.
Regra: *split view para relações lista→detalhe; seleção persistente no painel que conduz ao detalhe.* **[APPLE, Split views]**
Correção: **split view**. Lista de temas à esquerda (a grelha colapsa para lista quando há detalhe aberto, ou fica em coluna estreita), fotografias à direita. Trocar de tema não recarrega a página. Se mantiveres a navegação por página, no mínimo **preserva o scroll e a seleção** ao voltar. **[APPLE: restaurar o estado anterior]**

**17. A área tracejada está sempre visível.**
Regra: *mostrar sinal de aceitação **só** sobre um destino válido, durante o arrasto; remover o feedback ao sair.* **[APPLE, Drag and drop]** Um tracejado permanente é ruído que ensina a ignorar o sinal.
Correção: a grelha é só a grelha. O tracejado — ou melhor, um realce do contentor mais uma linha de inserção — aparece **apenas** quando há algo a ser arrastado por cima.

**18. Quatro controlos flutuantes numa miniatura, um em cada canto.**
Círculo cinzento em cima à esquerda, `×` em cima à direita, `⤢` em baixo à esquerda, `↑` em baixo à direita. Quatro ações, quatro cantos, zero rótulos.
Correção: o canto superior esquerdo passa a **checkbox de seleção** (aparece no hover, fica no clique) — é o padrão da app Fotografias. O resto vai para o menu de contexto. O `⤢` é substituído pela **barra de espaço**, que é o gesto de pré-visualização da Apple. **[APPLE: Quick Look]**

**19. O `×` remove uma fotografia a um clique.**
Sem confirmação e, aparentemente, sem forma de anular.
Regra: *avisar antes de uma ação com perda inesperada e irreversível; e permitir desfazer sempre, rotulando a ação e mostrando o resultado.* **[APPLE]**
Correção: nem alerta, nem `×` visível. Remover fica no menu, e produz um toast **"Fotografia removida — Anular"** de 10 s. Anular faz scroll até à posição e destaca-a.

**20. "Eliminar tema" é um link de texto ao lado do botão primário.**
Uma ação destrutiva com o mesmo peso de um link comum, e adjacente à ação principal.
Regra: *ações destrutivas no fim, a vermelho, com confirmação nomeada.* **[APPLE]**
Correção: vai para o menu "⋯" do tema, a vermelho, e a confirmação diz o nome e o custo: *"Eliminar o tema «Bouquets Campestres» e as suas 5 fotografias? Esta ação não pode ser anulada."*

**21. As fotografias do detalhe estão numa fila única com rácios misturados.**
3:4, 4:3 e quadrado lado a lado. E com 41 fotografias, uma fila não resolve.
Regra: *manter a mesma dimensão em todas as imagens de uma sequência.* **[APPLE, Images]**
Correção: grelha `repeat(auto-fill, minmax(180px, 1fr))`, **rácio fixo 4:3** com `object-fit: cover`, gap de 12. O "não cortar" é uma opção da vista que muda a grelha **inteira**, nunca fotografia a fotografia.

**22. Não se arrasta uma fotografia de um tema para outro.**
É a operação mais natural desta biblioteca e não existe.
Regra: *arrastar dentro do mesmo contentor **move**; para contentor diferente **copia**; Alt inverte; agrupar arrasto múltiplo com badge do número; animar o regresso quando falha; permitir desfazer sempre.* **[APPLE]**
Correção: arrastar para um tema da lista lateral. Manter sobre um tema durante ~1 s abre-o — *spring loading*. **[APPLE]**

**23. Sem pré-visualização rápida.** `Espaço` abre a fotografia em grande, setas navegam, `Espaço` fecha. É o gesto que qualquer utilizador de Mac tenta primeiro.

**24. Sem semântica de grelha.** A grelha precisa de `role="grid"` ou de lista, navegação por setas, foco visível distinto da seleção, e `aria-selected`. **Foco e seleção são coisas diferentes** e têm de se distinguir visualmente: selecionado **com** foco usa `--sel` com texto invertido; selecionado **sem** foco usa `--sel-unemph`. **[APPLE, Focus and selection]**

---

## PARTE 2 — A ARQUITETURA NOVA

```
┌────────────────────────────────────────────────────────────────────────┐
│  Temas          ⌕ Procurar…    28 temas · 567 fotos      ⋯   + Novo tema │ toolbar vidro 52
│  ▸ Todos  Por usar  Usados este ano  Favoritos  Arquivados   Compacto ⇄  │ filtros 40
├──────────────────┬─────────────────────────────────────────────────────┤
│                  │                                                     │
│  LISTA DE TEMAS  │   GRELHA DE FOTOGRAFIAS DO TEMA ATIVO               │
│  260px           │   rácio fixo 4:3 · auto-fill minmax(180px,1fr)      │
│                  │                                                     │
│  ▸ Bouquets B/A  │   ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐               │
│    14 · há 1 mês │   │  ☑ │ │    │ │    │ │  ⋯ │ │    │               │
│  ▸ Bouquets B/V  │   └────┘ └────┘ └────┘ └────┘ └────┘               │
│    16 · há 2 dias│                                                     │
│  ▸ Campestres  ● │   Espaço = pré-visualizar · arrastar para outro tema │
│    5 · por usar  │                                                     │
│  …               │                                                     │
├──────────────────┴─────────────────────────────────────────────────────┤
│  3 selecionadas    Mover para…   Favoritos   Arquivar   Eliminar        │ modo seleção
└────────────────────────────────────────────────────────────────────────┘
```

Sem seleção ativa, a barra do fundo desaparece. Com seleção, entra de baixo com `--ease-sheet` e a toolbar de topo mantém-se — nunca as duas ao mesmo tempo a mudar.

**Duas vistas, um seletor:** `Grelha de temas` (o que tens hoje, corrigido) e `Biblioteca` (o split view acima). O split view é o predefinido em ecrãs acima de 1200 px, porque é onde o trabalho real acontece.

---

## PARTE 3 — COMPONENTES

**`ThemeCard`**

```
┌──────────────────┐
│                  │  imagem 4:3, object-fit: cover
│              ⋯   │  botão glass, 28px, só no hover ou com foco
│  ☑               │  checkbox de seleção, canto superior esquerdo
├──────────────────┤
│ Bouquets Branco  │  headline/600, line-clamp 2, altura reservada
│ e Amarelo        │
│ 14 fotos ·       │  caption, --fg-tertiary, tabular-nums
│ 1 proposta · ⚑   │  bandeira de favorito quando aplicável
└──────────────────┘
```

- Raio 12 px, sombra `--shadow-raised`, sem borda.
- Hover: elevação, `--ease-interactive`, 150 ms. **Nunca `scale`** — sobrepõe os vizinhos.
- Foco: anel de 3 px. Seleção: `--sel` a 2 px por fora mais o checkbox marcado. **São estados diferentes e vêem-se ao mesmo tempo.**
- `⋯` só aparece no hover **ou quando o cartão tem foco de teclado** — senão é inacessível por teclado.

**Menu do tema** (contexto e `⋯`, iguais):
`Abrir` · `Pré-visualizar` — separador — `Adicionar fotografias…` · `Renomear…` · `Definir capa…` — separador — `Favorito` · `Arquivar` — separador — `Eliminar tema…` (vermelho).
Sete itens, três grupos, ações destrutivas no fim, reticências quando abre outra vista. **[APPLE]**

**Menu da fotografia:**
`Pré-visualizar` · `Abrir tamanho real` — separador — `Mover para…` · `Duplicar para…` · `Definir como capa` — separador — `Remover do tema` (vermelho).

**`SelectionBar`** — barra de vidro no fundo, 48 px, só existe com seleção. `N selecionadas` em `headline/600`, depois as ações. `Esc` limpa a seleção.

**`QuickLook`** — `Espaço` abre. Fundo escuro a 60% com blur, imagem centrada com raio 12, setas ‹ › para navegar, `Espaço` ou `Esc` fecha, nome e tema em rodapé. Entrada com `--ease-quick` a partir da posição da miniatura (FLIP), não do centro do ecrã.

---

## PARTE 4 — ARRASTAR

Este ecrã vive do arrasto. Implementa-o a sério.

- Imagem de arrasto translúcida a partir de ~3 px de deslocação. **[APPLE]**
- Arrasto múltiplo agrupado com **badge oval do número**, que **atualiza** se o destino só aceitar parte. **[APPLE]**
- Sinal de aceitação **só** sobre destino válido: o tema na lista realça-se com `--accent-subtle` e uma borda de 2 px. Fora de destino válido, cursor `not-allowed`.
- **Dentro do mesmo tema reordena; para outro tema move.** `Alt` copia em vez de mover, e o cursor muda para `copy`. **[APPLE]**
- **Spring loading:** manter sobre um tema ~1 s abre-o. **[APPLE]**
- Scroll automático da lista durante o arrasto.
- Falha no drop: **regresso animado à origem** com `--ease-reposition`. **[APPLE]**
- Ao largar: seleção mantém-se no destino, sai da origem. **[APPLE]**
- Sempre com Anular, e anunciado em `role="status"`: *"3 fotografias movidas para Bouquets Campestres."*
- Alternativa por menu obrigatória — `Mover para…` faz o mesmo sem arrastar. **[APPLE]**

---

## PARTE 5 — MOVIMENTO

| Interação | Duração | Curva |
|---|---|---|
| Hover do cartão | 150 ms | `--ease-interactive` |
| Aparecer o `⋯` e o checkbox | 150 ms | `--ease-interactive`, só opacidade |
| Trocar de tema no split view | 200 ms | `--ease-out`, fade cruzado **sem deslocação** |
| Barra de seleção a entrar | 320 ms | `--ease-sheet` |
| Quick Look a abrir | 325 ms | `--ease-quick`, FLIP a partir da miniatura |
| Menu a abrir | 325 ms | `--ease-quick`, `transform-origin` no botão |
| Fotografia a entrar/sair da grelha | 475 ms | `--ease-reposition` |
| Regresso de um drop falhado | 475 ms | `--ease-reposition` |
| Realce do item restaurado por Anular | 1200 ms | `--ease-out` |

**Nunca animes** a mudança de filtro nem a reordenação alfabética — são interações de alta frequência. **[APPLE]** Troca o conteúdo em silêncio.

**Nunca uses `scale` no hover** de um cartão de grelha.

---

## PARTE 6 — MICROCOPY

| Atual | Novo |
|---|---|
| Fotos de inspiração por tema, prontas para as propostas | *(fora — a secção chama-se Temas)* |
| Procurar tema… | Procurar temas e fotografias |
| 567 fotos em 28 temas | 28 temas · 567 fotografias *(e muda ao filtrar)* |
| Rever etiquetas | *(vai para o menu ⋯)* Rever etiquetas… |
| A–Z | Ordenar: Nome *(com Nome · Mais recentes · Mais usados · Menos usados)* |
| por usar | Nunca usado *(e passa a filtro, não só a metadado)* |
| ← Temas | *(desaparece — split view)* |
| Eliminar tema | *(menu ⋯, a vermelho)* Eliminar tema… |
| *(confirmação)* | Eliminar o tema «Bouquets Campestres» e as suas 5 fotografias? Esta ação não pode ser anulada. |
| *(toast)* | Fotografia removida — Anular |
| *(vazio)* | Ainda não há temas. Cria um para juntar fotografias de inspiração. |
| *(filtro sem resultados)* | Nenhum tema corresponde a «campestre». — Limpar filtros |

---

## PARTE 7 — ACESSIBILIDADE

- Grelha com `role="grid"`, cartões com `role="gridcell"` e `aria-selected`; setas navegam, `Enter` abre, `Espaço` pré-visualiza.
- **Foco e seleção distinguem-se visualmente** e podem coexistir. **[APPLE]**
- Cada fotografia com `alt` descritivo — campo obrigatório no upload, não opcional.
- `⋯` com `aria-label` que nomeia o item: `Ações de Bouquets Campestres`.
- Contagem e resultados em `role="status" aria-live="polite"`.
- Operações de arrasto anunciadas em `role="status"`.
- Alvos ≥ 40 px; o `⋯` sobre a imagem tem 28 px visuais e 40 px de alvo.
- Contraste dos controlos sobre fotografia garantido por fundo de vidro escuro, medido na zona mais clara.
- Zoom a 200% sem scroll horizontal.
- Percurso completo só com teclado: pesquisar, filtrar, selecionar três, mover para outro tema, anular.

---

## PARTE 8 — ORDEM DE EXECUÇÃO

| # | Fase | Entrega |
|---|---|---|
| 01 | **Barra de topo** | Logótipo fora, título só, contagem como estado, campo de pesquisa a 10 px alinhado, "Rever etiquetas" no ⋯. |
| 02 | **Cartões** | Altura uniforme com line-clamp, sombra em vez de borda, um `⋯` em vez de três círculos. |
| 03 | **Menus** | Menu de contexto e menu do `⋯`, iguais, com as ações destrutivas no fim. |
| 04 | **Filtros** | Todos · Por usar · Usados este ano · Favoritos · Arquivados. Ordenação com quatro critérios. |
| 05 | **Seleção** | Clique, `Shift`, `⌘`, `⌘A`, barra de seleção, `Esc` limpa. |
| 06 | **Split view** | Lista de temas + grelha de fotografias, sem recarregar. |
| 07 | **Grelha de fotografias** | Rácio fixo, auto-fill, o tracejado só durante o arrasto. |
| 08 | **Arrasto** | Mover entre temas, badge de contagem, spring loading, regresso animado, Anular. |
| 09 | **Quick Look** | `Espaço`, FLIP a partir da miniatura, setas. |
| 10 | **Estados** | Skeleton com geometria real, vazio, filtro sem resultados, erro por imagem. |
| 11 | **Teclado e acessibilidade** | Atalhos, `role="grid"`, foco vs. seleção, `alt` obrigatório. |

**Critérios de aceitação**

1. Zero logótipos na barra de topo. Uma cor de acento no ecrã.
2. Todos os cartões da mesma fila têm a mesma altura, com títulos de duas linhas.
3. Um único botão sobre a fotografia, e ele abre o mesmo menu do botão direito.
4. Selecionar três fotografias e movê-las para outro tema numa operação — por arrasto **e** por menu.
5. `Espaço` abre a pré-visualização; `Esc` fecha; setas navegam.
6. Nenhuma ação destrutiva a um clique sem Anular ou sem confirmação nomeada.
7. Filtrar por "Nunca usado" devolve exatamente os temas com zero propostas.
8. O tracejado de destino só existe durante um arrasto.
9. Percurso completo só com teclado.
10. Lighthouse de acessibilidade ≥ 95; zero layout shift ao carregar 567 miniaturas.

---

## PARTE 9 — PROIBIÇÕES NESTE ECRÃ

Logótipo na toolbar · duas cores de marca · descrição da vista acima do título · cápsulas em controlos médios · links de texto entre botões de toolbar · mais de um botão flutuante sobre uma miniatura · botão só de ícone sem `aria-label` · ação destrutiva a um clique sem Anular · ação destrutiva com o peso de um link normal · cartões de alturas diferentes na mesma fila · borda a marcar elevação · rácios de imagem misturados na mesma grelha · dropzone tracejado permanente · `scale` no hover de cartões · animação ao filtrar ou ordenar · seleção sem `Shift` e `⌘` · coleção sem menu de contexto · galeria sem `Espaço` para pré-visualizar · metadado acionável sem filtro correspondente · `alt` opcional no upload · datas relativas sem data absoluta em tooltip.