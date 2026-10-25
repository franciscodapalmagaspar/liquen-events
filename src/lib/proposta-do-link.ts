import "server-only";
import { cache } from "react";
import type { Proposal } from "@/lib/orcamento/types";
import { getProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { getAcceptedContractByQuote } from "@/lib/contracts-store";
import { readProposalToken } from "@/lib/proposal-token";
import { codigoDoEndereco, lerLigacaoCurta } from "@/lib/proposta-link-curto";
import { aindaAbre, linksCortadosEm } from "@/lib/links-cortados";
import { estadoDaVersao, seloDoConteudo, type EstadoDaVersao } from "@/lib/proposta-versao";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DO CASAL SEGUE O PEDIDO, NÃO A LINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Se eu ajustar o preço ou os serviços, o casal vê a versão
 * atual **sem eu reenviar nada**.»
 *
 * Não era o que acontecia, e a razão é de arquitectura. O token guarda um
 * `pid` — o identificador de UMA proposta (`proposal-token.ts`) — e uma
 * revisão nesta casa é uma proposta NOVA («uma proposta que já seguiu para o
 * casal nunca é reescrita», na rota do estúdio). O link que está na caixa de
 * correio do casal apontava, portanto, para a versão 1 até ao fim dos tempos:
 * ela corrigia o preço, gerava a revisão, e o casal continuava a abrir o link
 * antigo e a ler o preço antigo. Sem nada em lado nenhum a dizê-lo.
 *
 * Este ficheiro é a resolução, num sítio só, porque são TRÊS as portas que a
 * fazem — a página, o PDF e as fotografias. Três respostas diferentes davam
 * uma página a mostrar a versão 2 com um botão que descarregava a 1.
 *
 * ── PORQUE É QUE ISTO NÃO ABRE UM BURACO ──────────────────────────────────
 *
 * O token continua a autorizar exactamente o que autorizava: UM pedido, o de
 * quem o recebeu. Só se salta para outra linha quando as três coisas se
 * verificam ao mesmo tempo:
 *
 *   1. é do MESMO pedido (`quoteId` igual, e não vazio — `quote_id` é
 *      `on delete set null`, portanto vazio é um estado real e não pode
 *      emparelhar com vazio);
 *   2. é do MESMO cliente (`clientEmail` igual, os dois preenchidos) — a
 *      defesa em profundidade que já existe no portal, para uma ligação mal
 *      feita na base nunca poder revelar a proposta de outra pessoa;
 *   3. JÁ FOI OFERECIDA a alguém (`status !== "rascunho"`). Esta é a que
 *      protege o trabalho dela: um rascunho de revisão a meio de ser escrito
 *      não pode aparecer ao casal enquanto ela está a pensar. O que ela ainda
 *      não enviou não existe do lado de lá.
 *
 * Sem as três, fica-se na proposta do token — que é exactamente o que a
 * aplicação fazia antes deste ficheiro.
 *
 * ── E O ACEITE MANDA EM TUDO ──────────────────────────────────────────────
 *
 * «Se a proposta já foi aceite, o que foi aceite fica congelado e imutável.»
 * Havendo aceite no pedido, é a proposta ACEITE que se mostra — nunca a mais
 * recente. Uma revisão posterior é uma versão nova, que precisa de um aceite
 * novo (Fase 4); até lá o casal continua a ver o que disse que sim.
 */

export interface PropostaDoLink {
  /** A proposta a mostrar — já resolvida por todas as regras acima. */
  proposta: Proposal;
  /** A proposta para que o token foi emitido (pode ser a mesma). */
  doToken: Proposal;
  /** Se houve mesmo um salto para uma revisão mais recente. */
  seguiu: boolean;
  /** O selo do conteúdo que está a ser mostrado. */
  selo: string;
  estado: EstadoDaVersao;
  /** O número que se diz em voz alta. `undefined` nas anteriores à coluna. */
  versao?: number;
  /** ISO — quando o conteúdo mudou pela última vez. */
  versaoEm?: string;
  /**
   * O número da versão VIVA do pedido, que só difere da mostrada quando há um
   * aceite e o documento foi revisto depois dele. É o que permite dizer «o
   * casal aceitou a 2, e há uma 3 por aceitar» sem inventar nada.
   */
  versaoVivaNumero?: number;
}

/** Dois emails são do mesmo cliente quando existem os dois e são iguais. */
function mesmoCliente(a: string | undefined, b: string | undefined): boolean {
  const x = (a ?? "").trim().toLowerCase();
  const y = (b ?? "").trim().toLowerCase();
  return !!x && x === y;
}

/**
 * A proposta que o link deve mostrar, e em que versão está.
 *
 * Devolve `null` quando o token não vale ou a proposta desapareceu — os
 * chamadores já tratam esses dois casos com a mesma frase, de propósito (um
 * link privado nunca diz se um identificador existe).
 */
/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA VISITA, UMA LEITURA — E NÃO DUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto era chamado DUAS VEZES por cada abertura de proposta, e ninguém dava
 * por isso: uma vez no `generateMetadata` da página (para o título do
 * separador) e outra no corpo dela. Duas chamadas independentes, cada uma com
 * a cadeia toda — ler a ligação curta, ler a proposta, e às vezes ler a
 * proposta outra vez. São três a quatro idas à base de dados repetidas, em
 * cada visita, a disputar a mesma ligação.
 *
 * O `cache` do React resolve-o pela raiz: dentro do MESMO pedido, a segunda
 * chamada com o mesmo testemunho recebe o resultado da primeira sem tocar na
 * rede. É o que os documentos do Next mandam usar quando não há um `fetch`
 * para memorizar sozinho — e aqui não há, porque quem fala com a base de
 * dados é o cliente do Supabase.
 *
 * NÃO é uma cache entre visitas: cada pedido novo lê tudo outra vez. Uma
 * proposta que ela reveja continua a abrir revista no instante seguinte, que
 * é a garantia que esta casa nunca abre mão.
 *
 * Para os bots que não correm JavaScript — e o WhatsApp é um deles, num link
 * que os casais reenviam — o `generateMetadata` bloqueia a resposta inteira.
 * Aí esta poupança não é conforto: é metade do tempo de espera.
 */
export const propostaDoLink = cache(async function propostaDoLink(
  token: string | undefined | null,
): Promise<PropostaDoLink | null> {
  /**
   * DUAS PORTAS PARA A MESMA SALA.
   *
   * O que vem no endereço é o token assinado (os links já enviados, que têm de
   * continuar a abrir) ou o código curto de 16 caracteres. Distinguem-se pela
   * forma, sem ambiguidade possível: um token tem pontos e duzentos caracteres.
   *
   * O código curto é tentado primeiro porque é uma comparação de forma, barata,
   * e falha de imediato para tudo o que seja um token.
   */
  // O formato novo traz os nomes à frente (`ana-e-joao-k7m2q9xd`); quem conta é
  // só o código do fim (`codigoDoEndereco`). Os de 16 continuam a passar.
  const doEndereco = codigoDoEndereco(token);
  const codigo = doEndereco ? await lerLigacaoCurta(doEndereco) : null;
  const doTokenAssinado = codigo ? null : readProposalToken(token);
  const propostaId = codigo?.propostaId ?? doTokenAssinado?.proposalId;
  if (!propostaId) return null;

  /**
   * Quando é que ESTE endereço foi emitido — a data de criação do código curto,
   * ou o `iat` do token (deduzido do `exp` nos tokens anteriores a esse campo).
   * É com isto que o corte de links decide, e é a única coisa que as duas
   * portas precisam de trazer em comum.
   */
  const emitidoEm = codigo ? Date.parse(codigo.criadaEm) : doTokenAssinado?.emitidoEm;

  const doToken = await getProposal(propostaId);
  if (!doToken) return null;

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O CORTE DE LINKS FECHA-SE AQUI, E TEM DE SER AQUI
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O `proposta-link-curto.ts` avisou, quando nasceu, que cortar só o código
   * curto «não fecha porta nenhuma — quem tem o email antigo entra à mesma»:
   * o token assinado abre a mesma sala e não faz pergunta nenhuma a ninguém.
   *
   * Este ficheiro é o sítio onde as duas portas se juntam, e é a única razão
   * pela qual o corte se pode escrever uma vez em vez de duas. Fica ANTES de
   * tudo o resto — antes do salto para a versão mais recente, antes do aceite,
   * antes dos selos —, porque um link cortado não tem que dar trabalho nenhum
   * ao servidor nem revelar que a proposta existe.
   *
   * É por PEDIDO, e não por proposta: uma revisão nesta casa é uma proposta
   * nova, e o salto mais abaixo leva o casal da proposta do token para a irmã
   * mais recente. Cortar por proposta deixaria as irmãs abertas e o próprio
   * salto trataria de as ir buscar — um corte que não corta.
   *
   * O `quoteId` vazio é um estado real (`quote_id` é `on delete set null`) e aí
   * não há corte possível: não há pedido a que o carimbo pertença.
   */
  const pedido = (doToken.quoteId ?? "").trim();

  /**
   * ── AS TRÊS LEITURAS DO PEDIDO PARTEM JUNTAS ─────────────────────────────
   *
   * MEDIDO, com 25 ms por ida à base: o caminho do servidor até ao primeiro
   * pixel são 202 ms, e 140 desses — 69% — são esta função, em CINCO idas
   * estritamente uma atrás da outra.
   *
   * Só as duas primeiras são mesmo ordenadas: é preciso ler o link curto para
   * saber que proposta é, e ler a proposta para saber de que pedido é. Daí para
   * a frente, o carimbo dos links cortados, as irmãs e o contrato aceite
   * dependem todos APENAS do `quoteId` — e de nada uns dos outros. Estavam em
   * série por hábito de escrita, não por dependência.
   *
   * Cinco idas passam a três. Aos 25 ms medidos são ~55 ms; se as funções e a
   * base estiverem em continentes diferentes — o que ninguém confirmou ainda —
   * cada ida custa 90 a 120 ms e isto vale perto de um quarto de segundo.
   *
   * ── O QUE ISTO CUSTA, DITO POR EXTENSO ───────────────────────────────────
   *
   * Um link CORTADO passa a fazer duas leituras que antes não fazia. O
   * cabeçalho aqui em cima diz que um link cortado «não tem que dar trabalho
   * nenhum ao servidor», e isso deixa de ser inteiramente verdade.
   *
   * A troca é deliberada: um link cortado é a excepção rara, e um link vivo é
   * todas as vezes. Pagar duas leituras à toa no caso raro para poupar uma ida
   * inteira no caso comum é a troca certa. O que NÃO muda é o que interessa da
   * regra: continua a devolver-se `null`, e continua a não se revelar nada a
   * quem está do outro lado — as leituras são `SELECT` sem efeito nenhum.
   *
   * Cada uma leva o seu `catch`: uma irmã que falhe a ler não pode levar a
   * página atrás, que é o que o `try` mais abaixo sempre garantiu.
   *
   * ── E PORQUE É QUE CADA UMA VAI DENTRO DE UMA FUNÇÃO ─────────────────────
   *
   * Porque um `.catch()` só apanha promessas REJEITADAS. Uma função que
   * rebente de imediato — antes sequer de devolver uma promessa — não deixa
   * promessa nenhuma a que agarrar o `.catch()`: o erro sobe e mata a página.
   *
   * Não é hipótese de manual. Foi assim que isto se partiu: com as leituras
   * dentro do `try` de baixo, um `listProposalsForQuote` em falta era apanhado
   * e a página servia na mesma; movidas para aqui com um `.catch()` solto,
   * passou a rebentar. Um teste que já cá estava apanhou-o.
   *
   * A função `async` à volta converte o rebentamento imediato numa rejeição, e
   * aí o `.catch()` volta a valer para os dois casos — que é o que o `try`
   * fazia e não se podia perder.
   */
  const semRebentar = <T>(nome: string, ler: () => Promise<T>): Promise<T | null> =>
    (async () => ler())().catch((e) => {
      log.warn(`proposta-do-link: não deu para ler ${nome}`, { proposta: doToken.id, erro: e });
      return null;
    });

  const pCorte = pedido
    ? semRebentar("o corte dos links", () => linksCortadosEm(pedido))
    : Promise.resolve(null);
  const pIrmas = pedido
    ? semRebentar("as irmãs", () => listProposalsForQuote(pedido))
    : Promise.resolve(null);
  const pAceite = pedido
    ? semRebentar("o aceite", () => getAcceptedContractByQuote(pedido))
    : Promise.resolve(null);

  if (pedido && !aindaAbre(emitidoEm, await pCorte)) return null;

  let proposta = doToken;
  let seguiu = false;

  /**
   * Melhor esforço declarado: uma leitura que falhe (base em baixo, tabela por
   * criar) NÃO pode deitar abaixo a página da proposta. Fica-se na linha do
   * token — o comportamento de sempre — e escreve-se o aviso.
   */
  /** A mais recente JÁ OFERECIDA do mesmo pedido — o documento vivo. */
  let maisRecente: Proposal | null = null;
  let seloAceite: string | undefined;

  try {
    const quoteId = (doToken.quoteId ?? "").trim();
    if (quoteId) {
      /** Só entram irmãs que passem as três guardas do cabeçalho. */
      const podeMostrar = (p: Proposal) =>
        (p.quoteId ?? "").trim() === quoteId &&
        mesmoCliente(p.clientEmail, doToken.clientEmail) &&
        p.status !== "rascunho";

      const irmas = ((await pIrmas) ?? []).filter(podeMostrar);
      maisRecente =
        [doToken, ...irmas.filter((p) => p.id !== doToken.id)]
          .filter(
            (p) => p.id === doToken.id || +new Date(p.createdAt) > +new Date(doToken.createdAt),
          )
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;

      const aceite = await pAceite;
      if (aceite?.proposalId) {
        // «O que foi aceite fica congelado.» A proposta aceite manda, mesmo
        // que haja uma revisão mais recente por aí.
        const aceitada =
          irmas.find((p) => p.id === aceite.proposalId) ??
          (aceite.proposalId === doToken.id ? doToken : await getProposal(aceite.proposalId));
        if (aceitada && podeMostrar(aceitada)) {
          proposta = aceitada;
          seloAceite = aceite.propostaVersaoSelo || aceitada.versaoSelo || seloDoConteudo(aceitada);
        }
      } else if (maisRecente && maisRecente.id !== doToken.id) {
        /**
         * ══════════════════════════════════════════════════════════════════
         * SALTAR PARA A VERSÃO NOVA NUNCA PODE PERDER O DOCUMENTO
         * ══════════════════════════════════════════════════════════════════
         *
         * MEDIDO num email real: o casal recebeu uma proposta de 15 páginas em
         * anexo, com mood boards, e o link ao lado abriu uma página com a
         * saudação, o subtotal, o IVA, o total e os contactos. Sem Apresentação,
         * sem Serviços, sem Inspiração, sem Condições — e sem o botão «Ver a
         * proposta completa (PDF)».
         *
         * A causa não é a página nem o conteúdo da proposta: é ESTE salto. A
         * página desenha o documento inteiro quando `proposal.doc` existe e cai
         * no quadro de preço quando não existe (`page.tsx`, «O DOCUMENTO
         * INTEIRO, QUANDO ELE EXISTE»), e o botão do PDF está na mesma
         * condição. Este ramo escolhia a irmã mais RECENTE por data — e uma
         * proposta criada pelo construtor de linhas do back office não tem
         * documento nenhum (`api/orcamento/[id]/proposta` grava `lineItems`,
         * nunca um `doc`). Basta ela existir depois, para o mesmo pedido, para
         * o link do casal deixar de mostrar a proposta que lhe foi enviada.
         *
         * A regra passa a ser: só se salta para a versão nova se ela souber
         * mostrar-se. Uma irmã mais recente SEM documento não desloca uma que o
         * tenha — o casal continua a ver a proposta inteira, que é o que o email
         * lhe prometeu. Quando nenhuma das duas tem documento, salta-se na
         * mesma: aí as duas desenham-se da mesma maneira e a mais recente é a
         * verdadeira.
         */
        const perderiaODocumento = Boolean(doToken.doc) && !maisRecente.doc;
        if (perderiaODocumento) {
          log.warn("proposta-do-link: a versão mais recente não tem documento — fica a do link", {
            proposta: doToken.id,
            maisRecente: maisRecente.id,
          });
        } else {
          proposta = maisRecente;
        }
      }
      seguiu = proposta.id !== doToken.id;
    }
  } catch (e) {
    log.warn("proposta-do-link: não deu para procurar a versão atual", {
      proposta: doToken.id,
      erro: e,
    });
  }

  const selo = proposta.versaoSelo || seloDoConteudo(proposta);
  /**
   * O documento VIVO com que se compara o aceite. Sem aceite não há comparação
   * nenhuma a fazer — o que está no ecrã já É o vivo.
   */
  const seloVivo = maisRecente ? maisRecente.versaoSelo || seloDoConteudo(maisRecente) : selo;

  return {
    proposta,
    doToken,
    seguiu,
    selo,
    /**
     * `revista` quando o documento vivo tem outro selo que não o aceite.
     *
     * O selo aceite vem do contrato; e quando o contrato é anterior a essa
     * coluna, vem da PRÓPRIA proposta aceite. Isso não é adivinhar: uma
     * revisão nesta casa é uma proposta nova, portanto a linha aceite nunca é
     * reescrita e o selo que ela traz é, por construção, o que foi aceite.
     * (O `theme-materializar` troca caminhos de fotografias dentro do `doc`,
     * mas não recalcula o selo — a mesma fotografia noutro caminho não é uma
     * versão nova, e não passa a sê-lo.)
     */
    estado: estadoDaVersao(seloVivo, seloAceite),
    versao: proposta.versaoNumero,
    versaoEm: proposta.versaoEm,
    versaoVivaNumero: maisRecente?.versaoNumero,
  };
});
