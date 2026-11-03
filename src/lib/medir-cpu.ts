import "server-only";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO PROCESSADOR GASTOU ESTE PEDIDO (3/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 2/11 a conta da Vercel passou o limite de processador («Fluid Active
 * CPU») e o site foi desligado. Ela passou a Pro com um tecto de gasto e pediu
 * que nada gaste sem razão. A Vercel só mostra o processador POR ROTA com um
 * extra pago (Observability Plus); sem ele, cortava-se às cegas.
 *
 * Isto mede de graça: à volta das rotas pesadas do back office, das
 * propostas e das tarefas agendadas, lê o processador do próprio processo no
 * início e no fim (`process.cpuUsage`) e escreve UMA linha nos registos —
 * `cpu-da-rota`, com a rota, os milissegundos de processador e os de relógio.
 * Os registos da Vercel guardam um dia; agrupados por rota, dizem onde vai o
 * processador, com números e não com palpites.
 *
 * O número é uma APROXIMAÇÃO honesta: com o «Fluid compute» uma instância
 * pode atender dois pedidos ao mesmo tempo, e aí o processador de um entra na
 * conta do outro. No back office, com uma pessoa a trabalhar, isso é raro.
 *
 * Nunca muda a resposta, nunca lança, e não mede nada fora da produção.
 */
export function comCpu<A extends unknown[], R>(
  rota: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A) => {
    if (process.env.NODE_ENV !== "production") return fn(...args);
    const inicio = process.cpuUsage();
    const t0 = Date.now();
    try {
      return await fn(...args);
    } finally {
      try {
        const d = process.cpuUsage(inicio);
        log.info("cpu-da-rota", {
          rota,
          cpuMs: Math.round((d.user + d.system) / 1000),
          ms: Date.now() - t0,
        });
      } catch {
        /* medir nunca pode estragar o pedido */
      }
    }
  };
}
