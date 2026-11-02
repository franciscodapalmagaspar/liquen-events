/**
 * A galeria (e as suas colecções, `/galeria/...`) não tem botões a flutuar por
 * cima das fotografias — nem o «Pedir proposta» (`StickyCTA`) nem o WhatsApp
 * (`WhatsAppButton`). Pedido dela a 2/11: «quando se está a ver a galeria não
 * é muito bom estar a aparecer isso».
 *
 * `pathname` é o de `usePublicPathname`, que já vem sem o `/en`, por isso vale
 * nas duas línguas.
 */
export function esconderNaGaleria(pathname: string): boolean {
  return pathname === "/galeria" || pathname.startsWith("/galeria/");
}
