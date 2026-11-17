# Revisão independente — `codigo/admin-e-temas`

Diff revisto: `git diff 4758acfa..origin/codigo/admin-e-temas` (até `dc3d403`), 103 ficheiros.
Divisão `AdminClient.tsx` → `_casca/` + `_pedidos/` + `lib/orcamento/pedidos/`; `Temas.tsx` → `_temas/` + `lib/temas/`;
`ThemePicker.tsx` → `_temas/seletor/`; fábrica `criarFilaDeImagens`.

**Resumo:** não encontrei nenhuma mudança de comportamento no código de produção. Comparei cada bloco
movido com o original (diff normalizado e por *tokens*), e o que a utilizadora vê e faz não mudou.
Os erros confirmados são todos de **testes que deixaram de proteger o que protegiam**, mais o tecto
de tamanho subido a ficheiros fora do âmbito.

## Erros confirmados

1. **Baixo — `duracao-com-guarda.test.ts:98-111` deixou de verificar o cabeçalho.**
   O teste «o cabeçalho não anima disposição enquanto se rola» lê só o `AdminClient.tsx` e
   procura `transition-[padding` e `transition-[font-size`. Mas o `<header>` mudou-se para
   `_casca/Cabecalho.tsx:87`, e no `AdminClient.tsx` já não há nenhum `<header`.
   - O que acontece: se alguém puser uma dessas transições no cabeçalho, o teste continua verde.
   - Prova: `grep -n "<header" AdminClient.tsx` não dá nada.
   - Correcção: ler `fonteDe("AdminClient.tsx")`, com os comentários tirados ficheiro a ficheiro.
   - O ficheiro não foi tocado neste diff. É por isso que ficou para trás.

2. **Baixo — `AdminClient.menu-sem-dobra.test.tsx:243-247`: o teste «os destinos antes da conta» passa sempre.**
   O original procurava as duas coisas no mesmo ficheiro: a `<nav>` da gaveta (linha 5500) vinha
   antes do rodapé (5582). Agora procura na fonte concatenada.
   - O primeiro `aria-label="Mais destinos"` é o de `_casca/BarraDeDestinos.tsx:282`.
   - O rodapé está em `_casca/RodapeDoMenu.tsx`.
   - O testkit cola os ficheiros por ordem alfabética (`fonte-do-admin.testkit.ts:58`, `.sort()`), e
     `BarraDeDestinos` vem antes de `RodapeDoMenu`. Por isso «conta > destinos» é sempre verdade.
   - O que acontece: se alguém puser o `<RodapeDoMenu>` antes da `<nav>` em `MenuLateral.tsx`, o
     teste não dá por isso.
   - Correcção: fazer as duas buscas dentro de `_casca/MenuLateral.tsx`, com `fonteComposta` ou
     procurando o `<RodapeDoMenu` depois da `<nav ref={colunaDosDestinos}`.

3. **Baixo — `entrada-do-painel-do-pedido.test.ts:348-351`: o teste «a lista continua SEM `key`» só lê metade da chamada.**
   O original cortava em `"\n                  />"`, que era o fecho da `TabelaOuCartoes`. O novo
   corta em `/\n\s*\/>/`, que pára no primeiro `/>`. Esse `/>` é o fecho do `<QuoteCard … />`
   dentro de `cartao` (`ListaDosPedidos.tsx:127`), e não o da `TabelaOuCartoes` (`:140`).
   - O que acontece: um `key=` posto depois de `cartao={…}` (`aoAbrir`, `colunas`…) passa sem o
     teste dar por isso. Esse `key` remontava a lista e perdia o rolo, que é exactamente o que o
     teste existe para impedir.
   - Correcção: cortar no `/>` que fecha a `TabelaOuCartoes` (o `/>` seguido de `\n\s*\)\}`), ou
     contar as chavetas e os parênteses.

4. **Baixo — `AdminClient.menu-sem-dobra.test.tsx:80-91`: os comentários tiram-se DEPOIS de colar as fontes.**
   O teste faz `semComentarios(fonteDe(...))`, que é o que o próprio testkit diz para não fazer. Se
   um ficheiro tiver uma string com `/*` lá dentro (por exemplo `accept="image/*"`), a limpeza
   apaga tudo até ao `*/` seguinte, que pode estar noutro ficheiro. Os `not.toMatch(/moreNavOpen/)`
   passariam então por acaso.
   - Hoje não acontece: o comprimento é igual nas duas ordens.
   - Correcção: `fonteDe("AdminClient.tsx", semComentarios)`, como o `menu-do-destino-activo` já faz.

5. **Baixo — `test/tamanho-dos-ficheiros.json` sobe o tecto a sete ficheiros fora do âmbito.**
   Os sete são `Calendario` (2658→2684), `CommandPalette` (533→565), `Contratos` (1008→1020),
   `Fornecedores` (902→915), `Material` (1031→1058), `Propostas` (1106→1212) e `Tarefas` (2803→3261).
   - Este diff não toca em nenhum deles. Já tinham crescido na base, no merge de `bo4/procura-lotes-atalhos`.
   - O teste diz «parte-o; não se sobe o tecto».
   - O que acontece: o tecto passa a aceitar o crescimento do `Tarefas` (+458 linhas) sem ninguém
     decidir isso. Não muda o produto, mas convém ser uma decisão dita no PR, e não ir escondida
     num refactor.

## Suspeitas não confirmadas

- **Testes que passaram a ler `fonteDoAdmin()`** (`barra-inferior` 77-104, `entrada-do-painel-do-pedido`
  e outros): os `toContain`/`toMatch` positivos aceitam agora o texto em qualquer um de cerca de 40
  ficheiros, em vez de o exigirem no sítio certo. Não encontrei nenhum que hoje case no ficheiro
  errado.
- **`daPasta` (testkit) devolve `[]` quando uma pasta falha.** Se uma pasta for renomeada, os
  `not.toMatch` sobre a fonte junta ficam verdes porque lêem menos. Os positivos falhariam e
  denunciavam a mudança.
- **`fonteComposta` (testkit) não cola chamadas com `=>` nas props** (a regex
  `<([A-Z]\w*)\b[^<>]*?\/>` pára no `>` do `=>`). Hoje escapam o `AvisosDaPasta` e o `Photo`, e
  nenhum dos dois tem `--cena`. Uma vista futura com `onX={() => …}` escaparia às réguas da escada
  em `vistas-que-se-compoem`.
- **`atalhos.test.ts`** passou a ler a pasta admin inteira, recursivamente. Só se usa em `toContain`
  de `aria-label`, por isso o efeito é mínimo.
- **A troca do contador da fila por um `Set`:** só se comporta de forma diferente depois de um
  `limpar()` com vezes em voo, e nessa situação o `Set` até é mais correcto. Em produção ninguém
  chama `limpar` nas filas da Biblioteca nem do seletor.

## O que foi verificado

- **Fila de imagens.** `FILA_DA_BIBLIOTECA` (`_temas/FotoDaGrelha.tsx:97`) e `FILA_DO_SELETOR`
  (`_temas/seletor/FotoDoSeletor.tsx:65`) são duas instâncias separadas, cada uma com tecto 3 e
  `esperaMaximaMs: null`, como as cópias antigas. O relógio de 30 s continua do lado da célula, e a
  fila partilhada mantém os 60 s.
- **Temas.** Só 93 linhas do original não reaparecem tal e qual, e todas estão explicadas: `export`,
  imports, props, o objecto `arrasto` e a fila. As constantes e as chaves de `localStorage` estão
  iguais. Não há estado duplicado nem hooks movidos, e as `key` estão iguais.
- **ThemePicker.** `FotosDoTema` e `GrelhaDoSeletor` não têm estado nem efeitos. O `themeScroll`
  continua a ser um único `Map` de módulo.
- **Casca.** Todos os filhos são «props → JSX», sem hooks. Nenhum `useEffect` mudou de sítio. O
  cookie `liquen-admin-view` não foi tocado. A ordem do render e as `key` estão iguais.
- **Pedidos.** O «Guardar» e o «Anular» mandam o mesmo corpo, com as chaves pela mesma ordem, e o
  mesmo histórico. O «o que falta gravar» tem os mesmos 17 termos. Os filtros têm a mesma ordem, a
  mesma procura adiada e as mesmas ordenações. Os hooks novos não têm efeitos.
- **Corri:**
  - `tsc --noEmit`: 0 erros.
  - A pasta `admin/` inteira: 425 ficheiros de teste, 4493 testes, todos verdes.
  - O `test/tamanho-dos-ficheiros`: verde.
  - `eslint` nos ficheiros do âmbito: 0 erros (os avisos já existiam).

## O que não consegui verificar

- **Browser real.** Não abri nada no Playwright: nem 390/768/1440 px, nem claro e escuro, nem toque
  no telemóvel, nem arrasto de ficheiros a sério, nem rede lenta ou cortada. A revisão foi estática,
  com diffs e testes jsdom. A equivalência é forte, porque o código movido é igual ao original, mas
  não está provada no ecrã.
- **Hidratação.** Não a verifiquei no `next dev` nem no `next start`, e não corri `next build`.
- **Tamanho do pacote do diálogo do estúdio.** Não o medi. Pela leitura dos imports, `seletor/*` não
  puxa o `Temas.tsx`.
- **`graphify`.** Não está instalado neste ambiente, por isso não o usei.
