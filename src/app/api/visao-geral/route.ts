import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAuthed } from "@/lib/admin-auth";
import { jsonWithEtag } from "@/lib/api-cache";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  MAX_GOAL,
  MAX_NOTES,
  OVERVIEW_FIELDS,
  StaleWriteError,
  readOverviewSettings,
  saveOverviewField,
} from "@/lib/overview-settings-store";
import { firstError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Notas da equipa e meta de receita da Visão Geral.
 *
 * GET devolve sempre os dois campos (vazios com revisão 0 quando ainda nunca
 * foram gravados). PUT grava UM campo e exige a revisão sobre a qual se
 * escreveu — se já não for a actual, responde 409 com a versão do servidor
 * dentro, para o ecrã mostrar as duas em vez de escolher uma por sua conta.
 *
 * Nenhuma falha pode sair daqui calada: uma instalação incompleta responde 503
 * com o que fazer, e o cliente distingue-a de uma avaria.
 */

const NAO_INSTALADO =
  "As notas da equipa ainda não têm tabela na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso as notas não podem ser guardadas " +
  "em lado nenhum. Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

const saveSchema = z.object({
  id: z.enum(OVERVIEW_FIELDS),
  value: z.string().max(MAX_NOTES, `Texto demasiado longo (máximo ${MAX_NOTES} caracteres).`),
  // A revisão sobre a qual o cliente escreveu. 0 = "isto ainda estava vazio".
  baseRevision: z.number().int().min(0).max(1_000_000_000),
});

/** A meta é um número em euros escrito como texto; "" significa "sem meta". */
function goalError(value: string): string | null {
  if (value === "") return null;
  if (!/^\d{1,9}([.,]\d{1,2})?$/.test(value)) return "Meta inválida — escreve só o valor em euros.";
  if (Number(value.replace(",", ".")) > MAX_GOAL)
    return `Meta demasiado alta (máximo ${MAX_GOAL}).`;
  return null;
}

async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    return jsonWithEtag(request, await readOverviewSettings());
  } catch (err) {
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    log.error("visao-geral GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

async function PUT_semMedida(request: NextRequest) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const body = await request.json().catch(() => null);
    const parsed = saveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const { id, baseRevision } = parsed.data;
    // As notas guardam-se tal e qual (o espaçamento é do utilizador); a meta é
    // um número e limpa-se dos espaços antes de ser validada.
    const value = id === "meta" ? parsed.data.value.trim() : parsed.data.value;

    if (id === "meta") {
      const erro = goalError(value);
      if (erro) return NextResponse.json({ error: erro }, { status: 400 });
    }

    return NextResponse.json(await saveOverviewField(id, value, baseRevision));
  } catch (err) {
    // Conflito: alguém gravou primeiro. A versão do servidor vai no corpo para
    // o ecrã poder mostrar as duas — nada se perde por decisão nossa.
    if (err instanceof StaleWriteError) {
      return NextResponse.json(
        {
          error:
            "Isto foi alterado noutro dispositivo entretanto. O teu texto NÃO foi gravado — " +
            "compara as duas versões e escolhe.",
          current: err.current,
        },
        { status: 409 },
      );
    }
    if (isMissingTable(err)) return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("visao-geral PUT falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("visao-geral GET", GET_semMedida);
export const PUT = comCpu("visao-geral PUT", PUT_semMedida);
