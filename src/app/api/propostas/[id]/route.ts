import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { updateProposal } from "@/lib/proposals-store";
import { enviarParaAReciclagem, quemApagou } from "@/lib/reciclagem";
import { respostaDeEscritaRecusada, respostaDeMigracaoEmFalta } from "@/lib/resposta-de-conflito";
import { updateQuoteWith } from "@/lib/quotes-store";
import { transicaoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import type { AcontecimentoDoPedido } from "@/lib/orcamento/estado-do-pedido";
import { eur } from "@/lib/money";
import { nascerContratoDoGanho } from "@/lib/contrato-do-ganho";
import { log } from "@/lib/logger";
import {
  ESTADOS_DA_PROPOSTA,
  MOTIVOS_DE_RECUSA,
  VERSOES_ESCOLHIDAS,
} from "@/lib/orcamento/listas-fechadas";
import { observar } from "@/lib/fronteira/observar";
import { ehUmDe } from "@/lib/todos-os-valores";
import { esquemaDoCorpoDaProposta } from "@/lib/fronteira/corpos-das-rotas";

export const runtime = "nodejs";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PEDIDO SEGUE A PROPOSTA — E SEGUE-A AQUI, QUE É POR ONDE TODOS PASSAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO, tal como uma auditoria a correr em produção o apanhou: sete
 * pedidos marcados «Proposta enviada» sem proposta nenhuma, e — ao contrário —
 * a Margarida Serra com duas propostas enviadas por email e o pedido dela ainda
 * na coluna «Novo». Duas verdades sobre o mesmo casamento, cada uma no seu
 * ecrã, e nenhuma das duas a saber da outra.
 *
 * O CENSO dos sítios que mudam o estado de uma proposta, e do que cada um
 * fazia ao pedido:
 *
 *   Estúdio → enviar por email          →  punha o pedido em «Proposta enviada»
 *   Propostas → marcar «Aceite»         →  punha, MAS num segundo pedido HTTP
 *                                          disparado pelo browser, e só ali
 *   Propostas → marcar «Enviada»        →  NÃO
 *   Propostas → marcar «Recusada»       →  não (decisão escrita, ver abaixo)
 *   Acompanhamento → mudar o estado     →  NÃO
 *   PATCH directo a esta rota           →  NÃO
 *
 * Três dos seis não mexiam no pedido, e o único que mexia fazia-o do lado
 * errado da rede: dois pedidos HTTP, e se o segundo não chega — num 4G fraco
 * numa quinta, que é onde este back office se usa — a proposta fica aceite e o
 * pedido fica para trás, sem ninguém dar por isso. O ecrã até dizia a frase
 * certa nesse caso; o que não dizia era que ficava por fazer.
 *
 * Passa a ser UMA escrita, no servidor, na única porta por onde os seis
 * caminhos passam. Não é regra nova: é a mesma máquina de
 * `@/lib/orcamento/estado-do-pedido` que a rota do envio já usa — a que nunca
 * desce a escada e a que deixa a linha no histórico a dizer o que a causou.
 *
 * ── E «RECUSADA» CONTINUA A NÃO MEXER NO PEDIDO ────────────────────────────
 *
 * De propósito, e não por esquecimento. É a regra 3 da máquina de estados:
 * `rejeitado` é uma decisão de uma pessoa. Uma proposta recusada pode ser
 * renegociada, e dar o pedido por perdido em nome dela tirava-o da lista onde
 * ela ainda ia atrás dele. O `Propostas.tsx` já tinha esta decisão escrita e
 * ela mantém-se palavra por palavra.
 */
const ACONTECIMENTO_DA_PROPOSTA: Partial<Record<string, AcontecimentoDoPedido>> = {
  // Enviada e em negociação afirmam a mesma coisa vista do pedido: a proposta
  // saiu. O tecto é o mesmo, e a escada trata de não recuar um pedido que já
  // esteja mais à frente.
  enviada: "proposta_enviada",
  em_negociacao: "proposta_enviada",
  aceite: "proposta_aceite",
};

/**
 * Move o pedido associado, se houver o que mover. Devolve o pedido gravado —
 * para quem chamou não ter de o ir buscar num segundo pedido — ou `undefined`
 * quando não havia transição nenhuma a fazer.
 *
 * ── PORQUE É QUE UMA FALHA AQUI NÃO FAZ FALHAR O PATCH ─────────────────────
 *
 * Porque a proposta JÁ ficou gravada. Devolver 500 a partir daqui fazia o ecrã
 * dizer que o gesto falhou sobre uma escrita que passou, e o gesto seguinte
 * dela é repeti-lo. Fica registado no log; o pedido resolve-se na visita
 * seguinte ao Quadro. É a mesma escolha — e pela mesma razão — que a rota do
 * envio faz depois de o email já ter saído.
 */
async function moverOPedido(
  proposta: { quoteId?: string; status?: string; total?: number },
  actor?: string,
) {
  const acontecimento = ACONTECIMENTO_DA_PROPOSTA[proposta.status ?? ""];
  if (!acontecimento || !proposta.quoteId) return undefined;
  try {
    let houve = false;
    // `updateQuoteWith` e não `updateQuote`: a regra tem de ser avaliada contra
    // o pedido tal como está GRAVADO agora, e a linha nova do histórico não
    // pode apagar a que outra ferramenta escreveu entretanto.
    const gravado = await updateQuoteWith(proposta.quoteId, (actual) => {
      const transicao = transicaoDoPedido({
        acontecimento,
        estadoActual: actual.status,
        detalhe: typeof proposta.total === "number" ? eur(proposta.total) : undefined,
        actor,
      });
      if (!transicao) return actual;
      houve = true;
      return {
        ...actual,
        status: transicao.status,
        activityLog: [...(actual.activityLog ?? []), transicao.entrada],
      };
    });
    return houve && gravado ? gravado : undefined;
  } catch (e) {
    log.error("propostas PATCH: a proposta gravou mas o pedido não acompanhou", e, {
      quoteId: proposta.quoteId,
    });
    return undefined;
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  try {
    // Malformed or non-object body → 400, not a 500. `null`/primitives would
    // otherwise blow up the `"status" in body` check with a TypeError.
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
    }
    if ("status" in body && !ehUmDe(ESTADOS_DA_PROPOSTA, body.status)) {
      return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
    }
    // Lista fechada e contável — a razão está em `MotivoDeRecusa`. Aceitar
    // texto livre aqui esvaziava a única pergunta que isto serve para
    // responder: perdemos por preço quantas vezes?
    if ("lostReason" in body && body.lostReason && !ehUmDe(MOTIVOS_DE_RECUSA, body.lostReason)) {
      return NextResponse.json({ error: "Motivo inválido" }, { status: 400 });
    }
    // O seguimento é uma data do calendário, não um carimbo de tempo. Uma
    // string qualquer aqui ia parar à base e voltava como `NaN` dias no painel.
    if ("followUpAt" in body && body.followUpAt && !/^\d{4}-\d{2}-\d{2}$/.test(body.followUpAt)) {
      return NextResponse.json({ error: "Data de seguimento inválida" }, { status: 400 });
    }
    // Lista fechada, como os motivos e pela mesma razão: o que isto serve
    // para responder é "os extras vendem-se?", e uma coluna que se conta com
    // texto livre lá dentro é uma coluna que nunca mais se conta.
    if (
      "versaoEscolhida" in body &&
      body.versaoEscolhida &&
      !ehUmDe(VERSOES_ESCOLHIDAS, body.versaoEscolhida)
    ) {
      return NextResponse.json({ error: "Versão inválida" }, { status: 400 });
    }
    // A resposta do cliente é um `timestamptz` na base (ver db/schema.sql): uma
    // string qualquer fazia a escrita rebentar lá dentro e sair daqui um 500 a
    // meio de um gesto trivial. Vazio é limpar, e isso continua a valer.
    if ("respondedAt" in body && body.respondedAt) {
      const t = typeof body.respondedAt === "string" ? Date.parse(body.respondedAt) : Number.NaN;
      if (!Number.isFinite(t)) {
        return NextResponse.json({ error: "Data de resposta inválida" }, { status: 400 });
      }
    }
    // As duas notas são texto livre — o único campo por onde entra texto sem
    // forma. Limitadas pela mesma razão que tudo o resto: o que fica gravado
    // acaba na cópia de segurança, que tem tecto.
    const MAX_NOTA = 2000;
    for (const k of ["followUpNote", "lostNote"] as const) {
      if (k in body && body[k] !== null && typeof body[k] !== "string") {
        return NextResponse.json({ error: "Nota inválida" }, { status: 400 });
      }
    }
    // A fronteira, em modo de observar (fase 6): diz o que não bate, não recusa.
    // Depois das guardas: o que a rota já recusou não vale o trabalho.
    observar(esquemaDoCorpoDaProposta, body, "o corpo do PATCH propostas/[id]", { id });
    const allowed = [
      "status",
      "respondedAt",
      "followUpAt",
      "followUpNote",
      "lostReason",
      "lostNote",
      "versaoEscolhida",
    ] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (!(k in body)) continue;
      patch[k] =
        (k === "followUpNote" || k === "lostNote") && typeof body[k] === "string"
          ? body[k].slice(0, MAX_NOTA)
          : body[k];
    }
    const updated = await updateProposal(id, patch);
    if (!updated) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    /**
     * ── PORQUE É QUE O NOME DELA VEM DO BROWSER ────────────────────────────
     *
     * Porque o servidor não sabe quem está sentado do outro lado: a sessão do
     * back office é uma só e não tem nome. E a linha do histórico que ESTA
     * transição escreve tinha o nome dela desde que alguém reparou que «só a
     * que fecha o negócio aparecia sem nome».
     *
     * Sem isto, aceitar uma proposta passava a dizer «Sistema» — que é a
     * palavra que este back office reserva para o que não foi ninguém, e não é
     * o caso: foi ela. Fica opcional, com tecto, e a fiar-se só do que já
     * passou pelo `isAuthed` acima. É menos confiança no browser do que havia
     * antes, não mais: até aqui era o browser a escrever a linha inteira.
     */
    const actor = typeof body.actor === "string" ? body.actor.trim().slice(0, 80) : undefined;
    const pedido = "status" in patch ? await moverOPedido(updated, actor || undefined) : undefined;
    /**
     * Aceite aqui é «Ganho» como no Quadro: nasce o contrato por assinar.
     *
     * Sem isto, o «Aceitar» das Propostas e o Acompanhamento punham o pedido em
     * «Ganho» sem contrato, e a proposta não aparecia nas Propostas Aceites —
     * «já houve mais propostas aceites e não estão aqui», nas palavras dela.
     * Melhor esforço, como o pedido acima: a proposta já está gravada.
     */
    if (patch.status === "aceite" && updated.quoteId) {
      try {
        await nascerContratoDoGanho(updated.quoteId, updated);
      } catch (e) {
        log.error("propostas PATCH: a proposta ficou aceite mas o contrato não nasceu", e, {
          id,
        });
      }
    }
    return NextResponse.json(pedido ? { ...updated, pedido } : updated);
  } catch (err) {
    // A proposta é o documento que seguiu para o casal e tem vários donos ao
    // mesmo tempo: o Estúdio a gravar, esta rota a mudar o estado, o portal do
    // cliente a registar o aceite. Quando as releituras não resolvem, quem
    // gravou tem de ver o que o servidor tem — não "Erro interno".
    const conflito = respostaDeEscritaRecusada(err);
    if (conflito) return conflito;
    const migracao = respostaDeMigracaoEmFalta(err, "As propostas");
    if (migracao) return migracao;
    log.error("propostas PATCH falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthed(request)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  try {
    const { id } = await params;
    // Fica 30 dias na Reciclagem (fase R3b de `docs/TUDO-REVERSIVEL.md`).
    const reciclagem = await enviarParaAReciclagem("proposta", id, quemApagou(request));
    return NextResponse.json({ ok: true, reciclagem });
  } catch (err) {
    log.error("propostas DELETE falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
