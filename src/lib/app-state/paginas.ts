/**
 * ════════════════════════════════════════════════════════════════════════════
 * LER ÀS PÁGINAS, ATÉ À PÁGINA VAZIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PostgREST corta cada resposta no `max-rows` (1000 por omissão) e não
 * avisa. Parar numa página «curta» só está certo se o `max-rows` for o tamanho
 * da página que se pediu: com 500, uma página de 500 parecia o fim e a leitura
 * dizia-se completa com metade (revisão de 13/11, n.º 1). Por isso a regra é a
 * do `lerTodasAsLinhas`: avança pelo que VEIO e só pára numa página VAZIA.
 * Custa um pedido vazio no fim.
 *
 * Um sítio só para essa regra — a varredura da limpeza (`varrer.ts`) e o
 * `listStateByPrefix` liam cada um à sua maneira, e o segundo parava na
 * página curta.
 *
 * Nunca pede mais do que `limite + 1` linhas no total: a última diz só «há
 * mais», e é a diferença entre `completa` e `transbordou`.
 *
 * Sem I/O: quem chama dá a função que pede uma página (com as suas tentativas
 * e o seu prazo).
 */

export const TAMANHO_DA_PAGINA = 1000;

export type Paginas<T> =
  | { estado: "completa"; linhas: T[] }
  /** Leu-se bem até ao `limite` e havia mais; `linhas` são as primeiras `limite`. */
  | { estado: "transbordou"; linhas: T[] }
  | { estado: "falhou"; erro: unknown };

export type PedirPagina = (
  desde: number,
  ate: number,
) => PromiseLike<{ data: unknown; error: unknown }>;

/**
 * @param ler   cada linha crua → a linha, ou `null` se vier noutra forma (e
 *              então a leitura inteira conta como falhada).
 * @param limite o mais de linhas que se aceita; acima disto, `transbordou`.
 */
export async function lerAsPaginas<T>(
  pedirPagina: PedirPagina,
  ler: (crua: unknown) => T | null,
  limite: number,
): Promise<Paginas<T>> {
  const linhas: T[] = [];
  try {
    for (let desde = 0; ; ) {
      const quantas = Math.min(TAMANHO_DA_PAGINA, limite + 1 - linhas.length);
      const { data, error } = await pedirPagina(desde, desde + quantas - 1);
      if (error) return { estado: "falhou", erro: error };
      if (!Array.isArray(data)) return { estado: "falhou", erro: new Error("resposta sem lista") };
      if (data.length === 0) return { estado: "completa", linhas };
      for (const crua of data) {
        const linha = ler(crua);
        if (linha === null) return { estado: "falhou", erro: new Error("linha fora da forma") };
        linhas.push(linha);
      }
      // Também apanha um servidor que ignore o `range` e repita a página.
      if (linhas.length > limite) return { estado: "transbordou", linhas: linhas.slice(0, limite) };
      desde += data.length;
    }
  } catch (erro) {
    return { estado: "falhou", erro };
  }
}
