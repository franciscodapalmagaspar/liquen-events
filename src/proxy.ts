import { NextResponse, type NextRequest } from "next/server";
import { CABECALHO_DA_LINGUA } from "@/lib/lingua-do-pedido";

/**
 * Edge security & i18n proxy (Next.js 16 — formerly middleware).
 *
 * The marketing pages live under an internal `[lang]` route segment
 * (`/pt/*`, `/en/*`) so they can be **statically prerendered** — the locale
 * comes from the route, not a runtime header/cookie. The public URL scheme is
 * unchanged: Portuguese is canonical at the bare path (`/`, `/servicos`, …) and
 * English lives at `/en/*` (shareable & crawlable).
 *
 * ── O QUE SAIU DAQUI, E PORQUÊ ──────────────────────────────────────────────
 *
 * Este ficheiro corria à frente de TODOS os pedidos de página, sobretudo para
 * reescrever o caminho nu (`/servicos` → `/pt/servicos`). No Vercel o proxy é
 * uma função, e uma página que está pronta no CDN passava a esperar por uma
 * invocação só para mudar o caminho — MEDIDO de fora, na produção: 0,27–0,6 s
 * ao primeiro byte numa página estática contra 0,17–0,24 s num ficheiro
 * simples. Duas coisas passaram para o next.config, onde são declarativas e
 * não invocam nada (o porquê de cada escolha está em
 * `src/lib/rotas-da-lingua.ts`):
 *
 *   · a reescrita do caminho nu para `/{lang}/…` pelo cookie → `rewrites()`,
 *     em `afterFiles`;
 *   · o `/pt`, `/pt/*` → endereço nu (308) → `redirects()`.
 *
 * ── O QUE FICA, E PORQUÊ ────────────────────────────────────────────────────
 *
 *  1. `/en`, `/en/*` — já são o segmento `[lang=en]`; o proxy só escreve o
 *     cookie pegajoso `liquen-lang` nas navegações de documento verdadeiras
 *     (a lógica do `sec-fetch-dest`/`rsc` não se diz em configuração: um
 *     `headers()` não sabe pôr um Set-Cookie condicional) e o cabeçalho da
 *     língua para o `app/global-not-found.tsx`.
 *  2. `/` — a reescrita da RAIZ fica aqui, de propósito: no Vercel o pedido
 *     RSC da raiz chega às reescritas como `/index.rsc`, normalizado pelo
 *     construtor de uma forma que não se prova sem um deploy (ver
 *     `rotas-da-lingua.ts`). É um só caminho, e é o mesmo código de sempre.
 *  3. `/admin` → `/orcamento/admin` (307). Num `redirects()` a query passava a
 *     seguir para o destino (redirects.md: «any query values provided in the
 *     request will be passed through»), e aqui não segue — `/admin?x=1` dá
 *     `/orcamento/admin` limpo. Mudar isso não era o que este trabalho
 *     pedia, e o atalho só é usado pela equipa: o custo da invocação é nulo.
 *  4. CSRF defence in depth (state-changing /api): a present-but-mismatched
 *     Origin is rejected; same-origin and server-to-server callers pass.
 *  5. Request-ID injection on /api for correlating errors with logs.
 *
 * O `matcher` lá em baixo é a lista exacta destes caminhos: qualquer outro
 * pedido não acorda a função.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LANG_COOKIE = "liquen-lang";

/**
 * O «isto é um ficheiro» do último segmento.
 *
 * ERA `/\.[a-zA-Z0-9]+$/` — qualquer ponto seguido de alfanuméricos até ao fim.
 * O que não estava previsto é que os caminhos com CAPACIDADE também levam um
 * ponto: um token é `<corpo>.<assinatura>`, e a assinatura é o HMAC-SHA256 em
 * base64url, 43 caracteres de `[A-Za-z0-9_-]`. Quando calha sair sem `-` nem
 * `_` — medido: 535 em 2000, 26,8% —, o `/proposta/<token>` passava a ler-se
 * como um ficheiro estático, não era reescrito para `/pt/proposta/<token>` e
 * deixava de casar com a rota: o casal abria a ligação da proposta e via a
 * página de 404. Uma em cada quatro. Como falhava só às vezes, lia-se como
 * «o link às vezes não abre» e não como um defeito de encaminhamento.
 *
 * O tecto de 8 caracteres é o que separa as duas coisas sem ter de nomear
 * rotas nenhumas: a extensão mais comprida de `public/` é `gitkeep` (7), e uma
 * assinatura tem sempre 43. Nomear `/proposta` e `/portal` resolvia o caso de
 * hoje e voltava a partir-se na próxima rota com token.
 *
 * Hoje só decide dentro de `/en/…` (e da raiz, que não tem ponto): o caminho
 * nu passou para o next.config, onde a regra NÃO olha para pontos nenhuns —
 * o porquê está em `src/lib/rotas-da-lingua.ts`. Um `/en/x.jpg` continua a
 * passar sem cookie nem cabeçalho de língua, como passava.
 */
const EXTENSAO_DE_FICHEIRO = /\.[a-zA-Z0-9]{1,8}$/;

/**
 * Paths that must NOT be locale-rewritten: framework internals, the special
 * metadata routes that live at the app root (sitemap/robots/manifest/icons),
 * static asset folders, and anything with a file extension.
 */
function isNonLocalized(pathname: string): boolean {
  return (
    pathname.startsWith("/_next") ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/favicon.ico" ||
    pathname === "/icon.png" ||
    pathname === "/apple-icon.png" ||
    pathname.startsWith("/imagens/") ||
    pathname.startsWith("/logos/") ||
    EXTENSAO_DE_FICHEIRO.test(pathname)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── /api: CSRF defence + request-id (unchanged behaviour) ──
  if (pathname.startsWith("/api/")) {
    if (MUTATING.has(req.method)) {
      const origin = req.headers.get("origin");
      if (origin) {
        const host = req.headers.get("host");
        let originHost = "";
        try {
          originHost = new URL(origin).host;
        } catch {
          /* malformed Origin → treat as mismatch */
        }
        if (!originHost || originHost !== host) {
          return NextResponse.json({ error: "Origem não permitida." }, { status: 403 });
        }
      }
    }
    // Don't trust a client-supplied request id verbatim (it's reflected into the
    // response header and request-scoped logs — a raw value could inject into
    // logs or spoof correlation). Accept it only if it's a short, safe token;
    // otherwise mint our own.
    const incomingId = req.headers.get("x-request-id");
    const requestId =
      incomingId && /^[A-Za-z0-9._-]{1,64}$/.test(incomingId) ? incomingId : crypto.randomUUID();
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-request-id", requestId);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("X-Request-ID", requestId);
    return res;
  }

  // ── Metadata files / assets pass straight through ──
  if (isNonLocalized(pathname)) return NextResponse.next();

  // ── Short link for the team: `/admin` → the back-office ──
  // The real back-office lives at the long `/orcamento/admin`; this memorable
  // alias means the owner can just type `.../admin` (or bookmark it) instead.
  // A redirect (not a rewrite) keeps the canonical URL the admin page already
  // relies on for locale/deep-link resolution.
  if (pathname === "/admin" || pathname === "/admin/") {
    // Build the target from `req.url` (not nextUrl.clone) so NextURL's
    // trailing-slash normalisation can't turn `/admin/` into `/orcamento/admin/`.
    return NextResponse.redirect(new URL("/orcamento/admin", req.url), 307);
  }

  // (O `/pt`, `/pt/*` → endereço nu é um `redirects()` do next.config, que
  // corre ANTES do proxy: um pedido desses já nem chega aqui.)

  // ── English mirror: already the [lang=en] segment; stick the choice ──
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const res = NextResponse.next({ request: { headers: comLingua(req, "en") } });
    // Only on real document navigations that don't already carry the cookie —
    // prefetches and background RSC fetches must stay side-effect free so they
    // can't clobber a fresh "pt" the toggle just wrote.
    const dest = req.headers.get("sec-fetch-dest");
    const isDocument = dest ? dest === "document" : !req.headers.get("rsc");
    if (isDocument && req.cookies.get(LANG_COOKIE)?.value !== "en") {
      res.cookies.set(LANG_COOKIE, "en", {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
      });
    }
    return res;
  }

  // ── Bare canonical path → rewrite onto the internal /{lang} segment ──
  // Pelo `matcher`, só a raiz `/` chega aqui; os outros caminhos nus são
  // reescritos pelo next.config com a MESMA regra (cookie `en` → `/en/…`, o
  // resto → `/pt/…`). O código fica geral para as duas não poderem divergir
  // no dia em que alguém acrescentar um caminho ao `matcher`.
  const lang = req.cookies.get(LANG_COOKIE)?.value === "en" ? "en" : "pt";
  const url = req.nextUrl.clone();
  url.pathname = `/${lang}${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url, { request: { headers: comLingua(req, lang) } });
}

/**
 * A língua deste pedido, num cabeçalho, para o `app/global-not-found.tsx`.
 *
 * Esse ficheiro serve os endereços que não existem (auditoria externa, S5/C3)
 * e não recebe parâmetros nenhuns — não vê o `[lang]` do caminho. Sem isto, um
 * `/en/qualquer-coisa` partido respondia em português. Nos caminhos em que o
 * proxy corre escreve-se SEMPRE por cima do que o cliente tenha mandado: o
 * valor é nosso. Nos caminhos nus, que já não passam por aqui, o 404 lê o
 * cookie — ver a função `lingua()` do `global-not-found.tsx`.
 */
function comLingua(req: NextRequest, lang: "pt" | "en"): Headers {
  const h = new Headers(req.headers);
  h.set(CABECALHO_DA_LINGUA, lang);
  return h;
}

export const config = {
  // SÓ os caminhos em que o proxy ainda faz alguma coisa (ver o cabeçalho deste
  // ficheiro). Era `/((?!_next/static|…).*)` — tudo menos os estáticos —, e
  // isso punha uma invocação à frente de cada página pré-renderizada só para a
  // reescrever. Os caminhos que saíram daqui são servidos pela tabela de
  // encaminhamento (o `rewrites()`/`redirects()` do next.config), sem função.
  //
  // `/api/:path+` e não `:path*`: o `*` também apanha o `/api` sozinho, que
  // nunca foi da API (o proxy reescrevia-o para `/pt/api`, como qualquer
  // caminho nu, e é o next.config que o faz agora).
  matcher: ["/", "/admin", "/en", "/en/:path*", "/api/:path+"],
};
