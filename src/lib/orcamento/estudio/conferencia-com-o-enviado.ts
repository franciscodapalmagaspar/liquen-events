/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONFERÊNCIA COM O QUE SEGUIU PARA O CLIENTE — AS REGRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ao abrir o estúdio, o total a pagar do ecrã compara-se com o da última
 * proposta ENVIADA. Aqui ficam as duas decisões, sem React nem rede, para se
 * testarem sozinhas; a mecânica (quando se lê a lista das versões) está em
 * `useConferenciaComOEnviado`.
 *
 * As comparações são AO CÊNTIMO, sem folga nenhuma (`.claude/rules/dinheiro.md`):
 * um cêntimo de diferença entre o que o casal recebeu e o que o ecrã mostra é
 * uma diferença, e mostra-se.
 */
import { mesmoValorAoCentimo, round2 } from "@/lib/money";
import type { ActivityEntry } from "@/lib/orcamento/types";

/** O que a lista das versões diz de cada envio (só o que a conferência lê). */
export interface EnvioConferido {
  id: string;
  enviadaEm: string;
  total: number;
}

export interface DivergenciaDoEnviado {
  /** Quando é que a proposta seguiu para o cliente. */
  enviadaEm: string;
  /** O total a pagar (com IVA) que ia no PDF que ele recebeu. */
  aPagarEnviado: number;
  /** O total a pagar que este ecrã mostra agora. */
  aPagarAqui: number;
  /** O identificador da versão, para ir buscar o documento ao repor. */
  versaoId: string;
  /**
   * ── A ÚNICA PERGUNTA QUE INTERESSA: FOI ELA? ──────────────────────────
   *
   * Palavras dela: «ISTO E SIMPLES, O VALOR NAO ALTERA CASO EU NAO MUDO».
   *
   * `false` — não há registo de ninguém ter mexido no preço depois do envio,
   * portanto o número mexeu-se SOZINHO. Não há nada a perguntar: repõe-se o
   * que seguiu para o cliente, com aviso e com dez segundos para anular.
   *
   * `true` — há um `price_set` no histórico do pedido posterior ao envio.
   * Ela corrigiu o preço de propósito depois de a proposta ter saído, e esse
   * é trabalho dela: repor por cima apagava-o em silêncio. Só nesse caso é
   * que os dois números vão ao ecrã com a escolha.
   */
  elaMudou: boolean;
}

/**
 * A divergência entre o último envio e o ecrã, ou `null` quando não há nada a
 * mostrar: nenhum envio com total, ou o mesmo valor ao cêntimo.
 *
 * `ultima` é a versão mais recente (a rota devolve-as da mais nova para a mais
 * velha). O histórico do pedido é quem sabe se foi ela: cada alteração de preço
 * feita à mão deixa lá um `price_set` (ver `registarNoHistorico`), no estúdio e
 * na Gestão do pedido. Uma posterior ao envio quer dizer que a mudança foi
 * decidida; não havendo nenhuma, o número mexeu-se sozinho.
 */
export function divergenciaDoEnviado(
  ultima: EnvioConferido | undefined,
  aPagar: number,
  historico: readonly ActivityEntry[] | undefined,
): DivergenciaDoEnviado | null {
  if (!ultima || !(Number(ultima.total) > 0)) return null;
  const aPagarAqui = round2(aPagar);
  const enviado = round2(Number(ultima.total));
  if (mesmoValorAoCentimo(enviado, aPagarAqui)) return null;
  const elaMudou = (historico ?? []).some((e) => e.kind === "price_set" && e.at > ultima.enviadaEm);
  return {
    enviadaEm: ultima.enviadaEm,
    aPagarEnviado: enviado,
    aPagarAqui,
    versaoId: ultima.id,
    elaMudou,
  };
}

/**
 * Esta MESMA diferença já lhe foi mostrada e ela ficou com o que tem?
 * `guardado` é o que ficou no `localStorage` quando ela decidiu (o total a pagar
 * do ecrã nesse momento), ou `null` se nunca decidiu.
 */
export function divergenciaJaVista(guardado: string | null, aPagarAqui: number): boolean {
  return guardado != null && mesmoValorAoCentimo(Number(guardado), aPagarAqui);
}
