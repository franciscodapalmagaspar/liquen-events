import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ESPERA_MAX_MS,
  FOLGA_DO_RELOGIO_MS,
  esquecerListagens,
  listagemComMemoria,
} from "./memoria-das-listagens";

afterEach(() => {
  vi.useRealTimers();
  esquecerListagens();
});

describe("listagemComMemoria — uma listagem pendurada não prende as outras", () => {
  it("ao fim do limite vale null, não se guarda, e a pergunta seguinte volta a listar", async () => {
    vi.useFakeTimers();
    const pendurada = vi.fn(() => new Promise<string[] | null>(() => {}));
    const a = listagemComMemoria("b", "p", pendurada);
    const b = listagemComMemoria("b", "p", pendurada);
    expect(pendurada).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(ESPERA_MAX_MS + 1);
    await expect(a).resolves.toBeNull();
    await expect(b).resolves.toBeNull();

    const boa = vi.fn(async () => ["x.jpg"]);
    await expect(listagemComMemoria("b", "p", boa)).resolves.toEqual(["x.jpg"]);
    expect(boa).toHaveBeenCalledTimes(1);
  });
});

/**
 * 3.ª revisão de 14/11, importante n.º 2: `desde` — o instante em que uma foto
 * entrou ou saiu da Reciclagem. Só serve uma listagem (guardada ou em curso)
 * que tenha COMEÇADO depois dele, com 5 s de folga para os relógios.
 */
describe("listagemComMemoria — `desde`", () => {
  it("uma listagem de antes da mudança não serve; a de depois serve a todos os pedidos da janela", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(1_000_000);
    let n = 0;
    const listar = vi.fn(async () => [`v${++n}`]);
    await expect(listagemComMemoria("b", "p", listar)).resolves.toEqual(["v1"]);
    // A mudança acontece 30 s depois (noutra instância).
    vi.setSystemTime(1_030_000);
    const desde = 1_030_000;
    await expect(listagemComMemoria("b", "p", listar, { desde })).resolves.toEqual(["v2"]);
    vi.setSystemTime(1_040_000);
    await expect(listagemComMemoria("b", "p", listar, { desde })).resolves.toEqual(["v2"]);
    await expect(listagemComMemoria("b", "p", listar)).resolves.toEqual(["v2"]);
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it("a folga: uma listagem começada até 5 s antes do `desde` ainda serve; 6 s antes, não", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(2_000_000);
    const listar = vi.fn(async () => ["x"]);
    await listagemComMemoria("b", "p", listar);
    vi.setSystemTime(2_010_000);
    await listagemComMemoria("b", "p", listar, { desde: 2_000_000 + FOLGA_DO_RELOGIO_MS });
    expect(listar).toHaveBeenCalledTimes(1);
    await listagemComMemoria("b", "p", listar, { desde: 2_000_000 + FOLGA_DO_RELOGIO_MS + 1_000 });
    expect(listar).toHaveBeenCalledTimes(2);
  });

  it("um `desde` no futuro (relógio adiantado) conta como agora — não lista a cada pedido", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(3_000_000);
    const listar = vi.fn(async () => ["x"]);
    const desde = 3_000_000 + 60_000;
    await listagemComMemoria("b", "p", listar, { desde });
    vi.setSystemTime(3_002_000);
    await listagemComMemoria("b", "p", listar, { desde });
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it("uma pergunta em curso que começou ANTES da mudança não serve a quem pede `desde`", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(4_000_000);
    let soltar: (v: string[]) => void = () => {};
    const lenta = vi.fn(() => new Promise<string[]>((r) => (soltar = r)));
    const velha = listagemComMemoria("b", "p", lenta);
    vi.setSystemTime(4_020_000);
    const nova = vi.fn(async () => ["nova"]);
    await expect(listagemComMemoria("b", "p", nova, { desde: 4_020_000 })).resolves.toEqual([
      "nova",
    ]);
    soltar(["velha"]);
    await expect(velha).resolves.toEqual(["velha"]);
    // A velha acabou depois, mas não escreve por cima da nova.
    await expect(listagemComMemoria("b", "p", nova)).resolves.toEqual(["nova"]);
    expect(nova).toHaveBeenCalledTimes(1);
  });
});
