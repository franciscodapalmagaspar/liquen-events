// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import Navbar from "./Navbar";
import Footer from "./Footer";
import LanguageToggle from "./LanguageToggle";
import ConsentBanner from "./ConsentBanner";
import StickyCTA from "./StickyCTA";
import WhatsAppButton from "./WhatsAppButton";
import ManageCookiesLink from "./ManageCookiesLink";
import ClientMarquee from "./ClientMarquee";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

import Home from "@/app/[lang]/(site)/page";
import Contacto from "@/app/[lang]/(site)/contacto/page";
import Destination from "@/app/[lang]/(site)/casamentos/destination/page";
import ServicoDetalhe from "@/app/[lang]/(site)/servicos/[slug]/page";
import Polo from "@/app/[lang]/(site)/casamentos/[polo]/page";
import Estilo from "@/app/[lang]/(site)/casamentos/estilo/[estilo]/page";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ALVOS DE TOQUE DO SÍTIO PÚBLICO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `TOUCH-AUDIT.md` mediu o BACK OFFICE e levou 95 alvos pequenos a zero. O
 * sítio público — o que os visitantes tocam — nunca tinha sido medido. Foi, com
 * `scripts/auditar-toque-publico.mjs` num iPhone SE (375 px) e TOQUE EMULADO:
 * **235 alvos abaixo de 44×44 px em onze páginas**. Quinze deles em todas as
 * páginas de uma vez, porque viviam no cabeçalho e no rodapé.
 *
 * Os piores, medidos:
 *
 *   PT / EN (selector de idioma)  31×29   em todas as páginas
 *   hambúrguer do cabeçalho       46×43   em todas as páginas
 *   email e telefone do rodapé   327×20   em todas as páginas
 *   Privacidade · Termos · Gerir cookies  ~17 px de altura
 *   "Pedir orçamento" flutuante  163×38   em todas menos duas
 *   email e telefone de /contacto 327×20
 *
 * ── PORQUE É QUE ISTO PRECISA DE UM TESTE, E NÃO SÓ DE UMA CORRECÇÃO ───────
 * Nenhum destes defeitos se vê no portátil de quem escreve o código: com rato,
 * um link de 17 px acerta-se sempre. Voltam a entrar sozinhos, uma linha de
 * cada vez, e só reaparecem numa medição com aparelho de toque emulado — que
 * ninguém corre a cada commit.
 *
 * ── O QUE ESTE FICHEIRO MEDE, E O QUE NÃO MEDE ────────────────────────────
 * Mede a DECLARAÇÃO, não a caixa pintada: o jsdom não faz disposição, e sem
 * disposição não há pixels. Quem mede pixels é o guião acima, num Chromium com
 * `hasTouch: true` — e essa distinção é o coração do problema, porque a classe
 * `.alvo-toque` só existe dentro de `@media (pointer: coarse)`: uma medição sem
 * toque emulado dá exactamente o mesmo número antes e depois de corrigir.
 *
 * ── A REGRA, E PORQUE É QUE É UMA REGRA E NÃO UMA LISTA ───────────────────
 * Uma lista dos alvos conhecidos passava a verde no dia em que alguém
 * escrevesse o seguinte. A regra é sobre TODOS os elementos interactivos que
 * estes componentes e estas páginas desenham por sua conta:
 *
 *   cada um declara a sua altura de toque de uma das duas formas que a casa
 *   admite — a classe `alvo-toque`, ou uma altura/preenchimento próprios que já
 *   valham 44 px.
 *
 * As duas únicas dispensas são elas próprias regras, não nomes:
 *
 *  1. UM LINK DENTRO DE UMA FRASE não é um alvo, é palavra sublinhada — o
 *     "Saber mais" do aviso de cookies, por exemplo. Cresce-lo partia a
 *     entrelinha do parágrafo, e as WCAG dispensam-no explicitamente
 *     (2.5.8, "inline"). A pergunta é feita ao DOM: o link corre dentro de um
 *     bloco de texto que tem bastante mais texto do que ele?
 *  2. UM ELEMENTO JÁ GRANDE POR CONSTRUÇÃO — um botão com `py-4`, um cartão com
 *     `aspect-[16/9]`. Não precisa da classe porque já tem a altura.
 */

/** 44 px = `h-11` na escala do Tailwind. */
const ALTURA_MINIMA_TW = 11;

/**
 * O elemento declara, sozinho, um alvo de pelo menos 44 px de altura?
 *
 * Só se olha para o que está ESCRITO nas classes — é tudo o que há sem
 * disposição. Cada ramo desta função corresponde a uma forma que este
 * repositório usa mesmo:
 */
function declaraAlturaDeToque(classes: string): boolean {
  const lista = classes.split(/\s+/).filter(Boolean);
  for (const c of lista) {
    // `alvo-toque` — o mecanismo da casa (globals.css), 44 px só no dedo.
    if (c === "alvo-toque") return true;
    // Uma variante não conta como declaração: `sm:h-11` deixa o telemóvel de
    // fora, e o telemóvel é exactamente o caso.
    const nu = c.replace(/^!/, "");
    if (nu.includes(":")) continue;
    // `h-11` / `min-h-11` e acima, ou uma altura em píxeis explícita.
    const alt = /^(?:min-)?h-(\d+(?:\.\d+)?)$/.exec(nu);
    if (alt && Number(alt[1]) >= ALTURA_MINIMA_TW) return true;
    const altPx = /^(?:min-)?h-\[(\d+)px\]$/.exec(nu);
    if (altPx && Number(altPx[1]) >= 44) return true;
    // `py-3.5` / `p-3.5` (14 px de cada lado) já leva um texto normal aos 44.
    // A pílula de WhatsApp é `p-3.5` à volta de um ícone de 20 px: 48.
    const pad = /^p[yb]?-(\d+(?:\.\d+)?)$/.exec(nu);
    if (pad && Number(pad[1]) >= 3.5) return true;
    // Um cartão/painel: a caixa é a imagem, não o texto.
    if (/^aspect-/.test(nu) || nu === "inset-0") return true;
  }
  return false;
}

/**
 * É palavra sublinhada a meio de uma frase?
 *
 * A mesma pergunta que o auditor do varrimento faz, aqui feita ao DOM do jsdom:
 * o link vive dentro de um bloco de texto corrido que tem bastante mais texto
 * do que ele. Sem `getComputedStyle` fiável para `display` neste ambiente, é o
 * texto à volta que decide — e é o que distingue um "Saber mais" no fim de um
 * parágrafo de um email que ocupa a sua própria linha.
 */
function ehPalavraNumaFrase(el: Element): boolean {
  if (el.tagName !== "A") return false;
  const bloco = el.closest("p, li, dd, blockquote, figcaption, label");
  if (!bloco || bloco === el) return false;
  const meu = (el.textContent ?? "").trim().length;
  return (bloco.textContent ?? "").trim().length > meu + 20;
}

/** As classes como texto, também em `<svg>` (onde `.className` é um objecto). */
const classesDe = (el: Element) => el.getAttribute("class") ?? "";

function descrever(el: Element): string {
  const nome =
    el.getAttribute("aria-label") || (el.textContent ?? "").trim().slice(0, 40) || el.tagName;
  return `<${el.tagName.toLowerCase()}> "${nome}"  class="${classesDe(el)}"`;
}

/**
 * Terceira dispensa, e só existe do lado do DOM: UM LINK CUJA ALTURA VEM DE
 * DENTRO. O logótipo do cabeçalho mede 128 px porque a marca mede 128 px; os
 * dois cartões de serviço do menu medem 81 px porque a miniatura lá dentro é
 * `h-14`. Em nenhum dos dois o texto manda na caixa, e pôr-lhes `alvo-toque`
 * não acrescentava um pixel.
 *
 * Vale para `<img>` e não para `<svg>`, de propósito: os três ícones de redes
 * do rodapé são `<svg>` de 19 px dentro de uma caixa de 35, e eram achados a
 * sério.
 *
 * É uma dispensa de DECLARAÇÃO, como todo este ficheiro: quem garante que a
 * imagem é mesmo grande é a medição em píxeis do `auditar-toque-publico.mjs`.
 */
const temAlturaPorDentro = (el: Element) =>
  el.querySelector("img") !== null ||
  // `getAttribute("class")` e não `.className`: num `<svg>` o segundo é um
  // `SVGAnimatedString`, e os ícones do rodapé são todos `<svg>`.
  Array.from(el.querySelectorAll("*")).some((f) => declaraAlturaDeToque(classesDe(f)));

/**
 * ── O QUE NÃO É UM ALVO DE TOQUE: o que não se pode tocar ────────────────
 *
 * O `sr-only` do Tailwind é `position:absolute` com 1×1 píxel e um `clip` que
 * corta o resto. Um elemento assim não está no ecrã: não há dedo que lhe
 * acerte, nem por sorte. Exigir-lhe 44 px é exigir uma medida a uma coisa que
 * não tem tamanho — e, pior, obrigaria a escrever no código uma promessa
 * («este alvo tem 44 px») que é falsa.
 *
 * Onde isto aparece: o comando de parar a fita de logótipos. Ela pediu que o
 * botão desaparecesse do desenho; a WCAG 2.2.2 pede que exista um comando. Fica
 * `sr-only` até receber foco — invisível para quem usa o dedo, presente para
 * quem usa o Tab.
 *
 * A dispensa é ESTREITA de propósito: só o que declara `sr-only`. Quem quiser
 * esconder um alvo a sério por aqui esconde-o de toda a gente, e isso é outro
 * defeito — este ficheiro guarda o tamanho, não a existência.
 */
const ehSoParaLeitorDeEcra = (el: Element) => /(^|\s)sr-only(\s|$)/.test(classesDe(el));

/** A regra, aplicada a uma árvore já no DOM. */
function verificarArvore(raiz: ParentNode, ondeVem: string) {
  const alvos = Array.from(raiz.querySelectorAll("a[href], button, [role=button]"));
  // Não passar por vacuidade: uma árvore sem alvos nenhuns tornava a regra
  // verdadeira sem verificar nada — foi assim que se perdeu o flutuante.
  expect(alvos.length, `${ondeVem} não desenhou nenhum elemento interactivo`).toBeGreaterThan(0);
  for (const el of alvos) {
    if (ehPalavraNumaFrase(el) || temAlturaPorDentro(el) || ehSoParaLeitorDeEcra(el)) continue;
    expect(
      declaraAlturaDeToque(classesDe(el)),
      `${ondeVem}: sem alvo de 44 px — ${descrever(el)}`,
    ).toBe(true);
  }
}

/* ── O cromado: o que aparece em TODAS as páginas ──────────────────────────
   Estes oito componentes são responsáveis por quinze dos vinte achados da
   página inicial. Corrigidos uma vez, ficam corrigidos em toda a parte — e é
   por isso que a rede tem de estar aqui e não em cada página. */

vi.mock("next/navigation", () => ({ usePathname: () => "/sobre" }));

const dicionario = await getDictionary("pt");

function montar(node: React.ReactNode) {
  return render(
    <LocaleProvider locale="pt" dict={pickChromeDict(dicionario)}>
      {node}
    </LocaleProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  // O jsdom não traz `matchMedia`, e o cabeçalho e o marquee perguntam por ele
  // (fecho do menu ao passar para `lg`, movimento reduzido). Sem o esboço o
  // teste rebenta dentro de um efeito e a falha que se lê não tem nada a ver
  // com alvos de toque.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }));
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Os dois flutuantes só se desenham depois de o browser estar ocioso. */
function passarOOcioso() {
  act(() => vi.advanceTimersByTime(500));
}

describe("a classe que cura os alvos continua a existir", () => {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

  it("`.alvo-toque` continua a valer 44×44 px", () => {
    // Sem isto, tudo o que se segue media a presença de uma palavra sem efeito.
    expect(css).toMatch(/\.alvo-toque\s*\{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.alvo-toque\s*\{[^}]*min-width:\s*44px/);
  });

  it("e continua a valer só em ponteiro grosso", () => {
    // A outra metade do contrato: no portátil o sítio fica como está. Se esta
    // condição cair, 190 alvos crescem 13 px de uma vez sem ninguém pedir.
    const antes = css.slice(0, css.indexOf(".alvo-toque {"));
    expect(antes.lastIndexOf("@media (pointer: coarse)")).toBeGreaterThan(
      antes.lastIndexOf("}\n@media"),
    );
  });

  it("`.link-line` deixa o alvo de toque mandar no `display`", () => {
    // `.link-line` está fora de camadas e ganhava ao `inline-flex` do
    // `.alvo-toque`: os links do rodapé cresciam para 44 px com o texto colado
    // ao topo da caixa. Ver o comentário longo em globals.css.
    expect(css).toMatch(/\.link-line\.alvo-toque\s*\{[^}]*display:\s*inline-flex/);
    expect(css).toMatch(/\.link-line\.alvo-toque\s*\{[^}]*align-items:\s*center/);
  });
});

describe("o cromado que aparece em todas as páginas", () => {
  it("o cabeçalho", () => {
    const { container } = montar(<Navbar />);
    verificarArvore(container, "Navbar");
  });

  it("o selector de idioma", () => {
    const { container } = montar(<LanguageToggle />);
    verificarArvore(container, "LanguageToggle");
  });

  it("o rodapé", () => {
    const { container } = montar(<Footer locale="pt" />);
    verificarArvore(container, "Footer");
  });

  it("o link de gerir cookies", () => {
    const { container } = montar(<ManageCookiesLink locale="pt" />);
    verificarArvore(container, "ManageCookiesLink");
  });

  it("o aviso de cookies", () => {
    const { container } = montar(<ConsentBanner locale="pt" />);
    // Aceitar e Recusar têm de ser IGUAIS também no alvo: a orientação da CNPD
    // exige que recusar seja tão fácil como aceitar, e um alvo mais pequeno
    // para o "Recusar" seria uma forma de dark pattern medida em píxeis.
    verificarArvore(container, "ConsentBanner");
  });

  it("o CTA flutuante", () => {
    const { container } = montar(<StickyCTA />);
    passarOOcioso();
    verificarArvore(container, "StickyCTA");
  });

  it("a pílula de WhatsApp", () => {
    const { container } = montar(<WhatsAppButton />);
    passarOOcioso();
    verificarArvore(container, "WhatsAppButton");
  });

  it("o comando de pausa do desfile de logótipos", () => {
    const { container } = montar(<ClientMarquee />);
    /**
     * O comando EXISTE — a WCAG 2.2.2 pede-o para um movimento que arranca
     * sozinho e não pára. O que mudou é que deixou de se ver: ela pediu que o
     * botão saísse do desenho, e ele passou a `sr-only` até receber foco.
     *
     * Por isso este passeio já não mede 44 px nele (ver `ehSoParaLeitorDeEcra`)
     * e mede outra coisa: que ele continua lá, alcançável e com nome.
     */
    verificarArvore(container, "ClientMarquee");
    const comando = container.querySelector("button[aria-pressed]");
    expect(comando, "o comando de parar a fita desapareceu").not.toBeNull();
    expect(classesDe(comando!), "deixou de estar escondido").toMatch(/(^|\s)sr-only(\s|$)/);
    expect(
      classesDe(comando!),
      "escondido e sem forma de aparecer: quem usa teclado deixa de o ver",
    ).toMatch(/focus:not-sr-only/);
    expect((comando!.textContent ?? "").trim().length, "o comando ficou sem nome").toBeGreaterThan(
      3,
    );
  });
});

/* ── As páginas, pela árvore que devolvem ─────────────────────────────────
   Os componentes de cliente (o formulário, os carrosséis, a barra fixa)
   aparecem na árvore por REFERÊNCIA, com os filhos por desenhar — e é o que se
   quer: os alvos deles são responsabilidade deles, e estão cobertos acima. O
   que aqui se verifica é o que a página escreve com as suas próprias mãos, que
   é onde um link novo nasce sem ninguém reparar. */

interface No {
  type?: unknown;
  props?: { children?: unknown; href?: unknown; className?: unknown };
}

/**
 * Os elementos com `href` que a página desenha, com o texto do bloco à volta —
 * para poder aplicar a mesma dispensa de "palavra numa frase" sem DOM.
 */
function alvosDaArvore(arvore: unknown) {
  const alvos: { href: string; className: string; ehPalavra: boolean }[] = [];
  function texto(no: unknown): string {
    if (typeof no === "string") return no;
    if (Array.isArray(no)) return no.map(texto).join("");
    if (!no || typeof no !== "object") return "";
    return texto((no as No).props?.children);
  }
  function descer(no: unknown, blocoDeTexto: unknown) {
    if (Array.isArray(no)) {
      for (const filho of no) descer(filho, blocoDeTexto);
      return;
    }
    if (!no || typeof no !== "object") return;
    const n = no as No;
    if (!n.props) return;
    // Um `<p>`/`<li>`/`<label>` abre um bloco de texto corrido; é dentro deles
    // que um link pode ser palavra em vez de alvo.
    const bloco = typeof n.type === "string" && /^(p|li|dd|blockquote|label)$/.test(n.type);
    const contexto = bloco ? n : blocoDeTexto;
    if (typeof n.props.href === "string") {
      const meu = texto(n.props.children).trim().length;
      const aoRedor = contexto ? texto((contexto as No).props?.children).trim().length : meu;
      alvos.push({
        href: n.props.href,
        className: String(n.props.className ?? ""),
        ehPalavra: aoRedor > meu + 20,
      });
    }
    descer(n.props.children, contexto);
  }
  descer(arvore, null);
  return alvos;
}

async function verificarPagina(nome: string, arvore: unknown) {
  const alvos = alvosDaArvore(arvore);
  expect(alvos.length, `${nome} não desenhou nenhuma âncora própria`).toBeGreaterThan(0);
  for (const a of alvos) {
    if (a.ehPalavra) continue;
    expect(
      declaraAlturaDeToque(a.className),
      `${nome}: sem alvo de 44 px — <a href="${a.href}"> class="${a.className}"`,
    ).toBe(true);
  }
}

describe("as páginas públicas, pelas âncoras que escrevem", () => {
  for (const lang of ["pt", "en"]) {
    it(`/${lang} — a página inicial`, async () => {
      await verificarPagina(`/${lang}`, await Home({ params: Promise.resolve({ lang }) }));
    });

    it(`/${lang}/contacto`, async () => {
      await verificarPagina(
        `/${lang}/contacto`,
        await Contacto({ params: Promise.resolve({ lang }) }),
      );
    });

    it(`/${lang}/casamentos/destination`, async () => {
      await verificarPagina(
        `/${lang}/casamentos/destination`,
        await Destination({ params: Promise.resolve({ lang }) }),
      );
    });

    it(`/${lang}/servicos/casamentos`, async () => {
      await verificarPagina(
        `/${lang}/servicos/casamentos`,
        await ServicoDetalhe({ params: Promise.resolve({ lang, slug: "casamentos" }) }),
      );
    });

    /**
     * ── AS DUAS PÁGINAS DE CAMPANHA QUE FALTAVAM AQUI ──────────────────────
     *
     * O `destination` já estava; o PÓLO e o ESTILO não — e são 13 + 3 páginas,
     * vezes dois idiomas, todas destinos de anúncios pagos. MEDIDO num Chromium
     * a 375 px com toque emulado, na versão servida em produção:
     *
     *   /casamentos/alentejo            «Formulário completo»  189×17
     *                                   «+351 919 259 820»     137×17
     *                                   «Portefólio»            96×17
     *   /casamentos/estilo/minimalista  treze ligações de região, 15 px de
     *                                   altura cada («Alentejo» 82×15,
     *                                   «Comporta, Melides e Troia» 237×15, …)
     *
     * Em ambos os casos são as ÚNICAS saídas de quem chega ao fim da página sem
     * ter preenchido o formulário do topo. Um pólo chega para prender as treze:
     * a página é uma só, com os dados a mudar.
     */
    it(`/${lang}/casamentos/alentejo — um pólo`, async () => {
      await verificarPagina(
        `/${lang}/casamentos/alentejo`,
        await Polo({ params: Promise.resolve({ lang, polo: "alentejo" }) }),
      );
    });

    it(`/${lang}/casamentos/estilo/minimalista`, async () => {
      await verificarPagina(
        `/${lang}/casamentos/estilo/minimalista`,
        await Estilo({ params: Promise.resolve({ lang, estilo: "minimalista" }) }),
      );
    });
  }
});
