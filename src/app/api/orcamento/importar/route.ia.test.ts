import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { leituraCerta, propostaDeTeste } from "@/lib/importar-proposta/ia/fixtures.testkit";

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
// A API nunca é chamada a sério: se o cliente for construído, o teste diz.
const sdk = vi.hoisted(() => ({ construido: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      sdk.construido();
    }
  },
}));
const tecto = vi.hoisted(() => ({ reservar: vi.fn() }));
vi.mock("@/lib/importar-proposta/ia/tecto", () => ({ reservarImportacaoComIa: tecto.reservar }));

import { POST } from "./route";

function req(campos: Record<string, Blob | string>): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.append(k, v);
  return new Request("https://liquen.test/api/orcamento/importar", {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
}

const chaveAntes = process.env.ANTHROPIC_API_KEY;
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.clearAllMocks();
});
afterEach(() => {
  if (chaveAntes === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = chaveAntes;
});

describe("POST /api/orcamento/importar — as vias da leitura", () => {
  it("sem chave: importação sem IA, sem erro, sem construir cliente nem gastar tecto", async () => {
    const res = await POST(req({ ficheiro: new File([propostaDeTeste() as BlobPart], "p.docx") }));
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.revisao.via).toBe("regras");
    expect(j.revisao.porque).toMatch(/sem IA/);
    expect(sdk.construido).not.toHaveBeenCalled();
    expect(tecto.reservar).not.toHaveBeenCalled();
  });

  it("com o JSON da leitura (custo zero): mesma verificação, mesma revisão", async () => {
    const res = await POST(
      req({
        ficheiro: new File([propostaDeTeste() as BlobPart], "p.docx"),
        leitura: new File([JSON.stringify(leituraCerta())], "leitura.json"),
      }),
    );
    const j = await res.json();
    expect(j.revisao.via).toBe("json");
    expect(j.proposta.totalAmount).toBe(1740);
    expect(j.revisao.documento.unidades.length).toBeGreaterThan(5);
    expect(tecto.reservar).not.toHaveBeenCalled();
  });

  it("um JSON da leitura grande demais é recusado", async () => {
    const res = await POST(
      req({
        ficheiro: new File([propostaDeTeste() as BlobPart], "p.docx"),
        leitura: "x".repeat(2 * 1024 * 1024 + 1),
      }),
    );
    expect(res.status).toBe(413);
  });
});
