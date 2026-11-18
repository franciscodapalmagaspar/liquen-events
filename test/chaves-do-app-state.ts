import ts from "typescript";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS CHAVES QUE UM FICHEIRO DÁ AO `app_state`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A ferramenta do teste que prende o registo dos espaços
 * (`src/lib/app-state/espacos.test.ts`): lê um ficheiro pela árvore do
 * compilador e devolve as chaves (ou inícios de chave) que ele passa ao
 * `app_state`. Vive em `test/`, fora da aplicação: importa o compilador de
 * TypeScript. Os casos dela estão no mesmo teste («a varredura apanha uma
 * chave nova por registar»).
 */

const FUNCOES_DO_APP_STATE = new Set([
  "getState",
  "setState",
  "getStates",
  "listStateByPrefix",
  "lerEstadoComVersao",
  "gravarEstadoSeNaoMudou",
  "apagarEstadoPorPrefixo",
  "apagarEstado",
  "apagarLapides",
  "apagarEstadoSeNaoMudou",
  "varrerPrefixo",
]);

/** O texto fixo do início de um literal (o literal todo, ou a cabeça do modelo). */
function inicioDoLiteral(no: ts.Node | undefined): string | null {
  if (!no) return null;
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return no.text;
  if (ts.isTemplateExpression(no)) return no.head.text;
  return null;
}

/**
 * As chaves (ou inícios de chave) que um ficheiro dá ao `app_state`:
 *  · o 1.º argumento literal das funções de `app-state.ts`;
 *  · nos ficheiros que usam o `app_state`, as constantes `CHAVE…`/`…PREFIX…` e
 *    os modelos devolvidos pelas funções `chave…` — é por elas que passam
 *    quase todas as chaves (`draftKey`, `chaveDosEnvios`, `chaveDoMes`…).
 */
export function chavesDoFicheiro(fonte: string, nome = "f.ts"): string[] {
  const usaAppState = /app-state"|"app_state"/.test(fonte);
  const sf = ts.createSourceFile(nome, fonte, ts.ScriptTarget.Latest, true);
  // Só as funções IMPORTADAS de `app-state` (um `setState` do React não conta).
  const importadas = new Set<string>();
  for (const d of sf.statements) {
    if (!ts.isImportDeclaration(d) || !ts.isStringLiteral(d.moduleSpecifier)) continue;
    if (!/(^|\/)app-state(\/apagar|\/varrer)?$/.test(d.moduleSpecifier.text)) continue;
    const nomes = d.importClause?.namedBindings;
    if (nomes && ts.isNamedImports(nomes)) {
      for (const e of nomes.elements) {
        const original = (e.propertyName ?? e.name).text;
        if (FUNCOES_DO_APP_STATE.has(original)) importadas.add(e.name.text);
      }
    }
  }
  const achadas: string[] = [];
  const guardar = (t: string | null) => {
    if (t) achadas.push(t);
  };
  const visitar = (no: ts.Node, dentroDeChave: boolean): void => {
    if (ts.isCallExpression(no) && ts.isIdentifier(no.expression)) {
      if (importadas.has(no.expression.text)) guardar(inicioDoLiteral(no.arguments[0]));
    }
    if (usaAppState && ts.isVariableDeclaration(no) && ts.isIdentifier(no.name)) {
      if (/CHAVE|PREFIX/.test(no.name.text)) guardar(inicioDoLiteral(no.initializer));
    }
    if (usaAppState && dentroDeChave && ts.isReturnStatement(no)) {
      guardar(inicioDoLiteral(no.expression));
    }
    const nomeDaFuncao =
      ts.isFunctionDeclaration(no) && no.name
        ? no.name.text
        : ts.isVariableDeclaration(no) &&
            ts.isIdentifier(no.name) &&
            no.initializer &&
            (ts.isArrowFunction(no.initializer) || ts.isFunctionExpression(no.initializer))
          ? no.name.text
          : "";
    const ehFuncaoDeChave = /^chave|Key$/.test(nomeDaFuncao) || dentroDeChave;
    // Uma arrow de corpo curto (`const chaveX = (id) => \`x:${id}\``) devolve
    // sem `return`.
    if (ehFuncaoDeChave && usaAppState && ts.isArrowFunction(no) && !ts.isBlock(no.body)) {
      guardar(inicioDoLiteral(no.body));
    }
    ts.forEachChild(no, (f) => visitar(f, ehFuncaoDeChave));
  };
  visitar(sf, false);
  return achadas;
}
