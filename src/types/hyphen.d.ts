// O pacote `hyphen` não traz tipos; só se usa a forma síncrona, no servidor.
declare module "hyphen/pt" {
  export function hyphenateSync(texto: string, opcoes?: { minWordLength?: number }): string;
}
declare module "hyphen/en" {
  export function hyphenateSync(texto: string, opcoes?: { minWordLength?: number }): string;
}
