import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O duplo do `app_state` RESPEITA A VERSÃO, como o verdadeiro: grava só se a
 * versão lida ainda for a actual — e deixa outro pedido entrar entre a
 * leitura e a escrita (o `await` a mais), que é onde a corrida acontece.
 */
const estado = vi.hoisted(() => ({
  valor: null as unknown,
  versao: null as string | null,
  n: 0,
  lerFalha: false,
  gravarFalha: false,
}));
vi.mock("@/lib/app-state", () => ({
  lerEstadoComVersao: vi.fn(async () => {
    if (estado.lerFalha) throw new Error("sem base de dados");
    await Promise.resolve();
    return { valor: structuredClone(estado.valor), versao: estado.versao };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: unknown, versao: string | null) => {
    await Promise.resolve();
    if (estado.gravarFalha) return "falhou";
    if (versao !== estado.versao) return "conflito";
    estado.valor = v;
    estado.versao = `v${++estado.n}`;
    return "gravado";
  }),
}));

import {
  acertarImportacaoComIa,
  chaveDoMes,
  MAX_DOLARES_POR_MES,
  MAX_IMPORTACOES_COM_IA_POR_MES,
  reservarImportacaoComIa,
} from "./tecto";

beforeEach(() => {
  Object.assign(estado, { valor: null, versao: null, n: 0, lerFalha: false, gravarFalha: false });
});

const agora = new Date("2026-11-14T12:00:00Z");

describe("o tecto mensal das leituras com IA", () => {
  it("é baixo — 30 importações e 5 US$ — e conta por mês, no fuso do estúdio", () => {
    expect(MAX_IMPORTACOES_COM_IA_POR_MES).toBe(30);
    expect(MAX_DOLARES_POR_MES).toBe(5);
    expect(chaveDoMes(new Date("2026-11-30T23:30:00Z"))).toBe("importar-com-ia:2026-11");
  });

  it("reserva um lugar de cada vez, e pára no tecto de importações", async () => {
    for (let i = 1; i <= 3; i++) {
      expect(await reservarImportacaoComIa(0.1, agora, 3)).toMatchObject({ ok: true, usadas: i });
    }
    expect(await reservarImportacaoComIa(0.1, agora, 3)).toMatchObject({
      ok: false,
      motivo: "tecto",
    });
  });

  it("reserva o custo máximo, e pára quando os dólares não chegam", async () => {
    expect(await reservarImportacaoComIa(3, agora)).toMatchObject({ ok: true, dolares: 3 });
    expect(await reservarImportacaoComIa(2.5, agora)).toMatchObject({
      ok: false,
      motivo: "dolares",
      dolares: 3,
    });
    // Acertar para o custo real devolve o que sobrou — e aí já cabe.
    expect(await acertarImportacaoComIa(3, 0.25, agora)).toBe(true);
    expect(estado.valor).toEqual({ usadas: 1, dolares: 0.25 });
    expect(await reservarImportacaoComIa(2.5, agora)).toMatchObject({ ok: true, dolares: 2.75 });
  });

  it("dois pedidos AO MESMO TEMPO pelo último lugar: só um passa", async () => {
    estado.valor = { usadas: 29, dolares: 0 };
    estado.versao = "v0";
    const [a, b] = await Promise.all([
      reservarImportacaoComIa(0.5, agora),
      reservarImportacaoComIa(0.5, agora),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(estado.valor).toEqual({ usadas: 30, dolares: 0.5 });
  });

  it("dois pedidos ao mesmo tempo pelos últimos dólares: só um passa", async () => {
    estado.valor = { usadas: 0, dolares: 4 };
    estado.versao = "v0";
    const r = await Promise.all([
      reservarImportacaoComIa(0.8, agora),
      reservarImportacaoComIa(0.8, agora),
    ]);
    expect(r.filter((x) => x.ok)).toHaveLength(1);
    expect(estado.valor).toEqual({ usadas: 1, dolares: 4.8 });
  });

  it("sem contador (a leitura ou a escrita falham), NÃO deixa passar", async () => {
    estado.lerFalha = true;
    expect((await reservarImportacaoComIa(0.1, agora)).ok).toBe(false);
    estado.lerFalha = false;
    estado.gravarFalha = true;
    expect(await reservarImportacaoComIa(0.1, agora)).toMatchObject({
      ok: false,
      motivo: "sem-contador",
    });
  });

  it.each([
    ["um texto", "trinta"],
    ["sem dólares", { usadas: 2 }],
    ["usadas em texto", { usadas: "2", dolares: 0 }],
    ["negativo", { usadas: -1, dolares: 0 }],
    ["uma lista", [1, 2]],
  ])("uma linha estragada (%s) trava em vez de contar como zero", async (_n, valor) => {
    estado.valor = valor;
    estado.versao = "v0";
    expect(await reservarImportacaoComIa(0.1, agora)).toMatchObject({
      ok: false,
      motivo: "sem-contador",
    });
  });
});
