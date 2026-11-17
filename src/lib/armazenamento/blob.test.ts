import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * As portas do Blob: o travão à frente de cada operação, o que se soma ao
 * contador, e que o token nunca aparece num erro nem num registo. O SDK e o
 * `fetch` são duplos — não há token verdadeiro neste ambiente.
 */

const SEGREDO = "vercel_blob_rw_Loja1234_SEGREDO-NAO-PODE-SAIR";

const contador = vi.hoisted(() => ({
  recusa: null as null | string,
  registados: [] as unknown[],
}));
vi.mock("./uso", () => ({
  travao: vi.fn(async () => contador.recusa),
  registar: vi.fn(async (g: unknown) => {
    contador.registados.push(g);
  }),
}));

const sdk = vi.hoisted(() => ({
  put: vi.fn(),
  head: vi.fn(),
  del: vi.fn(),
  copy: vi.fn(),
  issueSignedToken: vi.fn(),
  presignUrl: vi.fn(),
}));
vi.mock("@vercel/blob", () => sdk);

const registos = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/logger", () => {
  const guardar = (...a: unknown[]) =>
    registos.push(JSON.stringify(a, (_k, v) => (v instanceof Error ? v.message : v)));
  return { log: { info: guardar, warn: guardar, error: guardar } };
});

import {
  BlobAvariado,
  BlobRecusado,
  cabecalhoNoBlob,
  esquecerTestemunho,
  lerDoBlob,
  lerRespostaDoBlob,
  porNoBlob,
  urlDeLeituraDoBlob,
} from "./blob";
import { travao } from "./uso";

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = SEGREDO;
  contador.recusa = null;
  contador.registados = [];
  registos.length = 0;
  vi.clearAllMocks();
  esquecerTestemunho();
});
afterEach(() => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.unstubAllGlobals();
});

describe("porNoBlob", () => {
  it("escreve PRIVADO, sem sufixo aleatório, e soma uma operação avançada e os bytes", async () => {
    sdk.put.mockResolvedValue({ etag: '"e"' });
    await porNoBlob("proposal-pdfs/p/k.pdf", new Uint8Array(10), {
      sobrescrever: false,
      contentType: "application/pdf",
    });
    expect(sdk.put).toHaveBeenCalledWith(
      "proposal-pdfs/p/k.pdf",
      expect.any(Buffer),
      expect.objectContaining({
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        token: SEGREDO,
      }),
    );
    expect(contador.registados).toEqual([{ avancadas: 1, bytes: 10 }]);
  });

  it("o travão recusa ANTES de ir ao Blob, e nada se soma", async () => {
    contador.recusa = "armazenamento";
    await expect(
      porNoBlob("a/b", new Uint8Array(1), { sobrescrever: true }),
    ).rejects.toBeInstanceOf(BlobRecusado);
    expect(sdk.put).not.toHaveBeenCalled();
    expect(contador.registados).toEqual([]);
  });

  it("«já existe» vira o nosso `ja-existe`", async () => {
    sdk.put.mockRejectedValue(new Error("This blob already exists, use allowOverwrite"));
    await expect(
      porNoBlob("a/b", new Uint8Array(1), { sobrescrever: false }),
    ).rejects.toMatchObject({
      codigo: "ja-existe",
    });
  });

  it("um erro do SDK com o token na mensagem não o deixa sair — nem no erro, nem nos registos", async () => {
    const e = new Error(`falhou https://x?token=${SEGREDO}`);
    e.name = "BlobUnknownError";
    sdk.put.mockRejectedValue(e);
    const err = await porNoBlob("a/b", new Uint8Array(1), { sobrescrever: true }).catch((x) => x);
    expect(err).toBeInstanceOf(BlobAvariado);
    expect(String(err.message)).not.toContain(SEGREDO);
    expect(registos.join("\n")).not.toContain(SEGREDO);
    expect(registos.join("\n")).toContain("BlobUnknownError");
  });
});

describe("cabecalhoNoBlob", () => {
  it("devolve null quando não existe, e conta uma operação simples", async () => {
    const e = new Error("not found");
    e.name = "BlobNotFoundError";
    sdk.head.mockRejectedValue(e);
    expect(await cabecalhoNoBlob("a/b")).toBeNull();
  });

  it("devolve o tamanho", async () => {
    sdk.head.mockResolvedValue({ size: 42, contentType: "image/jpeg", etag: '"x"' });
    expect(await cabecalhoNoBlob("a/b")).toEqual({ tamanho: 42, tipo: "image/jpeg", etag: '"x"' });
    expect(contador.registados).toEqual([{ simples: 1 }]);
  });
});

describe("lerDoBlob", () => {
  it("lê do endereço privado da loja com o token no cabeçalho, e soma o que veio", async () => {
    const fetchFalso = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-length": "3", "content-type": "image/jpeg" },
        }),
    );
    vi.stubGlobal("fetch", fetchFalso);
    const r = await lerDoBlob("theme-assets/t/a.jpg", 3);
    expect(r?.bytes).toEqual(new Uint8Array([1, 2, 3]));
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://Loja1234.private.blob.vercel-storage.com/theme-assets/t/a.jpg");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SEGREDO}`);
    expect(contador.registados).toEqual([{ simples: 1, transferencia: 3 }]);
  });

  it("404 = não existe (null), não erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await lerDoBlob("a/b")).toBeNull();
  });

  it("acima do tecto de leituras, nem chega a pedir", async () => {
    contador.recusa = "operacoes-simples";
    const fetchFalso = vi.fn();
    vi.stubGlobal("fetch", fetchFalso);
    await expect(lerDoBlob("a/b")).rejects.toBeInstanceOf(BlobRecusado);
    expect(fetchFalso).not.toHaveBeenCalled();
  });
});

describe("urlDeLeituraDoBlob", () => {
  it("emite UM testemunho e assina localmente os seguintes", async () => {
    sdk.issueSignedToken.mockResolvedValue({
      delegationToken: "d",
      clientSigningToken: "c",
      validUntil: Date.now() + 6 * 24 * 3600_000,
    });
    sdk.presignUrl.mockImplementation(async (_t, o: { pathname: string }) => ({
      presignedUrl: `https://x/${o.pathname}?sig`,
    }));
    await urlDeLeituraDoBlob("a/1.jpg", Date.now() + 60_000, 100);
    await urlDeLeituraDoBlob("a/2.jpg", Date.now() + 60_000, 100);
    expect(sdk.issueSignedToken).toHaveBeenCalledTimes(1);
    expect(sdk.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({ operations: ["get"] }),
    );
    // Cada endereço conta o pior caso: uma leitura sem cache, com o ficheiro inteiro.
    expect(contador.registados).toContainEqual({ simples: 1, transferencia: 100 });
  });

  it("nunca assina para mais de 24 h", async () => {
    sdk.issueSignedToken.mockResolvedValue({
      delegationToken: "d",
      clientSigningToken: "c",
      validUntil: Date.now() + 6 * 24 * 3600_000,
    });
    sdk.presignUrl.mockResolvedValue({ presignedUrl: "https://x" });
    await urlDeLeituraDoBlob("a/1.jpg", Date.now() + 10 * 365 * 24 * 3600_000, 1);
    const opcoes = sdk.presignUrl.mock.calls[0][1] as { validUntil: number };
    expect(opcoes.validUntil - Date.now()).toBeLessThanOrEqual(24 * 3600_000);
  });
});

describe("revisão de 17/11", () => {
  it("n.º 4: uma leitura sem tamanho conhecido pergunta ao travão por 1 byte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    await lerDoBlob("a/b");
    expect(travao).toHaveBeenCalledWith({ simples: 1, transferencia: 1 });
  });

  it("2.ª revisão, n.º 1: cada endereço pedido passa pelo travão e conta o ficheiro inteiro", async () => {
    sdk.issueSignedToken.mockResolvedValue({
      delegationToken: "d",
      clientSigningToken: "c",
      validUntil: Date.now() + 6 * 24 * 3600_000,
    });
    sdk.presignUrl.mockResolvedValue({ presignedUrl: "https://x/a?sig" });
    await urlDeLeituraDoBlob("p/a.jpg", Date.now() + 3600_000, 3_000_000);
    await urlDeLeituraDoBlob("p/a.jpg", Date.now() + 3600_000, 3_000_000);
    expect(
      contador.registados.filter((g) => (g as { transferencia?: number }).transferencia),
    ).toEqual([
      { simples: 1, transferencia: 3_000_000 },
      { simples: 1, transferencia: 3_000_000 },
    ]);
    contador.recusa = "transferencia";
    await expect(
      urlDeLeituraDoBlob("p/a.jpg", Date.now() + 3600_000, 3_000_000),
    ).rejects.toBeInstanceOf(BlobRecusado);
  });

  it("3.ª revisão, n.º 1: sem content-length, conta os bytes que passam (exacto)", async () => {
    const corpo = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(4));
        c.enqueue(new Uint8Array(3));
        c.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpo, { status: 200 })),
    );
    const r = await lerRespostaDoBlob("a/b.pdf", {}, 100);
    await r!.arrayBuffer();
    await new Promise((ok) => setTimeout(ok, 0));
    expect(contador.registados).toEqual([{ simples: 1 }, { transferencia: 7 }]);
  });

  it("3.ª revisão, n.º 1: um 404 conta a operação mas nenhum byte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await lerRespostaDoBlob("a/b.pdf", {}, 100)).toBeNull();
    expect(contador.registados).toEqual([{ simples: 1 }]);
  });
});
