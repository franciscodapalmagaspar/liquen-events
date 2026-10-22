/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMINHO NU → O SEGMENTO `[lang]`, DITO AO NEXT EM VEZ DE FEITO NO PROXY
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As páginas públicas vivem debaixo de `app/[lang]/…` para poderem ser
 * pré-renderizadas no build (a língua vem do caminho, não de um cookie lido em
 * tempo de execução). O endereço público continua nu — `/servicos` é o
 * português canónico, `/en/servicos` o espelho inglês —, e alguém tem de ligar
 * um ao outro: `/servicos` → `/pt/servicos`, ou `/en/servicos` se o cookie
 * `liquen-lang` disser `en`.
 *
 * ERA O `src/proxy.ts` QUE O FAZIA, EM TODOS OS PEDIDOS DE PÁGINA. E o proxy,
 * no Vercel, é uma função: cada visita a uma página que está PRONTA no CDN
 * passava primeiro por uma invocação só para mudar o caminho. MEDIDO de fora,
 * na produção: uma página estática respondia em 0,27–0,6 s ao primeiro byte,
 * um ficheiro simples do mesmo sítio em 0,17–0,24 s. A auditoria pôs o custo
 * do salto em 20–150 ms por pedido, mais a factura das invocações.
 *
 * As mesmas duas regras ditas aqui, em `rewrites()` do next.config, são
 * DECLARATIVAS: o Vercel compila-as para a tabela de encaminhamento da borda e
 * nenhuma função corre. O cookie lê-se com `has`/`missing`, que o Next
 * documenta para reescritas (node_modules/next/dist/docs/01-app/03-api-
 * reference/05-config/01-next-config-js/rewrites.md, «Header, Cookie, and
 * Query Matching»), e o valor é ancorado (`^en$`, em prepare-destination.js),
 * por isso `english` não conta como `en`.
 *
 * ── PORQUE É `afterFiles` E NÃO `beforeFiles` ───────────────────────────────
 *
 * Por duas razões, e a segunda só se vê no Vercel:
 *
 *  1. `afterFiles` corre DEPOIS dos ficheiros e das rotas estáticas e ANTES
 *     das dinâmicas. Assim `/robots.txt`, `/sitemap.xml`, `/sw.js`, as
 *     fotografias de `public/` e as rotas de `/api` sem parâmetros respondem
 *     sem nunca chegarem a esta regra — e `/servicos` é reescrito antes de o
 *     `[lang]` o apanhar como `lang = "servicos"`.
 *
 *  2. O construtor do Vercel (`@vercel/next`, função `modifyRewrites`) só
 *     acrescenta o sufixo RSC (`.rsc`, `.segments/…segment.rsc`) às reescritas
 *     `afterFiles`. No Vercel, a navegação do lado do cliente pede
 *     `/servicos.rsc`; uma reescrita `beforeFiles` mandá-lo-ia para um sítio
 *     que não existe e a navegação caía para um carregamento inteiro.
 *
 * ── PORQUE É QUE A REGRA NÃO EXCLUI «FICHEIROS» (O PONTO NO FIM) ────────────
 *
 * O proxy deixava passar sem reescrita tudo o que acabasse em ponto + até 8
 * alfanuméricos (ver o comentário longo do `EXTENSAO_DE_FICHEIRO` em
 * src/proxy.ts — foi esse o defeito do token da proposta, uma ligação em cada
 * quatro). Aqui não se pode fazer o mesmo: pela razão 2, o pedido RSC chega a
 * esta regra como `/servicos.rsc`, e excluir os caminhos com «extensão»
 * deixava a navegação de TODAS as páginas sem destino no Vercel. Os ficheiros
 * que existem já foram servidos antes de a regra correr (razão 1); os que não
 * existem dão 404 tanto reescritos como não — a única diferença é a língua do
 * 404 para quem escolheu inglês (ver `app/global-not-found.tsx`).
 *
 * ── O QUE FICA DE FORA, E PORQUÊ ────────────────────────────────────────────
 *
 *   · `en`, `en/…` — já são o segmento `[lang=en]`. SEM esta exclusão, um
 *     `/en/proposta/<token>` (rota dinâmica, não pré-gerada) não casava com
 *     ficheiro nenhum, chegava aqui e ia para `/pt/en/proposta/<token>`: 404;
 *   · `pt`, `pt/…` — o redireccionamento abaixo trata-os; os que ele deixa
 *     (`/pt/x.jpg`) seguem como seguiam;
 *   · `api/…` — a apanha-tudo `api/[...rota]` é DINÂMICA, portanto sem isto
 *     um `/api/nao-existe` seria reescrito para `/pt/api/nao-existe` em vez
 *     de chegar ao 404 em JSON da API. (`/api` sozinho era reescrito pelo
 *     proxy, e continua);
 *   · `_next…`, `_img/`, `imagens/`, `videos/`, `logos/` — o que o proxy
 *     nunca tocava (o `isNonLocalized` e as exclusões do `matcher`).
 *
 * E `/` NÃO está aqui: continua no proxy. No Vercel o pedido RSC da raiz
 * chega como `/index.rsc` (e a pré-busca por segmentos como
 * `/index.segments/…`), que o construtor normaliza à sua maneira antes das
 * reescritas — e isso não se consegue provar sem um deploy de pré-visualização.
 * O padrão `.+` (e não `.*`) é o que deixa a raiz de fora.
 *
 * ── O QUE A MATRIZ DE ANTES/DEPOIS MOSTROU QUE MUDOU (`next start`, 270 casos)
 *
 * Tudo em endereços que não existem ou em cabeçalhos que ninguém lê:
 *
 *   · o 404 dos endereços-lixo sai em inglês para quem tem o cookie `en` (ver
 *     `lingua()` em app/global-not-found.tsx); `/proposta/x.jpg` dá a página
 *     «Link inválido ou expirado» (200) como `/proposta/x` já dava, e não o 404;
 *   · o Next casa estas regras sem distinguir maiúsculas: `/PT/servicos` passa
 *     a 308 para `/servicos` (era 404);
 *   · o 308 do `/pt/…` sai sem os cabeçalhos de segurança do `headers()` — é
 *     assim em todos os redireccionamentos do next.config (os do Wix já eram);
 *     uma resposta sem corpo não tem o que a CSP proteger;
 *   · só fora do Vercel: a resposta RSC de um caminho nu COM query leva
 *     `x-nextjs-rewritten-query` vazio (resolve-routes.js compara a query do
 *     pedido com a do destino, que não tem nenhuma). O Vercel só põe esse
 *     cabeçalho quando o destino traz query, portanto em produção nada muda;
 *     e nenhuma navegação do sítio leva query para um caminho nu (o `?v=` do
 *     back office muda por `replaceState`, sem pedido).
 */

/** O cookie da língua — o mesmo nome de `src/lib/i18n/config.ts`. */
const COOKIE = "liquen-lang";

/**
 * O caminho nu que se reescreve. Sintaxe do path-to-regexp do Next: o padrão
 * entre parênteses é o do parâmetro `path`, e pode levar barras.
 */
export const CAMINHO_NU =
  "/:path((?!(?:api|_img|imagens|videos|logos)/|_next|(?:en|pt)(?:/|$)).+)";

export const REESCRITAS_DA_LINGUA = [
  {
    source: CAMINHO_NU,
    has: [{ type: "cookie" as const, key: COOKIE, value: "en" }],
    destination: "/en/:path",
  },
  {
    // `missing` e não «a regra de baixo apanha o resto»: as reescritas
    // `afterFiles` encadeiam (a seguinte vê o caminho já reescrito), e as duas
    // ficam mutuamente exclusivas por construção em vez de por ordem.
    source: CAMINHO_NU,
    missing: [{ type: "cookie" as const, key: COOKIE, value: "en" }],
    destination: "/pt/:path",
  },
];

/**
 * `/pt`, `/pt/…` → o endereço nu (308). O prefixo português é interno e não
 * pode ser público: seriam duas URLs para o mesmo conteúdo. Quem o pede de
 * verdade são as ligações do portal (`portalPath()` devolve `/pt/portal/…`).
 *
 * Os redireccionamentos do next.config correm ANTES do proxy, levam a query
 * consigo (redirects.md: «any query values provided in the request will be
 * passed through») e não custam invocação nenhuma. A exclusão do ponto no fim
 * é a do proxy, à letra: `/pt/x.jpg` não era redireccionado e continua a não
 * ser — aqui não há pedido RSC nenhum (ninguém navega para `/pt/…` do lado do
 * cliente), portanto a razão que a tira da reescrita não se aplica.
 */
export const REDIRECCIONAMENTOS_DA_LINGUA = [
  { source: "/pt", destination: "/", permanent: true },
  {
    source: "/pt/:path((?!.*\\.[a-zA-Z0-9]{1,8}$).+)",
    destination: "/:path",
    permanent: true,
  },
];
