# Passagem de testemunho — Projeto Líquen Events

> Ficheiro para dar contexto ao Claude Code quando se continua o trabalho noutro sítio
> (ex.: no Cursor, no computador local). **Lê este ficheiro e continua a partir daqui.**
>
> Última atualização: 2026-07-16

---

## Quem é o cliente

**Líquen Events** — empresa de **decoração e eventos** em **Évora / Alentejo, Portugal**.
Site bilingue **PT/EN**. Segmento premium / boutique.

- A **decoração é o coração da marca** — deve estar em primeiro plano em todo o site.
- A dona comunica em **português** e **não é técnica**. Explicar sempre de forma simples,
  sem jargão, e fazer o trabalho por ela em vez de a mandar mexer em código.
- Email do negócio: liquen.alentejo@gmail.com

### Posicionamento correto (importante — já corrigido no site)
- A Líquen **NÃO faz wedding *planner***. Nos casamentos faz **decoração + coordenação
  do dia** (day-of coordination), ou seja *wedding coordinator*, não *planner*.
- Casamentos = **"Decoração + coordenação do dia"**.
- Inclui **aluguer de viaturas clássicas** (opcional) no serviço de casamentos —
  há uma foto de capa (Rolls-Royce prateado) na página do serviço.

---

## Stack técnica (LER ANTES DE ESCREVER CÓDIGO)

- **Next.js 16.2.6** (Turbopack) + **React 19**. ATENÇÃO: é uma versão modificada.
  O ficheiro `AGENTS.md` avisa: *"This is NOT the Next.js you know"*. Ler os guias em
  `node_modules/next/dist/docs/` antes de escrever código novo.
- **Tailwind v4** (`@import "tailwindcss"`). Tokens de design incluem `--color-gold-text`
  (#8a6a1d, seguro para AA) e `text-gold-dark` (#b88f28, 3:1 para gráficos).
- **i18n**: `src/lib/i18n/pt.ts` é a fonte (`Dict = typeof pt`) e `en.ts` é o espelho
  tipado — o `tsc` obriga a que as chaves batam certo nos dois. Ao adicionar texto,
  adicionar SEMPRE nas duas línguas.

## Comandos úteis
- `npm run dev` — servidor de desenvolvimento
- `npm run build` — build de produção (validar antes de fechar trabalho)
- `npx tsc --noEmit` — verificar tipos (0 erros é o objetivo)
- `npm test` — testes
- `npm run gallery:sync` — adicionar fotos novas à galeria (ver abaixo)
- `npm run gen:blur` / `npm run gen:dims` — regenerar blur/dimensões das imagens

---

## Galeria — como adicionar fotos (fluxo de UM comando)

Feito para ser super fácil. Duas formas:

1. **Pasta de entrada**: pôr as fotos novas em `public/imagens/_intake/` e correr
   `npm run gallery:sync`.
2. **Ficheiros explícitos**: `node scripts/gallery-sync.mjs public/imagens/FOTO.jpg --label Casamento`

O script trata de tudo: escolhe a categoria (`--label` > coleção correspondente >
heurística do nome do ficheiro > `"Evento"`), regista o casal/coleção, adiciona a
entrada em `photos-data.ts` e regenera `blur-map.json` + `image-dims.json`.

**Regra importante**: há ~130 ficheiros no disco que foram **retirados da galeria de
propósito**. "Tudo o que está no disco e não está listado" NUNCA deve ser re-adicionado
automaticamente. Só entra o que está em `_intake/` ou o que é passado explicitamente.

**Fonte de verdade dos casais**: `src/app/[lang]/galeria/collections.json` (+ `collections.ts`).
Registar um casal novo = uma linha nesse JSON (regra de match pelo nome do ficheiro).
As legendas e o texto alternativo (alt, para SEO/acessibilidade) são gerados
automaticamente a partir de categoria + casal — nada a escrever à mão.

### Pendente na galeria
- As **41 fotos novas `PJ-*.jpg`** (casamento) já estão ligadas à galeria com a
  categoria "Casamento". Falta o **nome do casal** (iniciais P&J) para as legendas —
  quando a dona disser o nome, adicionar uma linha em `collections.json` com match `"pj-"`.

---

## Ficheiros-chave

- `src/lib/services-data.ts` — dados dos serviços (`SERVICES` PT + `SERVICES_EN`).
  Slugs: `casamentos`, `eventos-corporativos`, `festas-e-aniversarios`, `jantares-de-gala`.
- `src/app/[lang]/servicos/page.tsx` — página de serviços (redesenhada: hero + secção
  "filosofia" clara + cabeçalhos editoriais claros por categoria).
- `src/app/[lang]/servicos/[slug]/page.tsx` — detalhe do serviço. Casamentos tem a
  secção de capa das viaturas clássicas (`/imagens/viaturas-classicas.jpg`).
- `src/lib/i18n/pt.ts` + `en.ts` — todos os textos/traduções e metadados SEO.
- `src/lib/site.ts` — config do site (keywords, ogImage).
- `src/lib/ui-classes.ts` — classes de UI partilhadas (botões, etc.).
- `src/app/globals.css` — tokens de cor, foco, acessibilidade.
- `src/lib/orcamento/data.ts` — dados do pedido de orçamento.

## Estado de acessibilidade (já tratado)
- Botão primário: `bg-moss text-white` (contraste 4.70:1, AA).
- `.eyebrow`, foco visível e outras cores ajustadas para contraste AA.
- Imagem Open Graph (`/og-liquen-2026.jpg`), feita por ela (27/10), sem «Évora · Alentejo».

---

## Trabalho já concluído (resumo)
1. Auditoria SEO/acessibilidade — Fases I, II e III completas.
2. Ferramenta `gallery:sync` (adicionar fotos num comando) + `collections.json`.
3. Imagem Open Graph com marca.
4. Reposicionamento: casamentos = decoração + coordenação do dia (não *planner*);
   decoração ao centro da marca em todo o site (PT + EN).
5. Aluguer de viaturas clássicas adicionado a casamentos + secção de capa.
6. Página de serviços redesenhada (mais editorial, corrigido excesso de texto no telemóvel).
7. 41 fotos novas de casamento (`PJ-*.jpg`) ligadas à galeria.

## Git / PRs
- Branch de trabalho: **`claude/seo-overhaul`** → **PR #14** (rascunho, aberto).
- PR #13 já foi **publicado (merged)** para produção.
- A Vercel faz deploy automático de uma pré-visualização a cada push.

## Decisões pendentes (à espera da dona)
- (a) Nome do casal das 41 fotos `PJ-*` (iniciais P&J) para as legendas.
- (b) Publicar o PR #14 para produção.
- (c) Adicionar categoria "Eventos culturais"?
- (d) Mudar o slogan "Organizamos eventos…" para linguagem de decoração?
- (e) A Líquen também decora eventos corporativos? (confirmar para ajustar textos)

---

## Como trabalhar com esta dona
- Responder em **português**, simples, sem jargão.
- Fazer o trabalho por ela; não a mandar editar ficheiros.
- Nos casamentos, nunca lhe chamar "wedding planner".
- A decoração é o coração — manter sempre em primeiro plano.
