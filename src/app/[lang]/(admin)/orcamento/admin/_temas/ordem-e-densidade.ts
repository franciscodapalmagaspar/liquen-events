import type { ThemeSummary } from "@/lib/theme-types";

/**
 * Por que ordem e com que densidade se vêem os temas — e a escolha dela,
 * lembrada neste aparelho.
 * (Saiu do topo do `Temas.tsx` na fase 8 de `docs/ESTRUTURA-DO-CODIGO.md`,
 * tal e qual.)
 */

/** Por que ordem os temas aparecem. */
export type Ordem = "alfabetica" | "recentes" | "fotos" | "mais-usados" | "menos-usados";

/**
 * ── OS NOMES DIZEM O CRITÉRIO, E NÃO A DIRECÇÃO ────────────────────────────
 *
 * «A–Z» e «Recentes» eram o que estava. O `docs/APPLE-TEMAS.md` (Parte 6) pede
 * «Ordenar: Nome», com «Nome · Mais recentes · Mais usados · Menos usados» — a
 * lista escreve-se com o critério à frente, para o controlo dizer por que
 * ordem a grelha está sem ser preciso adivinhar o que «A–Z» quer dizer numa
 * biblioteca com acentos.
 *
 * «Com mais fotos» fica, e não é um quinto por gosto: já cá estava, é o que
 * responde a «qual é o tema que dá para montar um mood board hoje», e tirá-lo
 * seria desfazer trabalho para chegar ao número quatro do documento.
 *
 * As duas do USO só se OFERECEM quando a contagem de propostas chegou (vem
 * noutro pedido, ver `usos`) — e se a preferência guardada for uma delas antes
 * de ela chegar, a `ordenarTemas` cai no nome, que é a ordem de repouso.
 */
export const ORDENS: readonly { valor: Ordem; rotulo: string }[] = [
  { valor: "alfabetica", rotulo: "Nome" },
  { valor: "recentes", rotulo: "Mais recentes" },
  { valor: "fotos", rotulo: "Com mais fotos" },
  { valor: "mais-usados", rotulo: "Mais usados" },
  { valor: "menos-usados", rotulo: "Menos usados" },
];

/** As ordens que precisam da contagem de propostas para significarem alguma
 *  coisa. Sem ela não se mostram — ver `ORDENS`. */
export const ORDENS_DE_USO: readonly Ordem[] = ["mais-usados", "menos-usados"];

/** O que o «⋯» da barra de topo governa, para o rótulo acessível — «Acções de
 *  Biblioteca de Temas». Sem isto ele chamava-se «Acções» como os dos cartões,
 *  e numa grelha de 28 haveria 29 botões com o mesmo nome. */
export const MENU_DA_BIBLIOTECA = "Biblioteca de Temas";

export const ORDEM_KEY = "liquen-temas-ordem";

export function lerOrdem(): Ordem | null {
  try {
    const v = window.localStorage.getItem(ORDEM_KEY);
    return ORDENS.some((o) => o.valor === v) ? (v as Ordem) : null;
  } catch {
    return null;
  }
}

export function guardarOrdem(o: Ordem): void {
  try {
    window.localStorage.setItem(ORDEM_KEY, o);
  } catch {
    // Ver `guardarDensidade`.
  }
}

/**
 * Ordena os temas — puro, para se poder testar sem desenhar nada.
 *
 * OS FAVORITOS VÊM SEMPRE À FRENTE, seja qual for a ordem escolhida. É o que
 * fixar significa: um tema que se usa em quase todas as propostas não pode
 * andar a mudar de sítio porque se ordenou por data. Dentro de cada grupo é
 * que a ordem escolhida manda.
 *
 * Uma pasta ilegível (`imageCount: null`) fica no fim de "com mais fotos", em
 * vez de valer zero e passar à frente de um tema com uma foto — não sabemos
 * quantas tem, e adivinhar para baixo seria esconder o tema.
 *
 * `usos` é a contagem de propostas por tema, e chega depois dos cartões. Sem
 * ela, as duas ordens do USO não têm por onde ordenar e a lista fica pelo nome
 * — a ordem de repouso desta biblioteca. Um empate (dois temas com três
 * propostas cada) também desce ao nome, para a grelha não trocar de arrumação
 * entre dois desenhos.
 */
export function ordenarTemas(
  temas: readonly ThemeSummary[],
  ordem: Ordem,
  usos?: Record<string, number> | null,
): ThemeSummary[] {
  const porOrdem = (a: ThemeSummary, b: ThemeSummary): number => {
    if (ordem === "recentes") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    if (ordem === "fotos") {
      const na = a.imageCount ?? -1;
      const nb = b.imageCount ?? -1;
      if (na !== nb) return nb - na;
    }
    if (usos && (ordem === "mais-usados" || ordem === "menos-usados")) {
      const na = usos[a.id] ?? 0;
      const nb = usos[b.id] ?? 0;
      if (na !== nb) return ordem === "mais-usados" ? nb - na : na - nb;
    }
    return a.name.localeCompare(b.name, "pt");
  };
  return [...temas].sort((a, b) => Number(!!b.favorito) - Number(!!a.favorito) || porOrdem(a, b));
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS DA BIBLIOTECA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A biblioteca é o activo mais valioso do back office e não dizia o seu próprio
 * tamanho: era preciso somar 18 cartões à mão para responder a «quantas fotos
 * temos?».
 *
 * Uma pasta ILEGÍVEL (`imageCount: null`) não conta como zero — conta como
 * desconhecida, e o total di-lo. Somar zero calado transformava uma falha de
 * leitura numa biblioteca mais pequena do que é, que é a maneira mais fácil de
 * alguém concluir que faltam fotos e ir carregá-las outra vez.
 */
export function contarFotosDaBiblioteca(temas: readonly ThemeSummary[]): {
  fotos: number;
  temas: number;
  ilegiveis: number;
  /** Temas cuja contagem ainda não veio (`resumoPendente`, 9/11). */
  porContar: number;
} {
  let fotos = 0;
  let ilegiveis = 0;
  let porContar = 0;
  for (const t of temas) {
    if (t.resumoPendente) porContar += 1;
    else if (typeof t.imageCount === "number") fotos += t.imageCount;
    else ilegiveis += 1;
  }
  return { fotos, temas: temas.length, ilegiveis, porContar };
}

/**
 * Abaixo de quantas fotos um tema não serve para montar uma página.
 *
 * Um mood board enche-se com 6 a 8 fotografias (ver `proposal-moodboard.ts`).
 * Um tema com menos de três não dá para escolher: dá para usar o que lá está,
 * que é outra coisa. O aviso não julga o tema — diz que ele ainda está a meio.
 */
export const POUCAS_FOTOS = 3;

/** O tema tem poucas fotos para o que serve? `null` (ilegível) não é «poucas»:
 *  não se sabe, e um aviso a partir do que não se sabe é um aviso errado. */
export function temPoucasFotos(t: Pick<ThemeSummary, "imageCount">): boolean {
  return typeof t.imageCount === "number" && t.imageCount < POUCAS_FOTOS;
}

/** Quão apertada é a grelha de temas. */
export type Densidade = "confortavel" | "compacto";

export const DENSIDADE_KEY = "liquen-temas-densidade";

/** Lê a preferência guardada. Nunca lança — um `localStorage` indisponível
 *  (janela privada, política do browser) vale como "não há preferência". */
export function lerDensidade(): Densidade | null {
  try {
    const v = window.localStorage.getItem(DENSIDADE_KEY);
    return v === "confortavel" || v === "compacto" ? v : null;
  } catch {
    return null;
  }
}

export function guardarDensidade(d: Densidade): void {
  try {
    window.localStorage.setItem(DENSIDADE_KEY, d);
  } catch {
    // Perder a preferência é um incómodo; deitar o ecrã abaixo por causa dela
    // não tem desculpa nenhuma.
  }
}

/**
 * As colunas de cada densidade.
 *
 * DUAS no telemóvel nas duas: uma coluna com cartões enormes obrigava a
 * percorrer a biblioteca inteira de baixo para cima.
 *
 * "Compacto" chega a seis colunas porque é exactamente o número de temas de
 * hoje — o pedido era vê-los todos de uma vez, sem scroll.
 */
/**
 * ── AS COLUNAS, E PORQUE É QUE A FOLGA NÃO É QUADRADA ─────────────────────
 *
 * Pedido dela, na Fase 3: «mais folga entre os cartões».
 *
 * A folga VERTICAL é maior do que a horizontal, e não por gosto: desde que um
 * cartão pode ter uma linha pendurada por baixo dele — «Lê-se como "italia" ·
 * Juntar» —, uma folga igual nos dois sentidos punha essa linha à mesma
 * distância do cartão a que pertence e do cartão de baixo. Lia-se como sendo
 * do outro.
 *
 * Horizontalmente muda pouco: a 390 px são duas colunas, e cada píxel de folga
 * sai da fotografia. É o lado onde a folga custa e o lado onde não fazia falta.
 */
export const COLUNAS: Record<Densidade, string> = {
  confortavel: "grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4",
  compacto: "grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-4 lg:grid-cols-6",
};
