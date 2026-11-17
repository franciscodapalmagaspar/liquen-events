import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS QUATRO SÍTIOS DO ECRÃ DOS PEDIDOS QUE APARECIAM A SECO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `entrada-do-que-aparece.test.ts` guarda as NOVE superfícies que aparecem
 * por cima da página. Estes quatro não estavam nessa lista, e por isso não
 * estavam em lista nenhuma:
 *
 *   1. **A caixa do painel do pedido.** O véu acendia em 240 ms e a caixa
 *      estava lá desde o primeiro fotograma — meio gesto. E fechava a seco,
 *      os dois de uma vez.
 *   2. **Os dois `<details>` do painel** («plano de decoração», «histórico de
 *      atividade»). O corpo entrava e saía do fluxo sem transição nenhuma.
 *   3. **Os filtros do telemóvel.** Passavam de `hidden` a `grid` num
 *      fotograma, com a lista inteira a descer atrás deles.
 *   4. **O lote do «Mostrar mais».** As linhas novas montavam-se sem gesto: a
 *      única pista de que alguma coisa tinha acontecido era a barra de rolagem
 *      a encolher.
 *
 * ── O QUE ESTE FICHEIRO PRENDE, E O QUE NÃO ───────────────────────────────
 *
 * Prende o VOCABULÁRIO (a classe certa, no sítio certo, com os números da
 * casa) e as três DECISÕES que custaram medição e que a leitura de um diff não
 * mostra: que o painel não se desloca, que o `<details>` continua nativo, e
 * que só o lote novo se anima.
 *
 * Não prende a GEOMETRIA: o jsdom não tem disposição, e todo o
 * `getBoundingClientRect` dá zero. A fresta que a deslocação abria na aresta
 * do ecrã foi medida num Chromium a sério — o instrumento é o
 * `e2e/entrada-da-gaveta.mjs`, corre com `node e2e/entrada-da-gaveta.mjs`, e o
 * que deu está escrito lá dentro. O ciclo de vida da saída está no
 * `AdminClient.saida-da-gaveta.test.tsx`.
 */

const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";
const FONTE = readFileSync(RAIZ + "AdminClient.tsx", "utf8");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS = readFileSync("src/app/globals.css", "utf8") + readFileSync("src/app/admin.css", "utf8");

/** Comentários fora, com as linhas de pé — a regra da casa. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(FONTE);

/** O corpo de uma regra do `globals.css`, pelo selector. */
function regra(selector: string): string {
  const i = CSS.indexOf(selector + " {");
  expect(i, `não encontrei a regra ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("}", i));
}

describe("os números escritos à mão continuam a ser os da casa", () => {
  /**
   * ── PORQUE É QUE HÁ NÚMEROS ESCRITOS À MÃO ────────────────────────────────
   *
   * Duas das quatro entradas não podem usar a `.bo-entrada` nua. O corpo de um
   * `<details>` precisa de `group-open:` (senão a animação corre uma vez e
   * nunca mais — está medido no `AdminClient.tsx`), e as linhas do lote
   * precisam de um `:has()` para alcançar o `<tr>`/`<li>`, que são de outro
   * ficheiro. Uma variante do Tailwind só sabe prefixar UTILITÁRIOS, e
   * `bo-entrada` é uma classe escrita à mão: `group-open:bo-entrada` não
   * compila. Sobra o atalho `animate-[…]`, com os números por extenso.
   *
   * É uma segunda cópia da mesma verdade, e uma segunda cópia sem guarda é uma
   * divergência à espera de acontecer. É isto a guarda: mexer nos 240 ms ou na
   * curva do `globals.css` põe este caso vermelho em vez de deixar dois sítios
   * a discordar em silêncio.
   */
  const ATALHOS = [...CODIGO.matchAll(/animate-\[bo-entrada_([^\]]+)\]/g)].map((m) => m[1]);

  it("há mesmo atalhos para guardar — senão este ficheiro não guarda nada", () => {
    // Controlo positivo: sem isto, apagar os dois atalhos deixava os casos
    // seguintes a passar sobre listas vazias. São dois, os dois do lote — o
    // `<tr>` do computador e o `<li>` do telemóvel.
    expect(ATALHOS.length, "os atalhos `animate-[bo-entrada_…]` desapareceram").toBe(2);
  });

  it("todos dizem a MESMA duração e a MESMA curva da `.bo-entrada`", () => {
    const daCasa = regra(".bo-entrada").match(/animation:\s*bo-entrada\s+([^;]+)/);
    expect(daCasa, "a `.bo-entrada` deixou de declarar uma animação").not.toBeNull();
    // No CSS há espaços; no atalho do Tailwind há sublinhados e a curva vem
    // sem espaços. Compara-se o mesmo texto normalizado dos dois lados.
    const normal = (s: string) =>
      s
        .replace(/[\s_]+/g, " ")
        .replace(/,\s*/g, ",")
        .trim();
    for (const atalho of ATALHOS) {
      expect(normal(atalho), `um atalho divergiu da .bo-entrada: ${atalho}`).toBe(
        normal(daCasa![1]),
      );
    }
  });

  it("e nenhum corre para quem pediu para não animar", () => {
    // A `.bo-entrada` traz a guarda dentro dela (`@media prefers-reduced-motion`
    // no `globals.css`); o atalho do Tailwind NÃO a herda — é outra classe. Sem
    // `motion-safe:` na frente, estes três animavam para quem foi ao sistema
    // operativo pedir que não se animasse.
    for (const m of CODIGO.matchAll(/([^\s"'`]*animate-\[bo-entrada[^\]]*\])/g)) {
      expect(m[1], `atalho sem guarda de movimento reduzido: ${m[1]}`).toContain("motion-safe:");
    }
  });
});

describe("1 · a caixa do painel do pedido entra, e sai", () => {
  it("o véu acende E apaga-se — e os dois com a palavra do FUNDO", () => {
    // O véu já tinha entrada. O que faltava era a outra metade: apagava-se num
    // fotograma enquanto a caixa por cima dele desaparecia ao mesmo tempo.
    expect(CODIGO).toMatch(/painelASair[\s\S]{0,120}SAIDA_FUNDO[\s\S]{0,140}bo-entrada-fundo/);
  });

  it("a caixa entra com a `.bo-entrada` e sai com a `.bo-saida`", () => {
    expect(CODIGO).toMatch(/painelASair \? SAIDA : "bo-entrada"/);
  });

  it("e NÃO se desloca um píxel — nem a entrar nem a sair", () => {
    /**
     * A decisão que custou a medição. A gaveta é `fixed inset-y-0`: encosta às
     * duas arestas do ecrã, e qualquer `translateY` abre uma fresta da altura
     * da deslocação numa delas — a lista a espreitar por baixo de uma gaveta
     * que existe para a tapar. MEDIDO em Chromium a 390×844
     * (`e2e/entrada-da-gaveta.mjs`): 3,08 px de fresta com a deslocação de
     * omissão, 0,00 com o zero.
     *
     * O zero vive no `style` e não numa classe `-fundo` emprestada: esta caixa
     * não é um véu, e chamar-lhe um só para lhe apanhar o zero fazia-a passar
     * a ser lida como tal.
     */
    expect(CODIGO).toContain('"--bo-entrada-y": "0px"');
    expect(CODIGO).toContain('"--bo-saida-y": "0px"');
  });

  it("a saída larga os toques E o teclado", () => {
    // O `pointer-events: none` vem dentro da `.bo-saida` (é o ponto mais
    // importante da regra, e está escrito lá). O `inert` é a mesma frase dita
    // ao teclado e ao leitor de ecrã: sem ele, durante 200 ms havia um painel
    // a desaparecer onde ainda se entrava com o Tab.
    expect(CODIGO).toContain("inert={painelASair}");
    expect(regra(".bo-saida")).toContain("pointer-events: none");
  });

  it("as três portas de fechar passam todas pela mesma saída", () => {
    // O «×», o véu e o Escape. Um painel que sai por um caminho e pisca no
    // outro lê-se como duas coisas diferentes.
    expect(CODIGO).toMatch(
      /function closeDetail\(\)\s*\{\s*if \(discardGuard\(\)\) sairDoPainel\(/,
    );
    expect(CODIGO, "o Escape voltou a desmontar à bruta").not.toMatch(
      /window\.confirm\("Tem alterações por guardar neste pedido\. Descartar\?"\)\s*\)\s*\{\s*setSelected\(null\)/,
    );
    expect(CODIGO).toMatch(/sairDoPainel\(selected\.id\)/);
  });

  it("e a saída é da GAVETA, não da coluna do computador", () => {
    /**
     * A partir de `xl` o painel é uma coluna DENTRO da grelha, e a grelha
     * reparte-se pelo que lá está. Segurá-la 200 ms a desvanecer-se não animava
     * a mudança de duas faixas para uma: a lista ficava estreita durante a
     * saída e SALTAVA no fim — o mesmo corte seco, 200 ms mais tarde e com uma
     * animação por cima a dizer que não era. É a fronteira que o `ui/saida.ts`
     * já descreve: o hook serve o que está FORA de fluxo.
     */
    expect(CODIGO).toMatch(/if \(!isDetailOverlay \|\| id === null\) \{\s*setSelected\(null\);/);
  });

  it("o relógio da saída não fecha um pedido que ela abriu entretanto", () => {
    // Durante os 200 ms a lista continua viva. Ela pode fechar um pedido e
    // abrir outro nesse intervalo, e o relógio do primeiro não pode levar o
    // segundo à frente.
    expect(CODIGO).toMatch(/setSelected\(\(prev\) => \(prev && prev\.id === id \? null : prev\)\)/);
    expect(CODIGO, "ninguém esquece a saída quando ela deixa de ter sujeito").toContain(
      "podarSaidaDoPainel([])",
    );
  });

  it("usa a peça da casa, e não uma saída própria", () => {
    expect(CODIGO).toContain('from "./ui/saida"');
    expect(CODIGO).toContain("useSaidaAdiada(");
    // Um `setTimeout` de 200 escrito à mão aqui seria uma segunda saída.
    expect(CODIGO, "saída escrita à mão em vez do hook").not.toMatch(/setTimeout\([^)]*,\s*200\)/);
  });
});

describe("2 · os dois «mais campos» do painel", () => {
  const detalhes = [...CODIGO.matchAll(/<details\b/g)];

  it("continuam a ser `<details>` NATIVOS — não trocaram de elemento por React", () => {
    /**
     * O `<details>` foi escolhido a sério: abre sem uma linha de JavaScript e
     * o «localizar na página» do browser encontra-o mesmo fechado. Trocá-lo por
     * `useState` só para poder animar seria pagar as duas coisas por um gesto.
     */
    expect(detalhes.length, "os `<details>` do painel desapareceram").toBe(2);
    expect(CODIGO, "alguém pôs o `open` do `<details>` em estado do React").not.toMatch(
      /<details[^>]*\bopen=\{/,
    );
  });

  it("e usam a palavra da CASA, não uma escrita aqui", () => {
    /**
     * O `ui/gaveta.ts` conta dez gavetas no back office e trata sete; estas
     * duas estão lá dadas como «fora de alcance» por viverem neste ficheiro.
     * Ficam dentro — uma palavra escrita duas vezes é o passo antes de haver
     * duas palavras, e é o defeito que esta casa já teve com a leitura da
     * preferência de movimento.
     *
     * Este caso é a outra ponta da varredura do `gaveta-que-abre.test.tsx`:
     * lá guardam-se os sete, aqui os dois que ele não alcança.
     */
    expect(CODIGO).toContain('from "./ui/gaveta"');
    expect(CODIGO.match(/useGaveta\(\)/g)?.length, "uma gaveta ficou sem estado").toBe(2);
    expect(CODIGO.match(/aoTocarNoResumo/g)?.length, "um resumo não arma a abertura").toBe(2);
    expect(CODIGO.match(/aoAlternar/g)?.length, "um fecho não desarma a abertura").toBe(2);
    expect(CODIGO.match(/\.corpo\}/g)?.length, "um corpo ficou sem classe").toBe(2);
  });

  it("armada pelo GESTO, e não pelo `[open]` — senão corre uma vez e nunca mais", () => {
    /**
     * MEDIDO num Chromium 141, e é a razão de a peça existir: com a
     * `.bo-entrada` pousada no corpo, a animação corre à PRIMEIRA abertura e
     * nunca mais — opacidade 0,22 / 1,00 / 1,00 dois fotogramas depois de cada
     * uma de três aberturas. A animação é do elemento, e o elemento não volta a
     * montar (é isso que o `<details>` nativo faz de bom). Armá-la no gesto
     * repõe a classe a cada abertura — e, de lambuja, deixa de animar o que
     * ninguém abriu: uma gaveta encontrada pelo ⌘F do browser não anima nada.
     *
     * O instrumento é o `e2e/entrada-que-se-repete.mjs`.
     */
    expect(CODIGO, "a classe voltou a ficar pousada no corpo").not.toMatch(
      /className=\{`[^`]*\bbo-entrada\b[^`]*`\}[\s\S]{0,40}(ProductionPlan|ActivityLog)/,
    );
  });

  it("e as setas não escolhem a sua própria duração", () => {
    /**
     * A seta já rodava, e roda mesmo: neste Tailwind o utilitário
     * `transition-transform` compila para `transition-property: transform,
     * translate, scale, rotate` e portanto cobre a propriedade autónoma que o
     * `rotate-90` emite. (A armadilha conhecida é a outra forma:
     * `transition-[transform]` sai literal, e essa não cobriria o `rotate`.)
     *
     * O que faltava era a DURAÇÃO: sem `duration-*` a transição cai nos 150 ms
     * do `--default-transition-duration` do Tailwind, que não é degrau nenhum
     * desta casa e que ninguém escolheu. A `SETA_DA_GAVETA` traz-lha, e traz a
     * mesma a todas as setas do back office.
     */
    expect(CODIGO.match(/SETA_DA_GAVETA/g)?.length).toBe(3); // o import e as duas setas
    const rodam = CODIGO.match(/group-open:rotate/g)?.length ?? 0;
    expect(rodam, "uma seta a rodar sem a peça").toBe(2);
    // E a guarda é sobre a LISTA DE CLASSES da seta, não sobre o ficheiro: há
    // `transition-transform` noutros sítios deste ecrã que não são setas de
    // gaveta nenhuma, e chumbá-los aqui era mandar corrigir o que está certo.
    for (const m of CODIGO.matchAll(/className=\{`([^`]*group-open:rotate[^`]*)`\}/g)) {
      expect(m[1], "transição escrita à mão ao lado da rotação").not.toMatch(
        /transition-transform|transition-\[transform\]|duration-/,
      );
    }
  });
});

describe("3 · os filtros do telemóvel", () => {
  const painel = CODIGO.match(/id="painel-filtros-pedidos"[\s\S]{0,400}?className=\{`([^`]+)`\}/);

  it("o instrumento encontrou mesmo o painel", () => {
    expect(painel, "o painel dos filtros mudou de forma").not.toBeNull();
  });

  it("fechado continua a fechar com `hidden` — e NÃO com `opacity-0`", () => {
    /**
     * A correcção errada óbvia. O `hidden` é estrutural: fechado, o painel
     * também não se percorre com o teclado nem com o leitor de ecrã. Trocá-lo
     * por `opacity-0` dava a animação e deixava seis controlos invisíveis no
     * caminho do Tab.
     */
    expect(painel![1]).toContain('"hidden"');
    expect(painel![1], "o `hidden` deu lugar a uma opacidade").not.toContain("opacity-0");
  });

  it("e aberto entra de algum sítio", () => {
    expect(painel![1]).toMatch(/filtrosAbertos \? "grid bo-entrada"/);
  });
});

describe("4 · o lote do «Mostrar mais»", () => {
  const bloco = CODIGO.match(/className=\{`bo-cena flex min-w-0 flex-col gap-3 ([^`]+)`\}/);

  it("o bloco da lista traz a entrada do lote", () => {
    expect(bloco, "o bloco da lista de Pedidos mudou de forma").not.toBeNull();
    expect(bloco![1]).toContain("${ENTRADA_DO_LOTE}");
  });

  it("que alcança a LINHA inteira, e não a célula", () => {
    /**
     * O `<tr>` do computador e o `<li>` do telemóvel são do
     * `ui/TabelaOuCartoes.tsx`, que não aceita classe por linha. Animar célula
     * a célula dava sete animações por linha e deixava de fora o fio que
     * separa as linhas — viam-se os fios a aparecer a seco e o conteúdo a
     * acender por dentro deles. Com `:has()` a marca vai onde se chega e a
     * animação vai onde pertence.
     */
    const constante = CODIGO.match(/const ENTRADA_DO_LOTE =\s*([\s\S]*?);/);
    expect(constante).not.toBeNull();
    expect(constante![1]).toContain("li:has([data-lote-novo])");
    expect(constante![1]).toContain("tr:has([data-lote-novo])");
  });

  it("SÓ o lote novo se anima — a lista que já lá estava não se reanima", () => {
    // Reanimar o que já estava no ecrã era dizer que também aquilo acabou de
    // chegar, e é mentira.
    expect(CODIGO).toContain("data-lote-novo={ctx.ehDoLoteNovo?.(q) ?");
    expect(CODIGO).toContain("data-lote-novo={doLoteNovo ?");
    expect(CODIGO).toMatch(/setInicioDoLote\(visibleCount\);/);
  });

  it("e a marca cai quando a lista volta ao princípio", () => {
    // Sem isto, as primeiras linhas de uma procura nova entravam como se
    // tivessem acabado de ser acrescentadas por um «Mostrar mais».
    expect(CODIGO).toMatch(/setVisibleCount\(LIST_PAGE_SIZE\);[\s\S]{0,80}setInicioDoLote\(null\)/);
  });

  it("as linhas novas SOBEM — vêm do fim da lista, que é onde nascem", () => {
    expect(CODIGO).toContain('"--bo-entrada-y": "4px"');
  });

  it("e a lista continua SEM `key` — um `key` remonta e perde o rolo", () => {
    const i = CODIGO.indexOf("<TabelaOuCartoes");
    expect(i, "a lista de Pedidos mudou de componente").toBeGreaterThan(-1);
    const chamada = CODIGO.slice(i, CODIGO.indexOf("\n                  />", i));
    expect(chamada, "o instrumento não apanhou a chamada inteira").toContain('legenda="Pedidos"');
    expect(chamada, "a lista de Pedidos ganhou um `key`").not.toMatch(/\bkey=/);
  });

  it("sem escada: o lote entra como UM bloco", () => {
    // A regra da casa é escada por bloco e nunca por linha. Cinquenta linhas
    // escalonadas eram exactamente a segunda coisa.
    const constante = CODIGO.match(/const ENTRADA_DO_LOTE =\s*([\s\S]*?);/)![1];
    expect(constante, "apareceu um atraso por linha no lote").not.toMatch(/--cena|animation-delay/);
  });
});
