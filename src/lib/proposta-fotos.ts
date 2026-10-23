import "server-only";
import { createHash } from "node:crypto";
import { isPendingImage, type ProposalDoc } from "./proposal-doc";
/**
 * Do módulo das ASSINATURAS, e não do `proposal-storage`.
 *
 * É este `import` que mantém o `sharp` fora do grafo da página que o casal
 * abre — o porquê inteiro está no `proposal-assinaturas.ts`. Trocá-lo por
 * `./proposal-storage` volta a arrastar 87 ficheiros e 0,8 MB para dentro da
 * função, e desarma o passo que tira as bibliotecas nativas de imagem das
 * rotas que não as usam.
 */
import {
  signProposalMids,
  signProposalMidsAvif,
  signProposalPaths,
  signProposalThumbs,
} from "./proposal-assinaturas";
import { ehRefDeTema, caminhoDoRefDeTema } from "./theme-ref";
import { formasDeCaminhos, lqipsDeCaminhos } from "./biblioteca-fotos-store";
import { urlsGuardados, guardarUrls } from "./urls-assinados";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DE UMA PROPOSTA, PRONTAS PARA UM ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A página viva da proposta e a rota que a serve leem as fotografias DAQUI, e
 * de mais lado nenhum. Uma função e não duas verdades: se a rota assinasse por
 * sua conta, o dia em que uma das duas aprendesse uma regra nova (uma família
 * de referências, um prazo, um limite) seria o dia em que passariam a mostrar
 * coisas diferentes ao mesmo casal.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AS TRÊS REGRAS DE QUE NÃO SE ABRE MÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * **1. O que sai daqui NUNCA é um caminho de bucket.**
 *
 * Nem no valor, nem na CHAVE. A primeira versão disto devolvia um mapa
 * `caminho → URL`, o que parece inofensivo e não é: `<pedido>/<uuid>.jpg`
 * entrega o identificador interno do pedido, e `tema:outono-quente/ab12.jpg`
 * entrega os nomes das pastas da Biblioteca — a taxonomia do activo do
 * estúdio, à borla, a quem só devia ver as suas próprias fotografias. Cada
 * fotografia sai com um {@link FotoDaProposta.id} OPACO, que só quer dizer
 * alguma coisa dentro deste documento («a quarta foto do terceiro board»).
 *
 * **2. Só se assina o que está NAQUELE documento.**
 *
 * Por construção, e não por validação: esta função não aceita uma lista de
 * caminhos vinda de fora. Recebe o `ProposalDoc` e assina o que está escrito
 * lá dentro. Não há aqui um parâmetro por onde um caminho de outra proposta —
 * ou um `tema:` inventado com o nome de uma pasta adivinhada — possa entrar.
 * Uma rota que recebesse caminhos do cliente seria uma torneira aberta para a
 * biblioteca inteira, mesmo com o token certo na mão.
 *
 * **3. A grelha pede as MINIATURAS. O original é só o que a lupa abre.**
 *
 * As miniaturas são de 400 px e pesam ~30–60 KB; os originais pesam ~2,6 MB.
 * Com 46 fotografias é a diferença entre ~2 MB e ~120 MB numa grelha que tem
 * de abrir num telemóvel. O `/_next/image` está DESLIGADO neste projecto
 * (`images.loader: "custom"`), portanto não há redimensionamento a pedido: o
 * que existe é o ficheiro que está no bucket, e mais nada. As duas famílias
 * saem separadas — {@link FotoDaProposta.miniatura} e
 * {@link FotoDaProposta.original} — para que quem desenha não possa enganar-se
 * a escolher.
 *
 * Fotografias antigas podem não ter miniatura nenhuma (o bucket
 * `proposal-thumbs` é posterior a elas). Nesse caso `miniatura` vem ausente e
 * quem desenha cai para o original — feio na conta dos bytes, e melhor do que
 * uma célula vazia. Trata-se o caso; não se assume que existe.
 */

/** Uma fotografia do documento, já pronta para um `<img>`. */
export interface FotoDaProposta {
  /**
   * Identidade OPACA desta fotografia dentro deste documento.
   *
   * Estável entre pedidos (sai da POSIÇÃO no documento, não de um aleatório),
   * para a página e a rota falarem da mesma fotografia — e sem um único byte
   * do caminho real. Ver a regra 1 no cabeçalho.
   */
  id: string;
  /**
   * A MARCA desta fotografia: muda quando a fotografia daquele lugar muda.
   *
   * O {@link FotoDaProposta.id} diz o LUGAR (`b0f2` é «a terceira do primeiro
   * mood board»); a `marca` diz QUAL. São coisas diferentes, e confundi-las
   * custava caro: a rota que fabrica a derivada guardava-a no telemóvel do
   * casal por um dia, dizendo que o conteúdo de um `id` nunca muda. Muda —
   * basta ela rever o board, e o mesmo link salta para a revisão nova.
   *
   * É um resumo de sentido único da referência (ver `marcaDaRef`): não leva
   * nenhum byte do caminho real, e é por isso que pode ir num endereço.
   *
   * Ver `endereco-da-foto.ts`, que a põe lá, e porque é que tirar o
   * `immutable` não teria resolvido nada.
   */
  marca: string;
  /** O URL da derivada de 400 px. Ausente quando não há miniatura guardada. */
  miniatura?: string;
  /**
   * O URL da derivada de 1200 px, assinado DIRECTO do Storage.
   *
   * Ausente quando a derivada ainda não foi fabricada — e é essa ausência que
   * manda quem desenha usar a rota `/api/proposta/…/foto/…`, que a fabrica.
   * Ver `signProposalMids`: a rota deixa de ser o caminho de todos os dias e
   * passa a ser o de arranque.
   */
  media?: string;
  /**
   * A MESMA de 1200 px, em AVIF — uma OFERTA, não uma substituição.
   *
   * Quem desenha propõe-a primeiro num `<picture>`; o navegador que não a
   * souber ler pede a `media`, que existe sempre. Ausente é o caso NORMAL de
   * tudo o que foi carregado antes de este bucket existir, e não é erro
   * nenhum: sem ela a página fica exactamente como estava.
   *
   * Os mesmos pixéis da `media`, em ~28% menos bytes — a medição está no
   * `derivadas.ts`. Não se mexe na resolução de propósito: a queixa de
   * fotografias «desfocadas» veio de servir MENOS pixéis, e não se volta lá.
   */
  mediaAvif?: string;
  /** O URL do ficheiro grande. É o que a lupa abre, e SÓ isso. */
  original?: string;
  /** Largura do ficheiro em pixels, quando se sabe (ver `formasDeCaminhos`). */
  largura?: number;
  /** Altura do ficheiro em pixels, quando se sabe. */
  altura?: number;
  /** Um `data:` minúsculo para a célula não nascer em branco. Opcional. */
  lqip?: string;
}

/** Uma entrada do inventário: onde a foto está no documento, e o que ela é. */
interface Entrada {
  id: string;
  ref: string;
}

/**
 * Uma referência que já É um endereço — não se assina, usa-se como está.
 *
 * Duas famílias, as duas legítimas dentro de um `ProposalDoc` (ver
 * `fetchProposalImageBytes`, que aceita exactamente as mesmas): os bytes
 * embutidos das propostas anteriores ao Storage, e um URL completo.
 */
function enderecoDirecto(ref: string): string | null {
  if (ref.startsWith("data:")) return ref;
  if (/^https?:\/\//i.test(ref)) return ref;
  // Base64 cru, sem prefixo — a forma que `fetchProposalImageBytes` reconhece.
  // O tipo declarado é uma suposição, e é a única possível: quem gravou isto
  // não guardou nenhum. `image/jpeg` é o que o estúdio sempre gravou.
  if (!ref.includes("/") && ref.length > 128) return `data:image/jpeg;base64,${ref}`;
  return null;
}

/**
 * A marca de uma referência: curta, estável, e de sentido único.
 *
 * `sha256` truncado a 12 hexadecimais. Truncar é seguro aqui porque isto NÃO
 * é um segredo nem um validador de segurança: é um desempate de cache. O que
 * se lhe pede é que duas fotografias diferentes não caiam na mesma marca — e
 * 48 bits chegam de sobra para as poucas dezenas que um documento tem.
 *
 * De sentido único porque a referência É o caminho no bucket, e a regra 1
 * desta casa diz que ele nunca sai daqui. O casal recebe 12 caracteres que
 * não dizem nada sobre onde o ficheiro está.
 */
export function marcaDaRef(ref: string): string {
  return createHash("sha256").update(ref).digest("hex").slice(0, 12);
}

/**
 * O inventário das fotografias deste documento, pela ordem em que ele as
 * escreve: primeiro as da capa, depois as de cada mood board.
 *
 * As posições VAZIAS da capa contam para o índice e não para a lista — o
 * `normaliseCoverImages` deixa lá buracos de propósito, e um `id` que mudasse
 * de fotografia consoante a capa estivesse meia preenchida seria uma
 * identidade que não identifica nada.
 *
 * As fotografias `pending:` ficam de fora: o caminho está reservado e o
 * ficheiro ainda não foi escrito. Assinar um caminho no Storage NÃO garante
 * que o ficheiro lá esteja — devolve um URL bem formado para um 404.
 */
export function inventarioDeFotos(
  doc: Pick<ProposalDoc, "coverImages" | "moodBoards" | "escolhas"> &
    Partial<Pick<ProposalDoc, "fotosDasPaginas">>,
): Entrada[] {
  const out: Entrada[] = [];
  const juntar = (id: string, ref: unknown) => {
    if (typeof ref !== "string" || !ref) return;
    if (isPendingImage(ref)) return;
    out.push({ id, ref });
  };
  (doc.coverImages ?? []).forEach((ref, i) => juntar(`c${i}`, ref));
  (doc.moodBoards ?? []).forEach((board, b) =>
    (board?.images ?? []).forEach((ref, i) => juntar(`b${b}f${i}`, ref)),
  );
  // As fotografias das alternativas (Fase 3). Entram pelo MESMO caminho de
  // tudo o resto — assinadas em lote, com miniatura, forma e placeholder —
  // porque uma paleta explica-se com a fotografia e não com o nome dela. Uma
  // segunda escada só para estas seria uma segunda maneira de as fotos
  // falharem em silêncio.
  (doc.escolhas ?? []).forEach((escolha, e) =>
    (escolha?.opcoes ?? []).forEach((opcao, o) => juntar(`e${e}o${o}`, opcao?.imagem)),
  );
  // As que ela escolheu para as páginas do PDF (`fotosDasPaginas`) — a
  // proposta online (23/10) mostra as mesmas fotografias que o PDF, e algumas
  // vêm da biblioteca sem estarem em tema nenhum. O `id` diz a página pela
  // marca da chave (sem o nome dela) e o lugar.
  for (const [chave, e] of Object.entries(doc.fotosDasPaginas ?? {}))
    (e?.fotos ?? []).forEach((ref, i) => juntar(`p${marcaDaRef(chave).slice(0, 8)}f${i}`, ref));
  return out;
}

/**
 * As fotografias deste documento, assinadas e prontas a desenhar.
 *
 * Devolve a lista pela ordem do inventário. Uma fotografia que não se consiga
 * resolver de todo (assinatura falhada, Storage em baixo) sai com `original` e
 * `miniatura` ausentes em vez de desaparecer: quem desenha sabe que a
 * fotografia existe no documento e pode dizê-lo, em vez de mostrar um board
 * com menos fotos do que o casal tem no PDF que recebeu por email.
 *
 * ── O CUSTO, CONTADO ──────────────────────────────────────────────────────
 * Cinco idas ao Storage no total, sejam 4 fotografias ou 46: três lotes de
 * assinatura (originais, miniaturas e as derivadas de 1200 px), cada um deles
 * já dividido por bucket lá dentro (`assinarRefs`), em paralelo. Mais duas consultas à base de dados,
 * por PASTA e não por foto, para as formas e os placeholders. Nunca uma ida
 * por fotografia.
 */
export async function fotosDaProposta(
  doc: Pick<ProposalDoc, "coverImages" | "moodBoards" | "escolhas"> &
    Partial<Pick<ProposalDoc, "fotosDasPaginas">>,
): Promise<FotoDaProposta[]> {
  const inventario = inventarioDeFotos(doc);
  if (inventario.length === 0) return [];

  // As que precisam de assinatura, sem repetições: a MESMA fotografia pode
  // aparecer na capa e num board, e assinar duas vezes é pagar duas vezes.
  const porAssinar = [
    ...new Set(inventario.map((e) => e.ref).filter((r) => enderecoDirecto(r) === null)),
  ];

  // O caminho REAL de cada referência, para as consultas à base de dados: a
  // tabela `biblioteca_fotos` tem uma linha por ficheiro e a chave dela é o
  // caminho no bucket, sem o `tema:` que só existe dentro de um documento.
  const caminhoReal = (ref: string) => (ehRefDeTema(ref) ? caminhoDoRefDeTema(ref) : ref);
  const caminhos = porAssinar.map(caminhoReal);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE JÁ FOI ASSINADO UMA VEZ NÃO SE ASSINA OUTRA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «caso as pessoas vão ver as propostas outra vez no email,
   * mas já esteja muito mais rápido».
   *
   * Estava ao contrário. Isto assinava tudo A CADA VISITA, e o Supabase devolve
   * um token novo de cada vez — portanto o endereço de cada fotografia mudava
   * sempre. A chave da cache do navegador inclui o endereço inteiro, logo para
   * o telemóvel o mesmo ficheiro com outro endereço é OUTRA fotografia.
   *
   * As fotografias estão gravadas com validade de um ano, e esse ano nunca
   * valia nada: numa proposta de 46 fotografias, reabrir o link do email
   * voltava a descarregar 6,6 a 9,2 MB. Mais de meio minuto numa ligação rural.
   *
   * Guardar o endereço é seguro porque o conteúdo de um caminho nunca muda — a
   * razão longa está no `urls-assinados.ts`, e a garantia de que uma proposta
   * revista nunca serve um endereço velho também.
   */
  const guardados = await urlsGuardados(caminhos);

  /** O endereço guardado desta referência, nesta família — se ainda servir. */
  const doCache = (ref: string, familia: string): string | undefined =>
    guardados.get(caminhoReal(ref))?.[familia];

  /** As que ainda não têm endereço guardado nesta família são as que se assinam. */
  const emFalta = (familia: string) => porAssinar.filter((r) => !doCache(r, familia));

  const [originais, miniaturas, medias, mediasAvif, formas, lqips] = await Promise.all([
    signProposalPaths(emFalta("original")),
    signProposalThumbs(emFalta("miniatura")),
    // A de 1200 px assinada, quando já existe: é ela que a capa e a galeria
    // pedem num telemóvel, e era a única que fazia o desvio pela nossa função.
    signProposalMids(emFalta("media")),
    // E a oferta em AVIF da mesma, quando existir. Vai no mesmo lote de
    // assinaturas: uma ida a mais ao armazenamento por página, não por foto.
    signProposalMidsAvif(emFalta("mediaAvif")),
    formasDeCaminhos(caminhos),
    lqipsDeCaminhos(caminhos),
  ]);

  /** O endereço final de uma referência: o guardado, ou o acabado de assinar. */
  const enderecoDe = (ref: string, familia: string, frescos: Map<string, string>) =>
    doCache(ref, familia) ?? frescos.get(ref);

  /**
   * E o que foi assinado agora fica guardado, para a próxima visita não pagar.
   *
   * Com `await` e não solto: uma função sem estado pode ser congelada antes de
   * uma promessa por segurar chegar ao fim, e aí perdia-se exactamente a
   * gravação que faz isto valer a pena. Por fotografia, isto acontece uma vez
   * na vida dela.
   */
  const novos = new Map<string, Record<string, string>>();
  for (const [familia, frescos] of [
    ["original", originais],
    ["miniatura", miniaturas],
    ["media", medias],
    ["mediaAvif", mediasAvif],
  ] as const) {
    for (const ref of porAssinar) {
      const url = frescos.get(ref);
      if (!url) continue;
      const caminho = caminhoReal(ref);
      novos.set(caminho, { ...(novos.get(caminho) ?? {}), [familia]: url });
    }
  }
  await guardarUrls(novos, guardados);

  return inventario.map(({ id, ref }) => {
    const directo = enderecoDirecto(ref);
    if (directo) return { id, marca: marcaDaRef(ref), original: directo };
    const caminho = caminhoReal(ref);
    const forma = formas.get(caminho);
    const lqip = lqips.get(caminho);
    return {
      id,
      marca: marcaDaRef(ref),
      ...(enderecoDe(ref, "miniatura", miniaturas)
        ? { miniatura: enderecoDe(ref, "miniatura", miniaturas) }
        : {}),
      ...(enderecoDe(ref, "media", medias) ? { media: enderecoDe(ref, "media", medias) } : {}),
      ...(enderecoDe(ref, "mediaAvif", mediasAvif)
        ? { mediaAvif: enderecoDe(ref, "mediaAvif", mediasAvif) }
        : {}),
      ...(enderecoDe(ref, "original", originais)
        ? { original: enderecoDe(ref, "original", originais) }
        : {}),
      ...(forma ? { largura: forma.largura, altura: forma.altura } : {}),
      ...(lqip ? { lqip } : {}),
    };
  });
}
