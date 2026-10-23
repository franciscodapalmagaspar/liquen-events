/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONSTRUÇÃO NÃO REAPROVEITA O QUE O COMPILADOR GUARDOU DA ANTERIOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A 23/10 o back office publicado abriu «todo estranho». Medido no site: a
 * folha do back office era o `admin.css` de ANTES do #267 (sem as 137 regras
 * que esse PR lhe passou — `.bo-card`, `.bo-input`, os tokens em
 * `body:is(.admin-mode, …)`), servida ao lado do `globals.css` de DEPOIS (já
 * sem elas). O mesmo código, construído do zero aqui, sai certo.
 *
 * A diferença era a cache: a Vercel repõe a `.next/cache` da publicação
 * anterior (de 21/10), e a parte do compilador (`.next/cache/turbopack`)
 * devolveu a folha velha de um ficheiro que tinha mudado.
 *
 * Por isso apaga-se SÓ essa pasta, antes de cada construção. Ficam as caches
 * das miniaturas (`pregen-gallery`, `pregen-logos`, `pregen-heroes`), que são
 * as que poupam uma hora — e que se conferem pelo conteúdo de cada fotografia.
 * O compilador do zero custa uns minutos a mais; uma folha errada no ar custa
 * o back office.
 *
 * A rede do outro lado é o `folhas-que-existem.mjs`: se a folha do back office
 * sair sem os seus tokens, a construção falha e nada é publicado.
 */
import { rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const pasta = join(process.argv[2] ?? ".next", "cache", "turbopack");
if (existsSync(pasta)) {
  rmSync(pasta, { recursive: true, force: true });
  console.log(`sem-cache-do-compilador: apagada ${pasta}`);
} else {
  console.log(`sem-cache-do-compilador: nada a apagar (${pasta})`);
}
