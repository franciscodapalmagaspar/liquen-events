import "server-only";
import { promises as fs } from "fs";
import path from "path";

/** O `app_state` sem base de dados (desenvolvimento): um mapa num ficheiro. */
export const FILE = path.join(process.cwd(), "data", "app-state.json");

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO FICHEIRO É UM SÍTIO NUMA MÁQUINA E NÃO É UM SÍTIO EM VERCEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Na máquina de alguém, o `data/app-state.json` é o servidor local: sobrevive a
 * fechar o portátil, é visível de qualquer navegador que fale com ele, e é o
 * recurso legítimo de quem trabalha sem base de dados. Em Vercel, o MESMO
 * ficheiro vive no disco da função — não sobrevive a um deploy, e muitas vezes
 * nem à invocação seguinte, porque o contentor é reciclado.
 *
 * A diferença é o AMBIENTE, e é por isso que a distinção vive aqui e não numa
 * propriedade do ficheiro. A regra é a MESMA que o `repository.assertWritableInProd`
 * e o restauro (`backup-restore.replaceAll`) já usam para recusar escritas —
 * deliberadamente a mesma, para não haver duas ideias diferentes de «isto é
 * produção» a divergirem com o tempo.
 *
 * Lê-se na hora e não no arranque do módulo: os testes trocam o ambiente por
 * caso, e um valor congelado à importação fazia o segundo caso responder o do
 * primeiro.
 */
export function oFicheiroEhEfemero(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function readFileState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FICHEIRO É UM MAPA INTEIRO: DUAS ESCRITAS AO MESMO TEMPO SÃO UMA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aqui não se grava uma linha, grava-se o mapa TODO: ler o ficheiro, pôr a
 * chave, escrever o ficheiro. Há um `await` no meio, e é isso que estraga tudo
 * — duas chamadas em paralelo lêem ambas o mapa ANTES de qualquer uma escrever,
 * e a segunda grava por cima o mapa dela, sem a chave da primeira. A primeira
 * escrita aconteceu mesmo; foi a seguinte que a apagou.
 *
 * Onde isto doeu: a REPOSIÇÃO de uma cópia de segurança repõe os rascunhos do
 * estúdio em lotes de 25 chamadas paralelas (ver `proposal-drafts.ts`). Medido,
 * de 25 escritas sobrevivia UMA — e a reposição reportava sucesso total, porque
 * cada `setState` devolvia honestamente `{ gravado: true }` sobre uma escrita
 * que de facto tinha acontecido.
 *
 * A solução é a MESMA que o `FileBackend` do `repository.ts` já usa pela mesma
 * razão, e deliberadamente igual para não haver duas ideias diferentes de como
 * se serializa uma escrita a um ficheiro: encadear as operações numa fila, de
 * modo a que o ler-mutar-escrever seja atómico dentro do processo. A fila é do
 * MÓDULO porque o ficheiro também é (há um só `FILE`).
 *
 * O que isto NÃO resolve — e não pode: dois processos a escrever no mesmo
 * ficheiro. Continua a ser um recurso de desenvolvimento; em produção quem
 * guarda é o Supabase, e é o caminho de cima que trata disso.
 */
let filaDoFicheiro: Promise<unknown> = Promise.resolve();

export function emFila<R>(trabalho: () => Promise<R>): Promise<R> {
  // `then(fn, fn)`: uma escrita que falhou não pode deixar a fila entupida para
  // as seguintes.
  const corrida = filaDoFicheiro.then(trabalho, trabalho);
  filaDoFicheiro = corrida.then(
    () => {},
    () => {},
  );
  return corrida;
}

/** Escreve o mapa inteiro. Só dentro de {@link emFila}. */
export async function escreverFicheiro(todos: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(todos, null, 2));
}

/** Ler-mutar-escrever o mapa inteiro, dentro da fila. */
export function mudarFicheiro<R>(mudar: (todos: Record<string, unknown>) => R): Promise<R> {
  return emFila(async () => {
    const todos = await readFileState();
    const r = mudar(todos);
    await escreverFicheiro(todos);
    return r;
  });
}
