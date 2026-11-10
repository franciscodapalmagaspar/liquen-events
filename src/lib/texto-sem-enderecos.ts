/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O VISITANTE ESCREVEU, DEVOLVIDO SEM ENDEREÇOS (10/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O email de confirmação do pedido vai para o endereço que o VISITANTE
 * escreveu, com o nome, o local e o nome do evento que ele escreveu, a partir
 * do correio da casa. Quem quisesse usar isso para enganar alguém escrevia no
 * nome «Ana — confirme o pagamento em exemplo.tld» e o email saía da Líquen
 * com essa frase e a ligação a funcionar.
 *
 * Um nome, um local ou um evento verdadeiros não levam endereços. Tudo o que
 * pareça um (com `http`, com `www.`, ou palavra.palavra) é trocado por «…».
 * A equipa recebe o pedido tal como foi escrito — isto é só o que volta ao
 * visitante.
 */
const ENDERECO = /\b(?:https?:\/\/|www\.)\S*|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+(?:\/\S*)?/giu;

export function semEnderecos(texto: string): string;
export function semEnderecos(texto: string | undefined): string | undefined;
export function semEnderecos(texto: string | undefined): string | undefined {
  if (texto === undefined) return undefined;
  return texto.replace(ENDERECO, "…");
}
