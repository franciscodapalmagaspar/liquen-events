import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAuthed, readSession } from "@/lib/admin-auth";
import { saveSubscription, removeSubscription, pushConfigured } from "@/lib/push";
import { isPersistenceUnavailable } from "@/lib/repository";
import { pushSubscriptionSchema } from "@/lib/validation";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

// Expose whether push is configured + the public key for the client.
export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  return NextResponse.json({
    configured: pushConfigured(),
    publicKey: process.env.VAPID_PUBLIC_KEY ?? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const raw = await request.json().catch(() => null);
    const parsed = pushSubscriptionSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "Subscrição inválida" }, { status: 400 });
    }
    // A subscrição fica presa à conta da SESSÃO (auditoria de 13/11, n.º 7):
    // quem sair da equipa deixa de receber — ver `lib/push.ts`.
    const conta = readSession(request.cookies?.get(ADMIN_COOKIE)?.value)?.name;
    await saveSubscription(parsed.data, conta);
    return NextResponse.json({ ok: true });
  } catch (err) {
    /**
     * A INSTALAÇÃO NÃO TEM ONDE GUARDAR — e isso não é uma avaria.
     *
     * Sem base de dados em produção, `saveSubscription` recusa de propósito:
     * guardar no disco da função fazia as notificações ficarem ACTIVAS no
     * telemóvel e não chegar nenhuma, sem sintoma nenhum (ver `lib/push.ts`).
     *
     * Um 500 «Erro» aqui punha alguém a tentar outra vez, a mudar de browser e
     * a escrever a alguém — tudo menos a definir a variável que falta. 503 com
     * a frase certa é a diferença entre um problema resolúvel e um mistério.
     */
    if (isPersistenceUnavailable(err)) {
      log.warn("push subscribe recusado: sem base de dados em produção");
      return NextResponse.json(
        {
          error:
            "Não dá para ligar as notificações nesta instalação: não há base de dados onde guardar a subscrição, e o que ficasse guardado desaparecia no próximo deploy — as notificações pareceriam ligadas e não chegaria nenhuma. Define SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no alojamento e volta a tentar.",
        },
        { status: 503 },
      );
    }
    log.error("push subscribe falhou", err);
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    // A malformed or empty unsubscribe body must not 500 — treat it as "nothing
    // to remove" (mirrors the POST handler's tolerant JSON parse). Unsubscribe
    // is idempotent, so an absent endpoint is a no-op, not an error.
    const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint = typeof body?.endpoint === "string" ? body.endpoint : undefined;
    if (endpoint) await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  }
}
