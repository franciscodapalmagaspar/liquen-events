/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUMA FOLHA DE ESTILOS PODE SAIR VAZIA DA COMPILAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, depois de abrir uma pré-visualização e encontrar o painel
 * desmanchado: «retira esse back office assim, para que isso nunca caia nesse
 * aspeto».
 *
 * ── O QUE ACONTECEU, PARA NINGUÉM TER DE ADIVINHAR ────────────────────────
 *
 * O `admin.css` ia buscar o tema com `@reference "./globals.css"`. Um
 * `@reference` traz TUDO o que o ficheiro referido tem — incluindo o
 * `@source not "./[lang]/(admin)"` —, e essa exclusão é absoluta: vence o
 * `source()` do próprio import. A folha do back office saiu com um
 * `@layer utilities` VAZIO. 1 771 bytes, dos quais quase tudo eram fontes.
 *
 * E não deu erro em lado nenhum. O `next build` compilou. Os 9 511 testes
 * passaram. O CI ficou verde nos oito checks. O Vercel publicou. Só o painel
 * é que abriu desmanchado — e ela é a única pessoa que o abre.
 *
 * ── PORQUE É QUE ISTO É UM GUIÃO DA COMPILAÇÃO E NÃO UM TESTE ─────────────
 *
 * Porque o Vercel NÃO CORRE TESTES. Corre o `npm run build`. Um teste de
 * unidade, por melhor que seja, protege o merge — não protege a
 * pré-visualização que ela abre no telemóvel a meio da noite. Esta rede tem
 * de estar dentro da própria compilação, e é por isso que está pendurada no
 * `build` do `package.json`.
 *
 * Há um teste também (`o-back-office-nao-viaja-na-proposta.test.ts`), e ele
 * gera o CSS com o mesmo motor. Mas quem trava a publicação é este.
 *
 * ── O QUE VERIFICA ────────────────────────────────────────────────────────
 *
 * Lê as folhas que a compilação REALMENTE escreveu — não os ficheiros-fonte,
 * não a configuração — e exige que nenhuma delas seja um invólucro vazio.
 * Uma folha que só tenha `@layer` e `@font-face` não é uma folha: é o sintoma.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * A pasta é argumento para haver como CORRER o controlo negativo: aponta-se
 * para uma cópia com uma folha esvaziada e confirma-se que ele morde. Uma
 * rede que nunca se viu falhar não é uma rede.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * ONDE ESTÃO AS FOLHAS — PROCURADAS, E NÃO ADIVINHADAS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Isto era `join(".next", "static", "chunks")`, escrito à mão. Funcionava aqui
 * e no CI, e **rebentava todos os deploys do Vercel**:
 *
 *     Error: ENOENT: no such file or directory,
 *            scandir '.next/static/chunks'
 *         at scripts/folhas-que-existem.mjs:64
 *
 * A construção passava inteira — compilava, verificava os tipos, gerava as 106
 * páginas — e morria neste guarda, a seguir, porque naquela máquina o
 * compilador não põe as folhas nessa pasta. Um caminho escrito à mão é uma
 * suposição sobre o que o compilador faz, e essa suposição envelhece: muda com
 * a versão, com o empacotador, e com a plataforma.
 *
 * (Custou uma tarde inteira a encontrar, e não por ser difícil: eu estava a ler
 * o erro ANTERIOR, de outro passo, e a assumir que era sempre o mesmo. Só
 * quando pedi o registo INTEIRO é que apareceu este.)
 *
 * Agora procura-se: varre-se a saída da construção INTEIRA atrás de `.css`,
 * seja em que pasta for. Nem sequer se assume que existe uma pasta `static` —
 * porque a única coisa que se sabe do registo do Vercel é que `static/chunks`
 * não estava lá, e não se sabe se a mãe estava.
 *
 * O guarda fica mais forte, não mais fraco: deixa de poder ser enganado por
 * uma mudança de arrumação, e continua a chumbar se não houver folha nenhuma,
 * que é o que ele veio apanhar.
 */
const RAIZ = process.argv[2] ?? ".next";

/**
 * Duas pastas ficam de fora, e por razões diferentes:
 *
 *  · `cache` guarda trabalho de construções ANTERIORES. Uma folha velha lá
 *    dentro faria este guarda dar por boa uma construção que não escreveu
 *    nada — exactamente o vazio que ele existe para apanhar.
 *  · `standalone` é uma CÓPIA da saída, feita quando se pede o pacote
 *    autossuficiente. Contá-la seria contar tudo duas vezes.
 */
// `cache` é trabalho interno do compilador; `standalone` é uma CÓPIA do que já
// se contou (e contá-la duas vezes fazia o guarda mentir sobre quantas folhas
// existem); `dev` é a saída do servidor de DESENVOLVIMENTO, que fica em
// `.next/dev` depois de um `npm run dev` e nada tem a ver com o que se
// construiu — em CI nem existe, mas em local punha aqui três folhas a mais.
const FORA = new Set(["cache", "standalone", "dev"]);

/** Todos os `.css` debaixo de uma pasta, a qualquer profundidade. */
function folhasEm(raiz) {
  if (!existsSync(raiz)) return [];
  const achadas = [];
  for (const entrada of readdirSync(raiz, { withFileTypes: true })) {
    if (entrada.isDirectory() && FORA.has(entrada.name)) continue;
    const caminho = join(raiz, entrada.name);
    if (entrada.isDirectory()) achadas.push(...folhasEm(caminho));
    else if (entrada.name.endsWith(".css")) achadas.push(caminho);
  }
  return achadas;
}

/**
 * Quantas REGRAS de estilo tem uma folha, sem contar com o que não pinta
 * nada: as declarações de camada, as fontes e as propriedades registadas.
 * É esta a pergunta certa — a folha avariada tinha 1 771 bytes e zero regras.
 */
function regrasQuePintam(css) {
  const semAtRegras = css
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/@layer[^;{]*;/g, "")
    .replace(/@property[^{]*\{[^}]*\}/g, "")
    .replace(/@charset[^;]*;/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return (semAtRegras.match(/\{/g) ?? []).length;
}

const caminhos = folhasEm(RAIZ);
const folhas = caminhos.map((caminho) => {
  const css = readFileSync(caminho, "utf8");
  return {
    nome: caminho.slice(RAIZ.length + 1),
    bytes: css.length,
    regras: regrasQuePintam(css),
  };
});

if (folhas.length === 0) {
  console.error(
    `✗ a compilação não escreveu folha de estilos nenhuma debaixo de \`${RAIZ}\`.` +
      (existsSync(RAIZ) ? "" : " (a pasta nem sequer existe)"),
  );
  process.exit(1);
}

/**
 * O chão é 1 e não um número redondo de propósito: o que se está a apanhar é
 * o VAZIO, e qualquer número maior seria uma opinião sobre o tamanho que uma
 * folha deve ter — opinião que envelhece e que um dia falha por nada.
 */
const vazias = folhas.filter((f) => f.regras === 0);

for (const f of folhas) {
  const marca = f.regras === 0 ? "✗" : "·";
  console.log(
    `  ${marca} ${f.nome.padEnd(26)} ${String(f.bytes).padStart(8)} bytes  ${String(f.regras).padStart(5)} regras`,
  );
}

if (vazias.length > 0) {
  console.error(
    `\n✗ ${vazias.length} folha(s) de estilos saíram VAZIAS: ${vazias.map((f) => f.nome).join(", ")}`,
  );
  console.error(
    "  Uma folha só com @layer e @font-face não pinta nada. A página que a\n" +
      "  carregar abre desmanchada, e nada mais no sistema se queixa.\n" +
      "  Causa conhecida: um `@reference` para uma folha que tem `@source not`\n" +
      "  — a exclusão é absoluta e vence o `source()` do próprio import.",
  );
  process.exit(1);
}

/**
 * ── A FOLHA DO BACK OFFICE TEM DE TRAZER OS SEUS TOKENS (23/10) ────────────
 *
 * Não vazia não chega: a 23/10 a folha do back office saiu com regras — mas
 * eram as de uma construção ANTERIOR (cache do compilador), sem os tokens e
 * os cartões que o #267 lhe tinha passado. O painel abriu «todo estranho» e
 * nada se queixou. Os tokens vivem em `body:is(.admin-mode, :has([data-admin-mode]))`
 * e definem `--bo-surface`; se nenhuma folha os tiver, a construção pára.
 * Ver `sem-cache-do-compilador.mjs`.
 */
const comTokens = caminhos.filter((caminho) => {
  const css = readFileSync(caminho, "utf8");
  return css.includes("data-admin-mode") && css.includes("--bo-surface:");
});
if (comTokens.length === 0) {
  console.error(
    "\n✗ nenhuma folha de estilos traz os tokens do back office\n" +
      "  (`[data-admin-mode]` com `--bo-surface:`). O painel abriria sem cores,\n" +
      "  cartões nem campos. Causa vista a 23/10: a cache do compilador devolveu\n" +
      "  a folha de uma construção anterior — ver sem-cache-do-compilador.mjs.",
  );
  process.exit(1);
}

console.log(
  `✓ ${folhas.length} folhas de estilos, todas com regras; os tokens do back office estão lá.`,
);
