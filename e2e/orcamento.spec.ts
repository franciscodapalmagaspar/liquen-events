import { test, expect, type Page } from "@playwright/test";

/**
 * Drives the quote request form (the site's main conversion path) end to end.
 * The POST to /api/orcamento is intercepted so the test is deterministic and
 * sends no real email/push — same approach as the contacto spec.
 */

/**
 * Preenche TUDO o que o formulário exige hoje.
 *
 * Cresceu: além dos campos de texto, um casamento passou a pedir o tipo de
 * cerimónia e se o espaço é interior ou exterior — dois grupos de botões que
 * este ajudante não conhecia, e por isso o envio era recusado com «Todos os
 * campos são obrigatórios» sem que o teste dissesse qual faltava.
 */
async function fillAll(page: Page, name = "Ana Teste") {
  await page.getByRole("radio", { name: "Casamento", exact: true }).click();
  await page.getByLabel("Data ainda a definir").check();
  await page.getByLabel("Ainda a definir", { exact: true }).check();
  await page
    .getByRole("group", { name: /cerimónia/i })
    .getByRole("button", { name: "Civil", exact: true })
    .click()
    .catch(() => {});
  await page.getByPlaceholder("Ex.: cidade ou espaço do evento…").fill("Évora");
  await page
    .getByRole("group", { name: /interior ou exterior/i })
    .getByRole("button", { name: "Exterior", exact: true })
    .first()
    .click()
    .catch(() => {});
  await page.getByPlaceholder("O seu nome").fill(name);
  await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
  await page.getByPlaceholder("+351 9XX XXX XXX").fill("912345678");
  await page
    .getByPlaceholder("Estilo, cores, ambiente, inspirações que guardou…")
    .fill("Algo natural, com flores do campo e tons de branco e verde.");
}

/**
 * Enviar, e confirmar os contactos no painel que aparece (28/10: antes de
 * sair, o formulário mostra o email e o telemóvel para ela confirmar — o
 * envio a sério é o «Está certo, enviar»).
 */
async function enviarEConfirmar(page: Page) {
  await page.getByRole("button", { name: /Enviar pedido/ }).click();
  const painel = page.getByRole("region", { name: "Confirme os seus contactos" });
  await expect(painel).toBeVisible();
  await painel.getByRole("button", { name: /Está certo, enviar/ }).click();
}

test.describe("Pedido de orçamento", () => {
  test("submete o formulário e chega à confirmação com a referência", async ({ page }) => {
    await page.route("**/api/orcamento", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-TEST", status: "ok" }),
      }),
    );

    await page.goto("/orcamento");
    await fillAll(page);
    await enviarEConfirmar(page);

    // Hand-off lands on the confirmation page showing the reference id.
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-TEST$/);
    await expect(page.getByText("LIQ-E2E-TEST")).toBeVisible();
  });

  test("submeter incompleto mostra os erros e não avança", async ({ page }) => {
    await page.goto("/orcamento");

    // The submit stays operable (accessible pattern) — submitting an incomplete
    // form surfaces announced errors instead of a silently disabled button.
    const enviar = page.getByRole("button", { name: /Enviar pedido/ });
    await expect(enviar).toBeEnabled();

    await enviar.click();
    await expect(page.getByText("Selecione o tipo de evento.")).toBeVisible();
    await expect(page).toHaveURL(/\/orcamento$/);

    // Every field is required now, so filling only the contact details must
    // still be refused — with the reason named, on the field that's missing.
    await page.getByRole("radio", { name: "Corporativo", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Ana");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
    await enviar.click();
    await expect(page).toHaveURL(/\/orcamento$/);
    await expect(page.getByText("Indique o local ou a região.")).toBeVisible();
  });

  test("aceita “ainda a definir” como resposta à data e ao nº de pessoas", async ({ page }) => {
    await page.route("**/api/orcamento", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-OPEN", status: "ok" }),
      }),
    );

    await page.goto("/orcamento");
    await fillAll(page, "Rita Aberta");
    // Neither a date nor a headcount was typed — both checkboxes carry them.
    await expect(page.getByLabel("Data ainda a definir")).toBeChecked();
    await enviarEConfirmar(page);
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-OPEN$/);
  });

  test("“ainda a definir” oferece a ordem de grandeza, sem a exigir", async ({ page }) => {
    await page.goto("/orcamento");
    await page.getByRole("radio", { name: "Casamento", exact: true }).click();

    // Antes de marcar a caixa os intervalos não existem: quem sabe o número não
    // tem de ver uma pergunta a mais.
    const intervalos = page.getByRole("group", { name: /Mais ou menos quantas/ });
    await expect(intervalos).toHaveCount(0);

    await page.getByLabel("Ainda a definir", { exact: true }).check();
    await expect(intervalos).toBeVisible();

    // Carregar marca; voltar a carregar no mesmo desmarca — é uma estimativa
    // opcional, e ter de recarregar a página para a tirar seria absurdo.
    const cem = intervalos.getByRole("button", { name: "100 a 150" });
    await cem.click();
    await expect(cem).toHaveAttribute("aria-pressed", "true");
    await cem.click();
    await expect(cem).toHaveAttribute("aria-pressed", "false");

    // E sem intervalo nenhum o envio passa à mesma: quem não faz mesmo ideia
    // segue em frente em vez de inventar um número.
    let enviado: { form?: Record<string, unknown> } | undefined;
    await page.route("**/api/orcamento", (route) => {
      enviado = route.request().postDataJSON();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-EST", status: "ok" }),
      });
    });
    await page.getByLabel("Data ainda a definir").check();
    await page.getByPlaceholder("Ex.: cidade ou espaço do evento…").fill("Évora");
    await page.getByPlaceholder("O seu nome").fill("Rita Sem Numero");
    await page.getByPlaceholder("email@exemplo.com").fill("rita@exemplo.pt");
    await page.getByPlaceholder("+351 9XX XXX XXX").fill("912345678");
    await page
      .getByPlaceholder("Estilo, cores, ambiente, inspirações que guardou…")
      .fill("Simples e com muita luz.");
    await enviarEConfirmar(page);
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-EST$/);
    expect(enviado?.form?.guestsRange).toBe("");
  });

  test("os nomes do casal só aparecem no casamento, e só ao escrever o nome", async ({ page }) => {
    await page.goto("/orcamento");
    /**
     * PELO RÓTULO ACESSÍVEL, E NÃO PELO PLACEHOLDER.
     *
     * Este teste procurava «Nome do noivo» e «Nome da noiva». Os dois campos
     * passaram a dizer «Nome» e «Nome» — de propósito, e a razão está escrita
     * no dicionário: para dois homens ou duas mulheres, o formulário estava a
     * dizer-lhes que não contava com eles, logo no primeiro contacto. Quem os
     * distingue agora é o `aria-label`, que é também quem os distingue para
     * quem ouve o formulário em vez de o ver. Procurar por aí é procurar pelo
     * que o produto promete, e não por um texto de passagem.
     */
    const umaPessoa = page.getByLabel("Nome de uma das pessoas do casal");
    const outraPessoa = page.getByLabel("Nome da outra pessoa do casal");

    // Casamento escolhido, nome ainda em branco → os campos não existem.
    await page.getByRole("radio", { name: "Casamento", exact: true }).click();
    await expect(umaPessoa).toHaveCount(0);

    // Começa a escrever o nome → aparecem.
    await page.getByPlaceholder("O seu nome").fill("Ana");
    await expect(umaPessoa).toBeVisible();
    await expect(outraPessoa).toBeVisible();

    // Muda para um tipo de evento sem casal → desaparecem, mesmo com o nome
    // escrito. Um aniversário não tem noivos.
    await page.getByRole("radio", { name: "Aniversário", exact: true }).click();
    await expect(umaPessoa).toHaveCount(0);
  });

  test("o rascunho sobrevive a sair e voltar à página", async ({ page }) => {
    await page.goto("/orcamento");
    await page.getByRole("radio", { name: "Aniversário", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Maria Rascunho");

    // Navigate away and back — the locally saved draft restores the fields.
    await page.goto("/sobre");
    await page.goto("/orcamento");

    await expect(page.getByPlaceholder("O seu nome")).toHaveValue("Maria Rascunho");
    await expect(page.getByRole("radio", { name: "Aniversário", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
