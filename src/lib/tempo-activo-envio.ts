/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO O TEMPO ACTIVO SOBE PARA O SERVIDOR — DE CINCO EM CINCO MINUTOS (16/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã do estúdio conta de meio em meio minuto (é o passo a que o número em
 * minutos pode mudar). Até 16/11 cada passo era também um pedido ao servidor:
 * duas invocações por minuto, por separador aberto, o dia inteiro — para um
 * número que só se lê nos relatórios. Agora o ecrã continua a contar de 30 em
 * 30 s, e o envio é de 5 em 5 minutos, mais um envio no instante em que a
 * página fica escondida (`visibilitychange`) e outro ao fechar (`pagehide`),
 * os dois com o `sendBeacon` que sobrevive à página.
 *
 * ── O TOTAL NÃO MUDA, E A SECÇÃO TAMBÉM NÃO ──────────────────────────────
 * Cada passo de meio minuto ANOTA o que passou desde o anterior na secção onde
 * ela estava nesse passo — exactamente o que antes subia nesse passo. O envio
 * só junta: UM pedido com o tempo de cada secção (17/11 — eram vários ao mesmo
 * tempo, e o servidor perdia todos menos o último). Somado no servidor, dá
 * o mesmo total e a mesma divisão por secção que os envios de meio minuto
 * davam; só chega em menos pedidos.
 *
 * Puro de propósito, como `tempo-activo.ts`: não lê relógio nenhum (recebe
 * `agora`) e não sabe o que é um `fetch` (recebe `enviar`). É o que deixa
 * prová-lo com um relógio falso.
 */

/** O passo do ecrã: o número mostrado é em minutos. */
export const PASSO_DO_ECRA_MS = 30_000;
/** O passo do envio ao servidor. */
export const PASSO_DO_ENVIO_MS = 5 * 60_000;
/** Menos de um segundo não vale um pedido — fica para o envio seguinte. */
const MINIMO_POR_ENVIO_MS = 1000;

/**
 * Um lote: o tempo por secção (`""` é sem secção) e um id. Um lote devolvido
 * (envio falhado) volta a sair com o MESMO id, e o servidor ignora um id que
 * já somou — o mesmo tempo nunca conta duas vezes (17/11).
 */
export type Lote = { id: string; porSeccao: Record<string, number> };

/**
 * Envia os lotes num pedido só — o servidor soma-os numa escrita (17/11: um
 * pedido por secção ao mesmo tempo fazia o servidor perder todos menos o
 * último).
 */
export type Enviar = (lotes: Lote[], aFechar: boolean) => void;

/** Quantos lotes devolvidos se guardam para reenviar (o servidor aceita 30
 *  por pedido; mais do que isto é uma rede em baixo há duas horas). */
const MAX_DEVOLVIDOS = 24;

/** Um id para um lote: UUID quando o browser o sabe fazer. */
export function novoIdDeLote(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export type EnvioDoTempo = {
  /** Um passo do relógio do ecrã (de 30 em 30 s): anota e, se já passaram
   *  cinco minutos desde o último envio, envia. */
  passo: (total: number, seccao: string | null, agora: number) => void;
  /** A página escondeu-se ou vai fechar: anota e envia JÁ o que houver. */
  despejar: (total: number, seccao: string | null, agora: number) => void;
  /** Um envio falhou (rede, ou o servidor não guardou): os lotes voltam e
   *  vão no envio seguinte, com os MESMOS ids. */
  devolver: (lotes: Lote[]) => void;
};

export function criarEnvioDoTempo(
  enviar: Enviar,
  inicio: number,
  novoId: () => string = novoIdDeLote,
): EnvioDoTempo {
  /** O total até ao último passo anotado. */
  let anotado = 0;
  let ultimoEnvio = inicio;
  /** Tempo por enviar, por secção (`""` é sem secção). */
  const pendentes = new Map<string, number>();
  /** Lotes que falharam, à espera do envio seguinte, com o id de sempre. */
  let devolvidos: Lote[] = [];

  function anotar(total: number, seccao: string | null) {
    const delta = total - anotado;
    if (!(delta > 0)) return;
    anotado = total;
    const chave = seccao ?? "";
    pendentes.set(chave, (pendentes.get(chave) ?? 0) + delta);
  }

  function enviarPendentes(aFechar: boolean, agora: number) {
    ultimoEnvio = agora;
    const lote: Record<string, number> = {};
    for (const [seccao, ms] of [...pendentes]) {
      const inteiro = Math.round(ms);
      // A parte que não chega a um segundo fica onde está, para o próximo.
      if (inteiro < MINIMO_POR_ENVIO_MS) continue;
      const resto = ms - inteiro;
      if (resto !== 0) pendentes.set(seccao, resto);
      else pendentes.delete(seccao);
      lote[seccao] = inteiro;
    }
    const lotes = [...devolvidos];
    if (Object.keys(lote).length > 0) lotes.push({ id: novoId(), porSeccao: lote });
    devolvidos = [];
    if (lotes.length > 0) enviar(lotes, aFechar);
  }

  return {
    passo(total, seccao, agora) {
      anotar(total, seccao);
      if (agora - ultimoEnvio >= PASSO_DO_ENVIO_MS) enviarPendentes(false, agora);
    },
    despejar(total, seccao, agora) {
      anotar(total, seccao);
      enviarPendentes(true, agora);
    },
    devolver(lotes) {
      for (const lote of lotes) {
        if (!devolvidos.some((d) => d.id === lote.id)) devolvidos.push(lote);
      }
      devolvidos = devolvidos.slice(-MAX_DEVOLVIDOS);
    },
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ENVIO QUE FALHA NÃO PERDE OS CINCO MINUTOS (17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quando o envio era de 30 em 30 s, perder um pedido era perder 30 s. De
 * cinco em cinco minutos, era perder cinco. Esta função diz se o pedaço
 * chegou e ficou guardado; se não (rede em baixo, resposta de erro, ou o
 * servidor a responder `guardado: false`), quem chama devolve-o aos
 * pendentes (`devolver`) e ele vai no envio seguinte.
 *
 * O beacon (ao esconder e ao fechar) não diz se ficou guardado — só se o
 * browser o aceitou para enviar. Aceite conta como entregue; recusado cai
 * para o `fetch`, que diz.
 */
export async function entregarTempo(
  url: string,
  lotes: Lote[],
  aFechar: boolean,
  meios: {
    fetch: typeof fetch;
    sendBeacon?: (url: string, dados: Blob) => boolean;
  },
): Promise<boolean> {
  // UM pedido com todos os lotes: o servidor soma-os numa só escrita.
  const corpo = JSON.stringify({ lotes });
  if (aFechar && meios.sendBeacon) {
    try {
      if (meios.sendBeacon(url, new Blob([corpo], { type: "application/json" }))) return true;
    } catch {
      /* sem beacon — tenta pelo caminho normal, que ainda pode chegar */
    }
  }
  try {
    const res = await meios.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      keepalive: aFechar,
    });
    if (!res.ok) return false;
    const dados = (await res.json().catch(() => null)) as { guardado?: unknown } | null;
    return dados?.guardado !== false;
  } catch {
    return false;
  }
}
