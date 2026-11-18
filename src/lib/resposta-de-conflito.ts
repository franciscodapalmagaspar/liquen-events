import "server-only";
import { NextResponse } from "next/server";
import {
  MENSAGEM_DE_CONFLITO,
  isConflictError,
  isMissingTable,
  type ConflictError,
} from "./repository";

/**
 * A RESPOSTA A DAR QUANDO DUAS PESSOAS ESCREVERAM AO MESMO TEMPO
 *
 * O `Repository` já recusa escrever por cima de uma leitura ultrapassada e já
 * relê e volta a tentar três vezes. Quando nem assim resolve, o `ConflictError`
 * sobe até à rota — e aí, apanhado pelo `catch` de topo, virava 500 "Erro
 * interno". Para quem está do outro lado isso é indistinto de uma avaria: ela
 * carrega em gravar outra vez e, à segunda, a escrita passa e apaga mesmo o
 * trabalho da colega. O 500 não só não explica nada como CONVIDA ao erro que
 * tudo isto existe para impedir.
 *
 * A forma da resposta não é nova: é a que `/api/visao-geral` já usa para o
 * `StaleWriteError` — 409, uma frase para a pessoa, e a versão do servidor no
 * corpo, para o ecrã poder mostrar as duas lado a lado e deixar a decisão a
 * quem escreveu. Está aqui num sítio só para todas as rotas responderem
 * exactamente o mesmo; seis cópias da mesma resposta divergem à terceira.
 *
 * `submetido` é a parte que não se pode cortar: sem ele, a resposta de erro é o
 * sítio onde o trabalho da pessoa desaparece. Com ele, o que ela escreveu
 * continua recuperável mesmo tendo a gravação sido recusada — que é o mínimo
 * exigível a uma colisão.
 *
 * Devolve `null` quando o erro não é um conflito. As rotas usam, quase
 * sempre, {@link respostaDeEscritaRecusada}, que junta esta à da ligação que
 * já saiu (uma chave estrangeira).
 */
export function respostaDeConflito(err: unknown): NextResponse | null {
  if (!isConflictError(err)) return null;
  const conflito = err as ConflictError;
  return NextResponse.json(
    {
      error: MENSAGEM_DE_CONFLITO,
      /** O que o servidor tem agora — a versão a mostrar ao lado da da pessoa. */
      current: conflito.current,
      /** O que esta gravação queria escrever, para não se perder na recusa. */
      submetido: conflito.attempted,
    },
    { status: 409 },
  );
}

/**
 * Uma escrita que a base recusou por causa de OUTRA escrita: ou duas pessoas
 * ao mesmo tempo (409, {@link respostaDeConflito}), ou a coisa a que a linha
 * se liga saiu entretanto (404, {@link respostaDeLigacaoQueJaSaiu}). `null`
 * para tudo o resto, para quem chama manter o seu tratamento de sempre:
 *
 *     } catch (err) {
 *       const recusada = respostaDeEscritaRecusada(err);
 *       if (recusada) return recusada;
 *       log.error(...); return NextResponse.json({ error: "Erro interno" }, { status: 500 });
 *     }
 */
export function respostaDeEscritaRecusada(err: unknown): NextResponse | null {
  return respostaDeConflito(err) ?? respostaDeLigacaoQueJaSaiu(err);
}

/**
 * A OUTRA METADE DO BLOQUEIO OPTIMISTA, VISTA DE FORA
 *
 * A comparação escreve e lê a coluna `updated_at`. Numa instalação onde o
 * `db/schema.sql` ainda não foi corrido depois desta mudança, a coluna não
 * existe e TODAS as escritas da tabela falham — não com um erro de dados, mas
 * com "column updated_at does not exist" (42703 / PGRST204), que o `catch` de
 * topo arruma como 500 "Erro interno".
 *
 * Isto não é uma avaria: é uma instalação por acabar, e tem uma resolução de um
 * minuto que a própria equipa pode fazer. Dizê-lo é a diferença entre "Erro
 * interno" (que não indica caminho nenhum) e "falta correr o ficheiro no
 * Supabase" — a mesma distinção que `/api/visao-geral` e as rotas do Material
 * já fazem. Devolve `null` quando o erro é outra coisa.
 *
 * @param oQueFalta nome do que a pessoa estava a fazer, para a frase ser dela
 *   ("As faturas", "As tarefas") e não do esquema.
 */
export function respostaDeMigracaoEmFalta(err: unknown, oQueFalta: string): NextResponse | null {
  if (!isMissingTable(err)) return null;
  return NextResponse.json(
    {
      error:
        `${oQueFalta} não podem ser gravadas: falta uma actualização na base de dados. ` +
        "No Supabase → SQL Editor, cola e corre o ficheiro db/schema.sql " +
        "(pode repetir-se sem risco) e tenta de novo.",
    },
    { status: 503 },
  );
}

/**
 * As chaves estrangeiras para o PEDIDO (`quotes.id`): a das propostas, que já
 * existia, e as três do P5 (`db/schema.sql`). Só estas querem dizer «o pedido
 * desta linha saiu» — uma 23503 noutra chave é outra coisa, e fica com o
 * tratamento de sempre. Acrescentar uma chave ao pedido é acrescentá-la aqui.
 */
export const LIGACOES_AO_PEDIDO: ReadonlySet<string> = new Set([
  "proposals_quote_id_fkey",
  "tasks_quote_id_fkey",
  "invoices_quote_id_fkey",
  "contracts_quote_id_fkey",
]);

/**
 * As chaves estrangeiras que uma 23503 do PostgREST nomeia, entre aspas, na
 * mensagem ou nos detalhes — seja qual for a língua da base (`lc_messages`).
 */
function restricoesDe(e: { message?: unknown; details?: unknown }): string[] {
  const texto = `${String(e.message ?? "")} ${String(e.details ?? "")}`;
  return [...texto.matchAll(/"([a-z0-9_]+_fkey)"/g)].map((m) => m[1]);
}

/**
 * Uma escrita recusada por uma chave estrangeira para o pedido (23503): a
 * linha aponta para um pedido que outro ecrã acabou de apagar — uma tarefa,
 * uma proposta ou um contrato (P5). Reconhece-se pelo CÓDIGO e pelo NOME da
 * restrição ({@link LIGACOES_AO_PEDIDO}), não pela frase em inglês. Nenhuma
 * dessas chaves recusa um apagar (são `cascade` ou `set null`), por isso uma
 * 23503 nelas é sempre a escrita do filho. Repetir não resolve: é 404 «Não
 * encontrado», a frase de sempre, e não é avaria (sem `log.error`).
 */
export function respostaDeLigacaoQueJaSaiu(err: unknown): NextResponse | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { code?: unknown; message?: unknown; details?: unknown };
  if (e.code !== "23503") return null;
  if (!restricoesDe(e).some((r) => LIGACOES_AO_PEDIDO.has(r))) return null;
  return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
}
