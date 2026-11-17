# Propostas e Temas ao nível Apple — instruções para o Claude Code

> Cola este ficheiro inteiro no Claude Code (ou guarda-o na raiz do repo e diz: "lê PROPOSTAS-E-TEMAS-APPLE.md").
> Repo: `LiquenEvents` · Next.js 16 App Router · React 19 · Tailwind v4 · Supabase.

---

## Parte −1 — o que ela decidiu em cima deste documento (8 de outubro de 2026)

O documento chegou no mesmo dia. Antes da Fase 1, foi comparado com o código e com as decisões já escritas noutros documentos. Em quatro pontos chocava com uma escolha dela ou com uma regra que os testes guardam, e por isso perguntei-lhe. As respostas valem mais do que o texto acima.

| Ponto do documento | Resposta dela | O que fica |
|---|---|---|
| E2 e §6 — `Sidebar` à esquerda no computador | **«Fica a barra de baixo»** (a mesma resposta que deu em setembro; ver `FAZER-PROPOSTA.md`, Parte −1) | Não há `Sidebar`. O estúdio e os Temas ganham colunas por dentro do ecrã; a navegação geral continua na barra de baixo. |
| E1 — «o logótipo sai do back-office (fica só no login)» | **«Fica ao centro»** | O logótipo continua ao centro do cabeçalho. Por isso o cabeçalho mantém ~84 px e não desce aos 52 px da `Toolbar` do §6: o logótipo sozinho tem 56. |
| §6 — `--font` com a letra do sistema | **«Fica o Geist»** | A letra do back office continua a Geist (guardada por `letra-da-casa.test.ts`). |
| §6 — tokens base | **«Usar o que existe»** | Não se cria uma segunda família. Cada valor do §6 é aplicado através do token da casa que já faz esse papel (tabela abaixo), e o contraste fica sempre em ≥ 4,5:1. |

E uma decisão do mesmo dia, sobre os Temas: **«sim à sombra, cantos a 12»** — o cartão de tema eleva-se por sombra (`--bo-sombra-repouso`/`--bo-sombra-erguida`) e tem os cantos a 12 px (`--radius-tile`).

### O §6, traduzido para os tokens da casa

| §6 | Token da casa | Porque não o valor do §6 |
|---|---|---|
| `--text` / `--text-2` / `--text-3` | `--bo-text` / `--bo-text-muted` / `--bo-text-faint` | No Tailwind v4 o prefixo `--text-*` é o do TAMANHO de letra: `--text-2` criaria uma classe `text-2` com uma cor como tamanho. E `#86868b` sobre branco dá 3,6:1, abaixo dos 4,5. |
| `--bg` / `--bg-2` | `--bo-surface` / `--bo-chao` | No escuro, a casa evita o preto puro. |
| `--line` | `--bo-hairline-strong` | — |
| `--accent` `#5F7C66` | `--bo-accent` (sage-600, `#4C6752`); o `#5F7C66` é a `--bo-marca` | `#5F7C66` é a cor da marca, mas como texto ou como fundo de texto branco fica abaixo dos 4,5:1. |
| `--danger` `#ff3b30` | `--bo-perigo` | `#ff3b30` sobre branco dá 3,5:1. |
| `--r-field` 10 / `--r-card` 18 / `--r-pill` | `--radius-control` 10 / `--radius-card` 16 (12 no cartão de tema, `--radius-tile`) / `--bo-raio-pilula` | 18 px é o raio das folhas e janelas na casa (`--bo-raio-janela`), não dos cartões. |
| `--shadow-1` | `--bo-sombra-repouso`, `-erguida`, `-suspensa`, `-modal` | — |
| `--glass` .72 + `blur(20px) saturate(180%)` | `.bo-material` + `.bo-material-desfoque` (20 px e 180 %, já iguais) | A .72 o texto secundário fica abaixo de 4,5:1 sobre fundo escuro (medido: .74 dá 4,54; .70 dá 4,30). E vale a regra do `LIQUID-GLASS.md`: uma camada de vidro por ecrã. |
| `--dur-fast` 150 / `--dur` 240 / `--dur-sheet` 500 | `--transition-duration-interactive` 150 / `--bo-mola-chegada` 240 / `--transition-duration-sheet` com a mola `--ease-sheet` | As durações vivem em `--transition-duration-*` (Parte −1 do `DESIGN-SYSTEM.md`). A `cubic-bezier(0.32, 0.72, 0, 1)` escrita à mão é proibida pela casa: a folha usa a mola. |
| Molas 170/26 e 300/30 | `--ease-mola-100` e `--ease-mola-86` (as mesmas formas) | A 170/26 já foi medida e recusada: um arrasto de 200 px demorava 717 ms a assentar. |
| `prefers-reduced-motion` → fades de 150 ms | O que já existe: cada regra tem a sua guarda (`motion-safe:`) | A casa desliga o movimento regra a regra, e há testes que o exigem. |

### Componentes do §6

| Componente | O que fica |
|---|---|
| `Button` | Já é cápsula. O secundário passa a cinzento (Fase 1). |
| `Toolbar` 52 px | Não se faz: o logótipo fica (ver acima). |
| `Sidebar` | Não se faz: fica a barra de baixo. |
| `Inspector` 320 px, ⌘I | Novo, opaco (o vidro do ecrã já está no cabeçalho). Em ecrã estreito abre como folha. |
| `GroupedList` / `GroupedRow` | Novo: `ListaAgrupada` / `LinhaAgrupada`. |
| `Sheet` | Já existe: `FolhaOuDialogo` e `PerguntaDestrutiva`. |
| `ContextMenu` | Já existe: `MenuDeContexto` e `MenuDeAccoes`. Separadores e teclado entram na Fase 2. |
| `Skeleton` de cor dominante | Novo (`EsqueletoDeCor`), com a cor que o servidor já calcula para cada fotografia. |

---

## 0. Como trabalhar (regras obrigatórias)

1. **Entra em plan mode primeiro.** Para cada fase, mostra-me o plano (ficheiros e o que muda) antes de escrever código.
2. **Uma branch por fase:** `feat/apple-fase-1`, `feat/apple-fase-2`, … Abre PR; nada vai para produção sem preview na Vercel.
3. **Só apresentação.** Não alteres cálculos de preços, IVA, dados de clientes nem o esquema da base de dados (exceção: Fase 2, script de miniaturas, e Fase 5, favoritos/etiquetas se precisarem de coluna nova → pede-me antes).
4. **Tokens em todo o lado.** Nenhuma cor, raio, sombra ou duração escrita à mão fora do ficheiro de tokens.
5. **Acessibilidade:** respeitar `prefers-reduced-motion` (tudo vira fade de 150 ms), modo escuro, foco visível, alvos ≥ 44 px.
6. **Testes:** `npm run build` + testes existentes verdes. Screenshots antes/depois com Playwright (1440 px e 390 px) de cada ecrã alterado e do PDF.
7. **Dados de teste:** usa a proposta Margarida & Duarte (3 versões) e um tema com 50+ fotos. Nunca envies emails reais nem toques em propostas de clientes em produção.

### Ficheiros principais (verificar no repo antes de mexer)

| Área | Ficheiros |
|---|---|
| Fazer proposta / estúdio | `src/app/[lang]/(admin)/orcamento/admin/FazerProposta.tsx`, `PainelDoEstudio.tsx`, `NavEstudio.tsx`, `FolhaDaProposta.tsx`, `NotaDaProposta.tsx`, `AEnviarAProposta.tsx`, `DefinicoesProposta.tsx`, `definicoes-da-proposta.ts`, `Propostas.tsx` |
| PDF da proposta | `src/lib/proposal-pdf.ts`, `src/lib/proposal-doc-pdf.ts`, `src/lib/pdf-text.ts`, `src/lib/proposal-pdf-cache.ts`, `src/app/api/proposta/[token]/pdf/route.ts` |
| Proposta web (cliente) | `src/app/[lang]/(privado)/proposta/[token]/page.tsx`, `Documento.tsx`, `Inspiracao.tsx`, `Escolhas.tsx`, `MovimentoDaProposta.tsx` |
| Temas | `src/app/[lang]/(admin)/orcamento/admin/Temas.tsx`, `ListaDeTemas.tsx`, `FundirTemas.tsx`, `prefetch-de-tema.ts`, `src/lib/temas-arrasto.ts`, `src/app/api/temas/**`, `src/app/api/biblioteca/{paletas,fotos,etiquetas,etiquetar}` |

---

## 1. Resumo — as 5 mudanças que fazem o salto

1. **Estúdio em três colunas** (secções · editor · pré-visualização ao vivo), uma secção de cada vez, com atalhos de teclado.
2. **Página "Em resumo"** logo a seguir à capa do PDF, com o total em destaque e como aceitar.
3. **Tipografia única e legível** no PDF: corpo a 12–14 pt, uma ideia por página, verde Líquen como único acento.
4. **Temas como a app Fotografias**: capas sempre visíveis, seleção múltipla, Quick Look, favoritos e filtros por cor.
5. **Ações destrutivas escondidas** no menu "…" com confirmação clara.

---

## 2. Como funciona hoje (diagnóstico)

O estúdio já tem as peças certas (lista do que falta, pré-visualização, notas privadas, biblioteca de temas), mas está tudo no mesmo nível: um formulário de ~4 500 px de altura em que tudo tem a mesma importância.

| Passo | O que se vê | Problema |
|---|---|---|
| 1. Escolher o cliente | Cabeçalho "Fazer proposta" com logótipo ao centro, caixa "Passo 1 de 2", filtros em cápsula, cartões de 110 px por pedido | Só cabem 4 pedidos no ecrã; sem valor, sem prazo, sem ordenação |
| 2. Estúdio | "Proposta para", "Estúdio de propostas (PDF)", 4 ações de texto, passos 1-2-3, secções à esquerda, formulário ao centro, "O que vai sair" à direita, barra flutuante "Pré-visualizar" | Três níveis de cabeçalho; o primeiro campo aparece a 500 px do topo |
| 3. Conteúdo | Evento, Imagens de capa, Serviços, Mood boards, Orçamento, "Só para ti", Total e validade, Vista de conjunto; caixa amarela "Nota … só para ti" em cada secção | Notas privadas repetidas 6 vezes, competem com o conteúdo do cliente |
| 4. Pré-visualizar e enviar | Passos 2 e 3 | Miniaturas de 180 px ilegíveis; a pré-visualização real só no passo 2 |

**Manter (já está ao nível certo):**
- Coluna "Falta para enviar" (validação no sítio onde se vê).
- "Tudo guardado" automático, sem botão Guardar.
- Notas privadas separadas do PDF.
- "Criar a partir de…" e "Guardar como modelo".
- Ecrã de login (foto à esquerda, cartão à direita, passkey primeiro).

---

## 3. Fazer proposta — redesenho (E1–E10)

### Layout alvo

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ‹ Pedidos · Inês & Rodrigo        [ Decoração | Organização ]   ⋯  [Enviar ao cliente] │  ← toolbar 52 px, vidro
├───────────────┬──────────────────────────────────┬───────────────────────────┤
│ SECÇÕES       │  Uma secção de cada vez          │  A proposta ao vivo       │
│ ✓ Evento      │                                  │  ┌─────────────────────┐  │
│ ✓ Capa        │  Evento                          │  │  página real da     │  │
│ ● Serviços    │  ┌────────────────────────────┐  │  │  secção aberta,     │  │
│ ○ Mood boards │  │ Data        10 jun 2028  › │  │  │  atualiza ao        │  │
│ ○ Orçamento   │  │ Local       Q. Melhorada › │  │  │  escrever           │  │
│ ○ Condições   │  │ Convidados  200          › │  │  └─────────────────────┘  │
│               │  └────────────────────────────┘  │                           │
│ Falta enviar: │                                  │  Total  3 690 €           │
│ · valor       │           [Só para ti  ⌘I] ──────┼──► inspetor (abre por cima)│
└───────────────┴──────────────────────────────────┴───────────────────────────┘
```

### Tabela de alterações

| # | Hoje | Regra Apple | Fazer |
|---|---|---|---|
| E1 | Logótipo grande + "Fazer proposta" + "Proposta para" + "Estúdio de propostas (PDF)": 1.º campo a 500 px | O conteúdo manda; título de janela curto | Toolbar de 52 px com "‹ Pedidos · Inês & Rodrigo"; logótipo sai do back-office (fica só no login) |
| E2 | Barra inferior flutuante com 13 secções que tapa campos + segunda barra "Pré-visualizar" | Sidebar em desktop; separadores ≤ 5 em mobile | Sidebar à esquerda recolhível; no estúdio recolhe sozinha. Mobile: 4 separadores + "Mais" |
| E3 | Formulário de 4 500 px com tudo aberto | Revelação progressiva | Uma secção de cada vez; lista de secções com ✓ (feito), ● (atual), ○ (por fazer) |
| E4 | 6 caixas amarelas "Nota … só para ti" + painel "Só para ti" no meio | Inspetor à direita para info privada | Inspetor "Só para ti" (⌘I): notas, custos, margem, deslocação da secção aberta |
| E5 | "O que vai sair" com miniaturas ilegíveis | WYSIWYG | Coluna direita com a página real da secção aberta, atualizada ao escrever; clicar abre leitura em ecrã inteiro |
| E6 | Passos 1-2-3 e 4 ações de texto no topo | Uma ação principal por ecrã, à direita | "Enviar ao cliente" sempre visível → sheet com destinatário, assunto, mensagem e 1.ª página. "Criar a partir de…", "Guardar como modelo", "Limpar rascunho" vão para o menu ⋯ |
| E7 | Inputs com contorno grosso e cantos de cápsula | Formulários agrupados, rótulo à esquerda, valor à direita | Lista agrupada: cartão raio 18 px, linhas de 44 px, separadores 1 px #d2d2d7 (como Definições do macOS) |
| E8 | "Valor (sem IVA)" com placeholder "3000" (parece real) | Placeholder mostra o formato | Placeholder "0,00 €"; total grande na coluna da proposta |
| E9 | Serviços: grupo "a)" com caixas soltas | Listas reordenáveis, menu de contexto | Linhas com pega de arrasto, duplo clique edita, menu de contexto (Duplicar, Mover para…, Apagar), ↩︎ nova linha |
| E10 | Escolher cliente: cartões de 110 px, 4 por ecrã | Lista densa e ordenável | Tabela: cliente, tipo, data do evento, dias desde o pedido, orçamento indicativo; ordenada por data do evento; ↩︎ abre |

### Movimento

- Mudar de secção: o centro desliza 12 px e faz fade em 240 ms; a coluna da proposta faz scroll suave até à página correspondente.
- Nova linha: mola suave (0,35 s, sem ressalto); apagar recolhe a altura em 240 ms.
- "Enviar ao cliente": sheet sobe em 500 ms com `cubic-bezier(0.32, 0.72, 0, 1)`; no fim um ✓ desenhado em 400 ms e o estado passa a "Enviada" na lista.
- "Guardado" no topo pisca discretamente (opacidade, 300 ms) quando grava; nunca um aviso/toast.
- `prefers-reduced-motion`: tudo passa a fades de 150 ms.

### Atalhos

| Atalho | Ação |
|---|---|
| ⌘↩︎ | Enviar ao cliente (abre confirmação) |
| ⌘P | Pré-visualizar em ecrã inteiro |
| ⌘I | Inspetor "Só para ti" |
| ⌘↑ / ⌘↓ | Secção anterior / seguinte |
| ⌘Z / ⇧⌘Z | Desfazer / refazer |
| ⌘K | Procurar na biblioteca de serviços e temas |

---

## 4. Documento da proposta (PDF) — redesenho (P1–P7)

Analisado: PDF real gerado pelo motor (11 páginas, A4 horizontal). Capa e contracapa estão boas. O miolo lê-se como um formulário.

### Diagnóstico página a página

| Página | Hoje | Problema |
|---|---|---|
| 1. Capa | 2 fotos + faixa preta com logótipo, "Proposta · Decoração", nomes, data | Boa — manter |
| 2. Apresentação e serviços | Tabela de 7 linhas + lista de serviços | 70% vazia; texto ~7 pt; repete a capa |
| 3–5. Inspiração | Título itálico + grelha | Grelhas diferentes em cada página; p.3 fotos só numa faixa ao meio |
| 6. Orçamento | 4 linhas sem preço + total (3 000 € + IVA = 3 690 €) | O número mais importante é pequeno; nada diz o que cada linha inclui |
| 7. Notas importantes | Texto pequeno | Mistura condições com incluído/excluído |
| 8. Condições gerais | 2 colunas minúsculas | Parece letra miudinha de contrato |
| 9. Próximos passos | Listas | Como aceitar está na p.9 de 11 |
| 10. Faseamento e contactos | Sinal 30%, saldo 70% | Valores enterrados no texto |
| 11. Contracapa | Fotos + "Obrigada" | Boa — manter |

Transversais: dois estilos de título (serif itálico vs sans numerado, numeração pára no 4); corpo a 7–8 pt; sem resumo; cabeçalho/rodapé com referência interna ("PO Decoração Casamento…") em todas as páginas.

### Nova estrutura

1. **Capa** — igual.
2. **Em resumo** (NOVA): total grande (ex. **3 690 €** c/ IVA), data, local, o que está incluído em 4–5 linhas, botão/QR "Aceitar proposta" (link para `/proposta/[token]`).
3. **Uma ideia por página**: frase-título ("Uma cerimónia rodeada de oliveiras.") + foto full-bleed. Sem numeração.
4. **Inspiração**: só 3 layouts — 1 foto inteira · 2 lado a lado · 1 grande + 2 pequenas. Margens iguais, sem molduras.
5. **Orçamento como página de produto**: cada linha = nome + 1 frase de descrição + preço; subtotal, IVA, total. Total em número herói (40–48 pt) a verde Líquen. Opcionais à parte com "+ 250 €".
6. **Próximos passos** logo a seguir: 3 passos (Aceitar · Sinal de 30% · Reunião de detalhes) + link/QR.
7. **Condições** em apêndice: 1 coluna, 11 pt, títulos curtos; faseamento como tabela pequena (Sinal 30% · Saldo 70% · datas).
8. **Contracapa** — igual.

### Regras de tipografia e layout

- Uma só família (a sans do site); serif só nos nomes da capa, se quiserem manter.
- Títulos 32–40 pt, corpo 12–14 pt, legendas 10 pt a #6e6e73.
- Margens 48 pt, grelha de 12 colunas, alinhado à esquerda.
- Cores: texto #1d1d1f, fundo branco ou #f5f5f7, verde Líquen como único acento (botão e total).
- Páginas de foto sem cabeçalho nem rodapé; referência só no "Em resumo" e nas Condições.
- Números com espaço fino nos milhares e € depois (`3 690 €`) — usar `Intl.NumberFormat('pt-PT')` e trocar o separador por U+202F.

### Proposta web (`/proposta/[token]`)

Mesmo conteúdo e ordem que o PDF: secções em altura de ecrã, fotos a sangrar, total fixo num rodapé de vidro (Liquid Glass: `backdrop-filter: blur(20px) saturate(180%)`, fundo branco 72%) com o botão "Aceitar", e PDF descarregável. A página é a experiência; o PDF é o recibo.

---

## 5. Temas — redesenho ao estilo da app Fotografias (T1–T7)

36 temas, 866 fotos. A grelha de fotos em si está bem; falha tudo à volta.

| # | Problema | Impacto |
|---|---|---|
| T1 | Muitos cartões de tema sem capa ao fim de 5 s | Página parece partida |
| T2 | Miniaturas partidas na lista de temas à esquerda (detalhe) | Ícones de erro em vez de fotos |
| T3 | "Eliminar tema" como botão de texto ao lado de "Adicionar fotos" | Risco de apagar sem querer |
| T4 | Densidade só Compacto/Confortável | Pouco controlo |
| T5 | Filtro "Por usar" isolado | Difícil encontrar a foto certa |
| T6 | Sem seleção múltipla nem ações em lote | 20 fotos = 20 cliques |
| T7 | Sem pré-visualização rápida | Abrir cada foto para ver em grande |

### Fazer

- **Foto-chave por tema**: "Definir como capa" no menu da foto; por defeito a primeira. Nunca cartão vazio.
- **Skeleton com a cor dominante** enquanto carrega (usar `api/biblioteca/paletas`); nunca ícone partido — `onError` mostra o placeholder de cor.
- **Gerar miniaturas em falta** de uma vez (script de manutenção usando `api/temas/[id]/miniaturas`).
- **Slider de zoom** (⌘+ / ⌘−), 3 a 10 colunas, transição com mola.
- **Modo Selecionar**: visto no canto, ⇧-clique para intervalos, ⌘A; barra flutuante de vidro: Mover para tema · Adicionar a proposta · Favorito · Apagar.
- **Quick Look**: espaço abre em grande, ← → navegam, Esc fecha (com zoom a partir da miniatura).
- **Favoritos** (coração) e **etiquetas** (mesa, altar, entrada, flores — usar `api/biblioteca/etiquetas` e `etiquetar`).
- **Filtro por cor/paleta** em pílulas.
- **Temas inteligentes**: Por usar · Usadas em propostas aceites · Recentes · Favoritas (usar `api/temas/uso`).
- **Inspetor** (⌘I): dimensões, data, etiquetas, em que propostas a foto foi usada.
- **Arrastar fotos** da biblioteca para uma secção da proposta no estúdio (`src/lib/temas-arrasto.ts`).
- **Eliminar tema** só no menu "…", com confirmação que diz quantas fotos e propostas são afetadas; botão destrutivo vermelho, "Cancelar" como predefinido.

### Estrutura do ecrã

```
┌────────────────┬─────────────────────────────────────────────┬──────────────┐
│ Biblioteca     │ 🔍 Procurar   [Todas][Favoritas][Por usar]  ●●●  ─○── Selecionar │
│ Favoritas      │ ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐                │  Inspetor    │
│ Inteligentes ▸ │ │   ││   ││   ││   ││   ││   │                │  (⌘I)        │
│ ─────────────  │ └───┘└───┘└───┘└───┘└───┘└───┘                │  usada em:   │
│ ▣ Boho         │ ┌───┐┌───┐┌───┐┌───┐┌───┐┌───┐                │  · Inês & R. │
│ ▣ Rústico      │ │   ││   ││   ││   ││   ││   │                │              │
│ ▣ … (36)       │ └───┘└───┘└───┘└───┘└───┘└───┘                │              │
└────────────────┴─────────────────────────────────────────────┴──────────────┘
```

Mesmo esqueleto de 3 colunas do estúdio → o back-office parece uma só app.

---

## 6. Tokens base (Fase 1)

```css
:root {
  --font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --text: #1d1d1f;  --text-2: #6e6e73;  --text-3: #86868b;
  --bg: #ffffff;    --bg-2: #f5f5f7;    --line: #d2d2d7;
  --accent: #5F7C66;            /* verde Líquen — confirmar o hex oficial */
  --danger: #ff3b30;
  --r-card: 18px;  --r-field: 10px;  --r-pill: 980px;
  --shadow-1: 0 1px 2px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.06);
  --glass: rgba(255,255,255,.72);  --glass-blur: blur(20px) saturate(180%);
  --ease-sheet: cubic-bezier(0.32, 0.72, 0, 1);
  --dur-fast: 150ms; --dur: 240ms; --dur-sheet: 500ms;
}
@media (prefers-color-scheme: dark) {
  :root { --text:#f5f5f7; --text-2:#a1a1a6; --bg:#000; --bg-2:#1c1c1e; --line:#38383a; --glass: rgba(28,28,30,.72); }
}
@media (prefers-reduced-motion: reduce) {
  :root { --dur: 150ms; --dur-sheet: 150ms; }
}
```

Molas (Framer Motion ou CSS `linear()`): suave `stiffness 170, damping 26`; rápida `stiffness 300, damping 30`; sem ressalto nas sheets.

Componentes: `Button` (pílula, primário verde / secundário cinza), `Toolbar` (52 px, vidro, sticky), `Sidebar` (recolhível, 240 px), `Inspector` (320 px, ⌘I), `GroupedList` + `GroupedRow` (44 px), `Sheet` (confirmação), `ContextMenu`, `Skeleton` (cor dominante).

---

## 7. Plano por fases

| Fase | O quê | Itens | Esforço |
|---|---|---|---|
| 1 | Bases: tokens, fonte do sistema, componentes (botão pílula, toolbar, sidebar, inspetor, lista agrupada, sheet) | §6 | 1–2 dias |
| 2 | Temas: capas, miniaturas em falta, skeletons, "Eliminar" no menu "…" | T1–T3 | 1 dia |
| 3 | Estúdio em 3 colunas, uma secção de cada vez, pré-visualização ao vivo, atalhos, movimento | E1–E10 | 3–4 dias |
| 4 | PDF: Em resumo, orçamento com total herói, tipografia única, layouts de inspiração, condições em apêndice | P1–P7 | 2–3 dias |
| 5 | Fotografias: seleção múltipla, Quick Look, favoritos, etiquetas, filtros por cor, temas inteligentes, inspetor, arrastar para proposta | T4–T7 | 3 dias |
| 6 | Proposta web alinhada com o PDF + rodapé de vidro com "Aceitar" | §4 web | 2 dias |

### Critérios de aceitação (por fase)

- Build e testes verdes; sem erros na consola.
- Screenshots antes/depois (1440 px e 390 px, claro e escuro) anexados ao PR.
- Fase 3: o 1.º campo do estúdio visível sem scroll a 1440×900; ⌘I, ⌘P, ⌘↑/↓ funcionam.
- Fase 4: corpo do PDF ≥ 12 pt; total visível na p.2; "Próximos passos" antes da p.6; mesma proposta = mesmo total que antes (comparar números das 3 versões Margarida & Duarte).
- Fase 2/5: 0 cartões sem capa e 0 imagens partidas nos 36 temas; seleção de 20 fotos e mover em < 5 cliques.

---

## 8. Prompt para começar

```
Lê PROPOSTAS-E-TEMAS-APPLE.md na íntegra.
Entra em plan mode. Começa pela Fase 1.
1. Lista os ficheiros a criar/alterar e o que muda em cada um.
2. Implementa numa branch feat/apple-fase-1.
3. Corre build e testes; tira screenshots antes/depois com Playwright (1440 e 390 px, claro e escuro).
4. Não alteres cálculos de preços, IVA nem dados de clientes.
Mostra-me o plano antes de escrever código. Quando a fase estiver aprovada e em PR, passa à seguinte.
```
