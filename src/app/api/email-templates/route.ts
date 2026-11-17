import { NextRequest, NextResponse } from "next/server";
import { observar } from "@/lib/fronteira/observar";
import { esquemaDoCorpoDoModeloDeEmail } from "@/lib/fronteira/corpos-das-rotas";
import { isAuthed } from "@/lib/admin-auth";
import { listTemplatesWithDefaults, upsertTemplate } from "@/lib/email-templates-store";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json(await listTemplatesWithDefaults());
  } catch (err) {
    log.error("email-templates GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Tectos de cada campo. Não é gosto por números redondos: isto vai para uma
 * tabela que a cópia de segurança lê inteira, e a cópia tem um tecto de 20 MB —
 * um corpo de 50 MB colado aqui entrava calado e a partir daí NÃO havia cópia
 * nenhuma. O texto de um email cabe folgadamente em 20 000 caracteres (o mais
 * longo dos modelos por omissão não chega a 1 000).
 */
const MAX_KEY = 80;
const MAX_NAME = 120;
const MAX_SUBJECT = 300;
const MAX_BODY = 20_000;

/** Upsert a single template. POST and PUT behave identically (create-or-update). */
async function upsert(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    // A fronteira, em modo de observar (fase 6): diz o que não bate, não recusa.
    observar(esquemaDoCorpoDoModeloDeEmail, body, "o corpo do upsert email-templates");
    const key = String(body?.key ?? "")
      .trim()
      .slice(0, MAX_KEY);
    if (!key) return NextResponse.json({ error: "Chave obrigatória" }, { status: 400 });

    const name = String(body?.name ?? "")
      .trim()
      .slice(0, MAX_NAME);
    // O assunto acaba num cabeçalho de email: sem CR/LF, como em toda a casa.
    const subject = String(body?.subject ?? "")
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, MAX_SUBJECT);
    if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Assunto obrigatório" }, { status: 400 });

    const saved = await upsertTemplate({
      key,
      name,
      subject,
      body: String(body?.body ?? "").slice(0, MAX_BODY),
    });
    return NextResponse.json(saved);
  } catch (err) {
    log.error("email-templates upsert falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const POST = upsert;
export const PUT = upsert;
