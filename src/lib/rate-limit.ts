import "server-only";

/**
 * Rate limiter for public endpoints (anti-spam).
 *
 * Uses Upstash Redis (via its REST API — no SDK dependency) when configured, so
 * the limit holds ACROSS serverless instances; otherwise falls back to a fast
 * in-memory limiter (per instance). Redis errors fail OPEN to the in-memory
 * path — a cache outage must never take the site's forms down.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Accepts a plain Request (NextRequest extends it) — only the headers are read,
// so route handlers typed with either can pass their request straight through.
export function clientIp(req: Request): string {
  // Prefer headers the hosting platform sets itself (Vercel overwrites these
  // per request); a client-supplied x-forwarded-for is trivially forged and
  // would let a bot rotate "IPs" past the rate limit, so it comes last.
  const vercel = req.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

interface RateResult {
  ok: boolean;
  retryAfter?: number;
}

// ── In-memory limiter (per instance) — default & fallback ──
function memoryRateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { ok: true };
}

// ── Distributed limiter via Upstash Redis REST ──
// Throws on any failure so the caller can degrade to the in-memory limiter.
async function pipeline(
  url: string,
  token: string,
  comandos: string[][],
): Promise<Array<{ result?: number }>> {
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
    signal: AbortSignal.timeout(2000),
  });
  if (!res.ok) throw new Error(`upstash ${res.status}`);
  return (await res.json()) as Array<{ result?: number }>;
}

/**
 * ── A JANELA É FIXA, E ISSO NÃO É UM PORMENOR DE IMPLEMENTAÇÃO ─────────────
 *
 * O prazo da chave punha-se a CADA toque (`INCR` + `PEXPIRE` juntos). Parece
 * inofensivo e é outra política com o mesmo nome: enquanto houver pedidos, a
 * chave nunca chega ao fim e o contador só sobe. Um tecto que diz «3 pedidos por
 * hora» passava a ser «3 e nunca mais» — e quem o gastava era quem estava a
 * bater à porta, não quem tinha a chave. Em concreto, um estranho que soubesse
 * o endereço da Catarina e mandasse um pedido de recuperação de vez em quando
 * mantinha a recuperação DELA fechada indefinidamente; e o limitador de memória,
 * que marca o fim da janela quando ela abre, contava o contrário do outro —
 * portanto o comportamento mudava consoante houvesse Upstash configurado.
 *
 * Agora o prazo só é posto quando a chave AINDA NÃO O TEM (o `PTTL` diz -1 numa
 * chave sem prazo e -2 numa que não existe), e o `Retry-After` passa a ser o que
 * FALTA e não a janela inteira.
 *
 * Fica uma frincha assumida: entre o `INCR` e o `PEXPIRE` a chave existe sem
 * prazo. Se o processo morrer aí, o pedido seguinte vê `-1` e põe o prazo a
 * partir DESSE instante — a janela desloca-se, não desaparece.
 */
async function redisRateLimit(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateResult> {
  const data = await pipeline(url, token, [
    ["INCR", key],
    ["PTTL", key],
  ]);
  const count = Number(data?.[0]?.result ?? 0);
  const faltaMs = Number(data?.[1]?.result ?? -1);

  if (!(faltaMs > 0)) {
    await pipeline(url, token, [["PEXPIRE", key, String(windowMs)]]);
  }

  if (count <= limit) return { ok: true };
  return { ok: false, retryAfter: Math.ceil((faltaMs > 0 ? faltaMs : windowMs) / 1000) };
}

/**
 * Returns `{ ok: true }` if the caller is within the limit, or
 * `{ ok: false, retryAfter }` (seconds) when it should be throttled.
 */
export async function rateLimit(key: string, limit = 5, windowMs = 60_000): Promise<RateResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      return await redisRateLimit(url, token, key, limit, windowMs);
    } catch {
      return memoryRateLimit(key, limit, windowMs); // fail open
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}

// Opportunistic cleanup so the in-memory map can't grow unbounded.
/**
 * Só PERGUNTA se a chave já passou do limite — não gasta tentativa nenhuma.
 *
 * Para o login (10/11, decisão dela): a escada por conta conta só as FALHAS, e
 * antes disto só era consultada depois de a palavra-passe falhar — por isso um
 * palpite certo entrava sempre, mesmo com a conta «fechada». O degrau mais alto
 * passa a ser perguntado ANTES de verificar a palavra-passe (o que poupa também
 * o bcrypt).
 *
 * `count >= limit` nos dois motores: na memória o contador pára no limite; no
 * Redis o INCR continua a contar, e o limite já foi gasto quando chega a ele.
 */
export async function limiteEsgotado(key: string, limit: number): Promise<RateResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      const data = await pipeline(url, token, [
        ["GET", key],
        ["PTTL", key],
      ]);
      const count = Number(data?.[0]?.result ?? 0);
      const faltaMs = Number(data?.[1]?.result ?? -1);
      return count >= limit
        ? { ok: false, retryAfter: Math.ceil((faltaMs > 0 ? faltaMs : 60_000) / 1000) }
        : { ok: true };
    } catch {
      /* cai na memória, como o `rateLimit` */
    }
  }
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt || b.count < limit) return { ok: true };
  return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000) };
}

let lastSweep = 0;
export function sweep(): void {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now > b.resetAt) buckets.delete(k);
  }
}
