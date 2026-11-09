"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { stripPendingImages, type ProposalDoc } from "@/lib/proposal-doc";
import type { IdiomaDaProposta } from "@/lib/proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÁGINA REAL, PEDIDA AO SERVIDOR — A1 do `docs/FAZER-PROPOSTA-MELHORIAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do estúdio mostra a página REAL do PDF: o servidor desenha a página
 * `n` do rascunho com o motor do PDF (`/api/orcamento/[id]/pagina-do-rascunho`).
 * Ela escolheu (2/11) «Só a página, mais rápido», e a 9/11 pediu-a «ultra
 * rápida» — também ao escrever e a descer pelos mood boards.
 *
 * ── UMA FILA QUE NÃO PÁRA QUANDO ELA DESCE (9/11, segunda volta) ────────
 *
 * A primeira versão desse dia preparava as vizinhas depois de 1,5 s parada
 * numa página — e cada página nova CANCELAVA essa preparação. A descer pelos
 * mood boards a página nunca parava 1,5 s, nada se adiantava, e ela via o
 * cinzento «A preparar» em cada uma. Medido nos registos: cada desenho custa
 * ~1 s no servidor; o tempo perdia-se na fila, não no desenho.
 *
 * Agora há um PREPARADOR por proposta (fora do React, ver `Preparador`):
 *   · trabalha sempre, `EM_PARALELO` páginas de cada vez, e mudar de página
 *     não cancela nada — só muda QUAL vem a seguir: a que ela está a ver, e
 *     depois as mais perto dela;
 *   · ao abrir uma proposta prepara-as todas (uma volta por sessão);
 *   · depois de uma mudança no rascunho prepara só as que estão a
 *     `RAIO_DEPOIS_DE_MUDAR` páginas dela — as outras desenham-se quando ela
 *     lá chega. É o que segura o custo (ela: «o vercel e o seu custo tem que
 *     funcionar da melhor forma possível sem gastar quase nada»);
 *   · um pedido que falhou volta a tentar-se, até `TENTATIVAS` vezes.
 *
 * ── NUNCA UMA FOLHA EM BRANCO QUANDO JÁ HOUVE IMAGEM ─────────────────────
 *
 * A última imagem de cada página fica guardada — em memória e no navegador
 * (`caches`) — e aparece LOGO, marcada «A atualizar…» (`velha`), até a certa
 * chegar. A chave inclui quantas páginas o plano tem: se o plano mudou de
 * tamanho, a página 7 de antes pode ser outra coisa, e não se mostra.
 *
 * ── E ESCREVER ───────────────────────────────────────────────────────────
 *
 * Uma tecla não é um pedido: o rascunho novo só entra na fila `ESPERA_MS`
 * depois de parar de mudar. Até lá fica a imagem anterior, «A atualizar…».
 */
export const ESPERA_MS = 400;

/** Quantas páginas se desenham ao mesmo tempo. */
export const EM_PARALELO = 2;

/** Depois de uma mudança, só se refazem as páginas a esta distância. */
export const RAIO_DEPOIS_DE_MUDAR = 2;

/** Quantas vezes se tenta uma página antes de dizer que não chegou. */
export const TENTATIVAS = 3;

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
/** As propostas (e línguas) cuja volta inteira já se fez nesta sessão. */
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
  for (const p of preparadores.values()) p.parar();
  preparadores.clear();
}

export interface PaginaReal {
  /** URL de objeto da imagem à vista, ou `null`. */
  url: string | null;
  /** Que página é essa. */
  n: number | null;
  /** Vem aí outra imagem desta página (a certa). */
  aCarregar: boolean;
  /** A imagem é desta página mas de um rascunho anterior. */
  velha: boolean;
  /** A página não chegou depois de `TENTATIVAS` tentativas. */
  falhou: boolean;
  /** As páginas do PDF inteiro, quando o servidor já disse. */
  paginas: number | null;
}

/**
 * As páginas por ordem de vez, a partir de `n`: ela, a seguinte, a anterior,
 * e daí para fora. Com `raio`, só até essa distância.
 */
export function paginasAPreparar(
  n: number,
  total: number | null,
  raio: number = Number.POSITIVE_INFINITY,
): number[] {
  const dentro = (p: number) => p >= 1 && (total === null || p <= total);
  const limite = total === null ? 1 : Math.min(raio, total);
  const saida = dentro(n) ? [n] : [];
  for (let d = 1; d <= limite; d++) {
    if (dentro(n + d)) saida.push(n + d);
    if (dentro(n - d)) saida.push(n - d);
  }
  return saida;
}

function corpoDe(doc: ProposalDoc, idioma: IdiomaDaProposta, n: number, largura: number) {
  return JSON.stringify({ doc, idioma, n, largura });
}

class FalhaTemporaria extends Error {}

/**
 * ── O PREPARADOR DE UMA PROPOSTA ────────────────────────────────────────
 *
 * Fora do React de propósito: o painel desmonta e monta (outro passo, outra
 * vista) e a fila não pode recomeçar do zero de cada vez.
 */
class Preparador {
  private doc: ProposalDoc | null = null;
  private versao = "";
  private aVer = 1;
  private total: number | null = null;
  /** O tamanho do plano que o estúdio conta — entra na chave da imagem velha. */
  private planoTotal: number | null = null;
  private raio = Number.POSITIVE_INFINITY;
  private emCurso = new Map<number, AbortController>();
  private tentativas = new Map<number, number>();
  private espera: ReturnType<typeof setTimeout> | null = null;
  private parado = false;
  private ouvintes = new Set<() => void>();

  constructor(
    private quoteId: string,
    private idioma: IdiomaDaProposta,
    private largura: number,
  ) {}

  ouvir(f: () => void) {
    this.ouvintes.add(f);
    return () => this.ouvintes.delete(f);
  }
  private avisar() {
    for (const f of [...this.ouvintes]) f();
  }

  chave(n: number, doc: ProposalDoc | null = this.doc) {
    return doc ? `${this.quoteId}\u0000${corpoDe(doc, this.idioma, n, this.largura)}` : "";
  }
  chaveDaPagina(n: number, totalDoPlano: number | null) {
    return `${this.quoteId}\u0000${this.idioma}\u0000${this.largura}\u0000${totalDoPlano ?? ""}\u0000${n}`;
  }
  falhou(n: number) {
    return (this.tentativas.get(n) ?? 0) >= TENTATIVAS;
  }
  aCaminho(n: number) {
    return this.emCurso.has(n) || this.espera !== null;
  }

  /** O que ela está a ver agora. `doc` igual = só mudou a página. */
  definir(doc: ProposalDoc, n: number, totalDoPlano: number | null) {
    this.parado = false;
    this.aVer = n;
    this.planoTotal = totalDoPlano;
    if (totalDoPlano && !this.total) this.total = totalDoPlano;
    const versao = JSON.stringify(doc);
    if (versao !== this.versao) {
      const primeira = this.versao === "";
      this.versao = versao;
      // O rascunho mudou: o que estava a ser desenhado já não serve.
      for (const c of this.emCurso.values()) c.abort();
      this.emCurso.clear();
      this.tentativas.clear();
      if (this.espera) clearTimeout(this.espera);
      const entrar = () => {
        this.espera = null;
        this.doc = doc;
        const volta = `${this.quoteId}\u0000${this.idioma}`;
        this.raio = voltasFeitas.has(volta) ? RAIO_DEPOIS_DE_MUDAR : Number.POSITIVE_INFINITY;
        voltasFeitas.add(volta);
        this.bombear();
        this.avisar();
      };
      if (primeira) {
        entrar();
      } else {
        this.espera = setTimeout(entrar, ESPERA_MS);
        this.avisar();
      }
      return;
    }
    // Só mudou a página: a fila passa a começar nela. Nada se cancela.
    this.raio = Math.max(this.raio, RAIO_DEPOIS_DE_MUDAR);
    this.bombear();
  }

  parar() {
    this.parado = true;
    for (const c of this.emCurso.values()) c.abort();
    this.emCurso.clear();
    if (this.espera) clearTimeout(this.espera);
    this.espera = null;
    // A versão esquece-se: voltar a abrir o painel é uma «primeira vez».
    this.versao = "";
  }

  private proxima(): number | null {
    if (!this.doc) return null;
    for (const p of paginasAPreparar(this.aVer, this.total, this.raio)) {
      if (this.emCurso.has(p) || this.falhou(p)) continue;
      if (guardadas.has(this.chave(p))) continue;
      return p;
    }
    return null;
  }

  private bombear() {
    if (this.parado || !this.doc) return;
    if (typeof document !== "undefined" && document.hidden) return;
    while (this.emCurso.size < EM_PARALELO) {
      const p = this.proxima();
      if (p === null) return;
      void this.desenhar(p, this.doc);
    }
  }

  private async desenhar(p: number, doc: ProposalDoc) {
    const controlo = new AbortController();
    this.emCurso.set(p, controlo);
    const chave = this.chave(p, doc);
    const corpo = corpoDe(doc, this.idioma, p, this.largura);
    const estaVersao = impressao(corpo);
    const daPagina = this.chaveDaPagina(p, this.planoTotal);
    try {
      // Já está no navegador, desta versão (de antes de recarregar)?
      const noNavegador = ultimas.get(daPagina) ?? (await lerDoNavegador(daPagina));
      if (controlo.signal.aborted) return;
      if (noNavegador?.rascunho === estaVersao) {
        guardar(chave, noNavegador);
      } else {
        const res = await fetch(`/api/orcamento/${this.quoteId}/pagina-do-rascunho`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: corpo,
          signal: controlo.signal,
        });
        const paginas = Number(res.headers.get("X-Paginas")) || null;
        if (!res.ok) throw new FalhaTemporaria(String(res.status));
        const g: Guardada = { imagem: await res.blob(), paginas, rascunho: estaVersao };
        // Guarda-se mesmo que tenha ficado velho: está certa para AQUELE rascunho.
        guardar(chave, g);
        if (paginas) this.total = paginas;
        guardarUltima(daPagina, g);
      }
      this.tentativas.delete(p);
    } catch {
      if (controlo.signal.aborted) return;
      this.tentativas.set(p, (this.tentativas.get(p) ?? 0) + 1);
    } finally {
      if (this.emCurso.get(p) === controlo) this.emCurso.delete(p);
    }
    this.avisar();
    // Uma falha espera um pouco antes da próxima tentativa.
    if (!this.falhou(p) && this.tentativas.has(p)) {
      setTimeout(() => this.bombear(), 800);
    } else {
      this.bombear();
    }
  }

  retomar() {
    this.bombear();
  }
}

const preparadores = new Map<string, Preparador>();

function preparadorDe(quoteId: string, idioma: IdiomaDaProposta, largura: number) {
  const k = `${quoteId}\u0000${idioma}\u0000${largura}`;
  let p = preparadores.get(k);
  if (!p) {
    p = new Preparador(quoteId, idioma, largura);
    preparadores.set(k, p);
  }
  return p;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) for (const p of preparadores.values()) p.retomar();
  });
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
   * Quantas páginas o estúdio conta no plano: para saber que páginas
   * preparar, e para a imagem velha de uma página nunca ser a de um plano
   * com outro tamanho. O número que se MOSTRA é o do servidor.
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
  const ultimaUrl = useRef<{ url: string; imagem: Blob } | null>(null);
  const ativo = !!(quoteId && semPendentes && n);

  // O preparador pára quando o painel deixa de pedir (outra vista, desmontar).
  useEffect(() => {
    if (!quoteId) return;
    const p = preparadorDe(quoteId, idioma, largura);
    return () => p.parar();
  }, [quoteId, idioma, largura]);

  useEffect(() => {
    if (!ativo || !quoteId || !semPendentes || !n) return;
    const p = preparadorDe(quoteId, idioma, largura);
    let vivo = true;
    const mostrar = () => {
      if (!vivo) return;
      const certa = guardadas.get(p.chave(n, semPendentes));
      const daPagina = p.chaveDaPagina(n, total ?? null);
      const velha = certa ? null : (ultimas.get(daPagina) ?? null);
      const g = certa ?? velha;
      let url: string | null = null;
      if (g) {
        if (ultimaUrl.current?.imagem === g.imagem) {
          url = ultimaUrl.current.url;
        } else {
          url = URL.createObjectURL(g.imagem);
          if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current.url);
          ultimaUrl.current = { url, imagem: g.imagem };
        }
      }
      const falhou = !certa && p.falhou(n);
      setEstado((e) => ({
        url,
        n,
        aCarregar: !certa && !falhou,
        velha: !certa && !!velha,
        falhou,
        paginas: certa?.paginas ?? e.paginas,
      }));
    };
    const deixar = p.ouvir(mostrar);
    p.definir(semPendentes, n, total ?? null);
    // A imagem velha desta página, se só estiver no navegador.
    const daPagina = p.chaveDaPagina(n, total ?? null);
    if (!ultimas.has(daPagina)) {
      void lerDoNavegador(daPagina).then((g) => {
        if (g && vivo && !ultimas.has(daPagina)) {
          ultimas.set(daPagina, g);
          mostrar();
        }
      });
    }
    const logo = window.setTimeout(mostrar, 0);
    return () => {
      vivo = false;
      deixar();
      window.clearTimeout(logo);
    };
  }, [ativo, quoteId, semPendentes, idioma, n, largura, total]);

  // A última imagem liberta-se quando o painel sai.
  useEffect(
    () => () => {
      if (ultimaUrl.current) URL.revokeObjectURL(ultimaUrl.current.url);
      ultimaUrl.current = null;
    },
    [],
  );

  return ativo ? estado : { ...estado, aCarregar: false };
}
