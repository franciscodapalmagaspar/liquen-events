import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { updateList } from "@/lib/material-lists-store";
import {
  addListItem,
  updateListItem,
  removeListItem,
  listItemsOf,
} from "@/lib/material-list-items-store";
import { log } from "@/lib/logger";
import { isMissingTable } from "@/lib/repository";
import { respostaDeEscritaRecusada } from "@/lib/resposta-de-conflito";

const NAO_INSTALADO =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cola e corre o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarrega esta página.";

export const runtime = "nodejs";

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1_000_000);
}

/**
 * Renomear a lista, ou mexer nas suas LINHAS.
 *
 *   { name?, notes? }                       → a lista
 *   { linha: { itemId, qty, ... } }         → acrescenta uma linha
 *   { linhaId, patch: {...} }               → altera uma linha
 *   { remover: linhaId }                    → tira uma linha
 *
 * As linhas vivem aqui, e não numa rota própria, porque nunca fazem sentido
 * fora da lista a que pertencem: uma rota `/linhas/[id]` deixava acrescentar
 * uma linha a uma lista que não existe.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }

    if (typeof body.remover === "string") {
      await removeListItem(body.remover);
      return NextResponse.json({ ok: true });
    }

    if (body.linha && typeof body.linha === "object") {
      const l = body.linha;
      if (typeof l.itemId !== "string" || !l.itemId) {
        return NextResponse.json({ error: "Item obrigatório" }, { status: 400 });
      }
      const existentes = await listItemsOf(id);
      const criada = await addListItem({
        listId: id,
        itemId: l.itemId,
        qty: num(l.qty, 1),
        qtyPerPax: l.qtyPerPax ? num(l.qtyPerPax, 0) || undefined : undefined,
        critical: Boolean(l.critical),
        // O fim da lista é o MAIOR `position` + 1, não o número de linhas: a
        // contagem só coincide com o fim enquanto ninguém apagar nada. Tirada
        // uma linha do meio, a seguinte nascia empatada com outra que já lá
        // estava, e a ordem das duas passava a ser a que a base de dados desse
        // — diferente entre leituras, na lista que alguém segue a carregar.
        position: existentes.reduce((maior, linha) => Math.max(maior, linha.position + 1), 0),
      });
      return NextResponse.json(criada);
    }

    if (typeof body.linhaId === "string" && body.patch && typeof body.patch === "object") {
      const p = body.patch;
      const patch: Record<string, unknown> = {};
      if ("qty" in p) patch.qty = num(p.qty, 1);
      // `null` é a instrução "deixa de escalar com convidados", e tem de
      // chegar como undefined ao store — não ser ignorada.
      if ("qtyPerPax" in p)
        patch.qtyPerPax = p.qtyPerPax ? num(p.qtyPerPax, 0) || undefined : undefined;
      if ("critical" in p) patch.critical = Boolean(p.critical);
      if ("position" in p) patch.position = Number(p.position) || 0;
      const atualizada = await updateListItem(body.linhaId, patch);
      if (!atualizada) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
      return NextResponse.json(atualizada);
    }

    const patch: Record<string, unknown> = {};
    if (typeof body.name === "string") {
      const nome = body.name.trim().slice(0, 120);
      if (!nome) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });
      patch.name = nome;
    }
    if (typeof body.notes === "string") patch.notes = body.notes.trim().slice(0, 500) || undefined;

    const atualizada = await updateList(id, patch);
    if (!atualizada) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
    return NextResponse.json(atualizada);
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    // Colisão: alguém reordenou a lista enquanto esta gravação corrigia uma
    // quantidade (ou o contrário) — ver o `touch` em material-list-items-store.
    const conflito = respostaDeEscritaRecusada(err);
    if (conflito) return conflito;
    log.error("material lista PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    const reciclagem = await enviarParaAReciclagem("lista", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    // A tabela em falta não é uma avaria: é uma instalação por acabar,
    // e tem uma resolução que ela pode fazer sozinha.
    if (isMissingTable(err)) {
      return NextResponse.json({ error: NAO_INSTALADO }, { status: 503 });
    }
    log.error("material lista DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
