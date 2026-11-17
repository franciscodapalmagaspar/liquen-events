import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sb = vi.hoisted(() => ({
  ficheiros: {} as Record<string, { id: string; name: string; created_at: string }[]>,
  removidos: [] as string[],
}));
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({ BUCKET_EDITORIAL: "fotos-editoriais" }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: () => ({
        list: async (pasta: string) => ({
          data:
            pasta === ""
              ? Object.keys(sb.ficheiros).map((n) => ({ id: null, name: n }))
              : sb.ficheiros[pasta],
        }),
        remove: async (caminhos: string[]) => {
          sb.removidos.push(...caminhos);
          return { error: null };
        },
      }),
    },
  }),
}));

import { limparFotosTratadasVelhas, queSaiDaCache, TECTO_BYTES } from "./limpar-fotos-tratadas";

describe("as fotos tratadas com mais de 30 dias saem (10/11)", () => {
  it("apaga as velhas e deixa as recentes", async () => {
    const agora = new Date("2026-12-15T03:00:00Z");
    sb.ficheiros = {
      ab: [
        { id: "1", name: "velha.jpg", created_at: "2026-11-03T10:00:00Z" },
        { id: "2", name: "nova.jpg", created_at: "2026-12-10T10:00:00Z" },
      ],
      cd: [{ id: "3", name: "outra-velha.jpg", created_at: "2026-11-01T10:00:00Z" }],
    };
    sb.removidos = [];
    const r = await limparFotosTratadasVelhas(agora);
    expect(sb.removidos.sort()).toEqual(["ab/velha.jpg", "cd/outra-velha.jpg"]);
    expect(r).toMatchObject({ apagadas: 2, pastas: 2, acabou: true });
  });
});

/**
 * Medido a 17/11: a cache ia em 128 MB com a regra dos 7 dias — 85 MB nasceram
 * num só dia de trabalho (16/11). A folga que o travão reserva para o que o
 * servidor guarda sozinho é de 40 MB por dia, e o plano ia em 913 MB de 1 GB.
 * A idade sozinha não chega: a cache passa a ter também um TECTO de bytes, e
 * acima dele saem as mais velhas primeiro. Tudo o que sai refaz-se sozinho
 * (`proposal-doc-render.guardadas.test.ts`, «a cache apagada refaz-se»).
 */
describe("a cache das fotos tratadas tem um tecto (17/11)", () => {
  const MB = 1024 * 1024;
  const f = (id: string, created_at: string, mb: number) => ({
    id,
    name: `${id}.jpg`,
    created_at,
    metadata: { size: mb * MB },
  });

  it("abaixo do tecto, só a idade conta", () => {
    const agora = new Date("2026-11-17T04:00:00Z");
    const sai = queSaiDaCache(
      [
        { caminho: "ab/a.jpg", criado: "2026-11-16T10:00:00Z", bytes: 10 * MB },
        { caminho: "ab/b.jpg", criado: "2026-11-01T10:00:00Z", bytes: 1 * MB },
      ],
      agora,
    );
    expect(sai).toEqual(["ab/b.jpg"]);
  });

  it("acima do tecto saem as mais velhas até caber, e as recentes ficam", () => {
    const agora = new Date("2026-11-17T04:00:00Z");
    const sai = queSaiDaCache(
      [
        { caminho: "aa/nova.jpg", criado: "2026-11-16T22:00:00Z", bytes: 40 * MB },
        { caminho: "bb/media.jpg", criado: "2026-11-14T10:00:00Z", bytes: 30 * MB },
        { caminho: "cc/velha.jpg", criado: "2026-11-11T10:00:00Z", bytes: 30 * MB },
      ],
      agora,
    );
    // 100 MB com tecto de 64: sai a velha (70 ainda passa), depois a média (40 cabe).
    expect(TECTO_BYTES).toBe(64 * MB);
    expect(sai).toEqual(["cc/velha.jpg", "bb/media.jpg"]);
  });

  it("um ficheiro sem data conta como o mais velho — o lado seguro do tecto", () => {
    const agora = new Date("2026-11-17T04:00:00Z");
    const sai = queSaiDaCache(
      [
        { caminho: "aa/sem-data.jpg", criado: null, bytes: 1 * MB },
        { caminho: "bb/ok.jpg", criado: "2026-11-16T10:00:00Z", bytes: 1 * MB },
      ],
      agora,
    );
    expect(sai).toEqual(["aa/sem-data.jpg"]);
  });

  it("na tarefa da noite: apaga pela idade e pelo tecto", async () => {
    const agora = new Date("2026-11-17T04:00:00Z");
    sb.ficheiros = {
      aa: [f("nova", "2026-11-16T22:00:00Z", 40)],
      bb: [f("media", "2026-11-14T10:00:00Z", 30)],
      cc: [f("velha", "2026-11-11T10:00:00Z", 30)],
    };
    sb.removidos = [];
    const r = await limparFotosTratadasVelhas(agora);
    expect(sb.removidos.sort()).toEqual(["bb/media.jpg", "cc/velha.jpg"]);
    expect(r).toMatchObject({ apagadas: 2, pastas: 3, acabou: true, bytesQueFicam: 40 * MB });
  });

  it("se o tempo acaba antes de ler todas as pastas, não apaga nada pelo tecto (não se sabe o total)", async () => {
    const agora = new Date("2026-11-17T04:00:00Z");
    sb.ficheiros = {
      aa: [f("nova", "2026-11-16T22:00:00Z", 40)],
      bb: [f("media", "2026-11-14T10:00:00Z", 30)],
      cc: [f("velha", "2026-11-11T10:00:00Z", 30)],
    };
    sb.removidos = [];
    const r = await limparFotosTratadasVelhas(agora, -1);
    expect(sb.removidos).toEqual([]);
    expect(r.acabou).toBe(false);
  });
});
