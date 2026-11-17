/**
 * ── O «JÁ VI O PDF FINAL» DESTA ABA ───────────────────────────────────────
 *
 * Fica guardado nesta aba (`sessionStorage`), por pedido. Num telemóvel, o PDF
 * aberto por cima do back office e o «voltar» recarregavam o estúdio, e o «já
 * vi» perdia-se — o botão voltava a «Ver o PDF», sem fim (23/10). A regra
 * continua a mesma: só vale para o documento EXACTO que foi visto (`retrato`),
 * e o servidor confere a `chave`.
 *
 * `emFalta` viaja com ele (revisão de 17/11): as fotografias que esse PDF
 * deixou de fora. Sem isso, recarregar a página apagava a linha da Conferência
 * que as diz, com o mesmo PDF à frente.
 */
export interface PdfVisto {
  chave: string;
  retrato: string;
  confirmado: boolean;
  /** As fotografias que esse PDF deixou de fora (`X-Fotos-Em-Falta`). */
  emFalta?: number;
}

const CHAVE_DO_PDF_VISTO = (quoteId: string) => `liquen-pdf-visto:${quoteId}`;

/** Um número de fotos em falta só conta se for um inteiro positivo. */
function emFaltaValido(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;
}

/** O «já vi o PDF final» desta aba, se houver. */
export function lerPdfVisto(quoteId: string): PdfVisto | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE_DO_PDF_VISTO(quoteId)) ?? "null");
    if (!v || typeof v.chave !== "string" || typeof v.retrato !== "string") return null;
    const emFalta = emFaltaValido(v.emFalta);
    return {
      chave: v.chave,
      retrato: v.retrato,
      confirmado: v.confirmado === true,
      ...(emFalta ? { emFalta } : {}),
    };
  } catch {
    return null;
  }
}

export function guardarPdfVisto(quoteId: string, v: PdfVisto | null): void {
  try {
    if (!v) {
      sessionStorage.removeItem(CHAVE_DO_PDF_VISTO(quoteId));
      return;
    }
    const emFalta = emFaltaValido(v.emFalta);
    sessionStorage.setItem(
      CHAVE_DO_PDF_VISTO(quoteId),
      JSON.stringify({
        chave: v.chave,
        retrato: v.retrato,
        confirmado: v.confirmado,
        ...(emFalta ? { emFalta } : {}),
      }),
    );
  } catch {
    /* sem armazenamento (modo privado cheio): vale só nesta página, como antes */
  }
}
