"use client";

import { passoDaSeccao } from "@/lib/orcamento/passos-do-estudio";
import { seccaoDoCampo, type CampoPublicado } from "@/lib/proposal-ortografia";
import { useNotaDaSeccao } from "../documento/useNotaDaSeccao";
import { useCarregarFotos } from "../fotos/useCarregarFotos";
import { useFotosUsadasNoutras } from "../fotos/useFotosUsadasNoutras";
import { useArrumacaoDosBoards } from "../passos/inspiracao/useArrumacaoDosBoards";
import { useDobrasDosBoards } from "../passos/inspiracao/useDobrasDosBoards";
import { useFotosDosBoards } from "../passos/inspiracao/useFotosDosBoards";
import { useMoodBoards } from "../passos/inspiracao/useMoodBoards";
import { useSeleccaoSegueAFotografia } from "../passos/inspiracao/useSeleccaoDeFotos";
import type { useConteudoDoEstudio } from "./useConteudoDoEstudio";
import type { useNucleoDoEstudio } from "./useNucleoDoEstudio";

/**
 * A inspiração (mood boards e as suas fotografias) e os saltos para um campo
 * ou uma falta — que abrem o board dobrado onde o campo vive.
 */
export function useInspiracaoDoEstudio({
  anular,
  avisoDeQualidade,
  avisos,
  carregamento,
  documento,
  escolha,
  fotos,
  hidratar,
  ordem,
  passos,
  pedido,
  reversiveis,
  seleccao,
  total,
  traducoes,
  visitas,
}: Pick<
  ReturnType<typeof useNucleoDoEstudio> & ReturnType<typeof useConteudoDoEstudio>,
  | "anular"
  | "avisoDeQualidade"
  | "avisos"
  | "carregamento"
  | "documento"
  | "escolha"
  | "fotos"
  | "hidratar"
  | "ordem"
  | "passos"
  | "pedido"
  | "reversiveis"
  | "seleccao"
  | "total"
  | "traducoes"
  | "visitas"
>) {
  const { doc } = documento;
  const { quote } = pedido;
  const { setBilingue } = traducoes;
  const { toast } = avisos;
  const { setFotosACopiar, setUploading } = carregamento;
  const { hidratarAssets, tentarBuscarFotos } = hidratar;
  const { setLupa, setPicker } = escolha;
  const { campoAVisitar, faltaAVisitar, setCampoAVisitar, setFaltaAVisitar } = visitas;
  const { setStep } = passos;

  const nota = useNotaDaSeccao({ documento });
  const carregar = useCarregarFotos({
    avisoDeQualidade,
    documento,
    fotos,
    quote,
    setUploading,
    toast,
  });
  const fotosUsadasNoutras = useFotosUsadasNoutras({ documento, escolha, fotos, quote });
  const moodBoards = useMoodBoards({
    anular,
    documento,
    hidratarAssets,
    quote,
    reversiveis,
    seleccao,
    setFotosACopiar,
    toast,
  });
  const arrumacao = useArrumacaoDosBoards({ documento, ordem, toast });
  const fotosDosBoards = useFotosDosBoards({
    documento,
    fotos,
    reversiveis,
    seleccao,
    setLupa,
    setPicker,
    tentarBuscarFotos,
    toast,
    total,
  });
  const dobras = useDobrasDosBoards({ campoAVisitar, documento, faltaAVisitar });
  const { dobrados, escreverDobras } = dobras;
  useSeleccaoSegueAFotografia({ documento, seleccao });

  /**
   * ── IR AO SÍTIO ONDE A FALTA SE RESOLVE ─────────────────────────────────
   *
   * O irmão do `irParaCampo`, para a Conferência. A diferença é a matéria: ali
   * é um campo de PROSA identificado por um `CampoDeTexto`; aqui é uma falta
   * («Falta o valor»), que às vezes tem um controlo próprio e às vezes só tem
   * uma secção — as capas e os mood boards não são um campo.
   *
   * Três coisas, e só a última é o salto: voltar ao conteúdo, ABRIR a secção se
   * ela estiver dobrada (saltar para dentro de um cartão fechado deixava-a a
   * olhar para um cartão que «não abriu», e os campos continuam lá dentro
   * porque uma secção fechada esconde-os sem os desmontar), e só então levar a
   * vista e o foco.
   */
  function irParaAFalta(seccao?: string, campo?: string) {
    // O email e o canal vivem no passo do ENVIO, e não no conteúdo: o salto
    // ia para o «Conteúdo» e não encontrava nada para mostrar.
    setStep(passoDaSeccao(seccao));
    // Um campo de um mood board pode estar dentro de um cartão DOBRADO, e um
    // campo que não está desenhado não se foca: o salto morria na secção e
    // deixava-a a olhar para a lista de boards fechados. É a mesma abertura
    // que o `irParaCampo` já fazia — ver lá.
    const board = /^board[A-Za-z]*:(\d+)/.exec(campo ?? "");
    if (board) {
      const id = doc.moodBoards[Number(board[1])]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setFaltaAVisitar((antes) => ({ seccao, campo, pedido: (antes?.pedido ?? 0) + 1 }));
  }

  function irParaCampo(campo: CampoPublicado, versao: "pt" | "en" = "pt") {
    setStep(passoDaSeccao(seccaoDoCampo(campo)));
    // Saltar para uma caixa inglesa que não está desenhada deixava-a a olhar
    // para o campo português sem perceber porquê. O interruptor acende-se junto
    // com o salto.
    if (versao === "en") setBilingue(true);
    if (
      campo.tipo === "boardTitulo" ||
      campo.tipo === "boardSubtitulo" ||
      campo.tipo === "boardNota"
    ) {
      const id = doc.moodBoards[campo.bi]?.id;
      if (id && dobrados[id]) escreverDobras({ ...dobrados, [id]: false });
    }
    setCampoAVisitar((antes) => ({ campo, pedido: (antes?.pedido ?? 0) + 1, versao }));
  }

  return {
    nota,
    carregar,
    fotosUsadasNoutras,
    moodBoards,
    arrumacao,
    fotosDosBoards,
    dobras,
    saltos: { irParaAFalta, irParaCampo },
  };
}
