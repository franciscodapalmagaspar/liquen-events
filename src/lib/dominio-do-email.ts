import "server-only";
import { resolveMx, resolve4, resolve6 } from "node:dns/promises";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DOMÍNIO DESTE EMAIL RECEBE CORREIO?
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (28/10): um pedido chegou com um email que não existia, e a confirmação
 * nunca chegou a ninguém. O engano ANTES do @ nenhuma máquina apanha (é para
 * isso a confirmação dos contactos no formulário); o engano DEPOIS do @
 * apanha-se aqui: um domínio que não existe, ou que não recebe correio, recusa
 * o pedido com uma frase que diz qual é o campo.
 *
 * Só recusa quando o DNS responde que não há nada. Qualquer outra coisa — o
 * DNS lento, em baixo, uma resposta estranha — deixa passar: perder um pedido
 * verdadeiro por uma falha nossa é pior do que deixar passar um email mau, que
 * de resto ainda tem o telemóvel ao lado.
 */

const ESPERA_MS = 2500;
/** Os domínios já vistos, para não perguntar ao DNS de cada vez (por instância). */
const vistos = new Map<string, { recebe: boolean; ate: number }>();
const VALIDADE_MS = 6 * 60 * 60 * 1000;

/** «Não existe» ou «não tem registos»: as duas respostas que querem dizer que não. */
function eNao(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

async function pergunta(dominio: string): Promise<boolean> {
  try {
    const mx = await resolveMx(dominio);
    // «MX nulo» (RFC 7505): o domínio diz que não recebe correio.
    if (mx.length === 1 && mx[0].exchange === "") return false;
    if (mx.length > 0) return true;
  } catch (e) {
    if (!eNao(e)) throw e;
  }
  // Sem MX, o correio vai para o próprio domínio (RFC 5321 §5.1).
  for (const r of [resolve4, resolve6]) {
    try {
      if ((await r(dominio)).length > 0) return true;
    } catch (e) {
      if (!eNao(e)) throw e;
    }
  }
  return false;
}

/**
 * `false` só quando o DNS diz que o domínio não recebe correio; `true` em tudo
 * o resto, incluindo quando não respondeu a tempo.
 */
export async function dominioRecebeEmail(email: string): Promise<boolean> {
  const arroba = email.lastIndexOf("@");
  const dominio = email
    .slice(arroba + 1)
    .trim()
    .toLowerCase();
  if (arroba < 1 || !dominio) return true;
  const guardado = vistos.get(dominio);
  if (guardado && guardado.ate > Date.now()) return guardado.recebe;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const recebe = await Promise.race([
      pergunta(dominio),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ESPERA_MS);
      }),
    ]);
    // Sem resposta a tempo: deixa passar, e não se guarda.
    if (recebe === null) return true;
    vistos.set(dominio, { recebe, ate: Date.now() + VALIDADE_MS });
    return recebe;
  } catch {
    return true;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Só para os testes: esquecer os domínios já vistos. */
export function esquecerDominiosVistos(): void {
  vistos.clear();
}
