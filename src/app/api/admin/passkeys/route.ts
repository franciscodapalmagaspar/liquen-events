import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isAuthed, readSession } from "@/lib/admin-auth";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import { passkeysDaConta } from "@/lib/passkeys-da-conta";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Os dispositivos registados NA CONTA DE QUEM PERGUNTA.
 *
 * Nunca os de toda a gente: a lista de aparelhos de uma pessoa diz onde ela
 * trabalha e com o quê, e não há razão para o back office a mostrar a outros.
 * Se um dia for preciso um ecrã de administração com a lista completa, será
 * uma rota própria, com essa decisão tomada à parte.
 *
 * A chave pública nunca sai daqui. Não é um segredo, mas também não serve para
 * nada ao ecrã — e o que não é preciso não se envia.
 */

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const conta = readSession(req.cookies.get(ADMIN_COOKIE)?.value)?.name?.trim();
  if (!conta) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    // Sem as anteriores a uma recuperação (que já não entram) — ver
    // `passkeys-da-conta.ts`.
    const dispositivos = await passkeysDaConta(conta);
    return NextResponse.json({
      dispositivos: dispositivos.map((p) => ({
        id: p.id,
        deviceLabel: p.deviceLabel,
        createdAt: p.createdAt,
        lastUsedAt: p.lastUsedAt,
      })),
    });
  } catch (err) {
    // Sem tabela ou sem base de dados, a lista é VAZIA e não uma avaria: o
    // ecrã continua a servir para tudo o resto, e o registo — esse sim —
    // explica o que falta instalar quando for tentado.
    if (isMissingTable(err) || isPersistenceUnavailable(err)) {
      return NextResponse.json({ dispositivos: [], indisponivel: true });
    }
    log.error("passkeys: listagem falhou", { err });
    return NextResponse.json({ error: "Não foi possível ler os dispositivos." }, { status: 500 });
  }
}
