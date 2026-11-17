import { describe, expect, it } from "vitest";
import { criarSelo, lerSelo, MINIMO_MS } from "./selo";
import { vereditoDoPedido } from "./veredito";

const ENV = { SESSION_SECRET: "x".repeat(40), NODE_ENV: "production" };
const T0 = 1_800_000_000_000;

describe("o selo da armadilha de tempo", () => {
  it("um envio depois de 3 s com o selo certo é válido", () => {
    const selo = criarSelo(T0, ENV)!;
    expect(lerSelo(selo, T0 + MINIMO_MS + 1, ENV)).toEqual({ estado: "valido", ms: MINIMO_MS + 1 });
  });

  it("antes de 3 s é depressa de mais", () => {
    const selo = criarSelo(T0, ENV)!;
    expect(lerSelo(selo, T0 + 1200, ENV).estado).toBe("depressa");
  });

  it("um selo com a hora mudada à mão não vale", () => {
    const selo = criarSelo(T0, ENV)!;
    const [, assinatura] = selo.split(".");
    expect(lerSelo(`${T0 - 60_000}.${assinatura}`, T0, ENV).estado).toBe("invalido");
    expect(lerSelo("lixo", T0, ENV).estado).toBe("invalido");
  });

  it("um selo de outro segredo não vale", () => {
    const outro = criarSelo(T0, { SESSION_SECRET: "y".repeat(40), NODE_ENV: "production" })!;
    expect(lerSelo(outro, T0 + 10_000, ENV).estado).toBe("invalido");
  });

  it("o selo não é a assinatura das sessões (rótulo próprio)", () => {
    // Mesmo segredo, outro uso: um HMAC directo do SESSION_SECRET não passa.
    expect(criarSelo(T0, ENV)).not.toContain(ENV.SESSION_SECRET);
  });

  it("sem selo e sem segredo em produção, a camada não acusa ninguém", () => {
    expect(lerSelo(undefined, T0, ENV).estado).toBe("sem-selo");
    expect(lerSelo("", T0, ENV).estado).toBe("sem-selo");
    const sem = { NODE_ENV: "production" };
    expect(criarSelo(T0, sem)).toBeNull();
    expect(lerSelo(criarSelo(T0, ENV), T0 + 9000, sem).estado).toBe("sem-segredo");
  });
});

describe("o veredito", () => {
  const texto = { nome: "Inês Gonçalves", mensagem: "Casamento em Évora, 90 pessoas." };

  it("um pedido real sem selo (página antiga em cache) PASSA", () => {
    expect(vereditoDoPedido({ selo: undefined, texto }).spam).toBe(false);
  });

  it("um pedido real com o selo certo passa", () => {
    const selo = criarSelo(Date.now() - 20_000);
    expect(vereditoDoPedido({ selo, texto })).toEqual({
      spam: false,
      motivo: null,
      selo: "valido",
    });
  });

  it("selo adulterado ou envio relâmpago → spam", () => {
    expect(vereditoDoPedido({ selo: "123.abc", texto }).motivo).toBe("selo-invalido");
    expect(vereditoDoPedido({ selo: criarSelo(Date.now()), texto }).motivo).toBe("depressa");
  });

  it("conteúdo de spam com selo válido → spam", () => {
    const selo = criarSelo(Date.now() - 20_000);
    expect(
      vereditoDoPedido({ selo, texto: { nome: "X", mensagem: "cheap backlinks" } }).motivo,
    ).toBe("palavras-de-spam");
  });
});
