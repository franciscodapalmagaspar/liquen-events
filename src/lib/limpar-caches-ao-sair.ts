/**
 * ════════════════════════════════════════════════════════════════════════════
 * «SAIR» LEVA CONSIGO O QUE O SERVICE WORKER GUARDOU DO BACK OFFICE
 * (auditoria de 16/11, n.º 6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `public/sw.js` guarda duas coisas do back office: o invólucro da vista de
 * carregamento (para abrir numa quinta sem rede) e as fotografias da biblioteca
 * de temas. Ficavam no aparelho depois de «Sair», à vista de quem pegasse nele
 * a seguir, já sem sessão.
 *
 * Ao sair, a página faz DUAS coisas, e de propósito:
 *  · pede ao service worker que limpe (`limpar-back-office`) — é ele que é dono
 *    das caches e sabe os nomes da versão em curso;
 *  · e limpa ela própria, directamente, porque a página pode não estar a ser
 *    controlada por service worker nenhum (primeira visita, recarregamento
 *    forçado) e uma mensagem não tem garantia de chegar antes da navegação.
 *
 * O que fica: o site público, que é de quem não tem sessão. O modo sem rede de
 * quem CONTINUA com sessão não é tocado — isto só corre em «Sair», e sair
 * termina a sessão neste browser inteiro.
 *
 * A regra de reconhecimento é a mesma do `sw.js` (`ehDoBackOffice`); o
 * `sw.js` é estático e não importa nada, por isso há um teste que prende as
 * duas ao mesmo resultado (`sw-sair.test.ts`).
 */

/** Gavetas que são SÓ do back office: apagam-se inteiras. */
const GAVETAS_DO_BACK_OFFICE = ["liquen-fotos-", "liquen-originais-"];

/** Um caminho do back office (o mesmo critério do `sw.js`). */
export function ehCaminhoDoBackOffice(pathname: string): boolean {
  return /^\/(?:en\/)?orcamento(?:\/|$)/.test(pathname);
}

interface CacheMinima {
  keys(): Promise<readonly Request[]>;
  delete(pedido: Request): Promise<boolean>;
}
interface CacheStorageMinima {
  keys(): Promise<string[]>;
  delete(nome: string): Promise<boolean>;
  open(nome: string): Promise<CacheMinima>;
}

export interface AmbienteDaLimpeza {
  caches?: CacheStorageMinima | null;
  controlador?: { postMessage(mensagem: unknown): void } | null;
  /** Quanto tempo, no máximo, a saída espera pela limpeza. */
  tectoMs?: number;
}

function ambienteDoBrowser(): AmbienteDaLimpeza {
  if (typeof window === "undefined") return {};
  return {
    caches: "caches" in window ? (window.caches as unknown as CacheStorageMinima) : null,
    controlador: navigator.serviceWorker?.controller ?? null,
  };
}

async function limparDirectamente(caches: CacheStorageMinima): Promise<void> {
  const nomes = await caches.keys();
  await Promise.all(
    nomes
      .filter((n) => n.startsWith("liquen-"))
      .map(async (nome) => {
        if (GAVETAS_DO_BACK_OFFICE.some((p) => nome.startsWith(p))) {
          await caches.delete(nome);
          return;
        }
        const cache = await caches.open(nome);
        const pedidos = await cache.keys();
        await Promise.all(
          pedidos
            .filter((r) => {
              try {
                return ehCaminhoDoBackOffice(new URL(r.url).pathname);
              } catch {
                return false;
              }
            })
            .map((r) => cache.delete(r)),
        );
      }),
  );
}

/**
 * Limpa o que o service worker guardou do back office. Nunca atira, e nunca
 * prende a saída mais do que `tectoMs` (1,5 s por omissão): sair é uma decisão
 * e tem de acontecer, mesmo com a Cache Storage lenta ou avariada.
 */
export async function limparCachesAoSair(ambiente?: AmbienteDaLimpeza): Promise<void> {
  const amb = ambiente ?? ambienteDoBrowser();
  try {
    amb.controlador?.postMessage({ tipo: "limpar-back-office" });
  } catch {
    /* sem service worker: a limpeza directa basta */
  }
  if (!amb.caches) return;
  const tecto = amb.tectoMs ?? 1_500;
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      limparDirectamente(amb.caches),
      new Promise<void>((r) => {
        relogio = setTimeout(r, tecto);
      }),
    ]);
  } catch {
    /* uma Cache Storage avariada não impede ninguém de sair */
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}
