import { PALAVRAS_CERTAS } from "./proposal-ortografia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A HIGIENE DOS NOMES DOS TEMAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A biblioteca tem 18 temas escritos ao longo de meses, e nota-se: há
 * «bouquets campestres» e «lapelas» em minúsculas ao lado de «Bouquets Branco e
 * Amarelo», há «Cerimonia Simbólica» sem acento no primeiro e com acento no
 * segundo, e há «Seatings Plans», que põe o plural na palavra errada.
 *
 * Isto não é cosmética. Os nomes dos temas são o índice pelo qual ela procura,
 * e a pesquisa de hoje é por NOME: um tema escrito de forma diferente do que se
 * escreve na caixa é um tema que não aparece.
 *
 * ── O QUE ISTO FAZ, E O QUE NÃO FAZ ───────────────────────────────────────
 * Faz três coisas, todas reversíveis e nenhuma automática: propõe. Quem decide
 * é quem está a escrever — um nome próprio, uma sigla ou uma escolha
 * deliberada não podem ser corrigidos por um dicionário.
 *
 *   1. os ACENTOS, do mesmo dicionário que já corrige os campos impressos da
 *      proposta (`proposal-ortografia.ts`). Uma palavra só entra nesse
 *      dicionário quando a forma sem acentos não é, ela própria, uma palavra
 *      portuguesa — é isso que impede «e» de virar «é»;
 *   2. as MAIÚSCULAS, em caixa de título com as preposições em minúsculas
 *      («Bouquets Branco e Amarelo», não «Bouquets Branco E Amarelo»);
 *   3. os erros CONHECIDOS, que são poucos e nomeados um a um.
 *
 * Não inventa nada fora disto. Não traduz, não encurta, não «melhora» o nome —
 * um corrector que reescreve o que a dona escreveu deixa de ser usado à
 * segunda vez que o faz.
 */

/** `cerimonia` → `cerimónia`. A mesma chave e o mesmo dicionário da proposta. */
const semAcentos = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const POR_CHAVE: ReadonlyMap<string, string> = new Map(
  PALAVRAS_CERTAS.map((p) => [semAcentos(p), p]),
);

/**
 * As palavras que ficam em minúsculas no meio de um título.
 *
 * Nunca na PRIMEIRA posição: «De Manhã» é um nome, «de Manhã» é um engano.
 */
const MINUSCULAS_NO_MEIO = new Set([
  "a",
  "as",
  "o",
  "os",
  "e",
  "de",
  "da",
  "das",
  "do",
  "dos",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "com",
  "sem",
  "para",
  "por",
  "ao",
  "aos",
  "à",
  "às",
]);

/**
 * Erros conhecidos, nomeados um a um.
 *
 * Uma lista curta e explícita, e não uma regra esperta: «Seatings Plans» é o
 * plural na palavra errada (em inglês o plural vai no substantivo, não no
 * adjectivo), e não há regra geral que o apanhe sem apanhar mais coisas.
 * Comparados sem acentos e sem maiúsculas, para «SEATINGS PLANS» também entrar.
 */
const ERROS_CONHECIDOS: ReadonlyArray<readonly [errado: string, certo: string]> = [
  ["seatings plans", "Seating Plans"],
  ["seatings plan", "Seating Plan"],
];

/** As palavras que vão em CAPITULARES e não devem ser tocadas. */
const SIGLAS = new Set(["dj", "led", "pdf", "iva"]);

function comMaiusculaInicial(palavra: string): string {
  return palavra.charAt(0).toUpperCase() + palavra.slice(1);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PONTUAÇÃO QUE FICOU TORTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nome real da biblioteca dela: `Clássico Intemporal ( Branco/dourad0))`.
 *
 * Três defeitos numa linha, e nenhum deles é uma escolha: um espaço a seguir ao
 * parêntese aberto, um parêntese fechado a mais, e um `0` onde devia estar um
 * `o`. É o que sai de escrever um nome num telemóvel, com pressa, no meio de um
 * evento — e depois nunca mais se volta a esse campo, portanto fica lá para
 * sempre a ser o nome por que se procura o tema.
 *
 * ── PORQUE É QUE SÃO REGRAS E NÃO UMA CORRECÇÃO À MÃO ─────────────────────
 *
 * Porque à mão corrige-se este e não o próximo. É a mesma lição do «Seatings
 * Plans»: o erro já existia noutra forma e voltou. Estas três regras apanham a
 * classe, e a revisão em lote passa a oferecê-la em todos os temas de uma vez.
 *
 * E continuam a PROPOR: quem decide é ela, com o «Deixar como está» ao lado.
 */

/** Fecha-parênteses a mais, e espaços encostados por dentro. */
function arrumarPontuacao(nome: string): string {
  let fora = nome
    // «( Branco» → «(Branco»; «dourado )» → «dourado)». O espaço por dentro do
    // parêntese não quer dizer nada e lê-se como um erro — porque é.
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    // «,,» e «..» — o dedo que bateu duas vezes na mesma tecla.
    .replace(/([,.;:!?])\1+/g, "$1");

  // Os fecha-parênteses a MAIS saem; os que faltam NÃO se inventam. Fechar um
  // parêntese que ela não abriu era pôr no nome dela uma coisa que ela não
  // escreveu — e um nome é escolha de quem o escreve.
  const PARES: ReadonlyArray<readonly [string, string]> = [
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ];
  for (const [abre, fecha] of PARES) {
    let saldo = 0;
    let saida = "";
    for (const c of fora) {
      if (c === abre) saldo += 1;
      else if (c === fecha) {
        if (saldo === 0) continue; // fecha sem abrir: cai
        saldo -= 1;
      }
      saida += c;
    }
    fora = saida;
  }
  return fora.replace(/\s+/g, " ").trim();
}

/**
 * `dourad0` → `dourado`.
 *
 * O zero é o gémeo visual do «o» e fica ao lado do «p» no teclado do telemóvel.
 * A regra é apertada de propósito, porque o risco aqui é estragar um nome
 * legítimo: só toca em palavras com CINCO letras ou mais, com UM único dígito,
 * e só quando esse dígito é o `0`.
 *
 * O que isto deliberadamente NÃO toca: «Mesa 1» e «Tema 2» (o número é a
 * palavra toda), «A4» e «G0» (curtas de mais), «Top10» (dois dígitos). Um nome
 * que precise mesmo de um zero no meio de letras — e não me ocorre nenhum —
 * tem o «Deixar como está».
 */
function arrumarZeroPorO(palavra: string): string {
  const digitos = palavra.replace(/\D/g, "");
  if (digitos !== "0") return palavra;
  if (palavra.replace(/[^\p{L}]/gu, "").length < 5) return palavra;
  return palavra.replace("0", "o");
}

/**
 * O nome arrumado. Puro e total: qualquer entrada devolve uma cadeia.
 *
 * Colapsa também os espaços a mais — «Bouquets  Campestres » é o mesmo tema, e
 * um espaço invisível no fim é dos erros mais difíceis de ver e de procurar.
 */
export function arrumarNomeDeTema(bruto: string): string {
  const limpo = arrumarPontuacao(
    String(bruto ?? "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  if (!limpo) return "";

  const conhecido = ERROS_CONHECIDOS.find(([errado]) => semAcentos(limpo) === errado);
  if (conhecido) return conhecido[1];

  return limpo
    .split(" ")
    .map((bruta, i) => {
      // A pontuação da frente e de trás sai da conta e volta no fim: sem isto,
      // «(branco/dourado)» pedia a maiúscula ao PARÊNTESE — que não a tem — e o
      // «b» ficava minúsculo para sempre. O mesmo para o que vem a seguir a uma
      // barra, que é uma palavra nova e não uma sílaba.
      const [, antes, nucleo, depois] = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(bruta)!;
      if (!nucleo) return bruta;
      const arrumada = nucleo
        .split("/")
        .map((parte) => {
          const palavra = arrumarZeroPorO(parte);
          const chave = semAcentos(palavra);
          if (SIGLAS.has(chave)) return palavra.toUpperCase();

          // O acento primeiro: a forma certa do dicionário traz a sua própria
          // grafia, e é sobre ela que a caixa de título decide.
          const comAcento = POR_CHAVE.get(chave) ?? palavra;
          if (i > 0 && MINUSCULAS_NO_MEIO.has(chave)) return comAcento.toLowerCase();
          return comMaiusculaInicial(comAcento.toLowerCase());
        })
        .join("/");
      return `${antes}${arrumada}${depois}`;
    })
    .join(" ");
}

/** O nome precisa de ser arrumado? (para só se propor quando há o que propor) */
export function nomePrecisaDeArrumo(bruto: string): boolean {
  const arrumado = arrumarNomeDeTema(bruto);
  return arrumado.length > 0 && arrumado !== String(bruto ?? "").trim();
}

/**
 * O que mudaria numa lista inteira — para a revisão em lote poder mostrar a
 * proposta antes de lhe tocar, e para quem lê o relatório ver o antes e o
 * depois lado a lado.
 */
export function arrumosDeNomes(nomes: readonly string[]): Array<{ antes: string; depois: string }> {
  return nomes
    .map((antes) => ({ antes, depois: arrumarNomeDeTema(antes) }))
    .filter((x) => x.depois !== x.antes.trim() && x.depois.length > 0);
}
