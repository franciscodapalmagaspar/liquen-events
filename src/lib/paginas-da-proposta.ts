import "server-only";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * O PDF de um link do casal, pronto para o `paginas-do-pdf.ts`: a chave do
 * conteúdo e uma função que dá os bytes só se forem precisos.
 *
 * Os bytes são os MESMOS do botão «PDF»: o ficheiro guardado no envio, ou, se
 * não estiver lá, o desenho a partir do documento guardado — ver
 * `pdfDaPropostaEmCache`. Por isso as propostas que já seguiram também abrem
 * assim, e não só as que vierem a seguir.
 *
 * `null` para tudo o que não tenha documento: o link não revela se existe.
 */
export async function pdfDoLink(
  token: string,
): Promise<{ chave: string; obterBytes: () => Promise<Uint8Array> } | null> {
  const proposta = (await propostaDoLink(token))?.proposta;
  if (!proposta?.doc) return null;
  const doc = proposta.doc;
  const idioma = idiomaDaProposta(proposta);
  return {
    chave: chaveDasPaginas(proposta.id, doc, idioma),
    obterBytes: async () => {
      // O desenhador só entra se for preciso — ver a nota na rota do PDF.
      const { pdfDaPropostaEmCache } = await import("@/lib/proposal-pdf-cache");
      return pdfDaPropostaEmCache(doc, idioma, true, proposta.id);
    },
  };
}

/**
 * A chave das páginas de uma proposta. O id entra: duas propostas com o mesmo
 * conteúdo (uma cópia) têm ficheiros guardados em sítios diferentes.
 */
export function chaveDasPaginas(
  proposalId: string,
  doc: ProposalDoc,
  idioma: ReturnType<typeof idiomaDaProposta>,
): string {
  return `${proposalId}:${chaveDoPdf(doc, idioma)}`;
}

/** Uma versão curta da chave, para o endereço das imagens mudar com a proposta. */
export function versaoDaChave(chave: string): string {
  return chave.slice(-16).replace(/[^A-Za-z0-9]/g, "");
}
