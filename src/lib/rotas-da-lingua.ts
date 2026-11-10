/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LÍNGUA DE CADA VISITA, SEM ACORDAR UMA FUNÇÃO (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «quero pagar muito pouco mas fazer tudo». As páginas públicas vivem no
 * segmento interno `[lang]` (`/pt/…`, `/en/…`) para saírem pré-geradas, e o
 * endereço público do português é o nu (`/servicos`). Até hoje quem ligava um
 * ao outro era o `proxy.ts` — uma função que corria em CADA visita a uma
 * página, só para ler um cookie e reescrever o caminho.
 *
 * Estas regras fazem o mesmo nas regras de encaminhamento do próprio site
 * (`next.config.ts`). Na Vercel correm na camada de encaminhamento, sem
 * invocar função nenhuma: a página pré-gerada sai direta da cache.
 *
 *   · `/pt`, `/pt/…`  → 308 para o nu (o prefixo interno nunca é público);
 *   · `/admin`        → 307 para `/orcamento/admin` (o atalho da equipa);
 *   · um caminho nu   → `/en/…` com o cookie `liquen-lang=en`, senão `/pt/…`.
 *
 * As reescritas são `afterFiles`: correm DEPOIS de se procurar um ficheiro
 * estático e uma rota fixa (`/api/health`, `/sitemap.xml`, as imagens) e ANTES
 * das rotas dinâmicas — e é por isso que o padrão deixa de fora `api/`, `en/`,
 * `pt/` e `_next/`: `/en/servicos` e `/api/orcamento/123` são rotas dinâmicas
 * que já existem como estão.
 *
 * O caso que partia o `proxy` (o ponto da assinatura de um token, lido como
 * extensão de ficheiro — ver `proxy.ts`) aqui não existe: só se trata como
 * ficheiro o que É um ficheiro.
 *
 * O `proxy.ts` continua para `/api` (defesa CSRF, id do pedido) e para `/en`
 * (o cookie que lembra a escolha), e mais nada.
 */
export const COOKIE_DA_LINGUA = "liquen-lang";

/** Um caminho nu: tudo o que não começa por estes segmentos. */
const NU = "(?!(?:api|en|pt|_next)(?:/|$)).+";

const comIngles = [{ type: "cookie" as const, key: COOKIE_DA_LINGUA, value: "en" }];

export const REDIRECIONAMENTOS_DA_LINGUA = [
  { source: "/pt", destination: "/", permanent: true },
  { source: "/pt/:caminho*", destination: "/:caminho*", permanent: true },
  { source: "/admin", destination: "/orcamento/admin", permanent: false },
];

export const REESCRITAS_DA_LINGUA = [
  { source: "/", has: comIngles, destination: "/en" },
  { source: `/:caminho(${NU})`, has: comIngles, destination: "/en/:caminho" },
  { source: "/", destination: "/pt" },
  { source: `/:caminho(${NU})`, destination: "/pt/:caminho" },
];
