import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { chaveDaVersao, originaisCitados } from "./so-originais-precisos.mjs";
import { galleryKey } from "@/app/[lang]/(site)/galeria/gallery-image-loader";

describe("so-originais-precisos", () => {
  it("encontra os originais citados pelo nome, e só esses", () => {
    const citados = originaisCitados([
      'const og = "/imagens/EW1_1330.jpg";',
      "capa: '/imagens/J&A-68.jpg',",
      "const nada = '/outra/coisa.jpg';",
    ]);
    expect([...citados].sort()).toEqual(["EW1_1330.jpg", "J&A-68.jpg"]);
  });

  it("a chave das versões é a mesma do carregador da galeria, para todos os originais", () => {
    const nomes = readdirSync(join(process.cwd(), "public", "imagens"));
    expect(nomes.length).toBeGreaterThan(100);
    for (const n of nomes) expect(chaveDaVersao(n)).toBe(galleryKey(`/imagens/${n}`));
  });
});
