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
}));
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => st.estado[k] ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    st.estado[k] = v;
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
            st.descarregados.push(caminho);
            const t = st.conteudo[caminho] ?? "?";
            return { data: new Blob([t]), error: null };
          },
          remove: async (caminhos: string[]) => {
            st.apagados.push(...caminhos);
            return { data: [], error: null };
          },
        };
      },
    },
    from: (tabela: string) => ({
      // Como o PostgREST: `order`/`range`, e NUNCA mais de 1000 por resposta.
      select: () => {
        let desde = 0;
        let ate = Infinity;
        const b = {
          order: () => b,
          range(d: number, a: number) {
            desde = d;
            ate = a;
            return b;
          },
          then(resolve: (v: unknown) => unknown) {
            if (st.tabelas[tabela] === null) {
              return Promise.resolve(resolve({ data: null, error: { message: "falhou" } }));
            }
            const todas = [
              ...(st.tabelas[tabela] ?? []),
              ...(tabela === "app_state"
                ? Object.entries(st.estado).map(([key, value]) => ({ key, value }))
                : []),
            ];
            const fim = Math.min(ate + 1, desde + 1000);
            return Promise.resolve(resolve({ data: todas.slice(desde, fim), error: null }));
          },
        };
        return b;
      },
    }),
  }),
}));

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
const dia9 = new Date("2026-11-19T03:00:00Z");
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
    expect(Object.keys(st.estado[CHAVE] as object).sort()).toEqual([
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
    const espera = Object.keys(st.estado[CHAVE] as object);
    // O assinado, o enviado e o da proposta viva nunca entram na espera.
    expect(espera).not.toContain("prop-aceite/k7Qassinado.pdf");
    expect(espera).not.toContain("prop-viva/k7Qatual.pdf");
  });

  it("passados 7 dias saem — e o aceite, mesmo sendo mais antigo, fica", async () => {
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados.sort()).toEqual([
      "prop-aceite/k7Qrascunho.pdf",
      "prop-apagada/k7Qso.pdf",
      "prop-viva/k7Qvelho.pdf",
    ]);
    expect(st.apagados).not.toContain("prop-aceite/k7Qassinado.pdf");
    expect(st.estado[CHAVE]).toEqual({});
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
    expect(Object.keys(st.estado[CHAVE] as object)).not.toContain("prop-viva/k7Qvelho.pdf");
  });

  it("uma proposta apagada mas mencionada (um resgate) guarda a pasta", async () => {
    st.tabelas.app_state = [{ key: "resgate:x", value: { proposta: "prop-apagada" } }];
    await limparPdfsSubstituidos(dia1);
    expect(Object.keys(st.estado[CHAVE] as object)).not.toContain("prop-apagada/k7Qso.pdf");
  });

  it("os índices das fotografias (`foto-resumo:`, `foto-visual:`) não são menções", async () => {
    st.tabelas.app_state = [
      { key: "foto-visual:07", value: { "prop-apagada/foto.jpg": "f".repeat(86) } },
      { key: "foto-resumo:" + "b".repeat(32), value: ["prop-apagada/outra.jpg"] },
    ];
    await limparPdfsSubstituidos(dia1);
    expect(Object.keys(st.estado[CHAVE] as object)).toContain("prop-apagada/k7Qso.pdf");
  });

  it("se uma leitura falha, não apaga nem mexe na espera", async () => {
    await limparPdfsSubstituidos(dia1);
    st.tabelas.contracts = null;
    const r = await limparPdfsSubstituidos(dia9);
    expect(st.apagados).toEqual([]);
    expect(Object.keys(st.estado[CHAVE] as object)).toHaveLength(3);
    expect(r.acabou).toBe(false);
  });

  it("um ficheiro com o mesmo conteúdo do aceite fica, mesmo com outro nome", async () => {
    st.conteudo["prop-aceite/k7Qassinado.pdf"] = "o-que-ela-assinou";
    // Faz o rascunho ter o tamanho do aceite, e a descarga devolver o aceite:
    // é o mesmo ficheiro — fica.
    st.pastas["prop-aceite"][1].metadata.size = 17;
    st.conteudo["prop-aceite/k7Qrascunho.pdf"] = "o-que-ela-assinou";
    await limparPdfsSubstituidos(dia1);
    expect(Object.keys(st.estado[CHAVE] as object)).not.toContain("prop-aceite/k7Qrascunho.pdf");
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
    expect(Object.keys(st.estado[CHAVE] as object)).toContain("prop-apagada/k7Qso.pdf");
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
    await limparPdfsSubstituidos(dia1);
    const r9 = await limparPdfsSubstituidos(dia9, 8_000, { ensaio: true });
    expect(st.apagados).toEqual([]);
    expect(r9.lista?.every((f) => f.saiaHoje)).toBe(true);
    expect(Object.keys(st.estado[CHAVE] as object)).toHaveLength(3);
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
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
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
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados).not.toContain("prop-enviada/k7Qenviado.pdf");
  });

  it("uma proposta na Reciclagem guarda a pasta INTEIRA — pode voltar, com o PDF enviado", async () => {
    st.pastas["prop-na-reciclagem"] = [
      pdf("k7Qenviado.pdf", "2026-08-10T10:00:00Z", "enviado", "prop-na-reciclagem"),
      pdf("k7Qr.pdf", "2026-08-25T10:00:00Z", "z", "prop-na-reciclagem"),
    ];
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados.filter((c) => c.startsWith("prop-na-reciclagem/"))).toEqual([]);
  });

  it("o aceite de um contrato sem `proposal_id` fica, em qualquer pasta", async () => {
    (st.tabelas.contracts as object[]).push({
      proposal_id: null,
      proposta_pdf_sha256: sha("versao-1"),
      proposta_pdf_bytes: 8,
    });
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
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
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados).not.toContain("propcomponto/k7Qunico.pdf");
  });

  it("com mais de 1000 pastas, a 1001.ª também é vista (o Storage lista às páginas)", async () => {
    for (let i = 0; i < 1100; i++) st.pastas[`a-${String(i).padStart(4, "0")}`] = [];
    // Como o Storage, por nome: «z-…» fica para a segunda página.
    st.pastas["z-apagada"] = [pdf("k7Qz.pdf", "2026-08-10T10:00:00Z", "zz", "z-apagada")];
    await limparPdfsSubstituidos(dia1);
    expect(Object.keys(st.estado[CHAVE] as object)).toContain("z-apagada/k7Qz.pdf");
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
    const espera = Object.keys(st.estado[CHAVE] as object);
    expect(espera).not.toContain("prop-viva/k7Q01000.pdf");
    expect(espera).toContain("prop-viva/k7Q00999.pdf");
    expect(espera.filter((c) => c.startsWith("prop-viva/"))).toHaveLength(1000);
  });

  it("se a listagem da raiz falha, não apaga nem mexe na espera", async () => {
    await limparPdfsSubstituidos(dia1);
    st.listaFalha.add("");
    const r = await limparPdfsSubstituidos(dia9);
    expect(st.apagados).toEqual([]);
    expect(Object.keys(st.estado[CHAVE] as object)).toHaveLength(3);
    expect(r.acabou).toBe(false);
  });

  it("se a listagem de uma pasta falha, nada dessa pasta sai", async () => {
    await limparPdfsSubstituidos(dia1);
    st.listaFalha.add("prop-apagada");
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados.filter((c) => c.startsWith("prop-apagada/"))).toEqual([]);
  });

  it("se a leitura das menções falha (porta 4), não apaga nada", async () => {
    await limparPdfsSubstituidos(dia1);
    st.tabelas.tasks = null;
    const r = await limparPdfsSubstituidos(dia9);
    expect(st.apagados).toEqual([]);
    expect(r.acabou).toBe(false);
  });

  it("só fala com o balde `proposal-pdfs` — nunca com o arquivo nem com outro", async () => {
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados.length).toBeGreaterThan(0);
    expect(new Set(st.baldes)).toEqual(new Set(["proposal-pdfs"]));
    expect(st.baldes).not.toContain(BUCKET_DO_ARQUIVO);
  });

  it("só apaga caminhos `<pasta>/<chave>.pdf`", async () => {
    st.pastas["prop-apagada"].push(
      pdf("nome com espaço.pdf", "2026-08-10T10:00:00Z", "w", "prop-apagada"),
    );
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
    expect(st.apagados).toContain("prop-apagada/k7Qso.pdf");
    expect(st.apagados).not.toContain("prop-apagada/nome com espaço.pdf");
  });

  it(`no máximo ${POR_NOITE} por noite`, async () => {
    st.pastas["prop-apagada"] = Array.from({ length: 15 }, (_, i) =>
      pdf(`k7Qx${i}.pdf`, "2026-08-10T10:00:00Z", `x${i}`, "prop-apagada"),
    );
    await limparPdfsSubstituidos(dia1);
    await limparPdfsSubstituidos(dia9);
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
    const espera = Object.keys(st.estado[CHAVE] as object).filter((c) =>
      c.startsWith("prop-viva/"),
    );
    expect(espera).toHaveLength(DESCARGAS_POR_NOITE);
  });
});
