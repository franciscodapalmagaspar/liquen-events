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
type PdfDoLink = { chave: string; obterBytes: () => Promise<Uint8Array> } | null;

/**
 * ── UMA LEITURA POR LINK, E NÃO UMA POR PÁGINA ─────────────────────────────
 *
 * Cada página é um pedido próprio, e cada pedido resolvia o link de novo — 2–3
 * idas à base de dados, incluindo a lista das revisões do pedido. Uma proposta
 * de 14 páginas eram ~45 consultas por abertura. Guarda-se a resposta durante
 * um minuto, por processo.
 *
 * O preço, e porque é aceitável: um link cortado ou uma revisão nova levam até
 * um minuto a chegar às IMAGENS. A página em si e o botão do PDF continuam a
 * resolver o link a cada pedido, como sempre.
 */
const VALIDADE_MS = 60_000;
const lidos = new Map<string, { ate: number; valor: Promise<PdfDoLink> }>();

export function pdfDoLink(token: string): Promise<PdfDoLink> {
  const agora = Date.now();
  const ja = lidos.get(token);
  if (ja && ja.ate > agora) return ja.valor;
  const valor = lerPdfDoLink(token);
  lidos.set(token, { ate: agora + VALIDADE_MS, valor });
  // Uma leitura que falhou não fica guardada.
  valor.catch(() => lidos.delete(token));
  if (lidos.size > 200) {
    for (const [t, l] of lidos) if (l.ate <= agora) lidos.delete(t);
  }
  return valor;
}

/** Só para os testes. */
export function esquecerLinksLidos(): void {
  lidos.clear();
}

async function lerPdfDoLink(token: string): Promise<PdfDoLink> {
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
