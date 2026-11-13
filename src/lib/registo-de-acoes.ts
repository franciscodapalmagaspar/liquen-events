import "server-only";
import { getSupabase } from "@/lib/supabase";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGISTO DE «QUEM FEZ O QUÊ» (auditoria de segurança de 13/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma linha por cada alteração feita no back office: quem, quando, o método e
 * o caminho (sem o conteúdo, sem dados de clientes). Grava-se no `proxy.ts`,
 * depois de a resposta sair (`waitUntil`), para não atrasar nada. Tabela em
 * `db/migracoes/20261113_registo_de_acoes.sql`; sem ela, não grava e não falha.
 */
export const TABELA = "registo_de_acoes";

/** Meses que uma linha fica (a política de retenção). */
export const MESES = 12;

/**
 * O que NÃO se regista: gravações automáticas (o rascunho do estúdio grava a
 * cada poucos segundos), medições do browser e trabalho de fundo. São ruído:
 * escondiam as ações a sério e enchiam a tabela.
 */
const RUIDO = [
  /\/proposta-rascunho(\/|$)/,
  /\/orcamento-linhas(\/|$)/,
  /^\/api\/(vitals|csp-report|erro-do-site|health|meta)(\/|$)/,
  /^\/api\/admin\/(erro-do-cliente|imagem-falhou|aquecimento-pdf|derivadas|login|logout|recuperar)(\/|$)/,
  /^\/api\/cron\//,
  /^\/api\/proposta\//, // o casal, pelo link — não é o back office
];

const MUDA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function deveRegistar(metodo: string, caminho: string): boolean {
  if (!MUDA.has(metodo)) return false;
  if (!caminho.startsWith("/api/")) return false;
  return !RUIDO.some((r) => r.test(caminho));
}

export async function registarAcao(quem: string, metodo: string, caminho: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    const { error } = await sb.from(TABELA).insert({
      quem: quem.slice(0, 80),
      metodo,
      // Sem query string: pode levar tokens ou emails.
      caminho: caminho.split("?")[0].slice(0, 300),
    });
    if (
      error &&
      !/registo_de_acoes|does not exist|PGRST205|42P01/.test(`${error.code} ${error.message}`)
    ) {
      log.warn("registo de ações: não ficou gravado", { erro: error.message });
    }
  } catch (e) {
    log.warn("registo de ações: falhou", { erro: e instanceof Error ? e.message : String(e) });
  }
}

/** Apaga o que tem mais de {@link MESES} meses (na tarefa da noite). */
export async function limparRegistoAntigo(agora: Date): Promise<number> {
  const sb = getSupabase();
  if (!sb) return 0;
  const limite = new Date(agora);
  limite.setMonth(limite.getMonth() - MESES);
  const { error, count } = await sb
    .from(TABELA)
    .delete({ count: "exact" })
    .lt("quando", limite.toISOString());
  if (error) return 0;
  return count ?? 0;
}
