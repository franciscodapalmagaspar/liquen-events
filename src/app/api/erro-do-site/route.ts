import { NextRequest, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { log } from "@/lib/logger";
import { sanitizeTelemetryPath } from "@/lib/safe-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ERRO NO TELEMÓVEL DE UM VISITANTE DEIXA DE SE PERDER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O irmão público de `api/admin/erro-do-cliente`: o back office já contava os
 * erros do browser; o site público não contava nenhum. Um casal que visse a
 * página do orçamento rebentar no telemóvel ia-se embora, e ninguém sabia.
 * (Veio da base de sites, onde nasceu ao mesmo tempo.)
 *
 * O erro sai daqui pelo mesmo `log.error`, e por isso pela mesma redacção do
 * RGPD (emails, telefones, tokens) e para os mesmos sítios.
 *
 * ── PORQUE É QUE NÃO PEDE SESSÃO, E O QUE A PROTEGE ───────────────────────
 *
 * Quem manda é o browser de quem visita, que não tem sessão — como os Web
 * Vitals. Uma rota aberta que escreve no registo é um megafone, por isso:
 * só se aceitam cinco campos de texto, cortados; 4 KB de corpo; dez por
 * minuto por IP; o caminho perde o segmento-token. E responde SEMPRE 204,
 * também acima do tecto: um 429 aparecia a vermelho na consola do visitante
 * por uma coisa que ele não pediu (lição da base, medida no Lighthouse).
 */

const MAX_BYTES = 4 * 1024;

function texto(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const limpo = v.trim();
  return limpo ? limpo.slice(0, max) : undefined;
}

export async function POST(request: NextRequest) {
  const vazio = () => new NextResponse(null, { status: 204 });
  if (!(await rateLimit(`erro-site:${clientIp(request)}`, 10, 60_000)).ok) return vazio();
  try {
    const bruto = await request.text();
    if (bruto.length > MAX_BYTES) return vazio();
    const corpo = JSON.parse(bruto) as Record<string, unknown>;
    if (!corpo || typeof corpo !== "object") return vazio();

    const mensagem = texto(corpo.mensagem, 300) ?? "erro sem mensagem";
    const onde = texto(corpo.onde, 300);
    log.error(`site no browser: ${mensagem}`, null, {
      marca: texto(corpo.marca, 80),
      onde: onde ? sanitizeTelemetryPath(onde) : undefined,
      aparelho: texto(corpo.aparelho, 200),
      rasto: texto(corpo.rasto, 2000),
    });
  } catch {
    // Um relato malformado não merece um registo: seria transformar o erro de
    // alguém num erro nosso.
  }
  return vazio();
}
