import { describe, expect, it } from "vitest";
import type { ThemeSummary } from "@/lib/theme-types";
import { capaDaFoto, comCapa } from "./capa-do-cartao";

/**
 * A capa de um cartão muda inteira — ver `capa-do-cartao.ts`. O caso de ponta
 * a ponta (escolher a capa na pasta e voltar à grelha) está no
 * `Temas.test.tsx`; aqui ficam as duas regras que ele não isola.
 */
// `coverAvif` saiu a 14/11; um cartão guardado de antes ainda o pode trazer.
const cartao: ThemeSummary & { coverAvif?: string } = {
  id: "t1",
  name: "Terracotta",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  imageCount: 2,
  coverUrl: "https://cdn.test/thumb-1.webp?token=antigo",
  coverAvif: "https://cdn.test/avif-1.avif?token=antigo",
  coverFallbackUrl: "https://cdn.test/foto-1.jpg?token=antigo",
  coverLqip: "data:lqip-1",
  coverCor: "#a07850",
};

describe("a capa do cartão", () => {
  it("a cor da fotografia nova entra com ela, e a da antiga sai", () => {
    const com = comCapa(
      cartao,
      capaDaFoto({
        path: "t1/foto-2.jpg",
        url: "https://cdn.test/foto-2.jpg",
        thumbUrl: "https://cdn.test/thumb-2.webp",
        cor: "#203040",
      }),
    );
    expect(com.coverCor).toBe("#203040");
    expect(com).not.toHaveProperty("coverAvif");
    expect(com.coverLqip).toBeUndefined();

    // Uma fotografia sem cor não herda a da antiga.
    const sem = comCapa(cartao, capaDaFoto({ path: "t1/foto-3.jpg", url: "https://x/3.jpg" }));
    expect(sem).not.toHaveProperty("coverCor");
    // Sem miniatura, o original É a capa e não há plano B.
    expect(sem.coverUrl).toBe("https://x/3.jpg");
    expect(sem).not.toHaveProperty("coverFallbackUrl");
  });

  it("a MESMA fotografia reassinada não troca nada", () => {
    const igual = comCapa(
      cartao,
      capaDaFoto({
        path: "t1/foto-1.jpg",
        url: "https://cdn.test/foto-1.jpg?token=novo",
        thumbUrl: "https://cdn.test/thumb-1.webp?token=novo",
      }),
    );
    expect(igual).toBe(cartao);
  });

  it("a pasta vazia tira a capa toda", () => {
    const vazio = comCapa(cartao, capaDaFoto(null));
    for (const campo of ["coverUrl", "coverAvif", "coverFallbackUrl", "coverLqip", "coverCor"]) {
      expect(vazio).not.toHaveProperty(campo);
    }
  });
});
