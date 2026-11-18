import "server-only";
import type { DocTruncation } from "@/lib/pdf-editorial/cortes";
import { criarCachePorBytes } from "@/lib/cache-por-bytes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF FINAL DA MESMA VERSÃO NÃO SE DESENHA DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10): «quero melhorar a animação e a rapidez a descarregar
 * qualquer coisa no back office… melhores mesmo muito».
 *
 * O caminho de hoje, medido no código: no passo «Rever e enviar» ela carrega em
 * «Descarregar o PDF final» (desenho inteiro, 10 a 60 s), vê-o, confirma, e
 * carrega em «Gerar e enviar» — e o envio desenha OUTRA VEZ o mesmo documento,
 * mais 10 a 60 s. Descarregar duas vezes a mesma versão também desenhava duas.
 *
 * Aqui fica o resultado do desenho FINAL de cada versão: o ficheiro e o
 * relatório (as fotos em falta e o que ficou cortado, que a rota manda nos
 * cabeçalhos e o envio usa para perguntar). A segunda vez é imediata.
 *
 * ── A CHAVE ──────────────────────────────────────────────────────────────
 *
 * A `chaveDoPdf` do documento tal como chegou (a mesma que a verificação antes
 * de enviar usa) MAIS a data de validade que a rota escreve no documento. É a
 * única coisa do desenho que depende do dia: sem ela, um PDF desenhado às
 * 23h59 servia-se depois da meia-noite com a validade de ontem.
 *
 * ── O QUE NÃO ENTRA ──────────────────────────────────────────────────────
 *
 *  · O RASCUNHO — é o PDF que ainda não pode seguir, e muda a cada correcção.
 *  · Um desenho com fotografias EM FALTA — a falta é passageira (um pedido ao
 *    armazenamento que caiu), e guardá-la fixava-a: a próxima descarga e o
 *    envio herdavam os buracos em vez de tentar outra vez.
 *
 * ── DOIS PEDIDOS AO MESMO TEMPO ──────────────────────────────────────────
 *
 * O estúdio prepara o PDF em segundo plano assim que ela chega ao último passo
 * (ver `ProposalStudio`), e ela pode carregar no botão antes de ele acabar.
 * Guarda-se a PROMESSA enquanto o desenho corre: o segundo pedido espera pelo
 * primeiro em vez de desenhar outra vez ao lado.
 *
 * Vive por processo. Um envio que caia noutra instância desenha como antes —
 * isto torna o caminho normal rápido, não muda o que sai.
 */

export interface RelatorioDoPdf {
  pdf: Buffer<ArrayBuffer>;
  missingImages: number;
  /** Das `missingImages`, as que se sabe que já não existem — ver `renderStoredEditorialPdfWithReport`. */
  faltasSabidas?: number;
  /** Das sabidas, as escolhidas por ela que o PDF desenharia. */
  faltasSabidasQueTravam?: number;
  /** Das `missingImages`, as que passaram do tecto de fotografias por documento. */
  faltasPeloTecto?: number;
  /** Das que passaram do tecto, as escolhidas por ela (ou a capa): nunca se guarda. */
  faltasPeloTectoQueTravam?: number;
  truncations: DocTruncation[];
}

/**
 * As faltas que uma segunda passagem PODE trazer: tudo o que falta menos o que
 * se sabe que falta (foi para a Reciclagem) e o que passou do tecto de fotos
 * por documento. Essas duas são certas — desenhar outra vez dava o mesmo
 * (revisão de 14/11, 2.ª, n.º 2, e menor n.º 1).
 */
export function faltasPassageiras(
  r: Pick<RelatorioDoPdf, "missingImages" | "faltasSabidas" | "faltasPeloTecto">,
): number {
  return Math.max(0, r.missingImages - (r.faltasSabidas ?? 0) - (r.faltasPeloTecto ?? 0));
}

/** ~32 MB: cabem umas dezenas de propostas típicas (0,5–3 MB) sem apertar a
 *  memória da função, que é partilhada com o `sharp` e com as outras caches. */
const TECTO_BYTES = 32 * 1024 * 1024;
const MAXIMO_POR_ENTRADA = 12 * 1024 * 1024;

const prontos = criarCachePorBytes<RelatorioDoPdf>({
  tecto: TECTO_BYTES,
  maximoPorEntrada: MAXIMO_POR_ENTRADA,
  tamanho: (r) => r.pdf.length,
});
const aDesenhar = new Map<string, Promise<RelatorioDoPdf>>();

export function chaveDaVersao(chaveDoPdf: string, validUntil: string | undefined): string {
  return `${chaveDoPdf}|${validUntil ?? ""}`;
}

/**
 * O desenho final desta versão — da memória, à espera do que já está a correr,
 * ou desenhado agora com `desenhar`.
 */
export async function pdfFinalDaVersao(
  chave: string,
  desenhar: () => Promise<RelatorioDoPdf>,
): Promise<{ relatorio: RelatorioDoPdf; daMemoria: boolean }> {
  const pronto = prontos.ler(chave);
  if (pronto) return { relatorio: pronto, daMemoria: true };
  const emCurso = aDesenhar.get(chave);
  if (emCurso) return { relatorio: await emCurso, daMemoria: true };

  const promessa = desenhar();
  aDesenhar.set(chave, promessa);
  try {
    const relatorio = await promessa;
    // As que passaram do tecto não impedem de guardar: o desenho não muda por
    // as repetir (revisão de 14/11, menor n.º 1). Menos uma escolhida à mão
    // (ou a capa) cortada pelo tecto: o documento não está completo, e não se
    // guarda (2.ª revisão de 14/11, importante n.º 1).
    if (
      relatorio.missingImages - (relatorio.faltasPeloTecto ?? 0) === 0 &&
      (relatorio.faltasPeloTectoQueTravam ?? 0) === 0
    ) {
      prontos.guardar(chave, relatorio);
    }
    return { relatorio, daMemoria: false };
  } finally {
    aDesenhar.delete(chave);
  }
}

/** Só para os testes. */
export function esvaziarPdfsFinais(): void {
  prontos.esvaziar();
  aDesenhar.clear();
}

/** Só para os testes. */
export function estadoDosPdfsFinais(): { entradas: number; bytes: number } {
  return prontos.estado();
}
