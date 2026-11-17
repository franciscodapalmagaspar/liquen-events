// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import type { View } from "./nav";
import { CORE_NAV, MORE_NAV } from "./nav";

/**
 * Pré-carregamento das vistas do back office (ver lazy.tsx).
 *
 * O que aqui se protege é o comportamento que se mediu e que faz o clique
 * parecer instantâneo:
 *   • aquece-se UMA vista de cada vez, em janelas de inatividade, pela ordem da
 *     barra lateral (as diárias primeiro);
 *   • só depois de a página carregar — nunca a competir com o primeiro desenho;
 *   • nunca em ligações medidas ou muito lentas (Save-Data, 2g);
 *   • cancelar deixa mesmo de agendar;
 *   • e, quando o módulo já está aquecido, a vista é desenhada directamente,
 *     sem o esqueleto do <Suspense> (era ele que custava 300 ms por vista —
 *     FALLBACK_THROTTLE_MS do React).
 */

/**
 * O agendador guardado pelos testes.
 *
 * Precisa de nome próprio: o TypeScript só vê as atribuições `pending = null`
 * escritas aqui — a que interessa acontece dentro do `schedule`, que é uma
 * função passada para outro módulo, e a análise de fluxo não a segue. Sem esta
 * anotação o `pending` fica estreitado a `null` e chamá-lo passa a erro.
 */
type Pending = (() => void) | null;

// `next/dynamic` verdadeiro puxaria os módulos reais (e todo o seu peso) para
// dentro do teste. Aqui basta um substituto que se comporte como o original do
// ponto de vista de quem o usa: desenha o `loading` até o módulo chegar.
vi.mock("next/dynamic", () => ({
  default: (_load: unknown, opts?: { loading?: () => React.ReactNode }) => {
    const Fallback = opts?.loading;
    const C = () => <>{Fallback ? <Fallback /> : null}</>;
    C.displayName = "MockDynamic";
    return C;
  },
}));

type Conn = { saveData?: boolean; effectiveType?: string };
function setConnection(conn: Conn | undefined) {
  Object.defineProperty(window.navigator, "connection", {
    configurable: true,
    get: () => conn,
  });
}

describe("aquecimento das vistas do back office", () => {
  let mod: typeof import("./lazy");

  beforeEach(async () => {
    vi.resetModules();
    setConnection(undefined);
    mod = await import("./lazy");
  });

  afterEach(() => {
    setConnection(undefined);
  });

  it("aquece pela ordem da barra lateral, uma vista de cada vez", async () => {
    const done: View[] = [];
    let pending: (() => void) | null = null;
    const schedule = (cb: () => void) => {
      pending = cb;
      return () => {
        pending = null;
      };
    };
    const drain = async () => {
      const next: Pending = pending;
      pending = null;
      next?.();
      await Promise.resolve();
      await Promise.resolve();
    };

    mod.warmViewChunks({
      schedule,
      prefetch: async (v) => {
        done.push(v);
      },
    });

    // Nada acontece enquanto não houver uma janela de inatividade.
    expect(done).toEqual([]);

    await drain();
    expect(done).toHaveLength(1);
    await drain();
    expect(done).toHaveLength(2);

    // A ordem é a da barra lateral: as diárias antes das de "Mais".
    const menu = [...CORE_NAV, ...MORE_NAV];
    const firstTwo = done.map((v) => menu.indexOf(v));
    expect(firstTwo[0]).toBeGreaterThanOrEqual(0);
    expect(firstTwo[0]).toBeLessThan(firstTwo[1]);
  });

  it("percorre a fila até ao fim e depois pára", async () => {
    const done: View[] = [];
    const queue: (() => void)[] = [];
    const schedule = (cb: () => void) => {
      queue.push(cb);
      return () => {};
    };
    mod.warmViewChunks({
      schedule,
      order: ["temas", "contratos"],
      prefetch: async (v) => {
        done.push(v);
      },
    });
    for (let i = 0; i < 5; i++) {
      queue.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(done).toEqual(["temas", "contratos"]);
    // Fila esgotada → nada mais fica agendado.
    expect(queue).toHaveLength(0);
  });

  it("continua a fila mesmo que uma vista falhe a carregar", async () => {
    const done: View[] = [];
    const queue: (() => void)[] = [];
    const schedule = (cb: () => void) => {
      queue.push(cb);
      return () => {};
    };
    mod.warmViewChunks({
      schedule,
      order: ["temas", "contratos"],
      prefetch: async (v) => {
        done.push(v);
        if (v === "temas") throw new Error("rede em baixo");
      },
    });
    for (let i = 0; i < 4; i++) {
      queue.shift()?.();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(done).toEqual(["temas", "contratos"]);
  });

  it("não gasta dados de uma ligação medida (Save-Data) nem de 2g", async () => {
    for (const conn of [
      { saveData: true },
      { effectiveType: "2g" },
      { effectiveType: "slow-2g" },
    ]) {
      setConnection(conn);
      const prefetch = vi.fn(async () => {});
      let pending: (() => void) | null = null;
      mod.warmViewChunks({
        schedule: (cb) => {
          pending = cb;
          return () => {};
        },
        prefetch,
      });
      expect(pending).toBeNull();
      expect(prefetch).not.toHaveBeenCalled();
    }
  });

  it("cancelar impede o passo seguinte", async () => {
    const prefetch = vi.fn(async () => {});
    let pending: (() => void) | null = null;
    const cancel = mod.warmViewChunks({
      schedule: (cb) => {
        pending = cb;
        return () => {
          pending = null;
        };
      },
      prefetch,
    });
    cancel();
    (pending as Pending)?.();
    await Promise.resolve();
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("espera pelo `load` antes de agendar seja o que for", async () => {
    // jsdom arranca em readyState "complete"; forçar "loading" reproduz a
    // chegada real, em que a página ainda está a desenhar-se.
    const spy = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    const prefetch = vi.fn(async () => {});
    let pending: (() => void) | null = null;
    mod.warmViewChunks({
      schedule: (cb) => {
        pending = cb;
        return () => {};
      },
      prefetch,
    });
    expect(pending).toBeNull();

    spy.mockRestore();
    window.dispatchEvent(new Event("load"));
    expect(pending).not.toBeNull();
  });

  it("a ordem de aquecimento cobre as vistas do menu e não inclui `pedidos`", () => {
    // `pedidos` é desenhado pelo próprio AdminClient (vem no chunk do shell) e
    // `overview` chega sempre no primeiro pedido — nenhum deles se aquece.
    expect(mod.WARM_ORDER).not.toContain("pedidos");
    expect(mod.WARM_ORDER).not.toContain("overview");
    expect(mod.WARM_ORDER).toContain("contratos");
    expect(mod.WARM_ORDER).toContain("temas");
    expect(new Set(mod.WARM_ORDER).size).toBe(mod.WARM_ORDER.length);
  });

  it("pedir uma vista que não se divide em chunk não rebenta", async () => {
    await expect(mod.prefetchView("pedidos")).resolves.toBeUndefined();
  });
});

describe("vista já aquecida desenha sem esqueleto", () => {
  beforeEach(() => {
    vi.resetModules();
    setConnection(undefined);
  });

  it("mostra o esqueleto enquanto o módulo não chegou, e o conteúdo assim que chega", async () => {
    const mod2 = await import("./lazy");

    // Antes de aquecer: cai no `dynamic()`, que desenha o `loading` — o
    // esqueleto de vista, marcado com `data-view-skeleton`.
    const { unmount } = render(<mod2.Contratos />);
    expect(document.querySelector("[data-view-skeleton]")).not.toBeNull();
    unmount();

    // Depois de aquecer, a mesma vista monta directamente com o conteúdo real:
    // sem <Suspense>, logo sem os 300 ms que o React segura um fallback.
    await mod2.prefetchView("contratos");
    const { container } = render(<mod2.Contratos />);
    expect(document.querySelector("[data-view-skeleton]")).toBeNull();
    // Conteúdo a sério (não se afirma QUAL — a cópia é da vista, não deste
    // teste); só que a vista montou em vez do lugar reservado. O esqueleto de
    // DADOS da própria vista pode ainda passar, e é outra coisa.
    await waitFor(() => expect(container.textContent?.trim().length ?? 0).toBeGreaterThan(0));
    expect(document.querySelector("[data-view-skeleton]")).toBeNull();
  });
});

describe("as ferramentas do painel do pedido dizem que estão a carregar", () => {
  beforeEach(() => {
    vi.resetModules();
    setConnection(undefined);
  });

  /**
   * O passeio do telemóvel (`e2e/admin-mobile.spec.ts`, «o painel de um pedido
   * também se toca com o dedo») espera que `data-painel-a-carregar` saia do
   * separador Financeiro antes de medir «Já pago». Se a marca se perder, essa
   * espera passa logo, sem esperar por nada, e o passeio volta a ser instável
   * — e a acusar «perdeu o controlo» um painel que só estava a chegar.
   */
  it("o esqueleto do PaymentsPanel e do EventCosts traz a marca data-painel-a-carregar", async () => {
    const mod3 = await import("./lazy");
    for (const Ferramenta of [mod3.PaymentsPanel, mod3.EventCosts]) {
      const Qualquer = Ferramenta as unknown as React.ComponentType;
      const { unmount } = render(<Qualquer />);
      expect(document.querySelector("[data-painel-a-carregar]")).not.toBeNull();
      unmount();
    }
  });
});
