/**
 * The photographs the confirmation page shows.
 *
 * `hero` is deliberately the SAME image that fills the left panel of the quote
 * form — the client crosses from one to the other in a single click, and
 * repeating the frame makes the confirmation feel like the next page of the
 * same document rather than a system response.
 *
 * Lives in its own module, NOT in ConfirmacaoClient: a `"use client"` file's
 * exports reach a server component as client-reference proxies, so reading this
 * object in page.tsx to resolve blur placeholders silently yielded nothing.
 */
export const CONFIRMACAO_PHOTOS = {
  hero: "/imagens/DaniGui_JantarFesta_1.jpg",
  galeria: "/imagens/galeria-outubro-36.jpg",
  instagram: "/imagens/DaniGui_JantarFesta_26.jpg",
  clientes: "/imagens/EW1_1332.jpg",
} as const;

export type ConfirmacaoPhotoKey = keyof typeof CONFIRMACAO_PHOTOS;
