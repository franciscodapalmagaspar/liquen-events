import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTAGEM_VAZIA, comAcontecimento, totalAte, type Contagem } from "./tempo-activo";
import { criarEnvioDoTempo, PASSO_DO_ECRA_MS, PASSO_DO_ENVIO_MS } from "./tempo-activo-envio";

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

function esquemaNovo() {
  const enviados: Pedaco[] = [];
  const envio = criarEnvioDoTempo(
    (ms, seccao, aFechar) => enviados.push({ ms, seccao, aFechar }),
    Date.now(),
  );
  const total = sessao({
    aoPasso: (t, s, a) => envio.passo(t, s, a),
    aoEsconder: (t, s, a) => envio.despejar(t, s, a),
    aoFechar: (t, s, a) => envio.despejar(t, s, a),
  });
  return { enviados, total };
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
    const novo = esquemaNovo().enviados.length;
    expect(novo).toBeLessThan(antigo / 3);
  });

  it("ao esconder a página, o que houver sobe logo, pelo beacon", () => {
    const enviados: Pedaco[] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(
      (ms, seccao, aFechar) => enviados.push({ ms, seccao, aFechar }),
      t0,
    );
    envio.passo(30_000, "capa", t0 + 30_000);
    expect(enviados).toEqual([]); // ainda não passaram 5 minutos
    envio.despejar(42_000, "capa", t0 + 42_000);
    expect(enviados).toEqual([{ ms: 42_000, seccao: "capa", aFechar: true }]);
  });

  it("um envio de 5 em 5 minutos, mesmo com o relógio do ecrã a 30 s", () => {
    const enviados: Pedaco[] = [];
    const t0 = Date.now();
    const envio = criarEnvioDoTempo(
      (ms, seccao, aFechar) => enviados.push({ ms, seccao, aFechar }),
      t0,
    );
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
    const envio = criarEnvioDoTempo(
      (ms, seccao, aFechar) => enviados.push({ ms, seccao, aFechar }),
      t0,
    );
    envio.despejar(400, "capa", t0 + 400);
    expect(enviados).toEqual([]);
    envio.despejar(1_500, "capa", t0 + 1_500);
    expect(enviados).toEqual([{ ms: 1_500, seccao: "capa", aFechar: true }]);
  });
});
