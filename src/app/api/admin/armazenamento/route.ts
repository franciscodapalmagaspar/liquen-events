import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { verificarArmazenamento } from "@/lib/estado-do-armazenamento";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O QUE EU GRAVAR AGORA FICA MESMO GUARDADO?» — a rota que responde
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Existe para uma pergunta ser feita ANTES de o trabalho começar, e não depois
 * de uma proposta inteira ficar presa no `localStorage` de um portátil. Toda a
 * substância está em `lib/estado-do-armazenamento.ts` — incluindo a cache, que
 * é o que torna esta rota barata de chamar à abertura de cada ecrã.
 *
 * ── Só com sessão ─────────────────────────────────────────────────────────
 * A resposta nomeia variáveis de ambiente, diz se a base de dados está em baixo
 * e se o Storage responde. É um mapa da instalação: a quem passa não se dá, e
 * por isso a guarda vem ANTES da verificação — sem sessão nem se escreve a
 * chave de diagnóstico.
 *
 * ── Um estado mau é uma RESPOSTA, não um erro ─────────────────────────────
 * Devolve sempre 200 quando conseguiu apurar seja o que for. Responder 503 a
 * «falta correr o schema» fazia o ecrã do outro lado dizer "não foi possível
 * ler o estado do armazenamento" — trocar uma frase que resolve o problema por
 * uma que não indica caminho nenhum, que é exactamente o defeito que isto vem
 * corrigir.
 *
 * `?forcar=1` salta a cache: é o botão «Verificar de novo» de quem acabou de
 * correr o `db/schema.sql` e não quer esperar um minuto para ver o aviso sair.
 */
async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    let forcar = false;
    try {
      // `new URL(request.url)` e não `request.nextUrl`: os testes passam um
      // `Request` simples, e uma leitura de parâmetros não pode ser o motivo
      // pelo qual a verificação deixa de responder.
      forcar = new URL(request.url).searchParams.get("forcar") === "1";
    } catch {
      /* URL ilegível — vale a resposta em cache, que é o caso normal */
    }
    const diagnostico = await verificarArmazenamento(forcar ? { forcar: true } : undefined);
    return NextResponse.json(diagnostico, {
      // Nunca de uma cache partilhada: é o estado de uma instalação, respondido
      // a uma sessão autenticada.
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (err) {
    // A verificação já não lança (ver o módulo) — isto é o cinto de segurança
    // para o que vier de fora dela.
    log.error("armazenamento: rota falhou", err);
    return NextResponse.json({ error: "Não consegui verificar o armazenamento." }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("armazenamento GET", GET_semMedida);
