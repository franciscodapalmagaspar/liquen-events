import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { docx, pptx } from "@/lib/importar-proposta/fabricar.testkit";
import { emagrecerParaEnvio, MAX_BYTES_DA_IMPORTACAO } from "@/lib/importar-proposta/zip";

const authed = vi.hoisted(() => ({ ok: false }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));

// Nada nesta rota pode gravar: se algum destes for chamado, o teste diz.
const gravacoes = vi.hoisted(() => ({
  createQuote: vi.fn(),
  uploadProposalImage: vi.fn(),
  saveProposalDraft: vi.fn(),
}));
vi.mock("@/lib/quotes-store", () => ({ createQuote: gravacoes.createQuote }));
vi.mock("@/lib/proposal-storage", () => ({ uploadProposalImage: gravacoes.uploadProposalImage }));
vi.mock("@/lib/proposal-drafts", () => ({ saveProposalDraft: gravacoes.saveProposalDraft }));

import { POST } from "./route";

function req(
  bytes?: Uint8Array | null,
  nome = "proposta.docx",
  extra: HeadersInit = {},
): NextRequest {
  const form = new FormData();
  if (bytes) form.append("ficheiro", new File([bytes as BlobPart], nome));
  return new Request("https://liquen.test/api/orcamento/importar", {
    method: "POST",
    body: form,
    headers: extra,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/importar", () => {
  it("sem sessão: 401, e nem lê o ficheiro", async () => {
    const res = await POST(req(docx(["x"])));
    expect(res.status).toBe(401);
  });

  it("lê um Word e devolve a pré-visualização SEM gravar nada", async () => {
    authed.ok = true;
    const res = await POST(
      req(
        docx(["Casamento Ana & Rui", "Data: 20/06/2026", { h: 1, t: "Cerimónia" }, { li: "Arco" }]),
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.proposta).toMatchObject({
      formato: "docx",
      clientNames: "Ana & Rui",
      dataIso: "2026-06-20",
    });
    expect(gravacoes.createQuote).not.toHaveBeenCalled();
    expect(gravacoes.uploadProposalImage).not.toHaveBeenCalled();
    expect(gravacoes.saveProposalDraft).not.toHaveBeenCalled();
  });

  it("lê o PowerPoint emagrecido (sem as fotografias) e mantém onde elas estavam", async () => {
    authed.ok = true;
    const magro = emagrecerParaEnvio(
      pptx([{ titulo: "Mesas", imagens: ["m.jpg"], marcadores: ["Centros"] }]),
    );
    const res = await POST(req(magro, "p.pptx"));
    expect(res.status).toBe(200);
    const { proposta } = await res.json();
    expect(proposta.fotos).toEqual([
      { caminho: "ppt/media/m.jpg", seccao: "Mesas", destino: "capa" },
    ]);
  });

  it("recusa pelo conteúdo, não pelo nome: um PDF chamado .docx, um .doc antigo, texto", async () => {
    authed.ok = true;
    const pdf = await POST(req(new TextEncoder().encode("%PDF-1.7 ..."), "falso.docx"));
    expect(pdf.status).toBe(415);
    expect((await pdf.json()).error).toMatch(/PDF/);
    const ole = await POST(req(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3, 4]), "velho.doc"));
    expect(ole.status).toBe(415);
    expect((await ole.json()).error).toMatch(/Guardar como/);
    const texto = await POST(req(new TextEncoder().encode("olá"), "x.pptx"));
    expect(texto.status).toBe(415);
  });

  it("um ZIP danificado dá 422 com uma frase dela", async () => {
    authed.ok = true;
    const z = docx(["x"]);
    const res = await POST(req(z.subarray(0, z.length - 30)));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/danificado|incompleto/);
  });

  it("acima do tecto: 413, pelo tamanho declarado e pelo real", async () => {
    authed.ok = true;
    const declarado = await POST(
      req(docx(["x"]), "p.docx", { "content-length": String(MAX_BYTES_DA_IMPORTACAO * 2) }),
    );
    expect(declarado.status).toBe(413);
    const grande = new Uint8Array(MAX_BYTES_DA_IMPORTACAO + 1);
    grande.set([0x50, 0x4b, 3, 4]);
    const real = await POST(req(grande));
    expect(real.status).toBe(413);
  });

  it("sem ficheiro, ou corpo que não é formulário: 400", async () => {
    authed.ok = true;
    expect((await POST(req(null))).status).toBe(400);
    const lixo = new Request("https://liquen.test/api/orcamento/importar", {
      method: "POST",
      body: "isto não é multipart",
      headers: { "content-type": "multipart/form-data; boundary=x" },
    }) as unknown as NextRequest;
    expect((await POST(lixo)).status).toBe(400);
  });
});
