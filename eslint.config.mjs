import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** A guarda do server-only (ver o bloco de `src/app/**`), escrita uma vez. */
const SERVER_ONLY = {
  group: ["@/lib/*-store", "@/lib/repository", "server-only"],
  allowTypeImports: true,
  message:
    "Módulo server-only importado por valor num componente de cliente — puxa fs/Supabase para o bundle e parte o build. Use `import type` (para tipos) ou desloque o acesso a dados para um componente/rota de servidor.",
};

/** Os ecrãs que se partiram: uma casa nunca os importa (seria uma seta para cima). */
const OS_DONOS = {
  group: ["**/AdminClient", "**/Temas", "**/ThemePicker", "**/Propostas"],
  caseSensitive: true,
  message:
    "Uma casa (`_casca/`, `_pedidos/`, `_temas/`, `_propostas/`) não importa o ecrã que a monta — as setas só descem. Passe o que precisa por props, ou leve a peça para a casa ou para `lib/`.",
};

const CASAS = ["_casca", "_pedidos", "_temas", "_propostas"];
const TESTES = ["**/*.test.ts", "**/*.test.tsx", "**/*.testkit.ts"];

/**
 * As regras das fronteiras (ver o comentário no sítio onde entram):
 *   · a lógica pura de `lib/orcamento/pedidos/` e `lib/temas/` não importa
 *     React, Next, o Supabase, nem nada de `app/`;
 *   · uma casa não importa o `AdminClient`, o `Temas`, o `ThemePicker` nem o
 *     `Propostas`;
 *   · uma casa não importa o interior de outra.
 * Os testes ficam de fora: provar uma casa pode precisar de montar o ecrã.
 */
function fronteirasDasCasas() {
  const puro = {
    files: ["src/lib/orcamento/pedidos/**/*.ts", "src/lib/temas/**/*.ts"],
    ignores: TESTES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "react/*",
                "react-dom/*",
                "next",
                "next/*",
                "@supabase/*",
                "@/lib/supabase",
                "@/lib/supabase/*",
                "**/supabase",
                "@/lib/*-store",
                "@/lib/repository",
                "@/app/*",
                "server-only",
              ],
              message:
                "Lógica pura (`lib/orcamento/pedidos/`, `lib/temas/`): sem React, sem Next, sem Supabase e sem nada de `app/`. Leia e escreva na casca (o hook ou o componente) e passe aqui só os dados.",
            },
            {
              group: [
                "**/_casca/**",
                "**/_pedidos/**",
                "**/_temas/**",
                "**/_propostas/**",
                "**/admin/**",
              ],
              message:
                "Lógica pura não importa o back office: as setas descem de `lib/` para as casas, nunca ao contrário.",
            },
          ],
        },
      ],
    },
  };
  const casas = CASAS.map((casa) => ({
    files: [`src/app/**/admin/${casa}/**/*.ts`, `src/app/**/admin/${casa}/**/*.tsx`],
    ignores: TESTES,
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            SERVER_ONLY,
            OS_DONOS,
            {
              group: CASAS.filter((c) => c !== casa).flatMap((c) => [`**/${c}`, `**/${c}/**`]),
              message: `\`${casa}/\` não importa o interior de outra casa. O que é preciso nas duas sobe para \`lib/\` (se for regra) ou para \`ui/\` (se for peça de interface).`,
            },
          ],
        },
      ],
    },
  }));
  return [puro, ...casas];
}

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // The React Compiler rules (Next 16 / eslint-plugin-react-hooks v6) are
  // advisory for this existing codebase — the affected components build and
  // run correctly. We keep them visible as warnings (so they show up and can
  // be paid down over time) rather than hard errors that would block CI on
  // working code. Correctness, Next and TS rules stay as errors.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // ── O `_` À FRENTE QUER DIZER «DE PROPÓSITO» ─────────────────────────────
  // Achado n.º 39 da auditoria: dos 66 avisos de «não usado», a maioria eram
  // parâmetros de duplos de teste (`(_url, _init) => …`, que têm de ter a forma
  // da função verdadeira) e campos tirados de um objecto por desestruturação
  // (`{ id: _g, ...resto }`). O `_` à frente é a convenção para «não uso isto
  // de propósito»; o aviso fica para o resto, que é código morto a sério.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Test files don't ship to the browser; allow pragmatic casts (e.g. fakes).
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Server-only boundary guard. The recurring build-breaker is a client
  // component that VALUE-imports a server-only module — a `*-store` (→ repository
  // → fs/Supabase), the repository itself, or `server-only`. Bundling any of
  // those into the browser build fails the build. Make it an editor/CI error.
  //
  // Scope: React components under app/ and components/ (where client components
  // live). `allowTypeImports` keeps `import type { Invoice } from "@/lib/invoices-store"`
  // legal (types are erased before bundling), so the current clean codebase — which
  // only ever type-imports a store from a client component — stays green. Server
  // entry points (page/layout/template) and tests legitimately reach the stores
  // and are exempted in the override right below.
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/*-store", "@/lib/repository", "server-only"],
              allowTypeImports: true,
              message:
                "Módulo server-only importado por valor num componente de cliente — puxa fs/Supabase para o bundle e parte o build. Use `import type` (para tipos) ou desloque o acesso a dados para um componente/rota de servidor.",
            },
          ],
        },
      ],
    },
  },
  // ── AS FRONTEIRAS DAS CASAS DO BACK OFFICE (júri das fases 7 e 8) ─────────
  //
  // As fases 7 e 8 de `docs/ESTRUTURA-DO-CODIGO.md` partiram o `AdminClient`,
  // o `Temas` e o `ThemePicker` em casas privadas (`_casca/`, `_pedidos/`,
  // `_temas/`) e em lógica pura (`lib/orcamento/pedidos/`, `lib/temas/`). As
  // setas só descem: `lib/…` ← casa ← o ecrã que a monta. Uma fronteira que
  // nenhuma ferramenta verifica acaba atravessada (Parte 1, §1.2) — esta é a
  // ferramenta.
  //
  // ATENÇÃO à forma do ESLint: um bloco que volta a pôr a mesma regra SUBSTITUI
  // a de cima, não se soma. Por isso cada bloco repete a guarda do server-only.
  ...fronteirasDasCasas(),
  // Server entry points (page/layout/template) and tests run on the server and
  // legitimately value-import the stores — lift the client-boundary guard there.
  {
    files: ["**/page.tsx", "**/layout.tsx", "**/template.tsx", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // ── A COMPLEXIDADE À VISTA, EM AVISO (fase 0 de `docs/ESTRUTURA-DO-CODIGO.md`) ──
  //
  // Para se ver, não para parar: os gigantes de hoje (o `ProposalStudio`, com
  // complexidade 279 e 7 043 linhas de código numa função) saem por fases, e
  // um erro aqui deixava o lint vermelho até lá. Os números são os da medição
  // da §2.11 do documento. Só no código de produção: um `describe` comprido
  // não é o problema que isto mede.
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      complexity: ["warn", 30],
      "max-lines-per-function": ["warn", { max: 400, skipComments: true, skipBlankLines: true }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Qualquer OUTRA pasta de compilação do Next, não só a `.next`.
    //
    // O `next build --distDir` cria pastas com outro nome, e uma medição de
    // antes/depois cria-as normalmente duas. Sem esta linha o ESLint tenta
    // analisar o produto da compilação: aconteceu, e o resultado foi 1780 de
    // ~1843 ficheiros com problemas — o `npm run lint` deixou de servir para
    // nada em todo o repositório, e chegou a rebentar com ENOENT por estar a
    // ler uma pasta que ainda estava a ser escrita.
    ".next-*/**",

    // ── E O QUE O PLAYWRIGHT DEIXA ATRÁS ────────────────────────────────
    //
    // É a mesma avaria da linha de cima, com outro nome. O relatório do
    // Playwright traz o VISUALIZADOR dele — cinco ficheiros de JavaScript
    // minificado, com um CodeMirror lá dentro. O ESLint lê-os e devolve 159
    // erros de `no-this-alias` em código que ninguém desta casa escreveu.
    //
    // MEDIDO no dia em que isto entrou: `npm run lint` passou de «0 erros, 129
    // avisos» para «159 erros, 2969 avisos» — só por eu ter corrido os
    // passeios antes. O CI não vê isto (arranca limpo e faz o lint antes do
    // Playwright), portanto é uma armadilha só de quem trabalha na máquina: o
    // lint local deixa de servir para nada exactamente quando mais faz falta,
    // que é depois de mexer em testes.
    //
    // As duas pastas estão no `.gitignore` — isto é só para o ESLint as ver
    // com os mesmos olhos.
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
