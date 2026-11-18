/**
 * Uma memória com tecto que, cheia, esquece a entrada usada há MAIS tempo
 * (LRU) — em vez de se esvaziar toda de uma vez, que voltava a fazer o
 * trabalho inteiro (e a repetir os registos) logo a seguir.
 *
 * Usa a ordem de inserção do `Map`: ler uma entrada põe-na no fim; a
 * primeira é sempre a mais antiga. Tudo em O(1). `V` não pode ser
 * `undefined`: é assim que `ler` diz «não está».
 */
export class MemoriaComTecto<K, V extends NonNullable<unknown> | null> {
  private readonly entradas = new Map<K, V>();

  constructor(private readonly tecto: number) {
    if (!Number.isInteger(tecto) || tecto < 1) throw new RangeError("tecto tem de ser ≥ 1");
  }

  get tamanho(): number {
    return this.entradas.size;
  }

  /** O valor, se lá estiver — e passa a ser a entrada mais recente. */
  ler(chave: K): V | undefined {
    const valor = this.entradas.get(chave);
    if (valor === undefined) return undefined;
    this.entradas.delete(chave);
    this.entradas.set(chave, valor);
    return valor;
  }

  tem(chave: K): boolean {
    return this.ler(chave) !== undefined;
  }

  guardar(chave: K, valor: V): void {
    this.entradas.delete(chave);
    if (this.entradas.size >= this.tecto) {
      const maisAntiga = this.entradas.keys().next();
      if (!maisAntiga.done) this.entradas.delete(maisAntiga.value);
    }
    this.entradas.set(chave, valor);
  }
}
