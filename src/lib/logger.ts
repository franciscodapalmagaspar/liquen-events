/**
 * Minimal structured logger.
 *
 * Emits one JSON line per event in production (easy to grep/ingest in Vercel
 * logs or any log drain) and a readable line in development. Zero dependencies.
 *
 * Error monitoring: set SENTRY_DSN and every error-level log is also captured
 * in Sentry (grouping, alert rules, history) via the plain envelope HTTP API —
 * no SDK dependency. ERROR_WEBHOOK_URL additionally posts errors to a
 * Slack/Discord webhook for real-time pings. Neither ever blocks the response
 * and neither can throw — observability must never become a failure mode — mas
 * também não se largam ao vento: ver `prenderAoPedido`, que os mantém vivos até
 * saírem quando há um pedido a que os prender.
 */
type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

const isProd = process.env.NODE_ENV === "production";

// ─────────────────────────────────────────────────────────────────────────────
// Redacção (RGPD) — nada de dados pessoais nem de credenciais nos registos.
//
// Os registos da Vercel são conservados e consultáveis, e os erros são ainda
// reencaminhados para terceiros (Sentry, webhook de Slack/Discord). Tudo o que
// aqui passa tem de sair já limpo. Isto é uma rede de segurança CENTRAL: mesmo
// que uma rota nova registe por descuido um email de cliente — ou que um erro
// do SMTP/Supabase traga o endereço dentro da própria mensagem — ele nunca
// chega ao destino em claro.
//
// Regra de ouro: preferimos perder um pormenor de diagnóstico a expor um dado
// pessoal. Os identificadores internos (ex.: LIQ-…) não são redigidos — são a
// chave de correlação da dona e não identificam a pessoa por si só.
// ─────────────────────────────────────────────────────────────────────────────

const REDACTED = "[REDIGIDO]";

/** Endereços de email — o dado pessoal que mais facilmente escorrega para os
 *  registos (mensagens de erro do nodemailer, violações de unicidade do
 *  Postgres/Supabase, corpos de pedidos). */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Telefones. Deliberadamente conservador para não estragar datas ISO, marcas
 *  temporais nem contagens: só apanha o formato internacional (+351 …) e o
 *  nacional português de 9 dígitos iniciado por 2 ou 9.
 *
 *  AS GUARDAS DO NACIONAL SÃO DUAS, E NÃO UMA. A guarda única era `[\w.-]` dos
 *  dois lados, para o padrão não morder um pedaço de um número maior (um IP,
 *  uma versão). Só que apanhava a pontuação da FRASE ao mesmo tempo: um
 *  «Contacto: 912345678.» ou um «tel.912345678» — que é como as pessoas
 *  escrevem — saíam INTEIROS para os registos, para o Sentry e para o webhook.
 *  O `.` e o `-` só continuam um número quando têm um DÍGITO do outro lado, e é
 *  isso que a segunda guarda diz; a pontuação passa a poder tocar no número.
 *  (O internacional nunca teve o problema — ver a guarda dele, só `[\w]`.) */
const PHONE_INTL_RE = /(?<![\w+])\+\d{1,3}[\s.-]?\d(?:[\s.-]?\d){6,13}(?![\w])/g;
const PHONE_PT_RE = /(?<![\w+])(?<![.-]\d)[29]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}(?![\w])(?![.-]\d)/g;

/** Segmentos-token nos caminhos públicos com capacidade: /proposta/<token>
 *  aceita uma proposta (14 dias) e /portal/<token> abre a reserva inteira do
 *  cliente (365 dias). Chegam aos registos pelo `path` dos Web Vitals e pelo
 *  `documentUri` dos relatórios de CSP. Quem lê os registos NÃO pode ficar com
 *  a chave de acesso do cliente. */
const CAPABILITY_PATH_RE = /(\/(?:proposta|portal)\/)[A-Za-z0-9._~%-]{8,}/g;

/** Parâmetros de query sensíveis (token, secret, key, password, sig, auth…). */
const SENSITIVE_QUERY_RE =
  /([?&](?:token|secret|key|password|passwd|pwd|sig|signature|auth|access_token|api_key|apikey)=)[^&\s"']+/gi;

/** Chaves de contexto cujo VALOR é sempre sensível, seja qual for o formato.
 *  Lista curta e inequívoca de propósito: chaves ambíguas (`to`, `from`,
 *  `name`) ficam de fora — aí basta a limpeza por valor, que redige um email
 *  em `to` mas deixa passar um caminho de storage em `to`. */
const SENSITIVE_KEY_RE =
  /^(e-?mail|mails?|telefone|telem[oó]vel|phone(?:_?number)?|tel|morada|address|nif|token|secret|password|passwd|pwd|authorization|cookie|api_?key|access_?token|replyto|reply_to)$/i;

/** Limpa uma string: tokens de capacidade, parâmetros sensíveis, emails e
 *  telefones. A ordem importa — os caminhos primeiro, para o token não ser
 *  confundido com outra coisa. */
export function redactString(value: string): string {
  return value
    .replace(CAPABILITY_PATH_RE, `$1${REDACTED}`)
    .replace(SENSITIVE_QUERY_RE, `$1${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_INTL_RE, REDACTED)
    .replace(PHONE_PT_RE, REDACTED);
}

/** Limpa qualquer valor, em profundidade. Limites de profundidade e de largura
 *  para que um objecto hostil ou cíclico não transforme o registo num problema
 *  de disponibilidade — observabilidade nunca pode ser modo de falha. */
export function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 4) return "[profundo]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  if (value instanceof Error) return redactError(value);
  if (value instanceof Date) return value.toISOString();

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? REDACTED : redactValue(v, depth + 1);
  }
  return out;
}

/** Cópia limpa de um Error, preservando `name`/`message`/`stack` para o
 *  diagnóstico continuar a funcionar (e para `instanceof Error` se manter). */
function redactError(err: Error): Error {
  const copy = new Error(redactString(err.message));
  copy.name = err.name;
  copy.stack = err.stack ? redactString(err.stack) : undefined;
  return copy;
}

/** Limpa o contexto estruturado de um registo. */
export function redactContext(context?: Context): Context | undefined {
  if (!context) return context;
  return redactValue(context) as Context;
}

// ─────────────────────────────────────────────────────────────────────────────
// O ALERTA TEM DE SOBREVIVER AO FIM DO PEDIDO
//
// Em serverless o contentor é CONGELADO assim que a resposta sai. Um
// `void fetch(...)` que ainda não tenha ligado morre aí: a linha aparece na
// consola e o Sentry / o webhook nunca recebem nada. É o mesmo defeito que se
// corrigiu no `/api/backup` e no `/api/orcamento`, e aqui é pior — o que se
// perde é o aviso de que alguma coisa correu mal, ou seja, a falha apaga o seu
// próprio alarme.
//
// Ali a cura foi o `after()` do `next/server`. AQUI NÃO PODE SER: este ficheiro
// é importado por componentes de CLIENTE (o sino das notificações, o
// `error.tsx`, o `global-error.tsx`), e um `import` estático de `next/server`
// arrastava código de servidor para o pacote do browser.
//
// Por isso vai-se ao mecanismo que está POR BAIXO do `after`, e que a
// documentação do Next descreve como o contrato de quem implementa plataformas
// (docs/01-app/03-api-reference/04-functions/after.md, «supporting `after` for
// serverless platforms»): `globalThis[Symbol.for("@next/request-context")]`.
// Um símbolo global não é um `import` — no browser, nos testes e nos scripts
// simplesmente não existe, e o registo degrada exactamente para o que fazia
// antes. Sem uma terceira entrada no logger, sem `next/server` no bundle.
// ─────────────────────────────────────────────────────────────────────────────
const CONTEXTO_DO_PEDIDO = Symbol.for("@next/request-context");

type ContextoDoPedido = {
  get?: () => { waitUntil?: (promessa: Promise<unknown>) => void } | undefined;
};

/**
 * Prende ao pedido em curso um trabalho que já está a andar.
 *
 * A promessa entregue NUNCA rejeita (o `.catch` é de quem chama, e há um teste
 * a prendê-lo): um webhook em baixo não pode derrubar a invocação por onde o
 * alerta ia sair. E se não houver contexto de pedido, fica o que sempre houve —
 * disparar e seguir.
 */
function prenderAoPedido(trabalho: Promise<unknown>): void {
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[CONTEXTO_DO_PEDIDO] as
      | ContextoDoPedido
      | undefined;
    ctx?.get?.()?.waitUntil?.(trabalho);
  } catch {
    /* observabilidade nunca pode ser modo de falha */
  }
}

// Optional real-time error alerting. When ERROR_WEBHOOK_URL is set, error-level
// logs are POSTed (fire-and-forget) to a Slack/Discord/any incoming webhook so
// the team is notified in production. It never blocks or throws — observability
// must never become a failure mode — and a short per-message throttle stops a
// single recurring error from flooding the channel.
const recentAlerts = new Map<string, number>();

/**
 * Origens cujo texto vem de FORA (um browser anónimo, por exemplo): todas as
 * mensagens com um destes prefixos partilham UMA chave de travão. Sem isto,
 * cada mensagem diferente abria a sua própria janela, e o travão não travava
 * nada. A rota `erro-do-site` escreve como erro, para avisar (revisão de
 * 16/11, n.º 5): é esta chave que faz disso um alerta por janela.
 */
const ORIGENS_DE_FORA = ["site no browser:"];

/** A chave de travão de uma mensagem: a própria mensagem, ou o prefixo da
 *  origem de fora a que pertence. */
export function chaveDeTravao(message: string): string {
  return ORIGENS_DE_FORA.find((p) => message.startsWith(p)) ?? message;
}

/**
 * Tira ao texto do alerta o que o Slack e o Discord leem como comando: `<…>`
 * (menções `<@id>`, `<!channel>`, ligações) e `@` (`@everyone`, `@here`).
 * Troca-os por parecidos inofensivos, para a linha continuar legível.
 */
export function neutralizarParaCanal(texto: string): string {
  return texto.replace(/</g, "‹").replace(/>/g, "›").replace(/@/g, "＠");
}

function alertWebhook(message: string, context: Context | undefined, err: unknown) {
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url || process.env.NODE_ENV !== "production") return;

  const now = Date.now();
  const chave = chaveDeTravao(message);
  const last = recentAlerts.get(chave);
  if (last && now - last < 60_000) return;
  if (recentAlerts.size > 200) recentAlerts.clear();
  recentAlerts.set(chave, now);

  const detail =
    err instanceof Error ? `${err.name}: ${err.message}` : err !== undefined ? String(err) : "";
  const ctx = context && Object.keys(context).length ? ` · ${JSON.stringify(context)}` : "";
  const text = neutralizarParaCanal(
    `🔴 Líquen — ${message}${detail ? `\n${detail}` : ""}${ctx}`.slice(0, 1500),
  );

  // Slack reads `text`, Discord reads `content` — send both so either works.
  // `allowed_mentions` vazio: o Discord não transforma nada em menção, mesmo
  // que escape alguma coisa à neutralização.
  prenderAoPedido(
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, content: text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(5000),
    }).then(
      () => {},
      () => {},
    ),
  );
}

// Sentry via the envelope HTTP API. DSN format: https://KEY@HOST/PROJECT_ID.
// Same per-message throttle spirit as the webhook: a hot error loop shouldn't
// hammer the ingest endpoint (Sentry also rate-limits server-side).
const recentSentry = new Map<string, number>();

function sentryCapture(message: string, context: Context | undefined, err: unknown) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  const m = dsn.match(/^https:\/\/([^@:]+)@([^/]+)\/(\d+)$/);
  if (!m) return;
  const [, key, host, projectId] = m;

  const now = Date.now();
  const chave = chaveDeTravao(message);
  const last = recentSentry.get(chave);
  if (last && now - last < 30_000) return;
  if (recentSentry.size > 200) recentSentry.clear();
  recentSentry.set(chave, now);

  const eventId = globalThis.crypto.randomUUID().replace(/-/g, "");
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId,
    timestamp: sentAt,
    platform: "javascript",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    logger: "liquen",
    message: { formatted: message },
    extra: {
      ...context,
      ...(err instanceof Error ? { stack: err.stack } : {}),
    },
    exception:
      err instanceof Error
        ? { values: [{ type: err.name, value: err.message }] }
        : err !== undefined
          ? { values: [{ type: "Error", value: String(err) }] }
          : undefined,
  };

  // Envelope = 3 newline-separated JSON lines: headers, item header, payload.
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: sentAt })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;

  prenderAoPedido(
    fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${key}, sentry_client=liquen-logger/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(5000),
    }).then(
      () => {},
      () => {},
    ),
  );
}

function emit(level: Level, rawMessage: string, rawContext?: Context, rawErr?: unknown) {
  // Um único ponto de limpeza, ANTES de qualquer destino. A consola, o Sentry e
  // o webhook recebem exactamente os mesmos valores já redigidos — não há
  // caminho por onde um dado pessoal saia sem passar por aqui.
  const message = redactString(rawMessage);
  const context = redactContext(rawContext);
  // `null` conta como «sem erro» (revisão de 16/11, n.º 4): há quem chame
  // `log.error(msg, null, ctx)`, e o `null` ia como «null» para o canal e, no
  // Sentry, juntava todos esses erros num só «Error: null».
  const err = rawErr === undefined || rawErr === null ? undefined : redactValue(rawErr);

  const entry: Record<string, unknown> = {
    level,
    message,
    time: new Date().toISOString(),
    ...context,
  };

  if (err instanceof Error) {
    entry.error = { name: err.name, message: err.message, stack: err.stack };
  } else if (err !== undefined) {
    entry.error = err;
  }

  const sink = level === "error" || level === "warn" ? console.error : console.log;

  if (isProd) {
    sink(JSON.stringify(entry));
  } else {
    const ctx = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : "";
    sink(`[${level}] ${message}${ctx}`);
    if (err) sink(err);
  }

  if (level === "error") {
    alertWebhook(message, context, err);
    sentryCapture(message, context, err);
  }
}

export const log = {
  debug: (message: string, context?: Context) => emit("debug", message, context),
  info: (message: string, context?: Context) => emit("info", message, context),
  warn: (message: string, context?: Context) => emit("warn", message, context),
  error: (message: string, err?: unknown, context?: Context) =>
    emit("error", message, context, err),
};
