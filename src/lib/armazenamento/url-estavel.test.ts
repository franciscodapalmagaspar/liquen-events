import { describe, expect, it } from "vitest";
import { conferirUrlEstavel, urlEstavel } from "./url-estavel";
import { blobConfigurado, caminhoValido, idDaLoja, origemDoBlob } from "./baldes";

const SEGREDO = "vercel_blob_rw_AbCd1234_segredoQueNaoPodeSair";
const AGORA = Date.UTC(2026, 10, 16, 12);

function partes(url: string) {
  const u = new URL(url, "https://x");
  const [, , , balde, ...resto] = u.pathname.split("/");
  return {
    balde,
    caminho: resto.map(decodeURIComponent).join("/"),
    token: u.searchParams.get("token"),
  };
}

describe("o endereço estável de um ficheiro do Blob", () => {
  it("abre o ficheiro que assina, com o tamanho e o prazo lá dentro", () => {
    const url = urlEstavel("proposal-assets", "LIQ-3/ab12.jpg", 3_000_000, 3600, SEGREDO, AGORA);
    expect(url.startsWith("/api/ficheiro/proposal-assets/LIQ-3/ab12.jpg?token=")).toBe(true);
    const p = partes(url);
    const r = conferirUrlEstavel(p.balde, p.caminho, p.token, SEGREDO, AGORA + 1000);
    expect(r).toEqual({
      ok: true,
      balde: "proposal-assets",
      caminho: "LIQ-3/ab12.jpg",
      tamanho: 3_000_000,
      expiraEm: AGORA + 3600_000,
    });
  });

  it("o token tem a forma de um JWT com `exp` — o que o estúdio já sabe ler", () => {
    const p = partes(urlEstavel("theme-assets", "a/b.jpg", 1, 6 * 3600, SEGREDO, AGORA));
    const meio = JSON.parse(Buffer.from(p.token!.split(".")[1], "base64url").toString());
    expect(meio.exp).toBe(AGORA / 1000 + 6 * 3600);
  });

  it("recusa outro ficheiro com a mesma assinatura", () => {
    const p = partes(urlEstavel("proposal-assets", "LIQ-3/ab12.jpg", 1, 3600, SEGREDO, AGORA));
    expect(
      conferirUrlEstavel("proposal-assets", "LIQ-4/ab12.jpg", p.token, SEGREDO, AGORA),
    ).toEqual({
      ok: false,
      motivo: "assinatura",
    });
    expect(conferirUrlEstavel("theme-assets", "LIQ-3/ab12.jpg", p.token, SEGREDO, AGORA)).toEqual({
      ok: false,
      motivo: "assinatura",
    });
  });

  it("recusa uma carga mexida (outro tamanho, prazo maior)", () => {
    const p = partes(urlEstavel("proposal-assets", "x/y.jpg", 1, 60, SEGREDO, AGORA));
    const [h, , s] = p.token!.split(".");
    const outra = Buffer.from(
      JSON.stringify({ exp: AGORA / 1000 + 10 ** 9, t: 1, b: "proposal-assets", c: "x/y.jpg" }),
    ).toString("base64url");
    expect(conferirUrlEstavel(p.balde, p.caminho, `${h}.${outra}.${s}`, SEGREDO, AGORA).ok).toBe(
      false,
    );
  });

  it("recusa com outro segredo (token do Blob trocado)", () => {
    const p = partes(urlEstavel("proposal-assets", "x/y.jpg", 1, 60, SEGREDO, AGORA));
    expect(conferirUrlEstavel(p.balde, p.caminho, p.token, "outro", AGORA)).toEqual({
      ok: false,
      motivo: "assinatura",
    });
  });

  it("recusa depois do prazo", () => {
    const p = partes(urlEstavel("proposal-assets", "x/y.jpg", 1, 60, SEGREDO, AGORA));
    expect(conferirUrlEstavel(p.balde, p.caminho, p.token, SEGREDO, AGORA + 61_000)).toEqual({
      ok: false,
      motivo: "expirado",
    });
  });

  it("recusa baldes fora dos três e caminhos com travessia", () => {
    expect(conferirUrlEstavel("proposal-thumbs", "x/y.jpg", "a.b.c", SEGREDO).ok).toBe(false);
    expect(conferirUrlEstavel("proposal-assets", "../y.jpg", "a.b.c", SEGREDO).ok).toBe(false);
    expect(conferirUrlEstavel("proposal-assets", "x/y.jpg", null, SEGREDO).ok).toBe(false);
  });
});

describe("a configuração do Blob", () => {
  it("sem token, o Blob não existe", () => {
    expect(blobConfigurado({})).toBe(false);
    expect(blobConfigurado({ BLOB_READ_WRITE_TOKEN: "  " })).toBe(false);
    expect(origemDoBlob({})).toBeNull();
  });

  it("o identificador da loja sai do token, e o segredo não", () => {
    const env = { BLOB_READ_WRITE_TOKEN: SEGREDO };
    expect(idDaLoja(env)).toBe("AbCd1234");
    expect(origemDoBlob(env)).toBe("https://abcd1234.private.blob.vercel-storage.com");
    expect(origemDoBlob(env)).not.toContain("segredo");
  });

  it("caminhos válidos", () => {
    expect(caminhoValido("LIQ-3/ab.jpg")).toBe(true);
    for (const mau of ["", "/a", "a/", "a//b", "a/../b", "a\\b", "a?b", 5]) {
      expect(caminhoValido(mau)).toBe(false);
    }
  });
});
