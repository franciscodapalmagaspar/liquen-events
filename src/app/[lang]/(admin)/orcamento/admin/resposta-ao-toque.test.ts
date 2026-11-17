import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TUDO O QUE SE TOCA RESPONDE AO DEDO — E UMA VARREDURA VALE MAIS QUE TRINTA
 * TESTES PONTUAIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `ui/movimento.test.ts` guarda os quinze primitivos da pasta `ui/`. Esta
 * varredura guarda o BACK OFFICE INTEIRO — os ~150 ficheiros de
 * `[lang]/(admin)/` —, porque o defeito que ela apanha não nasce nos
 * primitivos: nasce no ecrã novo que alguém escreve na semana que vem, com um
 * `<button className="text-xs hover:underline">` que parece completo e não é.
 *
 * ── O NÚMERO QUE MOTIVOU ISTO ──────────────────────────────────────────────
 *
 * Censo de todos os elementos tocáveis escritos à mão (`<button>`, `<a href>`,
 * `<summary>`, e qualquer nó com `onClick` ou `role="button|tab|menuitem|…"`),
 * sem contar os que vêm de um primitivo (`<Button>` traz o gesto de dentro):
 *
 *     368 tocáveis · 173 respondiam ao toque (47%) · 195 NÃO respondiam (53%)
 *
 * Mais de metade do back office era uma fotografia com botões colados por
 * cima. Depois desta ronda são 351 de 370 (os dois a mais nasceram entretanto,
 * no `ui/Escolha.tsx`), e os 19 que restam estão todos nomeados aqui em baixo,
 * um a um, com a razão.
 *
 * ── E O RATO, QUE É O CANAL DO COMPUTADOR ─────────────────────────────────
 *
 * O mesmo censo, olhando para o `hover:` em vez do `:active`: 303 dos 370
 * respondem a aproximar o rato, 67 não respondem de todo. Só que a resposta é
 * quase toda TINTA — 171 mudam a cor da letra, 81 mudam só o fundo, 40 a
 * moldura, 28 a opacidade, ZERO a sombra — e **UM** responde com geometria
 * (`hover:-translate-y-0.5`, o separador do painel do `AdminClient`). Esse um
 * está declarado no `ARMADILHA_COM_DONO` mais abaixo porque não anima: a lista
 * dele não traz `translate`.
 *
 * E só 13 dos 370 distinguiam o CARREGADO do SOB-O-RATO com tinta própria
 * (`active:bg-…`). É essa a razão de o `PRESSAO` valer para os dois aparelhos:
 * com ele, o terceiro estado passa a distinguir-se em todo o lado pelos 2% de
 * escala, sem depender de haver um degrau de tinta a sobrar.
 *
 * ── PORQUE É QUE UMA VARREDURA E NÃO TRINTA TESTES ────────────────────────
 *
 * Um teste por ecrã só sabe dos ecrãs que já existem. Esta varredura não sabe
 * de nenhum e apanha-os todos: um tocável NOVO que nasça sem `PRESSAO` põe-na
 * vermelha no dia em que é escrito, e não no dia em que alguém repara. A
 * lista de excepções é fechada e cada entrada tem de casar com alguma coisa —
 * uma excepção que deixe de ser precisa também põe isto vermelho, em vez de
 * ficar a dar licença a um defeito futuro.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)");

/* ── OS QUATRO FICHEIROS COM DONO NOUTRA RONDA ──────────────────────────────
   `AdminClient.tsx`, `lazy.tsx`, `Toast.tsx` e `ui/FolhaOuDialogo.tsx` estavam
   entregues a outra pessoa quando esta varredura foi escrita. Os tocáveis do
   `AdminClient` que ainda não respondem estão relatados no `SEM_AFUNDAR` como
   qualquer outro — não se escondem, só não se corrigiram aqui. */

/**
 * ONDE O AFUNDAR NÃO FAZ SENTIDO, E PORQUÊ.
 *
 * Nem tudo o que se toca deve encolher. A regra que se seguiu: afunda o que é
 * um COMANDO — uma coisa com forma própria em que se carrega. Não afunda o
 * espaço à volta de um comando, nem um sítio onde se escreve.
 *
 * `marca` é um pedaço LITERAL da tag de abertura, e tem de aparecer lá. Se o
 * elemento mudar ao ponto de a marca deixar de casar, esta lista fica vermelha
 * — de propósito: uma licença que já não descreve nada é uma licença a
 * qualquer coisa.
 */
const SEM_AFUNDAR: { ficheiro: string; marca: string; porque: string }[] = [
  // ── O EMBRULHO QUE SÓ TRAVA O CLIQUE ────────────────────────────────────
  // A linha das Propostas abre o pedido (achado n.º 11); o menu das acções
  // vive dentro dela, e este `<span>` só impede que «Apagar» também abra o
  // pedido por baixo. Não é um comando: quem afunda é o botão do menu.
  {
    ficheiro: "orcamento/admin/Propostas.tsx",
    marca: "<span onClick={(e) => e.stopPropagation()}>",
    porque: "trava a propagação do menu dentro da linha clicável",
  },
  // O mesmo embrulho à volta do menu do estado (14/10): a pastilha vive na
  // linha da tabela, que abre o pedido, e a lista está num portal cujos cliques
  // sobem pela árvore do React até à linha. Quem afunda é o botão do menu.
  {
    ficheiro: "orcamento/admin/EscolhaDoEstado.tsx",
    marca: "onClick={(e) => e.stopPropagation()}",
    porque: "trava a propagação do menu do estado dentro da linha clicável",
  },
  // ── O ESCURO À VOLTA DE UM DIÁLOGO ──────────────────────────────────────
  // Tem `onClick` para fechar, mas não é uma coisa em que se carregue: é o
  // vazio à volta. Encolher o véu 2% descola-o das margens e deixa ver a
  // página por baixo pelas quatro bordas — um piscar do ecrã inteiro no gesto
  // mais banal que há, que é falhar o alvo.
  {
    ficheiro: "orcamento/admin/Calendario.tsx",
    marca: "fixed inset-0 z-50 flex items-center justify-center p-4",
    porque: "véu do diálogo, não é um comando",
  },
  {
    ficheiro: "orcamento/admin/CommandPalette.tsx",
    marca: "fixed inset-0 z-[90]",
    porque: "véu do diálogo, não é um comando",
  },
  {
    ficheiro: "orcamento/admin/PhotoLightbox.tsx",
    marca: "relative flex min-h-0 flex-1",
    porque: "a moldura à volta da foto — fechar ao falhar o alvo",
  },
  {
    ficheiro: "orcamento/admin/PhotoLightbox.tsx",
    marca: "fixed inset-0 z-50 flex flex-col bg-black/92",
    porque: "véu do lightbox",
  },
  // O palco nasceu quando o Quick Look ganhou o FLIP: é a caixa que anima da
  // miniatura até ao tamanho grande, e o `onClick` só fecha quando o toque cai
  // NELA e não na fotografia. Afundá-la 2% afundava a fotografia com ela, a
  // meio da própria animação de abertura.
  {
    ficheiro: "orcamento/admin/PhotoLightbox.tsx",
    marca: "relative flex h-full w-full items-center justify-center",
    porque: "o palco do FLIP à volta da foto — fechar ao falhar o alvo",
  },
  {
    ficheiro: "orcamento/admin/LupaDeFotos.tsx",
    marca: "fixed inset-0 z-[80]",
    porque: "véu da lupa",
  },

  // ── O PAINEL DO DIÁLOGO ─────────────────────────────────────────────────
  // Apanhado pela varredura por causa do `role="dialog"`. Um diálogo não é
  // tocável: é o sítio onde os tocáveis vivem.
  {
    ficheiro: "orcamento/admin/Calendario.tsx",
    marca: "aria-label={aberto ? `Adicionar ao calendário",
    porque: "é o painel, não o comando",
  },
  {
    ficheiro: "orcamento/admin/CommandPalette.tsx",
    marca: 'aria-label={aSairAgora ? undefined : "Pesquisar e navegar"}',
    porque: "é o painel, não o comando",
  },

  // ── O `onClick` QUE SÓ TRAVA A BOLHA ────────────────────────────────────
  // `onClick={(e) => e.stopPropagation()}` não é uma acção: é uma cerca à
  // volta de outros botões, para que carregar neles não abra o cartão por
  // baixo. Afundá-la seria animar o fundo de um gesto dirigido a outra coisa.
  {
    ficheiro: "orcamento/admin/PerguntaDeDesfecho.tsx",
    marca: "onClick={(e) => e.stopPropagation()}",
    porque: "cerca contra a bolha, não é uma acção",
  },

  // ── ONDE SE ESCREVE NÃO ENCOLHE ─────────────────────────────────────────
  // A mesma decisão que o `ui/Field.tsx` já tem escrita: encolher 2% uma caixa
  // de texto mexe com o cursor e com a selecção. Este `<p>` é a nota do evento
  // em modo de leitura — carregar nele abre a caixa de escrita, e é `cursor-text`
  // precisamente porque se lê como texto e não como botão.
  {
    ficheiro: "orcamento/admin/Overview.tsx",
    marca: "cursor-text",
    porque: "campo de texto disfarçado — a casa não afunda onde se escreve",
  },

  // ── UMA LINHA DE TABELA ─────────────────────────────────────────────────
  // `<tr>` é `display: table-row`, e um `scale` num table-row não é fiável:
  // onde pega, arrasta as células para fora do alinhamento das colunas
  // vizinhas e a tabela inteira parece torta durante o toque. A MESMA lista na
  // forma de cartões (o `<button>` do `TabelaOuCartoes`, mais abaixo no mesmo
  // ficheiro) leva `PRESSAO` — que é a forma com que ela se toca ao dedo.
  {
    ficheiro: "orcamento/admin/ui/TabelaOuCartoes.tsx",
    marca: "border-b border-[var(--bo-hairline)] last:border-0",
    porque: "linha de tabela — `scale` num table-row desalinha as colunas",
  },

  // ── AS PEÇAS DO MAPA DE MESAS ───────────────────────────────────────────
  // São `<g>` de um SVG: um `scale` num `<g>` encolhe à volta da ORIGEM DA
  // SALA, e não da peça — a mesa saltava em direcção ao canto em vez de
  // afundar. A resposta ao dedo destas peças é o próprio arrasto (seguem o
  // dedo desde o primeiro píxel depois do limiar) e o traço que se acende ao
  // escolher.
  {
    ficheiro: "orcamento/admin/mesas/Sala.tsx",
    marca: "data-alvo={`mesa|",
    porque: "mesa no SVG — o `scale` de um `<g>` é à volta da origem da sala",
  },
  {
    ficheiro: "orcamento/admin/mesas/Sala.tsx",
    marca: "data-alvo={`elemento|",
    porque: "elemento da sala no SVG — o mesmo",
  },
  {
    ficheiro: "orcamento/admin/mesas/Sala.tsx",
    marca: "data-alvo={`lugar|",
    porque: "cadeira no SVG — o mesmo",
  },

  // ── COM DONO NOUTRA RONDA (`AdminClient.tsx`) ───────────────────────────
  // Relatados, não corrigidos: o ficheiro estava entregue a outra pessoa.
  // Os dois primeiros são véus; os dois `<label>` só travam a bolha; os dois
  // `<summary>` e os dois `<a>` são comandos a sério e DEVEM levar `PRESSAO`.
  {
    ficheiro: "orcamento/admin/AdminClient.tsx",
    marca: "pointer-events-auto absolute inset-0 bg-black/60",
    porque: "véu da gaveta — dono noutra ronda",
  },
  {
    ficheiro: "orcamento/admin/AdminClient.tsx",
    marca: "fixed inset-0 z-40 bg-black/50",
    porque: "véu do painel — dono noutra ronda",
  },
  {
    ficheiro: "orcamento/admin/AdminClient.tsx",
    // A marca deixou de trazer `cursor-pointer`: a fase 07 do sistema de design
    // tirou a mãozinha de todos os 21 sítios onde ela estava no back office, e
    // este `<label>` era um deles. Um botão leva a SETA — o `pointer` é do
    // link. Ver `e2e/o-ponteiro-tem-significado.spec.ts`.
    marca: "flex items-center justify-center",
    porque: "label que só trava a bolha — dono noutra ronda",
  },
  {
    ficheiro: "orcamento/admin/AdminClient.tsx",
    marca: "absolute left-2 top-3.5 z-10",
    porque: "label que só trava a bolha — dono noutra ronda",
  },
];

/**
 * DÍVIDA DECLARADA — tocáveis que DEVEM afundar e ainda não afundam.
 *
 * Não é o mesmo que o `SEM_AFUNDAR`: aquilo são decisões («aqui não faz
 * sentido»), isto é trabalho por fazer. Vive numa lista à parte precisamente
 * para não se confundirem — uma licença permanente e um remendo temporário
 * misturados na mesma lista acabam sempre com o remendo a passar por decisão.
 *
 * Os cinco são todos do `AdminClient.tsx`, que tinha dono noutra pessoa quando
 * isto se escreveu. A correcção é uma linha em cada um: juntar
 * `${ESTADO} ${PRESSAO}` à `className` (o ficheiro já importa os dois).
 *
 * O primeiro é o mais caro dos cinco: é o CARTÃO DO PEDIDO na lista principal
 * — o objecto mais tocado do back office inteiro — e não tem resposta nenhuma
 * ao toque, nem sequer uma transição.
 *
 * Quando o dono os corrigir, o segundo teste aqui em baixo fica vermelho a
 * dizer que a entrada sobra, e a entrada apaga-se. É assim que a dívida se
 * paga em vez de se instalar.
 */
const DIVIDA: { ficheiro: string; marca: string; oQueE: string }[] = [];

function ficheiros(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, achados);
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/** Tira comentários guardando as quebras de linha — a prosa desta casa cita classes. */
function semComentarios(fonte: string): string {
  const guarda = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte.replace(/\/\*[\s\S]*?\*\//g, guarda).replace(/^\s*\/\/.*$/gm, guarda);
}

/** A tag de abertura inteira a partir do `<` — contando chavetas e aspas. */
function tagCompleta(src: string, i: number): string {
  let chavetas = 0;
  let aspa: string | null = null;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (aspa) {
      if (c === aspa && src[j - 1] !== "\\") aspa = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") aspa = c;
    else if (c === "{") chavetas++;
    else if (c === "}") chavetas--;
    else if (c === ">" && chavetas === 0) return src.slice(i, j + 1);
  }
  return src.slice(i, i + 6000);
}

const TAGS_TOCAVEIS = new Set(["button", "a", "summary"]);
const PAPEIS_TOCAVEIS =
  /role\s*=\s*"(button|tab|menuitem|menuitemcheckbox|menuitemradio|option|switch|link)"/;

type Tocavel = { rel: string; linha: number; nome: string; tag: string; classes: string };

/**
 * Levanta todos os tocáveis ESCRITOS À MÃO. Os que vêm de um primitivo
 * (`<Button>`, `<Segmented>`, `<MenuDeAccoes>`) não entram: o gesto vem de
 * dentro deles, e o `ui/movimento.test.ts` é que o guarda.
 */
function tocaveis(): Tocavel[] {
  const achados: Tocavel[] = [];
  for (const caminho of ficheiros(RAIZ)) {
    const src = semComentarios(readFileSync(caminho, "utf8"));
    const rel = caminho.replace(process.cwd() + "/src/app/[lang]/(admin)/", "");

    // As constantes de classe do ficheiro, para que um `className={CHIP}`
    // conte o `PRESSAO` que vive na constante e não na tag.
    const constantes: Record<string, string> = {};
    for (const m of src.matchAll(
      /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([`"'][\s\S]*?[`"'])\s*[;,\n]/g,
    ))
      constantes[m[1]] = m[2];

    for (const m of src.matchAll(/<([A-Za-z][A-Za-z0-9_.]*)/g)) {
      const nome = m[1];
      const tag = tagCompleta(src, m.index!);
      const temOnClick = /\bonClick\s*=/.test(tag);
      const ehComponente = /^[A-Z]/.test(nome) || nome.includes(".");
      if (ehComponente) continue;
      // Onde se ESCREVE não afunda — a decisão já está escrita no `ui/Field.tsx`:
      // encolher 2% uma caixa de texto mexe com o cursor e com a selecção. Um
      // `<input type="file">` escondido nem sequer se vê.
      if (nome === "input" || nome === "textarea" || nome === "select") continue;
      if (!(TAGS_TOCAVEIS.has(nome) || temOnClick || PAPEIS_TOCAVEIS.test(tag))) continue;
      // Uma âncora sem destino e sem acção é uma âncora de nome, não um comando.
      if (nome === "a" && !/href/.test(tag) && !temOnClick) continue;

      let classes = tag;
      for (let volta = 0; volta < 3; volta++)
        for (const [k, v] of Object.entries(constantes))
          if (new RegExp(`\\b${k.replace(/\$/g, "\\$")}\\b`).test(classes)) classes += " " + v;

      achados.push({
        rel,
        linha: src.slice(0, m.index!).split("\n").length,
        nome,
        tag,
        classes,
      });
    }
  }
  return achados;
}

/** Um tocável responde ao dedo se traz o `PRESSAO` da casa (ou o gesto dele). */
const respondeAoToque = (t: Tocavel) => /\bPRESSAO\b|active:scale-/.test(t.classes);

describe("tudo o que se toca no back office responde ao dedo", () => {
  const todos = tocaveis();

  it("a varredura encontra mesmo os tocáveis (não passa por estar vazia)", () => {
    // Se um dia o parser deixar de reconhecer JSX, isto cai antes de a rede
    // toda passar a verde por não ter apanhado nada.
    expect(todos.length).toBeGreaterThan(300);
  });

  it("nenhum tocável fica sem resposta ao toque sem estar nomeado e explicado", () => {
    const mudos = todos.filter((t) => !respondeAoToque(t));
    const perdoados = [...SEM_AFUNDAR, ...DIVIDA];
    const orfaos = mudos.filter(
      (t) => !perdoados.some((e) => e.ficheiro === t.rel && t.tag.includes(e.marca)),
    );

    expect(
      orfaos.map((t) => `${t.rel}:${t.linha} <${t.nome}>`),
      "um elemento em que se toca e que não se mexe ao ser tocado. Junta-lhe o " +
        "`PRESSAO` de `ui/movimento.ts` (com o `ESTADO`, que traz `scale` na lista " +
        "de propriedades — sem ele o afundar é um corte seco de 0 ms), ou, se " +
        "afundar não fizer sentido aqui, escreve-o no `SEM_AFUNDAR` com a razão",
    ).toEqual([]);
  });

  it("nenhuma licença do `SEM_AFUNDAR` sobra sem ter a quem se aplicar", () => {
    // Uma excepção que já não casa com nada deixou de descrever o código — e
    // uma licença que não descreve nada é uma licença a qualquer coisa.
    const mudos = todos.filter((t) => !respondeAoToque(t));
    // O `ARMADILHA_COM_DONO` entra aqui e não entrava: era a única lista de
    // excepções sem ninguém a vigiá-la, e por isso uma entrada dela podia
    // ficar a silenciar um defeito já corrigido — que é o mesmo que
    // silenciar o defeito quando ele voltar.
    const sobras = [...SEM_AFUNDAR, ...DIVIDA, ...ARMADILHA_COM_DONO].filter(
      (e) => !mudos.some((t) => t.rel === e.ficheiro && t.tag.includes(e.marca)),
    );
    expect(
      sobras.map((e) => `${e.ficheiro} :: ${e.marca}`),
      "licença sem dono: ou o elemento já responde ao toque (e a entrada sai), ou mudou de forma",
    ).toEqual([]);
  });
});

describe("a dívida por pagar está contada, e não cresce sozinha", () => {
  it("está vazia — e uma entrada nova precisa de mão e de razão", () => {
    // Eram cinco, todas no `AdminClient.tsx`, e todas do mesmo tipo: o cartão
    // do pedido (o tocável mais usado da casa), o email e o telefone do cliente
    // no painel, e os resumos das duas gavetas. Ficaram por fazer porque o
    // ficheiro tinha outro dono quando esta varredura nasceu; foram pagas assim
    // que ficou livre, e o teste acima foi quem o veio dizer.
    //
    // O tecto continua a ser o que interessa: uma lista de excepções vazia não
    // pode crescer por descuido. Uma entrada nova obriga a escrever a marca à
    // mão e a razão ao lado — e o teste de cima fica vermelho no dia em que
    // essa razão deixar de descrever o código.
    expect(
      DIVIDA,
      "a dívida voltou a ter entradas: cada uma precisa de marca e de razão escritas à mão",
    ).toEqual([]);
  });
});

/**
 * A MESMA ARMADILHA, VIVA, NUM FICHEIRO COM DONO NOUTRA RONDA.
 *
 * O separador do painel de detalhe do `AdminClient` é o ÚNICO elemento do back
 * office inteiro que responde ao rato com geometria e não com tinta —
 * `hover:-translate-y-0.5`, o cartão a levantar-se meio pixel quando o rato
 * chega. E não anima: a lista que ele traz é a do `ESTADO`
 * (`background-color,border-color,color,box-shadow,opacity,scale`) e `translate`
 * não está lá. No Tailwind v4 `-translate-y-0.5` emite a propriedade autónoma
 * `translate`, exactamente como `scale-[0.98]` emite `scale`. O levantar é um
 * corte seco de 0 ms — o único gesto de hover da casa, e o único que não corre.
 *
 * A correcção é uma palavra: `translate` na lista, ou a forma nomeada.
 * Fica aqui declarada em vez de corrigida porque o ficheiro tinha dono.
 */
/**
 * Vazia, e ficou-o quando o separador do painel foi corrigido — era a única
 * entrada. O `ESTADO` da casa lista
 * `background-color,border-color,color,box-shadow,opacity,scale` e NÃO
 * `translate`, portanto o `hover:-translate-y-0.5` daquele cartão — o único
 * gesto de hover com geometria do back office inteiro — nunca chegou a correr.
 * Levou uma lista própria com `translate` lá dentro (e não uma segunda
 * `transition-property` ao lado: entre rectos, as listas saem por ordem
 * alfabética do valor e a última ganha, que foi o que já partiu o
 * `GuardarTudo`).
 */
const ARMADILHA_COM_DONO: { ficheiro: string; marca: string; oQueE: string }[] = [];

describe("a armadilha invisível: `scale` não é `transform`", () => {
  /**
   * No Tailwind v4 `scale-*`, `rotate-*` e `translate-*` emitem as
   * PROPRIEDADES AUTÓNOMAS `scale`, `rotate` e `translate` — não `transform`.
   * Compilado nesta casa (Tailwind 4.3) para não ficar por dedução:
   *
   *     .transition-\[transform\] { transition-property: transform }
   *     .transition-transform     { transition-property: transform, translate, scale, rotate }
   *     .scale-\[0\.98\]          { scale: 0.98 }
   *
   * Ou seja: um elemento com `active:scale-[0.98]` e `transition-[…,transform]`
   * na lista NÃO anima o toque de todo — é um corte seco de 0 ms, com uma
   * duração ao lado que não lhe toca. Custou caro duas vezes nesta casa (o
   * `Button`, e a inclinação do cartão do Kanban) porque não se vê: nada dá
   * erro, nada avisa, e a classe está lá.
   *
   * A forma NOMEADA `transition-transform` cobre as três. A forma entre
   * rectos, não. Este teste olha para cada elemento, um a um.
   */
  /**
   * Só conta a classe que MUDA com um estado — `active:scale-…`,
   * `hover:-translate-y-…`, `group-open:rotate-…`. Um `-translate-y-1/2` a
   * centrar um ícone é posicionamento: nunca transiciona, e exigir-lhe uma
   * lista era mandar procurar avarias onde não há nenhuma (foram os dois
   * falsos positivos da primeira versão, os dois em ícones parados).
   */
  const ESTADOS = "(?:hover|focus|focus-visible|focus-within|active|open|checked|disabled)";
  const PREFIXO = `(?:${ESTADOS}|(?:group|peer)-${ESTADOS}[\\w/-]*|aria-[\\w-]+|data-[\\w[\\]-]+):`;
  const TRIOS = [
    { classe: new RegExp(`${PREFIXO}-?scale-[\\w[]`), prop: "scale" },
    { classe: new RegExp(`${PREFIXO}-?rotate-[\\w[]`), prop: "rotate" },
    { classe: new RegExp(`${PREFIXO}-?translate-(?:x-|y-)?[\\w[]`), prop: "translate" },
  ];

  it("nenhum elemento anima uma propriedade autónoma através de `transform`", () => {
    const maus: string[] = [];
    for (const caminho of ficheiros(RAIZ)) {
      const src = semComentarios(readFileSync(caminho, "utf8"));
      const rel = caminho.replace(process.cwd() + "/src/app/[lang]/(admin)/", "");

      // As constantes de classe do ficheiro, para o caso de a lista (ou o
      // `scale-…`) viver numa delas e não na tag.
      const constantes: Record<string, string> = {};
      for (const c of src.matchAll(
        /\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([`"'][\s\S]*?[`"'])\s*[;,\n]/g,
      ))
        constantes[c[1]] = c[2];

      for (const m of src.matchAll(/<([a-z][A-Za-z0-9_.-]*)/g)) {
        // Só tags nativas: a tag de um componente com JSX nas props engole os
        // filhos, e com eles classes que não são dele.
        const tag = tagCompleta(src, m.index!);

        /* ── PORQUE É QUE ISTO TEM DE EXPANDIR ────────────────────────────
           A armadilha é do `PRESSAO`, e o `PRESSAO` chega às tags como
           `${PRESSAO}` — uma interpolação. Uma varredura que procure o
           literal `scale-…` na tag não vê nenhum e passa a verde por cima
           da avaria que existe para apanhar. Aconteceu: a primeira versão
           deste teste ficou VERDE com a armadilha reposta à mão no cartão
           do Kanban. Expandir as duas constantes da casa (e as locais) é o
           que faz a diferença entre uma rede e um enfeite. */
        let texto = tag;
        if (/\bPRESSAO\b/.test(texto)) texto += " " + PRESSAO;
        if (/\bESTADO\b/.test(texto)) texto += " " + ESTADO;
        for (let volta = 0; volta < 3; volta++)
          for (const [k, v] of Object.entries(constantes))
            if (new RegExp(`\\b${k.replace(/\$/g, "\\$")}\\b`).test(texto)) texto += " " + v;

        const listas = [...texto.matchAll(/transition-\[([^\]]+)\]/g)].map((l) =>
          l[1].split(",").map((p) => p.trim()),
        );
        if (!listas.length) continue;
        // A forma NOMEADA cobre as três — quem a use está safo.
        if (/\btransition-transform\b/.test(texto)) continue;

        for (const { classe, prop } of TRIOS) {
          if (!classe.test(texto)) continue;
          if (listas.some((props) => props.includes(prop))) continue;
          if (ARMADILHA_COM_DONO.some((d) => d.ficheiro === rel && tag.includes(d.marca))) continue;
          const linha = src.slice(0, m.index!).split("\n").length;
          maus.push(
            `${rel}:${linha} <${m[1]}> anima \`${prop}-…\` mas nenhuma lista o declara: ` +
              listas.map((p) => `transition-[${p.join(",")}]`).join(" "),
          );
        }
      }
    }
    expect(
      maus,
      "`transform` na lista não cobre `scale`/`rotate`/`translate`: ou se acrescenta a " +
        "propriedade à lista, ou se usa a forma nomeada `transition-transform`",
    ).toEqual([]);
  });
});

describe("quem pediu menos movimento recebe menos movimento", () => {
  it("nenhuma transição do back office corre fora de `motion-safe:`", () => {
    // O `globals.css` não tem rede global: só desliga transições dentro de
    // `prefers-reduced-motion` em três sítios muito concretos. Uma
    // `transition-colors` à seca está mesmo a animar para quem pediu para não
    // animar. Contadas antes desta ronda: 40 em todo o back office. São zero.
    const soltas: string[] = [];
    for (const caminho of ficheiros(RAIZ)) {
      const src = semComentarios(readFileSync(caminho, "utf8"));
      const rel = caminho.replace(process.cwd() + "/src/app/[lang]/(admin)/", "");
      for (const m of src.matchAll(/(^|[\s"'`{])(transition-[\w[\],.-]+)/g)) {
        const antes = src.slice(Math.max(0, m.index! - 40), m.index! + m[1].length);
        if (/motion-safe:$/.test(antes)) continue;
        soltas.push(`${rel}:${src.slice(0, m.index!).split("\n").length}  ${m[2]}`);
      }
    }
    expect(soltas, "transição sem `motion-safe:`").toEqual([]);
  });

  it("o gesto do toque é UM só, e é o da casa", () => {
    // Se dois botões parecidos respondem de maneiras diferentes, o ecrã parece
    // descuidado. Um `active:scale` escrito à mão com outro número seria uma
    // segunda linguagem de toque — e é assim que se acaba com três.
    const proprios: string[] = [];
    for (const caminho of ficheiros(RAIZ)) {
      const src = semComentarios(readFileSync(caminho, "utf8"));
      const rel = caminho.replace(process.cwd() + "/src/app/[lang]/(admin)/", "");
      for (const m of src.matchAll(/active:scale-\[([^\]]+)\]/g)) {
        if (PRESSAO.includes(`active:scale-[${m[1]}]`)) continue;
        proprios.push(`${rel}:${src.slice(0, m.index!).split("\n").length}  ${m[0]}`);
      }
    }
    expect(proprios, `o gesto da casa é o \`PRESSAO\`: ${PRESSAO}`).toEqual([]);
  });
});
