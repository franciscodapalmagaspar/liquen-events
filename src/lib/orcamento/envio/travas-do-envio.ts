import "server-only";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import { dinheiroDaProposta } from "@/lib/proposal-budget";
import { oQueFaltaParaEnviar, type Impedimento } from "@/lib/proposal-progress";
import { fotosEscolhidasQueFaltam } from "@/lib/proposta-fotos-verificacao";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";
import { log } from "@/lib/logger";
import { recusa, type Recusa } from "./recusa";

/**
 * ══════════════════════════════════════════════════════════════════════
 * O QUE TRAVA NO ESTÚDIO TAMBÉM TRAVA AQUI (B1)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Etapa 4 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5).
 *
 * «Já saiu um PDF sem orçamento e sem condições, e nada no ecrã o
 * impediu.» O estúdio passou a desligar o botão — mas o botão é uma porta
 * do lado de lá, e um estúdio antigo aberto noutra aba, ou um pedido feito
 * à mão, passava por cima. A regra é a MESMA (`oQueFaltaParaEnviar`), e
 * aqui confere-se o que o documento dela listou como erro: o valor, as
 * condições, a data, os nomes, a validade e o email.
 *
 * Os outros bloqueios do estúdio (serviços, marcadores, traduções…)
 * continuam a ser do estúdio: dependem do que só a aba sabe, ou já têm
 * guarda própria mais abaixo, e duplicá-los aqui seria uma segunda regra a
 * poder discordar da primeira.
 *
 * Recusa ANTES de desenhar: um PDF de um minuto que não pode seguir é um
 * minuto deitado fora.
 */

/** Os erros do estúdio que a rota também recusa — ver «O QUE TRAVA NO ESTÚDIO». */
export const TRAVAM_NO_SERVIDOR: ReadonlySet<string> = new Set([
  "nome",
  "valor",
  "data",
  "validade",
  "email",
  "condicoes",
  // «Ver o PDF primeiro» (14/10): o envio leva a chave do PDF final que ela
  // descarregou e confirmou — ver `chaveDoQueChegou`, em `documento-do-envio`.
  "visto",
  // O preço e o artigo do Moloni de cada linha, e as linhas a somar o total
  // (5/11): sem isto a faturação não sai feita da proposta.
  "linhas-do-orcamento",
  "precos-das-linhas",
  "artigos-moloni",
  "soma",
  // Uma foto que ela escolheu para uma página e que já não existe (14/11): o
  // PDF deixava de a mostrar e punha outra em silêncio. Confere-se aqui, no
  // armazenamento, com `fotosEscolhidasQueFaltam`.
  "foto-escolhida-em-falta",
  // Uma escolhida (ou a capa) que o tecto de fotos do PDF deixaria de fora
  // (14/11): a mesma regra pura do motor, `fotosNoTectoDoPdf`.
  "fotos-a-mais",
]);

/**
 * O que trava também o PDF FINAL descarregado (5/11). Ela: «não quero que o
 * sistema deixe enviar uma proposta sem colocar os valores todos». O PDF final
 * descarregado é outra forma de a enviar (por email à mão, pelo WhatsApp), por
 * isso sem o preço e o artigo de cada linha só sai o RASCUNHO, marcado como
 * tal em cada página. O estúdio já não oferece o final nesse caso; isto é a
 * mesma regra do lado do servidor, para um estúdio antigo noutra aba.
 */
export const TRAVAM_O_PDF_FINAL: ReadonlySet<string> = new Set([
  "linhas-do-orcamento",
  "precos-das-linhas",
  "artigos-moloni",
  "soma",
  // A foto que ela escolheu e já não existe: o PDF final sairia com o lugar
  // vazio. O estúdio já só oferece o rascunho nesse caso (a mesma lista).
  "foto-escolhida-em-falta",
  "fotos-a-mais",
]);

/** «Falta o valor» → «falta o valor»: só a primeira letra desce — o resto
 *  leva os nomes dos serviços, que se escrevem como ela os escreveu. */
function emMinuscula(f: Impedimento): string {
  return f.texto.charAt(0).toLowerCase() + f.texto.slice(1);
}

/** O que ENVIAR precisa, com o que o pedido diz. */
export interface ContextoDaTrava {
  id: string;
  doc: ProposalDoc;
  quote: Quote;
  idioma: IdiomaDaProposta;
  /** `false` só quando ela escolheu o WhatsApp — ver `querEmail`. */
  porEmail: boolean;
  /** A chave do PDF final visto, tal como o envio a trouxe. */
  pdfVisto: string | null;
  /** A chave do documento que chegou (`prepararODocumento`). */
  chaveDoQueChegou: string;
}

/**
 * A trava do ENVIO: o que o estúdio também recusa e, pelo email, o domínio
 * que não recebe correio. `null` quando pode seguir.
 */
export async function travaDoEnvio(c: ContextoDaTrava): Promise<Recusa | null> {
  // A MESMA conta do estúdio (`fotosEscolhidasQueFaltam`). Uma pasta que
  // não responde deixa por acusar só as fotos dela; as outras contam.
  const escolhidasEmFalta = await fotosEscolhidasQueFaltam(c.doc);
  const travam = oQueFaltaParaEnviar(c.doc, dinheiroDaProposta(c.doc).gross, {
    idioma: c.idioma,
    fotosEscolhidasQueFaltam: escolhidasEmFalta,
    canal: c.porEmail ? "email" : "whatsapp",
    emailDoCliente: c.quote.email,
    pdfVisto: c.pdfVisto !== null && c.pdfVisto === c.chaveDoQueChegou,
  }).filter((f) => f.trava && TRAVAM_NO_SERVIDOR.has(f.id));
  if (travam.length > 0) {
    log.warn("proposta-doc: envio recusado, a proposta tem erros", {
      id: c.id,
      erros: travam.map((f) => f.id),
    });
    return recusa(422, {
      error: `A proposta não pode seguir: ${travam.map(emMinuscula).join("; ")}.`,
      faltas: travam,
    });
  }
  /**
   * O domínio do email do cliente tem de receber correio (pedido dela,
   * 30/10: «não deixe enviar emails que não existem»). Recusa-se ANTES de
   * gravar e de mandar seja o que for — ver `email-do-cliente.ts`.
   */
  if (c.porEmail) {
    const semDominio = await porqueOEmailNaoSegue(c.quote.email);
    if (semDominio) {
      log.warn("proposta-doc: envio recusado, o domínio do email não recebe correio", {
        id: c.id,
      });
      return recusa(422, { error: semDominio, campo: "email" });
    }
  }
  return null;
}

/**
 * A trava do PDF FINAL na pré-visualização (o rascunho não trava: é onde ela
 * vê o que falta). `null` quando pode sair.
 */
export async function travaDoPdfFinal(
  c: Pick<ContextoDaTrava, "doc" | "quote" | "idioma">,
): Promise<Recusa | null> {
  const travam = oQueFaltaParaEnviar(c.doc, dinheiroDaProposta(c.doc).gross, {
    idioma: c.idioma,
    fotosEscolhidasQueFaltam: await fotosEscolhidasQueFaltam(c.doc),
    canal: "email",
    emailDoCliente: c.quote.email,
    pdfVisto: false,
  }).filter((f) => f.trava && TRAVAM_O_PDF_FINAL.has(f.id));
  if (travam.length === 0) return null;
  const soFotos = travam.every(
    (f) => f.id === "foto-escolhida-em-falta" || f.id === "fotos-a-mais",
  );
  return recusa(422, {
    error: `O PDF final só sai com ${
      soFotos ? "as fotografias todas" : "os valores todos"
    }: ${travam.map(emMinuscula).join("; ")}. Até lá, descarrega o rascunho.`,
    faltas: travam,
  });
}
