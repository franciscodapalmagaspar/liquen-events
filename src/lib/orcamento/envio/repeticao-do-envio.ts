import "server-only";
import type { Proposal } from "@/lib/orcamento/types";
import type { RelatorioDoPdf } from "@/lib/proposal-preview-cache";
import { listarEnvios } from "@/lib/envios-de-proposta";
import { enderecoDaProposta } from "@/lib/proposta-link-curto";
import { log } from "@/lib/logger";

/**
 * ══════════════════════════════════════════════════════════════════════
 * O MESMO ENVIO DUAS VEZES NÃO SÃO DOIS EMAILS AO CASAL
 * ══════════════════════════════════════════════════════════════════════
 *
 * Etapa 8 do envio (`docs/ESTRUTURA-DO-CODIGO.md`, fase 5).
 *
 * MEDIDO: dois envios em voo do mesmo documento davam 2 propostas gravadas
 * e 2 emails ao casal — com DOIS links de aceitação diferentes, e duas
 * linhas «versão 1» para o mesmo casamento no quadro.
 *
 * E o caminho provável nem são dois separadores. É este: o `fetch` do
 * envio não tem tecto de tempo próprio, a rede tosse, o ecrã diz «Erro ao
 * enviar a proposta» e repõe o botão — e ela carrega outra vez, enquanto o
 * primeiro pedido continua a correr do lado de cá e acaba por enviar.
 *
 * A trava que existia era o `busy` do estúdio: estado de React, vale só
 * naquele separador, e o `catch` de rede rearma-o. Não chega.
 *
 * A trava daqui é sobre o CONTEÚDO, e é por isso que só se pode fazer depois
 * do carimbo da versão: o selo diz se este documento é o mesmo que já seguiu.
 * Se já seguiu, com o mesmo selo, há menos de {@link JANELA_DE_REPETICAO_MS},
 * isto é uma repetição — devolve-se o que aconteceu da primeira vez, com o
 * link que o casal recebeu, e NÃO se envia nada.
 *
 * A janela é curta de propósito. Reenviar a mesma proposta é uma coisa
 * legítima e acontece («perdi o email, podes reenviar?»), e três minutos
 * depois volta a ser possível sem nada no caminho. O que a janela apanha é
 * o dedo duas vezes no mesmo botão, que é outra coisa.
 */
export const JANELA_DE_REPETICAO_MS = 3 * 60_000;

export interface PedidoDeRepeticao {
  id: string;
  proposal: Proposal;
  irmasAnteriores: Proposal[];
  /** Ver `querEmail`. */
  pedeEmail: boolean;
  relatorio: Pick<RelatorioDoPdf, "missingImages" | "truncations">;
  pdfBytes: number;
}

/**
 * O corpo da resposta 200 de uma repetição, ou `null` quando o envio é a
 * sério e segue.
 */
export async function repeticaoDoEnvio(
  r: PedidoDeRepeticao,
): Promise<Record<string, unknown> | null> {
  const { id, proposal } = r;
  let jaSeguiu = r.irmasAnteriores.find(
    (p) =>
      // «aceite» também: num pedido já ganho, a que acabou de seguir passa
      // logo a aceite (`aceitarSeOPedidoJaEstaGanho`), e o segundo toque no
      // botão não a reconhecia — saía um segundo email ao casal.
      (p.status === "enviada" || p.status === "aceite") &&
      !!p.versaoSelo &&
      p.versaoSelo === proposal.versaoSelo &&
      !!p.sentAt &&
      Date.now() - Date.parse(p.sentAt) < JANELA_DE_REPETICAO_MS,
  );
  /**
   * ── «ENVIADA» JÁ NÃO QUER DIZER SÓ «O EMAIL SAIU» ──────────────────────
   *
   * Desde o achado n.º 4, escolher o WhatsApp também deixa a proposta
   * «enviada» — sem email nenhum. Se ela a marcou pelo WhatsApp e, um minuto
   * depois, decide mandá-la também por email, isto não é uma repetição: o
   * email nunca saiu. Um email que saiu deixa sempre a sua linha no registo
   * de envios; sem essa linha, não houve email a repetir. (Se o registo não
   * responder, fica a trava de sempre: é o lado seguro.)
   */
  if (jaSeguiu && r.pedeEmail) {
    const alvo = jaSeguiu;
    try {
      const envios = await listarEnvios(id);
      if (!envios.some((e) => e.propostaId === alvo.id)) jaSeguiu = undefined;
    } catch {
      /* sem registo, a trava fica — ver acima */
    }
  }
  /**
   * ══════════════════════════════════════════════════════════════════════
   * A TRAVA TEM DE OLHAR PARA O FACTO DO ENVIO, E NÃO PARA O ESTADO
   * ══════════════════════════════════════════════════════════════════════
   *
   * A trava de cima reconhece uma repetição pelo ESTADO da proposta
   * (`status === "enviada"`) — e o estado é a SEGUNDA escrita depois do
   * `sendMail`. Quando essa segunda escrita falha, o desfecho é este:
   *
   *   1. o email SAI e o casal recebe-o;
   *   2. a proposta fica marcada como «por enviar»;
   *   3. o ecrã diz-lhe, textualmente: «Reenvia-a para acertar o estado (é a
   *      mesma proposta, não se cria outra)»;
   *   4. ela reenvia — e a trava não reconhece nada, porque procura um
   *      `status` que nunca chegou a ser gravado. O `sendMail` corre outra
   *      vez, e o casal recebe DOIS emails com a mesma proposta.
   *
   * Ou seja: a frase que ela lê era a que provocava o defeito.
   *
   * O facto do envio, esse, EXISTE e está gravado uma linha antes da que
   * falhou — o `registarEnvio` escreve `enviadoEm` + `propostaId` em
   * `app_state` ANTES do `updateProposal`. A trava passa a consultá-lo.
   *
   * Melhor esforço declarado: se a leitura dos envios falhar, segue-se sem
   * ela — que é exactamente o que a rota fazia antes. Uma consulta que não
   * responde não pode travar um envio.
   */
  let jaSeguiuPeloRegisto: { enviadoEm: string; propostaId?: string } | undefined;
  if (!jaSeguiu) {
    try {
      jaSeguiuPeloRegisto = (await listarEnvios(id)).find(
        (e) =>
          e.propostaId === proposal.id &&
          !!e.enviadoEm &&
          Date.now() - Date.parse(e.enviadoEm) < JANELA_DE_REPETICAO_MS,
      );
    } catch (e) {
      log.warn("proposta-doc: não deu para ler os envios registados", { id, erro: String(e) });
    }
  }
  const { missingImages, truncations } = r.relatorio;
  if (!jaSeguiu && jaSeguiuPeloRegisto) {
    log.warn("proposta-doc: o email já tinha saído (registo de envios) — não se enviou outra vez", {
      id,
      proposta: proposal.id,
    });
    return {
      ok: true,
      id: proposal.id,
      emailed: true,
      estado: "enviada",
      acceptUrl: await enderecoDaProposta(proposal.id, id),
      missingImages,
      truncations,
      pdfBytes: r.pdfBytes,
      repetido: true,
      repetidoAviso:
        "O cliente JÁ recebeu esta proposta há instantes — o email saiu, e o que tinha " +
        "falhado foi só a marcação do estado deste lado. Não se enviou outra vez, e o " +
        "link é o mesmo que ele tem.",
    };
  }
  if (jaSeguiu && !r.pedeEmail) {
    // A mesma proposta marcada duas vezes pelo WhatsApp: não se cria outra,
    // e não se diz que saiu um email que ninguém mandou.
    return {
      ok: true,
      id: jaSeguiu.id,
      emailed: false,
      semEmailPorEscolha: true,
      estado: "enviada",
      acceptUrl: await enderecoDaProposta(jaSeguiu.id, id),
      missingImages,
      truncations,
      pdfBytes: r.pdfBytes,
      repetido: true,
      repetidoAviso:
        "Esta proposta já tinha sido marcada como enviada pelo WhatsApp há instantes. " +
        "O link é o mesmo.",
    };
  }
  if (jaSeguiu) {
    log.warn("proposta-doc: envio repetido do mesmo documento — não se enviou outra vez", {
      id,
      proposta: jaSeguiu.id,
    });
    return {
      ok: true,
      id: jaSeguiu.id,
      emailed: true,
      estado: "enviada",
      /** O link que o casal RECEBEU — não um segundo, que ninguém tem. É
       *  literalmente o mesmo: o código curto de uma proposta é cunhado uma
       *  vez e reaproveitado daí em diante. */
      acceptUrl: await enderecoDaProposta(jaSeguiu.id, id),
      missingImages,
      truncations,
      pdfBytes: r.pdfBytes,
      /** Para o ecrã poder dizer o que aconteceu em vez de fingir um envio. */
      repetido: true,
      repetidoAviso:
        "Esta proposta já tinha seguido para o cliente há instantes, com este mesmo " +
        "documento. Não foi enviada outra vez — o link é o mesmo que ele recebeu.",
    };
  }
  return null;
}
