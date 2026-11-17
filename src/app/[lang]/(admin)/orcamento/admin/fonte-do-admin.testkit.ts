import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEXTO DO «ADMINCLIENT», ONDE QUER QUE ELE VIVA AGORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Há dezenas de testes que leem o TEXTO do `AdminClient.tsx` para prender uma
 * classe, uma duração ou uma regra de desenho. A fase 7 de
 * `docs/ESTRUTURA-DO-CODIGO.md` partiu esse ficheiro por secções: o que era da
 * lista e do painel dos pedidos foi para `_pedidos/`, e o que é a casca do back
 * office (menu, cabeçalho, barra de baixo) para `_casca/`.
 *
 * Um teste que continuasse a ler só o `AdminClient.tsx` deixava de ver o que
 * saiu — e ficava verde por não encontrar nada, que é a pior maneira de um
 * teste mentir. Esta é a porta única: o texto do componente e o das casas
 * novas, juntos, por uma ordem fixa (o componente primeiro, depois as pastas
 * por ordem alfabética). Quando a próxima fase mover mais alguma coisa, muda-se
 * AQUI, e não em quarenta testes.
 */
const ADMIN = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/** As pastas privadas para onde o `AdminClient.tsx` se partiu. */
export const CASAS_DO_ADMIN = ["_casca", "_pedidos"] as const;

/** Os caminhos (relativos à pasta `admin/`) do componente e das casas dele. */
export function ficheirosDoAdmin(): string[] {
  const casas = CASAS_DO_ADMIN.flatMap((pasta) => {
    let nomes: string[] = [];
    try {
      nomes = readdirSync(join(ADMIN, pasta), { recursive: true }) as string[];
    } catch {
      return [];
    }
    return nomes
      .filter((n) => /\.tsx?$/.test(n) && !/\.(test|testkit)\./.test(n))
      .sort()
      .map((n) => `${pasta}/${n}`);
  });
  return ["AdminClient.tsx", ...casas];
}

/** O texto de todos, colado, pela ordem de `ficheirosDoAdmin`. */
export function fonteDoAdmin(): string {
  return ficheirosDoAdmin()
    .map((rel) => readFileSync(join(ADMIN, rel), "utf8"))
    .join("\n");
}
