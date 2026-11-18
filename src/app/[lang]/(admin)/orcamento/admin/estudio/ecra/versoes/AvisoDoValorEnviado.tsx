"use client";

import { dataDoEnvioPorExtenso } from "@/lib/orcamento/estudio/data-do-envio";
import { eur } from "@/lib/money";
import { EmCurso } from "../../../ui";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { useEstudio } from "../../contexto";

/**
 * ══════════════════════════════════════════════════════════════════
 * O QUE SEGUIU PARA O CLIENTE, E O QUE ESTE APARELHO TEM
 * ══════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «eu quero igual o valor!!! até eu alterar por mim!».
 *
 * Os dois números lado a lado, com a data do envio, antes de qualquer
 * decisão. Ver o bloco `divergenciaDoEnviado`, que explica porque é que
 * nenhum dos dois se aplica sozinho: uma correcção de preço feita de
 * propósito depois do envio produz exactamente esta mesma diferença, e
 * escolher por ela era apagar trabalho em metade dos casos.
 *
 * No topo do estúdio, ao lado das outras perguntas de dinheiro e pela
 * mesma razão que está escrita lá: uma pergunta que aparece cada vez
 * noutro sítio é uma pergunta que se responde sem se ler.
 *
 * Empilhado abaixo dos 30rem e em linha acima — a caixa vive na coluna
 * do estúdio, e não na janela. A conta: os dois blocos de número pedem
 * ~13rem cada («Total a pagar» + «15 090,55 €» a 13px são ~11rem, mais
 * o `gap-4` de 1rem e o respiro), portanto 26rem é onde os dois deixam
 * de se apertar; 30rem é o degrau da casa logo acima, e dá folga para
 * os números de seis dígitos que ela tem (202 889,00 €).
 */
export function AvisoDoValorEnviado() {
  const {
    conferencia: {
      aReporOEnviado,
      divergenciaDoEnviado,
      manterOsValoresDesteAparelho,
      reporOsValoresEnviados,
    },
  } = useEstudio();
  return (
    <>
      {divergenciaDoEnviado?.elaMudou && (
        <div
          role="alert"
          /* O nome distingue-o dos outros avisos do estúdio — há mais do que um
             `role="alert"` neste ecrã, e um leitor que anuncie «alerta» sem
             dizer de quê obriga a ir procurar. */
          aria-label="O valor não é o que seguiu para o cliente"
          className="mb-4 rounded-xl border border-[var(--bo-aviso-tom)]/45 bg-[var(--bo-aviso-tom)]/[0.08] px-3 py-2.5"
        >
          <p className="text-xs leading-relaxed text-[var(--bo-tinta-72)]">
            Esta proposta já seguiu para o cliente{" "}
            {dataDoEnvioPorExtenso(divergenciaDoEnviado.enviadaEm)}, e o valor que está neste ecrã
            NÃO é o que ele recebeu. Escolhe qual dos dois fica — nada muda até escolheres.
          </p>
          <div className="@container mt-2.5">
            <dl className="flex flex-col gap-2 @min-[30rem]:flex-row @min-[30rem]:gap-4">
              <div className="min-w-0 grow">
                <dt className="text-[11px] text-foreground/45">O que o cliente recebeu</dt>
                <dd className="text-sm font-semibold text-[var(--bo-text)]">
                  {eur(divergenciaDoEnviado.aPagarEnviado)}
                </dd>
              </div>
              <div className="min-w-0 grow">
                <dt className="text-[11px] text-foreground/45">O que está neste aparelho</dt>
                <dd className="text-sm font-semibold text-[var(--bo-text)]">
                  {eur(divergenciaDoEnviado.aPagarAqui)}
                </dd>
              </div>
            </dl>
          </div>
          {/* A espera desenhada da única maneira que esta casa desenha esperas.
              `estimadoMs` e não uma barra sabida: é um pedido e uma resposta, e
              no meio não há nada que se possa contar. */}
          {aReporOEnviado ? (
            <EmCurso
              className="mt-2.5 max-w-xs"
              titulo="A ir buscar a proposta que seguiu…"
              estimadoMs={2000}
              nota="Só os valores voltam atrás. O texto e as fotografias ficam como estão."
              notaDemorada="O servidor está a demorar. Se falhar, nada muda no que está no ecrã."
            />
          ) : (
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`alvo-toque text-xs font-medium text-sage-600 underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={() => void reporOsValoresEnviados()}
              >
                Repor os valores que seguiram
              </button>
              <button
                type="button"
                className={`alvo-toque text-xs text-[var(--bo-text-muted)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
                onClick={manterOsValoresDesteAparelho}
              >
                Manter os deste aparelho
              </button>
            </div>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/45">
            Repor mexe só nos valores — o texto, as fotografias e os mood boards ficam como estão, e
            podes anular durante 10 segundos.
          </p>
        </div>
      )}
    </>
  );
}
