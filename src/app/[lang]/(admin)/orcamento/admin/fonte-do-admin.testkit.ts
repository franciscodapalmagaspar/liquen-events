import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO DE UM FICHEIRO QUE SE PARTIU, ONDE QUER QUE ELE VIVA AGORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há dezenas de testes que leem o TEXTO do `AdminClient.tsx`, do `Temas.tsx`
 * ou do `ThemePicker.tsx` para prender uma classe, uma duração ou uma regra de
 * desenho. As fases 7 e 8 de `docs/ESTRUTURA-DO-CODIGO.md` partiram esses
 * ficheiros por secções, para pastas privadas ao lado deles:
 *
 *   · `AdminClient.tsx` → `_casca/` (menu, cabeçalho, barra de baixo, vistas) e
 *     `_pedidos/` (a lista e o painel do pedido);
 *   · `Temas.tsx`       → `_temas/` (sem a subpasta do seletor);
 *   · `ThemePicker.tsx` → `_temas/seletor/`.
 *
 * Um teste que continuasse a ler só o ficheiro antigo deixava de ver o que
 * saiu — e ficava verde por não encontrar nada, que é a pior maneira de um
 * teste mentir. Esta é a porta única: o texto do ficheiro e o das casas dele,
 * juntos, por uma ordem fixa (o ficheiro primeiro, depois as casas por ordem
 * alfabética). Quando a próxima fase mover mais alguma coisa, muda-se AQUI, e
 * não em quarenta testes.
 */
const ADMIN = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

const SRC = join(process.cwd(), "src");

/**
 * `pastas`: as pastas privadas ao lado do ficheiro (relativas a `admin/`);
 * `lib`: a lógica pura que saiu dele (relativa a `src/`).
 */
export const CASAS = {
  "AdminClient.tsx": {
    pastas: ["_casca", "_pedidos"],
    fora: [] as string[],
    lib: ["lib/orcamento/pedidos"],
  },
  "Temas.tsx": { pastas: ["_temas"], fora: ["seletor/"], lib: ["lib/temas"] },
  "ThemePicker.tsx": { pastas: ["_temas/seletor"], fora: [] as string[], lib: [] as string[] },
} as const;

export type FicheiroPartido = keyof typeof CASAS;

/** Os ficheiros de produção de uma pasta, por ordem, relativos a `base`. */
function daPasta(base: string, pasta: string, fora: readonly string[]): string[] {
  let nomes: string[] = [];
  try {
    nomes = readdirSync(join(base, pasta), { recursive: true }) as string[];
  } catch (erro) {
    // Uma pasta que desaparece (renomeada, apagada) NÃO pode ler-se como
    // vazia: os `not.toMatch` sobre a fonte junta ficavam verdes por lerem
    // menos. Falha alto, com o nome da pasta.
    throw new Error(`fonte-do-admin: não consegui ler a pasta «${pasta}»`, { cause: erro });
  }
  return nomes
    .map((n) => n.split("\\").join("/"))
    .filter((n) => /\.tsx?$/.test(n) && !/\.(test|testkit)\./.test(n))
    .filter((n) => !fora.some((f) => n.startsWith(f)))
    .sort()
    .map((n) => `${pasta}/${n}`);
}

/**
 * Os caminhos ABSOLUTOS do ficheiro e das casas dele: o ficheiro, as pastas
 * privadas, e a lógica pura em `lib/`.
 */
export function ficheirosDe(ficheiro: FicheiroPartido): string[] {
  const { pastas, fora, lib } = CASAS[ficheiro];
  return [
    join(ADMIN, ficheiro),
    ...pastas.flatMap((p) => daPasta(ADMIN, p, fora).map((rel) => join(ADMIN, rel))),
    ...lib.flatMap((p) => daPasta(SRC, p, []).map((rel) => join(SRC, rel))),
  ];
}

/**
 * O texto de todos, colado, pela ordem de `ficheirosDe`.
 *
 * `porFicheiro` corre em CADA ficheiro antes de os colar — é onde vai um
 * «tira os comentários». Correr depois de colar deixava um `/*` mal fechado de
 * um ficheiro (uma string como `"image/*"` engana os removedores simples)
 * engolir o ficheiro seguinte.
 */
export function fonteDe(
  ficheiro: FicheiroPartido,
  porFicheiro: (texto: string) => string = (t) => t,
): string {
  return ficheirosDe(ficheiro)
    .map((abs) => porFicheiro(readFileSync(abs, "utf8")))
    .join("\n");
}

/** O `AdminClient.tsx` e as casas dele — o caso mais comum. */
export const fonteDoAdmin = (): string => fonteDe("AdminClient.tsx");

/**
 * O texto de UM ficheiro de uma casa (relativo a `admin/`) — para os testes que
 * recortam um bloco e precisam também do componente que esse bloco desenha
 * (por exemplo, a `<nav>` da barra e cada `DestinoDaBarra` lá dentro).
 */
export function fonteDaCasa(
  rel: string,
  porFicheiro: (texto: string) => string = (t) => t,
): string {
  return porFicheiro(readFileSync(join(ADMIN, rel), "utf8"));
}

/**
 * O texto de um ficheiro com cada componente das casas COLADO NO SÍTIO ONDE É
 * CHAMADO (recursivamente), para as réguas que leem «pela ordem da fonte» — a
 * escada de entrada de uma vista, por exemplo — continuarem a ler pela ordem do
 * ecrã depois de a vista se partir em componentes.
 *
 * Cola componentes importados de uma pasta privada (`./_casa/…`) ou de uma das
 * `PECAS_SOLTAS`. O ficheiro do componente entra LOGO A SEGUIR à etiqueta de
 * abertura, e o texto da chamada FICA: as props dela continuam a ser lidas
 * (uma `--cena` posta na chamada não desaparece), e uma chamada dentro das
 * props de outra (`cartao={(q) => <QuoteCard … />}`) também se cola. Uma
 * etiqueta com filhos (`<LinhaDeEscrever …>…</LinhaDeEscrever>`) cola-se do
 * mesmo modo, à frente dos filhos. O fim da etiqueta acha-se contando `{}` e
 * `()` e saltando aspas e comentários (`fimDaEtiqueta`). `porFicheiro` corre em
 * cada ficheiro antes de colar.
 */
export function fonteComposta(
  rel: string,
  porFicheiro: (texto: string) => string = (t) => t,
  vistos: ReadonlySet<string> = new Set(),
): string {
  confirmarPecasSoltas();
  const abs = join(ADMIN, rel);
  const texto = porFicheiro(readFileSync(abs, "utf8"));
  const componentes = new Map<string, string>();
  for (const m of texto.matchAll(/import \{([^}]*)\} from "(\.{1,2}\/[^"]+)";/g)) {
    const destino = relative(ADMIN, join(dirname(abs), m[2]));
    const daCasa = destino.split("/").some((parte) => parte.startsWith("_"));
    if (!daCasa && !PECAS_SOLTAS.includes(`${destino}.tsx`)) continue;
    // Um `.ts` (tipos, constantes) não desenha nada: só os `.tsx` se colam.
    if (!existsSync(join(ADMIN, `${destino}.tsx`))) continue;
    for (const nome of m[1].split(",").map((n) => n.replace(/^type /, "").trim())) {
      if (/^[A-Z]/.test(nome)) componentes.set(nome, `${destino}.tsx`);
    }
  }
  const colas: { onde: number; texto: string }[] = [];
  for (const m of texto.matchAll(/<([A-Z]\w*)\b/g)) {
    const ficheiro = componentes.get(m[1]);
    if (!ficheiro || vistos.has(ficheiro)) continue;
    const etiqueta = fimDaEtiqueta(texto, m.index);
    if (etiqueta === null) continue;
    colas.push({
      onde: etiqueta.fim,
      texto: fonteComposta(ficheiro, porFicheiro, new Set([...vistos, rel, ficheiro])),
    });
  }
  colas.sort((a, b) => a.onde - b.onde);
  let saida = "";
  let k = 0;
  for (const { onde, texto: colado } of colas) {
    saida += texto.slice(k, onde) + "\n" + colado + "\n";
    k = onde;
  }
  return saida + texto.slice(k);
}

/**
 * Peças de um ecrã partido que ficaram ao lado dele, fora de uma pasta `_casa`
 * (os ficheiros que voltaram abaixo do tecto a 17/11). Coladas como as das casas.
 */
export const PECAS_SOLTAS: readonly string[] = [
  "CommandPaletteIcone.tsx",
  "ContratosDetalhe.tsx",
  "FornecedoresIcones.tsx",
];

/** Uma peça renomeada deixava de ser colada em silêncio: falha alto, como o `daPasta`. */
function confirmarPecasSoltas(): void {
  const faltam = PECAS_SOLTAS.filter((p) => !existsSync(join(ADMIN, p)));
  if (faltam.length > 0) {
    throw new Error(`fonte-do-admin: PECAS_SOLTAS que já não existem: ${faltam.join(", ")}`);
  }
}

/**
 * Onde acaba a etiqueta de abertura que começa em `inicio` (o índice logo
 * depois do `>` ou do `/>`), e se ela se fecha sozinha. Conta `{}` e `()`, salta
 * o que está entre aspas (`"`, `'`, `` ` ``) e os comentários dentro das
 * expressões, e um `>` só fecha se não vier de `=>`. `null` se não fechar, ou
 * se aparecer outra etiqueta antes de fechar (não é JSX que se perceba).
 */
export function fimDaEtiqueta(
  texto: string,
  inicio: number,
): { fim: number; sozinha: boolean } | null {
  let fundura = 0;
  let aspas: string | null = null;
  for (let i = inicio + 1; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === "\\") i++;
      else if (c === aspas) aspas = null;
      continue;
    }
    if (fundura > 0 && c === "/" && texto[i + 1] === "/") {
      const nl = texto.indexOf("\n", i);
      if (nl < 0) return null;
      i = nl;
      continue;
    }
    if (c === "/" && texto[i + 1] === "*") {
      const fecho = texto.indexOf("*/", i + 2);
      if (fecho < 0) return null;
      i = fecho + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") aspas = c;
    else if (c === "{" || c === "(") fundura++;
    else if (c === "}" || c === ")") fundura--;
    else if (fundura === 0) {
      if (c === "/" && texto[i + 1] === ">") return { fim: i + 2, sozinha: true };
      if (c === ">" && texto[i - 1] !== "=") return { fim: i + 1, sozinha: false };
      if (c === "<") return null;
    }
  }
  return null;
}
