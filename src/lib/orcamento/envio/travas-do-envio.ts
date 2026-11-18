import "server-only";
import { oQueFaltaParaEnviar, type Impedimento } from "@/lib/proposal-progress";
import { fotosEscolhidasQueFaltam } from "@/lib/proposta-fotos-verificacao";
import { porqueOEmailNaoSegue } from "@/lib/email-do-cliente";
import { log } from "@/lib/logger";
import { paraComRecusa, SEGUE, type Passo } from "./passo";
import type { EnvioDaProposta } from "./envio-da-proposta";

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

/**
 * As travas das FOTOGRAFIAS (14/11). Uma foto que ela escolheu para uma página
 * e que já não existe: o PDF deixava de a mostrar e punha outra em silêncio
 * (confere-se no armazenamento, com `fotosEscolhidasQueFaltam`). E uma
 * escolhida (ou a capa) que o tecto de fotos do PDF deixaria de fora: a mesma
 * regra pura do motor, `fotosNoTectoDoPdf`.
 */
const DAS_FOTOGRAFIAS = ["foto-escolhida-em-falta", "fotos-a-mais"] as const;
/** As travas que são das fotografias (a frase do PDF final di-lo). */
const SAO_DAS_FOTOGRAFIAS: ReadonlySet<string> = new Set(DAS_FOTOGRAFIAS);

/**
 * O que trava também o PDF FINAL descarregado (5/11). Ela: «não quero que o
 * sistema deixe enviar uma proposta sem colocar os valores todos». O PDF final
 * descarregado é outra forma de a enviar (por email à mão, pelo WhatsApp), por
 * isso sem o preço e o artigo de cada linha — ou com uma foto escolhida em
 * falta — só sai o RASCUNHO, marcado como tal em cada página. O estúdio já não
 * oferece o final nesse caso; isto é a mesma regra do lado do servidor, para
 * um estúdio antigo noutra aba.
 */
const DO_PDF_FINAL = [
  // O preço e o artigo do Moloni de cada linha, e as linhas a somar o total
  // (5/11): sem isto a faturação não sai feita da proposta.
  "linhas-do-orcamento",
  "precos-das-linhas",
  "artigos-moloni",
  "soma",
  ...DAS_FOTOGRAFIAS,
] as const;
export const TRAVAM_O_PDF_FINAL: ReadonlySet<string> = new Set(DO_PDF_FINAL);

/**
 * Os erros do estúdio que a rota também recusa no ENVIO — ver «O QUE TRAVA NO
 * ESTÚDIO». Tudo o que trava o PDF final trava também o envio: por
 * construção, e não por cópia.
 *
 * São ids da regra (`oQueFaltaParaEnviar`), e o tipo não os prende
 * (`Impedimento.id` é texto). Prende-os `travas-do-envio.test.ts`, pelo
 * comportamento: cada id das duas listas tem de sair da regra, a travar. Um id
 * renomeado lá, ou mal escrito aqui, põe esse teste a vermelho.
 */
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
  ...DO_PDF_FINAL,
]);

/**
 * O que falta ao documento, pela regra do estúdio (`oQueFaltaParaEnviar`) — a
 * MESMA conta para as duas travas; só o canal e o «já viu o PDF» mudam. As
 * fotos escolhidas em falta contam-se como no estúdio
 * (`fotosEscolhidasQueFaltam`): uma pasta que não responde deixa por acusar só
 * as fotos dela; as outras contam.
 */
async function faltasDoDocumento(
  c: Pick<EnvioDaProposta, "doc" | "quote" | "idioma" | "dinheiro">,
  como: { canal: "email" | "whatsapp"; pdfVisto: boolean },
): Promise<Impedimento[]> {
  const fotosEmFalta = await fotosEscolhidasQueFaltam(c.doc);
  return oQueFaltaParaEnviar(c.doc, c.dinheiro().gross, {
    idioma: c.idioma,
    fotosEscolhidasQueFaltam: fotosEmFalta,
    canal: como.canal,
    emailDoCliente: c.quote.email,
    pdfVisto: como.pdfVisto,
  });
}

/** Das faltas que a regra encontrou, as que travam E que esta lista recusa. */
function queTravam(faltas: Impedimento[], lista: ReadonlySet<string>): Impedimento[] {
  return faltas.filter((f) => f.trava && lista.has(f.id));
}

/** «Falta o valor» → «falta o valor»: só a primeira letra desce — o resto
 *  leva os nomes dos serviços, que se escrevem como ela os escreveu. */
function emMinuscula(f: Impedimento): string {
  return f.texto.charAt(0).toLowerCase() + f.texto.slice(1);
}

/** O que ENVIAR precisa, com o que o pedido diz. */
export interface ContextoDaTrava extends EnvioDaProposta {
  /** `false` só quando ela escolheu o WhatsApp (`ler-o-corpo.ts`). */
  porEmail: boolean;
  /** A chave do PDF final visto, tal como o envio a trouxe. */
  pdfVisto: string | null;
  /** A chave do documento que chegou (`prepararODocumento`). */
  chaveDoQueChegou: string;
}

/**
 * A trava do ENVIO: o que o estúdio também recusa e, pelo email, o domínio
 * que não recebe correio. `SEGUE` quando pode seguir.
 */
export async function travaDoEnvio(c: ContextoDaTrava): Promise<Passo> {
  const faltas = await faltasDoDocumento(c, {
    canal: c.porEmail ? "email" : "whatsapp",
    pdfVisto: c.pdfVisto !== null && c.pdfVisto === c.chaveDoQueChegou,
  });
  const travam = queTravam(faltas, TRAVAM_NO_SERVIDOR);
  if (travam.length > 0) {
    log.warn("proposta-doc: envio recusado, a proposta tem erros", {
      id: c.pedidoId,
      erros: travam.map((f) => f.id),
    });
    return paraComRecusa({
      status: 422,
      corpo: {
        error: `A proposta não pode seguir: ${travam.map(emMinuscula).join("; ")}.`,
        faltas: travam,
      },
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
        id: c.pedidoId,
      });
      return paraComRecusa({ status: 422, corpo: { error: semDominio, campo: "email" } });
    }
  }
  return SEGUE;
}

/**
 * A trava do PDF FINAL na pré-visualização (o rascunho não trava: é onde ela
 * vê o que falta). `SEGUE` quando pode sair.
 */
export async function travaDoPdfFinal(
  c: Pick<EnvioDaProposta, "doc" | "quote" | "idioma" | "dinheiro">,
): Promise<Passo> {
  const faltas = await faltasDoDocumento(c, { canal: "email", pdfVisto: false });
  const travam = queTravam(faltas, TRAVAM_O_PDF_FINAL);
  if (travam.length === 0) return SEGUE;
  const soFotos = travam.every((f) => SAO_DAS_FOTOGRAFIAS.has(f.id));
  return paraComRecusa({
    status: 422,
    corpo: {
      error: `O PDF final só sai com ${
        soFotos ? "as fotografias todas" : "os valores todos"
      }: ${travam.map(emMinuscula).join("; ")}. Até lá, descarrega o rascunho.`,
      faltas: travam,
    },
  });
}
