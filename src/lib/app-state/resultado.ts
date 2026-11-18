import "server-only";
import { eRelogioAdiantado, isMissingTable } from "@/lib/repository";
import { comTecto, PAUSA_MS, TEMPO_POR_TENTATIVA_MS, TENTATIVAS } from "./tecto";

/** O que uma escrita (ou um apagar) do `app_state` diz sobre si. */

/**
 * Porque é que a escrita não ficou. Não é decoração: cada um destes tem uma
 * resolução DIFERENTE do lado de quem gere a instalação, e é essa a diferença
 * entre um «Erro interno» que não indica caminho nenhum e uma frase que diz o
 * que fazer a seguir.
 *
 *  - `tabela-em-falta`  → falta correr o `db/schema.sql` no Supabase;
 *  - `sem-permissao`    → a tabela existe mas a chave usada não a pode escrever
 *                         (chave `anon` em vez da `service_role`, ou uma
 *                         política de RLS a recusar a linha);
 *  - `escrita-recusada` → tudo o resto: rede, tempo esgotado, avaria.
 */
export type MotivoDeFalha = "tabela-em-falta" | "sem-permissao" | "escrita-recusada";

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

/**
 * Onde a escrita ficou mesmo.
 *
 *  - `servidor`         → a tabela `app_state`. Dura.
 *  - `ficheiro`         → o `data/app-state.json` de uma máquina de trabalho.
 *                         Dura o que a máquina durar, que é o que se pede.
 *  - `ficheiro-efemero` → o mesmo ficheiro, no disco de uma função serverless.
 *                         Melhor do que nada — quem gravou ainda o relê nesta
 *                         invocação — e insuficiente: um deploy apaga-o.
 *  - `nenhures`         → não ficou.
 */
export type OndeFicou = "servidor" | "ficheiro" | "ficheiro-efemero" | "nenhures";

/**
 * O que aconteceu a uma escrita.
 *
 * São DUAS perguntas, e confundi-las foi o defeito:
 *
 *  - `gravado`   → «a escrita aconteceu nalgum lado?». É o que a maior parte de
 *                  quem chama precisa: distingue uma edição que foi escrita de
 *                  uma que se perdeu na hora.
 *  - `duradouro` → «esse lado sobrevive a um deploy?». É a pergunta que faltava.
 *                  Uma escrita no disco efémero da função responde `true` à
 *                  primeira e `false` a esta, e quem diz «Guardado» à pessoa
 *                  que está a trabalhar tem de olhar para as duas.
 */
export interface ResultadoDeEscrita {
  gravado: boolean;
  duradouro: boolean;
  onde: OndeFicou;
  motivo?: MotivoDeFalha;
}

/** Uma escrita recusada por falta de autorização — do Postgres (42501,
 *  `insufficient_privilege`) ou da política de RLS, que o PostgREST devolve com
 *  o mesmo código e a mensagem da política. */
function ehSemPermissao(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  if ((err as { code?: unknown }).code === "42501") return true;
  const msg = (err as { message?: unknown }).message;
  return (
    typeof msg === "string" &&
    /permission denied|row-level security|insufficient[_ ]privilege|not authorized|jwt/i.test(msg)
  );
}

export function motivoDaFalha(err: unknown): MotivoDeFalha {
  // O relógio adiantado (PGRST303, «JWT issued at future») é PASSAGEIRO e
  // repete-se — mas a mensagem diz «JWT», e a regra de baixo tomava-o por uma
  // permissão recusada, que nunca se repete. Resultado: nenhuma escrita nem
  // leitura do app_state repetia o erro mais comum (auditoria de 13/11). A
  // mesma deteção do `repository.ts` (`eRelogioAdiantado`).
  if (eRelogioAdiantado(err)) return "escrita-recusada";
  if (isMissingTable(err)) return "tabela-em-falta";
  if (ehSemPermissao(err)) return "sem-permissao";
  return "escrita-recusada";
}

/**
 * Um pedido ao Supabase, com as tentativas da casa: repete enquanto a falha
 * for passageira ({@link motivoDaFalha} = `escrita-recusada`), com pausa
 * crescente e tecto por tentativa. UM só ciclo para ler, gravar e apagar.
 */
export async function comTentativas<R extends { error: unknown }>(
  pedido: () => PromiseLike<R>,
): Promise<{ ok: true; resposta: R } | { ok: false; erro: unknown }> {
  let ultimoErro: unknown = null;
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resposta = await comTecto(pedido(), TEMPO_POR_TENTATIVA_MS);
      if (!resposta.error) return { ok: true, resposta };
      ultimoErro = resposta.error;
    } catch (err) {
      ultimoErro = err;
    }
    // Instalação incompleta: repetir dá a mesma resposta e só atrasa o aviso.
    if (motivoDaFalha(ultimoErro) !== "escrita-recusada") break;
    if (tentativa < TENTATIVAS) await new Promise((r) => setTimeout(r, PAUSA_MS * tentativa));
  }
  return { ok: false, erro: ultimoErro };
}
