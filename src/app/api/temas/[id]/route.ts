import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme, updateTheme, listThemes } from "@/lib/themes-store";
import { isThemePath, themeIdOfPath, themeFolder } from "@/lib/theme-storage";
import {
  NaoDeuParaApagar,
  enviarParaAReciclagem,
  oQueOsTemasTemNaReciclagem,
  quemApagou,
} from "@/lib/reciclagem";
import { isUniqueViolation } from "@/lib/invoices-store";
import { isMissingTable, isPersistenceUnavailable } from "@/lib/repository";
import {
  MAX_PHOTO_ORDER,
  MAX_THEME_NAME,
  MAX_THEME_NOTES,
  normalizedThemeName,
  ordemComAsDaReciclagem,
  themeNameTakenError,
} from "@/lib/theme-types";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** O DELETE copia para as propostas todas as fotos do tema que elas referenciam
 *  e só depois apaga a pasta — uma cópia de Storage por foto. Um tema cheio não
 *  cabe nos 10 s por omissão do alojamento, e ser morto a meio deixa fotos
 *  órfãs. */
export const maxDuration = 60;

/**
 * A biblioteca só precisa de uma tabela — quando ela falta, dizer o que fazer
 * vale mais do que um 500 mudo. É recuperável (503), não uma avaria.
 */
const NAO_INSTALADO =
  "A Biblioteca de Temas ainda não está criada na base de dados. No Supabase → SQL Editor, " +
  "cola e corre o ficheiro db/schema.sql (pode repetir-se sem risco) e tenta de novo.";

/** A base de dados não está sequer ligada — outra instalação incompleta, com
 *  outra resolução (as chaves do Supabase), por isso outra frase. */
const SEM_BASE_DE_DADOS =
  "A base de dados não está ligada nesta instalação, por isso os temas não podem ser guardados. " +
  "Faltam as chaves do Supabase (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Renomeia / anota um tema e escolhe a foto do cartão.
 *
 * `coverPath` aceita um caminho de uma foto DESTE tema (mesma validação da
 * remoção de fotos: uma pasta e um ficheiro, nada que saia dali) ou `null`/""
 * para voltar à foto mais recente. Se a base de dados ainda não tiver a coluna
 * `cover_path`, a escrita falha com 42703/PGRST204 e sai daqui o mesmo 503 que
 * manda correr o db/schema.sql — o resto do tema continua a funcionar.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  let name = "";
  try {
    const body = await request.json().catch(() => null);
    const patch: {
      name?: string;
      notes?: string;
      coverPath?: string;
      photoOrder?: string[];
      favorito?: boolean;
      arquivado?: boolean;
    } = {};

    // Fixar no topo e arquivar. Só se aceita um booleano a sério: um "true" em
    // texto ou um 1 viria de código a chamar isto por engano, e gravar a
    // interpretação de um valor ambíguo é como um tema desaparece da lista sem
    // ninguém perceber porquê.
    for (const campo of ["favorito", "arquivado"] as const) {
      if (body?.[campo] === undefined) continue;
      if (typeof body[campo] !== "boolean") {
        return NextResponse.json({ error: `Valor inválido para ${campo}.` }, { status: 400 });
      }
      patch[campo] = body[campo];
    }

    // A ordem arrumada à mão. Guarda-se SÓ o que ela moveu: caminhos deste
    // tema, sem repetições e limitados a MAX_PHOTO_ORDER. Uma lista vazia
    // limpa a arrumação e o tema volta às mais recentes primeiro.
    if (body?.photoOrder !== undefined) {
      if (!Array.isArray(body.photoOrder)) {
        return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
      }
      const seen = new Set<string>();
      const order: string[] = [];
      for (const raw of body.photoOrder) {
        if (typeof raw !== "string") continue;
        const path = raw.trim();
        // Um caminho de OUTRO tema aqui reordenaria fotos que não são deste —
        // é o mesmo guarda da capa e da remoção, pela mesma razão.
        if (!isThemePath(path) || themeIdOfPath(path) !== themeFolder(id)) {
          return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
        }
        if (seen.has(path)) continue;
        seen.add(path);
        order.push(path);
        if (order.length >= MAX_PHOTO_ORDER) break;
      }
      // As da Reciclagem não estão na grelha, e por isso não vêm nesta ordem:
      // guardam o seu lugar para quando forem repostas (revisão de 14/11, n.º
      // 7). Só se lê a Reciclagem quando a ordem nova deixou alguma de fora.
      // Uma lista vazia continua a limpar tudo.
      if (order.length > 0) {
        const antiga = (await getTheme(id))?.photoOrder ?? [];
        if (antiga.some((p) => !seen.has(p))) {
          const { fotos } = await oQueOsTemasTemNaReciclagem().catch(() => ({
            fotos: new Set<string>(),
          }));
          patch.photoOrder = ordemComAsDaReciclagem(antiga, order, fotos);
        } else patch.photoOrder = order;
      } else patch.photoOrder = order;
    }

    if (body?.coverPath !== undefined) {
      const cover = typeof body.coverPath === "string" ? body.coverPath.trim() : "";
      if (cover && (!isThemePath(cover) || themeIdOfPath(cover) !== themeFolder(id))) {
        return NextResponse.json({ error: "Capa inválida." }, { status: 400 });
      }
      // "" limpa a escolha; a coluna fica a null e o cartão volta à mais recente.
      patch.coverPath = cover;
    }

    if (body?.name !== undefined) {
      name = str(body.name, MAX_THEME_NAME);
      if (!name) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
      // Comparação como a equipa lê os nomes — sem acentos nem maiúsculas —
      // para que "Itália" e "Italia" não possam coexistir como temas distintos.
      const existing = await listThemes();
      const taken = existing.some(
        (t) => t.id !== id && normalizedThemeName(t.name) === normalizedThemeName(name),
      );
      if (taken) return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
      patch.name = name;
    }
    if (body?.notes !== undefined) patch.notes = str(body.notes, MAX_THEME_NOTES) || undefined;

    const updated = await updateTheme(id, patch);
    if (!updated) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    // Capa limpa sai como ausente, não como "" — o cliente lê "sem capa
    // escolhida" da mesma forma que num tema que nunca teve nenhuma.
    return NextResponse.json({ ...updated, coverPath: updated.coverPath || undefined });
  } catch (err) {
    // Backstop de corrida: entre a verificação acima e a escrita, outro
    // pedido pode ter registado o mesmo nome — o índice único
    // (db/schema.sql: proposal_themes_name_uk) fá-lo falhar aqui. É um
    // duplicado (409), não um 500.
    if (name && isUniqueViolation(err)) {
      return NextResponse.json({ error: themeNameTakenError(name) }, { status: 409 });
    }
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("temas PATCH falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

/**
 * Elimina um tema E as suas fotos.
 *
 * As propostas já feitas não são afetadas, mas a razão MUDOU: escolher fotos
 * da biblioteca deixou de copiar bytes e passou a guardar uma referência (ver
 * `theme-ref.ts`). Quem garante que uma proposta enviada não perde imagens é
 * agora o `apagarPastaDaBiblioteca`, que copia primeiro para quem referencia e
 * só depois deixa apagar — e recusa a eliminação se não conseguir.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const theme = await getTheme(id);
    if (!theme) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });
    // Pela Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`): as propostas
    // que usam fotos do tema ficam com a sua cópia, a linha sai, e as fotos
    // ficam na pasta 30 dias. Sem a tabela é o de sempre: o Storage primeiro,
    // e só se ele CONFIRMAR a limpeza é que a linha sai (`reciclagem.ts`).
    const reciclagem = await enviarParaAReciclagem("tema", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    if (err instanceof NaoDeuParaApagar) {
      log.error("temas DELETE: o tema não saiu", null, { id, porque: err.message });
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    if (isPersistenceUnavailable(err)) {
      return NextResponse.json({ error: SEM_BASE_DE_DADOS }, { status: 503 });
    }
    log.error("temas DELETE falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
