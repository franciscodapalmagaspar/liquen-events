import type { ProposalDoc } from "./proposal-doc";
import { chavesDasPaginas, lugaresDaPagina, planoDaProposta } from "./pdf-editorial/plano";

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
 *     é a que o desenho usa (`montar.ts`);
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
  } catch {
    // Sem plano não se sabe que páginas existem. «Não sei» não pode desligar
    // o travão: contam todas, como antes desta lista.
    for (const [chave, e] of Object.entries(escolhas)) {
      (e?.fotos ?? []).forEach((ref, lugar) => {
        if (preenchida(ref)) saida.push({ ref, chave, pagina: chave, lugar });
      });
    }
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
