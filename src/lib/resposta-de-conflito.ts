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
 * Devolve `null` quando o erro não é um conflito, para quem chama poder manter
 * o seu tratamento de sempre para tudo o resto:
 *
 *     } catch (err) {
 *       const conflito = respostaDeConflito(err);
 *       if (conflito) return conflito;
 *       log.error(...); return NextResponse.json({ error: "Erro interno" }, { status: 500 });
 *     }
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
 * Uma escrita recusada por uma chave estrangeira (23503) — a linha aponta
 * para uma coisa que outro ecrã acabou de apagar (por exemplo, uma tarefa
 * para um pedido que saiu: P5). É um conflito, não uma avaria: 409 com a
 * frase de conflito de sempre (o ecrã manda recarregar), sem `log.error`.
 */
export function respostaDeLigacaoQueJaSaiu(err: unknown): NextResponse | null {
  if (!err || typeof err !== "object" || (err as { code?: unknown }).code !== "23503") {
    return null;
  }
  return NextResponse.json({ error: MENSAGEM_DE_CONFLITO }, { status: 409 });
}
