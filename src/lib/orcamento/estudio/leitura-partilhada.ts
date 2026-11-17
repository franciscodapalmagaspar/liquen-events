/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LEITURA SÓ POR PEDIDO, POR MAIS QUEM A PEÇA AO MESMO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio lê, ao abrir, meia dúzia de rotas do pedido (o rascunho, as
 * fotografias, as versões, a proposta enviada…). Cada leitura saía duas vezes
 * no `dev` — o `StrictMode` monta, desmonta e volta a montar cada efeito — e
 * outra vez por cada estúdio montado ao mesmo tempo. Na Vercel cada pedido
 * repetido é processador pago por uma resposta que já vinha a caminho
 * (`docs/GASTAR-POUCO-DESDE-O-INICIO.md`).
 *
 * Isto junta os pedidos `GET` IGUAIS que estão EM VOO: o segundo a pedir não
 * sai para a rede, recebe uma cópia (`Response.clone()`) da resposta do
 * primeiro. Assim que a resposta chega, a entrada sai do mapa — não há cache
 * nenhuma, e por isso nada do que ela vê pode vir velho: um pedido feito depois
 * de outro acabar vai sempre ao servidor, como antes.
 *
 * Só para leituras: escritas (`PUT`, `POST`, `DELETE`) nunca se juntam, e uma
 * leitura com corpo também não.
 */

/**
 * Os pedidos em voo, por `fetch`: quem troca o `fetch` global (os testes, que
 * o substituem por um duplo em cada caso) começa com um mapa vazio, e nenhum
 * pedido pendurado de um caso chega ao seguinte.
 */
const emVooPorFetch = new WeakMap<typeof fetch, Map<string, Promise<Response>>>();

function emVooDe(f: typeof fetch): Map<string, Promise<Response>> {
  let m = emVooPorFetch.get(f);
  if (!m) {
    m = new Map();
    emVooPorFetch.set(f, m);
  }
  return m;
}

/** A chave: o endereço e as opções que mudam a resposta. */
function chaveDe(url: string, init?: RequestInit): string | null {
  const metodo = (init?.method ?? "GET").toUpperCase();
  if (metodo !== "GET" || init?.body != null || init?.signal) return null;
  return `${init?.cache ?? ""} ${url}`;
}

/**
 * Como o `fetch`, mas um `GET` igual a outro que ainda está em voo espera pela
 * mesma resposta em vez de sair outra vez. Cada chamador recebe a sua cópia,
 * com o corpo por ler.
 */
export function lerPartilhado(url: string, init?: RequestInit): Promise<Response> {
  const chave = chaveDe(url, init);
  if (chave == null) return fetch(url, init);
  const emVoo = emVooDe(fetch);
  let pedido = emVoo.get(chave);
  if (!pedido) {
    pedido = fetch(url, init);
    emVoo.set(chave, pedido);
    const sair = () => {
      if (emVoo.get(chave) === pedido) emVoo.delete(chave);
    };
    pedido.then(sair, sair);
  }
  // Um duplo de teste sem `clone` passa tal e qual: a resposta a sério tem-no.
  return pedido.then((r) => (typeof r.clone === "function" ? r.clone() : r));
}

/** Quantas leituras estão a caminho — só para os testes. */
export function leiturasEmVoo(): number {
  return emVooDe(fetch).size;
}
