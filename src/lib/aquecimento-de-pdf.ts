import "server-only";
import { listAllProposals } from "@/lib/proposals-store";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import { existePdfDaProposta } from "@/lib/proposal-pdf-guardado";
import { getState, setState } from "@/lib/app-state";
import { log } from "@/lib/logger";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PROPOSTAS QUE ELA JÁ ENVIOU TAMBÉM TÊM DE ABRIR DEPRESSA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pergunta dela, à letra: «mesmo nas propostas em que já enviamos (…) se
 * esta coisa de melhorar a rapidez em que se carrega no botão e aquilo abre
 * logo, se também vai acontecer nestas propostas que já enviamos».
 *
 * Para quase tudo a resposta é sim sem se fazer nada: o ecrã de espera, a
 * contagem das fotos e o `sharp` adiado são código do servidor e atributos de
 * HTML, e valem no próximo carregamento de qualquer proposta. O PDF é a
 * excepção, e é a que mais custa.
 *
 * ── PORQUE É QUE O PDF É DIFERENTE ────────────────────────────────────────
 *
 * A rota do PDF já não desenha nada no caminho normal: procura o ficheiro
 * guardado e serve-o em fluxo. Só que o ficheiro é guardado NO ENVIO — e há
 * duas famílias de propostas que não o têm:
 *
 *   • as que foram enviadas antes de isso existir;
 *   • as que o perderam quando a chave mudou, a 26/08. A chave é o `sha256` do
 *     conteúdo, e uma alteração no cálculo deixou órfão tudo o que já lá
 *     estava: os ficheiros continuam no armazenamento e nunca mais são
 *     encontrados. Ver o `proposal-pdf-chave.test.ts`, que passou a pregá-la.
 *
 * Para essas, o primeiro casal a carregar no botão paga o desenho inteiro —
 * oitenta fotografias reencodadas — atrás de um link que não diz nada enquanto
 * trabalha. É exactamente a queixa dela, e é a única parte que não se resolve
 * sozinha: alguém tem de desenhar o ficheiro uma vez.
 *
 * Este trabalho desenha-o de noite, para que ninguém o pague de dia.
 *
 * ── PORQUE É QUE ISTO NÃO É UM AGENDAMENTO NOVO ───────────────────────────
 *
 * Porque esta casa já teve um deploy RECUSADO por assumir um plano de
 * alojamento que não tinha — está escrito no `agendamento.contrato.test.ts`,
 * com as palavras «assumi mal, e só o deploy é que mo disse». Um terceiro
 * agendamento é uma aposta nesse mesmo plano. Isto viaja dentro da cópia de
 * segurança que já corre às quatro da manhã, e não custa entrada nenhuma.
 *
 * ── E PORQUE É QUE TEM RELÓGIO E TECTO ────────────────────────────────────
 *
 * Porque a cópia de segurança é a razão de ser daquele trabalho e já foi
 * feita quando isto corre. Um desenho pode demorar dez segundos; oitenta
 * propostas por aquecer esgotavam a função e a cópia ficava sem o registo
 * final. Portanto: um orçamento de tempo, um tecto de propostas, e uma de
 * cada vez — nunca em paralelo, que num contentor pequeno é o que faz o
 * `sharp` bater no tecto de memória.
 *
 * O que sobra para amanhã sobra. São propostas antigas; aquecer seis por noite
 * é uma decisão sobre quantas noites demora, não sobre se funciona.
 */

/** O tempo que este trabalho pode gastar, quando chega ao fim de tudo o resto. */
export const ORCAMENTO_MS = 45_000;

/**
 * Abaixo disto nem se começa.
 *
 * Um desenho a meio que é cortado pelo tecto da função não deixa ficheiro
 * nenhum e gastou o tempo à mesma. Mais vale não abrir o próximo.
 *
 * ── PORQUE É QUE SUBIU DE 8 s PARA 15 s, E DEPOIS PARA 20 s ──────────────
 *
 * Porque o chão tem de caber o PIOR desenho, e a conta mostra-o. Com 8 s, no
 * desenho antigo (80 fotografias chegavam aos 20 s), o último desenho ARRANCAVA
 * aos 37 s dos 45 e acabava aos 57 — e a gravação da memória das falhas vem
 * DEPOIS disso, numa função que morre aos 60. A cópia de segurança já tinha
 * seguido e o trabalho era dado como falhado por causa do aquecimento, que é
 * precisamente o que este ficheiro promete que nunca acontece. Subiu para 15.
 *
 * O desenho novo (`pdf-editorial`, ~26 páginas) é mais caro: 80 fotografias
 * são 23 a 29 s no mau dia (`PIOR_DESENHO_MS`, em `custo-do-pdf.ts`). Com o
 * chão a 15 s acabava aos 59; a 20 s arranca no máximo aos 25 e acaba aos 54,
 * antes dos 55 que deixam tempo para gravar.
 *
 * É por isso que o remédio para a lentidão NÃO é subir o orçamento: subir o
 * orçamento aproxima o desastre. Quem trata da lentidão é a varredura, que
 * corre noutra função e noutra hora.
 */
export const CHAO_MS = 20_000;

/** Quantas propostas por noite, no aquecimento que viaja com a cópia. */
export const TECTO_POR_NOITE = 6;

/**
 * E quantas por chamada, quando é ela a mandar aquecer do back office.
 *
 * Mais alto porque essa chamada tem a função INTEIRA para si: não vem atrás de
 * uma cópia de segurança que já gastou metade do relógio.
 */
export const TECTO_POR_CHAMADA = 8;

/** O orçamento de uma chamada avulsa: a função inteira menos a margem. */
export const ORCAMENTO_AVULSO_MS = 50_000;

/** Onde fica a memória das que falharam. */
export const CHAVE_DO_ESTADO = "aquecimento-pdf:estado";

/** Uma proposta que falhou não se volta a tentar antes disto. */
export const ESPERA_APOS_FALHA_MS = 7 * 24 * 60 * 60 * 1000;

/** E ao fim de três tentativas deixa de se tentar. */
export const TENTATIVAS_ATE_DESISTIR = 3;

type Falhada = { emFalta: number; tentadaEm: string; tentativas: number };

/**
 * O que se sabe do aquecimento, entre execuções.
 *
 * `falhadas` — as que rebentaram, com a espera e o contador de tentativas.
 *
 * `feitas` — id da proposta → chave do documento que se confirmou guardada.
 * É uma memória de «isto já está quente», e existe por uma razão que só se vê
 * quando a fila encolhe: a lista é percorrida da mais recente para a mais
 * antiga, e as mais recentes são exactamente as que JÁ têm o PDF (foi guardado
 * no envio). Sem esta memória, todas as noites se paga uma ida ao armazenamento
 * por cada proposta já quente ANTES de chegar à primeira fria — com oitenta
 * propostas são uns oito segundos de uma janela de trinta, gastos a aprender o
 * que já se sabia. E piora à medida que a fila drena.
 *
 * A correcção é segura por construção: a chave é o `sha256` do CONTEÚDO. Uma
 * proposta revista dá outra chave, não bate com a memória, e volta a ser
 * verificada e desenhada como se fosse nova.
 */
export type EstadoDoAquecimento = {
  falhadas: Record<string, Falhada>;
  feitas?: Record<string, string>;
};

export type ResumoDoAquecimento = {
  vistas: number;
  jaTinham: number;
  aquecidas: number;
  incompletas: number;
  falhadas: number;
  adiadas: number;
  semTempo: boolean;
  /**
   * Quantas ficaram por aquecer — as candidatas que este lote não chegou a
   * confirmar quentes. É o que diz a quem chama se vale a pena pedir outro
   * lote, e é o que a varredura do back office lê para saber quando parar.
   */
  restantes: number;
};

/** As opções existem para a MESMA função servir a noite e o botão dela. */
export type OpcoesDoAquecimento = {
  /** Quanto tempo há para gastar. Por omissão, o da noite. */
  orcamentoMs?: number;
  /** Quantas propostas, no máximo. Por omissão, o tecto da noite. */
  tecto?: number;
  /**
   * As propostas já lidas, quando quem chama as tem à mão.
   *
   * A cópia de segurança já lista as propostas todas para as meter no ficheiro
   * (`buildBackupPayload`); sem isto, o aquecimento lia a MESMA tabela outra
   * vez, com o `doc` inteiro em jsonb, dentro da mesma invocação.
   */
  propostas?: PropostaParaAquecer[];
};

/** O que o aquecimento precisa de saber de uma proposta. */
export type PropostaParaAquecer = {
  id: string;
  doc?: ProposalDoc;
  sentAt?: string | null;
  idioma?: unknown;
};

/**
 * Desenha e guarda os PDF que faltam, dentro do tempo que sobrar.
 *
 * Nunca lança: isto corre depois de a cópia de segurança ter seguido, e uma
 * falha aqui não pode transformar uma cópia bem-sucedida num 500. O resumo é
 * para os registos, não para decidir nada.
 */
export async function aquecerPdfsEmFalta(
  /** Quanto tempo já foi gasto pelo trabalho que corre antes deste. */
  decorridoMs: number,
  opcoes: OpcoesDoAquecimento = {},
): Promise<ResumoDoAquecimento> {
  const orcamento = opcoes.orcamentoMs ?? ORCAMENTO_MS;
  const tecto = opcoes.tecto ?? TECTO_POR_NOITE;
  const resumo: ResumoDoAquecimento = {
    vistas: 0,
    jaTinham: 0,
    aquecidas: 0,
    incompletas: 0,
    falhadas: 0,
    adiadas: 0,
    semTempo: false,
    restantes: 0,
  };
  const limite = Date.now() + Math.max(0, orcamento - decorridoMs);
  if (limite - Date.now() < CHAO_MS) {
    resumo.semTempo = true;
    return resumo;
  }

  let estado: EstadoDoAquecimento;
  let propostas: PropostaParaAquecer[];
  try {
    // Lido para mudar e voltar a gravar: uma falha LANÇA (e o `catch` sai sem
    // gravar) em vez de esquecer o que já estava feito — e redesenhar tudo
    // outra vez, a gastar processador (revisão de 13/11, n.º 10).
    estado = (await getState<EstadoDoAquecimento>(CHAVE_DO_ESTADO, { ouFalha: true })) ?? {
      falhadas: {},
    };
    if (!estado.falhadas) estado.falhadas = {};
    if (!estado.feitas) estado.feitas = {};
    // As propostas já lidas por quem chama, quando as tem — ver `OpcoesDoAquecimento`.
    propostas = opcoes.propostas ?? (await listAllProposals());
  } catch (e) {
    log.warn("aquecimento-pdf: não se conseguiu ler o que há a fazer", { erro: String(e) });
    return resumo;
  }

  /**
   * As que já seguiram para um casal, das mais recentes para as mais antigas.
   *
   * A ordem não é arrumação: é quem tem mais probabilidade de ser aberta
   * amanhã. Uma proposta enviada ontem ainda está na caixa de correio de
   * alguém; uma de há dois anos já não se abre.
   *
   * Sem `doc` não há o que desenhar — são as propostas de linhas, criadas em
   * `/api/propostas`, que nunca tiveram documento.
   */
  const candidatas = propostas
    .filter((p) => p.doc && p.sentAt)
    .sort((a, b) => +new Date(b.sentAt ?? 0) - +new Date(a.sentAt ?? 0));

  const agora = Date.now();
  let mudouOEstado = false;
  /** As que já desistiram: não contam para o que falta, porque nunca serão feitas. */
  let desistidas = 0;

  for (const proposta of candidatas) {
    if (resumo.aquecidas >= tecto) break;
    if (limite - Date.now() < CHAO_MS) {
      resumo.semTempo = true;
      break;
    }

    /**
     * Uma que já desistiu não custa nem sequer uma pergunta.
     *
     * Ao fim de três tentativas, a causa não é passageira. O caso comum é uma
     * fotografia que não está no armazenamento, e essa não se resolve sozinha:
     * resolve-se no estúdio — e quando ela lá mexer, o documento muda, a chave
     * muda, e isto volta a ser uma proposta por aquecer como outra qualquer.
     */
    const falha = estado.falhadas[proposta.id];
    if (falha && falha.tentativas >= TENTATIVAS_ATE_DESISTIR) {
      desistidas++;
      continue;
    }

    resumo.vistas++;
    const idioma = idiomaDaProposta(proposta);
    const chave = chaveDoPdf(proposta.doc!, idioma);

    /**
     * ── A PERGUNTA VEM ANTES DA ESPERA, E DE PROPÓSITO ────────────────────
     *
     * Perguntar «já existe?» é uma listagem de um item: não traz o ficheiro,
     * e é barata ao ponto de não valer a pena poupá-la. Desenhar é que é caro.
     *
     * Fazê-la ANTES da espera das falhas resolve um caso que este sistema
     * acabou de ter: uma proposta marcada como falhada cujo PDF, entretanto,
     * passou a existir — porque um casal abriu o link e a rota o desenhou e
     * guardou. Com a pergunta depois da espera, ela ficava marcada mais sete
     * dias por uma falha que já não existia.
     */
    /**
     * A memória primeiro, o armazenamento depois.
     *
     * `feitas[id] === chave` quer dizer que já se CONFIRMOU este documento
     * guardado. A chave é o `sha256` do conteúdo: se o documento mudou, a
     * chave muda, não bate, e cai na verificação a sério. Não há como esta
     * memória servir uma proposta revista.
     */
    if ((estado.feitas ?? {})[proposta.id] === chave) {
      resumo.jaTinham++;
      continue;
    }

    if (await existePdfDaProposta(proposta.id, chave)) {
      resumo.jaTinham++;
      (estado.feitas ??= {})[proposta.id] = chave;
      mudouOEstado = true;
      if (falha) {
        delete estado.falhadas[proposta.id];
        mudouOEstado = true;
      }
      continue;
    }

    // Não existe, e falhou há pouco: fica para a semana que vem. Repetir hoje
    // o desenho que rebentou ontem é gastar o orçamento das outras.
    if (falha && agora - +new Date(falha.tentadaEm) < ESPERA_APOS_FALHA_MS) {
      resumo.adiadas++;
      continue;
    }

    try {
      /**
       * O desenhador entra só aqui, e por `import()`.
       *
       * O `proposal-pdf-cache` traz o `pdf-lib` atrás, e este módulo é
       * importado pela rota da cópia de segurança — que na esmagadora maioria
       * das noites não tem nada para aquecer. É a mesma razão do
       * `sharp-adiado.ts`, e o `pdf/route.ts` já o faz pelo mesmo motivo.
       */
      const { pdfDaPropostaEmCache } = await import("@/lib/proposal-pdf-cache");
      /**
       * `servirIncompleto = false`, e é a decisão que mais importa aqui.
       *
       * Com `true`, uma proposta a que falte uma fotografia desenha-se com o
       * buraco e — pior — seria este trabalho a fixá-la no armazenamento, onde
       * fica a ser servida a um casal para sempre, mesmo depois de ela repor a
       * foto. A rota do casal serve incompleto de propósito, porque aí a
       * alternativa é um botão que não faz nada; aqui a alternativa é não
       * guardar, e não guardar é melhor.
       */
      const pdf = await pdfDaPropostaEmCache(proposta.doc!, idioma, false, proposta.id);
      resumo.aquecidas++;
      log.info("aquecimento-pdf: proposta aquecida", {
        id: proposta.id,
        bytes: pdf.byteLength,
        idioma,
      });
      if (falha) {
        delete estado.falhadas[proposta.id];
        mudouOEstado = true;
      }
    } catch (e) {
      const emFalta = (e as { emFalta?: number })?.emFalta ?? 0;
      if (emFalta > 0) resumo.incompletas++;
      else resumo.falhadas++;
      estado.falhadas[proposta.id] = {
        emFalta,
        tentadaEm: new Date().toISOString(),
        tentativas: (falha?.tentativas ?? 0) + 1,
      };
      mudouOEstado = true;
      log.warn("aquecimento-pdf: proposta não aqueceu", {
        id: proposta.id,
        emFalta,
        erro: String(e),
      });
    }
  }

  /**
   * A memória por processo vai fora no fim.
   *
   * O `pdfDaPropostaEmCache` guarda cada ficheiro desenhado num mapa que vive
   * enquanto o processo viver. Seis PDF de vários megabytes cada, num
   * contentor de função, num processo cujo trabalho ACABOU: é memória retida
   * para nada, e o próximo pedido que caia neste contentor herda-a. O que
   * interessa ficou no armazenamento, que é onde a rota do casal o vai buscar.
   */
  if (resumo.aquecidas > 0) {
    const { esvaziarCachePdf } = await import("@/lib/proposal-pdf-cache");
    esvaziarCachePdf();
  }

  /**
   * O que falta, que é o que diz a quem chama se vale a pena pedir outro lote.
   *
   * Não conta as que desistiram — essas nunca serão feitas por esta via, e
   * mostrá-las como «por aquecer» punha um número que nunca chegava a zero e
   * uma varredura que nunca parava.
   */
  resumo.restantes = Math.max(
    0,
    candidatas.length - resumo.jaTinham - resumo.aquecidas - desistidas,
  );

  if (mudouOEstado) {
    try {
      await setState(CHAVE_DO_ESTADO, estado);
    } catch (e) {
      // Perder a memória das falhas custa uma tentativa repetida amanhã, não
      // um erro. Não vale derrubar nada por isto.
      log.warn("aquecimento-pdf: a memória das falhas não ficou gravada", { erro: String(e) });
    }
  }

  return resumo;
}

/** O que se sabe da fila, sem desenhar nem perguntar ao armazenamento. */
export type ContagemDoAquecimento = {
  /** As que já seguiram para um casal e têm documento — o universo disto. */
  enviadas: number;
  /** As que já se CONFIRMOU guardadas, com a chave deste documento. */
  quentes: number;
  /** As que falharam três vezes: não voltam a ser tentadas por esta via. */
  desistidas: number;
  /** Falharam há menos de uma semana e estão à espera da vez. */
  adiadas: number;
  /**
   * Quantas faltam, NO MÁXIMO.
   *
   * É um tecto e não uma certeza, e vale a pena dizer porquê: uma proposta
   * cujo PDF foi desenhado por um casal a abrir o link ESTÁ quente, e esta
   * contagem não sabe — só o armazenamento sabe, e perguntar-lhe uma vez por
   * proposta era a ida cara que este número existe para evitar.
   *
   * Enganar-se para cima é o lado certo de se enganar: um número que desce
   * mais depressa do que o esperado é uma boa surpresa; um que fica parado em
   * três quando já não falta nada era uma varredura que nunca acabava.
   */
  porAquecer: number;
};

/**
 * Quantas propostas falta aquecer — a pergunta barata.
 *
 * Não desenha nada, não fala com o armazenamento e não escreve estado. Lê a
 * lista das propostas e a memória do aquecimento, e faz contas.
 *
 * Existe porque ninguém sabia o tamanho da fila. «Aquecer tudo» sem saber
 * quantas são é um botão que se carrega às cegas — e a regra dela é que nunca
 * há um estado de espera sem nome. Isto dá-lhe o nome: um número.
 */
export async function contarPorAquecer(): Promise<ContagemDoAquecimento> {
  const vazia: ContagemDoAquecimento = {
    enviadas: 0,
    quentes: 0,
    desistidas: 0,
    adiadas: 0,
    porAquecer: 0,
  };

  let estado: EstadoDoAquecimento;
  let propostas: PropostaParaAquecer[];
  try {
    estado = (await getState<EstadoDoAquecimento>(CHAVE_DO_ESTADO)) ?? { falhadas: {} };
    propostas = await listAllProposals();
  } catch (e) {
    log.warn("aquecimento-pdf: não se conseguiu contar a fila", { erro: String(e) });
    return vazia;
  }

  const falhadas = estado.falhadas ?? {};
  const feitas = estado.feitas ?? {};
  const agora = Date.now();
  const c = { ...vazia };

  for (const proposta of propostas) {
    if (!proposta.doc || !proposta.sentAt) continue;
    c.enviadas++;

    const falha = falhadas[proposta.id];
    if (falha && falha.tentativas >= TENTATIVAS_ATE_DESISTIR) {
      c.desistidas++;
      continue;
    }
    // A mesma regra do aquecimento: a chave é o `sha256` do CONTEÚDO, portanto
    // uma proposta revista não bate com a memória e volta a contar como fria.
    if (feitas[proposta.id] === chaveDoPdf(proposta.doc, idiomaDaProposta(proposta))) {
      c.quentes++;
      continue;
    }
    if (falha && agora - +new Date(falha.tentadaEm) < ESPERA_APOS_FALHA_MS) c.adiadas++;
    c.porAquecer++;
  }

  return c;
}
