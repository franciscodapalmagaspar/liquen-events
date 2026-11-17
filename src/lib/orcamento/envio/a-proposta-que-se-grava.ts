import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Proposal } from "@/lib/orcamento/types";
import type { dinheiroDaProposta } from "@/lib/proposal-budget";
import { listProposalsForQuote } from "@/lib/proposals-store";
import { proximaVersao, seloDoConteudo } from "@/lib/proposta-versao";
import { log } from "@/lib/logger";
import type { OEnvio } from "./o-envio";

/**
 * Etapa 7 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5): a linha que se
 * vai gravar, com o seu número de versão. A montagem e o carimbo são puros; só
 * {@link irmasDoPedido} lê a base.
 */

/**
 * ══════════════════════════════════════════════════════════════════════
 * REENVIAR NÃO PODE SER GERAR OUTRA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Quando o email não sai (SMTP em baixo, contacto errado), a proposta fica
 * gravada — tem de ficar, ver a nota da gravação — mas fica POR ENVIAR. Ela
 * corrige o que estava mal e carrega outra vez no mesmo botão: sem isto,
 * cada tentativa gravava MAIS UMA proposta, e três tentativas eram três
 * linhas no quadro «Propostas» para o mesmo casal. É a mesma família das
 * «propostas fantasma» que a rota irmã descreve.
 *
 * Reaproveita-se a mais recente que ainda não foi oferecida a ninguém
 * (`rascunho`) — e só essa. Uma proposta que JÁ seguiu para o casal nunca
 * é reescrita: uma revisão é uma proposta nova, e é disso que dependem o
 * histórico, a análise, e a guarda da proposta mais recente no link do
 * cliente (`/api/proposta`).
 *
 * Uma leitura que falhe não pode travar o envio: cai-se na proposta nova,
 * que é exactamente o que a rota fazia antes.
 */
export async function irmasDoPedido(
  id: string,
): Promise<{ irmas: Proposal[]; porEnviar: Proposal | null }> {
  try {
    const irmas = await listProposalsForQuote(id);
    const porEnviar =
      irmas
        .filter((p) => p.status === "rascunho")
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
    return { irmas, porEnviar };
  } catch (e) {
    log.warn("proposta-doc: não deu para procurar uma proposta por enviar", { id, erro: e });
    return { irmas: [], porEnviar: null };
  }
}

export interface Montagem extends OEnvio {
  dinheiro: ReturnType<typeof dinheiroDaProposta>;
  validUntil: string;
  pdf: Buffer;
  porEnviar: Proposal | null;
}

/** A linha da proposta, como se grava ANTES de o email sair. */
export function montarAProposta(m: Montagem): Proposal {
  return {
    id: m.porEnviar?.id ?? randomUUID(),
    quoteId: m.pedidoId,
    clientName: m.doc.clientNames,
    clientEmail: m.quote.email,
    currency: "EUR",
    lineItems: [],
    vatRate: m.dinheiro.vatRate,
    subtotal: m.dinheiro.base,
    vat: m.dinheiro.vat,
    total: m.dinheiro.gross,
    validUntil: m.validUntil,
    /**
     * ══════════════════════════════════════════════════════════════════════
     * O ESTADO NASCE «POR ENVIAR», E É O CORREIO QUE O FAZ SUBIR
     * ══════════════════════════════════════════════════════════════════════
     *
     * Isto dizia `status: "enviada"` e `sentAt: agora` — escritos ANTES de se
     * tentar enviar seja o que for. Com o SMTP em baixo, o estúdio mostrava um
     * aviso passageiro e o registo ficava com
     * `{"status":"enviada","sentAt":"…"}` para sempre: o quadro «Propostas»
     * mostrava uma proposta «Enviada, à espera de resposta» que nunca saiu de
     * casa, e o Acompanhamento punha-a a contar dias por uma resposta que não
     * podia chegar. Um aviso passa; um estado errado fica.
     *
     * «Enviada» é um FACTO sobre o mundo — o servidor de correio aceitou a
     * mensagem — e só se escreve depois de ele acontecer (em
     * `depois-do-email.ts`). Até lá a proposta é o que é: um documento gerado,
     * guardado, por enviar. O `rascunho` é o estado que o resto do produto já
     * lê como «nunca foi oferecida a ninguém» — o link do cliente recusa-a
     * (`EM_ABERTO`), a análise não a conta, o Acompanhamento não a persegue.
     *
     * O que NÃO muda: a proposta é gravada na mesma, antes do envio. Ver a
     * nota da gravação (`gravar-a-proposta.ts`) — é o que impede as propostas
     * fantasma.
     */
    status: "rascunho",
    createdAt: m.porEnviar?.createdAt ?? new Date().toISOString(),
    doc: m.doc, // stored with Storage paths so it can be re-opened + edited
    /**
     * ── O SELO DO DOCUMENTO ────────────────────────────────────────────────
     *
     * A impressão digital do PDF que segue AGORA para o casal. Os bytes já
     * estão em memória, portanto isto custa um `createHash` sobre um buffer e
     * mais nada — nem um pedido, nem um milissegundo de espera do lado dela.
     *
     * PORQUÊ AQUI E NÃO NO ACEITE: no aceite, desenhar o PDF outra vez seriam
     * segundos (259 ms fixos + ~75 ms por fotografia) na única página onde não
     * se pode fazer o casal esperar — a do «sim». E seria um documento
     * RECONSTRUÍDO, não o que eles viram. Aqui é o próprio.
     *
     * O que isto passa a permitir: numa discussão do género «o arco não
     * estava incluído», comparar o PDF que ela tem com o que foi aceite é
     * `sha256sum` contra o valor guardado no contrato. Sem isto, o `doc` é
     * reconstruído e qualquer mudança no código do desenho — uma fonte, uma
     * margem, uma fotografia entretanto substituída — dá um ficheiro
     * diferente, sem forma de saber se o conteúdo mudou ou só o desenho.
     */
    pdfSha256: createHash("sha256").update(m.pdf).digest("hex"),
    pdfBytes: m.pdf.byteLength,
    /**
     * ── A LÍNGUA EM QUE ESTE PDF FOI DESENHADO ────────────────────────────
     *
     * Gravada SEMPRE, mesmo quando é o português: é um facto sobre o
     * documento que acabou de ser selado na linha de cima — foi desenhado com
     * esta moldura, e é esta que tem de voltar quando alguém o pedir outra
     * vez. Deixá-la em branco no caminho português punha uma proposta nova a
     * ser indistinguível de uma anterior a esta coluna, e obrigava a adivinhar
     * onde não é preciso.
     *
     * É também o que faz o SELO poder ser verificado: quem redesenhar o
     * documento a partir do `doc` tem agora como saber em que língua o fazer,
     * e o `sha256` volta a bater. Enquanto isto não se guardava, um PDF inglês
     * selado no envio nunca mais podia ser reproduzido — quem o redesenhava
     * desenhava-o em português e obtinha outra impressão digital.
     */
    idioma: m.idioma,
  };
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * A VERSÃO — CONTA-SE POR PEDIDO, NÃO POR LINHA
 * ══════════════════════════════════════════════════════════════════════
 *
 * Uma revisão nesta casa é uma proposta NOVA (ver {@link irmasDoPedido}: uma
 * proposta que já seguiu nunca é reescrita). Logo, o número da versão não
 * pode viver na linha — cada linha nasceria na versão 1 e o casal ouviria
 * «versão 1» ao telefone três revisões depois. Conta-se sobre as IRMÃS: o
 * maior número já atribuído neste pedido, mais um.
 *
 * E só sobe quando o CONTEÚDO muda. O selo é o de `proposta-versao.ts` —
 * sobre o que o casal vê, não sobre os bytes do PDF, que mudam sozinhos a
 * cada gravação (medido: a pdf-lib carimba a data lá dentro). Sem essa
 * distinção, carregar duas vezes em enviar inventava uma versão nova.
 *
 * Melhor esforço declarado: se a leitura das irmãs falhou, não há anteriores
 * e esta proposta entra na versão 1. É a única coisa que se pode dizer sem
 * inventar, e não trava o envio.
 *
 * Pura: devolve os três campos da versão, e quem chama junta-os à linha.
 */
export function versaoDaProposta(
  proposal: Proposal,
  anteriores: readonly Proposal[],
): Pick<Proposal, "versaoSelo" | "versaoNumero" | "versaoEm"> {
  const maisRecente =
    [...anteriores].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0] ?? null;
  const maiorNumero = anteriores.reduce(
    (maior, p) =>
      Number.isFinite(p.versaoNumero) ? Math.max(maior, Number(p.versaoNumero)) : maior,
    0,
  );
  const versao = proximaVersao(
    { versaoSelo: maisRecente?.versaoSelo, versaoNumero: maiorNumero },
    seloDoConteudo(proposal),
  );
  return {
    versaoSelo: versao.versaoSelo,
    versaoNumero: versao.versaoNumero,
    // A data é a do CONTEÚDO, não a da gravação: uma proposta reenviada sem
    // uma vírgula mudada continua a dizer ao casal que foi actualizada no dia
    // em que mudou mesmo.
    versaoEm: versao.mudou
      ? new Date().toISOString()
      : (maisRecente?.versaoEm ?? new Date().toISOString()),
  };
}

/**
 * As OUTRAS propostas do pedido, da mais recente para a mais antiga. É sobre
 * elas que se conta a versão ({@link versaoDaProposta}) e que a trava de
 * repetição procura o mesmo envio (a primeira que bate é a mais recente).
 */
export function propostasAnteriores(proposal: Proposal, irmas: readonly Proposal[]): Proposal[] {
  return irmas
    .filter((p) => p.id !== proposal.id)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}
