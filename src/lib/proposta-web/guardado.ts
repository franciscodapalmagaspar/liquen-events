import "server-only";
import { createHash } from "node:crypto";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A PROPOSTA ONLINE CALCULA UMA VEZ — E NUNCA MAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (23/10): «quero que melhores mesmo muito a resposta e a rapidez
 * (…) de quando carregamos no email para ver e ela demora tempo até aparecer».
 *
 * A cada visita, a página refazia o trabalho pesado do motor do PDF: ler as
 * medidas das fotografias (e, para as que a biblioteca não conhecia, descarregar
 * o original e passá-lo pelo `sharp`), escolher o álbum, e tirar as cores da
 * paleta de doze miniaturas. Numa função acabada de acordar são segundos — e
 * o resultado é SEMPRE o mesmo, porque uma proposta enviada não muda.
 *
 * Por isso fica guardado: em memória (a mesma instância responde logo) e na
 * tabela `app_state` (a próxima instância também). A chave é o conteúdo do
 * documento — um documento diferente é outra chave, nunca uma resposta velha.
 *
 * Ficar igual ao PDF que seguiu não é um risco, é o objectivo: esse PDF também
 * ficou guardado no envio e nunca mais é redesenhado.
 */

/** Sobe quando muda a FORMA do que se guarda (o `ConteudoWeb`, as cores). */
export const VERSAO_DO_GUARDADO = 1;

const memoria = new Map<string, Promise<unknown>>();
const MAXIMO_EM_MEMORIA = 60;

/** `proposta-web:<tipo>:<proposta>:<impressão do que entra na conta>`. */
export function chaveDoGuardado(tipo: string, proposalId: string, ...partes: string[]): string {
  const impressao = createHash("sha256")
    .update(`${VERSAO_DO_GUARDADO}\n${partes.join("\n")}`)
    .digest("hex")
    .slice(0, 24);
  return `proposta-web:${tipo}:${proposalId.replace(/[^a-zA-Z0-9_-]/g, "")}:${impressao}`;
}

/**
 * O valor guardado, ou calculado e guardado. Um valor que não serve (`serve`
 * falso — por exemplo uma paleta vazia porque o armazenamento falhou) não fica
 * guardado: a próxima visita tenta outra vez.
 */
export function guardadoOuCalculado<T>(
  chave: string,
  calcular: () => Promise<T>,
  serve: (v: T) => boolean = () => true,
): Promise<T> {
  const ja = memoria.get(chave) as Promise<T> | undefined;
  if (ja) return ja;
  const feito = (async () => {
    const lido = await getState<T>(chave).catch(() => null);
    if (lido !== null && serve(lido)) return lido;
    const valor = await calcular();
    if (serve(valor)) {
      // Esperado de propósito: numa função do servidor, o que não se espera
      // pode ser cortado quando a resposta sai. É uma escrita só, na visita
      // que calculou — as seguintes já não passam por aqui.
      const r = await setState(chave, valor).catch(() => null);
      if (!r?.gravado) log.warn("proposta online: o cálculo não ficou guardado", { chave });
    } else {
      // Nem na memória: a próxima visita tenta outra vez.
      memoria.delete(chave);
    }
    return valor;
  })();
  feito.catch(() => memoria.delete(chave));
  memoria.set(chave, feito);
  if (memoria.size > MAXIMO_EM_MEMORIA) memoria.delete(memoria.keys().next().value!);
  return feito;
}

/** Só para os testes. */
export function esquecerGuardados(): void {
  memoria.clear();
}
