import { describe, it, expect } from "vitest";
import {
  assinaturaExpirada,
  haAssinaturaMorta,
  semAssinaturasMortas,
  urlAindaBom,
} from "./assinatura";

/**
 * O que aqui se guarda é a decisão de MANTER a cache: substituir sempre a
 * assinatura resolvia a validade e transformava reabrir uma proposta de trinta
 * fotos em trinta downloads. Cada caso abaixo é um sítio onde esta função pode
 * errar para o lado caro.
 */

/** Um URL assinado à maneira do Supabase Storage, com `exp` em SEGUNDOS. */
function assinado(expSegundos: number): string {
  const carga = Buffer.from(JSON.stringify({ url: "/x.jpg", exp: expSegundos })).toString(
    "base64url",
  );
  return `https://abc.supabase.co/storage/v1/object/sign/b/x.jpg?token=cabeca.${carga}.assinatura`;
}

const AGORA = 1_800_000_000_000; // ms
const EM_SEGUNDOS = AGORA / 1000;

describe("assinaturaExpirada", () => {
  it("diz que sim quando o prazo já passou", () => {
    expect(assinaturaExpirada(assinado(EM_SEGUNDOS - 60), AGORA)).toBe(true);
  });

  it("diz que sim na margem — um URL que morre já não vale a pena tentar", () => {
    // Dois minutos de vida: dentro dos cinco de margem.
    expect(assinaturaExpirada(assinado(EM_SEGUNDOS + 120), AGORA)).toBe(true);
  });

  it("diz que não quando ainda falta muito", () => {
    expect(assinaturaExpirada(assinado(EM_SEGUNDOS + 3600), AGORA)).toBe(false);
  });

  /**
   * O ERRO QUE ISTO IMPEDE: tratar `exp` como milissegundos.
   *
   * Um `exp` em segundos lido como milissegundos dá uma data em 1970, e a
   * resposta seria "expirado" para tudo — inclusive para os dez anos da pasta
   * do pedido. Reabrir qualquer proposta passava a descarregar tudo outra vez.
   */
  it("lê `exp` em segundos, não em milissegundos", () => {
    const dezAnos = EM_SEGUNDOS + 60 * 60 * 24 * 365 * 10;
    expect(assinaturaExpirada(assinado(dezAnos), AGORA)).toBe(false);
  });

  it.each([
    ["sem token nenhum", "https://abc.supabase.co/storage/v1/object/public/b/x.jpg"],
    ["um token que não é JWT", "https://abc.supabase.co/x.jpg?token=abc"],
    ["um `data:` URI", "data:image/jpeg;base64,/9j/4AAQ"],
    ["um `blob:`", "blob:http://localhost/abc-123"],
    ["texto que não é URL", "nada disto"],
  ])("trata «%s» como BOM — quem não sabe, não mexe", (_nome, url) => {
    expect(assinaturaExpirada(url, AGORA)).toBe(false);
  });

  it("um URL em falta não é um URL expirado", () => {
    expect(assinaturaExpirada(undefined, AGORA)).toBe(false);
  });
});

describe("urlAindaBom", () => {
  it("sem nada guardado, fica o fresco", () => {
    expect(urlAindaBom(undefined, "fresco")).toBe("fresco");
  });

  it("com um guardado válido, o guardado ganha — é ele que está em cache", () => {
    const bom = assinado(Math.floor(Date.now() / 1000) + 7200);
    expect(urlAindaBom(bom, "fresco")).toBe(bom);
  });

  it("com um guardado morto, entra o fresco", () => {
    const morto = assinado(Math.floor(Date.now() / 1000) - 10);
    expect(urlAindaBom(morto, "fresco")).toBe("fresco");
  });
});

/**
 * O DEFEITO DE 13/11: o rascunho do `localStorage` trazia para o ecrã URLs da
 * Biblioteca assinados sete dias antes (validade de seis horas), e cada célula
 * pagava um 400 do Storage por degrau da cascata antes de a hidratação chegar.
 */
describe("semAssinaturasMortas", () => {
  it("o que já morreu não entra; o que serve entra igual", () => {
    const morto = assinado(EM_SEGUNDOS - 7 * 24 * 3600);
    const bom = assinado(EM_SEGUNDOS + 3600);
    expect(semAssinaturasMortas({ "tema:a/1.jpg": morto, "q/2.jpg": bom }, AGORA)).toEqual({
      "q/2.jpg": bom,
    });
  });

  it("o que não se consegue ler fica — quem não sabe, não mexe", () => {
    expect(semAssinaturasMortas({ a: "data:image/jpeg;base64,xx" }, AGORA)).toEqual({
      a: "data:image/jpeg;base64,xx",
    });
  });

  it("lixo no lugar do mapa dá um mapa vazio, e valores que não são texto saem", () => {
    expect(semAssinaturasMortas(null, AGORA)).toEqual({});
    expect(semAssinaturasMortas("x", AGORA)).toEqual({});
    expect(semAssinaturasMortas({ a: 3, b: "" }, AGORA)).toEqual({});
  });
});

describe("haAssinaturaMorta", () => {
  it("responde sim quando um só dos mapas tem um URL morto", () => {
    const bom = assinado(EM_SEGUNDOS + 3600);
    const morto = assinado(EM_SEGUNDOS - 60);
    expect(haAssinaturaMorta([{ a: bom }, { b: morto }], AGORA)).toBe(true);
  });

  it("responde não com tudo a servir — é o que impede uma leitura por nada", () => {
    const bom = assinado(EM_SEGUNDOS + 3600);
    expect(haAssinaturaMorta([{ a: bom }, {}, { c: "data:x" }], AGORA)).toBe(false);
  });
});
