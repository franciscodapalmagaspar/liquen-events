import { type ThemeImage, type ThemeSummary } from "@/lib/theme-types";
import { type Ahead as AheadDaPasta } from "../tipos-da-pasta";
import {
  type PaginaTema,
  buscarPrimeiraPagina,
  buscarTemas,
  esquecerBiblioteca,
  paginaEmCache,
} from "../../theme-picker-cache";

/**
 * A biblioteca vista do seletor: o que se guarda entre aberturas (a última
 * página de cada tema, as miniaturas, o tema em que estava), os palpites que
 * a fazem abrir instantânea (`prefetchTheme`, a dica ao passar por cima do
 * botão) e os rótulos de cada tema. Saiu do topo do `ThemePicker.tsx`
 * (fase 8), tal e qual.
 */

/** Último tema usado, para abrir já no sítio certo na proposta seguinte. */
export const LAST_THEME_KEY = "liquen-tema-recente";

/** Quantas miniaturas se aquecem ao adivinhar um tema (o rato passou por cima
 *  do separador, ou do botão que abre a biblioteca). É a primeira dobra e mais
 *  uma linha: o que ela vai VER antes de rolar. Só miniaturas — aquecer
 *  originais seria trocar 25 KB por 2,6 MB de palpite. */
const WARM_THUMBS = 15;

/** O que a pastilha de um tema mostra a seguir ao nome. `imageCount` a `null` =
 *  a pasta não pôde ser lida — dizer "0" faria a equipa pensar que as fotos
 *  desapareceram; `truncated` = a contagem é um MÍNIMO ("500+"). */
export function themeCountLabel(theme: ThemeSummary): string {
  // Com mais de 150 temas a lista chega sem a contagem dos últimos (9/11,
  // `resumoPendente`): não é uma pasta ilegível, é uma pasta por perguntar.
  if (theme.resumoPendente) return "";
  if (theme.imageCount === null) return "Fotos indisponíveis";
  return theme.truncated ? `${theme.imageCount}+` : `${theme.imageCount}`;
}

/**
 * O que um leitor de ecrã anuncia num separador de tema.
 *
 * No ecrã, o nome e a contagem são dois elementos com um `gap` entre eles — mas
 * no DOM não há espaço nenhum a separá-los, e o nome acessível saía colado:
 * «Tema 211» em vez de «Tema 2, 11 fotos». O `gap` é desenho; a vírgula é
 * língua.
 */
export function themeButtonLabel(theme: ThemeSummary): string {
  if (theme.resumoPendente) return theme.name;
  if (theme.imageCount === null) return `${theme.name}, fotos indisponíveis`;
  const n = theme.imageCount;
  const contagem = theme.truncated ? `mais de ${n} fotos` : n === 1 ? "1 foto" : `${n} fotos`;
  return `${theme.name}, ${contagem}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Cache da biblioteca (vive no módulo, sobrevive a fechar o diálogo)
// ───────────────────────────────────────────────────────────────────────────

/** Onde o rolo de cada tema ficou, entre aberturas do seletor. */
export const themeScroll = new Map<string, number>();

/** A página guardada de um tema, tolerando "ainda não há tema escolhido" — que
 *  é o estado do diálogo antes de a lista chegar. */
export const cachedTheme = (themeId: string | null): PaginaTema | null =>
  themeId ? paginaEmCache(themeId) : null;

/** O tema em que o diálogo estava quando fechou (a memória curta; o
 *  `localStorage` é a longa, entre sessões). */
let lastThemeId: string | null = null;

/**
 * A miniatura de cada foto já vista, por caminho.
 *
 * A seleção atravessa temas (é uma lista de caminhos, não de índices), mas a
 * grelha só tem em mãos as imagens do tema ABERTO. Sem esta memória, a página
 * em construção desenhava um quadrado cinzento para tudo o que tivesse sido
 * escolhido noutro separador — que é precisamente o caso em que ver o conjunto
 * interessa mais.
 *
 * Só guarda o `thumbUrl` (ou o `url` quando não há miniatura): são endereços,
 * não bytes, e o browser já tem as imagens em cache de ter desenhado a grelha.
 */
export const miniaturaDe = new Map<string, string>();

export function guardarMiniaturas(images: readonly ThemeImage[]): void {
  for (const im of images) {
    const u = im.thumbUrl || im.url;
    if (u) miniaturaDe.set(im.path, u);
  }
}

/**
 * Deita fora o que está guardado da biblioteca.
 *
 * O `theme-picker-cache` já se defende do que é velho sozinho, revalidando por
 * trás. Isto é para o caso em que esperar não serve: uma foto foi ADICIONADA
 * ou REMOVIDA num tema (o que acontece no ecrã `Temas`, não aqui) e a abertura
 * seguinte tem de ver isso já, não daqui a meio minuto.
 *
 * Fica à escuta do evento `liquen:biblioteca-alterada` para esse ecrã poder
 * avisar sem que este módulo precise de o conhecer. O que se limpa aqui a mais
 * do que lá é o rolo: a grelha vai mudar de tamanho, e devolver o scroll a uma
 * posição que já não existe deixava-a a olhar para o meio do nada.
 */
export function invalidateThemeLibraryCache(): void {
  esquecerBiblioteca();
  themeScroll.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("liquen:biblioteca-alterada", invalidateThemeLibraryCache);
}

/** Põe as miniaturas na cache do browser antes de a grelha as pedir. */
function warmThumbs(images: readonly ThemeImage[]): void {
  if (typeof window === "undefined" || typeof window.Image !== "function") return;
  for (const im of images.slice(0, WARM_THUMBS)) {
    // Só `thumbUrl`: uma foto sem miniatura custa ~2,6 MB e tem a sua própria
    // fila (ver `HEAVY_IMAGE_CONCURRENCY`). Adivinhar não pode furar essa fila.
    if (!im.thumbUrl) continue;
    const img = new window.Image();
    img.decoding = "async";
    img.src = im.thumbUrl;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE TEMA É QUE O DIÁLOGO ABRE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quatro respostas, por esta ordem — e a ordem é a decisão toda:
 *
 * 1. O tema que ela escolheu NESTA sessão. É o acto mais recente e mais
 *    explícito que existe: escolheu «Boho» há dois minutos, fechou, reabriu.
 *    Mandá-la de volta para outro sítio seria desfazer-lhe a escolha.
 *
 * 2. O tema de que ESTA PROPOSTA já está a beber. Palavras dela: «o seletor
 *    abre sem saber em que proposta estou». Quando se está a encher o quarto
 *    mood board de um casamento cujos três primeiros vieram todos de «Itália»,
 *    abrir em «Terracotta» — porque foi nisso que se tocou ONTEM, noutro
 *    casamento — é abrir no sítio errado com toda a informação para acertar.
 *
 *    Vem do que já foi importado para este pedido (`usadas`), e é o tema mais
 *    representado entre elas: uma foto solta de outro tema não muda o rumo.
 *
 * 3. O da sessão passada (`localStorage`). Continua a ser melhor do que nada,
 *    mas é o palpite mais fraco dos três — é memória de outro dia e, muitas
 *    vezes, de outro casamento. Por isso perde para o contexto.
 *
 * 4. O primeiro da lista.
 */
export function preferredThemeId(
  list: readonly ThemeSummary[],
  /** Caminhos da biblioteca já usados nesta proposta (`<tema>/<ficheiro>`). */
  usadas?: readonly string[],
): string | null {
  if (lastThemeId && list.some((t) => t.id === lastThemeId)) return lastThemeId;

  const doPedido = temaMaisUsado(usadas);
  if (doPedido && list.some((t) => t.id === doPedido)) return doPedido;

  let saved: string | null = null;
  try {
    saved = localStorage.getItem(LAST_THEME_KEY);
  } catch {
    /* localStorage indisponível — segue com o primeiro tema */
  }
  if (saved && list.some((t) => t.id === saved)) return saved;
  return list[0]?.id ?? null;
}

/**
 * O tema mais representado numa lista de caminhos da biblioteca, ou `null`.
 *
 * Empate resolve-se pelo primeiro a chegar ao topo, e não interessa qual: um
 * empate quer dizer que a proposta bebe dos dois na mesma medida, e nesse caso
 * qualquer um deles é uma abertura defensável.
 */
export function temaMaisUsado(caminhos?: readonly string[]): string | null {
  if (!caminhos || caminhos.length === 0) return null;
  const conta = new Map<string, number>();
  let melhor: string | null = null;
  let maximo = 0;
  for (const c of caminhos) {
    const corte = c.indexOf("/");
    if (corte <= 0) continue;
    const tema = c.slice(0, corte);
    const n = (conta.get(tema) ?? 0) + 1;
    conta.set(tema, n);
    if (n > maximo) {
      maximo = n;
      melhor = tema;
    }
  }
  return melhor;
}

/** Adivinha um tema: metadados + miniaturas, sem nada no ecrã ainda. */
export function prefetchTheme(themeId: string): void {
  const have = cachedTheme(themeId);
  if (have) {
    warmThumbs(have.images);
    return;
  }
  void buscarPrimeiraPagina(themeId)
    .then((entry) => warmThumbs(entry.images))
    .catch(() => {
      /* adivinhar e falhar não é um erro que se mostre: quem abrir pede outra vez */
    });
}

/**
 * Aquece a biblioteca ANTES de o diálogo abrir: a lista de temas e as
 * miniaturas do tema por onde ele vai abrir.
 *
 * Exportada para quem desenha o botão "Escolher da biblioteca de temas" a
 * poder chamar no `onPointerEnter`/`onFocus`. Como esse botão vive noutro
 * ficheiro, há também a rede de segurança abaixo, que apanha o gesto por
 * delegação. Idempotente e barata: com cache, não faz nada.
 */
export function prefetchThemeLibrary(): void {
  void buscarTemas()
    .then((list) => {
      const id = preferredThemeId(list);
      if (id) prefetchTheme(id);
    })
    .catch(() => {});
}

/**
 * O gesto que abre a biblioteca começa a carregá-la.
 *
 * Por delegação no documento, e não por um `onPointerEnter` no botão, porque o
 * botão é do estúdio de propostas. Quem quiser ser explícito marca-o com
 * `data-biblioteca-temas`; sem marca, reconhece-se pelo nome ("Escolher da
 * biblioteca de temas"). Custa uma leitura de `textContent` no rato a passar e
 * o resultado é o diálogo abrir já com as fotos desenhadas.
 */
const OPEN_HINT = /biblioteca de temas/i;

let hintInstalled = false;

function installOpenHint(): void {
  if (hintInstalled || typeof document === "undefined") return;
  hintInstalled = true;
  const hint = (e: Event) => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const trigger = el.closest("[data-biblioteca-temas],button,a");
    if (!trigger) return;
    if (
      !trigger.hasAttribute("data-biblioteca-temas") &&
      !OPEN_HINT.test(trigger.textContent ?? "")
    )
      return;
    prefetchThemeLibrary();
  };
  document.addEventListener("pointerover", hint, { passive: true });
  document.addEventListener("focusin", hint, { passive: true });
}

installOpenHint();

/** O tema em que o seletor ficou da última vez (a memória curta). */
export function temaLembrado(): string | null {
  return lastThemeId;
}

/** Lembra o tema em que o seletor está, para o abrir lá da próxima vez. */
export function lembrarTema(id: string | null): void {
  lastThemeId = id;
}

/** Esquece a biblioteca, o tema lembrado e as miniaturas. Só para testes. */
export function esquecerSeletor(): void {
  invalidateThemeLibraryCache();
  lastThemeId = null;
  miniaturaDe.clear();
}

/** A página seguinte da grelha do seletor: a mesma da pasta, e também o tema
 *  com que foi buscada — só encaixa onde foi pedida. */
export interface Ahead extends AheadDaPasta {
  themeId: string;
}
