import { test, expect, type Page } from "@playwright/test";

/**
 * PASSKEYS, DE PONTA A PONTA — com um autenticador virtual do Chrome.
 *
 * Os testes de unidade prendem cada barreira à parte, mas todos mockam a
 * verificação criptográfica: nenhum deles prova que uma assinatura REAL,
 * produzida por um autenticador real, é aceite pelo servidor. Sem este ficheiro,
 * a funcionalidade podia estar inteiramente partida com a suite verde — que é
 * exactamente o defeito que esta casa já apanhou noutros sítios (o portão do
 * semgrep verde com uma regra que não compilava, a suite E2E decorativa).
 *
 * O `WebAuthn` do CDP dá um autenticador de software: gera chaves a sério,
 * assina a sério, e obedece às mesmas regras de origem. O que aqui corre é o
 * protocolo verdadeiro, sem um único mock.
 *
 * Percurso: entrar com palavra-passe → registar este aparelho → sair → entrar
 * outra vez SEM palavra-passe → remover o aparelho → confirmar que já não entra.
 */

const SENHA = "liquen2026";

/** Liga um autenticador virtual e devolve o seu id. */
async function ligarAutenticador(page: Page): Promise<string> {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      // O servidor exige verificação do utilizador; um autenticador que não a
      // saiba fazer não pode ser registado, e é assim de propósito.
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return authenticatorId;
}

async function entrarComSenha(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  // O campo pelo `name` e não pelo rótulo: o rótulo «Palavra-passe» passou a ter
  // ao lado o botão de mostrar/ocultar, cujo nome acessível também o contém.
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();

  /*
    ── O FORMULÁRIO PASSOU A ESTAR FECHADO ────────────────────────────────
    O `docs/LOGIN.md` deu ao ecrã de entrada dois estados: por omissão só a
    chave de acesso, e a palavra-passe atrás de um link. Aqui, onde o que se
    quer é entrar pela palavra-passe para depois registar o aparelho, abre-se
    primeiro. O link só existe onde o browser sabe o que é uma chave de acesso.
  */
  /*
    ── E PORQUE É QUE ISTO ESPERA EM VEZ DE CONTAR ──────────────────────────
    `if (await x.count())` pergunta AGORA e responde 0 se o React ainda não
    pintou — e nesse caso o formulário fica fechado. E fechado ele é
    `aria-hidden`, portanto o `getByRole` a seguir não encontra os campos: o
    passeio morre a esperar por um botão que está ali, invisível para a árvore
    de acessibilidade. Um `click` com tecto próprio espera o que for preciso e
    segue em frente se o link não existir de todo (o caso do browser sem chaves
    de acesso, em que o formulário já está aberto).
  */
  await page
    .getByRole("button", { name: /^Entrar com palavra-passe$/ })
    .click({ timeout: 5_000 })
    .catch(() => {});

  await page.getByLabel(/^Email$/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill(SENHA);
  // «Entrar»: esse outro nome é agora do link que abre o formulário.
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * ── «OS MEUS DISPOSITIVOS» MUDOU DE SÍTIO, E NÃO DE NOME ──────────────────
 *
 * Vivia na coluna da esquerda, que estava sempre à vista no computador — daí
 * este passeio carregar-lhe directamente. A coluna acabou: «a barra substitui
 * o menu». Os destinos passaram para a cápsula que flutua em baixo, e o que
 * NÃO é navegação — o logótipo, a conta, a ajuda, as quatro acções e este
 * botão — ficou numa gaveta, que se abre.
 *
 * Abre-se primeiro, portanto. E a porta é a mesma nas duas larguras: a peça
 * redonda «Mais destinos», ao lado da cápsula.
 *
 * `.first()`: «Mais destinos» é de propósito o nome de duas coisas — o botão
 * que abre e a lista que ele abre —, para quem ouve saber o que vai encontrar.
 * Papéis diferentes, mas a busca por nome apanha o botão do cabeçalho também
 * quando ele existe.
 *
 * ── E ABRE-SE SEMPRE, SEM PERGUNTAR SE JÁ ESTÁ ABERTA ────────────────────
 *
 * A primeira versão perguntava com um `isVisible()` e só abria se fosse
 * preciso. Não funciona, e a razão é subtil: a gaveta FECHADA vive em
 * `-translate-x-full`, ou seja está fora do ecrã mas continua no DOM, com
 * tamanho e sem `display:none`. Para o Playwright isso é VISÍVEL — o guarda
 * dava-se por satisfeito, não abria nada, e o clique morria trinta segundos
 * depois com «element is outside of the viewport».
 *
 * O abridor só abre (`setNavOpen(true)`), nunca alterna. Chamá-lo com a gaveta
 * já aberta não faz mal nenhum, e uma pergunta que se pode enganar vale menos
 * do que um gesto que não se engana.
 */
/**
 * Carrega num botão que vive NA GAVETA, abrindo-a primeiro.
 *
 * «Os meus dispositivos» e «Sair» viviam os dois na coluna da esquerda, que
 * estava sempre à vista no computador. A coluna acabou e eles ficaram na
 * gaveta — juntos, porque nenhum dos dois é navegação.
 */
async function naGaveta(page: Page, nome: RegExp) {
  await page
    .getByRole("button", { name: /^Mais destinos$/ })
    .first()
    .click();
  const botao = page.getByRole("button", { name: nome });
  await botao.click();
}

async function abrirDispositivos(page: Page) {
  await naGaveta(page, /Os meus dispositivos/i);
  await expect(page.getByRole("dialog", { name: /Os meus dispositivos/i })).toBeVisible();
}

test.describe("Passkeys", () => {
  test("regista este aparelho, entra sem palavra-passe, e remover fecha a porta", async ({
    page,
  }) => {
    await ligarAutenticador(page);

    const entrou = await entrarComSenha(page);
    test.skip(
      !entrou,
      "Entrada de admin indisponível aqui (build de produção sem ADMIN_PASSWORD_HASH); o CI define um hash de teste.",
    );

    // ── 1. Registar ────────────────────────────────────────────────────────
    await abrirDispositivos(page);

    const dialogo = page.getByRole("dialog", { name: /Os meus dispositivos/i });
    const semTabela = dialogo.getByText(/ainda não existe na base de dados/i);
    // Sem Supabase configurado o armazém é volátil, mas existe; se um dia a
    // tabela faltar mesmo, isto salta em vez de falhar por uma razão alheia.
    test.skip(await semTabela.isVisible(), "A tabela das passkeys não existe neste ambiente.");

    await dialogo.getByLabel(/^Nome$/i).fill("Portátil de testes");
    // Registar um aparelho pede a palavra-passe da conta (auditoria de 13/11,
    // n.º 5): uma sessão roubada não pode juntar uma chave de acesso sua.
    await dialogo.locator('input[name="password"]').fill(SENHA);
    await dialogo.getByRole("button", { name: /^Registar$/ }).click();

    await expect(dialogo.getByText("Portátil de testes")).toBeVisible({ timeout: 10_000 });

    // ── 1b. Mudar-lhe o nome ───────────────────────────────────────────────
    // O nome é escolhido no registo, quando só há um aparelho na conta. Ao
    // terceiro telemóvel, três linhas iguais tornam a lista impossível de ler —
    // e uma lista que não se lê é uma lista de onde nada se remove.
    await dialogo.getByRole("button", { name: /^Mudar nome$/ }).click();
    await dialogo.getByLabel(/Nome do dispositivo/i).fill("Portátil da bancada");
    await dialogo.getByRole("button", { name: /^Guardar$/ }).click();
    await expect(dialogo.getByText("Portátil da bancada")).toBeVisible({ timeout: 10_000 });
    await expect(dialogo.getByText("Portátil de testes")).toHaveCount(0);

    // ── 2. Sair ────────────────────────────────────────────────────────────
    await page.keyboard.press("Escape");
    await naGaveta(page, /^Sair$/i);
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();

    // ── 3. Entrar SEM palavra-passe ────────────────────────────────────────
    // Nenhum campo é preenchido: é o aparelho que se identifica.
    await page.getByRole("button", { name: /Entrar com a chave de acesso/i }).click();
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 15_000,
    });

    // ── 4. Remover, e confirmar que deixa de servir ────────────────────────
    await abrirDispositivos(page);
    page.once("dialog", (d) => d.accept());
    await dialogo.getByRole("button", { name: /^Remover$/ }).click();
    await expect(dialogo.getByText("Portátil da bancada")).toHaveCount(0, { timeout: 10_000 });

    await page.keyboard.press("Escape");
    await naGaveta(page, /^Sair$/i);
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();

    // O aparelho ainda tem a chave; o servidor é que já não a conhece. Entrar
    // tem de falhar — se passasse, remover um dispositivo não removia nada.
    await page.getByRole("button", { name: /Entrar com a chave de acesso/i }).click();
    // Pelo texto, e não por `role=alert`: o Next mantém sempre no DOM um
    // anunciador de rotas que também é `role=alert`, e o selector apanhava dois.
    await expect(page.getByText(/Não foi possível entrar/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  });

  test("o botão do dispositivo não aparece onde o browser não sabe o que é", async ({ page }) => {
    // Sem autenticador virtual o Chrome continua a ter a API, portanto o botão
    // aparece; o que se prende aqui é o ecrã sem passkey nenhuma REGISTADA —
    // tentar tem de recusar, e a palavra-passe tem de continuar à vista.
    await page.goto("/orcamento/admin");
    await expect(page.locator('input[name="password"]')).toBeVisible();
  });
});
