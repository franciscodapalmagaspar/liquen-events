import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetListCache, lerDaCache, prefetchList } from "./useCachedList";

/**
 * `lerDaCache` é a porta da procura em tudo do ⌘K (BO 4), e a regra de custo
 * dela é uma só: ler o que já está na memória e NUNCA perguntar ao servidor.
 */

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn(async () => resposta([{ id: "t1", title: "Confirmar a tenda" }]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("lerDaCache", () => {
  it("uma lista que ninguém pediu é `undefined` — e não se vai buscar", () => {
    expect(lerDaCache("tarefas")).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("depois de alguém a trazer, devolve-a — sem pedido nenhum a mais", async () => {
    prefetchList("tarefas", "/api/tarefas");
    await vi.waitFor(() => expect(lerDaCache("tarefas")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const lida = lerDaCache<{ id: string }[]>("tarefas");
    lerDaCache("tarefas");
    lerDaCache("calendario");
    expect(lida?.[0].id).toBe("t1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
