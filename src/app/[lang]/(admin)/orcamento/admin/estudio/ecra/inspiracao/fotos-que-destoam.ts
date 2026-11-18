/**
 * A frase que diz quais fotografias destoam da paleta da página, ou `null`
 * quando nenhuma destoa. Recebe os índices (a contar do zero) que o
 * `fotosQueDestoam` devolveu; nomeia no máximo três, por ordem.
 */
export function fraseDasFotosQueDestoam(fora: readonly number[]): string | null {
  if (fora.length === 0) return null;
  const quais = fora
    .slice(0, 3)
    .sort((x, y) => x - y)
    .map((i) => `${i + 1}.ª`);
  return fora.length === 1
    ? `A ${quais[0]} fotografia destoa da paleta desta página.`
    : `A ${quais.slice(0, -1).join(", a ")} e a ${quais[quais.length - 1]} fotografias destoam da paleta desta página.`;
}
