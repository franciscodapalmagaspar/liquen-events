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
 * Envia um pedaço: o tempo por secção (`""` é sem secção). Um envio só, com
 * todas as secções — o servidor soma-as numa escrita (17/11: um pedido por
 * secção ao mesmo tempo fazia o servidor perder todos menos o último).
 */
export type Enviar = (porSeccao: Record<string, number>, aFechar: boolean) => void;

export type EnvioDoTempo = {
  /** Um passo do relógio do ecrã (de 30 em 30 s): anota e, se já passaram
   *  cinco minutos desde o último envio, envia. */
  passo: (total: number, seccao: string | null, agora: number) => void;
  /** A página escondeu-se ou vai fechar: anota e envia JÁ o que houver. */
  despejar: (total: number, seccao: string | null, agora: number) => void;
  /** Um envio falhou (rede, ou o servidor não guardou): o pedaço volta aos
   *  pendentes e vai no envio seguinte. */
  devolver: (porSeccao: Record<string, number>) => void;
};

export function criarEnvioDoTempo(enviar: Enviar, inicio: number): EnvioDoTempo {
  /** O total até ao último passo anotado. */
  let anotado = 0;
  let ultimoEnvio = inicio;
  /** Tempo por enviar, por secção (`""` é sem secção). */
  const pendentes = new Map<string, number>();

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
    if (Object.keys(lote).length > 0) enviar(lote, aFechar);
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
    devolver(porSeccao) {
      for (const [seccao, ms] of Object.entries(porSeccao)) {
        if (!(ms > 0)) continue;
        pendentes.set(seccao, (pendentes.get(seccao) ?? 0) + ms);
      }
    },
  };
}
