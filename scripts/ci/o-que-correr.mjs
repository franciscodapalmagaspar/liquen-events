/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE UMA MUDANÇA PRECISA DE VERIFICAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (15/10), a escolher entre «sempre tudo» e «inteligente»: «Inteligente +
 * completa depois». Antes de juntar, corre o que a mudança pode afectar; a
 * verificação COMPLETA corre a seguir a cada junção ao `main`, todas as noites
 * e quando se pede à mão. Esta função decide a parte de antes.
 *
 * NA DÚVIDA, TUDO. Cada regra abaixo só tira trabalho quando é óbvio que a
 * mudança não lhe chega:
 *
 *   · só documentos (docs/, *.md, referencia/) → só o lint e o typecheck;
 *   · os testes de unidade → os que importam, directa ou indirectamente, um
 *     ficheiro mudado (o grafo do próprio vitest: `vitest related`);
 *   · os passeios no browser, por área: uma mudança SÓ no sítio público não
 *     corre os passeios que gravam do back office, e vice-versa. Tudo o que é
 *     partilhado (src/lib, componentes comuns, estilos, configuração) corre
 *     os dois.
 *
 * Função pura, sem git nem rede: recebe a lista de ficheiros e o evento, e
 * devolve a decisão. O workflow chama-a com a lista do PR (`main()` em baixo).
 */

/** Ficheiros de que tudo depende: mudar um deles corre a verificação toda. */
const TUDO = [
  /^package(-lock)?\.json$/,
  /^next\.config\./,
  /^tsconfig/,
  /^vitest\./,
  /^playwright\./,
  /^eslint\.config/,
  /^postcss\.config/,
  /^lighthouserc/,
  /^\.github\//,
  /^e2e\//,
  /^test\//,
  /^scripts\//,
  /^src\/(middleware|proxy|instrumentation)\./,
  /^src\/app\/(\[lang\]\/)?layout\./,
  /^src\/app\/[^/]+\.css$/,
  /^src\/lib\/i18n\//,
  /^public\/sw\.js$/,
];

/** Só palavras: não chegam ao produto. */
const DOCUMENTOS = [/^docs\//, /^referencia\//, /\.md$/i, /^auditoria\//];

/** O sítio público (o que o casal e os visitantes vêem). */
const SITIO = [/^src\/app\/\[lang\]\/\(site\)\//, /^public\//, /^src\/components\//];

/** O back office e as rotas que o servem. */
const BACK_OFFICE = [/^src\/app\/\[lang\]\/\(admin\)\//, /^src\/app\/api\//];

/**
 * O SQL não entra no grafo do vitest (lê-se do disco, não se importa): uma
 * mudança em `db/` corre à mão o teste que o corre num Postgres a sério.
 */
const BASE_DE_DADOS = /^db\//;
export const TESTE_DAS_MIGRACOES = "test/migracoes.pglite.test.ts";

const casa = (lista, f) => lista.some((r) => r.test(f));

/**
 * @param {string[]} ficheiros os caminhos mudados, a partir da raiz
 * @param {string} evento `pull_request`, `push`, `schedule`, `workflow_dispatch`…
 * @returns {{ tudo: boolean, unidade: "tudo" | "ligados" | "nada", sitio: boolean,
 *   backOffice: boolean, ligados: string[], porque: string }}
 */
export function oQueCorrer(ficheiros, evento) {
  const todos = (porque) => ({
    tudo: true,
    unidade: "tudo",
    sitio: true,
    backOffice: true,
    ligados: [],
    porque,
  });
  if (evento !== "pull_request") return todos(`evento «${evento}»: verificação completa`);
  // Uma lista vazia, ou cortada pela API (3000 ficheiros), não prova nada.
  if (ficheiros.length === 0 || ficheiros.length >= 3000)
    return todos("lista de ficheiros incerta");
  const dependem = ficheiros.filter((f) => casa(TUDO, f));
  if (dependem.length) return todos(`muda ${dependem[0]}, de que tudo depende`);

  const codigo = ficheiros.filter((f) => !casa(DOCUMENTOS, f));
  if (codigo.length === 0) {
    return {
      tudo: false,
      unidade: "nada",
      sitio: false,
      backOffice: false,
      ligados: [],
      porque: "só documentos",
    };
  }

  let sitio = false;
  let backOffice = false;
  for (const f of codigo) {
    if (casa(SITIO, f)) sitio = true;
    else if (casa(BACK_OFFICE, f)) backOffice = true;
    else {
      // src/lib, src/data, o resto de src/app e o que não se reconhece:
      // partilhado — os dois.
      sitio = true;
      backOffice = true;
    }
  }
  const areas = [sitio && "sítio", backOffice && "back office"].filter(Boolean).join(" e ");
  return {
    tudo: false,
    unidade: "ligados",
    sitio,
    backOffice,
    ligados: [
      ...codigo.filter((f) => /\.(m?[jt]sx?)$/.test(f)),
      ...(codigo.some((f) => BASE_DE_DADOS.test(f)) ? [TESTE_DAS_MIGRACOES] : []),
    ],
    porque: `código do ${areas}: os testes ligados e os passeios dessa área`,
  };
}

/** No CI: lê a lista do PR e escreve a decisão em `$GITHUB_OUTPUT`. */
async function main() {
  const fs = await import("node:fs");
  const evento = process.env.EVENTO ?? "workflow_dispatch";
  const lista = (
    process.env.FICHEIROS_DO_PR_EM ? fs.readFileSync(process.env.FICHEIROS_DO_PR_EM, "utf8") : ""
  )
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const d = oQueCorrer(lista, evento);
  // Um ficheiro apagado pelo PR não tem testes ligados (e o vitest queixava-se).
  d.ligados = d.ligados.filter((f) => fs.existsSync(f));
  const saida = [
    `tudo=${d.tudo}`,
    `unidade=${d.unidade}`,
    `sitio=${d.sitio}`,
    `back_office=${d.backOffice}`,
    `e2e=${d.sitio || d.backOffice}`,
    `ligados=${d.ligados.join(" ")}`,
  ].join("\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${saida}\n`);
  console.log(saida);
  console.log(`::notice title=O que se verifica::${d.porque} (${lista.length} ficheiros mudados)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
