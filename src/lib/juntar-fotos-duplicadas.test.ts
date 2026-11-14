import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ManifestoDeFotografias } from "./manifesto-de-fotografias";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

type Linha = Record<string, unknown>;
const st = vi.hoisted(() => ({
  tabelas: {} as Record<string, Linha[] | null>,
  /** As linhas de `app_state` (chave → valor + updated_at). */
  estado: {} as Record<string, { value: unknown; updated_at: string }>,
  apagados: [] as string[],
  copiados: [] as string[],
  /** Alguém grava o rascunho entre a leitura e a escrita desta limpeza. */
  escritaAlheia: null as null | string,
  setStateFalha: false,
  depoisDeLer: null as null | (() => void),
}));

vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => st.estado[k]?.value ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    if (st.setStateFalha) return { gravado: false, duradouro: false, onde: "nenhures" };
    st.estado[k] = { value: structuredClone(v), updated_at: new Date().toISOString() };
    return { gravado: true, duradouro: true, onde: "servidor" };
  }),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        copy: async (de: string, para: string, o?: { destinationBucket?: string }) => {
          st.copiados.push(`${bucket}/${de} -> ${o?.destinationBucket ?? bucket}/${para}`);
          return { data: { path: para }, error: null };
        },
        remove: async (caminhos: string[]) => {
          st.apagados.push(...caminhos.map((c) => `${bucket}/${c}`));
          return { data: caminhos.map((name) => ({ name })), error: null };
        },
      }),
    },
    from: (tabela: string) => {
      const linhas = (): Linha[] | null =>
        tabela === "app_state"
          ? Object.entries(st.estado).map(([key, r]) => ({ key, ...r }))
          : st.tabelas[tabela] === null
            ? null
            : (st.tabelas[tabela] ?? []);
      return {
        select: () => {
          let desde = 0;
          let ate = Infinity;
          let chave: string | null = null;
          let prefixo: string | null = null;
          let depoisDe: string | null = null;
          const b = {
            like(_c: string, v: string) {
              prefixo = v.replace(/%$/, "");
              return b;
            },
            gt(_c: string, v: string) {
              depoisDe = v;
              return b;
            },
            order: () => b,
            range(d: number, a: number) {
              desde = d;
              ate = a;
              return b;
            },
            eq(_c: string, v: string) {
              chave = v;
              return b;
            },
            maybeSingle: async () => {
              const r = st.estado[chave ?? ""];
              const out = { data: r ? { key: chave, ...structuredClone(r) } : null, error: null };
              // A escrita alheia acontece DEPOIS desta leitura.
              if (st.escritaAlheia === chave && r) r.updated_at = "2099-01-01T00:00:00Z";
              return out;
            },
            then(resolve: (v: unknown) => unknown) {
              let todas = linhas();
              if (!todas) return Promise.resolve(resolve({ data: null, error: { message: "x" } }));
              if (prefixo !== null) todas = todas.filter((l) => String(l.key).startsWith(prefixo!));
              if (depoisDe !== null)
                todas = todas.filter(
                  (l) => typeof l.updated_at === "string" && l.updated_at > depoisDe!,
                );
              const fim = Math.min(ate + 1, desde + 1000);
              const pagina = todas.slice(desde, fim);
              // A leitura INTEIRA do app_state acabou (a página vazia do fim): é
              // depois dela que a corrida da Fase B acontece.
              if (tabela === "app_state" && prefixo === null && depoisDe === null && !pagina.length)
                queueMicrotask(() => st.depoisDeLer?.());
              return Promise.resolve(resolve({ data: pagina, error: null }));
            },
          };
          return b;
        },
        update: (novo: { value: unknown; updated_at: string }) => {
          let chave = "";
          let lido: string | null = null;
          const u = {
            eq(c: string, v: string) {
              if (c === "key") chave = v;
              if (c === "updated_at") lido = v;
              return u;
            },
            is: () => u,
            select: async () => {
              const r = st.estado[chave];
              if (!r || r.updated_at !== lido) return { data: [], error: null };
              st.estado[chave] = { value: novo.value, updated_at: novo.updated_at };
              return { data: [{ key: chave }], error: null };
            },
          };
          return u;
        },
      };
    },
  }),
}));

import { CHAVE, juntarFotosDuplicadas, type PlanoDeDuplicados } from "./juntar-fotos-duplicadas";

const noite1 = new Date("2026-11-14T03:00:00Z");
const noite2 = new Date("2026-11-15T03:05:00Z");
const TEMA = "11111111-aaaa";
const PEDIDO = "LIQ-2026-001";

type E = { chave: string; soma: string; bytes: number; em: string };
let entradas: E[] = [];
const foto = (chave: string, soma: string, em = "2026-10-01T00:00:00Z", bytes = 1_048_576) =>
  entradas.push({ chave, soma, bytes, em });
const manifesto = (completo = true): ManifestoDeFotografias => ({
  geradoEm: noite1.toISOString(),
  buckets: [],
  ficheiros: entradas.length,
  bytes: 0,
  completo,
  avisos: [],
  readme: "",
  entradas: entradas.map((e) => ({
    chave: e.chave,
    bytes: e.bytes,
    soma: e.soma,
    alteradoEm: e.em,
  })),
});
const rascunho = (pedido: string, doc: unknown) => {
  st.estado[`proposal-draft:${pedido}`] = {
    value: { doc, updatedAt: "2026-11-10T10:00:00Z" },
    updated_at: "2026-11-10T10:00:00Z",
  };
};
const plano = () => st.estado[CHAVE]?.value as PlanoDeDuplicados;
const docDe = (pedido: string) =>
  (st.estado[`proposal-draft:${pedido}`].value as { doc: Record<string, unknown> }).doc;
const duasNoites = async () => {
  const a = await juntarFotosDuplicadas(manifesto(), noite1);
  const b = await juntarFotosDuplicadas(manifesto(), noite2);
  return { a, b };
};

beforeEach(() => {
  entradas = [];
  st.estado = {};
  st.apagados = [];
  st.copiados = [];
  st.escritaAlheia = null;
  st.setStateFalha = false;
  st.depoisDeLer = null;
  st.tabelas = { proposal_themes: [{ id: TEMA, name: "Campo" }] };
});

describe("fotografias repetidas na MESMA pasta de um pedido", () => {
  beforeEach(() => {
    foto(`proposal-assets/${PEDIDO}/velha.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/nova.jpg`, "aaa", "2026-10-01T00:00:00Z");
  });

  it("a primeira noite só faz o plano: não apaga nada", async () => {
    const r = await juntarFotosDuplicadas(manifesto(), noite1);
    expect(r).toMatchObject({ fase: "A", copias: 1, bytes: 1_048_576 });
    expect(st.apagados).toEqual([]);
    expect(plano().apagar).toEqual([
      { caminho: `${PEDIDO}/nova.jpg`, fica: `${PEDIDO}/velha.jpg`, bytes: 1_048_576, soma: "aaa" },
    ]);
  });

  it("antes das 24 h espera; depois sai a mais nova, com as derivadas — e fica a mais antiga", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    const cedo = await juntarFotosDuplicadas(manifesto(), new Date("2026-11-14T20:00:00Z"));
    expect(cedo.fase).toBe("espera");
    expect(st.apagados).toEqual([]);
    const b = await juntarFotosDuplicadas(manifesto(), noite2);
    expect(b).toMatchObject({ fase: "B", apagadas: 1, bytesApagados: 1_048_576 });
    expect(st.apagados).toContain(`proposal-assets/${PEDIDO}/nova.jpg`);
    expect(st.apagados).not.toContain(`proposal-assets/${PEDIDO}/velha.jpg`);
    for (const d of ["proposal-thumbs", "proposal-medias", "proposal-capas"])
      expect(st.apagados).toContain(`${d}/${PEDIDO}/nova.jpg`);
    expect(st.apagados).toContain(`proposal-avif-medias/${PEDIDO}/nova.jpg.capa.avif`);
    expect(plano().feitos).toEqual({ [`${PEDIDO}/nova.jpg`]: `${PEDIDO}/velha.jpg` });
    expect(plano().saiu).toEqual({ copias: 1, bytes: 1_048_576 });
  });

  it("as derivadas da que fica são garantidas ANTES de as da que sai irem embora", async () => {
    await duasNoites();
    expect(st.copiados).toContain(
      `proposal-medias/${PEDIDO}/nova.jpg -> proposal-medias/${PEDIDO}/velha.jpg`,
    );
    expect(st.copiados).toContain(
      `proposal-thumbs/${PEDIDO}/nova.jpg -> proposal-thumbs/${PEDIDO}/velha.jpg`,
    );
  });

  it("um rascunho que usa a cópia que sai passa a usar a que fica, e o valor antigo fica no plano", async () => {
    rascunho(PEDIDO, { moodBoards: [{ images: ["x", `${PEDIDO}/nova.jpg`] }] });
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(docDe(PEDIDO)).toEqual({ moodBoards: [{ images: ["x", `${PEDIDO}/velha.jpg`] }] });
    expect(plano().trocas).toEqual([
      {
        chave: `proposal-draft:${PEDIDO}`,
        campo: ["doc", "moodBoards", 0, "images", 1],
        antes: `${PEDIDO}/nova.jpg`,
        depois: `${PEDIDO}/velha.jpg`,
      },
    ]);
  });

  it("o rascunho reescrito leva um updatedAt NOVO (para o estúdio aberto não o regravar às cegas)", async () => {
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/nova.jpg`] });
    await juntarFotosDuplicadas(manifesto(), noite1);
    const v = st.estado[`proposal-draft:${PEDIDO}`].value as { updatedAt: string };
    expect(v.updatedAt).not.toBe("2026-11-10T10:00:00Z");
  });
});

describe("as portas que prendem uma cópia", () => {
  beforeEach(() => {
    foto(`proposal-assets/${PEDIDO}/velha.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/nova.jpg`, "aaa", "2026-10-01T00:00:00Z");
  });

  it("referida numa PROPOSTA gravada: fica, e a proposta não é reescrita", async () => {
    st.tabelas.proposals = [{ id: "p1", doc: { coverImages: [`${PEDIDO}/nova.jpg`] } }];
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/velha.jpg`] });
    await duasNoites();
    expect(st.apagados).not.toContain(`proposal-assets/${PEDIDO}/nova.jpg`);
    // A presa é a que fica, e a outra (livre) é a que sai.
    expect(st.apagados).toContain(`proposal-assets/${PEDIDO}/velha.jpg`);
    expect(st.tabelas.proposals[0]).toEqual({
      id: "p1",
      doc: { coverImages: [`${PEDIDO}/nova.jpg`] },
    });
  });

  it("referida na RECICLAGEM: fica", async () => {
    st.tabelas.reciclagem = [
      { id: "r1", retrato: { propostas: [{ doc: [`${PEDIDO}/nova.jpg`] }] } },
    ];
    st.tabelas.proposals = [{ id: "p1", doc: [`${PEDIDO}/velha.jpg`] }];
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("referida num TEMA (ou em qualquer outra tabela): fica", async () => {
    st.tabelas.proposal_themes = [{ id: TEMA, cover_path: `${PEDIDO}/nova.jpg` }];
    st.tabelas.proposals = [{ id: "p1", doc: [`${PEDIDO}/velha.jpg`] }];
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("os índices das fotografias (`foto-resumo:`, `foto-visual:`) não a seguram: sai na mesma", async () => {
    st.estado["foto-visual:1c"] = {
      value: { [`${PEDIDO}/nova.jpg`]: "f".repeat(86), [`${PEDIDO}/velha.jpg`]: "e".repeat(86) },
      updated_at: "x",
    };
    st.estado["foto-resumo:" + "c".repeat(32)] = { value: [`${PEDIDO}/nova.jpg`], updated_at: "x" };
    const { b } = await duasNoites();
    expect(b).toMatchObject({ fase: "B", apagadas: 1 });
    expect(st.apagados).toContain(`proposal-assets/${PEDIDO}/nova.jpg`);
    // E diz quais saíram (o índice visual da mesma noite não as calcula).
    expect(b.caminhosApagados).toEqual([`${PEDIDO}/nova.jpg`]);
  });

  it("referida noutra chave do app_state: fica", async () => {
    st.estado["modelo:casamento"] = { value: { capa: `${PEDIDO}/nova.jpg` }, updated_at: "x" };
    st.tabelas.proposals = [{ id: "p1", doc: [`${PEDIDO}/velha.jpg`] }];
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("mencionada num rascunho fora de um caminho inteiro (dentro de um endereço): fica", async () => {
    rascunho(PEDIDO, { nota: `https://x/storage/proposal-assets/${PEDIDO}/nova.jpg?token=1` });
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(plano().apagar).toEqual([]);
    await juntarFotosDuplicadas(manifesto(), noite2);
    expect(st.apagados).toEqual([]);
  });

  it("uma escrita concorrente no rascunho não é pisada — e a cópia não entra no plano", async () => {
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/nova.jpg`] });
    st.escritaAlheia = `proposal-draft:${PEDIDO}`;
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/nova.jpg`] });
    expect(st.estado[`proposal-draft:${PEDIDO}`].updated_at).toBe("2099-01-01T00:00:00Z");
    expect(plano().apagar).toEqual([]);
    expect(plano().trocas).toEqual([]);
  });

  it("voltou a ser referida entre as duas noites: na fase B fica, e sai do plano", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(plano().apagar).toHaveLength(1);
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/nova.jpg`] });
    const b = await juntarFotosDuplicadas(manifesto(), noite2);
    expect(st.apagados).toEqual([]);
    expect(b.apagadas).toBe(0);
    expect(plano().apagar).toEqual([]);
  });

  it("a cópia que fica desapareceu entre as duas noites: a outra não sai", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    entradas = entradas.filter((e) => !e.chave.endsWith("velha.jpg"));
    await juntarFotosDuplicadas(manifesto(), noite2);
    expect(st.apagados).toEqual([]);
  });

  it("uma leitura falhada não escreve nem apaga nada", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    st.tabelas.invoices = null;
    const b = await juntarFotosDuplicadas(manifesto(), noite2);
    expect(b.acabou).toBe(false);
    expect(st.apagados).toEqual([]);
    expect(plano().apagar).toHaveLength(1);
  });

  it("sem o manifesto completo não faz nada", async () => {
    const r = await juntarFotosDuplicadas(manifesto(false), noite1);
    expect(r.acabou).toBe(false);
    expect(st.estado[CHAVE]).toBeUndefined();
  });

  it("se o plano não grava, não reescreve rascunho nenhum", async () => {
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/nova.jpg`] });
    st.setStateFalha = true;
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/nova.jpg`] });
  });
});

describe("entre baldes: a cópia da Biblioteca é a que fica", () => {
  const T = `${TEMA}/f0f0.jpg`;

  it("o rascunho do pedido passa a `tema:` (na capa, na mesma posição) e a cópia da pasta sai", async () => {
    foto(`theme-assets/${T}`, "bbb", "2026-08-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/copia.jpg`, "bbb");
    rascunho(PEDIDO, { coverImages: [null, `${PEDIDO}/copia.jpg`] });
    await juntarFotosDuplicadas(manifesto(), noite1);
    expect(docDe(PEDIDO)).toEqual({ coverImages: [null, `tema:${T}`] });
    await juntarFotosDuplicadas(manifesto(), noite2);
    expect(st.apagados).toContain(`proposal-assets/${PEDIDO}/copia.jpg`);
    expect(st.apagados).not.toContain(`theme-assets/${T}`);
    expect(st.copiados).toContain(`proposal-medias/${PEDIDO}/copia.jpg -> theme-medias/${T}`);
    expect(st.copiados).toContain(`proposal-capas/${PEDIDO}/copia.jpg -> theme-capas/${T}`);
  });

  it("sem rascunho do próprio pedido a usá-la, a única cópia da pasta FICA (é a galeria do pedido)", async () => {
    foto(`theme-assets/${T}`, "bbb");
    foto(`proposal-assets/${PEDIDO}/copia.jpg`, "bbb");
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("um tema que já não existe não serve de cópia que fica", async () => {
    foto(`theme-assets/outro-tema/f0f0.jpg`, "bbb");
    foto(`proposal-assets/${PEDIDO}/copia.jpg`, "bbb");
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/copia.jpg`] });
    await duasNoites();
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/copia.jpg`] });
    expect(st.apagados).toEqual([]);
  });

  it("a Reciclagem da Biblioteca nunca é a cópia que fica", async () => {
    foto(`theme-assets/reciclagem/e1/f0f0.jpg`, "bbb");
    foto(`proposal-assets/${PEDIDO}/copia.jpg`, "bbb");
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/copia.jpg`] });
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("as cópias DENTRO da Biblioteca nunca saem (cada uma é a foto num tema)", async () => {
    st.tabelas.proposal_themes = [{ id: TEMA }, { id: "tema-2" }];
    foto(`theme-assets/${T}`, "ccc");
    foto(`theme-assets/tema-2/f0f0.jpg`, "ccc");
    await duasNoites();
    expect(st.apagados).toEqual([]);
  });

  it("pastas de pedidos DIFERENTES não se juntam uma na outra", async () => {
    foto(`proposal-assets/LIQ-A/x.jpg`, "ddd", "2026-01-01T00:00:00Z");
    foto(`proposal-assets/LIQ-B/y.jpg`, "ddd");
    rascunho("LIQ-B", { coverImages: [`LIQ-B/y.jpg`] });
    await duasNoites();
    expect(st.apagados).toEqual([]);
    expect(docDe("LIQ-B")).toEqual({ coverImages: [`LIQ-B/y.jpg`] });
  });
});

describe("a seco e o intervalo", () => {
  it("a seco devolve o plano e não escreve nada", async () => {
    foto(`proposal-assets/${PEDIDO}/a.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/b.jpg`, "aaa");
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/b.jpg`] });
    const r = await juntarFotosDuplicadas(manifesto(), noite1, { aSeco: true });
    expect(r).toMatchObject({ fase: "a-seco", copias: 1, trocas: 1 });
    expect(r.plano?.apagar).toHaveLength(1);
    expect(st.estado[CHAVE]).toBeUndefined();
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/b.jpg`] });
  });

  it("acabado um plano, só volta a calcular passados 7 dias", async () => {
    foto(`proposal-assets/${PEDIDO}/a.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/b.jpg`, "aaa");
    await duasNoites();
    expect((await juntarFotosDuplicadas(manifesto(), new Date("2026-11-16T03:00:00Z"))).fase).toBe(
      "nada",
    );
    expect((await juntarFotosDuplicadas(manifesto(), new Date("2026-11-22T03:00:00Z"))).fase).toBe(
      "A",
    );
  });

  it("uma cópia de segurança reposta com um caminho que já saiu é corrigida na fase A seguinte", async () => {
    foto(`proposal-assets/${PEDIDO}/a.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/b.jpg`, "aaa");
    await duasNoites();
    entradas = entradas.filter((e) => !e.chave.endsWith("/b.jpg"));
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/b.jpg`] });
    await juntarFotosDuplicadas(manifesto(), new Date("2026-11-22T03:00:00Z"));
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/a.jpg`] });
  });
});

describe("depois de uma cópia sair (revisão do #451)", () => {
  const agoraReal = () => new Date().toISOString();
  beforeEach(() => {
    foto(`proposal-assets/${PEDIDO}/a.jpg`, "aaa", "2026-09-01T00:00:00Z");
    foto(`proposal-assets/${PEDIDO}/b.jpg`, "aaa");
  });

  it("um rascunho que volte a escrever o caminho apagado é corrigido NA NOITE SEGUINTE (não daqui a 7 dias)", async () => {
    await duasNoites();
    expect(st.apagados).toContain(`proposal-assets/${PEDIDO}/b.jpg`);
    entradas = entradas.filter((e) => !e.chave.endsWith("/b.jpg"));
    // Um separador antigo grava por cima, com o caminho que já saiu.
    st.estado[`proposal-draft:${PEDIDO}`] = {
      value: { doc: { coverImages: [`${PEDIDO}/b.jpg`] }, updatedAt: "velho" },
      updated_at: agoraReal(),
    };
    const r = await juntarFotosDuplicadas(manifesto(), new Date("2026-11-16T03:00:00Z"));
    expect(r.fase).toBe("nada");
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/a.jpg`] });
    const v = st.estado[`proposal-draft:${PEDIDO}`].value as { updatedAt: string };
    expect(v.updatedAt).not.toBe("velho");
  });

  it("passados 60 dias deixa de vigiar", async () => {
    await duasNoites();
    entradas = entradas.filter((e) => !e.chave.endsWith("/b.jpg"));
    st.estado[`proposal-draft:${PEDIDO}`] = {
      value: { doc: { coverImages: [`${PEDIDO}/b.jpg`] }, updatedAt: "velho" },
      updated_at: agoraReal(),
    };
    const muitoDepois = new Date(Date.now() + 61 * 24 * 60 * 60_000);
    // Dentro dos 7 dias da Fase A não conta aqui: forçamos um plano recente.
    plano().faseA = muitoDepois.toISOString();
    st.estado[CHAVE].value = plano();
    await juntarFotosDuplicadas(manifesto(), muitoDepois);
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/b.jpg`] });
  });

  it("a corrida da Fase B: um rascunho gravado entre a leitura e o `remove` segura a cópia", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    st.depoisDeLer = () => {
      st.depoisDeLer = null;
      st.estado[`proposal-draft:${PEDIDO}`] = {
        value: { doc: { coverImages: [`${PEDIDO}/b.jpg`] }, updatedAt: "x" },
        updated_at: agoraReal(),
      };
    };
    const b = await juntarFotosDuplicadas(manifesto(), noite2);
    expect(b.apagadas).toBe(0);
    expect(st.apagados).toEqual([]);
  });

  it("uma proposta gravada entre a leitura e o `remove` também segura a cópia", async () => {
    await juntarFotosDuplicadas(manifesto(), noite1);
    st.depoisDeLer = () => {
      st.depoisDeLer = null;
      st.tabelas.proposals = [
        { id: "p9", doc: { capa: `${PEDIDO}/b.jpg` }, updated_at: agoraReal() },
      ];
    };
    await juntarFotosDuplicadas(manifesto(), noite2);
    expect(st.apagados).toEqual([]);
  });

  it("um tema ARQUIVADO não serve de cópia que fica", async () => {
    entradas = [];
    st.tabelas.proposal_themes = [{ id: TEMA, arquivado: true }];
    foto(`theme-assets/${TEMA}/f0f0.jpg`, "bbb");
    foto(`proposal-assets/${PEDIDO}/copia.jpg`, "bbb");
    rascunho(PEDIDO, { coverImages: [`${PEDIDO}/copia.jpg`] });
    await duasNoites();
    expect(docDe(PEDIDO)).toEqual({ coverImages: [`${PEDIDO}/copia.jpg`] });
    expect(st.apagados).toEqual([]);
  });
});
