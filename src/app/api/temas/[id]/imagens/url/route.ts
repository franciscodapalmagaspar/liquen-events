import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme } from "@/lib/themes-store";
import { createThemeUploadTickets, confirmThemeUploads } from "@/lib/theme-storage";
import { UPLOAD_TICKET_TTL, MAX_UPLOAD_TICKETS } from "@/lib/proposal-storage";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";
import { lqipsDoLote } from "@/lib/lqip";
import { garantirFoto, updateFoto } from "@/lib/biblioteca-fotos-store";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O PUT confirma até `MAX_UPLOAD_TICKETS` fotos de uma vez, e cada uma custa
 *  uma leitura do cabeçalho no Storage mais um `sharp`; os 10 s por omissão do
 *  alojamento matavam a função a meio e o estúdio via um erro de rede. */
export const maxDuration = 60;

/**
 * CARREGAMENTO DIRETO das fotos de um tema, em duas partes.
 *
 * POST → emite bilhetes: um URL de escrita por foto, para o navegador falar
 *        com o Storage sem nos passar pela frente.
 * PUT  → confirma o que foi escrito: verifica cada foto, apaga o que não
 *        presta e devolve as boas já assinadas.
 *
 * A rota multipart ao lado (`../route.ts`) CONTINUA a funcionar tal e qual, e é
 * para onde o cliente deve cair quando esta responde 503 — emitir URLs de
 * carregamento é uma capacidade do Storage, não um dado adquirido.
 *
 * Os dois guardas de sempre aplicam-se aqui inteiros: sessão de admin, e o
 * caminho é construído NO SERVIDOR a partir do id do tema — nunca aceite do
 * cliente. Um bilhete abre exatamente um caminho dentro da pasta desse tema.
 */

const OK_TYPES = /^image\/(jpe?g|png|webp)$/i;

function unavailable() {
  return NextResponse.json(
    {
      ok: false,
      // O cliente lê isto e volta ao multipart. É a única resposta que
      // significa "tenta pelo caminho antigo".
      fallback: "multipart",
      error: "Carregamento direto indisponível.",
    },
    { status: 503 },
  );
}

/** O corpo JSON do pedido, ou `null` se não for sequer JSON. */
async function body(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Emite os bilhetes. Corpo: `{ "contentTypes": ["image/jpeg", …] }` — um por
 * foto, no máximo `MAX_UPLOAD_TICKETS`.
 *
 * Pede-se em LOTE de propósito. Medido numa bancada com o débito do cliente
 * limitado: com um pedido de bilhete por foto, a ida extra ao servidor come o
 * ganho todo de tirar a travessia do meio (−2,5 % a 20 Mbit/s, +2,8 % a
 * 300 Mbit/s); pedindo 20 de cada vez, o mesmo lote fica 12 % mais rápido a
 * 300 Mbit/s e 28 % a 1 Gbit/s. O tamanho do lote é a diferença entre esta
 * mudança valer a pena e não valer.
 */
async function POST_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) return unavailable();
  const { id } = await params;
  try {
    // O tema tem de existir: sem isto, um id inventado abria uma pasta nova no
    // bucket só por se pedir um bilhete para ela.
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

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
    // Um formato que não serve é recusado AQUI, e não silenciosamente trocado
    // por .jpg: assim o estúdio percebe o que se passa antes de subir 3 MB.
    const types = raw.map((t) => (typeof t === "string" ? t : ""));
    const bad = types.find((t) => !OK_TYPES.test(t));
    if (bad !== undefined) {
      return NextResponse.json(
        { error: `Formato não suportado: ${bad || "(vazio)"}. Usa JPG, PNG ou WEBP.` },
        { status: 415 },
      );
    }

    const tickets = await createThemeUploadTickets(id, types);
    // `null` = este Storage não sabe emitir URLs de carregamento. Não é um
    // erro do estúdio: é o sinal para usar o multipart.
    if (!tickets) return unavailable();
    return NextResponse.json({ ok: true, tickets, expiresInSeconds: UPLOAD_TICKET_TTL });
  } catch (err) {
    log.error("temas bilhetes POST falhou", err, { id });
    return unavailable();
  }
}

/**
 * Confirma as fotos escritas. Corpo: `{ "paths": ["<tema>/<uuid>.jpg", …] }`.
 *
 * Devolve `{ images, rejected }`. As recusadas já foram apagadas do bucket.
 * Uma confirmação que nunca chegue não perde fotos nenhumas — a pasta é a
 * fonte de verdade e a listagem seguinte mostra-as na mesma; o que se perde é
 * só a verificação das dimensões e o URL imediato para a grelha.
 */
async function PUT_semMedida(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) return unavailable();
  const { id } = await params;
  try {
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

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
    const res = await confirmThemeUploads(id, paths);

    /**
     * O LQIP das fotos que ficaram.
     *
     * Vem no mesmo pedido que já existia — a confirmação — e não num pedido
     * novo: é trabalho do CARREGAMENTO, e o carregamento já estava a falar com
     * o servidor aqui.
     *
     * Cruzado com as fotos ACEITES, e não com as pedidas: uma foto recusada na
     * confirmação já foi apagada do bucket, e gravar-lhe um placeholder
     * deixava uma linha na base de dados a apontar para nada.
     *
     * Melhor esforço do princípio ao fim. A foto já está guardada quando isto
     * corre; falhar aqui deixa-a sem placeholder — que é exactamente como
     * estão todas as que foram carregadas antes disto existir.
     */
    const lqips = lqipsDoLote(
      payload?.lqips,
      res.images.map((im) => im.path),
    );
    if (lqips.size > 0) {
      await Promise.all(
        [...lqips].map(async ([path, lqip]) => {
          try {
            await garantirFoto(path);
            await updateFoto(path, { lqip });
          } catch (e) {
            log.warn("temas: LQIP não guardado", { path, erro: String(e) });
          }
        }),
      );
    }

    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    log.error("temas confirmação PUT falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export const POST = comCpu("temas-imagens-url POST", POST_semMedida);
export const PUT = comCpu("temas-imagens-url PUT", PUT_semMedida);
