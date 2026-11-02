/**
 * Ir para outra página do back office com uma navegação inteira.
 *
 * Está num módulo só dele para os testes o poderem substituir: o
 * `window.location` do jsdom não deixa trocar o `assign`, e o `useRouter` do
 * Next exige o router da app montado — que os testes do `AdminClient` não têm.
 */
export function navegarPara(endereco: string): void {
  window.location.assign(endereco);
}
