import type { ProposalDoc } from "./proposal-doc";
import { chavesDasPaginas, lugaresDaPagina, planoDaProposta } from "./pdf-editorial/plano";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE ELA ESCOLHEU E QUE O PDF DESENHA — UMA LISTA SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 14/11: uma foto escolhida que já não existe TRAVA o envio. Mas «escolhida»
 * tem de querer dizer «escolhida para uma página que o PDF desenha»: o
 * `fotosDasPaginas` guarda as escolhas pela chave da página (`tema:0:3`), e uma
 * chave fica lá depois de a página deixar de existir (o tema ficou com duas
 * páginas, o separador saiu). Uma foto dessas na Reciclagem travava o envio sem
 * forma de resolver — a página não está no estúdio para ela trocar a foto — e a
 * frase mostrava a chave crua (revisão de 14/11, n.º 1).
 *
 * Por isso a pergunta faz-se AQUI, e todos os sítios lêem esta resposta: a
 * Conferência e a rota do envio (`oQueFaltaParaEnviar`), a verificação do
 * armazenamento (`proposta-fotos-verificacao.ts`). Contam:
 *
 *   · a fotografia de capa — a primeira de `coverImages` com alguma coisa, que
 *     é a que o desenho usa (`montar.ts`). Só TRAVA se o PDF a fosse usar de
 *     facto (`aCapaDelaVaiNoPdf`, a regra do desenho): isso precisa da medida,
 *     que aqui não há — quem trava é a verificação do armazenamento, que a lê
 *     da biblioteca (`proposta-fotos-verificacao.ts`, revisão de 14/11, n.º 3);
 *   · as de `fotosDasPaginas` das páginas que o plano AINDA tem
 *     (`chavesDasPaginas(planoDaProposta(doc))`), só nas páginas onde ela pode
 *     escolher (`lugaresDaPagina`) e só até ao número de lugares da página —
 *     a capa não lê `fotosDasPaginas`, e um tema com fotografias usa as do
 *     mood board.
 *
 * Puro, sem `server-only`: o estúdio corre-o no navegador.
 */

/** A chave com que a fotografia de capa entra nesta lista. */
export const CHAVE_DA_CAPA = "capa";

export interface FotoEscolhida {
  /** O caminho tal como está no documento. */
  ref: string;
  /** A chave da página (`chavesDasPaginas`), ou {@link CHAVE_DA_CAPA}. */
  chave: string;
  /** O nome que ela vê no estúdio («Capa», «Índice», «Cerimónia»…). */
  pagina: string;
  /** O lugar na página (0 na capa). */
  lugar: number;
}

const preenchida = (r: unknown): r is string => typeof r === "string" && r.trim() !== "";

export function fotosEscolhidasDoDocumento(doc: Partial<ProposalDoc>): FotoEscolhida[] {
  const saida: FotoEscolhida[] = [];
  const capa = (doc.coverImages ?? []).find(preenchida);
  if (capa) saida.push({ ref: capa, chave: CHAVE_DA_CAPA, pagina: "Capa", lugar: 0 });

  const escolhas = doc.fotosDasPaginas ?? {};
  if (Object.keys(escolhas).length === 0) return saida;
  let plano: ReturnType<typeof planoDaProposta>;
  try {
    plano = planoDaProposta(doc as ProposalDoc);
  } catch (err) {
    // Sem plano não se sabe que páginas existem, nem o nome delas (revisão de
    // 14/11, n.º 5). Contar as chaves todas era voltar a travar o envio por
    // páginas que já não existem, e a mostrar-lhe a chave crua (`tema:0:3`).
    // Fica só o que se sabe nomear — a capa —, e o erro fica registado: é um
    // defeito do plano, não dela.
    log.error("fotos escolhidas: o plano da proposta falhou — só a capa conta", err);
    return saida;
  }
  const chaves = chavesDasPaginas(plano);
  plano.forEach((p, i) => {
    if (p.tipo === "capa") return;
    const lugares = lugaresDaPagina(p);
    if (!lugares) return;
    const fotos = escolhas[chaves[i]]?.fotos ?? [];
    fotos.slice(0, lugares.max).forEach((ref, lugar) => {
      if (preenchida(ref)) saida.push({ ref, chave: chaves[i], pagina: p.nome, lugar });
    });
  });
  return saida;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE FOTOGRAFIAS DO PDF — QUEM CABE, DECIDIDO NUM SÍTIO SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PDF não leva mais de {@link FOTOS_NO_TECTO_DO_PDF} fotografias DIFERENTES
 * (memória e tempo da função: ver `proposal-doc-render.ts`). Revisão de 14/11,
 * importante n.º 1:
 *
 *   · conta-se FOTOS, não lugares. O motor descarrega cada fotografia uma vez
 *     só (`jaPedidas`), por isso uma que já cabe — a mesma em dois mood boards,
 *     a capa que também está num board — não gasta mais tecto;
 *   · quem cabe primeiro é o que ELA escolheu à mão: a capa, depois as
 *     escolhidas para as páginas que o plano ainda tem (a lista de cima,
 *     {@link fotosEscolhidasDoDocumento}), depois as outras capas, depois os
 *     mood boards pela ordem do documento, e por fim o que sobrar de
 *     `fotosDasPaginas` (chaves órfãs, lugares a mais), que o PDF não desenha.
 *     Uma escolhida à mão nunca sai antes de uma de mood board;
 *   · se mesmo assim uma escolhida (ou a capa) ficar de fora, isso TRAVA o
 *     envio (`oQueFaltaParaEnviar`, id `fotos-a-mais`) e o PDF não se guarda.
 *     Uma de mood board cortada não trava: o mosaico faz-se sem ela.
 *
 * Abaixo do tecto não muda nada: cabem todas.
 *
 * ── O QUE NÃO APLICA O TECTO (diferença que já existia) ──────────────────
 * A página web do casal (`conteudoWebDoDocumento`) e o plano/miniaturas do
 * estúdio (`fotosDoEditorialDoDocumento`, `plano.ts`) não cortam nada: acima do
 * tecto mostram mood boards com fotos que o PDF deixa de fora. Só acontece
 * acima de 80 fotografias diferentes, e o PDF diz quantas faltaram
 * (`X-Fotos-Em-Falta`).
 *
 * Puro, sem `server-only`: a Conferência corre-o no navegador.
 */
export const FOTOS_NO_TECTO_DO_PDF = 80;

export interface FotosNoTecto {
  /** As referências que cabem no tecto. */
  dentro: Set<string>;
  /** As escolhidas à mão (capa incluída) que ficaram de fora — travam. */
  escolhidasDeFora: FotoEscolhida[];
  /** Quantas fotografias diferentes passam do tecto, ao todo. */
  aMais: number;
}

export function fotosNoTectoDoPdf(
  doc: Partial<ProposalDoc>,
  opcoes: {
    /**
     * As de `fotosDasPaginas` contam (o desenho editorial). Sem isto só a capa
     * e os mood boards, que é o que o gerador antigo vai buscar.
     */
    comPaginas?: boolean;
    tecto?: number;
  } = {},
): FotosNoTecto {
  const tecto = opcoes.tecto ?? FOTOS_NO_TECTO_DO_PDF;
  const escolhidas = opcoes.comPaginas
    ? fotosEscolhidasDoDocumento(doc)
    : fotosEscolhidasDoDocumento({ coverImages: doc.coverImages });
  const pelaOrdem: string[] = [
    ...escolhidas.map((f) => f.ref),
    ...(doc.coverImages ?? []),
    ...(doc.moodBoards ?? []).flatMap((b) => b?.images ?? []),
    ...(opcoes.comPaginas
      ? Object.values(doc.fotosDasPaginas ?? {}).flatMap((e) => e?.fotos ?? [])
      : []),
  ];
  const vistas = new Set<string>();
  const dentro = new Set<string>();
  for (const ref of pelaOrdem) {
    // Vazia é um lugar sem foto, não uma foto: não gasta tecto (o motor nem a
    // vai buscar). O mesmo teste que o motor faz antes de ir buscar.
    if (typeof ref !== "string" || !ref || vistas.has(ref)) continue;
    vistas.add(ref);
    if (dentro.size < tecto) dentro.add(ref);
  }
  return {
    dentro,
    escolhidasDeFora: escolhidas.filter((f) => !dentro.has(f.ref)),
    aMais: Math.max(0, vistas.size - tecto),
  };
}
