// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUMA PÁGINA PRIVADA NÃO SE MEDE NADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra é da dona do produto e é explícita: na proposta e no portal do casal
 * «não registar quando a proposta é aberta, nem quanto tempo é vista, nem que
 * secções, nem até onde leram». Regista-se só o que o casal faz DE PROPÓSITO.
 *
 * Havia quatro medidores montados no layout. Dois já se recusavam a montar
 * nestas rotas (`Analytics`, `GoogleTag`); os outros dois não — e cada abertura
 * de uma proposta escrevia uma baliza nos registos de produção («abriu-se uma
 * página de proposta, a esta hora, nesta ligação») e um identificador de clique
 * pago no telemóvel do casal, com janela de 90 dias.
 *
 * Este ficheiro existe para a regra deixar de depender de alguém se lembrar
 * dela. Quem acrescentar o quinto medidor ao layout e o esquecer aqui, parte
 * este teste.
 */

const rota = vi.hoisted(() => ({ actual: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => rota.actual }));

/**
 * ── PORQUE É QUE O `web-vitals` É FINGIDO AQUI ────────────────────────────
 * A biblioteca verdadeira assenta em `PerformanceObserver`, que o jsdom não
 * tem: as chamadas de volta nunca disparam e NENHUMA baliza sairia — nem com
 * o defeito lá dentro. Sem este duplo, os três casos abaixo passavam contra o
 * código avariado, que é a pior espécie de teste verde. Este chama de volta já,
 * o que torna a baliza observável e a ausência dela significativa.
 */
vi.mock("web-vitals", () => {
  const metrica = (name: string) => (cb: (m: unknown) => void) =>
    cb({ name, value: 1, rating: "good" });
  return {
    onLCP: metrica("LCP"),
    onCLS: metrica("CLS"),
    onINP: metrica("INP"),
    onTTFB: metrica("TTFB"),
    onFCP: metrica("FCP"),
  };
});

/** As balizas do `WebVitals` saem por aqui. */
const balizas: string[] = [];
/** O que o `LeadSourceCapture` escreveu no aparelho do casal. */
const escritas: string[] = [];

beforeEach(() => {
  // ── SEM ISTO, O TESTE DO `WebVitals` PASSA POR MÁ RAZÃO ──────────────────
  // Ele começa por `if (process.env.NODE_ENV !== "production") return;`, e em
  // ambiente de teste isso é sempre verdade: nenhuma baliza sairia nem com o
  // defeito lá dentro. Um teste que passa contra o código avariado não é um
  // teste — é uma linha verde a mentir. Aqui finge-se produção, que é o único
  // sítio onde a regra tem consequência.
  vi.stubEnv("NODE_ENV", "production");
  balizas.length = 0;
  escritas.length = 0;
  vi.stubGlobal("navigator", {
    ...window.navigator,
    sendBeacon: (url: string) => {
      balizas.push(url);
      return true;
    },
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((k: string) => {
    escritas.push(k);
  });
  // A visita cai sempre dentro da amostra do `WebVitals` (1 em 10 desde 3/11):
  // o que aqui se mede é a guarda das rotas privadas, não a amostragem.
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** As rotas onde vive a proposta de um casal. */
const PRIVADAS = [
  "/proposta/eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.assinatura",
  "/pt/proposta/eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.assinatura",
  "/en/portal/eyJhbGciOiJIUzI1NiJ9.abcdefghijklmnop.assinatura",
];

describe("os medidores do layout, numa rota com token", () => {
  it.each(PRIVADAS)("o LeadSourceCapture não escreve nada no aparelho — %s", async (caminho) => {
    rota.actual = caminho;
    // Com um clique pago E uma campanha no endereço: é o caso em que o código
    // anterior escrevia mesmo (`gclid` no localStorage, com janela de 90 dias,
    // e a origem no sessionStorage). Sem isto o teste não distinguia nada.
    window.history.replaceState({}, "", `${caminho}?gclid=EAIaIQobTeste123&utm_source=ig`);
    const { default: LeadSourceCapture } = await import("./LeadSourceCapture");
    render(<LeadSourceCapture />);
    expect(escritas, `escreveu ${escritas.join(", ")} numa página privada`).toEqual([]);
  });

  it("o LeadSourceCapture continua a trabalhar numa página pública", async () => {
    rota.actual = "/pt/casamentos";
    window.history.replaceState({}, "", "/pt/casamentos?utm_source=ig&utm_campaign=teste");
    const { default: LeadSourceCapture } = await import("./LeadSourceCapture");
    render(<LeadSourceCapture />);
    expect(escritas.length, "uma página pública deixou de registar a origem").toBeGreaterThan(0);
  });

  it.each(PRIVADAS)("o WebVitals não manda baliza nenhuma — %s", async (caminho) => {
    rota.actual = caminho;
    const { default: WebVitals } = await import("./WebVitals");
    render(<WebVitals />);
    await new Promise((r) => setTimeout(r, 20));
    expect(balizas, `mandou ${balizas.length} baliza(s) de uma página privada`).toEqual([]);
  });

  it("o WebVitals continua a medir numa página pública (controlo positivo)", async () => {
    rota.actual = "/pt/casamentos";
    const { default: WebVitals } = await import("./WebVitals");
    render(<WebVitals />);
    await new Promise((r) => setTimeout(r, 20));
    expect(balizas.length, "o controlo positivo não viu baliza — o teste não prova nada").toBe(5);
  });
});
