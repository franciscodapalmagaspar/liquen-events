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
  // (O `EVAL` da reserva devolve uma lista; quem o chama lê-a como `unknown`.)
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
/**
 * As credenciais do Redis (Upstash), pelos dois nomes possíveis (10/11):
 * `UPSTASH_REDIS_REST_*` quando se copiam à mão da consola do Upstash, e
 * `KV_REST_API_*`, que é o que a Vercel escreve sozinha quando o Upstash se
 * liga pelo painel dela (Storage → Upstash for Redis → Connect). Sem nenhum,
 * os limites ficam na memória de cada instância, como até aqui.
 */
function credenciaisDoRedis(): { url?: string; token?: string } {
  return {
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
  };
}

/**
 * ── O UPSTASH GASTA-SE SÓ ONDE PROTEGE (10/11, regra dela) ─────────────────
 *
 * Ela: «é mesmo importante manter muito abaixo o Upstash». Cada chamada ao
 * Redis são 2–3 comandos, e o plano gratuito tem um tecto mensal. A proposta
 * online, sozinha, faz ~60 pedidos por visita (página, PDF, fotografias): se
 * todos fossem ao Redis, uma visita gastava ~150 comandos.
 *
 * Por isso a omissão é a MEMÓRIA da instância — custo zero, e chega para o
 * que é anti-abuso de volume (telemetria, imagens, páginas da proposta, cujos
 * códigos de 12 símbolos já não se adivinham). Só pede `{ global: true }` o
 * que protege CONTAS e ENVIOS — entrar, chave de acesso, recuperação, o
 * formulário do pedido e as confirmações por email —, onde um limite por
 * instância deixaria passar quem tenta de muitos sítios. São poucas por dia.
 *
 * Quem acrescentar um `rateLimit` novo: deixa a omissão, a não ser que proteja
 * uma conta ou um envio. Um teste (`rate-limit.global.test.ts`) prende a lista.
 */
export async function rateLimit(
  key: string,
  limit = 5,
  windowMs = 60_000,
  opcoes: { global?: boolean } = {},
): Promise<RateResult> {
  const { url, token } = opcoes.global ? credenciaisDoRedis() : {};
  if (url && token) {
    try {
      return await redisRateLimit(url, token, key, limit, windowMs);
    } catch {
      return memoryRateLimit(key, limit, windowMs); // fail open
    }
  }
  return memoryRateLimit(key, limit, windowMs);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RESERVAR UM LUGAR, E DEVOLVÊ-LO SE NÃO FOR USADO (revisões de 16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O tecto de emails da recuperação reserva o lugar ANTES de saber se o envio
 * vai acontecer — é o que o torna atómico numa rajada — e devolve-o quando
 * nada sai (a base de dados falhou, o SMTP não enviou). Sem a devolução, três
 * falhas do Supabase deixavam a conta uma hora sem poder receber a ligação.
 *
 * Não se usa o `rateLimit` para isto porque uma devolução tem de saber três
 * coisas que ele não guarda:
 *
 *  · ONDE ficou a reserva (`onde`): uma reserva feita na memória, por o Redis
 *    ter falhado, só se devolve na memória, e vice-versa;
 *  · de QUE JANELA era (`janela`): uma devolução que chega depois de a janela
 *    acabar não pode recriar a chave (no Redis, um DECR numa chave que já não
 *    existe criava-a a -1 e SEM PRAZO) nem tirar um lugar à janela nova que
 *    entretanto abriu. No Redis, a janela tem um identificador aleatório numa
 *    chave irmã (`<chave>:janela`) com o mesmo prazo; na memória, é o fim da
 *    janela (`resetAt`);
 *  · e que os dois motores contem o MESMO: um pedido RECUSADO não gasta nada,
 *    em nenhum dos dois. Na memória isto já era assim; no Redis o INCR contava
 *    também os recusados. Aqui, no Redis, tudo — ler, decidir, incrementar e
 *    pôr o prazo — é UM script (`EVAL`), atómico: recusa sem incrementar.
 *    Assim, «o lugar volta» quer dizer o mesmo nos dois motores.
 *
 * O `rateLimit` de sempre (entrada, passkeys, orçamento) não mudou: nenhum
 * desses devolve lugares.
 */
export interface Reserva {
  ok: boolean;
  retryAfter?: number;
  onde: "redis" | "memoria";
  /** Identificador da janela onde a reserva foi feita. */
  janela: string;
  chave: string;
}

/** Reservar: lê, decide e incrementa numa só ida, sem incrementar ao recusar. */
export const SCRIPT_RESERVAR = `
local limite = tonumber(ARGV[1])
local janelaMs = tonumber(ARGV[2])
local irma = KEYS[1] .. ':janela'
local pttl = redis.call('PTTL', KEYS[1])
local contagem = 0
if pttl == -2 then
  redis.call('SET', KEYS[1], 0, 'PX', janelaMs)
  redis.call('SET', irma, ARGV[3], 'PX', janelaMs)
  pttl = janelaMs
else
  contagem = tonumber(redis.call('GET', KEYS[1])) or 0
  if pttl == -1 then
    redis.call('PEXPIRE', KEYS[1], janelaMs)
    pttl = janelaMs
  end
end
local janela = redis.call('GET', irma)
if not janela then
  redis.call('SET', irma, ARGV[3], 'PX', pttl)
  janela = ARGV[3]
end
if contagem >= limite then
  return {0, pttl, janela}
end
redis.call('INCR', KEYS[1])
return {1, pttl, janela}
`;

/** Devolver: só na mesma janela, só se a chave existir, nunca abaixo de zero. */
export const SCRIPT_DEVOLVER = `
if redis.call('GET', KEYS[1] .. ':janela') ~= ARGV[1] then
  return 0
end
local valor = redis.call('GET', KEYS[1])
if not valor or tonumber(valor) <= 0 then
  return 0
end
redis.call('DECR', KEYS[1])
return 1
`;

function reservarNaMemoria(key: string, limit: number, windowMs: number): Reserva {
  const r = memoryRateLimit(key, limit, windowMs);
  const b = buckets.get(key);
  return { ...r, onde: "memoria", janela: String(b?.resetAt ?? 0), chave: key };
}

/**
 * Reserva um lugar. Com `{ global: true }` e Redis configurado, no Redis (um
 * comando `EVAL`); senão, ou se o Redis falhar, na memória da instância.
 */
export async function reservarLugar(
  key: string,
  limit: number,
  windowMs: number,
  opcoes: { global?: boolean } = {},
): Promise<Reserva> {
  const { url, token } = opcoes.global ? credenciaisDoRedis() : {};
  if (url && token) {
    try {
      const novaJanela = globalThis.crypto.randomUUID();
      const data = await pipeline(url, token, [
        ["EVAL", SCRIPT_RESERVAR, "1", key, String(limit), String(windowMs), novaJanela],
      ]);
      const r = (data?.[0] as { result?: unknown } | undefined)?.result;
      if (Array.isArray(r) && r.length === 3) {
        const ok = Number(r[0]) === 1;
        const faltaMs = Number(r[1]);
        return {
          ok,
          ...(ok ? {} : { retryAfter: Math.ceil((faltaMs > 0 ? faltaMs : windowMs) / 1000) }),
          onde: "redis",
          janela: String(r[2]),
          chave: key,
        };
      }
      throw new Error("resposta inesperada do Redis");
    } catch {
      /* cai na memória, como o `rateLimit` — e a reserva diz que ficou lá */
    }
  }
  return reservarNaMemoria(key, limit, windowMs);
}

/**
 * Devolve um lugar reservado que não chegou a ser usado. Só uma reserva com
 * `ok: true`, só ao sítio onde ficou, só na mesma janela, nunca abaixo de
 * zero. Falhar a devolução não é grave — a janela acaba na mesma.
 */
export async function devolverLugar(reserva: Reserva): Promise<void> {
  if (!reserva.ok) return;
  if (reserva.onde === "redis") {
    const { url, token } = credenciaisDoRedis();
    if (!url || !token) return;
    try {
      await pipeline(url, token, [["EVAL", SCRIPT_DEVOLVER, "1", reserva.chave, reserva.janela]]);
    } catch {
      /* não se devolve noutro sítio: a reserva não estava lá */
    }
    return;
  }
  const b = buckets.get(reserva.chave);
  if (!b || Date.now() > b.resetAt || String(b.resetAt) !== reserva.janela) return;
  if (b.count > 0) b.count--;
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
  const { url, token } = credenciaisDoRedis();
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
