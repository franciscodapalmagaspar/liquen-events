/**
 * «1 foto», «0 fotos», «3 fotos» — o número e a palavra certa a seguir.
 *
 * Estava escrita seis vezes, igual, em seis ficheiros. Em português de
 * Portugal só o 1 é singular: o zero leva plural («0 fotos»). Para unidades
 * com abreviatura («kg», «un.») ver `unidade-na-contagem.ts`, que é outra
 * regra.
 */
export function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}
