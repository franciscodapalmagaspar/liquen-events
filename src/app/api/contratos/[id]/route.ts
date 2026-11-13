import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getContract, updateContract } from "@/lib/contracts-store";
import { getProposal } from "@/lib/proposals-store";
import { nomeDeQuemEnvia } from "@/lib/email-quem-assina";
import { respostaDeConflito, respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REGISTAR UM ACEITE QUE ACONTECEU FORA DAQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um contrato nasce `pendente` e não havia porta nenhuma para o pôr em
 * `aceite`: o `updateContract` existia sem um único chamador de produção — o
 * próprio ficheiro do store o admitia. Consequência medida, e não teórica:
 *
 *   · o portal do casal dizia «Aceitação pendente» e NUNCA mostrava o botão
 *     «Descarregar contrato (PDF)», porque ele só aparece com o contrato
 *     aceite;
 *   · o filtro «Aceite» do ecrã de Contratos ficava vazio para sempre, e o
 *     contador «N contratos aceites» era sempre 0;
 *   · o congelamento da proposta aceite (`proposta-do-link.ts`) era código que
 *     não podia correr, porque nunca havia aceite com que comparar;
 *   · e o aviso do ecrã de envio — «este pedido já tem uma proposta ACEITE» —
 *     nunca aparecia.
 *
 * ── PORQUE É QUE ISTO NÃO É «ACEITE ELECTRÓNICO» ──────────────────────────
 *
 * O botão de aceitar pelo link foi RETIRADO, por decisão dela: «um casamento
 * não se fecha num botão — fecha-se numa conversa». Portanto este sistema não
 * presencia o sim, e fingir que presenciou seria pior do que não ter estado
 * nenhum: um contrato que afirma uma assinatura electrónica que ninguém deu é
 * uma prova falsa, e é a única coisa aqui que se pode estragar de vez.
 *
 * O que se grava é o que é verdade: QUEM na casa registou (lido da sessão,
 * nunca do corpo), QUANDO registou, e COMO a casa soube. O PDF do contrato
 * imprime um bloco diferente para este caso, sem a palavra «electrónico» e sem
 * IP nenhum.
 *
 * ── E A VERSÃO DA PROPOSTA VAI JUNTO ──────────────────────────────────────
 *
 * O selo do conteúdo é copiado da proposta no instante do registo. É o que faz
 * o congelamento funcionar daí em diante: sem ele não se distingue «o
 * documento de agora é o que foi aceite» de «foi revisto depois do sim».
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as {
    como?: unknown;
    desfazer?: unknown;
  } | null;

  /**
   * ── E VOLTA ATRÁS ───────────────────────────────────────────────────────
   *
   * Palavras dela, a 10/10, com este botão como exemplo: «tem que haver no
   * site todo, em tudo aquilo que se faz, uma forma de voltar atrás». Marcar
   * como assinado por engano não podia ficar para sempre.
   *
   * Desfaz-se SÓ o registo feito pela equipa — o que este botão escreveu. Um
   * aceite electrónico antigo (com IP) é a prova de que o casal carregou no
   * botão; apagá-lo seria apagar a prova, e esse não volta para trás.
   *
   * Volta a `pendente` e limpa os campos do registo. Os campos limpam-se com
   * texto vazio e não com `undefined`: o mapeamento só escreve o que vem
   * definido, e um `undefined` deixava o nome antigo na base.
   */
  if (body?.desfazer === true) {
    try {
      const contrato = await getContract(id);
      if (!contrato) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
      if (contrato.status !== "aceite") return NextResponse.json(contrato);
      if (contrato.acceptedIp) {
        return NextResponse.json(
          {
            error:
              "Este aceite foi feito pelo casal no link, e é a prova disso — não se desfaz aqui.",
          },
          { status: 409 },
        );
      }
      const gravado = await updateContract(id, {
        status: "pendente",
        acceptedAt: "",
        acceptedName: "",
        registadoPor: "",
        registadoComo: "",
        // E o selo da versão da proposta que o registo copiou (auditoria 6,
        // n.º 18): um contrato por assinar não diz que versão foi aceite. Volta
        // a ser copiado, da proposta de então, quando se registar outra vez.
        // Texto vazio e `null` pela mesma razão dos de cima — `undefined`
        // deixava o selo antigo na base.
        propostaVersaoSelo: "",
        propostaVersaoNumero: null as unknown as undefined,
      });
      if (!gravado) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
      return NextResponse.json(gravado);
    } catch (err) {
      const conflito = respostaDeConflito(err);
      if (conflito) return conflito;
      log.error("contratos PATCH (desfazer) falhou", err, { id });
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
  }
  const como = String(body?.como ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  if (!como) {
    return NextResponse.json(
      {
        error:
          "Diz como é que o aceite aconteceu — «assinado em papel», «por email a 12/05». " +
          "É o que dá valor ao registo: sem isso fica um estado sem prova por trás.",
      },
      { status: 400 },
    );
  }

  const quem = nomeDeQuemEnvia(request);

  try {
    const contrato = await getContract(id);
    if (!contrato) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    /**
     * Um contrato já aceite NÃO se volta a marcar. É a mesma regra do
     * `createContractIfAbsent`: o aceite é um facto que acontece uma vez, e
     * reescrevê-lo apagava a data e o nome do registo original — que é
     * precisamente a prova que isto existe para guardar.
     */
    if (contrato.status === "aceite") {
      return NextResponse.json(
        { error: "Este contrato já está marcado como aceite.", contrato },
        { status: 409 },
      );
    }

    /**
     * O selo do conteúdo, copiado da proposta AGORA. Melhor esforço: uma
     * leitura que falhe não pode travar o registo do aceite — o que se perde é
     * a comparação de versões, não o negócio.
     */
    let daProposta: { propostaVersaoSelo?: string; propostaVersaoNumero?: number } = {};
    try {
      const proposta = contrato.proposalId ? await getProposal(contrato.proposalId) : null;
      if (proposta && proposta.quoteId === contrato.quoteId) {
        daProposta = {
          ...(proposta.versaoSelo !== undefined ? { propostaVersaoSelo: proposta.versaoSelo } : {}),
          ...(proposta.versaoNumero !== undefined
            ? { propostaVersaoNumero: proposta.versaoNumero }
            : {}),
        };
      }
    } catch (e) {
      log.warn("contratos PATCH: não deu para copiar a versão da proposta", { id, erro: e });
    }

    const gravado = await updateContract(id, {
      status: "aceite",
      // A hora do REGISTO, e é isso que ela é. O momento em que o casal disse
      // que sim aconteceu noutro sítio e não é conhecido aqui — inventá-lo
      // seria a mesma mentira que o bloco do PDF evita.
      acceptedAt: new Date().toISOString(),
      registadoPor: quem || undefined,
      registadoComo: como,
      ...daProposta,
    });
    if (!gravado) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(gravado);
  } catch (err) {
    const conflito = respostaDeConflito(err);
    if (conflito) return conflito;
    const migracao = respostaDeMigracaoEmFalta(err, "Os contratos");
    if (migracao) return migracao;
    log.error("contratos PATCH falhou", err, { id });
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
