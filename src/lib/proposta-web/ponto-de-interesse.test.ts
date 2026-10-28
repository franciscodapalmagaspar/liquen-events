import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./guardado", () => ({
  chaveDoGuardado: (...p: string[]) => p.join(":"),
  guardadoOuCalculado: <T>(_c: string, calcular: () => Promise<T>) => calcular(),
}));
vi.mock("@/lib/logger", () => ({ log: { warn: vi.fn() } }));

const { pontoDaAtencao, pontosDeInteresse } = await import("./ponto-de-interesse");

afterEach(() => vi.unstubAllGlobals());

describe("onde recortar uma foto que ela não enquadrou (28/10)", () => {
  it("passa as coordenadas do sharp a fracções da imagem", () => {
    expect(pontoDaAtencao({ attentionX: 100, attentionY: 150 }, 400, 300)).toEqual({
      x: 0.25,
      y: 0.5,
    });
    expect(pontoDaAtencao({}, 400, 300)).toBeNull();
    expect(pontoDaAtencao({ attentionX: 900, attentionY: -5 }, 400, 300)).toEqual({ x: 1, y: 0 });
  });

  it("com uma foto de verdade, o ponto fica do lado onde está o motivo", async () => {
    const { default: sharp } = await import("sharp");
    // Fundo liso, um motivo com cor e detalhe à esquerda.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#e6e1d8"/><circle cx="70" cy="150" r="45" fill="#c0392b"/><circle cx="80" cy="140" r="15" fill="#111"/></svg>`;
    const jpeg = await sharp(Buffer.from(svg)).jpeg().toBuffer();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(jpeg))),
    );
    const pontos = await pontosDeInteresse("p1", [{ ref: "a", url: "https://x/a.jpg" }]);
    expect(pontos.get("a")?.x).toBeLessThan(0.4);
  });

  it("sem rede, não há ponto — e não rebenta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede");
      }),
    );
    const pontos = await pontosDeInteresse("p1", [{ ref: "a", url: "https://x/a.jpg" }]);
    expect(pontos.size).toBe(0);
  });
});
