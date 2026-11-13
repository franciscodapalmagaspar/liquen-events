import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CÓPIA DIÁRIA: O QUE ELA LEVA, E O QUE ELA DEIXA DITO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas novas nesta rota, e as duas nascem do mesmo buraco: as
 * FOTOGRAFIAS não têm cópia nenhuma, e a própria cópia pode ter deixado de
 * correr sem ninguém dar por isso.
 *
 *  1. vai um MANIFESTO das fotografias — a lista do que existe nos buckets de
 *     originais, com tamanho e assinatura. Não são as fotos (essas não cabem
 *     num email); é a resposta a «o que é que se perdeu?», que hoje não existe;
 *  2. cada cópia bem sucedida deixa um CARIMBO, que é o que permite ao back
 *     office dizer «não chega uma cópia há nove dias» em vez de toda a gente
 *     presumir que ela anda a correr.
 *
 * A regra que atravessa tudo isto, e o teste mais importante do ficheiro: o
 * manifesto NUNCA pode levar a cópia dos dados atrás. Entre as duas, a que tem
 * de sair é a dos dados.
 */

const st = vi.hoisted(() => ({
  authed: false,
  payload: {
    exportedAt: "2026-08-11T04:00:00.000Z",
    counts: { quotes: 3, proposals: 2 },
    incomplete: [] as string[],
  } as Record<string, unknown>,
  manifesto: {
    geradoEm: "2026-08-11T04:00:01.000Z",
    buckets: [{ bucket: "proposal-assets", ficheiros: 12, bytes: 24_000_000 }],
    ficheiros: 12,
    bytes: 24_000_000,
    completo: true,
    avisos: [] as string[],
    entradas: [{ chave: "proposal-assets/LIQ-1/a.jpg", bytes: 2_000_000, soma: "abc" }],
    readme: "…",
  },
  manifestoRebenta: false,
  /** O aquecimento dos PDF: o que devolveu, e se rebentou. */
  aquecimentos: [] as number[],
  aquecimentoRebenta: false,
  /** A limpeza da Reciclagem: quantas tirou, e se rebentou. */
  reciclagemRebenta: false,
  reciclagemLimpezas: 0,
  enviados: [] as { subject: string; anexos: string[] }[],
  /** O `sendMail` devolve `sent: false` (SMTP por configurar, conta bloqueada). */
  emailNaoSai: false,
  retencoes: 0,
  /** Os pedidos que a retenção recebeu. */
  retencaoRecebeu: null as unknown,
  carimbos: [] as unknown[],
  /** A cópia comprimida passa dos 20 MB do anexo. */
  anexoGigante: false,
  /** As opções que o aquecimento recebeu. */
  aquecimentoOpcoes: [] as Record<string, unknown>[],
  fotosTratadasLimpezas: 0,
  diagnosticosLimpezas: 0,
  leiturasDosPedidos: 0,
}));

vi.mock("node:zlib", async (original) => {
  const real = await original<typeof import("node:zlib")>();
  return {
    ...real,
    gzipSync: (b: Buffer) => (st.anexoGigante ? Buffer.alloc(21 * 1024 * 1024) : real.gzipSync(b)),
  };
});
vi.mock("@/lib/quotes-store", () => ({
  listQuotes: vi.fn(async () => {
    st.leiturasDosPedidos++;
    return [];
  }),
}));
vi.mock("@/lib/limpar-diagnosticos-video", () => ({
  limparDiagnosticosDoVideo: vi.fn(async () => {
    st.diagnosticosLimpezas++;
    return 4;
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/app/api/backup/route", () => ({
  buildBackupPayload: vi.fn(async () => st.payload),
}));
vi.mock("@/lib/manifesto-de-fotografias", () => ({
  construirManifesto: vi.fn(async () => {
    if (st.manifestoRebenta) throw new Error("Storage em baixo");
    return st.manifesto;
  }),
}));
vi.mock("@/lib/copia-de-seguranca-marcador", () => ({
  registarCopiaEnviada: vi.fn(async (info: unknown) => {
    st.carimbos.push(info);
  }),
}));
vi.mock("@/lib/aquecimento-de-pdf", () => ({
  aquecerPdfsEmFalta: vi.fn(async (decorrido: number, opcoes?: Record<string, unknown>) => {
    if (st.aquecimentoRebenta) throw new Error("a base não responde");
    st.aquecimentos.push(decorrido);
    st.aquecimentoOpcoes.push(opcoes ?? {});
    return {
      vistas: 2,
      jaTinham: 1,
      aquecidas: 1,
      incompletas: 0,
      falhadas: 0,
      adiadas: 0,
      semTempo: false,
    };
  }),
}));
vi.mock("@/lib/retencao", () => ({
  correrRetencao: vi.fn(async (pedidos: unknown) => {
    st.retencoes++;
    st.retencaoRecebeu = pedidos;
    return { apagados: 0 };
  }),
}));
vi.mock("@/lib/limpar-pastas-orfas", () => ({
  limparPastasDePedidosApagados: vi.fn(async () => ({ candidatas: 0, apagadas: 0, acabou: true })),
}));
vi.mock("@/lib/limpar-fotos-tratadas", () => ({
  limparFotosTratadasVelhas: vi.fn(async () => {
    st.fotosTratadasLimpezas++;
    return { apagadas: 3, pastas: 256, acabou: true };
  }),
}));
vi.mock("@/lib/reciclagem", () => ({
  limparExpiradas: vi.fn(async () => {
    if (st.reciclagemRebenta) throw new Error("a base não responde");
    st.reciclagemLimpezas++;
    return { apagadas: 2 };
  }),
}));
vi.mock("@/lib/mail", () => ({
  MAIL_TO: "dona@liquen.test",
  sendMail: vi.fn(async (m: { subject: string; attachments?: { filename: string }[] }) => {
    st.enviados.push({
      subject: m.subject,
      anexos: (m.attachments ?? []).map((a) => a.filename),
    });
    return { sent: !st.emailNaoSai };
  }),
}));

import { GET } from "./route";

// Um pedido do próprio site (o `fetch` do back office); `deFora` simula um
// link aberto noutra página, que leva os cookies mas não o `same-origin`.
const req = (auth?: string, deFora = false): NextRequest =>
  new Request("https://liquen.test/api/cron/backup", {
    headers: {
      "sec-fetch-site": deFora ? "cross-site" : "same-origin",
      ...(auth === undefined ? {} : { authorization: auth }),
    },
  }) as unknown as NextRequest;

beforeEach(() => {
  st.authed = false;
  st.manifestoRebenta = false;
  st.manifesto.completo = true;
  st.manifesto.avisos = [];
  st.payload = {
    exportedAt: "2026-08-11T04:00:00.000Z",
    counts: { quotes: 3 },
    incomplete: [],
  };
  st.enviados = [];
  st.carimbos = [];
  st.aquecimentos = [];
  st.aquecimentoRebenta = false;
  st.reciclagemRebenta = false;
  st.reciclagemLimpezas = 0;
  st.emailNaoSai = false;
  st.retencoes = 0;
  st.retencaoRecebeu = null;
  st.anexoGigante = false;
  st.aquecimentoOpcoes = [];
  st.fotosTratadasLimpezas = 0;
  st.diagnosticosLimpezas = 0;
  st.leiturasDosPedidos = 0;
  vi.stubEnv("CRON_SECRET", "segredo");
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("o manifesto das fotografias vai junto", () => {
  it("sai um segundo anexo com a lista do que está nos buckets", async () => {
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBe(200);
    const anexos = st.enviados[0].anexos;
    expect(anexos.some((n) => /liquen-backup-2026-08-11\.json\.gz/.test(n))).toBe(true);
    expect(anexos.some((n) => /fotografias-2026-08-11\.json\.gz/.test(n))).toBe(true);
  });

  it("o email diz quantas fotografias e quantos MB ficaram por copiar", async () => {
    await GET(req("Bearer segredo"));
    const corpo = await (await GET(req("Bearer segredo"))).json();
    expect(corpo.fotografias).toMatchObject({ ficheiros: 12, completo: true });
  });

  /**
   * O TESTE QUE MAIS IMPORTA AQUI. O manifesto é um extra; a cópia dos dados é
   * a razão de a tarefa existir. Um Storage em baixo não pode ser o motivo
   * pelo qual as propostas e as facturas deste dia não saem de casa.
   */
  it("um manifesto que rebenta NÃO impede a cópia dos dados de seguir", async () => {
    st.manifestoRebenta = true;
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBe(200);
    expect(st.enviados).toHaveLength(1);
    expect(st.enviados[0].anexos.some((n) => /liquen-backup-/.test(n))).toBe(true);
    // E não se finge que a lista das fotos foi: o email di-lo.
    expect((await res.json()).fotografias).toBeNull();
  });
});

describe("o carimbo de «esta cópia chegou»", () => {
  it("fica registado quando o email sai", async () => {
    await GET(req("Bearer segredo"));
    expect(st.carimbos).toHaveLength(1);
    expect(st.carimbos[0]).toMatchObject({ modo: "automatica", parcial: false });
  });

  it("uma cópia INCOMPLETA fica carimbada como parcial", async () => {
    st.payload = { ...st.payload, incomplete: ["proposals"] };
    await GET(req("Bearer segredo"));
    expect(st.carimbos[0]).toMatchObject({ parcial: true });
    expect(st.enviados[0].subject).toMatch(/INCOMPLETA/);
  });

  /**
   * Sem `CRON_SECRET` a rota responde 401 — é o desenho, e é o silêncio que o
   * carimbo existe para tornar visível. O que não pode acontecer de maneira
   * nenhuma é um 401 deixar carimbo: seria o painel a dizer «a cópia está em
   * dia» no exacto dia em que ela deixou de correr.
   */
  /**
   * O `sendMail` não lança quando o email não sai — devolve `sent: false`. E a
   * rota seguia como se a cópia tivesse saído: carimbava, aplicava a retenção
   * e esvaziava a Reciclagem, num dia SEM cópia nenhuma. É o contrário da
   * promessa «nada é apagado sem estar dentro da cópia desse mesmo dia».
   */
  it("se o email não sai, não carimba, não aplica a retenção e não esvazia a Reciclagem", async () => {
    st.emailNaoSai = true;
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, sent: false });
    expect(st.carimbos).toHaveLength(0);
    expect(st.retencoes).toBe(0);
    expect(st.reciclagemLimpezas).toBe(0);
    expect(st.aquecimentos).toHaveLength(0);
  });

  it("com o email a sair, a retenção e a Reciclagem correm como antes", async () => {
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBe(200);
    expect(st.retencoes).toBe(1);
    expect(st.reciclagemLimpezas).toBe(1);
  });

  it("um pedido recusado não carimba coisa nenhuma", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(st.carimbos).toHaveLength(0);
    expect(st.enviados).toHaveLength(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E, COM O TEMPO QUE SOBRAR, OS PDF DAS PROPOSTAS JÁ ENVIADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta dela: «mesmo nas propostas em que já enviamos (…) se também vai
 * acontecer nestas propostas que já enviamos». O aquecimento vive aqui dentro
 * porque um terceiro agendamento é uma aposta no plano de alojamento — a
 * mesma que já custou um deploy recusado a esta casa.
 *
 * Vive aqui dentro, mas é o hóspede: a cópia de segurança é a razão de ser
 * deste trabalho, e nada do que se lhe acrescente pode deitá-la abaixo.
 */
describe("o aquecimento dos PDF viaja com a cópia", () => {
  it("corre depois de a cópia ter seguido, e diz-lhe quanto tempo já se gastou", async () => {
    st.authed = true;
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(st.enviados, "correu sem a cópia ter seguido").toHaveLength(1);
    expect(st.aquecimentos, "o aquecimento não chegou a correr").toHaveLength(1);
    // O que ele recebe é o relógio da função, não um número inventado: sem
    // isto ele não sabe quanto tempo lhe sobra e come o tecto da função.
    expect(st.aquecimentos[0]).toBeGreaterThanOrEqual(0);
    expect(await res.json()).toMatchObject({ aquecimento: { aquecidas: 1 } });
  });

  it("um aquecimento que rebenta NÃO impede a cópia de seguir", async () => {
    // A mesma regra do manifesto e da retenção, e pela mesma razão: a cópia já
    // seguiu quando isto corre. Trocar uma cópia bem-sucedida por um 500 por
    // causa do aquecimento seria vender o essencial pelo acessório.
    st.authed = true;
    st.aquecimentoRebenta = true;
    const res = await GET(req());

    expect(res.status).toBe(200);
    expect(st.enviados, "a cópia não seguiu por causa do aquecimento").toHaveLength(1);
    expect(st.carimbos, "a cópia deixou de ficar carimbada").toHaveLength(1);
    expect(await res.json()).toMatchObject({ ok: true, aquecimento: null });
  });

  it("limpa a Reciclagem dos 30 dias, DEPOIS de a cópia seguir", async () => {
    st.authed = true;
    const res = await GET(req());
    expect(st.enviados).toHaveLength(1);
    expect(st.reciclagemLimpezas).toBe(1);
    expect(await res.json()).toMatchObject({ reciclagem: { apagadas: 2 } });
  });

  it("uma limpeza da Reciclagem que rebenta NÃO impede a cópia de seguir", async () => {
    st.authed = true;
    st.reciclagemRebenta = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(st.enviados, "a cópia não seguiu por causa da Reciclagem").toHaveLength(1);
    expect(await res.json()).toMatchObject({ ok: true, reciclagem: null });
  });

  it("um pedido recusado não aquece nada", async () => {
    st.authed = false;
    const res = await GET(req("Bearer errado"));

    expect(res.status).toBe(401);
    expect(st.aquecimentos).toEqual([]);
  });
});

describe("a sessão só lança a cópia num pedido do próprio site (10/11)", () => {
  it("um link aberto noutra página não a lança, mesmo com a sessão dela", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    st.authed = true;
    const res = await GET(req(undefined, true));
    expect(res.status).toBe(401);
  });
});

describe("auditoria de 13/11: a cópia grande demais, as caches, as leituras repetidas", () => {
  it("n.º 9 — cópia grande demais: as caches limpam-se na mesma, nada de dados sai, e a resposta não é 200", async () => {
    st.anexoGigante = true;
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBeGreaterThanOrEqual(500);
    const corpo = await res.json();
    expect(corpo).toMatchObject({ ok: false, reason: "grande demais", avisoEnviado: true });
    // As caches (que se refazem sozinhas) saem…
    expect(st.fotosTratadasLimpezas).toBe(1);
    expect(st.diagnosticosLimpezas).toBe(1);
    // …e o que apaga dados continua à espera de uma cópia que tenha saído.
    expect(st.retencoes).toBe(0);
    expect(st.reciclagemLimpezas).toBe(0);
    expect(st.carimbos).toHaveLength(0);
  });

  it("n.º 9 — se nem o aviso de «grande demais» sai, a resposta di-lo", async () => {
    st.anexoGigante = true;
    st.emailNaoSai = true;
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(await res.json()).toMatchObject({ ok: false, avisoEnviado: false });
  });

  it("n.º 15 — os registos velhos do diagnóstico do vídeo limpam-se todas as noites", async () => {
    const res = await GET(req("Bearer segredo"));
    expect(res.status).toBe(200);
    expect(st.diagnosticosLimpezas).toBe(1);
    expect(await res.json()).toMatchObject({ diagnosticos: 4 });
  });

  it("n.º 17 — a retenção usa os pedidos que a cópia já leu, sem ler a tabela outra vez", async () => {
    const pedidos = [{ id: "LIQ-1" }, { id: "LIQ-2" }];
    st.payload = { ...st.payload, quotes: pedidos };
    await GET(req("Bearer segredo"));
    expect(st.retencaoRecebeu).toBe(pedidos);
    expect(st.leiturasDosPedidos).toBe(0);
  });

  it("n.º 17 — o aquecimento recebe as propostas que a cópia já leu", async () => {
    const propostas = [{ id: "p1" }];
    st.payload = { ...st.payload, proposals: propostas };
    await GET(req("Bearer segredo"));
    expect(st.aquecimentoOpcoes[0]).toMatchObject({ propostas });
  });
});
