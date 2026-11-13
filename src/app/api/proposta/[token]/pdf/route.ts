import { NextResponse } from "next/server";
import { propostaDoLink } from "@/lib/proposta-do-link";
import { chaveDoPdf } from "@/lib/proposal-pdf-chave";
import { pdfGuardadoEmFluxo } from "@/lib/pdf-do-armazenamento";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { nomeDoFicheiroDaProposta } from "@/lib/email-proposta-textos";
import { respostaPdf } from "@/lib/pdf-resposta";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { log } from "@/lib/logger";

// pdf-lib + sharp precisam do runtime Node.
export const runtime = "nodejs";
/**
 * Tecto de uma geração — e agora também da ENTREGA.
 *
 * Eram 20 s, e chegavam quando a função só desenhava: quem descarregava o
 * ficheiro descarregava-o do CDN, com a função já fora do caminho. Desde que
 * o ficheiro guardado passou a ser encaminhado por aqui (ver
 * `pdf-do-armazenamento.ts`), a função fica aberta enquanto o telemóvel
 * recebe — e uma proposta anda pelos 0,5–4 MB, numa quinta com 4G fraco.
 *
 * 60 s é o mesmo tecto que as rotas mais pesadas desta casa já usam.
 */
export const maxDuration = 60;

/**
 * O PDF da proposta, servido pelo MESMO link assinado que o casal usa para a
 * aceitar (/[lang]/proposta/[token]).
 *
 * PORQUÊ existe. O PDF seguia em anexo no email e mais nada: na página onde se
 * decide gastar milhares de euros não havia forma de o voltar a ver. Quem
 * arquivasse o email, ou o abrisse no telemóvel de outra pessoa, tinha de pedir
 * a proposta outra vez para poder aceitá-la.
 *
 * Modelo de confiança: o token HMAC É a autorização, tal como no aceite
 * (POST /api/proposta) — ele só serve a proposta para a qual foi emitido, não
 * há nada a enumerar nem a forjar, e ver o documento é estritamente MENOS do
 * que o que esse mesmo token já permite fazer (aceitar).
 *
 * 404 (nunca 401/403) para tudo o que falhe — token inválido ou expirado,
 * proposta apagada, ou proposta antiga sem documento guardado — para um link
 * nunca revelar se um id existe.
 *
 * Serve a proposta do token INDEPENDENTEMENTE do estado: expirada ou já
 * respondida, o cliente continua a poder rever o documento que lhe foi
 * apresentado (a página já lhe explica que não pode responder). O que ele
 * recebe é sempre o documento DESTA proposta, nunca o de uma revisão mais
 * recente que ele não viu.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Desenhar re-codifica todas as fotos (pdf-lib + sharp) — é caro. O token
  // vive 14 dias na caixa de correio do cliente e é reencaminhável, por isso
  // limita-se por IP para um link na mão de alguém não poder ser repetido em
  // ciclo até esgotar CPU/memória. Mesmo teto do PDF do portal.
  const limited = await rateLimit(`proposta-pdf:${clientIp(request)}`, 12, 60_000);
  if (!limited.ok) return new NextResponse(null, { status: 429 });

  /** Só para o registo do `catch`: qual proposta é que estava a ser desenhada. */
  let idParaRegisto = "";
  try {
    /**
     * A MESMA proposta que a página mostra — ver `proposta-do-link.ts`. O link
     * segue o PEDIDO e não a linha, portanto uma revisão que ela envie chega
     * ao casal pelo link que ele já tem. Resolver aqui de outra maneira dava a
     * página na versão 2 com um botão que descarregava a 1.
     */
    const doLink = await propostaDoLink(token);
    const proposal = doLink?.proposta;
    idParaRegisto = proposal?.id ?? "";
    // Sem documento guardado não há PDF nenhum para servir: é o caso das
    // propostas anteriores à coluna `proposals.doc` e das propostas de linhas
    // criadas em /api/propostas. A página do cliente esconde o botão nesse
    // caso; isto fecha a mesma porta do lado do servidor.
    if (!proposal?.doc) return new NextResponse(null, { status: 404 });

    /**
     * ── NA LÍNGUA EM QUE A PROPOSTA FOI FEITA, E NÃO NA DE QUEM PEDE ────────
     *
     * Este botão REDESENHA o documento a partir do `doc` guardado. Enquanto a
     * língua não ficava gravada com a proposta, quem redesenhava não tinha como
     * a saber e caía em português: o casal inglês recebia a proposta inglesa por
     * email e, ao carregar no botão da página onde a aceita, abria a
     * portuguesa — o mesmo documento em duas línguas, sem explicação.
     *
     * Não se olha para a língua do VISITANTE (nem para o segmento da rota, nem
     * para o cookie): o que este link serve é um documento que já existe e que
     * já foi apresentado numa língua. Quem o reencaminhar para um amigo
     * português continua a ver o documento que o casal recebeu.
     *
     * Uma proposta sem língua gravada é portuguesa — ver `idiomaDaProposta`.
     */
    const idioma = idiomaDaProposta(proposal);
    // O nome do ficheiro vai dentro de um cabeçalho: saneia-se a referência
    // (aspas, espaços, acentos) em vez de a confiar tal como está gravada.
    const ref = (proposal.quoteId || proposal.id).replace(/[^A-Za-z0-9_-]/g, "");
    const nome = nomeDoFicheiroDaProposta(
      {
        escolhido: proposal.doc?.nomeDoFicheiro,
        clientNames: proposal.doc?.clientNames,
        eventDate: proposal.doc?.eventDate,
        ref,
      },
      idioma,
    );

    /**
     * ── SE ELE JÁ ESTÁ GUARDADO, NÃO SE DESENHA: ENCAMINHA-SE ─────────────
     *
     * Palavras dela: «para ver a proposta em PDF quando carrego demora mesmo
     * muito tempo a abrir». O PDF passou a ficar guardado no envio, e isso
     * tirou o desenho do caminho.
     *
     * ── E DEIXOU DE SER UM REENCAMINHAMENTO ───────────────────────────────
     *
     * Isto respondia `302` para o endereço assinado do armazenamento. Palavras
     * dela sobre o resultado: «quando carregamos na proposta por email aparece
     * este url… quero algo muito mais bonito e sem ser com este url super
     * desconfiado» — a barra do Safari passava a mostrar
     * `<referência>.supabase.co` a um casal prestes a decidir milhares de
     * euros. E depois: «quero que o pdf continue a ser rapido… mas com um url
     * adequado».
     *
     * Passa a ser servido POR AQUI, em fluxo, e é mais curto do que era: ver o
     * `pdf-do-armazenamento.ts`, que tem a conta feita. Em resumo — o
     * reencaminhamento não poupava arranque a frio nenhum (a função corria de
     * qualquer maneira, para saber para onde mandar), custava ao telemóvel uma
     * ligação nova a um segundo domínio, e ainda levava um pedido escondido
     * para assinar o endereço.
     *
     * `null` quer dizer que não está lá — e aí desenha-se, como antes.
     */
    const guardado = await pdfGuardadoEmFluxo(
      request,
      proposal.id,
      chaveDoPdf(proposal.doc, idioma),
      nome,
    );
    if (guardado) return guardado;

    /**
     * ── O DESENHADOR SÓ ENTRA AQUI, E SÓ SE FOR PRECISO ────────────────────
     *
     * Um `import` no topo do ficheiro é pago em TODOS os pedidos. O
     * `proposal-pdf-cache` traz o `pdf-lib` e o `sharp` atrás — medido, 212 ms
     * de módulos — e o caminho de cima, que é o normal, não desenha nada:
     * encaminha o ficheiro guardado. Pagava-se o desenhador para não o usar,
     * exactamente no instante em que ela carrega no botão.
     *
     * Aqui em baixo é o caminho raro: o ficheiro ainda não está guardado, e
     * então há mesmo que o desenhar. É o único sítio onde o custo se justifica.
     */
    const { pdfDaPropostaEmCache } = await import("@/lib/proposal-pdf-cache");

    // `true`: este botão redesenha, para ecrã, um documento que o casal já
    // recebeu por email, e serve-o MESMO que lhe falte uma fotografia — uma
    // falta fazia isto responder 503 sem corpo, e o botão não fazia nada. Ver a
    // nota em `proposal-pdf-cache.ts`; o anexo do email continua a recusar.
    // O `proposal.id` entra para o desenho guardado no ENVIO poder ser servido
    // tal e qual (`proposal-pdf-guardado.ts`).
    const pdf = await pdfDaPropostaEmCache(proposal.doc, idioma, true, proposal.id);
    // `Content-Length`, pedaços e `ETag` — a razão está em `pdf-resposta.ts`.
    // O NOME é o mesmo com que o ficheiro seguiu no email: o casal tem-no na
    // caixa de correio e tem de reconhecer o que descarrega como o mesmo.
    // `descarregar`: o caminho de cima (ficheiro guardado) já descarrega, pelo
    // `download` do endereço assinado. Sem isto os dois caminhos da MESMA rota
    // faziam coisas diferentes — ver `OpcoesPdf.descarregar`.
    return respostaPdf(request, pdf, { nome, descarregar: true });
  } catch (err) {
    log.error("proposta pdf GET falhou", err, { proposalId: idParaRegisto });
    return new NextResponse(null, { status: 500 });
  }
}
