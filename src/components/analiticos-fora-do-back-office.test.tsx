// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ANALÍTICOS DE TERCEIROS NÃO ENTRAM NO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `analytics-token-leak.test.tsx` guarda a outra metade desta regra: o token
 * do cliente não sai da rota. Este guarda a metade que faltava.
 *
 * O que estava: os quatro analíticos montados no `[lang]/layout.tsx` — o
 * Plausible, o Google tag, a captura de origem do pedido e os Web Vitals — só
 * se calavam nas rotas com token. No back office disparavam todos. O banner de
 * consentimento, esse, JÁ SABIA o que era o back office: tinha a regra escrita
 * à mão, num `pathname.includes(...)`, e em mais lado nenhum. Uma peça do
 * layout sabia, quatro não.
 *
 * ── AS TRÊS RAZÕES, POR ORDEM DE GRAVIDADE ────────────────────────────────
 *
 * 1. O gtag reporta o `page_location` de cada ecrã interno para a propriedade
 *    GA4/Ads. Quem tenha acesso a essa conta lê os caminhos de trabalho dela.
 *    E o consentimento não trava isto: com o consentimento NEGADO o gtag manda
 *    pings sem cookies na mesma — é o argumento que já estava escrito no
 *    `GoogleTag.tsx` para as rotas com token.
 * 2. As horas dela a trabalhar contavam como tráfego do site. A taxa de
 *    conversão que o próprio painel mostra é calculada por cima disso.
 * 3. `gtag.js` mais `plausible.js` a competir com a hidratação do back office,
 *    no telemóvel dela, em 4G de quinta.
 *
 * ── A FRONTEIRA QUE NÃO PODE MOVER-SE ─────────────────────────────────────
 *
 * `/orcamento` SECO é o formulário público de pedido de orçamento — a página
 * de conversão do site. Se a guarda apanhasse `/orcamento`, apagava a medição
 * do funil inteiro sem ninguém dar por isso: o número não desaparece, encolhe.
 * Metade dos casos aqui em baixo são sobre isso e não sobre o back office.
 */

/**
 * Um segmento-token qualquer, e DE PROPÓSITO sem parecer um token a sério.
 *
 * A primeira versão deste ficheiro copiou o JWT falso do
 * `analytics-token-leak.test.tsx` e o `gitleaks` do CI reprovou-a: entropia
 * 5,34, regra `generic-api-key`. Tinha razão em reprovar — uma cadeia daquelas
 * num ficheiro novo é indistinguível de um segredo a sério, e o dia em que
 * alguém a puser na lista de excepções é o dia em que a rede deixa de servir.
 *
 * E não faz falta nenhuma: a regra é `/(portal|proposta)/[^/?#]+`, portanto
 * qualquer segmento não vazio serve. O que este ficheiro guarda é a fronteira
 * do BACK OFFICE; a forma do token é do ficheiro ao lado, que já a mede.
 */
const SEGMENTO_TOKEN = "token-de-teste";

/**
 * ── NADA FICA MONTADO QUANDO UM TESTE ACABA ──────────────────────────────
 *
 * Este projecto não corre o vitest com `globals`, portanto a limpeza
 * automática da testing-library NÃO está ligada: o que se desenha fica
 * montado até ao fim do ficheiro.
 *
 * Com o `GoogleTag` e o `Analytics` isso nunca deu nada — devolvem uma
 * etiqueta ou uma cadeia vazia e não têm estado. O `ConsentBanner` tem dois
 * `useEffect` e um `useState`, e aí o React deixa trabalho agendado no
 * `scheduler`. Quando esse trabalho corre, o ambiente jsdom já foi desmontado
 * e o que sai é `ReferenceError: window is not defined` — um erro NÃO
 * APANHADO, que não reprova teste nenhum e reprova a corrida inteira.
 *
 * Foi assim que aconteceu: 9105 testes verdes e o CI vermelho, com cinco
 * destes erros. Localmente não se via a correr só este ficheiro (acaba
 * depressa de mais) — só na suite completa.
 */
afterEach(cleanup);

/** Onde os analíticos NÃO podem existir. */
const CALADOS = [
  "/orcamento/admin",
  "/pt/orcamento/admin",
  "/en/orcamento/admin",
  "/pt/orcamento/admin/carregamento/LIQ-M1A2B3",
  "/pt/orcamento/admin?v=pedidos",
];

/** Onde TÊM de continuar a existir. O `/orcamento` seco é o mais importante. */
const MEDIDOS = [
  "/orcamento",
  "/pt/orcamento",
  "/pt/orcamento/confirmacao/LIQ-M1A2B3",
  "/pt/galeria",
  "/",
];

const pathname = vi.hoisted(() => ({ value: "/galeria" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script data-testid="next-script" {...props} />,
}));

import GoogleTag, { GTAG_SOSSEGO_MS, GTAG_SRC } from "./GoogleTag";
import Analytics from "./Analytics";
import ConsentBanner from "./ConsentBanner";
import { isBackOfficeRoute, semAnaliticos, BACK_OFFICE_PATH_PATTERN } from "@/lib/safe-path";

describe("a fronteira do back office", () => {
  it("apanha o back office e tudo por baixo dele", () => {
    for (const p of CALADOS) {
      expect(isBackOfficeRoute(p), `${p} devia contar como back office`).toBe(true);
    }
  });

  it("NÃO apanha o formulário público de orçamento — a página de conversão", () => {
    for (const p of MEDIDOS) {
      expect(isBackOfficeRoute(p), `${p} não é back office`).toBe(false);
    }
  });

  it("NÃO apanha um caminho que só COMECE por «admin»", () => {
    // Sem o limite `(?:[/?#]|$)`, uma rota futura chamada
    // `/orcamento/administrativo` calava-se calada.
    expect(isBackOfficeRoute("/pt/orcamento/administrativo")).toBe(false);
    expect(isBackOfficeRoute("/pt/orcamento/admin-publico")).toBe(false);
  });

  it("`semAnaliticos` continua a cobrir as rotas com token", () => {
    // A regra antiga não pode partir-se ao acrescentar a nova.
    expect(semAnaliticos(`/portal/${SEGMENTO_TOKEN}`)).toBe(true);
    expect(semAnaliticos(`/en/proposta/${SEGMENTO_TOKEN}`)).toBe(true);
    expect(semAnaliticos("/pt/orcamento/admin")).toBe(true);
    expect(semAnaliticos("/pt/orcamento")).toBe(false);
  });

  it("o padrão é interpolável numa string de JS, como o dos tokens", () => {
    expect(BACK_OFFICE_PATH_PATTERN).not.toMatch(/['"\\]/);
  });
});

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

describe("GoogleTag — nada de gtag dentro do back office", () => {
  // O gtag.js entra pelo efeito do componente, no `<body>`, e não no que ele
  // desenha (ver `carregarGtag`). Procura-se no documento, e limpa-se entre
  // rotas para cada uma responder por si.
  const gtagNoDocumento = () => document.querySelector(`script[src="${GTAG_SRC}"]`);
  beforeEach(() => {
    pathname.value = "/galeria";
    gtagNoDocumento()?.remove();
  });

  it("não renderiza NADA em nenhuma rota do back office", () => {
    for (const p of CALADOS) {
      pathname.value = p;
      const { container } = render(<GoogleTag />);
      // O gtag.js espera pelo primeiro gesto (24/10) e que a página
      // sossegue (26/10): faz-se um e deixa-se assentar, para o teste medir o
      // que mede.
      gestoESossego();
      expect(container.innerHTML, `o gtag montou em ${p}`).toBe("");
      expect(gtagNoDocumento(), `o gtag.js entrou em ${p}`).toBeNull();
    }
  });

  it("continua montado no formulário público de orçamento", () => {
    // O controlo positivo que impede este ficheiro de passar por o gtag não
    // montar em lado nenhum — e a fronteira que interessa mesmo.
    for (const p of MEDIDOS) {
      pathname.value = p;
      render(<GoogleTag />);
      // O gtag.js espera pelo primeiro gesto (24/10) e que a página
      // sossegue (26/10): faz-se um e deixa-se assentar, para o teste medir o
      // que mede.
      gestoESossego();
      expect(gtagNoDocumento(), `o gtag deixou de medir ${p}`).not.toBeNull();
      cleanup();
      gtagNoDocumento()?.remove();
    }
  });
});

describe("Analytics (Plausible) — nada de plausible dentro do back office", () => {
  const OLD = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = "liquen-events.com";
    pathname.value = "/galeria";
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
    else process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN = OLD;
  });

  it("não renderiza NADA em nenhuma rota do back office", () => {
    for (const p of CALADOS) {
      pathname.value = p;
      const { container } = render(<Analytics />);
      expect(container.innerHTML, `o Plausible montou em ${p}`).toBe("");
    }
  });

  it("continua montado no formulário público de orçamento", () => {
    for (const p of MEDIDOS) {
      pathname.value = p;
      const { container } = render(<Analytics />);
      expect(container.innerHTML, `o Plausible deixou de medir ${p}`).toContain("plausible");
    }
  });
});

describe("LeadSourceCapture — a origem do pedido não é contaminada por ela", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  /**
   * Corre o componente num dado caminho e devolve o que ficou guardado.
   *
   * O caminho vai aos DOIS sítios: o `usePathname` fingido é o que a guarda lê,
   * e o `location.search`/`location.pathname` é o que a captura escreve. A
   * lição está escrita no ficheiro ao lado — mexer só num deixa a guarda a ver
   * o caminho do teste anterior.
   */
  async function guardado(path: string): Promise<string[]> {
    pathname.value = path;
    window.history.replaceState({}, "", `${path}${path.includes("?") ? "&" : "?"}utm_source=meta`);
    const { default: LeadSourceCapture } = await import("./LeadSourceCapture");
    render(<LeadSourceCapture />);
    await new Promise((r) => setTimeout(r, 0));
    return [
      ...Object.keys(window.sessionStorage).map((k) => window.sessionStorage.getItem(k) || ""),
      ...Object.keys(window.localStorage).map((k) => window.localStorage.getItem(k) || ""),
    ];
  }

  it("não grava primeiro-toque nenhum a partir do back office", async () => {
    // Sem isto, ela abrir a sua própria ferramenta gravava
    // «/pt/orcamento/admin» como origem da sessão — e a pergunta «de onde vêm
    // os pedidos» passava a ter, na resposta, um caminho interno.
    const escrito = await guardado("/pt/orcamento/admin");
    expect(escrito, "escreveu-se atribuição a partir do back office").toEqual([]);
  });

  it("continua a capturar no formulário público de orçamento", async () => {
    const escrito = await guardado("/pt/orcamento");
    expect(escrito.join(" "), "deixou de capturar a origem do pedido").toContain("meta");
  });
});

describe("WebVitals — o desempenho do site não se mede com as horas dela", () => {
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

  async function balizas(path: string): Promise<string[]> {
    pathname.value = path;
    window.history.replaceState({}, "", path);
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

  it("não manda baliza nenhuma a partir do back office", async () => {
    // Aqui a telemetria não sai de casa — vai para o nosso `/api` —, portanto
    // não é fuga; é ruído. As médias de desempenho servem para vigiar o site
    // público, e um ecrã de administração não corresponde a visita nenhuma.
    expect(await balizas("/pt/orcamento/admin/carregamento/LIQ-M1A2B3")).toEqual([]);
  });

  it("continua a medir o formulário público de orçamento", async () => {
    const corpos = await balizas("/pt/orcamento");
    expect(corpos.length, "deixou de medir a página de conversão").toBeGreaterThan(0);
    expect(corpos[0]).toContain("/pt/orcamento");
  });
});

describe("ConsentBanner — a regra deixou de estar escrita à mão", () => {
  beforeEach(() => {
    window.localStorage.clear();
    pathname.value = "/galeria";
  });

  it("continua fora do back office", () => {
    pathname.value = "/pt/orcamento/admin";
    const { container, unmount } = render(<ConsentBanner locale="pt" />);
    expect(container.innerHTML).toBe("");
    unmount();
  });

  /**
   * ── O AVISO DE COOKIES TAPAVA O FIM DA PROPOSTA DO CASAL ───────────────
   *
   * MEDIDO num 390×844, com a proposta a sério e a página no fundo: a barra
   * desenha 116 px encostados ao chão, e debaixo dela ficavam as duas últimas
   * linhas do documento — «Válida até …» e «Emitida a …». Não é uma questão de
   * ter de rolar mais: a página JÁ estava no fim. Aquelas linhas eram
   * inalcançáveis.
   *
   * O sítio público resolve isto com uma reserva (`--reserva-consentimento`),
   * que o rodapé, o herói e os dois botões flutuantes consomem. O ramo privado
   * não tem rodapé nem flutuantes — foi desenhado sem cromado nenhum —, por
   * isso não havia lá nada para consumir a reserva.
   *
   * ── E A CORRECÇÃO NÃO É RESERVAR ESPAÇO: É NÃO ESTAR LÁ ────────────────
   *
   * Nas rotas com token NÃO É MONTADO analítico nenhum — o Plausible, o Google
   * tag, os Web Vitals e a captura de origem calam-se todos por `isTokenRoute`,
   * e essa é a regra mais antiga deste projecto. Este aviso governa exactamente
   * esses cookies. Pedir a um casal consentimento para cookies que aquela
   * página nunca põe é pedir por nada — e cobrar-lhe por isso 116 px do
   * documento que ele foi lá ler.
   *
   * O `semAnaliticos()` já dizia as duas coisas de uma vez. O banner só lia
   * metade dele.
   */
  it("não aparece na proposta do casal — ali não há cookie nenhum para consentir", () => {
    for (const p of [
      `/proposta/${SEGMENTO_TOKEN}`,
      `/pt/proposta/${SEGMENTO_TOKEN}`,
      `/en/proposta/${SEGMENTO_TOKEN}`,
      `/portal/${SEGMENTO_TOKEN}`,
    ]) {
      pathname.value = p;
      const { container, unmount } = render(<ConsentBanner locale="pt" />);
      expect(container.innerHTML, `o aviso de cookies desenhou em ${p}`).toBe("");
      unmount();
    }
  });

  it("continua a aparecer no site público", () => {
    // O controlo positivo dos dois casos acima: sem ele, um banner que nunca
    // desenhasse em lado nenhum passava neste ficheiro inteiro.
    for (const p of MEDIDOS) {
      pathname.value = p;
      const { container, unmount } = render(<ConsentBanner locale="pt" />);
      expect(container.innerHTML, `o aviso de cookies desapareceu de ${p}`).not.toBe("");
      unmount();
    }
  });
});
