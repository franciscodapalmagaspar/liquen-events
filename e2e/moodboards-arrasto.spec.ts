import { test, expect, devices, type Page } from "@playwright/test";
import { entrarNoBackOffice, garantirPedidoProprio } from "./semear-pedido";

/**
 * O ARRASTO DOS MOOD BOARDS, PELO TECLADO.
 *
 * ── Porque pelo teclado e não pelo rato ─────────────────────────────────────
 * O `dnd-kit` tem três sensores, e só um deles é determinista num teste. O do
 * rato exige uma sequência de `mousemove` com distâncias e tempos que dependem
 * do sítio exacto onde o browser desenhou as células — e, com uma grelha que se
 * reorganiza a meio do gesto, o alvo move-se debaixo do ponteiro. Um teste
 * assim passa nesta máquina e falha na do CI por causa de dois pixéis.
 *
 * O sensor de TECLADO não tem nada disso: Espaço agarra, as setas movem uma
 * posição de cada vez, Espaço larga. É o mesmo código de reordenação — o
 * `onDragEnd` que chama `reordenarFotos` e `moverBoardParaPosicao` é um só, e
 * não sabe por que sensor lhe chegou o gesto. Ao prendê-lo pelo teclado prende-
 * se o arrasto todo, e de caminho prende-se a acessibilidade: se a pega deixar
 * de ser focável, ou perder o `aria-label`, este teste cai.
 *
 * ── O que é preciso para isto sequer abrir ──────────────────────────────────
 * Um rascunho semeado no `localStorage`, porque montar oito boards a clicar
 * demoraria mais do que o passeio inteiro. Isso esteve muito tempo a não
 * funcionar: o estúdio abria com 0 boards com o rascunho lá dentro e a chave
 * certa. A causa está escrita no `ProposalStudio.tsx`, em «CORRE UMA VEZ SÓ» —
 * o efeito de restauro corria duas vezes em desenvolvimento e a segunda lia o
 * documento vazio que a gravação automática tinha entretanto escrito por cima.
 * Esta suite corre contra o servidor de DESENVOLVIMENTO (ver
 * `playwright.propostas.config.ts`), que é precisamente onde isso acontecia.
 */

const NOME_A = "Board Um";
const NOME_B = "Board Dois";

async function login(page: Page): Promise<boolean> {
  // Pelo ajudante partilhado: com a sessão guardada pelo
  // `sessao-admin.setup.ts` ele encontra o painel aberto e não gasta entrada
  // nenhuma no tecto de oito por minuto. Sem sessão — uma máquina sem
  // `ADMIN_PASSWORD_HASH` — enche o formulário como sempre encheu.
  //
  // As cinco cópias à mão que aqui estavam esperavam por um «Painel de Gestão»
  // que deixa de aparecer assim que há sessão, e cada uma delas entrava outra
  // vez: era essa repetição que trancava a suite à porta a meio da passagem.
  return entrarNoBackOffice(page);
}

/**
 * Semeia o rascunho ANTES de a página abrir.
 *
 * `addInitScript` e não um `evaluate` depois do `goto`: o restauro corre na
 * montagem do estúdio, e escrever depois disso seria escrever tarde de mais.
 *
 * A chave é a mesma que o `ProposalStudio` calcula — `liquen-proposal-studio-`
 * mais o id que o `POST /api/orcamento` devolveu. Vale a pena dizer que estes
 * dois foram comparados a sério, imprimindo um e outro: batem certo. Quando o
 * estúdio abria vazio, não era por a chave estar errada.
 */
async function semearRascunho(page: Page, quoteId: string): Promise<void> {
  await page.addInitScript(
    ([id, a, b]) => {
      localStorage.setItem("liquen-admin-view", "fazer-proposta");
      localStorage.setItem(
        `liquen-proposal-studio-${id}`,
        JSON.stringify({
          template: "decoracao",
          moodBoards: [
            {
              id: "board-a",
              title: a,
              layout: "mosaico",
              images: ["fotos/um.jpg", "fotos/dois.jpg", "fotos/tres.jpg"],
            },
            { id: "board-b", title: b, layout: "mosaico", images: ["fotos/quatro.jpg"] },
          ],
          coverImages: ["", ""],
        }),
      );
      // O carimbo: sem ele o rascunho do servidor (que não existe) e o local
      // ficam empatados, e o estúdio prefere o do servidor.
      localStorage.setItem(`liquen-proposal-studio-${id}:at`, String(Date.now()));
    },
    [quoteId, NOME_A, NOME_B],
  );
}

async function abrirEstudio(page: Page, nomeCliente: string): Promise<void> {
  /**
   * ── A SECÇÃO PEDE-SE PELO ENDEREÇO, E NÃO PELO `localStorage` ─────────────
   *
   * Era assim: semeava-se `liquen-admin-view` e esperava-se que o back office
   * restaurasse a secção. Com o Next 16.3.3 deixou de funcionar, e MEDIDO no
   * percurso dela — abrir «Fazer proposta», sair, voltar ao endereço limpo:
   *
   *     produção ............ T+0 Visão Geral · T+2,5s FAZER PROPOSTA  ✔
   *     next dev (16.3.3) ... T+0 Visão Geral · T+2,5s Visão Geral     ✘
   *                           e o cookie dela foi reescrito para «overview»
   *
   * O produto está bom: ela reabre o back office e volta à secção onde estava.
   * É o servidor de DESENVOLVIMENTO que a perde — e esta suite corre contra ele
   * porque precisa de GRAVAR (ver playwright.propostas.config.ts).
   *
   * Passa a pedir-se a secção pelo `?v=`, que é o caminho PÚBLICO e documentado
   * («isto vai parar a favoritos e a mensagens: "abre-me isto"», em
   * AdminClient.tsx) e que o SERVIDOR resolve — o cabeçalho já vem desenhado no
   * primeiro fotograma, medido. Não se afrouxa nada: chega-se à mesma secção
   * pela porta da frente, e some a corrida que o comentário aqui em cima já
   * descrevia («um clique na navegação feito logo a seguir ao carregamento é
   * desfeito pelo efeito que restaura a vista»).
   */
  await page.goto("/orcamento/admin?v=fazer-proposta");

  /**
   * ── E ESPERA-SE QUE O JAVASCRIPT PEGUE, QUE ANTES ERA DE GRAÇA ───────────
   *
   * Com o `?v=`, o cabeçalho «Fazer proposta» passa a vir DESENHADO PELO
   * SERVIDOR — aparece no primeiro fotograma. É bom para ela e é uma armadilha
   * para o teste: esperar por ele deixou de provar que a página está viva.
   * Medido, foi exactamente o que aconteceu — o clique no cartão do cliente
   * caiu numa página por hidratar, não fez NADA e não deixou rasto, e o
   * relatório acusou o estúdio de não abrir.
   *
   * Antes isto era de graça: o cabeçalho só existia depois de a aplicação
   * trocar de secção no cliente, ou seja, depois de hidratar. Agora pede-se o
   * sinal a sério — a classe `admin-mode`, que o `layout.tsx` do back office põe
   * no `body` DENTRO de um `useEffect` (o `data-admin-mode` é o irmão dela que
   * vem do servidor, e por isso não serve aqui).
   */
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), undefined, {
    timeout: 30_000,
  });

  await expect(page.getByRole("heading", { name: /^Fazer proposta$/ })).toBeVisible({
    timeout: 20000,
  });
  // `:visible` não é cosmético: a vista "Pedidos" fica montada por baixo com um
  // cartão para o MESMO pedido, e o seletor apanhava esse.
  await page
    .locator("main button:visible")
    .filter({ hasText: nomeCliente })
    .first()
    .click({ timeout: 20000 });
  await expect(page.getByText(/Estúdio de propostas/i).first()).toBeVisible({ timeout: 20000 });

  // Desde a A2 os mood boards vivem no 3.º dos cinco passos, e o estúdio abre
  // no 1.º. O clique INSISTE até aparecer a primeira pega: antes de o React
  // assumir a página, o botão do passo fica focado e o passo não muda.
  const passo3 = page
    .getByRole("navigation", { name: "Passos da proposta" })
    .getByRole("button", { name: /^3\s*Inspiração/ });
  const pega = page.getByRole("button", { name: /^Arrastar a fotografia \d+$/ }).first();
  await expect(async () => {
    if (!(await pega.isVisible())) await passo3.click({ timeout: 5_000 });
    await expect(pega, "as fotos do mood board, no passo 3").toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}

/**
 * Esperar que o estúdio PARE de se redesenhar antes de lhe tocar.
 *
 * No primeiro segundo depois de abrir há três coisas a acontecer sozinhas: o
 * restauro do rascunho, a hidratação dos endereços das fotos e o resgate para
 * o servidor. Cada uma delas volta a desenhar a grelha — e um botão que o
 * React volta a criar é um botão que perdeu o foco. O gesto ia todo para o
 * `body`: o Espaço não agarrava nada, a seta não movia nada, e o teste falhava
 * a dizer «a foto não mudou de sítio», que é verdade e não explica nada.
 *
 * O indicador de gravação é o sinal honesto de que a agitação acabou: passa de
 * «a guardar…» a «guardado às HH:MM» quando a primeira gravação assentou.
 *
 * `toBeAttached` e não `toBeVisible`: no telemóvel a hora leva um `hidden
 * sm:inline` e só o ícone fica à vista. O que aqui se quer saber é se a
 * gravação aconteceu, não se ela cabe no ecrã.
 */
async function esperarAssentar(page: Page): Promise<void> {
  await expect(page.getByText(/guardado às \d{1,2}:\d{2}/i).first()).toBeAttached({
    timeout: 30_000,
  });
}

/** O que está gravado neste momento, que é a verdade que sobrevive ao recarregar. */
async function rascunhoGravado(page: Page, quoteId: string) {
  const cru = await page.evaluate(
    (chave) => localStorage.getItem(chave),
    `liquen-proposal-studio-${quoteId}`,
  );
  return JSON.parse(cru ?? "{}") as {
    moodBoards?: { title?: string; images?: string[] }[];
  };
}

/**
 * O que o `dnd-kit` está a anunciar a quem ouve o ecrã.
 *
 * É a única fonte que diz, sem adivinhar pixéis, sobre QUEM é que o item
 * agarrado está pousado: «Draggable item foto:0:0 was moved over droppable
 * area foto:0:1.» Serve o teste e, ao servi-lo, prende também o anúncio — que
 * é a forma como este arrasto existe para quem não vê a grelha.
 */
async function anuncio(page: Page): Promise<string> {
  const textos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[role=status],[aria-live]"))
      .map((n) => n.textContent ?? "")
      .filter((t) => t.includes("Draggable item")),
  );
  return textos[0] ?? "";
}

/**
 * Agarra a pega, caminha até ao alvo e larga.
 *
 * ── Porque não «uma seta e pronto» ─────────────────────────────────────────
 * Porque a seta certa depende do desenho. As fotos vivem numa grelha
 * (`rectSortingStrategy`): no computador o vizinho seguinte está à DIREITA, no
 * telemóvel — onde a grelha tem menos colunas — pode estar ABAIXO. Um teste
 * que fixasse `ArrowRight` estaria a prender a largura do ecrã, não o arrasto.
 *
 * Então dizemos para ONDE se quer ir (`alvo`, o identificador do `dnd-kit`) e
 * tentam-se as setas até o anúncio confirmar que se chegou lá. Se nenhuma lá
 * chegar, o teste falha a dizer onde ficou — e não «a foto não mudou de sítio».
 */
async function arrastarComTeclado(
  page: Page,
  rotuloDaPega: string,
  alvo: string,
  setas: string[],
  dentroDe?: string,
) {
  const ambito = dentroDe ? page.locator(dentroDe) : page;
  const pega = ambito.getByRole("button", { name: rotuloDaPega, exact: true });
  await pega.scrollIntoViewIfNeeded();
  await pega.focus();
  // O foco tem de estar MESMO na pega quando o Espaço parte. Se um redesenho o
  // levou, é melhor dizê-lo aqui do que deixar o teste falhar três linhas
  // abaixo com a queixa errada.
  await expect(pega).toBeFocused();

  // A pausa não é superstição: o sensor de teclado do `dnd-kit` MEDE as caixas
  // no instante em que o Espaço agarra, e é dessa medição que a seta seguinte
  // se serve para saber quem é o vizinho. Encadeadas sem intervalo, a seta
  // chega antes da medição e o gesto acaba onde começou.
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);
  expect(await anuncio(page), "o Espaço agarrou a fotografia").toContain("was moved over");

  // Cada seta parte de ONDE SE ESTÁ, e não do princípio: uma seta que erre o
  // alvo deixa o item noutro sítio, e a seguinte já não está a fazer a pergunta
  // que julgávamos. Por isso desfaz-se cada tentativa falhada antes da próxima
  // — assim as candidatas são todas medidas a partir da mesma casa.
  const inversa: Record<string, string> = {
    ArrowRight: "ArrowLeft",
    ArrowLeft: "ArrowRight",
    ArrowDown: "ArrowUp",
    ArrowUp: "ArrowDown",
  };
  let chegou = false;
  for (const seta of setas) {
    await page.keyboard.press(seta);
    await page.waitForTimeout(300);
    if ((await anuncio(page)).includes(`droppable area ${alvo}.`)) {
      chegou = true;
      break;
    }
    await page.keyboard.press(inversa[seta]);
    await page.waitForTimeout(300);
  }
  expect(chegou, `chegou a ${alvo} (o anúncio diz: ${await anuncio(page)})`).toBe(true);

  await page.keyboard.press("Space");
}

for (const { titulo, viewport } of [
  { titulo: "no computador", viewport: undefined },
  { titulo: "no telemóvel", viewport: devices["Pixel 7"].viewport },
]) {
  test.describe(`Arrastar mood boards ${titulo} @propostas`, () => {
    test.skip(({ browserName }) => browserName !== "chromium", "um browser chega para isto");

    test.beforeEach(async ({ page }) => {
      if (viewport) await page.setViewportSize(viewport);
    });

    test("reordena as fotos dentro de um board, e o board na lista", async ({ page }) => {
      test.setTimeout(120_000);
      const entrou = await login(page);
      test.skip(!entrou, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");

      // Um pedido SÓ deste passeio, um por tamanho, criado uma vez e reaproveitado:
      // criar um novo em cada corrida gastava o tecto de cinco pedidos por minuto
      // do formulário público, e a 17/11 (lote de 18/11) o POST veio recusado nas
      // três tentativas. O rascunho é semeado de novo a cada corrida.
      const nome = `Arrasto E2E ${titulo}`;
      const quoteId = await garantirPedidoProprio(page, {
        nome,
        submissionId: `e2e-arrasto-${viewport ? "telemovel" : "computador"}`,
      });
      await semearRascunho(page, quoteId);
      await abrirEstudio(page, nome);

      // ── O rascunho abriu mesmo ────────────────────────────────────────
      // Antes de medir gesto nenhum: se isto falhar, o que falhou foi o
      // restauro, e é isso que se quer ler no relatório — não «a foto não
      // mudou de sítio».
      const pegasDeFoto = page.getByRole("button", { name: /^Arrastar a fotografia \d+$/ });
      await expect(pegasDeFoto.first()).toBeVisible({ timeout: 20_000 });
      await esperarAssentar(page);
      expect(
        (await rascunhoGravado(page, quoteId)).moodBoards?.[0]?.images,
        "o rascunho semeado abriu com as três fotos",
      ).toEqual(["fotos/um.jpg", "fotos/dois.jpg", "fotos/tres.jpg"]);

      // ── DENTRO DE UM BOARD ────────────────────────────────────────────
      // A primeira foto passa para segundo lugar. Uma seta = uma posição.
      // `#mood-board-0` porque a pega diz o número da foto DENTRO do board, e
      // os dois boards têm ambos uma «fotografia 1».
      await arrastarComTeclado(
        page,
        "Arrastar a fotografia 1",
        "foto:0:1",
        ["ArrowRight", "ArrowDown"],
        "#mood-board-0",
      );

      await expect
        .poll(async () => (await rascunhoGravado(page, quoteId)).moodBoards?.[0]?.images, {
          timeout: 15_000,
          message: "a ordem das fotos ficou gravada",
        })
        .toEqual(["fotos/dois.jpg", "fotos/um.jpg", "fotos/tres.jpg"]);

      // ── OS BOARDS ENTRE SI ────────────────────────────────────────────
      // O segundo board sobe ao topo — o gesto que antes custava sete cliques
      // na seta ↑ (ver MOODBOARDS.md).
      // Depois de uma gravação o estúdio volta a desenhar-se; esperar outra vez
      // que assente antes de lhe pedir o segundo gesto.
      await esperarAssentar(page);
      await arrastarComTeclado(page, "Arrastar o mood board 2", "board:0", [
        "ArrowUp",
        "ArrowLeft",
      ]);

      await expect
        .poll(async () => (await rascunhoGravado(page, quoteId)).moodBoards?.map((b) => b.title), {
          timeout: 15_000,
          message: "a ordem dos boards ficou gravada",
        })
        .toEqual([NOME_B, NOME_A]);
    });
  });
}
