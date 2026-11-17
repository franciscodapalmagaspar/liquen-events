/**
 * «1 foto» / «3 fotos» — o número e a palavra certa para ele.
 *
 * Havia sete cópias desta função, letra a letra iguais (no `FundirTemas`, no
 * `RestoreDialog`, no `ThemeCopyDialog`, no seletor de fotos, nos textos dos
 * temas, nas diferenças entre versões e no progresso da proposta), duas delas
 * exportadas por ficheiros que nada tinham a ver com contar. Sete cópias de uma
 * regra são sete sítios onde ela se afasta — fica uma, aqui. (Júri de
 * arquitetura das fases 7 e 8, `docs/ESTRUTURA-DO-CODIGO.md`.)
 *
 * Só o 1 é singular: «0 fotos», como se diz em português.
 */
export function plural(n: number, um: string, muitos: string): string {
  return `${n} ${n === 1 ? um : muitos}`;
}
