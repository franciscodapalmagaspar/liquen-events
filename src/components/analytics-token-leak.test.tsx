// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

/**
 * Rede de segurança: o token do cliente NÃO sai da rota.
 *
 * `/proposta/<token>` autoriza ACEITAR a proposta (o que cria o contrato)
 * durante 14 dias; `/portal/<token>` abre a reserva inteira durante
 * 365 dias. Os dois vivem no CAMINHO do URL, por isso qualquer analítico que
 * reporte o caminho leva o segredo consigo:
 *
 *   · o Google tag, que reporta `document.location.href` inteiro — e que o
 *     banner de consentimento NÃO trava, porque com consentimento negado o
 *     gtag continua a mandar pings sem cookies;
 *   · o Plausible, que reporta o caminho da página;
 *   · os Web Vitals, que gravam o caminho nos registos de produção da Vercel.
 *
 * Estes testes falham se qualquer um dos três voltar a deixar passar o token.
 *
 * ── A REGRA DOS WEB VITALS ENDURECEU ──────────────────────────────────────
 *
 * Este ficheiro exigia, para o `WebVitals`, que a baliza SAÍSSE mas já sem o
 * token. Era a defesa certa contra a fuga do segredo e continua a sê-lo — só
 * que não chegava: uma baliza limpa continua a dizer «abriu-se uma página de
 * proposta, a esta hora, nesta ligação», e a regra do produto sobre estas
 * páginas é não registar a abertura de todo.
 *
 * Portanto o que aqui se exige agora é mais forte: nestas rotas **não sai
 * baliza nenhuma**. Uma baliza que não existe não pode levar o token, o que
 * mantém a garantia antiga por construção. A limpeza do caminho continua a ser
 * exercida no caso público, que é onde ela passou a ser a única defesa.
 */

const PORTAL_TOKEN =
  "eyJ0eXAiOiJwb3J0YWwiLCJxaWQiOiJMSVEtTTFBMkIzLTlGM0M3QTFCMkQ0RTVGNjAiLCJleHAiOjE4MTcwNDU5MDIwNjd9.xYFYVlyLqOb33tAqHDgzJBtmszJm7XHFxgQ3Oy3zGyY";
const PROPOSAL_TOKEN = "eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6InByb3BfMTIzIn0.AbCdEf-_1234567890xyz";

// usePathname é o que decide; controlamo-lo por teste.
const pathname = vi.hoisted(() => ({ value: "/galeria" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

// next/script é um componente cliente com agendamento próprio; para este teste
// só interessa SE é renderizado e com que src. (Já só o `Analytics` passa por
// ele — o `GoogleTag` acrescenta a biblioteca por conta própria.)
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script data-testid="next-script" {...props} />,
}));

import GoogleTag, {
  bootstrapGtag,
  safeLocationHref,
  GA4_ID,
  GOOGLE_ADS_ID,
  GTAG_SOSSEGO_MS,
  GTAG_SRC,
} from "./GoogleTag";
import Analytics from "./Analytics";

/**
 * A biblioteca deixou de ser desenhada pelo `next/script` (que punha um
 * `<link rel="preload">` no `<head>` — ver `carregarGtag`): é o efeito do
 * componente que a acrescenta ao `<body>`, depois da hidratação. Por isso
 * procura-se no DOCUMENTO, e não no `container` do componente. A pergunta é a
 * mesma de sempre: o gtag.js entrou nesta rota, ou não?
 */
const gtagNoDocumento = () => document.querySelector(`script[src="${GTAG_SRC}"]`);

/** Um gesto e o sossego que o gtag.js espera antes de entrar (26/10). */
function gestoESossego() {
  vi.useFakeTimers();
  try {
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(GTAG_SOSSEGO_MS);
  } finally {
    vi.useRealTimers();
  }
}

describe("GoogleTag — não é montado nas rotas com token", () => {
  beforeEach(() => {
    pathname.value = "/galeria";
    gtagNoDocumento()?.remove();
  });

  it("monta normalmente numa rota pública", () => {
    const { container } = render(<GoogleTag />);
    // O gtag.js espera pelo primeiro gesto (24/10) e que a página sossegue
    // (26/10): faz-se um e deixa-se assentar, para o teste medir o que mede.
    gestoESossego();
    expect(gtagNoDocumento()).not.toBeNull();
    expect(container.innerHTML).toContain("consent");
  });

  it("não renderiza NADA em /portal/<token>", () => {
    pathname.value = `/portal/${PORTAL_TOKEN}`;
    const { container } = render(<GoogleTag />);
    // O gtag.js espera pelo primeiro gesto (24/10) e que a página sossegue
    // (26/10): faz-se um e deixa-se assentar, para o teste medir o que mede.
    gestoESossego();
    expect(container.innerHTML).toBe("");
    expect(container.innerHTML).not.toContain(PORTAL_TOKEN);
    expect(container.innerHTML).not.toContain("googletagmanager");
    expect(gtagNoDocumento()).toBeNull();
  });

  it("não renderiza NADA em /proposta/<token>, nem com prefixo de idioma", () => {
    pathname.value = `/en/proposta/${PROPOSAL_TOKEN}`;
    const { container } = render(<GoogleTag />);
    // O gtag.js espera pelo primeiro gesto (24/10) e que a página sossegue
    // (26/10): faz-se um e deixa-se assentar, para o teste medir o que mede.
    gestoESossego();
    expect(container.innerHTML).toBe("");
    expect(gtagNoDocumento()).toBeNull();
  });

  it("continua montado após a reescrita do proxy numa rota normal (/pt/galeria)", () => {
    pathname.value = "/pt/galeria";
    render(<GoogleTag />);
    // O gtag.js espera pelo primeiro gesto (24/10) e que a página sossegue
    // (26/10): faz-se um e deixa-se assentar, para o teste medir o que mede.
    gestoESossego();
    expect(gtagNoDocumento()).not.toBeNull();
  });

  it("o bootstrap sanitiza o page_location em vez de mandar o href inteiro", () => {
    const { container } = render(<GoogleTag />);
    // O gtag.js espera pelo primeiro gesto (24/10) e que a página sossegue
    // (26/10): faz-se um e deixa-se assentar, para o teste medir o que mede.
    gestoESossego();
    const html = container.innerHTML;
    // A defesa em profundidade: mesmo que o tag alguma vez corra numa rota com
    // token, o que é reportado à Google já vai sem o segredo.
    expect(html).toContain("page_location");
    expect(html).toContain("portal|proposta");
    expect(html).not.toMatch(/gtag\('config', '[^']+'\);/); // já não há config sem page_location
  });
});

describe("bootstrapGtag — a reposição sem eval reporta o mesmo, e já sanitizado", () => {
  type W = { dataLayer?: unknown[]; gtag?: unknown };
  beforeEach(() => {
    delete (window as unknown as W).gtag;
    delete (window as unknown as W).dataLayer;
    window.localStorage.clear();
  });

  it("não usa eval — em produção a CSP não traz 'unsafe-eval'", () => {
    // Se alguém voltar a `new Function(...)`/eval, isto apanha-o: a chamada
    // rebentaria com uma CSP a sério, mas aqui garantimos que nem sequer é
    // usada, comparando o comportamento com um eval desactivado.
    expect(bootstrapGtag.toString()).not.toMatch(/new Function|\beval\(/);
  });

  it("põe o consentimento em negado por omissão e configura os dois destinos", () => {
    window.history.replaceState({}, "", "/galeria");
    bootstrapGtag();
    const dl = (window as unknown as W).dataLayer!;
    const calls = dl.map((a) => Array.from(a as ArrayLike<unknown>));
    expect(calls[0][0]).toBe("consent");
    expect(calls[0][2]).toMatchObject({ ad_storage: "denied", analytics_storage: "denied" });
    const configs = calls.filter((c) => c[0] === "config");
    expect(configs.map((c) => c[1])).toEqual([GOOGLE_ADS_ID, GA4_ID]);
  });

  it("respeita um consentimento já dado", () => {
    window.localStorage.setItem("liquen-consent", "granted");
    bootstrapGtag();
    const dl = (window as unknown as W).dataLayer!;
    const first = Array.from(dl[0] as ArrayLike<unknown>);
    expect(first[2]).toMatchObject({ ad_storage: "granted", ad_user_data: "granted" });
  });

  it("o page_location vai sem o token", () => {
    window.history.replaceState({}, "", `/portal/${PORTAL_TOKEN}`);
    bootstrapGtag();
    const dl = (window as unknown as W).dataLayer!;
    const configs = dl
      .map((a) => Array.from(a as ArrayLike<unknown>))
      .filter((c) => c[0] === "config");
    for (const c of configs) {
      const params = c[2] as { page_location: string };
      expect(params.page_location).not.toContain(PORTAL_TOKEN);
      expect(params.page_location).toContain("/portal/[token]");
    }
  });

  it("é idempotente — não volta a arrancar por cima do script inline", () => {
    const existing = vi.fn();
    (window as unknown as W).gtag = existing;
    bootstrapGtag();
    expect((window as unknown as W).gtag).toBe(existing);
    expect((window as unknown as W).dataLayer).toBeUndefined();
  });

  it("safeLocationHref deixa as rotas normais intactas", () => {
    expect(safeLocationHref("https://liquen-events.com/galeria?x=1")).toBe(
      "https://liquen-events.com/galeria?x=1",
    );
  });
});

describe("Analytics (Plausible) — não é montado nas rotas com token", () => {
  const OLD = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = "liquen-events.com";
    pathname.value = "/galeria";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    else process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = OLD;
  });

  it("monta numa rota pública quando está configurado", () => {
    const { container } = render(<Analytics />);
    expect(container.innerHTML).toContain("plausible");
  });

  it("não renderiza NADA em /portal/<token>", () => {
    pathname.value = `/portal/${PORTAL_TOKEN}`;
    const { container } = render(<Analytics />);
    expect(container.innerHTML).toBe("");
  });

  it("não renderiza NADA em /proposta/<token>", () => {
    pathname.value = `/proposta/${PROPOSAL_TOKEN}`;
    const { container } = render(<Analytics />);
    expect(container.innerHTML).toBe("");
  });
});

describe("WebVitals — nas rotas com token não se mede nada", () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  /**
   * Corre o `WebVitals` num dado caminho e devolve os corpos balizados.
   *
   * O caminho é posto nos DOIS sítios de propósito, e é aqui que este ficheiro
   * já se enganou uma vez: o `usePathname` fingido é quem a guarda lê, e o
   * `location.pathname` é o que entra no corpo da baliza. Mexer só no segundo
   * deixava a guarda a ver o caminho do teste ANTERIOR — e o caso público
   * falhava por uma razão que não tinha nada que ver com o que ele mede.
   */
  async function beaconedBodies(path: string): Promise<string[]> {
    pathname.value = path;
    window.history.replaceState({}, "", path);
    // web-vitals é importado dinamicamente; devolvemos callbacks que disparam já.
    vi.doMock("web-vitals", () => {
      const fire = (cb: (m: { name: string; value: number; rating: string }) => void) =>
        cb({ name: "LCP", value: 1234, rating: "good" });
      return { onLCP: fire, onCLS: fire, onINP: fire, onTTFB: fire, onFCP: fire };
    });
    const { default: WebVitals } = await import("./WebVitals");
    render(<WebVitals />);
    await new Promise((r) => setTimeout(r, 0));
    return beacon.mock.calls.map((c) => String(c[1]));
  }

  it("não manda baliza nenhuma em /portal/<token>", async () => {
    const bodies = await beaconedBodies(`/portal/${PORTAL_TOKEN}`);
    expect(bodies, "mediu-se a abertura de uma página privada").toEqual([]);
  });

  it("não manda baliza nenhuma em /proposta/<token>", async () => {
    const bodies = await beaconedBodies(`/proposta/${PROPOSAL_TOKEN}`);
    expect(bodies, "mediu-se a abertura de uma página privada").toEqual([]);
  });

  it("continua a medir — e a limpar o caminho — numa rota normal", async () => {
    // Controlo positivo: sem ele, os dois casos de cima passavam por o medidor
    // não medir nada em lado nenhum.
    const bodies = await beaconedBodies("/galeria");
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toContain("/galeria");
    expect(bodies[0]).not.toContain(PORTAL_TOKEN);
  });
});
