import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { log } from "@/lib/logger";
import { __esquecerDesviosDitos, CASOS_POR_DESVIO, observar } from "./observar";
import { esquemaDoDocumentoQueChega } from "./documento-da-proposta";
import { esquemaDoPedidoGuardado } from "./pedido-guardado";

const esquema = z.looseObject({ nome: z.string(), n: z.number().optional() });

beforeEach(() => {
  __esquecerDesviosDitos();
  vi.restoreAllMocks();
});

describe("a fronteira em modo de observar", () => {
  it("o registo leva só 20 desvios, mas a assinatura conta todos", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const lista = z.array(z.looseObject({ a: z.string(), n: z.number().optional() }));
    // 25 linhas com o mesmo defeito: um desvio só na assinatura, e 20 no registo.
    const mau = Array.from({ length: 25 }, () => ({ a: 1 }));
    observar(lista, mau, "lista", { id: "q1" });
    expect((aviso.mock.calls[0][1] as { desvios: unknown[] }).desvios).toHaveLength(20);
    // O mesmo caso outra vez, com o mesmo defeito: calado.
    observar(lista, mau, "lista", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
    // Um defeito novo que só aparece depois do 20.º muda a assinatura: diz-se.
    observar(lista, [...mau, { a: 1, n: "x" }], "lista", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it("o que bate passa calado", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    expect(observar(esquema, { nome: "x", extra: 1 }, "teste")).toBe(true);
    expect(aviso).not.toHaveBeenCalled();
  });

  it("o que não bate é dito — o sítio e o tipo do desvio, NUNCA o valor", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    expect(observar(esquema, { nome: 42, n: "maria@exemplo.pt" }, "teste", { id: "q1" })).toBe(
      false,
    );
    expect(aviso).toHaveBeenCalledTimes(1);
    const [mensagem, contexto] = aviso.mock.calls[0];
    expect(mensagem).toContain("fronteira: teste não bate com o esquema");
    expect(contexto).toEqual({
      id: "q1",
      desvios: [
        { campo: "nome", problema: "invalid_type" },
        { campo: "n", problema: "invalid_type" },
      ],
    });
    // O valor (aqui um email) nunca chega ao registo.
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("maria@exemplo.pt");
  });

  it("um corpo que nem é objecto também se diz, na raiz", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    observar(esquema, null, "teste");
    expect(aviso.mock.calls[0][1]).toEqual({
      desvios: [{ campo: "(raiz)", problema: "invalid_type" }],
    });
  });

  it("o mesmo desvio diz-se uma vez por processo e por caso — a lista de pedidos lê todos a cada vez", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < 50; i++) observar(esquema, { nome: 1 }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
    // Outro caso com o mesmo desvio também se diz: a fase seguinte precisa de saber QUAIS.
    observar(esquema, { nome: 1 }, "teste", { id: "q2" });
    expect(aviso).toHaveBeenCalledTimes(2);
    // Um desvio diferente no mesmo caso é outra linha.
    observar(esquema, { nome: "ok", n: "x" }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(3);
  });

  it("cada desvio diz no máximo CASOS_POR_DESVIO casos", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < CASOS_POR_DESVIO + 30; i++) {
      observar(esquema, { nome: 1 }, "teste", { id: `q${i}` });
    }
    // Os primeiros um a um, e UMA linha a dizer que o desvio continua.
    expect(aviso).toHaveBeenCalledTimes(CASOS_POR_DESVIO + 1);
    expect(aviso).toHaveBeenLastCalledWith(
      `fronteira: teste — o mesmo desvio em mais de ${CASOS_POR_DESVIO} casos; os seguintes já não se dizem um a um`,
      { desvios: [{ campo: "nome", problema: "invalid_type" }] },
    );
  });

  it("sem id, cada ocorrência é um caso — não se cala a segunda (modelos novos)", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    observar(esquema, { nome: 1 }, "teste");
    observar(esquema, { nome: 1 }, "teste", { id: 7 });
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it("um id que não é texto vale «sem id», e não entra no registo", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    observar(esquema, { nome: 1 }, "teste", { id: { nome: "Ana Secreta" } });
    expect(aviso.mock.calls[0][1]).toEqual({
      desvios: [{ campo: "nome", problema: "invalid_type" }],
    });
    observar(esquema, { nome: 2 }, "outro", { id: "q9" });
    expect(aviso.mock.calls[1][1]).toMatchObject({ id: "q9" });
  });

  it("as ocorrências sem id não gastam os lugares dos casos com id", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < CASOS_POR_DESVIO + 5; i++) observar(esquema, { nome: 1 }, "teste");
    aviso.mockClear();
    observar(esquema, { nome: 1 }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0][0])).toContain("não bate com o esquema");
  });

  it("o resumo diz-se uma vez — a lista de pedidos relida não o repete", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let leitura = 0; leitura < 5; leitura++) {
      for (let i = 0; i < CASOS_POR_DESVIO + 3; i++) {
        observar(esquema, { nome: 1 }, "teste", { id: `q${i}` });
      }
    }
    expect(aviso).toHaveBeenCalledTimes(CASOS_POR_DESVIO + 1);
  });

  it("no tecto de desvios lembrados esquece-se só o que não se vê há mais tempo", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    for (let i = 0; i < 500; i++) observar(esquema, { nome: 1 }, `sitio${i}`, { id: "q" });
    // O primeiro volta a ver-se: passa para o fim da fila.
    observar(esquema, { nome: 1 }, "sitio0", { id: "q" });
    // O 501.º empurra para fora o que não se vê há mais tempo — o segundo…
    observar(esquema, { nome: 1 }, "sitio500", { id: "q" });
    aviso.mockClear();
    // …o primeiro continua lembrado (calado), e o segundo volta a dizer-se.
    observar(esquema, { nome: 1 }, "sitio0", { id: "q" });
    expect(aviso).not.toHaveBeenCalled();
    observar(esquema, { nome: 1 }, "sitio1", { id: "q" });
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("o mesmo defeito noutro sítio da lista é o mesmo desvio — mas o registo diz o sítio", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const lista = z.looseObject({ fotos: z.array(z.string()) });
    observar(lista, { fotos: ["a", 1] }, "teste", { id: "q1" });
    observar(lista, { fotos: [2, "b"] }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso.mock.calls[0][1]).toMatchObject({
      desvios: [{ campo: "fotos.1", problema: "invalid_type" }],
    });
  });

  it("o mesmo defeito em uma ou em várias fotos é o mesmo desvio", () => {
    const aviso = vi.spyOn(log, "warn").mockImplementation(() => {});
    const lista = z.looseObject({ fotos: z.array(z.string()) });
    observar(lista, { fotos: [1] }, "teste", { id: "q1" });
    observar(lista, { fotos: [1, 2, 3] }, "teste", { id: "q1" });
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("nunca muda o valor: quem chama continua com o objecto original", () => {
    vi.spyOn(log, "warn").mockImplementation(() => {});
    const original = { nome: 1, campoNovo: { a: 1 } };
    const copia = structuredClone(original);
    observar(esquema, original, "teste");
    expect(original).toEqual(copia);
  });
});

/**
 * ── O CUSTO (regra 7) ─────────────────────────────────────────────────────
 *
 * O custo mede-se à parte (`docs/ESTRUTURA-DO-CODIGO.md`, Parte −1, fase 6),
 * medido com `custo.bench.ts`, números no documento. Aqui não se
 * afirma com o relógio — um CI carregado não pode pôr um PR a vermelho por uma
 * pausa do GC. Prova-se o que não depende dele: um documento grande (80 fotos,
 * 12 grupos de 10 linhas, 20 linhas de orçamento) BATE com o esquema, para o
 * caminho normal nunca escrever no registo.
 */
describe("o caminho normal não escreve nada", () => {
  it("um documento grande e um pedido com histórico batem com os esquemas", () => {
    const docGrande = {
      ref: "PO",
      clientNames: "A & B",
      serviceGroups: Array.from({ length: 12 }, (_, g) => ({
        title: `Grupo ${g}`,
        items: Array.from({ length: 10 }, (_, i) => ({ label: `L${i}`, desc: "texto" })),
      })),
      moodBoards: Array.from({ length: 10 }, (_, b) => ({
        title: `Board ${b}`,
        images: Array.from({ length: 8 }, (_, i) => `temas/${b}/foto-${i}.jpg`),
      })),
      budgetItems: Array.from({ length: 20 }, (_, i) => `Item ${i}`),
      budgetAmounts: Array.from({ length: 20 }, (_, i) => (i % 3 ? i * 100 : null)),
      coverImages: ["capa.jpg"],
    };
    const pedido = {
      id: "LIQ-X",
      status: "cotado",
      submittedAt: "2026-01-01T00:00:00.000Z",
      name: "N",
      email: "e@x.pt",
      phone: "1",
      date: "2027-01-01",
      location: "L",
      notes: "",
      activityLog: Array.from({ length: 30 }, () => ({ at: "x", kind: "nota" })),
    };
    expect(esquemaDoDocumentoQueChega.safeParse(docGrande).success).toBe(true);
    expect(esquemaDoPedidoGuardado.safeParse(pedido).success).toBe(true);
  });
});
