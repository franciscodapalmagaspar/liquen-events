"use client";

import { eur } from "@/lib/money";
import { ESTADO, PRESSAO } from "../../../ui/movimento";
import { estadoNoEcra, haQueMostrar } from "@/lib/orcamento/estudio/estado-da-gravacao";
import { textoDaGravacao } from "@/lib/orcamento/estudio/textos-do-estudio";
import { EstadoDaGravacaoNaBarra } from "../../../EstadoDaGravacaoNaBarra";
import { useEstudio } from "../../contexto";

/**
 * O TOTAL SEMPRE À VISTA.
 * Palavras dela: «não quero fazer scroll para saber quanto vai a
 * proposta». O valor vive cinco ecrãs abaixo do sítio onde ela
 * está a escrever os serviços; aqui acompanha-a por toda a
 * página, e muda enquanto ela escreve.
 *
 * UMA LINHA NO TELEMÓVEL.
 * Esta barra é fixa, e por baixo dela ainda vem a barra de
 * navegação e a do Safari. O texto completo ("Total 3000,00 € sem
 * IVA · o cliente paga 3690,00 € · guardado às 12:34") embrulhava
 * para três linhas e comia o pouco ecrã que sobrava.
 *
 * O que fica no telemóvel é só o número que decide — o que o
 * CLIENTE paga —, e o resto do detalhe volta a partir de `sm`.
 * O "guardado às 12:34" vira um visto: é uma confirmação, e um
 * visto confirma tão bem como a frase, num décimo do espaço.
 * A hora continua lá para quem a procurar, no `title`.
 *
 * ── SÓ O ESSENCIAL ───────────────────────────────────────────
 * Havia aqui uma TERCEIRA soma — «soma das linhas: 2.400,00 €»
 * numa etiqueta cor de laranja — ao lado de um total de 2.460,00 €
 * e de um «o cliente paga 3.025,80 €». Três números diferentes na
 * mesma linha de rodapé, e nenhum deles a explicar-se: a barra
 * existe para responder a «quanto vai a proposta», não para abrir
 * a discussão que o bloco de totais já resolve.
 * Ficam o total sem IVA, o total a pagar e o estado de guardado.
 *
 * ══════════════════════════════════════════════════════════════
 * O ESTADO FICA SOZINHO À ESQUERDA; O NÚMERO VAI TER COM A ACÇÃO
 * ══════════════════════════════════════════════════════════════
 *
 * MEDIDO num Chromium, com 4.500,00 € escritos no «Valor (sem IVA)»:
 * o texto acabava aos 371 px e o botão começava aos 1248 — 877 px de
 * nada entre o número que decide e a acção que o consome. A 1920 eram
 * 1037. Mais de metade da barra era vazio, e ela olha para aqui
 * dezenas de vezes por proposta.
 *
 * A causa era uma só: o `mr-auto` do parágrafo empurrava TUDO o que é
 * texto para a borda esquerda e o botão ficava agarrado à direita. Dois
 * cantos opostos de um ecrã largo — duas fixações do olho para ler uma
 * pergunta só («quanto vai, e sigo?»).
 *
 * Agora a barra tem dois grupos com propósitos diferentes:
 *
 * · à ESQUERDA, o ESTADO — o indicador de gravação e o aviso do preço
 * que não chegou ao pedido. Lê-se quando alguma coisa está mal, e
 * um canto é onde se procura um estado.
 * · à DIREITA, a DECISÃO — o total e o botão que o consome, lado a
 * lado, dentro de uma fixação.
 *
 * E é ISTO que separa o «guardado às 21:49» do total, que era a outra
 * queixa: já não estão colados por um espaço a fingir de pontuação —
 * estão em pontas diferentes porque são coisas diferentes. O vazio que
 * sobra deixou de ser vazio no meio de uma frase e passou a ser a
 * distância entre dois assuntos.
 *
 * O botão NÃO se mexe para a esquerda: os passos «prever» e «enviar»
 * encostam o seu grupo de acções à direita (`ml-auto`), e a acção
 * principal a saltar de sítio entre passos custa mais do que o vazio
 * alguma vez custou. Quem viaja é o número.
 *
 * ── OS ALARMES TÊM DE SER OUVIDOS, E NÃO SÓ VISTOS ───────────
 * Ao descer no telemóvel, esta linha sai quando está tudo bem —
 * mas SÓ À VISTA (`data-acessorio-so-a-vista`, que a esconde como
 * o `sr-only`), e não com `display: none`. Uma região `aria-live`
 * fora da árvore de acessibilidade não anuncia nada quando volta
 * a entrar com o alarme já lá dentro: o alarme chegava calado.
 * Pela mesma razão as regiões abaixo existem SEMPRE (vazias
 * quando não há nada a dizer), e é o conteúdo que muda.
 */
export function EstadoNaBarra() {
  const {
    rascunho: { gravacao, gravadoEm, naoDuraAoDeploy, porGravar, soNesteComputador },
    total: { precoAGravar, precoPorChegar, tentarGravarOPreco },
  } = useEstudio();
  return (
    <p
      className="mr-auto min-w-0 truncate text-xs text-[var(--bo-text-muted)]"
      data-acessorio-so-a-vista={
        precoPorChegar || soNesteComputador || naoDuraAoDeploy ? undefined : ""
      }
    >
      {/* ══════════════════════════════════════════════════════════
                  O PREÇO QUE NÃO CHEGOU AO PEDIDO
                  ══════════════════════════════════════════════════════════

                  Fica ao lado do indicador da gravação porque é da mesma
                  família — «onde é que o meu trabalho está» —, mas é um aviso
                  À PARTE e não um quarto estado daquele: o rascunho pode estar
                  guardado e o preço na mesma por chegar, e juntá-los obrigava
                  o indicador a escolher qual das duas verdades dizia.

                  Diz o que aconteceu, com o número, e o que fazer — a regra
                  dela. Sem o número isto era «algo correu mal» com outra
                  roupa: ela precisa de ver QUE valor ficou por gravar para
                  saber se o cartão do pedido está certo ou não.
              */}
      <span aria-live="assertive" data-alarme-do-preco="">
        {precoPorChegar && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--bo-perigo)]/12 px-2 py-0.5 text-[11px] font-semibold text-[var(--bo-perigo)]"
            title={
              precoPorChegar.porque ??
              "A proposta continua certa; o que não ficou gravado foi o valor no pedido."
            }
          >
            <span>
              {precoPorChegar.base == null
                ? "O pedido ficou com o valor antigo"
                : `O pedido ficou sem o valor de ${eur(precoPorChegar.base)}`}
            </span>
            {precoPorChegar.valeTentarDeNovo && (
              <button
                type="button"
                className={`alvo-toque foco-largo underline underline-offset-2 disabled:opacity-60 ${ESTADO} ${PRESSAO}`}
                disabled={precoAGravar}
                onClick={() => void tentarGravarOPreco(precoPorChegar.base)}
              >
                {precoAGravar ? "A tentar…" : "Tentar de novo"}
              </button>
            )}
          </span>
        )}
      </span>
      {(() => {
        const haEstado = haQueMostrar(gravadoEm, porGravar, gravacao);
        const estado = estadoNoEcra(porGravar, gravacao);
        const t = textoDaGravacao(estado, gravadoEm);
        return (
          // Duas regiões fixas — uma `polite`, uma `assertive` só para
          // os alarmes —, e nunca uma que troca de `aria-live`. Ver
          // `EstadoDaGravacaoNaBarra`.
          <EstadoDaGravacaoNaBarra
            haEstado={haEstado}
            estado={estado}
            texto={t}
            comMargem={!!precoPorChegar}
            titulo={
              estado === "so-neste-computador" && soNesteComputador?.porque
                ? `${t.longo} — ${soNesteComputador.porque}`
                : estado === "nao-dura-ao-deploy" && naoDuraAoDeploy?.aviso
                  ? `${t.longo} — ${naoDuraAoDeploy.aviso}`
                  : t.longo
            }
          />
        );
      })()}
    </p>
  );
}
