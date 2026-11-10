import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { gerarLoteDeDerivadas } from "@/lib/derivadas";
import { eur0 as eur } from "@/lib/money";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";
import { comCpu } from "@/lib/medir-cpu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Smart daily digest. Meant to be hit by a scheduled cron (Vercel Cron or
 * any external scheduler) once a day. Scans everything and pushes a single
 * summary to the team's devices:
 *   · events happening in the next 3 days
 *   · payments due (or overdue) within 7 days
 *   · quotes still awaiting a first reply for 24h+
 *   · follow-ups due today or overdue
 *
 * Protected by CRON_SECRET: the caller must send it as a Bearer token (never a
 * query param — those leak into access logs). When CRON_SECRET is unset it
 * only runs freely outside production (local/preview convenience) — in
 * production a missing secret fails closed instead of leaving the endpoint
 * wide open (see lib/env.ts, which also warns loudly at startup about this).
 */
/**
 * O DIA É O DE LISBOA, e está escrito à mão de propósito.
 *
 * As datas com que este resumo compara — `q.date`, `followUpAt`, a data de um
 * pagamento — são dias do calendário escritos por quem trabalha em Portugal.
 * O servidor corre em UTC, e no Verão Lisboa está uma hora à frente: entre a
 * meia-noite e a uma da manhã o calendário daqui já virou e o de UTC não. Um
 * «hoje» em UTC dava, à 00h30, o dia de ONTEM — o seguimento marcado para hoje
 * não aparecia, a janela dos 3 dias fechava um dia mais cedo e o casamento que
 * já tinha acontecido continuava a ser anunciado como próximo.
 *
 * Nem local (`setHours`) nem UTC, portanto: o fuso do negócio, pelo nome, como
 * já se faz no `EntradaComFotografia` e nas conversões do Ads.
 */
const FUSO = FUSO_DO_ESTUDIO;
const DIA_EM_LISBOA = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function authorized(req: NextRequest): boolean {
  // A logged-in admin can always trigger it manually (e.g. to test).
  // A sessão de administração serve para ela disparar à mão — mas só num pedido
  // do próprio site (10/11). Os cookies vão também numa navegação vinda de
  // outro sítio (SameSite=Lax), e um link numa página qualquer punha o browser
  // dela a correr isto. O `Sec-Fetch-Site` é o browser a dizer de onde vem.
  if (isAuthed(req) && req.headers.get("sec-fetch-site") === "same-origin") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  // Constant-time Bearer check: hash both sides to fixed-length digests so
  // neither the length nor the content leaks through comparison timing.
  const provided = createHash("sha256")
    .update(req.headers.get("authorization") ?? "")
    .digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E, DE CAMINHO, AS DERIVADAS QUE FICARAM PARA TRÁS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «eu queria que isto gerasse de forma automática».
 *
 * As fotografias novas já nascem prontas — o navegador fabrica a miniatura, a
 * micro e a de 1200 px no mesmo desenho e sobem com o original. O que pode
 * ficar para trás são as que entraram por outro caminho, ou antes disso
 * existir. Sem uma varredura periódica, essas só se arranjam se alguém se
 * lembrar de carregar num botão — e um passo que depende de alguém se lembrar
 * é um passo que um dia não acontece.
 *
 * ── PORQUE É QUE ISTO VIVE AQUI E NÃO NUMA ROTINA PRÓPRIA ────────────────
 *
 * Porque uma rotina própria custava o site. O alojamento permite DUAS rotinas
 * agendadas, e as duas estão tomadas (este resumo e a cópia de segurança).
 * Uma terceira no `vercel.json` faz a PUBLICAÇÃO falhar — não é uma
 * degradação, é o site a não sair. Enquanto o plano for este, a boleia é a
 * forma certa: corre uma vez por dia, a seguir ao resumo, com o tempo que
 * sobrar da função.
 *
 * ── E NÃO PODE ESTRAGAR O RESUMO ─────────────────────────────────────────
 *
 * O resumo é a razão de esta rotina existir e é ele que a hora serve. Por
 * isso: corre DEPOIS, com o que sobra do tecto, e o que aqui acontecer nunca
 * muda a resposta nem a impede de sair. Uma avaria aqui é uma linha no
 * registo, não um dia sem notificação.
 */
async function apanharDerivadasEmAtraso(desdeMs: number): Promise<void> {
  // O tecto da função é 60 s. Deixam-se 10 de folga para a resposta sair, e o
  // que sobrar do resumo é o que a apanha tem para trabalhar.
  const restante = 50_000 - (Date.now() - desdeMs);
  // Menos de cinco segundos não chega para uma fotografia com folga, e um lote
  // que não acaba nada é uma ida ao Storage para nada.
  if (restante < 5_000) return;
  try {
    // Sem papel: faz as ESSENCIAIS primeiro em toda a biblioteca e só depois o
    // AVIF — a ordem está explicada no `gerarLoteDeDerivadas`, e é a que faz
    // parar a meio deixar as coisas melhores do que estavam.
    const r = await gerarLoteDeDerivadas(undefined, { tectoMs: restante });
    if (r.fotografiasFeitas > 0 || r.falhas.length > 0) {
      log.info("cron reminders: derivadas apanhadas de caminho", {
        fotografias: r.fotografiasFeitas,
        derivadas: r.geradas,
        falhas: r.falhas.length,
        // `true` quer dizer que ficou trabalho para amanhã — e é normal na
        // primeira vez, com a biblioteca inteira por fazer.
        sobrou: r.retoma !== null,
      });
    }
  } catch (err) {
    log.warn("cron reminders: a apanha das derivadas falhou", { erro: String(err) });
  }
}

async function GET_semMedida(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const comecou = Date.now();
  // A resposta do resumo sai INTEIRA e sem alterações — a apanha corre depois
  // e não lhe toca. Ver `apanharDerivadasEmAtraso`.
  const resposta = await oResumoDeHoje(request);
  await apanharDerivadasEmAtraso(comecou);
  return resposta;
}

async function oResumoDeHoje(request: NextRequest) {
  void request;
  try {
    const [allQuotes, calEvents, allProposals] = await Promise.all([
      listQuotes().catch(() => []),
      listCalendarEvents().catch(() => []),
      listAllProposals().catch(() => []),
    ]);
    // Archived quotes are soft-deleted — never worth a notification.
    const quotes = allQuotes.filter((q) => !q.archived);

    // O dia de hoje em Lisboa (ver a nota do `DIA_EM_LISBOA`), e a partir dele
    // a aritmética da janela. Os dias somam-se ao MEIO-DIA em UTC: é o único
    // sítio da hora onde nem uma mudança de hora nem um fuso conseguem empurrar
    // a data para o dia ao lado.
    const todayKey = DIA_EM_LISBOA.format(new Date());
    const plus = (days: number) => {
      const d = new Date(`${todayKey}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + days);
      return d.toISOString().slice(0, 10);
    };
    const in3 = plus(3);
    const in7 = plus(7);

    // 1. Events in the next 3 days (quotes + calendar entries)
    const upcomingEvents = [
      ...quotes
        .filter((q) => q.date && q.date >= todayKey && q.date <= in3)
        .map((q) => ({ date: q.date, label: q.name })),
      ...calEvents
        .filter((e) => e.date >= todayKey && e.date <= in3)
        .map((e) => ({ date: e.date, label: e.title })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // 2. Payments due (or overdue) within 7 days
    let dueCount = 0;
    let dueSum = 0;
    for (const q of quotes) {
      for (const p of q.payments ?? []) {
        if (!p.paid && p.date && p.date <= in7) {
          dueCount++;
          dueSum += p.amount;
        }
      }
    }

    // 3. Quotes awaiting a first reply for 24h+. Internal follow-up target: the
    //    safety-net digest flags a lead once a day has passed without a reply so
    //    nothing slips — this is a team cadence, not a promise made to clients.
    const oneDayAgo = Date.now() - 864e5;
    const awaiting = quotes.filter(
      (q) =>
        (q.status === "pendente" || q.status === "em_revisao" || q.status === "a_preparar") &&
        !(q.messages && q.messages.length > 0) &&
        new Date(q.submittedAt).getTime() < oneDayAgo,
    ).length;

    /**
     * ════════════════════════════════════════════════════════════════════════
     * 4. SEGUIMENTOS — E HÁ DOIS CAMPOS COM O MESMO NOME
     * ════════════════════════════════════════════════════════════════════════
     *
     * `followUpAt` existe em DOIS sítios: no pedido (`Quote`, types.ts:273) e na
     * proposta (`Proposal`, types.ts:383). Este resumo lia só o do pedido.
     *
     * Só que o botão «Marcar seguimento» que ela usa todos os dias está no
     * painel de Acompanhamento, e esse grava na PROPOSTA. Resultado: ela marcava
     * o seguimento na terça-feira, confiava, e o resumo da manhã seguinte não
     * dizia nada — o telefone nunca tocava. A falha mais silenciosa do percurso,
     * porque não dá erro nenhum: dá esquecimento.
     *
     * Aqui contam-se os dois, deduplicados POR PEDIDO — um seguimento marcado na
     * proposta e outro no pedido do mesmo casal são a mesma chamada a fazer, e
     * contá-los duas vezes só serviria para ela desconfiar do número.
     *
     * As propostas já respondidas não contam: uma proposta aceite ou recusada
     * não tem seguimento nenhum a fazer, tal como já acontecia do lado do pedido.
     */
    const pedidosVivos = new Map(
      quotes
        .filter((q) => q.status !== "aceite" && q.status !== "rejeitado")
        .map((q) => [q.id, q] as const),
    );
    const comSeguimento = new Set<string>();
    for (const q of pedidosVivos.values()) {
      if (q.followUpAt && q.followUpAt <= todayKey) comSeguimento.add(q.id);
    }
    for (const p of allProposals) {
      if (!p.followUpAt || p.followUpAt > todayKey) continue;
      if (p.status === "aceite" || p.status === "rejeitada") continue;
      // Sem pedido vivo por trás, não há a quem telefonar.
      if (p.quoteId && pedidosVivos.has(p.quoteId)) comSeguimento.add(p.quoteId);
    }
    const followUpsDue = comSeguimento.size;

    const lines: string[] = [];
    if (upcomingEvents.length > 0) {
      lines.push(
        `${upcomingEvents.length} evento${upcomingEvents.length !== 1 ? "s" : ""} nos próximos 3 dias`,
      );
    }
    if (dueCount > 0) {
      lines.push(`${eur(dueSum)} a receber (${dueCount} pagamento${dueCount !== 1 ? "s" : ""})`);
    }
    if (awaiting > 0) {
      lines.push(`${awaiting} pedido${awaiting !== 1 ? "s" : ""} por responder`);
    }
    if (followUpsDue > 0) {
      lines.push(`${followUpsDue} seguimento${followUpsDue !== 1 ? "s" : ""} para hoje`);
    }

    if (lines.length === 0) {
      return NextResponse.json({ sent: 0, reason: "nada a notificar" });
    }

    const { sent, failed } = await sendPushToAll({
      title: "Resumo Líquen · hoje",
      body: lines.join(" · "),
      url: "/orcamento/admin",
      tag: "resumo-diario",
    });

    // `falhados` sai na resposta porque HAVIA o que dizer e não chegou a
    // aparelho nenhum — sem isto, quem carrega no sino lê o mesmo `sent: 0` que
    // lê num dia sossegado, e fica descansado por engano.
    return NextResponse.json({ sent, falhados: failed, summary: lines });
  } catch (err) {
    log.error("cron reminders falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("cron-reminders GET", GET_semMedida);
