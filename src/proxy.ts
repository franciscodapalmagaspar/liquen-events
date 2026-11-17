import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { ADMIN_COOKIE, readSession } from "@/lib/admin-auth";
import { deveRegistar, registarAcao } from "@/lib/registo-de-acoes";
import { CABECALHO_DA_LINGUA } from "@/lib/lingua-do-pedido";
import { COOKIE_DA_LINGUA as LANG_COOKIE } from "@/lib/rotas-da-lingua";

/**
 * Proxy (Next.js 16 — antes «middleware»). Corre SÓ em `/api` e `/en` — e,
 * dentro de `/api`, não nas leituras públicas (ver o `matcher`, lá em baixo).
 *
 *  1. `/en`, `/en/*` — já é o segmento `[lang=en]`; serve-se como está. Numa
 *     navegação a sério grava o cookie `liquen-lang`, que as regras de
 *     `src/lib/rotas-da-lingua.ts` lêem para servir os caminhos nus em inglês.
 *  2. CSRF em profundidade (/api que muda coisas): um Origin presente e
 *     diferente é recusado; o mesmo site e as chamadas de servidor passam.
 *  3. Um id por pedido em /api, para ligar erros aos registos.
 *  4. O registo de «quem fez o quê» do back office (`registo-de-acoes.ts`).
 *
 * Até 10/11 também reescrevia cada caminho nu para `/{lang}/…`, redirecionava
 * o `/pt/…` e o `/admin` — e por isso corria em CADA visita a uma página. Isso
 * passou para o `next.config.ts` (ver `rotas-da-lingua.ts`), que na Vercel não
 * invoca função nenhuma.
 */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function proxy(req: NextRequest, event?: NextFetchEvent) {
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

    // ── 5. Sessões terminadas antes do prazo (auditoria de 13/11, n.º 6) ──
    // Uma sessão revogada (saiu, ou a palavra-passe foi redefinida) chega às
    // rotas SEM o cookie de sessão — e todas a tratam como quem não entrou,
    // sem cada uma ter de saber disto. Só se pergunta quando há uma sessão
    // válida, e a resposta vem da memória quase sempre (ver
    // `sessoes-revogadas.ts`: no máximo uma leitura por minuto por instância).
    const token = req.cookies.get(ADMIN_COOKIE)?.value;
    let sessao = readSession(token);
    let revogada = false;
    if (sessao) {
      const { sessaoRevogada } = await import("@/lib/sessoes-revogadas");
      if (await sessaoRevogada(token)) {
        revogada = true;
        sessao = null;
        requestHeaders.set("cookie", semCookie(req.headers.get("cookie") ?? "", ADMIN_COOKIE));
      }
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("X-Request-ID", requestId);
    if (revogada) {
      res.cookies.set(ADMIN_COOKIE, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    // ── 4. O registo de «quem fez o quê» (13/11) ──
    // Só alterações com sessão VÁLIDA (um cookie forjado não chega a escrever
    // um nome), e depois da resposta — nunca atrasa nem derruba o pedido.
    if (event && sessao && deveRegistar(req.method, pathname)) {
      event.waitUntil(registarAcao(sessao.name, req.method, pathname));
    }
    return res;
  }

  // ── O resto (o `/pt`, o `/admin` e os caminhos nus) já não passa por aqui:
  // são regras do `next.config.ts` (`src/lib/rotas-da-lingua.ts`, 10/11), que
  // na Vercel correm sem invocar esta função. O `matcher` lá em baixo só deixa
  // entrar `/api` e `/en`.
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

  return NextResponse.next();
}

/** O cabeçalho `Cookie` sem o cookie `nome` (os outros ficam tal e qual). */
function semCookie(cabecalho: string, nome: string): string {
  return cabecalho
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c && !c.startsWith(`${nome}=`))
    .join("; ");
}

/**
 * A língua deste pedido, num cabeçalho, para o `app/global-not-found.tsx`.
 *
 * Esse ficheiro serve os endereços que não existem (auditoria externa, S5/C3)
 * e não recebe parâmetros nenhuns — não vê o `[lang]` do caminho. Sem isto, um
 * `/en/qualquer-coisa` partido respondia em português. Escreve-se SEMPRE por
 * cima do que o cliente tenha mandado: o valor é nosso.
 */
function comLingua(req: NextRequest, lang: "pt" | "en"): Headers {
  const h = new Headers(req.headers);
  h.set(CABECALHO_DA_LINGUA, lang);
  return h;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS LEITURAS PÚBLICAS NÃO PASSAM POR AQUI (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada passagem pelo proxy é uma invocação a mais. Nestes caminhos ele não
 * fazia nada além do `x-request-id` — conferido rota a rota:
 *   · `proposta/<token>/(pagina|foto|fundo|paginas)` — só GET, a autorização
 *     é o token; nenhuma lê a sessão nem o cookie, e é o casal a ver a
 *     proposta (dezenas de pedidos por visita);
 *   · `vitals`, `erro-do-site`, `security/csp-report` — POST anónimos de
 *     telemetria: não há sessão a defender de um CSRF, e não leem cookies;
 *   · `health` — GET, com a sua própria chave, sem sessão.
 * O CSRF de tudo o resto continua aqui — `proposta/<token>/escolha` incluído.
 *
 * O `cron` FICA: as duas tarefas aceitam também a sessão do back office
 * (`isAuthed`, para as correr à mão), e é este proxy que tira o cookie de uma
 * sessão revogada (ponto 5, lá em cima). Sem ele, uma sessão terminada ainda
 * corria a cópia de segurança. Correm duas vezes por dia: não há o que poupar.
 *
 * Os testes em `proxy.test.ts` passam cada caminho pelo MESMO compilador de
 * `matcher` que o Next usa no build.
 */
export const config = {
  // Só `/api` (CSRF, id do pedido) e `/en` (o cookie que lembra o inglês).
  // Antes corria em todas as páginas, para reescrever os caminhos nus para
  // `/{lang}/…` — isso passou a ser uma regra do `next.config.ts`
  // (`src/lib/rotas-da-lingua.ts`, 10/11): uma visita a uma página portuguesa
  // já não invoca função nenhuma. E de `/api` saem as leituras públicas.
  //
  // O Next lê o `matcher` no build, de forma ESTÁTICA: tem de ser um literal.
  matcher: [
    "/api",
    "/api/((?!proposta/[^/]+/(?:pagina|foto|fundo|paginas)(?:/|$)|vitals(?:/|$)|health(?:/|$)|erro-do-site(?:/|$)|security/csp-report(?:/|$)).*)",
    "/en",
    "/en/:path*",
  ],
};
