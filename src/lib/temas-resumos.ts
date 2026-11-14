import "server-only";
import { lqipsECoresDeCaminhos } from "@/lib/biblioteca-fotos-store";
import {
  listThemeFiles,
  signThemePaths,
  signThemeThumbs,
  themeFolder,
  isThemePath,
} from "@/lib/theme-storage";
import type { ProposalTheme, ThemeSummary } from "@/lib/theme-types";
import { log } from "@/lib/logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RESUMO DE CADA TEMA — a contagem, a capa assinada, o borrão e a cor
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Era o corpo do `GET /api/temas`. Passou para aqui a 9/11 para servir também
 * a `/api/temas/resumos`, que resume só os temas que o ecrã está a desenhar:
 * ela pediu a página dos temas «a aguentar milhares de temas», e resumir tudo
 * de uma vez custa uma listagem do Storage por tema.
 *
 * Os comentários das decisões (o orçamento de 8 s, a capa por omissão, os
 * borrões na mesma espera) continuam no `api/temas/route.ts`, onde nasceram.
 */

/** Até quantos temas o `GET /api/temas` resume tudo, como sempre fez. */
export const LIMIAR_DE_RESUMOS = 150;
/** Quantos temas a `/api/temas/resumos` resume de cada vez. */
export const RESUMOS_POR_PEDIDO = 60;

export const ORCAMENTO_DO_STORAGE_MS = 8000;

/** Quantas fotografias da ordem manual concorrem à capa por omissão — ver
 *  «SEM CAPA ESCOLHIDA, A CAPA É A PRIMEIRA DA GRELHA», no GET. */
const CANDIDATAS_DA_ORDEM = 3;

export async function comOrcamento<T>(
  trabalho: Promise<T>,
  ms: number,
  reserva: T,
  oQue: string,
): Promise<T> {
  // A promessa original não pode ficar a rejeitar sozinha depois de a corrida
  // acabar — seria um "unhandled rejection" a derrubar o processo por causa de
  // uma capa.
  const seguro = trabalho.catch((err) => {
    log.error(`temas GET: ${oQue} falhou`, err);
    return reserva;
  });
  if (ms <= 0) return reserva;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const relogio = new Promise<T>((resolve) => {
    temporizador = setTimeout(() => {
      log.warn("temas GET: o Storage passou do orçamento — a lista sai sem fotos", { oQue, ms });
      resolve(reserva);
    }, ms);
  });
  try {
    return await Promise.race([seguro, relogio]);
  } finally {
    if (temporizador) clearTimeout(temporizador);
  }
}

/** O que uma pasta que não se conseguiu ler devolve. Ver `listThemeFiles`. */
export const PASTA_ILEGIVEL = { names: [] as string[], ok: false, truncated: false };

export async function resumirTemas(themes: readonly ProposalTheme[]): Promise<ThemeSummary[]> {
  if (themes.length === 0) return [];
  const limite = Date.now() + ORCAMENTO_DO_STORAGE_MS;
  const listings = await comOrcamento(
    Promise.all(themes.map((t) => listThemeFiles(t.id))),
    ORCAMENTO_DO_STORAGE_MS,
    themes.map(() => PASTA_ILEGIVEL),
    "listagem das pastas",
  );

  // Duas hipóteses por tema — a escolhida e a mais recente —, ambas na mesma
  // assinatura em bloco: se a escolhida já não existir, a segunda responde
  // sem custar outra ida ao Storage.
  const chosen = themes.map((t) =>
    t.coverPath && isThemePath(t.coverPath) && t.coverPath.startsWith(`${themeFolder(t.id)}/`)
      ? t.coverPath
      : "",
  );
  const newest = listings.map(({ names }, i) =>
    names[0] ? `${themeFolder(themes[i].id)}/${names[0]}` : "",
  );
  /**
   * ════════════════════════════════════════════════════════════════════
   * SEM CAPA ESCOLHIDA, A CAPA É A PRIMEIRA DA GRELHA
   * ════════════════════════════════════════════════════════════════════
   *
   * «Por defeito a primeira» (T1). Era sempre a mais RECENTE — e num tema
   * arrumado à mão (`photoOrder`) a primeira da grelha é outra: o cartão
   * mostrava uma fotografia e, ao abrir a pasta, trocava para a primeira
   * da ordem (é essa que a pasta dá ao cartão, ver `capa-do-cartao.ts`).
   *
   * A ordem já vem na linha do tema, que esta rota leu lá em cima — não
   * custa ida nenhuma. As candidatas entram na MESMA assinatura em bloco, e
   * a escolhida é a primeira cujo original se deixou assinar, que é a
   * regra da pasta (`listThemeImagePage` deixa cair o que não assina).
   * Só as primeiras `CANDIDATAS_DA_ORDEM`: uma ordem pode ter centenas de
   * caminhos, e uma capa não precisa delas; se as três primeiras tiverem
   * desaparecido todas, fica a mais recente, como antes.
   */
  const daOrdem = themes.map((t) =>
    (t.photoOrder ?? [])
      .filter((p) => isThemePath(p) && p.startsWith(`${themeFolder(t.id)}/`))
      .slice(0, CANDIDATAS_DA_ORDEM),
  );
  /**
   * ════════════════════════════════════════════════════════════════════
   * UMA FOTOGRAFIA POR CARTÃO — e o que isso poupa
   * ════════════════════════════════════════════════════════════════════
   *
   * Aqui assinavam-se mais TRÊS fotos por tema, para o cartão desenhar uma
   * tira do conjunto ao lado da capa. A ideia era boa e o desenho não: numa
   * grelha compacta a tira tinha 41 px de largura e cada foto ~41 × 33 —
   * pequena de mais para se ler como uma fotografia, e o que se via era
   * textura no canto do cartão. Falhava no seu próprio objectivo.
   *
   * Decisão dela na Fase 2: uma imagem por cartão. O conjunto passa a ser
   * dito pelo número («9 fotos»), que ocupa uma linha de texto em vez de um
   * quarto da fotografia, e visto ao abrir o tema, que é onde se escolhe.
   *
   * MEDIDO, numa biblioteca de 25 temas: 75 pedidos de imagem a menos e
   * ~520 KB que deixam de atravessar a rede dela (micro AVIF a ~6,9 KB), sem
   * contar as 75 assinaturas e os 75 borrões que deixam de ir na resposta.
   * A tira era a metade mais cara do cartão e a que menos dizia.
   */
  /**
   * ════════════════════════════════════════════════════════════════════
   * O CARTÃO NÃO PODE SERVIR ORIGINAIS. Servia.
   * ════════════════════════════════════════════════════════════════════
   *
   * Isto assinava só `theme-assets` — o bucket dos ORIGINAIS, 2200 px e
   * ~576 KB por fotografia. Para uma capa desenhada com 128 px e três tiras
   * de 43 px. Por cartão: 4 × 576 KB = 2,3 MB. Seis cartões: **~13,8 MB**
   * para desenhar uma lista de temas.
   *
   * Em píxeis: a capa recebia 17× os que pinta, as tiras 51×.
   *
   * Agora assina os TRÊS buckets, em paralelo e em bloco (uma chamada por
   * bucket, como já era), e escolhe por ordem de adequação:
   *
   *   capa  → miniatura 400 px  →  original
   *   tiras → micro 96 px  →  miniatura 400 px  →  original
   *
   * O original continua a ser assinado porque é o único que existe SEMPRE:
   * as fotos anteriores às derivadas não têm miniatura nenhuma, e um cartão
   * vazio seria pior do que um cartão pesado. É plano B, não caminho.
   */
  const todos = [...new Set([...chosen, ...daOrdem.flat(), ...newest].filter(Boolean))];
  const vazio = () => new Map<string, string>();
  /* ── E OS BORRÕES, NO MESMO FÔLEGO ────────────────────────────────────
       «Placeholder blur por foto — acaba o ecrã de cartões cinzentos.»

       São poucas centenas de bytes por fotografia, e viajam nesta resposta:
       estão pintados no primeiro fotograma, antes de qualquer ida ao Storage.
       Vão na MESMA espera das assinaturas, e não a seguir — encadeá-los somava
       a latência de uma consulta à de três assinaturas, e o orçamento de tempo
       desta rota é o mesmo.

       Os `lqip` lêem-se por PASTA e a chave é o caminho REAL, sem o prefixo
       `tema:` que só existe dentro de um documento. Aqui os caminhos já são os
       reais — vêm da listagem da pasta.

       ── E A COR, NA MESMA LEITURA ────────────────────────────────────────
       «Nunca um cartão vazio» (T1 do `docs/PROPOSTAS-E-TEMAS-APPLE.md`): o
       cartão pinta o lugar da capa com a cor dominante dela enquanto a
       fotografia não chega — e quando não chega de todo. A cor vive na mesma
       linha do borrão, e por isso vem na mesma consulta
       (`lqipsECoresDeCaminhos`), dentro do mesmo orçamento: estourado o
       tempo, o cartão fica sem cor e cai no esqueleto cinzento, nunca num
       erro. */
  // Sem a oferta em AVIF (14/11): era a mesma miniatura de 400 px num segundo
  // ficheiro (`derivadas.ts`, «E JÁ NÃO HÁ AVIF AO LADO») e uma assinatura a
  // mais por cada abertura da lista.
  const [urls, thumbs, { lqips, cores }] = await comOrcamento(
    Promise.all([signThemePaths(todos), signThemeThumbs(todos), lqipsECoresDeCaminhos(todos)]),
    limite - Date.now(),
    [vazio(), vazio(), { lqips: vazio(), cores: vazio(), formas: new Map() }],
    "assinatura das capas",
  );
  /** O melhor que existe para a capa do cartão (~128 px). */
  const paraCapa = (p: string) => thumbs.get(p) ?? urls.get(p);

  const summaries: ThemeSummary[] = themes.map((t, i) => {
    const { names, ok, truncated } = listings[i];
    // O caminho da capa, antes de se escolher que TAMANHO servir: é preciso
    // para poder mandar também o original como plano B.
    const capa = paraCapa(chosen[i])
      ? chosen[i]
      : (daOrdem[i].find((p) => urls.has(p)) ?? newest[i]);
    const coverUrl = paraCapa(capa);
    const coverFallbackUrl = capa ? urls.get(capa) : undefined;
    const coverLqip = capa ? lqips.get(capa) : undefined;
    const coverCor = capa ? cores.get(capa) : undefined;
    return {
      ...t,
      imageCount: ok ? names.length : null,
      ...(ok && truncated ? { truncated: true } : {}),
      coverUrl,
      ...(coverFallbackUrl ? { coverFallbackUrl } : {}),
      ...(coverLqip ? { coverLqip } : {}),
      ...(coverCor ? { coverCor } : {}),
    };
  });
  /**
   * A lista de temas é lida em quase todos os ecrãs e muda muito pouco —
   * exactamente o caso em que uma resposta condicional (ETag → 304) vale a
   * pena, como já acontece em /api/propostas e nas outras
   * listas do back office.
   *
   * Só que aqui o corpo NÃO se repete: cada capa e cada tira vêm num URL
   * assinado que leva a hora da assinatura, por isso dois pedidos seguidos
   * com os mesmos temas dão corpos diferentes. Um ETag tirado do corpo nunca
   * daria 304 nenhum.
   *
   * O que identifica a lista é o que está POR BAIXO das assinaturas: que
   * temas há, com que nome e notas, quantas fotos têm, e QUE ficheiros são a
   * capa e as tiras. É essa a forma que se carimba — os URLs entram nela sem
   * a parte assinada. Acrescentar uma foto, mudar a capa, renomear ou apagar
   * um tema muda o carimbo; voltar a assinar as mesmas fotos não muda.
   */
  return summaries;
}
