import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { diagnosticarFotos } from "@/lib/diagnostico-de-fotos";
import { log } from "@/lib/logger";
import { comCpu } from "@/lib/medir-cpu";

// O diagnóstico carrega o `sharp` de propósito — é uma das nove causas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uma listagem do Storage, uma assinatura, um download e um `sharp`. Contra um
// Supabase em pausa cada ida tenta três vezes antes de desistir; trinta
// segundos são o que impede o próprio diagnóstico de morrer sem dizer nada —
// que é o defeito que ele existe para corrigir.
export const maxDuration = 30;

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «PORQUE É QUE AS FOTOGRAFIAS NÃO APARECEM?» — a rota que responde
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nove células de um mood board, as nove a dizer «Imagem guardada / Não
 * consegui mostrá-la neste ecrã», e do lado do servidor NADA: nenhum 500,
 * nenhum aviso, nenhuma linha nos registos. Custou um dia descobrir que a
 * política de segurança do build não nomeava o Storage e que por isso o browser
 * recusava as fotografias todas ANTES de as pedir — um sítio onde o servidor
 * nunca chega a ser chamado e portanto nunca teria dito nada.
 *
 * Esta rota é o sítio onde essa pergunta passa a ter resposta. A substância
 * está toda em `lib/diagnostico-de-fotos.ts`, com as nove causas e o que fazer
 * a cada uma.
 *
 * ── PORQUE É QUE ELA VAI BUSCAR A SUA PRÓPRIA POLÍTICA ────────────────────
 * A `Content-Security-Policy` é escrita no BUILD (`next.config.ts` →
 * `.next/routes-manifest.json`) e servida de lá em todos os pedidos. Ler
 * `process.env.SUPABASE_URL` aqui responderia sobre o ambiente de EXECUÇÃO — e
 * a avaria é precisamente a diferença entre os dois. A única maneira honesta de
 * saber o que o browser recebe é pedir uma resposta a esta mesma instalação e
 * ler-lhe o cabeçalho. É um pedido só, a um `/api/health` que não toca em nada.
 *
 * Se esse pedido não der (uma plataforma que não deixa uma função falar consigo
 * própria), a verificação fica `null` — «não se apurou», que NÃO é «passou».
 * Um diagnóstico que inventa um resultado é pior do que não existir.
 *
 * ── SÓ COM SESSÃO ────────────────────────────────────────────────────────
 * A resposta nomeia variáveis de ambiente, buckets e o estado do Storage: é o
 * mapa da instalação. A guarda vem antes de qualquer verificação — sem sessão
 * não se pergunta nada ao Supabase.
 *
 * ── UM ESTADO MAU É UMA RESPOSTA, NÃO UM ERRO ────────────────────────────
 * Devolve sempre 200 quando conseguiu apurar seja o que for, pela mesma razão
 * que a rota do armazenamento: responder 503 a «falta uma variável no build»
 * troca a frase que resolve o problema por uma que não indica caminho nenhum.
 */
async function GET_semMedida(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const politicaServida = await lerPoliticaServida(request);

  try {
    const diagnostico = await diagnosticarFotos({ politicaServida });
    return NextResponse.json(diagnostico, {
      // O estado de uma instalação, respondido a uma sessão. Nunca de uma cache
      // partilhada, e nunca guardado: a pergunta é sempre sobre AGORA.
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (err) {
    log.error("fotos-diagnostico: rota falhou", err);
    return NextResponse.json(
      { error: "Não consegui apurar porque é que as fotografias não aparecem." },
      { status: 500 },
    );
  }
}

/**
 * A `Content-Security-Policy` que esta instalação devolve a um browser, ou
 * `null` quando não se conseguiu ler.
 *
 * `/api/health` de propósito: é a rota mais barata da casa e não escreve nada.
 * A política vem do grupo `/:path*`, portanto é a MESMA que o estúdio recebe.
 */
async function lerPoliticaServida(request: NextRequest): Promise<string | null> {
  try {
    const alvo = new URL("/api/health", request.nextUrl.origin);
    const res = await fetch(alvo, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return res.headers.get("content-security-policy");
  } catch (e) {
    // Não é uma avaria das fotografias: é uma pergunta que ficou por responder.
    log.warn("fotos-diagnostico: não consegui ler a política servida", {
      erro: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

export const GET = comCpu("fotos-diagnostico GET", GET_semMedida);
