import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getTheme, updateTheme } from "@/lib/themes-store";
import {
  transferThemeImage,
  isThemePath,
  themeIdOfPath,
  themeFolder,
  type ThemeTransferOutcome,
} from "@/lib/theme-storage";
import { moverFotosDaBiblioteca } from "@/lib/theme-materializar";
import { MAX_THEME_COPY_BATCH, type ThemeCopyMode } from "@/lib/theme-types";
import { isDatabaseConfigured } from "@/lib/supabase";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Um lote são até 40 fotos e ~80 chamadas de Storage; mesmo com zero bytes a
 *  atravessar a função, não cabem nos 10 s por omissão do alojamento. */
export const maxDuration = 60;

/** Transferências em curso ao mesmo tempo — o mesmo 5 da rota `/importar`:
 *  rápido sem afogar o Storage. */
const CONCURRENCY = 5;

/**
 * LEVAR FOTOS DE UM TEMA PARA OUTRO — copiar ou mover.
 *
 * `[id]` é o tema de ORIGEM, e é uma escolha deliberada: com a origem no
 * caminho, a validação dos caminhos recebidos é literalmente a MESMA linha que
 * o DELETE de fotos e o PATCH da ordem já escrevem
 * (`themeIdOfPath(p) !== themeFolder(id)` → 400), e o "mover" precisa de saber
 * a origem de qualquer maneira, para lhe limpar a ordem manual.
 *
 * Corpo: `{ paths: string[], destino: string, modo: "copiar" | "mover" }`.
 * O `modo` é OBRIGATÓRIO e não tem valor por omissão: um "mover" nunca pode
 * sair de um pedido a que faltou um campo.
 *
 * As duas operações partilham a mesma primitiva (`transferThemeImage`), porque
 * a única diferença é se o objeto de origem desaparece. E as duas PRESERVAM O
 * NOME DO FICHEIRO — é isso que torna "esta foto já está no destino?" numa
 * colisão de chave respondida pelo Storage (409 → `existing`), e que torna o
 * lote inteiro repetível sem criar duplicados.
 *
 * ⚠️ VOCABULÁRIO: nesta casa "Transferir" já significa DESCARREGAR (o botão da
 * barra de seleção). A palavra está proibida aqui — usa-se "copiar" e "mover".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Armazenamento indisponível — configura o Supabase (SUPABASE_URL / SERVICE_ROLE_KEY).",
      },
      { status: 503 },
    );
  }
  const { id } = await params;
  try {
    const source = await getTheme(id);
    if (!source) return NextResponse.json({ error: "Tema não encontrado" }, { status: 404 });

    const body = await request.json().catch(() => null);

    const modo = body?.modo as ThemeCopyMode | undefined;
    if (modo !== "copiar" && modo !== "mover") {
      return NextResponse.json({ error: "Operação inválida." }, { status: 400 });
    }

    const destino = typeof body?.destino === "string" ? body.destino : "";
    if (!destino || destino === id) {
      return NextResponse.json(
        { error: "A origem e o destino são o mesmo tema." },
        { status: 400 },
      );
    }
    const dest = await getTheme(destino);
    if (!dest) {
      return NextResponse.json({ error: "Tema de destino não encontrado." }, { status: 404 });
    }

    const rawPaths = Array.isArray(body?.paths) ? body.paths : null;
    if (!rawPaths || rawPaths.length === 0) {
      return NextResponse.json({ error: "Nenhuma foto indicada." }, { status: 400 });
    }
    // Acima do teto RECUSA-SE, não se corta em silêncio: um pedido feito à mão
    // não pode pôr milhares de cópias a correr. O cliente já parte em lotes.
    if (rawPaths.length > MAX_THEME_COPY_BATCH) {
      return NextResponse.json(
        { error: `Máximo de ${MAX_THEME_COPY_BATCH} fotos de cada vez.` },
        { status: 400 },
      );
    }

    // Sem repetições (o mesmo `seen` que a ordem manual já usa) e só caminhos
    // DENTRO da pasta deste tema — nunca de outro, nunca com travessia.
    const folder = themeFolder(id);
    const seen = new Set<string>();
    const paths: string[] = [];
    for (const raw of rawPaths) {
      if (typeof raw !== "string" || !isThemePath(raw) || themeIdOfPath(raw) !== folder) {
        return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });
      }
      if (seen.has(raw)) continue;
      seen.add(raw);
      paths.push(raw);
    }

    const mode = modo === "mover" ? "move" : "copy";
    let results: { outcome: ThemeTransferOutcome; to: string; thumb: boolean }[];
    if (mode === "move") {
      // MOVER passa pela porta da Biblioteca (`theme-materializar.ts`): é ela
      // que reescreve as referências das propostas e dos rascunhos e leva as
      // etiquetas atrás da foto. Um `move` cru partia as fotos das propostas
      // já enviadas (auditoria 6, n.º 1).
      results = await moverFotosDaBiblioteca(paths, destino);
    } else {
      results = new Array(paths.length);
      let next = 0;
      const worker = async () => {
        for (let i = next++; i < paths.length; i = next++) {
          results[i] = await transferThemeImage(paths[i], destino, "copy");
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, worker));
    }

    const copied: { from: string; to: string }[] = [];
    const existing: string[] = [];
    const failed: string[] = [];
    let thumbsMissing = 0;
    paths.forEach((from, i) => {
      const r = results[i];
      if (r?.outcome === "copied") {
        copied.push({ from, to: r.to });
        if (!r.thumb) thumbsMissing += 1;
      } else if (r?.outcome === "exists") existing.push(from);
      else failed.push(from);
    });

    // A ORDEM MANUAL DA ORIGEM, depois de mover.
    //
    // Os caminhos que saíram ficavam a apontar para o vazio: o `planOrderedPage`
    // metia-os na página, o `signThemePaths` não os assinava e o filtro final
    // deitava-os fora — a primeira página da origem voltava CURTA. Já acontece
    // hoje ao apagar uma foto arrumada; mover 300 tornava-o gritante.
    //
    // À prova de bala de propósito: o `updateTheme` escreve `photo_order` /
    // `cover_path`, colunas que podem não existir numa base sem o db/schema.sql
    // corrido — e aí lança 503. Um "mover" JÁ CONCLUÍDO não pode passar a
    // reportar-se como falhado por causa de arrumação: regista-se e segue-se.
    if (mode === "move" && copied.length > 0) {
      const gone = new Set(copied.map((c) => c.from));
      try {
        const patch: { photoOrder?: string[]; coverPath?: string } = {};
        const order = source.photoOrder ?? [];
        if (order.some((p) => gone.has(p))) patch.photoOrder = order.filter((p) => !gone.has(p));
        if (source.coverPath && gone.has(source.coverPath)) patch.coverPath = "";
        if (patch.photoOrder || patch.coverPath !== undefined) await updateTheme(id, patch);
      } catch (e) {
        log.warn("temas copiar: arrumação da origem não foi limpa", { id, erro: String(e) });
      }
    }

    // Sem isto, quem abrisse o destino via durante 60 s o total antigo — a
    // contagem tem memória curta e as escritas foram na pasta dele.
    // (`transferThemeImage` já a deita fora nos dois temas.)

    // 502 só quando NADA aconteceu: com uma única foto copiada — ou já lá
    // estando —, o lote tem resultado e o cliente sabe reportar o resto.
    if (copied.length === 0 && existing.length === 0) {
      return NextResponse.json(
        {
          error:
            modo === "mover"
              ? "Não foi possível mover as fotos. Continuam neste tema."
              : "Não foi possível copiar as fotos.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      copied,
      existing,
      failed,
      requested: paths.length,
      thumbsMissing,
    });
  } catch (err) {
    log.error("temas copiar POST falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
