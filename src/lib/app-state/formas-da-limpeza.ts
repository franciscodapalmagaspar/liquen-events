import { z } from "zod";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FORMAS DA LIMPEZA DO `app_state`, NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas formas que atravessam fronteiras: o REGISTO da limpeza (lido da base)
 * e a LISTA do que sai (escrita na cópia da noite, lida pela reposição).
 *
 * O registo que decide se a noite APAGA ou fica a seco (a primeira noite
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
  planeadasPorMotivo: z.partialRecord(motivoDeSaida, contagem),
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

/**
 * Onde a lista do que sai vai no ficheiro da cópia: as linhas que a limpeza
 * dessa noite tira, com o valor que tinham, para se poderem repor à mão.
 */
export const CHAVE_NA_COPIA = "saiDoAppState";

/** Uma linha que sai, como vai na cópia: o valor cru, tal como estava. */
export const linhaQueSai = z.object({
  key: z.string().min(1),
  motivo: motivoDeSaida,
  /** `null` numa lápide. */
  value: z.unknown(),
});

export type LinhaQueSai = z.infer<typeof linhaQueSai>;

/**
 * Os erros da lista do que sai num ficheiro de cópia, para o validador da
 * reposição (`validateBackupFile`). Ausente é válido (cópias manuais e as de
 * antes de 18/11 não a têm).
 */
export function errosDaListaQueSai(valor: unknown): string[] {
  if (valor === undefined) return [];
  const r = z.array(linhaQueSai).safeParse(valor);
  if (r.success) return [];
  const problema = r.error.issues[0];
  const onde = problema?.path?.length ? ` (${problema.path.join(".")})` : "";
  return [`A lista do que saiu do app_state (${CHAVE_NA_COPIA}) tem a forma errada${onde}.`];
}
