import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Registos de 10–13/11: ~30 «estúdio: imagem não desenhou no browser», todas
 * com estado 400 sobre ficheiros que EXISTEM no Storage (verificado um a um) —
 * assinaturas de 6 h já mortas, que se refazem sozinhas. Ficavam misturadas,
 * no mesmo aviso, com as que importam: um ficheiro que não existe.
 */
const st = vi.hoisted(() => ({
  avisos: [] as Array<{ m: string; c: Record<string, unknown> }>,
  infos: [] as Array<{ m: string; c: Record<string, unknown> }>,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: true }),
  sweep: () => undefined,
}));
vi.mock("@/lib/logger", () => ({
  log: {
    warn: (m: string, c: Record<string, unknown>) => st.avisos.push({ m, c }),
    info: (m: string, c: Record<string, unknown>) => st.infos.push({ m, c }),
    error: vi.fn(),
  },
}));

import { POST } from "./route";

const pedir = (corpo: unknown) =>
  POST(
    new Request("http://x/api/admin/imagem-falhou", {
      method: "POST",
      body: JSON.stringify(corpo),
    }) as unknown as NextRequest,
  );

const URL_ =
  "https://x.supabase.co/storage/v1/object/sign/theme-assets/t/a.jpg?token=eyJ.SEGREDO.x";

beforeEach(() => {
  st.avisos = [];
  st.infos = [];
});

describe("POST /api/admin/imagem-falhou", () => {
  it("uma assinatura expirada não é um aviso: refaz-se sozinha, e fica como informação", async () => {
    await pedir({
      onde: "mood-board",
      ref: "tema:t/a.jpg",
      url: URL_,
      estado: null,
      expirada: true,
    });
    expect(st.avisos).toHaveLength(0);
    expect(st.infos).toHaveLength(1);
    expect(st.infos[0]!.c).toMatchObject({ causa: "assinatura expirada" });
  });

  it("um 404 é um ficheiro em falta, e continua a ser aviso", async () => {
    await pedir({ onde: "capa", url: URL_, estado: 404, expirada: false });
    expect(st.avisos).toHaveLength(1);
    expect(st.avisos[0]!.c).toMatchObject({ causa: "ficheiro em falta", estado: 404 });
  });

  it("um 404 é aviso mesmo com a assinatura expirada (2.ª revisão de 17/11)", async () => {
    await pedir({ onde: "capa", url: URL_, estado: 404, expirada: true });
    expect(st.infos).toHaveLength(0);
    expect(st.avisos).toHaveLength(1);
    expect(st.avisos[0]!.c).toMatchObject({ causa: "ficheiro em falta", estado: 404 });
  });

  it("o token nunca chega ao registo", async () => {
    await pedir({ onde: "capa", url: URL_, estado: 403 });
    expect(JSON.stringify([...st.avisos, ...st.infos])).not.toContain("SEGREDO");
  });
});
