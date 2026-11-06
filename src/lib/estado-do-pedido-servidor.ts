import "server-only";
import type { QuoteStatus } from "@/lib/orcamento/types";
import {
  estadoApos,
  transicaoDoPedido,
  type AcontecimentoDoPedido,
} from "@/lib/orcamento/estado-do-pedido";
import { getQuoteStatus, updateQuoteWith } from "@/lib/quotes-store";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LEVAR A TRANSIÇÃO AO PEDIDO — SEM NUNCA PODER DERRUBAR QUEM CHAMOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A decisão vive em `@/lib/orcamento/estado-do-pedido` e é pura. Isto é o
 * braço que a executa: lê o pedido, aplica a regra, grava o estado novo e a
 * linha do histórico.
 *
 * ── PORQUE É QUE ISTO NUNCA ATIRA ─────────────────────────────────────────
 *
 * Quem chama já fez a coisa a sério: a proposta seguiu por email, o pagamento
 * ficou registado, o contrato está guardado. Deixar um erro subir daqui
 * transformava um trabalho FEITO numa mensagem de falha — e quem a lê tenta
 * outra vez, e a segunda tentativa bate nas guardas de duplicação. Ficava com o
 * ecrã a dizer ao mesmo tempo que falhou e que já existe, quando o que falhou
 * foi só a cor de uma coluna.
 *
 * Por isso: melhor esforço, tudo apanhado, e um registo de erro para não se
 * perder em silêncio. O estado errado corrige-se com um arrasto no quadro; um
 * email enviado que a aplicação diz não ter enviado, não.
 *
 * ── PORQUE É QUE É `updateQuoteWith` E NÃO `updateQuote` ──────────────────
 *
 * A decisão depende do estado ACTUAL, e estas rotas são lentas — a do envio da
 * proposta desenha um PDF de uma dúzia de páginas e manda um email pelo meio.
 * Entre o `getQuote` do princípio e este momento, o pedido pode ter mudado (ela
 * arrastou-o no quadro noutro separador). Ler aqui dentro, sobre o registo
 * fresco e com a repetição optimista do repositório, é o que garante que a
 * regra do não-recuo é avaliada contra o que está gravado — e que a linha nova
 * do histórico não apaga a que outra ferramenta escreveu entretanto.
 */

/** O mesmo tecto que o PATCH do pedido aplica ao histórico. */
const MAX_HISTORICO = 5000;

/**
 * Regista um acontecimento no pedido e sobe-lhe o estado, se for caso disso.
 *
 * Devolve o estado NOVO quando houve mudança, e `null` quando não houve —
 * porque a regra não a justificava (o pedido já estava lá ou mais à frente,
 * ou está `rejeitado`), ou porque a gravação falhou. Quem chama não é obrigado
 * a olhar para o valor: a acção principal não depende dele.
 */
export async function registarAcontecimento(
  quoteId: string | undefined | null,
  acontecimento: AcontecimentoDoPedido,
  detalhe?: string,
): Promise<QuoteStatus | null> {
  // Há acontecimentos sem pedido associado. Não há coluna nenhuma para mexer —
  // e não é um erro.
  if (!quoteId) return null;

  const resultado: { estado: QuoteStatus | null } = { estado: null };
  try {
    await updateQuoteWith(quoteId, (quote) => {
      const transicao = transicaoDoPedido({
        acontecimento,
        estadoActual: quote.status,
        detalhe,
      });
      // Devolver o pedido INTACTO é o caminho normal e tem de ser barato: a
      // maioria dos acontecimentos cai num pedido que já está à frente deles.
      if (!transicao) return quote;
      resultado.estado = transicao.status;
      return {
        ...quote,
        status: transicao.status,
        activityLog: [...(quote.activityLog ?? []), transicao.entrada].slice(-MAX_HISTORICO),
      };
    });
  } catch (e) {
    log.error("estado do pedido: transição automática falhou", e, { id: quoteId, acontecimento });
    return null;
  }
  return resultado.estado;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «A PREPARAR PROPOSTA» — O ACONTECIMENTO QUE CORRE A CADA TECLA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (6/11): o pedido passa sozinho a «A preparar proposta» quando o
 * estúdio grava o rascunho. Quem chama é o `PUT` do `proposta-rascunho`, e esse
 * corre a cada pausa na escrita — dezenas de vezes numa tarde, sobre o mesmo
 * pedido.
 *
 * O `registarAcontecimento` acima não serve sozinho, e não por estar errado:
 * ele lê o pedido INTEIRO e GRAVA-O sempre (o `updateWith` do repositório
 * persiste mesmo quando a regra devolve o pedido intacto, e carimba o
 * `lastUpdated`). Uma vez, depois de enviar uma proposta, isso não se sente. A
 * cada tecla era uma escrita por autosave — e um `lastUpdated` sempre fresco,
 * que apagava o aviso de «parado há 14 dias» do quadro.
 *
 * Por isso, primeiro a pergunta barata (regra 7 do `GASTAR-POUCO`):
 *
 *   · quantas vezes corre — uma por gravação do rascunho do estúdio;
 *   · quanto gasta — uma leitura de UMA coluna curta pela chave primária
 *     (`getQuoteStatus`), e mais nada no caso normal, que é o pedido já estar
 *     em «A preparar proposta» ou à frente;
 *   · o que se grava — o pedido, UMA vez, na gravação em que o estado muda. É
 *     aí, e só aí, que se paga o `registarAcontecimento` (que relê e decide de
 *     novo sobre o registo fresco, para o não-recuo ser avaliado contra o que
 *     está gravado e não contra a leitura barata).
 *
 * ── E QUANDO A ESCRITA FALHA ──────────────────────────────────────────────
 *
 * Até a migração `db/migracoes/20261106_quotes_status_a_preparar.sql` correr, a
 * base recusa o valor novo (`quotes_status_chk`). Sem uma pausa, cada tecla
 * voltava a tentar a escrita e voltava a falhar. Uma falha deixa este pedido
 * em sossego durante `PAUSA_DEPOIS_DE_FALHAR_MS` nesta instância da função; a
 * seguinte tenta outra vez. O rascunho grava-se na mesma — isto nunca atira.
 */
const PAUSA_DEPOIS_DE_FALHAR_MS = 10 * 60_000;
/** Teto da memória das falhas: uma instância não acumula pedidos para sempre. */
const MAX_FALHAS_LEMBRADAS = 200;
const falhouHa = new Map<string, number>();

export async function marcarPropostaEmPreparacao(
  quoteId: string | undefined | null,
  agora: number = Date.now(),
): Promise<QuoteStatus | null> {
  if (!quoteId) return null;
  const falhou = falhouHa.get(quoteId);
  if (falhou !== undefined && agora - falhou < PAUSA_DEPOIS_DE_FALHAR_MS) return null;

  let estado: QuoteStatus | null | undefined;
  try {
    estado = await getQuoteStatus(quoteId);
  } catch (e) {
    log.error("estado do pedido: não se leu o estado para «A preparar proposta»", e, {
      id: quoteId,
    });
    return null;
  }
  // Não há pedido com este id — não há coluna nenhuma para mexer.
  if (estado === undefined) return null;
  // O caso de quase todas as gravações: já lá está, ou já seguiu, ou perdeu-se.
  if (!estadoApos("proposta_em_preparacao", estado)) return null;

  const novo = await registarAcontecimento(quoteId, "proposta_em_preparacao");
  if (novo) {
    falhouHa.delete(quoteId);
  } else {
    // `null` aqui é a escrita que falhou (ou, raro, outra pessoa que mexeu no
    // pedido entre as duas leituras — e então também não há nada a fazer).
    if (falhouHa.size >= MAX_FALHAS_LEMBRADAS) falhouHa.clear();
    falhouHa.set(quoteId, agora);
  }
  return novo;
}

/** Só para os testes: esquece as falhas lembradas entre casos. */
export function esquecerFalhasDePreparacao(): void {
  falhouHa.clear();
}
