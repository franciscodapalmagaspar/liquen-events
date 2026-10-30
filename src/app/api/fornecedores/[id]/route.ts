import { NextRequest, NextResponse } from "next/server";
import type { Supplier } from "@/lib/orcamento/types";
import { isAuthed } from "@/lib/admin-auth";
import { enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { obterFornecedor, updateSupplier } from "@/lib/suppliers-store";
import { supplierUpdateSchema, firstError } from "@/lib/validation";
import { respostaDeConflito, respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";
import { normalizarTelefone } from "@/lib/contacto-do-pedido";

export const runtime = "nodejs";

// id/createdAt are server-assigned and must never be overwritable via PATCH.
const ALLOWED: (keyof Supplier)[] = [
  "name",
  "category",
  "email",
  "phone",
  "location",
  "notes",
  "rating",
  "preferred",
];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // JSON malformado (ou um corpo que não é um objecto) é um pedido errado,
    // não uma avaria nossa: sem isto o `request.json()` atirava e o `catch` lá
    // em baixo devolvia 500, e um `null` rebentava o `key in body` com um
    // TypeError. Mesmo padrão do PATCH de `/api/orcamento/[id]`.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    const picked: Record<string, unknown> = {};
    for (const key of ALLOWED) {
      if (key in body) picked[key] = body[key];
    }
    const parsed = supplierUpdateSchema.safeParse(picked);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const updates = parsed.data as Partial<Supplier>;
    /**
     * O telefone confere-se SÓ QUANDO MUDA, como no PATCH dos pedidos: o ecrã
     * dos Fornecedores manda a ficha inteira em cada gravação, e um fornecedor
     * antigo com o telefone escrito à moda antiga deixava de se poder corrigir
     * a nota. Quando muda, tem de existir (as regras do país) e grava-se em
     * E.164.
     */
    const novo = (updates.phone ?? "").trim();
    if ("phone" in updates && novo) {
      const actual = await obterFornecedor(id);
      if (!actual) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
      if (novo !== (actual.phone ?? "").trim()) {
        const e164 = normalizarTelefone(novo);
        if (!e164) {
          return NextResponse.json(
            {
              error:
                "Este número de telefone não é válido. Confira os dígitos e o país (de fora de Portugal, com o indicativo à frente, ex.: +44).",
              campo: "telefone",
            },
            { status: 400 },
          );
        }
        updates.phone = e164;
      }
    }
    const updated = await updateSupplier(id, updates);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    // Duas correcções à mesma ficha (o telefone novo e uma nota) — ver o
    // `touch` em suppliers-store.
    const conflito = respostaDeConflito(err);
    if (conflito) return conflito;
    const migracao = respostaDeMigracaoEmFalta(err, "Os fornecedores");
    if (migracao) return migracao;
    log.error("fornecedores PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const reciclagem = await enviarParaAReciclagem("fornecedor", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    log.error("fornecedores DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
