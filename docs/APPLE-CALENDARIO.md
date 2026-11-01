> **Este documento é dela**, e está aqui inteiro a partir da Parte 1. A tabela
> em baixo é a única coisa acrescentada.

## O QUE JÁ ESTÁ FEITO

Auditado no código contra a tabela da **Parte 9** — `Calendario.tsx`,
`CalendarioAno.tsx`, `VistasDeHoras.tsx`, `ChipDoDia.tsx`,
`CalendariosFiltraveis.tsx` e `lib/orcamento/{ano,dia}-do-calendario.ts`.

| # | Fase | Estado |
|---|---|---|
| 01 | Toolbar | **feito** (1/11) — o mês é o título, no degrau de display, com as setas e o «Hoje»; o «Exportar» passou ao menu `⋯` («Exportar calendário…», o `MenuDeAccoes` da casa), fora do telemóvel como estava |
| 02 | Grelha a toda a largura | **feito** — sem cartão, enche largura e altura, dias adjacentes esbatidos |
| 03 | Chips | **feito** — cor por tipo, glifo, hora antes do título, truncatura, `+N mais` com popover |
| 04 | Calendários filtráveis | **feito** — quatro caixas de marcar na barra lateral, com `⌥+clique` a isolar; filtram as QUATRO vistas |
| 05 | Painel de próximos | **parcial** (1/11) — agrupado por mês com cabeçalhos `sticky` («Setembro · Outubro · Maio 2027», o ano só quando não é este); o número de convidados nunca se corta e «0» passa a «Convidados por confirmar» (pontos 23 e 24); passar o rato ou o foco por uma linha realça o dia na grelha (ponto 25, metade). Fica por fazer a outra metade do 25 — o clique selecionar o evento e ir ao mês dele —, porque o clique desta lista é hoje «Fazer proposta», que foi uma decisão anterior dela |
| 06 | Vista de dia | **feito** — coluna 07:00–24:00 a 44 px/hora, linha do agora, sobreposição em pistas |
| 07 | Vista de ano | **feito** — doze mini-meses com o resumo em palavras |
| 08 | Vista de semana | **feito** — sete colunas na mesma escala, faixa de dia inteiro, coluna de hoje |
| 09 | Arrastar | **por fazer** — e é ela que destranca o `Mudar de dia…` do menu de contexto (ver abaixo) |
| 10 | Menus e teclado | **feito** — menu de contexto no dia, no pedido e na marcação; `⌘1–4`, `⌘T` (e `T`), `⌘N`, `←/→` e `⌥←/→`. `Home`/`End` e `PageUp`/`PageDown` entraram com a fase 11; `Delete` (e `⌫`) numa marcação com foco abre a pergunta de remover, com o «Anular» da casa (1/11, nas quatro vistas). **Feito** |
| 11 | Acessibilidade | **feito** — a grelha do mês é um `role="grid"` de `row` (com `display: contents`, para não mexer na disposição) e `gridcell`; um só dia no fio do Tab (foco itinerante), `aria-selected`, `aria-current="date"` em hoje, e o nome do dia com o dia da semana («Quinta-feira, 15 de Janeiro de 2026…»). Setas, `Home`/`End` e `PageUp`/`PageDown` (`diaPelaTecla`, com teste). Era o achado n.º 24 da auditoria: controlos dentro de controlos, 31 por mês no axe — agora zero |

**Duas coisas que o código não deixou fazer como está escrito**, e ficam aqui
para quem vier a seguir não as procurar:

  · o menu de contexto do evento pede `Mudar de dia…` e `Alterar tipo`, e o
    `/api/calendario` tem POST e DELETE e **não tem PATCH**. Mudar uma marcação
    seria apagá-la e criar outra — troca-lhe o `id`, perde o `createdAt` e, se a
    criação falhar depois do apagar, perde a marcação. Sem Anular (fase 09) isso
    não se faz. Ficaram `Duplicar` (que é um POST), `Ver na vista de dia` e
    `Remover` pela pergunta da casa;
  · o `⌘T` da Parte 18 **não chega ao código num separador de browser** —
    `⌘T`/`Ctrl+T` é «separador novo» e não é entregue à página. Está ligado à
    mesma (numa janela de aplicação instalada chega cá), e ao lado dele há o `T`
    SOLTO, que é o que a web faz há anos e o que dispara mesmo.

---

# PROMPT — Reconstruir o ecrã "Calendário" segundo o sistema da Apple

> **Âmbito:** a rota `/orcamento/admin/calendario`. Não toques em mais nada.
> **Pré-requisito:** os tokens do `docs/DESIGN-SYSTEM.md` já existem.
> **Marcações:** **[APPLE]** = regra publicada pela Apple · o resto é tradução para web.
>
> O diagnóstico deste ecrã numa frase: **é um calendário que não sabe que é um calendário.** Tem uma grelha de mês bonita e mais nada — não tem vista de dia, nem de semana, nem de ano; não se arrasta um evento; não há menu de contexto; não há horas; a legenda de cores não filtra nada e as cores não são usadas; e metade do ecrã está vazia enquanto a grelha está apertada dentro de um cartão.
>
> A referência mental certa é a **app Calendário do Mac**.

---

## PARTE 1 — AUDITORIA

### A. Barra de topo e identidade

**1. O logótipo está centrado na toolbar.** *Resistir a repetir o logótipo; a marca defere ao conteúdo.* **[APPLE, Branding]** Fora. Uma toolbar de Mac tem título.

**2. A hierarquia do cabeçalho está invertida.** "Os teus eventos no tempo" está **acima** do título, em cinzento pequeno. *Título curto que identifica a vista, com menos de 15 caracteres.* **[APPLE]** Correção: a descrição desaparece.

**3. O botão primário é preto.**
No login e no editor de propostas o primário é sálvia; aqui é preto. **Três ecrãs, duas cores primárias.**
Regra: *usar cor consistentemente ao longo da interface — evitar usar a mesma cor para significar coisas diferentes;* e *escolher uma cor de acento.* **[APPLE, Color + Branding]**
Correção: `--accent` em todo o lado. Uma aplicação com dois primários diferentes não se lê como uma aplicação.

**4. "+ Novo" não diz o quê.** *Rótulos de botão começam por verbo e dizem exatamente o que acontece.* **[APPLE, Buttons]** Correção: **"Novo evento"**, e as outras criações vão para o menu com reticências (`Nova nota…`, `Fechar datas…`).

**5. Quatro controlos soltos no fim da toolbar.** "?" · "Tudo guardado" · "Pesquisar ⌘K" · "+ Novo". *Máximo três grupos de controlos.* **[APPLE]**

### B. A grelha — o essencial

**6. Dois títulos a competir.** "Calendário" na toolbar e "Setembro 2026" a 34 px dentro do cartão. **O mês é o título da vista.** Correção: `Setembro 2026` sobe para a toolbar, ao lado dos controlos de navegação, e "Calendário" desaparece — a sidebar já diz onde estamos.

**7. O calendário está dentro de um cartão.**
Uma grelha de calendário é conteúdo de página inteira. O cartão com raio e padding rouba cerca de 60 px de cada lado e faz a grelha mais pequena do que podia ser.
Regra: *a área de conteúdo é o palco principal; dar espaço à informação essencial.* **[APPLE, Layout]**
Correção: **grelha a toda a largura**, sem cartão. Os limites das células são os separadores; não é preciso mais nada a delimitar.

**8. Metade do ecrã está vazia e a grelha está apertada.**
As cinco linhas ocupam ~430 px e sobram ~200 px de página em branco por baixo.
Correção: a grelha **enche a altura disponível** (`grid-template-rows: repeat(N, minmax(0,1fr))` num contentor `height: 100%`). Numa semana com muitos eventos, as células crescem; nunca há espaço morto.

**9. Só existe a vista de mês.**
A app Calendário tem **Dia, Semana, Mês e Ano**, com `⌘1` a `⌘4`.
Para a Líquen: a **vista de dia** é onde o trabalho acontece — montagem, horários, equipa; a **vista de ano** é onde se vê disponibilidade e se responde a "temos livre em julho?". O mês sozinho é a menos útil das quatro.
Correção: as quatro vistas, com segmented na toolbar e os atalhos.

**10. Os dias dos meses adjacentes não estão esbatidos.** 31 de agosto e 1 a 4 de outubro parecem dias de setembro. Correção: `--fg-tertiary` no número e fundo ligeiramente recuado. É legibilidade básica da grelha.

**11. O evento trunca para "An".**
Uma pílula com duas letras não transporta informação nenhuma.
Regra: *truncar ao meio preservando início e fim.* **[APPLE, Lists and tables]**
Correção: o título trunca com reticências a partir de uma largura mínima legível; se a célula não comporta, mostra **"+2 mais"** e o resto abre em popover. Nunca uma pílula de duas letras.

**12. Todos os eventos são pílulas cinzentas.**
Há uma legenda com quatro cores — Reunião, Evento, Data fechada, Nota — e na grelha as pílulas são todas cinzentas com um ponto minúsculo. **A cor não está a fazer trabalho nenhum.**
Correção: cada pílula leva o tom do seu tipo — fundo subtil da cor, barra de 2 px à esquerda, e o nome do tipo no `aria-label`. **Nunca só cor:** o tipo aparece também no popover e no ícone. **[APPLE]**

**13. A legenda está no fundo e não filtra.**
Uma legenda necessária para decifrar a grelha, colocada **por baixo** da grelha. E é só legenda.
Correção: os quatro tipos passam a **calendários filtráveis** na barra lateral, com checkbox e cor — exatamente como os calendários da app da Apple. Desligar "Data fechada" esconde as datas fechadas. Metadado acionável tem de ser filtrável.

**14. "Clica num dia para ver ou adicionar" é texto instrucional.** *Não explicar como funcionam componentes-padrão; se a linguagem não chega, repensar a interação.* **[APPLE, Writing]** Correção: fora. Se clicar num dia não é descoberto, o problema é a afordância.

**15. Não há horas.** Uma grelha de mês sem uma única hora, num negócio em que a hora de montagem é metade do trabalho. Correção: eventos com hora mostram-na antes do título — `09:00 Montagem Torre de Palma`; eventos de dia inteiro não.

**16. Não se arrasta um evento.**
Arrastar para mover, arrastar em espaço vazio para criar, `Alt` para duplicar. É a interação central de um calendário e não existe.
Regra: *dentro do mesmo contentor move; `Alt` copia; feedback só sobre destino válido; regresso animado quando falha; desfazer sempre.* **[APPLE, Drag and drop]**

**17. Não há menu de contexto** no evento nem no dia.

**18. Não há atalhos.** `⌘1–4` vistas · `⌘T` hoje · `⌘N` novo evento · setas para navegar dia a dia · `⌥←/→` mês anterior e seguinte · `Delete` com Anular · `Espaço` pré-visualizar o dia.

**19. As setas "‹ ›" não têm rótulo acessível** e estão coladas ao "Hoje" no mesmo grupo. Correção: `‹ ›` como um grupo com `aria-label` ("Mês anterior", "Mês seguinte") e "Hoje" como botão à parte, desativado quando já estamos no mês atual.

**20. "2 eventos este mês" é uma legenda solta.** Correção: passa a **estado da vista** em `role="status"`, ao lado do título, e muda com os filtros.

**21. "Exportar" está ao nível dos controlos de navegação.** Uma ação rara com o mesmo peso da navegação do mês. Correção: menu `⋯`.

### C. O painel lateral e a shell

**22. A lista de próximos eventos não está agrupada — e o salto não é explicado.**
26 Set → 3 Out → **29 Mai 27**. Sete meses de intervalo sem qualquer separador. O leitor tem de descobrir sozinho que não há nada entre outubro e maio.
Correção: **cabeçalhos de mês sticky** — `Setembro` · `Outubro` · `Maio 2027`. O buraco passa a ser evidente em vez de suspeito. E é a informação mais valiosa do ecrã: sete meses livres é uma decisão comercial.

**23. Truncatura a meio de um número.** "Conferências & Congressos · 33 convi…". Correção: nunca truncar números; o tipo passa a badge de cor e a contagem fica sempre inteira.

**24. "0 convidados" é dado em falta apresentado como zero.** Correção: "Convidados por confirmar", ou simplesmente omitir a linha.

**25. O painel não está ligado à grelha.** Clicar num próximo evento devia selecioná-lo e revelá-lo na grelha; passar o rato devia realçar o dia. Hoje são duas listas lado a lado que não se conhecem.

**26. A barra flutuante com onze ícones no fundo.** *Máximo cinco separadores; nunca gerar um "Mais"; se precisas de mais áreas, usa a sidebar.* **[APPLE, Tab bars]** E uma dock flutuante arredondada é padrão de telemóvel. Correção: sidebar, como em todos os outros ecrãs.

---

## PARTE 2 — A ARQUITETURA NOVA

```
┌──────────────────────────────────────────────────────────────────────┐
│  ‹ ›  Setembro 2026   Hoje    4 eventos    Dia Semana Mês Ano   ⋯  + Novo evento │ toolbar vidro 52
├────────────────┬─────────────────────────────────────────────────────┤
│  CALENDÁRIOS   │  Seg    Ter    Qua    Qui    Sex    Sáb    Dom      │
│  ☑ ● Reunião   │ ┌────┬──────┬──────┬──────┬──────┬──────┬──────┐    │
│  ☑ ● Evento    │ │ 31 │  1   │  2   │  3   │  4   │  5   │  6   │    │
│  ☑ ● Fechada   │ ├────┼──────┼──────┼──────┼──────┼──────┼──────┤    │
│  ☑ ● Nota      │ │  7 │  8   │ (9)  │ 10   │ 11   │ 12   │ 13   │    │
│                │ │    │      │hoje  │▍9:00 │      │      │      │    │
│  PRÓXIMOS      │ │    │      │      │ Ana  │      │      │      │    │
│  ── Setembro ──│ ├────┴──────┴──────┴──────┴──────┴──────┴──────┤    │
│  26  Daniela   │ │  a grelha enche a altura disponível          │    │
│  ── Outubro ── │ └───────────────────────────────────────────────┘    │
│   3  Catherine │                                                     │
│  ── Maio 2027 ─│  arrastar move · arrastar em vazio cria · ⌥ duplica │
│  29  Tara      │                                                     │
└────────────────┴─────────────────────────────────────────────────────┘
```

**Cinco decisões que isto encerra:**

1. O mês é o título e vive na toolbar. Não há título duplicado nem cartão.
2. A grelha é conteúdo a toda a largura e a toda a altura. Zero espaço morto.
3. A legenda transforma-se em **calendários filtráveis** na barra lateral.
4. Os "Próximos eventos" ficam por baixo dos filtros, **agrupados por mês**, e ligados à grelha.
5. Quatro vistas, com atalhos. A de dia e a de ano são as que faltavam e as que mais valem.

---

## PARTE 3 — AS QUATRO VISTAS

**Dia** — coluna de horas das 07:00 às 24:00, 44 px por hora, linha do momento atual a `--accent` com bolinha à esquerda. Eventos sobrepostos dividem a largura. É aqui que se planeia uma montagem.

**Semana** — sete colunas com a mesma escala de horas; eventos de dia inteiro numa faixa fixa no topo. Coluna de hoje com fundo `--accent-subtle` a 40%.

**Mês** — o que existe, corrigido. Célula com número no canto superior, eventos por baixo, `+N mais` quando não cabem. Altura de célula mínima 96 px, e cresce para encher.

**Ano** — doze mini-meses. Cada dia com evento ganha um ponto; dias fechados ganham fundo. **É a vista que responde a "temos livre em julho?"** — a pergunta comercial mais frequente da Líquen, hoje sem resposta em nenhum ecrã.

Transição entre vistas: fade cruzado de 200 ms, `--ease-out`, **sem deslocação**. É uma interação de alta frequência. **[APPLE]**

---

## PARTE 4 — COMPONENTES

**`EventChip`** (na grelha de mês)

```
▍09:00 Montagem Torre de Palma
▲ barra de 2px com a cor do tipo
```
Altura 20 px · raio 5 px · fundo `color-mix(in oklab, var(--tipo) 12%, transparent)` · texto `--fg-primary` a 11.5 px · hora em `tabular-nums` e `--fg-secondary`. Truncatura com reticências. `title` com o texto completo. Hover: fundo a 20%. Selecionado: fundo a 28% mais anel de 2 px.

**`DayCell`** — número no canto superior inicial, 12 px, `tabular-nums`. Hoje: círculo cheio `--accent` de 22 px com o número a branco. Dias adjacentes: número em `--fg-tertiary` e fundo `--bg-subtle` a 50%. Fim de semana: fundo `--bg-subtle` a 30%. Hover: fundo `--accent-soft`. **Duplo clique cria evento nesse dia.**

**`CalendarList`** — os quatro tipos como calendários, com checkbox quadrado da cor do tipo. Clique alterna; `⌥+clique` isola só esse. Estado guardado.

**`UpcomingList`** — agrupada por mês com cabeçalho sticky em `text-footnote/600` e `--fg-tertiary`. Cada linha: bloco de data (dia grande, mês pequeno), nome em `headline/600`, e uma segunda linha com badge de tipo mais convidados. Hover realça o dia correspondente na grelha; clique seleciona o evento e navega até ao mês dele.

**`DayInspector`** — ao clicar num dia, um popover ancorado à célula (não uma sheet) com a lista de eventos desse dia e um `+ Novo evento`. Fecha com `Esc` ou clique fora, e **guarda ao fechar**. **[APPLE, Popovers]**

**Menu de contexto do evento:** `Abrir` · `Duplicar` — separador — `Mudar de dia…` · `Alterar tipo` — separador — `Eliminar` (vermelho, com Anular).
**Menu de contexto do dia:** `Novo evento` · `Nova nota` — separador — `Fechar este dia` · `Ver na vista de dia`.

---

## PARTE 5 — ARRASTAR

- **Arrastar um evento** para outro dia move-o. `Alt` duplica, com o cursor a mudar para `copy`. **[APPLE]**
- **Arrastar em espaço vazio** através de vários dias cria um evento de vários dias — é como se fecham datas.
- Imagem de arrasto translúcida a partir de ~3 px. Realce da célula de destino só quando é válida; `not-allowed` quando não é.
- Falha no drop: **regresso animado à origem** com `--ease-reposition`.
- Sempre com Anular: **"Evento movido para 12 de setembro — Anular"**, 10 s. Anular volta a mostrar o evento na posição antiga e destaca-o 1,2 s. **[APPLE]**
- Anúncio em `role="status"`: *"Daniela Silva movido de 26 para 12 de setembro."*
- Alternativa por menu obrigatória: `Mudar de dia…`. Arrastar nunca é o único caminho. **[APPLE]**

---

## PARTE 6 — MOVIMENTO

| Interação | Duração | Curva |
|---|---|---|
| Mudar de mês | 200 ms | `--ease-out`, fade cruzado — **sem deslizar** |
| Mudar de vista | 200 ms | `--ease-out`, fade cruzado |
| Hover de célula ou chip | 150 ms | `--ease-interactive` |
| Popover do dia a abrir | 325 ms | `--ease-quick`, origem na célula |
| Evento a mover-se após drop | 475 ms | `--ease-reposition`, sem ressalto |
| Regresso de drop falhado | 475 ms | `--ease-reposition` |
| Destaque do evento restaurado | 1200 ms | `--ease-out` |
| Linha do momento atual | — | sem animação; atualiza a cada minuto |

**Nunca deslizes a grelha ao mudar de mês.** Parece natural e é a decisão errada: navegar meses é a interação mais frequente do ecrã, e movimento em interações de alta frequência cansa. **[APPLE]** Fade cruzado.

---

## PARTE 7 — MICROCOPY

| Atual | Novo |
|---|---|
| Os teus eventos no tempo | *(fora)* |
| Calendário | *(vai para a sidebar; o título da vista é o mês)* |
| + Novo | **Novo evento** |
| 2 eventos este mês | 4 eventos · 1 data fechada *(estado, muda com os filtros)* |
| Exportar | *(menu ⋯)* Exportar calendário… |
| Clica num dia para ver ou adicionar | *(fora)* |
| Reunião · Evento · Data fechada · Nota | *(passam a calendários com checkbox)* |
| Conferências & Congressos · 33 convi… | Conferências · **33 convidados** *(o número nunca trunca)* |
| 0 convidados | Convidados por confirmar |
| 29 Mai 27 | 29 Mai *(sob o cabeçalho **Maio 2027**)* |
| *(vazio)* | Sem eventos em setembro. — Novo evento |
| *(toast)* | Evento movido para 12 de setembro — Anular |

---

## PARTE 8 — ACESSIBILIDADE

- Grelha com `role="grid"`; cada dia é `role="gridcell"` com `aria-label` completo: **"Quinta-feira, 10 de setembro de 2026, 1 evento"**.
- Setas navegam dia a dia; `Home`/`End` início e fim da semana; `PageUp`/`PageDown` mês anterior e seguinte; `Enter` abre o dia; `Espaço` pré-visualiza.
- Cada chip de evento é focável, com `aria-label` que inclui **tipo, hora e título** — a cor nunca é o único portador do tipo.
- Hoje marcado com `aria-current="date"`.
- Contagem e resultados em `role="status" aria-live="polite"`.
- Operações de arrasto anunciadas em `role="status"`.
- Contraste dos chips medido sobre o fundo da célula, em claro **e** escuro. Os quatro tipos têm de ser distinguíveis também em escala de cinzentos.
- Alvos: célula inteira clicável; chips com 20 px visuais e 24 px de alvo, com 4 px de folga entre eles.
- Zoom a 200% sem scroll horizontal — a grelha reduz colunas de conteúdo, nunca corta dias.

---

## PARTE 9 — ORDEM DE EXECUÇÃO

| # | Fase | Entrega |
|---|---|---|
| 01 | **Toolbar** | Logótipo fora, mês como título, primário a sálvia, "Novo evento", `⋯` para Exportar. |
| 02 | **Grelha a toda a largura** | Fora o cartão; a grelha enche largura e altura; dias adjacentes esbatidos. |
| 03 | **Chips** | Cor por tipo, hora antes do título, truncatura com reticências, `+N mais` com popover. |
| 04 | **Calendários filtráveis** | A legenda vira quatro calendários com checkbox na barra lateral. |
| 05 | **Painel de próximos** | Agrupado por mês com cabeçalhos sticky, ligado à grelha. |
| 06 | **Vista de dia** | Coluna de horas, linha do agora, sobreposição. |
| 07 | **Vista de ano** | Doze mini-meses com pontos e dias fechados. *(A que responde a “temos livre em julho?”)* |
| 08 | **Vista de semana** | |
| 09 | **Arrastar** | Mover, criar por arrasto, `Alt` duplicar, Anular. |
| 10 | **Menus e teclado** | Contexto no evento e no dia; `⌘1–4`, `⌘T`, `⌘N`, setas. |
| 11 | **Acessibilidade** | `role="grid"`, rótulos completos, contraste dos quatro tipos. |

**Critérios de aceitação**

1. Um só título de vista. Zero cartões à volta da grelha. Zero espaço morto por baixo.
2. Uma só cor primária em toda a aplicação.
3. Nenhuma pílula de evento com menos de três palavras legíveis; nunca "An".
4. Os quatro tipos distinguem-se em cor **e** em texto, e ligam/desligam a grelha.
5. `⌘1` a `⌘4` trocam de vista; `⌘T` volta a hoje.
6. Arrastar um evento para outro dia move-o, com Anular durante 10 s.
7. A vista de ano responde a "temos livre em julho de 2027?" em menos de três segundos.
8. Os próximos eventos estão agrupados por mês e o salto de sete meses é visível à primeira.
9. Percurso completo só com teclado: navegar meses, abrir um dia, criar evento, mover, anular.
10. Lighthouse de acessibilidade ≥ 95.

---

## PARTE 10 — PROIBIÇÕES NESTE ECRÃ

Logótipo na toolbar · dois botões primários de cores diferentes na aplicação · descrição da vista acima do título · título duplicado · cartão à volta da grelha · espaço morto por baixo enquanto a grelha está apertada · dias adjacentes com o mesmo peso dos do mês · pílula de evento truncada abaixo do legível · cor sem função · legenda que não filtra · texto instrucional a explicar um clique · calendário sem vista de dia e de ano · calendário sem arrastar · evento sem hora · eliminar sem Anular · deslizar a grelha ao mudar de mês · barra flutuante com onze ícones · truncar um número · apresentar dado em falta como zero · lista com saltos de meses sem cabeçalhos · painel lateral que não conhece a grelha · qualquer valor literal fora dos tokens.