import { describe, expect, it, vi } from "vitest";

/**
 * 2.ª revisão de 14/11, importante n.º 3: `marcarFotoMexida` é uma escrita
 * normal da aplicação — o `updated_at` da linha passa a agora (o `touch` do
 * repositório põe-no também no Supabase). Sem linha não cria nada, e uma falha
 * da base não rebenta quem chama (a foto já voltou).
 */
const repo = vi.hoisted(() => ({
  update: vi.fn(async (_id: string, _patch: Record<string, unknown>) => null as unknown),
}));
vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("./repository", () => ({ createRepository: () => repo }));

const { marcarFotoMexida } = await import("./biblioteca-fotos-store");

describe("marcarFotoMexida", () => {
  it("põe o updated_at da linha a agora, pela escrita do repositório", async () => {
    const antes = Date.now();
    await marcarFotoMexida("tema-1/a.jpg");
    expect(repo.update).toHaveBeenCalledTimes(1);
    const [id, patch] = repo.update.mock.calls[0];
    expect(id).toBe("tema-1/a.jpg");
    expect(Object.keys(patch)).toEqual(["updatedAt"]);
    expect(Date.parse(String(patch.updatedAt))).toBeGreaterThanOrEqual(antes);
  });

  it("uma base em baixo não rebenta quem chama", async () => {
    repo.update.mockRejectedValueOnce(new Error("em baixo"));
    await expect(marcarFotoMexida("tema-1/a.jpg")).resolves.toBeUndefined();
  });
});
