import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PEDIDO QUE O SERVIDOR DEVOLVEU — LIDO NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Depois de cada escrita (`PATCH /api/orcamento/<id>`) e de cada leitura do
 * pedido inteiro, o corpo da resposta passa a ser o pedido no ecrã. O
 * `res.json()` devolve `any`, e cada sítio fazia o seu `as Quote` — uns
 * verificavam o `id`, outros não. Um 200 com um corpo que não é um pedido
 * (`{}`, `null`, uma página de erro de um intermediário) entrava na lista tal e
 * qual, e escrevia `undefined` por cima do pedido que ela tinha aberto.
 *
 * A regra é uma: só é um pedido o que é um objecto com um `id` de texto, não
 * vazio. É a mesma verificação que os sítios mais cuidadosos já faziam
 * (`corpo?.id`), agora escrita uma vez e com teste. O resto da forma é a do
 * servidor, que a valida ao gravar — não se repete aqui o esquema inteiro.
 */
export function pedidoDaResposta(corpo: unknown): Quote | null {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return null;
  const { id }: { id?: unknown } = corpo;
  // O único `as` desta fronteira, e é aqui que se responde por ele: a forma do
  // resto vem do mesmo servidor que a escreveu.
  return typeof id === "string" && id !== "" ? (corpo as Quote) : null;
}
