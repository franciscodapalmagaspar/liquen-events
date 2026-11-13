import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Contract } from "@/lib/contract-types";

// ── Mock auth + data + the heavy PDF renderer; keep the route logic real ──
const authed = vi.hoisted(() => ({ value: false }));
/** A referência do pedido é o que vai para o nome do ficheiro — por isso é
 *  regulável daqui, para se poder pôr lá o que um id estragado teria. */
const dados = vi.hoisted(() => ({ quoteId: "q-1" }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.value }));
vi.mock("@/lib/contracts-store", () => ({
  getContract: vi.fn(
    async (id: string): Promise<Contract | null> =>
      id === "c-1"
        ? {
            id: "c-1",
            quoteId: dados.quoteId,
            proposalId: "p-1",
            clientName: "Maria",
            clientEmail: "m@example.com",
            termsVersion: "2026-01",
            termsSnapshot: "1. Objeto\nTexto.",
            status: "aceite",
            createdAt: "2026-07-01T10:00:00.000Z",
          }
        : null,
  ),
}));
vi.mock("@/lib/contract-pdf", () => ({
  renderContractPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
}));

import { GET } from "./route";

const req = () =>
  new Request("https://liquen.test/api/contratos/c-1/pdf") as unknown as NextRequest;

beforeEach(() => {
  authed.value = false;
  dados.quoteId = "q-1";
  vi.clearAllMocks();
});

describe("GET /api/contratos/[id]/pdf", () => {
  it("401s without an admin session", async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(401);
  });

  it("404s for an unknown contract when authed", async () => {
    authed.value = true;
    const res = await GET(req(), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("serves the PDF inline when authed", async () => {
    authed.value = true;
    const res = await GET(req(), { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    // Dados pessoais: nunca num cache (auditoria 6, n.º 19).
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Disposition")).toContain("inline");
    expect(res.headers.get("Content-Disposition")).toContain("Contrato-Liquen-q-1.pdf");
    // O tamanho à frente: é o que deixa o back office mostrar quanto já chegou.
    const corpo = await res.arrayBuffer();
    expect(res.headers.get("Content-Length")).toBe(String(corpo.byteLength));
  });

  /**
   * O nome do ficheiro vai para um CABEÇALHO. Uma aspa ou um CR/LF vindos do
   * `quoteId` faziam o `new NextResponse` atirar, e o contrato — que é a prova
   * em papel do aceite — saía como 500. Mesmo filtro das rotas irmãs do portal.
   */
  it("saneia a referência antes de a pôr no Content-Disposition", async () => {
    authed.value = true;
    dados.quoteId = 'q-1"\r\nX-Injectado: 1';
    const res = await GET(req(), { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="Contrato-Liquen-q-1X-Injectado1.pdf"',
    );
    expect(res.headers.get("X-Injectado")).toBeNull();
  });
});
