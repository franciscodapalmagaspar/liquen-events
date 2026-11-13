import { describe, expect, it } from "vitest";
import { z } from "zod";
import { erroDoServidorEmPortugues, porqueFalhou, porqueRecusou } from "./erro-do-servidor";
import { firstError, quoteUpdateSchema } from "./validation";

/**
 * A recusa que o servidor já sabia explicar e que o ecrã deitava fora.
 *
 * O teste mais importante deste ficheiro é o primeiro: a frase que se traduz é
 * a que a ROTA manda mesmo — vinda do esquema, pelo `firstError` —, e não uma
 * que alguém escreveu aqui a imitar o Zod. No dia em que a biblioteca mudar de
 * texto, é aqui que se dá por isso.
 */
describe("a queixa que o servidor manda mesmo", () => {
  it("«convidados negativos» chega em inglês e sai em português", () => {
    const r = quoteUpdateSchema.safeParse({ guests: -50 });
    expect(r.success).toBe(false);
    if (r.success) return;
    // Desde o achado n.º 13 da auditoria 6, a ROTA já manda em português; a
    // tradução do ecrã continua a não estragar o que já vem traduzido.
    const doServidor = firstError(r.error);
    expect(doServidor).toBe("O número não pode ser inferior a 0.");
    expect(erroDoServidorEmPortugues(doServidor)).toBe("O número não pode ser inferior a 0.");
  });

  it("firstError nunca devolve a frase inglesa da biblioteca (achado n.º 13)", () => {
    const esquema = z.object({
      email: z.email().optional(),
      name: z.string().min(1).optional(),
      guests: z.number().max(100_000).optional(),
      site: z.url().optional(),
    });
    const casos: [Record<string, unknown>, string][] = [
      [{ email: "ana@x" }, "O email não é válido."],
      [{ name: "" }, "O campo não pode ficar em branco."],
      [{ guests: 200_000 }, "O número não pode ser superior a 100000."],
      [{ site: "x" }, "O endereço (URL) não é válido."],
    ];
    for (const [dados, frase] of casos) {
      const r = esquema.safeParse(dados);
      if (r.success) throw new Error("devia ter sido recusado");
      expect(firstError(r.error)).toBe(frase);
    }
    // E o PATCH do pedido, com o esquema verdadeiro.
    const p = quoteUpdateSchema.safeParse({ email: "ana@x" });
    if (p.success) throw new Error("devia ter sido recusado");
    expect(firstError(p.error)).not.toMatch(/^(Invalid|Too )/);
  });

  it("um número acima do tecto também", () => {
    const r = quoteUpdateSchema.safeParse({ guests: 1_000_000 });
    if (r.success) throw new Error("devia ter sido recusado");
    expect(erroDoServidorEmPortugues(firstError(r.error))).toMatch(/não pode ser superior a/);
  });

  it("um preço que não é número", () => {
    const r = z.object({ quotedPrice: z.number() }).safeParse({ quotedPrice: "mil" });
    if (r.success) throw new Error("devia ter sido recusado");
    expect(erroDoServidorEmPortugues(firstError(r.error))).toBe("O valor tem de ser um número.");
  });
});

describe("o que não é da biblioteca passa intacto", () => {
  it("as frases desta casa já estão na língua certa", () => {
    const nosso = "As definições da proposta ainda não têm tabela na base de dados.";
    expect(erroDoServidorEmPortugues(nosso)).toBe(nosso);
    expect(erroDoServidorEmPortugues("Não autorizado")).toBe("Não autorizado");
  });

  it("sem mensagem nenhuma não se inventa uma razão", () => {
    expect(erroDoServidorEmPortugues("")).toBeNull();
    expect(erroDoServidorEmPortugues(undefined)).toBeNull();
  });
});

describe("ler a recusa de uma resposta", () => {
  const resposta = (corpo: unknown) => ({ json: async () => corpo }) as unknown as Response;

  it("tira a razão do corpo e di-la em português", async () => {
    const r = resposta({ error: "Too small: expected number to be >=0" });
    expect(await porqueRecusou(r)).toBe("O número não pode ser inferior a 0.");
  });

  it("um corpo que não é JSON não vira razão nenhuma", async () => {
    const r = {
      json: async () => {
        throw new SyntaxError("<html>502</html>");
      },
    } as unknown as Response;
    expect(await porqueRecusou(r)).toBeNull();
  });
});

/**
 * A falha de rede não tem servidor do outro lado — e o que o browser lança
 * está em inglês. Estes testes são a rede que impede essa frase de voltar ao
 * ecrã: cada um deles vem de uma medição feita no back office a correr.
 */
describe("a ligação que caiu", () => {
  it("o «Failed to fetch» do Chrome dá lugar à frase de quem chama", () => {
    // Exactamente o que o ecrã das Definições mostrava, medido com a ligação
    // cortada a meio do PUT: um aviso a dizer «Failed to fetch».
    const doBrowser = new TypeError("Failed to fetch");
    expect(porqueFalhou(doBrowser, "Não foi possível guardar.")).toBe("Não foi possível guardar.");
  });

  it("o «Load failed» do Safari e o do Firefox também", () => {
    expect(porqueFalhou(new TypeError("Load failed"), "recurso")).toBe("recurso");
    expect(
      porqueFalhou(new Error("NetworkError when attempting to fetch resource."), "recurso"),
    ).toBe("recurso");
  });

  it("a frase desta casa passa intacta — é ela que nomeia o campo", () => {
    // O `throw new Error(porqueRecusou(res))` de quem chama: já está em
    // português e já diz o que está mal. Substituí-la seria perder informação.
    const daCasa = new Error("O número não pode ser inferior a 0.");
    expect(porqueFalhou(daCasa, "Não foi possível guardar.")).toBe(
      "O número não pode ser inferior a 0.",
    );
  });

  it("um erro sem mensagem nenhuma não deixa o ecrã em branco", () => {
    expect(porqueFalhou(new Error(""), "Não foi possível guardar.")).toBe(
      "Não foi possível guardar.",
    );
    expect(porqueFalhou("uma coisa que nem Error é", "Não foi possível guardar.")).toBe(
      "Não foi possível guardar.",
    );
  });
});
