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

describe("o veredito: nada descarta, só marca", () => {
  const texto = { nome: "Inês Gonçalves", mensagem: "Casamento em Évora, 90 pessoas." };

  it("um pedido real sem selo (página antiga em cache) passa sem marca", () => {
    expect(vereditoDoPedido({ selo: undefined, texto }).possivelSpam).toBeNull();
  });

  it("um pedido real com o selo certo passa sem marca", () => {
    const selo = criarSelo(Date.now() - 20_000);
    expect(vereditoDoPedido({ selo, texto })).toEqual({ possivelSpam: null, selo: "valido" });
  });

  it("um selo inválido (o segredo rodou) conta como sem selo: sem marca", () => {
    expect(vereditoDoPedido({ selo: "123.abc", texto })).toEqual({
      possivelSpam: null,
      selo: "invalido",
    });
    const deOutroSegredo = criarSelo(Date.now() - 20_000, {
      SESSION_SECRET: "y".repeat(40),
      NODE_ENV: "production",
    });
    expect(vereditoDoPedido({ selo: deOutroSegredo, texto }).possivelSpam).toBeNull();
  });

  it("um envio relâmpago leva a marca, não é descartado", () => {
    expect(vereditoDoPedido({ selo: criarSelo(Date.now()), texto })).toEqual({
      possivelSpam: { motivo: "depressa" },
      selo: "depressa",
    });
  });

  it("conteúdo de spam leva a marca com o motivo", () => {
    const selo = criarSelo(Date.now() - 20_000);
    expect(
      vereditoDoPedido({ selo, texto: { nome: "X", mensagem: "cheap backlinks" } }).possivelSpam,
    ).toEqual({ motivo: "palavras-de-spam" });
  });

  it("o veredito não tem maneira de dizer «descarta»", () => {
    const v = vereditoDoPedido({ selo: "lixo", texto: { nome: "X", mensagem: "viagra" } });
    expect(Object.keys(v).sort()).toEqual(["possivelSpam", "selo"]);
  });
});

describe("o selo do futuro", () => {
  it("um selo uns segundos no futuro (relógios desacertados) conta como depressa", () => {
    const selo = criarSelo(T0 + 2_000, ENV)!;
    expect(lerSelo(selo, T0, ENV)).toEqual({ estado: "depressa", ms: -2_000 });
  });
});
