import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FLUXO DE CONVERSÃO DAS VARIANTES SOCIAIS, DENTRO DO BROWSER DA META
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas páginas existem para receber dinheiro gasto em anúncios. O que este
 * ficheiro prende não é a aparência — é que o caminho da conversão FUNCIONA no
 * contexto onde ela acontece: um iPhone em vertical, dentro do browser interno
 * do Instagram, com o armazenamento a poder estar bloqueado.
 *
 * ── O QUE ISTO É E O QUE NÃO É ─────────────────────────────────────────────
 * É Chromium com a cadeia de agente do Instagram, num ecrã de 390 px. NÃO é o
 * WKWebView do iPhone: os limites de memória e de JIT dessa máquina não se
 * reproduzem aqui, e o browser interno desenha ainda uma barra própria por
 * cima da página. O que se apanha aqui são os defeitos de código e de desenho;
 * os de plataforma não.
 *
 * As medições de velocidade estão noutro sítio, de propósito:
 * `node scripts/medir-social.mjs`, que estrangula rede e CPU. Um teste de
 * Playwright em integração contínua não é sítio para números de desempenho —
 * a máquina varia de corrida para corrida e o teste ou passa sempre ou falha
 * por causa da máquina.
 */

/** A cadeia real do browser interno do Instagram em iOS. */
const UA_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Mobile/15E148 Instagram 336.0.0.32.90 (iPhone14,3; iOS 17_5_1; " +
  "pt_PT; pt; scale=3.00; 1284x2778; 601334835)";

/**
 * O ecrã do iPhone, escrito à mão em vez de `devices["iPhone 13"]`.
 *
 * O descritor de dispositivo do Playwright traz `defaultBrowserType: "webkit"`,
 * e este ambiente só tem Chromium — com ele, os quinze testes falhavam todos
 * antes de abrir uma página, com "Executable doesn't exist … webkit". O que
 * interessa destes testes é a GEOMETRIA e o AGENTE, e esses declaram-se aqui.
 */
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: UA_INSTAGRAM,
  locale: "pt-PT",
});

/** Um `fbclid` como os que a Meta acrescenta aos URL dos anúncios. */
const FBCLID = "IwAR0TesteDeIntegracao_1234567890";

test.describe("variante social /s/comporta", () => {
  test("o primeiro ecrã tem uma frase, uma imagem e um botão, e nenhum menu", async ({ page }) => {
    await page.goto(`/s/comporta?fbclid=${FBCLID}&utm_source=ig`);

    // A frase.
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
    expect((await h1.textContent())?.length ?? 0).toBeGreaterThan(15);

    // A imagem de capa, com prioridade (é o que dá continuidade com o anúncio).
    await expect(page.locator("img").first()).toBeVisible();

    // O botão principal, VISÍVEL E ALCANÇÁVEL sem scroll.
    //
    // ⚠ A PRIMEIRA VERSÃO DESTE TESTE ERA INÚTIL. Verificava só que a caixa do
    // botão caía dentro da janela (`y < altura`) — e passava alegremente com o
    // botão INTEIRO tapado pelo banner de cookies, que era `bottom: 0` como
    // ele e com z-index maior. O defeito foi encontrado a olhar para uma
    // captura de ecrã; o teste que devia tê-lo apanhado deu verde.
    //
    // Agora pergunta-se o que interessa: quem está naquele ponto do ecrã? Se
    // a resposta não for o botão (ou algo dentro dele), há alguma coisa por
    // cima e o dedo da pessoa acerta nessa coisa, não no botão.
    const whatsapp = page.getByRole("link", { name: /whatsapp/i }).first();
    await expect(whatsapp).toBeVisible();
    const caixa = await whatsapp.boundingBox();
    expect(caixa, "o botão de WhatsApp não tem caixa").not.toBeNull();
    const noTopo = await page.evaluate(
      ([x, y]) => {
        const el = document.elementFromPoint(x, y);
        const a = el?.closest("a");
        return { href: a?.getAttribute("href") ?? "", tag: el?.tagName ?? "" };
      },
      [caixa!.x + caixa!.width / 2, caixa!.y + caixa!.height / 2],
    );
    expect(
      noTopo.href,
      `no centro do botão de WhatsApp está <${noTopo.tag}>, não o botão. ` +
        "Alguma coisa fixa está por cima dele — foi o banner de cookies, uma vez.",
    ).toContain("wa.me");

    // Menu nenhum: um menu é uma lista de sítios para onde a pessoa pode ir
    // que não são o formulário.
    await expect(page.locator("nav")).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^galeria$/i })).toHaveCount(0);
  });

  test("o banner de cookies assenta EM CIMA da barra, não sobre ela", async ({ page }) => {
    // Quem clica num anúncio nunca esteve no sítio, portanto vê SEMPRE o
    // banner. Se ele tapar a barra, a acção principal da página não existe
    // para ninguém. E a altura declarada em `barra.ts` tem de continuar a
    // bater certo com a que a barra desenha, ou volta a haver sobreposição.
    await page.goto("/s/comporta");
    // O banner só aparece depois de hidratar (é um `useEffect` a ler o
    // localStorage). Sem esta espera o teste media a página sem ele e passava
    // por vacuidade — que é precisamente o modo de falha que ele existe para
    // não ter.
    await expect(page.getByRole("region", { name: /cookie/i })).toBeVisible();
    const geometria = await page.evaluate(() => {
      const barra = document
        .querySelector('a[href^="https://wa.me"]')
        ?.closest("div[class*=fixed]");
      const banner = document.querySelector('[role=region][aria-label*="ookie"]');
      const b = barra?.getBoundingClientRect();
      const n = banner?.getBoundingClientRect();
      return {
        temBanner: !!n,
        alturaBarra: b ? Math.round(b.height) : 0,
        sobrepoem: !!(b && n) && n.bottom > b.top && n.top < b.bottom,
      };
    });
    expect(geometria.temBanner, "o banner de cookies não apareceu — o teste não prova nada").toBe(
      true,
    );
    expect(geometria.sobrepoem, "o banner de cookies tapa a barra fixa").toBe(false);
    // A altura declarada em `ALTURA_BARRA_FIXA_PX`. Uma diferença de dois
    // pixels é arredondamento; mais do que isso é a barra ter mudado de
    // tamanho sem ninguém actualizar a constante.
    expect(Math.abs(geometria.alturaBarra - 73)).toBeLessThanOrEqual(2);
  });

  test("não é indexável", async ({ page }) => {
    // A dona foi explícita: as páginas de campanha não podem competir com o
    // sítio na pesquisa orgânica.
    await page.goto("/s/comporta");
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute("content", /noindex/);
  });

  test("o CTA acompanha o scroll até ao fim da página", async ({ page }) => {
    await page.goto("/s/comporta");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const whatsapp = page.getByRole("link", { name: /whatsapp/i }).first();
    await expect(whatsapp).toBeInViewport();
  });

  test("a prova social aparece antes do formulário", async ({ page }) => {
    // Quem não te procurou pergunta "isto é real?" antes de qualquer outra
    // coisa. Se a prova cair para depois do formulário, a página perde a
    // ordem que a justifica.
    await page.goto("/s/comporta");
    const prova = page.locator('[role="img"][aria-label*="/5"]').first();
    const formulario = page.locator("form#pedido");
    const yProva = (await prova.boundingBox())?.y ?? Infinity;
    const yForm = (await formulario.boundingBox())?.y ?? -Infinity;
    expect(yProva).toBeLessThan(yForm);
  });

  test("o gancho B é uma página diferente, com outra frase", async ({ page }) => {
    await page.goto("/s/comporta");
    const a = await page.locator("h1").textContent();
    await page.goto("/s/comporta-b");
    const b = await page.locator("h1").textContent();
    expect(a).not.toBe(b);
  });

  test("guarda o fbclid do URL para o formulário o poder levar", async ({ page }) => {
    await page.goto(`/s/comporta?fbclid=${FBCLID}`);
    // Sem consentimento não há pixel nenhum — mas o `fbclid` fica na mesma no
    // dispositivo, porque é um parâmetro que a própria Meta pôs no URL.
    await expect
      .poll(async () => page.evaluate(() => localStorage.getItem("liquen-meta-click")))
      .toContain(FBCLID);
  });

  test("SEM consentimento não há pixel da Meta", async ({ page }) => {
    const paraAMeta: string[] = [];
    page.on("request", (r) => {
      if (/facebook\.(net|com)/.test(r.url())) paraAMeta.push(r.url());
    });
    await page.goto(`/s/comporta?fbclid=${FBCLID}`);
    await page.waitForTimeout(1500);
    expect(paraAMeta, `pediu à Meta sem consentimento: ${paraAMeta.join(", ")}`).toEqual([]);
  });
});

test.describe("o formulário de quatro campos", () => {
  /**
   * A mensagem de erro DO FORMULÁRIO.
   *
   * `getByRole("alert")` sozinho é ambíguo: o anunciador de rotas do Next
   * (`#__next-route-announcer__`) também tem `role="alert"`, e o teste falhava
   * com "strict mode violation" mesmo quando o erro certo estava desenhado.
   */
  const alerta = (page: Page) => page.locator("form#pedido [role=alert]");

  /** Preenche os quatro campos com valores válidos. */
  async function preencher(page: Page, contacto: string) {
    await page.locator("form#pedido input[name=data]").fill("2027-06-12");
    await page.locator("form#pedido input[name=local]").fill("Herdade de teste");
    await page.locator("form#pedido input[name=nome]").fill("Ana Teste");
    await page.locator("form#pedido input[name=contacto]").fill(contacto);
  }

  test("tem exactamente quatro campos, e nem um a mais", async ({ page }) => {
    await page.goto("/s/comporta");
    // `input:visible` daria CINCO: o campo-armadilha está fora do ecrã
    // (left:-9999px) mas não está `display:none`, e portanto conta como
    // visível para o Playwright. O que se quer contar é o que uma PESSOA
    // alcança, e isso é o que está na ordem de tabulação.
    const alcancaveis = page.locator("form#pedido input:visible:not([tabindex='-1'])");
    await expect(alcancaveis).toHaveCount(4);
    for (const nome of ["data", "local", "nome", "contacto"]) {
      await expect(page.locator(`form#pedido input[name=${nome}]`)).toBeVisible();
    }
  });

  test("recusa um contacto que não é telemóvel nem email, sem submeter", async ({ page }) => {
    await page.goto("/s/comporta");
    let submeteu = false;
    await page.route("**/api/orcamento", async (route) => {
      submeteu = true;
      await route.fulfill({ status: 200, body: JSON.stringify({ id: "X" }) });
    });
    await preencher(page, "abc");
    await page.locator("form#pedido button[type=submit]").click();
    await expect(alerta(page)).toBeVisible();
    expect(submeteu, "submeteu um pedido sem forma de responder").toBe(false);
  });

  test("um telemóvel vai como telefone e o email fica vazio", async ({ page }) => {
    await page.goto(`/s/comporta?fbclid=${FBCLID}`);
    let corpo: Record<string, unknown> | null = null;
    await page.route("**/api/orcamento", async (route) => {
      corpo = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "TESTE123", status: "ok" }),
      });
    });
    await preencher(page, "919 259 820");
    await page.locator("form#pedido button[type=submit]").click();
    await page.waitForURL(/orcamento\/confirmacao/);

    const form = (corpo as unknown as { form: Record<string, string> }).form;
    // Desde o #315 (30/10) o número segue no formato internacional (E.164):
    // é conferido com as regras de Portugal antes de sair, e é assim que fica
    // gravado.
    expect(form.phone).toBe("+351919259820");
    expect(form.email).toBe("");
    expect(form.eventType).toBe("casamentos");
    expect(form.location).toBe("Herdade de teste");
    // O contexto diz QUE variante produziu o pedido — sem isto, testar uma
    // página nova não tem resposta ao fim de duas semanas.
    expect(form.notes).toContain("s/comporta");
    // E o `event_id` do `Lead`, para o servidor reenviar pela CAPI sem
    // duplicar a conversão.
    expect(String(form.leadEventId).length).toBeGreaterThanOrEqual(8);
  });

  test("um email vai como email e o telefone fica vazio", async ({ page }) => {
    await page.goto("/s/comporta");
    let corpo: Record<string, unknown> | null = null;
    await page.route("**/api/orcamento", async (route) => {
      corpo = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "TESTE124", status: "ok" }),
      });
    });
    await preencher(page, "ana@exemplo.pt");
    await page.locator("form#pedido button[type=submit]").click();
    await page.waitForURL(/orcamento\/confirmacao/);
    const form = (corpo as unknown as { form: Record<string, string> }).form;
    expect(form.email).toBe("ana@exemplo.pt");
    expect(form.phone).toBe("");
  });

  test("com o armazenamento bloqueado, o formulário submete à mesma", async ({ page }) => {
    // É o caso normal no browser interno em contexto particionado. O pedido de
    // orçamento é a conversão principal: pode perder a atribuição, nunca o lead.
    await page.addInitScript(() => {
      const explodir = () => {
        throw new DOMException("bloqueado", "SecurityError");
      };
      for (const nome of ["localStorage", "sessionStorage"]) {
        Object.defineProperty(window, nome, {
          configurable: true,
          get: () => ({
            getItem: explodir,
            setItem: explodir,
            removeItem: explodir,
            clear: explodir,
          }),
        });
      }
    });
    await page.goto("/s/comporta");
    let submeteu = false;
    await page.route("**/api/orcamento", async (route) => {
      submeteu = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "TESTE125", status: "ok" }),
      });
    });
    await preencher(page, "919259820");
    await page.locator("form#pedido button[type=submit]").click();
    await expect.poll(() => submeteu).toBe(true);
  });

  test("uma rede que nunca responde não deixa o botão a rodar para sempre", async ({ page }) => {
    await page.goto("/s/comporta");
    await page.route("**/api/orcamento", async (route) => {
      await route.fulfill({ status: 500, body: "{}" });
    });
    await preencher(page, "919259820");
    await page.locator("form#pedido button[type=submit]").click();
    await expect(alerta(page)).toBeVisible();
    // E o botão volta a estar utilizável, para a pessoa poder tentar de novo.
    await expect(page.locator("form#pedido button[type=submit]")).toBeEnabled();
  });
});

test.describe("browser do Facebook", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;" +
      "FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/pt_PT;FBOP/5]",
  });

  test("a página desenha-se igual e sem erros de consola", async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e.message)));
    await page.goto("/s/alentejo");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByRole("link", { name: /whatsapp/i }).first()).toBeVisible();
    expect(erros, erros.join(" | ")).toEqual([]);
  });
});

test.describe("a variante internacional", () => {
  test("responde em inglês", async ({ page }) => {
    const emIngles = await page.goto("/en/s/portugal");
    expect(emIngles?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
  });

  test("não existe em português", async ({ browser }) => {
    // Uma versão portuguesa desta página seria a página nacional outra vez,
    // com outro URL — duas páginas a dizer o mesmo repartem o sinal.
    //
    // CONTEXTO NOVO, de propósito. Na mesma sessão do teste anterior isto
    // dava 200, e não por defeito nenhum: visitar `/en/…` grava o cookie
    // `liquen-lang=en`, e a partir daí o proxy reescreve os caminhos nus para
    // o espelho inglês — que é exactamente o comportamento correcto para quem
    // está a navegar em inglês. O teste é que estava a medir outra coisa.
    const contexto = await browser.newContext({ userAgent: UA_INSTAGRAM, locale: "pt-PT" });
    try {
      const pagina = await contexto.newPage();
      const resposta = await pagina.goto("/s/portugal");
      expect(resposta?.status()).toBe(404);
    } finally {
      await contexto.close();
    }
  });
});
