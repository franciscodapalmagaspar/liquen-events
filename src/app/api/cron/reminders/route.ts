import { createHash, timingSafeEqual } from "node:crypto";
import { jaRespondemos } from "@/lib/orcamento/mensagens";
import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/quotes-store";
import { listAllProposals } from "@/lib/proposals-store";
import { listCalendarEvents } from "@/lib/calendar-store";
import { sendPushToAll } from "@/lib/push";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import {
  gerarLoteDeDerivadas,
  retomaValida,
  type PosicaoDoLote,
  type Retoma,
} from "@/lib/derivadas";
import { getState, setState } from "@/lib/app-state";
import { getSupabase } from "@/lib/supabase";
import { comPrazo, TempoEsgotado } from "@/lib/prazo";
import { eur0 as eur } from "@/lib/money";
import { FUSO_DO_ESTUDIO } from "@/lib/fuso";
import { comCpu } from "@/lib/medir-cpu";
import { aVencerAte, cobrancaDoPedido, entraNasCobrancas } from "@/lib/orcamento/cobrancas";
import { propostaParaCobrar } from "@/lib/orcamento/proposta-que-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 300 e não 60 (auditoria de robustez de 13/11): a apanha das derivadas
// passou dos 60 s em 6 dos 7 dias e a função era morta a meio. O ORÇAMENTO de
// trabalho continua o de sempre (50 s, `ORCAMENTO_MS`, com um prazo por
// passo desde 17/11) — o tecto maior é só a
// folga para não ser cortada; o plano Pro permite-o, e o tempo à espera da
// rede não conta como processador.
export const maxDuration = 300;

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
/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ORÇAMENTO DE TEMPO, PASSO A PASSO (registos de 10–17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Task timed out after 60 seconds», três vezes. O `maxDuration` subiu para
 * 300 (13/11), mas um tecto maior só adia o problema: nenhum passo tinha prazo
 * próprio, e um que ficasse pendurado (uma leitura ao Supabase, um serviço de
 * push que não responde, a travessia das derivadas) levava a função inteira
 * até ser morta — sem resumo e sem linha no registo a dizer porquê.
 *
 * Agora cada passo tem o seu prazo e a função responde SEMPRE antes dos 50 s
 * (os 60 de antes, com folga), seja qual for o `maxDuration`:
 *
 *  - as três leituras do resumo, 15 s (em paralelo): uma que não chegue conta
 *    como leitura falhada — o resumo sai com o resto, marcado incompleto;
 *  - o envio do push, 10 s;
 *  - as derivadas, o que sobrar até aos 50 s. O que não couber fica para a
 *    noite seguinte: a retoma guarda-se no `app_state` e a próxima volta
 *    começa aí, em vez de reler a biblioteca do princípio todos os dias.
 */
const ORCAMENTO_MS = 50_000;
const PRAZO_LEITURA_MS = 15_000;
const PRAZO_PUSH_MS = 10_000;
/** Um bloco de fotografias já começado acaba (ver `gerarLoteDeDerivadas`): é
 *  esta a folga entre o tecto do lote e o prazo duro do passo. */
const FOLGA_DO_BLOCO_MS = 10_000;
/** Menos do que isto não chega para um bloco com folga. */
const MINIMO_DERIVADAS_MS = 15_000;
const CHAVE_RETOMA = "cron-reminders:retoma-das-derivadas";
/** Quanto se espera pelo lote depois de lhe dar o sinal para parar. */
const FOLGA_DEPOIS_DO_SINAL_MS = 5_000;

/** A noite anterior já tinha pendurado NESTA pasta? Uma regra só, para os dois casos. */
function jaPenduradaAqui(anterior: Retoma | null, atual: Retoma): boolean {
  return (
    anterior?.pendurada === true &&
    anterior.papel === atual.papel &&
    anterior.origem === atual.origem &&
    anterior.pasta === atual.pasta
  );
}

/**
 * Onde recomeçar quando o lote nem ao sinal respondeu. A primeira vez numa
 * pasta, tenta-se outra vez (`pendurada`); se a noite anterior já tinha
 * pendurado NESSA pasta, salta-se (`saltar`) — senão ficava ali para sempre.
 */
function retomaDaPastaPendurada(anterior: Retoma | null, atual: Retoma | null): Retoma | null {
  if (!atual) return anterior;
  // Pendurou ainda a caminho de uma pasta a saltar (ou de uma família a
  // saltar): as marcas ficam, senão a pasta voltava a ser tentada (2.ª
  // revisão de 17/11).
  if (atual.saltar || atual.saltarFamilia) return atual;
  const base: Retoma = {
    papel: atual.papel,
    origem: atual.origem,
    pasta: atual.pasta,
    caminho: atual.caminho,
  };
  return jaPenduradaAqui(anterior, atual)
    ? { ...base, caminho: "", saltar: true }
    : { ...base, pendurada: true };
}

/**
 * O lote não respondeu nem depois do sinal. Três casos (2.ª revisão de 17/11):
 *
 *  - pendurou na LISTAGEM das pastas de uma família: regista-se, e a noite
 *    seguinte salta a família inteira (`saltarFamilia`);
 *  - continuou a dar passos depois do sinal (um bloco lento, mas a andar):
 *    não está pendurado — recomeça onde ia, sem marca NOVA. Mas a `pendurada`
 *    da noite anterior na MESMA pasta fica: uma fotografia presa num bloco de
 *    irmãs que acabam não pode apagar a marca noite após noite (revisão
 *    independente de 17/11);
 *  - não deu passo nenhum desde o sinal: a pasta é marcada `pendurada` (ou,
 *    à segunda, `saltar`) — ver `retomaDaPastaPendurada`.
 */
function ondeRecomecarSemResposta(
  anterior: Retoma | null,
  posicao: PosicaoDoLote,
  passosNoSinal: number,
): { retoma: Retoma | null; mensagem: string; familia?: string } {
  if (posicao.listando) {
    const { papel, origem } = posicao.listando;
    return {
      retoma: { papel, origem, pasta: "", caminho: "", saltarFamilia: true },
      mensagem:
        "cron reminders: a listagem das pastas pendurou — a noite seguinte salta esta família",
      familia: `${papel}/${origem}`,
    };
  }
  const atual = posicao.atual;
  if ((posicao.passos ?? 0) > passosNoSinal && atual && !atual.saltar && !atual.saltarFamilia) {
    const jaPendurada = jaPenduradaAqui(anterior, atual);
    return {
      retoma: {
        papel: atual.papel,
        origem: atual.origem,
        pasta: atual.pasta,
        caminho: atual.caminho,
        ...(jaPendurada ? { pendurada: true } : {}),
      },
      mensagem:
        "cron reminders: as derivadas estavam lentas, mas a andar — a noite seguinte continua",
    };
  }
  return {
    retoma: retomaDaPastaPendurada(anterior, atual),
    mensagem: "cron reminders: as derivadas penduraram numa pasta",
  };
}

/** Onde a apanha da noite anterior parou. Sem Supabase não há onde guardar. */
async function retomaDaNoiteAnterior(): Promise<Retoma | null> {
  if (!getSupabase()) return null;
  const r = await getState<Retoma>(CHAVE_RETOMA).catch(() => null);
  // A mesma regra do lote (`retomaValida`): uma retoma sem pasta só vale se for
  // a de saltar a família; as de antes, com `pasta: ""`, recomeçam do princípio.
  return retomaValida(r) ? r : null;
}

async function guardarRetoma(retoma: Retoma | null): Promise<void> {
  if (!getSupabase()) return;
  const r = await setState(CHAVE_RETOMA, retoma).catch(() => null);
  if (r && !r.duradouro) {
    log.warn(
      "cron reminders: a retoma das derivadas não ficou guardada — amanhã recomeça do princípio",
    );
  }
}

async function apanharDerivadasEmAtraso(desdeMs: number): Promise<void> {
  const restante = ORCAMENTO_MS - (Date.now() - desdeMs);
  // Pouco tempo não chega para um bloco com folga, e um lote que não acaba
  // nada é uma ida ao Storage para nada.
  if (restante < MINIMO_DERIVADAS_MS) return;
  try {
    const retoma = await comPrazo(retomaDaNoiteAnterior(), 3_000, "retoma das derivadas").catch(
      () => null,
    );
    // Sem papel: faz as ESSENCIAIS primeiro em toda a biblioteca e só depois o
    // AVIF — a ordem está explicada no `gerarLoteDeDerivadas`, e é a que faz
    // parar a meio deixar as coisas melhores do que estavam.
    const tectoMs = ORCAMENTO_MS - (Date.now() - desdeMs) - FOLGA_DO_BLOCO_MS;
    const prazo = ORCAMENTO_MS - (Date.now() - desdeMs) - FOLGA_DEPOIS_DO_SINAL_MS - 3_000;
    /**
     * ── O PRAZO PÁRA O LOTE, NÃO SÓ A ESPERA (revisão de 17/11) ────────────
     *
     * Sem sinal, o `comPrazo` deixava de esperar, mas o lote continuava em
     * fundo depois da resposta — e, sem resposta dele, não se guardava retoma
     * nenhuma: a noite seguinte voltava ao mesmo sítio. Esgotado o prazo, o
     * lote recebe o sinal, pára no próximo intervalo (entre pastas ou entre
     * blocos) e devolve onde parou; dá-se-lhe `FOLGA_DEPOIS_DO_SINAL_MS`.
     *
     * Se nem assim responder — uma ida ao Storage que nunca volta —, guarda-se
     * a pasta onde ele ia (`posicao`): a noite seguinte tenta-a outra vez, e se
     * pendurar no MESMO sítio salta-a e segue.
     */
    const parar = new AbortController();
    const posicao: PosicaoDoLote = { atual: retoma, passos: 0, listando: null };
    const lote = gerarLoteDeDerivadas(undefined, { tectoMs, retoma, sinal: parar.signal, posicao });
    /** Quantos passos o lote tinha dado quando recebeu o sinal. */
    let passosNoSinal = 0;
    // Só o tempo esgotado espera pela folga: uma avaria do lote segue para o
    // `catch` de baixo, como sempre — não é uma pasta pendurada.
    const r = await comPrazo(lote, prazo, "derivadas em atraso", parar).catch((err) => {
      if (!(err instanceof TempoEsgotado)) throw err;
      passosNoSinal = posicao.passos ?? 0;
      return comPrazo(lote, FOLGA_DEPOIS_DO_SINAL_MS, "derivadas depois do sinal").catch((e) => {
        if (!(e instanceof TempoEsgotado)) throw e;
        return null;
      });
    });
    if (!r) {
      const onde = ondeRecomecarSemResposta(retoma, posicao, passosNoSinal);
      await comPrazo(guardarRetoma(onde.retoma), 3_000, "guardar a retoma").catch(() => undefined);
      log.warn(onde.mensagem, {
        pasta: onde.retoma ? `${onde.retoma.origem}/${onde.retoma.pasta}` : null,
        aSaltar: onde.retoma?.saltar === true,
        ...(onde.familia ? { familia: onde.familia } : {}),
      });
      return;
    }
    await comPrazo(guardarRetoma(r.retoma), 3_000, "guardar a retoma").catch(() => undefined);
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
    /**
     * ── UMA LEITURA QUE FALHA NÃO É «NADA A NOTIFICAR» (auditoria de 13/11) ──
     *
     * Cada leitura caía para `[]` em silêncio: com a base de dados em baixo, o
     * resumo respondia «nada a notificar» — a mesma frase de um dia sossegado —
     * e ninguém sabia que o resumo dessa manhã não tinha sido feito. Continua a
     * fazer-se com o que se conseguiu ler, mas a falha fica registada e a
     * resposta diz o que faltou, com um estado que a Vercel mostra como falha.
     */
    const faltou: string[] = [];
    const ler = <T>(nome: string, leitura: Promise<T[]>): Promise<T[]> =>
      comPrazo(leitura, PRAZO_LEITURA_MS, `leitura de ${nome}`).catch((err) => {
        log.error("cron reminders: uma leitura falhou — o resumo de hoje está incompleto", err, {
          conjunto: nome,
        });
        faltou.push(nome);
        return [] as T[];
      });
    const [allQuotes, calEvents, allProposals] = await Promise.all([
      ler("pedidos", listQuotes()),
      ler("calendario", listCalendarEvents()),
      ler("propostas", listAllProposals()),
    ]);
    const incompleto = faltou.length > 0 ? { incompleto: [...faltou].sort() } : {};
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
    //
    // Um pedido só é um EVENTO quando foi ganho (`status === "aceite"`) —
    // auditoria de 14/11: contavam-se aqui pedidos «pendente» e «rejeitado»
    // com data nos próximos dias, e a manhã dela abria com eventos que não
    // existem. É a regra das Cobranças (`entraNasCobrancas`) e do dossiê
    // (`contratoAceite`). Os arquivados já saíram em `quotes`.
    const upcomingEvents = [
      ...quotes
        .filter((q) => q.status === "aceite" && q.date && q.date >= todayKey && q.date <= in3)
        .map((q) => ({ date: q.date, label: q.name })),
      ...calEvents
        .filter((e) => e.date >= todayKey && e.date <= in3)
        .map((e) => ({ date: e.date, label: e.title })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    // 2. Pagamentos a vencer (ou em atraso) nos próximos 7 dias — pela conta do
    //    quadro das Cobranças, e não pelas linhas soltas (auditoria de 13/11,
    //    n.º 4): só clientes aceites, o que FALTA de cada pagamento, e uma linha
    //    prevista esquecida ao lado da paga já não conta para sempre.
    let dueCount = 0;
    let dueSum = 0;
    const propostasParaCobrar = allProposals.map(propostaParaCobrar);
    for (const q of quotes.filter(entraNasCobrancas)) {
      for (const p of aVencerAte(cobrancaDoPedido(q, propostasParaCobrar, todayKey), in7)) {
        dueCount++;
        dueSum += p.valor;
      }
    }

    // 3. Quotes awaiting a first reply for 24h+. Internal follow-up target: the
    //    safety-net digest flags a lead once a day has passed without a reply so
    //    nothing slips — this is a team cadence, not a promise made to clients.
    const oneDayAgo = Date.now() - 864e5;
    const awaiting = quotes.filter(
      (q) =>
        (q.status === "pendente" || q.status === "em_revisao" || q.status === "a_preparar") &&
        // Uma mensagem que não saiu não é resposta (achado n.º 8, a mesma
        // regra dos lembretes do ecrã).
        !jaRespondemos(q) &&
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
      if (faltou.length > 0) {
        return NextResponse.json(
          { sent: 0, reason: "não foi possível ler tudo", ...incompleto },
          { status: 502 },
        );
      }
      return NextResponse.json({ sent: 0, reason: "nada a notificar" });
    }

    // Um serviço de push que não responde não pode levar a função atrás: ao
    // fim do prazo conta como «não chegou» (`semLista`), e a resposta di-lo.
    const { sent, failed, semLista } = await comPrazo(
      sendPushToAll({
        title: "Resumo Líquen · hoje",
        body: lines.join(" · "),
        url: "/orcamento/admin",
        tag: "resumo-diario",
      }),
      PRAZO_PUSH_MS,
      "envio do push",
    ).catch((err: unknown) => {
      log.error("cron reminders: o envio do push passou do prazo", err);
      return { sent: 0, failed: 0, semLista: true };
    });

    // `falhados` sai na resposta porque HAVIA o que dizer e não chegou a
    // aparelho nenhum — sem isto, quem carrega no sino lê o mesmo `sent: 0` que
    // lê num dia sossegado, e fica descansado por engano. E quando nada chegou
    // por avaria (aparelhos que recusaram, lista de subscrições que não se
    // leu), ou o resumo saiu incompleto, o estado também o diz.
    const avaria = faltou.length > 0 || (sent === 0 && (failed > 0 || !!semLista));
    return NextResponse.json(
      {
        sent,
        falhados: failed,
        summary: lines,
        ...incompleto,
        ...(semLista ? { subscricoes: "não foi possível ler" } : {}),
      },
      avaria ? { status: 502 } : undefined,
    );
  } catch (err) {
    log.error("cron reminders falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

// Quanto processador gasta cada pedido (3/11) — ver `medir-cpu.ts`.
export const GET = comCpu("cron-reminders GET", GET_semMedida);
