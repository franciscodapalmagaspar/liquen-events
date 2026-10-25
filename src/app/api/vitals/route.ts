import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { log } from "@/lib/logger";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { sanitizeTelemetryPath } from "@/lib/safe-path";

export const runtime = "nodejs";

/**
 * Real-user Web Vitals collector. The client (components/WebVitals) beacons one
 * record per finalized metric (LCP, CLS, INP, TTFB, FCP) with its Google
 * "good / needs-improvement / poor" rating and the page it happened on. We log
 * a small, fixed set of fields via the app logger so real-world fluidity in the
 * field — not just the lab (Lighthouse + the Playwright harness) — is
 * observable. Public by necessity (browsers post here): rate-limited, strictly
 * validated, never echoes anything back.
 */
const VitalSchema = z.object({
  name: z.enum(["LCP", "CLS", "INP", "TTFB", "FCP"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  path: z.string().max(256).optional(),
  nav: z.string().max(32).optional(), // navigationType (navigate/reload/back_forward/prerender)
  conn: z.string().max(16).optional(), // effectiveType (4g/3g/…)
});

export async function POST(req: NextRequest) {
  sweep();
  // A page can send up to ~5 metrics; allow a comfortable burst per client.
  if (!(await rateLimit(`vitals:${clientIp(req)}`, 40, 60_000)).ok) {
    // 204 e não 429: acima do tecto deita-se fora em silêncio. Um 429 aparecia
    // a vermelho na consola da página do visitante (e o Lighthouse desconta-o
    // nas boas práticas), por uma coisa que ele não pediu. Medido na base de
    // sites, onde as boas práticas desciam a 93–96 por isto.
    return new NextResponse(null, { status: 204 });
  }
  try {
    const parsed = VitalSchema.safeParse(await req.json().catch(() => null));
    if (parsed.success) {
      const v = parsed.data;
      // CLS is unitless; the rest are milliseconds. Round to keep logs tidy.
      const value = v.name === "CLS" ? Number(v.value.toFixed(4)) : Math.round(v.value);
      log.info("web-vital", {
        metric: v.name,
        value,
        rating: v.rating,
        // Este endpoint é PÚBLICO: o corpo é escrito por quem quiser, e daqui
        // vai direito para os registos de produção. Limpar no cliente não
        // chega — qualquer outro emissor (um bot, um separador antigo com o
        // pacote anterior, um pedido forjado à mão) poria na mesma um
        // /portal/<token> nos registos. Por isso limpa-se também aqui.
        path: v.path ? sanitizeTelemetryPath(v.path) : undefined,
        nav: v.nav,
        conn: v.conn,
      });
    }
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}
