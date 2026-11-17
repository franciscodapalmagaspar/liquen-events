/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LEITURA SÓ POR PEDIDO, POR MAIS QUEM A PEÇA AO MESMO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio lê, ao abrir, meia dúzia de rotas do pedido (as fotografias, as
 * versões, a proposta enviada…). Cada leitura saía duas vezes no `dev` — o
 * `StrictMode` monta, desmonta e volta a montar cada efeito — e outra vez por
 * cada estúdio montado ao mesmo tempo. Na Vercel cada pedido repetido é
 * processador pago por uma resposta que já vinha a caminho
 * (`docs/GASTAR-POUCO-DESDE-O-INICIO.md`).
 *
 * Isto junta os pedidos `GET` IGUAIS que estão EM VOO: o segundo a pedir não
 * sai para a rede, recebe a mesma resposta (uma cópia, `Response.clone()`, a
 * cada um dos que esperam). Não é uma cache:
 *
 *  · assim que a resposta chega, a entrada sai do mapa, e o pedido seguinte
 *    vai sempre ao servidor;
 *  · e só se junta a um pedido que partiu há pouco (`JUNTAR_ATE_MS`). Um pedido
 *    preso na rede há segundos já pode ser anterior a uma escrita — juntar-lhe
 *    uma leitura nova era devolver uma lista velha (revisão de 17/11).
 *
 * Mesmo assim, uma leitura que existe PARA ir buscar o que acabou de ser
 * escrito (o «Tentar», a lista depois de copiar fotos) não deve usar isto: usa
 * o `fetch` directo. Isto é para as leituras da abertura.
 *
 * Só se junta o que é igual: um `GET` sem corpo, sem sinal, e sem opções além
 * do `cache` (cabeçalhos ou credenciais diferentes podiam querer outra
 * resposta). Tudo o resto vai direito ao `fetch`.
 */

/** Quanto tempo um pedido em voo aceita quem se lhe junte. Chega para o
 *  `StrictMode` (o mesmo instante) e para dois estúdios a abrir juntos. */
export const JUNTAR_ATE_MS = 1_000;

interface EmVoo {
  pedido: Promise<Response>;
  partiu: number;
  /** Quantos ainda não receberam a sua resposta. O último leva a original. */
  porEntregar: number;
}

/**
 * Os pedidos em voo, por `fetch`: quem troca o `fetch` global (os testes, que
 * o substituem por um duplo em cada caso) começa com um mapa vazio, e nenhum
 * pedido pendurado de um caso chega ao seguinte.
 */
const emVooPorFetch = new WeakMap<typeof fetch, Map<string, EmVoo>>();

function emVooDe(f: typeof fetch): Map<string, EmVoo> {
  let m = emVooPorFetch.get(f);
  if (!m) {
    m = new Map();
    emVooPorFetch.set(f, m);
  }
  return m;
}

/** A chave, ou `null` quando o pedido não se pode juntar a outro. */
function chaveDe(url: string, init?: RequestInit): string | null {
  for (const [k, v] of Object.entries(init ?? {})) {
    if (v === undefined || k === "cache") continue;
    if (k === "method" && typeof v === "string" && v.toUpperCase() === "GET") continue;
    return null;
  }
  return `${init?.cache ?? ""} ${url}`;
}

/**
 * Como o `fetch`, mas um `GET` igual a outro que partiu há menos de
 * `JUNTAR_ATE_MS` e ainda está em voo espera pela mesma resposta em vez de
 * sair outra vez. Cada chamador recebe uma resposta com o corpo por ler.
 */
export function lerPartilhado(url: string, init?: RequestInit): Promise<Response> {
  const chave = chaveDe(url, init);
  if (chave == null) return fetch(url, init);
  const mapa = emVooDe(fetch);
  let voo = mapa.get(chave);
  if (!voo || Date.now() - voo.partiu > JUNTAR_ATE_MS) {
    const pedido = fetch(url, init);
    const novo: EmVoo = { pedido, partiu: Date.now(), porEntregar: 0 };
    mapa.set(chave, novo);
    const sair = () => {
      if (mapa.get(chave) === novo) mapa.delete(chave);
    };
    // Primeiro a sair do mapa, e só depois as entregas: quando a resposta
    // chega já ninguém se pode juntar, e `porEntregar` fica fechado.
    pedido.then(sair, sair);
    voo = novo;
  }
  const meu = voo;
  meu.porEntregar += 1;
  return meu.pedido.then((r) => {
    meu.porEntregar -= 1;
    // Um duplo de teste sem `clone` passa tal e qual: a resposta a sério tem-no.
    if (typeof r.clone !== "function") return r;
    // Cópias para os que esperam, e a original para o último: com um chamador
    // só (o caso normal em produção) não se copia nada.
    return meu.porEntregar > 0 ? r.clone() : r;
  });
}

/** Quantas leituras estão a caminho — só para os testes. */
export function leiturasEmVoo(): number {
  return emVooDe(fetch).size;
}
