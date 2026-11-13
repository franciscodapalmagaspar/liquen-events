import "server-only";
import { getSupabase } from "./supabase";
import { isUniqueViolation } from "./invoices-store";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM TRINCO: «ISTO JÁ ESTÁ A ACONTECER NOUTRO PEDIDO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Auditoria de 13/11 (estúdio, n.º 3): dois envios da mesma proposta EM VOO
 * ao mesmo tempo — a rede do telemóvel tosse, o ecrã repõe o botão, ela carrega
 * outra vez — liam os dois as propostas irmãs antes de qualquer um ter enviado,
 * e a trava de repetição (que olha para o que JÁ seguiu) não via nada. Dois
 * emails ao casal, com dois links.
 *
 * O trinco é uma linha na `app_state` com a chave `trinco:<nome>`, criada com um
 * INSERT simples — não um upsert. A chave é primária: se dois pedidos tentam ao
 * mesmo tempo, o Postgres deixa entrar UM, e o outro recebe 23505. É a única
 * coisa aqui que tem de ser atómica, e é o Postgres que o garante.
 *
 * Um trinco esquecido (a função morreu a meio, sem chegar ao `soltar`) não pode
 * travar o envio para sempre: guarda até quando vale, e um trinco vencido é
 * apagado — só se ainda for AQUELE (compara-se a data de criação) — e tenta-se
 * outra vez uma única vez.
 *
 * Se a base de dados não responder, o trinco ABRE (e diz-se no registo): a
 * trava de repetição de sempre continua lá, e travar o envio dela por causa de
 * um soluço do Supabase seria trocar um defeito raro por um frequente.
 *
 * Sem Supabase (desenvolvimento), vale um mapa em memória: um processo só.
 *
 * Custo: duas escritas pequenas por envio (criar e apagar). Nada fica guardado.
 */

export type Trinco = { ok: true; soltar: () => Promise<void> } | { ok: false; ate: string };

const PREFIXO = "trinco:";
const emMemoria = new Map<string, number>();

/** Para os testes: esvazia o mapa do modo sem Supabase. */
export function __limparTrincosEmMemoria() {
  emMemoria.clear();
}

export async function fecharTrinco(nome: string, validadeMs: number): Promise<Trinco> {
  const sb = getSupabase();
  if (!sb) {
    const agora = Date.now();
    const ate = emMemoria.get(nome);
    if (ate && ate > agora) return { ok: false, ate: new Date(ate).toISOString() };
    const meu = agora + validadeMs;
    emMemoria.set(nome, meu);
    return {
      ok: true,
      soltar: async () => {
        if (emMemoria.get(nome) === meu) emMemoria.delete(nome);
      },
    };
  }

  const key = PREFIXO + nome;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const criadoEm = new Date().toISOString();
    const ate = new Date(Date.now() + validadeMs).toISOString();
    try {
      const { error } = await sb
        .from("app_state")
        .insert({ key, value: { ate }, updated_at: criadoEm });
      if (!error) {
        return {
          ok: true,
          soltar: async () => {
            try {
              await sb.from("app_state").delete().eq("key", key).eq("updated_at", criadoEm);
            } catch (err) {
              // Fica até vencer: trava no máximo `validadeMs`, e diz-se.
              log.warn("trinco: não foi possível soltar — vence sozinho", { key, erro: err });
            }
          },
        };
      }
      if (!isUniqueViolation(error)) throw error;
    } catch (err) {
      log.warn("trinco: a base de dados não respondeu — segue sem trinco", { key, erro: err });
      return { ok: true, soltar: async () => {} };
    }

    // Já existe. Ainda vale?
    try {
      const { data } = await sb
        .from("app_state")
        .select("value, updated_at")
        .eq("key", key)
        .maybeSingle();
      const valeAte = (data?.value as { ate?: unknown } | null)?.ate;
      if (typeof valeAte === "string" && Date.parse(valeAte) > Date.now()) {
        return { ok: false, ate: valeAte };
      }
      // Vencido (ou ilegível): sai — só se ainda for o mesmo — e tenta-se outra vez.
      if (data) {
        await sb.from("app_state").delete().eq("key", key).eq("updated_at", data.updated_at);
      }
    } catch (err) {
      log.warn("trinco: não foi possível ler o trinco existente — segue sem trinco", {
        key,
        erro: err,
      });
      return { ok: true, soltar: async () => {} };
    }
  }
  // Duas voltas e outro pedido ganhou entretanto: está mesmo ocupado.
  return { ok: false, ate: new Date(Date.now() + validadeMs).toISOString() };
}
