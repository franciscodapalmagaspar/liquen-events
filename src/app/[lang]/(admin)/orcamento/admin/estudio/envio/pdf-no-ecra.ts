/** O PDF que o servidor devolveu, com o que veio nos cabeçalhos. */
export interface PdfPronto {
  blob: Blob;
  /** `X-Chave-Do-Pdf` — só no PDF final. */
  chave: string | null;
  emFalta: number;
  /** `X-Conteudo-Cortado`, por ler. */
  cortes: string | null;
}

/**
 * Descarregar o PDF (anexo) em vez de abrir numa aba nova: a CSP do site
 * (object-src 'none', sem frame-src) bloqueia mostrar um blob:PDF numa aba ou
 * iframe, o que fazia «não acontecer nada». Um download nunca é bloqueado e
 * abre no leitor de PDF do dispositivo.
 */
export function guardarNoDisco(blob: Blob, nome: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * O PDF abre dentro do estúdio (`VerOPdfNoEcra`) em vez de se descarregar?
 * Num telemóvel, sim: a barra está compacta, ou o ponteiro é o dedo.
 */
export function verPdfNoEcra(barraCompacta: boolean): boolean {
  if (barraCompacta) return true;
  try {
    return window.matchMedia?.("(pointer: coarse)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * O documento e a língua de um PDF, numa só cadeia — para saber se o que se
 * vai enviar ainda é o que foi visto.
 *
 * CANÓNICA (chaves por ordem, sem `undefined`), como a `chaveDoPdf` do
 * servidor: a gravação do rascunho devolve o mesmo documento com as chaves
 * noutra ordem, e uma comparação crua dava «mudou» sem nada ter mudado —
 * medido no browser, a confirmação nunca chegava a aparecer.
 */
export function retratoDoPdf(doc: unknown, idioma: string): string {
  const canonico = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(canonico);
    if (v && typeof v === "object") {
      const saida: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        const x = (v as Record<string, unknown>)[k];
        if (x !== undefined) saida[k] = canonico(x);
      }
      return saida;
    }
    return v;
  };
  return `${idioma}|${JSON.stringify(canonico(doc))}`;
}
