"use client";

import { useState } from "react";
import { SAIDA_FUNDO } from "../../ui/saida";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * O ESQUELETO ESBATE-SE — A ÚNICA SAÍDA DESTA CASA QUE SAI DE GRAÇA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * As duas miniaturas do estúdio — a do resumo (`PreviewThumb`) e a das grelhas
 * de mood board (`Thumb`) — põem um `<span absolute inset-0>` cinzento POR CIMA
 * da imagem, e não no lugar dela. Isso é uma decisão antiga e está contada nos
 * dois sítios: a caixa nunca muda de tamanho, e o `src` está posto muito antes
 * de os bytes chegarem, portanto há sempre alguma coisa a dizer «isto está a
 * acontecer».
 *
 * O efeito colateral, que ninguém tinha aproveitado: quando a fotografia chega,
 * ela JÁ ESTÁ PINTADA POR BAIXO. O esqueleto desaparecia num fotograma e a
 * fotografia dava um salto para dentro do ecrã — quando o que se passou foi
 * apenas que o pano que a tapava se pode levantar. Em toda a casa esta é a
 * única saída que não precisa de segurar nada montado à espera: o que está por
 * baixo é o destino final.
 *
 * ── A CLASSE É A `.bo-saida-fundo`, E NÃO A `.bo-saida` ───────────────────
 *
 * Zero de deslocação. Um esqueleto não vem de sítio nenhum nem vai para sítio
 * nenhum — está exactamente por cima do que vai ficar, e quatro píxeis a subir
 * fariam a mancha cinzenta DESLIZAR sobre a fotografia, que é uma coisa a
 * mover-se onde não se moveu nada. O que ele faz é apagar-se, nos 200 ms e na
 * `--ease-in` de tudo o que sai nesta casa.
 *
 * E não conflitua com o brilho: o `bo-shimmer` corre no `::after` do
 * `.bo-skeleton`, não no elemento — as duas animações vivem em nós diferentes e
 * a `animation` da `.bo-saida` não pisa nenhuma. O brilho continua até ao fim do
 * esbatimento, que é o que se quer: ele diz «ainda vem», e o que se está a ver
 * é ele a ir-se embora.
 *
 * ── E O ESQUELETO NÃO LEVA ENTRADA. NUNCA. ────────────────────────────────
 *
 * Meio segundo antes de aparecer conteúdo é o oposto do que um esqueleto existe
 * para fazer — ele é a promessa de que já está a acontecer alguma coisa, e uma
 * promessa que se apresenta chega tarde. Por isso `jaSeViu`: uma célula que
 * nunca esteve a carregar (uma foto que já falhou quando o ecrã abriu) não
 * desenha esqueleto nenhum, em vez de desenhar um só para o esbater — o que
 * seria pôr uma entrada onde ela está proibida, disfarçada de saída.
 *
 * ── E NÃO SE DESMONTA ─────────────────────────────────────────────────────
 *
 * A `.bo-saida` é `forwards`: acabada a animação o nó fica em `opacity: 0` e
 * sem `pointer-events` — invisível e inerte, sobre a fotografia que já lá
 * estava. Não há aqui o problema que o `ui/saida.ts` existe para resolver
 * (segurar montado um nó que o React ia deitar fora), e trazê-lo para cá era
 * pôr um temporizador por miniatura numa grelha que pode ter vinte e quatro.
 * Deixá-lo montado é também o que faz a volta funcionar: se a célula voltar a
 * carregar — um URL reassinado, um «Tentar novamente» —, a classe sai e o
 * esqueleto reacende no fotograma seguinte, sem entrada nenhuma.
 */
export function EsqueletoPorCima({
  aCarregar,
  comPega,
}: {
  aCarregar: boolean;
  comPega?: boolean;
}) {
  /**
   * Um trinco que só anda para um lado: já esteve à espera alguma vez?
   *
   * Ajustado NO DESENHO e não num `useEffect`. É o caminho que o React
   * documenta para acertar estado quando uma propriedade muda: ele reentra
   * neste componente antes de pintar o que quer que seja, portanto não há
   * fotograma nenhum desenhado com a resposta velha nem um segundo commit. Com
   * um efeito, a saída começava um fotograma depois da fotografia chegar — e
   * numa grelha de vinte e quatro miniaturas isso é vinte e quatro efeitos a
   * acordar por nada.
   *
   * O valor inicial já vem certo, portanto no caso normal — a célula nasce à
   * espera — este ajuste nunca chega a correr.
   */
  const [jaSeViu, setJaSeViu] = useState(aCarregar);
  if (aCarregar && !jaSeViu) setJaSeViu(true);
  if (!aCarregar && !jaSeViu) return null;
  return (
    <span
      className={`bo-skeleton pointer-events-none absolute inset-0 ${aCarregar ? "" : SAIDA_FUNDO}`}
      aria-hidden
      // A pega dos testes diz «esta célula está À ESPERA», e não «este nó
      // existe»: a partir daqui ele fica montado a esbater-se e, depois, calado.
      data-a-carregar={comPega && aCarregar ? "" : undefined}
    />
  );
}
