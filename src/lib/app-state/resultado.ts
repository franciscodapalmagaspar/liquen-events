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
