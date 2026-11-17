// @vitest-environment jsdom
//
// Precisa de `window`: o relator recusa-se a correr no servidor (uma rota a
// relatar ao servidor que o servidor falhou seria um ciclo), e sem `jsdom` o
// guarda dispara e o teste media o guarda em vez do relatório.
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { semSegredo, relatarFalhaDeImagem, esquecerRelatos } from "./relatar-falha";

/**
 * O teste que interessa aqui é UM: **a credencial não pode sair do browser**.
 * Um URL assinado do Supabase leva um JWT no `?token=` que É a chave da
 * fotografia; mandá-lo para os registos punha as chaves do bucket num sítio
 * lido por mais gente e guardado mais tempo. Os outros casos são o normal.
 */

const ASSINADO =
  "https://abc.supabase.co/storage/v1/object/sign/proposal-assets/p1/a.jpg?token=eyJhbGciOi.SEGREDO.xxx";

describe("semSegredo", () => {
  it("deixa cair o token e guarda o caminho", () => {
    const limpo = semSegredo(ASSINADO);
    expect(limpo).toBe("https://abc.supabase.co/storage/v1/object/sign/proposal-assets/p1/a.jpg");
    expect(limpo).not.toContain("SEGREDO");
    expect(limpo).not.toContain("token");
  });

  /**
   * Um `blob:` PASSA no `new URL()` — e dá disparate. Antes desta correcção
   * saía `http://localhosthttp://localhost/abc-123`, que é o `origin` do
   * documento colado ao URL interior. Registar disparate é pior do que não
   * registar: ensina a desconfiar da linha inteira.
   */
  it("um `blob:` diz só o tipo — não há caminho que valha a pena dizer", () => {
    expect(semSegredo("blob:http://localhost/abc-123")).toBe("blob:…");
  });

  it("um `data:` não leva os bytes da imagem para os registos", () => {
    expect(semSegredo("data:image/jpeg;base64,/9j/4AAQSkZJRg")).toBe("data:…");
  });

  it("o que não é URL nenhum não passa a ser", () => {
    expect(semSegredo("qualquer coisa")).toBe("(desconhecido)");
  });
});

describe("relatarFalhaDeImagem", () => {
  let pedidos: { url: string; corpo: Record<string, unknown> }[] = [];

  beforeEach(() => {
    esquecerRelatos();
    pedidos = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("/api/admin/imagem-falhou")) {
          pedidos.push({ url: String(url), corpo: JSON.parse(String(init?.body ?? "{}")) });
          return new Response("{}", { status: 200 });
        }
        // A sonda que vai buscar o código de estado.
        return new Response("", { status: 404 });
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it("manda o caminho e o código de estado, e NUNCA o token", async () => {
    await relatarFalhaDeImagem({ onde: "capa-esquerda", ref: "p1/a.jpg", url: ASSINADO });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].corpo).toMatchObject({
      onde: "capa-esquerda",
      ref: "p1/a.jpg",
      estado: 404,
    });
    expect(JSON.stringify(pedidos[0].corpo)).not.toContain("SEGREDO");
  });

  it("a mesma célula a falhar duas vezes relata uma", async () => {
    await relatarFalhaDeImagem({ onde: "capa-esquerda", url: ASSINADO });
    await relatarFalhaDeImagem({ onde: "capa-esquerda", url: ASSINADO });
    expect(pedidos).toHaveLength(1);
  });

  it("uma grelha inteira a falhar não manda sessenta relatórios", async () => {
    for (let i = 0; i < 40; i++) {
      await relatarFalhaDeImagem({ onde: "mood-board", url: `${ASSINADO}&i=${i}` });
    }
    expect(pedidos.length).toBeLessThanOrEqual(12);
  });

  it("uma falha a relatar uma falha não é mais uma falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede");
      }),
    );
    await expect(
      relatarFalhaDeImagem({ onde: "capa-direita", url: ASSINADO }),
    ).resolves.toBeUndefined();
  });
  it("uma assinatura que JÁ expirou diz-se como tal, sem ir buscar o código (registos de 10–13/11)", async () => {
    // As ~30 «imagem não desenhou» de 10–13/11 eram TODAS 400 sobre ficheiros
    // que existem (verificado no Storage): assinaturas de 6 h já mortas, que
    // a hidratação troca sozinha. Diz-se `expirada`, para o registo as separar
    // de um ficheiro em falta — e poupa-se a ida que só servia para o código.
    const carga = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString(
      "base64url",
    );
    const morto = `https://abc.supabase.co/storage/v1/object/sign/theme-assets/t/a.jpg?token=eyJhbGciOi.${carga}.xxx`;
    const sonda = vi.mocked(fetch);
    await relatarFalhaDeImagem({ onde: "mood-board", ref: "tema:t/a.jpg", url: morto });
    expect(pedidos).toHaveLength(1);
    expect(pedidos[0].corpo).toMatchObject({ expirada: true, estado: null });
    expect(sonda.mock.calls.filter(([u]) => String(u) === morto)).toHaveLength(0);
  });

  it("uma assinatura em dia não se diz expirada", async () => {
    await relatarFalhaDeImagem({ onde: "capa", url: ASSINADO });
    expect(pedidos[0].corpo.expirada).toBe(false);
  });
});
