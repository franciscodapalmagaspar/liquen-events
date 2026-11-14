import { describe, it, expect, vi, beforeEach } from "vitest";

const estado = vi.hoisted(() => ({
  valor: null as { usadas: number } | null,
  versao: null as string | null,
  lerFalha: false,
  gravar: "gravado" as "gravado" | "conflito" | "falhou",
}));
vi.mock("@/lib/app-state", () => ({
  lerEstadoComVersao: vi.fn(async () => {
    if (estado.lerFalha) throw new Error("sem base de dados");
    return { valor: estado.valor, versao: estado.versao };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: { usadas: number }) => {
    if (estado.gravar === "gravado") {
      estado.valor = v;
      estado.versao = String(v.usadas);
    }
    return estado.gravar;
  }),
}));

import { chaveDoMes, MAX_IMPORTACOES_COM_IA_POR_MES, reservarImportacaoComIa } from "./tecto";

beforeEach(() => {
  Object.assign(estado, { valor: null, versao: null, lerFalha: false, gravar: "gravado" });
});

describe("o tecto mensal das leituras com IA", () => {
  it("é baixo (30) e conta por mês, no fuso do estúdio", () => {
    expect(MAX_IMPORTACOES_COM_IA_POR_MES).toBe(30);
    expect(chaveDoMes(new Date("2026-11-30T23:30:00Z"))).toBe("importar-com-ia:2026-11");
  });

  it("reserva um lugar de cada vez, e pára no tecto", async () => {
    for (let i = 1; i <= 3; i++) {
      expect(await reservarImportacaoComIa(new Date(), 3)).toEqual({
        ok: true,
        usadas: i,
        maximo: 3,
      });
    }
    expect(await reservarImportacaoComIa(new Date(), 3)).toMatchObject({
      ok: false,
      motivo: "tecto",
      usadas: 3,
    });
  });

  it("sem contador (a leitura ou a escrita falham), NÃO deixa passar", async () => {
    estado.lerFalha = true;
    expect((await reservarImportacaoComIa()).ok).toBe(false);
    estado.lerFalha = false;
    estado.gravar = "falhou";
    expect(await reservarImportacaoComIa()).toMatchObject({ ok: false, motivo: "sem-contador" });
  });

  it("em conflito contínuo, desiste em vez de passar", async () => {
    estado.gravar = "conflito";
    expect((await reservarImportacaoComIa()).ok).toBe(false);
  });
});
