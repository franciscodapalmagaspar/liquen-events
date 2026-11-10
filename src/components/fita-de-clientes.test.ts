import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FITA DOS CLIENTES — AS TRÊS COISAS QUE ESTAVAM ERRADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou o site de um estúdio que gosta e disse que a fita deles é melhor
 * do que a nossa: mais rápida, e sem o botão de parar. A medir, o que se
 * encontrou foi pior — e melhor — do que «lenta».
 *
 * ── 1. O CICLO NUNCA FECHOU ──────────────────────────────────────────────
 *
 * Num `transform`, uma percentagem é da largura de CAIXA do elemento, não do
 * conteúdo. A fita vivia dentro de uma banda `overflow-hidden`, portanto a
 * caixa media a janela e o conteúdo transbordava. MEDIDO a 1440 px:
 *
 *     caixa 1440 px → o `-50%` deslocava 720 px
 *     uma cópia dos clientes: 2558 px
 *
 * Andava 720 e voltava ao princípio: um SALTO de 1838 px a cada volta.
 *
 * ── 2. A VELOCIDADE DEPENDIA DA JANELA ───────────────────────────────────
 *
 * `30s` é um tempo, não uma velocidade. A fita mede 3844 px num telemóvel e
 * 5053 num computador (o intervalo entre logótipos é maior a partir de `sm`),
 * portanto a mesma animação andava a ritmos diferentes — e juntar clientes
 * acelerava-a sem ninguém mexer em nada.
 *
 * ── 3. E A MINHA PRIMEIRA CORRECÇÃO TIROU-A DO COMPOSITOR ────────────────
 *
 * Pus a largura medida dentro dos fotogramas
 * (`translateX(calc(-1 * var(--fita-copia)))`). Fechava o ciclo e estragou o
 * resto: uma animação cujos VALORES dependem de uma variável CSS não pode ser
 * entregue ao compositor. MEDIDO com o relógio da animação contra o da parede:
 *
 *     1440 px   3000 ms de animação em 3000 ms reais   (100%)
 *      390 px   1900 ms de animação em 3000 ms reais    (63%)
 *
 * No telemóvel — que é onde ela vê o sítio — a fita passou a andar a dois
 * terços do que dizia. É esta a regressão que este ficheiro existe sobretudo
 * para impedir: é invisível a olho num computador e dá-se exactamente onde
 * mais dói.
 */

const RAIZ = process.cwd();
/**
 * As duas folhas juntas: o `@theme` saiu para o `tema.css` (ver o cabeçalho
 * desse ficheiro), e este teste também olha para a paleta.
 */
const css = () =>
  readFileSync(join(RAIZ, "src/app/globals.css"), "utf8") +
  readFileSync(join(RAIZ, "src/app/tema.css"), "utf8");
/**
 * O CÓDIGO do componente, sem os comentários.
 *
 * ── E isto não é higiene, é a razão de duas destas regras existirem ──────
 *
 * A primeira versão deste ficheiro procurava no texto todo. As duas regras
 * mais importantes — a caixa que cresce até ao conteúdo e o intervalo que vive
 * nas marcas — PASSAVAM com a correcção removida, porque as palavras `w-max` e
 * `gap-` aparecem nos comentários que explicam porque é que elas existem.
 *
 * Foi a verificação ao contrário que o apanhou: tirei o `w-max` do código e o
 * teste continuou verde. Um teste que não cai quando o defeito volta não é uma
 * rede — é uma decoração.
 */
const componente = () =>
  readFileSync(join(RAIZ, "src/components/ClientMarquee.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** O corpo do `@keyframes marquee`, sem comentários. */
function fotogramas(): string {
  const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
  const i = limpo.indexOf("@keyframes marquee");
  expect(i, "o `@keyframes marquee` desapareceu do globals.css").toBeGreaterThan(-1);
  const abre = limpo.indexOf("{", i);
  let profundidade = 0;
  for (let k = abre; k < limpo.length; k++) {
    if (limpo[k] === "{") profundidade++;
    else if (limpo[k] === "}" && --profundidade === 0) return limpo.slice(abre, k + 1);
  }
  throw new Error("o `@keyframes marquee` não fecha");
}

describe("a fita de clientes", () => {
  it("CONTROLO POSITIVO: o bloco dos fotogramas foi mesmo lido", () => {
    // Sem isto, um `@keyframes` renomeado dava uma cadeia vazia e as regras a
    // seguir passavam por não encontrarem nada que as violasse.
    const f = fotogramas();
    expect(f).toContain("transform");
    expect(f).toContain("translateX");
    expect(f.length).toBeGreaterThan(40);
  });

  it("OS FOTOGRAMAS NÃO PODEM DEPENDER DE UMA VARIÁVEL CSS", () => {
    /**
     * A regra mais importante deste ficheiro. Um valor de fotograma que venha
     * de um `var()` obriga o browser a recalcular a animação no fio principal
     * a cada quadro — e no telemóvel dela isso mediu-se: 63% do tempo real.
     *
     * A duração PODE vir de uma variável, e vem: o que trava o compositor são
     * os valores dos fotogramas, não quanto tempo eles levam.
     */
    expect(fotogramas(), "os fotogramas voltaram a depender de uma variável").not.toContain("var(");
  });

  it("o destino é uma percentagem — é ela que vale «uma cópia»", () => {
    expect(fotogramas()).toMatch(/translateX\(\s*-50%\s*\)/);
  });

  it("a caixa da fita cresce até ao conteúdo, senão a percentagem mente", () => {
    // `w-max`: sem isto a caixa media a janela e o `-50%` deslocava metade da
    // JANELA em vez de metade da fita. Era esse o salto de 1838 px.
    const m = componente().match(/className="([^"]*animate-marquee[^"]*)"/);
    expect(m, "não se encontrou a lista de classes da fita").not.toBeNull();
    expect(m![1], "a fita deixou de crescer até ao conteúdo").toMatch(/\bw-max\b/);
  });

  it("o intervalo entre logótipos vive nas MARCAS, não no contentor", () => {
    /**
     * Com `gap` no contentor, metade do conteúdo é uma cópia MAIS MEIO
     * intervalo — e o ciclo volta a não fechar, por pouco. Com o intervalo
     * dentro de cada marca, as duas cópias são exactamente iguais.
     */
    const src = componente();
    // A lista de classes da fita, e não o ficheiro: um `gap-` numa marca é
    // legítimo; o que não pode é estar no contentor.
    const m = src.match(/className="([^"]*animate-marquee[^"]*)"/);
    expect(m, "não se encontrou a lista de classes da fita").not.toBeNull();
    expect(m![1], "o `gap` voltou ao contentor da fita").not.toMatch(/\bgap-/);
    expect(m![1], "a fita deixou de crescer até ao conteúdo").toMatch(/\bw-max\b/);
    expect(src, "as marcas ficaram sem intervalo").toMatch(/\bme-\d+\b/);
  });

  it("passar o rato por cima já NÃO pára a fita", () => {
    // Palavras dela sobre o botão: «não quero isso». Uma fita que pára porque
    // o ponteiro lhe passou por cima lê-se como avaria, não como comando.
    const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(limpo, "o `:hover` voltou a parar a fita").not.toMatch(
      /\.animate-marquee:hover[^{]*\{[^}]*animation-play-state:\s*paused/,
    );
  });

  it("a velocidade é declarada em píxeis por segundo, com nome", () => {
    // Para ela poder pedir mais ou menos numa palavra, e para a fita andar ao
    // mesmo ritmo em qualquer ecrã e com qualquer número de clientes.
    expect(componente()).toMatch(/const PIXEIS_POR_SEGUNDO = \d+/);
  });

  it("o movimento reduzido continua a parar tudo", () => {
    // É o que substitui o botão desenhado para quem pediu ao sistema para não
    // ver movimento.
    const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
    /**
     * Há mais do que um bloco de movimento reduzido neste ficheiro, e o que
     * cala a fita não é o primeiro. Procura-se em TODOS — a primeira versão
     * deste teste olhava só para o primeiro e reprovava uma regra que estava
     * lá, dois blocos abaixo.
     */
    const blocos: string[] = [];
    const re = /@media[^{]*prefers-reduced-motion[^{]*\{/g;
    for (let m = re.exec(limpo); m; m = re.exec(limpo)) {
      let profundidade = 1;
      let k = m.index + m[0].length;
      for (; k < limpo.length && profundidade > 0; k++) {
        if (limpo[k] === "{") profundidade++;
        else if (limpo[k] === "}") profundidade--;
      }
      blocos.push(limpo.slice(m.index, k));
    }
    expect(blocos.length, "não há bloco de movimento reduzido nenhum").toBeGreaterThan(0);
    const cala = blocos.find((b) => /\.animate-marquee\b/.test(b) && /animation:\s*none/.test(b));
    expect(cala, "o movimento reduzido deixou de calar a fita").toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FUNDO DA FITA — a banda clara, que é o que ela quer
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta parte do ficheiro já disse o contrário, e vale a pena ficar escrito.
 *
 * Com a fotografia do sítio de que ela gosta ao lado da nossa, ela pediu:
 * «coloca transparente dentro da imagem de fundo». MEDIDO, a banda JÁ era
 * transparente (`rgba(0, 0, 0, 0)`) — o claro que ela via era o corpo da
 * página por baixo, entre duas secções escuras de bordo a bordo. Levei a fita
 * para dentro do herói, por cima da fotografia, com os logótipos claros.
 *
 * ── E ela viu, e disse que não ───────────────────────────────────────────
 *
 * «epa nao gosto deixa com a fita preta como estava», e logo a seguir, a
 * corrigir-se: «deixa com a fita branca».
 *
 * Portanto a fita volta a ser o que era: uma banda à parte, entre as secções,
 * clara, com as suas duas linhas, os logótipos a preto e as máscaras nas
 * pontas. Não é uma regressão — é a escolha dela, vista no telemóvel dela.
 *
 * As três coisas lá em cima (o ciclo que fecha, os 110 px/s, o botão fora do
 * desenho) NÃO dependem disto e ficam: o que se desfez foi só onde a fita
 * assenta e de que cor são os logótipos.
 */
describe("o fundo da fita", () => {
  it("a banda fecha-se nas suas duas linhas", () => {
    // `border-y` é o que a faz ler-se como um bloco à parte. Saiu quando a
    // fita foi para dentro da fotografia; volta com ela.
    expect(componente(), "as linhas que fecham a banda desapareceram").toMatch(/\bborder-y\b/);
  });

  it("a banda continua a não pintar fundo — o claro é a página", () => {
    /**
     * Vale a pena não confundir as duas coisas: ela quer a fita CLARA, e isso
     * consegue-se com a banda transparente sobre o corpo claro da página, que
     * é como sempre esteve. Pintar aqui um `bg-*` seria pintar por cima do
     * tema em vez de o deixar decidir.
     */
    const m = componente().match(/className="([^"]*relative[^"]*overflow-hidden[^"]*)"/);
    expect(m, "não se encontrou a banda").not.toBeNull();
    expect(m![1], "a banda passou a pintar um fundo próprio").not.toMatch(/\bbg-/);
  });

  it("os logótipos são ESCUROS — é uma banda clara", () => {
    /**
     * `brightness-0` pinta-os a preto. O `invert` a seguir tornava-os brancos,
     * e foi o que entrou quando a fita vivia sobre a fotografia — sobre o
     * claro da página isso é branco sobre branco, ou seja, uma fita vazia.
     */
    // Desde 9/11 é o filtro da tinta (`TintaDosLogotipos`): preto E sem
    // transparência — ela: «tudo com a mesma cor».
    expect(componente(), "não se encontrou o filtro da tinta").toMatch(/filter: FILTRO_DA_TINTA/);
    expect(componente(), "os logótipos ficaram brancos sobre a banda clara").not.toMatch(/\binvert\b/);
    const filtro = readFileSync(join(__dirname, "TintaDosLogotipos.tsx"), "utf8");
    // RGB a zero (preto) e o alfa multiplicado: a última linha da matriz.
    expect(filtro).toContain('values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 3 0"');
  });

  it("as máscaras das pontas estão lá", () => {
    // Desvanecem os logótipos para o `surface` da página nas duas pontas, em
    // vez de os cortar a direito. Sobre uma fotografia eram uma mancha; sobre
    // a página clara são o que sempre foram.
    const fonte = componente();
    expect(fonte, "a máscara da esquerda saiu").toMatch(/from-surface[^"]*to-transparent/);
    expect(
      (fonte.match(/from-surface/g) ?? []).length,
      "faltam máscaras — são duas, uma por ponta",
    ).toBe(2);
  });

  it("o nome do cliente, quando o logótipo falha, lê-se na banda clara", () => {
    /**
     * Branco a 70% era o que se lia sobre a fotografia. Sobre a banda clara
     * desaparece: o nome de recurso volta à tinta escura do tema.
     */
    expect(componente(), "o nome de recurso ficou branco sobre claro").toMatch(
      /text-foreground\/\d+/,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E A FITA VIVE FORA DO HERÓI — é a outra metade da mesma escolha dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas andam juntas, nos dois sentidos. Uma banda clara com logótipos
 * pretos colocada por cima da fotografia do herói fica preto sobre escuro,
 * tão invisível como o contrário. Se alguém voltar a levar a fita para dentro
 * do herói, tem de mexer também nas cores — e é isso que estas duas regras,
 * juntas, obrigam a notar.
 */
describe("onde a fita vive", () => {
  const paginas = [
    "src/app/[lang]/(site)/page.tsx",
    "src/app/[lang]/(site)/clientes/page.tsx",
  ] as const;

  /** O `<section>` do herói: do primeiro `<section` ao `</section>` que o fecha. */
  function heroi(caminho: string): string {
    const fonte = readFileSync(join(RAIZ, caminho), "utf8");
    const i = fonte.indexOf("<section");
    expect(i, `${caminho}: não tem ` + "`<section`").toBeGreaterThan(-1);
    const fim = fonte.indexOf("</section>", i);
    expect(fim, `${caminho}: o herói não fecha`).toBeGreaterThan(i);
    return fonte.slice(i, fim);
  }

  it("CONTROLO POSITIVO: os dois heróis foram mesmo lidos", () => {
    // Sem isto, um caminho errado dava uma cadeia vazia e a regra a seguir
    // passava por não encontrar nada — que, aqui, é o defeito ao contrário:
    // «não está no herói» é trivialmente verdade num ficheiro que não se leu.
    for (const p of paginas) {
      expect(heroi(p).length, `${p}: herói vazio`).toBeGreaterThan(400);
      expect(heroi(p), `${p}: o herói não tem fotografia`).toMatch(/HeroImage|SafeImage|Image/);
    }
  });

  it("CONTROLO POSITIVO: as duas páginas desenham mesmo a fita", () => {
    for (const p of paginas) {
      expect(readFileSync(join(RAIZ, p), "utf8"), `${p}: a fita desapareceu da página`).toContain(
        "<ClientMarquee />",
      );
    }
  });

  it("a fita é desenhada FORA do herói, nas duas páginas", () => {
    for (const p of paginas) {
      expect(
        heroi(p),
        `${p}: a fita voltou para dentro do herói — clara e com logótipos ` +
          "pretos, ali fica preto sobre escuro",
      ).not.toContain("<ClientMarquee />");
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ARMADILHA DO `@theme`: UM COMENTÁRIO `/**` APAGA A ENTRADA A SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Custou-me meia hora e vale a pena ficar preso.
 *
 * Acrescentei o `--color-noite` ao `@theme` com um comentário de bloco no
 * estilo do resto desta casa (`/**` … `*\/`). O CSS compilou sem um aviso, a
 * página serviu-se, e o `bg-noite` simplesmente NÃO EXISTIA: nem o utilitário,
 * nem a variável em `:root`. Os logótipos ficaram brancos sobre branco.
 *
 * MEDIDO no CSS servido: `me-12` e `w-max` — classes minhas do mesmo ficheiro —
 * estavam lá, portanto o Tailwind tinha lido o componente. O que faltava era só
 * a cor. Trocado o `/**` por um `/*` simples, apareceram os dois.
 *
 * Este ficheiro tem centenas de comentários `/**`. Sem esta rede, o próximo a
 * acrescentar uma cor perde a mesma meia hora — e, pior, pode não dar pela
 * falta se a cor não estiver à vista.
 */
describe("o bloco `@theme` do globals.css", () => {
  /** O corpo do `@theme`, do `{` ao `}` que o fecha. */
  const tema = () => {
    const fonte = css();
    const i = fonte.indexOf("@theme {");
    expect(i, "o bloco `@theme` desapareceu").toBeGreaterThan(-1);
    const abre = fonte.indexOf("{", i);
    let profundidade = 0;
    for (let k = abre; k < fonte.length; k++) {
      if (fonte[k] === "{") profundidade++;
      else if (fonte[k] === "}" && --profundidade === 0) return fonte.slice(abre, k + 1);
    }
    throw new Error("o `@theme` não fecha");
  };

  it("CONTROLO POSITIVO: o bloco foi lido e tem cores lá dentro", () => {
    // Sem isto, um `@theme` renomeado dava uma cadeia vazia e a regra seguinte
    // passava por não encontrar nada.
    expect(tema()).toContain("--color-");
    expect(tema().length).toBeGreaterThan(200);
  });

  it("não leva comentários `/**` — eles apagam a entrada seguinte, em silêncio", () => {
    expect(
      tema(),
      "um comentário `/**` dentro do `@theme` faz o Tailwind ignorar a declaração " +
        "a seguir: nem o utilitário nem a variável chegam a existir, e não há aviso nenhum. " +
        "Usa `/*` simples.",
    ).not.toContain("/**");
  });

  it("o `--color-noite` está lá, e é o mesmo tom das fotografias", () => {
    // Se desaparecer outra vez, a fita fica branca sobre branco.
    expect(tema()).toMatch(/--color-noite:\s*#12160f/i);
  });
});

describe("a Torre de Palma ao lado da Deloitte (ela, 9/11)", () => {
  it("o sorteio da ordem mantém o par lado a lado, em qualquer sorteio", async () => {
    const { sortearComPares } = await import("./ClientMarquee");
    const { clientLogos } = await import("@/data");
    let semente = 1;
    const aleatorio = () => ((semente = (semente * 16807) % 2147483647) - 1) / 2147483646;
    for (let k = 0; k < 200; k++) {
      const ordem = sortearComPares(clientLogos, aleatorio);
      expect(ordem).toHaveLength(clientLogos.length);
      const i = ordem.findIndex((c) => c.name === "Deloitte");
      expect(ordem[i + 1]?.name).toBe("Torre de Palma Wine Hotel");
    }
  });
});
