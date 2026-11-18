import type { z } from "zod";
import { MemoriaComTecto } from "./memoria-com-tecto";
import { pedidoLidoSchema } from "./orcamento/pedido.esquema";
import { documentoLidoSchema } from "./proposal-doc.esquema";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO E O DOCUMENTO DO ESTÚDIO, LIDOS COM ESQUEMA — EM MODO DE SÓ REGISTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * P6 de docs/ESTRUTURA-DOS-DADOS.md. A ESCRITA do pedido já é validada
 * (`validation.ts`); a LEITURA era um `as Quote` e um `as ProposalDoc`: um
 * `jsonb` com uma forma inesperada entrava na aplicação e dava um `undefined`
 * silencioso três ecrãs depois.
 *
 * Os esquemas vivem ao lado do que descrevem (`orcamento/pedido.esquema.ts`,
 * `proposal-doc.esquema.ts`) e são ESTRUTURAIS — os tipos de cada chave de topo e das
 * coleções que se percorrem —, e não as regras de negócio da escrita (tetos,
 * comprimentos), que numa leitura só dariam alarmes falsos. Todas as chaves
 * desconhecidas passam (`looseObject`): um documento antigo ou mais novo do que
 * o código não é um erro.
 *
 * MODO DE SÓ REGISTAR: nada é recusado nem alterado — o valor lido segue tal e
 * qual. Uma forma inesperada fica no registo, UMA vez por registo e por forma,
 * com o caminho e o tipo do problema, NUNCA com o valor (são dados de
 * clientes). Recusar vem depois, se o registo ficar limpo, e na rota — nunca
 * no ecrã dela.
 *
 * Medido a 18/11 em produção (só contagens, consulta no P6 do documento): os 47
 * pedidos e os 52 documentos passam. O achado: 25 dos 47 pedidos não têm
 * `priceBreakdown`, que o tipo `Quote` diz obrigatório — por isso aqui é
 * opcional, e o tipo mente (fica registado no documento, não se corrige aqui).
 */

/** O que fica no registo de uma leitura fora do esquema: caminhos e códigos. */
export function formaDosProblemas(erro: z.ZodError): string[] {
  return [
    ...new Set(erro.issues.map((i) => `${i.path.map(String).join(".") || "(raiz)"}:${i.code}`)),
  ].sort();
}

/** Os registos lidos com esquema, e o esquema de cada um. */
export type TipoLido = "pedido" | "documento-do-estudio";
const ESQUEMAS: Record<TipoLido, z.ZodType> = {
  pedido: pedidoLidoSchema,
  "documento-do-estudio": documentoLidoSchema,
};

/** Já registados, para cada forma estragada ir ao registo uma vez por processo. */
const jaRegistados = new MemoriaComTecto<string, true>(500);

/**
 * Já verificados nesta versão. Uma lista lê todos os pedidos de cada vez, e
 * verificar o mesmo pedido, sem mudanças, em cada pedido HTTP era processador
 * gasto para nada (regra 7). A `versao` é o carimbo de alteração do registo.
 * Cheia, esquece o verificado há mais tempo (e não todos de uma vez).
 */
const jaVerificados = new MemoriaComTecto<string, boolean>(5000);

/**
 * Verifica `valor` e, se não tiver a forma, regista-o. Nunca lança e nunca
 * muda o valor. Devolve se passou (para os testes; quem lê não precisa).
 */
export function registarSeForaDoEsquema(
  tipo: TipoLido,
  id: string,
  valor: unknown,
  /** O carimbo de alteração; sem ele verifica-se sempre. */
  versao?: string,
): boolean {
  // Sem id ou sem carimbo não há como saber se é o mesmo registo: verifica-se.
  const visto = id && versao ? `${tipo}|${id}|${versao}` : null;
  const antes = visto ? jaVerificados.ler(visto) : undefined;
  if (antes !== undefined) return antes;
  const r = ESQUEMAS[tipo].safeParse(valor);
  if (visto) jaVerificados.guardar(visto, r.success);
  if (r.success) return true;
  const problemas = formaDosProblemas(r.error);
  const chave = `${tipo}|${id}|${problemas.join(",")}`;
  if (!jaRegistados.tem(chave)) {
    jaRegistados.guardar(chave, true);
    log.warn("leitura fora do esquema (só registo, nada foi recusado)", {
      tipo,
      id,
      problemas: problemas.slice(0, 20).join(" "),
    });
  }
  return false;
}
