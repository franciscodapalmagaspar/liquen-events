import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO DO PEDIDO NÃO CHEGA AO CAMPO DO ESTÚDIO SEM PASSAR PELO PAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «essa coisa do valor das propostas crescer não pode
 * acontecer!!! o valor enviado ou o valor que colocámos ao fazer a proposta é o
 * valor que fica até nós próprios alterarmos por nós!!!»
 *
 * O `lib/o-valor-enviado-e-o-valor-que-fica` prova que as CONTAS estão certas.
 * Este prende outra coisa: que os caminhos as USAM. As contas nunca estiveram
 * erradas — o que houve, quatro vezes, foi código a passar ao lado delas.
 *
 * ── A AVARIA TEM UMA FORMA SÓ, E JÁ APARECEU EM QUATRO SÍTIOS ─────────────
 *
 * O PEDIDO guarda, no «Preço final (sem IVA)», o que o casal paga: os serviços
 * MAIS os adicionais. O campo do ESTÚDIO chama-se «Valor (sem IVA)» e significa
 * só os SERVIÇOS. São dois números legítimos e diferentes, e quem os confunde
 * escreve o primeiro no segundo — a gravação seguinte volta a somar-lhe a
 * deslocação, e a visita seguinte parte do número já inchado.
 *
 * 3.000 → 3.140 → 3.280 → 3.420. Uma soma por cada vez que ela abriu.
 *
 * Os quatro sítios, todos com a mesma linha por baixo:
 *
 *   1. a montagem                 `setTotalInput(textoDoTotal(quote.quotedPrice))`
 *   2. a hidratação do rascunho do servidor   `aplicarBase(limpo, doPedido)`
 *   3. a sincronização com a Gestão do pedido
 *   4. a sementeira de um documento novo
 *
 * Os quatro foram descobertos EM PRODUÇÃO, por ela, depois de o número já ter
 * saído num PDF para um casal. O quinto não pode ser descoberto assim.
 *
 * ── PORQUE É UMA VARREDURA E NÃO MAIS UM TESTE DE ECRÃ ────────────────────
 *
 * Há um teste de comportamento por cada um dos quatro sítios, e todos passam.
 * Passavam também no dia anterior a cada uma das quatro descobertas: um teste
 * de ecrã cobre o caminho que alguém se lembrou de desenhar, e a avaria estava
 * sempre no caminho em que ninguém pensou.
 *
 * Esta lê o ficheiro e pergunta outra coisa: há aqui algum sítio onde o preço
 * do pedido chegue ao total do estúdio sem passar pela conversão? A resposta
 * tem de ser «nenhum» — hoje, e em cada vez que alguém escrever aqui.
 */

const FICHEIRO = "src/app/[lang]/(admin)/orcamento/admin/ProposalStudio.tsx";

/**
 * Comentários fora, e as cadeias de texto também.
 *
 * Numa casa que comenta assim, uma varredura que não os tire encontra a avaria
 * escrita nos cabeçalhos que a explicam — foi o que aconteceu duas vezes com
 * outras varreduras deste back office (`<thead>` apanhado por `/<th\b/`,
 * `` `<label for>` `` apanhado por `/<label\b/`). E as cadeias de texto contêm
 * nomes de campos e frases para ela ler, não código que corra.
 *
 * As MUDANÇAS DE LINHA ficam todas. Sem isso, o erro aponta uma linha do texto
 * encolhido — este ficheiro tem mais comentário do que código, e a primeira
 * versão desta varredura mandou quem a lesse para a linha 2677 quando a avaria
 * estava na 4565. Um erro que aponta o sítio errado é um erro que se ignora.
 */
function soOCodigo(fonte: string): string {
  const mesmasLinhas = (t: string) => "\n".repeat((t.match(/\n/g) ?? []).length);
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, mesmasLinhas)
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, (t) => `""${mesmasLinhas(t)}`)
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, '""');
}

const CODIGO = soOCodigo(readFileSync(join(process.cwd(), FICHEIRO), "utf8"));

/** As duas conversões, pelos nomes por que são chamadas neste ficheiro. */
const CONVERSOES = ["baseDoPedidoParaOEcra", "baseParaOEstudio", "baseDoEcraParaOPedido"];

/**
 * Os nomes por que o preço do PEDIDO anda dentro deste ficheiro.
 *
 * `quote.quotedPrice` e tudo o que dele nasce por declaração — `const doPedido
 * = quote.quotedPrice`, e as variantes com `typeof … ? … : 0`. É de propósito
 * que se seguem os ALIASES e não só o acesso directo: três dos quatro sítios
 * históricos passavam o preço por uma variável local antes de o escrever.
 */
function apelidosDoPrecoDoPedido(codigo: string): string[] {
  const nomes = new Set<string>();
  const declaracao = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]*);/g;
  let m: RegExpExecArray | null;
  while ((m = declaracao.exec(codigo))) {
    if (/\bquote(?:\?)?\.quotedPrice\b/.test(m[2])) nomes.add(m[1]);
  }
  return [...nomes];
}

const APELIDOS = apelidosDoPrecoDoPedido(CODIGO);

/**
 * Onde é que um número vira o TOTAL do estúdio. Não é uma lista de estilo: é a
 * lista dos sítios por onde os quatro defeitos passaram, mais os irmãos das
 * mesmas funções.
 */
const ESCOADOUROS = ["setTotalInput", "aplicarBase", "totalAmountParaBase", "textoDoTotal"];

/** O texto entre os parênteses de `nome(`, com os parênteses equilibrados. */
function argumentosDe(codigo: string, nome: string): { texto: string; indice: number }[] {
  const saida: { texto: string; indice: number }[] = [];
  const chamada = new RegExp(`\\b${nome}\\s*\\(`, "g");
  let m: RegExpExecArray | null;
  while ((m = chamada.exec(codigo))) {
    const abre = m.index + m[0].length - 1;
    let profundidade = 0;
    for (let i = abre; i < codigo.length; i += 1) {
      if (codigo[i] === "(") profundidade += 1;
      else if (codigo[i] === ")") {
        profundidade -= 1;
        if (profundidade === 0) {
          saida.push({ texto: codigo.slice(abre + 1, i), indice: m.index });
          break;
        }
      }
    }
  }
  return saida;
}

/** A linha (1-based) de um índice, para o erro dizer ONDE. */
function linhaDe(codigo: string, indice: number): number {
  return codigo.slice(0, indice).split("\n").length;
}

/** Todas as travessias pedido → total que este código contém. */
function travessiasSemConversao(codigo: string): string[] {
  const apelidos = apelidosDoPrecoDoPedido(codigo);
  const fontes = ["quote.quotedPrice", "quote?.quotedPrice", ...apelidos];
  const fora: string[] = [];
  for (const escoadouro of ESCOADOUROS) {
    for (const { texto, indice } of argumentosDe(codigo, escoadouro)) {
      const fonte = fontes.find((f) =>
        new RegExp(`(^|[^\\w$.])${f.replace(/[.?]/g, "\\$&")}(?![\\w$])`).test(texto),
      );
      if (!fonte) continue;
      if (CONVERSOES.some((c) => texto.includes(c))) continue;
      fora.push(
        `${FICHEIRO}:${linhaDe(codigo, indice)} — ${escoadouro}(…) recebe «${fonte}» em cru`,
      );
    }
  }
  return fora;
}

describe("o preço do pedido não chega ao total do estúdio em cru", () => {
  /**
   * Sem apelidos, a varredura de baixo não varre nada e passa a verde por não
   * estar a olhar. É a mesma guarda que a grelha do `lib/` tem, pela mesma
   * razão: uma varredura tem de provar que varre.
   */
  it("a varredura encontra mesmo o preço do pedido a andar por aqui", () => {
    expect(
      APELIDOS.length,
      "nenhum apelido do preço do pedido: a varredura deixou de ver o ficheiro",
    ).toBeGreaterThanOrEqual(3);
    for (const escoadouro of ESCOADOUROS) {
      expect(
        argumentosDe(CODIGO, escoadouro).length,
        `«${escoadouro}» já não existe no estúdio — a lista de escoadouros envelheceu`,
      ).toBeGreaterThan(0);
    }
  });

  it("nenhum caminho leva o preço do pedido ao total sem passar pela conversão", () => {
    expect(
      travessiasSemConversao(CODIGO),
      "o preço do pedido (serviços + adicionais) está a ser escrito no campo que " +
        "significa só serviços — é a avaria que levou 3.000 a 3.420, uma soma por visita",
    ).toEqual([]);
  });

  /**
   * ── OS QUATRO CONTROLOS NEGATIVOS, QUE SÃO OS QUATRO DEFEITOS REAIS ─────
   *
   * Cada um é a linha que ESTEVE mesmo neste ficheiro, copiada dos comentários
   * que a substituíram. Se a varredura não os apanhar a todos, não vale nada —
   * e uma varredura que não vale nada é pior do que nenhuma, porque se confia
   * nela.
   */
  it.each([
    ["a montagem", "setTotalInput(textoDoTotal(quote.quotedPrice));"],
    ["a hidratação do rascunho do servidor", "return aplicarBase(limpo, doPedido);"],
    [
      "a sincronização com a Gestão do pedido",
      "const doPedido = quote.quotedPrice;\nsetTotalInput(textoDoTotal(doPedido));",
    ],
    [
      "a sementeira de um documento novo",
      "const quotedPrice = quote.quotedPrice;\n" +
        "totalAmountParaBase(quotedPrice, modo, next.vatRate);",
    ],
  ])("e apanha o defeito de %s", (_nome, defeito) => {
    const comDefeito = `${CODIGO}\nfunction __ensaio() {\n${defeito}\n}\n`;
    expect(travessiasSemConversao(comDefeito).length).toBeGreaterThan(0);
  });

  /**
   * E o controlo do controlo: as MESMAS linhas, com a conversão pelo meio, não
   * podem ser apanhadas. Sem isto, uma varredura que gritasse com tudo passava
   * os quatro ensaios de cima e obrigava a desligá-la uma semana depois.
   */
  it.each([
    ["a montagem", "setTotalInput(textoDoTotal(baseDoPedidoParaOEcra(quote.quotedPrice, d)));"],
    ["a hidratação", "return aplicarBase(limpo, baseDoPedidoParaOEcra(doPedido, limpo));"],
  ])("e não grita com %s feita como deve ser", (_nome, correcto) => {
    const certo = `${CODIGO}\nfunction __ensaio() {\nconst doPedido = quote.quotedPrice;\n${correcto}\n}\n`;
    expect(travessiasSemConversao(certo)).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * E O OUTRO SENTIDO: SÓ HÁ UMA PORTA PARA O PREÇO DO PEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A ida (estúdio → pedido) é o caminho por onde o número dela sai deste ecrã e
 * vai gravar-se. Se houvesse duas portas, uma delas acabaria por esquecer-se de
 * somar os adicionais — que é exactamente a história da volta, ao contrário.
 *
 * Há uma só: `persistirPreco` converte, `tentarGravarOPreco` grava, e
 * `mandarPrecoAoPedido` é a única que fala com a API. Isto prende essa forma.
 */
describe("do estúdio para o pedido há uma porta só", () => {
  it("a conversão vive dentro do funil, e não espalhada por quem chama", () => {
    const funil = CODIGO.slice(
      CODIGO.indexOf("function persistirPreco("),
      CODIGO.indexOf("async function tentarGravarOPreco("),
    );
    expect(funil, "não encontrei o funil do preço — os nomes mudaram").not.toBe("");
    expect(
      funil,
      "`persistirPreco` deixou de somar os adicionais: o pedido passa a guardar só os serviços",
    ).toContain("baseDoEcraParaOPedido");
  });

  it("e quem fala com a API é só uma", () => {
    // Sem a DEFINIÇÃO, que também é `nome(`. Contá-la dava dois e a guarda
    // nascia a mentir sobre o que estava a ver.
    const chamadas = [...CODIGO.matchAll(/(?<!function )\bmandarPrecoAoPedido\s*\(/g)];
    expect(
      chamadas.length,
      "apareceu uma segunda chamada a `mandarPrecoAoPedido`: há uma segunda porta " +
        "para o preço do pedido, e uma delas vai esquecer-se dos adicionais",
    ).toBe(1);
  });

  /**
   * O corpo do PATCH é `{ quotedPrice: base }`, e o `base` é o que o funil
   * converteu. Se um dia alguém escrever outro `quotedPrice:` para a API neste
   * ficheiro, é uma porta nova — e esta linha diz.
   */
  it("e o único `quotedPrice` que se grava daqui é o que saiu do funil", () => {
    // Uma CHAVE de objecto, e não um `quotedPrice` seguido de dois pontos:
    // `typeof quote.quotedPrice === "number" ? quote.quotedPrice : 0` acaba nos
    // mesmos caracteres e não escreve nada em lado nenhum.
    const escritas = [...CODIGO.matchAll(/[{,]\s*quotedPrice\s*:/g)];
    expect(
      escritas.length,
      "há mais do que um sítio a escrever `quotedPrice` no estúdio",
    ).toBe(1);
  });
});
