import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTAGEM_VAZIA, comAcontecimento, totalAte, type Contagem } from "./tempo-activo";
import {
  criarEnvioDoTempo,
  entregarTempo,
  PASSO_DO_ECRA_MS,
  PASSO_DO_ENVIO_MS,
  type Enviar,
  type Lote,
} from "./tempo-activo-envio";

/**
 * O envio do tempo activo passou de 30 em 30 s para 5 em 5 min (16/11). O
 * total que chega ao servidor — e a divisão por secção — não pode mudar.
 * Prova-se com um relógio falso: a mesma sessão de trabalho, contada pelo
 * esquema antigo (um envio por passo de meio minuto) e pelo novo.
 */

type Pedaco = { ms: number; seccao: string | null; aFechar: boolean };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

/**
 * Uma sessão de uma hora e pouco: ela trabalha, muda de secção, pára (o ecrã
 * aberto enquanto vai ao telefone), esconde o separador, volta e fecha.
 * `aoPasso` corre a cada 30 s, como o `setInterval` do estúdio; `aoEsconder`
 * e `aoFechar`, nos acontecimentos da página.
 */
function sessao(motor: {
  aoPasso: (total: number, seccao: string | null, agora: number) => void;
  aoEsconder: (total: number, seccao: string | null, agora: number) => void;
  aoFechar: (total: number, seccao: string | null, agora: number) => void;
}): number {
  let c: Contagem = CONTAGEM_VAZIA;
  let seccao: string | null = "capa";
  const vida = () => (c = comAcontecimento(c, { tipo: "vida", em: Date.now() }));
  const pausa = () => (c = comAcontecimento(c, { tipo: "pausa", em: Date.now() }));
  const relogio = setInterval(
    () => motor.aoPasso(totalAte(c, Date.now()), seccao, Date.now()),
    PASSO_DO_ECRA_MS,
  );
  vida();
  // 12 min a trabalhar na capa, com sinais de vida de 20 em 20 s.
  for (let i = 0; i < 36; i++) {
    vi.advanceTimersByTime(20_000);
    vida();
  }
  seccao = "mood-boards";
  for (let i = 0; i < 23; i++) {
    vi.advanceTimersByTime(17_000);
    vida();
  }
  // Vai ao telefone: 25 min com o ecrã aberto e sem um toque.
  vi.advanceTimersByTime(25 * 60_000);
  vida();
  seccao = null;
  for (let i = 0; i < 7; i++) {
    vi.advanceTimersByTime(13_000);
    vida();
  }
  // Esconde o separador 4 min, e volta.
  pausa();
  motor.aoEsconder(totalAte(c, Date.now()), seccao, Date.now());
  vi.advanceTimersByTime(4 * 60_000);
  vida();
  seccao = "orcamento";
  for (let i = 0; i < 11; i++) {
    vi.advanceTimersByTime(19_000);
    vida();
  }
  vi.advanceTimersByTime(7_000);
  const total = totalAte(c, Date.now());
  motor.aoFechar(total, seccao, Date.now());
  clearInterval(relogio);
  return total;
}

/** O esquema de antes de 16/11: cada passo (e o fecho) envia o que passou. */
function esquemaAntigo() {
  const enviados: Pedaco[] = [];
  let enviado = 0;
  const reportar = (total: number, seccao: string | null, aFechar: boolean) => {
    const delta = Math.round(total - enviado);
    if (delta < 1000) return;
    enviado = total;
    enviados.push({ ms: delta, seccao, aFechar });
  };
  const total = sessao({
    aoPasso: (t, s) => reportar(t, s, false),
    aoEsconder: () => {}, // antes não havia envio ao esconder
    aoFechar: (t, s) => reportar(t, s, true),
  });
  return { enviados, total };
}

/** Desfaz cada envio (um por lote) em pedaços por secção, e conta os pedidos. */
function recolher(enviados: Pedaco[], pedidos?: { n: number }): Enviar {
  return (lotes, aFechar) => {
    if (pedidos) pedidos.n++;
    for (const lote of lotes) {
      for (const [seccao, ms] of Object.entries(lote.porSeccao)) {
        enviados.push({ ms, seccao: seccao === "" ? null : seccao, aFechar });
      }
    }
  };
}

function esquemaNovo() {
  const enviados: Pedaco[] = [];
  const pedidos = { n: 0 };
  const envio = criarEnvioDoTempo(recolher(enviados, pedidos), Date.now());
  const total = sessao({
    aoPasso: (t, s, a) => envio.passo(t, s, a),
    aoEsconder: (t, s, a) => envio.despejar(t, s, a),
    aoFechar: (t, s, a) => envio.despejar(t, s, a),
  });
  return { enviados, total, pedidos: pedidos.n };
}

const somar = (p: Pedaco[]) => p.reduce((a, x) => a + x.ms, 0);
function porSeccao(p: Pedaco[]) {
  const m: Record<string, number> = {};
  for (const x of p) m[String(x.seccao)] = (m[String(x.seccao)] ?? 0) + x.ms;
  return m;
}

describe("o tempo activo sobe de 5 em 5 minutos, e conta o mesmo", () => {
  it("o total enviado é EXACTAMENTE o total contado — e o mesmo do esquema antigo", () => {
    const antigo = esquemaAntigo();
    const novo = esquemaNovo();
    expect(novo.total).toBe(antigo.total);
    expect(novo.total).toBeGreaterThan(20 * 60_000);
    expect(somar(novo.enviados)).toBe(novo.total);
    expect(somar(antigo.enviados)).toBe(antigo.total);
  });

  it("a divisão por secção é a mesma do esquema antigo", () => {
    expect(porSeccao(esquemaNovo().enviados)).toEqual(porSeccao(esquemaAntigo().enviados));
  });

  it("em muito menos pedidos", () => {
    const antigo = esquemaAntigo().enviados.length;
    const novo = esquemaNovo().pedidos;
    expect(novo).toBeLessThan(antigo / 3);
  });

  it("ao esconder a página, o que houver sobe logo, pelo beacon", () => {
    const enviados: Pedaco[] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(recolher(enviados), t0);
    envio.passo(30_000, "capa", t0 + 30_000);
    expect(enviados).toEqual([]); // ainda não passaram 5 minutos
    envio.despejar(42_000, "capa", t0 + 42_000);
    expect(enviados).toEqual([{ ms: 42_000, seccao: "capa", aFechar: true }]);
  });

  it("um envio de 5 em 5 minutos, mesmo com o relógio do ecrã a 30 s", () => {
    const enviados: Pedaco[] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(recolher(enviados), t0);
    for (let k = 1; k <= 20; k++)
      envio.passo(k * PASSO_DO_ECRA_MS, "capa", t0 + k * PASSO_DO_ECRA_MS);
    // 20 passos = 10 minutos = 2 envios, de 5 minutos cada.
    expect(enviados).toEqual([
      { ms: PASSO_DO_ENVIO_MS, seccao: "capa", aFechar: false },
      { ms: PASSO_DO_ENVIO_MS, seccao: "capa", aFechar: false },
    ]);
  });

  it("menos de um segundo não vale um pedido, e não se perde", () => {
    const enviados: Pedaco[] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(recolher(enviados), t0);
    envio.despejar(400, "capa", t0 + 400);
    expect(enviados).toEqual([]);
    envio.despejar(1_500, "capa", t0 + 1_500);
    expect(enviados).toEqual([{ ms: 1_500, seccao: "capa", aFechar: true }]);
  });
});

/**
 * 17/11: o envio de várias secções ia num pedido por secção, AO MESMO TEMPO,
 * e o servidor (ler-somar-gravar sem trinco) ficava só com o último. Agora é
 * um pedido com todas — e um envio falhado volta aos pendentes.
 */
describe("várias secções num só pedido", () => {
  it("três secções em cinco minutos dão UM envio, com as três", () => {
    const pedidos: Lote[][] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(
      (lotes) => pedidos.push(lotes),
      t0,
      () => "id-1",
    );
    envio.passo(60_000, "capa", t0 + 60_000);
    envio.passo(150_000, "mood-boards", t0 + 150_000);
    envio.passo(200_000, null, t0 + 200_000);
    envio.passo(300_000, "orcamento", t0 + 300_000);
    expect(pedidos).toEqual([
      [
        {
          id: "id-1",
          porSeccao: { capa: 60_000, "mood-boards": 90_000, "": 50_000, orcamento: 100_000 },
        },
      ],
    ]);
  });
});

/**
 * 17/11: de cinco em cinco minutos, um envio perdido era perder cinco minutos.
 * Agora o que falha volta aos pendentes e vai no envio seguinte.
 */
describe("um envio que falha volta aos pendentes", () => {
  const resposta = (ok: boolean, corpo: unknown) =>
    ({ ok, json: async () => corpo }) as unknown as Response;
  const meios = (r: () => Promise<Response>) => ({ fetch: vi.fn(r) as unknown as typeof fetch });
  const URL_ = "/api/orcamento/LIQ-1/tempo-activo";
  const LOTE = [{ id: "id-lote-1", porSeccao: { capa: 60_000 } }];

  it("entregarTempo: só conta como entregue o que o servidor guardou", async () => {
    const guardou = meios(async () => resposta(true, { guardado: true }));
    const naoGuardou = meios(async () => resposta(true, { guardado: false }));
    const erro = meios(async () => resposta(false, {}));
    const semRede = meios(async () => Promise.reject(new Error("rede")));
    expect(await entregarTempo(URL_, LOTE, false, guardou)).toBe(true);
    expect(await entregarTempo(URL_, LOTE, false, naoGuardou)).toBe(false);
    expect(await entregarTempo(URL_, LOTE, false, erro)).toBe(false);
    expect(await entregarTempo(URL_, LOTE, false, semRede)).toBe(false);
  });

  it("entregarTempo: o beacon aceite basta; recusado, tenta o fetch", async () => {
    const fetchFalso = vi.fn(async (_u: string, _i: RequestInit) =>
      resposta(true, { guardado: true }),
    );
    const f = fetchFalso as unknown as typeof fetch;
    expect(await entregarTempo(URL_, LOTE, true, { fetch: f, sendBeacon: () => true })).toBe(true);
    expect(fetchFalso).not.toHaveBeenCalled();
    expect(await entregarTempo(URL_, LOTE, true, { fetch: f, sendBeacon: () => false })).toBe(true);
    expect(fetchFalso).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchFalso.mock.calls[0][1].body as string)).toEqual({ lotes: LOTE });
  });

  it("o lote devolvido volta no envio seguinte com o MESMO id, ao lado do novo", () => {
    const pedidos: Lote[][] = [];
    const t0 = Date.now();
    let n = 0;
    let falha = true;
    const envio = criarEnvioDoTempo(
      (lotes) => {
        if (falha) {
          falha = false;
          envio.devolver(lotes); // a rede falhou neste
          return;
        }
        pedidos.push(lotes);
      },
      t0,
      () => `id-${++n}`,
    );
    envio.passo(120_000, "capa", t0 + 120_000);
    envio.passo(300_000, "mood-boards", t0 + 300_000); // 1.º envio: falha
    expect(pedidos).toEqual([]);
    envio.passo(600_000, "mood-boards", t0 + 600_000); // 2.º: o devolvido e o novo
    expect(pedidos).toEqual([
      [
        { id: "id-1", porSeccao: { capa: 120_000, "mood-boards": 180_000 } },
        { id: "id-2", porSeccao: { "mood-boards": 300_000 } },
      ],
    ]);
    const total = pedidos[0].flatMap((l) => Object.values(l.porSeccao)).reduce((a, b) => a + b, 0);
    expect(total).toBe(600_000);
  });

  it("devolver o mesmo lote duas vezes não o duplica", () => {
    const pedidos: Lote[][] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(
      (lotes) => pedidos.push(lotes),
      t0,
      () => "novo",
    );
    const lote = { id: "id-x", porSeccao: { capa: 5_000 } };
    envio.devolver([lote]);
    envio.devolver([lote]);
    envio.despejar(0, null, t0 + 1);
    expect(pedidos).toEqual([[lote]]);
  });
});
