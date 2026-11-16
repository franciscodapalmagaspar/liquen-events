import { describe, it, expect, vi } from "vitest";
import { marcaDaRef } from "@/lib/proposta-fotos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CACHE DESTA ROTA NÃO PODE PROMETER O QUE O ENDEREÇO NÃO DIZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito que isto prende, por extenso:
 *
 * Esta rota respondia `private, max-age=86400, immutable` para um endereço
 * cujo `id` é POSICIONAL — `b0f2` quer dizer «a terceira fotografia do
 * primeiro mood board», e não QUAL fotografia é. Como o mesmo link salta para
 * a revisão mais recente (o `maisRecente`, em `proposta-do-link.ts`), ela
 * revia o board e o casal continuava a ver a fotografia antiga naquele lugar
 * durante um dia inteiro.
 *
 * E tirar o `immutable` não chegava: o `max-age=86400` sozinho já serve da
 * cache um dia sem perguntar nada. O que resolve é o endereço passar a dizer
 * QUAL fotografia é — a `marca`, que muda quando a fotografia muda.
 */

const H = vi.hoisted(() => ({
  doc: null as Record<string, unknown> | null,
  derivada: null as Buffer | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/proposta-do-link", () => ({
  propostaDoLink: async (t: string) =>
    t === "bom" ? { proposta: { id: "p1", doc: H.doc } } : null,
}));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => ({ ok: true }),
}));
// Sem derivada: serve-se o original. É o caminho da PRIMEIRA visita, e é
// exactamente aquele em que o `immutable` fazia mais estragos.
vi.mock("@/lib/derivadas", () => ({ derivadaMediaAPedido: async () => ({ bytes: H.derivada }) }));
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: async () => Buffer.from("uns-bytes"),
}));

const { GET } = await import("./route");

const CAPA = "ped-7/capa.jpg";
const OUTRA = "ped-7/outra.jpg";
const doc = (ref: string) => ({ coverImages: [ref], moodBoards: [] });

async function pedir(ref: string, v?: string) {
  H.doc = doc(ref);
  const qs = v === undefined ? "" : `?v=${encodeURIComponent(v)}`;
  return GET(new Request(`https://liquen.test/api/proposta/bom/foto/c0${qs}`), {
    params: Promise.resolve({ token: "bom", id: "c0" }),
  });
}

describe("a fotografia da proposta, e o que a cache dela pode prometer", () => {
  it("o endereço que identifica a fotografia pode ficar um dia — e nunca `immutable`", async () => {
    const res = await pedir(CAPA, marcaDaRef(CAPA));
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control") ?? "";
    expect(cc).toContain("max-age=86400");
    expect(cc).toContain("private");
    /**
     * Os bytes deste endereço mudam UMA vez, de propósito: à primeira visita
     * ainda não há derivada e vai o original; a partir daí vai o WebP, dez
     * vezes mais leve. `immutable` prendia o casal ao ficheiro pesado.
     */
    expect(cc, "os bytes deste endereço mudam quando a derivada nasce").not.toContain("immutable");
  });

  it("a marca de outra fotografia não compra o dia de cache", async () => {
    // O caso real: ela revê o mood board, e o casal reabre o link do email com
    // o endereço que tinha. O `id` é o mesmo — a fotografia é outra.
    const res = await pedir(OUTRA, marcaDaRef(CAPA));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300, must-revalidate");
  });

  it("sem marca nenhuma, o endereço continua a servir — com cache curta", async () => {
    // Um endereço partilhado à mão, ou de uma página desenhada antes disto.
    // Nunca 404: o `srcset` já o escolheu, e uma imagem partida é pior.
    const res = await pedir(CAPA);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=300, must-revalidate");
  });

  it("a marca não leva nenhum byte do caminho real", async () => {
    // A regra 1 desta casa: o caminho no bucket nunca sai daqui. A marca é um
    // resumo de sentido único — e é por isso que pode ir num endereço.
    const m = marcaDaRef("ped-7/capa-do-casamento-da-ana.jpg");
    expect(m).toMatch(/^[0-9a-f]{12}$/);
    expect(m).not.toContain("ped-7");
    expect(m).not.toContain("ana");
  });

  it("fotografias diferentes têm marcas diferentes, e a mesma tem sempre a mesma", () => {
    expect(marcaDaRef(CAPA)).toBe(marcaDaRef(CAPA));
    expect(marcaDaRef(CAPA)).not.toBe(marcaDaRef(OUTRA));
  });
});

/**
 * A CDN da Vercel (16/11) só guarda a DERIVADA WebP identificada pela marca —
 * nunca o original (que dá lugar à derivada na visita seguinte), nem um
 * endereço que não diz qual fotografia é.
 */
describe("a fotografia da proposta na CDN da Vercel", () => {
  it("derivada WebP com a marca certa: um dia na CDN, e o browser continua a ver `private`", async () => {
    H.derivada = Buffer.from("webp");
    try {
      const res = await pedir(CAPA, marcaDaRef(CAPA));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/webp");
      expect(res.headers.get("Vercel-CDN-Cache-Control")).toBe("max-age=86400");
      expect(res.headers.get("Cache-Control")).toBe("private, max-age=86400, must-revalidate");
    } finally {
      H.derivada = null;
    }
  });

  it("derivada sem marca, ou com a marca de outra: nada na CDN", async () => {
    H.derivada = Buffer.from("webp");
    try {
      for (const v of [undefined, marcaDaRef(OUTRA)]) {
        const res = await pedir(CAPA, v);
        expect(res.status).toBe(200);
        expect(res.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
      }
    } finally {
      H.derivada = null;
    }
  });

  it("o original (ainda sem derivada) nunca vai para a CDN, mesmo com a marca certa", async () => {
    H.derivada = null;
    const res = await pedir(CAPA, marcaDaRef(CAPA));
    expect(res.status).toBe(200);
    expect(res.headers.get("Vercel-CDN-Cache-Control")).toBeNull();
  });
});
