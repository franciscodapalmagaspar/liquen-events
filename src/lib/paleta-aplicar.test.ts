import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O executor, com os armazéns fingidos.
 *
 * O que aqui se prende não é a decisão (essa é pura e está em
 * `paleta-etiquetar.test.ts`) — é o que o executor FAZ com ela: que o ensaio
 * não escreve, que as contas são relidas da tabela, e que uma escrita falhada
 * não deita o lote fora.
 */

const st = vi.hoisted(() => ({
  fotos: [] as Array<{ path: string; cor?: string | null }>,
  ligacoes: [] as Array<{ path: string; etiquetaId: string }>,
  falharEm: null as string | null,
}));

// A leitura das fotos DA BIBLIOTECA (já sem as de propostas — esse filtro tem
// teste próprio em `paleta-aplicar.fotos-de-propostas.test.ts`).
vi.mock("./biblioteca-fotos-da-biblioteca", () => ({
  listFotosDaBiblioteca: vi.fn(async () => st.fotos),
}));
vi.mock("./biblioteca-foto-etiquetas-store", () => ({
  listFotoEtiquetas: vi.fn(async () => st.ligacoes),
  etiquetar: vi.fn(async (path: string, etiquetaId: string) => {
    if (st.falharEm === path) throw new Error("storage em baixo");
    const existe = st.ligacoes.some((l) => l.path === path && l.etiquetaId === etiquetaId);
    if (!existe) st.ligacoes.push({ path, etiquetaId });
    return { ligacao: { path, etiquetaId }, criada: !existe };
  }),
}));

const { aplicarPaletas } = await import("./paleta-aplicar");

beforeEach(() => {
  st.fotos = [
    { path: "t/verde.jpg", cor: "#3d5a40" },
    { path: "t/creme.jpg", cor: "#f0ece4" },
    { path: "t/antiga.jpg" },
  ];
  st.ligacoes = [];
  st.falharEm = null;
});

describe("aplicarPaletas", () => {
  it("em ENSAIO não escreve nada, e diz o mesmo que diria a sério", async () => {
    const r = await aplicarPaletas({ ensaio: true });
    expect(r.plano.aAplicar).toHaveLength(2);
    expect(r.criadas).toBe(0);
    expect(st.ligacoes).toHaveLength(0);
    expect(r.antes).toBe(0);
    expect(r.depois).toBe(0);
    expect(r.resumo).toContain("ENSAIO");
  });

  it("aplicado, escreve e as contas da TABELA batem certo", async () => {
    const r = await aplicarPaletas();
    expect(r.criadas).toBe(2);
    expect(r.antes).toBe(0);
    // Relido da tabela, não contado na memória: é a diferença entre «julgo ter
    // escrito» e «está lá».
    expect(r.depois).toBe(2);
    expect(r.depois - r.antes).toBe(r.criadas);
  });

  it("não toca no que já tinha paleta", async () => {
    st.ligacoes = [{ path: "t/verde.jpg", etiquetaId: "paleta:terracotta" }];
    const r = await aplicarPaletas();
    expect(r.plano.jaTinham).toBe(1);
    expect(r.criadas).toBe(1);
    // A escolha anterior fica intacta.
    expect(st.ligacoes).toContainEqual({ path: "t/verde.jpg", etiquetaId: "paleta:terracotta" });
  });

  it("uma escrita falhada não deita o lote fora", async () => {
    st.falharEm = "t/verde.jpg";
    const r = await aplicarPaletas();
    expect(r.falhadas).toEqual([{ path: "t/verde.jpg", erro: "storage em baixo" }]);
    // A outra passou na mesma.
    expect(r.criadas).toBe(1);
    expect(r.resumo).toContain("1 falharam");
  });

  it("conta as fotos sem cor, que são trabalho que falta", async () => {
    const r = await aplicarPaletas({ ensaio: true });
    expect(r.plano.semCor).toBe(1);
    expect(r.resumo).toContain("1 sem cor conhecida");
  });

  it("correr duas vezes não muda nada da segunda", async () => {
    await aplicarPaletas();
    const segunda = await aplicarPaletas();
    expect(segunda.criadas).toBe(0);
    expect(segunda.plano.aAplicar).toEqual([]);
    expect(segunda.depois).toBe(segunda.antes);
  });
});
