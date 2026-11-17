import type { Quote, Proposal } from "@/lib/orcamento/types";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { desserializar } from "./click-id";
import { eventoDeFecho, type EventoParaEnviar } from "./capi";
import { novoEventId } from "./eventos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEVOLVER À META O VALOR REAL DO CASAMENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O equivalente do que `src/lib/ads/conversoes-offline.ts` faz para a Google,
 * e pela mesmíssima razão: sem isto a Meta só sabe que alguém preencheu um
 * formulário e optimiza para MAIS FORMULÁRIOS — ou seja, para os formulários
 * mais fáceis de obter, que são os piores. A conta enche-se de pedidos de
 * casamentos de 3 000 € e o conjunto de anúncios que trazia os de 25 000 € é
 * cortado por "converter menos".
 *
 * ── PORQUE É QUE ISTO NÃO É UM CSV, AO CONTRÁRIO DA GOOGLE ─────────────────
 * Porque o caminho do CSV DEIXOU DE EXISTIR. A Meta descontinuou a Offline
 * Conversions API — os "Offline Event Sets" e o carregamento manual de
 * ficheiros — e passou tudo para a Conversions API normal, contra um
 * *dataset*. Não há ficheiro nenhum para carregar à mão.
 *
 * Isso muda o desenho de uma forma que importa: **o envio tem de acontecer
 * perto do fecho**, e não uma vez por mês. A janela de aceitação de
 * `event_time` da Meta é curta (a documentação de terceiros converge em sete
 * dias para eventos normais), e um `Purchase` mais velho do que isso é
 * recusado — em silêncio, que é o pior modo de falhar. Por isso a rota que
 * usa este módulo é feita para correr com frequência e só envia o que fechou
 * recentemente.
 *
 * ⚠ ESTA AFIRMAÇÃO SOBRE OS SETE DIAS vem de fontes secundárias: a
 * documentação da Meta recusa pedidos automáticos a partir deste ambiente
 * (HTTP 403), portanto não a pude ler directamente. É por isso que
 * `DIAS_ACEITES` é uma constante com nome e não um número escondido no meio
 * do código: quando alguém confirmar o valor na documentação oficial, muda-se
 * num sítio só.
 *
 * ── QUE VALOR SE ENVIA ─────────────────────────────────────────────────────
 * O valor SEM IVA (`contractedAmounts().net`), pelas duas razões que já estão
 * escritas do lado da Google: o IVA não é receita, e enviá-lo inflacionaria o
 * retorno em 23% — o que levaria a Meta a licitar mais alto do que o negócio
 * aguenta.
 *
 * ── O QUE CONTA COMO "FECHADO" ─────────────────────────────────────────────
 * O pedido com estado `aceite`. É o estado que gera contrato e fatura de
 * sinal, ou seja a primeira vez que existe dinheiro comprometido.
 */

/**
 * Quantos dias depois do fecho é que a Meta ainda aceita o evento.
 * Ver a advertência no cabeçalho sobre a origem deste número.
 */
export const DIAS_ACEITES = 7;

/** Porque é que um casamento fechado NÃO gerou evento. */
export type MotivoExclusao =
  | "sem-identificador"
  | "identificador-ilegivel"
  | "fora-da-janela"
  | "sem-valor"
  | "ja-enviado";

export interface Excluido {
  ref: string;
  motivo: MotivoExclusao;
  detalhe?: string;
}

export interface Resultado {
  eventos: EventoParaEnviar[];
  excluidos: Excluido[];
  /** Quantos pedidos fechados foram examinados. */
  examinados: number;
}

/**
 * Um `event_id` ESTÁVEL para o fecho de um pedido.
 *
 * Deriva do identificador do pedido, e não é aleatório. É o que impede que
 * uma segunda corrida da rota — que vai acontecer, porque ela corre com
 * frequência — envie o mesmo casamento outra vez como conversão nova. A Meta
 * deduplica por `event_name` + `event_id`, portanto um identificador estável
 * faz o segundo envio ser reconhecido como o mesmo acontecimento em vez de
 * duplicar a receita.
 *
 * ⚠ A deduplicação da Meta cobre 48 horas. Além disso, o mesmo `event_id`
 * pode voltar a contar. É por isso que a rota também guarda o que já enviou,
 * em vez de confiar só nisto — cinto e suspensórios, porque o erro aqui
 * inflaciona directamente o número de que dependem as decisões de orçamento.
 */
export function idDoFecho(ref: string): string {
  const limpo = ref.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return limpo.length >= 8 ? `fecho-${limpo}` : `fecho-${limpo}-${novoEventId().slice(0, 8)}`;
}

/**
 * Constrói os eventos de fecho.
 *
 * `jaEnviados` é o conjunto de referências que já foram enviadas antes.
 * Devolve TAMBÉM os excluídos e a razão, pela mesma razão que o exportador da
 * Google o faz: um resultado que devolve três eventos quando havia dez
 * negócios fechados, sem dizer nada, levaria alguém a concluir que a
 * publicidade só trouxe três.
 */
export function construirFechos(
  quotes: Quote[],
  propostaDe: (quoteId: string) => Proposal | null | undefined,
  aceiteEmDe: (quoteId: string) => string | undefined,
  jaEnviados: ReadonlySet<string> = new Set(),
  agora: number = Date.now(),
): Resultado {
  const fechados = quotes.filter((q) => q.status === "aceite" && !q.archived);
  const eventos: EventoParaEnviar[] = [];
  const excluidos: Excluido[] = [];

  for (const q of fechados) {
    const ref = q.id;
    if (jaEnviados.has(ref)) {
      excluidos.push({ ref, motivo: "ja-enviado" });
      continue;
    }

    // O clique da Meta só vale com consentimento, e a prova que fica no
    // pedido é o `leadEventId`: o formulário só o manda depois de «Aceitar»
    // (`PedidoRelampago.tsx`), e desde 17/11 a rota nem grava o clique sem
    // ele. Os pedidos gravados ANTES disso podem ter o clique sem o
    // consentimento — esses não seguem para a Meta (auditoria legal, 17/11).
    const cru = (q.leadEventId ?? "").trim() ? (q.metaClick ?? "").trim() : "";
    if (!cru) {
      // O caso NORMAL: a maior parte dos casamentos não vem de um anúncio da
      // Meta. Passa-a-palavra, orgânico, Google, feiras.
      excluidos.push({ ref, motivo: "sem-identificador" });
      continue;
    }
    const { fbp, fbc } = desserializar(cru);
    if (!fbp && !fbc) {
      excluidos.push({ ref, motivo: "identificador-ilegivel", detalhe: cru.slice(0, 40) });
      continue;
    }

    const quandoIso = aceiteEmDe(q.id) ?? q.lastUpdated ?? q.submittedAt;
    const fecho = Date.parse(quandoIso);
    if (!Number.isFinite(fecho)) {
      excluidos.push({ ref, motivo: "fora-da-janela", detalhe: "data de fecho ilegível" });
      continue;
    }
    const dias = Math.floor((agora - fecho) / 86_400_000);
    if (dias > DIAS_ACEITES) {
      excluidos.push({
        ref,
        motivo: "fora-da-janela",
        detalhe: `fechou há ${dias} dias; a Meta aceita ${DIAS_ACEITES}`,
      });
      continue;
    }

    const { net } = contractedAmounts(q, propostaDe(q.id));
    if (!(net > 0)) {
      excluidos.push({
        ref,
        motivo: "sem-valor",
        detalhe: "sem preço final nem proposta — grava o valor no pedido",
      });
      continue;
    }

    eventos.push(
      eventoDeFecho({
        eventId: idDoFecho(ref),
        // Segundos UNIX. Nunca no futuro: um relógio adiantado numa máquina
        // qualquer faria a Meta recusar o evento inteiro.
        quando: Math.floor(Math.min(fecho, agora) / 1000),
        valorSemIva: net,
        pessoa: {
          email: q.email || undefined,
          telefone: q.phone || undefined,
          nome: q.name || undefined,
          fbp: fbp || undefined,
          fbc: fbc || undefined,
        },
        ref,
      }),
    );
  }

  return { eventos, excluidos, examinados: fechados.length };
}

/** Relatório legível do que ficou de fora, para acompanhar o envio. */
export function relatorio(r: Resultado, valorTotal: number): string {
  const porMotivo = new Map<MotivoExclusao, Excluido[]>();
  for (const e of r.excluidos) {
    const lista = porMotivo.get(e.motivo) ?? [];
    lista.push(e);
    porMotivo.set(e.motivo, lista);
  }
  const EXPLICACAO: Record<MotivoExclusao, string> = {
    "sem-identificador":
      "não vieram de um anúncio da Meta (é o caso normal — passa-a-palavra, orgânico, Google)",
    "identificador-ilegivel": "o identificador guardado não tem a forma esperada",
    "fora-da-janela": `fecharam há mais de ${DIAS_ACEITES} dias; a Meta recusa o evento`,
    "sem-valor": "não têm preço final nem proposta gravada — sem valor não há retorno",
    "ja-enviado": "já tinham sido enviados numa corrida anterior",
  };
  const linhas = [
    `Casamentos fechados examinados: ${r.examinados}`,
    `Eventos a enviar: ${r.eventos.length}`,
    `Valor total: ${valorTotal.toFixed(2)} € (sem IVA)`,
    "",
  ];
  for (const [motivo, lista] of porMotivo) {
    linhas.push(`${lista.length} × ${motivo}: ${EXPLICACAO[motivo]}`);
    // Os que são normais ficam só contados; os que precisam de acção vão
    // nomeados, senão o relatório fica ilegível de tanto ruído.
    if (motivo !== "sem-identificador" && motivo !== "ja-enviado") {
      for (const e of lista) linhas.push(`    ${e.ref}${e.detalhe ? ` — ${e.detalhe}` : ""}`);
    }
  }
  return linhas.join("\n") + "\n";
}
