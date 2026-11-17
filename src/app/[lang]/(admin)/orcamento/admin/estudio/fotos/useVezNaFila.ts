import { useEffect, useRef, useState } from "react";
import { pedirVezDeImagemPesada } from "../../fila-de-imagens";

/**
 * A VEZ DE UMA CÉLULA PESADA NA FILA DAS IMAGENS (`fila-de-imagens`).
 *
 * Saiu do `Thumb` tal e qual (fase 2 de `docs/ESTRUTURA-DO-CODIGO.md`): o
 * porquê de cada linha continua escrito ao lado dela. Devolve se a célula já
 * tem vez, e como largá-la quando a fotografia chega ou falha.
 */
export function useVezNaFila(
  pesada: boolean,
  alvo: string | undefined,
): { temVez: boolean; largarAVez: () => void } {
  /**
   * A vez, uma vez por célula e para sempre.
   *
   * Não volta a `false` quando o URL é reassinado, e é deliberado: mandar de
   * volta para a fila uma célula que JÁ tem fotografia no ecrã apagava-a — e
   * uma foto que desaparece para voltar igual é exactamente o salto que este
   * ecrã não pode ter (ver `useSrcSemPiscar`). O custo é um download a mais no
   * momento raro em que as assinaturas se renovam.
   */
  const [temVez, setTemVez] = useState(false);
  /**
   * O mesmo, numa referência, para o efeito o poder ler sem o ter nas
   * dependências — tê-lo lá faria a própria concessão da vez desmontar o
   * efeito e largá-la no instante seguinte.
   */
  const temVezRef = useRef(false);
  const largarVez = useRef<(() => void) | null>(null);
  useEffect(() => {
    /**
     * ── UM LUGAR NA FILA POR CÉLULA, E SÓ ENQUANTO SERVE PARA ALGUMA COISA ──
     *
     * `temVez` não volta a `false` depois do primeiro arranque (é deliberado —
     * ver acima), e portanto o `src` desta célula JÁ é o alvo e o download já
     * começou. Uma célula que volte aqui — porque o URL foi reassinado, porque
     * a cascata caiu para o original, porque ela carregou em «Tentar
     * novamente» — pedia na mesma vez, e ficava com um dos TRÊS lugares sem
     * precisar dele: o download dela já ia a caminho, e o lugar só se largava
     * ao fim de `ESPERA_MAXIMA_MS`.
     *
     * Numa grelha onde as fotos falham em cadeia é o pior momento possível
     * para isso: as três vagas ficam com células que não estão à espera de
     * nada, e as que ainda não têm um único pixel no ecrã esperam por uma vaga
     * que já não é vaga nenhuma. A fila existe para reger quem ainda não
     * começou.
     *
     * ── O RELÓGIO DO TECTO NÃO ESTÁ AQUI, E É DE PROPÓSITO ─────────────────
     * Estava: um `setTimeout` montado à volta deste pedido, que devolvia a vaga
     * ao fim do tecto. Escrito assim, a invariante que importa — **o tecto
     * conta o DOWNLOAD e nunca a ESPERA** — dependia de o `setTimeout` estar
     * dentro do arranque e não fora dele, o que ninguém vê ao ler e ninguém
     * apanha ao mudar. Passou para dentro da `fila-de-imagens`, que o arma no
     * instante em que concede a vaga e tem um caso a fixá-lo.
     */
    if (!pesada || temVezRef.current) return;
    const largar = pedirVezDeImagemPesada(() => {
      temVezRef.current = true;
      setTemVez(true);
    });
    largarVez.current = largar;
    return () => {
      largarVez.current?.();
      largarVez.current = null;
    };
    // `alvo` nas dependências para uma foto reassinada voltar a pedir vez em
    // vez de ficar com um URL que o Storage já recusa.
  }, [pesada, alvo]);
  const largarAVez = () => {
    largarVez.current?.();
    largarVez.current = null;
  };
  return { temVez, largarAVez };
}
