import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listSuppliers, createSupplier } from "@/lib/suppliers-store";
import { jsonWithEtag } from "@/lib/api-cache";
import { supplierUpdateSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { normalizarTelefone } from "@/lib/contacto-do-pedido";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await listSuppliers());
  } catch (err) {
    log.error("fornecedores GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // JSON malformado é pedido errado, não avaria: sem isto o `request.json()`
    // atirava e saía 500 do `catch` lá em baixo. Mesmo padrão do PATCH de
    // `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    // Validate + bound the same way the PATCH path does (was ad-hoc String()
    // coercion with no length limits before).
    const parsed = supplierUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const name = (parsed.data.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    // O telefone de um fornecedor também tem de existir (pedido dela, 30/10:
    // «números de telefone seja qual país for»), e grava-se em E.164 como os
    // dos pedidos. Continua opcional.
    const telefoneEscrito = (parsed.data.phone ?? "").trim();
    const phone = telefoneEscrito ? normalizarTelefone(telefoneEscrito) : "";
    if (phone === null) {
      return NextResponse.json(
        {
          error:
            "Este número de telefone não é válido. Confira os dígitos e o país (de fora de Portugal, com o indicativo à frente, ex.: +44).",
          campo: "telefone",
        },
        { status: 400 },
      );
    }
    const supplier = await createSupplier({
      name,
      category: parsed.data.category || "Outro",
      email: parsed.data.email || undefined,
      phone: phone || undefined,
      location: parsed.data.location || undefined,
      notes: parsed.data.notes || undefined,
    });
    return NextResponse.json(supplier);
  } catch (err) {
    log.error("fornecedores POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
