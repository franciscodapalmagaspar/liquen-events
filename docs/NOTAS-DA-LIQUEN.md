# Notas da Líquen — o júri independente de 17/11

> **O que é:** a nota de 0 a 10 de cada área do produto, dada por um júri
> independente com a fasquia das empresas de topo, e o plano de trabalho para
> chegar a **9 em todas** (e, onde for realista, ao 10).
> **Sobre o quê:** o ramo `origin/lote/2026-11-17` em `ddead388` (segurança,
> legal, estabilidade, BO 4, Next 16.4.5). O que entrou depois, até
> `f90bc663`, são duas regras em `.claude/rules/` e uma correção do CodeQL ao
> filtro anti-spam (`src/lib/anti-spam/conteudo.ts`). Nada disso muda as
> medições deste documento.
> **Como se leu:** `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*`, e os documentos
> de `docs/` de cada área. O `graphify` não está instalado nesta máquina
> (`command -v graphify` vazio), por isso a leitura foi direta aos ficheiros.
> **Regra deste documento:** cada afirmação tem uma prova (ficheiro:linha,
> medição ou registo). O que não se mediu diz «não medido», e porquê.
> **Nada foi corrigido.** Não se tocou em dados de clientes nem se enviou
> nenhum e-mail.

## Tabela-resumo

| # | Área | Nota | O que a segura abaixo do 9 (numa linha) |
|---|---|:-:|---|
| 1 | Site público | **7** | A página de entrada diz pouco (o quê, onde, para quem), não tem prova social, e a letra fica pequena demais em muitos sítios |
| 2 | Desempenho (Lighthouse, telemóvel) | **8** | A entrada fica nos 89–94 com o processador travado, e desce para 71 no modo do PageSpeed; o `/en` dá 85 |
| 3 | Acessibilidade | **8** | A barra de cookies falha o contraste (4,38:1) em todas as páginas; 104 textos de 9–11 px no site |
| 4 | Back office | **7** | Os ficheiros enormes, 839 medidas fora dos tokens, e o painel a 11 KB do tecto do JavaScript |
| 5 | «Fazer proposta» | **7** | O `ProposalStudio.tsx` tem 16 868 linhas; há quatro melhorias parciais; e a produção regista erros no estúdio |
| 6 | Proposta online e PDF | **8** | O gerador antigo (3 469 linhas) continua vivo por baixo do novo; o motor do PDF tem poucos testes para o peso que tem |
| 7 | Segurança | **8** | Sem Upstash em produção, os limites de tentativas valem só por instância, e não há alerta de erros |
| 8 | Legal e privacidade | **8** | O consentimento está certo (medido); falta o contraste da barra e acertar a lista de prestadores com o que corre |
| 9 | Custo | **6** | O Supabase ia em 913 MB de 1 GB a 16/11, e o Blob que o alivia está desligado |
| 10 | Fiabilidade e testes | **7** | A produção não tem monitor de erros, houve 3 tempos esgotados de 60 s em 7 dias, e a cópia de 16/11 saiu incompleta |
| 11 | Estrutura do código | **5** | O lote ainda tem os três gigantes; os ramos `codigo/*` resolvem metade, mas nenhum entrou |

**Média: 7,2.** Nenhuma área está abaixo de 5, e nenhuma chega ao 9 hoje.

### Os 10 pontos de maior impacto (a ordem de ataque)

| # | Ponto | Área | Tipo | Esforço |
|---|---|---|---|---|
| 1 | Ligar o Blob (pelo menos `proposal-pdfs` em `espelho` e depois `blob`) antes de o Supabase passar 1 GB | 9 | infraestrutura | M |
| 2 | Ligar um monitor de erros gratuito e um alerta (o `logger.ts` já sabe falar com o Sentry e com um webhook) | 10 | infraestrutura | P |
| 3 | Juntar os ramos `codigo/*` ao lote, pela ordem certa, com o júri a ≥ 9 em cada um | 11 | infraestrutura | G |
| 4 | Corrigir a CSP que bloqueia o Google Analytics (`region1.analytics.google.com`, 80 bloqueios em 7 dias) e o `eval` bloqueado no estúdio (81) | 10, 2 | infraestrutura | P |
| 5 | Contraste da barra de cookies ≥ 4,5:1 | 3, 8 | **visual** | P |
| 6 | Letra mínima de 12 px no site público (o rodapé legal está a 11 px) | 1, 3 | **visual** | M |
| 7 | Upstash nas portas de contas e envios em produção (o código já existe; faltam as duas variáveis) | 7 | infraestrutura | P |
| 8 | A página de entrada com uma frase do que a Líquen faz, onde, e a prova social (testemunhos, números) | 1 | **visual** | M |
| 9 | A entrada no telemóvel ≥ 90 também no modo do PageSpeed (hoje 71): menos CSS embutido e menos trabalho no arranque | 2 | infraestrutura | M |
| 10 | Tornar bloqueantes o Lighthouse (≥ 90) e os passeios gerais do CI, que hoje só informam | 10 | infraestrutura | P |

Legenda do tipo (regra do dono de 17/11): **visual** precisa do sim dele antes
de avançar, e cada um destes pontos diz o antes e o depois em palavras simples;
**infraestrutura** pode avançar sem lhe perguntar. Esforço: P (horas), M (um a
dois dias), G (uma semana ou mais).

---

## Como se mediu

| O quê | Como | Onde ficou |
|---|---|---|
| Construção | `npm run build` (Next 16.4.5, Turbopack) sem `.env`: passou em 1 min 17 s, 107 páginas | — |
| Peso das rotas | `node scripts/peso-das-rotas.mjs` | números abaixo |
| Lighthouse | 12.8.2, telemóvel, `--throttling-method=devtools` (4G lento e CPU ÷4, o mesmo método do `docs/medicoes/RESUMO.md`), contra `next start`; uma corrida por página e três na entrada. Mais uma corrida em modo simulado (o do PageSpeed Insights) na entrada | relatórios JSON no bloco de notas da sessão, não guardados no repositório |
| Acessibilidade e consola | Playwright + axe-core (WCAG 2.0/2.1/2.2 A e AA), 14 endereços × 390 e 1440 px × claro e escuro = 56 passagens; erros de consola e deslocação horizontal | — |
| Consentimento | Playwright: abrir a entrada com `?gclid=…&fbclid=…`, e listar os domínios externos e o que fica guardado com «nada», «Recusar» e «Aceitar» | — |
| Produção (só leitura de metadados, nenhum dado de cliente) | Vercel: erros dos últimos 7 dias, nomes das variáveis (sem valores), faturação de um dia. Supabase: os conselheiros de segurança e desempenho | — |
| Testes | `npx vitest run` no lote inteiro | ver área 10 |

**O que não se mediu, e porquê:**
- **O back office e o estúdio num browser.** Em `next start` sem Supabase e
  sem `ADMIN_PASSWORD_HASH` a entrada fica fechada (de propósito, ver
  `scripts/variaveis-de-ambiente.mjs`), e o `next dev` não é o produto
  (`AGENTS.md`). As notas 4 e 5 apoiam-se no código, nos documentos, nos
  passeios do CI e nos registos de produção.
- **O PDF e a proposta online com conteúdo.** Precisam de uma proposta
  guardada; não se usaram dados reais.
- **O INP real.** Só se mede com visitas reais; não há Speed Insights ligado.
- **A visibilidade do repositório no GitHub.** O proxy desta sessão não deixa
  ler; o `docs/PLANO-SITE-E-GALERIA.md` diz que é público.
- **Leitor de ecrã real** (VoiceOver/TalkBack): não há aparelho nesta máquina.

---

## 1. Site público — 7/10

**Porquê 7.** A base é de estúdio: vídeo de entrada com fotografia como LCP,
galeria de ~900 fotografias com visualizador próprio, títulos linha a linha,
duas línguas sem clarão, dados estruturados e `llms.txt`. O que separa isto de
um 9 é o que a página **diz** e **prova**, não a técnica:

- **A entrada não diz o que a Líquen faz nem onde.** No telemóvel o primeiro
  ecrã é «ETERNIZAMOS MEMÓRIAS» e dois links (captura a 390 px). Não aparece
  «casamentos», «Alentejo» nem «decoração» antes de descer.
- **A entrada é curta e sem prova social.** São cinco blocos: vídeo, faixa de
  logótipos, três painéis (Casamentos, Corporativos, Privados), «Tem um evento
  em mente?» e rodapé. Os testemunhos vivem em `/clientes`; na entrada não há
  nenhum, nem números (casamentos feitos, anos, regiões).
- **O logótipo perde o «EVENTS» sobre o vídeo** e o «MEMÓRIAS» em verde-sálvia
  tem pouco contraste sobre a folhagem escura (captura a 1440 px).
- **Letra pequena demais**: 104 classes de 9, 10 ou 11 px no site e nos
  componentes (`grep text-\[(9|10|11)px\]` em `(site)` e `components`). O
  Lighthouse dá «só 48,9 % do texto legível» na entrada.
- **O contacto é um endereço Gmail** (`src/lib/site.ts:12`,
  `liquen.alentejo@gmail.com`), que aparece no rodapé e na página de proposta
  não encontrada. Para um estúdio que se quer de topo, lê-se como amador.
  O `docs/email-dominio-proprio.md` já estuda a mudança.
- **Medidas fora dos tokens** no site: 213 valores em píxeis arbitrários e 26
  cores em hexadecimal nas classes (`(site)`), contra a regra do
  `docs/DESIGN-SYSTEM.md`.

**Provas:** capturas a 390 e 1440 px (entrada, orçamento, proposta não
encontrada) e o percurso da entrada a deslizar no telemóvel; Lighthouse
`font-size` na entrada: 48,94 % legível, com os seletores `.text-[10px]`,
`.text-[11px]`, `.text-[9px]` e o rodapé legal a 11 px
(`src/components/AvisoLegal.tsx:80`, `fontSize: 11`).

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Antes → depois (visual) | Critério de aceitação |
|---|---|---|---|---|---|
| 1.1 | Uma linha por baixo do título da entrada a dizer o quê e onde | **visual** | alto · P | **Antes:** «ETERNIZAMOS MEMÓRIAS» e dois links. **Depois:** o mesmo título e, por baixo, uma frase curta do género «Decoração e organização de casamentos e eventos no Alentejo e em todo o país» (texto a escolher por ele) | No primeiro ecrã a 390 px lê-se o serviço e a região sem deslizar |
| 1.2 | Prova social na entrada: dois ou três testemunhos verdadeiros de `/clientes` e, se ele quiser, números verdadeiros | **visual** | alto · M | **Antes:** depois dos logótipos vêm logo os painéis. **Depois:** entre os painéis e o «Tem um evento em mente?» aparece um bloco com duas ou três frases de clientes, com nome e tipo de evento | Nenhum texto inventado (B-regras do `PADRAO-PALUMEN.md`); o bloco desenha-se sem JavaScript; CLS 0 |
| 1.3 | Letra mínima de 12 px no site (rodapé legal, sobretítulos, legendas) | **visual** | médio · M | **Antes:** sobretítulos e o rodapé legal em 9–11 px. **Depois:** tudo em 12 px ou mais, com o mesmo espaçamento das letras | `grep -E "text-\[(9|10|11)px\]"` em `(site)` e `components` dá 0; Lighthouse `font-size` passa (≥ 60 % legível) em todas as páginas |
| 1.4 | O logótipo inteiro e o «MEMÓRIAS» legíveis sobre o vídeo | **visual** | médio · P | **Antes:** «EVENTS» quase desaparece e «MEMÓRIAS» em verde-sálvia mistura-se com as árvores. **Depois:** um véu escuro discreto atrás do título e do logótipo, ou o «EVENTS» em claro sobre o vídeo | Contraste ≥ 3:1 (texto grande) medido em três momentos do vídeo |
| 1.5 | Contacto com o domínio próprio (`…@liquen-events.com`) em vez do Gmail | **visual** | médio · P | **Antes:** «liquen.alentejo@gmail.com». **Depois:** um endereço do domínio, a chegar à mesma caixa | Um teste prende que nenhum `@gmail.com` aparece no HTML público; o e-mail de teste chega (sem clientes reais) |
| 1.6 | Os valores do site passam para os tokens | infraestrutura (sem mudança visível, valor a valor) | médio · M | — | Os 213 px e 26 hex arbitrários passam a tokens com o mesmo valor; capturas antes/depois iguais ao píxel |

### Para o 10

As referências: **Aman Weddings** e **Belmond** (hotelaria de luxo que vende
casamentos), **Lavender & Rose** e **Bramble & Wild** (estúdios florais de
casamento), e as entradas premiadas no Awwwards de estúdios como **Locomotive**
e **Bürocratik**. O que têm em comum e falta aqui:
- **um casamento contado de ponta a ponta** (caso de estudo com antes, durante
  e depois, com o nome do sítio e as flores) em vez de só galeria;
- **a pessoa por trás**: a fundadora a falar, em vídeo curto;
- **um caminho de conversão sem atrito** que pergunta a data primeiro e diz
  logo se há disponibilidade.

**Realista:** casos de estudo (há fotografia de sobra), a fundadora na
entrada, a data em primeiro lugar no formulário. **Não realista sem
investimento:** vídeo novo de produção, um site candidato a «Site of the Day»
no Awwwards exige direção de arte dedicada durante semanas.

---

## 2. Desempenho — 8/10

**Porquê 8.** Os números de laboratório são bons em quase todas as páginas,
mas a entrada — a página que mais importa — está no limite, e no modo do
PageSpeed Insights (o que o Google mostra a quem mede) cai para 71.

**Medido hoje** (Lighthouse 12.8.2, telemóvel, `devtools`, `next start` local):

| Página | Desempenho | Acessib. | Boas práticas | SEO | LCP | TBT | CLS | Speed Index | Peso |
|---|:-:|:-:|:-:|:-:|---|---|---|---|---|
| entrada (3 corridas) | **89 / 94 / 90** | 100 | 96 | 100 | 1,15–1,28 s | 254–411 ms | 0 | 3,3–3,4 s | 1,98 MB |
| entrada, modo simulado (PageSpeed) | **71** | 100 | 96 | 100 | 3,56 s | 605 ms | **0,128** | 1,9 s | 3,37 MB |
| `/en` | **85** | 100 | 96 | **92** | 1,12 s | 555 ms | 0 | 3,4 s | — |
| galeria | 99 | 100 | 96 | 100 | 1,05 s | 147 ms | 0 | 1,3 s | 628 KB |
| serviços | 93 | 100 | 100 | 100 | 1,02 s | 323 ms | 0 | 1,4 s | 644 KB |
| orçamento | 99 | 100 | 96 | 100 | 1,04 s | 133 ms | 0 | 1,1 s | 480 KB |
| sobre | 98 | 100 | 96 | 100 | 1,07 s | 146 ms | 0 | 1,4 s | 859 KB |
| contacto | 96 | 100 | 100 | 100 | **2,49 s** | 143 ms | 0 | 1,5 s | 789 KB |
| clientes | 95 | 100 | 100 | 100 | 1,09 s | 265 ms | 0 | 1,4 s | 849 KB |
| casamentos/lisboa | 100 | **96** | 96 | 100 | 1,13 s | 83 ms | 0 | 1,4 s | 685 KB |

Comparado com o `docs/medicoes/RESUMO.md` (31/10, mesmo método): a entrada
estava em 95 com TBT de 0,20 s; hoje 90 de mediana com 0,37 s. **As «Boas
práticas» desceram de 100 para 96 em seis páginas** por causa da letra pequena
(o rodapé legal novo entra aí, a 11 px).

**Outras provas:**
- **CSS embutido em todas as páginas:** a experiência `inlineCss` põe ~159 KB
  de CSS (2 229 regras, com 93 regras `.lg` do vidro) dentro do HTML de cada
  página. O HTML da entrada tem 464 KB sem compressão (81 KB em gzip). Duas
  folhas de 194 KB e 153 KB saem do build (`scripts/folhas-que-existem.mjs`).
- **JavaScript inicial:** 228 KB transferidos na entrada (o orçamento B12 do
  `PADRAO-PALUMEN.md` é 180 KB; já se sabia que não cabe, ver `RESUMO.md`).
- **O trabalho no arranque:** 8,8 s de processador no `/en` (5,3 s na
  entrada simulada), com 1,7–1,9 s de execução de JavaScript; o Lighthouse
  aponta «forced reflow».
- **O `/en` tem um «Learn more»** sem texto descritivo (SEO 92).
- **O LCP do `/contacto` é a fotografia aérea** (2,49 s, a única acima de 2 s).
- **As funções:** 34 de 164 rotas levam ~17,8 MB de bibliotecas de imagem que
  não usam, incluindo a proposta que o casal abre (`peso-das-rotas.mjs`). Isso
  pesa no arranque a frio.
- **Não medido:** o INP real e o site publicado.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 2.1 | Tirar do CSS embutido o que a página não usa (o vidro `.lg` e as regras do back office/proposta que vierem na mesma folha), ou desligar o `inlineCss` e medir | infraestrutura | alto · M | HTML da entrada < 40 KB em gzip; Lighthouse da entrada ≥ 90 nas 3 corridas `devtools` e ≥ 85 no simulado |
| 2.2 | Cortar o trabalho do arranque na entrada: o reflow forçado, e o vídeo/serviços a montar depois do primeiro gesto ou do `idle` | infraestrutura | alto · M | TBT da entrada ≤ 200 ms na mediana de 3 corridas; o mesmo no `/en` |
| 2.3 | O texto do «Learn more» no `/en` | infraestrutura (texto de ligação acessível, nada muda à vista) | baixo · P | SEO 100 no `/en`; `aria-label` descritivo |
| 2.4 | Tirar o `sharp` das 34 rotas que não o usam | infraestrutura | médio · M | `peso-das-rotas.mjs` dá 0 rotas com bibliotecas que não usam |
| 2.5 | Ler os `/api/vitals` que já chegam (grátis; o Speed Insights da Vercel pode ter custo — confirmar antes) para ter INP e LCP reais do percentil 75 | infraestrutura | médio · P | Um quadro com LCP, INP e CLS reais do p75 em telemóvel, por página, com 28 dias |
| 2.6 | Lighthouse do CI passa a bloquear abaixo de 90 (hoje `minScore: 0.6`, `continue-on-error: true`) | infraestrutura | médio · P | `lighthouserc.mobile.json` com `categories:performance ≥ 0.9` em `error`; um PR que piore falha |

### Para o 10

A referência é a **Linear** e a **Vercel.com** (100 de desempenho no
telemóvel com movimento rico) e os sites de fotografia pesada como o
**Unsplash** (imagens sempre no tamanho certo, AVIF, sem bloquear). O 10 seria:
100 nas quatro categorias em todas as páginas, no modo do PageSpeed, e o INP
real < 100 ms. **Realista:** 95+ em todas as páginas no `devtools`.
**Pouco realista:** 100 no simulado com vídeo na entrada e ~140 KB fixos do
React e do Next (o próprio `RESUMO.md` mostra que 77 % do orçamento de
JavaScript é da plataforma).

---

## 3. Acessibilidade — 8/10

**Porquê 8.** O Lighthouse dá 100 em sete das oito páginas, e há trabalho de
fundo raro: grelhas `role="grid"` no Calendário e nos Temas, um teste de
contrato do anel de foco (`src/app/anel-de-foco.contrato.test.ts`), movimento
reduzido respeitado, alvos de toque com classe própria. Mas o axe, a correr
página a página nos dois temas, encontra falhas **sérias** que se repetem.

**Medido (axe-core, 56 passagens):**
- **A barra de cookies falha em todas as páginas onde aparece:** branco sobre
  `bg-sage-700/75` dá **4,38:1** (precisa de 4,5:1) no texto de 12,5 px, no
  «Saber mais» e nos botões de 11 px «Recusar»/«Aceitar»
  (`src/components/ConsentBanner.tsx:271`, `:291`, `:312`, `:319`). Como o fundo
  é translúcido, o contraste real muda com o que está por trás.
- **`/casamentos/[polo]`:** sobretítulo e nota a `text-foreground/45` em 10 e
  12 px (`src/app/[lang]/(site)/casamentos/[polo]/page.tsx:186` e `:202`) — as 13
  páginas regionais dos anúncios. Lighthouse: Acessibilidade 96 no `/casamentos/lisboa`.
- **Nenhuma deslocação horizontal** em nenhuma das 56 passagens; **nenhum erro
  de consola** nas páginas públicas.
- **Não medido:** o back office no axe (entrada fechada sem Supabase), leitor
  de ecrã real.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Antes → depois (visual) | Critério de aceitação |
|---|---|---|---|---|---|
| 3.1 | Barra de cookies com contraste ≥ 4,5:1 | **visual** | alto · P | **Antes:** caixa verde-sálvia meio transparente, letra branca pequena. **Depois:** a mesma caixa um pouco mais escura e opaca (a cor de fundo deixa de depender da fotografia por trás), botões com 12 px | axe sem `color-contrast` nas 14 páginas, nos dois temas, com a barra aberta |
| 3.2 | Páginas regionais com contraste ≥ 4,5:1 | **visual** | médio · P | **Antes:** sobretítulo cinzento muito claro em 10 px. **Depois:** o mesmo cinzento mais escuro e 12 px | axe limpo nas 13 páginas `/casamentos/*` |
| 3.3 | Letra mínima de 12 px (o mesmo que 1.3) | **visual** | médio · M | ver 1.3 | ver 1.3 |
| 3.4 | Passeio do axe no CI que inclua a barra de cookies aberta, os dois temas e as páginas regionais (hoje o `o-sitio-inteiro.spec.ts` só procura «erros estruturais») | infraestrutura | alto · P | O passeio falha com qualquer violação `serious`/`critical` |
| 3.5 | O mesmo axe no back office, com sessão de teste, em cada vista `?v=` | infraestrutura | alto · M | Zero violações `serious` nas vistas da barra de baixo, a 390 e 1440 px |

### Para o 10

A referência é o **GOV.UK** (o padrão mundial de acessibilidade pública) e a
**Apple** nos seus próprios sites (Dynamic Type, VoiceOver testado à mão).
O 10 seria: WCAG 2.2 AA verificado por pessoas com leitor de ecrã, todo o
site utilizável a 200 % de ampliação e com «texto maior» do iOS, e uma
declaração de acessibilidade publicada. **Realista:** o AA automático limpo e
um passeio manual com VoiceOver por trimestre. **Não realista sem pagar:** uma
auditoria externa certificada.

---

## 4. Back office — 7/10

**Porquê 7.** A amplitude é invulgar (pedidos, propostas, calendário com
quatro vistas e arrastar, tarefas, guiões, mapa de mesas, temas ao estilo das
Fotografias), a navegação está decidida (barra de baixo) e tudo é reversível
(`docs/TUDO-REVERSIVEL.md`). O que impede o 9 é a coerência e a margem:

- **Fora dos tokens:** 839 medidas em píxeis arbitrários, 62 cores hexadecimais
  em `style` e 13 durações/curvas arbitrárias em `(admin)`. O
  `docs/DESIGN-SYSTEM.md` diz «nenhum valor de cor, espaço, raio, duração ou
  curva pode existir fora dos tokens».
- **O painel está a 11 KB do tecto:** 509 KB de JavaScript cru em 17 pacotes,
  tecto 520 KB (`scripts/peso-das-rotas.mjs`). A próxima funcionalidade parte o
  CI.
- **Documentos Apple por fechar:** Temas 01 e 02 parciais
  (`docs/APPLE-TEMAS.md:30-31`); Calendário 05 parcial
  (`docs/APPLE-CALENDARIO.md:16`).
- **Ficheiros enormes:** `AdminClient.tsx` 9 524 linhas, `Temas.tsx` 6 464,
  `Tarefas.tsx` 3 261, `ThemePicker.tsx` 3 181, `Calendario.tsx` 2 684,
  `Overview.tsx` 2 416. Isto é estrutura (área 11), mas aqui significa risco de
  regressão em cada mudança.
- **Não medido hoje:** rapidez e telemóvel num browser (ver «Como se mediu»).
  O CI tem os passeios bloqueantes «Peso do back office» e «Ergonomia táctil no
  telemóvel» (`.github/workflows/ci.yml:377`, `:581`), e a última corrida
  completa do lote (`358f6ad6`) passou.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Antes → depois (visual) | Critério de aceitação |
|---|---|---|---|---|---|
| 4.1 | Juntar `codigo/admin-e-temas` (AdminClient 9 524 → 4 111, Temas 6 464 → 4 037) | infraestrutura | alto · M | — | Júri de arquitetura ≥ 9; capturas iguais ao píxel; CI verde |
| 4.2 | Recuperar folga no painel: pelo menos 60 KB abaixo do tecto (carregar a pedido o que não é da primeira vista) | infraestrutura | alto · M | — | `peso-das-rotas.mjs`: painel ≤ 460 KB |
| 4.3 | Os 839 px, 62 hex e 13 curvas para tokens, por vistas, valor igual ao de hoje | infraestrutura | médio · G | — | Uma regra do ESLint (ou teste) recusa valores arbitrários nas casas novas; contagem a descer por PR até 0; capturas iguais |
| 4.4 | Fechar Temas 01/02 e Calendário 05 | **visual** | médio · M | **Temas antes:** cartões de alturas diferentes, sem sombra; barra de topo por arrumar. **Depois:** cartões todos da mesma altura com a sombra do sistema, e a barra de topo arrumada como diz a Parte 8. **Calendário antes:** o painel dos próximos agrupado por mês mas incompleto. **Depois:** o painel como o documento o descreve | As tabelas dos dois documentos com «feito» nesses números, auditadas no código |
| 4.5 | Medir o back office num browser de produção com uma conta de teste: tempo até cada vista ficar usável a 390 px em 4G | infraestrutura | médio · M | — | Uma tabela em `docs/medicoes/back-office/` com o tempo de cada vista; nenhuma acima de 1,5 s depois da primeira |

### Para o 10

A referência é a **Linear** (cada ação < 100 ms, teclado em tudo, sem
esperas) e o **Things 3**/**Fantastical** (o padrão Apple que ela escolheu).
O 10 seria: cada vista abre em menos de 300 ms, funciona sem rede e
sincroniza depois, e não há nenhum valor fora do sistema. **Realista:** os
tokens a 100 %, as vistas a abrir em < 1 s. **Pouco realista agora:** a
sincronização local-primeiro estilo Linear exige uma reescrita da camada de
dados.

---

## 5. «Fazer proposta» — 7/10

**Porquê 7.** O que ela pediu está quase todo feito: a página ao lado é a real
e rápida, os cinco passos, a Conferência com a mesma regra do envio
(`oQueFaltaParaEnviar`), «Rever e enviar» com o que falta primeiro
(`docs/FAZER-PROPOSTA-REDESENHO.md`, Parte −1, fases 0 a 5 «feito»). O que
falta para o 9 é robustez e acabar o que está parcial:

- **O ficheiro:** `ProposalStudio.tsx` com 16 868 linhas; a função tem
  complexidade 279 e 40 `useEffect` (`ESTRUTURA-DO-CODIGO.md` §2.2 e §2.7, no
  ramo `codigo/admin-e-temas`).
- **Parciais** (`docs/FAZER-PROPOSTA-MELHORIAS.md:19-22`): C2/C3 (rapidez e
  progresso), A1 (pré-visualização real), A3/A4 (papel e resolução das
  fotografias), D1 (duplicados).
- **A produção regista erros no estúdio (7 dias):** 81 bloqueios da CSP a um
  `eval` em `?v=fazer-proposta`; 21 «imagem não desenhou no browser» no
  mood board; **3 «imagem não resolveu, vai FALTAR no PDF»** (uma fotografia
  da biblioteca que não desceu ao fim de três tentativas); 5
  `RenderingCancelledException` em `pagina-do-rascunho`; 3 «Task timed out
  after 60 seconds». Os registos mostram só os 50 grupos mais frequentes.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Antes → depois (visual) | Critério de aceitação |
|---|---|---|---|---|---|
| 5.1 | Descobrir quem chama `eval` no estúdio e tirá-lo (ou carregá-lo noutro sítio) | infraestrutura | alto · P | — | Zero «CSP violation script-src eval» nos registos durante 7 dias |
| 5.2 | Os 60 s esgotados: identificar a rota e pôr o trabalho pesado fora do pedido (`after`, fila, ou guardado) | infraestrutura | alto · M | — | Zero tempos esgotados em 7 dias; a rota responde < 10 s no p95 |
| 5.3 | O `RenderingCancelledException` deixa de ser `error` (é um cancelamento esperado) e as imagens que não desenham são tentadas outra vez | infraestrutura | médio · P | — | Zero `level:error` desse tipo; teste para o cancelamento |
| 5.3b | Nenhuma fotografia «vai FALTAR no PDF» sem a Conferência o dizer antes do envio (hoje o envio já pergunta pelas fotos a menos, `2108d274`; confirmar que este caso — a descarga que falha no servidor — também passa por lá) | infraestrutura | alto · P | — | Um teste com a descarga a falhar três vezes: o envio pára e pergunta |
| 5.4 | Juntar `codigo/estudio-fases-2-a-4` depois de o júri subir de 5,5 para ≥ 9 | infraestrutura | alto · G | — | `ProposalStudio.tsx` < 8 000 linhas e a função < 100 de complexidade; e2e de propostas 9/9; capturas iguais |
| 5.5 | Fechar C2/C3, A1, A3/A4 e D1 | **visual** (cada um mostra-se a ela antes) | médio · G | **Antes:** a pré-visualização mostra só a página que está a ser editada; o progresso das descargas é parcial; os duplicados só se assinalam numa lista. **Depois:** o que cada ponto do documento descreve, um de cada vez, com a captura do antes e do depois | A tabela da Parte −1 do documento com «feito» nesses quatro |

### Para o 10

As referências: o **Canva** (edição com pré-visualização instantânea), o
**Pitch.com** (documentos bonitos feitos depressa) e o **HoneyBook**/**Aisle
Planner** (os SaaS de propostas para casamentos). O 10 seria: abrir, mudar
uma palavra e ver a página real em < 300 ms, nunca perder uma letra (já quase),
e uma proposta nova feita em 10 minutos por quem não percebe de computadores.
**Realista:** a pré-visualização < 500 ms e zero erros nos registos.
**Ambicioso mas possível:** medir o tempo real que ela leva a fazer uma
proposta e baixá-lo para metade.

---

## 6. Proposta online e PDF — 8/10

**Porquê 8.** É provavelmente a peça mais madura: o PDF e a página web saem
do **mesmo motor** (`conteudoDoEditorial`), o PDF dá os mesmos bytes para o
mesmo documento (`lib/pdf-editorial/determinismo.test.ts`), há teste de ouro
com `sha256` (no ramo `codigo/fase-0-e-1`), o desenho foi aprovado por ela
(PR #273), e a proposta online calcula o conteúdo uma vez e guarda
(`docs/PROPOSTA-WEB.md:90-96`). A proposta pesa 98 KB de JavaScript (tecto 160).
O que falta:

- **O gerador antigo saiu (18/11):** `src/lib/proposal-doc-pdf.ts` (3 469
  linhas) e os testes e guiões de medição que só a ele diziam respeito. O tipo
  `DocTruncation` vive em `pdf-editorial/cortes.ts`, e o `proposal-doc-render.ts`
  só tem o caminho editorial. Ficam por limpar, num PR à parte, as funções que
  só ele usava em `proposal-geometria.ts`, `proposal-image.ts` e
  `proposal-storage.ts` (derivada da capa, miniaturas, caixas do collage).
- **Poucos testes para o peso:** `lib/pdf-editorial` tem rácio 0,42 linhas de
  teste por linha de código, `lib/proposta-de-pdf` 0,49 (§2.9 do documento de
  estrutura).
- **A proposta do casal leva o `sharp`** sem o usar (arranque a frio mais
  lento, `peso-das-rotas.mjs`).
- **Não medido:** a página web e o PDF com uma proposta de teste (não há dados
  de teste carregados nesta máquina). A página de «proposta não encontrada»
  está bem: em PT e EN, com o aviso legal.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 6.1 | ~~Tirar as funções vivas do `proposal-doc-pdf.ts` para um módulo próprio e apagar o resto~~ feito a 18/11 | infraestrutura | alto · M | `grep proposal-doc-pdf src` só em testes ou vazio; o teste de ouro do PDF igual |
| 6.2 | Juntar o teste de ouro (`codigo/fase-0-e-1`) ao lote | infraestrutura | alto · P | Três PDFs presos por `sha256` no CI do lote |
| 6.3 | Subir os testes do motor do PDF: um teste por regra de capítulo, de paleta e de disposição | infraestrutura | médio · M | Rácio de `lib/pdf-editorial` ≥ 0,8 |
| 6.4 | A proposta do casal sem o `sharp` no pacote da função | infraestrutura | médio · P | `peso-das-rotas.mjs` diz que a rota da proposta não leva bibliotecas de imagem |
| 6.5 | Um passeio que abra uma proposta de teste a 390/768/1440, claro e escuro, e compare a página web com o PDF (mesmos títulos, mesmos preços, mesmas fotografias) | infraestrutura | alto · M | Passeio bloqueante no CI; falha se um preço ou um capítulo divergir |

### Para o 10

As referências: as propostas da **Aman** e da **Belmond** para casamentos, os
convites digitais da **Paperless Post** e as propostas da **Qwilr**/**Pitch**.
O 10 seria: o casal abre o link e sente que é uma revista feita para ele; a
página carrega em < 1 s no telemóvel; pode aceitar e pagar o sinal ali mesmo.
**Realista:** o desempenho e a coerência total PDF/web. **Decisão dele:**
aceitar e pagar online (mexe em dinheiro e em comissões).

---

## 7. Segurança — 8/10

**Porquê 8.** Bem acima da média de um site deste tamanho:

- **Cabeçalhos medidos** em `next start`: CSP com `object-src 'none'`,
  `base-uri 'self'`, `form-action 'self'`, `frame-ancestors` fechado,
  `upgrade-insecure-requests` e relatórios; HSTS com `preload`; COOP
  `same-origin`; CORP; `Permissions-Policy` apertada; `Referrer-Policy`.
- **Entrada:** palavra-passe com bcrypt, TOTP e passkeys
  (`src/lib/admin-auth.ts:550`); revogação de sessões; um teste que percorre
  TODAS as rotas e prova que cada uma recusa sem sessão antes de tocar nos
  dados (`src/app/api/auth-guard-audit.test.ts`).
- **Base:** RLS ligado nas 30 tabelas, sem políticas — ninguém lê com a chave
  pública, só o servidor (conselheiro do Supabase, nível INFO).
- **Cadeia:** `npm audit --omit=dev` → 0 vulnerabilidades; CodeQL, Semgrep,
  gitleaks e Scorecard no CI; Next 16.4.5 (GHSA-mfr8-8qww-v76h fechado hoje).

O que impede o 9:
- **Sem Upstash em produção.** As variáveis da Vercel não têm nenhuma
  `UPSTASH_*` (lista de nomes lida hoje, sem valores). Os limites de
  tentativas `{ global: true }` das portas de contas e envios caem para a
  memória de cada instância, como o `SECURITY-BACKLOG.md` B8 avisava. Um
  ataque distribuído por várias instâncias passa mais tentativas do que o
  tecto diz.
- **Ninguém vê um ataque.** Não há `SENTRY_DSN` nem `ERROR_WEBHOOK_URL` em
  produção: os erros e os relatórios de CSP ficam só nos registos da Vercel.
- **`script-src 'unsafe-inline'`** fica, com razão medida e escrita
  (`next.config.ts:649-690`): as páginas são estáticas, não há nonce. É uma
  limitação conhecida, não um descuido.
- **Repositório:** o `PLANO-SITE-E-GALERIA.md` diz que é público. Não se
  conseguiu confirmar. Se for, os documentos de segurança e os comentários
  sobre como a CSP e as sessões funcionam são um mapa para quem ataca.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 7.1 | Criar a base Upstash gratuita (sem cartão) e pôr as duas variáveis na Vercel | infraestrutura | alto · P | `rate-limit.global.test.ts` verde; em produção, 25 tentativas de entrada de IPs diferentes em instâncias diferentes dão 429 no tecto certo; uso do Upstash < 10 % do gratuito |
| 7.2 | Alerta de erros e de segurança (ver 10.1) com os relatórios de CSP agrupados | infraestrutura | alto · P | Um erro de teste chega ao alerta em < 5 min |
| 7.3 | Confirmar a visibilidade do repositório; se for público, passar a privado (é grátis) | infraestrutura | alto · P | `gh repo view --json visibility` → `PRIVATE` |
| 7.4 | Corrigir os itens restantes do `SECURITY-BACKLOG.md` (B6 `connect-src` do Supabase quando as escritas diretas ligarem, B7 custo do bcrypt a 12 verificado no arranque) | infraestrutura | médio · P | O documento com cada item fechado ou com a razão de ficar |

### Para o 10

A referência é a **Stripe** e a **1Password**: CSP com nonce ou `hash` em
todas as páginas, sessões de curta duração com passkeys obrigatórias,
auditoria externa anual, programa de recompensas. **Realista:** passkeys
obrigatórias para as contas de equipa e uma revisão externa gratuita (OWASP
ZAP no CI). **Não realista sem custo:** auditoria externa paga e CSP com nonce
(obrigaria a renderizar todas as páginas por pedido, o que o custo não deixa).

---

## 8. Legal e privacidade — 8/10

**Porquê 8.** O trabalho de hoje deixou isto muito perto do 9:
- **Consentimento medido:** sem escolher, e com «Recusar», a entrada não fala
  com nenhum domínio externo e não guarda o `gclid`/`fbclid` (abri com
  `?gclid=TESTE123&fbclid=TESTE456`). Com «Aceitar», carrega a Google e guarda
  `_gcl_aw` com o identificador. Exatamente o que a regra pede
  (`.claude/rules/legal.md`).
- **Os 12 meses existem em código:** `src/lib/retencao.ts`, a correr depois da
  cópia de segurança (`api/cron/backup/route.ts:381`) — o B1 do
  `SECURITY-BACKLOG.md` está resolvido.
- **Livro de Reclamações, CNIACC e Portal do Consumidor** no fim de todas as
  páginas públicas, incluindo a proposta não encontrada (captura), sem a
  plataforma ODR extinta. «Gerir cookies» no rodapé.
- **A política** nomeia Vercel, Supabase, Upstash, DeepL, Google, Meta,
  Anthropic, Moloni e Gmail, com transferências para fora do EEE e a CNPD
  (`src/app/[lang]/(site)/legal/legal-content.ts`).

O que falta:
- **A barra de cookies falha o contraste** (área 3) — uma barra de
  consentimento difícil de ler fragiliza o «consentimento informado».
- **A lista de prestadores não bate com o que corre:** a política nomeia o
  Upstash, que não está ligado em produção (fica certo se se fizer o 7.1); se
  se ligar o Sentry (10.1), tem de entrar na política no mesmo PR.
- **O apagamento a pedido do titular** (B3 do `SECURITY-BACKLOG.md`): não se
  verificou hoje se `apagar-pedido.ts` limpa mensagens, contratos, faturas e
  ficheiros do Storage.
- **Fora da nota, por decisão do dono:** a identificação legal no site
  (`.claude/rules/legal.md`). Não se propõe nada aqui.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 8.1 | Contraste da barra de cookies (é o 3.1) | **visual** | alto · P | ver 3.1 |
| 8.2 | Um teste que prenda a lista de prestadores da política às variáveis que existem em produção (por exemplo, `SENTRY_DSN` ligado ⇒ «Sentry» na política) | infraestrutura | médio · P | O teste falha se se ligar um serviço sem o nomear |
| 8.3 | Provar o apagamento completo: um teste que crie um pedido com mensagens, proposta, contrato e fotografias, apague, e procure resíduos em todas as tabelas e baldes | infraestrutura | alto · M | Zero resíduos; o B3 do backlog fechado |
| 8.4 | O passeio de consentimento (o que se fez hoje à mão) no CI, nas três escolhas | infraestrutura | médio · P | Falha se sair um pedido para a Google/Meta antes de «Aceitar» |

### Para o 10

A referência é a **Basecamp/37signals** e a **Apple** (políticas curtas,
legíveis, com um resumo em cima) e o **Proton** (privacidade como argumento
de venda). O 10 seria: uma política com «o essencial em 5 linhas» por cima do
texto formal, um painel onde o cliente descarrega ou apaga os seus dados
sozinho, e o registo das atividades de tratamento publicado. **Realista:** o
resumo em cima e o pedido de apagamento por um formulário. **Decisão dele:**
qualquer mudança ao texto formal.

---

## 9. Custo — 6/10

**Porquê 6.** As regras são exemplares (lotes, `comCpu`, `vercel-construir.mjs`
que recusa construções fora dos lotes, Upstash só nas portas, travões no
Blob), mas **o risco maior está aberto**:

- **Supabase quase cheio:** 913 MB de 1 GB a 16/11
  (`docs/GASTAR-POUCO-DESDE-O-INICIO.md:495`), com os PDF a crescer ~100 MB por
  mês. No ritmo descrito, o gratuito acaba **em cerca de um mês**. O Blob que
  tira ~590 MB do Supabase (`proposal-pdfs`, `theme-assets`, `proposal-assets`)
  está construído e **desligado** (não há `BLOB_READ_WRITE_TOKEN` na Vercel).
  Não se mediu o número de hoje no painel do Supabase.
- **Saída do Supabase:** um dia de trabalho dela dava ~180 MB, o que a esse
  ritmo seria ~5,4 GB/mês, acima dos 5 GB (`GASTAR-POUCO…md:195`); houve
  medidas desde então, mas o número atual não está medido.
- **Vercel, um dia (15/11 08:00 → 16/11 08:00):** custo efetivo 0,98 USD,
  faturado 0,31 USD; o maior item faturado é o **armazenamento das
  implantações** (0,17 USD/dia), seguido dos minutos de construção (0,11). As
  funções (CPU, memória, invocações) somam menos de 0,01 USD. Não se juntou o
  mês inteiro (a API recusa intervalos grandes); a leitura do «efetivo vs.
  faturado» confirma-se no painel.
- **Base de dados:** 36 MB de 500 (10/11) — folga enorme.
- **Ruído nos registos:** o aviso das variáveis opcionais apareceu 1 438 vezes
  em 7 dias (já corrigido no lote, `scripts/variaveis-de-ambiente.mjs`).

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 9.1 | Ligar o Blob: `proposal-pdfs` em `espelho` uma semana, depois `blob`; a seguir `theme-assets` e `proposal-assets` | infraestrutura | **crítico** · M | Supabase < 600 MB; zero fotografias em falta nos registos; o uso do Blob dentro do crédito do Pro |
| 9.2 | Um aviso automático aos 80 % de cada plano (Supabase ficheiros e saída, Vercel, Upstash, Blob), no bloco «Hoje» | infraestrutura | alto · M | O aviso aparece num teste com o contador a 81 % |
| 9.3 | Apagar implantações antigas (uma política de retenção na Vercel, e menos pré-visualizações) | infraestrutura | médio · P | «Deployment Storage» a descer para metade no mês seguinte |
| 9.4 | Juntar os duplicados por conteúdo (160 MB em 1 525 cópias, `GASTAR-POUCO…md:213`) | infraestrutura | médio · M | ≥ 100 MB libertados, provado por `sha256`, nada apagado sem cópia |
| 9.5 | Um quadro mensal com os números reais de cada serviço em `docs/medicoes/` | infraestrutura | médio · P | Uma linha por mês, a partir de dezembro |

### Para o 10

A referência é a **37signals** a sair da nuvem e a **Plausible** a correr um
negócio inteiro em infraestrutura mínima: cada euro sabido, cada serviço
medido. O 10 seria: o mês fechado abaixo dos 20 € na Vercel com folga de 30 %,
todos os gratuitos abaixo dos 50 %, e um alarme antes de qualquer subida.
**Realista**, depois de 9.1–9.4.

---

## 10. Fiabilidade e testes — 7/10

**Porquê 7.** A rede de testes é das maiores que se veem num projeto deste
tamanho: 1 110 ficheiros de teste de unidade, 82 em `e2e/`, CI repartido em 5
partes com passeios bloqueantes de imagens, dados, telemóvel, propostas,
passkeys, «sem rede», vidro e movimento (`.github/workflows/ci.yml`). A última
corrida completa do CI do lote passou (`358f6ad6`, corrida 2480). Mas a
produção conta outra história:

**Registos de produção, 7 dias (Vercel):**
- **3 × «Task timed out after 60 seconds».**
- **A cópia de segurança de 16/11 saiu incompleta:** `proposalEmails` falhou
  com `PGRST303 JWT issued at future` (relógio), e a retenção ficou para o dia
  seguinte.
- **80 bloqueios da CSP ao Google Analytics** (`region1.analytics.google.com`)
  — o `connect-src` tem `region1.google-analytics.com` e `analytics.google.com`
  mas não `region1.analytics.google.com` (`next.config.ts:559`). Visitas
  medidas a perder-se, depois de a pessoa ter aceitado.
- **81 bloqueios a um `eval`** no estúdio (área 5).
- Erros do browser no site: 7 × «Cannot read properties of undefined (reading
  'catch')» (`/sobre`, `/termos`, `/servicos/festas-e-aniversarios`…);
  2 × «ResizeObserver loop limit exceeded» na galeria e em serviços; 3 × «ra»
  num iPad na galeria.
- **10 notificações sem chaves VAPID**, entre elas «Novo pedido de orçamento»:
  a equipa não recebe o aviso no telemóvel (o e-mail segue). Faltam
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` na Vercel.
- Os registos dão só os 50 grupos mais frequentes; o que vem abaixo não se viu.
- **10 × «Could not find the 'urls' column of 'biblioteca_fotos'»** a 12/11 —
  a migração `db/migracoes/20261114_biblioteca_fotos_urls.sql` chegou depois.
- **Nenhum monitor:** sem `SENTRY_DSN` nem `ERROR_WEBHOOK_URL` em produção.
  Tudo isto só se vê porque alguém foi ler os registos.

**No CI:** os passeios gerais correm em «E2E informativo» (`ci.yml:275`), e o
Lighthouse tem `continue-on-error: true` com mínimo 0,6.

**Testes de unidade hoje** (`npx vitest run`, uma passagem só, nesta máquina
partilhada com carga média de ~17): **14 619 passaram, 6 falharam, 2
saltados**, em 1 115 ficheiros e 31 minutos. Os 6 que falharam estão em 4
ficheiros — `AdminClient.apagar.test.tsx` (tempo esgotado de 20 s),
`ProposalStudio.parte-1.test.tsx`, `ProposalStudio.parte-4.test.tsx` (três:
um `waitFor` esgotado e duas caixas de e-mail ainda vazias) e
`Tarefas.lote.test.tsx`. **Corridos sozinhos, os 4 ficheiros passam (176 de
176).** Não são regressões; são testes que dependem do tempo e caem quando a
máquina está carregada — exatamente o tipo de instabilidade que, no CI, se
paga com corridas repetidas e confiança perdida.

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 10.1 | Monitor de erros gratuito (o webhook para Discord/Slack que o `logger.ts` já suporta; ou o Sentry Developer, só se se confirmar que não pede cartão — regra de `custo.md`) e nomeá-lo na política (8.2) | infraestrutura | **crítico** · P | Um erro de teste chega em < 5 min; resumo diário dos novos grupos |
| 10.2 | Corrigir o `connect-src` (`region1.analytics.google.com`) com um teste que prenda os domínios que o `gtag` usa hoje | infraestrutura | alto · P | Zero «CSP violation connect-src» da Google em 7 dias |
| 10.3 | A cópia de segurança tolerante ao relógio: voltar a tentar o conjunto que falhou, e um alerta quando sai incompleta | infraestrutura | alto · P | Um teste com `PGRST303` na primeira tentativa acaba completo; alerta enviado quando não |
| 10.3b | Gerar as chaves VAPID (grátis) e pô-las na Vercel, se ela quiser os avisos no telemóvel | infraestrutura | médio · P | Um «Novo pedido» de teste chega como notificação; zero «sem chaves VAPID» nos registos |
| 10.4 | Os três erros do browser no site, cada um com um teste | infraestrutura | médio · P | Zero «site no browser» repetidos em 7 dias |
| 10.5 | Os passeios gerais passam de informativos a bloqueantes (ou os instáveis saem para uma lista própria com prazo) | infraestrutura | alto · M | `continue-on-error` só em passeios marcados; taxa de instabilidade medida < 1 % |
| 10.5b | Os 4 ficheiros que caem sob carga deixam de depender do relógio (tempos falsos, `findBy` com o que se espera em vez de `waitFor` largo) | infraestrutura | médio · P | A suite inteira passa 3 vezes seguidas com `--maxWorkers` no dobro dos processadores |
| 10.6 | Um orçamento de erros: «zero erros novos em produção por semana», lido de forma automática | infraestrutura | médio · M | Um quadro semanal em `docs/medicoes/` |

### Para o 10

A referência é a **Stripe** (testes de contrato em cada fronteira, «canaries»)
e a **Linear** (zero regressões visíveis, alertas antes do cliente notar). O
10 seria: cada erro de produção vira teste no mesmo dia, publicação com
reversão automática se a taxa de erro subir, e 99,95 % de disponibilidade
medida. **Realista:** os alertas, a reversão manual em 1 minuto (a Vercel já
o faz) e a disponibilidade medida com um monitor gratuito.

---

## 11. Estrutura do código — 5/10

**Porquê 5.** As linhas são de boa qualidade (zero `any`, `strict`, nenhum ciclo
de valores no arranque, duplicação baixa, PDF determinístico), mas **o lote não
tem nenhuma das partições de hoje**, e a regra do dono (`.claude/rules/codigo.md`)
põe a fasquia nos 400 linhas por ficheiro:

**No lote (medido):**
- `ProposalStudio.tsx` 16 868 linhas · `AdminClient.tsx` 9 524 · `Temas.tsx`
  6 464 · `proposal-doc-pdf.ts` 3 469 · `Tarefas.tsx` 3 261 · `ThemePicker.tsx`
  3 181 · `GaleriaClient.tsx` 2 740 · `Calendario.tsx` 2 684 · `Overview.tsx`
  2 416 · `proposta-doc/route.ts` 2 137.
- **201 ficheiros de produção com mais de 400 linhas.**
- 428 asserções `as T` em produção; 61 das 79 rotas que leem o corpo sem
  esquema (§2.6 do documento de estrutura).
- `src/lib/` com 255 ficheiros soltos na raiz; a pasta do back office com 143
  componentes.

**O que os ramos `codigo/*` já resolvem (nenhum está no lote):**

| Ramo | O que faz | Júri | Estado |
|---|---|---|---|
| `codigo/estrutura-de-topo` | o documento `ESTRUTURA-DO-CODIGO.md` (princípios, raio-X, plano em 10 fases) | — | só documento; vai com os outros |
| `codigo/fase-0-e-1` | as guardas (teste de ouro do PDF, catraca de tamanho para 193 ficheiros, `madge` de ciclos no CI, `complexity` no ESLint) e a lógica pura do estúdio para `lib/orcamento/estudio/` (16 063) | revisão independente feita | pronto para juntar |
| `codigo/estudio-fases-2-a-4` | 30 peças pequenas para `admin/estudio/`, gravação numa máquina de estados, sete secções em `estudio/passos/` — `ProposalStudio.tsx` 15 994 → 13 277 | **5,5/10, «ainda não»** | por acabar |
| `codigo/rota-e-esquemas` | `proposta-doc/route.ts` 2 115 → 133 linhas, 20 ficheiros em `lib/orcamento/envio/`, 53 retratos iguais antes/depois; esquemas zod em cinco rotas em modo de observar | **«ao nível» à 7.ª ronda** | pronto para juntar |
| `codigo/admin-e-temas` | `AdminClient` 9 505 → 4 111 (complexidade 223 → 62), `Temas` 6 464 → 4 037, `ThemePicker` 3 181 → 2 556, `Propostas`, `Tarefas` (3 261 → 2 387), Calendário, CommandPalette, Contratos, Fornecedores e Material abaixo do tecto; fronteiras das casas no ESLint | 6/10 e depois as quatro correções pedidas; sem nota final escrita | precisa de nova nota ≥ 9 |

**Atenção ao juntar:** os quatro ramos partem todos do mesmo
`codigo/fase-0-e-1`, mas dois mexem no `ProposalStudio.tsx` e dois nos testes
que leem o texto dos componentes (`fonte-do-admin.testkit.ts`). O
`rota-e-esquemas` tem várias bases de junção com o lote (`git diff` avisa).

### Para o 9

| # | Ponto | Tipo | Impacto · esforço | Critério de aceitação |
|---|---|---|---|---|
| 11.1 | Juntar pela ordem: `fase-0-e-1` → `rota-e-esquemas` → `admin-e-temas` → `estudio-fases-2-a-4`, um lote cada, com capturas iguais ao píxel e o teste de ouro do PDF | infraestrutura | **crítico** · G | Cada um com júri ≥ 9 escrito no ramo; CI verde; e2e de propostas 9/9 |
| 11.2 | O estúdio até ao fim do plano (fases 3–4: estado por domínio, um ficheiro por passo) | infraestrutura | alto · G | `ProposalStudio.tsx` < 1 000 linhas; nenhuma função > 30 de complexidade |
| 11.3 | Esquemas em todas as rotas que leem o corpo, e o modo de observar a passar a recusar depois de 7 dias limpos | infraestrutura | alto · M | 79/79 rotas com esquema; zero `as Quote` na fronteira |
| 11.4 | `src/lib/` por domínio (proposta, pedidos, temas, armazenamento…) | infraestrutura | médio · G | < 30 ficheiros na raiz de `lib/` |
| 11.5 | A catraca de tamanho a descer: nenhum ficheiro novo > 400; os existentes só podem descer | infraestrutura | alto · P | Já existe no `fase-0-e-1`; fica no lote |

### Para o 10

A referência é o código aberto da **Cal.com**, do **Excalidraw** e do
**Linear** (onde se vê), e os guias da **Vercel** para o App Router:
pastas por domínio, núcleo puro, casca fina, Server Components por omissão,
esquema em cada fronteira, nenhum ficheiro que precise de scroll horizontal
mental. O 10 seria um programador de topo abrir o repositório e encontrar
cada regra de negócio num sítio só, em 30 segundos. **Realista em 3–4
semanas** de trabalho focado, se as fases 0–10 do `ESTRUTURA-DO-CODIGO.md`
forem até ao fim. **Risco:** cada fase mexe no ecrã que ela usa todos os dias;
a regra «capturas iguais ao píxel» é o que o torna seguro.

---

## O plano, por semanas

| Semana | O quê | Áreas que sobem |
|---|---|---|
| 1 | 9.1 (Blob), 10.1 (alertas), 10.2/5.1 (CSP), 7.1 (Upstash), 7.3 (repositório), 10.3 (cópia), 2.6/10.5 (CI bloqueante) — tudo infraestrutura | Custo 6→8, Fiabilidade 7→8, Segurança 8→9 |
| 1 | Mostrar-lhe 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2 com capturas do antes e do depois, e esperar o sim | — |
| 2 | 11.1 (juntar os ramos `codigo/*`), 6.1, 6.2, 2.1, 2.2, 2.4 | Estrutura 5→7, Desempenho 8→9, PDF 8→9 |
| 2–3 | Os pontos visuais aprovados; 3.4, 3.5, 8.2–8.4, 4.2 | Site 7→9, Acessibilidade 8→9, Legal 8→9 |
| 3–4 | 11.2–11.3, 5.2–5.5, 4.3–4.5, 9.2–9.5 | Estrutura 7→9, Fazer proposta 7→9, BO 7→9, Custo 8→9 |

Cada semana termina com este documento atualizado: a nota nova, a prova, e o
que ficou.
