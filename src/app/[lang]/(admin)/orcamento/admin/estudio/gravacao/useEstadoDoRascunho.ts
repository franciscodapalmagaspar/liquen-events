"use client";
import type { LeituraDaAbertura } from "@/lib/orcamento/estudio/leitura-da-abertura";
import { useEstadoDaGravacao } from "./useEstadoDaGravacao";
import { useCallback, useRef, useState } from "react";
import { useToast } from "../../Toast";
import { type ResultadoDaGravacao } from "@/lib/orcamento/estudio/gravar";
import { useDocumentoDoEstudio } from "../documento/useDocumentoDoEstudio";
import { useTraducoes } from "../traducoes/useTraducoes";

export interface EntradaEstadoDoRascunho {
  documento: ReturnType<typeof useDocumentoDoEstudio>;
  refEdited: boolean;
  toast: ReturnType<typeof useToast>["toast"];
  traducoes: ReturnType<typeof useTraducoes>;
}

export function useEstadoDoRascunho({
  documento,
  refEdited,
  toast,
  traducoes,
}: EntradaEstadoDoRascunho) {
  const { doc } = documento;
  const { bilingue, idiomaDoPdf } = traducoes;
  /** Quando foi gravado — para o indicador discreto "Guardado às 14:32". */
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  /** Há alterações à espera do debounce? É o que o aviso de saída lê. */
  const [porGravar, setPorGravar] = useState(false);
  /**
   * Onde está o trabalho dela: a caminho, no servidor, só neste computador, ou
   * num servidor que o próximo deploy apaga — uma máquina de estados
   * (`estado-da-gravacao.ts`), com os avisos grandes que falam uma vez.
   */
  const {
    gravacao,
    soNesteComputador,
    naoDuraAoDeploy,
    aGravarNoServidor,
    registarSoLocal,
    marcarGuardadoNoServidor,
    registarNaoDura,
    marcarQueDura,
    partiu: partiuUmaGravacao,
    voltou: voltouUmaGravacao,
    avisoDoSoLocalPorDar,
  } = useEstadoDaGravacao(toast);
  const hydratedRef = useRef(false);
  /** `updatedAt` do rascunho do servidor tal como o lemos — é com isto que o
   *  servidor deteta que alguém gravou por cima entretanto. */
  const serverStampRef = useRef<string | null>(null);
  /** O documento tal como o servidor o tem, da última vez que se falou com
   *  ele. É a base contra a qual se diz «mudei estes campos» — ver
   *  `camposMudados`. */
  const docDoServidorRef = useRef<Record<string, unknown> | null>(null);
  /** Já avisámos desta gravação cruzada? (uma vez chega; não a cada gravação) */
  const warnedOverwriteRef = useRef(false);
  const avisouJuncaoRef = useRef(false);
  /** A abertura assentou (o rascunho local e o do servidor já foram lidos)?
   *  Sem isto a conferência olhava para um ecrã a meio de ser montado. */
  const [aberturaAssente, setAberturaAssente] = useState(false);

  // ── Debounced draft persistence ──
  //
  // `flushDraft` guarda a MESMA gravação que o debounce ia fazer, para o
  // Ctrl/Cmd+Enter dos Serviços a poder disparar já (sem duplicar a lógica nem
  // encurtar o debounce, que é o que segura a escrita durante a escrita).
  // Devolve o que o SERVIDOR respondeu, e não `void`: é o que permite ao
  // Ctrl/Cmd+Enter dizer «guardado» só quando o for mesmo, em vez de o dizer
  // por ter escrito no `localStorage` — que era o erro original, em ponto
  // pequeno.
  const flushDraftRef = useRef<() => Promise<ResultadoDaGravacao>>(async () => ({
    estado: "so-local",
  }));

  // Assim que o documento muda há trabalho por gravar. Volta a false quando a
  // gravação local acontece, oitocentos milissegundos depois.
  //
  // O `ref` ao lado do estado existe para a limpeza da desmontagem (mais
  // abaixo) o poder ler: essa corre uma vez só, com as dependências vazias, e
  // portanto ficaria para sempre com o `porGravar` do primeiro desenho.
  const porGravarRef = useRef(false);
  /**
   * A montagem NÃO é trabalho por gravar.
   *
   * Este efeito também corre no desenho da montagem, e ali o `doc` ainda é o
   * de antes do restauro — o restauro deixou o `setDoc` na fila e ele só
   * chega ao desenho seguinte. Marcar «por gravar» já aqui dava à limpeza da
   * desmontagem (mais abaixo) autorização para gravar esse documento, que é
   * o documento VAZIO: quem abrisse o estúdio e saísse no mesmo instante
   * escrevia-o por cima do rascunho guardado.
   *
   * Saltar a primeira passagem não adia nada do que interessa: o restauro (ou
   * o `seedDefaults`, quando não há rascunho) muda o documento e faz este
   * efeito correr outra vez — aí sim, com a versão boa à mão. O que essa
   * segunda passagem NÃO é está logo a seguir.
   */
  const montagemRef = useRef(true);
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A ABERTURA TAMBÉM NÃO É TRABALHO POR GRAVAR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A segunda passagem deste efeito é sempre a da ABERTURA: o restauro do
   * rascunho, ou — quando não há rascunho — o `seedDefaults` com o que veio do
   * PEDIDO (os pontos de decoração que o casal marcou, o preço final, a regra
   * dos adicionais). Nenhuma dessas coisas foi escrita por ela, e marcá-las
   * como trabalho por gravar custava duas coisas:
   *
   *   1. cada pedido ABERTO PARA LER deixava uma linha de rascunho gravada, e
   *      cada troca de separador pagava um PUT para reescrever o que já lá
   *      estava — que é o que o comentário de cima já descrevia;
   *   2. o «Guardar tudo (1)» acendia por nada, várias vezes por hora. É esse
   *      botão que ela olha antes de fechar o portátil, e um alarme que mente é
   *      um alarme que se deixa de ver.
   *
   * Nada se perde: a semeadura é DERIVADA do pedido e reabrir volta a produzir
   * o mesmo documento, e o restauro é a leitura do que já está gravado. Assim
   * que ela escrever a primeira letra, grava-se tudo — semeadura incluída.
   *
   * ── PORQUE É QUE ISTO NÃO PODE ENGOLIR TRABALHO A SÉRIO ───────────────────
   *
   * O silêncio só vale enquanto o documento for IGUAL ao da abertura, e só até
   * à primeira gravação. Depois de haver rascunho gravado, voltar ao estado de
   * abertura é uma alteração como outra qualquer — e tem de ser gravada, senão
   * o que fica no servidor é a versão do meio.
   */
  const aAbrirRef = useRef(false);
  const marcaDaAberturaRef = useRef<string | null>(null);
  /** A leitura do rascunho do servidor, e se ela já fez algum gesto no ecrã:
   *  as duas metades de `esperaPorElaParaGravar` (`leitura-da-abertura.ts`). */
  const leituraDaAberturaRef = useRef<LeituraDaAbertura>("a-caminho");
  const houveGestoRef = useRef(false);
  /** A marca de cima foi tirada por essa espera, e não pela abertura virgem. */
  const marcaPelaLeituraRef = useRef(false);
  const jaGravouRef = useRef(false);
  /** O que se compara com a abertura: só o que é TRABALHO DELA. Os mapas de
   *  apoio (`assetUrls`, `themeOrigins`) ficam de fora de propósito — são
   *  memória de endereços que a hidratação vai buscar ao servidor, e mudam
   *  sozinhos depois de o ecrã abrir. */
  const marcaDoTrabalho = useCallback(
    () => JSON.stringify([doc, refEdited, bilingue, idiomaDoPdf]),
    [doc, refEdited, bilingue, idiomaDoPdf],
  );
  /** Não há nada por gravar: o que está no ecrã é a abertura, e ainda não se
   *  gravou nada. Vale para o indicador E para a gravação — se só valesse para
   *  o indicador, o alarme calava-se e o PUT continuava a sair, que é meia
   *  correcção com o aspecto de uma inteira. */
  const nadaPorGravar = useCallback(
    // `null` (a marca ainda não foi tirada) NUNCA é igual a uma marca: quando
    // há rascunho guardado a abertura não se marca de todo, e o estúdio grava
    // como sempre gravou.
    () => !jaGravouRef.current && marcaDaAberturaRef.current === marcaDoTrabalho(),
    [marcaDoTrabalho],
  );

  return {
    aAbrirRef,
    houveGestoRef,
    leituraDaAberturaRef,
    marcaPelaLeituraRef,
    aGravarNoServidor,
    aberturaAssente,
    avisoDoSoLocalPorDar,
    avisouJuncaoRef,
    docDoServidorRef,
    flushDraftRef,
    gravacao,
    gravadoEm,
    hydratedRef,
    jaGravouRef,
    marcaDaAberturaRef,
    marcaDoTrabalho,
    marcarGuardadoNoServidor,
    marcarQueDura,
    montagemRef,
    nadaPorGravar,
    naoDuraAoDeploy,
    partiuUmaGravacao,
    porGravar,
    porGravarRef,
    registarNaoDura,
    registarSoLocal,
    serverStampRef,
    setAberturaAssente,
    setGravadoEm,
    setPorGravar,
    soNesteComputador,
    voltouUmaGravacao,
    warnedOverwriteRef,
  };
}
