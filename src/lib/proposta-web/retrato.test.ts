import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O retrato da proposta online (`retrato.ts`): a página já montada, numa
 * leitura só. Ela (25/10): «quero mesmo que melhores drasticamente a
 * velocidade e rapidez de abertura».
 */

const estado = new Map<string, unknown>();
vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => estado.get(k) ?? null),
  setState: vi.fn(async (k: string, v: unknown) => {
    estado.set(k, v);
    return { gravado: true };
  }),
}));

/** Um JWT com o `exp` dado, como os do Supabase. */
const jwt = (expSeg: number) =>
  `aaa.${Buffer.from(JSON.stringify({ exp: expSeg })).toString("base64url")}.ccc`;
const assinada = (expSeg: number, bucket = bucketDaFoto) =>
  `https://x.supabase.co/storage/v1/object/sign/${bucket}/a.jpg?token=${jwt(expSeg)}`;

/** As fotos de tema voltam a assinar-se ao ler: aqui, por seis horas. */
const assinaturas = { falhar: false, chamadas: 0 };
vi.mock("@/lib/proposal-assinaturas", () => ({
  assinarLote: vi.fn(async (bucket: string, caminhos: string[], _s: boolean, ttl: number) => {
    assinaturas.chamadas++;
    const m = new Map<string, string>();
    if (assinaturas.falhar) return m;
    const exp = Math.floor(Date.now() / 1000) + ttl;
    for (const c of caminhos)
      m.set(c, `https://x.supabase.co/storage/v1/object/sign/${bucket}/${c}?token=${jwt(exp)}`);
    return m;
  }),
}));

/** O que ficou seguro para depois da resposta (`after()`). */
const segurados: Promise<unknown>[] = [];
vi.mock("next/server", () => ({
  after: vi.fn((cb: () => Promise<unknown>) => {
    segurados.push(cb());
  }),
}));

let expDaFoto = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
/** As fotos da biblioteca (seis horas) ou do próprio pedido (dez anos). */
let bucketDaFoto = "theme-assets";
/** A capa em AVIF por fazer na próxima montagem (`capa-web.ts`), se houver. */
let capaPorFazer: (() => Promise<number>) | null = null;
let comAvif = false;
const propostaWeb = vi.fn(
  async (_p: unknown, codigo: string, _i: unknown, aoFicar?: (p: Promise<number>) => void) => {
    if (capaPorFazer && aoFicar) aoFicar(capaPorFazer());
    return {
      pdf: `/api/proposta/${encodeURIComponent(codigo)}/pdf`,
      capa: { fundo: { src: assinada(expDaFoto), ...(comAvif ? { avif: "c.avif" } : {}) } },
    };
  },
);
vi.mock("./modelo", () => ({ propostaWeb }));

import { setState } from "@/lib/app-state";
import {
  chaveDoRetrato,
  esquecerRetratos,
  LUGAR_DO_CODIGO,
  retratoDaPropostaWeb,
  validadeDoRetrato,
  VERSAO_DO_RETRATO,
} from "./retrato";

const proposta = { id: "p1", doc: { clientNames: "TESTE Ana & TESTE Rui" } as never };

beforeEach(() => {
  estado.clear();
  esquecerRetratos();
  propostaWeb.mockClear();
  vi.mocked(setState).mockClear();
  expDaFoto = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  capaPorFazer = null;
  comAvif = false;
  segurados.length = 0;
  bucketDaFoto = "theme-assets";
  assinaturas.falhar = false;
  assinaturas.chamadas = 0;
});

describe("as fotos de tema assinam-se ao ler, não ficam no retrato (28/10)", () => {
  it("o retrato guardado não leva endereços de tema; a página sai com eles assinados", async () => {
    expDaFoto = Math.floor(Date.now() / 1000) + 6 * 3600;
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    const guardado = JSON.stringify([...estado.values()]);
    expect(guardado).not.toContain("/object/sign/theme-assets/");
    expect(guardado).toContain("~LIQUEN-TEMA[theme-assets|a.jpg]~");

    esquecerRetratos();
    const pagina = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(JSON.stringify(pagina)).toMatch(/\/object\/sign\/theme-assets\/a\.jpg\?token=/);
    expect(propostaWeb).toHaveBeenCalledTimes(1);
  });

  it("um retrato só com fotos de tema vive dias, e não seis horas", async () => {
    expDaFoto = Math.floor(Date.now() / 1000) + 6 * 3600;
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    const r = [...estado.values()][0] as { validoAte: number };
    expect(r.validoAte - Date.now()).toBeGreaterThan(6 * 24 * 3600 * 1000);
  });

  it("a visita seguinte não volta a assinar: fica em memória até perto do fim", async () => {
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    esquecerRetratos();
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    const depoisDaPrimeira = assinaturas.chamadas;
    await retratoDaPropostaWeb(proposta, "outro", "pt");
    expect(assinaturas.chamadas).toBe(depoisDaPrimeira);
  });

  it("se o armazenamento não assinar, a página monta-se como antes — nunca um endereço morto", async () => {
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    esquecerRetratos();
    assinaturas.falhar = true;
    const pagina = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(JSON.stringify(pagina)).not.toContain("~LIQUEN-TEMA[");
    expect(propostaWeb).toHaveBeenCalledTimes(2);
  });

  it("as fotos do próprio pedido (dez anos) ficam no retrato tal como estão", async () => {
    bucketDaFoto = "proposal-assets";
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(JSON.stringify([...estado.values()])).toContain("/object/sign/proposal-assets/a.jpg");
  });

  it("perto do fim, serve o retrato e monta o novo depois da resposta", async () => {
    // Um retrato a dez horas do fim (a foto do pedido expira daqui a 10 h + a margem).
    bucketDaFoto = "proposal-assets";
    expDaFoto = Math.floor(Date.now() / 1000) + 10 * 3600 + 30 * 60;
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(propostaWeb).toHaveBeenCalledTimes(1);
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(segurados.length).toBeGreaterThan(0);
    await Promise.all(segurados);
    expect(propostaWeb).toHaveBeenCalledTimes(2);
  });
});

describe("a capa em AVIF que ainda falta (28/10)", () => {
  it("a página sai sem esperar; quando a AVIF fica feita, o retrato monta-se outra vez — já com ela", async () => {
    let acabar!: (n: number) => void;
    capaPorFazer = () => new Promise<number>((r) => (acabar = r));
    const primeira = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(JSON.stringify(primeira)).not.toContain("c.avif");
    // Seguro com o `after()`, para a função não o cortar depois da resposta.
    expect(segurados).toHaveLength(1);

    capaPorFazer = null;
    comAvif = true;
    acabar(2);
    await Promise.all(segurados);
    expect(propostaWeb).toHaveBeenCalledTimes(2);

    // A visita seguinte (outra instância, sem memória) lê o retrato novo.
    esquecerRetratos();
    const seguinte = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(JSON.stringify(seguinte)).toContain("c.avif");
    expect(propostaWeb).toHaveBeenCalledTimes(2);
  });

  it("refaz UMA vez só — uma fabricação que se repete não vira um ciclo", async () => {
    capaPorFazer = async () => 1;
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    await Promise.all(segurados);
    await Promise.all(segurados);
    expect(propostaWeb).toHaveBeenCalledTimes(2);
  });

  it("se nada se fez, o retrato fica como estava", async () => {
    capaPorFazer = async () => 0;
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    await Promise.all(segurados);
    expect(propostaWeb).toHaveBeenCalledTimes(1);
  });
});

describe("o retrato da proposta online", () => {
  it("monta uma vez, guarda, e a visita seguinte não volta a montar", async () => {
    const a = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    const b = await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(a).toEqual(b);
    expect(propostaWeb).toHaveBeenCalledTimes(1);
    expect(setState).toHaveBeenCalledTimes(1);
  });

  it("outra instância (sem memória) LÊ o retrato: o modelo nem se carrega", async () => {
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    esquecerRetratos();
    propostaWeb.mockClear();
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(propostaWeb).not.toHaveBeenCalled();
  });

  it("o código do link não fica no retrato: cada visita leva o seu", async () => {
    await retratoDaPropostaWeb(proposta, "aquecer", "pt");
    const guardado = JSON.stringify([...estado.values()]);
    expect(guardado).toContain(LUGAR_DO_CODIGO);
    expect(guardado).not.toContain("aquecer");

    const doCasal = await retratoDaPropostaWeb(proposta, "ana-e-rui-k7m2q9xd", "pt");
    expect(doCasal.pdf).toBe("/api/proposta/ana-e-rui-k7m2q9xd/pdf");
    expect(JSON.stringify(doCasal)).not.toContain(LUGAR_DO_CODIGO);
    // O que se aqueceu no envio é o que o casal lê.
    expect(propostaWeb).toHaveBeenCalledTimes(1);
  });

  it("caduca ANTES do primeiro endereço assinado: nunca entrega uma fotografia morta", () => {
    const agora = Date.now();
    const seisHoras = Math.floor(agora / 1000) + 6 * 3600;
    const json = JSON.stringify({ a: assinada(seisHoras), b: assinada(seisHoras + 99999) });
    const fim = validadeDoRetrato(json, agora);
    expect(fim).toBeLessThan(seisHoras * 1000);
    expect(fim).toBeGreaterThan(agora + 5 * 3600 * 1000);
    // Sem endereços assinados, vive no máximo uma semana.
    expect(validadeDoRetrato("{}", agora)).toBe(agora + 7 * 24 * 3600 * 1000);
  });

  it("um retrato caducado volta a montar", async () => {
    bucketDaFoto = "proposal-assets"; // as de tema já não mandam na validade
    expDaFoto = Math.floor(Date.now() / 1000) + 60; // já dentro da margem
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    await retratoDaPropostaWeb(proposta, "abc123", "pt");
    expect(propostaWeb).toHaveBeenCalledTimes(2);
  });

  it("outro documento ou outra língua: outra chave — e uma publicação do site NÃO", () => {
    const outra = { id: "p1", doc: { clientNames: "TESTE Rita" } as never };
    expect(chaveDoRetrato(proposta, "pt")).not.toBe(chaveDoRetrato(outra, "pt"));
    expect(chaveDoRetrato(proposta, "pt")).not.toBe(chaveDoRetrato(proposta, "en"));
    // O site publica-se várias vezes por dia: se cada publicação mudasse a
    // chave, o casal que abrisse o email a seguir esperava os segundos todos.
    const antes = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "aaaa";
    const k1 = chaveDoRetrato(proposta, "pt");
    process.env.VERCEL_GIT_COMMIT_SHA = "bbbb";
    const k2 = chaveDoRetrato(proposta, "pt");
    if (antes === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
    else process.env.VERCEL_GIT_COMMIT_SHA = antes;
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^proposta-web:retrato:p1:[0-9a-f]{24}$/);
  });

  /**
   * ── QUEM MUDA A PÁGINA SOBE A VERSÃO ──────────────────────────────────────
   * O retrato é a página já montada. Se um destes ficheiros mudar (a forma da
   * página ou a maneira de a montar) e a versão não subir, os casais leem o
   * retrato velho até ele caducar. Este teste falha nesse caso: actualiza a
   * impressão aqui E sobe `VERSAO_DO_RETRATO` no `retrato.ts`, no mesmo commit.
   */
  it("os ficheiros que montam a página estão presos à versão do retrato", () => {
    const impressao = (f: string) =>
      createHash("sha256")
        .update(readFileSync(join(process.cwd(), f)))
        .digest("hex")
        .slice(0, 16);
    expect({
      versao: VERSAO_DO_RETRATO,
      modelo: impressao("src/lib/proposta-web/modelo.ts"),
      mosaico: impressao("src/lib/proposta-web/mosaico.ts"),
      textos: impressao("src/lib/proposta-web/textos-web.ts"),
      capa: impressao("src/lib/proposta-web/capa-web.ts"),
      tamanhos: impressao("src/lib/proposta-web/tamanhos.ts"),
    }).toEqual({
      versao: 5,
      modelo: "d4e85cae93188e60",
      mosaico: "25d811bd1021f446",
      textos: "71448f103c1b0275",
      capa: "2717fc2f91e2ede7",
      tamanhos: "6fc5168faee42f00",
    });
  });

  // O retrato guarda-se em texto (JSON): uma FUNÇÃO lá dentro desaparece sem
  // erro nenhum. Os textos com funções (`t.ola(…)`, `t.capa(…)`) são usados
  // pelo modelo ao montar — a página só pode ler frases já feitas.
  it("a página nunca chama uma função dos textos: no retrato elas não sobrevivem", () => {
    const pagina = readFileSync(
      join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]/PropostaWeb.tsx"),
      "utf8",
    );
    expect(pagina).not.toMatch(/\bt\.\w+\(/);
    expect(pagina).not.toMatch(/\bd\.t\.\w+\(/);
  });
});
