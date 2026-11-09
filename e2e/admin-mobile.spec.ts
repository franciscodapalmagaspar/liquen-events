import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import {
  AUDITOR,
  ECRA_ESTREITO,
  ALVO_MIN,
  LETRA_CAMPO_MIN,
  descreverAlvo,
  descreverCampo,
  descreverCulpado,
  descreverTexto,
  descreverTapado,
  TEXTO_MIN,
  abrirGaveta,
  irParaDestinoMovel,
  NA_BARRA_DE_BAIXO,
} from "./ergonomia-tactil.mjs";
import { entrarNoBackOffice } from "./semear-pedido";

/**
 * Mobile back-office smoke test (~390px phone, touch).
 *
 * The daily driver for this back office is often a phone. This spec logs in on a
 * phone-sized, touch-enabled viewport and, for each destination, asserts:
 *   1. the view mounts (its H1 shows),
 *   2. the page does NOT scroll horizontally (the #1 "not adapted" smell), and
 *   3. no console / page errors fire.
 * It also checks the mobile menu button opens the full navigation, since on a
 * phone the sidebar is off-canvas. Read-only: never creates/edits/deletes data.
 */

// 375 px e não 390: o iPhone SE é o telemóvel mais estreito que ainda se usa a
// sério, e é a largura em que tudo o que é apertado se parte primeiro.
// `hasTouch` importa para além do gesto — é o que faz `(pointer: coarse)` ser
// verdade, e é nessa media query que assentam os alvos de 44 px.
test.use({ viewport: ECRA_ESTREITO, isMobile: true, hasTouch: true });

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /is using quality/i, // next/image quality hint — not a runtime defect
  // Recursos de terceiros (analytics) inalcançáveis na rede onde o teste corre
  // — condição do ambiente, não defeito da aplicação. Um erro lançado pelo
  // nosso próprio código continua a falhar o passeio. (Igual aos outros passeios.)
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];
const isIgnored = (t: string) => IGNORED_CONSOLE.some((re) => re.test(t));

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !isIgnored(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => {
    if (!isIgnored(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function login(page: Page): Promise<boolean> {
  // Pelo ajudante partilhado: com a sessão guardada pelo
  // `sessao-admin.setup.ts` ele encontra o painel aberto e não gasta entrada
  // nenhuma no tecto de oito por minuto. Sete passeios em fila entravam sete
  // vezes em quarenta segundos, e o oitavo apanhava o 429.
  return entrarNoBackOffice(page);
}

/**
 * UM PEDIDO PARA HAVER O QUE MEDIR.
 *
 * Estes testes percorrem o back office num telemóvel e precisam de pelo menos
 * um pedido na lista — sem nenhum, o estúdio nunca chega a abrir e o que se
 * queria medir não é medido.
 *
 * Durante muito tempo isso veio de graça: os `data/*.json` do repositório
 * traziam pedidos de exemplo. Deixaram de trazer, e por uma boa razão — em
 * produção esse conteúdo reaparecia a CADA DEPLOY por cima do que tinha sido
 * escrito, e um `git checkout` apagava os rascunhos de quem trabalha sem base
 * de dados (ver `ONDE-FICA-GUARDADO.md`).
 *
 * Portanto o teste passa a criar o que precisa. É melhor assim mesmo sem essa
 * razão: um teste que depende do que outra pessoa deixou no repositório passa
 * ou falha por motivos que não são o que ele diz medir.
 */
async function garantirUmPedido(page: Page): Promise<void> {
  // ANTES de entrar, e sem perguntar se já há algum: a lista do back office é
  // desenhada NO SERVIDOR quando a página abre, portanto um pedido criado
  // depois disso não aparece; e a consulta que diria «já há» exige sessão, que
  // ainda não existe. Criar um a mais não custa nada — o armazenamento do CI
  // morre com o processo.
  const r = await page.request.post("/api/orcamento", {
    data: {
      form: {
        name: "Rita e Tomás",
        email: "rita.tomas@example.pt",
        phone: "912345678",
        category: "particulares",
        eventType: "casamentos",
        eventName: "Casamento",
        date: "2099-05-20",
        guests: 80,
        location: "Herdade da Maridona, Glória",
      },
      website: "",
      submissionId: `e2e-movel-${Date.now().toString(36)}`,
    },
  });

  /**
   * A RESPOSTA VERIFICA-SE, e é a linha mais importante desta função.
   *
   * Sem ela, esta chamada já falhou uma corrida inteira em silêncio: contra o
   * servidor de PRODUÇÃO que o `playwright.config.ts` arranca em CI, o
   * `Repository` recusa escritas sem Supabase e isto respondia 500. O pedido
   * não existia, a lista ficava vazia, e a falha só aparecia trinta linhas à
   * frente — «main li button» não encontrado — a apontar para o sítio errado.
   * É por isso que estes passeios passaram a ter servidor próprio
   * (playwright.movel.config.ts); esta asserção é o que garante que, se
   * voltarem a correr onde não se pode gravar, o dizem à primeira e por
   * palavras suas.
   */
  /**
   * O TECTO DE PEDIDOS NÃO É UMA FALHA — e esta linha é a diferença entre uma
   * corrida vermelha e uma verde.
   *
   * `POST /api/orcamento` aceita 5 pedidos por minuto por IP (é um formulário
   * público, e o tecto existe por boas razões). Este ficheiro tem quatro
   * passeios, cada um cria o seu pedido, e uma repetição por falha cria mais um
   * — ao sexto, o servidor responde 429 e o passeio seguinte morria a dizer que
   * não conseguiu criar o pedido de que precisa.
   *
   * Só que, nesse ponto, JÁ HÁ pedidos na lista: os que os passeios anteriores
   * criaram, no mesmo servidor, que dura toda a corrida. O 429 quer dizer
   * «chega», não «não há».
   */
  if (r.status() === 429) return;

  if (!r.ok()) {
    throw new Error(
      `Não se conseguiu criar o pedido de que este passeio precisa: ` +
        `POST /api/orcamento devolveu ${r.status()}. ` +
        `Se for 500, o servidor está em modo de produção sem Supabase e recusa gravar — ` +
        `corra com \`npm run test:e2e:movel\`, que arranca o servidor certo.\n` +
        (await r.text()).slice(0, 300),
    );
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESPERAR PELA VISTA — e porque é que isto não é uma espera de conveniência
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `<h1>` NÃO prova que a vista montou. Ele é desenhado pelo AdminClient, no
 * cabeçalho, a partir de uma tabela de títulos (`VIEW_TITLES`) — aparece no
 * instante em que se toca no destino, com o chunk da vista ainda a caminho e o
 * esqueleto no lugar do conteúdo.
 *
 * MEDIDO, e é o que obrigou a escrever isto: com o passeio a auditar logo a
 * seguir ao `<h1>`, a auditoria das Tarefas via SETE elementos interactivos —
 * os da navegação — e nenhum da vista. O que estava lá em baixo à espera de ser
 * medido, e nunca foi, era o `<summary>` «Detalhes (opcional)» de 15 px de
 * altura. (Esse já não existe: ela mandou-o abrir — «retira isto do opcional,
 * quero que apareça logo» — e os quatro campos deixaram de ter porta. A LIÇÃO
 * fica, que é o que este parágrafo guarda.) O guarda `examinados > 0` dava-se
 * por satisfeito com a moldura, portanto o passo passava, verde, sobre um ecrã
 * que ainda não existia.
 *
 * Duas linhas resolvem-no: o esqueleto (`data-view-skeleton`, posto pelo
 * `ViewSkeleton`) tem de ter saído, e o `<main>` tem de ter conteúdo próprio.
 */
async function esperarPelaVista(page: Page, label: string) {
  /**
   * PRIMEIRO, ESPERAR QUE O PAINEL TENHA HIDRATADO.
   *
   * `body.admin-mode` entra num efeito do `AdminClient`, portanto é a marca de
   * que o React chegou. Antes disso o que está no ecrã é HTML do servidor, e
   * medir aí é medir a chegada do React em vez da interface: o `inert` da
   * gaveta fechada depende de um `matchMedia` que ainda não correu, e o
   * auditor acusava seis botões «focáveis fora do ecrã» que, um instante
   * depois, deixam de o ser.
   *
   * Isto não é varrer nada para debaixo do tapete — o que se via ANTES de
   * hidratar e se via a olho foi corrigido: as maiúsculas do back office
   * deixaram de esperar pela classe e passaram a sair já certas do servidor
   * (ver `globals.css`). O que fica a depender do JS é o que só o JS pode
   * saber, e mede-se quando ele chega.
   */
  await expect(
    page.locator("body.admin-mode"),
    `"${label}": o painel ainda não hidratou (\`body.admin-mode\` por chegar).`,
  ).toHaveCount(1);
  await expect(
    page.locator("[data-view-skeleton]"),
    `"${label}": o esqueleto ainda está no ecrã — a vista não montou, e medi-la agora ` +
      `mede a moldura da navegação em vez do conteúdo.`,
  ).toHaveCount(0);
  await expect
    .poll(() => page.locator("main :is(a[href],button,input,select,textarea,summary)").count(), {
      message:
        `"${label}": o <main> não tem nada de interactivo. O <h1> vem do cabeçalho e aparece ` +
        `sempre — não é prova de que a vista montou.`,
    })
    .toBeGreaterThan(0);
}

/**
 * As quatro regras de ergonomia táctil, numa vista.
 *
 * O que se mede e porquê está escrito em `ergonomia-tactil.mjs`, que é o mesmo
 * módulo que o varrimento `scripts/auditar-toque-admin.mjs` usa para produzir o
 * relatório. Aqui só se transforma o resultado em falha de CI.
 *
 * Nota sobre o overflow: o teste clássico (`scrollWidth > clientWidth`) está
 * CEGO neste site, porque `globals.css` tem `body { overflow-x: clip }` — o
 * clip tira a barra de scroll e o número nunca cresce. Este é o teste que
 * mede a margem direita de cada elemento, que é o que se quer saber: o que
 * passa da margem fica cortado e inalcançável.
 *
 * Mede DEPOIS de a vista existir (`esperarPelaVista`): auditar uma vista que
 * ainda não montou é auditar a navegação, e dá verde por engano.
 */
async function expectErgonomiaTactil(page: Page, label: string) {
  await esperarPelaVista(page, label);
  /**
   * REPETE-SE ATÉ ASSENTAR, E A RAZÃO É UMA REGRA E NÃO UM TRUQUE.
   *
   * Um achado de ergonomia tem de ser ESTÁVEL para valer alguma coisa: um
   * botão que está mal tapado durante um quadro e bem no seguinte não é um
   * problema de toque — ninguém consegue lá tocar nesse quadro.
   *
   * O que motivou isto: o `inert` da gaveta fechada depende de um efeito com
   * `matchMedia` que corre DEPOIS do efeito que põe `body.admin-mode`. Entre
   * um e outro há uma fresta em que os botões da gaveta ainda não são inertes,
   * e o auditor acusava seis de estarem «focáveis fora do ecrã». Um instante
   * depois estavam todos certos.
   *
   * A alternativa era esperar um tempo fixo — que é como se escreve um teste
   * que passa hoje e falha na máquina lenta de amanhã.
   */
  await expect(async () => {
    await auditarUmaVez(page, label);
  }).toPass({ timeout: 10_000 });
}

/**
 * ── UM `hidden` QUE NÃO ESCONDE É PIOR QUE NENHUM ──────────────────────────
 *
 * Nasceu de uma coisa vista com os olhos e não por um teste: a 375 px o botão
 * «Exportar» do calendário aparecia na barra de ferramentas COM a classe
 * `hidden` posta, e um comentário ao lado a garantir que estava «fora do
 * telemóvel». Media 78x32.
 *
 * A causa é de Tailwind e não do calendário: o `<Button>` da casa traz
 * `inline-flex` de origem, e na folha compilada o `.inline-flex` sai DEPOIS do
 * `.hidden`. Mesma especificidade, ganha o último — portanto `hidden` perde
 * para qualquer primitivo que já declare um `display`. O `max-sm:hidden` vive
 * num `@media`, que é emitido depois, e ganha.
 *
 * O defeito é invisível de três maneiras: o `className` diz `hidden`, o
 * `toBeVisible` de quem escreveu o teste nunca é chamado sobre ele, e a
 * medição de alvos não olha para coisas que deviam estar ausentes. Só uma
 * varredura o apanha, e é de uma linha.
 */
async function expectHiddenEscondeMesmo(page: Page, label: string) {
  const mentirosos = await page.evaluate(() =>
    [...document.querySelectorAll(".hidden")]
      .filter((e) => getComputedStyle(e).display !== "none")
      .map((e) => {
        const r = e.getBoundingClientRect();
        return `${e.tagName.toLowerCase()} «${(e.textContent || "").trim().slice(0, 30)}» ${Math.round(r.width)}x${Math.round(r.height)} → display:${getComputedStyle(e).display}`;
      }),
  );
  expect(
    mentirosos,
    `${label}: elemento(s) com a classe \`hidden\` a desenharem-se na mesma. ` +
      "Um primitivo que já declare `display` (o `<Button>` traz `inline-flex`) ganha ao " +
      "`hidden`, porque sai depois na folha. Usa `max-sm:hidden`, que vive num `@media`.",
  ).toEqual([]);
}

async function auditarUmaVez(page: Page, label: string) {
  const r = (await page.evaluate(AUDITOR)) as {
    examinados: number;
    pequenos: Parameters<typeof descreverAlvo>[0][];
    camposPequenos: Parameters<typeof descreverCampo>[0][];
    foraDoEcra: { x: number; rotulo: string; texto: string; tag: string }[];
    overflow: { culpados: Parameters<typeof descreverCulpado>[0][] };
    textoEsmagado: Parameters<typeof descreverTexto>[0][];
    tapados: Parameters<typeof descreverTapado>[0][];
  };

  // A vista tem de ter sido mesmo desenhada — zero elementos interactivos quer
  // dizer que se mediu um ecrã vazio, e três verdes falsos valem menos do que
  // uma falha honesta.
  expect(r.examinados, `"${label}": nada interactivo para medir — a vista montou?`).toBeGreaterThan(
    0,
  );

  /**
   * TUDO O QUE ESTÁ MAL, DE UMA VEZ.
   *
   * Antes eram cinco `expect` em fila: o primeiro a falhar escondia os outros
   * quatro, e corrigir uma vista passava a ser cinco voltas de "corrigir,
   * correr, descobrir o seguinte" — com 1,5 minutos de passeio a cada volta.
   * Agora falha uma vez e diz tudo o que encontrou.
   */
  const achados: string[] = [];

  if (r.pequenos.length) {
    achados.push(
      `${r.pequenos.length} alvo(s) abaixo de ${ALVO_MIN}x${ALVO_MIN}px:\n` +
        r.pequenos.map(descreverAlvo).join("\n"),
    );
  }

  if (r.camposPequenos.length) {
    achados.push(
      `${r.camposPequenos.length} campo(s) com letra < ${LETRA_CAMPO_MIN}px — o Safari do iOS ` +
        `amplia a página ao focá-los e não desamplia:\n` +
        r.camposPequenos.map(descreverCampo).join("\n"),
    );
  }

  // Nada focável fora do ecrã. A gaveta fechada continua no DOM em `x = -244`;
  // sem `inert`, o TAB de um teclado externo e o varrimento do VoiceOver entram
  // lá dentro e o foco desaparece do ecrã.
  if (r.foraDoEcra.length) {
    achados.push(
      `${r.foraDoEcra.length} elemento(s) focáveis fora do ecrã — o foco do teclado desaparece ` +
        `lá para dentro. Falta \`inert\`?\n` +
        r.foraDoEcra.map((f) => `  x=${f.x}  "${f.rotulo || f.texto || f.tag}"`).join("\n"),
    );
  }

  // TEXTO ESMAGADO. O defeito que motivou esta verificação: no estúdio de
  // propostas, um parágrafo irmão de três botões `shrink-0` dentro de um `flex`
  // em linha ficava com ~30 px e passava a UMA PALAVRA POR LINHA — duas frases
  // a ocupar dois ecrãs de scroll. Mede-se a largura RENDERIZADA porque é a
  // única forma de o apanhar: no código não se vê, e a grelha de classes está
  // toda correcta vista uma a uma.
  if (r.textoEsmagado.length) {
    achados.push(
      `${r.textoEsmagado.length} bloco(s) de texto com menos de ${TEXTO_MIN}px de largura. ` +
        `Texto corrido assim estreito parte uma palavra por linha — quase sempre é um parágrafo ` +
        `dentro de um flex em linha com uma barra de botões \`shrink-0\` ao lado. A correcção é ` +
        `empilhar abaixo de \`sm\`:\n` +
        r.textoEsmagado.map(descreverTexto).join("\n"),
    );
  }

  // TAPADOS. Um botão do tamanho certo, dentro da margem, no ecrã — e com uma
  // barra `sticky` por cima. Tocar ali toca na barra. Aconteceu duas vezes
  // neste estúdio, e nenhum dos outros cheques o via.
  if (r.tapados.length) {
    achados.push(
      `${r.tapados.length} elemento(s) interactivos por baixo de uma barra fixa — tocar neles ` +
        `toca na barra:\n` +
        r.tapados.map(descreverTapado).join("\n"),
    );
  }

  if (r.overflow.culpados.length) {
    achados.push(
      `${r.overflow.culpados.length} elemento(s) para lá da margem direita a ` +
        `${ECRA_ESTREITO.width}px. Ficam CORTADOS (o body tem overflow-x: clip), portanto não ` +
        `há como chegar lá:\n` +
        r.overflow.culpados.map(descreverCulpado).join("\n"),
    );
  }

  expect(achados, `"${label}": ${achados.length} problema(s)\n\n${achados.join("\n\n")}`).toEqual(
    [],
  );
}

/**
 * Os quatro destinos que vivem na barra de baixo — vindos do módulo partilhado,
 * que é o mesmo que os varrimentos usam para navegar. Uma segunda lista aqui
 * podia divergir da primeira em silêncio, e o passeio passaria a procurar na
 * barra um destino que está na gaveta (ou o contrário) sem dizer porquê.
 */
const NA_BARRA = new Set(NA_BARRA_DE_BAIXO);

// A "Organização de propostas", a "Biblioteca de serviços" e o
// "Acompanhamento" saíram desta lista porque saíram do MENU, a pedido dela
// (ver a nota em `nav.tsx`). Os ecrãs continuam a existir e a abrir por link
// directo; o que este passeio verifica é a NAVEGAÇÃO, e um destino que já não
// está na gaveta não pode ser visitado por ela.
/**
 * ── PORQUE É QUE «MATERIAL» E «DEFINIÇÕES» ENTRARAM AQUI ──────────────────
 *
 * Estavam os dois na gaveta e não estavam nesta lista. Uma vista que não é
 * visitada não é medida, e o silêncio lia-se como aprovação: a caixa «Cobrar
 * ida e volta» das Definições tinha um alvo de 227×30 — abaixo dos 44 — e
 * nenhum relatório o dizia, porque nenhum passeio lá chegava.
 *
 * A regra que fica: esta lista é a gaveta INTEIRA mais a barra de baixo. Um
 * destino novo em `nav.tsx` entra também aqui, senão nasce por medir.
 */
const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  { nav: /^Pedidos$/, heading: /^Pedidos$/ },
  { nav: /^Fazer proposta$/, heading: /^Fazer proposta$/ },
  { nav: /^Propostas$/, heading: /^Propostas$/ },
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Material$/, heading: /^Material$/ },
  { nav: /^Calendário$/, heading: /^Calendário$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Tarefas$/, heading: /^Tarefas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
  { nav: /^Definições$/, heading: /^Definições$/ },
];

test.describe("Back office — mobile", () => {
  test("@movel phone: every view mounts, touch ergonomics hold, no runtime errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    // Fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH` não consegue entrar e o
    // passeio salta-se — é o que permite corrê-lo à mão sem montar nada. No CI
    // o segredo ESTÁ definido (ver ci.yml), portanto não entrar é uma avaria,
    // não uma condição do ambiente. Saltar em silêncio ali seria transformar
    // esta rede num passo verde que nunca mede nada.
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    await expectErgonomiaTactil(page, "Visão Geral (inicial)");

    // E OUTRA VEZ COM O «MAIS DO PAINEL» ABERTO.
    //
    // Nove blocos da Visão Geral vivem dentro dessa gaveta e chegam FECHADOS.
    // O auditor deixou de os medir fechados de propósito — a razão está por
    // extenso no `visivel()` do `ergonomia-tactil.mjs` —, e deixar a coisa
    // assim trocava um vermelho falso por um silêncio: nove blocos que ela vê
    // todos os dias e que nenhuma medição voltava a tocar.
    //
    // Abre-se pelo `<summary>`, que é como ela abre.
    const mais = page
      .getByRole("group")
      .filter({ hasText: /Mais do painel/ })
      .first();
    // Sem `if`: há um pedido semeado, portanto a Visão Geral não é o ecrã de
    // boas-vindas e a gaveta EXISTE. Um `if` aqui era um salto silencioso — o
    // dia em que ela deixasse de existir, esta medição desaparecia sem ninguém
    // dar por isso.
    await expect(mais, "a Visão Geral já não tem a gaveta «Mais do painel»").toHaveCount(1);
    await page.getByText("Mais do painel", { exact: true }).click();
    await expect(mais).toHaveAttribute("open", "");
    await expectErgonomiaTactil(page, "Visão Geral (com «Mais do painel» aberto)");
    await page.getByText("Mais do painel", { exact: true }).click();

    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });

    for (const view of VIEWS) {
      // COMO SE NAVEGA MESMO, num telemóvel: os quatro do dia estão na barra de
      // baixo, e nunca na gaveta; tudo o resto está na gaveta, e nunca na
      // barra. Se este passeio fosse sempre pela gaveta, deixava de tocar na
      // barra de baixo — que é a navegação que ela usa mais — e não notava se
      // um destino estivesse escrito nos dois sítios.
      const naBarra = NA_BARRA.has(view.nav.source.replace(/[$^]/g, ""));
      if (naBarra) {
        const barra = page.getByRole("navigation", { name: /Navegação do back office/i });
        const item = barra.getByRole("button", { name: view.nav });
        await expect(
          item,
          `A barra de baixo não tem "${view.nav.source}" — continua no BARRA_INFERIOR de nav.tsx?`,
        ).toHaveCount(1);
        await item.click();
      } else {
        // A gaveta abre no hambúrguer do cabeçalho — o único abridor.
        await abrirGaveta(page);
        const sidebar = page.getByRole("navigation", { name: /Mais destinos/i });
        await expect(sidebar).toBeVisible();
        const item = sidebar.getByRole("button", { name: view.nav });
        // Diz qual é a etiqueta que falta em vez de esperar 30s pelo clique:
        // quando um destino sai da navegação, esse diagnóstico deve ser grátis.
        await expect(
          item,
          `A gaveta não tem "${view.nav.source}" — continua em nav.tsx?`,
        ).toHaveCount(1);
        await item.first().click();
      }
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await expect(errorBoundary).toHaveCount(0);
      await expectErgonomiaTactil(page, view.nav.source);
      await expectHiddenEscondeMesmo(page, view.nav.source);

      // O TÍTULO NÃO PODE FICAR CORTADO A MEIO DE UMA PALAVRA.
      // O `truncate` do cabeçalho impede-o de partir em duas linhas, mas em
      // troca corta o que não couber — e "Organização de propostas" saía
      // "Organiza…". A correcção é dar-lhe um nome curto para o telemóvel
      // (VIEW_TITLES_CURTOS em AdminClient.tsx), e é esta falha que o manda
      // fazer, com o nome e os dois números.
      const titulo = await page.evaluate(() => {
        const t = document.querySelector("header h1");
        if (!t) throw new Error("Sem <h1> no cabeçalho — a vista montou?");
        return {
          texto: (t.textContent ?? "").trim(),
          cabe: Math.round(t.clientWidth),
          precisa: Math.round(t.scrollWidth),
        };
      });
      expect(
        titulo.precisa,
        `O título "${titulo.texto}" fica cortado no telemóvel: precisa de ${titulo.precisa}px e ` +
          `tem ${titulo.cabe}. Dê-lhe um nome curto em VIEW_TITLES_CURTOS.`,
      ).toBeLessThanOrEqual(titulo.cabe + 1);

      /**
       * O ESTÚDIO SÓ EXISTE DEPOIS DE SE ESCOLHER O CLIENTE.
       *
       * "Fazer proposta" abre num escolhedor ("Para quem é a
       * proposta?"); o estúdio, que é onde vive quase todo o formulário, só é
       * desenhado a seguir. Medir só o escolhedor dava um passo VERDE sobre um
       * ecrã que não é o que se usa — e foi exactamente o que aconteceu: o
       * parágrafo esmagado do estúdio viveu aqui sem nunca ser apanhado, porque
       * o passeio parava um clique antes.
       *
       * Só entra se houver mesmo um pedido na lista; sem pedidos não há estúdio
       * para medir, e inventar um aqui era escrever dados no meio de um passeio
       * declaradamente de leitura.
       */
      if (view.nav.source === "^Fazer proposta$") {
        const estudio = page.getByText(/Estúdio de propostas/i).first();
        // O estúdio LEMBRA-SE do último cliente: à segunda visita abre já nele,
        // sem passar pelo escolhedor. Tentar escolher aqui um cliente que não
        // está no ecrã dava uma falha que não tem nada a ver com ergonomia — foi
        // o que aconteceu à primeira versão deste passo.
        if ((await estudio.count()) === 0) {
          // NÃO se salta em silêncio: um passo que se salta sozinho é como o
          // defeito do parágrafo esmagado sobreviveu tanto tempo.
          const cartoes = page.locator("main li button");
          await expect(
            cartoes.first(),
            "Sem cliente escolhido e sem ninguém na lista — o estúdio não chega a ser medido.",
          ).toBeVisible();
          await cartoes.first().click();
        }
        // `toHaveCount` e NÃO `toBeVisible`: quem julga o layout é a auditoria
        // a seguir, não este passo de navegação. Com `toBeVisible` o passeio
        // rebentava aqui quando o parágrafo estava esmagado a 0 px — ou seja,
        // falhava a dizer "não cheguei ao estúdio" quando na verdade tinha
        // chegado e encontrado o defeito. A presença prova a navegação; a
        // largura é problema da auditoria.
        await expect(estudio).toHaveCount(1);
        await expectErgonomiaTactil(page, "Fazer proposta → estúdio");
      }
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O PAINEL DO PEDIDO — o ecrã onde ela passa o dia, e que ninguém media
   * ════════════════════════════════════════════════════════════════════════
   *
   * O passeio de cima percorre as VISTAS. Nenhuma delas é o sítio onde o
   * trabalho acontece: esse é o painel que abre quando se toca num pedido, com
   * os separadores Produção, Financeiro e Fazer proposta. Uma lista de pedidos
   * bem medida com um painel por medir é meia medição.
   *
   * O que a falta desta medição escondeu, tudo a 375 px:
   *   · «Histórico de atividade» — interruptor de 334×16;
   *   · «Plano de decoração, cronograma e convidados» — 334×16, e é a única
   *     porta para o plano, o cronograma e os convidados;
   *   · «Já pago», no registo de um pagamento — alvo de 163×18;
   *   · «Hoje» e «Ontem», que datam o recebimento — 45×28 e 56×28, encostados.
   *
   * Fica em teste próprio e não dentro do de cima por uma razão prática: abrir
   * um pedido MUDA o ecrã (a barra de baixo esconde-se, o painel toma conta da
   * página), e um passeio de navegação que muda de estado a meio deixa de
   * poder continuar a percorrer a navegação.
   *
   * O separador Financeiro é auditado pelos controlos do REGISTO DE PAGAMENTOS,
   * medidos pelo nome. (O livro de faturas que lá viveu saiu do produto — a
   * facturação passou a ser feita noutro programa.)
   */
  test("@movel phone: o painel de um pedido também se toca com o dedo", async ({ page }) => {
    const errors = collectErrors(page);
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .getByRole("button", { name: /^Pedidos/ })
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: /^Pedidos$/ })).toBeVisible();

    // Um pedido a sério, e não um esqueleto: sem cartão na lista não há painel
    // para medir, e saltar em silêncio seria o verde imaginário de sempre.
    const cartoes = page.locator("main li button");
    await expect(
      cartoes.first(),
      "Sem pedidos na lista — o painel do pedido não chega a ser medido.",
    ).toBeVisible();
    await cartoes.first().tap();

    /**
     * ── E DAÍ AO PAINEL, QUE MUDOU DE PORTA ──────────────────────────────
     *
     * Carregar num cliente na lista deixou de abrir o painel: leva ao ecrã de
     * fazer a proposta, na página toda (palavras dela: «não apenas ali de
     * lado» — ver `irFazerAProposta` no `AdminClient.tsx`). O painel — que é o
     * que este passo mede, com os separadores Produção e Financeiro — ficou a
     * uma tecla, no «Abrir o pedido» desse ecrã.
     */
    // No telemóvel, desde 9/11, as portas do pedido vivem no «⋯» do estúdio —
    // seis botões soltos eram três linhas por cima dos passos.
    await page
      .getByRole("button", { name: /^Acções de / })
      .first()
      .tap();
    const paraOPedido = page.getByRole("menuitem", { name: /^Abrir o pedido$/ });
    await expect(
      paraOPedido,
      "O ecrã de fazer proposta perdeu a porta de volta ao pedido.",
    ).toHaveCount(1);
    await paraOPedido.tap();

    // O painel abriu quando a barra de gravação do pedido existe — é o pé do
    // painel, e só é desenhado com um pedido adoptado.
    const painel = page.getByRole("heading", { level: 2 }).first();
    await expect(painel).toBeVisible();
    await expectErgonomiaTactil(page, "pedido aberto");

    // ── Separador Produção ────────────────────────────────────────────────
    const producao = page.getByRole("tab", { name: /Produção/i });
    await expect(producao, "O painel do pedido perdeu o separador «Produção».").toHaveCount(1);
    await producao.tap();
    await expectErgonomiaTactil(page, "pedido aberto → Produção");

    // ── Separador Financeiro: os controlos do registo de pagamentos ───────
    const financeiro = page.getByRole("tab", { name: /Financeiro/i });
    await expect(financeiro, "O painel do pedido perdeu o separador «Financeiro».").toHaveCount(1);
    await financeiro.tap();

    for (const nome of [/^Já pago$/, /^Hoje$/, /^Ontem$/]) {
      const alvo = page
        .getByText(nome)
        .first()
        .or(page.getByRole("button", { name: nome }));
      const controlo = page.getByRole("button", { name: nome });
      const el = (await controlo.count()) ? controlo.first() : alvo.first();
      await expect(el, `O registo de pagamentos perdeu o controlo ${nome.source}.`).toBeVisible();
      const caixa = await el.boundingBox();
      expect(
        Math.round(caixa?.height ?? 0),
        `«${nome.source}» tem ${Math.round(caixa?.height ?? 0)}px de altura — ` +
          `abaixo dos ${ALVO_MIN} do dedo. É por aqui que se datam e se dão por recebidos os ` +
          `pagamentos; errar o toque troca o dia, ou o valor.`,
      ).toBeGreaterThanOrEqual(ALVO_MIN);
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O AVISO DE ERRO — o único ecrã que ninguém desenha para ser usado
   * ════════════════════════════════════════════════════════════════════════
   *
   * As auditorias de alvos passeiam por ecrãs em repouso, e um aviso só existe
   * depois de alguma coisa correr mal. Resultado: a caixa que aparece
   * PRECISAMENTE quando ela precisa de reagir nunca foi medida — e tinha, as
   * duas coisas, medidas a 375×667:
   *
   *   · o «×» que a fecha com 9×14 px, o alvo mais pequeno do back office. Num
   *     telemóvel não havia como fechá-la: só esperar os 4 segundos;
   *   · a caixa a acabar aos 635 px com a barra de navegação a começar aos 610
   *     — 25 px de aviso opaco por cima dos ícones de «Visão Geral» e
   *     «Pedidos». Tapar a navegação no momento em que ela quer sair dali.
   *
   * Como se provoca um aviso sem sujar dados: manda-se o servidor recusar a
   * criação de uma tarefa. Nada é escrito — o pedido nem chega ao servidor —, e
   * de caminho prova-se a outra metade, que é a que ela pediu: quando falha, o
   * ecrã DIZ o que se passou, em português, em vez de fingir que correu bem.
   */
  test("@movel phone: um aviso de erro explica-se, fecha-se com o dedo e não tapa a navegação", async ({
    page,
  }) => {
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    await irParaDestinoMovel(page, "Tarefas");
    await expect(page.getByRole("heading", { level: 1, name: /^Tarefas$/ })).toBeVisible();

    // O servidor recusa. NADA é gravado: a rota é interceptada no browser.
    await page.route("**/api/tarefas**", async (rota) => {
      if (rota.request().method() === "POST") {
        await rota.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Erro interno" }),
        });
        return;
      }
      await rota.fallback();
    });

    /* ── ESCREVER UMA TAREFA MUDOU DE GESTO, E ESTE PASSEIO APRENDE-O ─────
       Fase 03 do documento das Tarefas: o cartão de criar saiu do topo da
       página («ocupa ~180 px, sempre, para uma ação ocasional, e empurra para
       baixo aquilo que é o conteúdo») e a criação passou a ser a última linha
       da lista, que só vira campo quando se lhe toca.

       E o botão «Adicionar» saiu com ele — era um primário DESACTIVADO como
       estado inicial de um ecrã vazio, que é a primeira coisa que se vê ao
       entrar aqui e se lê como avaria. `Enter` cria, que é o gesto que toda a
       gente tenta primeiro.

       O passeio passa a dar os mesmos dois gestos que ela dá. O que ele mede —
       que uma gravação recusada se explica, se fecha com o dedo e não tapa a
       navegação — não mudou nada. */
    await page.getByRole("button", { name: "Nova tarefa" }).first().tap();
    const campoDaTarefa = page.getByPlaceholder(/O que há para fazer/i).first();
    await expect(campoDaTarefa, "a linha de escrever uma tarefa abriu").toBeVisible();
    await campoDaTarefa.fill("tarefa que não vai gravar");
    await campoDaTarefa.press("Enter");

    // 1. DIZ O QUE SE PASSOU, em português e sem código de erro.
    const aviso = page.locator('[role="alert"] > div').first();
    await expect(
      aviso,
      "A criação da tarefa falhou e o ecrã não disse nada — um erro calado leva-a a repetir.",
    ).toBeVisible();
    /**
     * O QUE SE EXIGE É A FRASE COMPLETA, E NÃO UMAS PALAVRAS EM PARTICULAR.
     *
     * Isto pedia `/não foi possível/` — que era a frase da casa quando o teste
     * foi escrito, e era exactamente a frase que o inventário de esperas veio
     * a apontar: a MESMA para seis avarias com respostas diferentes. Agora diz
     * «O servidor não está a aceitar gravações agora — não deu para criar a
     * tarefa «…». Espera um pouco e repete.»
     *
     * Fixar as palavras antigas fazia este teste puxar o ecrã para trás. O que
     * ele tem de guardar são as três partes que a tornam útil: **nomeia a
     * coisa**, **diz porquê**, e **acaba numa instrução** — mais a regra que
     * lhe deu origem, que é não haver aqui um código de erro nem um «algo
     * correu mal».
     */
    await expect(
      aviso,
      "o aviso não nomeia a tarefa — sem isso não se sabe sobre o que é",
    ).toContainText(/tarefa que não vai gravar/i);
    await expect(aviso, "o aviso não diz porquê").toContainText(
      /não está a aceitar gravações|sem ligação|sessão expirou/i,
    );
    await expect(aviso, "o aviso não diz o que fazer a seguir").toContainText(
      /repete|recarrega|volta a entrar/i,
    );
    await expect(aviso).not.toContainText(/algo correu mal|erro interno|500/i);

    // 2. NÃO TAPA A BARRA DE BAIXO.
    const barra = page.getByRole("navigation", { name: /Navegação do back office/i });
    const caixaAviso = await aviso.boundingBox();
    const caixaBarra = await barra.boundingBox();
    expect(
      Math.round((caixaAviso?.y ?? 0) + (caixaAviso?.height ?? 0)),
      `O aviso acaba aos ${Math.round((caixaAviso?.y ?? 0) + (caixaAviso?.height ?? 0))}px e a ` +
        `barra de navegação começa aos ${Math.round(caixaBarra?.y ?? 0)} — está a pousar-lhe em ` +
        `cima, e é o pior momento para esconder a saída.`,
    ).toBeLessThanOrEqual(Math.round(caixaBarra?.y ?? 0));

    // 3. FECHA-SE COM O DEDO.
    const fechar = aviso.getByRole("button", { name: /^Fechar$/ });
    const caixaFechar = await fechar.boundingBox();
    expect(
      Math.min(Math.round(caixaFechar?.width ?? 0), Math.round(caixaFechar?.height ?? 0)),
      `O «×» que fecha o aviso tem ${Math.round(caixaFechar?.width ?? 0)}×` +
        `${Math.round(caixaFechar?.height ?? 0)}px — abaixo dos ${ALVO_MIN} do dedo. Sem ele, ` +
        `fechar um aviso num telemóvel passa a ser esperar.`,
    ).toBeGreaterThanOrEqual(ALVO_MIN);
    await fechar.tap();
    await expect(aviso).toHaveCount(0);
  });

  /**
   * ZERO DEPENDÊNCIA DE TECLADO.
   *
   * Num telemóvel não há ⌘, não há Esc, não há setas. Tudo o que o back office
   * só sabe fazer por tecla é, ali, uma coisa que não se pode fazer — e tudo o
   * que ANUNCIA uma tecla é uma instrução impossível de seguir, a ocupar o
   * pouco espaço que há.
   *
   * Este passeio corre num ecrã de toque (`hasTouch`, portanto
   * `(pointer: coarse)` é verdade) e exige as duas metades: que não sobre
   * nenhuma etiqueta de tecla à vista, e que as acções que só tinham atalho
   * tenham um botão.
   *
   * O que fica de fora, de propósito, está escrito em NO-KEYBOARD.md.
   */
  test("@movel phone: nada precisa de teclado, e nada anuncia teclas", async ({ page }) => {
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    /** As etiquetas de tecla que estão mesmo a ser desenhadas. */
    const teclasAVista = async (onde: string) => {
      const kbds = page.locator("kbd:visible");
      const textos = await kbds.allInnerTexts();
      expect(
        textos,
        `${onde}: ${textos.length} etiqueta(s) de tecla à vista num ecrã sem teclado. ` +
          `Marque-as \`pointer-coarse:hidden\` — e, se a tecla era o único caminho, ` +
          `ponha lá um botão antes de a esconder.`,
      ).toEqual([]);
    };

    await teclasAVista("Visão Geral");

    // ── A pesquisa global ────────────────────────────────────────────────
    // O ⌘K continua a funcionar em quem tem teclado. Aqui interessa a outra
    // ponta: chegar lá com o dedo, e sair de lá com o dedo.
    const procurar = page.getByRole("button", { name: /^Pesquisar$/ });
    await expect(
      procurar,
      "Sem botão de pesquisa no telemóvel — a pesquisa global ficaria só no ⌘K, que ali não existe.",
    ).toHaveCount(1);
    await procurar.tap();

    const paleta = page.getByRole("dialog", { name: /Pesquisar e navegar/i });
    await expect(paleta).toBeVisible();
    await teclasAVista("paleta de comandos");

    // Fechar tem de ser um CONTROLO. Tocar no fundo escuro também fecha, mas
    // isso é uma coisa que se descobre por acaso, não um caminho.
    await paleta.getByRole("button", { name: /^Fechar$/ }).tap();
    await expect(paleta).toHaveCount(0);

    // ── A folha de atalhos não se oferece a quem não tem teclas ───────────
    await abrirGaveta(page);
    const sidebar = page.getByRole("navigation", { name: /Mais destinos/i });
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /^Atalhos$/ }),
      "A lista de atalhos de teclado continua a ocupar a gaveta num ecrã de toque.",
    ).toHaveCount(0);

    // ── Desfazer, no estúdio ─────────────────────────────────────────────
    // Pela barra de baixo: "Fazer proposta" é um dos quatro do dia e, desde a
    // arrumação das duas navegações, já não está na gaveta.
    await page.getByRole("button", { name: /Fechar menu/i }).tap();
    await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .getByRole("button", { name: /Fazer proposta/i })
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: /^Fazer proposta$/ })).toBeVisible();
    const estudio = page.getByText(/Estúdio de propostas/i).first();
    if ((await estudio.count()) === 0) {
      const cartoes = page.locator("main li button");
      await expect(
        cartoes.first(),
        "Sem cliente escolhido e sem ninguém na lista — o estúdio não chega a ser medido.",
      ).toBeVisible();
      await cartoes.first().tap();
    }
    await expect(estudio).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /^Desfazer$/ }),
      "Desfazer só existia como Cmd+Z — num telemóvel, um engano passava a ser definitivo.",
    ).toHaveCount(1);
    await teclasAVista("estúdio de propostas");
  });

  /**
   * O CABEÇALHO NÃO PODE VOLTAR A COMER O ECRÃ.
   *
   * Media 102 px num telemóvel de 667. Com os 56 px da barra de baixo eram
   * 158 px de moldura — quase um quarto do ecrã — ocupados para sempre por uma
   * coisa que só se lê uma vez: o nome da vista. E o título partia em duas
   * linhas ("Visão / Geral"), o dobro da altura para a mesma palavra.
   *
   * O limite de 72 px não é redondo por acaso: é a altura de um cabeçalho de
   * uma linha com um alvo de 44 px lá dentro e a folga que ele precisa. Acima
   * disso, alguma coisa voltou a ser empilhada.
   */
  test("@movel phone: o cabeçalho cabe numa faixa, e encolhe ao descer", async ({ page }) => {
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    const medir = () =>
      page.evaluate(() => {
        const h = document.querySelector("header");
        const t = document.querySelector("header h1");
        // Sem cabeçalho ou sem título não há nada a medir — e devolver zeros
        // dava um teste verde sobre um ecrã que não montou.
        if (!h || !t) throw new Error("Sem <header> ou sem <h1> no cabeçalho — a vista montou?");
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return {
          altura: Math.round(h.getBoundingClientRect().height),
          linhas: r.height / parseFloat(cs.fontSize),
          titulo: (t.textContent ?? "").trim(),
        };
      });

    // O TOPO MEDE-SE NO TOPO. A página de entrada é alta (a fotografia ocupa o
    // ecrã) e o browser guarda a posição do scroll quando o conteúdo é
    // substituído no lugar — media-se «no topo» um cabeçalho que já estava
    // encolhido a 66 px de altura de scroll. A aplicação passou a voltar ao
    // topo ao entrar; isto garante que o teste não depende disso para medir a
    // coisa certa.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    const topo = await medir();
    expect(
      topo.altura,
      `O cabeçalho mede ${topo.altura}px num ecrã de 667. Voltou a haver linhas empilhadas — ` +
        `o subtítulo? o título em duas linhas?`,
    ).toBeLessThanOrEqual(72);
    // 1.5 e não 1: uma linha de Playfair mede um pouco mais do que o
    // `font-size`, e comparar com 1 exacto seria um teste a tremer.
    expect(
      topo.linhas,
      `O título "${topo.titulo}" está em mais do que uma linha — falta o \`truncate\`, ` +
        `ou há CSS à mão a ganhar-lhe (foi o que o \`text-wrap: balance\` fez).`,
    ).toBeLessThan(1.5);

    // E encolhe mesmo ao descer — senão o "encolhe ao scroll" é só uma boa
    // intenção escrita no código.
    /**
     * DESCE-SE, E ESPERA-SE PELA ANIMAÇÃO.
     *
     * O site tem `scroll-behavior: smooth`, portanto `window.scrollTo` NÃO põe
     * o scroll onde se pede — começa uma animação. Ler o `scrollY` a seguir dá
     * zero, e um teste que leia assim acusa o código de não fazer uma coisa que
     * ele faz. (Foi o que me aconteceu a mim ao endurecer este teste.)
     *
     * O `useDesceu` acende aos 24 px; medido nesta vista, o cabeçalho passa de
     * 65 px no topo para 57 depois de descer.
     */
    await page.evaluate(() => window.scrollTo(0, 400));
    await page
      .waitForFunction(() => window.scrollY > 24, undefined, { timeout: 5000 })
      .catch(() => {});
    const rolou = await page.evaluate(() => window.scrollY);
    expect(
      rolou,
      `A vista só rolou ${rolou}px, abaixo dos 24 do useDesceu — não há como o ` +
        `cabeçalho encolher. Ou a página não tem altura para rolar, ou entrou-se ` +
        `já rolado: a página de entrada é alta e o browser guarda a posição do ` +
        `scroll (ver o scrollTo(0, 0) do AdminLogin).`,
    ).toBeGreaterThan(24);
    await page.waitForTimeout(400);
    const descido = await medir();
    expect(
      descido.altura,
      "O cabeçalho não encolheu ao descer 400px — o `useDesceu` está ligado?",
    ).toBeLessThan(topo.altura);
  });

  /**
   * UMA NAVEGAÇÃO, NÃO DUAS.
   *
   * A barra de baixo leva os quatro destinos do dia; a gaveta leva o resto.
   * Nenhum destino nos dois sítios, e um só botão a abrir a gaveta.
   *
   * O que isto apanha é a regressão fácil: alguém acrescenta um destino à barra
   * de baixo (ou volta a pôr um "Mais" lá) e o telemóvel fica outra vez com
   * duas navegações a dizer o mesmo — que é o estado de que esta correcção
   * partiu, e que ninguém repara a olhar para uma vista de cada vez.
   */
  test("@movel phone: a barra de baixo e a gaveta não repetem destinos", async ({ page }) => {
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    const barra = page.getByRole("navigation", { name: /Navegação do back office/i });

    /**
     * ── PORQUE É QUE O ABRIDOR JÁ NÃO SE CONTA PELO TEXTO ────────────────
     *
     * Isto era `toEqual([...NA_BARRA, "Mais"])`, e passou a receber
     * `[…, ""]`. Não foi o abridor que desapareceu: foi a palavra.
     *
     * A barra passou a ser a cápsula que ela pediu — os quatro destinos numa
     * pastilha de material e o abridor numa PEÇA REDONDA à parte, porque não é
     * um destino, é a porta. Uma peça redonda de 62 px não leva a palavra
     * «Mais» lá dentro, e o nome dela passou a viver no `aria-label`.
     *
     * A regra que este teste guarda não mudou nada — quatro destinos em baixo,
     * o resto na gaveta, nenhum nos dois sítios, UM só abridor. O que mudou foi
     * a forma de contar o abridor: pelo nome acessível, que é o que continua a
     * existir, em vez do texto visível, que deixou de existir de propósito.
     */
    /*
      ── PELO NOME ACESSÍVEL, E NÃO PELO TEXTO VISÍVEL ──────────────────────

      O rótulo visível da barra encurta no telemóvel — «Visão» em vez de «Visão
      Geral», «Proposta» em vez de «Fazer proposta» — para caber numa linha, que
      é o que faz a barra ler-se como barra e não como uma lista apertada (as
      referências que ela mandou, do Instagram e do WhatsApp, têm todas o rótulo
      numa linha só).

      O que NÃO encurta é o nome acessível: cada botão leva `aria-label` com o
      nome inteiro, porque quem ouve o ecrã só tem a palavra e «Visão» não é um
      destino.

      Este caso guarda QUE DESTINOS estão na barra, e a identidade de um destino
      é o nome inteiro. Passa a lê-lo de onde ele continua a existir — que é
      exactamente a mesma correcção que o comentário aqui em cima já descreve
      ter sido feita ao abridor da gaveta.
    */
    const textos = (
      await barra
        .getByRole("button")
        .evaluateAll((bs) =>
          bs.map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()),
        )
    )
      .filter(Boolean)
      // O abridor da gaveta é contado à parte, na asserção logo a seguir. Antes
      // ficava de fora sozinho — não tem texto visível, só `aria-label`, e a
      // leitura anterior era pelo texto. Agora que se lê o nome acessível, ele
      // entra na lista e tem de sair aqui.
      .filter((n) => !/Mais destinos/i.test(n));
    expect(
      textos,
      "A barra de baixo deixou de ser os quatro destinos do dia. " +
        "Ver BARRA_INFERIOR em nav.tsx — e, se mudou de propósito, mudar também o NA_BARRA deste ficheiro.",
    ).toEqual([...NA_BARRA]);

    await expect(
      barra.getByRole("button", { name: /Mais destinos/i }),
      "a porta da gaveta: uma, e com nome para quem ouve o ecrã",
    ).toHaveCount(1);

    await abrirGaveta(page);
    const gaveta = page.getByRole("navigation", { name: /Mais destinos/i });
    await expect(gaveta).toBeVisible();
    const naGaveta = await gaveta
      .getByRole("button")
      .evaluateAll((bs) =>
        bs.map((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim()),
      );

    const repetidos = naGaveta.filter((t) => NA_BARRA.has(t));
    expect(
      repetidos,
      `${repetidos.length} destino(s) escritos nos DOIS sítios — a barra de baixo e a gaveta. ` +
        `Num ecrã de 375 px passam a ser duas navegações a competir, e nenhuma é "a" navegação.`,
    ).toEqual([]);

    // E a gaveta tem mesmo de levar o resto: se ficasse vazia, o teste acima
    // passava por não haver lá nada, que é o pior verde possível.
    expect(
      naGaveta,
      "A gaveta ficou sem destinos nenhuns — o resto da navegação desapareceu.",
    ).toContain("Calendário");
    expect(naGaveta).toContain("Temas");

    // UM ABRIDOR DE CADA VEZ, e nunca dois no mesmo ecrã. Havia o "Mais" da
    // barra de baixo E o hambúrguer do cabeçalho a abrir a mesma gaveta, em
    // cantos opostos. Agora o hambúrguer só entra quando a barra de baixo sai
    // (com uma proposta aberta em detalhe) — portanto o que se conta é quantos
    // estão VISÍVEIS, não quantos existem no código.
    await page.getByRole("button", { name: /Fechar menu/i }).click();
    // `getClientRects()` e não `toBeVisible`: a gaveta fechada continua no DOM
    // (está `translate-x-full` para fora do ecrã), e o que interessa aqui é
    // quantos abridores estão MESMO desenhados.
    const abridoresAVista = await page
      .getByRole("button", { name: /Mais destinos|Abrir menu/i })
      .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
    expect(
      abridoresAVista,
      "Há mais do que um botão a abrir a gaveta no mesmo ecrã — voltámos a ter duas portas para " +
        "o mesmo sítio, em cantos opostos.",
    ).toBe(1);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * A PÁGINA NÃO SE ARRASTA PARA O LADO
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * Ela viu isto duas vezes, com um mês de intervalo: a página desliza para a
   * direita e do outro lado fica uma folha branca. Da segunda vez mediu-se nas
   * fotografias — 261 px de deslocamento — e mediu-se aqui: o ÚNICO elemento em
   * todo o ecrã que sai da margem é a gaveta de navegação fechada, `fixed`, com
   * 256 px, parqueada em `x = -256`.
   *
   * ── Porque é que nada disto apareceu antes ────────────────────────────────
   *
   * Duas razões que se juntam, e que é preciso ter as duas em conta para o
   * teste valer alguma coisa:
   *
   * · A rede de segurança do `globals.css` (`body { overflow-x: clip }`) não
   *   alcança um elemento `fixed`. O bloco contentor de um fixo é o viewport, e
   *   nenhum antepassado o corta — a não ser que esse antepassado seja ele
   *   próprio o bloco contentor dos fixos (`transform`, `filter`, `contain`).
   *
   * · O Safari do iPhone conta os `fixed` para a área que se pode arrastar. O
   *   Chromium não conta — e é por isso que a asserção clássica
   *   (`scrollWidth > clientWidth`) dá verde aqui e o telemóvel dela arrasta.
   *
   * Ou seja: este teste NÃO pode ser «nada passa a margem», porque no Chromium
   * nada passa e no telemóvel passa. O que se prende é a ESTRUTURA que faz a
   * diferença — a gaveta tem de viver dentro de um antepassado que a corte.
   */
  test("@movel phone: a gaveta fechada não deixa a página arrastar-se para o lado", async ({
    page,
  }) => {
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    const m = await page.evaluate(() => {
      const aside = document.querySelector("aside");
      if (!aside) throw new Error("Sem <aside> — a barra lateral montou?");
      const r = aside.getBoundingClientRect();
      // `offsetParent` de um elemento `fixed` só é diferente de `null` quando
      // algum antepassado é mesmo o bloco contentor dele. É esta a prova.
      const contentor = (aside as HTMLElement).offsetParent as HTMLElement | null;
      const cs = contentor ? getComputedStyle(contentor) : null;
      const cr = contentor?.getBoundingClientRect() ?? null;
      return {
        gavetaX: Math.round(r.left),
        gavetaLargura: Math.round(r.width),
        ecra: document.documentElement.clientWidth,
        temContentor: !!contentor,
        corta: cs ? cs.overflowX === "hidden" || cs.overflowX === "clip" : false,
        contentorCabe: cr ? cr.left >= -1 && cr.right <= innerWidth + 1 : false,
      };
    });

    // A gaveta fechada CONTINUA fora do ecrã — é assim que ela desliza para
    // dentro. O que não pode é estar fora e por cortar.
    expect(m.gavetaX, "a gaveta fechada devia estar parqueada à esquerda").toBeLessThan(0);

    expect(
      m.temContentor,
      `A gaveta fechada vive em x=${m.gavetaX} (${m.gavetaLargura} px de largura) num ecrã de ` +
        `${m.ecra} px, e NÃO tem antepassado que a corte. No Safari do iPhone isso deixa a ` +
        `página arrastar-se ${Math.abs(m.gavetaX)} px para o lado, com uma folha branca do outro. ` +
        `O invólucro está em AdminClient.tsx — ver o comentário lá.`,
    ).toBe(true);

    expect(
      m.corta,
      "O antepassado da gaveta deixou de a cortar (`overflow` já não é hidden/clip).",
    ).toBe(true);

    expect(
      m.contentorCabe,
      "O invólucro da gaveta passou a ser maior do que o ecrã — corta a gaveta e transborda ele.",
    ).toBe(true);
  });
});
