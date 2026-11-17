import { beforeEach, describe, expect, it, vi } from "vitest";

const H = vi.hoisted(() => ({
  linha: null as unknown,
  versao: 0,
  gravacoes: 0,
  lerFalha: false,
  gravarFalha: false,
  conflitos: 0,
  pendurar: null as null | Promise<void>,
  lerPendurado: null as null | Promise<void>,
}));
// O `after` do Next, apanhado: os testes decidem quando corre (como a Vercel,
// depois de o pedido responder).
const depois = vi.hoisted(() => ({ fila: [] as (() => Promise<unknown>)[], apanhar: false }));
vi.mock("next/server", () => ({
  after: (f: () => Promise<unknown>) => {
    if (!depois.apanhar) throw new Error("fora de um pedido");
    depois.fila.push(f);
  },
}));
vi.mock("@/lib/app-state", () => ({
  lerEstadoComVersao: vi.fn(async () => {
    const v = { valor: H.linha, versao: String(H.versao) };
    if (H.lerPendurado) {
      await H.lerPendurado;
      return v; // o valor de quando a leitura COMEÇOU
    }
    if (H.lerFalha) throw new Error("base em baixo");
    return { valor: H.linha, versao: String(H.versao) };
  }),
  gravarEstadoSeNaoMudou: vi.fn(async (_k: string, v: unknown, versao: string) => {
    if (H.pendurar) await H.pendurar;
    if (H.gravarFalha) return "falhou";
    if (H.conflitos > 0) {
      H.conflitos--;
      return "conflito";
    }
    if (versao !== String(H.versao)) return "conflito";
    H.linha = v;
    H.versao++;
    H.gravacoes++;
    return "gravado";
  }),
}));

import {
  _quandoAcabarOLote,
  esquecerUso,
  gravacoesPendentes,
  registar,
  travao,
  usoAtual,
} from "./uso";
import { gravarEstadoSeNaoMudou } from "@/lib/app-state";
import { GB, mesDe } from "./tectos";

const mes = mesDe(new Date());

beforeEach(() => {
  H.linha = null;
  H.versao = 0;
  H.gravacoes = 0;
  H.lerFalha = false;
  H.gravarFalha = false;
  H.conflitos = 0;
  H.pendurar = null;
  H.lerPendurado = null;
  depois.fila = [];
  depois.apanhar = false;
  _quandoAcabarOLote(null);
  vi.mocked(gravarEstadoSeNaoMudou).mockClear();
  esquecerUso();
});

describe("o contador do Blob", () => {
  it("soma o que se gastou na linha guardada", async () => {
    await registar({ avancadas: 1, bytes: 100 });
    await registar({ simples: 2, transferencia: 50 });
    await gravacoesPendentes();
    expect(H.linha).toEqual({ mes, avancadas: 1, simples: 2, transferencia: 50, bytes: 100 });
  });

  it("oito gastos em paralelo não se perdem (nem lutam pela mesma linha)", async () => {
    await Promise.all(Array.from({ length: 8 }, () => registar({ simples: 1 })));
    await gravacoesPendentes();
    expect((H.linha as { simples: number }).simples).toBe(8);
    expect(H.gravacoes).toBeLessThanOrEqual(8);
  });

  it("o travão recusa com a linha guardada perto do tecto", async () => {
    H.linha = { mes, avancadas: 50_000, simples: 0, transferencia: 0, bytes: 0 };
    expect(await travao({ avancadas: 1 })).toBe("operacoes-avancadas");
    expect(await travao({ simples: 1 })).toBeNull();
  });

  it("o travão vê o que esta instância gastou desde a última leitura", async () => {
    H.linha = { mes, avancadas: 0, simples: 0, transferencia: 0, bytes: 2 * GB - 10 };
    expect(await travao({ avancadas: 1, bytes: 5 })).toBeNull();
    await registar({ avancadas: 1, bytes: 5 });
    await gravacoesPendentes();
    // A leitura está em cache (60 s); o gasto desta instância soma-se por cima.
    expect(await travao({ avancadas: 1, bytes: 6 })).toBe("armazenamento");
  });

  it("um contador ilegível FECHA o travão (revisão 17/11, n.º 5)", async () => {
    H.lerFalha = true;
    expect(await usoAtual()).toBeNull();
    expect(await travao({ avancadas: 1 })).toBe("contador-ilegivel");
    expect(await travao({ simples: 1 })).toBe("contador-ilegivel");
  });

  it("uma cópia velha em memória não serve de travão quando a leitura falha", async () => {
    await usoAtual();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    H.lerFalha = true;
    expect(await travao({ simples: 1 })).toBe("contador-ilegivel");
    vi.useRealTimers();
  });

  it("um conflito no compare-and-set tenta outra vez antes de desistir", async () => {
    H.conflitos = 5;
    await registar({ simples: 5 });
    await gravacoesPendentes();
    expect((H.linha as { simples: number }).simples).toBe(5);
  });

  it("um gasto que não se gravou não se perde: continua a contar e grava-se depois", async () => {
    H.linha = { mes, avancadas: 49_999, simples: 0, transferencia: 0, bytes: 0 };
    await usoAtual();
    H.gravarFalha = true;
    await registar({ avancadas: 1 });
    await gravacoesPendentes();
    // A leitura seguinte (fresca) ainda não tem o gasto — mas a instância sabe dele.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(await travao({ avancadas: 1 })).toBe("operacoes-avancadas");
    vi.useRealTimers();
    H.gravarFalha = false;
    await registar({ simples: 1 });
    await gravacoesPendentes();
    expect(H.linha).toMatchObject({ avancadas: 50_000, simples: 1 });
  });

  it("o mês anterior não conta para este", async () => {
    H.linha = {
      mes: "2000-01",
      avancadas: 50_000,
      simples: 300_000,
      transferencia: 9 * GB,
      bytes: 7,
    };
    expect(await travao({ avancadas: 1, simples: 1, transferencia: 1 })).toBeNull();
    expect((await usoAtual())!.bytes).toBe(7);
  });

  it("2.ª revisão, n.º 5: registar NÃO prende o pedido — a gravação corre à parte", async () => {
    let soltar!: () => void;
    H.pendurar = new Promise((r) => (soltar = r));
    const antes = Date.now();
    await registar({ simples: 1 });
    expect(Date.now() - antes).toBeLessThan(50);
    // O travão desta instância já o vê, sem esperar pela gravação.
    H.linha = { mes, avancadas: 0, simples: 300_000 - 1, transferencia: 0, bytes: 0 };
    expect(await travao({ simples: 1 })).toBe("operacoes-simples");
    soltar();
    await gravacoesPendentes();
  });

  it("2.ª revisão, n.º 5: quando a gravação falha, só 2 tentativas", async () => {
    H.gravarFalha = true;
    await registar({ simples: 1 });
    await gravacoesPendentes();
    expect(vi.mocked(gravarEstadoSeNaoMudou)).toHaveBeenCalledTimes(2);
  });

  it("2.ª revisão, n.º 5: um gasto que chega a meio de uma gravação também se grava", async () => {
    let soltar!: () => void;
    H.pendurar = new Promise((r) => (soltar = r));
    await registar({ simples: 1 });
    await registar({ simples: 2 }); // chega com a primeira a meio
    H.pendurar = null;
    soltar();
    await gravacoesPendentes();
    expect((H.linha as { simples: number }).simples).toBe(3);
  });

  it("3.ª revisão, n.º 4: um gasto que chega quando a gravação já acabou o ciclo também se grava", async () => {
    depois.apanhar = true;
    await registar({ simples: 1 });
    // O gasto chega no intervalo exacto: o ciclo da gravação já viu a fila
    // vazia, mas a gravação ainda não se deu por terminada.
    // E o `after` desse gasto corre logo ali, com a gravação ainda «em curso».
    let doSegundo: Promise<unknown> = Promise.resolve();
    _quandoAcabarOLote(() => {
      _quandoAcabarOLote(null);
      void registar({ simples: 10 });
      doSegundo = depois.fila[depois.fila.length - 1]();
    });
    await depois.fila[0]();
    await doSegundo;
    expect((H.linha as { simples: number }).simples).toBe(11);
  });

  it("3.ª revisão, n.º 5: um lote gravado durante a leitura não fica de fora do travão", async () => {
    H.linha = { mes, avancadas: 49_999, simples: 0, transferencia: 0, bytes: 0 };
    let soltarLeitura!: () => void;
    H.lerPendurado = new Promise((r) => (soltarLeitura = r));
    // A leitura começa (e vê 49 999)…
    const leitura = usoAtual();
    // …e entretanto um gasto grava-se por completo noutra volta.
    H.lerPendurado = null;
    const lido = H.linha;
    await registar({ avancadas: 1 });
    await gravacoesPendentes();
    H.lerPendurado = Promise.resolve();
    H.linha = lido; // o que a leitura pendurada devolve é o de antes
    soltarLeitura();
    const u = await leitura;
    expect(u!.avancadas).toBe(50_000);
    expect(await travao({ avancadas: 1 })).toBe("operacoes-avancadas");
  });

  it("4.ª revisão, n.º 1: duas leituras ao mesmo tempo não contam a menos (a ordem exacta)", async () => {
    H.linha = { mes, avancadas: 0, simples: 0, transferencia: 0, bytes: 0 };
    let soltarA!: () => void;
    H.lerPendurado = new Promise((r) => (soltarA = r));
    // A começa e vê 0…
    const a = usoAtual();
    H.lerPendurado = null;
    // …grava-se um lote de 100…
    await registar({ transferencia: 100 });
    await gravacoesPendentes();
    // …B começa (sozinha veria 100, e acabaria primeiro)…
    const b = usoAtual();
    await new Promise((r) => setTimeout(r, 0));
    // …e A acaba no fim, com o 0 que viu ao começar.
    soltarA();
    await a;
    expect((await b)!.transferencia).toBe(100);
    expect((await usoAtual())!.transferencia).toBe(100);
  });
});
