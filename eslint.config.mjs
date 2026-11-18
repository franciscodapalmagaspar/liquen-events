import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
  // Server entry points (page/layout/template) and tests run on the server and
  // legitimately value-import the stores — lift the client-boundary guard there.
  {
    files: ["**/page.tsx", "**/layout.tsx", "**/template.tsx", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-restricted-imports": "off",
    },
  },
  // ── AS FRONTEIRAS DAS CASAS (fases 7 e 8 de `docs/ESTRUTURA-DO-CODIGO.md`) ──
  //
  // A direcção das dependências desce: `lib/…` ← `_pedidos`, `_temas` ←
  // `_casca` ← `AdminClient`/`Temas`/`ThemePicker`. Fronteira sem ferramenta
  // acaba atravessada; estas duas regras dizem-no em erro. Usam a regra base
  // `no-restricted-imports` (e não a do TypeScript, que a de cima já ocupa
  // nestes ficheiros — duas entradas da mesma regra substituíam-se).
  //
  // 1. A lógica pura não conhece React, o Next, a base de dados nem a interface.
  {
    files: [
      "src/lib/orcamento/pedidos/**/*.ts",
      "src/lib/orcamento/estudio/**/*.ts",
      "src/lib/temas/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "next", "next/*", "server-only"],
              message:
                "A lógica pura dos pedidos, do estúdio e dos temas não importa React nem o Next: o estado e os efeitos vivem nos hooks das casas.",
            },
            {
              group: ["@/lib/supabase*", "@/lib/*-store", "@/lib/repository"],
              message: "A lógica pura não lê a base de dados: recebe os dados por argumento.",
            },
            {
              group: ["@/app/*", "**/app/**"],
              message: "A lógica pura não conhece a interface (`src/app`).",
            },
          ],
        },
      ],
    },
  },
  // 2. As casas não importam o ficheiro que as tem, nem o interior umas das
  //    outras — só a `_casca`, que compõe, olha para as acções dos pedidos.
  {
    files: [
      "src/app/**/orcamento/admin/_pedidos/**/*.{ts,tsx}",
      "src/app/**/orcamento/admin/_temas/**/*.{ts,tsx}",
      "src/app/**/orcamento/admin/_casca/**/*.{ts,tsx}",
    ],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/AdminClient", "**/Temas", "**/ThemePicker"],
              caseSensitive: true,
              message:
                "Uma casa não importa o ficheiro que a compõe (fazia um ciclo): o que ela precisa desce por props, por contexto ou por um módulo próprio.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/orcamento/admin/_pedidos/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/AdminClient", "**/Temas", "**/ThemePicker"],
              caseSensitive: true,
              message: "Ver a regra das casas, acima.",
            },
            {
              group: ["**/_casca/**", "**/_temas/**"],
              message: "Os pedidos não conhecem a casca nem os temas.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/app/**/orcamento/admin/_temas/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/AdminClient", "**/Temas", "**/ThemePicker"],
              caseSensitive: true,
              message: "Ver a regra das casas, acima.",
            },
            {
              group: ["**/_casca/**", "**/_pedidos/**"],
              message: "Os temas não conhecem a casca nem os pedidos.",
            },
          ],
        },
      ],
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
