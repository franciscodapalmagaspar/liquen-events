/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS VARIÁVEIS DE AMBIENTE, VERIFICADAS UMA VEZ POR IMPLANTAÇÃO (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Registos de 10–17/11: «Optional environment variables not set; related
 * features are disabled» apareceu 1688 vezes — uma por cada arranque de
 * função, em 50 rotas — e afogava os erros verdadeiros. A lista é a mesma em
 * todos os arranques da mesma implantação: dizê-la uma vez chega.
 *
 * Por isso a lista vive aqui, num módulo sem dependências, para servir a dois:
 *
 *  - à CONSTRUÇÃO (`npm run build` corre este ficheiro antes do `next build`):
 *    é aí que as opcionais em falta se dizem, uma vez por implantação, no
 *    registo da construção;
 *  - ao ARRANQUE (`src/lib/env.ts`): as CRÍTICAS continuam a gritar em cada
 *    arranque (sem Supabase os dados perdem-se — isso não pode ficar só na
 *    construção), e as opcionais só se dizem fora da Vercel (desenvolvimento).
 *
 * Nunca escreve o VALOR de nada: só os nomes que faltam.
 */

/** @typedef {{ name: string, critical?: boolean, enables: string }} Verificacao */

/** @type {readonly Verificacao[]} */
export const VERIFICACOES = [
  { name: "SESSION_SECRET", critical: true, enables: "tamper-proof admin sessions" },
  // Fora de produção, faltar isto é inofensivo: `sharedHash()` cai na hash de
  // desenvolvimento. Em produção NÃO cai — a hash de desenvolvimento está no
  // repositório e é pública, por isso `sharedHash()` devolve `null` e o login
  // de admin fica DESLIGADO. Como o `ADMIN_USERS` é a outra porta para a mesma
  // fechadura, a criticidade não é desta variável sozinha: é das duas em falta
  // ao mesmo tempo, e por isso está tratada à parte (ver `variaveisEmFalta`).
  {
    name: "ADMIN_PASSWORD_HASH",
    enables: "the shared admin password (no fallback in production — login is refused without it)",
  },
  // Without Supabase in production the app silently falls back to local JSON
  // files, which are EPHEMERAL on serverless — submissions would be lost on the
  // next deploy/instance swap. That's data loss, not degradation: critical.
  {
    name: "SUPABASE_URL",
    critical: true,
    enables: "persistent storage (without it, prod data is written to ephemeral files and LOST)",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    critical: true,
    enables:
      "persistent storage writes (without it, prod data is written to ephemeral files and LOST)",
  },
  // Email is sent via SMTP/Nodemailer (see lib/mail.ts) — validate the vars the
  // app actually reads, not a Resend key that isn't used anywhere.
  { name: "SMTP_HOST", enables: "outbound email (contact + quote notifications)" },
  { name: "SMTP_USER", enables: "outbound email (SMTP authentication)" },
  { name: "SMTP_PASS", enables: "outbound email (SMTP authentication)" },
  { name: "VAPID_PUBLIC_KEY", enables: "web push notifications" },
  { name: "VAPID_PRIVATE_KEY", enables: "web push notifications" },
  { name: "SENTRY_DSN", enables: "error monitoring (Sentry, via lib/logger)" },
  // Não é crítica: sem ela o botão «Traduzir para inglês» do estúdio diz, com
  // todas as letras, que a tradução automática não está ligada, e a proposta
  // inglesa continua a poder ser escrita à mão. Fica na lista para o aviso
  // dizer PORQUE é que o botão está desligado — descobri-lo pelo botão é
  // descobri-lo com o cliente à espera.
  {
    name: "DEEPL_API_KEY",
    enables: "automatic PT→EN translation of proposal prose (studio «Traduzir para inglês»)",
  },
  // Without it the /api/cron/* routes fail closed in production (see their
  // authorized() checks) — so this isn't silent data loss, but it does mean
  // the daily digest / backup cron jobs silently stop firing.
  {
    name: "CRON_SECRET",
    critical: true,
    enables: "authenticated /api/cron/* scheduled jobs (daily digest, backup)",
  },
];

/**
 * O que falta, separado em críticas e opcionais.
 *
 * @param {Record<string, string | undefined>} env
 * @param {boolean} emProducao
 * @returns {{ criticas: string[], opcionais: string[] }}
 */
export function variaveisEmFalta(env, emProducao) {
  const criticas = [];
  const opcionais = [];
  const definida = (/** @type {string} */ nome) => Boolean(env[nome] && env[nome].length > 0);

  for (const v of VERIFICACOES) {
    if (definida(v.name)) continue;
    if (v.critical && emProducao) criticas.push(`${v.name} — ${v.enables}`);
    else opcionais.push(`${v.name} — ${v.enables}`);
  }

  // A PORTA DO BACK OFFICE. Nenhuma das duas variáveis é crítica sozinha — são
  // duas maneiras de configurar a MESMA fechadura. Faltarem as duas em
  // produção é que é crítico: o login de admin fica desligado.
  if (emProducao && !definida("ADMIN_PASSWORD_HASH") && !definida("ADMIN_USERS")) {
    criticas.push(
      "ADMIN_PASSWORD_HASH (ou ADMIN_USERS) — sem um dos dois o login do back office fica DESLIGADO em produção",
    );
  }

  // SESSION_SECRET must be a real key, not merely present: the signers require
  // ≥ 32 chars and otherwise fall back to a weaker derived key.
  const sessionSecret = env.SESSION_SECRET ?? env.ADMIN_SESSION_SECRET;
  if (emProducao && sessionSecret && sessionSecret.length < 32) {
    criticas.push("SESSION_SECRET — demasiado curto; use 32+ caracteres aleatórios");
  }

  return { criticas, opcionais };
}

/**
 * O aviso da construção: corre uma vez por implantação, antes do `next build`.
 * Não falha a construção — avisar é o trabalho dele; recusar era decidir por
 * quem gere a instalação.
 *
 * @param {Record<string, string | undefined>} env
 * @param {(linha: string) => void} [escrever]
 */
export function avisarNaConstrucao(env, escrever = (l) => console.warn(l)) {
  // Na Vercel, a construção de produção é a que conta (`VERCEL_ENV`).
  const emProducao = env.VERCEL_ENV
    ? env.VERCEL_ENV === "production"
    : env.NODE_ENV === "production";
  const { criticas, opcionais } = variaveisEmFalta(env, emProducao);
  if (criticas.length) {
    escrever(`⚠ Variáveis CRÍTICAS em falta em produção:\n  · ${criticas.join("\n  · ")}`);
  }
  if (opcionais.length) {
    escrever(
      `Variáveis opcionais por definir (as funções que dependem delas ficam desligadas):\n  · ${opcionais.join("\n  · ")}`,
    );
  }
  return { criticas, opcionais };
}

// Corrido directamente (`node scripts/variaveis-de-ambiente.mjs`), avisa.
if (import.meta.url === `file://${process.argv[1]}`) {
  avisarNaConstrucao(process.env);
}
