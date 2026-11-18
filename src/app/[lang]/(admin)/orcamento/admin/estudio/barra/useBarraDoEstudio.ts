"use client";
import { useEstadoDaGravacao } from "../gravacao/useEstadoDaGravacao";
import { useCallback, useEffect, useRef, useState } from "react";
import { useInscricaoNoRegisto } from "../../registo-de-gravacoes";
import { useLarguraDaZona } from "../../useMedida";
import { useBarrasQueEncolhem } from "../../ui/barras-que-encolhem";
import { tecladoAberto } from "@/lib/orcamento/barra-de-destinos";
import { LARGURA_DA_BARRA_INTEIRA, LARGURA_MINIMA_DA_FILA } from "../limites";
import { useAccoesReversiveis } from "../documento/useAccoesReversiveis";
import { usePassosDoEstudio } from "../passos/usePassosDoEstudio";

export interface EntradaBarraDoEstudio {
  aGravarNoServidor: ReturnType<typeof useEstadoDaGravacao>["aGravarNoServidor"];
  oRegistoFalaPorMim: ReturnType<typeof useInscricaoNoRegisto>;
  passos: ReturnType<typeof usePassosDoEstudio>;
  porGravar: boolean;
  reversiveis: ReturnType<typeof useAccoesReversiveis>;
  soNesteComputador: ReturnType<typeof useEstadoDaGravacao>["soNesteComputador"];
}

export function useBarraDoEstudio({
  aGravarNoServidor,
  oRegistoFalaPorMim,
  passos,
  porGravar,
  reversiveis,
  soNesteComputador,
}: EntradaBarraDoEstudio) {
  const { step } = passos;
  const { limpo, setLimpo } = reversiveis;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A PRÉ-VISUALIZAÇÃO DA PÁGINA SÓ SE MONTA ONDE ELA SE VÊ
   * ════════════════════════════════════════════════════════════════════════
   *
   * A miniatura de cada mood board era desenhada SEMPRE e escondida por CSS
   * (`2xl:hidden`). É exactamente o que o `PainelDoEstudio.tsx:52-57` deixou de
   * fazer, e a razão está lá escrita: numa proposta no tecto do gerador,
   * desenhar as páginas num ecrã onde elas nem se veem foi o suficiente para o
   * estúdio deixar de responder em cinco segundos. Aqui são SETE cópias — uma
   * por mood board —, cada uma com as URLs de todas as fotografias. Num 4G, de
   * pé numa quinta, isso é trabalho e são bytes que não dão nada em troca.
   *
   * E o número estava errado: o comentário justificava-se com «a partir de
   * `2xl` o painel da direita mostra a mesma página», mas o painel passou a
   * `CORTES.largo` (1440). Entre 1440 e 1535 apareciam AS DUAS.
   *
   * Como no painel, no servidor responde `false` — o HTML sai pelo caminho
   * estreito (com a miniatura) e ela desaparece na hidratação. É o lado seguro
   * dos dois: quem tem ecrã largo perde uma miniatura que já tinha ao lado,
   * quem não tem nunca fica sem ela.
   */
  /**
   * A fila das três colunas, para ela poder perguntar quanto mede a SI PRÓPRIA
   * em vez de perguntar à janela. É a correcção de fundo — ver
   * `LARGURA_MINIMA_DA_FILA`, e o `PainelDoEstudio`, que deixou de decidir.
   *
   * UM nome só para a resposta, e é este: o comentário aqui em cima conta o que
   * custou haver dois sítios a responder à mesma pergunta com números
   * diferentes. Continua a ser um número só; mudou a pergunta.
   *
   * Zero é a resposta do servidor e do primeiro fotograma, e quer dizer «ainda
   * não sei» — aí o painel NÃO se monta. O caminho estreito nunca pode depender
   * de haver espaço, que é a mesma regra do `useMedida`.
   */
  const filaDasColunas = useRef<HTMLDivElement | null>(null);
  const painelLateralCabe = useLarguraDaZona(filaDasColunas) >= LARGURA_MINIMA_DA_FILA;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A FOLGA POR BAIXO DO FORMULÁRIO É A ALTURA MEDIDA DA BARRA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ver o comentário ao lado do `paddingBottom`, na marcação. O que aqui se
   * mede são duas coisas somadas: a altura da barra e a distância a que ela
   * está do fundo do ecrã (o `bottom-[calc(56px+…)]` que a levanta por cima da
   * navegação do telemóvel). Sem a segunda, a folga era curta exactamente nos
   * ecrãs onde a barra está mais alta.
   *
   * Começa em 80 px — o número que aqui estava escrito à mão — para o primeiro
   * desenho não ficar sem folga nenhuma antes de a medição correr.
   */
  const barraDeBaixo = useRef<HTMLDivElement | null>(null);
  /**
   * ── A BARRA COMPACTA DO TELEMÓVEL ─────────────────────────────────────────
   *
   * Palavras dela (14/10), com a captura do «Rever e enviar» num iPhone: «esta
   * aba de enviar ao cliente no telemóvel tapa tudo… transforma isto em algo
   * inteligente que se adapte». A barra levava o voltar, a língua, o
   * descarregar, o «Vai para», a lista do que falta e o enviar — meio ecrã.
   *
   * Numa caixa estreita fica uma linha só: «←», uma pastilha com o estado
   * («Faltam 3 ›») e «Enviar». A pastilha abre uma folha com tudo o resto,
   * inteiro. A pergunta é à CAIXA do estúdio e não à janela (ver
   * `o-estudio-pergunta-a-caixa`); uma largura ainda por medir (zero, no
   * servidor e no jsdom) conta como larga, que é a barra de sempre.
   */
  const caixaDoEstudio = useRef<HTMLDivElement | null>(null);
  const larguraDoEstudio = useLarguraDaZona(caixaDoEstudio);
  const barraCompacta = larguraDoEstudio > 0 && larguraDoEstudio < LARGURA_DA_BARRA_INTEIRA;
  const [folhaDoEnvio, setFolhaDoEnvio] = useState(false);
  /** No ecrã largo: o painel da pastilha do estado, e a pastilha onde se ancora. */
  const [painelDoEnvio, setPainelDoEnvio] = useState(false);
  const pastilhaDoEnvio = useRef<HTMLButtonElement>(null);
  const fecharPainelDoEnvio = useCallback(() => setPainelDoEnvio(false), []);
  /**
   * Com o teclado aberto, a barra compacta sai da frente: no telemóvel, o
   * teclado e a barra juntos deixavam uma tira de ecrã para o campo onde ela
   * está a escrever. É a mesma conta da cápsula dos destinos
   * (`tecladoAberto`, em `barra-de-destinos.ts`); sem `visualViewport` (jsdom,
   * browsers antigos) fica tudo como antes.
   */
  const [tecladoNoEcra, setTecladoNoEcra] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;
    const ver = () => setTecladoNoEcra(tecladoAberto(window.innerHeight, vv.height));
    ver();
    vv.addEventListener("resize", ver);
    return () => vv.removeEventListener("resize", ver);
  }, []);
  const barraEscondida = barraCompacta && tecladoNoEcra;
  /**
   * ── AO DESCER NO TELEMÓVEL, AS BARRAS ENCOLHEM (15/11) ──────────────────
   * Em cima ficam só os passos; em baixo a barra de destinos fica, e esta fica
   * só com o essencial — o total «A pagar» e o botão principal. Ao subir volta
   * tudo. O que sai daqui leva `data-acessorio-da-barra`: o «anterior», o
   * estado da gravação quando está tudo bem, e os comandos do envio que a
   * pastilha já resume. Um ALARME (gravação que não chegou, preço que ficou
   * por gravar) não o leva, e fica sempre.
   *
   * É o CSS que esconde (`admin.css`, pelo atributo da raiz), e não estado
   * daqui: mudar de inteiras para encolhidas a meio de uma rolagem não pode
   * voltar a desenhar este componente inteiro. Ver `ui/barras-que-encolhem.ts`.
   */
  useBarrasQueEncolhem();
  const [folgaDaBarra, setFolgaDaBarra] = useState(80);
  useEffect(() => {
    const el = barraDeBaixo.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => {
      const r = el.getBoundingClientRect();
      /**
       * ── O QUE SOBRA POR BAIXO DA BARRA É O `bottom` DELA, E NÃO A DISTÂNCIA
       *    AO FUNDO DA JANELA ────────────────────────────────────────────────
       *
       * Isto era `Math.max(0, window.innerHeight - r.bottom)`, e a intenção
       * está escrita duas linhas acima: «a distância a que ela está do fundo do
       * ecrã (o `bottom-[calc(56px+…)]` que a levanta por cima da navegação do
       * telemóvel)». Ou seja — o `bottom` do `sticky`. A conta pela janela dá
       * esse número só quando quem rola É a janela.
       *
       * MEDIDO num Chromium, no painel que abre a partir do cartão de um
       * cliente, onde quem rola é o painel e não a janela: o fundo da barra
       * ficava a 384 px e o fundo da caixa que rola a 876 — quase 500 px de
       * diferença que entravam na conta como se fossem folga a reservar.
       *
       *     folga reservada    893 a 962 px
       *     folga necessária   ~569 px
       *
       * E realimentava-se: mais folga faz a coluna mais alta, a barra sobe na
       * janela, a distância ao fundo cresce, a folga cresce outra vez. Daí os
       * valores a saltar entre larguras (420, 962, 421, 913, 893) e o vazio de
       * quase mil píxeis no fim do passo 1.
       *
       * O `bottom` calculado é a mesma resposta sem depender de quem rola: é o
       * que o `sticky` reserva por baixo, resolvido em píxeis, com o
       * `env(safe-area-inset-bottom)` já dentro.
       */
      const porBaixo = Math.max(0, Number.parseFloat(getComputedStyle(el).bottom) || 0);
      setFolgaDaBarra(Math.ceil(r.height + porBaixo + 12));
      // ── E A MESMA MEDIDA SERVE A QUEM FLUTUA POR CIMA ──────────────────
      // O aviso do `Toast.tsx` põe-se a uma distância fixa do fundo — a altura
      // da navegação do telemóvel mais um respiro — e essa distância cai
      // exactamente dentro desta barra, que pousa nessa mesma navegação. Sem
      // isto, um aviso de gravação falhada nasce por cima do botão
      // «Pré-visualizar» e come-lhe o toque durante quatro segundos.
      // Publicamos a altura MEDIDA (a barra quebra em duas linhas quando o
      // passo o pede, e aí é mais alta) para o aviso se afastar tanto quanto
      // preciso e nem um pixel mais. Só existe enquanto o estúdio estiver
      // aberto: a limpeza do efeito devolve-a a zero.
      // Escondida pelo teclado, a barra não ocupa nada: o aviso desce.
      const altura = barraEscondida ? 0 : Math.ceil(r.height);
      // Só se escreve quando muda: uma variável no `<html>` herda-se por todos
      // os elementos, e cada escrita refaz o estilo da página inteira.
      const raiz = document.documentElement.style;
      if (raiz.getPropertyValue("--bo-barra-accao") !== `${altura}px`) {
        raiz.setProperty("--bo-barra-accao", `${altura}px`);
      }
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    window.addEventListener("resize", medir);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
    };
    // O passo muda o conteúdo da barra (e portanto a altura); remedir aí.
  }, [step, barraEscondida]);
  // ── A VARIÁVEL SAI QUANDO O ESTÚDIO FECHA, NÃO A CADA PASSO (10/11) ────────
  // Estava na limpeza do efeito de cima, que corre a cada mudança de passo:
  // tirar e voltar a pôr a variável no `<html>` refazia o estilo da página
  // inteira duas vezes por passo — numa proposta com 9 mood boards, uma boa
  // parte do tempo de abrir a Inspiração. Fechado o estúdio, volta a zero
  // como antes (o aviso deixa de subir por uma barra que já não existe).
  useEffect(
    () => () => {
      document.documentElement.style.removeProperty("--bo-barra-accao");
    },
    [],
  );

  // ── Aviso ao sair com trabalho por gravar ─────────────────────────────
  // A janela é estreita (a gravação é a 800ms), mas existe: fechar o
  // separador logo a seguir a escrever perdia essas últimas palavras.
  //
  // E também quando o rascunho ficou SÓ NESTE COMPUTADOR: aí a janela não é
  // estreita nenhuma — é todo o tempo em que o servidor recusar as gravações.
  // Fechar o separador nesse estado não perde o `localStorage`, mas perde a
  // única pessoa que ainda podia fazer alguma coisa acerca disso.
  //
  // DENTRO DO BACK OFFICE QUEM TRAVA É O REGISTO: um travão só para todos os
  // ecrãs, e capaz de nomear o que se perde («Proposta de Rita & Tomás») em vez
  // de dizer apenas que se perde alguma coisa. Este continua a valer onde não
  // há registo — o dossier do evento, um teste — porque um travão que
  // desaparecesse em silêncio seria a pior troca possível.
  useEffect(() => {
    if (oRegistoFalaPorMim) return;
    if (!porGravar && !soNesteComputador && aGravarNoServidor === 0) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [oRegistoFalaPorMim, porGravar, soNesteComputador, aGravarNoServidor]);

  // ── A contagem dos dez segundos para anular a limpeza ─────────────────
  useEffect(() => {
    if (!limpo) return;
    if (limpo.segundos <= 0) {
      setLimpo(null);
      return;
    }
    const t = setTimeout(
      () => setLimpo((l) => (l ? { ...l, segundos: l.segundos - 1 } : null)),
      1000,
    );
    return () => clearTimeout(t);
  }, [limpo, setLimpo]);

  return {
    barraCompacta,
    barraDeBaixo,
    barraEscondida,
    caixaDoEstudio,
    fecharPainelDoEnvio,
    filaDasColunas,
    folgaDaBarra,
    folhaDoEnvio,
    painelDoEnvio,
    painelLateralCabe,
    pastilhaDoEnvio,
    setFolhaDoEnvio,
    setPainelDoEnvio,
  };
}
