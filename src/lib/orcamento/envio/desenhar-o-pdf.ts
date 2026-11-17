import "server-only";
import { renderStoredEditorialPdfWithReport } from "@/lib/proposal-doc-render";
import {
  chaveDaVersao,
  faltasPassageiras,
  pdfFinalDaVersao,
  type RelatorioDoPdf,
} from "@/lib/proposal-preview-cache";
import { log } from "@/lib/logger";
import { FOLGA_DA_SEGUNDA_PASSAGEM_MS, FOLGA_DO_EMAIL_MS } from "./orcamento-de-tempo";
import type { OEnvio } from "./o-envio";

/**
 * Etapa 5 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): o desenho do PDF,
 * e a segunda passagem quando uma foto não resolveu e ainda há tempo
 * (`orcamento-de-tempo.ts`).
 */
export interface ParaDesenhar extends Pick<OEnvio, "pedidoId" | "doc" | "idioma"> {
  modo: "preview" | "send";
  rascunho: boolean;
  chaveDoQueChegou: string;
  /** Quantos ms sobram do orçamento do pedido, agora. */
  resta: () => number;
}

export interface PdfDesenhado {
  relatorio: RelatorioDoPdf;
  /** Saiu da memória? O estúdio aprende a estimativa da espera com o tempo de
   *  cada geração, e um PDF que veio pronto ensinava-lhe que desenhar leva um
   *  segundo. */
  pdfDaMemoria: boolean;
}

export async function desenharOPdf(p: ParaDesenhar): Promise<PdfDesenhado> {
  /**
   * O PDF FINAL de uma versão desenha-se uma vez: o «Descarregar o PDF
   * final», o que o estúdio prepara em segundo plano e o envio a seguir são
   * o mesmo documento, e o segundo e o terceiro saem da memória. O rascunho
   * desenha-se sempre. Ver `proposal-preview-cache.ts`.
   */
  let relatorio: RelatorioDoPdf;
  let pdfDaMemoria = false;
  if (p.rascunho) {
    // O rascunho aceita a listagem das pastas guardada há pouco (revisão de
    // 14/11, 2.ª, n.º 1). O PDF final — que o envio reaproveita — pergunta
    // de fresco.
    relatorio = await renderStoredEditorialPdfWithReport(p.doc, p.idioma, {
      rascunho: p.rascunho,
      memoria: true,
    });
  } else {
    const versao = await pdfFinalDaVersao(chaveDaVersao(p.chaveDoQueChegou, p.doc.validUntil), () =>
      renderStoredEditorialPdfWithReport(p.doc, p.idioma, { rascunho: p.rascunho }),
    );
    relatorio = versao.relatorio;
    pdfDaMemoria = versao.daMemoria;
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * SEGUNDA TENTATIVA ANTES DE UMA PROPOSTA SEGUIR COM BURACOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * O envio desenhava o documento UMA vez. Se uma fotografia não resolvesse,
   * o email saía à mesma com uma moldura vazia e o estúdio dizia, depois,
   * «no PDF que seguiu, falta uma foto; verifique e reenvie» — com o casal já
   * com a proposta incompleta na caixa de correio.
   *
   * A causa mais comum de uma foto não resolver é PASSAGEIRA: um pedido ao
   * armazenamento que expirou, uma ligação que caiu a meio de oitenta.
   * Desenhar outra vez apanha esse caso, e não custa nada quando não é esse —
   * o caminho normal é zero em falta e não repete.
   *
   * ── O QUE ISTO NÃO FAZ, E PORQUÊ ─────────────────────────────────────
   *
   * NÃO recusa o envio. A porta do CLIENTE recusa (ver `proposal-pdf-cache`,
   * `PropostaIncompleta`), e aqui está escrito o contrário de propósito, com
   * a razão dela: «recusar seria pior — ela fica sem nada e sem perceber
   * porquê». É uma decisão de produto e não é minha para virar; a repetição
   * melhora-a sem lhe tocar. Se um dia quiser que o envio também trave, é
   * mudar estas linhas e o teste que as guarda.
   *
   * Fica-se com o MELHOR dos dois desenhos: se a segunda tentativa correr
   * pior do que a primeira (o armazenamento a piorar a meio), manda-se a
   * primeira. Repetir nunca pode deixar a proposta pior do que estava.
   *
   * A pré-visualização não repete: é onde ela DESCOBRE o que falta, e é para
   * ser rápida.
   */
  // As que se SABE que faltam (foram para a Reciclagem) não voltam numa
  // segunda passagem: só as outras justificam desenhar outra vez (revisão
  // de 14/11, 2.ª, n.º 2). As escolhidas dessas já travaram o envio antes.
  if (
    p.modo === "send" &&
    faltasPassageiras(relatorio) > 0 &&
    p.resta() > FOLGA_DO_EMAIL_MS + FOLGA_DA_SEGUNDA_PASSAGEM_MS
  ) {
    log.warn("proposta-doc: fotos em falta no envio, a desenhar segunda vez", {
      id: p.pedidoId,
      emFalta: relatorio.missingImages,
    });
    // A segunda tentativa é o MESMO documento na MESMA língua: repetir é para
    // apanhar uma foto que não resolveu, não para mudar o que sai.
    const segunda = await renderStoredEditorialPdfWithReport(p.doc, p.idioma);
    if (segunda.missingImages < relatorio.missingImages) relatorio = segunda;
  }

  return { relatorio, pdfDaMemoria };
}
