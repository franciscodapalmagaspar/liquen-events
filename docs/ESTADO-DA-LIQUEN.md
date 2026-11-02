# O estado da Líquen — para quem vem avaliar a qualidade

> **Data:** 2 de novembro de 2026, lido sobre o `main` (`0d4c0de`) e os PRs
> abertos nesse dia.
> **Para quê:** é o ponto de partida de um agente (ou de uma pessoa) que vai
> avaliar a qualidade da Líquen e propor o que falta para o nível dos estúdios
> internacionais de topo. Não é uma ordem de trabalho: é um retrato, com o que
> está feito, o que está medido, o que falta, e as decisões que a dona do
> projeto já tomou e que não se devem desfazer sem lhe perguntar.
> **Regra de leitura:** onde se diz «não verificado», é porque não se
> conseguiu confirmar — não porque esteja mal. Tudo o resto tem um ficheiro
> ou uma medição por trás, e o caminho vai ao lado.

---

## 0. O que é a Líquen, em três linhas

A **Líquen Events** é um estúdio português de decoração e organização de
eventos (casamentos sobretudo, e eventos de empresa). O produto digital tem
três partes que vivem no mesmo repositório (Next.js na Vercel, Supabase):

1. **O site público** (`liquen-events.com`), em português e inglês — montra,
   galeria, serviços e o pedido de orçamento.
2. **O back office** (`/orcamento/admin`) — onde a equipa recebe os pedidos,
   faz as propostas, gere o calendário, as tarefas, os guiões do dia, o mapa
   de mesas, o material e a biblioteca de fotografias de inspiração.
3. **As propostas** — um PDF editorial desenhado de raiz e uma proposta online
   (`/proposta/[token]`) que o casal abre no telemóvel, as duas a partir do
   mesmo motor.

A referência de qualidade que a dona escolheu está escrita: o sistema de
design da Apple (os documentos `APPLE-*.md` e `DESIGN-SYSTEM.md`) e estúdios
como a Pixelmatters (`PADRAO-PALUMEN.md`, a fasquia B0–B23).

---

## 1. Como está construído

| Camada | O que é | Onde |
|---|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 | `package.json`, `AGENTS.md` (avisos desta versão) |
| Estilo | Tailwind v4 com tokens próprios; CSS do back office separado | `src/app/globals.css`, `tema.css`, `admin.css`, `docs/DESIGN-SYSTEM.md` |
| Movimento | GSAP (SplitText, carregado tarde), Lenis só com rato, curvas e durações em tokens | `src/lib/motion/`, `src/components/motion/` |
| Dados | Supabase (Postgres + Storage); em desenvolvimento, ficheiros JSON locais | `src/lib/repository.ts`, `db/schema.sql`, `db/migracoes/` |
| PDF | `pdf-lib` + `fontkit` (desenho), `pdfjs-dist` (páginas em imagem), `sharp` | `src/lib/pdf-editorial/` |
| Autenticação | palavra-passe (bcrypt), TOTP, **passkeys** (WebAuthn), limites de tentativas | `src/lib/admin-auth.ts`, `docs/passkeys.md` |
| Email | SMTP (`nodemailer`), modelos editáveis no back office | `src/lib/mail.ts`, `docs/email-dominio-proprio.md` |
| Tradução | DeepL para as propostas em inglês | `src/lib/proposal-traducao-deepl*` |
| Alojamento | Vercel; crons de lembretes (07:00) e cópia de segurança (04:00) | `vercel.json` |

**Ficheiros grandes** (onde vive a maior parte da complexidade, e a dívida):
`ProposalStudio.tsx` (~15 300 linhas), `AdminClient.tsx` (~8 800),
`Temas.tsx` (~6 300).

---

## 2. O site público

| Página | O que tem de especial |
|---|---|
| `/` | Fotografia no herói (é o LCP) com **vídeo por cima** (3 takes, 50 fps, H.264/VP9, versões deitada/ao alto/leve, escada de qualidade automática «como o YouTube»); fita de logótipos; serviços em painéis que rodam; CTA |
| `/galeria` | ~900 fotografias em 12 colecções, filtros, fila «justificada» sem cortes, visualizador próprio (FLIP, deslize com mola, teclado), AVIF/WebP |
| `/servicos`, `/servicos/[slug]` | duas famílias (Celebrações, Empresas), 5 serviços |
| `/sobre`, `/clientes` | manifesto e fundadora; 19 logótipos e testemunhos |
| `/orcamento` | o formulário de pedido (o ponto de conversão principal) |
| `/casamentos/[região]`, `/casamentos/estilo/[estilo]`, `/casamentos/destination` | páginas de entrada para anúncios (13 regiões, 3 estilos), com formulário curto |
| `/s/[slug]` | entradas dos anúncios Meta (`noindex`) |
| `/contacto`, `/privacidade`, `/termos` | canais, FAQ, textos legais |

**Comum a todas:** português em `/` e inglês em `/en/*` (com troca de língua
sem clarão); botão de WhatsApp; aviso de cookies com Consent Mode v2 (que
reserva o espaço e não tapa o herói); Google tag só depois do primeiro gesto;
Web Vitals reais enviados para `/api/vitals`.

**Pesquisa e IAs:** JSON-LD (`Organization`/`ProfessionalService`, `WebSite`,
`BreadcrumbList`, `FAQPage`, `Service`, `ItemList`), `hreflang` pt-PT/en/
x-default, sitemap com 62 endereços, `llms.txt`, `robots.txt` a nomear os
robôs das IAs. Sem `LocalBusiness` nem morada — **de propósito** (ver
`src/lib/site.ts`).

O inventário completo do site, página a página, está em
`docs/INVENTARIO-DO-SITE.md` (31/10).

---

## 3. O back office

A navegação é uma **barra de baixo** (decisão dela, ver §8). No computador
mostra todas as vistas; no telemóvel, quatro.

| Vista | Para que serve |
|---|---|
| **Visão Geral** | o dia e os próximos sete dias, o que pede atenção |
| **Pedidos** | a lista de pedidos de orçamento; tocar num cliente abre a proposta dele no ecrã todo (desde 2/11 é assim em TODAS as portas — Visão Geral, Kanban, Calendário, Propostas, ⌘K…; um evento já ganho abre o Dossier; o painel antigo do pedido só abre pelo «Abrir o pedido» da página); etiqueta «Possível duplicado» (mesmo email, telefone, ou nome e data) com «Não são o mesmo» |
| **Fazer proposta** | o estúdio de propostas (§4) |
| **Propostas** | as enviadas e os rascunhos |
| **Calendário** | dia, semana, mês e ano; agrupado por mês; **arrastar uma marcação para outro dia com «Anular»** (e «Mudar de dia…» pelo teclado); exportar `.ics`; grelha `role="grid"` acessível |
| **Tarefas** | lista com linguagem natural, painel de detalhe, arrastar (onze de onze fases do documento) |
| **Timelines / Guiões do dia** | o guião da manhã do evento, com régua, modelos e PDF — monta o editor que já existia, não um segundo |
| **Mapa de mesas** | sala em SVG, arrastar, sentar automaticamente, PDF, partilha |
| **Propostas Aceites** | contratos e o que se gera ao ganhar um evento |
| **Material** | o catálogo de logística |
| **Temas** | a biblioteca de fotografias de inspiração, ao jeito da app Fotografias: split view, arrastar entre temas, Quick Look no Espaço, selecção múltipla, grelha toda pelo teclado (`role="grid"`) |
| **Estatísticas**, **Definições** | números do negócio; os valores com que o estúdio faz contas |
| **Entrada** | passkey primeiro, palavra-passe por divulgação progressiva, fotografia do dia, saudação pela hora de Lisboa |

Vistas que ainda funcionam por link mas saíram do menu a pedido dela:
Clientes, Kanban, Acompanhamento, Fornecedores, Inventário, Modelos de email,
Biblioteca de serviços.

**Tudo reversível:** apagar vai para uma reciclagem de 30 dias; «Anular» de
10 s nos gestos destrutivos; 10 s para cancelar um envio
(`docs/TUDO-REVERSIVEL.md`).

---

## 4. As propostas

**O estúdio** (`FazerProposta.tsx` → `ProposalStudio.tsx`):
- cinco passos — Evento, Serviços, Inspiração, Orçamento, Rever e enviar —
  num formulário só, sempre montado, gravado a cada 800 ms;
- **uma regra única** decide se se pode enviar (`proposal-progress.ts`,
  `oQueFaltaParaEnviar`): o ecrã trava e o servidor recusa com 422 as mesmas
  faltas;
- é obrigatório **ver o PDF final** antes de enviar;
- versões, «Criar a partir de…», modelos, tradução para inglês;
- aviso de qualidade das fotografias ao carregar («Avisa, não bloqueia»).

**O PDF editorial** (`src/lib/pdf-editorial/`): desenho fotográfico aprovado a
23/10 — Jost, Bodoni só no preço total, fundos «arrastados» nas páginas de
texto, capítulos por momento do casamento, paleta das mesas. O número de
páginas que o estúdio mostra vem do mesmo plano (`plano.ts`) e um teste
prende-o ao PDF. Documentos: `PDF-DESIGN-NOVO.md` (o que manda no desenho) e
`PDF-EDITORIAL.md` (dados e lógica).

**A proposta online** (`/proposta/[token]`): uma página web própria, desenhada
pelo protótipo dela, cujo conteúdo vem do **mesmo motor** do PDF — a página e
o PDF não podem dizer coisas diferentes. Mosaico de fotografias com visualizador
refeito a 1/11 (a pequena primeiro, a grande por cima quando chega, vizinhas
já pedidas, fechar a puxar para baixo). Nenhum pedido a terceiros
(`zero-rastreio.test.ts`). O casal pode escolher entre alternativas.

**Envio e aceite:** por email e/ou WhatsApp. **Não há botão «Aceitar»** — é
uma decisão dela (o casal responde, a equipa marca), protegida por um teste.

---

## 5. Como a qualidade se garante

**Testes**
- ~960 ficheiros de teste unitário/componente (vitest + Testing Library); só
  o back office tem **4 032 testes** (medido a 2/11).
- ~60 passeios Playwright, com `axe-core` (acessibilidade), em várias
  configurações (computador, telemóvel, toque, propostas, passkeys).

**CI** (`.github/workflows/`, ver `docs/VERIFICACOES.md`)
- lint, tipos, build, `npm audit`, **tecto de JavaScript por rota**;
- testes unitários em 5 partes, E2E em várias partes;
- E2E **bloqueantes** em produção para desempenho do back office, galeria,
  movimento, vidro e funcionamento sem rede;
- Lighthouse em cada PR (orçamentos em `lighthouse.yml`; desempenho como aviso,
  acessibilidade e SEO como erro);
- segurança: CodeQL, Semgrep (quatro regras próprias bloqueantes), gitleaks,
  OpenSSF Scorecard, Dependabot, imagem de contentor com SBOM e Trivy.

**Segurança no site**: CSP restrita (com relatórios), HSTS com `preload`,
`Permissions-Policy`, `X-Frame-Options`, `nosniff`. O `script-src` mantém
`'unsafe-inline'` — troca medida e aceite (os nonces obrigavam as páginas
estáticas a passarem a dinâmicas).

**Números medidos** (`docs/medicoes/RESUMO.md`, Lighthouse no telemóvel com
rede e CPU travadas, mediana de 3):

| Página | Desempenho | LCP | CLS |
|---|---|---|---|
| início | 95 | 1,0 s | 0 |
| serviços | 93 | 1,0 s | 0 |
| galeria | 99 | 1,9 s | 0 |
| orçamento | 100 | 1,0 s | 0 |

- Acessibilidade 100 (o `/orcamento` estava a 96, corrigido depois); Boas
  práticas e SEO a 100.
- Galeria em produção: LCP de 3,5 s → **1,35 s** (1/11).
- Proposta online: desempenho 95, acessibilidade 100, LCP 1,0 s.
- Back office: axe limpo nas 21 vistas; JS do painel 486 kB (tecto 520 kB).

---

## 6. O que se fez na ronda de 1–2 de novembro

Tudo com CI verde e junto (estado a 2/11, 09h).

**Site**
- Vídeo da entrada deixou de travar no Chrome do computador (deixou de se
  aquecer o take seguinte a tocar escondido — só o iPhone precisa disso) (#333).
- Fonte do aviso de cookies e LCP da galeria (#334); botão do WhatsApp sem
  piscar na troca de língua (#335); títulos com entrada leve no telemóvel (#340).
- CSP: as conversões do Google Ads e as visitas do GA4 deixaram de ser
  recusadas (#339, #343, #347) — verificado na consola do sítio publicado:
  zero erros, no iPhone e no computador.
- Vídeo da entrada no computador: desce sozinho à versão leve quando pára com
  o vídeo já descarregado (#350), e deixa de saltar de take nessas paragens
  (#352) — o registo anónimo de 2/11 mostrou 40 paragens em 15 s e takes de
  ~3 s num computador com 7–9 s de vídeo à frente. **Não verificado** ainda
  numa visita real de Chrome no computador.

**Proposta online**: o visualizador das fotografias refeito (#332).

**Back office**
- Pedidos: «Possível duplicado» (#336).
- Calendário: arrastar com «Anular», «Mudar de dia…», exportar, agrupado por
  mês, apagar pelo teclado (#337, #342, com migração `updated_at` aplicada).
- Todas as portas para um cliente (Visão Geral, Kanban, Calendário,
  Propostas, ⌘K…) abrem a página da proposta; um evento ganho abre o Dossier;
  o painel antigo só pelo «Abrir o pedido» (#349, #353).
- Temas: a grelha das fotografias passa a `role="grid"` pelo teclado (#344).
- Entrada: raios concêntricos (26/10), grelha de 4, entrada em dois tempos;
  o `LOGIN.md` fica sem nada por fazer (#341, #345).

**Propostas — aprovadas por ela a 2/11** (mexem no PDF):
- **#346 (A3):** quando ela não escolhe a foto de uma página inteira, o PDF
  escolhe pela régua de qualidade (boa > fraca > má), abaixo da regra «nunca a
  mesma foto em páginas seguidas» (decisão dela).
- **#348 (A1):** a página REAL do PDF ao lado do formulário, desenhada sozinha
  em 0,3–0,7 s (contra 5,5 s do PDF inteiro), igual píxel a píxel.

---

## 7. O que falta, e as lacunas conhecidas

### 7.1 Itens por fazer nos documentos dela
| Onde | O que falta |
|---|---|
| `FAZER-PROPOSTA-MELHORIAS.md` | A1 (parcial depois do #348: capa/serviços/orçamento no painel, tira de miniaturas, «Ver a página» em ecrãs estreitos); C2/C3 (caixas tratadas guardadas, versão de 1 800 px guardada ao carregar, progresso por página); A3/A4 (enquadramento à mão); D1 (juntar duplicados — ela disse «por agora não») |
| `APPLE-CALENDARIO.md` | 05 parcial (clicar numa linha ir ao mês dela); largar nas vistas de dia/semana; criar por arrasto; «Alterar tipo» |
| `APPLE-TEMAS.md` | 01 (barra de topo) e 02 (cartões: altura uniforme, sombra) parciais |
| `GUIAO-DO-DIA.md` | modelos no dossier do evento; apagar um modelo; imprimir da lista; arrastar um bloco na régua |
| `LIQUID-GLASS.md` | o `cluster()`; ver num Safari e num Firefox reais |
| `PLANO-SITE-E-GALERIA.md` | ~70 pontos para ela ESCOLHER (galeria, desenho, textos, pedido, navegação, IA, conteúdos, pós-evento, negócio, segurança) — não é uma ordem |
| `AUDITORIA-EXTERNA-2026-10-ENTREGA.md` | S1 (fechar o repositório — à mão, dela), S4 (nonces na CSP), migrações B1/B2/B4 (estado por verificar), P2/P3/A3/A7 parados |

### 7.2 Lacunas de produto (o que os estúdios de topo costumam ter e aqui não há)
- **Casos reais / casamentos contados** (CON-1), diário/blog, guias de espaços,
  imprensa — o site mostra fotografias mas não conta histórias.
- **Pesquisa** no site e na galeria; endereço próprio por fotografia para
  partilhar (GAL-5); zoom (GAL-6); legendas (GAL-7).
- **Imagens OG** geradas por página.
- **Email do domínio próprio** (ainda sai por Gmail — sem SPF/DKIM/DMARC do
  domínio); **anti-robôs** no formulário público (SEG-3).
- **Modo escuro** existe nos tokens mas está inerte no site.
- **Vídeo da entrada**: só há **3 takes de ~10 s** — ao fim de ~30 s
  repetem-se. Mais variedade precisa de mais filmagem (é conteúdo, não código).

### 7.3 Riscos e dívida técnica
- **Repositório público** (SEG-1/S1) — a decisão é dela.
- Ficheiros muito grandes (§1) — custo de manutenção e de revisão.
- O gerador antigo do PDF (`proposal-doc-pdf.ts`) continua no código, sem uso.
- O medidor do back office (`scripts/bench-back-office.mjs`) procura uma vista
  que já não existe.
- `/orcamento/confirmacao/<qualquer coisa>` responde 200 para referências
  inexistentes.
- 9 avisos do React Compiler no `Calendario.tsx` (memoização que não se
  preserva) — antigos, não novos.
- Registos de caça a bugs e de auditoria móvel com muitas entradas
  (`docs/caca-de-bugs/registo.md`: 131; `docs/mobile/registo.md`: 155) — quantas
  estão resolvidas: **não verificado** item a item.

### 7.4 O que nunca foi verificado (e devia ser, por quem avaliar)
- Nada foi testado num **iPhone ou Safari reais** por este processo (vidro,
  PDF, galeria, vídeo ao alto) — só em Chromium e nos registos anónimos.
- O **INP** com visitas reais; o Lighthouse em 58 das 62 páginas do sitemap.
- Medições de produção do back office e da proposta online com propostas
  verdadeiras.
- Leitores de ecrã reais (VoiceOver/NVDA) — só `axe` e testes de papéis ARIA.

---

## 8. Decisões dela que NÃO se desfazem sem lhe perguntar

Quem avaliar vai ver coisas que parecem «erros» e são escolhas:

- **A barra de destinos fica em baixo** no back office (não há coluna lateral).
- **O logótipo fica ao centro** do cabeçalho do back office.
- **Fica o Geist** como letra; usam-se os tokens que já existem — nenhuma
  segunda família, contraste ≥ 4,5:1.
- **Uma camada de vidro por ecrã, e vidro só no que flutua.**
- **Sem botão «Aceitar proposta»** — o casal responde e a equipa marca.
- **O logótipo do ecrã de entrada é grande** («tem que ficar maior»).
- **«Avisa, não bloqueia»** para fotografias de má qualidade.
- **Duplicados: só apontar, nunca juntar sozinho** («por agora não juntar»).
- **«Ganha não repetir»**: no PDF, nunca a mesma foto em páginas seguidas, mesmo
  à custa da qualidade.
- **Nada se junta ao PDF sem a aprovação dela.**
- `script-src 'unsafe-inline'` e a ausência de `LocalBusiness` são trocas
  medidas e documentadas, não esquecimentos.

---

## 9. Por onde começar a avaliar

1. **Ler** `CLAUDE.md` e `AGENTS.md` (regras da casa e desta versão do
   Next.js), depois `docs/DESIGN-SYSTEM.md` (Parte −1) e
   `docs/INVENTARIO-DO-SITE.md`.
2. **Abrir o site** no telemóvel e no computador, em Safari e Chrome, e
   comparar com 3–5 estúdios internacionais de referência no mesmo sector
   (narrativa, fotografia, ritmo, prova social, caminho até ao pedido).
3. **Percorrer o pedido de orçamento** de ponta a ponta (sem enviar dados
   reais) e medir fricção.
4. **Abrir uma proposta de TESTE** no PDF e online e julgar o desenho contra o
   `PDF-DESIGN-NOVO.md`.
5. **No back office**, percorrer as vistas com os documentos `APPLE-*.md` ao
   lado — cada um abre com a tabela do que está feito.
6. **Cruzar** com o §7: o que falta, o que nunca foi verificado, e as
   lacunas de produto.

**Regras para quem avaliar:** não enviar emails nem mensagens a clientes
reais; não alterar dados reais; não pôr dados de clientes em capturas; usar
propostas e pedidos com «TESTE» no nome.
