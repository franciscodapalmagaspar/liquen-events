import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O BROWSER VIU QUANDO A FOTO NÃO APARECEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O gerador de PDF já regista as fotos que não resolvem (ver
 * `proposal-storage.ts`, «imagem não resolveu, vai FALTAR no PDF»). O ecrã do
 * estúdio não registava nada: dizia «Guardada, mas não foi possível
 * pré-visualizar aqui» e a informação que resolvia o caso — o caminho e o
 * código de estado — morria no browser dela.
 *
 * Esta rota é o outro metade desse par. Com as duas, uma foto que desapareça
 * passa a ter registo dos dois lados da fronteira, e distingue-se um ficheiro
 * apagado (404) de uma assinatura expirada (400/403) sem ter de adivinhar.
 *
 * ── Porque é que é fechada ─────────────────────────────────────────────────
 * Só o back office relata, e por isso só quem tem sessão pode escrever aqui.
 * Uma rota de registo aberta é um sítio onde qualquer pessoa escreve o que
 * quiser nos nossos registos — e um registo que se pode encher é um registo em
 * que não se pode confiar.
 *
 * Nunca devolve nada de útil ao cliente. É telemetria: o ecrã não muda de
 * comportamento com o que aqui acontece.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  sweep();
  // Uma grelha inteira a falhar são 60 células; o cliente já se limita a 12 por
  // sessão, e isto é o tecto do lado de cá para o caso de alguém contornar o
  // primeiro.
  const limitado = await rateLimit(`imagem-falhou:${clientIp(request)}`, 30, 60_000);
  if (!limitado.ok) return NextResponse.json({ ok: true }, { status: 202 });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const d = (corpo ?? {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const url = texto(d.url, 300);
  if (!url) return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });

  /**
   * SEGUNDA REDE PARA A CREDENCIAL.
   *
   * O cliente já tira o `?token=` antes de enviar (`semSegredo`), mas isto é um
   * registo: se algum dia alguém chamar esta rota de outro sítio, ou o cliente
   * mudar e a limpeza se perder, o JWT do bucket acabava nos registos — que são
   * lidos por mais gente, guardados mais tempo, e exportados para sítios que
   * ninguém enumerou. Uma verificação num sítio só não chega quando o que está
   * em jogo é uma credencial.
   */
  const limpo = url.includes("?") ? url.slice(0, url.indexOf("?")) : url;

  const estado = typeof d.estado === "number" && Number.isFinite(d.estado) ? d.estado : null;
  /**
   * ── «EXPIROU» NÃO É «NÃO EXISTE» (registos de 10–13/11) ─────────────────
   *
   * As ~30 desses dias eram TODAS 400 sobre ficheiros que existem no Storage
   * (verificado um a um): assinaturas de 6 h já mortas, que a hidratação troca
   * sozinha. No mesmo aviso que um ficheiro apagado, afogavam o caso que
   * importa. O browser diz se o prazo do token já tinha passado (`expirada`);
   * esse vai como informação, e o resto continua aviso, com a causa escrita.
   */
  const contexto = {
    onde: texto(d.onde, 40) || "desconhecido",
    ref: texto(d.ref, 200),
    url: limpo,
    estado,
    causa: causaDaFalha(d.expirada === true, estado),
  };
  // Um 404 é um ficheiro que NÃO EXISTE, com a assinatura em dia ou não: o
  // Storage não responde 404 a um token morto. Esse é sempre aviso (2.ª
  // revisão de 17/11) — senão um ficheiro apagado escondia-se atrás do prazo.
  if (d.expirada === true && estado !== 404) {
    log.info("estúdio: imagem com assinatura expirada", contexto);
  } else {
    log.warn("estúdio: imagem não desenhou no browser", contexto);
  }
  return NextResponse.json({ ok: true });
}

function causaDaFalha(expirada: boolean, estado: number | null): string {
  if (estado === 404) return "ficheiro em falta";
  if (expirada) return "assinatura expirada";
  // O Storage do Supabase responde 400 também a um objecto que não existe, e a
  // um token recusado; com o prazo em dia, não se sabe qual dos dois.
  if (estado === 400 || estado === 403) return "recusado pelo Storage";
  if (estado === null) return "sem resposta";
  return `estado ${estado}`;
}
