import "server-only";
import type { Quote } from "./orcamento/types";
import { apagarPedido } from "./apagar-pedido";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS 12 MESES DA POLÍTICA, EM CÓDIGO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A política de privacidade publicada no sítio diz:
 *
 *   «Pedidos que não deem origem a contrato são eliminados no prazo máximo de
 *    12 meses após o último contacto.»
 *
 * Não havia nada a fazê-lo. Havia dois trabalhos automáticos — os lembretes e
 * a cópia de segurança — e nenhum apagava seja o que for. A promessa estava
 * publicada e dependia de alguém se lembrar.
 *
 * ── PORQUE É QUE ISTO NÃO É UM TERCEIRO TRABALHO AUTOMÁTICO ───────────────
 *
 * Porque o plano do alojamento manda, e esta casa já foi mordida por assumir o
 * contrário: está escrito em `agendamento.contrato.test.ts` que um deploy foi
 * RECUSADO por uma agenda que corria mais do que uma vez por dia, e que o
 * autor «tinha assumido plano Pro por o projecto viver numa equipa. Assumi
 * mal, e só o deploy é que mo disse.»
 *
 * A retenção corre a seguir à CÓPIA DE SEGURANÇA, e a ordem não é um acaso —
 * é a melhor parte deste desenho: **nada é apagado sem estar dentro da cópia
 * desse mesmo dia**. Um trabalho à parte podia correr antes da cópia, ou num
 * dia em que ela falhasse, e aí um apagamento correcto seria uma perda.
 *
 * ── E CORRE POR LOTES ─────────────────────────────────────────────────────
 *
 * A cópia tem 60 segundos e a retenção entra depois dela. Apagar tudo de uma
 * vez num arranque com anos de pedidos por limpar estoirava esse tecto — e
 * pior, estoirava-o A MEIO, deixando pedidos meio apagados. Um lote por dia
 * drena qualquer atraso em poucos dias, e um dia a mais num prazo de doze
 * meses não é coisa nenhuma.
 */

/** O prazo da política, em milissegundos. */
export const PRAZO_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Quantos pedidos se apagam por passagem.
 *
 * Baixo de propósito: o orçamento de tempo é o que sobra dos 60 segundos da
 * cópia, e cada apagamento fala com a base e com o armazenamento várias vezes.
 */
export const LOTE = 20;

/**
 * O último contacto conhecido de um pedido.
 *
 * O MAIS RECENTE de tudo o que se sabe — a data de entrada, a última alteração
 * no back office, e a última mensagem trocada. Na dúvida entre duas datas,
 * fica a mais tardia: isso guarda o pedido durante mais tempo, e o erro que se
 * quer evitar aqui é apagar cedo de mais, nunca tarde de mais.
 *
 * Uma data ilegível não conta — e se NENHUMA contar, o pedido não é apagado
 * (ver `caducou`). Não saber quando alguém falou com um casal não pode ser
 * motivo para lhe apagar o processo.
 */
export function ultimoContacto(pedido: Quote): number | null {
  const candidatos: Array<string | undefined> = [
    pedido.submittedAt,
    pedido.lastUpdated,
    ...(pedido.messages ?? []).map((m) => m.at),
  ];
  const marcas = candidatos
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((n) => Number.isFinite(n)) as number[];
  return marcas.length ? Math.max(...marcas) : null;
}

/**
 * Este pedido já passou do prazo?
 *
 * Três travões, e cada um sozinho chega para NÃO apagar:
 *
 *  1. sem data conhecida, não se apaga (ver acima);
 *  2. um pedido GANHO não se apaga aqui, mesmo que o contrato ainda não
 *     exista na base — é cinto e suspensórios sobre o travão do contrato que
 *     já vive no `apagarPedido`, e custa uma linha;
 *  3. e a comparação é estrita: exactamente 12 meses ainda não passou.
 */
export function caducou(pedido: Quote, agora: number): boolean {
  if (pedido.status === "aceite") return false;
  const contacto = ultimoContacto(pedido);
  if (contacto === null) return false;
  return agora - contacto > PRAZO_MS;
}

export interface ResultadoDaRetencao {
  /** Quantos estavam fora do prazo nesta passagem. */
  caducados: number;
  /** Quantos foram mesmo apagados. */
  apagados: number;
  /** Os que não puderam ser apagados, e porquê — quase sempre um contrato. */
  ficaram: Array<{ pedido: string; motivo: string }>;
}

/**
 * Apaga um lote de pedidos fora do prazo.
 *
 * Recebe a lista de pedidos já lida por quem a chama (a cópia de segurança já
 * a tem em mãos): ler tudo outra vez seria pagar duas vezes pela mesma leitura
 * dentro do mesmo orçamento de 60 segundos.
 *
 * Nunca lança. A retenção é a última coisa a correr num trabalho cuja razão de
 * ser é outra, e não pode ser ela a deitar abaixo a cópia de segurança.
 */
export async function correrRetencao(
  pedidos: Quote[],
  agora: number = Date.now(),
  lote: number = LOTE,
): Promise<ResultadoDaRetencao> {
  const fora = pedidos.filter((p) => caducou(p, agora));
  const resultado: ResultadoDaRetencao = { caducados: fora.length, apagados: 0, ficaram: [] };

  // Os mais antigos primeiro: se houver atraso, começa-se pelo que está há
  // mais tempo a violar a política.
  fora.sort((a, b) => (ultimoContacto(a) ?? 0) - (ultimoContacto(b) ?? 0));

  for (const pedido of fora.slice(0, lote)) {
    try {
      const r = await apagarPedido(pedido.id);
      if (r.apagado) {
        resultado.apagados++;
        if (r.falhou.length) {
          log.warn("retenção: pedido apagado com pontas soltas", {
            pedido: pedido.id,
            ficou: r.falhou,
          });
        }
      } else {
        resultado.ficaram.push({
          pedido: pedido.id,
          motivo: r.motivo ?? "não apagado",
        });
      }
    } catch (e) {
      // Não pode acontecer (o `apagarPedido` não lança), e mesmo
      // assim: um pedido não pode travar os outros.
      resultado.ficaram.push({ pedido: pedido.id, motivo: "erro" });
      log.error("retenção: apagamento rebentou", e, { pedido: pedido.id });
    }
  }

  if (resultado.caducados > 0) {
    log.info("retenção dos 12 meses", {
      caducados: resultado.caducados,
      apagados: resultado.apagados,
      ficaram: resultado.ficaram.length,
      por_apagar: Math.max(0, resultado.caducados - lote),
    });
  }
  return resultado;
}
