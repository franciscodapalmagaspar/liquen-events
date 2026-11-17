"use client";

import { useCallback, useReducer, useRef } from "react";
import { GRAVACAO_INICIAL, transicaoDaGravacao } from "@/lib/orcamento/estudio/estado-da-gravacao";
import type { useToast } from "../../Toast";

type Toast = ReturnType<typeof useToast>["toast"];

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO DA GRAVAÇÃO NO SERVIDOR, E OS DOIS AVISOS QUE SÓ FALAM UMA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As transições vivem em `lib/orcamento/estudio/estado-da-gravacao.ts` (uma
 * máquina de estados pura, testada sozinha). Aqui fica a casca: o `useReducer`,
 * e os avisos grandes que acompanham duas das transições — cada um diz-se UMA
 * vez e rearma-se quando a coisa volta a estar bem.
 *
 * Saiu do `ProposalStudio` (fase 3 de `docs/ESTRUTURA-DO-CODIGO.md`) com as
 * mesmas frases e as mesmas regras; o estúdio continua a ler
 * `soNesteComputador`, `naoDuraAoDeploy` e `aGravarNoServidor` como lia.
 */
export function useEstadoDaGravacao(toast: Toast) {
  const [gravacao, mudar] = useReducer(transicaoDaGravacao, GRAVACAO_INICIAL);

  /**
   * ── O TERCEIRO ESTADO DO INDICADOR ────────────────────────────────────────
   *
   * O indicador tinha dois: «a guardar…» e «guardado às 14:32». Faltava o que
   * de facto acontecia quando o servidor recusava a gravação — o rascunho ficava
   * no `localStorage` DESTE computador e em mais lado nenhum, e o ecrã dizia
   * «guardado», que é a palavra que faz uma pessoa fechar o portátil descansada.
   *
   * É por isso que este estado existe e é por isso que o que ele mostra tem de
   * ser lido de longe: quem está a trabalhar não vai investigar um visto cinzento
   * — só muda de comportamento se lhe disserem, com estas palavras, que o
   * trabalho está guardado SÓ NESTE COMPUTADOR.
   *
   * `porque` é o que se sabe da causa (a tabela em falta, as permissões), para o
   * aviso poder dizer o que resolver em vez de só que não deu.
   */
  const soNesteComputador =
    gravacao.destino.onde === "so-neste-computador" ? gravacao.destino : null;
  /** Já dissemos isto em voz alta? O indicador diz-o sempre; o aviso grande
   *  aparece UMA vez, para não virar ruído a cada 800 ms. */
  const avisouSoLocal = useRef(false);
  /**
   * O rascunho CHEGOU ao servidor e o próximo deploy apaga-o (produção sem base
   * de dados — ver `duradouro` em `ResultadoDaGravacao`). `aviso` é a frase que
   * o servidor manda, com o nome das variáveis que resolvem.
   */
  const naoDuraAoDeploy = gravacao.duracao.dura ? null : gravacao.duracao;
  /** O mesmo contrato do `avisouSoLocal`: o indicador di-lo sempre, o aviso
   *  grande uma vez. */
  const avisouNaoDura = useRef(false);

  /**
   * O rascunho não chegou ao servidor. Duas coisas acontecem, e são diferentes
   * de propósito:
   *
   *  1. o INDICADOR passa a dizê-lo, e continua a dizê-lo enquanto for verdade —
   *     é o que está à vista quando ela olha para o ecrã;
   *  2. um aviso grande, UMA vez. À segunda seria ruído a cada 800 ms, e um
   *     aviso que aparece sempre é um aviso que se aprende a ignorar.
   */
  const registarSoLocal = useCallback(
    (porque?: string, sessaoExpirada = false) => {
      mudar({ tipo: "ficou-so-aqui", porque });
      if (avisouSoLocal.current) return;
      avisouSoLocal.current = true;
      // Achado n.º 34: com a sessão caída, «fala com quem gere a instalação»
      // mandava procurar uma avaria que não existe. Basta entrar outra vez.
      toast(
        sessaoExpirada
          ? "A tua sessão expirou e este rascunho ficou guardado SÓ NESTE COMPUTADOR. Não feches o separador: entra outra vez e continua — a gravação seguinte já chega ao servidor."
          : `Este rascunho está guardado SÓ NESTE COMPUTADOR — não chegou ao servidor.${
              porque ? ` ${porque}` : ""
            } Não feche o separador sem falar com quem gere a instalação: noutro dispositivo esta proposta não existe.`,
        "error",
      );
    },
    [toast],
  );

  /** A gravação chegou ao servidor. Limpa o aviso E rearma-o: se voltar a
   *  falhar mais tarde, ela tem de ouvir outra vez — a rede pode ter voltado a
   *  cair e o segundo silêncio custaria tanto como o primeiro. */
  const marcarGuardadoNoServidor = useCallback(() => {
    mudar({ tipo: "chegou-ao-servidor" });
    avisouSoLocal.current = false;
  }, []);

  /**
   * O rascunho chegou ao servidor, e o servidor disse que o sítio não dura.
   *
   * Mesmo desenho do `registarSoLocal`, e de propósito: o indicador passa a
   * dizê-lo enquanto for verdade, e o aviso grande sai UMA vez. A frase é a do
   * servidor — quem lê isto é quem vai ter com quem gere a instalação, e uma
   * frase com o nome da variável poupa-lhe a viagem de descobrir qual é.
   *
   * NÃO se oferece «tentar outra vez»: a tentativa seguinte cai no mesmo disco.
   * O que resolve isto é ligar a base de dados, e é isso que a frase diz.
   */
  const registarNaoDura = useCallback(
    (aviso?: string) => {
      mudar({ tipo: "nao-dura", aviso });
      if (avisouNaoDura.current) return;
      avisouNaoDura.current = true;
      toast(
        aviso ??
          "Este rascunho ficou guardado apenas no disco do servidor, que é apagado no próximo deploy.",
        "error",
      );
    },
    [toast],
  );

  /** O sítio voltou a durar (ligaram a base de dados). Limpa e rearma, pela
   *  mesma razão do `marcarGuardadoNoServidor`. */
  const marcarQueDura = useCallback(() => {
    mudar({ tipo: "dura" });
    avisouNaoDura.current = false;
  }, []);

  /** Uma gravação partiu / voltou — ver `aCaminho` na máquina. */
  const partiu = useCallback(() => mudar({ tipo: "partiu" }), []);
  const voltou = useCallback(() => mudar({ tipo: "voltou" }), []);

  /** O aviso grande do «só neste computador» ainda está por dar? */
  const avisoDoSoLocalPorDar = useCallback(() => !avisouSoLocal.current, []);

  return {
    gravacao,
    soNesteComputador,
    naoDuraAoDeploy,
    /**
     * Quantas gravações estão AGORA a caminho do servidor.
     *
     * Sem isto havia uma janela em que o ecrã dizia «guardado às 14:32» sem
     * ninguém saber ainda se tinha ficado guardado: a cópia local corre primeiro
     * e é síncrona, o pedido ao servidor demora — e com as repetições demora
     * mais.
     */
    aGravarNoServidor: gravacao.aCaminho,
    registarSoLocal,
    marcarGuardadoNoServidor,
    registarNaoDura,
    marcarQueDura,
    partiu,
    voltou,
    avisoDoSoLocalPorDar,
  };
}
