/**
 * Next.js instrumentation hook — runs once when the server starts.
 * We use it to validate environment configuration up front.
 * See node_modules/next/dist/docs for the current instrumentation API.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    validateEnv();
  }
}

/**
 * ── OS ERROS DO SERVIDOR PASSAM PELO MESMO `log.error` ────────────────────
 *
 * Um erro que rebenta ao desenhar uma página (ou numa rota sem `try`) era
 * escrito pelo próprio Next na consola, tal e qual: sem a redacção do RGPD
 * do `logger` e sem chegar aos destinos dele (`ERROR_WEBHOOK_URL`, Sentry).
 * Agora chega, com o caminho sem o segmento-token de `/proposta/…`.
 * (Veio da base de sites.)
 */
export async function onRequestError(
  err: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  try {
    const [{ log }, { sanitizeTelemetryPath }] = await Promise.all([
      import("./lib/logger"),
      import("./lib/safe-path"),
    ]);
    const digest =
      typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
    log.error("erro do servidor", err, {
      caminho: sanitizeTelemetryPath(request.path.split("?")[0] ?? ""),
      metodo: request.method,
      rota: context.routePath,
      tipo: context.routeType,
      digest,
    });
  } catch {
    // Contar um erro nunca pode ser o segundo erro.
  }
}
