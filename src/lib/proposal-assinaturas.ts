import "server-only";
import { getSupabase } from "./supabase";
import {
  THEME_AVIF_MID_BUCKET,
  THEME_BUCKET,
  THEME_MID_BUCKET,
  THEME_SIGNED_TTL,
  THEME_THUMB_BUCKET,
  caminhoDoRefDeTema,
  separarRefs,
} from "./theme-ref";
import { log } from "./logger";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ASSINAR ENDEREÇOS DE FOTOGRAFIAS — E MAIS NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto esteve dentro do `proposal-storage.ts`, e saiu de lá por uma razão que
 * não se vê no código: o PESO que a página da proposta leva consigo.
 *
 * ── A CONTA ───────────────────────────────────────────────────────────────
 *
 * A página que o casal abre precisa de UMA coisa do armazenamento: transformar
 * caminhos de fotografias em endereços assinados. Quatro funções, todas aqui.
 *
 * Só que estavam no mesmo ficheiro que a confirmação de carregamentos — que
 * usa o `sharp` para ler as dimensões de uma fotografia acabada de chegar. E
 * um `import` arrasta o ficheiro inteiro: a página do casal passava a ter o
 * `sharp` no seu grafo, e com ele 87 ficheiros e 0,8 MB de biblioteca de
 * tratamento de imagem que ela nunca chama.
 *
 * Isso, por si, é gordura. O que o torna importante é o passo seguinte: a
 * configuração manda as bibliotecas NATIVAS de imagem (17,8 MB) para todas as
 * rotas, e para as poder tirar das que não precisam é preciso primeiro que
 * seja VERDADE que esta página não precisa delas. Enquanto o `sharp` estiver
 * no grafo dela, tirar-lhe as bibliotecas seria armar uma avaria em vez de
 * resolver uma lentidão — e a rede do `peso-das-rotas.mjs` reprova, de
 * propósito, exactamente esse caso.
 *
 * ── A REGRA QUE ISTO CRIA ─────────────────────────────────────────────────
 *
 * Este ficheiro NÃO importa o `proposal-storage.ts`. A seta aponta só num
 * sentido: o ficheiro grande importa deste, nunca ao contrário. É isso que
 * mantém o grafo da página limpo, e é a única coisa a não esquecer aqui.
 */

export const PROPOSAL_BUCKET = "proposal-assets";

// 10-year signed URLs — effectively permanent for the admin's own preview use;
// the bucket stays private so nothing is publicly enumerable.
export const SIGNED_TTL = 60 * 60 * 24 * 365 * 10;

export const PROPOSAL_THUMB_BUCKET = "proposal-thumbs";

export const PROPOSAL_MID_BUCKET = "proposal-medias";

export const PROPOSAL_AVIF_MID_BUCKET = "proposal-avif-medias";

/**
 * Assina um lote contra UM bucket. `silencioso` para as derivadas: uma
 * instalação sem miniaturas devolve um mapa vazio e a grelha cai para o
 * original — isso é o comportamento normal, não um erro para os registos.
 */
export async function assinarLote(
  bucket: string,
  paths: string[],
  silencioso: boolean,
  ttl: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const sb = getSupabase();
  if (!sb || paths.length === 0) return out;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, ttl);
    if (error && !silencioso)
      log.error("proposal-storage: assinatura em lote falhou", error, { bucket, n: paths.length });
    for (const row of data ?? []) {
      if (row?.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch (e) {
    if (!silencioso)
      log.error("proposal-storage: assinatura em lote falhou", e, { bucket, n: paths.length });
  }
  return out;
}

/**
 * Assina uma lista de referências de documento **contra o bucket certo para
 * cada uma**, e devolve o mapa com a chave ORIGINAL.
 *
 * As duas famílias e porquê estão juntas: um mood board pode ter fotos
 * carregadas à mão (`<pedido>/<uuid>.jpg`, no bucket da proposta) misturadas
 * com fotos escolhidas da Biblioteca (`tema:<pasta>/<x>.jpg`, no bucket dos
 * temas). Quem desenha a grelha não devia ter de saber a diferença — passa a
 * lista toda e recebe um URL por referência.
 *
 * São dois pedidos, um por bucket, EM PARALELO — e não um pedido por foto. Com
 * um lote só de proposta (o caso de hoje) o segundo pedido nem chega a existir,
 * portanto isto custa exactamente o mesmo que custava.
 *
 * A chave do mapa é a referência tal como está no documento, `tema:` incluído.
 * O Storage devolve o caminho SEM prefixo, por isso é aqui que ele volta a ser
 * posto — se fosse omitido, quem chama procuraria pela chave que tem e não
 * encontrava nada.
 *
 * Cada bucket com o SEU prazo. A pasta de um pedido assina a 10 anos porque é
 * a pré-visualização dela própria; a biblioteca assina a 6 horas
 * ({@link THEME_SIGNED_TTL}) porque é o activo do estúdio inteiro. Assinar um
 * `tema:` com o prazo das propostas passaria calado e desfazia essa decisão.
 */
async function assinarRefs(
  refs: string[],
  bucketDaProposta: string,
  bucketDoTema: string,
  silencioso: boolean,
): Promise<Map<string, string>> {
  const { daBiblioteca, daProposta } = separarRefs(refs);
  const [proprias, deTema] = await Promise.all([
    assinarLote(bucketDaProposta, daProposta, silencioso, SIGNED_TTL),
    assinarLote(bucketDoTema, daBiblioteca.map(caminhoDoRefDeTema), silencioso, THEME_SIGNED_TTL),
  ]);
  for (const ref of daBiblioteca) {
    const url = deTema.get(caminhoDoRefDeTema(ref));
    if (url) proprias.set(ref, url);
  }
  return proprias;
}

export async function signProposalPaths(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_BUCKET, THEME_BUCKET, false);
}

export async function signProposalThumbs(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_THUMB_BUCKET, THEME_THUMB_BUCKET, true);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS DERIVADAS DE 1200 PX, DIRECTAS DO STORAGE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre a capa da proposta: «esta foto demora imenso tempo a
 * carregar, e eu quero que seja super rápida e fluida a aparecer».
 *
 * ── O caminho longo ───────────────────────────────────────────────────────
 *
 * A derivada intermédia era servida SEMPRE pela rota `/api/proposta/…/foto/…`,
 * e essa rota é um desvio: abre o token na base de dados, descarrega os bytes
 * do Storage para dentro da função, e só então os manda para o telemóvel. Os
 * mesmos bytes atravessam a nossa função a caminho de um sítio onde já estavam.
 * Com o arranque a frio de uma função é o dobro ou o triplo do tempo — e a capa
 * é a primeira coisa que o casal vê ao abrir o link.
 *
 * Assinada, a fotografia vem do CDN do Storage directamente ao telemóvel. É o
 * mesmo caminho que as miniaturas de 400 px já fazem, e é por isso que elas
 * apareciam depressa e a grande não aparecia.
 *
 * ── E porque é que a rota continua a existir ──────────────────────────────
 *
 * Porque uma derivada pode não existir ainda: o Supabase só assina o que lá
 * está, e um caminho em falta simplesmente não vem no mapa. Onde não vier, quem
 * desenha usa a rota — que a fabrica, guarda e serve. A rota deixa de ser o
 * caminho de todos os dias e passa a ser o de arranque, que é o seu lugar.
 *
 * `silencioso` como nas miniaturas: uma derivada por fabricar é o caso normal
 * de uma proposta acabada de enviar, e não um erro para escrever no registo.
 */
export async function signProposalMids(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_MID_BUCKET, THEME_MID_BUCKET, true);
}

/**
 * As mesmas de 1200 px, na oferta em AVIF.
 *
 * `silencioso`, e desta vez a palavra pesa mais do que nas outras: uma
 * derivada AVIF em falta é o caso NORMAL de tudo o que foi carregado antes
 * destes buckets existirem. Não é um erro, não se regista, e não se fabrica à
 * pressa dentro do pedido — quem não a tiver recebe o WebP de sempre, que é o
 * que o `<picture>` garante. É por isso que estas derivadas são «leves» no
 * lote: a página não depende delas para existir.
 */
export async function signProposalMidsAvif(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_AVIF_MID_BUCKET, THEME_AVIF_MID_BUCKET, true);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAPA DA PROPOSTA ONLINE NO COMPUTADOR, EM AVIF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (27/10): «sim, avança com a capa em AVIF», e escolheu «Mais rápida». No
 * telemóvel a capa passa à AVIF de 1200 (a de cima, os mesmos pixéis de hoje
 * em metade do peso); no ecrã grande, a de 1200 esticada a 1440 ficava
 * esbatida, e por isso a capa tem uma segunda, com o lado maior até 2000.
 *
 * Vive no MESMO bucket da AVIF de 1200, ao lado do ficheiro dela, com a chave
 * `<caminho>.capa.avif`. Sem bucket novo; e o sufixo não é um caminho de
 * fotografia válido (`isThemePath`), por isso nada a confunde com uma.
 *
 * Só a capa a tem, e só a fabrica quem monta a página (`capa-web.ts`).
 */
export const SUFIXO_DA_CAPA_WEB = ".capa.avif";

/** A chave da AVIF grande da capa, ao lado da AVIF de 1200 do mesmo caminho. */
export function chaveDaCapaWeb(caminho: string): string {
  return `${caminho}${SUFIXO_DA_CAPA_WEB}`;
}

/** As AVIF grandes das capas, por referência. Silencioso: a falta é normal. */
export async function signCapasWebAvif(refs: string[]): Promise<Map<string, string>> {
  const { daBiblioteca, daProposta } = separarRefs(refs);
  const [proprias, deTema] = await Promise.all([
    assinarLote(PROPOSAL_AVIF_MID_BUCKET, daProposta.map(chaveDaCapaWeb), true, SIGNED_TTL),
    assinarLote(
      THEME_AVIF_MID_BUCKET,
      daBiblioteca.map((r) => chaveDaCapaWeb(caminhoDoRefDeTema(r))),
      true,
      THEME_SIGNED_TTL,
    ),
  ]);
  const out = new Map<string, string>();
  for (const r of daProposta) {
    const url = proprias.get(chaveDaCapaWeb(r));
    if (url) out.set(r, url);
  }
  for (const r of daBiblioteca) {
    const url = deTema.get(chaveDaCapaWeb(caminhoDoRefDeTema(r)));
    if (url) out.set(r, url);
  }
  return out;
}
