import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  ADMIN_REAUTH_COOKIE,
  CONFIRMACAO_MS,
  confirmarPalavraPasse,
  criarConfirmacao,
  readSession,
} from "@/lib/admin-auth";
import { rateLimit, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Confirmar a palavra-passe antes de registar um aparelho (auditoria de
 * 13/11, n.º 5) — ver `confirmarPalavraPasse` em `admin-auth.ts`.
 *
 * Só com sessão aberta, e só para a conta DESSA sessão. A resposta certa deixa
 * um cookie que vale {@link CONFIRMACAO_MS}; o registo (`../registo`) exige-o.
 *
 * O limite de tentativas fica na MEMÓRIA da função (sem Upstash): quem chega
 * aqui já tem uma sessão, e cinco tentativas em 15 minutos por conta chegam
 * para um engano e não para uma busca.
 */
export async function POST(req: NextRequest) {
  const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  sweep();
  const limite = await rateLimit(`passkey-confirmar:${conta.toLowerCase()}`, 5, 15 * 60_000);
  if (!limite.ok) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Tenta daqui a uns minutos." },
      { status: 429, headers: { "Retry-After": String(limite.retryAfter ?? 900) } },
    );
  }

  let password = "";
  try {
    const corpo = (await req.json()) as { password?: unknown };
    password = typeof corpo?.password === "string" ? corpo.password.slice(0, 200) : "";
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  if (!(await confirmarPalavraPasse(conta, password))) {
    log.warn("passkeys: confirmação da palavra-passe recusada", { conta });
    return NextResponse.json({ error: "A palavra-passe não está certa." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_REAUTH_COOKIE, criarConfirmacao(conta), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(CONFIRMACAO_MS / 1000),
  });
  return res;
}
