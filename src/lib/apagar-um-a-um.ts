import { log } from "@/lib/logger";

/**
 * Os dois gestos que o `apagar-pedido.ts` repete em cada passo — apagar uma
 * lista um a um, e ler uma lista sem deixar uma falha rebentar o resto —,
 * escritos uma vez. Nenhum dos dois lança.
 */

/**
 * Apaga um a um. Uma falha não pára os outros: fica em `falharam`, e quem
 * chama decide o que ela quer dizer. O erro vai para o registo com `onde`.
 */
export async function umAUm<T>(
  itens: readonly T[],
  apagar: (item: T) => Promise<void>,
  onde: (item: T) => { mensagem: string; contexto: Record<string, unknown> },
): Promise<{ sairam: T[]; falharam: T[] }> {
  const sairam: T[] = [];
  const falharam: T[] = [];
  for (const item of itens) {
    try {
      await apagar(item);
      sairam.push(item);
    } catch (e) {
      falharam.push(item);
      const { mensagem, contexto } = onde(item);
      log.error(mensagem, e, contexto);
    }
  }
  return { sairam, falharam };
}

/** Lê uma lista; se falhar, regista e devolve `null` (quem chama diz o que conta). */
export async function lerOuNull<T>(
  ler: () => Promise<T[]>,
  mensagem: string,
  pedido: string,
): Promise<T[] | null> {
  try {
    return await ler();
  } catch (e) {
    log.error(mensagem, e, { pedido });
    return null;
  }
}
