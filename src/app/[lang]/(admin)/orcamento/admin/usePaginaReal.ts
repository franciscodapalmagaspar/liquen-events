"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripPendingImages, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA REAL, PEDIDA AO SERVIDOR — A1 do `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do estúdio mostrava uma APROXIMAÇÃO da página (`PaginaEditorial`,
 * desenhada no navegador). Ela pediu a página real, e escolheu (2/11) «Só a
 * página, mais rápido»: o servidor desenha só a página `n` do rascunho, com o
 * motor do PDF (`/api/orcamento/[id]/pagina-do-rascunho`).
 *
 * ── «TEM QUE SER ULTRA RÁPIDA» (9/11) ────────────────────────────────────
 *
 * Palavras dela, com uma captura de «A preparar «Capa»…»: «demora muito
 * tempo a carregar. tem que ser ultra rapida», e «a atualizar a pagina
 * quando se esta a mudar alguma coisa na proposta tambem tem que ser muito
 * mais rapida». MEDIDO nos registos da Vercel nesse dia: 1,4–2,3 s no
 * servidor por página; e antes disso o painel esperava 1 s (1,2 s ao mudar
 * de página) sem pedir nada, e a página seguinte só começava a ser desenhada
 * quando ela lá chegava. Três mudanças, por esta ordem de efeito:
 *
 *   1. NUNCA UMA FOLHA EM BRANCO quando já houve uma imagem daquela página.
 *      A última que chegou para cada página fica guardada — em memória e no
 *      armazenamento do navegador (`caches`), para sobreviver a recarregar —
 *      e aparece LOGO, marcada como «A atualizar…» (`velha`), enquanto a
 *      certa vem. O que se vê continua a ser a página real; quando ainda não
 *      é a deste rascunho, o painel di-lo.
 *   2. AS VIZINHAS PREPARAM-SE SOZINHAS. Depois de a página certa chegar e de
 *      ela parar `PREPARAR_MS`, pedem-se a seguinte e a anterior; na primeira
 *      página de cada proposta, todas as outras, uma de cada vez. Chegar lá
 *      deixa de ser um pedido: é a memória.
 *   3. MENOS ESPERA. A primeira página pede-se logo; mudar de página espera só
 *      `ESPERA_DA_PAGINA_MS` (o bastante para descer depressa não pedir cada
 *      secção por onde passa); escrever espera `ESPERA_MS`.
 *
 * ── E O CUSTO ────────────────────────────────────────────────────────────
 *
 * Cada desenho custa ~1–1,5 s de processador. As vizinhas são duas por
 * pausa; a volta inteira é uma vez por proposta e por sessão (~20 páginas,
 * ~30 s de processador — uns décimos de cêntimo). O processador das funções
 * foi 0,18 $ no mês inteiro: o que pesa na fatura é a construção do site.
 * Com o separador escondido continua a não se pedir nada, e um pedido que
 * fica velho é cancelado.
 */
export const ESPERA_MS = 400;

/** Só mudou a página (desceu para outra secção, «seguinte»): quase nada. */
export const ESPERA_DA_PAGINA_MS = 150;

/** Parada esta pausa na página certa, preparam-se as outras. */
export const PREPARAR_MS = 1500;

/**
 * ── O QUE JÁ VEIO NÃO SE PEDE OUTRA VEZ (4/11) ──────────────────────────
 *
 * A resposta fica guardada no navegador pela mesma chave que o servidor usa
 * (o rascunho inteiro, a língua, a página e a largura). Rascunho igual é
 * imagem igual, por isso a página guardada é exactamente a que o servidor
 * voltaria a desenhar. Basta mudar uma vírgula para a chave mudar.
 *
 * Desde 9/11 cabem as páginas todas de uma proposta e as vizinhas de umas
 * quantas versões: umas 100 KB cada, uns 5 MB no máximo. Uma falha nunca se
 * guarda.
 */
export const GUARDADAS_MAX = 48;
type Guardada = {
  imagem: Blob;
  paginas: number | null;
  /** De que rascunho é (a impressão digital do pedido) — ver `impressao`. */
  rascunho?: string;
};

/**
 * Uma impressão digital curta do pedido (rascunho, língua, página, largura),
 * para a última imagem de cada página saber de que versão é — também depois
 * de recarregar. Não é segurança: é só para comparar «é esta versão?».
 */
export function impressao(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${(h2 >>> 0).toString(16)}${(h1 >>> 0).toString(16)}`;
}
const guardadas = new Map<string, Guardada>();

function guardar(chave: string, valor: Guardada) {
  guardadas.delete(chave);
  guardadas.set(chave, valor);
  while (guardadas.size > GUARDADAS_MAX) {
    const maisVelha = guardadas.keys().next().value;
    if (maisVelha === undefined) break;
    guardadas.delete(maisVelha);
  }
}

/**
 * A ÚLTIMA imagem de cada página, seja de que rascunho for — a que aparece
 * logo, marcada como velha, enquanto a certa não chega. Chave: proposta,
 * língua, largura e número da página.
 */
const ultimas = new Map<string, Guardada>();
const ULTIMAS_MAX = 120;
/** As propostas cuja volta inteira já se fez nesta sessão. */
const voltasFeitas = new Set<string>();

function guardarUltima(chave: string, valor: Guardada) {
  ultimas.delete(chave);
  ultimas.set(chave, valor);
  while (ultimas.size > ULTIMAS_MAX) {
    const maisVelha = ultimas.keys().next().value;
    if (maisVelha === undefined) break;
    ultimas.delete(maisVelha);
  }
  void escreverNoNavegador(chave, valor);
}

/**
 * ── E DEPOIS DE RECARREGAR ───────────────────────────────────────────────
 *
 * A memória de cima vive enquanto a página do back office estiver aberta. A
 * última imagem de cada página fica também no armazenamento do navegador
 * (`caches`), para que reabrir a proposta mostre logo a página como estava.
 * Tudo isto é opcional: sem `caches` (um separador privado, um teste), ou se
 * falhar, o painel funciona na mesma — só sem esse atalho.
 */
const ARMAZEM = "liquen-paginas-do-estudio-v1";

function enderecoNoArmazem(chave: string) {
  return `/__paginas-do-estudio/${encodeURIComponent(chave)}`;
}

async function escreverNoNavegador(chave: string, { imagem, paginas, rascunho }: Guardada) {
  try {
    if (typeof caches === "undefined") return;
    const armazem = await caches.open(ARMAZEM);
    await armazem.put(
      enderecoNoArmazem(chave),
      new Response(imagem, {
        headers: {
          "Content-Type": "image/webp",
          "X-Paginas": String(paginas ?? ""),
          "X-Rascunho": rascunho ?? "",
        },
      }),
    );
  } catch {
    // Sem armazenamento, fica só a memória.
  }
}

async function lerDoNavegador(chave: string): Promise<Guardada | null> {
  try {
    if (typeof caches === "undefined") return null;
    const armazem = await caches.open(ARMAZEM);
    const res = await armazem.match(enderecoNoArmazem(chave));
    if (!res) return null;
    return {
      imagem: await res.blob(),
      paginas: Number(res.headers.get("X-Paginas")) || null,
      rascunho: res.headers.get("X-Rascunho") || undefined,
    };
  } catch {
    return null;
  }
}

/** Para os testes: cada um começa sem páginas guardadas. */
export function esquecerPaginasGuardadas() {
  guardadas.clear();
  ultimas.clear();
  voltasFeitas.clear();
}

export interface PaginaReal {
  /** URL de objeto da última página que chegou, ou `null`. */
  url: string | null;
  /** Que página é essa (pode não ser a pedida, enquanto a nova não chega). */
  n: number | null;
  /** Há um pedido a caminho (ou para sair) — a imagem pode mudar. */
  aCarregar: boolean;
  /** A imagem é desta página mas de um rascunho anterior: vem aí a certa. */
  velha: boolean;
  /** O último pedido falhou (e não há página real para mostrar desta vez). */
  falhou: boolean;
  /** As páginas do PDF inteiro, quando o servidor já disse. */
  paginas: number | null;
}

async function pedir(quoteId: string, corpo: string, signal: AbortSignal): Promise<Guardada> {
  const res = await fetch(`/api/orcamento/${quoteId}/pagina-do-rascunho`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo,
    signal,
  });
  const paginas = Number(res.headers.get("X-Paginas")) || null;
  if (!res.ok) throw new Error(String(res.status));
  return { imagem: await res.blob(), paginas, rascunho: impressao(corpo) };
}

/**
 * As páginas a preparar a seguir a `n`, por esta ordem: a seguinte, a
 * anterior e — se é a primeira volta desta proposta — todas as outras, a
 * partir das mais perto.
 */
export function paginasAPreparar(n: number, total: number | null, volta: boolean): number[] {
  const perto = [n + 1, n - 1].filter((p) => p >= 1 && (total === null || p <= total));
  if (!volta || total === null) return perto;
  const resto: number[] = [];
  for (let d = 2; d < total; d++) {
    if (n + d <= total) resto.push(n + d);
    if (n - d >= 1) resto.push(n - d);
  }
  return [...perto, ...resto];
}

export function usePaginaReal({
  quoteId,
  doc,
  idioma,
  n,
  largura = 800,
  total,
}: {
  /** Sem pedido (nos testes antigos, ou fora do estúdio), não se pede nada. */
  quoteId?: string;
  doc?: ProposalDoc;
  idioma: IdiomaDaProposta;
  /** A página do PDF, a contar de 1 (`null`: nenhuma). */
  n: number | null;
  largura?: number;
  /**
   * Quantas páginas o estúdio conta no plano — só para saber que páginas
   * preparar quando o servidor não o disse (uma imagem que ele já tinha em
   * memória). O número que se MOSTRA continua a ser o do servidor.
   */
  total?: number;
}): PaginaReal {
  const [estado, setEstado] = useState<PaginaReal>({
    url: null,
    n: null,
    aCarregar: false,
    velha: false,
    falhou: false,
    paginas: null,
  });
  // As fotografias a caminho não vão — a mesma fronteira da pré-visualização.
  const semPendentes = useMemo(() => (doc ? stripPendingImages(doc) : undefined), [doc]);
  const corpo = useMemo(
    () =>
      quoteId && semPendentes && n
        ? JSON.stringify({ doc: semPendentes, idioma, n, largura })
        : null,
    [quoteId, semPendentes, idioma, n, largura],
  );
  const ultimaUrl = useRef<string | null>(null);
  /** O rascunho do último pedido — para saber se agora só mudou a página. */
  const ultimoDoc = useRef<ProposalDoc | undefined>(undefined);
  /** Já se mostrou alguma página desde que o painel abriu? */
  const jaMostrou = useRef(false);

  useEffect(() => {
    if (!corpo || !quoteId || !semPendentes || !n) return;
    const chave = `${quoteId}\u0000${corpo}`;
    const chaveDaPagina = (p: number) => `${quoteId}\u0000${idioma}\u0000${largura}\u0000${p}`;
    let vivo = true;
    const mostrar = (g: Guardada, velha: boolean) => {
      if (!vivo) return;
      const url = URL.createObjectURL(g.imagem);
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = url;
      jaMostrou.current = true;
      setEstado((e) => ({
        url,
        n,
        aCarregar: velha,
        velha,
        falhou: false,
        paginas: g.paginas ?? e.paginas,
      }));
    };
    const controlo = new AbortController();
    const temporizadores: number[] = [];
    const depois = (ms: number, fazer: () => void) => {
      temporizadores.push(window.setTimeout(fazer, ms));
    };

    /** As outras páginas, em silêncio, uma de cada vez. */
    const prepararAsOutras = (doServidor: number | null) => {
      const quantas = doServidor ?? total ?? null;
      const volta = !voltasFeitas.has(`${quoteId}\u0000${idioma}`);
      depois(PREPARAR_MS, async () => {
        if (typeof document !== "undefined" && document.hidden) return;
        if (volta) voltasFeitas.add(`${quoteId}\u0000${idioma}`);
        for (const p of paginasAPreparar(n, quantas, volta)) {
          if (controlo.signal.aborted) return;
          const corpoP = JSON.stringify({ doc: semPendentes, idioma, n: p, largura });
          const chaveP = `${quoteId}\u0000${corpoP}`;
          if (guardadas.has(chaveP)) continue;
          // Já está no navegador, desta versão (de antes de recarregar).
          const ultimaP = ultimas.get(chaveDaPagina(p)) ?? (await lerDoNavegador(chaveDaPagina(p)));
          if (controlo.signal.aborted) return;
          if (ultimaP?.rascunho === impressao(corpoP)) {
            guardar(chaveP, ultimaP);
            continue;
          }
          try {
            const g = await pedir(quoteId, corpoP, controlo.signal);
            guardar(chaveP, g);
            guardarUltima(chaveDaPagina(p), g);
          } catch {
            // Uma vizinha que falha não interessa a ninguém: pede-se quando
            // ela lá chegar. E uma que já não existe acaba a volta.
            if (controlo.signal.aborted) return;
          }
        }
      });
    };

    const ja = guardadas.get(chave);
    if (ja) {
      // Já veio: mostra-se logo, sem pausa e sem pedir nada ao servidor.
      guardar(chave, ja);
      depois(0, () => {
        mostrar(ja, false);
        prepararAsOutras(ja.paginas);
      });
      ultimoDoc.current = doc;
      return () => {
        vivo = false;
        temporizadores.forEach((t) => window.clearTimeout(t));
        controlo.abort();
      };
    }

    // Enquanto a certa não chega: a última imagem DESTA página, marcada como
    // velha. Da memória, logo; do navegador, assim que se ler. E se for a
    // desta versão do rascunho (reabrir a proposta sem mudar nada), é a
    // certa: mostra-se e não se pede nada.
    const estaVersao = impressao(corpo);
    const daMemoria = ultimas.get(chaveDaPagina(n));
    if (daMemoria?.rascunho === estaVersao) {
      guardar(chave, daMemoria);
      depois(0, () => {
        mostrar(daMemoria, false);
        prepararAsOutras(daMemoria.paginas);
      });
      ultimoDoc.current = doc;
      return () => {
        vivo = false;
        temporizadores.forEach((t) => window.clearTimeout(t));
        controlo.abort();
      };
    }
    const anterior = daMemoria;
    let doNavegador: Promise<boolean> = Promise.resolve(false);
    if (anterior) {
      depois(0, () => mostrar(anterior, true));
    } else {
      depois(0, () => setEstado((e) => (e.n === n ? { ...e, aCarregar: true } : e)));
      doNavegador = lerDoNavegador(chaveDaPagina(n)).then((g) => {
        if (!g || controlo.signal.aborted) return false;
        ultimas.set(chaveDaPagina(n), g);
        if (g.rascunho === estaVersao) {
          guardar(chave, g);
          mostrar(g, false);
          prepararAsOutras(g.paginas);
          return true;
        }
        mostrar(g, true);
        return false;
      });
    }

    const soAPagina = ultimoDoc.current === doc;
    ultimoDoc.current = doc;
    const espera = !jaMostrou.current && !anterior ? 0 : soAPagina ? ESPERA_DA_PAGINA_MS : ESPERA_MS;
    depois(espera, async () => {
      // Ninguém está a ver: o desenho fica para quando ela voltar e mexer.
      if (typeof document !== "undefined" && document.hidden) return;
      // A do navegador pode já ser a certa: nesse caso não se pede nada.
      if (await doNavegador) return;
      if (controlo.signal.aborted) return;
      setEstado((e) => ({ ...e, aCarregar: true, falhou: false }));
      try {
        const g = await pedir(quoteId, corpo, controlo.signal);
        // Guarda-se mesmo que este pedido tenha ficado velho: a página está
        // certa para AQUELE rascunho, e voltar a ele não a pede outra vez.
        guardar(chave, g);
        guardarUltima(chaveDaPagina(n), g);
        if (controlo.signal.aborted) return;
        mostrar(g, false);
        prepararAsOutras(g.paginas);
      } catch {
        if (controlo.signal.aborted) return;
        // Se havia a imagem velha desta página, fica — e diz que falhou.
        setEstado((e) => ({ ...e, aCarregar: false, falhou: true }));
      }
    });
    return () => {
      vivo = false;
      temporizadores.forEach((t) => window.clearTimeout(t));
      controlo.abort();
    };
    // `doc` só é lido para comparar com o anterior; o pedido depende do
    // `corpo`, que já muda com ele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corpo, quoteId]);

  // A última imagem liberta-se quando o painel sai.
  useEffect(
    () => () => {
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current);
      ultimaUrl.current = null;
    },
    [],
  );

  return estado;
}
