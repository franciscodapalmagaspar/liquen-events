# Sistema de design do back office — o software da Apple, replicado

> **Este documento manda.** Todo o trabalho de interface no back office segue o
> que está aqui escrito. Lê o ficheiro inteiro antes de tocar em qualquer
> componente. Nenhum valor de cor, espaço, raio, duração ou curva pode existir
> fora dos tokens definidos aqui.

**Rigor das fontes.** Marcações usadas ao longo do documento:
**[APPLE]** — afirmação ou valor publicado pela Apple (HIG, documentação, sessões WWDC).
**[CALC]** — calculado a partir das fórmulas oficiais da Apple. Verificável.
**[EI]** — engenharia inversa de terceiros credíveis, consistente com o comportamento observado. Não é doutrina.
Tudo o que não estiver marcado é decisão de tradução para web. A Apple publica métricas em pontos para iOS e macOS e **não publica equivalentes para browser** — nem durações de animação do Liquid Glass, nem opacidades do material, nem alturas de controlos modernos.

---

## PARTE −1 — ADAPTAÇÕES A ESTA CASA

Este preâmbulo não estava no documento original. Está aqui porque há quatro
pontos em que o documento, aplicado à letra, mandaria o trabalho para o sítio
errado neste repositório. Cada um está medido.

**1. O gestor de pacotes é o `npm`, não o `pnpm`.**
Há `package-lock.json` e não há `pnpm-lock.yaml`. Onde o documento diz
`pnpm build`, lê-se `npm run build`. As quatro verificações desta casa são
`npm run lint`, `npx tsc --noEmit`, `npx vitest run` e `npm run build` — e o
passo da CI chama-se, à letra, «Lint · Typecheck · Test · Build». Correr três
das quatro já custou dois vermelhos nesta sessão.

**2. Os utilitários de duração do Tailwind v4 leem `--transition-duration-*`.**
Um token escrito como `--duration-fast` **dá a variável e não gera utilitário
nenhum** — sem erro, sem aviso, sem regra no CSS compilado. As durações deste
documento entram no `@theme` com o prefixo correcto:

```css
--transition-duration-quick: 325ms;   /* e NÃO --duration-quick */
```

Os nomes `--duration-*` continuam a poder existir para quem os leia à mão em
`transition-duration: var(--duration-quick)`, mas quem quiser a classe
`duration-quick` precisa do prefixo. A mesma armadilha vale para as curvas: um
`--ease-*` só gera `ease-*` se estiver dentro do `@theme`; em `:root` dá a
variável e nenhuma classe.

**3. O CSS do back office está separado do CSS do site.**
O `globals.css` tem `@source not "./[lang]/(admin)"`: o back office foi retirado
da varredura porque 87,8 KB de utilitários só-de-admin estavam a viajar dentro
de cada proposta enviada a um casal. O `@theme` partilhado vive em `tema.css`; o
`admin.css` faz `@reference "./tema.css"` mais um `@import` dos utilitários com
`source("./[lang]/(admin)")`. **Um token novo vai ao `tema.css`**; uma classe
nova usada só no back office só é gerada se o `admin.css` a varrer.

E um token de movimento vai ao **`@theme static`** do fim do `tema.css`, não ao
`@theme` normal: este poda as variáveis que o site público não usa, e uma que só
o back office lê fica com a classe e sem o valor. Aconteceu às durações e, a
28/10, a seis das curvas (`smooth`, `default`, `reposition`, `nav`, `sheet`,
`bouncy`, que caíam na curva `ease` do browser). Desde então as durações e as
curvas vivem todas no `static`, e o passeio
`e2e/o-movimento-chega-ao-elemento.spec.ts` exige que cheguem ao `:root`.

**4. O que já existe não se reescreve por gosto.**
O back office já tem uma família de material (`.bo-material`, `.bo-material-faixa`,
`.bo-material-desfoque`), tokens de acento, sombra e fio, e testes que os medem —
incluindo contrastes calculados a partir dos tokens. Aplicar este documento é
**convergir** essa família para os nomes e valores daqui, não criar uma segunda
a viver ao lado. Duas famílias de material no mesmo ecrã é o defeito que este
documento existe para evitar.

**5. Onde o documento e a acessibilidade discordarem, ganha a acessibilidade.**
Está escrito na Parte 0 e repete-se aqui porque nesta casa já aconteceu: os
rácios de contraste são medidos por teste a partir dos tokens, e um token novo
que os baixe é um token que não entra.

**6. Os logótipos de terceiros vão nas cores deles — e só onde se escolhe o canal.**
Pedido dela (14/10): «coloca mesmo os logos do email coloridos e do whatsapp».
No «Por onde segue» do estúdio, o email e o WhatsApp são logótipos a cores
(`LogotiposDosCanais.tsx`, `.bo-marca-*` em `admin.css`), como já era o verde
do botão do WhatsApp. As cores não são tokens, porque são a marca deles. A regra
dos ícones em `currentColor` (§8.1) continua a valer para tudo o resto.

**7. A espera (`ui/EmCurso.tsx`) segue o §10, e todas as descargas passam por ela.**
Pedido dela (14/10): «quero melhorar a animação e a rapidez a descarregar
qualquer coisa no back office». A barra tem 4 px; às cegas avança por igual
até 85 % no tempo estimado e depois aproxima-se devagar de 95 %, sem parar
(`espera-em-curso.ts`); o ponto usa o pulso do §8.2 (`bo-pulso`, 1,2 s,
`PULSO` em `movimento.ts`), e o token `--ease-in-out` que ele nomeia foi
acrescentado. O fim vê-se: `concluido` enche a barra e troca o ponto pelo
visto durante `FIM_VISIVEL_MS`. As descargas (guião, contrato, cópia de
segurança, foto, mapa de mesas) passam por `ui/descarregar.ts`, que lê os
bytes contra o `Content-Length` — com o tamanho, a barra é verdadeira.

---

## PARTE 0 — QUEM ÉS, O QUE CONSTRÓIS, COMO TRABALHAS

És um engenheiro de front-end sénior com formação em design de interfaces e experiência em motion. Vais reconstruir a camada visual, de movimento e de interação do back office da Líquen Events para que, num ecrã de desktop, se comporte como uma aplicação nativa de Mac feita pela Apple em 2026.

**O produto.**

- Back office em `liquen-events.com/orcamento/admin`, usado quase sempre em desktop, ocasionalmente em iPad no local do evento.
- Secções: Visão Geral · Pedidos · Fazer proposta · Propostas · Calendário · Tarefas · e em "Mais": Propostas Aceites, Material, Temas, Estatísticas, Definições.
- Utilizadora principal: a Catarina, perfil "Administração", não-técnica, usa isto todos os dias, várias horas.
- Domínio: decoração e produção de casamentos. Pedidos de noivos, propostas com linhas de itens e valores em euros, eventos com data e local, tarefas, material que vai nas carrinhas, temas com fotografias, estatísticas.
- Stack: Next.js 16 App Router · React 19 · TypeScript · Tailwind v4 · Supabase/Postgres · Vercel · Vitest e Playwright.
- Marca: verde sálvia `#5F7C66`.

**Regras de trabalho, não negociáveis.**

1. Não reescreves a aplicação. Trabalhas por fases, na ordem da Parte 17.
2. Antes de cada fase, apresentas o plano em cinco linhas e esperas confirmação. Depois executas a fase inteira sem parar.
3. Cada fase fecha com o build a passar e os testes Playwright existentes verdes.
4. Não introduzes dependências novas sem perguntar. Pré-aprovadas: `lucide-react` (ícones) e `sonner` (toasts), se ainda não existirem.
5. **Nenhum valor literal fora dos tokens.** Nenhum hexadecimal, nenhum `px`, nenhuma duração, nenhuma `cubic-bezier` escrita à mão em ficheiros de componente. Se precisares de um valor novo, acrescenta-o ao `@theme` e avisa.
6. Todo o texto de interface em português europeu. Todo o código, nomes e comentários em inglês.
7. Quando este documento e o teu instinto discordarem, ganha este documento. Quando este documento e a acessibilidade discordarem, ganha a acessibilidade.

---

## PARTE 1 — O MODELO MENTAL

Três princípios organizam o sistema inteiro. **[APPLE]**

**Hierarquia.** Controlos e navegação elevam-se e distinguem-se do conteúdo por baixo. Existem exatamente duas camadas: a **camada de conteúdo** (dados, listas, formulários, fotografias) e a **camada funcional** (navegação e controlos). O Liquid Glass vive só na camada funcional. Teste: num screenshot, consegues dizer instantaneamente o que é navegação e o que é dados?

**Harmonia.** As formas alinham raios e margens em torno de um centro partilhado. A curvatura do hardware informa a curvatura do software, e propaga-se para dentro: janela → painel → cartão → controlo. **[APPLE]**

**Consistência.** Adaptação contínua a qualquer largura, sem uniformidade forçada. A vista compacta é adiada o máximo possível. **[APPLE]**

Um quarto princípio, implícito mas decisivo, vem da sessão *Designing Fluid Interfaces*: **a interface é sempre interrompível e o gesto conduz sempre a animação**. Nenhuma animação bloqueia um novo toque; nenhuma transição ignora a velocidade com que o utilizador a iniciou. **[APPLE]**

---

## PARTE 2 — A FÍSICA DO MOVIMENTO

Esta é a parte que separa uma interface que "parece Apple" de uma que apenas se lhe assemelha em cor e forma. Desde o iOS 17, **a animação por omissão do SwiftUI é uma mola, não uma curva de Bézier**. **[APPLE]**

### 2.1 As fórmulas oficiais

A Apple publicou a conversão entre a descrição percetual (`duration`, `bounce`) e a física (`mass`, `stiffness`, `damping`): **[APPLE]**

```
mass      = 1
stiffness = (2π / duration)²
damping   = (1 − bounce) · 4π / duration          , quando bounce ≥ 0
damping   = 4π / (duration · (1 + bounce))        , quando bounce  < 0
```

Relações derivadas: **[CALC]**

```
ω₀ = √(stiffness / mass) = 2π / duration
ζ  = damping / (2·√(stiffness · mass))        (rácio de amortecimento)
bounce = 1 − ζ                                 para ζ ≤ 1
duration = response                            são o mesmo parâmetro
```

Ou seja: `bounce` e `dampingFraction` são complementares. `.snappy` com bounce 0.15 é exatamente `dampingFraction 0.85`.

### 2.2 Os presets da Apple, com os valores reais

| Preset SwiftUI | Parâmetros oficiais | ζ | stiffness | damping |
|---|---|---|---|---|
| `.smooth` | duration 0.5, bounce **0** | 1.000 | 157.9 | 25.13 |
| `.snappy` | duration 0.5, bounce **0.15** | 0.850 | 157.9 | 21.36 |
| `.bouncy` | duration 0.5, bounce **0.3** | 0.700 | 157.9 | 17.59 |
| `.default` (iOS 17+) | response **0.55**, damping **1.0** | 1.000 | 130.5 | 22.85 |
| `.spring` legado | response **0.55**, damping **0.825** | 0.825 | 130.5 | 18.85 |
| `.interactiveSpring` | response **0.15**, damping **0.86** | 0.860 | 1754.6 | 72.05 |

Parâmetros: **[APPLE]** · física derivada: **[CALC]**, verificada contra os dois exemplos que a Apple publica (`duration 0.5, bounce 0.3` → `1.0, 157.9, 17.6` ✓ e `mass 1, stiffness 100, damping 10` → `duration 0.63, bounce 0.5` ✓).

Regra de ouro da Apple: bounce 0 é a mola de uso geral, a mais versátil; ~0.15 não é notoriamente elástica mas dá uma cauda mais viva; ~0.3 já se nota; **acima de 0.4, usar com muita cautela**. **[APPLE]**

### 2.3 As mesmas molas, resolvidas para CSS

Integrada a equação da mola amortecida para cada preset e amostrada a curva em 24 pontos. O resultado são funções `linear()` que reproduzem a mola da Apple no browser, **exatamente**, sem biblioteca de animação. A duração indicada é o tempo real até assentar a 0.5% do valor final. **[CALC]**

> **Nesta casa** os nomes de duração entram no `@theme` como
> `--transition-duration-*` (ver Parte −1, ponto 2), senão não geram utilitário.
> Os nomes abaixo estão como no documento original; o prefixo é a única
> tradução obrigatória.

```css
@theme {
  /* SwiftUI .smooth — duration .5, bounce 0 · uso geral, sem ressalto */
  --duration-smooth: 590ms;
  --ease-smooth: linear(0, 0.0392 4.2%, 0.1285 8.3%, 0.2385 12.5%, 0.3517 16.7%, 0.4587 20.8%, 0.5547 25.0%, 0.6380 29.2%, 0.7085 33.3%, 0.7672 37.5%, 0.8153 41.7%, 0.8543 45.8%, 0.8856 50.0%, 0.9106 54.2%, 0.9304 58.3%, 0.9460 62.5%, 0.9582 66.7%, 0.9677 70.8%, 0.9752 75.0%, 0.9809 79.2%, 0.9854 83.3%, 0.9888 87.5%, 0.9915 91.7%, 0.9935 95.8%, 1);
  /* SwiftUI .snappy — duration .5, bounce .15 · o default do back office */
  --duration-snappy: 540ms;
  --ease-snappy: linear(0, 0.0339 4.2%, 0.1156 8.3%, 0.2218 12.5%, 0.3364 16.7%, 0.4490 20.8%, 0.5534 25.0%, 0.6460 29.2%, 0.7256 33.3%, 0.7921 37.5%, 0.8463 41.7%, 0.8896 45.8%, 0.9232 50.0%, 0.9489 54.2%, 0.9680 58.3%, 0.9819 62.5%, 0.9916 66.7%, 0.9981 70.8%, 1.0023 75.0%, 1.0047 79.2%, 1.0059 83.3%, 1.0063 87.5%, 1.0061 91.7%, 1.0056 95.8%, 1);
  /* SwiftUI .bouncy — duration .5, bounce .3 · só para momentos de sucesso */
  --duration-bouncy: 555ms;
  --ease-bouncy: linear(0, 0.0370 4.2%, 0.1284 8.3%, 0.2496 12.5%, 0.3822 16.7%, 0.5132 20.8%, 0.6340 25.0%, 0.7397 29.2%, 0.8280 33.3%, 0.8987 37.5%, 0.9527 41.7%, 0.9918 45.8%, 1.0184 50.0%, 1.0348 54.2%, 1.0433 58.3%, 1.0460 62.5%, 1.0445 66.7%, 1.0405 70.8%, 1.0350 75.0%, 1.0289 79.2%, 1.0229 83.3%, 1.0173 87.5%, 1.0123 91.7%, 1.0082 95.8%, 1);
  /* SwiftUI .default — response .55, damping 1.0 */
  --duration-default: 650ms;
  --ease-default: linear(0, 0.0392 4.2%, 0.1284 8.3%, 0.2384 12.5%, 0.3516 16.7%, 0.4586 20.8%, 0.5546 25.0%, 0.6378 29.2%, 0.7084 33.3%, 0.7670 37.5%, 0.8151 41.7%, 0.8541 45.8%, 0.8855 50.0%, 0.9105 54.2%, 0.9303 58.3%, 0.9459 62.5%, 0.9581 66.7%, 0.9677 70.8%, 0.9751 75.0%, 0.9809 79.2%, 0.9854 83.3%, 0.9888 87.5%, 0.9914 91.7%, 0.9935 95.8%, 1);
  /* SwiftUI .interactiveSpring — response .15, damping .86 · hover, foco, toggles */
  --duration-interactive: 150ms;
  --ease-interactive: linear(0, 0.0295 4.2%, 0.1015 8.3%, 0.1968 12.5%, 0.3016 16.7%, 0.4067 20.8%, 0.5062 25.0%, 0.5968 29.2%, 0.6766 33.3%, 0.7453 37.5%, 0.8030 41.7%, 0.8506 45.8%, 0.8892 50.0%, 0.9198 54.2%, 0.9438 58.3%, 0.9621 62.5%, 0.9759 66.7%, 0.9860 70.8%, 0.9932 75.0%, 0.9982 79.2%, 1.0014 83.3%, 1.0034 87.5%, 1.0045 91.7%, 1.0050 95.8%, 1);
  /* duration .3, bounce .15 · menus, popovers, expandir */
  --duration-quick: 325ms;
  --ease-quick: linear(0, 0.0340 4.2%, 0.1160 8.3%, 0.2224 12.5%, 0.3373 16.7%, 0.4501 20.8%, 0.5545 25.0%, 0.6471 29.2%, 0.7267 33.3%, 0.7931 37.5%, 0.8472 41.7%, 0.8903 45.8%, 0.9239 50.0%, 0.9495 54.2%, 0.9684 58.3%, 0.9822 62.5%, 0.9918 66.7%, 0.9983 70.8%, 1.0024 75.0%, 1.0048 79.2%, 1.0059 83.3%, 1.0063 87.5%, 1.0061 91.7%, 1.0056 95.8%, 1);
  /* duration .22, bounce 0 · regresso do press de botão */
  --duration-press: 260ms;
  --ease-press: linear(0, 0.0393 4.2%, 0.1289 8.3%, 0.2392 12.5%, 0.3526 16.7%, 0.4597 20.8%, 0.5558 25.0%, 0.6391 29.2%, 0.7096 33.3%, 0.7681 37.5%, 0.8161 41.7%, 0.8550 45.8%, 0.8863 50.0%, 0.9111 54.2%, 0.9309 58.3%, 0.9464 62.5%, 0.9585 66.7%, 0.9680 70.8%, 0.9754 75.0%, 0.9811 79.2%, 0.9855 83.3%, 0.9889 87.5%, 0.9916 91.7%, 0.9936 95.8%, 1);
  /* response .3, damping .8 · sheets e gavetas — o valor que a Apple usa em gavetas [EI] */
  --duration-sheet: 345ms;
  --ease-sheet: linear(0, 0.0386 4.2%, 0.1310 8.3%, 0.2502 12.5%, 0.3773 16.7%, 0.5003 20.8%, 0.6119 25.0%, 0.7086 29.2%, 0.7891 33.3%, 0.8539 37.5%, 0.9044 41.7%, 0.9424 45.8%, 0.9700 50.0%, 0.9891 54.2%, 1.0018 58.3%, 1.0094 62.5%, 1.0135 66.7%, 1.0151 70.8%, 1.0149 75.0%, 1.0138 79.2%, 1.0121 83.3%, 1.0102 87.5%, 1.0083 91.7%, 1.0065 95.8%, 1);
  /* response .4, damping 1.0 · reposicionar, arrastar a largar — valor Apple [EI] */
  --duration-reposition: 475ms;
  --ease-reposition: linear(0, 0.0392 4.2%, 0.1287 8.3%, 0.2388 12.5%, 0.3521 16.7%, 0.4591 20.8%, 0.5552 25.0%, 0.6385 29.2%, 0.7090 33.3%, 0.7676 37.5%, 0.8156 41.7%, 0.8546 45.8%, 0.8859 50.0%, 0.9108 54.2%, 0.9306 58.3%, 0.9461 62.5%, 0.9583 66.7%, 0.9679 70.8%, 0.9753 75.0%, 0.9810 79.2%, 0.9854 83.3%, 0.9889 87.5%, 0.9915 91.7%, 0.9935 95.8%, 1);
  /* response .5, damping .95 · navegação entre vistas */
  --duration-nav: 515ms;
  --ease-nav: linear(0, 0.0307 4.2%, 0.1039 8.3%, 0.1984 12.5%, 0.3004 16.7%, 0.4011 20.8%, 0.4952 25.0%, 0.5802 29.2%, 0.6548 33.3%, 0.7191 37.5%, 0.7735 41.7%, 0.8188 45.8%, 0.8563 50.0%, 0.8868 54.2%, 0.9115 58.3%, 0.9313 62.5%, 0.9471 66.7%, 0.9595 70.8%, 0.9693 75.0%, 0.9768 79.2%, 0.9827 83.3%, 0.9872 87.5%, 0.9906 91.7%, 0.9931 95.8%, 1);
  /* Curvas de Bézier do Core Animation, para o que não é mola [EI, valores convergentes] */
  --ease-linear:  cubic-bezier(0, 0, 1, 1);
  --ease-in:      cubic-bezier(0.42, 0, 1, 1);
  --ease-out:     cubic-bezier(0, 0, 0.58, 1);
  --ease-in-out:  cubic-bezier(0.42, 0, 0.58, 1);
  --ease-ca-default: cubic-bezier(0.25, 0.1, 0.25, 1);
}
```

### 2.4 Quando usar qual

| Situação | Token | Porquê |
|---|---|---|
| Hover, foco, checkbox, switch, tint de linha | `--ease-interactive` / 150 ms | Resposta imediata, sem ressalto percetível |
| Press de botão (`scale(.97)` na ida) | 80 ms `--ease-out` | A ida é seca; só o regresso é mola |
| Regresso do press | `--ease-press` / 260 ms | Devolve a sensação de material |
| Menu, popover, dropdown, expandir cartão | `--ease-quick` / 325 ms | O ressalto mínimo dá vida sem distrair |
| Sheet, gaveta, painel lateral | `--ease-sheet` / 345 ms | O valor que a Apple usa em gavetas |
| Morphing de botão para menu | `--ease-snappy` / 540 ms | É o movimento que se quer notar |
| Reordenar linhas, largar um item arrastado | `--ease-reposition` / 475 ms | Sem ressalto — objetos pesados não saltam |
| Transição entre vistas | `--ease-nav` / 515 ms | |
| Confirmação de sucesso (visto que aparece) | `--ease-bouncy` / 555 ms | O único sítio onde 0.3 de bounce se justifica |
| Fade de opacidade puro, barras de progresso | `--ease-out` | Molas em opacidade não fazem sentido |
| Saídas de qualquer overlay | 120 ms `--ease-in` | A saída é ~60% da entrada e nunca tem ressalto |

**Regras absolutas de movimento:**

- Anima só `transform`, `opacity`, `filter` e `backdrop-filter`. **Nunca** `width`, `height`, `top`, `left`, `margin` ou `padding`. Para mudanças de tamanho usa `grid-template-rows: 0fr → 1fr` ou FLIP.
- **Não animes interações de alta frequência.** Ordenar uma coluna, mudar de página, alternar um filtro — cinquenta vezes por dia, sem transição nenhuma. **[APPLE]**
- Reversibilidade direcional: o que entra a deslizar de cima sai para cima.
- Ressalto (`bounce > 0`) nunca em elementos grandes. Uma sheet de 600 px que salta parece um erro; um botão de 40 px que salta parece vivo.
- **Nunca** dois elementos a animar com durações diferentes na mesma transição, exceto em entrada escalonada deliberada (máximo 3 elementos, 40 ms de intervalo).

### 2.5 Interruptibilidade e transferência de velocidade

Esta é a diferença entre uma animação e uma interface fluida. **[APPLE]**

- Nenhuma animação bloqueia um novo input. Se a Catarina clicar noutro sítio a meio de uma transição, a transição cede.
- **Transições CSS não aceitam velocidade inicial.** Para qualquer coisa conduzida por gesto ou arrasto — redimensionar a sidebar, arrastar uma sheet, reordenar linhas — usa a Web Animations API com `composite: 'accumulate'`, ou um integrador de mola em `requestAnimationFrame` que aceita `v₀`. Está no Anexo A.
- **Histerese de ~10 px** antes de comprometer a direção de um gesto. **[APPLE]**
- Deteção por aceleração, não por temporizador: quando o cursor para a meio de um arrasto, há um pico de desaceleração — reage a isso, não a um `setTimeout`. **[APPLE]**

### 2.6 Projeção — o que faz o snap parecer que adivinha

Quando o utilizador larga um arrasto, não animes para a posição atual: anima para onde o movimento **iria parar**, e faz snap ao alvo mais próximo dessa projeção. É isto que faz o carrossel da Apple parecer telepático. **[EI, verificado contra o UIScrollView]**

```js
// taxa de desaceleração por milissegundo: 0.998 normal, 0.99 rápida
const DECELERATION = 0.998;
function project(velocity /* px/ms */, rate = DECELERATION) {
  return (velocity * rate) / (1 - rate);   // deslocamento adicional em px
}
// alvo = posicaoAtual + project(velocidade)
// depois: escolher o detent/página/linha mais próximo desse alvo
```

### 2.7 Rubber banding

Resistência elástica quando se puxa além do limite. Fórmula do UIScrollView: **[EI]**

```js
const RUBBER_C = 0.55;
function rubberBand(distance, dimension, c = RUBBER_C) {
  return (1 - (1 / ((distance * c / dimension) + 1))) * dimension;
}
```

`distance` é o quanto se puxou além do limite; `dimension` é a altura ou largura do contentor. A função tem assíntota — nunca se consegue puxar além da dimensão do contentor. Ao largar, volta a zero com `--ease-reposition`.

Aplica isto ao redimensionamento da sidebar (resistência nos limites de 220 e 320 px) e ao arrasto de sheets. Não apliques ao scroll normal da página — o browser já tem o seu.

### 2.8 Estados de pressão

- Destaca **imediatamente** no `pointerdown`; confirma **só** no `pointerup` dentro do alvo. **[APPLE]**
- **Cancela o destaque se o cursor sair** da área, e volta a destacar se regressar. **[APPLE]**
- Escala de pressão: `scale(0.97)` — subtil. 80 ms na ida com `--ease-out`, regresso com `--ease-press`. **[EI]**
- Dentro de contentores com scroll, atrasa o destaque **~150 ms**: se o ponteiro se mover mais de 10 px nesse intervalo, é scroll e o destaque nunca acende. É este atraso que impede as linhas de piscar durante o scroll. **[APPLE: `delaysContentTouches`]**
- `touch-action: manipulation` e `-webkit-tap-highlight-color: transparent` em tudo o que é clicável.

### 2.9 Reduce Motion — o mapeamento correto

Não basta desligar as animações. A Apple define substituições concretas: **[APPLE]**

- Substitui transições de posição (x, y, z) por **fades**.
- Reduz zoom, escala e movimento periférico.
- **Aperta as molas** — passa tudo a `ζ = 1`, sem ressalto.
- Evita animar `blur` e profundidade.
- No Liquid Glass, reduz a intensidade dos efeitos e **desliga as propriedades elásticas** do material.

```css
@media (prefers-reduced-motion: reduce) {
  :root {
    --duration-interactive: 1ms; --duration-quick: 1ms; --duration-sheet: 1ms;
    --duration-snappy: 1ms; --duration-bouncy: 1ms; --duration-nav: 1ms;
    --ease-snappy: var(--ease-out); --ease-bouncy: var(--ease-out);
    --ease-sheet: var(--ease-out); --ease-quick: var(--ease-out);
  }
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; scroll-behavior: auto !important; }
  /* sheets e popovers passam a fade puro, sem deslocação */
  .sheet, .popover { transform: none !important; }
}
```

---

## PARTE 3 — LIQUID GLASS, A SÉRIO

### 3.1 O que o material realmente é

Liquid Glass **dobra** a luz, não a dispersa. A diferença face aos materiais anteriores (que desfocavam) é essa: há lensing, ou seja, refração. **[APPLE]**

São várias camadas independentes, todas simultâneas: **[APPLE]**

1. **Lente / refração** — distorce o que está por baixo, sobretudo nas bordas.
2. **Brilho especular** — o material vive num ambiente com fontes de luz simuladas; os realces respondem à geometria do elemento e deslocam-se ao longo da silhueta quando a luz muda.
3. **Tint** — cor opcional, com mapeamento tonal dinâmico.
4. **Sombra adaptativa** — o elemento sabe o que tem por trás. **Aumenta a opacidade da sombra sobre texto** e **baixa-a sobre fundos claros e sólidos**. À medida que o texto passa por baixo, a sombra torna-se mais proeminente.
5. **Dynamic range** — ajusta a luminosidade do que está por baixo.

Três comportamentos que quase ninguém replica e que valem a pena: **[APPLE]**

- **A escala altera a física.** Elementos maiores simulam material mais espesso: sombras mais profundas, lensing mais pronunciado, dispersão mais suave. Quando um botão de toolbar se expande num menu, o material engrossa.
- **Elementos pequenos fazem flip claro/escuro** consoante o fundo; **elementos grandes adaptam-se mas não fazem flip** — a Apple diz explicitamente que a transição seria distrativa numa sidebar ou num menu.
- **Spill.** Em elementos grandes, a luz de conteúdo colorido próximo derrama subtilmente sobre a superfície.

### 3.2 Regular e Clear

**Regular** — todas as adaptações ativas, funciona a qualquer tamanho e sobre qualquer fundo. O conteúdo por cima recebe automaticamente o tratamento claro/escuro. É a variante para **tudo** no back office. **[APPLE]**

**Clear** — sem adaptação, permanentemente mais transparente, **exige camada de escurecimento**. A Apple põe três condições cumulativas para a usar: (1) há conteúdo media-rich por baixo, (2) o escurecimento não prejudica esse conteúdo, (3) o conteúdo por cima é bold e brilhante. **[APPLE]**

No back office da Líquen, **só a galeria de Temas** cumpre as três. Em todo o resto, Regular.

- Escurecimento sob Clear em fundo claro: **35% de opacidade**. Sobre fundo já escuro, dispensa. **[APPLE]**
- **Nunca misturar Regular e Clear** na mesma vista. **[APPLE]**
- **Nunca vidro sobre vidro.** Por cima do vidro usa preenchimentos translúcidos e vibrancy, não outro material. **[APPLE]**

### 3.3 O CSS do material

```css
@layer components {
  .glass {
    background: var(--glass-bg);
    -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    backdrop-filter: blur(var(--glass-blur)) saturate(var(--glass-sat));
    border: 1px solid var(--glass-border);
    box-shadow:
      inset 0 1.5px 0 var(--glass-hi),   /* especular de topo */
      inset 0 -1px 0 var(--glass-lo),    /* devolução de luz na base */
      var(--glass-shadow);
    border-radius: var(--radius-panel);
    color: var(--glass-fg);
  }
  /* A escala altera a física: painéis grandes usam material mais espesso. */
  .glass-lg { --glass-blur: 34px; --glass-shadow: 0 18px 48px rgb(16 28 20 / .22); }
  .glass-sm { --glass-blur: 16px; --glass-shadow: 0 4px 14px rgb(16 28 20 / .12); }
  .glass-clear {
    background: var(--glass-bg-clear);
    -webkit-backdrop-filter: blur(8px) saturate(160%);
    backdrop-filter: blur(8px) saturate(160%);
    border: 1px solid rgb(255 255 255 / .30);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / .55), 0 8px 26px rgb(0 0 0 / .22);
  }
  /* camada de escurecimento obrigatória sob clear em fundo claro */
  .glass-clear-dim::before {
    content: ""; position: absolute; inset: 0; z-index: -1;
    background: rgb(0 0 0 / .35); border-radius: inherit;
  }
  /* Reatividade equivalente a .interactive() */
  .glass-interactive {
    transition: transform var(--duration-press) var(--ease-press),
                background-color var(--duration-interactive) var(--ease-interactive);
  }
  .glass-interactive:active { transform: scale(.97); transition-duration: 80ms; transition-timing-function: var(--ease-out); }
  /* Sombra adaptativa: mais forte quando há conteúdo a passar por baixo */
  .glass[data-scrolled="true"] { --glass-shadow: 0 14px 40px rgb(16 28 20 / .26); }
}
```

O `inset 0 1.5px 0` branco no topo é a linha que faz um painel ler como vidro em vez de película colorida. Sem ela, é fumo.

### 3.4 Scroll edge effect

Quando o conteúdo passa por baixo de uma barra, a barra protege a sua própria legibilidade. Existem dois estilos: **[APPLE]**

- **Soft** — dissolve progressivamente o conteúdo no fundo, com fade e blur. É o default e serve para a maioria dos casos.
- **Hard** — limite mais opaco e definido, aplicado uniformemente por toda a altura da barra. Para texto interativo, controlos sem fundo, cabeçalhos fixos e interfaces densas. A Apple deu o Calendário como exemplo, e é a variante associada ao Mac.

**No back office usa `hard` na barra de topo** (tem cabeçalhos de tabela fixos por baixo) e `soft` no resto.

Quando conteúdo escuro passa por baixo e o vidro vira escuro, o efeito **troca de dissolução para escurecimento subtil**, para preservar contraste. **[APPLE]**

Regras: **um efeito de bordo por vista**; não empilhar estilos; em split view, os dois painéis usam a mesma altura de efeito. **[APPLE]**

```css
.scroll-edge-soft { -webkit-mask-image: linear-gradient(to bottom,#000 58%,transparent); mask-image: linear-gradient(to bottom,#000 58%,transparent); }
.scroll-edge-hard { -webkit-mask-image: linear-gradient(to bottom,#000 88%,transparent); mask-image: linear-gradient(to bottom,#000 88%,transparent); }
```

### 3.5 Morphing e o contentor de vidro

A Apple é literal: *"À medida que as formas se aproximam umas das outras, os seus contornos começam a fundir-se. Quanto maior o `spacing`, mais cedo a fusão começa."* **[APPLE]**

- `GlassEffectContainer(spacing:)` — o `spacing` é o **limiar de proximidade a que os contornos se fundem**, não espaçamento de layout. Se o spacing do contentor for maior que o gap do stack interior, os vidros fundem-se já em repouso. **[APPLE]**
- Razão técnica: **vidro não pode amostrar outro vidro**. O contentor dá uma região de amostragem partilhada e faz uma única passagem. É por isso que existe. **[APPLE]**
- No AppKit, o `spacing` chama-se literalmente *meld distance*, e o exemplo da sessão de Mac usa `8` com `cornerRadius 12`. **[APPLE]**

**Na web**, a fusão de formas faz-se com o filtro "gooey": desfoca o grupo e aumenta o contraste do canal alfa, o que faz os contornos colarem-se.

```html
<svg width="0" height="0" aria-hidden="true">
  <filter id="meld">
    <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="b"/>
    <feColorMatrix in="b" mode="matrix"
      values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -10" result="m"/>
    <feComposite in="SourceGraphic" in2="m" operator="atop"/>
  </filter>
</svg>
```

```css
.glass-group { filter: url(#meld); }        /* meld distance ≈ stdDeviation × 2 */
.glass-group > * { background: var(--glass-bg); }  /* filhos opacos ao filtro */
```

Combina com FLIP (Anexo B) para o botão **crescer** até ao menu em vez de o menu aparecer. É este par — fusão + FLIP — que dá o morphing da Apple no browser.

**Onde aplicar no back office:** o botão "Ações" da proposta que se torna o menu; o botão de filtro que se torna o painel de filtros; o botão "+" que se torna o formulário rápido de tarefa.

### 3.6 Tint

Escolher uma cor **gera uma gama de tons mapeada ao brilho do conteúdo por baixo** — imita vidro colorido real, que muda matiz e saturação conforme o fundo sem sair da cor pretendida. **[APPLE]**

Avisos da Apple, textuais: usar tint **apenas** para dar ênfase a elementos e ações primárias; *"quando tudo está tingido, nada se destaca"*; se quiseres cor na aplicação, **põe a cor na camada de conteúdo, não na de navegação**. **[APPLE]**

No back office: exatamente **um** elemento tingido por ecrã — a ação primária. Tudo o resto do vidro é neutro.

```css
.glass-tint {
  background: color-mix(in oklab, var(--accent) 22%, var(--glass-bg));
  box-shadow: inset 0 1.5px 0 rgb(255 255 255 / .5), 0 6px 18px color-mix(in oklab, var(--accent) 45%, transparent);
}
```

### 3.7 Concentricidade — a matemática

Três tipos de forma: **fixa** (raio constante), **cápsula** (raio = 50% da altura) e **concêntrica** (raio = raio do pai − padding). A relação é bidirecional e propaga-se a partir do raio do hardware. **[APPLE]**

```
raio_interior = raio_do_container − distância_entre_os_cantos
se raio_interior < 0  →  raio_interior = 0
```

Exemplo oficialmente coerente: container a 24 pt com 12 pt de padding dá 12 pt de raio interior. **[EI, verificado contra a assinatura da API]**

```css
:root {
  --radius-window: 18px;   /* janela com toolbar: raio maior [APPLE: varia por estilo] */
  --radius-panel:  20px;
  --radius-sheet:  26px;
  --radius-card:   16px;
  --radius-control:10px;
  --radius-badge:   6px;
}
/* helper: um filho concêntrico dentro de um pai com padding p */
.concentric { border-radius: max(0px, calc(var(--parent-radius) - var(--parent-padding))); }
```

**Regra prática:** sempre que aninhares uma superfície dentro de outra, calcula o raio. Uma sheet a 26 px com 8 px de padding tem cartões a 18 px. Um cartão a 16 px com 12 px de padding tem inputs a 4 px — o que provavelmente indica que o padding é demasiado grande; corrige o padding, não o raio.

### 3.8 Custo e limites

- **Máximo 5 superfícies com `backdrop-filter` por ecrã.** Sidebar, barra de topo, uma toolbar, uma sheet, um popover. Tudo o resto é opaco.
- **Um único elemento com filtro por grupo.** Os botões dentro de uma toolbar de vidro são `background: rgb(255 255 255 / .42)` mais especular interior, sem filtro próprio.
- Demasiados contentores de vidro degradam a performance mesmo em nativo. **[APPLE]**
- O fundo da aplicação **não pode ser cinzento liso**: sem nada por baixo, não há vidro, só caixas com blur. Usa um gradiente muito subtil em torno do sálvia.

### 3.9 Refração real (opcional)

O CSS não desloca pixels. Para lensing verdadeiro é preciso um filtro SVG com `feDisplacementMap` usado como `backdrop-filter` — **só funciona em Chromium**. O Safari e o Firefox ignoram-no silenciosamente.

```html
<svg width="0" height="0" aria-hidden="true">
  <filter id="lens" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.008 0.014" numOctaves="2" seed="12" result="n"/>
    <feGaussianBlur in="n" stdDeviation="1.6" result="ns"/>
    <feDisplacementMap in="SourceGraphic" in2="ns" scale="26" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>
```

```css
@supports (backdrop-filter: url(#lens)) {
  .glass-lens { backdrop-filter: url(#lens) blur(10px) saturate(180%); }
}
```

Usa em dois ou três elementos, no máximo, sempre atrás do `@supports`, e nunca em nada que carregue texto essencial.

### 3.10 A armadilha do Safari 26

O Safari deixou de ler `theme-color` e passou a **amostrar o CSS dos elementos fixos junto às bordas do viewport** para tingir a sua própria barra. Um header glassmórfico normal parte isto e aparecem barras brancas.

- `viewport-fit=cover` no meta viewport.
- `background-color` explícito em `html` e `body`.
- O elemento `position: fixed` fica **transparente**; o vidro vai num filho `position: absolute; inset: 0`.
- Overlays escondidos usam `display: none`, nunca `opacity: 0` — a opacidade zero continua a influenciar a tintagem.

---

## PARTE 4 — A SHELL DE DESKTOP

O objetivo desta parte é que o back office, num monitor, se leia como uma aplicação de Mac e não como um site.

### 4.1 Anatomia da janela

```
┌──────────────────────────────────────────────────────────┐  raio 18px
│  toolbar de vidro · 52px                                 │  ← camada funcional
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  sidebar   │   conteúdo                    │ inspector   │
│  de vidro  │   (superfícies opacas)        │ (opcional)  │
│  260px     │                               │ 300px       │
│  flutuante │                               │             │
│            │                                             │
└────────────┴─────────────────────────────────────────────┘
```

**O que mudou no macOS Tahoe 26 e que deves replicar:** **[APPLE]**

- A **sidebar passou a painel de vidro flutuante por cima do conteúdo**, em vez de material de bordo a bordo. O conteúdo estende-se por baixo dela.
- O **fundo do conteúdo continua por baixo da sidebar** através de uma réplica espelhada e desfocada — o *background extension effect*. Não é o conteúdo real a fazer scroll por baixo; é um espelho desfocado.
- Os **itens de toolbar flutuam sobre vidro** e o sistema **agrupa automaticamente vários botões num único elemento de vidro**. Controlos de tipos diferentes ficam em elementos separados.
- O **raio dos cantos da janela varia por estilo**: janelas **com toolbar** têm raio **maior** (para envolver concentricamente a toolbar de vidro); janelas **só com barra de título** têm raio **menor**, envolvendo compactamente os controlos. A Apple não publica os números.
- Novo tamanho de controlo **extra-large**; mini, small e medium ficaram ligeiramente mais altos. Formas: **mini a medium são retângulos arredondados**, **large e extra-large são cápsulas**.
- A **barra de menus e os menus de contexto ganharam ícones** em larga escala, formando uma coluna única e escaneável por secção.

Tradução para a web:

```css
:root {
  --shell-radius: 18px;          /* janela com toolbar */
  --toolbar-h: 52px;             /* toolbar unificada [EI: ~52pt no macOS] */
  --toolbar-h-compact: 38px;
  --titlebar-h: 28px;            /* [EI] */
  --sidebar-w: 260px;            /* redimensionável 220–320, persistida */
  --inspector-w: 300px;          /* 260–320 */
  --menubar-h: 24px;             /* [EI: Big Sur+] */
}
```

**Background extension effect na web:** duplica o primeiro ecrã do conteúdo num pseudo-elemento por baixo da sidebar, espelhado e desfocado.

```css
.content-extension {
  position: absolute; inset-inline-start: 0; inset-block: 0; width: var(--sidebar-w);
  transform: scaleX(-1); filter: blur(28px) saturate(120%); opacity: .9;
  pointer-events: none; z-index: 0;
}
```

### 4.2 Materiais do macOS, mapeados

O AppKit tem materiais semânticos com significado, não com aparência. **[APPLE]** A regra é escolher pelo significado, nunca pela cor que produz.

| Material AppKit | Uso | Equivalente CSS |
|---|---|---|
| `.sidebar` | Fundo de sidebars | `rgb(246 246 246 / .72)` + `blur(30px)` — no nosso caso, `.glass` |
| `.titlebar` | Barra de título | `.glass` com `scroll-edge-hard` |
| `.menu` | Menus | `rgb(246 246 246 / .8)` + `blur(30px)` + borda de 0.5px |
| `.popover` | Popovers | idem `.menu` |
| `.sheet` | Sheets | `.glass-lg` |
| `.headerView` | Cabeçalhos in-line | `--bg-subtle` opaco |
| `.contentBackground` | Fundo de conteúdo opaco | `--bg-surface` |
| `.windowBackground` | Fundo de janela | `--bg-base` |
| `.selection` | Seleção | `--sel` / `--sel-unemph` |
| `.hudWindow` | HUD escuro | `rgb(30 30 30 / .75)` + `blur(30px)` |

Os dois modos de mistura: `behindWindow` mistura com o que está atrás da janela (desktop) e **não é replicável no browser** — não há acesso ao desktop; `withinWindow` mistura só com o conteúdo dentro da janela e é exatamente o que o `backdrop-filter` faz. **[APPLE]**

### 4.3 Cores de rótulo por alfa

O macOS não define cores de texto sólidas: define **níveis de opacidade sobre a cor de fundo**. É por isso que o texto do macOS assenta em qualquer material. Valores medidos: **[EI, dump de NSColor]**

| Nível | Claro | Escuro |
|---|---|---|
| `labelColor` | preto a **84.7%** | branco a **84.7%** |
| `secondaryLabelColor` | preto a **49.8%** | branco a **54.9%** |
| `tertiaryLabelColor` | preto a **25.9%** | branco a **24.7%** |
| `quaternaryLabelColor` | preto a **9.8%** | branco a **9.8%** |
| `separatorColor` | preto a **9.8%** | branco a **9.8%** |

**Decisão para o back office:** usa o modelo de alfa para **separadores, preenchimentos e estados**, mas usa **cores sólidas verificadas para texto**. Motivo: um `secondaryLabel` a 49.8% de preto sobre branco dá ~4.3:1, abaixo do mínimo da Apple de 4.5:1 para texto pequeno. O macOS safa-se porque tem subpixel rendering e uma fonte desenhada para isso; o browser não. Os tokens da Parte 5 já respeitam isto.

O nível terciário a 25.9% **nunca** carrega informação — é decoração ou estado desativado.

### 4.4 Densidade

O macOS tem duas densidades reais e o utilizador escolhe. Replica isso: um seletor em Definições → Aparência, persistido, com `data-density` na raiz.

| | Confortável (default) | Compacta (fiel ao macOS) |
|---|---|---|
| Corpo | 15px / 22px | **13px / 16px** **[APPLE]** |
| Linha de tabela | 40px | **28px** |
| Linha de sidebar | 36px | **28px** |
| Altura de botão | 32px | **24px** |
| Altura de input | 34px | **26px** |
| Padding de célula | 12px | 8px |

A densidade compacta é o que faz uma aplicação parecer profissional a alguém que passa o dia nela; a confortável é o que a torna utilizável para quem não passa. Dá as duas e deixa a Catarina escolher.

### 4.5 Tamanhos de controlo

O AppKit tem cinco: mini, small, regular, large, extra-large. **[APPLE]** As alturas não são publicadas; os valores clássicos medidos são: botão 14 / 17 / 21 / 28 pt; campo de texto 16 / 19 / 22 / 28 pt; pop-up 15 / 17 / 20 / 28 pt; checkbox 10 / 12 / 14 / 16 pt. **[EI]**

Regras de forma do Tahoe: **mini a medium são retângulos arredondados; large e extra-large são cápsulas**. **[APPLE]** Isto tem uma consequência prática direta: no back office, os controlos de linha e de formulário são **retângulos arredondados a 6–10 px**, e só as ações principais e os chips de filtro são **cápsulas**. Cápsulas em tudo é linguagem de telemóvel, não de Mac.

---

## PARTE 5 — COR

### 5.1 Escala da marca

```css
@theme {
  --color-sage-50:  #F5FAF6;
  --color-sage-100: #E9F2EB;
  --color-sage-200: #D0E1D4;
  --color-sage-300: #ABC4B1;
  --color-sage-400: #7EA086;
  --color-sage-500: #5F7C66;  /* marca — nunca texto sobre branco (4.6:1) */
  --color-sage-600: #4C6752;  /* acento — 6.2:1 sobre branco */
  --color-sage-700: #39513F;
  --color-sage-800: #2A3C2F;
  --color-sage-900: #161D18;
}
```

### 5.2 Tokens semânticos, com contraste medido

Todos os rácios abaixo foram calculados sobre o fundo indicado, em sRGB, pela fórmula da WCAG 2.1. O mínimo da Apple é **4.5:1** até 17 px e **3:1** a partir de 18 px ou bold — o mesmo que AA. **[APPLE]**

| Token | Claro | Sobre branco | Escuro | Sobre `#171B17` |
|---|---|---|---|---|
| `--fg-primary` | `#1E241E` | **15.8:1** | `#F1F5F1` | **16.4:1** |
| `--fg-secondary` | `#596959` | **5.9:1** | `#ACB9AC` | **8.5:1** |
| `--fg-tertiary` | `#6B766C` | **4.7:1** | `#8A968A` | **5.7:1** |
| `--accent` | `#4C6752` | **6.2:1** | `#ABC4B1` | **9.3:1** |
| `--success` | `#2F6D4F` | **6.1:1** | `#7FC7A0` | **8.8:1** |
| `--warning` | `#8A5A12` | **5.9:1** | `#E8B45C` | **9.2:1** |
| `--danger` | `#B23B2E` | **5.9:1** | `#F4A79D` | **9.0:1** |
| `--info` | `#2C5F86` | **6.8:1** | `#8FC0E6` | **9.0:1** |

Branco sobre `#4C6752` dá **6.2:1**; sobre `#5F7C66` dá 4.6:1. O botão primário usa o 600.

```css
:root {
  --bg-base:#F7F8F7; --bg-surface:#FFFFFF; --bg-elevated:#FFFFFF;
  --bg-elevated-2:#FFFFFF; --bg-subtle:#EEF1EE;
  --fg-primary:#1E241E; --fg-secondary:#596959; --fg-tertiary:#6B766C;
  --fg-placeholder:#8A968A; --fg-quaternary:rgb(30 36 30 / .098);
  --border:rgb(30 36 30 / .098); --border-strong:#C3CCC3;
  --accent:#4C6752; --accent-hover:#39513F; --accent-subtle:#E9F2EB;
  --sel:#4C6752; --sel-fg:#FFFFFF; --sel-unemph:#E4E9E3; --sel-unemph-fg:#1E241E;
  --focus-ring:rgb(76 103 82 / .45);
  --success:#2F6D4F; --warning:#8A5A12; --danger:#B23B2E; --info:#2C5F86;
  --row-alt:#F4F5F4;
  --glass-bg:rgb(255 255 255 / .55); --glass-bg-clear:rgb(255 255 255 / .10);
  --glass-border:rgb(255 255 255 / .62); --glass-hi:rgb(255 255 255 / .92);
  --glass-lo:rgb(255 255 255 / .16); --glass-shadow:0 10px 34px rgb(16 28 20 / .17);
  --glass-fg:#1E241E; --glass-blur:24px; --glass-sat:180%;
  --shadow-raised:0 1px 2px rgb(16 28 20 / .06),0 1px 3px rgb(16 28 20 / .04);
  --shadow-overlay:0 10px 30px rgb(16 28 20 / .16);
}
.dark {
  --bg-base:#101310; --bg-surface:#171B17; --bg-elevated:#1E241E;
  --bg-elevated-2:#262D26; --bg-subtle:#1E241E;
  --fg-primary:#F1F5F1; --fg-secondary:#ACB9AC; --fg-tertiary:#8A968A;
  --fg-placeholder:#6B776B; --fg-quaternary:rgb(241 245 241 / .098);
  --border:rgb(241 245 241 / .098); --border-strong:#3A433A;
  --accent:#ABC4B1; --accent-hover:#D0E1D4; --accent-subtle:#2A3C2F;
  --sel:#3E5546; --sel-fg:#F1F5F1; --sel-unemph:#252C26; --sel-unemph-fg:#ACB9AC;
  --focus-ring:rgb(126 160 134 / .55);
  --success:#7FC7A0; --warning:#E8B45C; --danger:#F4A79D; --info:#8FC0E6;
  --row-alt:rgb(255 255 255 / .028);
  --glass-bg:rgb(26 34 28 / .52); --glass-bg-clear:rgb(20 28 22 / .16);
  --glass-border:rgb(255 255 255 / .16); --glass-hi:rgb(255 255 255 / .30);
  --glass-lo:rgb(255 255 255 / .06); --glass-shadow:0 12px 38px rgb(0 0 0 / .55);
  --glass-fg:#EDF3ED;
  --shadow-raised:0 1px 2px rgb(0 0 0 / .34);
  --shadow-overlay:0 12px 32px rgb(0 0 0 / .45);
}
```

### 5.3 Regras

- A mesma cor nunca significa duas coisas. **[APPLE]**
- **Nunca comuniques informação só por cor.** Todo o badge é cor + ícone + palavra. **[APPLE]**
- Modo escuro **não é inversão** — alguns valores invertem, outros não. Em claro a elevação faz-se por **sombra**; em escuro por **luminosidade**. Daí os quatro níveis de `--bg-*`. **[APPLE]**
- Suporta três estados de aparência: Automático (segue o sistema, é o default), Claro, Escuro. A Apple desaconselha uma preferência exclusiva da app; três estados com Automático por omissão é o compromisso correto. **[APPLE]**
- Cor no vidro só na ação primária. Um elemento tingido por ecrã. **[APPLE]**
- Testa a legibilidade nos dois modos **com Increase Contrast e Reduce Transparency ligados, juntos e separados**. Em modo escuro, aumentar o contraste pode ironicamente reduzir a diferença entre texto escuro e fundo escuro. **[APPLE]**

---

## PARTE 6 — TIPOGRAFIA

### 6.1 A escala do macOS, oficial

| Text style | Peso | Tamanho | Leading | Ênfase |
|---|---|---|---|---|
| Large Title | Regular | 26 pt | 32 pt | Bold |
| Title 1 | Regular | 22 pt | 26 pt | Bold |
| Title 2 | Regular | 17 pt | 22 pt | Bold |
| Title 3 | Regular | 15 pt | 20 pt | Semibold |
| Headline | **Bold** | 13 pt | 16 pt | Heavy |
| Body | Regular | 13 pt | 16 pt | Semibold |
| Callout | Regular | 12 pt | 15 pt | Semibold |
| Subheadline | Regular | 11 pt | 14 pt | Semibold |
| Footnote | Regular | 10 pt | 13 pt | Semibold |
| Caption 1 | Regular | 10 pt | 13 pt | Medium |
| Caption 2 | Medium | 10 pt | 13 pt | Semibold |

**[APPLE]** Nota: o leading é absoluto, não um rácio. Nunca uses `line-height` unitless nesta escala.

### 6.2 Tracking oficial da San Francisco

Em 1/1000 em, convertido para pt: 10 pt → **+0.12** · 11 pt → **+0.06** · 12 pt → **0** · 13 pt → **−0.08** · 15 pt → **−0.23** · 17 pt → **−0.43** · 22 pt → **−0.26** · 26 pt → **+0.22**. **[APPLE]**

A regra por trás: **abre a letra abaixo de 12, fecha entre 13 e 23, reabre acima de 24.** É isto que faz um título grande parecer desenhado em vez de esticado, e é o detalhe tipográfico que quase ninguém copia.

### 6.3 A escala do back office

Densidade confortável (default), com o tracking convertido para `em`:

```css
@theme {
  --text-caption2: 0.6875rem; --text-caption2--line-height: 1rem;
  --text-caption2--letter-spacing: 0.006em;
  --text-caption:  0.75rem;   --text-caption--line-height: 1.125rem;
  --text-caption--letter-spacing: 0em;
  --text-footnote: 0.8125rem; --text-footnote--line-height: 1.25rem;
  --text-footnote--letter-spacing: -0.006em;
  --text-callout:  0.875rem;  --text-callout--line-height: 1.375rem;
  --text-callout--letter-spacing: -0.011em;
  --text-body:     0.9375rem; --text-body--line-height: 1.5rem;
  --text-body--letter-spacing: -0.016em;
  --text-headline: 0.9375rem; --text-headline--line-height: 1.375rem;
  --text-headline--font-weight: 600;
  --text-title3:   1.0625rem; --text-title3--line-height: 1.5rem;
  --text-title3--letter-spacing: -0.025em;
  --text-title2:   1.25rem;   --text-title2--line-height: 1.625rem;
  --text-title2--letter-spacing: -0.022em;
  --text-title1:   1.5rem;    --text-title1--line-height: 1.875rem;
  --text-title1--letter-spacing: 0.003em;
  --text-display:  1.875rem;  --text-display--line-height: 2.25rem;
  --text-display--letter-spacing: 0.013em;
}
[data-density="compact"] {
  --text-body: 0.8125rem; --text-body--line-height: 1rem;
  --text-callout: 0.75rem; --text-callout--line-height: .9375rem;
}
```

Mapeamento fixo: título de página `title1/600` · secção `title3/600` · nome em lista `headline/600` · corpo e formulários `body/400` · linhas de tabela `callout/400` · rótulo de campo `footnote/600` · metadados `caption/400` · KPI `display/600` com `tabular-nums`.

### 6.4 Regras

- Pesos permitidos: 400, 500, 600, 700. **Nunca 300 ou menos** — a Apple classifica Ultralight, Thin e Light como inacessíveis nos tamanhos de interface. **[APPLE]**
- Minimiza o número de famílias. Uma sans para tudo; mono só para números de referência e código.
- *Leading* solto em texto corrido, apertado em linhas de lista — mas **nunca apertado em blocos de três ou mais linhas**. **[APPLE]**
- Ao aumentar o tipo, prefere **layout empilhado** a truncar; reduz colunas antes de cortar texto. **[APPLE]**
- Texto corrido a ~72 caracteres. Tabelas podem ser largas; prosa não.
- Cabeçalhos de secção em **capitalização normal**, não caixa alta — o sistema novo abandonou a caixa alta. **[APPLE]**
- Tudo em `rem`. Zoom de browser a **200%** sem scroll horizontal nem texto cortado. **[APPLE]**
- `font-variant-numeric: tabular-nums` em toda a coluna de números.

---

## PARTE 7 — LAYOUT E DENSIDADE

### 7.1 Grelha e espaço

Grelha de 4. Valores permitidos: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Nada fora disto.

- 12–16 px de padding em células de tabela · 24 px entre campos · 32 px entre grupos · 48 px entre secções.
- O padding interno de um cartão **nunca excede** o gap entre cartões.
- Espaçamentos de controlo do macOS: ≥ 12 px entre botões (regular), 6 px entre radios empilhados, 8 px entre checkboxes, 10 px entre pop-ups. **[APPLE, HIG arquivada]**
- Propriedades lógicas em todo o lado: `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`. Nunca `left`/`right`.

> **Nesta casa:** a grelha de 4 é sobre **espaço**, não sobre medidas. Já houve
> dois casos em que a altura certa não pertence à lista — a linha de tabela de
> 44 px e o botão grande de 52 px — e nos dois a decisão foi a mesma: a altura
> é múltipla de 4 e é o número que o próprio documento dá ao degrau. A regra
> aplica-se a `gap`, `padding` e `margin`.

### 7.2 Adiar a vista compacta

**Desenha primeiro a vista completa.** Quando o espaço aperta, esconde primeiro as colunas terciárias — nunca a tabela inteira. **[APPLE]**

| Largura | Tabela | Navegação |
|---|---|---|
| ≥ 1440 px | Todas as colunas + inspector | Sidebar 260 px |
| 1280–1439 | Esconde o inspector | Sidebar 260 px |
| 1024–1279 | Esconde colunas terciárias (notas, responsável) | Sidebar 220 px |
| 768–1023 | Colunas essenciais | Sidebar em ícones (56 px) |
| < 768 px | Cartões empilhados | Barra inferior |

Conteúdo principal com `min-width: 960px` e `max-width: 1440px`; abaixo de 960 px a sidebar colapsa. **[EI, convenção macOS]**

> **Nesta casa a navegação já não é uma coluna.** Posta a escolha, a dona
> respondeu «a barra substitui o menu»: os onze destinos vivem na cápsula de
> vidro que flutua em baixo, nas duas larguras, e a antiga coluna passou a
> gaveta com o logótipo, a conta, a ajuda e as quatro acções. A tabela desta
> secção lê-se, portanto, só na coluna «Tabela».

### 7.3 Métricas de lista do macOS

O `NSTableView` tem `rowHeight` de **17 pt** por omissão e `intercellSpacing` de **(3, 2)**; o `NSOutlineView` indenta **16 pt por nível**. **[APPLE, headers do SDK]** As alturas de source list medidas são ~24 / 28 / 32 pt para small / medium / large. **[EI]**

Tradução: linhas de tabela a 40 px (confortável) ou 28 px (compacta); sidebar a 36 / 28 px; **indentação de hierarquia exatamente 16 px por nível**; separadores a 1 px com a cor de alfa a 9.8%.

---

## PARTE 8 — ÍCONES E SÍMBOLOS ANIMADOS

### 8.1 O sistema de ícones

Os SF Symbols existem em **9 pesos** e **3 escalas**, definidas em relação à altura da maiúscula da fonte. **[APPLE]** É por isso que assentam sempre com o texto. Não os podes usar na web, mas reproduzes o princípio: **o peso do ícone acompanha o peso do texto ao lado**. **[APPLE]**

| Contexto | Tamanho | `stroke-width` | Cor |
|---|---|---|---|
| Inline no texto, badges | 16 px | 2 | `currentColor` |
| Botões, campos, linhas, sidebar | 20 px | 1.5 | `--fg-secondary` |
| Cabeçalhos, ações principais | 24 px | 1.5 | `--fg-primary` |
| Estados vazios | 40–48 px | 1.25 | `--fg-tertiary` |

- **Uma biblioteca só.** Lucide. Misturar bibliotecas é o erro mais visível de todos.
- **Alinhamento óptico:** padding no próprio asset para que centrar geometricamente resulte em centragem óptica; ícones assimétricos (play, upload, filtro) corrigem-se com 0.5–1 px de translação **dentro do SVG**, nunca com margens em CSS. **[APPLE]**
- Consistência de peso, detalhe e perspetiva em todos os ícones. **[APPLE]**
- Variantes com significado, como na Apple: **contorno** é o normal, **preenchido** marca ênfase e seleção, **com barra** marca indisponível, **dentro de círculo** melhora a legibilidade em tamanhos pequenos. **[APPLE]**
- Ícone decorativo com `aria-hidden="true"`; botão só de ícone com `aria-label` em português.

### 8.2 Symbol effects, reproduzidos

A Apple tem uma gramática de animação de ícones. Estes são os efeitos oficiais e a forma de os reproduzir. Todos com `transform-box: fill-box; transform-origin: center`. **[APPLE: os efeitos; a reprodução em CSS é tradução]**

| Efeito Apple | Quando | CSS |
|---|---|---|
| `bounce` | Confirmação discreta, item adicionado | `scale(1) → 1.18 → 1`, 420 ms, `--ease-bouncy` |
| `pulse` | Estado ativo, a processar | `opacity 1 → .45 → 1`, 1.2 s, infinito, `--ease-in-out` |
| `variableColor` | Progresso por camadas (força de sinal, upload) | camadas do SVG com `animation-delay` escalonado de 120 ms |
| `scale` up/down | Estado ligado/desligado persistente | `scale(1.12)` mantido enquanto ativo |
| `replace` | Troca de ícone (play ↔ pause) | o que sai `scale(.6) opacity 0` 120 ms, o que entra `scale(.6)→1 opacity 0→1` 180 ms |
| `replace.magic` | Troca entre ícone e a sua variante barrada | **as camadas comuns não se mexem**; só a barra se desenha, com `stroke-dasharray` + `stroke-dashoffset` |
| `wiggle` | Chamar a atenção sem alarmar | `rotate(-6deg) → 6deg → 0`, 3 ciclos, 500 ms |
| `breathe` | À espera, em curso | `scale(1) → 1.06 → 1`, 2.4 s, infinito |
| `rotate` | A carregar, a sincronizar | `rotate(360deg)`, 1 s, linear, infinito |
| `drawOn` / `drawOff` | Aparecer/desaparecer com desenho do traço | `stroke-dasharray: L; stroke-dashoffset: L → 0`, 420 ms |

**Magic Replace é o efeito com melhor retorno.** No back office aplica-o ao sino de notificações, ao olho de "mostrar/ocultar", e ao ícone de arquivar. O truque é ter os dois ícones no mesmo SVG com as camadas partilhadas idênticas, e animar apenas a barra:

```css
@keyframes draw-slash { from { stroke-dashoffset: var(--len); } to { stroke-dashoffset: 0; } }
.icon .slash { stroke-dasharray: var(--len); stroke-dashoffset: var(--len); }
.icon[data-on="false"] .slash { animation: draw-slash 320ms var(--ease-out) forwards; }
```

**Regra da Apple, que vale integralmente:** aplicar efeitos de símbolo **com parcimónia** e com propósito comunicativo claro. **[APPLE]** No back office: no máximo dois ícones animados visíveis ao mesmo tempo.

---

## PARTE 9 — COMPONENTES

### 9.1 Botões

- Três atributos explícitos: **estilo**, **conteúdo**, **role** (`normal | primary | cancel | destructive`). **[APPLE]**
- **Máximo 1–2 botões proeminentes por vista.** **[APPLE]**
- Distingue a opção preferida por **estilo, nunca por tamanho**; botões do mesmo grupo partilham altura e largura mínima. **[APPLE]**
- O `primary` liga-se ao Enter. **Nunca `primary` numa ação destrutiva.** **[APPLE]**
- Alturas: 24 (compacta) · 32 (small) · **36 (default desktop)** · 44 (large). Alvo efetivo ≥ 40 px em desktop, ≥ 44 px em touch.
- **Forma:** retângulo arredondado a 8 px até ao tamanho médio; **cápsula só em large e extra-large**. **[APPLE, regra do Tahoe]**
- Padding horizontal 12 / 16 / 20 px.
- Rótulos começam por **verbo**: "Adicionar item", "Enviar proposta". Nunca "OK" para ações específicas. **[APPLE]**
- **Reticências finais** quando o botão abre outra vista que pede mais input: "Exportar PDF…", "Mover para…". **[APPLE]**
- Ações lentas: spinner dentro do botão, rótulo muda ("Guardar" → "A guardar…"), ícone escondido, cliques repetidos bloqueados.
- Botões só de ícone levam tooltip **e** `aria-label`. Botões com texto não levam tooltip. **[APPLE]**
- Máximo **um botão de ajuda por vista**, circular, com "?", no canto oposto às confirmações. **[APPLE]**
- Press: `scale(.97)` a 80 ms com `--ease-out`; regresso com `--ease-press`.

### 9.2 Toggles

- **Switch** só em linhas de definições, onde a linha dá o contexto — e aí não repitas o rótulo ao lado. **[APPLE]**
- Trilho 51×31, polegar 27, transição 150–200 ms **[APPLE: dimensões de iOS]**. Em desktop compacto, 38×22 com polegar 18.
- Fora de listas, prefere um **botão com comportamento de toggle** a um switch. **[APPLE]**
- Checkbox 16 px (alvo 40), raio 4, rótulo à direita com gap 8. Três estados: on, off, **mixed** — usa `mixed` no pai quando os filhos divergem. **[APPLE]**
- Hierarquias usam checkboxes, não switches, com **indentação de 24 px por nível**. **[APPLE]**
- Radios em grupos de 2 a 5; acima disso, select. Dispostos na horizontal, mede o rótulo mais longo e aplica esse espaçamento a todos. **[APPLE]**

### 9.3 Sliders

- Trilho preenchido do mínimo até ao polegar. Mínimo à esquerda, máximo à direita, sempre. **[APPLE]**
- **Emparelha sempre com campo numérico + stepper** quando a gama é ampla. **[APPLE]**
- O knob **adota vidro e cresce (`scale(1.28)`) enquanto está a ser arrastado**, e volta ao normal ao largar. É a única exceção à regra de não pôr vidro na camada de conteúdo. **[APPLE]**
- Feedback em tempo real durante o arrasto. Rotula pelo menos mínimo e máximo; não rotules todas as marcas. **[APPLE]**
- O macOS Tahoe acrescentou `neutralValue` — a âncora do preenchimento pode estar em qualquer ponto, não só no mínimo. Útil para desvios face a um valor de referência (margem acima/abaixo do objetivo). **[APPLE]**

### 9.4 Steppers

- O stepper não mostra o valor: fica ao lado do campo que altera, gap ≤ 8 px. **[APPLE]**
- Botões 28×28, alvo 40. `−` desativado no mínimo, `+` no máximo. **[APPLE]**
- `Shift+clique` incrementa 10× o passo; setas ↑/↓ quando o campo tem foco. **[APPLE]**

### 9.5 Segmented controls

- Escolhas relacionadas que afetam a mesma vista: "Semana | Mês | Ano".
- **Máximo 5 segmentos**, todos com largura igual. **[APPLE]**
- **Nunca mistures texto e ícones** no mesmo controlo; nunca mistures segmentos de seleção com segmentos de ação. **[APPLE]**
- Rótulos são substantivos, não verbos. **[APPLE]**
- Altura 28–32 px, raio exterior 8 px, indicador interior 6 px, padding interior 2 px (concentricidade).
- O indicador desliza com `--ease-quick` e `transform: translateX()`, nunca com `left`.

### 9.6 Pickers de data

- Compacto (botão que abre popover) quando o espaço é limitado; inline quando há espaço. **[APPLE]**
- **Minutos com granularidade reduzida:** 5, 10, 15 ou 30 — nunca 0–59. Para casamentos, 15. **[APPLE]**
- Locale `pt-PT`: `DD/MM/AAAA`, relógio de 24 h, **semana a começar à segunda-feira**.
- Nunca mudes de vista para mostrar um picker. **[APPLE]**

### 9.7 Selects e menus de ações

- Select para listas planas mutuamente exclusivas; mostra **sempre** a seleção atual e tem um default sensato. **[APPLE]**
- A pessoa tem de conseguir prever as opções sem abrir. **[APPLE]**
- Menu de ações: mínimo **3 itens** (com 1–2, usa botões diretos). **[APPLE]**
- **Nunca escondas ações primárias num menu.** **[APPLE]**
- Agrupa com separadores, ≤ 10 itens por grupo; submenus com **1 nível e ~5 itens**. **[APPLE]**
- Ações destrutivas a vermelho, no fim, com confirmação em diálogo separado. **[APPLE]**
- Rótulos com verbo, capitalização de título, sem artigos. Reticências quando pede mais input. **[APPLE]**
- Ícones com parcimónia: **dentro de um grupo, ou todos têm ícone ou nenhum tem**. **[APPLE]**
- Item comutável único com rótulo variável ("Mostrar arquivados" / "Ocultar arquivados"), nunca dois itens. **[APPLE]**
- O menu **cresce a partir do botão** (morphing da Parte 3.5), com `--ease-quick`, e `transform-origin` no canto de origem.

> **Nesta casa:** um `<select>` nativo abre o menu do SISTEMA — a lista azul do
> Windows, a do macOS — e essa lista não é estilizável nem se parece com nada
> disto. Qualquer escolha visível ao utilizador usa o `ui/Escolha`, que rende
> um `<select>` real antes da hidratação (funciona sem JavaScript) e passa a
> combobox do APG depois de montar. Um `<select>` cru no back office é dívida a
> migrar, não uma decisão.

### 9.8 Menus de contexto

- Só os comandos mais prováveis; **tudo o que está lá existe também na interface principal**. **[APPLE]**
- **Oculta** itens indisponíveis em vez de os esbater. **[APPLE]**
- 5 a 8 itens, no máximo 3 grupos. **[APPLE]**
- **Nunca mostres atalhos de teclado num menu de contexto.** **[APPLE]**
- Se uma lista o tem, todas as listas equivalentes o têm. **[APPLE]**
- Em área vazia, oferece criar (nova tarefa, novo item). **[APPLE]**

### 9.9 Campos

- **`<label>` sempre visível**, ligado por `htmlFor`. O placeholder **nunca** substitui o rótulo. **[APPLE]**
- O placeholder comunica o **formato**: `nome@dominio.pt`, `912 345 678`, `0,00`. **[APPLE]**
- A largura do campo é uma pista visual. Escala de quatro larguras, repetida: 80 (quantidade) · 128 (valor €) · 240 (data) · 420 (nome, local). **[APPLE]**
- Altura 26 (compacta) / 34 (confortável). `font-size: 16px` em touch — abaixo disso o Safari do iOS faz zoom.
- **Obtém do sistema tudo o que puderes.** Nunca peças o que já está em base de dados. **[APPLE]**
- **Oferece escolha em vez de escrita.** **[APPLE]**
- **Valida dinamicamente**, campo a campo, no `blur` — não só no submit. **[APPLE]**
- **Formatadores em vez de validação** onde der: o campo de euros aceita vírgula ou ponto e formata para `1.234,56 €` ao sair. **[APPLE]**
- Desativa o submit até os obrigatórios estarem preenchidos, com tooltip a dizer o que falta. **[APPLE]**
- Erro: `aria-invalid` + `aria-describedby` + mensagem em texto por baixo. Nunca só cor.
- Suporta colar e arrastar como métodos de entrada. **[APPLE]**
- `resize-y` nas textareas; **nunca `resize: none`**.
- Tooltip de expansão (`title`) quando o texto excede a largura do campo. **[APPLE]**

### 9.10 Tabelas

- `<table>` semântica, `<th scope="col">`, `aria-sort`, `<caption>`. **Nunca uma grelha de `div`.**
- Cabeçalho `sticky`, 36–40 px, substantivos curtos sem dois pontos.
- Clique ordena, segundo clique inverte, seta na coluna ativa, ordenação no URL.
- Colunas redimensionáveis, larguras guardadas, mínimo 96 px.
- **Linhas alternadas quando houver 4+ colunas.** **[APPLE]**
- Texto longo **trunca ao meio**, preservando início e fim. **[APPLE]**
- Números à direita, `tabular-nums`; datas em coluna de largura fixa.
- Seleção múltipla com `Shift+clique` (intervalo) e `Cmd/Ctrl+clique` (adicionar).
- Ações reveladas por hover; máximo 3 por lado; a destrutiva no extremo.
- Chevron à direita navega; ⓘ revela no lugar. Não confundir. **[APPLE]**
- Inserções, remoções e reordenações animadas com `--ease-reposition`. **Nunca `scale` no hover de uma linha** — sobrepõe as vizinhas; só tint de fundo.

---

## PARTE 10 — OVERLAYS

Percorre por ordem; a primeira resposta afirmativa decide.

1. **Crítico, destrutivo, irreversível e inesperado?** → **Alert dialog.**
2. **Tarefa curta com poucos campos?** → **Sheet lateral.**
3. **A proposta completa, multi-passo, com PDF e email?** → **Página dedicada.** Nunca modal. **[APPLE: nada de "app dentro da app"]**
4. **Escolha rápida ancorada a um elemento?** → **Popover.**
5. **Resultado de uma ação já executada?** → **Toast.**
6. **Estado de um campo ou secção?** → **Inline.** **[APPLE: preferir sempre inline]**

**Nunca modal a partir de modal.** Exceção única: confirmação ao fechar uma sheet com alterações por guardar. **[APPLE]**

**Alertas** — só para informação crítica e **acionável**; **máximo 3 botões**; rótulos de 1–2 palavras com verbo; **nunca "Sim"/"Não"**; "Cancelar" escrito exatamente assim; default à direita em linha ou no topo em pilha; estilo destrutivo **só** quando a ação não foi deliberadamente escolhida pela pessoa; havendo destrutiva, inclui "Cancelar" e **nunca** a marques como default; alerta de botão único usa "Concluído". **[APPLE, tudo]** `role="alertdialog"`, focus trap, Esc fecha, foco inicial no botão não destrutivo. Entrada: `scale(.96) → 1` + fade, `--ease-quick`. Saída: fade 120 ms sem escala.

**Sheets** — tarefas curtas; **uma de cada vez**; "Cancelar" à esquerda, "Concluído" à direita, nunca "Concluído" sozinho; arrastar para fechar com alterações por guardar **intercepta**. **[APPLE]** Em desktop: form sheet centrada 540×620 ou painel lateral de 420 px. Raio 26 px, conteúdo concêntrico a 18 px. Entrada com `--ease-sheet`. O conteúdo por trás **recua**: `scale(.985)` e `filter: brightness(.96)` — é a tradução da recessão que o iOS faz ao apresentar uma sheet **[EI: escala ~0.923 e raio 38 pt no iOS]**.

**Popovers** — 1 a 3 tarefas relacionadas; a seta aponta à origem e **não a cobre**; fecho automático **guarda**, descartar só via "Cancelar" explícito; **um de cada vez, nunca em cascata**; nada por cima exceto um alerta; nunca para avisos. **[APPLE]** 240–360 px, raio 16, padding 12. Entrada `scale(.94) → 1` com `transform-origin` na seta, `--ease-quick`.

**Toasts** — 4 s sucesso · 8–10 s com "Anular" · **persistente** em erro com ação. `role="status"` / `role="alert"`. **As pessoas assumem que correu bem — só precisam de saber quando falha.** **[APPLE]**

**Progresso** — determinado sempre que possível; assim que souberes a duração, muda — **mas nunca troques circular por barra**; mantém em movimento; distribui o avanço uniformemente; descrição específica ("A gerar PDF da proposta…", nunca "A carregar…"). **[APPLE]** Barra de 4 px no topo do conteúdo; spinner de 20 px junto ao controlo de origem.

**Limiares:** < 150 ms nada · 150–400 ms nada ou opacidade reduzida · 400–800 ms spinner · > 800 ms skeleton com **geometria real** · > 3 s progresso com fase · > 10 s segundo plano + notificação.

---

## PARTE 11 — ESTADOS POR ECRÃ

| Ecrã | Carregamento | Vazio | Erro |
|---|---|---|---|
| Visão Geral | Skeleton por cartão, cada um resolve sozinho | "Ainda sem dados este mês" + criar pedido | Erro por cartão; os outros continuam |
| Pedidos | 8–10 linhas skeleton; ao filtrar mantém as linhas a 50% com barra fina no topo | Distinguir "ainda não há pedidos" de "nenhum corresponde a estes filtros" + limpar filtros | Bloco na área da tabela, filtros preservados |
| Fazer proposta | Rascunho otimista; PDF e email com estado ocupado e fases | — | **Nunca destrói o rascunho.** PDF gerado e email falhado são dois estados |
| Calendário | Skeleton da grelha; ao mudar de mês, grelha nova já visível | "Sem eventos em março", com a grelha à vista | Banner sobre a grelha, navegação continua |
| Tarefas | Toggle otimista, sem spinner | "Tudo feito" + nova tarefa | Reverte visualmente + toast com Anular |
| Material | Otimista por item; progresso determinado | "Checklist por preencher" | Item volta ao estado anterior, marca na linha |
| Temas | Skeleton com `aspect-ratio` fixo, blur-up | "Sem temas nesta categoria" | Placeholder por imagem, grelha intacta |
| Estatísticas | Skeleton de eixo e área; título e legenda reais desde cedo | "Sem dados para este período" + alargar intervalo | Bloco no lugar do gráfico, filtros intactos |

- Estado vazio diz o passo seguinte e traz botão; **nunca contém informação crítica**. **[APPLE]**
- **Nunca desabilites nem escondas uma vista vazia** — entra-se nela e explica-se porquê. **[APPLE]**
- Skeletons replicam a geometria real. Skeleton com geometria diferente do conteúdo provoca layout shift e lê-se como avaria.
- **Restaura o estado anterior:** filtros, mês, separador, ordenação, scroll e largura da sidebar, guardados nos `searchParams` e em `localStorage`. **[APPLE]**

---

## PARTE 12 — INTERAÇÃO DE DESKTOP

### 12.1 Ponteiro

Esta é a parte que mais distingue uma app de Mac de um site, e a que quase nunca se faz.

- **Cursor semântico, nunca genérico.** `text` em campos e células editáveis · `default` (seta) em **botões** — não `pointer`, que é para links · `pointer` só em links de navegação · `grab`/`grabbing` ao reposicionar · `col-resize` no divisor de colunas e no da sidebar · `not-allowed` em destino de drop inválido · `copy` com Alt premido durante o arrasto · `crosshair` em seleção retangular. **[APPLE]**
- **Hit regions contíguas em barras:** nunca deixes espaço morto entre botões adjacentes de uma toolbar, senão o cursor "pisca" entre estados. **[APPLE]**
- 12 px de folga à volta de elementos com contorno; 24 px à volta de ícones sem contorno. **[APPLE]**
- **Um único efeito de hover por tipo de elemento:** fundo translúcido arredondado em ícones de barra · elevação com sombra em cartões e miniaturas · **tint de fundo em linhas de tabela**. **[APPLE]**
- **Nunca `scale` no hover de uma linha** — sobrepõe as vizinhas. **[APPLE]**
- Anota valores úteis no hover (total, dias até ao evento). **Nunca texto instrucional agarrado ao cursor.** **[APPLE]**
- O hover revela e esconde controlos que se minimizam; ao sair, escondem-se outra vez. **[APPLE]**

```css
.row:hover { background: color-mix(in oklab, var(--accent) 6%, transparent); transition: background var(--duration-interactive) var(--ease-interactive); }
.divider { cursor: col-resize; }
button { cursor: default; }
a { cursor: pointer; }
```

### 12.2 Foco e seleção

- Anel de foco de 2–3 px com `outline-offset: 2px`, adaptado aos cantos arredondados, **nunca cortado por `overflow`**. **Nunca `outline: none` sem substituto.** Usa `box-shadow: 0 0 0 3px var(--focus-ring)` quando o `outline` não seguir o raio.
- **Nunca mudes o foco sem ação da pessoa.** Exceção única: quando o elemento focado desaparece durante navegação por teclado — move para um vizinho a um passo de distância. **[APPLE]**
- **Distingue foco de seleção.** Linha selecionada **e** com foco: fundo `--sel`, texto `--sel-fg`. Linha selecionada **sem** foco no grupo: fundo `--sel-unemph`, texto normal. É um detalhe do macOS que se nota imediatamente quando falta. **[APPLE]**
- **Grupos de foco explícitos**: sidebar · toolbar · tabela · painel de detalhe. **Tab salta entre grupos; as setas navegam dentro do grupo.** **[APPLE]**
- Ao entrar na tabela, foca a primeira linha; ao abrir o detalhe, foca o primeiro campo editável. **[APPLE]**
- **Cinco estados visuais** por elemento interativo: normal, focado, premido, selecionado, indisponível. **[APPLE]**
- Distingue visualmente o painel ativo do inativo, e permite arrastar a partir de um painel inativo **sem o ativar primeiro**. **[APPLE]**

### 12.3 Atalhos

Máximo 8 a 10 personalizados. **Nunca reutilizes um atalho padrão para outra ação.** Ordem dos modificadores: Control, Option, Shift, Command. **[APPLE]**

| Ação | Atalho |
|---|---|
| Pesquisa global | `Cmd/Ctrl+F`, e `/` sem foco em campo |
| Nova proposta | `Cmd/Ctrl+N` |
| Guardar | `Cmd/Ctrl+S` |
| Duplicar proposta | `Shift+Cmd/Ctrl+S` |
| Desfazer / Refazer | `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` |
| Fechar painel, modal ou detalhe | `Esc` |
| Linha seguinte / anterior | `↓` / `↑` |
| Primeira / última linha | `Cmd/Ctrl+↑` / `Cmd/Ctrl+↓` |
| Abrir linha focada | `Enter` |
| Estender seleção | `Shift+↑/↓`, `Shift+clique`, `Cmd/Ctrl+clique` |
| Selecionar todas as linhas | `Cmd/Ctrl+A` |
| Menu de contexto da linha | `Shift+F10` |
| Mostrar/ocultar sidebar | botão de toolbar |
| Exportar PDF | `Cmd/Ctrl+P` |
| Definições | `Cmd/Ctrl+,` |

Nunca captures `Cmd+Q`, `Cmd+W`, `Cmd+T`, `Cmd+N` do browser sem alternativa. `Esc` cancela sempre a camada de topo. Mostra o atalho ao lado do comando nos menus principais, **nunca nos menus de contexto**. **[APPLE]**

### 12.4 Arrastar e largar

- Dentro do mesmo contentor **move**; para contentor diferente **copia**; Alt inverte. **[APPLE]**
- Imagem de arrasto translúcida a partir de ~3 px de deslocação. **[APPLE]**
- Arrasto múltiplo agrupa visualmente com **badge oval do número de itens**, e o número **atualiza-se** se o destino só aceitar um subconjunto. **[APPLE]**
- Sinal de aceitação **só** sobre destino válido — linha de inserção ou realce do contentor; estado "não permitido" quando inválido; feedback removido ao sair. **[APPLE]**
- **Anima o regresso à origem** quando o drop falha, com `--ease-reposition`. **[APPLE]**
- Scroll automático do contentor durante o arrasto; para quando o ponteiro sai. **[APPLE]**
- **Permite desfazer sempre**; se não for possível, pede confirmação antes de concluir. **[APPLE]**
- **Spring loading:** manter o item sobre um separador ou estado durante **~1 s** abre-o. **[APPLE]**
- Ao largar, **mantém a seleção no destino** e retira-a da origem. **[APPLE]**
- Oferece sempre alternativa por menu ou teclado. Arrastar nunca é o único caminho. **[APPLE]**

### 12.5 Desfazer

- **Rotula a ação:** "Anular remoção da linha", não "Anular". **[APPLE]**
- **Mostra o resultado:** se a alteração revertida está fora do ecrã, faz scroll até ela e **destaca-a** — senão parece que nada aconteceu e a pessoa repete. **[APPLE]**
- Várias vezes, sem limite artificial. **[APPLE]**

---

## PARTE 13 — O FORMULÁRIO "FAZER PROPOSTA"

É o ecrã onde se ganha ou perde o dia da Catarina.

**Ordem das secções:** 1) Cliente e pedido de origem, pré-preenchido · 2) Evento: data, hora, local, convidados · 3) Linhas de itens · 4) Descontos, deslocação, condições · 5) Validade, notas, observações internas · 6) Totais e ações.

- **Prefill agressivo:** nome, contacto, data, tema, IVA 23%, validade 30 dias, EUR. Tudo editável.
- Cada linha nova **herda os valores da anterior**.
- Combobox do catálogo com criação livre; presets de pacotes. **Nunca acrescentes automaticamente o valor personalizado à lista.** **[APPLE]**
- Validação no `blur` para email e NIF; **durante a escrita** para valores, quantidades e descontos, porque afetam os totais.
- Totais em rodapé fixo com `aria-live="polite"`.
- **Autosave** com debounce de ~2 s, ao mudar de secção e ao sair. "Guardado às 14:32". O rascunho nasce à primeira alteração. *"As pessoas devem confiar que o trabalho está sempre preservado."* **[APPLE]**
- **Espelho local em IndexedDB.** Ao reabrir: "Recuperámos alterações não guardadas de há 5 minutos — Repor / Descartar."
- `beforeunload` e interceção de navegação **apenas** quando há alterações por guardar.
- Remover linha: toast "Linha removida — Anular" 10 s; ao anular, scroll até à linha e destaque de 1.2 s.
- **Colar do Excel** (colunas separadas por tabulação) e arrastar para reordenar.
- Cada linha é `<tr>` com `<th scope="row">` na descrição; totais em `<tfoot>`.
- `Intl.NumberFormat('pt-PT', { style:'currency', currency:'EUR' })`, `tabular-nums`, alinhado à direita.
- **O erro nunca destrói o rascunho.** PDF gerado e email falhado são dois estados separados.

> **Nesta casa, e é a regra mais cara de todas:** o valor que ela escreve é o
> valor que fica até ela própria o mudar. O preço do PEDIDO é serviços mais
> adicionais; o campo do ESTÚDIO é só serviços. Qualquer travessia entre os dois
> passa pelo par `baseParaOEstudio` / `precoDoPedidoParaBase` — nunca em cru. A
> avaria de escrever um no outro já custou quatro descobertas em produção
> (3.000 → 3.140 → 3.280 → 3.420, uma soma por visita) e está presa por duas
> varreduras: `lib/o-valor-enviado-e-o-valor-que-fica` (as contas) e
> `o-valor-que-ela-poe-e-o-valor-que-fica` (os caminhos).

---

## PARTE 14 — PESQUISA, DEFINIÇÕES, GRÁFICOS

**Pesquisa** — caixa única no topo, `/` ou `Cmd+F` foca; placeholder declara o âmbito; pesquisa enquanto se escreve com debounce 200–300 ms, **nunca obrigues a Enter**; sugestões de pesquisas recentes com **"Limpar histórico"** (histórico visível expõe a pessoa); **âmbito amplo por omissão, que a pessoa estreita**; chips dos filtros ativos + contagem "38 de 214" + "Limpar filtros"; resultado anunciado em `role="status"`; **filtros e ordenação vivem no ecrã que afetam, nunca nas Definições**, e sincronizam com o URL. **[APPLE, tudo]**

**Definições** — só o geral e o raramente alterado; painéis Empresa · Propostas · Catálogo · Equipa · Notificações · Calendário · Aparência (tema, densidade, reduzir animações, contraste); URL por painel, painel ativo indicado, **último painel restaurado**, título da página a refletir o painel; defaults que servem a maioria, de modo a que a app funcione sem ninguém abrir as Definições; **não dupliques definições do sistema**; rótulo prático mais explicação do que acontece quando está ligado — o oposto infere-se. **[APPLE, tudo]**

**Gráficos** — **nem tudo merece gráfico**: valores únicos são KPIs, "top 10 temas" é tabela ordenável; cada gráfico tem **headline com a conclusão** ("Receita 18% acima do mesmo período de 2025") mais subtítulo com período e unidade; tipos comuns (barras, linhas, empilhadas), nada de donuts com muitas fatias nem 3D; simples primeiro, **detalhe a pedido** com drill-down; **consistência absoluta** — a mesma cor para o mesmo estado em todo o back office, e o sparkline da Visão Geral usa tipo, cor e anotações iguais ao gráfico grande (continuidade entre versão pequena e expandida); **nunca só cor** a distinguir séries — rótulo direto na série; tabela equivalente atrás de "Ver dados" e exportação CSV; eixos em `pt-PT` com `tabular-nums`. Gauge para consumo com `role="meter"` e `aria-valuetext`. **[APPLE, tudo]**

---

## PARTE 15 — ESCRITA

Voz ativa · rótulos de botão com **verbo** · **evita "nós"** · erros dizem o que aconteceu **e o que fazer a seguir**, nunca culpam, nunca "oops" · capitalização de frase, cabeçalhos em capitalização normal · fluxos multi-passo "Começar" → "Continuar" → "Concluído", escolhe um e usa sempre esse · possessivos "Favoritos", não "Os meus favoritos" · tooltips descrevem só o controlo, começam por verbo, não repetem o nome, 60–75 caracteres, sem ponto final. **[APPLE, tudo]**

| Evitar | Escrever |
|---|---|
| Estamos com problemas a guardar a proposta. | Não foi possível guardar a proposta. Verifica a ligação e tenta outra vez. |
| Nome inválido. | Usa apenas letras no nome. |
| Essa palavra-passe é curta demais. | Escolhe uma palavra-passe com pelo menos 8 caracteres. |
| Ups! Alguma coisa correu mal. | O envio falhou porque o email do cliente está vazio. |
| Clique aqui para ver os pedidos | Ver todos os pedidos |
| Vamos a isto! | Criar proposta |
| PEDIDOS RECENTES | Pedidos recentes |
| OK / Cancelar | Eliminar proposta / Cancelar |
| Campo obrigatório! | Indica a data do evento. |
| Erro 500 | Não foi possível gerar o PDF. Tenta outra vez dentro de instantes. |
| A carregar… | A gerar o PDF da proposta… |

---

## PARTE 16 — ACESSIBILIDADE

| Definição | Media query | O que muda |
|---|---|---|
| Dynamic Type | zoom do browser | Tudo em `rem`; testar a 200% **[APPLE]** |
| Increase Contrast | `prefers-contrast: more` | Bordas visíveis, texto primário, fora as sombras |
| Reduce Motion | `prefers-reduced-motion` | Substituições da Parte 2.9 |
| Reduce Transparency | `prefers-reduced-transparency` | Vidro passa a superfície opaca |
| Dark Mode | `prefers-color-scheme` | Troca de tokens |

**Lista de verificação — nenhuma fase fecha sem isto:**

- [ ] Contraste ≥ **4.5:1** até 17 px e **3:1** a partir de 18 px ou bold, em claro **e** escuro. **[APPLE]**
- [ ] Nenhuma informação só por cor.
- [ ] Alvos ≥ 40 px em desktop (≥ 44 em touch); ≥ 12 px de folga entre botões com fundo, ≥ 24 px entre ícones sem fundo. **[APPLE]**
- [ ] `<label for>` visível em todos os campos; sumário de erros no topo com links.
- [ ] Modais com `role="dialog" aria-modal="true"`, focus trap, Esc, foco devolvido à origem.
- [ ] Tabela semântica com `<th scope>`, `aria-sort`, `<caption>`.
- [ ] Calendário `role="grid"`, setas navegam, `aria-label` completo por dia.
- [ ] Anel de foco visível nos dois temas; skip link.
- [ ] Erros `role="alert"`, sucessos `role="status"`; erros não se auto-dispensam.
- [ ] Confirmação com o nome do item na frase.
- [ ] `alt` descritivo em todas as fotografias de temas.
- [ ] Navegação completa só com teclado, de ponta a ponta.
- [ ] Zoom a 200% sem scroll horizontal.
- [ ] Nenhum elemento animado sobrevive a `prefers-reduced-motion`.

**Privacidade:** dados de noivos são dados pessoais; pede só o necessário; permissões do browser **no momento de uso**, nunca no arranque, precedidas de um ecrã com **um único botão "Continuar"** — nunca "Permitir", nunca com incentivo; a frase que explica é completa, ativa e específica; nunca nomes de clientes em query strings partilháveis. **[APPLE]**

---

## PARTE 17 — ORDEM DE EXECUÇÃO

| # | Fase | Entrega |
|---|---|---|
| 00 | **Bug dos valores** | Corrigir o bug das propostas que crescem sozinhas ao reabrir. Redesenhar por cima de um bug de dados só o torna mais bonito. |
| 01 | **Tokens** | Cor, tipografia, espaço, forma, **e as onze molas da Parte 2.3**. Nada muda visualmente ainda. |
| 02 | **Tipografia e densidade** | Escala aplicada, seletor Confortável/Compacta, caixa alta removida dos cabeçalhos. Melhor relação esforço/resultado. |
| 03 | **Cor e modo escuro** | Todos os literais substituídos por tokens; badges com cor + ícone + palavra; base/elevated. |
| 04 | **Shell de desktop** | Janela, toolbar de 52 px, navegação de vidro, background extension, inspector, raios concêntricos. |
| 05 | **Material** | `.glass` e variantes, scroll edge hard na barra de topo, padrão do Safari 26, limite de 5 superfícies. |
| 06 | **Movimento base** | As molas aplicadas a hover, foco, press, menus, sheets. `prefers-reduced-motion` no mesmo commit. |
| 07 | **Ponteiro e foco** | Cursores semânticos, hover por tipo, grupos de foco, foco vs. seleção, cinco estados. |
| 08 | **Componentes** | Botões, toggles, sliders, steppers, segmented, selects, menus — com as formas do Tahoe (retângulo até medium, cápsula em large). |
| 09 | **Tabelas e listas** | Semântica, sticky, ordenação no URL, truncatura ao meio, linhas alternadas, seleção múltipla. |
| 10 | **Estados** | Skeletons com geometria real, vazios com ação, limiares, restauro de estado. |
| 11 | **Morphing** | Filtro de fusão + FLIP no botão de ações, no filtro e no "+". |
| 12 | **Formulário de propostas** | Parte 13 inteira. |
| 13 | **Símbolos animados** | Magic Replace no sino, no olho e no arquivar; `rotate` na sincronização; `bounce` na confirmação. |
| 14 | **Teclado e arrasto** | Atalhos, seleção de linhas, drag & drop com projeção e spring loading. |
| 15 | **Escrita** | Todo o microcopy pela Parte 15. |
| 16 | **Acessibilidade** | A lista da Parte 16, ponto por ponto. |

**Critérios de aceitação — verifica no fim de cada fase:**

1. O build passa; testes Playwright verdes.
2. `grep -rn "#[0-9a-fA-F]\{3,6\}"` nos componentes devolve zero. O mesmo para `cubic-bezier`, `ms)` e `px` fora dos tokens.
3. Máximo 5 elementos com `backdrop-filter` por ecrã.
4. Zoom a 200% sem scroll horizontal em Visão Geral, Pedidos e Fazer proposta.
5. Percurso completo só com teclado: entrar, pesquisar, abrir um pedido, criar proposta, guardar, sair.
6. Com `prefers-reduced-motion`, `prefers-reduced-transparency` e `prefers-contrast: more` ativos, tudo continua legível e utilizável.
7. Lighthouse de acessibilidade ≥ 95 nas três páginas principais.
8. Nenhuma animação bloqueia um clique. Testa clicando duas vezes depressa em tudo.

---

## PARTE 18 — PROIBIÇÕES

Se aparecer no código, reverte.

Vidro em cartões, linhas, formulários ou fundo de página · `backdrop-filter` aninhado · mais de 5 superfícies com filtro · Regular e Clear na mesma vista · vidro `clear` sem camada de escurecimento sobre fundo claro · mais de um elemento tingido por ecrã · pesos de fonte ≤ 300 · caixa alta em cabeçalhos · cor como único portador de informação · `#5F7C66` como texto sobre branco · valores fora da grelha de 4 · `cubic-bezier` escrita à mão · animação em interações de alta frequência · animar `width`, `height`, `top`, `left` · ressalto em elementos grandes · `scale` no hover de linhas · `cursor: pointer` em botões · espaço morto entre botões de toolbar · modal a partir de modal · a proposta completa num modal · mais de 5 tabs, mais de 3 botões num alerta, mais de 5 segmentos · "Sim"/"Não" ou "OK"/"Cancelar" em ações específicas · botão destrutivo como default do Enter · toast de erro que se auto-dispensa · placeholder a fazer de rótulo · `outline: none` sem substituto · `resize: none` · `tabIndex` positivo · atalhos de teclado em menus de contexto · filtros ou ordenações nas Definições · grelha de `div` a fingir de tabela · cápsulas em todos os controlos · nome de cliente em query string · spinner onde devia estar skeleton · skeleton com geometria diferente do conteúdo real · transição CSS em algo conduzido por gesto.

---

## ANEXO A — MOLA COM VELOCIDADE INICIAL

Para tudo o que é conduzido por gesto. Uma transição CSS não aceita velocidade inicial; isto aceita.

```ts
type SpringOpts = { duration?: number; bounce?: number; velocity?: number };

export function spring(
  from: number, to: number, onFrame: (v: number) => void,
  { duration = 0.5, bounce = 0, velocity = 0 }: SpringOpts = {}
) {
  const m = 1;
  const k = Math.pow((2 * Math.PI) / duration, 2);
  const c = bounce >= 0
    ? (1 - bounce) * 4 * Math.PI / duration
    : 4 * Math.PI / (duration * (1 + bounce));
  let x = from, v = velocity, raf = 0, last = performance.now();
  const step = (now: number) => {
    const dt = Math.min((now - last) / 1000, 1 / 30); last = now;
    const a = (-k * (x - to) - c * v) / m;
    v += a * dt; x += v * dt;
    onFrame(x);
    if (Math.abs(x - to) < 0.1 && Math.abs(v) < 0.1) { onFrame(to); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
```

Usa `velocity` = a velocidade do ponteiro no `pointerup`, em unidades por segundo. É este handoff que remove o solavanco ao largar.

## ANEXO B — FLIP

Para morphing de layout: um botão que cresce até menu, uma linha que se expande em detalhe.

```ts
export function flip(el: HTMLElement, mutate: () => void, opts = { duration: 325, easing: "var(--ease-quick)" }) {
  const first = el.getBoundingClientRect();
  mutate();
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left, dy = first.top - last.top;
  const sx = first.width / last.width, sy = first.height / last.height;
  el.animate(
    [{ transformOrigin: "top left", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
     { transformOrigin: "top left", transform: "none" }],
    opts
  );
}
```

## ANEXO C — PROJEÇÃO, RUBBER BAND, PRESS COM ATRASO

```ts
export const project = (v: number, rate = 0.998) => (v * rate) / (1 - rate);

export const rubberBand = (d: number, dim: number, c = 0.55) =>
  (1 - 1 / ((d * c) / dim + 1)) * dim;

// destaque atrasado dentro de contentores com scroll — evita linhas a piscar
export function pressable(el: HTMLElement, delay = 150, slop = 10) {
  let t: number | undefined, sx = 0, sy = 0;
  el.addEventListener("pointerdown", e => {
    sx = e.clientX; sy = e.clientY;
    t = window.setTimeout(() => el.classList.add("is-pressed"), delay);
  });
  el.addEventListener("pointermove", e => {
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > slop) {
      clearTimeout(t); el.classList.remove("is-pressed");
    }
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
    el.addEventListener(ev, () => { clearTimeout(t); el.classList.remove("is-pressed"); })
  );
}
```

## ANEXO D — O QUE A APPLE NÃO PUBLICA

Para saberes onde estás em terreno firme e onde estás a interpretar:

- **Não publicado:** durações e curvas de animação do Liquid Glass · opacidades, espessuras e raios do material · o que exatamente faz `.interactive()` em números · durações dos symbol effects · alturas dos controlos modernos do AppKit · raios de canto das janelas do Tahoe · durações das transições de navegação e de sheets do UIKit.
- **Publicado e usado aqui:** as fórmulas de conversão das molas · os parâmetros dos presets `.smooth`, `.snappy`, `.bouncy`, `.default`, `.interactiveSpring` · a escala tipográfica e o tracking do macOS e do iOS · o `rowHeight` de 17 pt e a indentação de 16 pt · os rácios de contraste mínimos · os 35% de escurecimento sob vidro `clear` · os limites de contagem (3 botões num alerta, 5 tabs, 5 segmentos) · toda a doutrina de comportamento, rotulagem, ordem e hierarquia.
- **Engenharia inversa fiável:** os pontos de controlo das curvas do Core Animation · a fórmula do rubber banding · as taxas de deceleração 0.998 / 0.99 · as cores de rótulo por alfa do AppKit · o parallax de 30% no push de navegação.

Quando alguém disser que um número deste documento "não é o que a Apple usa", verifica nesta lista antes de discutir.

---

## FONTES

Human Interface Guidelines — Foundations (Accessibility, App icons, Branding, Color, Dark Mode, Icons, Images, Inclusion, Layout, Materials, Motion, Privacy, Right to left, SF Symbols, Spatial layout, Typography, Writing), Patterns (Charting data, Drag and drop, Entering data, Feedback, File management, Launching, Loading, Modality, Managing notifications, Multitasking, Offering help, Onboarding, Searching, Settings, Undo and redo) e Components (todos), mais Inputs (Focus and selection, Keyboards, Pointing devices).

Documentação — `Adopting Liquid Glass`, `Applying Liquid Glass to custom views`, `GlassEffectContainer`, `Spring`, `Animation`, `SymbolEffect`, `SymbolEffectOptions`, `NSVisualEffectView.Material`, `NSControl.ControlSize`, `UIView.AnimationCurve`, `UIScrollView.delaysContentTouches`.

Sessões WWDC — 2025: *Meet Liquid Glass* (219), *Get to know the new design system* (356), *Build a SwiftUI app with the new design* (323), *Build an AppKit app with the new design* (310). 2023: *Animate with springs* (10158). 2018: *Designing Fluid Interfaces* (803).

Engenharia de terceiros — análises do UIScrollView e do rubber banding, dump das cores do NSColor, interpoladores do React Navigation, e os artigos de kvin.me, nilcoalescing, createwithswift e Donny Wals sobre molas, concentricidade e Liquid Glass.

Consultado em setembro de 2026. As molas em CSS foram calculadas a partir das fórmulas oficiais e são verificáveis reproduzindo a integração.
