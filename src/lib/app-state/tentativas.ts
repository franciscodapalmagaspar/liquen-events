import "server-only";
import { eRelogioAdiantado, isMissingTable } from "@/lib/repository";
import type { MotivoDeFalha } from "./resultado";
import { comTecto } from "./tecto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FALHA PASSAGEIRA NÃO PODE CUSTAR UM RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O mesmo desenho que `proposal-storage.descarregar` já usa para as fotos, e
 * pela mesma razão: uma ligação reciclada do outro lado, um pico no Supabase, e
 * a gravação morria à primeira. Aqui o que morre é a montagem de uma proposta.
 *
 * Duas tentativas extra, com pausa curta e crescente (150 ms, 300 ms), e um
 * tecto de tempo por tentativa — sem ele um pedido pendurado fica com a rota
 * inteira na mão até a plataforma matar a função.
 *
 * O que NÃO se repete: uma tabela em falta e uma permissão recusada. Essas
 * respondem exactamente o mesmo à terceira vez que à primeira, e repeti-las só
 * atrasa o momento em que o ecrã pode dizer a verdade.
 */
export const TENTATIVAS = 3;
export const PAUSA_MS = 150;
export const TEMPO_POR_TENTATIVA_MS = 8000;

/** Uma escrita recusada por falta de autorização — do Postgres (42501,
 *  `insufficient_privilege`) ou da política de RLS, que o PostgREST devolve com
 *  o mesmo código e a mensagem da política. */
function ehSemPermissao(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { code?: unknown }).code === "42501") return true;
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /permission denied|row-level security|insufficient[_ ]privilege|not authorized|jwt/i.test(msg)
  );
}

export function motivoDaFalha(err: unknown): MotivoDeFalha {
  // O relógio adiantado (PGRST303, «JWT issued at future») é PASSAGEIRO e
  // repete-se — mas a mensagem diz «JWT», e a regra de baixo tomava-o por uma
  // permissão recusada, que nunca se repete. Resultado: nenhuma escrita nem
  // leitura do app_state repetia o erro mais comum (auditoria de 13/11). A
  // mesma deteção do `repository.ts` (`eRelogioAdiantado`).
  if (eRelogioAdiantado(err)) return "escrita-recusada";
  if (isMissingTable(err)) return "tabela-em-falta";
  if (ehSemPermissao(err)) return "sem-permissao";
  return "escrita-recusada";
}

/**
 * Um pedido ao Supabase, com as tentativas da casa: repete enquanto a falha
 * for passageira ({@link motivoDaFalha} = `escrita-recusada`), com pausa
 * crescente e tecto por tentativa. UM só ciclo para ler, gravar e apagar.
 */
export async function comTentativas<R extends { error: unknown }>(
  pedido: () => PromiseLike<R>,
): Promise<{ ok: true; resposta: R } | { ok: false; erro: unknown }> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await comTecto(pedido(), TEMPO_POR_TENTATIVA_MS);
      if (!resposta.error) return { ok: true, resposta };
      ultimoErro = resposta.error;
    } catch (err) {
      ultimoErro = err;
    }
    // Instalação incompleta: repetir dá a mesma resposta e só atrasa o aviso.
    if (motivoDaFalha(ultimoErro) !== "escrita-recusada") break;
    if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
  }
  return { ok: false, erro: ultimoErro };
}
