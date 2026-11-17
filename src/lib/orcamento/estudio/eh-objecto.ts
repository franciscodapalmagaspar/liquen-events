/** Um objecto simples (não `null`, não uma lista) — para ler JSON que pode vir de qualquer forma. */
export function ehObjecto(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
