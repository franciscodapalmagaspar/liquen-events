import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, ADMIN_NAME_COOKIE } from "@/lib/admin-auth";
import { terminarSessao } from "@/lib/sessoes-revogadas";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export async function POST(request?: NextRequest) {
  /**
   * Sair TERMINA a sessão, e não só o cookie deste browser (auditoria de
   * 13/11, n.º 6): uma cópia do cookie deixa de valer — ver
   * `sessoes-revogadas.ts`. Se o registo falhar, o cookie sai na mesma: sair
   * nunca pode falhar para quem carregou no botão.
   */
  const token = request?.cookies?.get(ADMIN_COOKIE)?.value;
  if (token) {
    try {
      await terminarSessao(token);
    } catch (err) {
      log.error("logout: não foi possível terminar a sessão no servidor", err);
    }
  }

  const res = NextResponse.json({ ok: true });
  // The clearing Set-Cookie MUST carry the same attributes as the one that set
  // it — in production ADMIN_COOKIE is a `__Host-` cookie, and browsers reject
  // (and therefore DON'T clear) a `__Host-` Set-Cookie that lacks `secure`. Omit
  // it and "log out" is a silent no-op: the session cookie survives. Mirror the
  // login route's options and clear the display-name cookie too.
  const secure = process.env.NODE_ENV === "production";
  res.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  res.cookies.set(ADMIN_NAME_COOKIE, "", {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
