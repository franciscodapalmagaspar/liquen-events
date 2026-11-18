# Liquid Glass a sério no back office da Líquen

> Este documento é dela, e está aqui inteiro a partir da **Parte 1**. A
> **Parte −1** é a única coisa acrescentada: as cinco decisões em que a
> execução se afastou do que ele manda, e porquê. Quem vier a seguir lê essa
> primeira e o resto tal como ela o escreveu.

---

## PARTE −1 — O QUE MUDOU NA EXECUÇÃO, E PORQUÊ

**1. A primeira superfície não é a do portal do cliente.** A Parte 7 manda
aplicar o vidro «a uma superfície só — a barra do portal do cliente». Essa barra
não existe: o portal (`/portal/[token]`) é um documento que rola, com um
cabeçalho e secções, sem sub-navegação e sem barra de preço persistente. Aplicar
lá obrigava a INVENTAR a barra primeiro — outro trabalho, e maior, a fingir que
era este.

A superfície escolhida é a barra da selecção dos **Temas**, que a Parte 6 já
nomeia («Temas | A barra de filtros; os cartões **não**»). Cumpre a condição que
a Parte 7 realmente pede — «olha para ela num ecrã com fotografias por trás. É
onde o efeito se prova» —, porque é uma barra colada ao topo com a grelha de
fotografias a rolar por baixo.

**2. O `cluster()` não entrou.** O ficheiro entregue traz `attach()`,
`specular()` e `cluster()`. Os dois primeiros estão em `src/lib/liquid-glass.ts`;
o terceiro não, porque não há ainda superfície nenhuma que se funda, e código
que nada chama é código que ninguém corrige quando se parte. O algoritmo está
por inteiro na **Parte 4.4**, aqui em baixo, para quem montar a primeira.

**3. As curvas `linear()` já cá estavam.** O ponto 1 da Parte 7 pede-as nos
tokens do CSS. Estão, desde antes disto: `--ease-mola-100` a `--ease-mola-70` no
`@theme` do `src/app/tema.css`, com os nomes de uso por cima
(`--ease-snappy`, `--ease-press`, `--ease-sheet`…) e o `molas-da-apple.test.ts`
a refazer a física de cada uma a partir das fórmulas da Apple. Não se
acrescentou nada.

**4. O `position` do `.lg` mudou-se do CSS para o JS, e foi medido.** A regra
`.lg { position: relative }` — que o rebordo precisa para ter contra quem medir
o `inset: 0` — ganha a quem já flutuava por sua conta. MEDIDO na página de
prova: uma barra `position: fixed` com `left: 6%; right: 6%` passou de 1056 px
para os 1200 px do ecrã inteiro, com o canto direito quadrado a sair fora da
imagem. Quem trata disso é o `Glass.tsx`, e só quando o elemento é `static` —
que é como o `cluster()` do ficheiro dela já o fazia.

**5. O vidro saiu do back office para a barra de cookies do site (17/11).**
Pedido dele: «os cookies eu quero colocar transparente iphone». O documento
escreve-se para o back office; esta é a primeira superfície pública, e usa o
MESMO motor — o `<Glass>` mudou-se para `src/components/Glass.tsx` e o rebordo
`.lg` para o `globals.css`, a folha que as duas casas carregam. Quatro coisas
que o documento não previa, porque o site paga o que o back office não paga:

- **O motor chega por `import()`**, e na barra só quando o browser fica livre
  (`adiar`). O JavaScript do arranque não cresce (o motor é um pedaço à parte,
  5,6 KB / 2,5 KB comprimido, que nunca vem no HTML).
- **Por cima do vídeo da entrada não se monta, e sem motor também não.** A
  29/10 e a 9/11 ela disse «o site no PC está a travar imenso»: um
  `backdrop-filter` fixo por cima do vídeo é recalculado em cada fotograma
  dele, mesmo com a página parada, e foi por isso que o desfoque saiu da barra
  duas vezes. O vidro só se monta quando o vídeo sai do ecrã
  (`useEntradaEmVideoVisivel`, um IntersectionObserver; `ativo` no `<Glass>`)
  — por cima dele a barra é só tinta. E no Safari e no Firefox de computador
  (`suportado()` diz que não) não entra o desfoque de recurso de 12 px
  (`soComMotor`): seria o mesmo custo outra vez, sem a refracção que o paga.
- **No toque não se monta** (`quando="(pointer: fine)"`): um `backdrop-filter`
  num elemento `fixed` já engasgou o deslize do iPhone uma vez
  (`scroll-no-iphone.contrato.test.ts`, ponto 4). No telemóvel a barra leva a
  tinta e o rebordo, que são CSS.
- **Quem pede menos transparência, mais contraste ou cores forçadas não leva
  vidro** — o `<Glass>` não monta o motor, e o CSS tira o `backdrop-filter`
  com `!important` se a preferência mudar com a página aberta. Vale também no
  back office.
- **A tinta é o que segura o contraste**: a refracção não clareia uma página
  branca lisa, que é o pior fundo para letra branca. `sage-800` a 72 % dá
  4,9–5,0:1 medido na captura (`ConsentBanner.contraste.test.ts` refaz a conta
  pelos tokens). E a regra da camada única conta-se por teste
  (`vidro-do-site.test.ts`): enquanto a barra está no ecrã, os outros desfoques
  do site levam `vidro-cede` e largam-no.

### O que ficou provado, e como

| | Como se provou |
|---|---|
| A geometria (SDF) | `src/lib/liquid-glass.test.ts` — aresta, centro, fora e o arco do canto |
| O motor corre em Chromium | Página de prova: `CSS.supports` verdadeiro, `backdrop-filter: url(#lg1) …` aplicado |
| A refracção existe | Grelha de linhas rectas por trás: dobram junto às arestas do vidro e ficam direitas na caixa ao lado, que só tem `blur` |
| O `destroy()` limpa | Filtros no documento: 1 antes, **0** depois — e `Glass.test.tsx` guarda o mesmo pelo React |
| O texto continua legível | Contraste calculado no pior caso de cada tema (foto preta em claro, foto branca em escuro) — ver o comentário no `Temas.tsx` |

### O caminho alternativo (Safari, Firefox)

Está montado, testado (`Glass.test.tsx`) e **visto** — mas não onde interessa,
e a diferença importa:

| | |
|---|---|
| **Visto** | Forçado a correr no Chromium com `CSS.supports('backdrop-filter','url(…)')` a responder que NÃO. Desenha `blur(13px) saturate(1.7)`, marca-se `data-lg-fallback`, e o rebordo ganha corpo. Lado a lado com o vidro a sério: mais macio, sem a dobra na aresta, e uma barra perfeitamente apresentável — o texto lê-se igual nas duas. |
| **Por ver** | Um **Safari a sério**. Isto prova o MEU caminho de código e o meu CSS; não prova como é que o WebKit desenha `blur()` e `mask-composite`. Nesta máquina só está instalado o Chromium — não há WebKit nem Firefox. |

O ponto 5 da Parte 7 — «abre no Safari antes de dar por fechado» — continua
por fazer, e é dela. O que mudou é o tamanho do risco: já não é «não sabemos o
que aparece», é «sabemos o que devia aparecer e falta confirmar num motor
diferente».

---


Contexto: Next.js 16 App Router, React 19, TypeScript, Tailwind v4.
Alvo: `liquen-events.com/orcamento/admin`, desktop primeiro.

Marcação das fontes, como nos prompts anteriores:
**[APPLE]** documentação publicada pela Apple · **[CALC]** derivado por cálculo, com a
fórmula à vista · **[EI]** medição de terceiros ou estimativa.

---

## PARTE 1 — O DIAGNÓSTICO

O que está no back office hoje é isto, ou uma variação:

```css
backdrop-filter: blur(20px) saturate(180%);
background: rgba(255,255,255,.6);
border: 1px solid rgba(255,255,255,.3);
```

Isso é *frosted glass* — a linguagem do iOS 7 ao 18. Não é Liquid Glass.
Faltam-lhe três coisas, e é por isso que não parece o software da Apple.

### 1. Refração no bordo (lensing) — [APPLE]

O `blur()` borra. Não entorta. Num vidro real a superfície é curva junto à aresta,
e o fundo dobra ali. É essa dobra que o olho lê como espessura. Sem ela, o painel
lê-se como uma folha de papel vegetal colada ao ecrã.

A Apple descreve o material como refratando o conteúdo por baixo — a refração é o
material, não um enfeite aplicado por cima dele.

### 2. Reflexo especular com lado — [APPLE]

Uma borda branca de 1px uniforme lê-se como caixa. O reflexo da Apple tem direção:
forte de onde vem a luz, apagado do lado oposto, e muda quando o elemento se move.
No iOS acompanha o giroscópio; no macOS é fixo relativo à janela. Na web, ligá-lo ao
ponteiro é a tradução honesta.

### 3. A forma nunca salta — [APPLE]

Os estados do back office mudam por `opacity` ou por troca de elemento.
No software da Apple a mesma peça de vidro estica, funde-se e volta: a identidade
da forma nunca se perde. É o que o `GlassEffectContainer` e o `glassEffectID` fazem.

---

## PARTE 2 — O MOTOR

Cria `lib/liquid-glass.ts` com o ficheiro entregue. Sem dependências.

### Como funciona — [CALC]

1. **SDF do rounded-rect.** Para cada ponto, a distância com sinal à fronteira:
   ```
   px = |x − cx| − (w/2 − r)      qx = max(px, 0)
   py = |y − cy| − (h/2 − r)      qy = max(py, 0)
   d  = √(qx² + qy²) + min(max(px, py), 0) − r
   ```
   Negativo dentro, zero na aresta.

2. **Mapa de deslocamento.** Onde `−bisel < d < 0`, a normal é `∇d` normalizado
   e a magnitude segue o perfil do bisel. O canal R guarda o deslocamento em x,
   o G em y, com 128 a significar zero:
   ```
   t = −d / bisel                 (0 na aresta, 1 no interior)
   m = (1 − t)^2.2                (perfil "bezel", o que mais se aproxima da Apple)
   R = 128 + (∇d.x / |∇d|) · m · 127
   G = 128 + (∇d.y / |∇d|) · m · 127
   ```
   O centro fica exatamente a 128,128 — vidro limpo, sem distorção. Verificado:
   o pixel central do mapa lê 128,128, e a grelha do fundo alinha ao pixel.

3. **`feDisplacementMap`** com esse mapa em `backdrop-filter`, com
   `scale = força × 2` (porque o deslocamento é `scale × (canal − 0,5)`).

### Otimização 9-slice — [CALC]

Construir o mapa pixel a pixel custa 5 ms numa barra de 900×52 e 40 ms numa folha
de 720×520. Inaceitável para animar.

Mas o mapa de um rounded-rect é **9-sliceable**: ao longo de uma aresta reta só
varia na perpendicular, por isso esticá-lo paralelamente à aresta é *exato*, não
uma aproximação. Constrói-se um retângulo de referência 2K×2K uma vez (K = max(raio, bisel)),
guarda-se em cache, e monta-se qualquer tamanho com 4 cantos + 4 tiras esticadas.

Verificação: diferença máxima entre o mapa 9-slice e o mapa direto = **1/255**,
média 0,10. Custo passa de 40 ms para ~3,5 ms, independente do tamanho.

A resolução do mapa é limitada a 600 px no lado maior (o campo é suave, o `feImage`
interpola) com um piso que garante 10 px de bisel.

### Suporte real — [EI, verificado]

Filtros SVG dentro de `backdrop-filter` só funcionam em motores **Chromium**
(Chrome, Edge, Arc, Brave). Safari e Firefox ignoram a declaração inteira.

O motor deteta com `CSS.supports('backdrop-filter','url(#a)')` e degrada para
desfoque mais forte com o rebordo especular — que continua a ser melhor do que
está lá hoje. **Não escondas isto ao testar: abre no Safari e confirma que o
alternativo é bonito por si.**

---

## PARTE 3 — VALORES POR SUPERFÍCIE

| Superfície | bisel | força | blur | saturate |
|---|---|---|---|---|
| Painel, cartão, folha modal | 16 | 12 | 2 | 1.5 |
| Barra de topo, sub-navegação | 12 | 10 | 3 | 1.5 |
| Botão, pastilha, chip | 8 | 7 | 1 | 1.45 |
| Menu, popover | 14 | 11 | 2 | 1.5 |

**Acima de 20 de força o fundo deixa de se reconhecer** e o vidro passa a chamar
mais atenção do que o conteúdo. É o erro mais comum de quem descobre o efeito.

---

## PARTE 4 — O MOVIMENTO

As curvas já calculadas (integração numérica da equação da mola amortecida,
validadas contra os dois exemplos publicados pela Apple) estão no
`PROMPT-APPLE-DESKTOP-v2.md`. Usa-as tal como estão.

### 4.1 A pastilha estica enquanto viaja — [APPLE]

Na navegação por separadores, a pastilha de vidro não desliza com largura fixa.
Alonga para cobrir o intervalo entre origem e destino, e recolhe à chegada.

```ts
const lo = Math.min(origem.x, destino.x)
const hi = Math.max(origem.x + origem.w, destino.x + destino.w)
cl.to([{ ...destino, x: lo, w: hi - lo }], 210, p => 1 - (1-p)**2)  // estica
setTimeout(() => cl.to([destino], 420, p => 1 - (1-p)**3), 200)     // recolhe
```

### 4.2 Carregar amassa o vidro — [EI]

Ao premir: escala para 0,955, o bisel alarga de 12 para 22 e a força sobe de 10
para 19. Parece que o dedo afunda a superfície. Ao largar, `--ease-press` a 260 ms,
sem ressalto — um botão que ressalta parece um brinquedo.

### 4.3 A superfície transforma-se, não troca — [APPLE]

Botão → painel é **a mesma peça** a crescer. Anima `width`, `height` e
`border-radius` com `--ease-snappy` a 540 ms, e chama `h.track(760)` para o mapa
de refração ser reconstruído a cada frame durante a transição.

Sem o `track()`, o vidro fica com a refração da forma antiga enquanto a forma nova
já lá está — e é exatamente esse desencontro que denuncia o truque.

### 4.4 Fusão — [APPLE, `GlassEffectContainer`]

Dois vidros que se aproximam unem-se como mercúrio. Implementado com **smooth-minimum
de SDFs** — metaballs analíticos, não formas borradas:

```
smin(a, b, k) = min(a,b) − h²·k/4,   h = max(k − |a−b|, 0) / k
```

O `k` é a distância de fusão (o `spacing` do `GlassEffectContainer`). Um só campo
produz a máscara *e* o mapa, por isso **a refração segue a forma fundida**, não a
antiga. Usa 26–32 para pastilhas de 44–52 px de altura.

Cuidado: com sobreposição grande o `smin` cria uma bolha a meio. Mantém a
sobreposição no estado final em 4–8 px.

### 4.5 A escala altera a física — [APPLE]

| Tamanho | Duração |
|---|---|
| Controlo (botão, chip, toggle) | 150–260 ms |
| Painel, menu, popover | 325–540 ms |
| Navegação entre vistas | 515 ms |

Uma pastilha de 40 px e um painel de 600 px a moverem-se no mesmo tempo parecem
feitos de materiais diferentes.

---

## PARTE 5 — AS REGRAS QUE NÃO PODES PARTIR

1. **Uma camada de vidro por ecrã.** Vidro sobre vidro duplica o custo e transforma
   o fundo em papa cinzenta. Barra de topo *ou* painel flutuante — não os dois.

2. **O texto sobre vidro precisa de fundo próprio.** Contraste sobre vidro não é
   fixo: muda com o que está por baixo. Escurecimento adaptativo de 35% [APPLE]
   por baixo do texto, ou o texto sai do vidro para superfície opaca.

3. **`prefers-reduced-motion` desliga `track()` e `cluster.to()`.** Ambos correm
   loops de `requestAnimationFrame` — é precisamente o que essa preferência proíbe.
   Salta ao estado final com um `render()` único.

4. **Vidro só nas superfícies que flutuam** — barra, painel, menu, pastilha.
   Listas, tabelas e formulários ficam opacos. Cada superfície reconstrói o mapa
   ao mudar de tamanho: 3 ms num painel, 6 ms numa barra larga.

5. **Concentricidade mantém-se** — `raio_interior = raio_exterior − padding` [APPLE].
   O vidro não dispensa a regra.

---

## PARTE 6 — ONDE APLICAR, POR ECRÃ

| Ecrã | Superfície de vidro | Resto |
|---|---|---|
| Login | O cartão do formulário | Fundo opaco |
| Fazer proposta | A barra de ações fixa no fundo | Editor opaco |
| Temas | A barra de filtros; os cartões **não** | Grelha opaca |
| Calendário | A barra de mês e o popover do dia | Grelha opaca |
| Tarefas | A barra de filtros | Lista opaca |
| Propostas | A barra de KPIs | Tabela opaca |
| Portal do cliente | A sub-navegação e a barra de preço persistente | Documento opaco |

O padrão é sempre o mesmo: **o que flutua é vidro, o que se lê é opaco.**

---

## PARTE 7 — ORDEM DE EXECUÇÃO

1. `lib/liquid-glass.ts` no projeto, e as curvas `linear()` nos tokens CSS.
2. Um componente `<Glass>` que embrulha `attach()` num `useEffect` com `destroy()`.
3. Aplica-o **a uma superfície só** — a barra do portal do cliente — e olha para
   ela num ecrã com fotografias por trás. É onde o efeito se prova.
4. Só depois alastra, uma superfície de cada vez, com a tabela da Parte 3.
5. Abre no Safari antes de dar por fechado.