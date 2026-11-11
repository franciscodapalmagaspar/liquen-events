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
      from: () => ({
        list: async (pasta: string) => ({
          data:
            pasta === ""
              ? Object.keys(st.pastas).map((n) => ({ id: null, name: n }))
              : st.pastas[pasta],
          error: null,
        }),
        download: async (caminho: string) => {
          st.descarregados.push(caminho);
          const t = st.conteudo[caminho] ?? "?";
          return { data: new Blob([t]), error: null };
        },
        remove: async (caminhos: string[]) => {
          st.apagados.push(...caminhos);
          return { data: [], error: null };
        },
      }),
    },
    from: (tabela: string) => ({
      select: async () =>
        st.tabelas[tabela] === null
          ? { data: null, error: { message: "falhou" } }
          : {
              data: [
                ...(st.tabelas[tabela] ?? []),
                ...(tabela === "app_state"
                  ? Object.entries(st.estado).map(([key, value]) => ({ key, value }))
                  : []),
              ],
              error: null,
            },
    }),
  }),
}));

import { CHAVE, limparPdfsSubstituidos } from "./limpar-pdfs-substituidos";

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
    expect(st.descarregados.sort()).toEqual(["prop-aceite/k7Qassinado.pdf", "prop-viva/k7Qvelho.pdf"]);
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
});
