/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE ROTAS CHEGAM A UM PACOTE — para o binário só ir onde é preciso (9/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela: «é preciso mesmo que este Vercel esteja incrível, que se gaste o menos
 * possível». O `next.config.ts` metia a biblioteca nativa do `sharp` (18 MB:
 * `@img/sharp-libvips-linux-x64`) em TODAS as rotas `/api/**` — 125 — porque o
 * rastreador não a vê (é aberta por `dlopen`) e em 2026 uma rota que a usava
 * sem a ter partiu os Temas em produção. Só 46 chegam ao `sharp`.
 *
 * Isto segue os `import` (estáticos, `import()` e `require` com texto fixo,
 * pelo `@/` e por caminhos relativos) de cada `route.ts` e diz quais chegam ao
 * pacote. Corre de cada vez que o `next.config.ts` é lido — uma rota nova que
 * passe a usar o `sharp` entra sozinha na lista, sem ninguém se lembrar.
 *
 * O que NÃO vê: um `import()` de um texto montado em tempo de execução. Não há
 * nenhum que chegue ao `sharp` hoje; o teste prende as rotas que já partiram.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative, sep } from "node:path";

const EXTENSOES = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];
const IMPORTS =
  /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm;

function resolver(raiz, de, alvo) {
  let base;
  if (alvo.startsWith("@/")) base = join(raiz, "src", alvo.slice(2));
  else if (alvo.startsWith(".")) base = normalize(join(dirname(de), alvo));
  else return null;
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const e of EXTENSOES) if (existsSync(base + e)) return base + e;
  return null;
}

function rotasDe(pasta, lista = []) {
  for (const nome of readdirSync(pasta)) {
    const c = join(pasta, nome);
    if (statSync(c).isDirectory()) rotasDe(c, lista);
    else if (nome === "route.ts") lista.push(c);
  }
  return lista;
}

/**
 * As rotas (como chaves do `outputFileTracingIncludes`: `[x]` → `*`, porque
 * `[token]` num padrão quer dizer «uma destas letras») que chegam a `pacote`.
 */
export function rotasQueUsam(pacote, raiz = process.cwd(), { comoPadrao = true } = {}) {
  const ligacoes = new Map();
  const ligacoesDe = (f) => {
    let l = ligacoes.get(f);
    if (l) return l;
    const texto = readFileSync(f, "utf8");
    l = { internos: [], externos: [] };
    for (const m of texto.matchAll(IMPORTS)) {
      const alvo = m[1] ?? m[2] ?? m[3] ?? m[4];
      const r = resolver(raiz, f, alvo);
      if (r) l.internos.push(r);
      else l.externos.push(alvo);
    }
    ligacoes.set(f, l);
    return l;
  };
  const chega = (inicio) => {
    const vistos = new Set();
    const pilha = [inicio];
    while (pilha.length) {
      const f = pilha.pop();
      if (vistos.has(f)) continue;
      vistos.add(f);
      const { internos, externos } = ligacoesDe(f);
      if (externos.some((x) => x === pacote || x.startsWith(`${pacote}/`))) return true;
      pilha.push(...internos);
    }
    return false;
  };
  const app = join(raiz, "src", "app");
  return rotasDe(app)
    .filter(chega)
    .map((f) => {
      const caminho = `/${relative(app, dirname(f)).split(sep).join("/")}`;
      return comoPadrao ? caminho.replace(/\[[^\]]+\]/g, "*") : caminho;
    })
    .sort();
}
