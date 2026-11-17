import { NextResponse } from "next/server";
import { criarSelo } from "@/lib/anti-spam/selo";

/**
 * O selo do instante em que um formulário de pedido abriu (a armadilha de
 * tempo do anti-spam, `src/lib/anti-spam/selo.ts`).
 *
 * PÚBLICA: quem pede é o browser de quem visita, sem sessão. Não lê nada, não
 * grava nada e não fala com ninguém — só assina a hora.
 *
 * As três perguntas de custo (regra 7):
 *   · quantas vezes corre: uma por formulário aberto (o `/orcamento` e as
 *     fichas dos anúncios), nunca em polling;
 *   · quanto processador gasta: um HMAC-SHA256 — microssegundos, sem
 *     Supabase, sem Upstash, sem armazenamento;
 *   · se pode ser guardado ou feito no build: não. As páginas são estáticas, e
 *     um selo do build diria a hora do build; no navegador não há segredo.
 *     `no-store`, para nenhuma cache servir o selo de outra pessoa.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { selo: criarSelo() },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
