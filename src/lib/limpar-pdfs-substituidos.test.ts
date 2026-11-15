import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
type F = { id: string; name: string; created_at: string; metadata: { size: number } };
const st = vi.hoisted(() => ({
  pastas: {} as Record<string, F[]>,
  conteudo: {} as Record<string, string>,
  tabelas: {} as Record<string, unknown[] | null>,
  estado: {} as Record<string, unknown>,
  apagados: [] as string[],
  descarregados: [] as string[],
  /** Os baldes a que a limpeza pediu alguma coisa. */
  baldes: [] as string[],
  /** Pastas cuja listagem falha. */
  listaFalha: new Set<string>(),
  /** Chamado mesmo antes da releitura de `proposals` (`.in("id", …)`). */
  antesDaReleitura: null as null | (() => void),
  releituraFalha: false,
  /** Idas ao Supabase (Storage, tabelas, estado), pela ordem. */
  idas: [] as string[],
  /** Latência simulada por ida, em ms (só com relógio falso). */
  lat: { ida: 0, descarga: 0 },
}));
/** Cada ida espera a latência simulada (nada, fora do teste do tempo). */
const ida = async (o: string, ms = st.lat.ida) => {
  st.idas.push(o);
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
};
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => {
    await ida("estado:ler");
    return st.estado[k] ?? null;
  }),
  setState: vi.fn(async (k: string, v: unknown) => {
    await ida("estado:gravar");
    st.estado[k] = structuredClone(v);
    return { gravado: true, duradouro: true, onde: "supabase" };
  }),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (balde: string) => {
        st.baldes.push(balde);
        return {
          // Como o Storage: devolve no máximo o `limit` (100 por omissão), a
          // partir do `offset`.
          list: async (pasta: string, o?: { limit?: number; offset?: number }) => {
            await ida(`listar:${pasta}`);
            if (st.listaFalha.has(pasta)) return { data: null, error: { message: "falhou" } };
            const todas =
              pasta === ""
                ? Object.keys(st.pastas).map((n) => ({ id: null, name: n }))
                : (st.pastas[pasta] ?? []);
            const desde = o?.offset ?? 0;
            return {
              data: todas.slice(desde, desde + Math.min(o?.limit ?? 100, 1000)),
              error: null,
            };
          },
          download: async (caminho: string) => {
            await ida(`descarregar:${caminho}`, st.lat.descarga);
            st.descarregados.push(caminho);
            const t = st.conteudo[caminho] ?? "?";
            const bytes = new TextEncoder().encode(t);
            return { data: { arrayBuffer: async () => bytes.buffer }, error: null };
          },
          remove: async (caminhos: string[]) => {
            await ida(`apagar:${caminhos.length}`);
            st.apagados.push(...caminhos);
            for (const c of caminhos) {
              const [pasta, nome] = c.split("/");
              st.pastas[pasta] = (st.pastas[pasta] ?? []).filter((f) => f.name !== nome);
            }
            return { data: caminhos.map((name) => ({ name })), error: null };
          },
        };
      },
    },
    from: (tabela: string) => ({
      // Como o PostgREST: `order`/`range`, e NUNCA mais de 1000 por resposta.
      select: () => {
        let desde = 0;
        let ate = Infinity;
        let soIds: string[] | null = null;
        const b = {
          order: () => b,
          in(_coluna: string, valores: string[]) {
            soIds = valores;
            st.antesDaReleitura?.();
            return b;
          },
          range(d: number, a: number) {
            desde = d;
            ate = a;
            return b;
          },
          async then(resolve: (v: unknown) => unknown) {
            await ida(soIds ? `reler:${tabela}` : `tabela:${tabela}`);
            if (soIds) {
              if (st.releituraFalha) return resolve({ data: null, error: { message: "falhou" } });
              const ids = soIds;
              const linhas = (st.tabelas[tabela] ?? []) as { id: string }[];
              return resolve({ data: linhas.filter((l) => ids.includes(l.id)), error: null });
            }
            if (st.tabelas[tabela] === null) {
              return resolve({ data: null, error: { message: "falhou" } });
            }
            const todas = [
              ...(st.tabelas[tabela] ?? []),
              ...(tabela === "app_state"
                ? Object.entries(st.estado).map(([key, value]) => ({ key, value }))
                : []),
            ];
            const fim = Math.min(ate + 1, desde + 1000);
            return resolve({ data: todas.slice(desde, fim), error: null });
          },
        };
        return b;
      },
    }),
  }),
}));

import { log } from "@/lib/logger";
import { BUCKET_DO_ARQUIVO } from "@/lib/arquivo-de-pdfs/protegidos";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import {
  CHAVE,
  DESCARGAS_POR_NOITE,
  POR_NOITE,
  limparPdfsSubstituidos,
} from "./limpar-pdfs-substituidos";

const dia1 = new Date("2026-11-11T03:00:00Z");
const DIA = 24 * 60 * 60_000;
/** A noite `n` (0 = dia1), à mesma hora. */
const noite = (n: number) => new Date(dia1.getTime() + n * DIA);
/** Todas as noites, da `de` à `ate` (inclusive), sem falhar nenhuma. */
async function noites(de: number, ate: number) {
  let r: Awaited<ReturnType<typeof limparPdfsSubstituidos>> | null = null;
  for (let n = de; n <= ate; n++) r = await limparPdfsSubstituidos(noite(n));
  return r!;
}
/** Os ficheiros na lista de espera. */
const espera = () =>
  Object.keys((st.estado[CHAVE] as { espera?: object } | undefined)?.espera ?? {});
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const pdf = (name: string, quando: string, texto: string, pasta: string): F => {
  st.conteudo[`${pasta}/${name}`] = texto;
  return { id: name, name, created_at: quando, metadata: { size: texto.length } };
};

describe("os PDF de proposta substituídos (10/11)", () => {
  beforeEach(() => {
    st.apagados = [];
    st.descarregados = [];
    st.baldes = [];
    st.listaFalha = new Set();
    st.antesDaReleitura = null;
    st.releituraFalha = false;
    st.idas = [];
    st.lat = { ida: 0, descarga: 0 };
    vi.mocked(log.warn).mockClear();
    st.estado = {};
    st.conteudo = {};
    st.pastas = {
      // Revista e reenviada: o de agosto ficou para trás.
      "prop-viva": [
        pdf("k7Qvelho.pdf", "2026-08-24T10:00:00Z", "versao-1", "prop-viva"),
        pdf("k7Qatual.pdf", "2026-09-02T10:00:00Z", "versao-2", "prop-viva"),
      ],
      // Aceite: o aceite é o MAIS ANTIGO (redesenhou-se depois). Fica.
      "prop-aceite": [
        pdf("k7Qassinado.pdf", "2026-08-20T10:00:00Z", "o-que-ela-assinou", "prop-aceite"),
        pdf("k7Qrascunho.pdf", "2026-08-22T10:00:00Z", "outra-coisa", "prop-aceite"),
        pdf("k7Qultimo.pdf", "2026-08-27T10:00:00Z", "o-mais-recente", "prop-aceite"),
      ],
      // Contrato sem selo: não se sabe qual foi — fica tudo.
      "prop-sem-selo": [
        pdf("k7Qa.pdf", "2026-08-20T10:00:00Z", "x1", "prop-sem-selo"),
        pdf("k7Qb.pdf", "2026-08-27T10:00:00Z", "x2", "prop-sem-selo"),
      ],
      // A proposta já não existe: sai tudo.
      "prop-apagada": [pdf("k7Qso.pdf", "2026-08-25T10:00:00Z", "y", "prop-apagada")],
      // Apagada mas na Reciclagem: o mais recente fica.
      "prop-na-reciclagem": [pdf("k7Qr.pdf", "2026-08-25T10:00:00Z", "z", "prop-na-reciclagem")],
      // Recente: ainda não.
      "prop-recente": [
        pdf("k7Qn1.pdf", "2026-10-30T10:00:00Z", "n1", "prop-recente"),
        pdf("k7Qn2.pdf", "2026-11-01T10:00:00Z", "n2", "prop-recente"),
      ],
    };
    st.tabelas = {
      proposals: [
        { id: "prop-viva", pdf_sha256: sha("versao-2"), pdf_bytes: 8 },
        { id: "prop-aceite", pdf_sha256: sha("o-mais-recente"), pdf_bytes: 14 },
        { id: "prop-sem-selo", pdf_sha256: null, pdf_bytes: null },
        { id: "prop-recente", pdf_sha256: null, pdf_bytes: null },
      ],
      contracts: [
        {
          proposal_id: "prop-aceite",
          proposta_pdf_sha256: sha("o-que-ela-assinou"),
          proposta_pdf_bytes: 17,
        },
        { proposal_id: "prop-sem-selo", proposta_pdf_sha256: null, proposta_pdf_bytes: null },
      ],
      reciclagem: [{ origem_id: "prop-na-reciclagem" }],
    };
  });

  it("na primeira noite não apaga nada: só põe em espera os substituídos", async () => {
    const r = await limparPdfsSubstituidos(dia1);
    expect(st.apagados).toEqual([]);
    expect(espera().sort()).toEqual([
      "prop-aceite/k7Qrascunho.pdf",
      "prop-apagada/k7Qso.pdf",
      "prop-viva/k7Qvelho.pdf",
    ]);
    expect(r).toMatchObject({ candidatos: 3, apagados: 0, acabou: true });
  });

  it("com mais de 1000 propostas, o contrato da linha 1001 continua a guardar o PDF assinado (revisão 13/11, n.º 8)", async () => {
    const muitas = Array.from({ length: 1200 }, (_, i) => ({
      id: `outra-${String(i).padStart(4, "0")}`,
      pdf_sha256: null,
      pdf_bytes: null,
    }));
    st.tabelas.proposals = [...muitas, ...(st.tabelas.proposals as object[])];
    st.tabelas.contracts = [
      ...Array.from({ length: 1200 }, (_, i) => ({
        proposal_id: `outra-${i}`,
        proposta_pdf_sha256: sha(`o${i}`),
        proposta_pdf_bytes: 1,
      })),
      ...(st.tabelas.contracts as object[]),
    ];
    await limparPdfsSubstituidos(dia1);
    const emEspera = espera();
    // O assinado, o enviado e o da proposta viva nunca entram na espera.
    expect(emEspera).not.toContain("prop-aceite/k7Qassinado.pdf");
    expect(emEspera).not.toContain("prop-viva/k7Qatual.pdf");
  });

  it("passados 7 dias saem — e o aceite, mesmo sendo mais antigo, fica", async () => {
    await noites(0, 8);
    expect(st.apagados.sort()).toEqual([
      "prop-aceite/k7Qrascunho.pdf",
      "prop-apagada/k7Qso.pdf",
      "prop-viva/k7Qvelho.pdf",
    ]);
    expect(st.apagados).not.toContain("prop-aceite/k7Qassinado.pdf");
    expect(espera()).toEqual([]);
  });

  it("só descarrega para comparar quando o tamanho coincide com o de um selado", async () => {
    await limparPdfsSubstituidos(dia1);
    // O aceite (17 bytes) descarrega-se; o rascunho (11) e o velho (8 = o
    // tamanho do enviado!) — o velho coincide no tamanho e descarrega-se.
    expect(st.descarregados.sort()).toEqual([
      "prop-aceite/k7Qassinado.pdf",
      "prop-viva/k7Qvelho.pdf",
    ]);
  });

  it("um PDF mencionado numa tabela fica", async () => {
    st.tabelas.tasks = [{ nota: "o casal pediu o velho de novo: k7Qvelho" }];
    await limparPdfsSubstituidos(dia1);
    expect(espera()).not.toContain("prop-viva/k7Qvelho.pdf");
  });

  it("uma proposta apagada mas mencionada (um resgate) guarda a pasta", async () => {
    st.tabelas.app_state = [{ key: "resgate:x", value: { proposta: "prop-apagada" } }];
    await limparPdfsSubstituidos(dia1);
    expect(espera()).not.toContain("prop-apagada/k7Qso.pdf");
  });

  it("os índices das fotografias (`foto-resumo:`, `foto-visual:`) não são menções", async () => {
    st.tabelas.app_state = [
      { key: "foto-visual:07", value: { "prop-apagada/foto.jpg": "f".repeat(86) } },
      { key: "foto-resumo:" + "b".repeat(32), value: ["prop-apagada/outra.jpg"] },
    ];
    await limparPdfsSubstituidos(dia1);
    expect(espera()).toContain("prop-apagada/k7Qso.pdf");
  });

  it("se uma leitura falha, não apaga nem mexe na espera", async () => {
    await noites(0, 6);
    st.tabelas.contracts = null;
    const r = await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).toEqual([]);
    expect(espera()).toHaveLength(3);
    expect(r.acabou).toBe(false);
  });

  it("um ficheiro com o mesmo conteúdo do aceite fica, mesmo com outro nome", async () => {
    st.conteudo["prop-aceite/k7Qassinado.pdf"] = "o-que-ela-assinou";
    // Faz o rascunho ter o tamanho do aceite, e a descarga devolver o aceite:
    // é o mesmo ficheiro — fica.
    st.pastas["prop-aceite"][1].metadata.size = 17;
    st.conteudo["prop-aceite/k7Qrascunho.pdf"] = "o-que-ela-assinou";
    await limparPdfsSubstituidos(dia1);
    expect(espera()).not.toContain("prop-aceite/k7Qrascunho.pdf");
  });

  it("os ponteiros para uma proposta apagada (link curto, cópia do email, aquecimento, proposta web) não guardam a pasta (14/11)", async () => {
    // Era assim em produção: 12 PDF de 9 propostas apagadas, presos só por isto.
    st.tabelas.app_state = [
      { key: "ligacao-proposta:gfedy692gzm0", value: { propostaId: "prop-apagada" } },
      { key: "ligacao-de-proposta:prop-apagada", value: { codigo: "gfedy692gzm0" } },
      {
        key: "envio-de-proposta:LIQ-X",
        value: { envios: [{ propostaId: "prop-apagada", anexo: { nome: "p.pdf", bytes: 1 } }] },
      },
      { key: "aquecimento-pdf:estado", value: { feitas: { "prop-apagada": "k7Qso" } } },
      { key: "proposta-web:retrato:prop-apagada:abc", value: { proposta: "prop-apagada" } },
    ];
    await limparPdfsSubstituidos(dia1);
    expect(espera()).toContain("prop-apagada/k7Qso.pdf");
  });

  it("o ensaio lista o que sairia e soma os bytes, sem gravar a espera nem apagar", async () => {
    const r1 = await limparPdfsSubstituidos(dia1, 8_000, { ensaio: true });
    expect(st.estado[CHAVE]).toBeUndefined();
    expect(st.apagados).toEqual([]);
    expect(r1.lista?.map((f) => f.caminho).sort()).toEqual([
      "prop-aceite/k7Qrascunho.pdf",
      "prop-apagada/k7Qso.pdf",
      "prop-viva/k7Qvelho.pdf",
    ]);
    // 11 + 1 + 8 bytes; nenhum cumpriu ainda a espera.
    expect(r1.bytes).toBe(20);
    expect(r1.lista?.every((f) => !f.saiaHoje)).toBe(true);

    // Com a espera já gravada por uma noite a sério, o ensaio diz que saíam.
    await noites(0, 6);
    const r9 = await limparPdfsSubstituidos(noite(7), 8_000, { ensaio: true });
    expect(st.apagados).toEqual([]);
    expect(r9.lista?.every((f) => f.saiaHoje)).toBe(true);
    expect(espera()).toHaveLength(3);
  });

  // ── O que um casal ainda pode abrir (revisão de 15/11) ───────────────────

  it("o PDF do documento ATUAL fica, mesmo quando não é o mais recente (o link, a página online e o back office servem-no)", async () => {
    // Ela reviu (v2) e voltou atrás (v1): a chave é o conteúdo e o upload não
    // reescreve, portanto o ficheiro da v1 continua com a data de agosto.
    const doc = { clientNames: "Ana & João", versao: 1 } as unknown as ProposalDoc;
    const atual = `${chaveDoPdf(doc, "pt")}.pdf`;
    st.pastas["prop-voltou"] = [
      pdf(atual, "2026-08-10T10:00:00Z", "v1-desenhada", "prop-voltou"),
      pdf("k7Qv2.pdf", "2026-08-20T10:00:00Z", "v2-desenhada", "prop-voltou"),
    ];
    (st.tabelas.proposals as object[]).push({
      id: "prop-voltou",
      pdf_sha256: null,
      pdf_bytes: null,
      doc,
      idioma: "pt",
    });
    // Os ponteiros dela também lá estão — mas já não contam como menção: o
    // que a guarda tem de ser o documento atual.
    st.tabelas.app_state = [
      { key: "ligacao-de-proposta:prop-voltou", value: { codigo: "x" } },
      { key: "aquecimento-pdf:estado", value: { feitas: { "prop-voltou": atual } } },
      { key: "proposta-web:retrato:prop-voltou:abc", value: { json: "{}" } },
    ];
    await noites(0, 8);
    expect(st.apagados).not.toContain(`prop-voltou/${atual}`);
  });

  it("o PDF ENVIADO (`proposals.pdf_sha256`) fica, mesmo mais antigo do que outro desenhado depois", async () => {
    st.pastas["prop-enviada"] = [
      pdf("k7Qenviado.pdf", "2026-08-10T10:00:00Z", "o-que-seguiu", "prop-enviada"),
      pdf("k7Qdepois.pdf", "2026-08-20T10:00:00Z", "visto-no-estudio", "prop-enviada"),
    ];
    (st.tabelas.proposals as object[]).push({
      id: "prop-enviada",
      pdf_sha256: sha("o-que-seguiu"),
      pdf_bytes: 12,
    });
    await noites(0, 8);
    expect(st.apagados).not.toContain("prop-enviada/k7Qenviado.pdf");
  });

  it("uma proposta na Reciclagem guarda a pasta INTEIRA — pode voltar, com o PDF enviado", async () => {
    st.pastas["prop-na-reciclagem"] = [
      pdf("k7Qenviado.pdf", "2026-08-10T10:00:00Z", "enviado", "prop-na-reciclagem"),
      pdf("k7Qr.pdf", "2026-08-25T10:00:00Z", "z", "prop-na-reciclagem"),
    ];
    await noites(0, 8);
    expect(st.apagados.filter((c) => c.startsWith("prop-na-reciclagem/"))).toEqual([]);
  });

  it("o aceite de um contrato sem `proposal_id` fica, em qualquer pasta", async () => {
    (st.tabelas.contracts as object[]).push({
      proposal_id: null,
      proposta_pdf_sha256: sha("versao-1"),
      proposta_pdf_bytes: 8,
    });
    await noites(0, 8);
    expect(st.apagados).not.toContain("prop-viva/k7Qvelho.pdf");
  });

  it("uma proposta cujo id leva caracteres que a pasta tira continua a existir (não se apaga o atual)", async () => {
    // `proposal-pdf-guardado.ts` guarda em `<id sem [^a-zA-Z0-9_-]>/…`.
    st.pastas["propcomponto"] = [
      pdf("k7Qantigo.pdf", "2026-08-10T10:00:00Z", "a", "propcomponto"),
      pdf("k7Qunico.pdf", "2026-08-20T10:00:00Z", "b", "propcomponto"),
    ];
    (st.tabelas.proposals as object[]).push({
      id: "prop.com.ponto",
      pdf_sha256: null,
      pdf_bytes: null,
    });
    await noites(0, 8);
    expect(st.apagados).not.toContain("propcomponto/k7Qunico.pdf");
  });

  it("com mais de 1000 pastas, a 1001.ª também é vista (o Storage lista às páginas)", async () => {
    for (let i = 0; i < 1100; i++) st.pastas[`a-${String(i).padStart(4, "0")}`] = [];
    // Como o Storage, por nome: «z-…» fica para a segunda página.
    st.pastas["z-apagada"] = [pdf("k7Qz.pdf", "2026-08-10T10:00:00Z", "zz", "z-apagada")];
    await limparPdfsSubstituidos(dia1);
    expect(espera()).toContain("z-apagada/k7Qz.pdf");
  });

  it("numa pasta com mais de 1000 PDF, o mais recente (na 2.ª página) fica e os de trás são vistos", async () => {
    const muitos: F[] = [];
    for (let i = 0; i < 1001; i++) {
      const n = `k7Q${String(i).padStart(5, "0")}.pdf`;
      // O mais recente é o último por nome — só aparece na segunda página.
      const quando = new Date(Date.parse("2026-07-01T00:00:00Z") + i * 60_000).toISOString();
      muitos.push(pdf(n, quando, `m${i}`, "prop-viva"));
    }
    st.pastas["prop-viva"] = muitos;
    st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).map((p) =>
      p.id === "prop-viva" ? { ...p, pdf_sha256: null, pdf_bytes: null } : p,
    );
    await limparPdfsSubstituidos(dia1);
    const emEspera = espera();
    expect(emEspera).not.toContain("prop-viva/k7Q01000.pdf");
    expect(emEspera).toContain("prop-viva/k7Q00999.pdf");
    expect(emEspera.filter((c) => c.startsWith("prop-viva/"))).toHaveLength(1000);
  });

  it("se a listagem da raiz falha, não apaga nem mexe na espera", async () => {
    await noites(0, 6);
    st.listaFalha.add("");
    const r = await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).toEqual([]);
    expect(espera()).toHaveLength(3);
    expect(r.acabou).toBe(false);
  });

  it("se a listagem de uma pasta falha, nada dessa pasta sai", async () => {
    await noites(0, 6);
    st.listaFalha.add("prop-apagada");
    await limparPdfsSubstituidos(noite(7));
    expect(st.apagados.filter((c) => c.startsWith("prop-apagada/"))).toEqual([]);
  });

  it("se a leitura das menções falha (porta 4), não apaga nada", async () => {
    await noites(0, 6);
    st.tabelas.tasks = null;
    const r = await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).toEqual([]);
    expect(r.acabou).toBe(false);
  });

  it("só fala com o balde `proposal-pdfs` — nunca com o arquivo nem com outro", async () => {
    await noites(0, 8);
    expect(st.apagados.length).toBeGreaterThan(0);
    expect(new Set(st.baldes)).toEqual(new Set(["proposal-pdfs"]));
    expect(st.baldes).not.toContain(BUCKET_DO_ARQUIVO);
  });

  it("só apaga caminhos `<pasta>/<chave>.pdf`", async () => {
    st.pastas["prop-apagada"].push(
      pdf("nome com espaço.pdf", "2026-08-10T10:00:00Z", "w", "prop-apagada"),
    );
    await noites(0, 8);
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
    expect(st.apagados).not.toContain("prop-apagada/nome com espaço.pdf");
  });

  it(`no máximo ${POR_NOITE} por noite`, async () => {
    st.pastas["prop-apagada"] = Array.from({ length: 15 }, (_, i) =>
      pdf(`k7Qx${i}.pdf`, "2026-08-10T10:00:00Z", `x${i}`, "prop-apagada"),
    );
    await noites(0, 7);
    expect(st.apagados).toHaveLength(POR_NOITE);
  });

  it(`no máximo ${DESCARGAS_POR_NOITE} descargas por noite — o que não se provou fica`, async () => {
    // 30 PDF com o tamanho do enviado: cada um teria de se descarregar.
    st.pastas["prop-viva"] = [
      ...Array.from({ length: 30 }, (_, i) =>
        pdf(
          `k7Qd${String(i).padStart(2, "0")}.pdf`,
          "2026-08-01T10:00:00Z",
          `d-${String(i).padStart(4, "0")}`,
          "prop-viva",
        ),
      ),
      pdf("k7Qatual.pdf", "2026-09-02T10:00:00Z", "versao-2", "prop-viva"),
    ];
    st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).map((p) =>
      p.id === "prop-viva" ? { ...p, pdf_sha256: sha("versao-2"), pdf_bytes: 6 } : p,
    );
    await limparPdfsSubstituidos(dia1);
    expect(st.descarregados.filter((c) => c.startsWith("prop-viva/"))).toHaveLength(
      DESCARGAS_POR_NOITE,
    );
    const emEspera = espera().filter((c) => c.startsWith("prop-viva/"));
    expect(emEspera).toHaveLength(DESCARGAS_POR_NOITE);
  });
  // ── Revisão independente de 15/11 ─────────────────────────────────────────

  it("n.º 1 — a Reciclagem guarda a pasta mesmo quando o id leva caracteres que a pasta tira (só a proteção a salva)", async () => {
    // A linha da Reciclagem diz «prop-na.reciclagem»; a pasta é
    // «prop-nareciclagem». A menção (porta 4) não a encontra no texto.
    st.tabelas.reciclagem = [{ origem_id: "prop-na.reciclagem" }];
    st.pastas["prop-nareciclagem"] = [
      pdf("k7Qenviado.pdf", "2026-08-10T10:00:00Z", "enviado", "prop-nareciclagem"),
      pdf("k7Qr.pdf", "2026-08-25T10:00:00Z", "z", "prop-nareciclagem"),
    ];
    await noites(0, 8);
    expect(espera().filter((c) => c.startsWith("prop-nareciclagem/"))).toEqual([]);
    expect(st.apagados.filter((c) => c.startsWith("prop-nareciclagem/"))).toEqual([]);
  });

  it("n.º 2 — um PDF selado sem `bytes` descarrega-se UMA vez: na segunda noite, zero descargas desse caminho", async () => {
    // O selo do enviado sem `pdf_bytes`: todos os PDF da pasta «podem ser» ele.
    st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).map((p) =>
      p.id === "prop-viva" ? { ...p, pdf_bytes: null } : p,
    );
    await limparPdfsSubstituidos(noite(0));
    expect(st.descarregados).toContain("prop-viva/k7Qvelho.pdf");
    const comparados = (st.estado[CHAVE] as { comparados: Record<string, { sha: string }> })
      .comparados;
    expect(comparados["prop-viva/k7Qvelho.pdf"].sha).toBe(sha("versao-1"));

    st.descarregados = [];
    await limparPdfsSubstituidos(noite(1));
    expect(st.descarregados).toEqual([]);
    expect(espera()).toContain("prop-viva/k7Qvelho.pdf");

    // E guarda-se o hash, não «diferente»: um selo que apareça depois (um
    // contrato que aceitou essa versão) continua a ser apanhado — sem descarga.
    (st.tabelas.contracts as object[]).push({
      proposal_id: "prop-viva",
      proposta_pdf_sha256: sha("versao-1"),
      proposta_pdf_bytes: null,
    });
    await noites(2, 9);
    expect(st.descarregados).toEqual([]);
    expect(st.apagados).not.toContain("prop-viva/k7Qvelho.pdf");
  });

  it("n.º 2 — um ficheiro apagado e desenhado de novo no mesmo caminho volta a descarregar-se", async () => {
    st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).map((p) =>
      p.id === "prop-viva" ? { ...p, pdf_bytes: null } : p,
    );
    await limparPdfsSubstituidos(noite(0));
    // Outra data de criação: já não é o ficheiro que se comparou.
    st.pastas["prop-viva"][0].created_at = "2026-08-26T10:00:00Z";
    st.descarregados = [];
    await limparPdfsSubstituidos(noite(1));
    expect(st.descarregados).toContain("prop-viva/k7Qvelho.pdf");
  });

  it("n.º 3 — se ela voltar o documento atrás entre a leitura e o `remove`, o ficheiro que passou a ser o atual fica", async () => {
    const velho = { clientNames: "Ana & João", versao: 1 } as unknown as ProposalDoc;
    const novo = { clientNames: "Ana & João", versao: 2 } as unknown as ProposalDoc;
    const doVelho = `${chaveDoPdf(velho, "pt")}.pdf`;
    st.pastas["prop-voltou"] = [
      pdf(doVelho, "2026-08-10T10:00:00Z", "v1-desenhada", "prop-voltou"),
      pdf(`${chaveDoPdf(novo, "pt")}.pdf`, "2026-08-20T10:00:00Z", "v2", "prop-voltou"),
    ];
    const linha = { id: "prop-voltou", pdf_sha256: null, pdf_bytes: null, doc: novo, idioma: "pt" };
    (st.tabelas.proposals as object[]).push(linha);
    await noites(0, 6);
    expect(espera()).toContain(`prop-voltou/${doVelho}`);
    // Na noite em que sairia, ela volta à v1 mesmo antes do `remove`.
    st.antesDaReleitura = () => {
      linha.doc = velho;
    };
    const r = await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).not.toContain(`prop-voltou/${doVelho}`);
    // O resto do lote saiu na mesma.
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
    expect(r.acabou).toBe(true);
    expect(st.idas.filter((i) => i.startsWith("reler:"))).toEqual(["reler:proposals"]);
  });

  it("n.º 3 — uma proposta apagada (ou para a Reciclagem) entre a leitura e o `remove` guarda a pasta", async () => {
    await noites(0, 6);
    st.antesDaReleitura = () => {
      st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).filter(
        (p) => p.id !== "prop-viva",
      );
    };
    await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).not.toContain("prop-viva/k7Qvelho.pdf");
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
  });

  it("n.º 3 — se a releitura falha, nada se apaga e a noite fica registada", async () => {
    await noites(0, 6);
    st.releituraFalha = true;
    const r = await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).toEqual([]);
    expect(r.acabou).toBe(false);
    expect(espera()).toHaveLength(3);
    expect((st.estado[CHAVE] as { ultimaNoite: { acabou: boolean } }).ultimaNoite.acabou).toBe(
      false,
    );
  });

  it("n.º 4 — com noites falhadas pelo meio, a contagem dos 7 dias recomeça", async () => {
    await limparPdfsSubstituidos(noite(0));
    expect(espera()).toHaveLength(3);
    // Seis noites a falhar: ninguém viu se os ficheiros continuaram candidatos.
    st.tabelas.contracts = null;
    for (let n = 1; n <= 6; n++) await limparPdfsSubstituidos(noite(n));
    st.tabelas.contracts = [
      {
        proposal_id: "prop-aceite",
        proposta_pdf_sha256: sha("o-que-ela-assinou"),
        proposta_pdf_bytes: 17,
      },
      { proposal_id: "prop-sem-selo", proposta_pdf_sha256: null, proposta_pdf_bytes: null },
    ];
    // Sete dias depois da primeira vez — mas a espera não foi contínua.
    await limparPdfsSubstituidos(noite(7));
    expect(st.apagados).toEqual([]);
    const e = (st.estado[CHAVE] as { espera: Record<string, { desde: string }> }).espera;
    expect(e["prop-apagada/k7Qso.pdf"].desde).toBe(noite(7).toISOString());
    // E, a partir daí, sete noites seguidas — e sai.
    await noites(8, 14);
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
  });

  it("n.º 4 — um ficheiro que deixou de ser candidato e voltou a sê-lo recomeça a contar", async () => {
    await noites(0, 3);
    // Uma noite em que é mencionado (deixa de ser candidato)…
    st.tabelas.tasks = [{ nota: "k7Qso" }];
    await limparPdfsSubstituidos(noite(4));
    expect(espera()).not.toContain("prop-apagada/k7Qso.pdf");
    // …e volta a ser.
    st.tabelas.tasks = [];
    await noites(5, 10);
    expect(st.apagados).not.toContain("prop-apagada/k7Qso.pdf");
    await noites(11, 12);
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
  });

  it("n.º 4 — o formato antigo da espera (só a data) recomeça a contar em vez de apagar", async () => {
    st.estado[CHAVE] = { "prop-apagada/k7Qso.pdf": "2026-10-01T03:00:00Z" };
    await limparPdfsSubstituidos(noite(0));
    expect(st.apagados).toEqual([]);
    const e = (st.estado[CHAVE] as { espera: Record<string, { desde: string }> }).espera;
    expect(e["prop-apagada/k7Qso.pdf"].desde).toBe(noite(0).toISOString());
  });

  it("n.º 5 — o ensaio só marca «sai hoje» o que a limpeza a sério apagaria (caminho, tecto por noite)", async () => {
    st.pastas["prop-apagada"] = [
      ...Array.from({ length: 15 }, (_, i) =>
        pdf(
          `k7Qx${String(i).padStart(2, "0")}.pdf`,
          "2026-08-10T10:00:00Z",
          `x${i}`,
          "prop-apagada",
        ),
      ),
      pdf("nome com espaço.pdf", "2026-08-10T10:00:00Z", "w", "prop-apagada"),
    ];
    await noites(0, 6);
    const ensaio = await limparPdfsSubstituidos(noite(7), 8_000, { ensaio: true });
    const hoje = ensaio.lista!.filter((f) => f.saiaHoje).map((f) => f.caminho);
    expect(hoje).toHaveLength(POR_NOITE);
    expect(hoje).not.toContain("prop-apagada/nome com espaço.pdf");
    expect(st.apagados).toEqual([]);
    // E é exatamente o que a noite a sério leva.
    await limparPdfsSubstituidos(noite(7));
    expect(st.apagados.sort()).toEqual(hoje.sort());
  });

  it("n.º 5 — o ensaio também relê: o que passou a ser o atual não «sai hoje»", async () => {
    const velho = { clientNames: "Rita", versao: 1 } as unknown as ProposalDoc;
    const doVelho = `${chaveDoPdf(velho, "pt")}.pdf`;
    st.pastas["prop-voltou"] = [
      pdf(doVelho, "2026-08-10T10:00:00Z", "v1", "prop-voltou"),
      pdf("k7Qv2.pdf", "2026-08-20T10:00:00Z", "v2-desenhada", "prop-voltou"),
    ];
    const linha = { id: "prop-voltou", pdf_sha256: null, pdf_bytes: null, doc: null as unknown };
    (st.tabelas.proposals as object[]).push(linha);
    await noites(0, 6);
    st.antesDaReleitura = () => {
      linha.doc = velho;
    };
    const ensaio = await limparPdfsSubstituidos(noite(7), 8_000, { ensaio: true });
    expect(ensaio.lista!.find((f) => f.caminho === `prop-voltou/${doVelho}`)?.saiaHoje).toBe(false);
  });

  it("n.º 6 — sem tempo, pára sem apagar, regista onde parou (estado e `log.warn`) e a noite seguinte continua de onde ficou", async () => {
    // 30 PDF do tamanho do enviado: 20 descargas na primeira noite.
    st.pastas["prop-viva"] = [
      ...Array.from({ length: 30 }, (_, i) =>
        pdf(
          `k7Qd${String(i).padStart(2, "0")}.pdf`,
          "2026-08-01T10:00:00Z",
          `d-${String(i).padStart(4, "0")}`,
          "prop-viva",
        ),
      ),
      pdf("k7Qatual.pdf", "2026-09-02T10:00:00Z", "versao-2", "prop-viva"),
    ];
    st.tabelas.proposals = (st.tabelas.proposals as { id: string }[]).map((p) =>
      p.id === "prop-viva" ? { ...p, pdf_bytes: 6 } : p,
    );
    // Relógio falso: cada descarga leva 1 s e o prazo são 2,5 s.
    vi.useFakeTimers({ now: noite(0) });
    try {
      st.lat = { ida: 10, descarga: 1_000 };
      const p = limparPdfsSubstituidos(noite(0), 2_500);
      await vi.runAllTimersAsync();
      const r = await p;
      expect(r.acabou).toBe(false);
      expect(r.parou).toBe("descargas para comparar");
      expect(st.apagados).toEqual([]);
      expect(vi.mocked(log.warn)).toHaveBeenCalledWith(
        expect.stringContaining("parou a meio"),
        expect.objectContaining({ parou: "descargas para comparar" }),
      );
      const estado = st.estado[CHAVE] as {
        ultimaNoite: { acabou: boolean; parou: string };
        comparados: Record<string, unknown>;
      };
      expect(estado.ultimaNoite).toMatchObject({ acabou: false, parou: "descargas para comparar" });
      const feitos = Object.keys(estado.comparados);
      expect(feitos.length).toBeGreaterThan(0);
      expect(feitos.length).toBeLessThan(DESCARGAS_POR_NOITE);

      // A noite seguinte não volta a descarregar o que já fez.
      const antes = new Set(st.descarregados);
      st.descarregados = [];
      st.lat = { ida: 0, descarga: 0 };
      vi.useRealTimers();
      await limparPdfsSubstituidos(noite(1));
      expect(st.descarregados.some((c) => antes.has(c))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("n.º 6 — o pior caso típico (65 PDF em 50 pastas) cabe nos 6 s do cron", async () => {
    // Como em produção a 14/11: 65 PDF em ~50 pastas. Metade das propostas
    // viva com o enviado selado SEM bytes (descarrega-se tudo o que é antigo),
    // e nenhuma comparação guardada — a primeira noite, a mais cara.
    st.pastas = {};
    st.tabelas = { proposals: [], contracts: [], reciclagem: [] };
    for (let i = 0; i < 50; i++) {
      const pasta = `p-${String(i).padStart(2, "0")}`;
      const n = i < 15 ? 2 : 1; // 15 × 2 + 35 × 1 = 65
      st.pastas[pasta] = Array.from({ length: n }, (_, j) =>
        pdf(`k7Q${i}x${j}.pdf`, `2026-0${7 + j}-0${1 + (i % 9)}T10:00:00Z`, `c-${i}-${j}`, pasta),
      );
      if (i % 2 === 0) {
        (st.tabelas.proposals as object[]).push({
          id: pasta,
          pdf_sha256: sha(`enviado-${i}`),
          pdf_bytes: null,
        });
      }
    }
    // E um contrato antigo sem `proposal_id` e sem bytes: o selo dele vale
    // para todas as pastas, portanto TODOS os candidatos teriam de se
    // descarregar — até ao tecto de ${DESCARGAS_POR_NOITE}.
    (st.tabelas.contracts as object[]).push({
      proposal_id: null,
      proposta_pdf_sha256: sha("aceite-sem-pasta"),
      proposta_pdf_bytes: null,
    });
    // Latências do Supabase medidas à mão por alto: 150 ms por ida, 600 ms
    // por descarga de ~3 MB.
    const medir = async (n: number) => {
      vi.useFakeTimers({ now: noite(n) });
      try {
        st.lat = { ida: 150, descarga: 600 };
        st.idas = [];
        const t0 = Date.now();
        const p = limparPdfsSubstituidos(noite(n), 6_000);
        await vi.runAllTimersAsync();
        const r = await p;
        return { r, ms: Date.now() - t0, idas: st.idas.length };
      } finally {
        vi.useRealTimers();
      }
    };
    const primeira = await medir(0);
    expect(primeira.r.acabou).toBe(true);
    expect(st.descarregados).toHaveLength(DESCARGAS_POR_NOITE);
    expect(primeira.ms).toBeLessThan(6_000);
    // A segunda noite descarrega só os que passaram do tecto; a terceira, nada.
    st.descarregados = [];
    const segunda = await medir(1);
    expect(segunda.r.acabou).toBe(true);
    const daPrimeira = new Set(
      Object.keys((st.estado[CHAVE] as { comparados: object }).comparados),
    );
    expect(st.descarregados.length).toBeLessThanOrEqual(DESCARGAS_POR_NOITE);
    st.descarregados = [];
    const terceira = await medir(2);
    expect(terceira.r.acabou).toBe(true);
    expect(st.descarregados).toEqual([]);
    expect(daPrimeira.size).toBeGreaterThan(DESCARGAS_POR_NOITE);
    expect(terceira.ms).toBeLessThan(primeira.ms);
    // E a noite que apaga (sete dias depois, todas as noites corridas).
    await noites(3, 6);
    const apaga = await medir(7);
    expect(apaga.r.acabou).toBe(true);
    expect(apaga.r.apagados).toBe(POR_NOITE);
    expect(apaga.ms).toBeLessThan(6_000);
    console.info(
      `[medida] 65 PDF / 50 pastas — 1.ª noite: ${primeira.idas} idas, ${primeira.ms} ms; ` +
        `2.ª: ${segunda.idas} idas, ${segunda.ms} ms; 3.ª: ${terceira.idas} idas, ${terceira.ms} ms; noite que apaga: ${apaga.idas} idas, ${apaga.ms} ms`,
    );
  });
});
