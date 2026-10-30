import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DA FLUIDEZ — que propriedades o movimento do sítio pode animar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Um browser tem três maneiras de responder a uma mudança de
 * estilo, e custam ordens de grandeza diferentes:
 *
 *   · COMPOSITOR — `transform` e `opacity`. A camada já está rasterizada; o
 *     compositor só a volta a colar noutro sítio ou com outra transparência.
 *     Corre FORA da linha principal, por isso continua fluido mesmo com a
 *     linha principal ocupada. É isto que se quer.
 *   · PINTURA — `color`, `background-color`, `background-position`,
 *     `background-size`, `box-shadow`, `filter`, `clip-path`, `stroke-*`. A
 *     camada tem de ser redesenhada a cada frame. Aceitável num botão pequeno
 *     ao passar o rato; caro numa superfície grande que esteja no ecrã durante
 *     o scroll.
 *   · LAYOUT — `width`, `height`, `top/left/right/bottom`, `margin`, `padding`,
 *     `gap`, `font-size`. O browser tem de voltar a CALCULAR a geometria antes
 *     de desenhar seja o que for, e isso é sempre na linha principal, no
 *     caminho crítico do frame. É a categoria que engasga o scroll.
 *
 * O QUE FOI MEDIDO (Pixel 7 emulado, cópia isolada do repositório, travessia de
 * 12 gestos a descer + 12 a subir na página inicial, `Performance.getMetrics`
 * do CDP):
 *
 *   · Com o sítio como está: 76–78 passagens de layout por travessia.
 *   · Com as transições de ALTURA da barra de navegação desligadas: 18–19.
 *
 * Ou seja: uma única transição — `transition-[height]` na barra e no logótipo,
 * quando o scroll passa os 30 px — responde por ~76% de todo o layout que o
 * sítio faz enquanto se desce a página. É a ÚNICA animação de layout que resta.
 *
 * PORQUE NÃO FOI REMOVIDA. Porque medir o custo não é o mesmo que ele ser
 * sentido. No A/B emparelhado (`e2e/scroll-emparelhado.mjs`, 20 pares, ordem
 * ABBA, uma só compilação), com a travessia curta que CONCENTRA o efeito — 3
 * gestos, em que os dois cruzamentos do limiar ocupam ~40% do tempo em vez de
 * ~7% — a diferença emparelhada foi de +12 ms medianos num jank de base de
 * 179 ms (~7%), com o pior par a A em 13 de 20 (teste do sinal p = 0,26) e uma
 * MDE de 210 ms. Abaixo da MDE a resposta honesta é NÃO SEI, e não "não há
 * diferença" — mas também não há aqui nada que justifique redesenhar a barra e
 * arriscar mudar o aspecto. Fica inventariada, medida, e em paz.
 *
 * O QUE ESTE FICHEIRO GARANTE. Que não aparece uma SEGUNDA. O inventário acima
 * só vale enquanto for verdade, e a maneira de deixar de o ser é alguém
 * escrever `transition-all` ou `transition-[width]` num sítio qualquer sem
 * reparar. As excepções abaixo estão nomeadas uma a uma, com a razão; qualquer
 * animação de layout NOVA — no CSS global ou na cromagem pública, que é a que
 * está no ecrã durante o scroll — põe este teste vermelho.
 */

const RAIZ = process.cwd();
/** Prosa não é código: metade deste ficheiro são comentários que FALAM de
 *  curvas e de propriedades, e um extractor ingénuo lê-os como declarações.
 *  (Só `/* … *​/` — em CSS `//` não é comentário e apagá-lo partiria os `url()`.) */
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "");
/**
 * As duas folhas juntas. O `@theme` mudou de casa: vive no `tema.css`, para o
 * `admin.css` o poder referir sem herdar o `@source not` do `globals.css` —
 * essa exclusão é absoluta e punha o back office sem estilos nenhuns. Ver o
 * cabeçalho do `tema.css`.
 *
 * E o `admin.css`: o CSS do back office escrito à mão saiu do `globals.css`
 * (que vai embutido em todas as páginas públicas) para lá, e uma regra não
 * deixa de ter de ser fluida por ter mudado de ficheiro.
 */
const css = semComentarios(
  readFileSync(join(RAIZ, "src/app/globals.css"), "utf8") +
    readFileSync(join(RAIZ, "src/app/tema.css"), "utf8") +
    readFileSync(join(RAIZ, "src/app/admin.css"), "utf8"),
);

/** Propriedades cuja animação OBRIGA a recalcular geometria. */
const LAYOUT = [
  "width",
  "height",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "margin",
  "padding",
  "gap",
  "row-gap",
  "column-gap",
  "font-size",
  "line-height",
  "flex-basis",
  "grid-template-rows",
  "grid-template-columns",
  "border-width",
];

/** `transition: all` conta como layout: promete animar tudo, layout incluído. */
const eLayout = (prop: string) => {
  const p = prop.trim().toLowerCase();
  if (p === "all") return true;
  return LAYOUT.some(
    (l) => p === l || p.startsWith(`${l}-`) || p.startsWith(`max-${l}`) || p.startsWith(`min-${l}`),
  );
};

/**
 * As excepções. Cada uma tem de trazer a razão — e as duas primeiras têm os
 * números do cabeçalho por trás. Acrescentar uma linha aqui é uma decisão
 * consciente, que é exactamente o que se pretende.
 *
 * ACTUALIZAÇÃO — SAIU (auditoria externa, A2). A auditoria pediu-o por nome:
 * «manter a altura fixa e animar só transform e opacity». A barra passou a
 * uma fila de 76 px que desce por `translate`, com dois logótipos que trocam
 * por `opacity` e `scale` (ver a nota no Navbar.tsx). A excepção deixou de
 * existir e saiu da lista abaixo — a rede passa a apanhar quem a puser de volta.
 */
const PERDOADAS_NO_CSS = new Set<string>([
  // (Vazia desde 30/10. O `background-size` do filete de foco do orçamento
  // estava aqui; o campo passou a caixa redonda, que só transiciona cor,
  // contorno e uma sombra interior, e a excepção saiu — a rede volta a apanhar
  // quem a puser de volta.)
]);

/** Ficheiros que estão SEMPRE montados e no ecrã enquanto se faz scroll. */
const CROMAGEM_PUBLICA = [
  "src/components/Navbar.tsx",
  "src/components/StickyCTA.tsx",
  "src/components/ScrollProgress.tsx",
  "src/components/WhatsAppButton.tsx",
  "src/components/Footer.tsx",
];

/**
 * As excepções na cromagem, por ficheiro e classe literal. São as que existiam
 * quando o inventário foi feito e medido; a rede é contra as PRÓXIMAS.
 */
const PERDOADAS_NA_CROMAGEM = new Map<string, string[]>([
  [
    "src/components/Navbar.tsx",
    [
      // Só correm ao abrir/fechar o menu mobile (o hambúrguer a virar cruz, o
      // filete do item activo a crescer). Nunca durante o scroll.
      "transition-all",
    ],
  ],
  [
    "src/components/WhatsAppButton.tsx",
    [
      // O hover do botão muda cor de fundo, sombra E escala ao mesmo tempo;
      // `all` aqui é o conjunto que se quer mesmo animar. Só em ponteiro fino,
      // e só enquanto o rato está em cima.
      "transition-all",
    ],
  ],
  [
    "src/components/StickyCTA.tsx",
    [
      // MEDIDO antes de perdoar, e não assumido. `transition-all` num elemento
      // fixo que atravessa o scroll inteiro parecia o suspeito óbvio; a sonda de
      // `transitionrun` mostrou que no instante em que o CTA aparece arrancam
      // nele exactamente DUAS transições — `opacity` e `translate` —, porque uma
      // transição só arranca nas propriedades que MUDAM mesmo. As duas são de
      // compositor. Estreitar a lista não tiraria trabalho nenhum ao browser,
      // por isso não se mexe: uma alteração sem número a favor é ruído no diff.
      "transition-all",
    ],
  ],
]);

/** Extrai as propriedades listadas em `transition:` / `transition-property:`. */
function propriedadesDeTransicao(bloco: string): string[] {
  const fora: string[] = [];
  for (const m of bloco.matchAll(/transition-property:\s*([^;}]+)/g)) {
    fora.push(...m[1].split(",").map((s) => s.trim()));
  }
  for (const m of bloco.matchAll(/transition:\s*([^;}]+)/g)) {
    for (const parte of m[1].split(",")) {
      // A propriedade é a primeira palavra da abreviatura: `transform 0.3s ease`.
      const primeira = parte.trim().split(/\s+/)[0];
      if (primeira && !/^\d/.test(primeira) && primeira !== "none") fora.push(primeira);
    }
  }
  return fora;
}

/**
 * O CORPO de cada bloco aberto por `re` — contando chavetas, não partindo a
 * string. A versão ingénua (`css.split(re)`) devolvia tudo o que vinha DEPOIS
 * do bloco, e por isso dava por cumprida qualquer guarda cujo selector
 * aparecesse mais abaixo no ficheiro por outra razão qualquer: passava sempre.
 */
function blocosDe(fonte: string, re: RegExp): string[] {
  const fora: string[] = [];
  re.lastIndex = 0;
  while (re.exec(fonte) !== null) {
    let i = re.lastIndex;
    let nivel = 1;
    while (i < fonte.length && nivel > 0) {
      if (fonte[i] === "{") nivel++;
      else if (fonte[i] === "}") nivel--;
      i++;
    }
    fora.push(fonte.slice(re.lastIndex, i - 1));
  }
  return fora;
}

/** Extrai as propriedades declaradas dentro de cada bloco `@keyframes`. */
function propriedadesDeKeyframes(fonte: string): { nome: string; props: string[] }[] {
  const fora: { nome: string; props: string[] }[] = [];
  // `@keyframes nome { ... }` — apanha o corpo contando chavetas, porque os
  // keyframes têm blocos aninhados (`from { … }`).
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fonte))) {
    let i = re.lastIndex;
    let nivel = 1;
    while (i < fonte.length && nivel > 0) {
      if (fonte[i] === "{") nivel++;
      else if (fonte[i] === "}") nivel--;
      i++;
    }
    const corpo = fonte.slice(re.lastIndex, i - 1);
    const props = [...corpo.matchAll(/(^|[{;\s])([a-z-]+)\s*:/g)].map((p) => p[2]);
    fora.push({ nome: m[1], props });
  }
  return fora;
}

/**
 * ── AS BARRAS DO DOSSIER ──────────────────────────────────────────────────
 *
 * A rede acima cobre o `globals.css` e a cromagem pública: o que está no ecrã
 * durante o scroll do SÍTIO. O dossier ficou de fora — e é onde ela trabalha,
 * de pé numa quinta, num iPhone com 4G fraco.
 *
 * O defeito é uma família inteira e escreve-se sempre da mesma maneira: uma
 * barra cujo enchimento leva a percentagem numa `width` (ou numa `height`) em
 * linha, e por cima uma transição. Animar a largura obriga o browser a
 * recalcular a geometria a cada frame, na linha principal — e nestes ecrãs há
 * barras aos pares e aos seis, todas a animar ao mesmo tempo assim que os
 * números chegam do servidor.
 *
 * A forma correcta já existe no repositório e é a do `ui/EmCurso`: um traço
 * cheio (`w-full`) encolhido por `scaleX` a partir de `origin-left`. O
 * compositor faz o mesmo desenho sem tocar na geometria.
 *
 * Esta rede não proíbe transições nas barras — proíbe que a coisa animada seja
 * a própria geometria. `transition-transform`, `transition-colors` e
 * `transition-opacity` passam todas.
 */
const BARRAS = [
  "src/app/[lang]/(admin)/orcamento/admin/StatsDashboard.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/Overview.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/ProductionPlan.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/ModoDeCarga.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/EventChecklist.tsx",
  "src/app/[lang]/(site)/galeria/GaleriaClient.tsx",
];

/**
 * Comentários de TSX. Sem isto, um `<` ou umas aspas soltas dentro de prosa
 * desalinham o varredor de etiquetas. O `(?<!:)` poupa os `https://`.
 *
 * Apaga SEM ENCOLHER — cada carácter vira um espaço e as mudanças de linha
 * ficam. É o que faz o número de linha do relatório apontar para o ficheiro
 * verdadeiro; a primeira versão contava as linhas no texto já encolhido e
 * mandava-a procurar duzentas linhas acima do sítio certo.
 */
const semComentariosTsx = (src: string) => {
  const branco = (m: string) => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, branco).replace(/(?<!:)\/\/[^\n]*/g, branco);
};

/**
 * As ETIQUETAS DE ABERTURA de um ficheiro JSX, uma a uma.
 *
 * Um `/<[^>]*>/` não serve: estas etiquetas trazem expressões com `>` lá dentro
 * (`{n > 0 ? …}`) e literais de modelo com `${…}`. Este varredor conta chavetas
 * e respeita aspas, portanto só pára no `>` que fecha mesmo a etiqueta.
 */
function etiquetasDeAbertura(fonte: string): string[] {
  const fora: string[] = [];
  for (let i = 0; i < fonte.length; i++) {
    if (fonte[i] !== "<" || !/[A-Za-z]/.test(fonte[i + 1] ?? "")) continue;
    let j = i + 1;
    let chaves = 0;
    let aspas: string | null = null;
    while (j < fonte.length) {
      const c = fonte[j];
      if (aspas) {
        if (c === "\\") j++;
        else if (c === aspas) aspas = null;
      } else if (c === '"' || c === "'" || c === "`") aspas = c;
      else if (c === "{") chaves++;
      else if (c === "}") chaves--;
      else if (c === ">" && chaves === 0) break;
      j++;
    }
    fora.push(fonte.slice(i, j));
    i = j;
  }
  return fora;
}

/** A etiqueta põe a geometria em linha? É o que faz dela uma barra. */
const levaGeometriaEmLinha = (etiqueta: string) => {
  const estilo = /style=\{\{([\s\S]*?)\}\}/.exec(etiqueta)?.[1];
  return estilo
    ? /\b(width|height|maxWidth|maxHeight|minWidth|minHeight|flexBasis)\s*:/.test(estilo)
    : false;
};

/** As classes de transição da etiqueta que prometem animar layout. */
const transicoesDeLayout = (etiqueta: string) =>
  [...etiqueta.matchAll(/\btransition-(all|\[[^\]]+\])/g)]
    .map((m) => m[1])
    .filter((p) => (p === "all" ? true : p.slice(1, -1).split(",").some(eLayout)))
    .map((p) => `transition-${p}`);

/** Todo o TSX que desenha ecrã — é onde os utilitários do Tailwind vivem. */
function ficheirosDeEcra(): string[] {
  const fora: string[] = [];
  const andar = (dir: string) => {
    for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) andar(rel);
      else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) fora.push(rel);
    }
  };
  andar("src/app");
  andar("src/components");
  return fora;
}

describe("contrato da fluidez: o movimento anima o compositor, não a geometria", () => {
  it("nenhuma transição do globals.css anima uma propriedade de layout", () => {
    const infractoras = propriedadesDeTransicao(css)
      .filter((p) => eLayout(p))
      .filter((p) => !PERDOADAS_NO_CSS.has(p.toLowerCase()));

    expect(
      [...new Set(infractoras)],
      "animar geometria põe o recálculo de layout no caminho crítico de cada frame. Anima `transform`/`opacity`; se não der, mede primeiro (e2e/scroll-emparelhado.mjs) e escreve aqui a excepção com o número.",
    ).toEqual([]);
  });

  it("nenhum @keyframes do globals.css anima uma propriedade de layout", () => {
    const infractores = propriedadesDeKeyframes(css)
      .map(({ nome, props }) => ({ nome, maus: props.filter((p) => eLayout(p)) }))
      .filter(({ maus }) => maus.length > 0)
      .map(({ nome, maus }) => `@keyframes ${nome} :: ${[...new Set(maus)].join(", ")}`);

    expect(
      infractores,
      "um keyframe que mexe em geometria corre na linha principal do princípio ao fim, e o scroll paga-o inteiro",
    ).toEqual([]);
  });

  it("a cromagem pública não ganha animações de layout novas", () => {
    const infractores: string[] = [];
    for (const rel of CROMAGEM_PUBLICA) {
      const fonte = readFileSync(join(RAIZ, rel), "utf8");
      const perdoadas = PERDOADAS_NA_CROMAGEM.get(rel) ?? [];
      // `transition-all` e `transition-[…]` com uma propriedade de layout lá
      // dentro, tal como se escrevem no Tailwind.
      for (const m of fonte.matchAll(/\btransition-(all|\[[^\]]+\])/g)) {
        const classe = `transition-${m[1]}`;
        if (perdoadas.includes(classe)) continue;
        const props = m[1] === "all" ? ["all"] : m[1].slice(1, -1).split(",");
        if (props.some((p) => eLayout(p))) infractores.push(`${rel} :: ${classe}`);
      }
    }
    expect(
      infractores,
      "estes componentes estão no ecrã durante TODO o scroll — uma transição de geometria aqui é paga em cada travessia. Mede antes de a acrescentar.",
    ).toEqual([]);
  });

  it("a curva POR OMISSÃO das transições é a curva de assinatura", () => {
    // Isto é a outra metade do trabalho de fluidez, e a que mais se sente.
    // O sítio tem uma curva de assinatura (`--ease-out`) — mas cerca de 300 dos
    // ~322 utilitários `transition-*` nunca a pediam, e caíam na omissão do
    // Tailwind (`cubic-bezier(0.4, 0, 0.2, 1)`, quase simétrica). Medido no
    // sítio a correr: na MESMA barra de navegação, no MESMO instante, o <nav> e
    // o link do CTA desaceleravam na assinatura enquanto a linha da barra, o
    // botão de idioma e o CTA flutuante desaceleravam na curva do Tailwind.
    // Duas linguagens de movimento na mesma peça.
    //
    // A correcção é uma linha no `@theme`. Se alguém a tirar — ou afinar uma das
    // duas curvas sem a outra —, o sítio volta a ter duas desacelerações e este
    // teste diz porquê, em vez de ficar por descobrir a olho.
    const omissao = /--default-transition-timing-function:\s*([^;]+);/.exec(css)?.[1];
    const assinatura = /--ease-out:\s*([^;]+);/.exec(css)?.[1];
    expect(
      omissao,
      "sem `--default-transition-timing-function` no @theme, ~300 transições voltam à curva simétrica do Tailwind",
    ).toBeTruthy();
    expect(assinatura, "o `--ease-out` desapareceu do :root").toBeTruthy();
    const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase();
    expect(
      norm(omissao!),
      "a omissão e a assinatura têm de ser a MESMA curva — se divergirem, o sítio volta a ter duas",
    ).toBe(norm(assinatura!));
  });

  it("as transições escritas à mão leem o token, não uma cópia da curva", () => {
    // O `@theme` só alimenta os UTILITÁRIOS do Tailwind: as regras deste
    // ficheiro não o vêem. Eram 9 cópias literais da assinatura dentro de
    // `transition:` — cada uma um sítio onde a curva pode divergir em silêncio
    // (já aconteceu uma vez, ver tokens.coerencia.test.ts). Agora leem todas
    // `var(--ease-out)`. As ANIMAÇÕES ficam de fora de propósito: há curvas
    // deliberadamente diferentes (o `linear` do marquee e das barras, o
    // `cubic-bezier(0.33,0,0.2,1)` do Ken Burns) e são outro eixo.
    const declaracoes = css.match(/transition:[^;]+;/g) ?? [];
    const comLiteral = declaracoes.filter((d) => /cubic-bezier\(\s*0\.16/.test(d));
    expect(
      comLiteral,
      "escreve `var(--ease-out)` — um literal aqui é uma cópia nova da curva de assinatura",
    ).toEqual([]);
  });

  it("as transições de hover/foco têm guarda de movimento reduzido", () => {
    // Não é gosto, é acessibilidade: quem pede movimento reduzido pediu-o.
    // Estas quatro eram as que faltavam — o filete dos links (10 usos), a subida
    // dos CTAs, o filete dos campos do orçamento e o zoom das fotografias.
    // O estado continua a MUDAR (a cor, o filete a aparecer, que é informação);
    // o que desaparece é o deslocamento.
    const dentroDeReduce = blocosDe(
      css,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g,
    ).join("\n");
    for (const seletor of [
      ".link-line::after",
      ".lift",
      ".field-line",
      // Era o 1.06; desde a auditoria externa (A4) o zoom das fotografias do
      // sítio é um só, 1.03.
      ".group-hover\\:scale-\\[1\\.03\\]",
      ":focus-visible",
    ]) {
      expect(dentroDeReduce, `${seletor} sem guarda de movimento reduzido`).toContain(seletor);
    }
  });

  it("todo o zoom de hover tem guarda de movimento reduzido — não só o primeiro", () => {
    /**
     * A fotografia a crescer ao passar o rato é a animação mais visível do
     * sítio, e quem pede movimento reduzido pediu-o.
     *
     * O guarda existia e cobria UM utilitário — `scale-[1.06]`, o da galeria e
     * o dos clientes. Entretanto entraram mais três com outro número
     * (`scale-105` no contacto e nos serviços, `scale-[1.04]` na confirmação),
     * e um selector escrito à mão não cobre um número que ainda não existia.
     * Ninguém reparou porque, com movimento normal, todos parecem bem.
     *
     * Esta rede é sobre os PRÓXIMOS: enumera os que estão mesmo escritos no
     * código e exige que cada um esteja no bloco. Um zoom novo com um número
     * novo põe isto vermelho, com o nome da classe na mensagem.
     */
    const usados = new Set<string>();
    for (const rel of ficheirosDeEcra()) {
      const fonte = readFileSync(join(RAIZ, rel), "utf8");
      for (const m of fonte.matchAll(/group-hover:scale-(\[[^\]]+\]|\d+)/g)) usados.add(m[0]);
    }
    // Não passa por vacuidade: se o extractor deixar de ver nada, isto avisa.
    // (Eram mais de dois números; desde a auditoria externa, A4, as fotografias
    // do sítio usam todas o 1.03, e sobra o 1.02 da proposta.)
    expect(usados.size, "o varredor deixou de encontrar zooms de hover").toBeGreaterThan(0);

    const dentroDeReduce = blocosDe(
      css,
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g,
    ).join("\n");
    const semGuarda = [...usados].filter((classe) => {
      // `group-hover:scale-[1.06]` escreve-se `.group-hover\:scale-\[1\.06\]`
      // no CSS: o Tailwind escapa os dois pontos, os parênteses rectos e o ponto.
      const selector = "." + classe.replace(/[:[\].]/g, (c) => "\\" + c);
      return !dentroDeReduce.includes(selector);
    });
    expect(
      semGuarda.sort(),
      "estes zooms continuam a crescer para quem pediu movimento reduzido — acrescenta-os ao bloco do globals.css",
    ).toEqual([]);
  });

  it("nenhum movimento do dossier ignora quem pediu movimento reduzido", () => {
    /**
     * A distinção que interessa, e que a rede anterior a esta não fazia: uma
     * COR a esbater-se não é movimento. O `globals.css` já o diz por escrito —
     * «o estado continua a MUDAR (a cor, o filete a aparecer, que é
     * informação); o que desaparece é o deslocamento».
     *
     * Por isso a rede é sobre `transition-transform`, e deixa em paz as ~128
     * `transition-colors` do dossier. Guardá-las seria trocar um defeito de
     * movimento por um de legibilidade: com movimento reduzido, um botão que
     * deixasse de mudar de cor ao ser tocado deixava de dizer que foi tocado.
     *
     * As setas que rodam ao abrir uma secção continuam a rodar — a rotação é
     * informação, diz se está aberta. O que desaparece é ela a rodar devagar.
     */
    const DOSSIER = "src/app/[lang]/(admin)/orcamento/admin";
    const semGuarda: string[] = [];
    for (const rel of ficheirosDeEcra().filter((f) => f.startsWith(DOSSIER))) {
      const fonte = semComentariosTsx(readFileSync(join(RAIZ, rel), "utf8"));
      for (const etiqueta of etiquetasDeAbertura(fonte)) {
        if (!/\btransition-(transform|\[transform)/.test(etiqueta)) continue;
        if (/motion-safe:|motion-reduce:/.test(etiqueta)) continue;
        const linha = fonte.slice(0, fonte.indexOf(etiqueta)).split("\n").length;
        semGuarda.push(`${rel}:${linha}`);
      }
    }
    expect(
      semGuarda,
      "movimento sem `motion-safe:` — quem pede movimento reduzido pediu-o, e isto é o dossier onde ela trabalha o dia inteiro",
    ).toEqual([]);
  });

  it("o anel de foco cresce com a curva do sítio, e depressa", () => {
    // Acrescentado por mim depois de verificar os dentes dos outros: tirar esta
    // transição do `globals.css` não fazia falhar teste nenhum. O teste da
    // guarda acima procura `:focus-visible` DENTRO do bloco de movimento
    // reduzido, portanto continuava a passar com a transição apagada — a
    // guarda sobrevivia à coisa que ela guarda.
    //
    // Duas propriedades, e a segunda é a que interessa mesmo:
    //  1. o anel anima com a curva de assinatura, como o resto;
    //  2. anima DEPRESSA. As WCAG (2.4.7) querem o indicador de foco visível,
    //     e uma transição longa atrasaria a sua leitura para quem navega por
    //     teclado — trocaria um defeito de movimento por um de acessibilidade,
    //     que é pior. O tecto é explícito para que ninguém o suba por engano.
    // ── E A PROPRIEDADE MUDOU DE NOME, POR UMA RAZÃO ─────────────────────
    //
    // Era `box-shadow`. O anel passou a `outline`, e não foi cosmética: a
    // sombra não sabe o raio de quem a recebe, e por isso a regra escrevia
    // `border-radius: 2px` no ELEMENTO focado para o anel coincidir. O efeito
    // era o controlo mudar de forma ao ser focado — um rectângulo de canto
    // vivo colado a um campo redondo, e dois riscos verdes soltos onde algum
    // ascendente cortava. A dona apontou-o três vezes.
    //
    // Um `outline` moderno segue o `border-radius` do próprio elemento. O que
    // este caso guarda continua a ser o mesmo — que o anel ANIMA, com a curva
    // da casa, e depressa — só que na propriedade certa.
    const blocos = blocosDe(css, /:focus-visible\s*\{/g).join("\n");
    const m = /transition:\s*outline-color\s+(\d+)ms\s+var\(--ease-out\)/.exec(blocos);
    expect(m, "o `:focus-visible` deixou de animar o anel com o token").toBeTruthy();
    expect(Number(m![1]), "o anel de foco demora demasiado a ficar legível").toBeLessThanOrEqual(
      200,
    );
  });

  it("nenhuma barra do dossier anima a própria geometria", () => {
    const infractoras: string[] = [];
    for (const rel of BARRAS) {
      const fonte = semComentariosTsx(readFileSync(join(RAIZ, rel), "utf8"));
      for (const etiqueta of etiquetasDeAbertura(fonte)) {
        if (!levaGeometriaEmLinha(etiqueta)) continue;
        for (const classe of transicoesDeLayout(etiqueta)) {
          // A linha, para se poder ir lá directo em vez de procurar à mão num
          // ficheiro de três mil linhas.
          const linha = fonte.slice(0, fonte.indexOf(etiqueta)).split("\n").length;
          infractoras.push(`${rel}:${linha} :: ${classe}`);
        }
      }
    }
    expect(
      infractoras,
      "esta barra leva a percentagem numa `width`/`height` em linha E promete animá-la: são recálculos de geometria na linha principal, aos seis ao mesmo tempo, num telemóvel a meio de um evento. Faz como o `ui/EmCurso`: `w-full origin-left` + `transform: scaleX(fracção)`.",
    ).toEqual([]);
  });

  it("o varredor de barras está mesmo armado", () => {
    // A mesma falha estúpida do teste acima, na versão JSX: o varredor deixar
    // de encontrar etiquetas e a rede passar sobre uma lista vazia.
    const painel = semComentariosTsx(
      readFileSync(join(RAIZ, "src/app/[lang]/(admin)/orcamento/admin/StatsDashboard.tsx"), "utf8"),
    );
    const etiquetas = etiquetasDeAbertura(painel);
    expect(etiquetas.length, "o varredor deixou de ver etiquetas de abertura").toBeGreaterThan(100);
    // E continua a saber reconhecer uma barra: as do painel passaram a `scaleX`,
    // portanto há etiquetas com `transform` em linha e nenhuma com `width`.
    expect(
      etiquetas.filter((t) => /style=\{\{[\s\S]*?transform:\s*`scaleX/.test(t)).length,
      "as barras do painel deixaram de encolher por `scaleX`",
    ).toBeGreaterThan(3);
    // O classificador reconhece o par que interessa.
    expect(levaGeometriaEmLinha("<div style={{ width: `${p}%` }} />")).toBe(true);
    expect(levaGeometriaEmLinha("<div style={{ transform: `scaleX(${p})` }} />")).toBe(false);
    expect(transicoesDeLayout('<div className="transition-all" />')).toEqual(["transition-all"]);
    expect(transicoesDeLayout('<div className="transition-transform" />')).toEqual([]);
  });

  it("a rede está mesmo armada (não passa por vacuidade)", () => {
    // A falha mais estúpida possível: os extractores deixarem de encontrar seja
    // o que for e os três testes acima passarem sobre listas vazias.
    expect(propriedadesDeTransicao(css).length).toBeGreaterThan(15);
    expect(propriedadesDeKeyframes(css).length).toBeGreaterThan(15);
    // E o classificador tem de reconhecer uma animação de layout quando a vê.
    // (A excepção que aqui se usava como prova — o `transition-[height]` da
    // barra de navegação — saiu com a auditoria externa, A2.)
    expect(eLayout("height")).toBe(true);
    expect(eLayout("all")).toBe(true);
    expect(eLayout("transform")).toBe(false);
    expect(eLayout("opacity")).toBe(false);
    const navbar = readFileSync(join(RAIZ, "src/components/Navbar.tsx"), "utf8");
    expect(navbar).not.toContain("transition-[height]");
  });
});
