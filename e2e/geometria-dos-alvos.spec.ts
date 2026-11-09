import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRÊS ALVOS QUE NÃO SE CONSEGUIAM USAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro mede GEOMETRIA — onde as coisas nascem e que tamanho têm — e
 * não comportamento. Existe porque os três defeitos que cobre passavam por
 * cima de qualquer teste de unidade: em jsdom não há dobra, não há corte de
 * texto e não há 44 px. Só um navegador a desenhar a página os vê.
 *
 * ⚠ A ARMADILHA (a mesma que o `consentimento-geometria.spec.ts` já escreve):
 * verificar que a caixa de um botão existe NÃO PROVA NADA. Um botão desenhado
 * 229 px abaixo do ecrã tem caixa, tem texto e responde a `click()` do
 * Playwright — que rola a página até lá antes de clicar. A pergunta que
 * interessa é «quem está naquele ponto do ECRÃ?», porque é isso que o rato
 * acerta e é isso que ela vê.
 *
 * Os três:
 *
 *   D1 · a barra «Guardar alterações» do painel do pedido nascia FORA do ecrã
 *        num portátil de 900 px de altura — e rolar a gaveta até ao fim não a
 *        trazia, porque ela está colada ao fundo da GAVETA e não do ecrã.
 *   D2 · (era a tira de totais das Faturas, que não cabia num telemóvel. Saiu
 *        com a facturação — o ecrã que a mostrava já não existe.)
 *   D3 · alvos de 13 px: «Editar tarefa»/«Eliminar» no telemóvel (o mínimo da
 *        casa é 44) e o «+» de cada dia do calendário no computador (o mínimo
 *        da WCAG 2.2 AA é 24).
 */

/**
 * ⚠ O SELO DE DESENVOLVIMENTO DO NEXT, OUTRA VEZ.
 *
 * O `next.config.ts` desliga-o (`devIndicators: false`) precisamente porque ele
 * é um botão fixo no canto inferior esquerdo — em cima da barra de navegação de
 * baixo do back office. No Next 16 essa opção já NÃO o tira: medido nesta
 * versão, o `<nextjs-portal>` continua a desenhar um `#devtools-indicator` de
 * 100×36 px em (20, 788) num ecrã de 390×844, e o Playwright recusa-se a clicar
 * o primeiro destino com «`<nextjs-portal>` intercepts pointer events».
 *
 * Estes passeios correm contra `next dev` (é o único servidor que grava, ver
 * `playwright.dados.config.ts`), e em produção o selo nunca existiu. Portanto
 * tira-se do caminho aqui — o que se mede continua a ser a página tal como ela
 * é servida.
 */
async function semSeloDeDesenvolvimento(page: Page) {
  await page.addInitScript(() => {
    const esconder = () => {
      const estilo = document.createElement("style");
      estilo.textContent = "nextjs-portal{display:none !important}";
      document.head.appendChild(estilo);
    };
    if (document.head) esconder();
    else document.addEventListener("DOMContentLoaded", esconder);
  });
}

test.beforeEach(async ({ page }) => {
  await semSeloDeDesenvolvimento(page);
});

/** O mínimo da casa, no dedo: `.alvo-toque` em `globals.css`. */
const ALVO_TACTIL_MIN = 44;
/** O mínimo da WCAG 2.2 AA (2.5.8 Target Size, Minimum), para o rato. */
const ALVO_RATO_MIN = 24;

/**
 * Quem está no CENTRO do alvo, e se esse ponto lhe pertence.
 *
 * Devolve também o nome de quem lá está — sem isso um vermelho diz «false» e
 * manda quem lê abrir o navegador para saber porquê.
 */
async function quemEstaNoCentro(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { existe: false as const };
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const noPonto = document.elementFromPoint(x, y);
    return {
      existe: true as const,
      meu: !!noPonto && (el === noPonto || el.contains(noPonto)),
      quem: noPonto
        ? `<${noPonto.tagName.toLowerCase()}> «${(noPonto.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}»`
        : "NADA (fora do ecrã)",
      caixa: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
      ponto: { x: Math.round(x), y: Math.round(y) },
      janela: { largura: window.innerWidth, altura: window.innerHeight },
      rolagemDaPagina: Math.round(window.scrollY),
    };
  }, seletor);
}

/**
 * Vai a um destino, esteja ele onde estiver.
 *
 * ── PORQUE É QUE ISTO PROCURA EM DOIS SÍTIOS ──────────────────────────────
 *
 * Havia uma coluna à esquerda com os onze destinos, e este ajudante procurava
 * lá. A coluna acabou: «a barra substitui o menu». Hoje os destinos vivem na
 * CÁPSULA que flutua em baixo — todos, no computador — e, no telemóvel, a
 * cápsula leva quatro e a GAVETA leva o resto.
 *
 * A troca de nomes que veio com isso é o que partiu este ajudante: «Navegação
 * do back office» passou a ser a barra, e a lista da gaveta passou a «Mais
 * destinos». Um passeio de telemóvel que abre a gaveta e depois pede «Temas» a
 * esta função ia procurá-lo na BARRA, onde ele nasce `hidden` abaixo de `lg` —
 * e ficava à espera de uma coisa invisível. Foi assim que os passeios D3 e D4
 * ficaram vermelhos.
 *
 * Procura-se nas duas e clica-se no que estiver VISÍVEL, que é o que a pessoa
 * faz. Assim o ajudante deixa de depender de qual das duas navegações tem o
 * destino a esta largura — que é precisamente a coisa que mudou e pode voltar
 * a mudar.
 */
async function irPara(page: Page, rotulo: RegExp | string) {
  const nav = page.getByRole("navigation", { name: /Navegação do back office|Mais destinos/i });
  // A coluna já não tem dobra nenhuma: os onze destinos estão todos à vista,
  // do outro lado de um fio. O que aqui estava era um `count()` — um
  // instantâneo, sem espera — e, quando a coluna ainda não tinha desenhado,
  // caía no ramo que abria o «Mais». Esse clique funcionava por acidente como
  // uma espera, e era isso que segurava o passeio. Sem a dobra, a corrida
  // ficou à vista: espera-se pelo DESTINO, que é o que se quer mesmo.
  const item = nav.getByRole("button", { name: rotulo }).locator("visible=true").first();
  await item.waitFor({ state: "visible", timeout: 30000 });
  await item.click();
}

/**
 * Rola a caixa que rola DENTRO do painel do pedido, até `fracao` do seu curso,
 * e devolve onde ficou.
 *
 * Procura-se a caixa a subir a partir do título do painel até dar com um
 * antepassado que ROLE MESMO — e não por classes. As classes deste painel já
 * mudaram uma vez por causa deste defeito, e um seletor por classe também
 * apanha a gaveta da navegação, que tem as mesmas (`overscroll-contain`,
 * `flex-1`) e mede zero no computador: o teste passava a rolar nada e a provar
 * nada.
 */
async function rolarOPainel(page: Page, fracao: number) {
  return page.evaluate((f) => {
    let caixa: HTMLElement | null = document.getElementById("detail-drawer-title");
    while (
      caixa &&
      !(
        caixa.scrollHeight > caixa.clientHeight + 4 &&
        /(auto|scroll)/.test(getComputedStyle(caixa).overflowY)
      )
    ) {
      caixa = caixa.parentElement;
    }
    if (!caixa) return null;
    caixa.scrollTop = (caixa.scrollHeight - caixa.clientHeight) * f;
    return {
      scrollTop: Math.round(caixa.scrollTop),
      curso: caixa.scrollHeight - caixa.clientHeight,
    };
  }, fracao);
}

// ═══════════════════════════════════════════════════════════════════ D1 ═════
/**
 * ── ABRIR O PAINEL DO PEDIDO, PELA PORTA QUE PASSOU A EXISTIR ───────────────
 *
 * Carregar num cliente na lista de Pedidos deixou de abrir o painel de
 * detalhe: leva ao ecrã de fazer a proposta, na página toda (palavras dela:
 * «não apenas ali de lado» — ver `irFazerAProposta` no `AdminClient.tsx`). O
 * painel — que é onde a barra de gravação vive, e é ela que estes casos medem
 * — ficou a uma tecla, no «Abrir o pedido» desse ecrã.
 */
async function abrirOPainelDoPedido(page: Page) {
  // Num ecrã estreito, desde 9/11, as portas do pedido vivem no «⋯» do
  // estúdio (seis botões soltos eram três linhas por cima dos passos). No
  // largo continuam à vista. Espera-se pelo estúdio e escolhe-se o caminho.
  const porta = page.getByRole("button", { name: /^Abrir o pedido$/ });
  const menu = page.getByRole("button", { name: /^Acções de / }).first();
  await expect(
    porta.or(menu).first(),
    "O ecrã de fazer proposta perdeu a porta de volta ao pedido.",
  ).toBeVisible({ timeout: 20_000 });
  if (await porta.isVisible()) {
    await porta.click();
    return;
  }
  await menu.click();
  await page.getByRole("menuitem", { name: /^Abrir o pedido$/ }).click();
}

test.describe("D1 · a barra de gravação do pedido", () => {
  // A medida mais comum de portátil, e aquela em que isto foi medido.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("«Guardar alterações» está no ecrã sem rolar a página", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);

    // Abrir o primeiro pedido da lista.
    await page.locator("table tbody tr").first().click();
    await abrirOPainelDoPedido(page);

    // A barra só existe quando há alguma coisa por guardar — é essa a regra do
    // painel. Escrever no Local é a alteração mais barata que a acorda.
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição");

    const guardar = page.getByRole("button", { name: /^Guardar alterações$/ });
    await expect(guardar).toBeVisible();

    // ── A prova ──────────────────────────────────────────────────────────
    // NÃO se rola nada antes de medir: a queixa é precisamente que o botão
    // nasce fora do ecrã, e quem abre um pedido não rolou nada ainda.
    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(onde.existe, "o botão de guardar não foi encontrado ao lado do estado da gravação").toBe(
      true,
    );
    expect(
      onde.meu,
      `no centro do botão «Guardar alterações» (${onde.ponto?.x},${onde.ponto?.y}) está ${onde.quem} — ` +
        `a caixa dele vai de ${onde.caixa?.top} a ${onde.caixa?.bottom} numa janela de ${onde.janela?.altura} px, ` +
        `com a página em ${onde.rolagemDaPagina} px de rolagem`,
    ).toBe(true);
  });

  test("e a gaveta rolada até ao fim mostra-a na mesma", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);
    await page.locator("table tbody tr").first().click();
    await abrirOPainelDoPedido(page);
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição II");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    // Quem rola a gaveta até bater no fim conclui — com toda a razão — que não
    // há mais nada por baixo. A barra tem de estar lá nesse momento.
    const fim = await rolarOPainel(page, 1);
    expect(fim, "não se encontrou a caixa que rola dentro do painel").not.toBeNull();

    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(
      onde.meu,
      `com a gaveta no fim, no centro do botão está ${onde.quem} (caixa ${onde.caixa?.top}→${onde.caixa?.bottom}, janela ${onde.janela?.altura})`,
    ).toBe(true);
  });

  /**
   * ── E A FAIXA DA BARRA DE DESTINOS NÃO LHE TOCA ──────────────────────────
   *
   * Os dois casos acima perguntam «quem está NAQUELE PONTO?». É a pergunta
   * certa para o rato, e foi ela que apanhou a barra do estúdio. Mas para ESTE
   * defeito ela é uma moeda ao ar, e isso ficou medido:
   *
   *   · a faixa da barra vai de 816 a 900 num ecrã de 900 (a cápsula que
   *     flutua lá dentro, de 816 a 888), e o «Guardar alterações» nascia de
   *     821 a 853 — DENTRO dela;
   *   · só que a cápsula mede o que o conteúdo dela mede, e o centro do botão
   *     cai a 1202 px. Nesta máquina a cápsula acaba a 1113 e o ponto escapa
   *     por 89 px; no CI, com outras larguras de letra, ela chega mais à
   *     direita e o ponto acerta. O mesmo código, o mesmo ecrã, dois
   *     resultados — e o vermelho só apareceu no CI.
   *
   * Portanto o que aqui se guarda não é um ponto: é que a CAIXA do botão não
   * entra na FAIXA da barra. Isso não depende de letras, nem de quantos
   * destinos a cápsula tem hoje, nem de a proposta ser comprida ou curta.
   *
   * A faixa que se mede é a da `<nav>` e não a da cápsula, de propósito: o topo
   * é o mesmo (816) e a LARGURA da cápsula é precisamente a coisa que varia de
   * máquina para máquina. Medir a `<nav>` é medir a linha por onde nada do que
   * se tem de tocar pode passar.
   *
   * Medido antes e depois da correcção, no mesmo 1440×900: a caixa do botão ia
   * de 798 a 830 com a faixa a começar em 816 (14 px por baixo dela); passou a
   * 730→762, com 54 px de ar. A conta está em `lib/orcamento/barra-de-destinos.ts`.
   */
  test("e a faixa da barra de destinos não lhe toca", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);
    await page.locator("table tbody tr").first().click();
    await abrirOPainelDoPedido(page);
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição IV");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    const medida = await page.evaluate(() => {
      const botao = document.querySelector("#estado-da-gravacao-do-pedido ~ button");
      const barra = document.querySelector('nav[aria-label="Navegação do back office"]');
      if (!botao || !barra) return null;
      const b = botao.getBoundingClientRect();
      const n = barra.getBoundingClientRect();
      return {
        botao: { top: Math.round(b.top), bottom: Math.round(b.bottom) },
        faixaDaBarra: { top: Math.round(n.top), bottom: Math.round(n.bottom) },
      };
    });
    expect(medida, "não se encontrou o botão de guardar ou a barra de destinos").not.toBeNull();

    expect(
      medida!.botao.bottom <= medida!.faixaDaBarra.top,
      `a caixa do «Guardar alterações» vai de ${medida!.botao.top} a ${medida!.botao.bottom} e a ` +
        `faixa da barra de destinos começa em ${medida!.faixaDaBarra.top} — o botão está debaixo ` +
        `dela, e um botão tapado não se distingue de um botão avariado`,
    ).toBe(true);
  });
});

test.describe("D1 · e ninguém se põe por cima dela", () => {
  // 1280×800: o outro portátil comum, e a medida onde isto se apanhou.
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * O painel tem MAIS do que uma barra colada ao fundo: o estúdio de propostas,
   * que vive dentro dele, traz a sua (z-20, `sticky bottom-0` a partir de `lg`).
   * Enquanto a barra de gravação também era `sticky bottom-0` DENTRO da caixa
   * que rola, as duas disputavam a mesma aresta e a do estúdio ganhava —
   * medido: a meio da rolagem, quem estava no centro do «Guardar alterações»
   * era `<div class="sticky bottom-[calc(56px+…)] z-20">`.
   *
   * Um botão tapado é tão inútil como um botão fora do ecrã, e este vermelho é
   * exactamente igual ao outro: `elementFromPoint` devolve outra coisa.
   */
  test("em nenhum ponto da rolagem outra barra lhe fica por cima", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);
    await page.locator("table tbody tr").first().click();
    await abrirOPainelDoPedido(page);
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição III");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    // De dez em dez por cento: o defeito não estava nos extremos — em cima e
    // no fim o botão estava à vista, e era do terço do meio até aos 90 % que a
    // barra do estúdio o tapava.
    for (let passo = 0; passo <= 10; passo += 1) {
      const fracao = passo / 10;
      const posicao = await rolarOPainel(page, fracao);
      expect(posicao, "não se encontrou a caixa que rola dentro do painel").not.toBeNull();

      const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
      expect(
        onde.meu,
        `com o painel rolado a ${posicao?.scrollTop} px de ${posicao?.curso} (${fracao * 100}%), ` +
          `no centro do botão está ${onde.quem}`,
      ).toBe(true);
    }
  });
});

test.describe("D1 · e no telemóvel continua bem", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a barra de gravação está dentro do ecrã", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .getByRole("button", { name: "Pedidos", exact: true })
      .click();
    await page.locator("li button, article button").first().click();
    await abrirOPainelDoPedido(page);
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição Móvel");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(onde.meu, `no telemóvel, no centro do botão está ${onde.quem}`).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════ D3 ═════
test.describe("D3 · alvos de 13 px", () => {
  test.describe("nas Tarefas, no telemóvel", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("«Editar tarefa» e «Eliminar» têm os 44 px da casa", async ({ page }) => {
      exigirLogin(await entrarNoBackOffice(page));
      // Uma tarefa por fazer — as duas acções só existem em cima de uma linha.
      const res = await page.request.post("/api/tarefas", {
        data: { title: "Tarefa da medição de geometria", priority: "normal" },
      });
      expect(res.ok(), `não foi possível semear a tarefa (${res.status()})`).toBe(true);
      await page.reload();

      await page.getByRole("button", { name: /Mais destinos/i }).click();
      await irPara(page, "Tarefas");

      /* ── AS DUAS ACÇÕES MUDARAM DE SÍTIO, E A PROVA MUDA COM ELAS ──────────
         Este passeio procurava os dois ícones soltos na linha. Deixaram de lá
         estar NO DEDO: a fila de ícones é `hidden com-rato:contents` e, sem
         rato, as duas acções vivem dentro do menu «⋯» (`MenuDeAccoes`).

         A razão está escrita no `Tarefas.tsx`: com seis acções por linha todas
         visíveis ao mesmo tempo, a 390 px não cabia nada — e «Eliminar»
         encostado a «Editar» é um engano à espera de acontecer.

         O que este teste prova NÃO muda: as duas acções têm de ser alcançáveis
         com o dedo e ter os 44 px da casa. Muda o caminho — abre-se o menu, e
         medem-se lá dentro. Se um dia voltarem para a linha, este teste falha e
         obriga a olhar, que é o que se quer dele. */
      await page
        .getByRole("button", { name: /^Acções de / })
        .first()
        .click();
      await expect(page.getByRole("menuitem", { name: "Editar tarefa" })).toBeVisible();
      /* ── MEDE-SE O MENU PARADO, NÃO A MEIO DA ENTRADA ──────────────────────
         O «⋯» passou a entrar com a mola da casa (`.bo-entrada-menu`, Fase 2):
         cresce de `--bo-escala-chegada` (0,97) até 1 em 325 ms. O
         `getBoundingClientRect` lê o rectângulo TRANSFORMADO, e medido a meio
         dava 44 × 0,97 ≈ 43 — um alvo que, parado, tem os seus 44. Espera-se
         que as animações do menu acabem, e só depois se mede o que fica. */
      await page
        .getByRole("menu")
        .evaluate((menu) =>
          Promise.all(menu.getAnimations({ subtree: true }).map((a) => a.finished)),
        );

      const alvos = await page.evaluate(() =>
        [
          // Dentro do menu o nome do item é o TEXTO (é assim que um leitor de
          // ecrã o anuncia); na linha, quando há rato, é o `aria-label` do
          // ícone. Aceitam-se os dois, e o rótulo lido é o que existir.
          ...document.querySelectorAll(
            '[role="menuitem"], button[aria-label="Editar tarefa"], button[aria-label="Eliminar"]',
          ),
        ]
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              rotulo: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
              largura: Math.round(r.width),
              altura: Math.round(r.height),
            };
          })
          .filter((a) => a.rotulo === "Editar tarefa" || a.rotulo === "Eliminar")
          // A fila de ícones da linha continua no DOM sem rato — vive dentro de
          // um `hidden com-rato:contents`, portanto está lá e mede 0×0. Medir um
          // elemento que não é desenhado é medir nada, e foi o que fez este
          // passeio falhar com «mede 0×0» depois de encontrar o item certo no
          // menu. Ficam os que o ecrã desenha; que os DOIS lá estejam é o que a
          // asserção a seguir garante.
          .filter((a) => a.largura > 0 && a.altura > 0),
      );

      expect(alvos.length, "não há linhas de tarefa para medir").toBeGreaterThan(0);
      // E as duas acções têm mesmo de estar alcançáveis — não basta uma delas
      // sobreviver. Sem isto, uma acção que desaparecesse do menu passava aqui
      // em silêncio, que é o defeito oposto ao que este ficheiro vigia.
      const rotulos = new Set(alvos.map((a) => a.rotulo));
      expect([...rotulos].sort(), "faltou uma das duas acções da linha de tarefa").toEqual([
        "Editar tarefa",
        "Eliminar",
      ]);
      // O dedo é grosso: sem isto, `(pointer: coarse)` não é verdade e a
      // medição é a do rato — que não é o que se está a provar.
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      for (const a of alvos) {
        expect(
          Math.min(a.largura, a.altura),
          `«${a.rotulo}» mede ${a.largura}×${a.altura} px (mínimo da casa: ${ALVO_TACTIL_MIN})`,
        ).toBeGreaterThanOrEqual(ALVO_TACTIL_MIN);
      }
    });
  });

  test.describe("no calendário, com rato", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("o «+» de cada dia tem os 24 px da WCAG 2.2 AA", async ({ page }) => {
      exigirLogin(await entrarNoBackOffice(page));
      await irPara(page, /^Calendário/);
      await expect(
        page.getByRole("button", { name: /^Adicionar a \d+ de / }).first(),
      ).toBeAttached();

      const alvos = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .filter((b) => /^Adicionar a \d+ de /.test(b.getAttribute("aria-label") ?? ""))
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              rotulo: b.getAttribute("aria-label") ?? "",
              largura: Math.round(r.width * 10) / 10,
              altura: Math.round(r.height * 10) / 10,
            };
          }),
      );

      expect(alvos.length, "não há dias no calendário para medir").toBeGreaterThan(20);
      const pequenos = alvos.filter((a) => a.largura < ALVO_RATO_MIN || a.altura < ALVO_RATO_MIN);
      expect(
        pequenos.length,
        `${pequenos.length} de ${alvos.length} dias com o «+» abaixo de ${ALVO_RATO_MIN} px — ` +
          `o primeiro é «${pequenos[0]?.rotulo}» a ${pequenos[0]?.largura}×${pequenos[0]?.altura}`,
      ).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════ D4 ═════
/**
 * A BARRA DE BAIXO EMPURRADA PARA FORA DO ECRÃ PELA BARRA DE FERRAMENTAS.
 *
 * Uma fila de controlos em `flex` sem `flex-wrap` não encolhe: pede a largura
 * que os filhos somam e alarga o DOCUMENTO inteiro atrás de si. Na Biblioteca
 * de Temas a fila do topo (Ordenar · Rever etiquetas · Compacto/Confortável ·
 * Novo tema) acabava em x=607 num ecrã de 390, o documento passava a medir 607,
 * e a navegação de baixo — que é `w-full` — nascia com 607 px de largura e o
 * topo em y=1257, 413 px abaixo do fundo do ecrã. Nessa vista ficava-se sem
 * navegação nenhuma.
 *
 * Mede-se o SINTOMA (a barra fora do ecrã, o documento mais largo do que o
 * ecrã) e diz-se qual é a fila culpada, porque é a fila que se corrige — não a
 * barra, que é vítima.
 */
test.describe("D4 · a barra de baixo na Biblioteca de Temas", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /**
   * TRÊS TEMAS, SENÃO NÃO HÁ BARRA DE FERRAMENTAS PARA MEDIR.
   *
   * Metade dos controlos desta fila só nasce com mais de dois temas (o
   * «Ordenar» e o Compacto/Confortável) — com a biblioteca vazia a fila cabe, e
   * o teste ficava verde sobre um ecrã que em uso real está partido. Os
   * `data/*.json` não são versionados, portanto numa clonagem limpa a
   * biblioteca ESTÁ vazia: quem precisa dos temas cria-os. Um 409 é o nome já
   * lá estar, que é o estado que se queria.
   */
  async function garantirTresTemas(page: Page) {
    for (const name of ["Geometria · Terracota", "Geometria · Oliveira", "Geometria · Linho"]) {
      const r = await page.request.post("/api/temas", { data: { name } });
      expect(
        [200, 409],
        `não foi possível semear o tema «${name}» (${r.status()}: ${await r.text()})`,
      ).toContain(r.status());
    }
  }

  test("a navegação de baixo continua no ecrã, e o documento não alarga", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirTresTemas(page);
    await page.getByRole("button", { name: /Mais destinos/i }).click();
    await irPara(page, /^Temas/);
    await expect(page.getByRole("button", { name: /^Novo tema$/ })).toBeVisible();
    // ⚠ A lista de temas chega por `fetch`, DEPOIS do primeiro desenho, e é ela
    // que traz metade da fila. Medir mal o «Novo tema» aparece era medir uma
    // barra de ferramentas a meio — foi o que fez esta rede passar sobre o
    // defeito à primeira tentativa.
    await expect(page.getByRole("group", { name: /Tamanho dos cartões/i })).toBeVisible();

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const barra = document.querySelector('nav[aria-label="Navegação do back office"]');
      const r = barra?.getBoundingClientRect() ?? null;
      // Qual é a fila culpada? A que NÃO QUEBRA e cujo lado direito já passou a
      // margem do ecrã. As mais fundas primeiro: a casca da página também passa
      // a margem, mas é vítima da fila que tem lá dentro — e é a fila que se
      // corrige. Sem este diagnóstico, um vermelho aqui só diz «607 ≠ 390».
      const fundura = (el: Element) => {
        let n = 0;
        for (let p = el.parentElement; p; p = p.parentElement) n += 1;
        return n;
      };
      const culpados = [...document.querySelectorAll("div,ul,nav,header,section,form")]
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (!cs.display.includes("flex") || cs.flexWrap !== "nowrap") return false;
          if (cs.overflowX === "auto" || cs.overflowX === "scroll") return false;
          return el.getBoundingClientRect().right > de.clientWidth + 1;
        })
        .sort((a, b) => fundura(b) - fundura(a))
        .map(
          (el) =>
            `«${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}» acaba em ` +
            `x=${Math.round(el.getBoundingClientRect().right)} — ${String(el.className).slice(0, 70)}`,
        );
      return {
        documento: de.scrollWidth,
        ecra: de.clientWidth,
        altura: window.innerHeight,
        barra: r
          ? { largura: Math.round(r.width), topo: Math.round(r.top), existe: true as const }
          : { existe: false as const },
        culpados: culpados.slice(0, 5),
      };
    });

    const porque = m.culpados.length
      ? `\nFilas sem \`flex-wrap\` a pedir mais do que têm:\n  ${m.culpados.join("\n  ")}`
      : "";

    expect(
      m.documento,
      `o documento mede ${m.documento} px num ecrã de ${m.ecra} — ` +
        `${m.documento - m.ecra} px de transbordo horizontal.${porque}`,
    ).toBeLessThanOrEqual(m.ecra);

    expect(m.barra.existe, "não há barra de navegação de baixo nesta vista").toBe(true);
    if (m.barra.existe) {
      expect(
        m.barra.topo,
        `a barra de baixo nasce a ${m.barra.topo} px do topo, num ecrã de ${m.altura} px — ` +
          `está desenhada FORA do ecrã.${porque}`,
      ).toBeLessThan(m.altura);
      expect(
        m.barra.largura,
        `a barra de baixo mede ${m.barra.largura} px num ecrã de ${m.ecra}.${porque}`,
      ).toBeLessThanOrEqual(m.ecra);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════ D5 ═════
/**
 * DUAS COLUNAS QUE NÃO EXISTEM PARA QUEM USA PORTÁTIL.
 *
 * A tabela de Pedidos mostra as colunas de contexto a partir dos 1440 px —
 * mas 1440 é a largura do ECRÃ, e a coluna da navegação come 336. Num portátil
 * de 1440×900 a tabela pedia 1537 px numa caixa de 1104 e o contentor tinha
 * `overflow: hidden`: «Pax» e «À espera» ficavam desenhadas do lado de lá do
 * corte, sem barra de rolagem, sem gesto, sem nada. Não é um defeito de
 * telemóvel — é o mais silencioso dos três, porque no ecrã não há sinal nenhum
 * de que falta ali qualquer coisa.
 *
 * O que se exige NÃO é que caiba: é que exista caminho. Ou a tabela cabe, ou o
 * contentor rola — e se rola, tem de rolar também para quem não tem rato
 * (`tabindex`), senão o caminho existe só para metade das pessoas.
 */
test.describe("D5 · as colunas escondidas da tabela de Pedidos", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /**
   * Um pedido COMPRIDO, senão não há o que medir.
   *
   * A largura de uma tabela é a do seu conteúdo: com três pedidos de nome curto
   * ela cabe, e o teste ficava verde sobre um ecrã que em produção — com nomes
   * de casal, emails a sério e quintas com morada por extenso — está partido. O
   * `submissionId` é fixo porque a rota é idempotente por ele: correr isto mil
   * vezes deixa UM pedido na lista.
   */
  async function garantirPedidoComprido(page: Page) {
    const res = await page.request.post("/api/orcamento", {
      data: {
        form: {
          name: "Maria da Conceição Gonçalves de Almeida e Sousa Vasconcelos",
          email: "maria.conceicao.vasconcelos.almeida@exemplo-muito-comprido.pt",
          phone: "912345678",
          category: "particulares",
          eventType: "casamentos",
          eventName: "Casamento",
          date: "2099-09-15",
          guests: 200,
          location: "Quinta do Vale das Amoreiras Velhas, Estrada Nacional 118, km 42, Loures",
        },
        website: "",
        submissionId: "e2e-geometria-tabela-larga",
      },
    });
    // Um 429 (tecto de pedidos por minuto) não é falha do que se está a medir
    // desde que o pedido já lá esteja de uma corrida anterior — e se não
    // estiver, a asserção da tabela a seguir diz-lo com números.
    if (res.ok()) await page.reload();
  }

  test("nenhuma coluna fica do lado de lá do corte", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedidoComprido(page);
    await irPara(page, /^Pedidos/);

    const tabela = page.getByRole("table", { name: /pedidos/i });
    await expect(tabela).toBeVisible();

    const m = await page.evaluate(() => {
      const t = document.querySelector("main table");
      if (!t) return null;
      let caixa: HTMLElement | null = t.parentElement;
      while (caixa && !/(auto|scroll)/.test(getComputedStyle(caixa).overflowX)) {
        // Uma caixa que CORTA (`hidden`/`clip`) não é caminho nenhum — mas é
        // ela que define o que se vê, por isso guarda-se a primeira que corte.
        if (/(hidden|clip)/.test(getComputedStyle(caixa).overflowX)) break;
        caixa = caixa.parentElement;
      }
      const cs = caixa ? getComputedStyle(caixa) : null;
      const colunas = [...t.querySelectorAll("th")].map((th) => ({
        rotulo: (th.textContent ?? "").replace(/[↕▲▼]/g, "").trim(),
        direita: Math.round(th.getBoundingClientRect().right),
      }));
      const antes = caixa?.scrollLeft ?? 0;
      if (caixa) caixa.scrollLeft = caixa.scrollWidth;
      const rolou = (caixa?.scrollLeft ?? 0) > antes;
      const ultimaDepois = colunas.length
        ? Math.round([...t.querySelectorAll("th")].at(-1)!.getBoundingClientRect().right)
        : 0;
      const caixaDireita = caixa ? Math.round(caixa.getBoundingClientRect().right) : 0;
      if (caixa) caixa.scrollLeft = antes;
      return {
        precisa: t.scrollWidth,
        cabe: caixa?.clientWidth ?? 0,
        overflowX: cs?.overflowX ?? "—",
        tabIndex: caixa?.tabIndex ?? -1,
        papel: caixa?.getAttribute("role") ?? "",
        colunas,
        rolou,
        ultimaDepois,
        caixaDireita,
      };
    });

    expect(m, "não há tabela de pedidos nesta largura").not.toBeNull();
    if (!m) return;

    const nomes = m.colunas.map((c) => c.rotulo);
    expect(nomes, `as colunas desenhadas são ${JSON.stringify(nomes)}`).toContain("Pax");
    expect(nomes).toContain("À espera");

    // SEMPRE, e não só quando o conteúdo desta corrida transborda: uma tabela
    // dentro de uma caixa que CORTA está a um nome comprido de perder colunas,
    // e o que a semente consegue pôr na lista depende do tecto de pedidos por
    // minuto. Um teste que só verificasse o caso do dia ficava verde no dia
    // seguinte com o defeito de volta.
    expect(
      m.overflowX,
      `a tabela pede ${m.precisa} px numa caixa de ${m.cabe} e o contentor está ` +
        `\`overflow-x: ${m.overflowX}\` — o que passar do corte não tem como ser alcançado`,
    ).toMatch(/auto|scroll/);

    if (m.precisa > m.cabe + 1) {
      expect(
        m.tabIndex,
        "o contentor rola mas não recebe foco — quem navega por teclado não consegue lá chegar " +
          "(WCAG 2.1.1: uma zona que rola tem de ser operável sem rato)",
      ).toBeGreaterThanOrEqual(0);
      expect(m.rolou, "o contentor diz que rola mas não rolou").toBe(true);
      expect(
        m.ultimaDepois,
        `depois de rolar até ao fim, a última coluna acaba em x=${m.ultimaDepois} e a caixa ` +
          `acaba em ${m.caixaDireita} — continua cortada`,
      ).toBeLessThanOrEqual(m.caixaDireita + 1);
    }
  });
});
