import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => null }));
vi.mock("@/lib/theme-storage", () => ({ garantirBucketDeDerivadas: async () => true }));
vi.mock("@/lib/fotos-editoriais-guardadas", () => ({ BUCKET_EDITORIAL: "fotos-editoriais" }));

import { desembrulhar, embrulhar, lerPaginaGuardada } from "./paginas-do-rascunho-guardadas";

describe("a página do estúdio guardada", () => {
  const imagem = Buffer.from("RIFF-webp-de-teste");

  it("volta igual, com o número de páginas, para o mesmo rascunho", () => {
    const b = embrulhar("rascunho:abc", 14, imagem);
    expect(desembrulhar("rascunho:abc", b)).toEqual({ imagem, paginas: 14 });
  });

  it("nunca serve a página de outro rascunho (a versão velha da mesma página)", () => {
    const b = embrulhar("rascunho:abc", 14, imagem);
    expect(desembrulhar("rascunho:abd", b)).toBeNull();
    expect(desembrulhar("rascunho:abc", Buffer.alloc(10))).toBeNull();
  });

  it("sem armazenamento, não há guardada (desenha-se como antes)", async () => {
    expect(await lerPaginaGuardada("q1", "pt", 3, 800, "rascunho:abc")).toBeNull();
  });
});
