/** «em 12 de setembro de 2026». Uma data sem dia lê-se mal ao lado de dois
 *  números; uma data ilegível não se escreve de todo. */
export function dataDoEnvioPorExtenso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "num envio anterior";
  return `em ${d.toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })}`;
}
