// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LocaleProvider } from "@/components/LocaleProvider";
import { pickChromeDict } from "@/lib/i18n";
import { pt } from "@/lib/i18n/pt";
import { MARCA_DE_SESSAO } from "./entrada-destino";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DO BACK OFFICE — o que não pode voltar a estar como estava
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada teste aqui corresponde a uma coisa que foi pedida e que se perde com
 * facilidade numa reorganização do ecrã: a ORDEM (o aparelho primeiro), o
 * caminho de quem trocou de telemóvel (que não existia de todo), e o guarda do
 * regresso à página pedida — esse é o único que, se cair, não se vê no ecrã.
 *
 * O que NÃO se prova aqui é a criptografia das passkeys: isso é o
 * `e2e/passkeys.spec.ts`, com um autenticador a sério. Aqui o módulo do cliente
 * é simulado, porque o que se mede é o ecrã.
 */

const DICT = pickChromeDict(pt);

const passkeys = vi.hoisted(() => ({
  suporta: true,
  autofill: false,
  entrar: vi.fn(async (o?: unknown) => o),
  armado: [] as unknown[],
  desarmado: 0,
}));

vi.mock("@/lib/passkeys-cliente", () => ({
  suportaPasskeys: () => passkeys.suporta,
  suportaAutofillDePasskeys: async () => passkeys.autofill,
  entrarComDispositivo: (o?: unknown) => passkeys.entrar(o),
  cancelarCerimonia: () => {},
  mensagemDeErro: (e: unknown) => (e as { message?: string })?.message ?? "falhou",
  armarEntradaAutomatica: (o: unknown) => {
    passkeys.armado.push(o);
    return () => {
      passkeys.desarmado += 1;
    };
  },
}));

const router = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// O `next/image` faz trabalho que não é o desta suite (o carregador, o
// `srcset`); aqui basta o elemento estar lá para o resto do cartão se desenhar.
vi.mock("next/image", () => ({
  default: (p: Record<string, unknown>) => <span data-logotipo={String(p.alt ?? "")} />,
}));

const { default: AdminLogin, deslocamentoParaOTeclado } = await import("./AdminLogin");

/** Um `fetch` que regista o que lhe mandaram e responde o que se lhe disser. */
let pedidos: { url: string; body: Record<string, unknown> }[] = [];
function servir(resposta: { ok: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return {
        ok: resposta.ok,
        status: resposta.status ?? (resposta.ok ? 200 : 401),
        json: async () => resposta.body ?? {},
      };
    }),
  );
}

function montar() {
  return render(
    <LocaleProvider locale="pt" dict={DICT}>
      <AdminLogin />
    </LocaleProvider>,
  );
}

/**
 * ── O FORMULÁRIO PASSOU A ESTAR FECHADO ────────────────────────────────────
 *
 * O `docs/LOGIN.md` deu a este ecrã dois estados, e a razão está lá: «Entrar
 * com este dispositivo» e «Entrar com palavra-passe» tinham a MESMA largura e
 * a MESMA altura, e dois caminhos com o mesmo peso não são uma recomendação —
 * são uma pergunta. A regra da Apple é distinguir a opção preferida por
 * ESTILO, nunca por tamanho.
 *
 * Por omissão só se vê a chave de acesso; a palavra-passe está atrás de um
 * link. Quase todos os casos deste ficheiro mexem no formulário, portanto
 * quase todos precisam de o abrir primeiro.
 *
 * O link só existe quando o browser sabe o que é uma chave de acesso. Onde não
 * sabe (`sem passkeys`), o formulário é a única porta e já está aberto — daí a
 * verificação antes de clicar, em vez de um clique cego.
 */
async function abrirOFormulario(u: ReturnType<typeof userEvent.setup>) {
  const link = screen.queryByRole("button", { name: /^Entrar com palavra-passe$/ });
  if (link) await u.click(link);
}

/**
 * O campo da palavra-passe, pelo `name`.
 *
 * Não por `getByLabelText(/Palavra-passe/)`: o botão de mostrar/ocultar tem
 * «palavra-passe» no nome acessível — de propósito, é o que o torna utilizável
 * com leitor de ecrã — e o selector apanhava os dois.
 */
function campoDaSenha(): HTMLInputElement {
  return document.querySelector('input[name="password"]')!;
}

function irPara(url: string) {
  window.history.replaceState({}, "", url);
}

beforeEach(() => {
  pedidos = [];
  passkeys.suporta = true;
  passkeys.autofill = false;
  passkeys.armado = [];
  passkeys.desarmado = 0;
  passkeys.entrar.mockClear();
  router.replace.mockClear();
  router.refresh.mockClear();
  sessionStorage.clear();
  irPara("/pt/orcamento/admin");
  servir({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── Bloco 2: o aparelho é o caminho principal ──────────────────────────────

describe("a ordem dos dois caminhos", () => {
  it("a chave de acesso vem ANTES do caminho da palavra-passe", () => {
    montar();
    const chave = screen.getByRole("button", { name: /Entrar com a chave de acesso/i });
    const link = screen.getByRole("button", { name: /^Entrar com palavra-passe$/i });
    // `DOCUMENT_POSITION_FOLLOWING` = o segundo vem depois do primeiro. É a
    // ordem do DOM, que é a que manda para o teclado e para o leitor de ecrã —
    // e não a ordem visual, que uma folha de estilos pode desmentir.
    expect(chave.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  /**
   * ── A REGRA QUE ESTE CASO PASSA A GUARDAR ────────────────────────────────
   *
   * Ele exigia que o aparelho fosse `bg-sage-600` e a palavra-passe tivesse
   * `border-foreground/28` — ou seja, um botão cheio e um botão contornado, da
   * mesma largura, um ao lado do outro.
   *
   * É exactamente a avaria que o `docs/LOGIN.md` abre a descrever: «têm a MESMA
   * largura e a MESMA altura; lêem-se como duas acções de igual peso». A regra
   * da Apple é distinguir a opção preferida por ESTILO, nunca por tamanho — e
   * dois botões de largura total não são dois estilos, são dois pesos iguais.
   *
   * O caso deixa de guardar a APARÊNCIA de cada um e passa a guardar a regra:
   * **em qualquer dos dois estados há exactamente um botão cheio**. É mais
   * forte do que era, porque não depende de nomes de classe — e é a única coisa
   * que não pode voltar a partir-se sem a avaria voltar.
   */
  it("há exactamente UM botão cheio, em cada um dos dois estados", async () => {
    const u = userEvent.setup();
    const { container } = montar();

    /*
      Só o que está À VISTA. O formulário do estado B continua no DOM quando
      está fechado — é uma grelha a `0fr` com `overflow-hidden`, e é isso que
      lhe permite ANIMAR a altura em vez de aparecer de repente. Mas está
      `inert` e `aria-hidden`, portanto não existe nem para o rato, nem para o
      teclado, nem para um leitor de ecrã.

      A primeira versão deste caso contava o DOM e acusou dois botões cheios no
      estado A. Tinha razão sobre o DOM e estava errada sobre a regra: o que o
      documento proíbe é dois botões cheios a COMPETIR aos olhos de quem está a
      decidir, e um botão dentro de uma caixa fechada não compete com nada.
    */
    const escondido = (el: HTMLElement) => el.closest("[inert], [aria-hidden='true']") !== null;

    const cheios = () =>
      Array.from(container.querySelectorAll<HTMLElement>("button")).filter(
        (b) => b.className.includes("bg-sage-600") && !escondido(b),
      );

    // Estado A: o cheio é a chave de acesso.
    expect(cheios().map((b) => b.textContent?.trim())).toEqual([
      expect.stringMatching(/Entrar com a chave de acesso/i),
    ]);

    await u.click(screen.getByRole("button", { name: /^Entrar com palavra-passe$/i }));

    // Estado B: o cheio é o «Entrar», e a chave de acesso recuou para link.
    expect(cheios().map((b) => b.textContent?.trim())).toEqual([
      expect.stringMatching(/^Entrar$/i),
    ]);
    expect(
      screen.queryByRole("button", { name: /Entrar com a chave de acesso/i })?.className,
      "a chave de acesso devia ter recuado para link — um botão cheio não recua",
    ).not.toContain("bg-sage-600");
  });

  it("sem passkeys no browser, a palavra-passe volta a ser o botão principal", () => {
    passkeys.suporta = false;
    montar();
    expect(
      screen.queryByRole("button", { name: /Entrar com a chave de acesso/i }),
    ).not.toBeInTheDocument();
    // É a única porta que resta: não pode estar desenhada como alternativa de
    // coisa nenhuma.
    expect(screen.getByRole("button", { name: /^Entrar$/i }).className).toContain("bg-sage-600");
  });

  it("a explicação do aparelho cabe numa linha", () => {
    montar();
    const linha = screen.getByText(/Usa o rosto, a impressão digital ou o PIN/i);
    // Eram três frases. O tecto aqui é do TAMANHO do texto, que é a medida que
    // não depende de quem o escreve.
    expect(linha.textContent!.length).toBeLessThan(70);
  });
});

describe("a passkey proposta sem se carregar em nada", () => {
  it("o campo do email convida o autofill do WebAuthn", () => {
    montar();
    // `webauthn` TEM de ser o último valor: fora do fim, a norma manda o browser
    // ignorá-lo, e a proposta nunca aparece.
    expect(screen.getByLabelText(/^Email$/i)).toHaveAttribute("autocomplete", "username webauthn");
  });

  it("arma a entrada automática onde o browser a sabe fazer", async () => {
    passkeys.autofill = true;
    montar();
    await waitFor(() => expect(passkeys.armado).toHaveLength(1));
  });

  it("não arma nada onde o browser não a sabe fazer", async () => {
    passkeys.autofill = false;
    montar();
    await waitFor(() => expect(screen.getByLabelText(/^Email$/i)).toBeInTheDocument());
    expect(passkeys.armado).toHaveLength(0);
  });
});

describe("o caminho inverso: registar um aparelho novo", () => {
  it("a página de entrada diz como se regista um telemóvel novo", async () => {
    montar();
    const uAbrir = userEvent.setup();
    await abrirOFormulario(uAbrir);
    expect(screen.getByText(/^Mudei de aparelho$/i)).toBeInTheDocument();
    // As duas metades da resposta: entra-se pela palavra-passe, e o sítio tem
    // nome. Sem a segunda, «entra e regista» não diz onde.
    const bloco = screen.getByText(/^Mudei de aparelho$/i).parentElement!;
    expect(bloco.textContent).toMatch(/palavra-passe/i);
    expect(bloco.textContent).toMatch(/Os meus dispositivos/i);
  });
});

// ── Bloco 3: o formulário ──────────────────────────────────────────────────

describe("o formulário", () => {
  it("os dois campos obrigatórios estão marcados como obrigatórios", () => {
    montar();
    // Era só a palavra-passe a ter asterisco, com os dois a serem obrigatórios.
    expect(screen.getByLabelText(/^Email$/i)).toBeRequired();
    expect(campoDaSenha()).toBeRequired();
  });

  it("mostrar/ocultar troca o tipo do campo da palavra-passe", async () => {
    const u = userEvent.setup();
    montar();
    await abrirOFormulario(u);
    const campo = campoDaSenha();
    expect(campo).toHaveAttribute("type", "password");
    await u.click(screen.getByRole("button", { name: /Mostrar a palavra-passe/i }));
    expect(campo).toHaveAttribute("type", "text");
    await u.click(screen.getByRole("button", { name: /Ocultar a palavra-passe/i }));
    expect(campo).toHaveAttribute("type", "password");
  });

  it("o foco começa no primeiro campo", () => {
    montar();
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email$/i));
  });

  it("o Enter no campo do email submete", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer");
    // De volta ao PRIMEIRO campo, e Enter dali: é o gesto de quem corrige o
    // email depois de escrever tudo.
    screen.getByLabelText(/^Email$/i).focus();
    await u.keyboard("{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].url).toBe("/api/admin/login");
  });

  it("dois Enter seguidos não fazem dois envios", async () => {
    const u = userEvent.setup();
    // Uma resposta que nunca chega: é durante a espera que o duplo envio
    // acontece na vida real.
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
        return new Promise(() => {});
      }),
    );
    montar();
    await abrirOFormulario(u);
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    await u.keyboard("{Enter}");
    expect(pedidos).toHaveLength(1);
    expect(screen.getByRole("button", { name: /A verificar/i })).toBeDisabled();
  });
});

// ── Bloco 6: depois de entrar ──────────────────────────────────────────────

describe("manter a sessão iniciada", () => {
  /**
   * VEM DESLIGADA, e é isso que este bloco prende.
   *
   * A razão está no `MANTER_SESSAO_POR_OMISSAO`, no componente: uma caixa
   * pré-marcada não é uma escolha, e com a passkey o custo de voltar a entrar
   * passou a ser um toque. O teste existe para a omissão não voltar a ligar-se
   * por acidente — numa ferramenta com dados de clientes, isso é uma alteração
   * de segurança que tem de ser deliberada e não um efeito lateral.
   */
  it("vem DESLIGADA, com a duração escrita por extenso", async () => {
    montar();
    const uAbrir = userEvent.setup();
    await abrirOFormulario(uAbrir);
    const caixa = screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i });
    expect(caixa).not.toBeChecked();
    // O número, e não «manter-me com sessão iniciada» — uma promessa sem número
    // é lida por cada pessoa como lhe apetecer.
    expect(
      screen.getByText(/Manter a sessão iniciada neste aparelho durante 30 dias/i),
    ).toBeInTheDocument();
  });

  it("explica o que se escolhe, e só isso — a omissão não gasta linhas", async () => {
    const u = userEvent.setup();
    montar();
    await abrirOFormulario(u);
    // Desligada é a omissão: não leva explicação nenhuma. As linhas custam
    // ~36 px, e o botão de submeter está a 831 px de uma dobra de 844 no
    // telemóvel — ver a nota no componente.
    expect(screen.queryByText(/um mês é muito tempo/i)).not.toBeInTheDocument();
    // Ligá-la é a escolha, e é a que tem consequência.
    await u.click(screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i }));
    expect(screen.getByText(/um mês é muito tempo/i)).toBeInTheDocument();
  });

  it("desligada, é isso que vai no pedido de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].body.manterSessao).toBe(false);
  });

  it("ligá-la vai no pedido de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await abrirOFormulario(u);
    await u.click(screen.getByRole("checkbox", { name: /Manter a sessão iniciada/i }));
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(pedidos[0].body.manterSessao).toBe(true);
  });

  it("e vale também na entrada pelo aparelho", async () => {
    const u = userEvent.setup();
    montar();
    await u.click(screen.getByRole("button", { name: /Entrar com a chave de acesso/i }));
    await waitFor(() => expect(passkeys.entrar).toHaveBeenCalled());
    expect(passkeys.entrar).toHaveBeenCalledWith({ manterSessao: false });
  });
});

describe("voltar à página que se tentava abrir", () => {
  it("segue um destino interno do back office", async () => {
    const u = userEvent.setup();
    irPara("/pt/orcamento/admin?destino=%2Fpt%2Forcamento%2Fadmin%2Fevento%2FLQ-7");
    montar();
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(router.replace).toHaveBeenCalledWith("/pt/orcamento/admin/evento/LQ-7");
  });

  it("NÃO segue um destino para fora desta casa", async () => {
    const u = userEvent.setup();
    // Este é o teste que interessa: se ele cair, o ecrã de entrada passa a ser
    // um trampolim de phishing e nada no ecrã o denuncia.
    irPara("/pt/orcamento/admin?destino=https%3A%2F%2Fliquen-eventos.com%2Fentrar");
    montar();
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("sem destino, fica onde está e volta a pedir a página ao servidor", async () => {
    const u = userEvent.setup();
    montar();
    await u.type(screen.getByLabelText(/^Email$/i), "catarina@liquen-events.com");
    await u.type(campoDaSenha(), "uma-senha-qualquer{Enter}");
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("a sessão que expirou", () => {
  it("explica-se, em vez de aparecer um formulário sem razão", () => {
    sessionStorage.setItem(MARCA_DE_SESSAO, "1");
    montar();
    expect(screen.getByText(/A tua sessão expirou/i)).toBeInTheDocument();
    // E a marca é gasta: recarregar a página outra vez não repete o susto.
    expect(sessionStorage.getItem(MARCA_DE_SESSAO)).toBeNull();
  });

  it("quem chega de fresco não leva com aviso nenhum", () => {
    montar();
    expect(screen.queryByText(/A tua sessão expirou/i)).not.toBeInTheDocument();
  });
});

// ── Bloco 1: o que não pode ter sido desfeito ──────────────────────────────

describe("o que o Bloco 1 deixou, e continua de pé", () => {
  it("a frase de recusa é a do servidor, sem a tornar mais específica", async () => {
    const u = userEvent.setup();
    servir({ ok: false, status: 401, body: { error: "Credenciais incorretas" } });
    montar();
    await abrirOFormulario(u);
    await u.type(screen.getByLabelText(/^Email$/i), "ninguem@exemplo.pt");
    await u.type(campoDaSenha(), "errada-de-certeza{Enter}");
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Credenciais incorretas");
    expect(aviso.textContent).not.toMatch(/conta|existe|email/i);
  });

  it("o painel de recuperação continua FORA do formulário de entrada", async () => {
    const u = userEvent.setup();
    montar();
    await abrirOFormulario(u);
    await u.click(screen.getByRole("button", { name: /^Esqueci-me da palavra-passe$/i }));
    const campo = await screen.findByLabelText(/Email da tua conta/i);
    const formularioDaRecuperacao = campo.closest("form")!;
    const campoDaEntrada = screen.getByLabelText(/^Email$/i);
    // Formulários encaixados são HTML inválido, e o Enter submetia a coisa
    // errada. São dois `<form>` irmãos, e têm de continuar a sê-lo.
    expect(formularioDaRecuperacao).not.toBe(campoDaEntrada.closest("form"));
    expect(formularioDaRecuperacao.querySelector("form")).toBeNull();
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ENQUANTO SE RECUPERA, HÁ UM SÓ CAMPO DE EMAIL À MÃO
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ela mandou a fotografia do ecrã com o painel de recuperação aberto. O que
   * lá estava: um campo «Email», uma palavra-passe, um «manter a sessão
   * iniciada», um «Entrar» apagado, um parágrafo de instruções, um SEGUNDO
   * campo de email chamado «Email da tua conta», um aviso vermelho, um
   * «Enviar ligação», um «Voltar», um «Entrar com a chave de acesso» e um
   * «Mudei de aparelho». Escreveu «isto não funciona bem».
   *
   * Dois campos de email na mesma vista é a parte que se mede daqui: quem
   * chega com a palavra-passe perdida não tem de decidir em qual dos dois
   * escreve. O formulário de entrada recolhe — a mesma altura animada que já
   * servia a chave de acesso — e volta com o «Voltar».
   *
   * O teste NÃO conta elementos no DOM: o formulário continua lá, recolhido,
   * porque é assim que a altura anima. Conta o que está ALCANÇÁVEL, que é o
   * que a pessoa e o leitor de ecrã vêem — e é por isso que a asserção é sobre
   * `inert`, e não sobre `querySelectorAll`.
   */
  it("com a recuperação aberta, o formulário de entrada fica fora de alcance", async () => {
    const u = userEvent.setup();
    montar();
    await abrirOFormulario(u);

    const campoDaEntrada = screen.getByLabelText(/^Email$/i);
    expect(
      campoDaEntrada.closest("[inert]"),
      "antes de recuperar, o formulário de entrada tem de estar mesmo utilizável",
    ).toBeNull();

    await u.click(screen.getByRole("button", { name: /^Esqueci-me da palavra-passe$/i }));
    const campoDaRecuperacao = await screen.findByLabelText(/Email da tua conta/i);

    /**
     * O DEFEITO DE 10/11 — e o que este teste não perguntava. A caixa que
     * recolhia o formulário de entrada tinha lá dentro a recuperação, e
     * recolhia-a também: o cartão ficava só com «Mudei de aparelho». Ela: «não
     * dá para fazer nada». Perguntava-se se a ENTRADA saía de alcance; nunca se
     * perguntou se a RECUPERAÇÃO lá ficava.
     */
    expect(
      campoDaRecuperacao.closest("[inert], [aria-hidden='true']"),
      "a recuperação abriu DENTRO de uma caixa fechada — o cartão fica vazio",
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /Enviar/i }).closest("[inert], [aria-hidden='true']"),
    ).toBeNull();

    expect(
      campoDaEntrada.closest("[inert]"),
      "com a recuperação aberta, o email da entrada continuava alcançável — são " +
        "dois campos de email a pedir a mesma coisa na mesma vista",
    ).not.toBeNull();

    // E a porta de volta é uma só: o «Voltar». O atalho para a chave de acesso
    // sai enquanto se está aqui, senão o ecrã volta a ter três saídas.
    expect(screen.queryByRole("button", { name: /Entrar com a chave de acesso/i })).toBeNull();
  });
});

// ── O telemóvel: o teclado, os alvos e onde caem as recusas ────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SÓ SE VÊ COM UM TECLADO POR CIMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estes três não são de gosto: cada um corresponde a um número medido a
 * 375×667 (iPhone SE), com toque, e está escrito no `AdminLogin.tsx` ao lado da
 * cura. Aqui prova-se a parte que jsdom consegue provar — a conta, a classe e a
 * ORDEM no documento —, porque a parte que falta (píxeis) já foi medida e o que
 * se perde primeiro numa reorganização é isto.
 */

describe("o teclado do telemóvel não pode tapar o que se vai tocar a seguir", () => {
  /**
   * Os números são os do iPhone SE com o teclado aberto: janela de layout de
   * 667 px, janela visual de 407 (o teclado com a barra de sugestões come 260).
   */
  const VISIVEL = 407;

  it("puxa o botão de submeter para dentro da parte visível", () => {
    // Medido antes da correcção: campo 382,9–427,8 e botão 503,8–551,8, com a
    // linha do teclado nos 407 — os dois por baixo dela.
    const d = deslocamentoParaOTeclado({
      campo: { top: 382.9, bottom: 427.8 },
      accao: { bottom: 551.8 },
      alturaVisivel: VISIVEL,
    });
    expect(d).toBe(157); // 551,8 + 12 de folga − 407
    // E depois de rolar esse tanto, tudo cabe.
    expect(551.8 - d).toBeLessThanOrEqual(VISIVEL);
    expect(382.9 - d).toBeGreaterThan(0);
  });

  it("quando os dois não cabem, ganha o campo — nunca o empurra para fora pelo topo", () => {
    // Um formulário mais alto do que o que sobra do ecrã: o botão fica de fora,
    // mas o campo em que se está a escrever tem de ficar à vista.
    const d = deslocamentoParaOTeclado({
      campo: { top: 100, bottom: 145 },
      accao: { bottom: 600 },
      alturaVisivel: VISIVEL,
    });
    expect(d).toBe(88); // 100 − 12, e não os 205 que o botão pedia
    expect(100 - d).toBe(12);
  });

  it("sobe a página quando o campo está meio fora pelo topo", () => {
    const d = deslocamentoParaOTeclado({
      campo: { top: 4, bottom: 49 },
      accao: { bottom: 120 },
      alturaVisivel: VISIVEL,
    });
    expect(d).toBe(-8);
  });

  it("não mexe em nada quando já está tudo à vista", () => {
    expect(
      deslocamentoParaOTeclado({
        campo: { top: 120, bottom: 165 },
        accao: { bottom: 240 },
        alturaVisivel: VISIVEL,
      }),
    ).toBe(0);
  });

  it("sem botão nenhum, basta o campo caber", () => {
    expect(
      deslocamentoParaOTeclado({
        campo: { top: 380, bottom: 425 },
        accao: null,
        alturaVisivel: VISIVEL,
      }),
    ).toBe(30); // 425 + 12 − 407
  });
});

describe("o caminho de quem trocou de telemóvel abre-se com o dedo", () => {
  it("o resumo «Mudei de aparelho» tem o alvo de 44 px da casa", async () => {
    montar();
    const uAbrir = userEvent.setup();
    await abrirOFormulario(uAbrir);
    const resumo = screen.getByText(/^Mudei de aparelho$/i);
    // Media 293×16 px a 375×667 — a altura da própria letra —, e é a única
    // porta para as instruções de registo de um aparelho novo.
    expect(resumo.tagName).toBe("SUMMARY");
    expect(resumo).toHaveClass("alvo-toque");
  });
});

describe("a recusa aparece onde os olhos já estão", () => {
  it("a falha do aparelho fica junto ao botão do aparelho, e não lá em baixo", async () => {
    const u = userEvent.setup();
    passkeys.entrar.mockRejectedValueOnce(
      Object.assign(new Error("Serviço de passkeys indisponível."), { name: "Error" }),
    );
    montar();
    await u.click(screen.getByRole("button", { name: /Entrar com a chave de acesso/i }));
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/indisponível/i);
    // Medido: no sítio antigo — dentro do formulário — a mensagem nascia aos
    // 782,8 px num ecrã de 667. Tem de vir ANTES do formulário no documento.
    const formulario = campoDaSenha().closest("form")!;
    expect(
      aviso.compareDocumentPosition(formulario) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(formulario.contains(aviso)).toBe(false);
  });

  it("a recusa da palavra-passe continua dentro do formulário, por cima do botão", async () => {
    const u = userEvent.setup();
    servir({ ok: false, status: 401, body: { error: "Credenciais incorretas" } });
    montar();
    await abrirOFormulario(u);
    await u.type(screen.getByLabelText(/^Email$/i), "ninguem@exemplo.pt");
    await u.type(campoDaSenha(), "errada-de-certeza{Enter}");
    const aviso = await screen.findByRole("alert");
    const formulario = campoDaSenha().closest("form")!;
    expect(formulario.contains(aviso)).toBe(true);
    const submeter = screen.getByRole("button", { name: /^Entrar$/i });
    expect(aviso.compareDocumentPosition(submeter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("submeter a palavra-passe limpa a recusa que tinha vindo do aparelho", async () => {
    const u = userEvent.setup();
    passkeys.entrar.mockRejectedValueOnce(new Error("Serviço de passkeys indisponível."));
    montar();

    /*
      A ORDEM importa, e mudou. Antes os dois caminhos estavam abertos ao mesmo
      tempo e dava para tentar a chave com o formulário à vista. Agora são dois
      estados: tenta-se a chave no A, e só depois se abre o B.

      Escrito ao contrário, o clique em «Entrar com a chave de acesso» apanhava
      o LINK de regresso do estado B em vez do botão do estado A — e voltava
      para trás em vez de tentar entrar.
    */
    await u.click(screen.getByRole("button", { name: /Entrar com a chave de acesso/i }));
    await screen.findByRole("alert");

    await abrirOFormulario(u);
    servir({ ok: false, status: 401, body: { error: "Credenciais incorretas" } });
    await u.type(screen.getByLabelText(/^Email$/i), "ninguem@exemplo.pt");
    await u.type(campoDaSenha(), "errada{Enter}");
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Credenciais incorretas");
    expect(campoDaSenha().closest("form")!.contains(aviso)).toBe(true);
  });
});
