import { NextRequest, NextResponse } from "next/server";
import { definirPalavraPasseComToken, MINIMO_PALAVRA_PASSE } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Gastar a ligação e definir a palavra-passe nova.
 *
 * PÚBLICA como a irmã do lado: quem chega aqui não tem sessão — é justamente
 * isso que veio resolver. Quem a fecha é o token: 32 bytes de aleatoriedade
 * criptográfica, guardado só em resumo, de uso único e com meia hora de vida.
 *
 * ── Uma frase só para todas as recusas do token ───────────────────────────
 * Inválido, já usado, expirado, ou de uma conta entretanto removida: tudo
 * responde o mesmo. Separar «expirou» de «não existe» dizia a quem tivesse
 * apanhado uma ligação velha que ela em tempos foi boa — e para quem a pediu de
 * verdade a acção é a mesma nos quatro casos: pedir outra.
 *
 * A palavra-passe curta é a EXCEPÇÃO, e de propósito: quem está a escolher a
 * sua palavra-passe tem de saber porque é que ela não serviu, senão fica a
 * tentar às cegas contra uma regra invisível.
 */

const LIGACAO_INVALIDA =
  "Esta ligação já não serve. Pede outra na página de entrada — as ligações duram 30 minutos e só podem ser usadas uma vez.";

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  sweep();
  // O token não se adivinha (2^256), mas a rota faz trabalho — uma leitura e um
  // bcrypt — e não há razão nenhuma para deixar alguém repeti-lo sem fim.
  const limitado = await rateLimit(`recuperar-definir:${ip}`, 10, 60 * 60_000, { global: true });
  if (!limitado.ok) {
    log.warn("recuperação: definição com tecto de tentativas", { ip });
    return NextResponse.json(
      { error: "Demasiadas tentativas. Tenta daqui a bocado." },
      { status: 429, headers: { "Retry-After": String(limitado.retryAfter ?? 3600) } },
    );
  }

  let token = "";
  let password = "";
  try {
    const body = await request.json();
    token = String(body.token ?? "").slice(0, 200);
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!token) return NextResponse.json({ error: LIGACAO_INVALIDA }, { status: 400 });

  const resultado = await definirPalavraPasseComToken(token, password);

  switch (resultado.estado) {
    case "definida":
      log.info("recuperação: palavra-passe definida pela ligação", { ip });
      return NextResponse.json({
        ok: true,
        email: resultado.conta.email,
        mensagem: "Palavra-passe definida. Já podes entrar com ela.",
      });
    case "fraca":
      return NextResponse.json(
        {
          error: `A palavra-passe tem de ter pelo menos ${MINIMO_PALAVRA_PASSE} caracteres. Não precisa de símbolos nem de números — precisa de ser comprida.`,
        },
        { status: 400 },
      );
    case "sem-persistencia":
      // Nunca dizer que ficou definida quando não ficou: a pessoa saía daqui a
      // pensar que tinha palavra-passe nova e não conseguia entrar com nenhuma.
      return NextResponse.json(
        {
          error:
            "Não foi possível guardar a palavra-passe nova. NADA foi alterado — a anterior continua a valer. Fala com quem gere o site.",
        },
        { status: 503 },
      );
    default:
      return NextResponse.json({ error: LIGACAO_INVALIDA }, { status: 400 });
  }
}
