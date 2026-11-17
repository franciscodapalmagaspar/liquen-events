# Júri de arquitetura — `codigo/admin-e-temas` (fases 7 e 8)

Diff avaliado: `git diff 4758acfa..origin/codigo/admin-e-temas` (103 ficheiros,
+12 810 / −9 175, três commits: `1aebaa3`, `eb8fd62`, `dc3d403`). Lido o
código, sem `next build` nem servidores, como pedido. Os números abaixo foram
medidos no próprio ramo (`wc -l`, `grep`), não copiados do plano.

## 1. Nota e veredicto

**6/10 — ainda não.**

É um bom primeiro passo da figueira estranguladora, com uma disciplina rara (a
caracterização antes de mexer, a catraca, a porta única dos testes de texto).
Mas o que saiu do `AdminClient`, do `Temas` e do `ThemePicker` foram, na maior
parte, **blocos de JSX com o estado do pai passado por props**, não componentes
com fronteira própria. Os três donos continuam enormes (a função `AdminClient`
tem 2 048 linhas de código; o `ThemeFolder`, 1 599; o `ThemePicker`, 876 —
contra uma regra de ~250 por componente). E a direcção das dependências, a parte
que «grita» o domínio, ainda não é verificada por nenhuma ferramenta. Uma
equipa da Linear ou da Stripe aceitaria este PR como passo intermédio, com
etiqueta de passo intermédio, mas não diria que a área chegou ao nível dela.

## 2. O que já está ao nível

1. **Caracterização antes de mexer, a sério.**
   `admin/AdminClient.gravacao.test.tsx` prende, chave a chave e pela ordem, o
   corpo do «Guardar alterações» e do «Anular» *antes* de o `saveChanges` ser
   partido. É exactamente o teste de Feathers que a Parte 1 §1.10 pede, e é o
   tipo de teste que uma equipa de topo exige num refactor desta dimensão.

2. **Núcleo puro com bons nomes e boa forma.**
   `src/lib/orcamento/pedidos/gravar-o-pedido.ts` parte a gravação em três
   decisões puras (`linhasDoHistorico`, `corpoDaGravacao`, `corpoDoAnular`), com
   o relógio e o gerador de ids injectados (`AutorDasLinhas`). Não há React nem
   Supabase em nenhum ficheiro de `lib/orcamento/pedidos/` nem de `lib/temas/`:
   os imports são só tipos e outras funções puras. A casca que fica no
   `AdminClient.tsx:2820` diz isso no comentário e faz isso no código.

3. **A direcção das dependências está certa (embora ninguém a verifique).**
   Nenhum ficheiro de `_casca/`, `_pedidos/` ou `_temas/` importa o
   `AdminClient`, o `Temas` ou o `ThemePicker`, e nenhuma casa importa o
   interior de outra. As setas descem: `lib/…` ← `_pedidos/…` ← `AdminClient`.

4. **A catraca e a porta dos testes de texto.**
   `test/tamanho-dos-ficheiros.json` desceu os tectos dos três ficheiros para o
   tamanho de hoje (4 111 / 4 037 / 2 556), portanto não podem voltar a crescer.
   `admin/fonte-do-admin.testkit.ts` resolve um problema real — um teste de texto
   que deixasse de ver o que saiu ficaria verde «por não encontrar nada» — com
   uma só porta (`CASAS`), em vez de mexer em quarenta testes.

5. **Uma duplicação real morta.** `_pedidos/estado-do-pedido.tsx`: os rótulos
   da pastilha passam a vir de `ROTULO_DO_ESTADO`, e
   `_pedidos/estado-do-pedido.test.ts` prende que as duas listas são iguais.

6. **Um hook de domínio que remove um defeito.** `_pedidos/useEdicaoDoPedido.ts`
   transforma três cópias de onze `setX(...)` num `preencherCom`, e o porquê
   (um campo novo esquecido numa das três cópias) está escrito ao lado.
   `_pedidos/useFiltrosDosPedidos.ts` faz o mesmo para os filtros, com o cálculo
   puro em `lib/orcamento/pedidos/filtros-dos-pedidos.ts` e testado à parte.

7. **Pastas privadas do Next usadas como deve ser.** `_casca/`, `_pedidos/` e
   `_temas/` seguem a §1.3 (junto do que muda junto, e sem virar rotas), e os
   nomes dos ficheiros novos dizem o negócio (`CabecalhoDoPainel`,
   `SeparadorFinanceiro`, `GrelhaDaPasta`, `o-que-falta-gravar`).

## 3. O que falta para chegar lá, por ordem de impacto

1. **Os filhos recebem os `setState` do pai e reescrevem a lista inteira.**
   Há **22** cópias de `setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, X } : q)))`
   espalhadas por `_pedidos/painel/` e pelo `AdminClient.tsx`
   (`SeparadorFinanceiro.tsx:30/35/45`, `SeparadorDeProducao.tsx:48/97/109/119`,
   `GestaoDoPedido.tsx:75/83`, `CabecalhoDoPainel.tsx:171`, `SeparadorDaProposta.tsx:58`…).
   `setQuotes` e `setSelected` atravessam 16 fronteiras de componente. Cada
   filho sabe a forma da colecção do pai: é acoplamento ao *como*, não ao *quê*.
   **Correcção:** um `usePedidos()` (ou um `useReducer` com
   `pedidoActualizado(id, patch)`, `pedidoSubstituido(q)`, `pedidoApagado(id)`)
   no `AdminClient`, e os filhos recebem só `actualizarPedido(patch)` ligado ao
   pedido aberto. O redutor é uma função pura em `lib/orcamento/pedidos/` com
   testes. Isto também mata a classe de erros «o `selected` ficou velho porque
   só se actualizou o `quotes`».

2. **Interfaces largas demais: componentes que são parâmetros de um bloco.**
   `_temas/seletor/FotosDoTema.tsx` recebe **34** props (com seis `Set`/listas
   derivadas, dois `ref`s e três `setState`); `_casca/Vistas.tsx` 25;
   `_temas/seletor/GrelhaDoSeletor.tsx` e `_temas/AvisosDaPasta.tsx` 24;
   `_temas/GrelhaDaPasta.tsx` 19. Um componente com 34 props não tem fronteira:
   qualquer mudança no pai muda o contrato. E `TopoDoPainel`/`GestaoDoPedido`
   recebem `edicao={edicao}` — o saco inteiro de 28 campos — o que impede
   `memo` e esconde de que campos dependem.
   **Correcção:** agrupar por intenção: `FotosDoTema` recebe um objecto
   `seleccao` (o que vem de um `useSeleccaoDeFotos`), um `carregamento` (de um
   `useFotosDoTema`) e callbacks com nome de acção (`onEscolher`, `onPreVer`),
   nunca `setFocusIndex`/`setPreviewIndex`. Os `Set` derivados
   (`selectedSet`, `pendingSet`, `usedSet`) calculam-se dentro, a partir das
   listas (§1.8: o derivado não é estado). Alvo: ≤ 10 props por componente.

3. **Os donos continuam a ser os gigantes.** A função `AdminClient` mantém 39
   `useState`, 33 efeitos e 26 `useRef`; o `Temas.tsx` tem 65 `useState` e
   **nenhum** hook de domínio extraído (`_temas/` não tem um único `use*`); o
   `ThemeFolder` (`Temas.tsx:1562`) ainda faz carregamento, verificação,
   miniaturas, envio e selecção. Os desvios na Parte −1 justificam-no (a ordem
   dos efeitos é comportamento), e é uma decisão defensável — mas significa que
   a parte mais difícil do plano ainda não se fez.
   **Correcção:** a fase seguinte extrai, com caracterização própria e por esta
   ordem: `useAberturaDoPedido` (abrir/fechar/histórico do navegador),
   `useGravacaoDoPedido` (gravar, anular, gravação automática, uma máquina de
   estados `ocioso | a-gravar | gravado | falhou` como manda a §1.8),
   `useFotosDaPasta` e `useEnvioDeFotos` no `ThemeFolder`, e o «runtime» das
   importações do `ThemePicker` para um módulo com `criar/reset` explícitos (o
   que hoje o `__resetThemePickerState` limpa por fora).

4. **Duas formas para o mesmo painel, duas vezes escritas à mão.**
   `PainelPorGravar` (`lib/orcamento/pedidos/o-que-falta-gravar.ts:16`) e
   `PainelEscrito` (`gravar-o-pedido.ts:32`) têm os mesmos onze campos, menos o
   tipo de `convidados`; o `useEdicaoDoPedido` monta um e o `saveChanges`
   (`AdminClient.tsx:2840`) monta o outro, campo a campo, a partir dos mesmos
   `editX`. É precisamente o «campo novo esquecido num dos sítios» que o hook
   diz ter resolvido. **Correcção:** um só tipo `PainelDoPedido` com
   `convidados: string`, e uma função pura `lerPainel(painel, pedido)` que
   devolve o `PainelEscrito` (já com os convidados lidos). O hook expõe
   `painel` pronto, e o `saveChanges` deixa de reconstruir.

5. **O domínio dos temas fica com duas casas e com I/O misturado no núcleo.**
   Nasceu `src/lib/temas/` ao lado de `src/lib/temas-arrasto.ts`,
   `temas-grelha.ts`, `temas-filtros.ts`, `tema-nome.ts`… na raiz de `lib/`.
   E há lógica pura que ficou na pasta de interface:
   `_temas/ordem-e-densidade.ts` (`ordenarTemas`, `contarFotosDaBiblioteca`)
   mistura essa lógica com `localStorage` (`lerOrdem`, `guardarOrdem`,
   `lerDensidade`, `guardarDensidade`) e com classes do Tailwind (`COLUNAS`).
   `lib/temas/listas-de-fotos.ts` traz `pool<T>`, que é concorrência genérica,
   não domínio de temas. **Correcção:** `ordenarTemas`/`contarFotos…`/`temPoucasFotos`
   para `lib/temas/ordem.ts`; as leituras do `localStorage` para um
   `useOrdemGuardada` em `_temas/`; `COLUNAS` para `_temas/`; `pool` para
   `lib/concorrencia.ts`. Os `lib/temas-*.ts` entram em `lib/temas/` na fase 10,
   mas fica escrito na Parte −1 que hoje há duas casas.

6. **Lógica pura que saiu sem teste.** Sem nenhum teste a importá-las:
   `isImageFile`, `readDropEntries`, `expandDropEntries` (com os tectos
   `MAX_DROP_FILES`/`MAX_DROP_ENTRIES`, que são custo), `vestirOArrasto`,
   `lerOrdem`/`lerDensidade` (que leem dado cru do `localStorage` sem
   validação — §1.7), `photoCountLabel`. E os testes que existem estão em sítios
   que não os dizem: `textos-do-pedido.test.ts` testa `proxima-accao`,
   `notas-automaticas` e `espera-na-lista`; `Temas.test.tsx` testa
   `lib/temas/*` e `_temas/ordem-e-densidade`. **Correcção:** um `*.test.ts`
   ao lado de cada ficheiro puro, com o nome dele; os tectos do largar-pastas
   e a leitura defensiva do `localStorage` com casos próprios (vazio, lixo,
   valor de uma versão antiga).

7. **Ninguém verifica as fronteiras.** A direcção certa do ponto 2.3 é hoje
   boa vontade. O `eslint.config` não tem uma regra sobre `_pedidos`, `_temas`,
   `_casca` nem `lib/orcamento/pedidos` (a Shopify diz-o: fronteira sem
   ferramenta acaba atravessada — §1.2). **Correcção já nesta fase, porque é
   barata:** `no-restricted-imports` que proíba `react`, `next/*` e
   `@/lib/supabase*` em `src/lib/orcamento/pedidos/**` e `src/lib/temas/**`, e
   que proíba `_casca`/`_pedidos`/`_temas` de importar `../AdminClient`,
   `../Temas`, `../ThemePicker` e o interior umas das outras.

8. **Ficheiros «gaveta» e fragmentos.** `_pedidos/pele-da-lista.ts` junta
   classes do Tailwind (`FILTRO_CLASSES`) com regras de negócio
   (`LIST_PAGE_SIZE`, `ARQUIVAR_SEM_PERGUNTAR`) — o primeiro muda com o desenho,
   o segundo com a política. No outro extremo, `_temas/tecla-de-menu.ts` (6
   linhas) e `_temas/seletor/posicao-do-rolo.ts` (8 linhas, um `Map` de módulo
   mutável e global) existem só para quebrar uma dependência.
   **Correcção:** `ARQUIVAR_SEM_PERGUNTAR` e `LIST_PAGE_SIZE` para
   `lib/orcamento/pedidos/`; `teclaDeMenu` para `ui/` (é teclado, não temas);
   `themeScroll` dentro do futuro módulo de estado do seletor (ponto 3).

9. **Duplicados e nomes que confundem.** `plural(n, um, muitos)` existe em
   **seis** sítios, dois deles exportados e novos neste PR
   (`lib/temas/textos-dos-temas.ts:81` e `_temas/seletor/FotoDoSeletor.tsx:74`,
   com corpo igual). `_pedidos/estado-do-pedido.tsx` tem o mesmo nome que
   `lib/orcamento/estado-do-pedido.ts`, com papel diferente (pastilha de
   interface vs. dicionário). `parseMoney` chega ao `AdminClient.tsx:54` e ao
   `CamposDoPedido.tsx:8` com o pseudónimo `parsePriceInput`.
   `CabecalhoDoPainel.tsx` chama `quemPedeEOCasal(selected)` quatro vezes no
   mesmo desenho. **Correcção:** um `plural` em `lib/` e as cinco cópias a
   importá-lo; `_pedidos/estado-do-pedido.tsx` → `_pedidos/PastilhaDoEstado.tsx`;
   o nome verdadeiro `parseMoney` nos dois sítios; uma constante local no
   cabeçalho.

10. **O tamanho do PR contra a regra da própria casa.** A §3.0 regra 7 pede
    «< 1 000 linhas de diff, e de preferência só linhas movidas», e a regra 3
    «mover antes de melhorar» em PRs separados. Aqui estão duas fases, 22 mil
    linhas tocadas e, no mesmo ramo, extracção de lógica pura com mudança de
    forma (`saveChanges` partido, `preencherCom` novo, `STATUS_OPTIONS` ligado a
    `ROTULO_DO_ESTADO`). Os commits estão separados, o que ajuda, mas um
    revisor externo não consegue rever isto como um todo. **Correcção para as
    próximas fases:** um PR por casa (`_casca`, `_pedidos/lista`,
    `_pedidos/painel`, `_temas`, `_temas/seletor`), cada um só com movimento
    (`git diff --color-moved=dimmed-zebra` quase todo cinzento), e os
    melhoramentos (pontos 1, 4 e 9) em PRs à parte.

11. **Os testes de texto continuam a ser a rede principal da interface.**
    Quarenta testes leem o *texto* dos ficheiros. A porta nova é a melhor saída
    possível a curto prazo, mas um teste que procura uma classe numa
    concatenação de ficheiros (`fonteComposta`) prova que a palavra existe em
    algum lado, não que está no elemento certo. **Correcção gradual:** cada vez
    que uma casa ganha um componente com interface pequena (ponto 2), o teste de
    texto correspondente passa a um teste de render (`@testing-library`) desse
    componente sozinho.

## 4. O que pode esperar e o que não pode

**Aceitável deixar para a fase seguinte** (com a linha na Parte −1, como já está):

- extrair os efeitos e o estado partilhado dos três donos (ponto 3), desde que
  com caracterização própria — a decisão de não mexer na ordem dos efeitos
  neste passo é correcta;
- o redutor dos pedidos (ponto 1) e a fusão `PainelPorGravar`/`PainelEscrito`
  (ponto 4), por serem melhoramentos e não movimento;
- a junção das três filas de imagens, que espera pela aprovação dela;
- passar os `lib/temas-*.ts` para `lib/temas/` (fase 10) e a conversão
  gradual dos testes de texto (ponto 11);
- os nomes ingleses movidos (`QuoteCard`, `editPrice`, `Photo`), pela regra
  «mover antes de melhorar».

**Não é aceitável deixar para depois** (antes de este ramo entrar num lote):

- **a regra do ESLint das fronteiras** (ponto 7): custa vinte linhas, não muda
  comportamento e é o que impede que as casas novas comecem a importar-se em
  círculo na próxima semana;
- **testes para a lógica pura que saiu sem eles** (ponto 6), em especial os
  tectos do largar-pastas e a leitura do `localStorage` — a regra da casa é
  «cada regra de negócio numa função pura **com testes**», e mover sem testar
  deixa o núcleo novo menos protegido do que o código velho dentro do gigante,
  onde ao menos os passeios o atravessavam;
- **o `plural` duplicado e exportado em dois ficheiros novos** (ponto 9): é
  duplicação criada por este PR, não herdada;
- **a lógica pura de `_temas/ordem-e-densidade.ts` separada do
  `localStorage`** (ponto 5): também foi este PR que a pôs num ficheiro novo, e
  um ficheiro novo devia nascer já com o núcleo e a casca separados.

Com estes quatro feitos, o ramo merece um 7 como passo intermédio. Com os pontos
1 a 4 da secção 3 feitos nas fases seguintes, esta área fica ao nível das
empresas de topo.
