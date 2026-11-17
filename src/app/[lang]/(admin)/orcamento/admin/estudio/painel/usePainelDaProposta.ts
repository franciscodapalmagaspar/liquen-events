"use client";
import { useAccaoEstavel } from "../../ui/accao-estavel";
import { useEffect, useMemo, useState } from "react";
import { useSeccaoAVista } from "../../useSeccaoAVista";
import { rolarAteVer } from "@/lib/motion/rolar";
import { isoDaDataPorExtenso } from "@/lib/proposal-doc-textos";
import type { Quote } from "@/lib/orcamento/types";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useDobrasDosBoards } from "../passos/inspiracao/useDobrasDosBoards";
import { useArrumacaoDosBoards } from "../passos/inspiracao/useArrumacaoDosBoards";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";
import { useEscolhaDeFotos } from "../fotos/useEscolhaDeFotos";
import { useFotosDaPagina } from "../pdf/useFotosDaPagina";

export interface EntradaPainelDaProposta {
  arrumacao: ReturnType<typeof useArrumacaoDosBoards>;
  dobras: ReturnType<typeof useDobrasDosBoards>;
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  escolha: ReturnType<typeof useEscolhaDeFotos>;
  fotosDaPagina: ReturnType<typeof useFotosDaPagina>;
  irParaAFalta: (seccao?: string, campo?: string) => void;
  ordemDosBoards: number[];
  passos: ReturnType<typeof usePassosDoEstudio>;
  quote: Quote;
}

export function usePainelDaProposta({
  arrumacao,
  dobras,
  documento,
  escolha,
  fotosDaPagina,
  irParaAFalta,
  ordemDosBoards,
  passos,
  quote,
}: EntradaPainelDaProposta) {
  const { moverBoardParaPosicao } = arrumacao;
  const { dobrados, escreverDobras } = dobras;
  const { doc } = documento;
  const { setPicker } = escolha;
  const { setLugarDaFoto, setPaginaDaFoto } = fotosDaPagina;
  const { step } = passos;
  /**
   * Quantas traduções faltam em cada secção, para o índice.
   *
   * SÓ com a proposta a sair em inglês — é a mesma condição do painel «Por
   * traduzir» do passo do envio, e pela mesma razão: numa proposta portuguesa
   * não há nada por traduzir, e uma fila de contagens debaixo de cada secção
   * seria ruído no índice de quem nunca faz propostas inglesas.
   */
  /**
   * ════════════════════════════════════════════════════════════════════════
   * A DATA QUE ELA ESCREVE AQUI TAMBÉM PODE CHOCAR
   * ════════════════════════════════════════════════════════════════════════
   *
   * O aviso de dia ocupado já existia, e disparava ao ESCOLHER o cliente — a
   * partir do `quote.date`. Só que a data que sai impressa é a que está neste
   * documento, e este campo é texto livre: o casal liga a mudar o dia, ela
   * corrige aqui, e o aviso continuava a olhar para a data do formulário.
   *
   * ── CALA-SE QUANDO NÃO CONSEGUE LER A DATA ──────────────────────────────
   * `isoDaDataPorExtenso` só reconhece a forma que o estúdio escreve («12 de
   * setembro de 2026») e devolve `null` para tudo o resto: «a definir»,
   * «18.09.2027», «Set.», ou uma data a meio de ser escrita. Um aviso ERRADO
   * sobre uma data é pior do que nenhum — diz que há um casamento noutro dia,
   * e o dia é inventado por uma leitura falhada.
   *
   * ── E CALA-SE QUANDO É A MESMA DATA DO PEDIDO ───────────────────────────
   * Aí o aviso já está no ecrã, por cima do estúdio (ver `FazerProposta`). O
   * mesmo cartão duas vezes na mesma página é a maneira de se aprender a
   * saltar os dois.
   */
  const dataEscritaNoDoc = isoDaDataPorExtenso(doc.eventDate ?? "");
  const pedidoComADataDoDoc = useMemo(
    () =>
      dataEscritaNoDoc && dataEscritaNoDoc !== quote.date
        ? ({
            ...quote,
            date: dataEscritaNoDoc,
            // O fim de um evento de vários dias é do PEDIDO e não desta data:
            // arrastá-lo para aqui inventava um intervalo que ninguém escreveu.
            endDate: "",
            // E o local também é o do documento quando ele diz outro: a
            // distância por estrada é metade da resposta.
            location: doc.location || quote.location,
          } as Quote)
        : null,
    [dataEscritaNoDoc, quote, doc.location],
  );

  /**
   * A página que ela está a editar — para o painel da direita mostrar ESSA.
   *
   * Marcada quando o foco entra no cartão de um board, e não quando o rato lá
   * passa: o rato atravessa cartões a caminho de outro sítio, e um painel que
   * mudasse de página ao atravessar era um painel a piscar.
   */
  const [boardActivo, setBoardActivo] = useState<number | null>(null);

  /**
   * E a parte do formulário que está À VISTA — pedido dela de 9/11: «à medida
   * que vamos fazendo scroll, as páginas vão mudando». O painel mostra a página
   * da secção que se está a ler, e na Inspiração a do mood board que passa pelo
   * meio do ecrã. O foco continua a mandar quando ela entra num campo.
   */
  const aVista = useSeccaoAVista(step);
  useEffect(() => {
    if (aVista.board != null) setBoardActivo(aVista.board);
  }, [aVista.board]);

  /** As páginas COM fotografias, pela ordem em que saem — a ordem do PDF. */
  // A mesma ordem já calculada lá em cima (`ordemDosBoards`), em vez de outra
  // volta à mesma conta a cada letra (10/11).
  const paginasParaOPainel = useMemo(
    () =>
      ordemDosBoards
        .map((bi) => ({ bi, board: (doc.moodBoards ?? [])[bi] }))
        .filter((p) => p.board && (p.board.images ?? []).length > 0),
    [ordemDosBoards, doc.moodBoards],
  );

  /*
    ── O QUE SE VÊ AO LADO ACOMPANHA, MAS NÃO ATRASA A LETRA (10/11) ──────
    Ela: «está a travar imenso e super pouco fluido». O painel «O que vai
    sair» e a «Vista de conjunto» refazem o plano do PDF e desenham folhas
    inteiras — e faziam-no DENTRO de cada letra escrita. Com o documento
    ADIADO (`useDeferredValue`, DENTRO de cada um — ver `VistaAdiada` e
    `PainelAdiado`; chamado aqui, obrigava o estúdio inteiro a desenhar-se duas
    vezes por letra, medido), a letra aparece logo no campo, e eles
    redesenham-se a seguir, num desenho que o React interrompe se ela escrever
    outra letra entretanto. Mostram exactamente o mesmo; só chegam uma fracção
    de segundo depois. (Os dois são `memo`, e por isso as acções que recebem
    são estáveis — `useAccaoEstavel`.)
  */
  const painelSaltar = useAccaoEstavel((bi: number) =>
    irParaAFalta("moodboards", `boardTitulo:${bi}`),
  );
  const painelEscolherFotos = useAccaoEstavel((bi: number) => setPicker({ kind: "board", bi }));
  const vistaMudarFoto = useAccaoEstavel(
    (chave: string, nome: string, max: number, formas: number[]) => {
      setLugarDaFoto(0);
      setPaginaDaFoto({ chave, nome, max, formas });
    },
  );
  const vistaMover = useAccaoEstavel((de: number, para: number) => moverBoardParaPosicao(de, para));
  const vistaSaltar = useAccaoEstavel((bi: number) => {
    const id = doc.moodBoards[bi]?.id;
    if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    rolarAteVer(document.getElementById(`mood-board-${bi}`), { block: "start" });
  });
  const vistaIrParaSeccao = useAccaoEstavel((seccao: Parameters<typeof irParaAFalta>[0]) =>
    irParaAFalta(seccao),
  );

  return {
    aVista,
    boardActivo,
    paginasParaOPainel,
    painelEscolherFotos,
    painelSaltar,
    pedidoComADataDoDoc,
    setBoardActivo,
    vistaIrParaSeccao,
    vistaMover,
    vistaMudarFoto,
    vistaSaltar,
  };
}
