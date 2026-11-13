import "server-only";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { linksCortadosEm } from "@/lib/links-cortados";
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
type PdfDoLink = {
  chave: string;
  obterBytes: () => Promise<Uint8Array>;
  /**
   * Se os bytes desta chave, da última vez que se leram neste processo,
   * vieram COMPLETOS. `false` também quando ainda não se leram: na dúvida,
   * nada se guarda para sempre. Ver `pdfDaPropostaComEstado`.
   */
  completo: () => boolean;
} | null;

/**
 * O estado dos bytes de cada chave. As páginas em imagem (`paginas-do-pdf.ts`)
 * guardam o documento aberto por chave, e por isso o estado também é por
 * chave, e não por link: dois links da mesma proposta abrem o mesmo documento.
 */
const completos = new Map<string, boolean>();
const MAXIMO_DE_ESTADOS = 200;

function marcar(chave: string, completo: boolean): void {
  completos.delete(chave);
  completos.set(chave, completo);
  if (completos.size > MAXIMO_DE_ESTADOS) completos.delete(completos.keys().next().value!);
}

/**
 * ── UMA LEITURA POR LINK, E NÃO UMA POR PÁGINA ─────────────────────────────
 *
 * Cada página é um pedido próprio, e cada pedido resolvia o link de novo — 2–3
 * idas à base de dados, incluindo a lista das revisões do pedido. Uma proposta
 * de 14 páginas eram ~45 consultas por abertura. Guarda-se a resposta durante
 * um minuto, por processo.
 *
 * O preço, e porque é aceitável: uma revisão nova leva até um minuto a chegar
 * às IMAGENS. A página em si e o botão do PDF continuam a resolver o link a
 * cada pedido, como sempre.
 *
 * ── MAS UM LINK CORTADO DEIXA DE ABRIR JÁ ─────────────────────────────────
 *
 * Um corte também levava até um minuto (auditoria de 13/11): ela carrega em
 * «cortar os links» e as páginas continuavam a sair a quem as tivesse pedido
 * há pouco. Por isso, ao reaproveitar a resposta, pergunta-se o carimbo do
 * corte do pedido (`linksCortadosEm`) — UMA leitura pequena, e não as 2–3 da
 * resolução inteira. Se houver um corte posterior à leitura guardada, ela não
 * serve e o link resolve-se outra vez (o `propostaDoLink` decide se ainda
 * abre). Os pedidos que chegam juntos (as páginas pedem-se aos molhos)
 * partilham a mesma leitura do carimbo.
 */
const VALIDADE_MS = 60_000;
type Lido = { pdf: PdfDoLink; pedido: string };
const lidos = new Map<string, { ate: number; lidoEm: number; valor: Promise<Lido> }>();
/** As leituras do carimbo em curso, por pedido — partilhadas, e só enquanto duram. */
const cortesEmCurso = new Map<string, Promise<number | null>>();

function corteDoPedido(pedido: string): Promise<number | null> {
  const ja = cortesEmCurso.get(pedido);
  if (ja) return ja;
  const valor = linksCortadosEm(pedido).finally(() => cortesEmCurso.delete(pedido));
  cortesEmCurso.set(pedido, valor);
  return valor;
}

export async function pdfDoLink(token: string): Promise<PdfDoLink> {
  const agora = Date.now();
  const ja = lidos.get(token);
  if (ja && ja.ate > agora) {
    const { pdf, pedido } = await ja.valor;
    if (!pdf || !pedido) return pdf;
    const corte = await corteDoPedido(pedido);
    if (corte === null || corte < ja.lidoEm) return pdf;
    // Cortado depois da leitura guardada: resolve-se outra vez, já.
    if (lidos.get(token) === ja) lidos.delete(token);
  }
  return (await ler(token, agora)).pdf;
}

function ler(token: string, agora: number): Promise<Lido> {
  const valor = lerPdfDoLink(token);
  lidos.set(token, { ate: agora + VALIDADE_MS, lidoEm: agora, valor });
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
  completos.clear();
  cortesEmCurso.clear();
}

async function lerPdfDoLink(token: string): Promise<Lido> {
  const proposta = (await propostaDoLink(token))?.proposta;
  if (!proposta?.doc) return { pdf: null, pedido: "" };
  const doc = proposta.doc;
  const idioma = idiomaDaProposta(proposta);
  const chave = chaveDasPaginas(proposta.id, doc, idioma);
  const pdf = {
    chave,
    obterBytes: async () => {
      // O desenhador só entra se for preciso — ver a nota na rota do PDF.
      const { pdfDaPropostaComEstado } = await import("@/lib/proposal-pdf-cache");
      const { pdf, completo } = await pdfDaPropostaComEstado(doc, idioma, true, proposta.id);
      marcar(chave, completo);
      return pdf;
    },
    completo: () => completos.get(chave) === true,
  };
  return { pdf, pedido: (proposta.quoteId ?? "").trim() };
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
