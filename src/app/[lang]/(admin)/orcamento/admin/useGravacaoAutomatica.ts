"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gravadoEmPorExtenso } from "@/lib/quando-gravado";
import { useInscricaoNoRegisto, type ResultadoDoEcra } from "./registo-de-gravacoes";
import { GRAVACAO_PAUSA_MS, GRAVACAO_TENTATIVAS } from "@/lib/gravar-com-tecto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GRAVAR SOZINHO, E DIZER A VERDADE SOBRE ONDE É QUE O TRABALHO FICOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto é a cadeia de gravação do estúdio de propostas, tirada de lá para poder
 * valer no resto do back office. Nada aqui é ideia nova: cada peça veio de um
 * estrago que já aconteceu, e é por isso que a extracção tem de ser fiel — uma
 * peça que se perca pelo caminho devolve o estrago ao sítio de onde veio.
 *
 *  · a gravação é ADIADA (800 ms) — uma gravação por tecla seria um pedido por
 *    carácter, e encurtar o adiamento é o que quebra a escrita a meio;
 *
 *  · o que estiver pendente é DESCARREGADO ao desmontar (e ao trocar de
 *    pedido). A limpeza de um `setTimeout` corre em QUALQUER desmontagem, e era
 *    assim que se perdia a última linha escrita antes de clicar em «Trocar de
 *    cliente» — com o indicador a continuar a dizer a hora da gravação
 *    ANTERIOR, que é pior do que não haver indicador nenhum;
 *
 *  · fechar o separador é TRAVADO enquanto houver coisa por gravar ou coisa que
 *    não chegou ao servidor;
 *
 *  · repete-se antes de desistir, porque uma ligação que caiu não pode matar a
 *    gravação à primeira — mas NÃO se repete o que dá a mesma resposta: um 4xx
 *    (o pedido é que está errado) ou uma falha permanente (a tabela não existe,
 *    a chave não tem permissões);
 *
 *  · e sobretudo: «guardado» só se diz depois de o servidor o confirmar. Uma
 *    colaboradora montou uma proposta inteira com o ecrã a dizer «guardado às
 *    14:32» o tempo todo; estava no `localStorage` daquele portátil e em mais
 *    lado nenhum. É a palavra que faz uma pessoa fechar o portátil descansada.
 *
 * ── O QUE ESTE MÓDULO NÃO FAZ ──────────────────────────────────────────────
 *
 * Não sabe falar com nenhum servidor em particular: quem chama é que traz o
 * `enviar`. É de propósito — o estúdio manda um PUT do rascunho inteiro, o
 * painel do pedido manda um PATCH só com os campos que foram tocados, e meter
 * as duas coisas aqui dentro seria pôr o hook a saber o que é um pedido.
 *
 * ── NOTA DE MIGRAÇÃO ────────────────────────────────────────────────────────
 *
 * O `ProposalStudio` continua, por agora, com a sua própria cópia desta cadeia
 * (`textoDaGravacao`, `gravarRascunhoNoServidor`, os efeitos do adiamento e da
 * desmontagem). A duplicação é temporária e conhecida: o estúdio está a ser
 * mexido noutro lado, e migrá-lo à força era arriscar o ficheiro onde a perda
 * de trabalho já foi cara. Quando migrar, o que lá está apaga-se — o objectivo
 * é haver UMA gravação automática no back office, não duas parecidas.
 */

/** Espera, em ms, entre a última tecla e a gravação. */
export const ATRASO_DA_GRAVACAO = 800;
// O ritmo (tentativas, pausa, tecto) e o `fetchComTecto` vivem em
// `lib/gravar-com-tecto.ts`: os mesmos do estúdio.

/**
 * ── OS ESTADOS DO INDICADOR ────────────────────────────────────────────────
 *
 * São três, e o terceiro é o que faltava: o indicador tinha «a guardar…» e
 * «guardado às 14:32», e dizia o segundo também quando a gravação no servidor
 * tinha falhado — porque a cópia local tinha corrido bem e mais nada era
 * verificado.
 *
 * O nome do terceiro é o FACTO («não chegou ao servidor») e não a consequência,
 * porque a consequência depende de haver ou não cópia local: no estúdio o
 * trabalho fica no `localStorage` daquele computador, no painel do pedido não
 * fica em lado nenhum. As palavras que a pessoa lê mudam com isso — ver
 * {@link textoDaGravacao} — e é assim que se evita dizer «guardado» onde não
 * há nada guardado.
 */
export type EstadoDaGravacaoNoEcra = "a-guardar" | "nao-chegou-ao-servidor" | "guardado";

export interface TextoDaGravacao {
  /** Para o telemóvel, onde não cabe a frase. */
  curto: string;
  /** Para o computador, e para o `title`. */
  longo: string;
  /** Para quem usa leitor de ecrã: um visto sozinho não diz nada. */
  leitor: string;
}

/**
 * As palavras de cada estado.
 *
 * O terceiro estado tem de ser LIDO, não decifrado — por isso não é um visto de
 * outra cor: são palavras, por extenso, também no telemóvel, que é a única
 * forma de a informação mudar o que a pessoa faz a seguir.
 *
 * `copiaLocal` diz se o trabalho ficou guardado NESTE computador quando o
 * servidor recusou. Com cópia, as palavras são as do estúdio, à letra. Sem
 * cópia, a palavra «guardado» não pode aparecer de maneira nenhuma: não está.
 */
export function textoDaGravacao(
  estado: EstadoDaGravacaoNoEcra,
  gravadoEm: Date | null,
  opcoes: { copiaLocal?: boolean } = {},
): TextoDaGravacao {
  if (estado === "a-guardar") {
    return { curto: "…", longo: "a guardar…", leitor: "a guardar" };
  }
  // Hoje só a hora; ontem e mais atrás, com o dia. Ver `quando-gravado`: a
  // barra reaberta no dia seguinte dizia «guardado às 14:32» e parecia acabada
  // de gravar — e nas variantes de alarme, que dizem quanto trabalho está em
  // risco, a data importa ainda mais.
  const quando = gravadoEmPorExtenso(gravadoEm);
  if (estado === "nao-chegou-ao-servidor") {
    if (opcoes.copiaLocal) {
      // A hora entra na frase porque a pergunta seguinte dela é sempre «desde
      // quando?» — é o que lhe diz quanto trabalho está em risco.
      return {
        curto: "⚠ guardado só neste computador",
        longo: quando ? `guardado só neste computador ${quando}` : "guardado só neste computador",
        leitor: "atenção: está guardado só neste computador e não chegou ao servidor",
      };
    }
    return {
      curto: "⚠ por guardar",
      longo: "por guardar — não chegou ao servidor",
      leitor:
        "atenção: as alterações não chegaram ao servidor e não estão guardadas em lado nenhum",
    };
  }
  return {
    curto: "✓",
    // Sem hora nenhuma diz-se só «guardado»: «guardado às » era o que saía de
    // interpolar uma cadeia vazia atrás da preposição.
    longo: quando ? `guardado ${quando}` : "guardado",
    leitor: "guardado no servidor",
  };
}

/** O que UMA tentativa de envio devolve. A repetição é desta casa, não de quem
 *  chama: `definitivo` é a forma de dizer «não voltes a tentar, a resposta vai
 *  ser esta». */
export type RespostaDoEnvio =
  | { estado: "guardado" }
  | { estado: "falhou"; porque?: string; definitivo?: boolean };

/** O que a gravação inteira devolve — depois de esgotadas as tentativas. */
export type ResultadoDaGravacao =
  | { estado: "guardado" }
  /** Não ficou no servidor. Quem chama sabe se ficou nalgum outro lado. */
  | { estado: "nao-guardado"; porque?: string };

/**
 * Traduz um código de estado HTTP numa tentativa.
 *
 * Um 4xx é o pedido que está errado (sessão expirada, corpo grande demais,
 * campo inválido) e repeti-lo dá exactamente o mesmo. Um 503 marcado como
 * `permanente` é a instalação que está incompleta — a tabela não existe, ou a
 * chave não a pode escrever — e também dá o mesmo. Nos dois casos, repetir só
 * atrasa o aviso.
 */
export function respostaDeHttp(
  status: number,
  opcoes: { porque?: string; permanente?: boolean } = {},
): RespostaDoEnvio {
  if (status >= 200 && status < 300) return { estado: "guardado" };
  return {
    estado: "falhou",
    porque: opcoes.porque,
    definitivo: status < 500 || opcoes.permanente === true,
  };
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Corre uma tentativa de cada vez, com pausa curta e crescente, e devolve a
 * VERDADE sobre onde é que a coisa ficou. Nunca lança: uma edição não pode
 * falhar porque a gravação falhou.
 */
export async function enviarComRepeticao(
  tentar: () => Promise<RespostaDoEnvio>,
): Promise<ResultadoDaGravacao> {
  let porque: string | undefined;
  for (let tentativa = 1; tentativa <= GRAVACAO_TENTATIVAS; tentativa++) {
    let r: RespostaDoEnvio;
    try {
      r = await tentar();
    } catch {
      // Rede em baixo, ou o tecto de tempo. É exactamente o caso que a
      // repetição existe para apanhar — e não há motivo nenhum para mostrar,
      // porque não houve resposta.
      r = { estado: "falhou" };
    }
    if (r.estado === "guardado") return r;
    if (r.porque) porque = r.porque;
    if (r.definitivo) break;
    if (tentativa < GRAVACAO_TENTATIVAS) await pausa(GRAVACAO_PAUSA_MS * tentativa);
  }
  return { estado: "nao-guardado", porque };
}

/**
 * Trava o fecho do separador enquanto `activo`.
 *
 * Vive aqui, e não dentro do hook, porque o painel do pedido precisa dele
 * também para os campos que continuam a exigir um clique — e duas cópias deste
 * efeito seriam duas maneiras de ele deixar de existir sem ninguém reparar.
 */
export function useTravaoDeSaida(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [activo]);
}

/**
 * Um valor sempre fresco para quem corre FORA do desenho — temporizadores e
 * limpezas de efeitos. Escrito depois do commit e nunca durante o render.
 */
function useRefFresca<V>(valor: V) {
  const r = useRef(valor);
  useEffect(() => {
    r.current = valor;
  });
  return r;
}

export interface OpcoesDaGravacaoAutomatica<T> {
  /** O que há para gravar. Mudar isto arma a gravação. */
  valor: T;
  /**
   * Manda o valor ao servidor. UMA tentativa — a repetição é do hook. Nunca
   * precisa de apanhar os seus próprios erros: atirar conta como falha que se
   * repete.
   */
  enviar: (valor: T) => Promise<RespostaDoEnvio>;
  /**
   * Cópia local síncrona, se houver (o estúdio grava no `localStorage`). É
   * feita ANTES do servidor, e é o que decide as palavras do terceiro estado:
   * sem ela, uma gravação recusada não pode dizer «guardado» de maneira
   * nenhuma.
   */
  gravarLocalmente?: (valor: T) => void;
  /** Enquanto for `false` nada é gravado — para quem ainda está a hidratar, ou
   *  para um painel que está fechado. */
  activo?: boolean;
  /**
   * Quem é o dono do valor (o id do pedido, do rascunho…). Trocá-la DESCARREGA
   * o que estava por gravar do dono anterior e volta a marcar a linha de base —
   * é o «Trocar de cliente» sem desmontagem nenhuma pelo meio.
   */
  chave?: string | number | null;
  atraso?: number;
  /** Por omissão compara-se por identidade: quem passa um objecto tem de o
   *  memorizar, ou cada desenho seria uma alteração nova. */
  saoIguais?: (a: T, b: T) => boolean;
  /**
   * ── O NOME NO BOTÃO «GUARDAR TUDO» ────────────────────────────────────────
   *
   * Quem usa esta cadeia é INSCRITO NO REGISTO por ela (ver
   * `registo-de-gravacoes`), sem ter de se lembrar disso. É de propósito: se a
   * inscrição fosse uma linha que cada ecrã novo tivesse de escrever, o botão
   * passaria a mentir por omissão à primeira vez que alguém se esquecesse — e
   * um botão que diz «tudo guardado» com trabalho por gravar noutro sítio é
   * pior do que não haver botão nenhum.
   *
   * O `nome` é o que ELA lê na resposta do botão e na pergunta ao fechar o
   * separador: «Proposta de Rita & Tomás», «Notas do pedido LQ-042». Nunca o
   * nome do componente — «ProposalStudio» não lhe diz que proposta está em
   * risco. Sem nome nenhum a inscrição continua a acontecer (calar-se seria o
   * pior dos dois), com um rótulo genérico que se vê logo que está a faltar.
   *
   * `null` é a única saída, e é uma DECISÃO escrita: «este ecrã inscreve-se à
   * mão». Usa-a quem tem mais coisas por gravar do que as que passam por aqui —
   * o painel do pedido, por exemplo, junta o texto que grava sozinho às
   * decisões que ainda exigem um clique, e uma linha só é o que ela quer ler.
   * Quem a usa fica também com o travão de saída entregue ao registo.
   */
  nome?: string | null;
}

/** O rótulo de quem se inscreveu sem dizer como se chama. Aparece à vista, e é
 *  para aparecer: é assim que se descobre o ecrã que falta baptizar. */
export const NOME_POR_OMISSAO = "Alterações por gravar";

export interface GravacaoAutomatica {
  /** `null` quando ainda não há nada para dizer — o indicador não se mostra. */
  estado: EstadoDaGravacaoNoEcra | null;
  texto: TextoDaGravacao | null;
  /** Quando é que uma cópia ficou mesmo feita (local ou servidor). */
  gravadoEm: Date | null;
  /** Há alterações à espera do adiamento. */
  porGravar: boolean;
  /** Há gravações a caminho do servidor. */
  aCaminho: boolean;
  /** A última gravação não chegou ao servidor, e porquê (quando se sabe). */
  naoChegouAoServidor: { porque?: string } | null;
  /** Grava já, sem esperar pelo adiamento. Devolve o que o servidor disse. */
  gravarJa: () => Promise<ResultadoDaGravacao>;
}

export function useGravacaoAutomatica<T>({
  valor,
  enviar,
  gravarLocalmente,
  activo = true,
  chave = null,
  atraso = ATRASO_DA_GRAVACAO,
  saoIguais = Object.is,
  nome,
}: OpcoesDaGravacaoAutomatica<T>): GravacaoAutomatica {
  const [gravadoEm, setGravadoEm] = useState<Date | null>(null);
  const [porGravar, setPorGravar] = useState(false);
  /**
   * Quantas gravações estão AGORA a caminho do servidor.
   *
   * Uma contagem e não um booleano: a gravação de saída (a da desmontagem, ou a
   * da troca de pedido) pode sobrepor-se à do adiamento. Sem isto havia uma
   * janela em que o ecrã dizia «guardado às 14:32» sem ninguém saber ainda se
   * tinha ficado guardado.
   */
  const [aCaminho, setACaminho] = useState(0);
  const [naoChegou, setNaoChegou] = useState<{ porque?: string } | null>(null);

  const enviarRef = useRefFresca(enviar);
  const localRef = useRefFresca(gravarLocalmente);
  const iguaisRef = useRefFresca(saoIguais);
  const valorRef = useRefFresca(valor);

  /** O que o servidor tem (ou o que julgamos que tem). Comparar com isto é o
   *  que distingue «ela escreveu» de «o painel voltou a desenhar». */
  const baseRef = useRef<T>(valor);
  const chaveRef = useRef(chave);
  /** O `porGravar` que a limpeza de um efeito consegue ler: essa corre com as
   *  dependências que tinha, e ficaria para sempre com o do primeiro desenho. */
  const porGravarRef = useRef(false);
  /**
   * O temporizador do adiamento que está de pé, para quem grava POR OUTRA PORTA
   * o poder desarmar. Ver o `desarmarAdiamento` abaixo.
   */
  const adiamentoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * ── QUEM GRAVA AGORA DESARMA O QUE IA GRAVAR DAQUI A POUCO ────────────────
   *
   * A limpeza do efeito do adiamento só corre quando o efeito volta a correr —
   * e gravar por fora dele (o botão «Guardar», o ⌘S, o «Guardar tudo», a troca
   * de pedido) não muda nenhuma das dependências. O temporizador ficava de pé e
   * disparava passados os 800 ms com o MESMO texto: um segundo pedido para
   * escrever o que já lá estava, e o indicador a voltar de «guardado» a «a
   * guardar…» logo depois de lhe termos dito que estava tudo guardado. Nessa
   * janela o registo volta a contar este ecrã como tendo coisa por gravar, e
   * fechar o separador é travado por trabalho que já está no servidor.
   */
  const desarmarAdiamento = useCallback(() => {
    if (adiamentoRef.current === null) return;
    clearTimeout(adiamentoRef.current);
    adiamentoRef.current = null;
  }, []);

  const gravar = useCallback(async (valorEste: T): Promise<ResultadoDaGravacao> => {
    const chaveDesta = chaveRef.current;
    desarmarAdiamento();

    // A cópia local primeiro: é síncrona, e o que ela guarda sobrevive a tudo o
    // que vier a seguir — inclusive a um servidor que recuse. Rebentar aqui
    // (quota cheia, storage desligado) não pode impedir a ida ao servidor, que
    // é justamente a cópia que interessa.
    let houveCopiaLocal = false;
    try {
      if (localRef.current) {
        localRef.current(valorEste);
        houveCopiaLocal = true;
      }
    } catch {
      /* quota / storage indisponível — não é motivo para não tentar o servidor */
    }

    baseRef.current = valorEste;
    porGravarRef.current = false;
    setPorGravar(false);
    if (houveCopiaLocal) setGravadoEm(new Date());

    setACaminho((n) => n + 1);
    try {
      const r = await enviarComRepeticao(() => enviarRef.current(valorEste));
      // O painel já mostra outro pedido: mexer no indicador agora seria
      // carimbar noutro sítio uma coisa que aconteceu aqui. Quem chamou recebe
      // o resultado à mesma e decide o que dizer.
      if (chaveRef.current !== chaveDesta) return r;
      if (r.estado === "guardado") {
        setNaoChegou(null);
        setGravadoEm(new Date());
      } else {
        setNaoChegou({ porque: r.porque });
      }
      return r;
    } finally {
      setACaminho((n) => Math.max(0, n - 1));
    }
    // Só refs — esta função tem de ser estável, ou o adiamento reiniciava a
    // cada desenho e a gravação nunca chegava a acontecer durante a escrita.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A gravação do último valor ARMADO — é isto que a descarga corre. */
  const gravarPendente = useRef<() => Promise<ResultadoDaGravacao>>(async () => ({
    estado: "nao-guardado",
  }));

  // ── O adiamento ────────────────────────────────────────────────────────────
  // Declarado ANTES da descarga de propósito: as limpezas correm pela ordem de
  // declaração dos efeitos, portanto quando a descarga corre o temporizador já
  // foi cancelado e não há gravação a dobrar.
  useEffect(() => {
    if (chaveRef.current !== chave) {
      // Pedido novo no painel. O que ele traz do servidor é a linha de base, não
      // uma alteração — sem isto, a primeira comparação era contra o pedido
      // anterior e gravava-se por gravar. E o indicador é por pedido: a hora da
      // gravação do anterior não pode ficar a valer para este.
      chaveRef.current = chave;
      baseRef.current = valor;
      porGravarRef.current = false;
      setPorGravar(false);
      setNaoChegou(null);
      setGravadoEm(null);
      return;
    }
    if (!activo) return;
    if (iguaisRef.current(valor, baseRef.current)) return;

    porGravarRef.current = true;
    setPorGravar(true);
    const gravarEste = () => gravar(valor);
    gravarPendente.current = gravarEste;
    const t = setTimeout(() => void gravarEste(), atraso);
    adiamentoRef.current = t;
    return () => {
      clearTimeout(t);
      if (adiamentoRef.current === t) adiamentoRef.current = null;
    };
  }, [valor, chave, activo, atraso, gravar, iguaisRef]);

  /**
   * ── DESCARREGAR O QUE FICOU PENDENTE ──────────────────────────────────────
   *
   * A limpeza do adiamento corre em QUALQUER desmontagem — e a desmontagem
   * acontece por gestos normais e frequentes: trocar de cliente, mudar de
   * separador, seguir um link. O percurso que isto corrige: escreve-se a última
   * linha e sai-se dentro dos 800 ms; a gravação era cancelada e o indicador
   * continuava a dizer a hora da gravação anterior.
   *
   * Só grava quando há mesmo trabalho por gravar: sem o `ref`, cada troca de
   * separador pagava um pedido para reescrever o que já lá estava.
   */
  useEffect(() => {
    return () => {
      if (porGravarRef.current) void gravarPendente.current();
    };
  }, [chave]);

  const gravarJa = useCallback(() => gravar(valorRef.current), [gravar, valorRef]);

  /**
   * ── O QUE ESTE ECRÃ TEM POR GRAVAR, DITO AO REGISTO ───────────────────────
   *
   * A janela do adiamento é estreita, mas existe. E quando a gravação não
   * chegou ao servidor a janela não é estreita nenhuma — é todo o tempo em que
   * o servidor continuar a recusar, e é justamente esse o trabalho que o gesto
   * «Guardar tudo» existe para voltar a tentar.
   */
  const temCoisaPorGravar = porGravar || aCaminho > 0 || naoChegou !== null;
  const temCopiaLocal = !!gravarLocalmente;

  /**
   * A tradução do desfecho para as palavras do registo.
   *
   * `nao-guardado` e `so-neste-computador` são a MESMA falha do servidor com
   * consequências diferentes, e quem sabe distingui-las é este hook: com cópia
   * local o trabalho ficou neste computador, sem ela não ficou em lado nenhum.
   * Deixar essa distinção para o botão seria pedir-lhe que adivinhasse — e
   * adivinhar, aqui, dá «guardado» onde não está nada guardado.
   */
  const gravarParaORegisto = useCallback(async (): Promise<ResultadoDoEcra> => {
    const r = await gravarJa();
    if (r.estado === "guardado") return { estado: "guardado" };
    return temCopiaLocal
      ? { estado: "so-neste-computador", porque: r.porque }
      : { estado: "nao-guardado", porque: r.porque };
  }, [gravarJa, temCopiaLocal]);

  const oRegistoFalaPorMim = useInscricaoNoRegisto({
    nome: nome ?? NOME_POR_OMISSAO,
    porGravar: temCoisaPorGravar,
    gravarJa: gravarParaORegisto,
    activo: activo && nome !== null,
  });

  // ── O travão de fechar o separador ─────────────────────────────────────────
  // Havendo registo, o travão é DELE: um só para o back office inteiro, e capaz
  // de dizer o que é que se perde em vez de só que se perde alguma coisa. Sem
  // registo (um ecrã montado fora do back office, um teste), este continua a
  // valer — um travão que desaparecesse em silêncio seria a pior troca
  // possível.
  useTravaoDeSaida(!oRegistoFalaPorMim && temCoisaPorGravar);

  const estado: EstadoDaGravacaoNoEcra | null =
    porGravar || aCaminho > 0
      ? "a-guardar"
      : naoChegou
        ? "nao-chegou-ao-servidor"
        : gravadoEm
          ? "guardado"
          : null;

  const texto = useMemo(
    () => (estado ? textoDaGravacao(estado, gravadoEm, { copiaLocal: temCopiaLocal }) : null),
    [estado, gravadoEm, temCopiaLocal],
  );

  return {
    estado,
    texto,
    gravadoEm,
    porGravar,
    aCaminho: aCaminho > 0,
    naoChegouAoServidor: naoChegou,
    gravarJa,
  };
}
