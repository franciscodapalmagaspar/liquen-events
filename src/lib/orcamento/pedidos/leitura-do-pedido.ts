import type { Quote } from "@/lib/orcamento/types";

/**
 * O que a leitura de um pedido devolve.
 *
 * `Quote | null` não chegava: o `null` servia quatro avarias diferentes — rede
 * em baixo, recusa do servidor, sessão caída (que responde **200** — ver `lerPedidoInteiro`, no `AdminClient.tsx`)
 * e resposta truncada — e quem chamava só sabia dizer «Verifica a ligação e
 * tenta de novo». Numa sessão caída, essa frase manda fazer a única coisa que
 * não resolve nada.
 */
export type LeituraDoPedido = { ok: true; quote: Quote } | { ok: false; porque: string };
