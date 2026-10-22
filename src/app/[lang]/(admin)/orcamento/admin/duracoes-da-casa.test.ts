import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NINGUÉM ANIMA PARA QUEM PEDIU PARA NÃO ANIMAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. O censo escrito no `ui/movimento.ts` contou os primitivos
 * desta casa e nomeou três avarias silenciosas. Duas delas não eram dos
 * primitivos — eram do back office inteiro, e são estas:
 *
 *  1. **Durações que ninguém escolheu.** Uma classe `transition-*` sem duração
 *     cai nos 150 ms do `--default-transition-duration` do Tailwind. Não é um
 *     degrau desta casa: os degraus são 20 ms (o toque), 120 ms (o estado) e
 *     250 ms (uma coisa a mover-se). Vinte ficheiros a concordar nos 150
 *     parecem um sistema e não são — no dia em que um deles escolher uma
 *     duração, ficam dois sistemas.
 *
 *  2. **Transições sem `motion-safe:`.** Esta é a que este ficheiro guarda, e
 *     é a que não se vê a partir do computador de quem a escreve. O
 *     `globals.css` NÃO tem rede global nenhuma: dentro de
 *     `prefers-reduced-motion` só desliga transições em três sítios muito
 *     concretos — o `:focus-visible`, o `scroll-behavior` e o
 *     `.link-line::after`. Tudo o resto que escreva `transition-colors` à seca
 *     está mesmo a animar para quem foi ao sistema operativo pedir que não se
 *     animasse. Para muita gente isso não é uma preferência de gosto: é
 *     enjoo, é vertigem, é uma enxaqueca a começar.
 *
 * ── O QUE ISTO PRENDE ──────────────────────────────────────────────────────
 *
 * Prende UMA propriedade, sobre todos os `.tsx` do back office (as subpastas
 * incluídas): nenhuma classe `transition-*` corre sem uma variante
 * `motion-safe:` ou `motion-reduce:` na frente. As duas servem — a primeira
 * liga a transição só a quem não pediu nada, a segunda desliga-a a quem pediu
 * — e é por isso que as duas passam.
 *
 * ── O QUE ISTO NÃO PRENDE (DE PROPÓSITO) ───────────────────────────────────
 *
 *  · **A duração.** Um `motion-safe:transition-colors` sem duração continua a
 *    passar aqui, e continua a cair nos 150 ms de omissão. Prender as duas
 *    coisas no mesmo teste dava uma mensagem de erro que não diz qual das
 *    duas se partiu. A duração vive no `ui/movimento.test.ts`, que a prende à
 *    ficha da casa (`lib/motion/tokens.ts`) para os dois lados não poderem
 *    afinar-se sozinhos.
 *  · **O CSS escrito à mão.** Este teste lê `.tsx`, ou seja classes do
 *    Tailwind. As regras `transition:` do `globals.css` são outra questão e
 *    têm as suas guardas lá (ver `entrada-do-que-aparece.test.ts`).
 *  · **`transition-none`.** É o contrário de uma violação — é uma transição a
 *    ser DESLIGADA. Passa sem variante nenhuma.
 *  · **Os comentários.** A prosa desta casa cita classes de propósito (este
 *    ficheiro é o melhor exemplo). São tirados antes de procurar, senão o
 *    ficheiro que explica a avaria era o primeiro a chumbar por causa dela.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/**
 * A TABELA DE EXCEPÇÕES — e ela é para MORRER.
 *
 * Cada linha é um ficheiro que ainda transiciona à seca, com o tecto do que
 * ainda lá está e o motivo por que ainda lá está. Não é uma absolvição: é uma
 * dívida escrita, com o número ao lado, para que se veja a encolher.
 *
 * As regras da tabela são duas, e estão em testes lá em baixo:
 *
 *   · o número nunca SOBE (`o tecto`) — um ficheiro desta lista pode melhorar
 *     sozinho, não pode piorar;
 *   · e uma entrada que já não tem nada para desculpar é uma EXCEPÇÃO MORTA:
 *     fica vermelha até alguém lhe apagar a linha. Uma lista de excepções que
 *     ninguém limpa deixa de ser uma lista de excepções e passa a ser uma
 *     lista de sítios onde a regra não vale.
 *
 * Quando a tabela ficar vazia, apaga-se a tabela — e este teste passa a ser
 * só a regra.
 */
/**
 * A TABELA DE EXCEPÇÕES — E ELA MORREU, QUE ERA O QUE SE QUERIA.
 *
 * Estava aqui uma lista de doze ficheiros que ainda transicionavam à seca, com
 * o tecto de cada um ao lado: `BibliotecaRevisao` (2), `FechosMeta` (4),
 * `FollowUpField` (2), `Gralhas` (3), `MoodBoardIndice` (2), `PorTraduzir` (3),
 * `PorqueNaoDaParaEnviar` (1), `ProposalStudio` (17), `Versoes` (1),
 * `DossierAside` (1), `DossierClient` (1), `DossierHeader` (2). Quarenta
 * transições a animar para quem tinha pedido para não animar.
 *
 * Foram todas convertidas na ronda da resposta ao toque: os elementos em que se
 * toca passaram a levar o `ESTADO` de `ui/movimento.ts` — que já traz a guarda,
 * o degrau de 120 ms e uma lista fechada de propriedades — em vez de uma
 * `transition-colors` à seca ao lado. Contadas depois: ZERO em todo o back
 * office.
 *
 * A tabela fica vazia de propósito, e não apagada: `EXCEPCOES` continua a ser
 * lida pelos dois testes lá em baixo, portanto quem quiser voltar a desculpar
 * um ficheiro tem de escrever aqui a linha e o número — que é exactamente o
 * atrito que se queria. Um array vazio é a forma mais curta de dizer «não há
 * dívida nenhuma» sem tirar a rede.
 */
const EXCEPCOES: { ficheiro: string; tecto: number; porque: string }[] = [];

/** Tira comentários: a prosa desta casa cita classes e números de propósito. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "") // {/* … */} do JSX
    .replace(/\/\*[\s\S]*?\*\//g, "") // /* … */
    .replace(/(^|[^:])\/\/.*$/gm, "$1"); // // … (o `[^:]` salva os https://)
}

/**
 * AS CORRIDAS DE CLASSES — onde é que uma classe de Tailwind pode viver.
 *
 * Dentro de aspas ou de crases, e nada mais. Isolar a corrida importa por uma
 * razão concreta: a guarda pode vir na classe AO LADO (`transition-colors
 * motion-reduce:transition-none` é uma transição guardada, ainda que o token
 * do meio não traga variante nenhuma), e só se sabe o que está «ao lado»
 * sabendo onde a lista começa e acaba.
 *
 * As crases primeiro, e depois apagadas: um `${cond ? "a" : "b"}` no meio de
 * uma crase tem aspas lá dentro, e sem isto a mesma lista era contada duas
 * vezes. Aspas simples ficam de fora de propósito — nesta casa nenhuma lista
 * de classes as usa, e apanhá-las era arriscar emparelhar o apóstrofo de uma
 * frase com o de outra.
 */
function corridasDeClasses(fonte: string): string[] {
  const corridas: string[] = [];
  const semCrases = semComentarios(fonte).replace(/`[^`]*`/g, (m) => {
    corridas.push(m);
    return " ";
  });
  for (const m of semCrases.matchAll(/"[^"\n]*"/g)) corridas.push(m[0]);
  return corridas;
}

/**
 * O INSTRUMENTO.
 *
 * Devolve as classes `transition-*` de uma fonte que correm SEM guarda de
 * movimento reduzido. Trabalha sobre o token inteiro (variantes incluídas)
 * porque a ordem das variantes é livre: `motion-safe:lg:transition-[width]` é
 * tão válido como `lg:motion-safe:transition-[width]`, e olhar só para os
 * caracteres imediatamente antes de `transition-` chumbava o primeiro.
 */
function transicoesASeca(fonte: string): string[] {
  const fora: string[] = [];
  for (const corrida of corridasDeClasses(fonte)) {
    // A guarda pode estar na classe do lado: `motion-reduce:transition-none`
    // desliga a transição inteira de quem pediu menos movimento, e a variante
    // é emitida depois da utilidade nua, portanto ganha sem `!important`.
    if (corrida.includes("motion-reduce:transition-none")) continue;
    for (const m of corrida.matchAll(/(?:^|[\s"'`{])([^\s"'`{}]*transition-[^\s"'`{}]*)/g)) {
      const token = m[1];
      const partes = token.split(":");
      const utilidade = partes[partes.length - 1];
      // `algotransition-colors` não é uma classe de transição; `hover:transition-colors` é.
      if (!utilidade.startsWith("transition-")) continue;
      // Desligar uma transição nunca é animar de mais.
      if (utilidade === "transition-none") continue;
      if (token.includes("motion-safe:") || token.includes("motion-reduce:")) continue;
      fora.push(token);
    }
  }
  return fora;
}

/** Todos os `.tsx` do back office que não são testes, caminho relativo à RAIZ. */
function ficheirosDoBackOffice(): string[] {
  const achados: string[] = [];
  const andar = (pasta: string) => {
    for (const nome of readdirSync(pasta).sort()) {
      const caminho = join(pasta, nome);
      if (statSync(caminho).isDirectory()) andar(caminho);
      else if (nome.endsWith(".tsx") && !nome.includes(".test.")) achados.push(caminho);
    }
  };
  andar(RAIZ);
  // Caminhos com `/` em qualquer sistema, para a tabela acima se ler igual.
  return achados.map((c) => relative(RAIZ, c).split(sep).join("/"));
}

const FICHEIROS = ficheirosDoBackOffice();
const desculpado = new Map(EXCEPCOES.map((e) => [e.ficheiro, e]));
const seca = (rel: string) => transicoesASeca(readFileSync(join(RAIZ, rel), "utf8"));

describe("o instrumento encontra mesmo o que diz encontrar", () => {
  // CONTROLO POSITIVO. Um teste que varre ficheiros e não acha nada tanto pode
  // estar a dizer «está tudo bem» como «não li ficheiro nenhum» ou «a expressão
  // não casa com nada». Estes três dizem qual das três é.

  it("acha uma transição à seca, e não acha as que estão guardadas", () => {
    const amostra = `
      <div className="rounded-xl transition-colors hover:bg-red-500" />
      <div className={\`px-2 transition-all duration-150 \${x}\`} />
      <div className="hover:transition-opacity" />
      <div className="motion-safe:transition-colors motion-safe:duration-[120ms]" />
      <div className="motion-safe:lg:transition-[width] motion-safe:lg:duration-200" />
      <div className="lg:motion-safe:transition-[width]" />
      <div className="transition-all motion-reduce:transition-none" />
      <div className="transition-none" />
    `;
    // Ordenado: a varredura vê primeiro as crases e só depois as aspas, e a
    // ordem em que as encontra não é uma propriedade que valha a pena prender.
    const achadas = transicoesASeca(amostra).sort();
    expect(achadas).toEqual(["hover:transition-opacity", "transition-all", "transition-colors"]);
  });

  it("não confunde uma classe com uma palavra que a contenha", () => {
    expect(transicoesASeca('const x = "supertransition-colors";')).toEqual([]);
  });

  it("a guarda pode vir na classe do lado, e isso conta", () => {
    // `transition-colors motion-reduce:transition-none` está guardado: a
    // variante desliga a transição a quem pediu menos movimento. Chumbar isto
    // empurrava quem escreve para uma correcção pior do que o que já lá está.
    expect(
      transicoesASeca('<div className="transition-colors motion-reduce:transition-none" />'),
    ).toEqual([]);
    // Mas a guarda de UM elemento não desculpa o do lado.
    const dois =
      '<div className="transition-colors motion-reduce:transition-none" /><div className="transition-opacity" />';
    expect(transicoesASeca(dois)).toEqual(["transition-opacity"]);
  });

  it("ignora a prosa — este ficheiro cita `transition-colors` e não chumba por isso", () => {
    expect(transicoesASeca(`{/* transition-colors */}`)).toEqual([]);
    expect(transicoesASeca(`/* transition-colors */`)).toEqual([]);
    expect(transicoesASeca(`// transition-colors`)).toEqual([]);
  });

  it("está mesmo a ler o back office, e o back office tem mesmo transições", () => {
    // Se a pasta mudar de sítio ou a varredura deixar de descer às subpastas,
    // o teste inteiro passava a verde por não ter ficheiros nenhuns.
    expect(FICHEIROS.length).toBeGreaterThan(100);
    expect(FICHEIROS).toContain("AdminClient.tsx");
    expect(FICHEIROS.some((f) => f.includes("/"))).toBe(true);
    /* ── PORQUE É QUE ISTO DEIXOU DE CONTAR SÓ `transition-` ────────────────
       A conta era `> 20` ficheiros com a classe `transition-*` literal. Caiu
       para 18, e não porque o back office tenha deixado de ter movimento: é
       que passou a declará-lo pela constante `ESTADO` de `ui/movimento.ts`
       (que traz a lista e a guarda de uma vez) em vez de escrever uma
       `transition-colors` em cada ficheiro. Convergir era o objectivo da
       ronda — a conta antiga media a dispersão e ia ficando vermelha à medida
       que a casa melhorava.

       Conta-se agora o que a substituiu: um ficheiro DECLARA MOVIMENTO se
       escreve uma `transition-*` sua ou se importa a escala da casa. A rede
       serve para o mesmo — se a varredura deixar de ler os ficheiros, isto
       cai —, e deixa de castigar a convergência. */
    const comMovimento = FICHEIROS.filter((f) => {
      const fonte = semComentarios(readFileSync(join(RAIZ, f), "utf8"));
      return /transition-/.test(fonte) || /from "[^"]*movimento"/.test(fonte);
    });
    expect(comMovimento.length).toBeGreaterThan(20);
  });
});

describe("nenhuma transição do back office corre sem guarda de movimento reduzido", () => {
  const vigiados = FICHEIROS.filter((f) => !desculpado.has(f));

  it.each(vigiados)("%s", (rel) => {
    const soltas = seca(rel);
    expect(
      soltas,
      `${rel} anima para quem pediu para não animar: ${soltas.join(", ")}. ` +
        "Põe-lhe `motion-safe:` — e, já agora, uma duração da casa: importa " +
        "`ESTADO`/`PRESSAO`/`PROGRESSO` de `ui/movimento`, que já as trazem.",
    ).toEqual([]);
  });
});

describe("a tabela de excepções não apodrece", () => {
  it("nenhuma entrada da tabela desculpa mais do que o ficheiro tem hoje", () => {
    // O TECTO. Uma excepção pode melhorar sozinha; não pode piorar em silêncio
    // à sombra da linha que já lá está.
    const piores = EXCEPCOES.filter((e) => existsSync(join(RAIZ, e.ficheiro)))
      .map((e) => ({ e, agora: seca(e.ficheiro).length }))
      .filter(({ e, agora }) => agora > e.tecto)
      .map(({ e, agora }) => `${e.ficheiro}: ${agora} > ${e.tecto}`);
    expect(piores, `a dívida cresceu em: ${piores.join(" · ")}`).toEqual([]);
  });

  it("não há excepções mortas — a linha some quando o ficheiro fica limpo", () => {
    const mortas = EXCEPCOES.filter(
      (e) => !existsSync(join(RAIZ, e.ficheiro)) || seca(e.ficheiro).length === 0,
    ).map((e) => e.ficheiro);
    expect(
      mortas,
      "estas entradas já não desculpam nada — apaga-lhes a linha da tabela: " + mortas.join(" · "),
    ).toEqual([]);
  });

  it("toda a excepção tem um motivo escrito, e não só um nome", () => {
    // Uma tabela de excepções sem motivos é uma lista de sítios onde a regra
    // não vale. O motivo é o que permite discutir se ainda faz sentido.
    for (const e of EXCEPCOES) {
      expect(e.porque.trim().length, `${e.ficheiro} entrou na tabela sem motivo`).toBeGreaterThan(
        20,
      );
      expect(e.tecto, `${e.ficheiro} tem tecto zero — isso é apagar a linha`).toBeGreaterThan(0);
    }
  });

  it("a tabela não tem nomes repetidos nem ficheiros que já não existem", () => {
    const nomes = EXCEPCOES.map((e) => e.ficheiro);
    expect(new Set(nomes).size, "há nomes repetidos na tabela").toBe(nomes.length);
    const fantasmas = nomes.filter((n) => !FICHEIROS.includes(n));
    expect(fantasmas, `a tabela nomeia ficheiros que não existem: ${fantasmas.join(", ")}`).toEqual(
      [],
    );
  });
});

/**
 * ── E O AVISO, QUE TEM UMA ESCALA SÓ DELE ──────────────────────────────────
 *
 * O `Toast` não usa o `ESTADO` para entrar: um aviso não é um estado a mudar,
 * é o SISTEMA a apresentar-se, e para isso a casa tem um número (240 ms) e uma
 * curva que só desacelera (`cubic-bezier(0, 0, 0.2, 1)`) — os da `.bo-entrada`
 * do `globals.css`, que é a entrada dos outros nove sítios que aparecem por
 * cima da página.
 *
 * O `Toast` não pode usar a CLASSE `.bo-entrada` (ela é uma animação à
 * montagem, e o gesto deste aviso está preso letra por letra noutro teste —
 * ver o comentário no próprio `Toast.tsx`), portanto tem o número e a curva
 * escritos nas suas classes. É uma cópia, e as cópias afastam-se. Este teste é
 * o fio entre as duas pontas: afinar a `.bo-entrada` do lado do CSS põe este
 * lado vermelho, em vez de deixar dois avisos vizinhos a entrar a velocidades
 * diferentes sem ninguém dar por isso.
 */
describe("a entrada do aviso é a mesma da casa, e não uma segunda", () => {
  const toast = semComentarios(readFileSync(join(RAIZ, "Toast.tsx"), "utf8"));
  // O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
  // todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
  // o browser os aplica no back office.
  const css =
    readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
    readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

  it("240 ms — o número da `.bo-entrada`, e não um número novo", () => {
    const m = /\.bo-entrada\s*\{\s*animation:\s*bo-entrada (\d+)ms/.exec(css);
    expect(m, "a regra `.bo-entrada` desapareceu do globals.css").not.toBeNull();
    expect(toast).toContain(`motion-safe:duration-[${m![1]}ms]`);
  });

  it("e a curva de quem APRESENTA, que não é a de assinatura", () => {
    const m = /\.bo-entrada\s*\{\s*animation:\s*bo-entrada \d+ms (cubic-bezier\([^)]+\))/.exec(css);
    expect(m).not.toBeNull();
    const semEspacos = m![1].replace(/\s+/g, "");
    expect(toast).toContain(`motion-safe:ease-[${semEspacos}]`);
    // A de assinatura (`--ease-out`, 0.16 1 0.3 1) é para o que o UTILIZADOR
    // provoca. Um aviso chega quando o sistema tem alguma coisa a dizer.
    expect(toast).not.toContain("0.16,1,0.3,1");
  });

  it("e não transiciona `all` — o aviso pousa sobre trabalho vivo", () => {
    // `all` põe o browser a considerar `width`, `height` e `margin` a cada
    // fotograma. A lista aqui é fechada: `opacity` e `translate`, as duas
    // compostas na GPU.
    expect(toast).not.toMatch(/transition-all/);
    expect(toast).toContain("motion-safe:transition-[opacity,translate]");
  });
});
