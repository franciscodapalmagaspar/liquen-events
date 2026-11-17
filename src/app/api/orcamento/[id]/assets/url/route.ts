import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import {
  createProposalUploadTickets,
  confirmProposalUploads,
  UPLOAD_TICKET_TTL,
  MAX_UPLOAD_TICKETS,
} from "@/lib/proposal-storage";
import { getQuote } from "@/lib/quotes-store";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Como na rota gémea dos temas: o PUT confirma um lote inteiro e cada foto
 *  paga uma leitura do cabeçalho no Storage mais um `sharp`. Não cabe nos 10 s
 *  por omissão do alojamento. */
export const maxDuration = 60;

/**
 * CARREGAMENTO DIRETO das fotos do estúdio de propostas — a mesma forma da
 * rota dos temas (`/api/temas/[id]/imagens/url`), porque o problema é o mesmo:
 * os bytes atravessavam a rede duas vezes e pagavam o teto de corpo de uma
 * função serverless.
 *
 * POST → emite bilhetes de escrita para a pasta DESTE pedido.
 * PUT  → confirma o que foi escrito.
 *
 * A rota multipart ao lado (`../route.ts`) continua a funcionar e é o plano B
 * quando esta responder 503.
 *
 * A CONFIRMAÇÃO NÃO É OPCIONAL AQUI. A rota multipart usa `sharp` para recusar
 * bombas de descompressão (um PNG minúsculo que descodifica para gigapixéis)
 * ANTES de a imagem ser guardada — e quem pagaria essa fatura seria o gerador
 * do PDF, mais tarde, com a memória toda. Com escrita direta a rota deixa de
 * ver os bytes, por isso essa mesma verificação passou para a confirmação, que
 * lê só o cabeçalho da imagem já guardada. Sem ela, esta mudança abria um
 * buraco que a rota antiga tinha tapado.
 */

const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

function unavailable() {
  return NextResponse.json(
    { ok: false, fallback: "multipart", error: "Carregamento direto indisponível." },
    { status: 503 },
  );
}

async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Emite os bilhetes. Corpo: `{ "contentTypes": ["image/jpeg", …] }`. */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) return unavailable();
  const { id } = await params;
  try {
    // O pedido tem de existir: sem isto, um id inventado abria uma pasta nova
    // no bucket só por se pedir um bilhete para ela — e essa pasta ficava lá
    // para sempre, sem nada que a fosse arrumar. É o mesmo guarda da rota
    // gémea dos temas.
    const quote = await getQuote(id);
    if (!quote) return NextResponse.json({ error: "Pedido não encontrado" }, { status: 404 });

    const payload = await body(request);
    const raw = Array.isArray(payload?.contentTypes) ? payload.contentTypes : null;
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }
    if (raw.length > MAX_UPLOAD_TICKETS) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_UPLOAD_TICKETS} fotos por pedido.` },
        { status: 400 },
      );
    }
    const types = raw.map((t) => (typeof t === "string" ? t : ""));
    const bad = types.find((t) => !OK_TYPES.test(t));
    if (bad !== undefined) {
      return NextResponse.json(
        { error: `Formato não suportado: ${bad || "(vazio)"}. Usa JPG, PNG ou WEBP.` },
        { status: 415 },
      );
    }

    const tickets = await createProposalUploadTickets(id, types);
    if (!tickets) return unavailable();
    return NextResponse.json({ ok: true, tickets, expiresInSeconds: UPLOAD_TICKET_TTL });
  } catch (err) {
    log.error("assets bilhetes POST falhou", err, { id });
    return unavailable();
  }
}

/**
 * Confirma. Corpo: `{ "paths": ["<pedido>/<uuid>.jpg", …] }` → `{ images,
 * rejected }`. As recusadas já foram apagadas do bucket.
 */
async function PUT_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) return unavailable();
  const { id } = await params;
  try {
    const payload = await body(request);
    const raw = Array.isArray(payload?.paths) ? payload.paths : null;
    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
    }
    if (raw.length > MAX_UPLOAD_TICKETS) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_UPLOAD_TICKETS} fotos por pedido.` },
        { status: 400 },
      );
    }
    const paths = raw.filter((p): p is string => typeof p === "string");
    const res = await confirmProposalUploads(id, paths);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    log.error("assets confirmação PUT falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const POST = comCpu("assets-url POST", POST_semMedida);
export const PUT = comCpu("assets-url PUT", PUT_semMedida);
