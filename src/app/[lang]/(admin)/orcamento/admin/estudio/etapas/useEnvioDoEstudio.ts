"use client";

import { useFotosDaPagina } from "../pdf/useFotosDaPagina";
import { useDisposicaoDasPaginas } from "../pdf/useDisposicaoDasPaginas";
import { usePaletaDaProposta } from "../pdf/usePaletaDaProposta";
import { useBibliotecaDeFotos } from "../fotos/useBibliotecaDeFotos";
import { useFasesDoCronograma } from "../passos/inspiracao/useFasesDoCronograma";
import { useAdicionaisDoOrcamento } from "../passos/orcamento/useAdicionaisDoOrcamento";
import { usePdfDaProposta } from "../envio/usePdfDaProposta";
import { useSugestoesDoPedido } from "../passos/evento/useSugestoesDoPedido";
import { useLinkDaPropostaEnviada } from "../envio/useLinkDaPropostaEnviada";
import { useConferenciaComOEnviado } from "../versoes/useConferenciaComOEnviado";
import { useCopiaEModelos } from "../versoes/useCopiaEModelos";
import { useProntaParaEnviar } from "../envio/useProntaParaEnviar";
import { useEnviarAProposta } from "../envio/useEnviarAProposta";
import { useBotaoDoEnvio } from "../envio/useBotaoDoEnvio";
import { usePainelDaProposta } from "../painel/usePainelDaProposta";
import type { useNucleoDoEstudio } from "./useNucleoDoEstudio";
import type { useInspiracaoDoEstudio } from "./useInspiracaoDoEstudio";
import type { useRascunhoGuardaSozinho } from "./useRascunhoGuardaSozinho";
import type { useConteudoDoEstudio } from "./useConteudoDoEstudio";

export function useEnvioDoEstudio({
  adiamento,
  anular,
  arrumacao,
  avisos,
  barra,
  camposPorConfirmar,
  capa,
  chavesDoRascunho,
  confirmacoes,
  dobras,
  documento,
  envio,
  envioAdiado,
  escolha,
  fotos,
  fotosDosBoards,
  fotosUsadasNoutras,
  geracoes,
  hidratar,
  moodBoards,
  ocupado,
  ordenacao,
  paginasDaProposta,
  passos,
  pedido,
  rascunho,
  referencia,
  resumo,
  reversiveis,
  saltos,
  total,
  traducoes,
}: Pick<
  ReturnType<typeof useNucleoDoEstudio> &
    ReturnType<typeof useRascunhoGuardaSozinho> &
    ReturnType<typeof useConteudoDoEstudio> &
    ReturnType<typeof useInspiracaoDoEstudio>,
  | "adiamento"
  | "anular"
  | "arrumacao"
  | "avisos"
  | "barra"
  | "camposPorConfirmar"
  | "capa"
  | "chavesDoRascunho"
  | "confirmacoes"
  | "dobras"
  | "documento"
  | "envio"
  | "envioAdiado"
  | "escolha"
  | "fotos"
  | "fotosDosBoards"
  | "fotosUsadasNoutras"
  | "geracoes"
  | "hidratar"
  | "moodBoards"
  | "ocupado"
  | "ordenacao"
  | "paginasDaProposta"
  | "passos"
  | "pedido"
  | "rascunho"
  | "referencia"
  | "resumo"
  | "reversiveis"
  | "saltos"
  | "total"
  | "traducoes"
>) {
  const { totalInput } = total;
  const { apontarGeracao } = geracoes;
  const { busy, setBusy } = ocupado;
  const { onSent, quote } = pedido;
  const { toast } = avisos;
  const { DRAFT_KEY } = chavesDoRascunho;
  const { aberturaAssente } = rascunho;
  const { sent } = envio;
  const { hidratarAssets } = hidratar;
  const { setRefEdited } = referencia;
  const { enviarAgoraRef } = adiamento;
  const { resumoComLink } = resumo;
  const { irParaAFalta } = saltos;
  const { ordemDosBoards } = ordenacao;

  const fotosDaPagina = useFotosDaPagina({ anular, capa, documento, paginasDaProposta });
  const disposicao = useDisposicaoDasPaginas({
    anular,
    capa,
    documento,
    fotosDaPagina,
    moodBoards,
    paginasDaProposta,
  });
  const paleta = usePaletaDaProposta({
    anular,
    documento,
    fotos,
    fotosDaPagina,
    paginasDaProposta,
  });
  const biblioteca = useBibliotecaDeFotos({
    capa,
    disposicao,
    documento,
    escolha,
    fotos,
    fotosDaPagina,
    fotosDosBoards,
  });
  const fases = useFasesDoCronograma({ documento, reversiveis, totalInput });
  const adicionais = useAdicionaisDoOrcamento({ confirmacoes, documento, total });
  const pdfDaProposta = usePdfDaProposta({
    apontarGeracao,
    barra,
    busy,
    documento,
    envio,
    paginasDaProposta,
    quote,
    setBusy,
    toast,
    traducoes,
  });
  const sugestoesDoPedido = useSugestoesDoPedido({ documento });
  useLinkDaPropostaEnviada({ envio, quote });
  const conferencia = useConferenciaComOEnviado({
    DRAFT_KEY,
    aberturaAssente,
    confirmacoes,
    documento,
    quote,
    reversiveis,
    sent,
    toast,
    total,
  });
  const copia = useCopiaEModelos({
    camposPorConfirmar,
    confirmacoes,
    documento,
    hidratarAssets,
    reversiveis,
    setRefEdited,
    toast,
    total,
  });
  const pronta = useProntaParaEnviar({
    busy,
    documento,
    envio,
    fotos,
    passos,
    pdfDaProposta,
    quote,
    total,
    traducoes,
  });
  const enviar = useEnviarAProposta({
    apontarGeracao,
    busy,
    documento,
    enviarAgoraRef,
    envio,
    envioAdiado,
    fotosUsadasNoutras,
    onSent,
    paginasDaProposta,
    passos,
    pdfDaProposta,
    pronta,
    quote,
    resumoComLink,
    setBusy,
    toast,
    traducoes,
  });
  const botaoDoEnvio = useBotaoDoEnvio({
    documento,
    envio,
    passos,
    pdfDaProposta,
    pronta,
    total,
    traducoes,
  });
  const painel = usePainelDaProposta({
    arrumacao,
    dobras,
    documento,
    escolha,
    fotosDaPagina,
    irParaAFalta,
    ordemDosBoards,
    passos,
    quote,
  });

  return {
    fotosDaPagina,
    disposicao,
    paleta,
    biblioteca,
    fases,
    adicionais,
    pdfDaProposta,
    sugestoesDoPedido,
    conferencia,
    copia,
    pronta,
    enviar,
    botaoDoEnvio,
    painel,
  };
}
