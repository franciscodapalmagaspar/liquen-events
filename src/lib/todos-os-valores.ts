/**
 * Uma lista com TODOS os valores de uma união de texto do domínio — presa ao
 * tipo pelo compilador, para um `z.enum` nunca ficar atrás dele.
 *
 *   const ESTADOS = todosOsValores<ProposalStatus>()(["rascunho", "enviada", …]);
 *   z.enum(ESTADOS)
 *
 * Um valor a mais não compila (não é do tipo); um valor a menos também não
 * (a lista tem de cobrir o tipo inteiro). Sem isto, acrescentar «arquivada»
 * ao `ProposalStatus` deixava o esquema a acusar — e, quando passar a
 * recusar, a recusar — todas as propostas arquivadas, sem aviso nenhum.
 */
export function todosOsValores<T extends string>() {
  return <const L extends readonly [T, ...T[]]>(
    lista: L & ([T] extends [L[number]] ? unknown : { falta: Exclude<T, L[number]> }),
  ): L => lista;
}

/**
 * `true` quando `v` é um dos valores da lista — e o tipo estreita-se para ele.
 * A pergunta que as rotas fazem a uma lista fechada, sem cópia nem `as`.
 */
export function ehUmDe<const L extends readonly string[]>(lista: L, v: unknown): v is L[number] {
  return (lista as readonly unknown[]).includes(v);
}
