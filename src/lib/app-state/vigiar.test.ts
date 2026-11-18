import { beforeEach, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("@/lib/logger", () => ({ log: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const { vigiarValor, vigiarChave, esquecerAvisos } = await import("./vigiar");

beforeEach(() => {
  warn.mockReset();
  esquecerAvisos();
});

describe("a vigia das leituras do app_state", () => {
  it("um valor com a forma do espaço passa calado", () => {
    vigiarValor("proposal-draft:q1", { doc: {}, updatedAt: "2026-11-17T10:00:00Z" });
    vigiarValor("ligacao-de-proposta:p1", { codigo: "abc" });
    vigiarValor("foto-resumo:abc", ["a/b.jpg"]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("um valor fora da forma fica registado — com o espaço e sem o conteúdo", () => {
    vigiarValor("proposal-draft:q1", { doc: "não é um objeto", updatedAt: 3 });
    expect(warn).toHaveBeenCalledTimes(1);
    const [mensagem, contexto] = warn.mock.calls[0];
    expect(mensagem).toMatch(/fora da forma/);
    expect(contexto.espaco).toBe("rascunhos");
    expect(JSON.stringify(contexto)).not.toContain("não é um objeto");
  });

  it("a mesma forma estragada lida mil vezes dá um aviso, não mil", () => {
    for (let i = 0; i < 1000; i++) vigiarValor(`tempo-activo:q${i}`, { ms: "x" });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("null é «não há» (e as lápides): não se vigia", () => {
    vigiarValor("proposal-draft:q1", null);
    vigiarValor("proposal-draft:q1", undefined);
    expect(warn).not.toHaveBeenCalled();
  });

  it("uma chave fora do registo fica registada pelo prefixo, sem o id", () => {
    expect(vigiarChave("espaco-novo:pedido-123")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][1]).toEqual({ prefixo: "espaco-novo:" });
    expect(vigiarChave("proposal-draft:q1")).toBe("rascunhos");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("nunca lança, e não muda o valor", () => {
    const valor = { doc: { a: 1 }, updatedAt: "x", extra: true };
    const copia = structuredClone(valor);
    expect(() => vigiarValor("proposal-draft:q1", valor)).not.toThrow();
    expect(valor).toEqual(copia);
  });

  /**
   * MEDIDO, para a vigia não pesar no caminho da leitura (P2: «não pode ficar
   * mais lento de forma que se note»). Os piores casos de hoje: um rascunho
   * grande (o tecto do documento é 512 KB) e a varredura de 2 000 linhas.
   * O tecto aqui é largo de propósito (uma máquina de CI carregada); o que se
   * mediu em local está no docs/ESTRUTURA-DOS-DADOS.md, na tabela do P2.
   */
  it("vigiar um rascunho de ~500 KB e 2 000 linhas leva poucos milissegundos", () => {
    const paginas = Array.from({ length: 400 }, (_, i) => ({
      id: `p${i}`,
      texto: "x".repeat(1200),
      fotos: Array.from({ length: 6 }, (_, j) => `pasta/foto-${i}-${j}.jpg`),
    }));
    const rascunho = { doc: { paginas, titulo: "t" }, updatedAt: "2026-11-17T10:00:00Z" };
    expect(JSON.stringify(rascunho).length).toBeGreaterThan(500_000);

    const t0 = performance.now();
    for (let i = 0; i < 100; i++) vigiarValor("proposal-draft:q1", rascunho);
    const porRascunho = (performance.now() - t0) / 100;

    const t1 = performance.now();
    for (let i = 0; i < 2000; i++) {
      vigiarValor(`diagnostico-video:2026-11-01:s${i}`, {
        v: 1,
        sessao: `s${i}`,
        recebidoEm: "2026-11-01T00:00:00Z",
        contadores: { a: 1 },
      });
    }
    const varredura = performance.now() - t1;

    expect(warn).not.toHaveBeenCalled();
    expect(porRascunho).toBeLessThan(5);
    expect(varredura).toBeLessThan(100);
  });
});
