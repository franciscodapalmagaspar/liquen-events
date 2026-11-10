import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { listThemes } from "@/lib/themes-store";
import { RESUMOS_POR_PEDIDO, resumirTemas } from "@/lib/temas-resumos";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS RESUMOS DOS TEMAS QUE O ECRÃ ESTÁ A DESENHAR (9/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: a página dos temas «a aguentar milhares de temas». Com mais de
 * `LIMIAR_DE_RESUMOS` temas, o `GET /api/temas` manda a lista inteira (nomes,
 * notas, favoritos — o que a base de dados tem) mas só resume os primeiros; os
 * outros chegam com `resumoPendente`, e o ecrã pede-os aqui, no máximo
 * `RESUMOS_POR_PEDIDO` de cada vez, à medida que desenha os cartões.
 *
 * `POST { ids: string[] }` → `ThemeSummary[]` dos que existem. Ids a mais
 * cortam-se; ids que não existem ignoram-se.
 */
async function POST_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids)
    ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, RESUMOS_POR_PEDIDO)
    : [];
  if (ids.length === 0) return NextResponse.json([]);
  try {
    const pedidos = new Set(ids);
    const temas = (await listThemes()).filter((t) => pedidos.has(t.id));
    return NextResponse.json(await resumirTemas(temas), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    log.error("temas resumos POST falhou", err, { n: ids.length });
    return NextResponse.json({ error: "Não foi possível ler estes temas agora." }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido — ver `medir-cpu.ts`.
export const POST = comCpu("temas-resumos POST", POST_semMedida);
