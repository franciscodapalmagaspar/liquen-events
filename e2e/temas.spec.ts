import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * Biblioteca de Temas — end-to-end walk of the whole feature, from the empty
 * form to the picker inside the proposal studio.
 *
 * A companion to admin-smoke / admin-views: those two only assert that the
 * "Temas" view MOUNTS. This one drives the flow the studio actually uses:
 *   1. create a theme in the back office (the real form, the real POST),
 *   2. see it listed on the themes grid,
 *   3. open it, and read the photo state HONESTLY — a theme whose folder can't
 *      be read says "Fotos indisponíveis", never "0 fotos",
 *   4. probe the upload route the way the browser does, and
 *   5. open the theme picker from a mood board in the proposal studio and see
 *      the theme we just made offered there.
 *
 * TWO ENVIRONMENT FACTS this spec is built around, instead of pretending they
 * don't exist:
 *
 *   · LOGIN may be unavailable — a production build with no ADMIN_PASSWORD_HASH
 *     refuses the dev password. Fora do CI o passeio salta-se por isso; no CI,
 *     onde o hash de teste ESTÁ definido, não entrar é avaria e falha (ver
 *     `exigirLogin`, em e2e/semear-pedido.ts).
 *
 *   · SUPABASE STORAGE is normally NOT configured (CI builds without it). The
 *     theme METADATA still works — the repository falls back to a JSON file in
 *     `data/` — so creating, listing, opening and renaming a theme all work.
 *     The PHOTOS don't: the upload route answers 503 "Armazenamento
 *     indisponível" and the listing answers `ok: false`, which the UI shows as
 *     "Fotos indisponíveis". So this spec asserts the honest either/or at each
 *     of those points: with Storage it must show a real (empty) folder, without
 *     it must show the temporary-failure wording — and never the two mixed up.
 *
 * It DOES write: it creates one theme (with a unique name, so parallel workers
 * and repeated local runs never collide) and deletes it at the end. Deleting
 * needs Storage to confirm the folder is clean, so without Supabase the cleanup
 * legitimately fails with 502 and the theme stays — accepted below, and
 * harmless in CI, which starts from a fresh checkout each run.
 */

// Console noise that is not a real defect: dev-only React hints, and network
// requests that legitimately fail in a data-less environment. The 503 is part
// of THIS spec's contract — with no Supabase configured the image routes are
// meant to answer "Armazenamento indisponível", and the browser logs the
// resource-load line for it. Everything else counts as a failure.
// Mirrors admin-smoke's allowlist, plus that one line.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /Failed to load resource: the server responded with a status of 503/i,
  // Recursos externos bloqueados pela rede onde o teste corre (sandboxes com
  // proxy de saída). É uma condição do ambiente, não um defeito da aplicação —
  // um erro lançado pelo nosso código continua a falhar o passeio.
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

/** Attach console-error / page-error collectors to a page. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isIgnored(text)) errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (err) => {
    if (!isIgnored(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

/** "Temas" vive do outro lado do fio, na coluna — à vista, sem dobra a abrir. */
async function openTemas(page: Page): Promise<void> {
  const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
  const temas = sidebar.getByRole("button", { name: /^Temas$/ }).first();
  await temas.waitFor({ state: "visible", timeout: 30000 });
  await temas.click();
  // The H1 confirms the lazy chunk mounted, not the skeleton.
  await expect(page.getByRole("heading", { level: 1, name: /^Temas$/ })).toBeVisible();
}

/** A name no other worker (or earlier local run) can be holding. */
function uniqueThemeName(): string {
  return `E2E ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Escape a generated name so it can be matched literally inside a RegExp. */
function literal(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

/** A real (tiny) JPEG, so the upload route sees a plausible file. */
const TINY_JPEG = Buffer.from(
  "/9j/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//" +
    "2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAA" +
    "RCAAEAAQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAA" +
    "AAAAAAAAAAAAAAAwT/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCiASnf/9k=",
  "base64",
);

test.describe("Biblioteca de Temas", () => {
  test("cria um tema, abre-o e escolhe-o a partir de um mood board", async ({ page }) => {
    const errors = collectErrors(page);

    exigirLogin(await entrarNoBackOffice(page));

    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });
    const themeName = uniqueThemeName();
    let themeId = "";

    try {
      // ── 1. Criar o tema ────────────────────────────────────────────────
      await openTemas(page);
      await page.getByRole("button", { name: /^Novo tema$/ }).click();
      await page.getByLabel(/Nome do tema/i).fill(themeName);
      await page.getByRole("button", { name: /^Criar tema$/ }).click();

      // Creating opens the theme straight away — that IS the flow (the team's
      // next move is always "carregar as fotos"), so the folder view, not the
      // grid, is what must appear. The one other legitimate outcome is an
      // installation the `db/schema.sql` never ran on: the route answers 503
      // with instructions instead of creating anything, and the screen says so.
      // That's an environment gap, not a regression — skip, don't fail.
      const addPhotos = page.getByRole("button", { name: /Adicionar fotos/i });
      // Duas instalações incompletas, ambas legítimas e ambas explicadas no
      // ecrã: a tabela por criar (falta correr o db/schema.sql) e a base de
      // dados nem sequer ligada (faltam as chaves do Supabase).
      //
      // ── PORQUE É QUE ISTO DEIXOU DE SER UM `skip` NO CI ────────────────
      // A frase de cima dizia «é o caso do CI». Era — enquanto este passeio
      // corria contra o build de produção, onde a aplicação RECUSA escrever
      // em vez de guardar num ficheiro efémero. Agora corre contra um servidor
      // de desenvolvimento (ver playwright.dados.config.ts), onde os metadados
      // dos temas TÊM armazém: o ficheiro `data/proposal-themes.json`. Ou seja,
      // no CI esta condição já não é uma lacuna do ambiente — é uma avaria, e
      // avarias falham. Fora do CI (onde a instalação pode mesmo estar
      // incompleta) continua a saltar, com a razão à vista.
      const notInstalled = page.getByText(
        /ainda não está criada na base de dados|base de dados não está ligada/i,
      );
      await expect(addPhotos.or(notInstalled).first()).toBeVisible();
      const indisponivel = (await notInstalled.count()) > 0;
      if (process.env.CI) {
        expect(
          indisponivel,
          "a Biblioteca de Temas diz-se indisponível — os metadados deviam gravar em ficheiro neste servidor",
        ).toBe(false);
      } else {
        test.skip(
          indisponivel,
          "Biblioteca de Temas indisponível nesta instalação (falta o db/schema.sql ou as chaves do Supabase).",
        );
      }
      await expect(addPhotos).toBeVisible();
      /*
       * ── ANCORADO AO NOME INTEIRO, E PORQUÊ ────────────────────────────
       * Com a vista dividida (fase 06 do documento dos Temas), o nome do
       * tema aberto passou a estar em DOIS sítios legítimos: a linha da
       * coluna da esquerda, cujo nome acessível é «<tema> 0 fotos», e o
       * título, que é o botão de renomear e se chama só «<tema>».
       *
       * O localizador sem âncora apanhava os dois e o Playwright recusava-se
       * a escolher — «strict mode violation», três vezes seguidas no CI.
       *
       * O que esta linha quer provar é que o ECRÃ DO TEMA abriu, e a prova
       * disso é o título. Ancora-se ao nome inteiro em vez de se enfraquecer
       * para `.first()`: com `.first()`, o dia em que o título desaparecesse
       * este passeio continuava verde por causa da coluna. É a mesma âncora
       * que a linha do cartão, mais abaixo, já usa.
       */
      await expect(
        page.getByRole("button", { name: new RegExp("^" + literal(themeName).source + "$") }),
      ).toBeVisible();
      await expect(errorBoundary).toHaveCount(0);

      // The id is needed to probe the routes below the way the browser does.
      const listed = await page.request.get("/api/temas");
      expect(listed.ok(), "GET /api/temas devia responder").toBe(true);
      const themes: { id: string; name: string }[] = await listed.json();
      themeId = themes.find((t) => t.name === themeName)?.id ?? "";
      expect(themeId, `o tema "${themeName}" devia estar na lista da API`).not.toBe("");

      // ── 2. Vê-lo listado ──────────────────────────────────────────────
      /*
       * ── A SAÍDA MUDOU DE SÍTIO COM O SPLIT VIEW ───────────────────────
       * Este passeio corre em Desktop Chrome, 1280 px — acima de `lg`. Aí o
       * «← Temas» está `lg:hidden` de propósito (Parte 6 do documento: no
       * split view ele desaparece), e o caminho de volta é o primeiro item da
       * coluna da esquerda, «Todos os temas». Ter os dois seriam duas saídas
       * com nomes diferentes para o mesmo sítio.
       *
       * ── E PORQUE É QUE ISTO CUSTOU DOIS MINUTOS A DIAGNOSTICAR ────────
       * Um `click()` espera pela visibilidade SEM limite próprio: fica preso
       * até ao tecto do passeio inteiro. Por isso a falha não aparecia aqui —
       * aparecia a cento e vinte segundos daqui, na limpeza do `finally`, a
       * dizer «apiRequestContext.delete: timeout» e a apontar para uma linha
       * que não tinha culpa nenhuma.
       */
      await page.getByRole("button", { name: /^Todos os temas$/ }).click();
      /* ── O NOME EXACTO, E NÃO «CONTÉM» ────────────────────────────────
         Este localizador era uma expressão que só pedia que o nome do tema
         aparecesse no rótulo, e passou a casar com DOIS botões: o cartão, que
         se chama pelo nome do tema, e o menu do cartão, que passou a
         anunciar-se «Acções de <tema>».

         O segundo é uma melhoria e não um defeito — um botão de menu que diz
         sobre o que age vale mais, para quem ouve o ecrã, do que um «Acções»
         solto. O que estava errado era a pergunta: «um botão cujo nome contém
         isto» deixou de identificar uma coisa só.

         `exact` também não serve: o cartão nunca se chamou só pelo nome — traz
         a seguir a contagem de fotografias e a data. O que os separa é o
         PRINCÍPIO: o cartão COMEÇA pelo nome do tema, o menu começa por
         «Acções de». Um `^` chega, e continua a ser uma pergunta sobre o
         cartão e não sobre «qualquer botão que fale neste tema». */
      const card = page.getByRole("button", { name: new RegExp("^" + literal(themeName).source) });
      await expect(card).toBeVisible();

      // ── 3. Abri-lo, e ler o estado das fotos sem mentir ───────────────
      await card.click();
      // O sinal de que a pasta abriu: o botão de carregar fotos do cabeçalho.
      // (Era o «Eliminar tema», que saiu do cabeçalho para o «⋯» — T3.)
      await expect(page.getByRole("button", { name: "Adicionar fotos" })).toBeVisible();

      // Which of the two truths applies is decided by the route itself, not by
      // guessing at the environment: `ok: false` means "a pasta não pôde ser
      // lida" (no Storage configured), `ok: true` means a real, empty folder.
      const imagesRes = await page.request.get(`/api/temas/${themeId}/imagens`);
      expect(imagesRes.status(), "a listagem de fotos responde sempre 200").toBe(200);
      const imagesBody: { ok: boolean; images: unknown[]; total: number } = await imagesRes.json();
      const storageUp = imagesBody.ok === true;

      if (storageUp) {
        // Tema acabado de criar: pasta legível e vazia.
        expect(imagesBody.images).toEqual([]);
        expect(imagesBody.total).toBe(0);
        await expect(page.getByText(/Arrasta para aqui as fotos deste tema/i)).toBeVisible();
      } else {
        // A falha de leitura tem de aparecer COMO falha — nunca como "0 fotos",
        // que a Catarina leria como "as minhas fotos desapareceram".
        await expect(
          page.getByText(/Não foi possível ler a pasta deste tema agora/i),
        ).toBeVisible();
        await expect(page.getByText(/Fotos indisponíveis/i).first()).toBeVisible();
      }
      await expect(errorBoundary).toHaveCount(0);

      // ── 4. O carregamento, tal como o navegador o faz ─────────────────
      // Sem Supabase isto é um 503 explicado (e não um 500 mudo, que mandava a
      // Catarina procurar um problema que não existe); com Supabase é um 200
      // com a foto guardada. Nada pelo meio.
      const upload = await page.request.post(`/api/temas/${themeId}/imagens`, {
        multipart: {
          files: { name: "e2e.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
          thumbs: { name: "e2e-thumb.jpg", mimeType: "image/jpeg", buffer: TINY_JPEG },
        },
      });
      if (storageUp) {
        expect(upload.status()).toBe(200);
        const body: { ok: boolean; images: { path: string }[] } = await upload.json();
        expect(body.ok).toBe(true);
        expect(body.images[0]?.path.startsWith(`${themeId}/`)).toBe(true);
      } else {
        expect(upload.status()).toBe(503);
        expect((await upload.json()).error).toMatch(/Armazenamento indisponível/i);
      }

      // ── 5. O seletor, a partir de um mood board ───────────────────────
      // O estúdio vive no Dossier do evento, e sem nenhum pedido na base não há
      // estúdio para abrir. Isto SALTAVA aqui — e saltar aqui é o pior sítio de
      // todos, porque as quatro pernas anteriores já tinham passado e o
      // relatório dizia «skipped», como se o passeio inteiro não se aplicasse.
      // Agora o pedido é criado.
      const quoteId = await garantirPedido(page);

      await page.goto(`/orcamento/admin/evento/${quoteId}`);
      await expect(page.getByText(/Estúdio de propostas \(PDF\)/i)).toBeVisible();

      // Mood boards só existem no modelo "Decoração" (o que abre por omissão) e
      // a proposta começa sem nenhum: criar um é o caminho normal.
      //
      // O clique INSISTE enquanto o mood board não aparecer, e a razão é
      // concreta: o dossier é servido já pintado, mas os manípulos só existem
      // depois de o React assumir a página. Um clique nessa janela não faz nada
      // e não deixa rasto — o passeio seguia e ficava pendurado à espera de um
      // botão que nunca ia nascer, até esgotar o tempo do teste. O `count()`
      // antes do clique é o que impede duas insistências criarem dois mood
      // boards.
      // Os mood boards vivem no 3.º dos cinco passos do estúdio (A2).
      // O clique no passo também insiste, pela mesma razão: antes de o React
      // assumir a página, o botão fica focado e o passo não muda.
      const passo3 = page
        .getByRole("navigation", { name: "Passos da proposta" })
        .getByRole("button", { name: /^3\s*Inspiração/ });
      // Sem mood boards, o botão é o do começo («Começar um mood board», 9/11);
      // com algum, o «+ Adicionar mood board» do fundo da lista.
      const adicionar = page
        .getByRole("button", { name: /Começar um mood board|\+ Adicionar mood board/i })
        .first();
      const escolher = page.getByRole("button", { name: /Escolher da biblioteca de temas/i });
      await expect(async () => {
        if (!(await adicionar.isVisible()) && (await escolher.count()) === 0) {
          await passo3.click({ timeout: 5_000 });
        }
        if ((await escolher.count()) === 0) await adicionar.click({ timeout: 5_000 });
        await expect(escolher.first()).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
      await escolher.first().click();

      const picker = page.getByRole("dialog", { name: /Escolher fotos da biblioteca de temas/i });
      await expect(picker).toBeVisible();

      // O tema criado há dois minutos está mesmo à escolha aqui — é isto que
      // fecha o circuito entre os dois ecrãs.
      const chip = picker.getByRole("button", { name: literal(themeName) });
      await expect(chip).toBeVisible();
      await chip.click();

      // E o mesmo either/or de cima, agora dentro do seletor.
      if (storageUp) {
        // A foto carregada no passo 4 está lá (ou, se o carregamento não tiver
        // sido feito, o tema aparece vazio — as duas frases são verdadeiras).
        await expect(
          picker
            .getByRole("button", { name: /^Foto 1 de/ })
            .or(picker.getByText(/Este tema ainda não tem fotos/i)),
        ).toBeVisible();
      } else {
        await expect(
          picker.getByText(/Não foi possível ler a pasta deste tema agora/i),
        ).toBeVisible();
      }

      await picker.getByRole("button", { name: /^Fechar$/ }).click();
      await expect(picker).toHaveCount(0);
      await expect(errorBoundary).toHaveCount(0);
    } finally {
      // Limpeza: o DELETE só apaga o tema depois de o Storage CONFIRMAR que a
      // pasta ficou limpa, por isso sem Supabase devolve 502 e o tema fica —
      // de propósito, para nunca deixar fotos órfãs. Aceitam-se os dois
      // resultados; o que não se aceita é um 500.
      if (themeId) {
        const del = await page.request.delete(`/api/temas/${themeId}`);
        expect([200, 502, 503]).toContain(del.status());
      }
    }

    // One consolidated assertion: nothing unexpected hit the console.
    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
