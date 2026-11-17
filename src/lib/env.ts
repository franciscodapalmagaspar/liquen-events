import "server-only";
import { log } from "./logger";
import { variaveisEmFalta } from "../../scripts/variaveis-de-ambiente.mjs";

/**
 * Environment validation. Surfaces misconfiguration loudly at startup instead
 * of failing mysteriously at runtime. We warn (rather than throw) so a missing
 * optional integration degrades gracefully, but production-critical security
 * settings are flagged prominently.
 */
// A lista e a regra vivem num módulo sem dependências, para a CONSTRUÇÃO as
// poder usar também (ver o cabeçalho de `scripts/variaveis-de-ambiente.mjs`).
let validated = false;

/** Run once at startup. Idempotent. */
export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const isProd = process.env.NODE_ENV === "production";
  const { criticas: missingCritical, opcionais } = variaveisEmFalta(process.env, isProd);
  /**
   * ── AS OPCIONAIS DIZEM-SE NA CONSTRUÇÃO, NÃO EM CADA ARRANQUE (17/11) ────
   *
   * Registos de 10–17/11: 1688 vezes, uma por cada arranque de função. Na
   * Vercel a lista é a mesma em todos os arranques da mesma implantação, e a
   * construção já a disse uma vez (`npm run build`). Fora da Vercel
   * (desenvolvimento) continua aqui, que é onde alguém a lê.
   */
  const missing = process.env.VERCEL ? [] : opcionais;

  if (missingCritical.length) {
    log.error("Missing critical environment variables in production", undefined, {
      missing: missingCritical,
    });
  }
  if (missing.length) {
    log.warn("Optional environment variables not set; related features are disabled", {
      missing,
    });
  }
  // «Todas presentes» só quando é verdade — e não quando as opcionais em falta
  // ficaram caladas por já se terem dito na construção.
  if (!missingCritical.length && !opcionais.length) {
    log.info("Environment validated — all known variables present");
  }
}
