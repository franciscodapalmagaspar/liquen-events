import { z } from "zod";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O REGISTO DA LIMPEZA DO `app_state` — A FORMA, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É este registo que decide se a noite APAGA ou fica a seco (a primeira noite
 * só conta). Lê-se da base, por isso valida-se na fronteira: um valor que não
 * tenha esta forma conta como «não há registo», e a noite fica A SECO — nunca
 * o contrário. É o mesmo esquema do espaço no registo (`espacos.ts`), para a
 * vigia e a limpeza não terem duas ideias da forma.
 *
 * Sem I/O e sem `server-only`: o registo dos espaços e as regras da limpeza
 * leem-no os dois.
 */

/** Porque é que uma linha sai, pela ordem do tipo (a de saída está em `limpeza.ts`). */
export const motivoDeSaida = z.enum([
  "lapide",
  "rascunho-sem-pedido",
  "envio-sem-pedido",
  "proposta-web-sem-proposta",
  "retrato-expirado",
  "ligacao-sem-proposta",
]);

const contagem = z.number().int().nonnegative();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ultimaNoite = z.object({
  dia,
  aSeco: z.boolean(),
  porMotivo: z.partialRecord(motivoDeSaida, contagem),
  apagadas: contagem,
  mudaram: contagem,
  falharam: contagem,
  ficam: contagem,
});

export const registoDaLimpeza = z.object({
  /** O dia da primeira noite (a seco). */
  primeiraNoite: dia,
  ultima: ultimaNoite,
});

export type RegistoDaLimpeza = z.infer<typeof registoDaLimpeza>;
