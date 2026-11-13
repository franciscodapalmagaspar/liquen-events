// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act, cleanup } from "@testing-library/react";
import { useCachedList, prefetchList, __resetListCache } from "./useCachedList";

/**
 * O que estes testes protegem é a parte que se sente ao clicar: uma
 * revalidação que não mudou nada não pode custar bytes NEM um render, e três
 * sítios a pedir a mesma lista ao mesmo tempo não podem virar três viagens.
 */

interface Reply {
  status: number;
  body?: unknown;
  etag?: string;
}

let replies: Reply[] = [];
let requests: { url: string; ifNoneMatch: string | null }[] = [];

function fetchMock(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers((init?.headers as HeadersInit) ?? {});
  requests.push({ url: String(url), ifNoneMatch: headers.get("If-None-Match") });
  const reply = replies.shift() ?? { status: 200, body: [] };
  const resHeaders = new Headers();
  if (reply.etag) resHeaders.set("etag", reply.etag);
  return Promise.resolve({
    ok: reply.status >= 200 && reply.status < 300,
    status: reply.status,
    headers: resHeaders,
    json: async () => reply.body,
  } as unknown as Response);
}

beforeEach(() => {
  __resetListCache();
  replies = [];
  requests = [];
  vi.stubGlobal("fetch", vi.fn(fetchMock));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCachedList — primeira visita", () => {
  it("mostra o esqueleto uma vez, guarda os dados e o ETag", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: "a" }]);
    expect(requests[0].ifNoneMatch).toBeNull();
  });

  it("marca erro quando a rota falha, sem deitar fora o esqueleto para sempre", async () => {
    replies = [{ status: 500 }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.loading).toBe(false);
  });

  it("guarda a MENSAGEM que o servidor deu, para o ecrã a poder mostrar", async () => {
    // É a diferença entre "não foi possível ler" e "falta correr o
    // db/schema.sql" — a segunda resolve-se sozinha, sem ir aos registos.
    replies = [{ status: 503, body: { error: "Falta correr o db/schema.sql." } }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.errorMessage).toBe("Falta correr o db/schema.sql.");
  });

  it("uma falha muda não põe «500» no ecrã — diz o número dentro de uma frase", async () => {
    // O aviso mostra a `errorMessage` tal e qual, portanto o que aqui saía em
    // cru era o que ela lia: «500». O número continua lá (é o que se cita a
    // pedir ajuda), agora com o que se passou e o que fazer à volta dele.
    replies = [{ status: 500, body: null }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.errorMessage).not.toBe("500");
    expect(result.current.errorMessage).toContain("(500)");
    expect(result.current.errorMessage).toMatch(/tenta outra vez/i);
    expect(result.current.falha?.valeTentarDeNovo).toBe(true);
  });

  it("com a sessão caída não oferece um «Tentar de novo» que não pode funcionar", async () => {
    // O caso mais comum de uma leitura falhada: o back office fica aberto
    // horas e o cookie caduca sozinho. Pedir outra vez com a mesma sessão dá
    // o mesmo 401 — quem resolve isto é a reentrada.
    replies = [{ status: 401, body: { error: "Não autorizado" } }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.falha?.sessaoExpirou).toBe(true);
    expect(result.current.falha?.valeTentarDeNovo).toBe(false);
    expect(result.current.errorMessage).toMatch(/sessão expirou/i);
    expect(result.current.errorMessage).toMatch(/volta a entrar/i);
  });

  it("a frase de uma LEITURA não manda repetir nem fala do que se escreveu", async () => {
    replies = [{ status: 503, body: null }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.errorMessage).not.toMatch(/\brepete\b|escreveste|gravaç/i);
  });

  it("sem rede, diz que foi a ligação — e não inventa um número", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));
    expect(result.current.falha?.razao).toBe("sem-rede");
    expect(result.current.errorMessage).toContain("Sem ligação");
  });

  it("uma leitura que corre bem a seguir limpa o erro E a mensagem", async () => {
    replies = [{ status: 503, body: { error: "Falta correr o db/schema.sql." } }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.error).toBe(true));

    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBe(false));
    expect(result.current.errorMessage).toBe("");
    expect(result.current.falha).toBeNull();
  });
});

describe("useCachedList — revalidação condicional", () => {
  it("reenvia o ETag e, num 304, mantém a MESMA referência do array", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const first = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    const arrayFromFirstVisit = first.result.current.data;
    first.unmount();

    // Segunda visita à mesma vista: nada mudou no servidor.
    replies = [{ status: 304 }];
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    // Sem esqueleto: já havia dados em cache.
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].ifNoneMatch).toBe('W/"v1"');
    // A MESMA referência — é isto que faz o React não redesenhar as linhas.
    expect(second.result.current.data).toBe(arrayFromFirstVisit);
    expect(second.result.current.error).toBe(false);
  });

  it("aceita o corpo novo quando os dados mudaram mesmo", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const first = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(first.result.current.data).toBeDefined());
    first.unmount();

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(second.result.current.data).toHaveLength(2));

    // E o ETag novo é o que segue à viagem seguinte.
    second.unmount();
    replies = [{ status: 304 }];
    renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(requests[2].ifNoneMatch).toBe('W/"v2"');
  });
});

describe("useCachedList — pedidos em simultâneo", () => {
  it("o prefetch ocioso e a vista a montar partilham UMA viagem", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    prefetchList("k", "/api/k");
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));

    await waitFor(() => expect(result.current.data).toEqual([{ id: "a" }]));
    expect(requests).toHaveLength(1);
  });

  it("duas vistas a pedir a mesma chave ao mesmo tempo também", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const a = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    const b = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(a.result.current.data).toBeDefined());
    await waitFor(() => expect(b.result.current.data).toBeDefined());
    expect(requests).toHaveLength(1);
    expect(a.result.current.data).toBe(b.result.current.data);
  });

  it("o prefetch não repete o que já está em cache", async () => {
    replies = [{ status: 200, body: [], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    prefetchList("k", "/api/k");
    expect(requests).toHaveLength(1);
  });
});

describe("useCachedList — escritas optimistas", () => {
  it("uma escrita optimista força um corpo completo na revalidação seguinte", async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result, unmount } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());

    act(() => result.current.setData((prev) => [...prev, { id: "b" }]));
    expect(result.current.data).toHaveLength(2);
    unmount();

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    renderHook(() => useCachedList("k", "/api/k"));
    await waitFor(() => expect(requests).toHaveLength(2));
    // Sem ETag: o que temos em mão já não é a versão que o servidor carimbou.
    expect(requests[1].ifNoneMatch).toBeNull();
  });

  it("um 304 que chegue atrasado nunca desfaz a escrita optimista", async () => {
    // O pedido parte com o ETag v1; a equipa edita uma linha enquanto ele voa.
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => (release = r));
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];

    const { result, unmount } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());
    unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const second = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    act(() => second.result.current.setData([{ id: "a" }, { id: "editado" }]));

    release({
      ok: false,
      status: 304,
      headers: new Headers(),
      json: async () => undefined,
    } as unknown as Response);

    await waitFor(() => expect(second.result.current.data).toHaveLength(2));
    expect(second.result.current.data).toEqual([{ id: "a" }, { id: "editado" }]);
  });

  it("um 200 que chegue atrasado também não desfaz a escrita optimista", async () => {
    // O gémeo do caso de cima, e o que a cache tinha por tratar: o pedido parte,
    // ela apaga uma linha enquanto ele voa, e o corpo que chega descreve o
    // mundo de ANTES dessa alteração. Escrevê-lo na cache repõe a linha
    // apagada à frente dela — e, pior, com o ETag novo: a revalidação seguinte
    // leva um 304 e a linha ressuscitada fica. Como a cache é partilhada, a
    // entrada envenenada aparece em todos os painéis com esta chave.
    let release: (r: Response) => void = () => {};
    const pending = new Promise<Response>((r) => (release = r));
    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v1"' }];

    const primeira = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(primeira.result.current.data).toHaveLength(2));
    primeira.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => pending),
    );
    const segunda = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    // Ela apaga a linha "b" enquanto a revalidação está no ar.
    act(() => segunda.result.current.setData([{ id: "a" }]));

    await act(async () => {
      release({
        ok: true,
        status: 200,
        headers: new Headers({ etag: 'W/"v2"' }),
        json: async () => [{ id: "a" }, { id: "b" }],
      } as unknown as Response);
      // Deixar a resposta atravessar a cadeia toda antes de perguntar seja o
      // que for: é precisamente quando ela assenta que o defeito aparecia.
      await pending;
      await Promise.resolve();
      await Promise.resolve();
    });

    // A linha apagada não volta ao ecrã…
    expect(segunda.result.current.data).toEqual([{ id: "a" }]);
    segunda.unmount();

    // …nem à cache: o painel seguinte a montar com esta chave vê o que ela fez.
    vi.stubGlobal("fetch", vi.fn(fetchMock));
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v3"' }];
    const terceira = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    expect(terceira.result.current.data).toEqual([{ id: "a" }]);
    // E sem ETag: o que temos em mão continua a não ser o que o servidor
    // carimbou, portanto a viagem seguinte tem de trazer o corpo todo.
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1].ifNoneMatch).toBeNull();
  });
});

describe("useCachedList — refresh", () => {
  it('"Actualizar" traz dados a sério: sem ETag, com esqueleto', async () => {
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("k", "/api/k"));
    await waitFor(() => expect(result.current.data).toBeDefined());

    replies = [{ status: 200, body: [{ id: "a" }, { id: "b" }], etag: 'W/"v2"' }];
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(requests[1].ifNoneMatch).toBeNull();
  });
});

/**
 * N.º 9 da auditoria de 13/11: o «Hoje», os Lembretes, a Agenda, as Tarefas e
 * as tarefas do pedido lêem a MESMA lista e estão montados ao mesmo tempo. Uma
 * tarefa riscada num ficava por fazer nos outros, e voltar ao separador não
 * trazia o que a colega tinha feito noutro computador.
 */
describe("useCachedList — os ecrãs da mesma lista falam uns com os outros", () => {
  it("n.º 9: uma escrita num ecrã chega ao outro, e voltar ao separador pergunta outra vez", async () => {
    // Os ganchos dos testes de cima continuam montados (e a ouvir o regresso
    // ao separador); desmontá-los deixa as respostas todas para estes dois.
    cleanup();
    replies = [{ status: 200, body: [{ id: "t1", done: false }], etag: 'W/"v1"' }, { status: 304 }];
    const hoje = renderHook(() =>
      useCachedList<{ id: string; done: boolean }[]>("t", "/api/t", { revalidarAoVoltar: true }),
    );
    await waitFor(() => expect(hoje.result.current.loading).toBe(false));
    const tarefas = renderHook(() =>
      useCachedList<{ id: string; done: boolean }[]>("t", "/api/t", { revalidarAoVoltar: true }),
    );
    await waitFor(() => expect(requests).toHaveLength(2));

    // Riscada no ecrã das Tarefas — o «Hoje» tem de a ver riscada já.
    act(() => tarefas.result.current.setData((l) => l.map((t) => ({ ...t, done: true }))));
    expect(hoje.result.current.data).toEqual([{ id: "t1", done: true }]);

    // A colega acrescentou uma noutro computador; ela volta ao separador meia
    // hora depois.
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    replies = [
      {
        status: 200,
        body: [
          { id: "t1", done: true },
          { id: "t2", done: false },
        ],
        etag: 'W/"v2"',
      },
    ];
    const antes = requests.length;
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(hoje.result.current.data).toHaveLength(2));
    expect(tarefas.result.current.data).toHaveLength(2);
    // Duas vistas montadas, UMA viagem.
    expect(requests.length - antes).toBe(1);
    vi.restoreAllMocks();
  });
});

/**
 * Revisão do PR #444 (custo): cada regresso ao separador relia TODAS as listas
 * montadas — e a rota, para responder 304, lê a tabela inteira do Supabase.
 * Só as listas que o pedem voltam a perguntar.
 */
describe("useCachedList — voltar ao separador só relê quem o pede", () => {
  it("uma lista sem `revalidarAoVoltar` não vai à rede ao voltar ao separador", async () => {
    cleanup();
    replies = [{ status: 200, body: [{ id: "a" }], etag: 'W/"v1"' }];
    const { result } = renderHook(() => useCachedList<{ id: string }[]>("grande", "/api/grande"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const antes = requests.length;
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31 * 60_000);
    try {
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(requests.length).toBe(antes);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
