import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import config from "../../next.config";
// @ts-expect-error — o picomatch compilado do Next não traz tipos; é o MESMO
// que o `collect-build-traces.js` usa, e é por isso que é este.
import picomatchSemTipos from "next/dist/compiled/picomatch";
const picomatch = picomatchSemTipos as (
  glob: string,
  opcoes: { dot: boolean; contains: boolean },
) => (s: string) => boolean;
import { rotasQueUsam } from "../../scripts/rotas-que-usam.mjs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA EXCLUSÃO LARGA DE MAIS APAGA O `sharp` QUE A INCLUSÃO GARANTIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta casa já teve o back office a não conseguir listar os TEMAS em produção.
 * O que os registos diziam não era um erro de base de dados nenhum:
 *
 *   Error: Could not load the "sharp" module using the linux-x64 runtime
 *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * A função rebentava INTEIRA, antes de chegar ao código da rota, e por isso o
 * ecrã nem conseguia dizer o que se passava: a lista aparecia vazia, como se
 * os temas dela tivessem desaparecido. Não tinham. Faltava o binário dentro do
 * pacote da função, e a correcção está escrita por extenso no `next.config`.
 *
 * Agora há uma lista de EXCLUSÕES ao lado da de inclusões — os `sharp` de
 * outras plataformas, 27 MB por função que nunca correm aqui. E as exclusões
 * são aplicadas DEPOIS das inclusões: um padrão escrito largo de mais engole o
 * que a linha de cima acabou de garantir, e traz de volta exactamente aquela
 * avaria. Sem erro de compilação, sem teste vermelho, sem nada — só em
 * produção, e só quando alguém tocar numa fotografia.
 *
 * Isto é o alarme: as duas listas não se podem tocar.
 */

/**
 * ── AS INCLUSÕES DEIXARAM DE VIVER TODAS NA MESMA CHAVE ────────────────────
 *
 * Havia uma chave só, `"/**"`, e por isso este ficheiro lia-a directamente. As
 * bibliotecas nativas de imagem passaram para `"/api/**"` — 135 rotas
 * carregavam 17,8 MB que 31 podiam usar, e o porquê está por extenso no
 * `next.config.ts`.
 *
 * O que este ficheiro guarda não muda com isso, porque nunca foi a chave: é
 * que uma exclusão não pode engolir o que uma inclusão garantiu. Junta-se
 * TODAS as inclusões, venham de que chave vierem — se um dia alguém acrescentar
 * uma chave nova, o alarme cobre-a sem ninguém se lembrar dele.
 */
const todos = (mapa: Record<string, string[]> | undefined) => Object.values(mapa ?? {}).flat();

const INCLUIDOS = todos(config.outputFileTracingIncludes as Record<string, string[]> | undefined);
const EXCLUIDOS = todos(config.outputFileTracingExcludes as Record<string, string[]> | undefined);

/** Que chave é que garante um dado padrão. */
function chaveDe(padrao: string): string | undefined {
  const mapa = (config.outputFileTracingIncludes ?? {}) as Record<string, string[]>;
  return Object.keys(mapa).find((k) => mapa[k].includes(padrao));
}

/** O padrão sem o `/**\/*` do fim — a pasta que ele apanha. */
const pasta = (padrao: string) => padrao.replace(/\/\*\*\/\*$/, "").replace(/^\.\//, "");

describe("o que o `sharp` leva para dentro da função", () => {
  it("nenhuma exclusão apaga o que uma inclusão garantiu", () => {
    /**
     * A comparação é por PASTA e por prefixo de caminho, e não por texto.
     *
     * `sharp-linux-x64` e `sharp-linuxmusl-x64` são nomes diferentes e nenhum
     * é prefixo do outro NO CAMINHO — mas `sharp-linux` seria prefixo dos
     * dois, e é assim que alguém partiria isto a tentar simplificar a lista.
     * Por isso a conta é feita com a barra: `a/` contra `b/`.
     */
    const colisoes: string[] = [];
    for (const inc of INCLUIDOS) {
      for (const exc of EXCLUIDOS) {
        const a = `${pasta(inc)}/`;
        const b = `${pasta(exc)}/`;
        if (a.startsWith(b) || b.startsWith(a)) colisoes.push(`${exc}  engole  ${inc}`);
      }
    }
    expect(
      colisoes,
      `uma exclusão apaga o que a inclusão garante — é a avaria dos temas de volta:\n  ${colisoes.join("\n  ")}`,
    ).toEqual([]);
  });

  it("o par que a função precisa continua garantido", () => {
    // O controlo positivo: sem estas duas linhas, o caso de cima passa por não
    // haver nada que ele possa reprovar.
    expect(INCLUIDOS, "o vínculo do `sharp` deixou de viajar com a função").toContain(
      "./node_modules/@img/sharp-linux-x64/**/*",
    );
    expect(INCLUIDOS, "o libvips deixou de viajar com a função").toContain(
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    );
  });

  it("e viaja para TODAS as rotas que dele precisam — e não para as outras (9/11)", () => {
    /**
     * Era uma chave só, `"/api/**"`: os 18 MB do libvips em todas as rotas da
     * API. Desde 9/11 a lista é calculada a cada construção
     * (`scripts/rotas-que-usam.mjs`) e só leva o binário quem chega ao
     * `sharp`. O que se guarda aqui é o que partiu os Temas em produção: cada
     * rota que chega ao `sharp` tem de casar com uma chave que leve o libvips —
     * medido com o MESMO picomatch, e as mesmas opções, que o Next usa
     * (`collect-build-traces.js`: `{ dot: true, contains: true }`).
     */
    const casa = (chave: string, rota: string) =>
      picomatch(chave, { dot: true, contains: true })(rota);
    const chavesComLibvips = Object.entries(
      (config.outputFileTracingIncludes ?? {}) as Record<string, string[]>,
    )
      .filter(([, ficheiros]) =>
        ficheiros.includes("./node_modules/@img/sharp-libvips-linux-x64/**/*"),
      )
      .map(([chave]) => chave);
    const precisam = rotasQueUsam("sharp", process.cwd(), { comoPadrao: false });
    expect(precisam).toContain("/api/temas/[id]/imagens");
    const sem = precisam.filter((r) => !chavesComLibvips.some((k) => casa(k, r)));
    expect(sem, `rotas que usam o sharp e ficam sem o libvips: ${sem.join(", ")}`).toEqual([]);
    // E poupa-se mesmo: uma rota que não lhe chega não o leva.
    expect(chavesComLibvips.some((k) => casa(k, "/api/vitals"))).toBe(false);
  });

  it("as imagens do email ficam na chave larga — falham em silêncio", () => {
    // O `readFileSync` do `email-assinatura.ts` rebenta sem elas, a assinatura
    // sai sem banner, e ninguém dá por isso porque o ficheiro está no
    // repositório e o sítio mostra-o na mesma. São 19 KB: não valem o risco de
    // uma chave estreita.
    expect(chaveDe("public/email/**/*"), "as imagens do email ficaram numa chave estreita").toBe(
      "/**",
    );
  });

  it("e o que se deita fora é um pacote real do `sharp`, e não o que corre aqui", () => {
    /**
     * ── ESTE TESTE JÁ MEDIU A COISA ERRADA, E CUSTOU UMA VOLTA DE CI ──────
     *
     * A asserção era `existsSync(pasta(exc))`: a pasta excluída tem de estar
     * instalada AQUI. A ideia estava certa — uma exclusão que não aponta para
     * nada é uma linha morta a fingir que poupa 27 MB — e a execução estava
     * errada, porque «aqui» não é onde isto conta.
     *
     * O `sharp` 0.35.4 passou a marcar as variantes de Alpine com a plataforma
     * a que servem, e o npm deixou de as instalar numa máquina de glibc. Este
     * teste ficou vermelho, eu li-o como «linhas mortas» e tirei as duas
     * exclusões do `musl`. Nas máquinas que CONSTROEM elas são instaladas, e o
     * passo «Peso das rotas» do CI respondeu na volta seguinte:
     *
     *     75 rotas levam ~17,8 MB que não têm como usar
     *
     * Ou seja: o `node_modules` de quem escreve o código não é a instalação
     * que decide. O que decide é o que o build instala.
     *
     * Passa a validar-se contra as `optionalDependencies` DO PRÓPRIO `sharp` —
     * a lista está no pacote, é a mesma em qualquer máquina, e continua a
     * apanhar o que este teste veio apanhar: um nome inventado, ou um pacote
     * que mudou de nome numa subida de versão.
     */
    /**
     * ── ONDE ESTÁ A VERDADE SOBRE «ISTO VAI SER INSTALADO?» ───────────────
     *
     * Esta asserção já esteve errada DUAS vezes, e as duas custaram uma volta
     * de CI:
     *
     *   1ª  `existsSync(…)` — o disco de quem escreve o código. Falso para
     *       pacotes de outra plataforma, que o npm salta AQUI e instala na
     *       máquina de construção. Levou-me a apagar as exclusões de Alpine e
     *       a mandar 17,8 MB para dentro de 75 rotas.
     *
     *   2ª  as `optionalDependencies` do `sharp`. Falso ao contrário: o
     *       `@img/sharp-wasm32` deixou de ser declarado no 0.35.4 e CONTINUA
     *       no lockfile, sobra que o npm não limpou. Tirei-o e as rotas
     *       voltaram a levá-lo.
     *
     * A verdade é o `package-lock.json` — é ele que o `npm ci` executa à
     * letra, e é igual em todas as máquinas. E dá para ser exacto sobre O QUE
     * LÁ É INSTALADO: cada pacote declara `os` e `cpu`, e o alvo é Linux x64.
     *
     * Repare-se no que o lockfile NÃO tem: `libc`. É por isso que o npm não
     * distingue glibc de Alpine e instala os DOIS — que é a raiz de tudo isto.
     *
     * ── E A REGRA DEIXA DE SER «não escrevas nomes errados» ───────────────
     *
     * Passa a ser a intenção inteira, nos dois sentidos:
     *
     *   · tudo o que é instalado e não é o binário que corre TEM de ser
     *     excluído (senão viaja dentro de todas as funções);
     *   · e nada que não seja instalado pode estar na lista (senão é uma linha
     *     morta a fingir que poupa).
     *
     * As duas vezes que me enganei teriam ficado vermelhas aqui, sem gastar
     * uma volta de CI.
     */
    const lockfile = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as {
      packages?: Record<string, { os?: string[]; cpu?: string[] }>;
    };
    const pacotes = lockfile.packages ?? {};
    expect(
      Object.keys(pacotes).length,
      "não se conseguiu ler o `package-lock.json` — a leitura partiu-se",
    ).toBeGreaterThan(100);

    /** Este pacote é instalado num Linux x64? (o alvo do Vercel) */
    const instaladoAqui = (v: { os?: string[]; cpu?: string[] }) =>
      (!v.os || v.os.includes("linux")) && (!v.cpu || v.cpu.includes("x64"));

    /** O binário que CORRE mesmo: o `sharp` de glibc e o seu `libvips`. */
    const QUE_CORRE = /^@img\/sharp-(libvips-)?linux-x64$/;

    const variantes = Object.entries(pacotes)
      .map(([k, v]) => [k.replace(/^node_modules\//, ""), v] as const)
      .filter(([nome]) => nome.startsWith("@img/sharp-"));
    expect(variantes.length, "nenhuma variante do `sharp` no lockfile").toBeGreaterThan(5);

    const deviamSairFora = variantes
      .filter(([nome, v]) => instaladoAqui(v) && !QUE_CORRE.test(nome))
      .map(([nome]) => nome);
    const excluidos = new Set(EXCLUIDOS.map((e) => pasta(e).replace(/^node_modules\//, "")));

    expect(EXCLUIDOS.length, "deixou de se excluir seja o que for").toBeGreaterThan(0);

    const esquecidos = deviamSairFora.filter((n) => !excluidos.has(n));
    expect(
      esquecidos,
      "o lockfile instala isto num Linux x64, não é o binário que corre, e não está " +
        "excluído — vai viajar dentro de TODAS as funções:\n  " +
        esquecidos.join("\n  "),
    ).toEqual([]);

    for (const exc of EXCLUIDOS) {
      const nome = pasta(exc).replace(/^node_modules\//, "");
      expect(exc, "excluiu-se o `sharp` de glibc, que é o que corre aqui").not.toMatch(
        /sharp-(libvips-)?linux-x64/,
      );
      const entrada = pacotes[`node_modules/${nome}`];
      expect(
        entrada && instaladoAqui(entrada),
        `a exclusão \`${exc}\` não é instalada num Linux x64 — ou o nome está errado, ` +
          "ou o pacote saiu do lockfile, ou é de outra plataforma. Linha morta.",
      ).toBe(true);
    }
  });
});
