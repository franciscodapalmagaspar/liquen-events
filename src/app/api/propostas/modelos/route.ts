import { NextRequest, NextResponse } from "next/server";
import { observar } from "@/lib/fronteira/observar";
import { TIPOS_DE_MODELO } from "@/lib/orcamento/listas-fechadas";
import { ehUmDe } from "@/lib/todos-os-valores";
import { esquemaDoCorpoDoModeloDeProposta } from "@/lib/fronteira/corpos-das-rotas";
import { isAuthed } from "@/lib/admin-auth";
import {
  listarModelos,
  guardarModelo,
  apagarModelo,
  ModeloDemasiadoGrande,
  DemasiadosModelos,
  MAX_MODELOS,
  type ModeloProposta,
} from "@/lib/proposal-templates";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Modelos de proposta reutilizáveis.
 *
 * Tudo aqui é só para a equipa: um modelo tem a estrutura e os preços das
 * propostas dela, e não tem nada que ser lido por quem não entrou.
 */

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return NextResponse.json({ modelos: await listarModelos() });
  } catch (err) {
    log.error("modelos GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  // Analisar em defensiva: um corpo malformado tem de dar 400 e não um 500 por
  // excepção não apanhada — este `json()` está FORA do try de baixo.
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const { nome, tipo, doc, grupo, moodboard, origem } = body as Partial<ModeloProposta>;

  const nomeLimpo = String(nome ?? "")
    .trim()
    .slice(0, 80);
  if (!nomeLimpo) return NextResponse.json({ error: "Dê um nome ao modelo" }, { status: 400 });
  if (!ehUmDe(TIPOS_DE_MODELO, tipo)) {
    return NextResponse.json({ error: "Tipo de modelo desconhecido" }, { status: 400 });
  }
  // Um modelo sem conteúdo aparecia na lista e não fazia nada ao ser escolhido
  // — pior do que não existir, porque parece uma avaria do botão.
  const conteudo = tipo === "completo" ? doc : tipo === "grupo" ? grupo : moodboard;
  if (!conteudo || typeof conteudo !== "object") {
    return NextResponse.json({ error: "O modelo vem vazio" }, { status: 400 });
  }
  // A fronteira, em modo de observar (fase 6), depois das guardas. O caso é o
  // id do modelo, quando o ecrã o manda — NUNCA o nome: um modelo nasce de uma
  // proposta real e pode chamar-se pelo nome do casal.
  observar(esquemaDoCorpoDoModeloDeProposta, body, "o corpo do POST propostas/modelos", {
    id: typeof (body as { id?: unknown }).id === "string" ? (body as { id: string }).id : undefined,
  });

  try {
    const modelo: ModeloProposta = {
      // Um `id` dado pelo cliente permite GRAVAR POR CIMA de um modelo já
      // existente ("actualizar o meu Casamento standard"). Sem ele, cria-se um
      // novo. É saneado porque vai ser comparado e devolvido.
      id:
        String((body as ModeloProposta).id ?? "").replace(/[^a-zA-Z0-9_-]/g, "") ||
        crypto.randomUUID(),
      nome: nomeLimpo,
      tipo,
      criadoEm: new Date().toISOString(),
      ...(origem ? { origem: String(origem).slice(0, 120) } : {}),
      ...(tipo === "completo" ? { doc: doc as ModeloProposta["doc"] } : {}),
      ...(tipo === "grupo" ? { grupo: grupo as ModeloProposta["grupo"] } : {}),
      ...(tipo === "moodboard" ? { moodboard: moodboard as ModeloProposta["moodboard"] } : {}),
    };
    return NextResponse.json({ modelos: await guardarModelo(modelo), modelo });
  } catch (err) {
    // Os dois limites são erros DELA, não avarias — merecem uma frase que diga
    // o que fazer a seguir, em vez de um 500 mudo.
    if (err instanceof ModeloDemasiadoGrande) {
      return NextResponse.json(
        { error: "Este modelo é grande demais para guardar. Tire alguns mood boards." },
        { status: 413 },
      );
    }
    if (err instanceof DemasiadosModelos) {
      return NextResponse.json(
        { error: `Já tens ${MAX_MODELOS} modelos. Apaga um antes de guardar outro.` },
        { status: 409 },
      );
    }
    log.error("modelos POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta o id" }, { status: 400 });
  try {
    return NextResponse.json({ modelos: await apagarModelo(id) });
  } catch (err) {
    log.error("modelos DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
