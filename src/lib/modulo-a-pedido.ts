/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM MÓDULO QUE SÓ SE USA DEPOIS DE UM GESTO — FORA DO PACOTE INICIAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O irmão do `janelaAPedido` (`admin/janela-a-pedido.tsx`) para o código que
 * não desenha nada: as folhas de impressão do pedido e o calendário (.ics),
 * que o cabeçalho do painel oferece no «⋯» e que pesavam ~18 KB no primeiro
 * descarregamento do back office (medido a 17/11, `scripts/peso-das-rotas.mjs`).
 *
 *   • `aquecer()` vai buscá-lo e guarda-o. Idempotente; uma falha de rede não
 *     fica — a próxima chamada tenta outra vez.
 *   • `usar(f)` chama `f` com o módulo: já, se ele já cá está; quando chegar,
 *     se não. O que precisa do gesto vivo (abrir uma janela) faz-se ANTES de
 *     chamar o `usar`, no clique — ver `imprimir-a-pedido.ts`.
 *
 * Devolve se `f` chegou a correr: `false` é o código que não veio (sem rede, ou
 * um deploy que o apagou), e quem chamou diz-lho — com `AVISO_SEM_LIGACAO`.
 *
 * O `janelaAPedido` (as janelas que desenham) constrói-se sobre este.
 */
export interface ModuloAPedido<M> {
  aquecer: () => Promise<M | null>;
  usar: (f: (modulo: M) => void) => Promise<boolean>;
  /** O módulo, se já chegou; `null` enquanto não. */
  presente: () => M | null;
}

/** O que se diz quando o código pedido não chegou. */
export const AVISO_SEM_LIGACAO = "Sem ligação — tenta outra vez";

export function moduloAPedido<M>(carregar: () => Promise<M>): ModuloAPedido<M> {
  let chegou: M | null = null;
  let aCaminho: Promise<M | null> | null = null;

  const aquecer = (): Promise<M | null> => {
    if (chegou) return Promise.resolve(chegou);
    aCaminho ??= carregar().then(
      (modulo) => {
        chegou = modulo;
        aCaminho = null;
        return modulo;
      },
      () => {
        aCaminho = null;
        return null;
      },
    );
    return aCaminho;
  };

  const usar = (f: (modulo: M) => void): Promise<boolean> => {
    if (chegou) {
      f(chegou);
      return Promise.resolve(true);
    }
    return aquecer().then((modulo) => {
      if (!modulo) return false;
      f(modulo);
      return true;
    });
  };

  return { aquecer, usar, presente: () => chegou };
}
