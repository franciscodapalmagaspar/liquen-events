import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, pedidoDoDia } from "./semear-pedido";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GUIÃO DO DIA, DE PONTA A PONTA — E AS QUATRO AVARIAS QUE ISTO GUARDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A suite de unidade prova as contas (`lib/orcamento/guioes.test.ts`) e prova a
 * vista com o servidor fingido (`Guioes.test.tsx`). Nenhuma das duas consegue
 * ver as quatro coisas que este passeio vê, e todas as quatro são silenciosas:
 *
 *  1. **O destino existe mesmo.** Uma `View` nova declara-se em quatro sítios —
 *     o tipo, o `Record<View, true>`, o `MORE_NAV` e o `NAV`. Só o primeiro é
 *     que o compilador exige em par com o segundo: acrescentar a vista e
 *     esquecer o `NAV` compila, passa nos testes de unidade, e deixa a vista
 *     sem porta nenhuma. Aqui clica-se no botão a sério.
 *
 *  2. **O chunk monta.** A vista é dividida (`splitView` em `lazy.tsx`) e
 *     esquecer o `warm`/`export` deixa um esqueleto para sempre. Um H1 visível é
 *     a prova de que o módulo chegou e montou.
 *
 *  3. **A gravação chega ao servidor e volta.** Juntar um modelo faz um PATCH
 *     com o guião inteiro e com a versão de que partiu; recarregar a página é a
 *     única maneira de provar que ficou GRAVADO e não só desenhado.
 *
 *  4. **A folha do dia imprime-se.** O `printRunSheet` abre uma janela e escreve
 *     HTML lá dentro. Se o pedido inteiro não tiver chegado — e nesta vista ele
 *     é lido à parte da lista —, a folha sai sem cronograma nenhum, com 200 e
 *     sem um único erro na consola. É o defeito mais caro possível: o papel que
 *     se entrega à equipa na manhã do evento, em branco.
 *
 * ── PORQUE É QUE ESTE PASSEIO CORRE À PARTE (playwright.dados.config.ts) ──
 *
 * Porque GRAVA. O `playwright.config.ts` arranca, em CI, o servidor de produção
 * (`npm run start`), e o `Repository` recusa toda a escrita em produção sem
 * Supabase (`assertWritableInProd`) — gravar para um ficheiro efémero seria
 * perder dados em silêncio no próximo deploy. Sem escrita não há pedido; sem
 * pedido não há guião. É a mesma razão, letra por letra, dos seis passeios que
 * já lá vivem.
 */

/** O modelo da casa que este passeio aplica. Ver `MODELOS_DA_CASA`. */
const MODELO = "Casamento de tarde";

test.describe("Timelines @guiao", () => {
  test("da lista à timeline gravada, e à folha que se imprime", async ({ page }) => {
    test.setTimeout(180_000);

    /**
     * A folha do dia manda `window.print()` 200 ms depois de carregar. Num
     * Chromium sem impressora isso trava a janela nova, e o passeio fica
     * pendurado numa caixa de diálogo que ninguém vê. Desligado ANTES de
     * qualquer navegação, e no contexto, para valer também na janela que a
     * folha abre.
     */
    await page.context().addInitScript(() => {
      window.print = () => {};
    });

    exigirLogin(await entrarNoBackOffice(page));
    // O pedido que se limpa e o que se abre têm de ser o mesmo, e nenhum nome
    // fixo serve para os casar — a razão inteira, com as duas tentativas
    // erradas que a precederam, está em `pedidoDoDia`.
    const { id: quoteId, naLista } = await pedidoDoDia(page);

    /**
     * ── O GUIÃO COMEÇA VAZIO, E ISSO É FIXTURE E NÃO ASSERÇÃO ──────────────
     *
     * A semente é reaproveitada entre corridas (é o que mantém a suite dentro
     * do tecto de pedidos por minuto), portanto o pedido chega aqui com o guião
     * que a corrida ANTERIOR lhe deixou. E juntar um modelo ACRESCENTA de
     * propósito — nenhum caminho desta vista destrói um guião —, pelo que a
     * segunda corrida ficava com dezasseis momentos e dois «09:00 Montagem».
     *
     * Isso não é um defeito do produto: é o passeio a partir de um estado que
     * ele não declarou. Limpa-se pela API, ANTES de abrir o ecrã, e a partir
     * daí tudo o que se afirma é sobre o que este passeio fez.
     */
    const limpou = await page.request.patch(`/api/orcamento/${quoteId}`, {
      data: { timeline: [] },
    });
    expect(limpou.ok(), "não foi possível esvaziar a timeline da semente").toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });

    // ── 1. O DESTINO EXISTE, E LEVA À VISTA ─────────────────────────────────
    // Insiste: contra `next dev`, o primeiro clique pode cair numa página ainda
    // por hidratar — não faz nada e não deixa rasto. Trocar de vista é
    // idempotente, portanto insistir não constrói nada a dobrar.
    await expect(async () => {
      await nav
        .getByRole("button", { name: /^Timelines$/ })
        .first()
        .click();
      await expect(page.getByRole("heading", { level: 1, name: /^Timelines$/ })).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 120_000 });

    // ── 2. A LISTA TRAZ O EVENTO SEMEADO ────────────────────────────────────
    //
    // ── PRIMEIRO, ALARGAR O ÂMBITO ────────────────────────────────────────
    // A lista abre nos eventos FECHADOS, que é o que ela pediu: «quero que dê
    // para fazer timelines apenas das propostas que já foram aceites». O
    // pedido que esta suite semeia entra pela porta pública e nasce
    // `pendente` — como qualquer pedido de um casal —, portanto não está lá.
    //
    // O toque em «Todos os eventos» é o que ela dá quando quer preparar um dia
    // que ainda não fechou, e é a outra metade do mesmo pedido dela: «aqui
    // quero que dê também para escolher aqueles que quero fazer um timeline».
    // Marcar a semente como aceite era mais curto e media menos: passava a
    // provar o caminho fácil e deixava este por provar.
    await page.getByRole("radio", { name: /^Todos os eventos/ }).click();

    // Pelo nome ACESSÍVEL da linha, que é o que uma pessoa com leitor de ecrã
    // ouve: a data, o cliente e o estado do guião.
    const linha = page.getByRole("button", { name: naLista }).first();
    await expect(linha, "o evento semeado não apareceu na lista de timelines").toBeVisible({
      timeout: 30_000,
    });

    // Sem `toPass` aqui, e é deliberado: o passo de cima já provou que a página
    // está hidratada (o clique na navegação fez efeito), portanto um clique que
    // não funcione neste ponto é um DEFEITO e tem de aparecer com a razão à
    // vista — insistir noventa segundos escondia-a atrás de um «timeout».
    await linha.click();
    await expect(
      page.getByText("Cronograma do Dia"),
      "abrir uma linha da lista devia montar a timeline daquele evento",
    ).toBeVisible({ timeout: 60_000 });

    // ── 3. CRIAR O GUIÃO A PARTIR DE UM MODELO ──────────────────────────────
    const escolherModelo = page.getByLabel("Juntar um modelo a esta timeline");
    await expect(escolherModelo).toBeVisible({ timeout: 30_000 });
    await escolherModelo.click();
    await page.getByRole("option", { name: MODELO }).click();

    /**
     * Os oito momentos do modelo entram no guião — e entram com FORMA.
     *
     * Procura-se pelo nome acessível do × de cada linha («Remover 09:00
     * Montagem…»), que é o único sítio onde a HORA e o TÍTULO aparecem juntos
     * num só nome: se o modelo perdesse as horas, ou as durações, este passo
     * continuava a encontrar o texto do título e não notava nada.
     */
    await expect(
      page.getByRole("button", { name: "Remover 09:00 Montagem e decoração do espaço" }),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Remover 17:00 Cerimónia" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Remover 02:00 Encerramento e desmontagem" }),
    ).toBeVisible();

    // A duração é a forma: sem ela não há «→ fim» nenhum, e a montagem das
    // 09:00 não sabia dizer que acaba às 12:00.
    await expect(page.getByText("→ 12:00")).toBeVisible();

    // O vazio da tarde é o que o cronograma-base tem de propósito, e VÊ-SE — na
    // banda entre os dois blocos, e não só na prosa em cima. Só o que se VÊ:
    // a mesma frase existe em `sr-only` para o leitor de ecrã, e desde que a
    // lista passou a cartões (14/10, sem a fita do dia) é essa a primeira que
    // aparece no documento.
    await expect(
      page
        .getByText(/3 h sem nada marcado/)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    // ── 4. MEXER NUM BLOCO, E O ECRÃ DIZER O QUE ISSO PROVOCA ───────────────
    // A receção passa de 1 h para 3 h: às 16:00 mais três horas são 19:00, e a
    // cerimónia das 17:00 e o cocktail das 18:30 passam a cair lá dentro. É
    // exactamente a pergunta «isto cabe?» a ser respondida com um «não».
    const duracaoDaRecepcao = page.getByLabel("Duração de Receção dos convidados");
    await expect(duracaoDaRecepcao).toBeVisible();
    await duracaoDaRecepcao.click();
    await page.getByRole("option", { name: "3 h", exact: true }).click();

    await expect(
      page.getByText(/correm .* ao mesmo tempo/).first(),
      "mudar a duração para 3 h devia pôr a receção em cima da cerimónia",
    ).toBeVisible({ timeout: 15_000 });

    // ── 5. FICOU GRAVADO, E NÃO SÓ DESENHADO ────────────────────────────────
    // Recarregar é a única prova. Sem o PATCH a chegar ao servidor, o guião
    // volta vazio e o ecrã volta a oferecer o cronograma-base.
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1, name: /^Timelines$/ })).toBeVisible({
      timeout: 60_000,
    });
    /* ── E O ÂMBITO VOLTA AO PRINCÍPIO, DE PROPÓSITO ──────────────────────
       Um recarregar traz a lista nos FECHADOS outra vez, que é o estado com
       que ela abre. A semente nasce `pendente`, portanto tem de se voltar a
       alargar o âmbito antes de a procurar — não é um defeito a contornar, é
       a mesma porta a ser aberta segunda vez.

       Guardar a escolha entre recarregamentos seria outra decisão, e não é
       esta que ela pediu: o que ela pediu foi PODER escolher. O filtro é da
       sessão de trabalho e não do dia, e um âmbito que se cola sozinho
       deixava-a a olhar para eventos que não fechou sem saber porquê.

       ── E ESPERA-SE PELA HIDRATAÇÃO ANTES DE TOCAR, QUE FOI O VERMELHO ────

       Isto passou aqui e falhou no CI, três vezes, sempre nesta linha. A razão
       está escrita no `AGENTS.md`: no `next dev` da 16.3.3 o cabeçalho passou a
       vir DESENHADO DO SERVIDOR, e por isso deixou de provar que a página está
       viva. O `<h1>Timelines</h1>` aparecia, o toque no «Todos os eventos»
       caía num rádio que ainda não tinha ouvinte nenhum, não acontecia NADA —
       sem erro, sem aviso — e a lista ficava nos fechados à espera de uma
       semente que nasce pendente.

       O sinal que serve é a classe `admin-mode` no `body` (o `data-admin-mode`
       é o irmão que vem do servidor e não serve). E o `toPass` à volta é a
       segunda rede: entre a classe aparecer e o React ligar o `onChange` há uma
       janela de fotogramas, e um toque perdido lá dentro é para repetir, não
       para reprovar a passagem. */
    await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
      timeout: 60_000,
    });

    const linhaDepois = page.getByRole("button", { name: naLista }).first();
    await expect(async () => {
      await page.getByRole("radio", { name: /^Todos os eventos/ }).click();
      await expect(linhaDepois).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await expect(
      linhaDepois,
      "a timeline gravada devia aparecer na lista com a sobreposição que ficou",
    ).toHaveAttribute("aria-label", /ao mesmo tempo/);

    // ── 6. A FOLHA DO DIA IMPRIME-SE, E VAI CHEIA ───────────────────────────
    await expect(async () => {
      await linhaDepois.click();
      await expect(page.getByText("Cronograma do Dia")).toBeVisible({ timeout: 8_000 });
    }).toPass({ timeout: 90_000 });

    const imprimir = page.getByRole("button", { name: /^Imprimir folha do dia/ });
    await expect(imprimir).toBeEnabled({ timeout: 30_000 });

    const [folha] = await Promise.all([page.waitForEvent("popup"), imprimir.click()]);
    await folha.waitForLoadState("domcontentloaded");
    const papel = await folha.locator("body").innerText();
    expect(papel, "a folha do dia saiu sem o cronograma").toContain("Cerimónia");
    expect(papel).toContain("Montagem e decoração do espaço");
    // A hora de FIM, que é metade da informação num papel de montagem: sem ela
    // a equipa lê oito instantes e não sabe o que se sobrepõe ao quê.
    expect(papel, "a folha do dia perdeu os intervalos").toMatch(/16:00\s*→\s*19:00/);
    await folha.close();
  });
});
