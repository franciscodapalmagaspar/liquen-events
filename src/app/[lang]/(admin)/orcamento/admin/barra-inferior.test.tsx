import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA DE BAIXO E O ESPAÇO QUE LHE É GUARDADO — UM NÚMERO SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A barra é `fixed`: não empurra nada. Tudo o que não lhe pode ficar por baixo
 * — a última linha da lista, o aviso de erro, a barra do total do estúdio —
 * tem de saber a altura dela. Estava escrita à mão em QUATRO sítios.
 *
 * Números iguais em sítios diferentes afastam-se sempre, e estes afastaram-se
 * todos ao mesmo tempo: ao levantar os rótulos da barra de 8 px para o chão de
 * 12 px (ver `escala-movel.test.ts`), «Fazer proposta» passou a partir em duas
 * linhas e a barra cresceu de 56 px para 71 — medido a 390×844. O resto
 * continuou a guardar 56. Quinze píxeis de lista debaixo da barra, e o aviso de
 * erro a pousar-lhe em cima, que é o pior momento para tapar a saída.
 *
 * A partir daqui é um token só: `--bo-barra-inferior`. Não podem discordar
 * porque são o mesmo sítio.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ADMIN = readFileSync(join(RAIZ, "AdminClient.tsx"), "utf8");
// O CSS do back office escrito à mão saiu do `globals.css` (que vai embutido em
// todas as páginas públicas) para o `admin.css`. Lê-se o par, pela ordem em que
// o browser os aplica no back office.
const CSS =
  readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8") +
  readFileSync(join(process.cwd(), "src/app/admin.css"), "utf8");

/**
 * Todos os `.tsx` do back office, para procurar cópias do número em QUALQUER
 * ficheiro — e não só nos dois que eu por acaso me lembrei de abrir.
 *
 * Este teste começou a olhar só para o `AdminClient.tsx`, e passou. A terceira
 * cópia do «56px» estava no `Toast.tsx`, a posicionar o aviso de erro: quando a
 * barra cresceu para 72, o aviso passou a pousar-lhe em cima — e ainda por cima
 * num ficheiro cujo comentário explicava, com medições, porque é que isso não
 * podia acontecer. Quem o apanhou foi o `admin-mobile.spec.ts`.
 *
 * A lição não é «o `Toast.tsx` também conta». É que uma constante duplicada não
 * se guarda com uma lista de sítios conhecidos: guarda-se procurando em todos.
 */
function ficheirosDoBackOffice(dir = RAIZ, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheirosDoBackOffice(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("a barra de destinos do telemóvel", () => {
  /**
   * ── E QUANDO É QUE ELA SE AFASTA ────────────────────────────────────────
   *
   * Uma colaboradora dela disse que a barra «nem sempre aparece» e que «às
   * vezes não está em lado nenhum». A causa estava aqui: a barra saía do ecrã
   * com um `selected` sozinho — ou seja, sempre que houvesse um pedido aberto.
   *
   * Abaixo de 1280 px isso está certo: o detalhe é uma folha modal. A partir de
   * 1280 é uma COLUNA ao lado da lista, e o ecrã não fica modal nenhum. Como a
   * barra é hoje a ÚNICA navegação que existe («a barra substitui o menu»),
   * abrir um pedido no portátil apagava o menu do ecrã inteiro.
   *
   * A regra passou a viver num módulo puro, provado à parte
   * (`lib/orcamento/barra-de-destinos.ts`). Este caso guarda a OUTRA ponta: que
   * é essa regra que a barra usa, e não uma condição escrita aqui à mão que
   * pode voltar a divergir dela.
   */
  it("esconde-se pela regra do módulo, e não por um `selected` solto", () => {
    expect(
      ADMIN,
      "a barra deixou de usar `barraDeveSumir` — a regra voltou a estar escrita à mão",
    ).toContain("barraDeveSumir({");

    // E a regra tem de receber as DUAS metades. Um `detalheSobreposto` que
    // ignore o `isDetailOverlay` é exactamente o defeito de origem, agora
    // escondido atrás de um nome melhor.
    expect(ADMIN).toMatch(/detalheSobreposto:\s*!!selected\s*&&\s*isDetailOverlay/);

    /**
     * O CONTROLO NEGATIVO: que não ficou para trás um `selected ?` a decidir
     * translação nenhuma. Sem esta linha, acrescentar a regra nova e esquecer
     * de tirar a antiga passava neste ficheiro e não mudava nada no ecrã.
     */
    expect(
      ADMIN,
      "sobrou um `selected ? translate-y-full` — a regra antiga ainda decide",
    ).not.toMatch(/selected\s*\?\s*"translate-y-full"/);
  });

  it("declara a sua altura num token, e não num número solto", () => {
    expect(CSS).toMatch(/--bo-barra-inferior:\s*\d+px/);
  });

  it("guarda ao conteúdo exactamente a altura que ocupa", () => {
    // O conteúdo reserva o token — não «56px» copiado à mão.
    expect(ADMIN).toMatch(
      /pb-\[calc\(var\(--bo-barra-inferior\)\+env\(safe-area-inset-bottom\)\)\]/,
    );
  });

  it("nenhum ficheiro do back office volta a cravar a altura à mão", () => {
    // Qualquer `calc(...)` que combine um número em px com o entalhe está a
    // remontar a altura da barra por fora do token — foi assim que o aviso de
    // erro se descolou dela. A busca é em TODOS os ficheiros de propósito: a
    // cópia que fez falha estava justamente naquele em que ninguém olhou.
    const reincidentes: string[] = [];
    for (const f of ficheirosDoBackOffice()) {
      const src = readFileSync(f, "utf8");
      // Só o CÓDIGO: os comentários contam a história e mencionam o «56px».
      const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (/calc\(\s*\d+px\s*\+\s*env\(safe-area-inset-bottom\)/.test(semComentarios)) {
        reincidentes.push(f.slice(RAIZ.length + 1));
      }
    }
    expect(reincidentes, `altura da barra remontada à mão em: ${reincidentes.join(", ")}`).toEqual(
      [],
    );
  });

  /**
   * A SEGUNDA BARRA — a acção principal do estúdio — e quem lhe flutua por cima.
   *
   * O aviso do `Toast.tsx` põe-se a uma distância fixa do fundo: a altura da
   * navegação do telemóvel mais um respiro de 12 px. Só que no estúdio de
   * propostas há uma SEGUNDA barra pousada nessa navegação, com uns 64 px — e o
   * aviso nascia lá dentro, em cima do botão «Pré-visualizar», a comer-lhe o
   * toque durante os quatro segundos em que fica no ecrã. Medido a 375 px.
   *
   * A altura dessa segunda barra não é um número que se possa escrever aqui:
   * ela quebra em duas linhas conforme o passo. Por isso é MEDIDA de um lado e
   * lida do outro, através de `--bo-barra-accao`. Este teste guarda as duas
   * pontas — se uma desaparecer, a outra fica a apontar para o vazio.
   */
  it("o aviso afasta-se também da barra de acção do estúdio", () => {
    const TOAST = readFileSync(join(RAIZ, "Toast.tsx"), "utf8");
    const ESTUDIO = readFileSync(join(RAIZ, "ProposalStudio.tsx"), "utf8");

    /**
     * ── E DEIXOU DE HAVER DUAS POSIÇÕES ─────────────────────────────────
     *
     * O aviso tinha duas: uma que somava a barra de baixo e uma `lg:` que a
     * ignorava, porque no computador a barra não existia — lá a navegação era
     * a coluna da esquerda.
     *
     * Deixou de ser. «A barra substitui o menu»: a cápsula que flutua passou a
     * estar nas duas larguras, e a coluna passou a gaveta. A posição `lg:` do
     * aviso descrevia um ecrã que já não há — e o que ela fazia era pousar o
     * aviso em cima da barra, no computador, exactamente por cima dos destinos.
     *
     * Fica UMA posição, a que soma as duas barras. É a mesma correcção que os
     * outros três sítios levaram (o `<main>` do `AdminClient`, a barra de acção
     * do estúdio e o fundo da lista da biblioteca), e por isso está guardada
     * aqui em baixo para os quatro de uma vez.
     */
    expect(TOAST).toMatch(/bottom-\[calc\(var\(--bo-barra-inferior\)\+var\(--bo-barra-accao,0px\)/);
    expect(TOAST, "o aviso voltou a ter uma posição `lg:` que ignora a barra").not.toMatch(
      /lg:bottom-/,
    );

    // Quem escreve: o estúdio publica a altura medida, e limpa-a ao sair.
    expect(ESTUDIO).toContain('setProperty("--bo-barra-accao"');
    expect(ESTUDIO).toContain('removeProperty("--bo-barra-accao")');
  });

  /**
   * ── E NENHUM DOS QUATRO VOLTA A DESLIGAR A RESERVA NO COMPUTADOR ────────
   *
   * Os quatro sítios que guardam espaço à barra tinham todos o mesmo `lg:` a
   * anular a reserva, e estava certo enquanto a barra era só do telemóvel.
   * Agora a barra está nas duas larguras; um `lg:` que a ignore põe a última
   * linha de uma lista — ou um aviso, ou o botão «Pré-visualizar» — por baixo
   * dos destinos, no ecrã em que ela trabalha o dia inteiro.
   *
   * Procura-se pela FORMA e não por uma lista escrita à mão: qualquer `lg:` a
   * pôr a zero uma distância ao fundo, no mesmo ficheiro que lê o token.
   */
  it("e nenhum dos quatro desliga a reserva a partir de `lg`", () => {
    const QUATRO = ["AdminClient.tsx", "Toast.tsx", "ProposalStudio.tsx", "BibliotecaRevisao.tsx"];
    const reincidentes: string[] = [];
    for (const nome of QUATRO) {
      // Sem comentários: esta casa explica a avaria por escrito ao lado do
      // sítio onde ela esteve, e uma varredura que os leia acusa a explicação.
      const fonte = readFileSync(join(RAIZ, nome), "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
      if (!fonte.includes("--bo-barra-inferior")) continue;
      const m = fonte.match(/lg:(?:bottom-0|pb-0|bottom-\[calc\((?![^)]*--bo-barra-inferior))/);
      if (m) reincidentes.push(`${nome} (${m[0]})`);
    }
    expect(
      reincidentes,
      `a reserva da barra volta a ser desligada no computador em: ${reincidentes.join(", ")}`,
    ).toEqual([]);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * E DEPOIS A BARRA PASSOU A FLUTUAR
   * ════════════════════════════════════════════════════════════════════════
   *
   * A barra deixou de estar encostada ao fundo e a toda a largura: é uma
   * CÁPSULA a flutuar, com uma peça redonda à parte para o abridor da gaveta.
   *
   * A altura dela deixou de ser `min-h-[var(--bo-barra-inferior)]` nos botões
   * e passou a ser uma SOMA — a cápsula mais a folga por baixo. É aí que este
   * ficheiro passa a valer mais do que valia: os quatro sítios que reservam
   * espaço continuam a ler `--bo-barra-inferior`, e a única coisa que os pode
   * desmentir agora é a soma crescer para lá dele sem ninguém reparar. Um
   * `--bo-barra-capsula` que suba para 64 px põe o aviso de erro em cima do
   * botão outra vez, e sem esta desigualdade ninguém dava por isso até a ver
   * num telemóvel.
   */
  it("a cápsula e a folga cabem dentro do espaço que o conteúdo reserva", () => {
    const px = (nome: string): number => {
      const m = CSS.match(new RegExp(`${nome}:\\s*([\\d.]+)(px|rem)`));
      expect(m, `o token ${nome} desapareceu`).not.toBeNull();
      return m![2] === "rem" ? parseFloat(m![1]) * 16 : parseFloat(m![1]);
    };
    const reservado = px("--bo-barra-inferior");
    const ocupado = px("--bo-barra-capsula") + px("--bo-barra-folga");
    expect(
      ocupado,
      `a barra a flutuar ocupa ${ocupado}px e o conteúdo só reserva ${reservado}px: ` +
        "o aviso, a barra de acção do estúdio e o fundo da lista passam a pousar-lhe em cima",
    ).toBeLessThanOrEqual(reservado);
  });

  it("a cápsula tem altura para um alvo de 44 px lá dentro", () => {
    // A cápsula é a moldura; o alvo é o que sobra dela depois do FIO e da folga
    // do material, em cima e em baixo. Abaixo de 44 não há barra que valha.
    //
    // O fio conta, e a primeira versão desta conta esqueceu-o: dava 48 e o
    // browser media 46. Dois píxeis não chumbam nada aqui, mas um número
    // escrito que não é o que o ecrã faz é o princípio de todos os outros.
    const rem = (nome: string) =>
      parseFloat(CSS.match(new RegExp(`${nome}:\\s*([\\d.]+)rem`))![1]) * 16;
    const FIO = 1;
    const alvo = rem("--bo-barra-capsula") - 2 * FIO - 2 * rem("--bo-material-folga");
    expect(alvo, `o alvo de cada destino mede ${alvo}px de altura`).toBeGreaterThanOrEqual(44);
  });

  /**
   * O bloco da `<nav>` inteiro, do nome dela até à etiqueta que a fecha.
   * Uma janela de N kB a seguir ao nome já não chega: a prosa que explica a
   * cápsula é mais comprida do que ela, e um teste que mede uma janela fixa
   * passa a medir o comprimento dos comentários.
   */
  const barra = (): string => {
    /**
     * O nome trocou de peça. A barra chamava-se «Destinos principais» e a
     * coluna da esquerda «Navegação do back office»; a coluna acabou, a barra
     * passou a ser a navegação do back office nas duas larguras, e o nome
     * seguiu a coisa. Ver `a-barra-e-o-menu.test.tsx`.
     */
    const i = ADMIN.indexOf('aria-label="Navegação do back office"');
    expect(i, "a barra de destinos desapareceu").toBeGreaterThan(-1);
    const f = ADMIN.indexOf("</nav>", i);
    expect(f, "a `<nav>` da barra não fecha").toBeGreaterThan(-1);
    return ADMIN.slice(i, f);
  };

  it("a barra flutua: folga em baixo, e a folga soma-se ao entalhe", () => {
    const bloco = barra();
    // A folga por baixo tem de SOMAR o entalhe: no iPhone a barra de gestos do
    // sistema fica por baixo de tudo, e uma cápsula que flutue a 12 px do bordo
    // da janela flutua 12 px por baixo dela.
    expect(
      bloco,
      "a cápsula deixou de somar o `env(safe-area-inset-bottom)` à folga — no iPhone " +
        "fica escondida atrás da barra de gestos",
    ).toContain("calc(var(--bo-barra-folga) + env(safe-area-inset-bottom))");
    expect(bloco, "a cápsula perdeu a altura do token").toContain('"var(--bo-barra-capsula)"');
  });

  it("a faixa da barra deixa passar o dedo pelos buracos", () => {
    // A `<nav>` continua a cobrir a largura toda, mas as duas peças é que são
    // tocáveis. Sem isto, uma barra que já não pinta nada continuava a comer o
    // toque a tudo o que lhe ficasse por baixo — que é pior do que a barra
    // cheia, porque não se vê.
    const bloco = barra();
    expect(bloco).toContain("pointer-events-none");
    expect(
      (bloco.match(/pointer-events-auto/g) ?? []).length,
      "as duas peças da barra (a cápsula e o abridor) têm de voltar a apanhar o toque",
    ).toBeGreaterThanOrEqual(2);
  });

  it("continua a haver UM abridor da gaveta, e é o da barra", () => {
    // A regra escrita em `nav.tsx`: os quatro destinos do dia vivem só na
    // barra, o resto só na gaveta, e há um abridor de cada vez. A peça redonda
    // é esse abridor — não é um quinto destino, e o «Mais» não volta.
    //
    // ── E CONTA-SE PELO `aria-expanded`, NÃO PELO NOME ────────────────────
    //
    // «Mais destinos» passou a ser DUAS coisas com o mesmo nome, e de
    // propósito: o botão que abre, e a lista que ele abre. Um leitor de ecrã
    // beneficia disso — o botão anuncia exactamente o que vai encontrar. Mas
    // contar o nome passou a contar dois, e o que este teste guarda é que há um
    // ABRIDOR só. O `aria-expanded` é o que distingue um botão que abre uma
    // coisa de tudo o resto, e só o abridor o tem.
    const abridores = ADMIN.split("\n").filter(
      (l, i, ls) =>
        l.includes('aria-label="Mais destinos"') && (ls[i + 1] ?? "").includes("aria-expanded"),
    );
    expect(abridores.length, "há mais do que um abridor da gaveta").toBe(1);
  });
});

describe("a folga por baixo da barra do estúdio mede o `sticky`, e não a janela", () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * QUASE MIL PÍXEIS DE VAZIO NO FIM DO PASSO 1
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A folga reservada por baixo da barra era `window.innerHeight - r.bottom` —
   * a distância ao fundo da JANELA. A intenção, escrita ao lado, era outra: «a
   * distância a que ela está do fundo do ecrã (o `bottom-[calc(56px+…)]` que a
   * levanta por cima da navegação do telemóvel)», ou seja o `bottom` do
   * `sticky`. Os dois números só coincidem quando quem rola É a janela.
   *
   * MEDIDO num Chromium, no painel que abre a partir do cartão de um cliente —
   * onde quem rola é o painel:
   *
   *     fundo da barra ................ 384 px
   *     fundo da caixa que rola ....... 876 px
   *     folga reservada ......... 893 a 962 px
   *     folga necessária .............. ~569 px
   *
   * E realimentava-se: mais folga faz a coluna mais alta, a barra sobe na
   * janela, a distância ao fundo cresce, a folga cresce outra vez — daí os
   * valores a saltar entre larguras (420, 962, 421, 913, 893).
   *
   * O que este caso guarda é a PERGUNTA, que é onde estava o erro. O `bottom`
   * calculado responde certo em qualquer caixa; a altura da janela responde
   * certo só numa.
   */
  const ESTUDIO = readFileSync(join(RAIZ, "ProposalStudio.tsx"), "utf8");
  const medicao = /const porBaixo = [^;]+;/.exec(ESTUDIO)?.[0] ?? "";

  it("lê o `bottom` do próprio elemento", () => {
    expect(medicao, "a medição da folga desapareceu").not.toBe("");
    expect(medicao).toContain("getComputedStyle");
    expect(medicao).toContain(".bottom");
  });

  it("e NUNCA a altura da janela — foi essa a avaria", () => {
    expect(
      medicao,
      "voltou a medir a distância ao fundo da janela: no painel de detalhe isso " +
        "reserva quase mil píxeis de vazio, e realimenta-se",
    ).not.toContain("innerHeight");
  });
});
