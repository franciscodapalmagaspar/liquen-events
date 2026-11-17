import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ARMADILHA DE TEMPO — O SELO DO INSTANTE EM QUE O FORMULÁRIO ABRIU
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Segunda camada do anti-spam (`docs/LEGAL-FORMULARIO.md`, ponto 4). O
 * servidor assina, com HMAC, o instante em que o formulário abriu; o envio
 * traz o selo de volta. Um envio menos de {@link MINIMO_MS} depois de abrir
 * leva a marca «possível spam» — e nunca é deitado fora (`veredito.ts`).
 *
 * ── O SEGREDO ─────────────────────────────────────────────────────────────
 * Nenhuma variável nova: deriva-se do `SESSION_SECRET` (o mesmo das sessões
 * e das ligações das propostas) com um rótulo só deste uso, para um selo do
 * formulário nunca poder valer como outra coisa. Sem segredo, a camada
 * desliga-se (`criarSelo` dá `null`) em vez de assinar com uma chave
 * aleatória por instância — essa chave faria o selo de uma instância parecer
 * falso noutra.
 *
 * ── O SELO EM FALTA OU INVÁLIDO NÃO É SPAM (desvio ao documento) ──────────
 * O documento diz que a assinatura em falta ou inválida é de robô. Aqui não,
 * e é de propósito, nos dois casos:
 *   · em falta: o service worker serve páginas guardadas, e uma página aberta
 *     antes desta versão manda o pedido sem selo durante dias;
 *   · inválido: rodar o `SESSION_SECRET` invalida os selos de todas as
 *     páginas que estão abertas nesse momento.
 * Nos dois, o pedido passa ao filtro de conteúdo sem marca nenhuma, e o estado
 * do selo fica no registo. Ver `veredito.ts`.
 */

import { MINIMO_MS } from "./tempo-minimo";

export { MINIMO_MS };
const ROTULO = "liquen:selo-do-formulario:v1";

/** A chave, derivada do segredo do servidor. `null` sem segredo. */
function chave(env: Record<string, string | undefined> = process.env): Buffer | null {
  const s = (env.SESSION_SECRET ?? env.ADMIN_SESSION_SECRET ?? "").trim();
  if (s.length >= 32) return createHash("sha256").update(`${ROTULO}:${s}`).digest();
  if (env.NODE_ENV !== "production") {
    return createHash("sha256").update(`${ROTULO}:desenvolvimento`).digest();
  }
  return null;
}

function assinar(instante: string, k: Buffer): string {
  return createHmac("sha256", k).update(instante).digest("base64url");
}

/** O selo de agora: `<instante em ms>.<assinatura>`. */
export function criarSelo(
  agora = Date.now(),
  env?: Record<string, string | undefined>,
): string | null {
  const k = chave(env);
  if (!k) return null;
  const instante = String(Math.floor(agora));
  return `${instante}.${assinar(instante, k)}`;
}

export type LeituraDoSelo =
  | { estado: "sem-selo" }
  | { estado: "sem-segredo" }
  | { estado: "invalido" }
  | { estado: "depressa"; ms: number }
  | { estado: "valido"; ms: number };

/** Lê o selo que o envio trouxe. */
export function lerSelo(
  selo: unknown,
  agora = Date.now(),
  env?: Record<string, string | undefined>,
): LeituraDoSelo {
  if (typeof selo !== "string" || selo === "") return { estado: "sem-selo" };
  const k = chave(env);
  if (!k) return { estado: "sem-segredo" };
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{43})$/.exec(selo);
  if (!m) return { estado: "invalido" };
  const esperada = Buffer.from(assinar(m[1], k));
  const recebida = Buffer.from(m[2]);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) {
    return { estado: "invalido" };
  }
  const ms = agora - Number(m[1]);
  // Um selo do futuro (relógios entre instâncias desacertados) dá um `ms`
  // negativo e conta como «depressa», como um envio de menos de 3 s. Só marca
  // o pedido, não o perde; e os formulários esperam uma folga além dos 3 s
  // (`useSeloDoFormulario`), que cobre um desacerto pequeno.
  if (ms < MINIMO_MS) return { estado: "depressa", ms };
  return { estado: "valido", ms };
}
