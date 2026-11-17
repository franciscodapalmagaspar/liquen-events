"use client";
import { useCallback, useMemo } from "react";
import { comoSeDiz, noMesmoEspaco } from "@/lib/orcamento/fotos-repetidas";
import type { Quote } from "@/lib/orcamento/types";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useMapasDasFotos } from "./useMapasDasFotos";
import { useEscolhaDeFotos } from "./useEscolhaDeFotos";

export interface EntradaRepeticoesDasFotos {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  escolha: ReturnType<typeof useEscolhaDeFotos>;
  fotos: ReturnType<typeof useMapasDasFotos>;
  quote: Quote;
}

export function useRepeticoesDasFotos({
  documento,
  escolha,
  fotos,
  quote,
}: EntradaRepeticoesDasFotos) {
  const { doc } = documento;
  const { repetidas } = escolha;
  const { themeOrigins } = fotos;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ONDE É QUE ESTA FOTOGRAFIA JÁ ESTEVE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Duas perguntas diferentes, e só uma delas é um aviso:
   *
   *  · JÁ ESTÁ NOUTRO BOARD desta proposta — quase sempre um engano, e é o
   *    único caso em que o casal vê a mesma fotografia duas vezes no mesmo
   *    documento;
   *  · JÁ FOI a outra proposta, e, dentro dessas, as que foram para um
   *    casamento NO MESMO ESPAÇO. É a repetição que alguém nota: a equipa da
   *    quinta, o fotógrafo da casa, os convidados que vão aos dois.
   *
   * As outras repetições — outro casal, outro sítio, outro mês — não são aviso
   * nenhum: a biblioteca existe para ser usada.
   */
  // Pela CHAVE das fotografias e não pelo array das páginas: este muda a cada
  // letra escrita num título ou numa descrição, e a contagem não (10/11).
  const chaveDasFotosDosBoards = JSON.stringify(doc.moodBoards.map((b) => b.images));
  const ondeEstaCadaFoto = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const b of doc.moodBoards)
      for (const p of b.images) {
        if (p) contagem.set(p, (contagem.get(p) ?? 0) + 1);
      }
    return contagem;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a chave diz o que decide
  }, [chaveDasFotosDosBoards]);

  const repetidasPorOrigem = useMemo(
    () => new Map(repetidas.map((f) => [f.origem, f])),
    [repetidas],
  );

  /**
   * ── A ÚNICA REPETIÇÃO QUE SE DESENHA NA GRELHA ──────────────────────────
   *
   * A mesma fotografia em duas páginas do MESMO documento. É quase sempre um
   * engano, é o único caso em que o casal vê a mesma fotografia duas vezes na
   * proposta que recebe, e é a única das três perguntas que se resolve sem
   * sair desta página — está ali, na grelha ao lado.
   *
   * Marcada NAS DUAS: a contagem é sobre o documento inteiro, portanto as duas
   * células acendem. Assinalar só a segunda obrigava a procurar a primeira.
   *
   * ── E PORQUE É QUE AS OUTRAS DUAS NÃO ACENDEM AQUI ──────────────────────
   * «Já usada noutro casamento» e «já usada no mesmo espaço» são verdadeiras e
   * úteis, mas esta página já pode acender sete avisos ao mesmo tempo (página
   * cheia, fotos fora do PDF, fila desequilibrada, fotos cortadas, foto que
   * destoa da paleta…). Cada aviso novo torna os outros menos lidos. As duas
   * vivem onde a decisão se toma — no selector da biblioteca, que já as mostra
   * — e aqui contam-se ao rato, em `passadoDaFoto`, sem acender nada.
   */
  function repeticaoNestaProposta(caminho: string): { texto: string; grave: boolean } | null {
    const vezesAqui = ondeEstaCadaFoto.get(caminho) ?? 0;
    if (vezesAqui <= 1) return null;
    // CURTO porque a tira é `truncate` e a célula, a 390 px numa grelha de três
    // colunas, tem ~110 px de largura: «Esta fotografia está 2 vezes nesta
    // proposta.» a 8 px sai «Esta fotografia es…», que é uma frase que não diz
    // nada. A frase inteira fica no texto do rato, onde há espaço.
    return { texto: `${vezesAqui}× nesta proposta`, grave: true };
  }

  /**
   * O que se conta ao passar o rato: de que foto da biblioteca veio esta, e para
   * onde ela já foi. Não acende nada no ecrã — é a resposta à pergunta «esta
   * foto já não a usei?», dada a quem a faz.
   */
  function passadoDaFoto(caminho: string): string | undefined {
    const origem = themeOrigins[caminho];
    const f = origem ? repetidasPorOrigem.get(origem) : undefined;
    if (!f) return origem;
    const mesmoEspaco = noMesmoEspaco(f, quote.location || undefined);
    // A repetição DENTRO desta proposta não vem aqui: a `CelulaDeFoto` já lhe
    // cola o texto da tira ao fim do título. Repeti-la era dizer duas vezes a
    // mesma coisa no mesmo balão.
    return [
      origem,
      mesmoEspaco.length > 0
        ? `Já foi para ${mesmoEspaco[0].cliente}, no mesmo espaço.`
        : `Já usada — ${comoSeDiz(f)}.`,
    ]
      .filter(Boolean)
      .join(" · ");
  }

  /*
    ── O QUE A GRELHA DE CADA PÁGINA RECEBE, ESTÁVEL ENTRE LETRAS (10/11) ──
    As duas perguntas acima, embrulhadas para mudarem só quando os dados delas
    mudam (as fotografias da proposta, a origem e o passado de cada uma) — e não
    a cada letra escrita num título ou numa descrição. É isso que deixa o `memo`
    do `FotosDoBoard` saltar as 96 células de uma proposta com 8 páginas.
  */
  const historiaDaFoto = useCallback(
    (caminho: string) => repeticaoNestaProposta(caminho),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lê só `ondeEstaCadaFoto`
    [ondeEstaCadaFoto],
  );
  const origemDaFoto = useCallback(
    (caminho: string) => passadoDaFoto(caminho),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lê só estes três
    [themeOrigins, repetidasPorOrigem, quote.location],
  );

  return { historiaDaFoto, origemDaFoto };
}
