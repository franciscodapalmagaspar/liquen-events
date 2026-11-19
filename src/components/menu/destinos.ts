/**
 * As páginas do menu, a ordem delas e as duas regras que o menu do telemóvel
 * e a barra do computador partilham: que página está acesa, e para que lado
 * corre a passagem entre páginas.
 */

/** A ordem do site, da esquerda para a direita (a passagem lê-a). */
const ORDEM = ["/", "/sobre", "/servicos", "/galeria", "/clientes", "/contacto"] as const;

/** As cinco do menu, com a chave do texto em `t.nav`. */
export const DESTINOS_DO_MENU = [
  { href: "/sobre", chave: "sobre" },
  { href: "/servicos", chave: "servicos" },
  { href: "/galeria", chave: "galeria" },
  { href: "/clientes", chave: "clientes" },
  { href: "/contacto", chave: "contacto" },
] as const;

/** A posição de um caminho na ordem do site (uma subpágina conta como a mãe). */
export function posicaoNaOrdem(caminho: string): number {
  if (caminho === "/") return 0;
  const i = ORDEM.findIndex((o) => o !== "/" && (caminho === o || caminho.startsWith(`${o}/`)));
  return i === -1 ? 0 : i;
}

/** Acesa na própria página e em todas as de baixo (`/servicos/casamentos`
 *  acende «Serviços»). */
export function destinoAtivo(caminho: string, href: string): boolean {
  return caminho === href || (href !== "/" && caminho.startsWith(`${href}/`));
}

/** Para a frente se o destino está à direita (ou é o mesmo), senão para trás. */
export function sentidoDaPassagem(caminho: string, href: string): "nav-forward" | "nav-back" {
  return posicaoNaOrdem(href) >= posicaoNaOrdem(caminho) ? "nav-forward" : "nav-back";
}
