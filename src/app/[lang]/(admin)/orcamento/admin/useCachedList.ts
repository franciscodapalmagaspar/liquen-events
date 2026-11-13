"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { porqueNaoLeu, porqueNaoLeuDoErro, type LeituraFalhada } from "@/lib/porque-nao-leu";

/**
 * Stale-while-revalidate cache for the back-office list views.
 *
 * The admin dashboard mounts each API-backed view (Propostas, Tarefas,
 * …) only while it's active, so without a cache every tab switch re-fetches from
 * scratch and re-flashes a skeleton — the biggest "feels slow" drag in daily
 * use. This module-level cache survives unmounts, so:
 *   • first ever visit  → shows the skeleton once, fetches, caches;
 *   • every later visit → renders the cached data INSTANTLY and revalidates in
 *     the background (no skeleton, no flicker) so it stays fresh.
 *
 * `setData` writes through to the cache, so optimistic updates (add/edit/delete
 * a row) persist when you leave the view and come back — no stale reappearance.
 *
 * It's intentionally tiny (no SWR dependency): a Map keyed by a stable string.
 *
 * ── Porque é que revalidar deixou de custar ───────────────────────────────
 * Revalidar em cada montagem é o que mantém a lista de confiança, mas era caro:
 * com 300 pedidos, voltar a Propostas descarregava outra vez ~158 KB para dar,
 * quase sempre, exactamente o mesmo resultado. Agora guardamos também o ETag
 * que a rota devolve e reenviamo-lo em `If-None-Match`; quando nada mudou o
 * servidor responde **304 sem corpo** e nós ficamos com o array que já
 * tínhamos — a MESMA referência, por isso o React nem sequer volta a desenhar
 * as linhas. A frequência da revalidação não mudou; mudou o preço dela.
 *
 * Nada foi desligado para o número ficar bonito: se os dados mudaram, o
 * servidor manda 200 com o corpo completo, como sempre.
 *
 * ── E QUANDO A LEITURA NÃO VOLTA ──────────────────────────────────────────
 * Por aqui passam quase todas as listas do back office, portanto é aqui que a
 * diferença entre «está vazio» e «não consegui perguntar» se decide uma vez
 * para todas. Quem chama recebe três estados, e não dois: `loading` (a ler),
 * `error`+`falha` (não voltou — com a razão e uma saída) e `data` vazio (vazio
 * a sério). Ver `src/lib/porque-nao-leu.ts`: uma lista que não veio não sabe
 * afirmar que não há nada.
 */
interface Entry<T = unknown> {
  data: T;
  /** ETag da última resposta 200, para o pedido condicional seguinte. */
  etag?: string;
}

const cache = new Map<string, Entry>();

/**
 * Quantas escritas LOCAIS já houve nesta chave.
 *
 * É o que distingue "o servidor tem novidades" de "eu tenho novidades que o
 * servidor ainda não viu". Um pedido guarda o número com que partiu; se ele
 * mudou até a resposta chegar, o corpo que chegou descreve o mundo de ANTES
 * dessa escrita e não pode passar por cima dela — a linha apagada voltava ao
 * ecrã, e com o ETag novo agarrado a ela: a revalidação seguinte levava um 304
 * e a ressurreição ficava. Como a cache é partilhada, aparecia em todos os
 * painéis com esta chave.
 *
 * O ramo do 304 já tinha esta regra escrita; o do 200 é que não a tinha.
 */
const escritas = new Map<string, number>();

/**
 * Uma viagem por chave, mesmo quando três sítios pedem ao mesmo tempo.
 *
 * No arranque isto acontece de verdade: o `prefetchList` ocioso do AdminClient
 * e a vista que está a montar pedem a mesma lista com milissegundos de
 * diferença. Sem isto são dois pedidos e duas leituras no servidor, e o
 * primeiro resultado é deitado fora.
 */
const inFlight = new Map<string, Promise<Entry | null>>();

/**
 * ── QUEM ESTÁ A OLHAR PARA CADA LISTA ─────────────────────────────────────
 *
 * A cache era partilhada mas MUDA: o «Hoje», os Lembretes e a Agenda lêem a
 * mesma lista de tarefas que o ecrã das Tarefas e as tarefas do pedido, e
 * estão montados AO MESMO TEMPO (lado a lado, ou a gaveta por cima). Uma
 * tarefa riscada num deles ficava por fazer nos outros até se mudar de vista
 * — cada um tinha a sua cópia no estado do React e ninguém lhe dizia nada.
 *
 * Agora cada `useCachedList` montado inscreve-se na sua chave, e toda a
 * escrita na cache (a optimista do `setData` e a resposta 200 do servidor)
 * avisa os inscritos. Sem rede nenhuma: é só a mesma página a falar consigo.
 */
const ouvintes = new Map<string, Set<(data: unknown) => void>>();

function avisar(key: string, data: unknown): void {
  for (const ouvir of ouvintes.get(key) ?? []) ouvir(data);
}

/**
 * Quando foi a última leitura que voltou de cada chave. Serve só para o regresso
 * ao separador não pedir outra vez o que acabou de chegar.
 */
const lidoEm = new Map<string, number>();

/**
 * O intervalo mínimo entre duas revalidações por «voltar ao separador». Ela
 * salta entre separadores muitas vezes por minuto; cada salto é, no máximo,
 * um pedido condicional por lista montada (quase sempre um 304 sem corpo), e
 * este tecto faz com que saltos seguidos não sejam nem isso.
 */
const REGRESSO_MIN_MS = 30_000;

/**
 * A leitura falhou, e leva consigo a RAZÃO até quem desenha o ecrã.
 *
 * Antes ia um `Error` com o texto do servidor — ou, quando ele não dizia nada,
 * com o estado em cru: `new Error("500")`. Esse "500" não morria no `catch`,
 * era o que a vista mostrava à Catarina dentro do aviso, porque o
 * `AvisoDeFalha` só sabe pôr no ecrã a mensagem que lhe dão. Um número sozinho
 * não diz o que se passou nem o que fazer a seguir.
 *
 * O que viaja agora é a `LeituraFalhada` inteira: a frase, se vale a pena
 * oferecer um «Tentar de novo» (com a sessão caída, não vale — dá o mesmo 401)
 * e se foi a sessão que caiu.
 */
class ErroDeLeitura extends Error {
  constructor(readonly falha: LeituraFalhada) {
    super(falha.mensagem);
    this.name = "ErroDeLeitura";
  }
}

function loadOnce(key: string, url: string): Promise<Entry | null> {
  const running = inFlight.get(key);
  if (running) return running;

  const run = (async (): Promise<Entry | null> => {
    const before = cache.get(key);
    const escritasAoPartir = escritas.get(key) ?? 0;
    const res = await fetch(url, {
      cache: "no-store",
      headers: before?.etag ? { "If-None-Match": before.etag } : undefined,
    });

    if (res.status === 304) {
      // Nada mudou no servidor. Devolvemos o que está AGORA em cache (e não a
      // cópia lida no início do pedido): se entretanto houve uma escrita
      // optimista, é essa que vale — reverter para a versão anterior seria
      // desfazer à frente dos olhos dela uma alteração que já ficou gravada.
      return cache.get(key) ?? before ?? null;
    }
    if (!res.ok) {
      // A MENSAGEM do servidor, quando ele deu uma. É a diferença entre a
      // vista dizer "não foi possível ler" e dizer "falta correr o
      // db/schema.sql" — e essa segunda frase é a que resolve o problema
      // sozinha, sem ninguém ter de ir aos registos. É o `porqueNaoLeu` que
      // decide quando ela ganha; o que não pode voltar a acontecer é o que
      // acontecia sem explicação nenhuma, que era o ecrã mostrar «500».
      //
      // Sem NOME da lista de propósito: quem chama põe isto no `AvisoDeFalha`,
      // cujo título já diz «Não foi possível ler as tarefas». Repetir a coisa
      // na linha de baixo era dizer duas vezes o que já se vê.
      const corpo = await res.json().catch(() => null);
      throw new ErroDeLeitura(porqueNaoLeu("", res, corpo));
    }

    const corpo = await res.json();

    // Houve uma escrita optimista enquanto isto voava: o corpo que chegou é
    // mais VELHO do que o que ela já vê, e o ETag descreve esse corpo velho.
    // Fica o que está em cache, sem carimbo — a viagem seguinte volta a pedir
    // tudo e é essa que reconcilia.
    if ((escritas.get(key) ?? 0) !== escritasAoPartir) return cache.get(key) ?? null;

    const entry: Entry = { data: corpo, etag: res.headers.get("etag") ?? undefined };
    cache.set(key, entry);
    // Chegou uma versão nova do servidor: todos os que a mostram passam a ela.
    avisar(key, entry.data);
    return entry;
  })();

  inFlight.set(key, run);
  // Limpar a entrada em qualquer desfecho, sem transformar uma falha tratada
  // pelo chamador numa rejeição não-apanhada.
  void run
    .catch(() => {})
    .finally(() => {
      if (inFlight.get(key) === run) inFlight.delete(key);
    });
  return run;
}

/** Warm the cache for a view without rendering it (idle prefetch). No-op if
 *  already cached or in flight. */
export function prefetchList(key: string, url: string): void {
  if (cache.has(key) || inFlight.has(key)) return;
  void loadOnce(key, url).catch(() => {});
}

export interface CachedList<T> {
  data: T | undefined;
  /** Update the list AND the cache (use for optimistic add/edit/delete). */
  setData: (updater: T | ((prev: T) => T)) => void;
  loading: boolean;
  error: boolean;
  /**
   * A frase a mostrar quando `error` é `true` — a do servidor quando ele deu
   * uma, senão a que o `porqueNaoLeu` escreve para aquele estado. Nunca é um
   * número em cru, e nunca fala de gravações: isto é uma LEITURA, e a
   * instrução certa é recarregar ou tentar outra vez.
   */
  errorMessage: string;
  /**
   * A mesma falha, inteira: a razão, se vale a pena tentar de novo e se foi a
   * sessão que caiu. É o que a vista precisa para desenhar o estado — em
   * particular para NÃO oferecer um «Tentar de novo» que não pode funcionar.
   * `null` enquanto não falhou nada.
   */
  falha: LeituraFalhada | null;
  /** Force a foreground refresh (shows loading). */
  refresh: () => void;
}

export function useCachedList<T>(key: string, url: string): CachedList<T> {
  const cached = cache.get(key) as Entry<T> | undefined;
  const [data, setDataState] = useState<T | undefined>(cached?.data);
  // Only the true first load (nothing cached) shows the skeleton.
  const [loading, setLoading] = useState(cached === undefined);
  const [error, setError] = useState(false);
  const [falha, setFalha] = useState<LeituraFalhada | null>(null);
  // O valor mais recente deste ecrã, para o `setData` quando a cache ainda
  // não tem a chave (antes da primeira leitura voltar).
  const dataRef = useRef<T | undefined>(cached?.data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const revalidate = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const entry = await loadOnce(key, url);
        lidoEm.set(key, Date.now());
        // Num 304 isto é a MESMA referência que já está no estado, por isso o
        // React descarta a actualização e não há render nenhum.
        if (entry) setDataState(entry.data as T);
        setError(false);
        setFalha(null);
      } catch (e) {
        setError(true);
        // Um `ErroDeLeitura` já traz a razão apurada com a resposta em mão. O
        // resto é o `fetch` a rebentar antes de haver resposta nenhuma — a
        // rede em baixo, quase sempre —, e aí a razão apura-se do que veio.
        setFalha(e instanceof ErroDeLeitura ? e.falha : porqueNaoLeuDoErro("", e));
      } finally {
        setLoading(false);
      }
    },
    [key, url],
  );

  useEffect(() => {
    // Silent revalidation when we already have cached data (no skeleton). The
    // setState happens asynchronously inside revalidate() after the fetch — this
    // is the intended stale-while-revalidate flow, not a synchronous cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    revalidate(cache.has(key));
  }, [revalidate, key]);

  // Inscreve este ecrã na lista: o que outro ecrã escrever nela chega aqui.
  useEffect(() => {
    const ouvir = (d: unknown) => setDataState(d as T);
    let daChave = ouvintes.get(key);
    if (!daChave) ouvintes.set(key, (daChave = new Set()));
    daChave.add(ouvir);
    return () => {
      daChave.delete(ouvir);
      if (daChave.size === 0) ouvintes.delete(key);
    };
  }, [key]);

  /**
   * ── VOLTAR AO SEPARADOR É VOLTAR A PERGUNTAR ─────────────────────────────
   *
   * Ela deixa o back office aberto horas a fio; a colega risca tarefas noutro
   * computador. Sem isto, o «Hoje» mostrava a manhã inteira o que estava às
   * nove. Sem sondagem nenhuma (nada corre com o separador escondido): só ao
   * regressar, um pedido condicional com o ETag — 304 sem corpo quando nada
   * mudou — e no máximo um por lista a cada 30 s.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const aoVoltar = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - (lidoEm.get(key) ?? 0) < REGRESSO_MIN_MS) return;
      void revalidate(true);
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => document.removeEventListener("visibilitychange", aoVoltar);
  }, [key, revalidate]);

  const setData = useCallback(
    (updater: T | ((prev: T) => T)) => {
      // Marcada AQUI, e não dentro do actualizador: este corre no render
      // seguinte, e o que interessa é o instante em que ela mexeu na lista —
      // qualquer resposta que ainda esteja no ar já é anterior a isto.
      escritas.set(key, (escritas.get(key) ?? 0) + 1);
      // Calculado já, a partir da cache (que é a versão que TODOS os ecrãs
      // desta chave mostram), e não dentro do actualizador do React: é a
      // mesma lista que os outros ecrãs inscritos vão receber, e avisá-los de
      // dentro de um actualizador seria mexer noutro componente a meio de um
      // render.
      const prev = (cache.has(key) ? cache.get(key)!.data : dataRef.current) as T;
      const next = typeof updater === "function" ? (updater as (p: T) => T)(prev) : updater;
      // Sem ETag: o que temos em mão já não é a versão que o servidor
      // carimbou, portanto a revalidação seguinte tem de trazer o corpo todo
      // em vez de aceitar um 304 que descrevia a versão anterior.
      cache.set(key, { data: next });
      dataRef.current = next;
      setDataState(next);
      avisar(key, next);
    },
    [key],
  );

  const refresh = useCallback(() => {
    // "Actualizar" tem de trazer dados a sério: deitar fora o ETag garante um
    // corpo completo, mesmo que o servidor considere que nada mudou.
    const entry = cache.get(key);
    if (entry) cache.set(key, { data: entry.data });
    void revalidate(false);
  }, [key, revalidate]);

  return { data, setData, loading, error, errorMessage: falha?.mensagem ?? "", falha, refresh };
}

/** Esquece tudo o que está em cache. Só para testes — o produto não precisa. */
export function __resetListCache(): void {
  cache.clear();
  inFlight.clear();
  escritas.clear();
  lidoEm.clear();
}
