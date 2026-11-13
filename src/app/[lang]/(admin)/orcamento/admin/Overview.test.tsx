// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import BotaoGuardarTudo from "./GuardarTudo";

/**
 * ── O ECRÃ QUE MENTIA ─────────────────────────────────────────────────────
 *
 * "Notas partilhadas com a equipa" e "Guardado automaticamente" eram as duas
 * falsas: o texto ia para o `localStorage` do browser que o escrevia. No
 * telemóvel dela a caixa aparecia vazia e limpar o histórico apagava tudo sem
 * um aviso. A "Meta de receita" tinha o mesmo problema.
 *
 * Estes testes prendem as quatro promessas que substituem aquelas:
 *   1. o que se lê vem do SERVIDOR (é o que faz as notas existirem no telemóvel);
 *   2. o que se escreve VAI para o servidor, com a revisão sobre a qual se
 *      escreveu — e o ecrã só diz "Guardado" depois de o servidor confirmar;
 *   3. o que já estava no browser não se perde: sobe sozinho quando o servidor
 *      está vazio, e quando as duas versões divergem mostram-se AS DUAS;
 *   4. uma gravação que falha GRITA. O silêncio foi o que originou o defeito.
 */

const ROTA = "/api/visao-geral";

// ── Servidor de mentira ───────────────────────────────────────────────────
interface Campo {
  id: string;
  value: string;
  revision: number;
  updatedAt: string;
}
const campo = (id: string, value: string, revision: number): Campo => ({
  id,
  value,
  revision,
  updatedAt: "2026-07-30T14:32:00.000Z",
});

const servidor = {
  notas: campo("notas", "", 0),
  meta: campo("meta", "", 0),
};

/** Pedidos PUT observados, para se poder afirmar o que foi (ou não) gravado. */
let gravacoes: { id: string; value: string; baseRevision: number }[] = [];
/** Próxima resposta de gravação a forçar: "rede" (falha) ou 409. */
let proximaFalha: "rede" | "conflito" | null = null;
/** Falhar a leitura inicial. */
let leituraFalha = false;

const resposta = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers({ ETag: 'W/"visao-geral"' }),
  json: async () => body,
});

function instalarFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith(ROTA)) {
        if (init?.method === "PUT") {
          const corpo = JSON.parse(String(init.body)) as {
            id: "notas" | "meta";
            value: string;
            baseRevision: number;
          };
          gravacoes.push(corpo);
          if (proximaFalha === "rede") {
            proximaFalha = null;
            throw new TypeError("Failed to fetch");
          }
          if (proximaFalha === "conflito") {
            proximaFalha = null;
            return resposta(
              {
                error: "Isto foi alterado noutro dispositivo. O teu texto NÃO foi gravado.",
                current: servidor[corpo.id],
              },
              409,
            );
          }
          const atual = servidor[corpo.id];
          if (corpo.baseRevision !== atual.revision) {
            return resposta({ error: "conflito", current: atual }, 409);
          }
          servidor[corpo.id] = campo(corpo.id, corpo.value, atual.revision + 1);
          return resposta(servidor[corpo.id]);
        }
        if (leituraFalha) return resposta({ error: "Erro interno" }, 500);
        return resposta({ notas: servidor.notas, meta: servidor.meta });
      }
      // Reminders e Agenda também vão à rede; aqui não interessam.
      return resposta([]);
    }),
  );
}

// ── Um pedido, o mínimo para a Visão Geral não cair no estado de estreia ──
const quotes = [
  {
    id: "q1",
    name: "Casamento da Ana",
    status: "aceite",
    quotedPrice: 5000,
    guests: 80,
    submittedAt: "2026-07-01T10:00:00.000Z",
    lastUpdated: "2026-07-20T10:00:00.000Z",
    payments: [],
  },
] as unknown as Quote[];

function desenhar() {
  return render(
    <Overview
      quotes={quotes}
      userName="Rita"
      onOpen={() => {}}
      onGoStats={() => {}}
      onGo={() => {}}
      onNew={() => {}}
    />,
  );
}

/** A caixa das notas (o cartão), para não confundir com a da meta. */
function cartaoNotas(): HTMLElement {
  return screen.getByRole("heading", { name: "Notas da equipa" }).closest("div")!
    .parentElement as HTMLElement;
}

/**
 * ── O RELÓGIO FICA PARADO, E ISTO NÃO É ZELO A MAIS ───────────────────────
 *
 * Dois testes deste ficheiro afirmam percentagens ("41%", "31%") que o
 * `Overview` calcula sobre a receita GANHA ESTE MÊS. O pedido de mentira aqui
 * em cima tem `lastUpdated: 2026-07-20`, portanto conta como "este mês"
 * enquanto o relógio da máquina estiver em Julho de 2026 — e deixa de contar à
 * meia-noite do dia 1 de Agosto, quando o cálculo passa a dar 0 € e 0%.
 *
 * Foi exactamente isso que aconteceu: a integração contínua esteve verde às
 * 23:4x de 31 de Julho e vermelha às 02:36 de 1 de Agosto, na mesma base de
 * código. O teste não estava frágil por causa de nenhuma alteração — estava
 * a medir o calendário da máquina.
 *
 * Com o relógio fixo em 2026-07-25 os dois testes passam a afirmar o que
 * dizem afirmar, todos os dias do ano.
 */
const AGORA = new Date("2026-07-25T10:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({
    now: AGORA,
    // O `userEvent` e o `waitFor` do Testing Library precisam dos temporizadores
    // e do `queueMicrotask` a correr de verdade; só a DATA é que fica presa.
    toFake: ["Date"],
  });
  servidor.notas = campo("notas", "", 0);
  servidor.meta = campo("meta", "", 0);
  gravacoes = [];
  proximaFalha = null;
  leituraFalha = false;
  localStorage.clear();
  // O Reminders e a Agenda lêem as tarefas e o calendário pela cache
  // partilhada, que vive no MÓDULO e sobreviveria de um teste para o outro —
  // e um teste que conta pedidos tem de começar sempre da mesma folha.
  __resetListCache();
  instalarFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("as notas vêm do servidor", () => {
  it("mostra o que está gravado no servidor — é isto que as faz existir no telemóvel", async () => {
    servidor.notas = campo("notas", "Falar com o fotógrafo até sexta", 4);
    desenhar();
    expect(await screen.findByText("Falar com o fotógrafo até sexta")).toBeInTheDocument();
  });

  it("não inventa notas a partir do browser: o localStorage já não é a fonte", async () => {
    servidor.notas = campo("notas", "A verdade está no servidor", 2);
    localStorage.setItem("liquen-team-notes", "Um resto antigo deste browser");
    desenhar();

    const aviso = await screen.findByRole("alert");
    // O que estava no browser só aparece DENTRO do aviso, como uma das duas
    // versões a decidir — nunca como sendo "as notas".
    expect(
      screen.getAllByText("Um resto antigo deste browser").every((el) => aviso.contains(el)),
    ).toBe(true);
    // O corpo do cartão mostra o que veio do servidor.
    expect(
      screen.getAllByText("A verdade está no servidor").some((el) => !aviso.contains(el)),
    ).toBe(true);
  });

  it("mostra a meta de receita guardada no servidor", async () => {
    servidor.meta = campo("meta", "15000", 1);
    desenhar();
    // O «Preço final» de 5000 € é SEM IVA; o ganho do mês conta-se com IVA,
    // como o resto do dinheiro deste ecrã: 5000 x 1,23 = 6150 de 15000 → 41%.
    expect(await screen.findByText("41%")).toBeInTheDocument();
  });

  it("enquanto lê não diz 'Sem notas.' (isso seria afirmar que não há nenhuma)", async () => {
    desenhar();
    expect(screen.getAllByText("A carregar…").length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByText("Sem notas.")).toBeInTheDocument());
  });
});

describe("gravar", () => {
  it("escrever envia a nota para o servidor com a revisão sobre a qual se escreveu", async () => {
    servidor.notas = campo("notas", "antes", 3);
    desenhar();
    await screen.findByText("antes");

    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /editar/i }));
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "Confirmar o menu vegetariano" },
    });

    await waitFor(() => expect(gravacoes).toHaveLength(1), { timeout: 3000 });
    expect(gravacoes[0]).toEqual({
      id: "notas",
      value: "Confirmar o menu vegetariano",
      baseRevision: 3,
    });
    expect(await screen.findByText(/Guardado no servidor às/)).toBeInTheDocument();
  });

  it("só diz 'Guardado' DEPOIS de o servidor confirmar — antes disso é 'Por guardar…'", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    fireEvent.change(screen.getByLabelText("Notas da equipa"), { target: { value: "Rascunho" } });

    // Ainda dentro do atraso de gravação: nada foi para o servidor.
    expect(gravacoes).toHaveLength(0);
    expect(screen.getByText("Por guardar…")).toBeInTheDocument();
    expect(screen.queryByText(/Guardado no servidor às/)).not.toBeInTheDocument();

    await waitFor(() => expect(screen.getByText(/Guardado no servidor às/)).toBeInTheDocument(), {
      timeout: 3000,
    });
  });

  it("fechar o editor não engole o que ainda estava a caminho", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "Escrever e fechar já" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(gravacoes).toHaveLength(1));
    expect(gravacoes[0].value).toBe("Escrever e fechar já");
  });

  it("a meta vai para o servidor como campo próprio e o editor só fecha depois", async () => {
    desenhar();
    await screen.findByText("Sem meta definida.");
    await userEvent.click(screen.getByRole("button", { name: /definir meta/i }));
    fireEvent.change(screen.getByLabelText("Meta de receita deste mês"), {
      target: { value: "20000" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(gravacoes).toHaveLength(1));
    expect(gravacoes[0]).toEqual({ id: "meta", value: "20000", baseRevision: 0 });
    // 5000 sem IVA = 6150 com IVA, de 20000 → 31%, e o editor fechou.
    expect(await screen.findByText("31%")).toBeInTheDocument();
  });

  it("gravar as notas não deixa o texto no localStorage (deixou de ser onde ele vive)", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "No servidor" },
    });

    await waitFor(() => expect(gravacoes).toHaveLength(1), { timeout: 3000 });
    expect(localStorage.getItem("liquen-team-notes")).toBeNull();
  });
});

describe("o que já estava no browser", () => {
  it("sobe para o servidor quando lá não há nada — e só depois a chave antiga é arquivada", async () => {
    localStorage.setItem("liquen-team-notes", "Notas antigas deste computador");
    desenhar();

    await waitFor(() => expect(gravacoes).toHaveLength(1), { timeout: 3000 });
    expect(gravacoes[0]).toEqual({
      id: "notas",
      value: "Notas antigas deste computador",
      baseRevision: 0,
    });
    expect(await screen.findByText("Notas antigas deste computador")).toBeInTheDocument();
    // A chave antiga sai do sítio onde a aplicação lê, mas fica uma cópia.
    await waitFor(() => expect(localStorage.getItem("liquen-team-notes")).toBeNull());
    expect(localStorage.getItem("liquen-team-notes--copia-local")).toBe(
      "Notas antigas deste computador",
    );
  });

  it("a meta antiga do browser também sobe", async () => {
    localStorage.setItem("liquen-meta-receita", "12000");
    desenhar();
    await waitFor(() => expect(gravacoes).toHaveLength(1), { timeout: 3000 });
    expect(gravacoes[0]).toEqual({ id: "meta", value: "12000", baseRevision: 0 });
  });

  it("se a subida falhar, a chave antiga NÃO é apagada e o texto fica à vista", async () => {
    localStorage.setItem("liquen-team-notes", "Notas que ainda só existem aqui");
    proximaFalha = "rede";
    desenhar();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Não foi possível guardar/);
    // O texto não desaparece do ecrã só porque a gravação falhou…
    expect(screen.getByText("Notas que ainda só existem aqui")).toBeInTheDocument();
    // …e a única cópia que existe continua onde estava.
    expect(localStorage.getItem("liquen-team-notes")).toBe("Notas que ainda só existem aqui");
  });

  it("com texto dos dois lados NÃO escolhe por ela: mostra as duas versões", async () => {
    servidor.notas = campo("notas", "O que está no servidor", 5);
    localStorage.setItem("liquen-team-notes", "O que estava neste browser");
    desenhar();

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/guardadas só neste browser/i);
    expect(within(aviso).getByText("O que estava neste browser")).toBeInTheDocument();
    expect(within(aviso).getByText("O que está no servidor")).toBeInTheDocument();
    // Nada foi gravado por iniciativa própria.
    expect(gravacoes).toHaveLength(0);
    // E nada foi apagado do browser enquanto ela não decide.
    expect(localStorage.getItem("liquen-team-notes")).toBe("O que estava neste browser");
  });

  it("escolher as do browser grava-as por cima, sobre a revisão actual do servidor", async () => {
    servidor.notas = campo("notas", "O que está no servidor", 5);
    localStorage.setItem("liquen-team-notes", "O que estava neste browser");
    desenhar();

    await userEvent.click(await screen.findByRole("button", { name: /guardar as deste browser/i }));
    await waitFor(() => expect(gravacoes).toHaveLength(1));
    expect(gravacoes[0]).toEqual({
      id: "notas",
      value: "O que estava neste browser",
      baseRevision: 5,
    });
    await waitFor(() => expect(localStorage.getItem("liquen-team-notes")).toBeNull());
    expect(localStorage.getItem("liquen-team-notes--copia-local")).toBe(
      "O que estava neste browser",
    );
  });

  it("escolher a do servidor não grava nada e guarda a cópia local em vez de a apagar", async () => {
    servidor.notas = campo("notas", "O que está no servidor", 5);
    localStorage.setItem("liquen-team-notes", "O que estava neste browser");
    desenhar();

    await userEvent.click(await screen.findByRole("button", { name: /ficar com a do servidor/i }));
    expect(gravacoes).toHaveLength(0);
    expect(screen.getByText("O que está no servidor")).toBeInTheDocument();
    expect(localStorage.getItem("liquen-team-notes--copia-local")).toBe(
      "O que estava neste browser",
    );
  });

  it("texto igual dos dois lados: a passagem já foi feita, sem pedidos nem avisos", async () => {
    servidor.notas = campo("notas", "Exactamente o mesmo texto", 2);
    localStorage.setItem("liquen-team-notes", "Exactamente o mesmo texto");
    desenhar();

    await screen.findByText("Exactamente o mesmo texto");
    await waitFor(() => expect(localStorage.getItem("liquen-team-notes")).toBeNull());
    expect(gravacoes).toHaveLength(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("quando a gravação falha", () => {
  it("diz que falhou, mantém o texto no ecrã e nunca diz 'Guardado'", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    proximaFalha = "rede";
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "Isto não pode desaparecer" },
    });

    const aviso = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(aviso).toHaveTextContent(/Não foi possível guardar/);
    expect(aviso).toHaveTextContent(/verifica a ligação/i);
    expect(screen.getByLabelText("Notas da equipa")).toHaveValue("Isto não pode desaparecer");
    expect(screen.queryByText(/Guardado no servidor às/)).not.toBeInTheDocument();
  });

  it("o 'Tentar de novo' grava mesmo o texto que tinha falhado", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    proximaFalha = "rede";
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "Segunda tentativa" },
    });
    await screen.findByRole("alert", {}, { timeout: 3000 });

    await userEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    await waitFor(() => expect(gravacoes).toHaveLength(2));
    expect(gravacoes[1].value).toBe("Segunda tentativa");
    expect(await screen.findByText(/Guardado no servidor às/)).toBeInTheDocument();
  });

  it("uma resposta de erro do servidor mostra a razão que ele deu", async () => {
    servidor.notas = campo("notas", "", 0);
    desenhar();
    await screen.findByText("Sem notas.");
    // Uma segunda gravação com uma revisão desactualizada não acontece por si;
    // aqui força-se um 500 na leitura seguinte para provar o caminho do erro.
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    vi.mocked(fetch).mockImplementationOnce(
      async () =>
        resposta({ error: "A base de dados não está ligada nesta instalação." }, 503) as never,
    );
    fireEvent.change(screen.getByLabelText("Notas da equipa"), { target: { value: "x" } });

    const aviso = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(aviso).toHaveTextContent(/base de dados não está ligada/i);
  });

  it("se a LEITURA falhar não finge uma caixa vazia — e o 'Tentar de novo' recupera", async () => {
    leituraFalha = true;
    servidor.notas = campo("notas", "Notas que existem mesmo", 3);
    desenhar();

    const avisos = await screen.findAllByRole("alert");
    expect(avisos[0]).toHaveTextContent(/Não foi possível ler o que está guardado/);
    expect(screen.queryByText("Sem notas.")).not.toBeInTheDocument();

    leituraFalha = false;
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /tentar de novo/i }));
    expect(await screen.findByText("Notas que existem mesmo")).toBeInTheDocument();
  });
});

describe("duas pessoas ao mesmo tempo", () => {
  it("um 409 mostra as duas versões e diz que a minha não foi gravada", async () => {
    servidor.notas = campo("notas", "", 0);
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));

    // Entretanto o outro dispositivo gravou: o servidor está noutra revisão.
    servidor.notas = campo("notas", "O que a outra pessoa escreveu", 1);
    proximaFalha = "conflito";
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "O que eu escrevi" },
    });

    const aviso = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(aviso).toHaveTextContent(/NÃO foi gravado/);
    expect(within(aviso).getByText("O que eu escrevi")).toBeInTheDocument();
    expect(within(aviso).getByText("O que a outra pessoa escreveu")).toBeInTheDocument();
  });

  it("depois do conflito, 'Guardar a minha por cima' usa já a revisão nova", async () => {
    servidor.notas = campo("notas", "", 0);
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));

    servidor.notas = campo("notas", "O que a outra pessoa escreveu", 1);
    proximaFalha = "conflito";
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "O que eu escrevi" },
    });
    await screen.findByRole("alert", {}, { timeout: 3000 });

    await userEvent.click(screen.getByRole("button", { name: /guardar a minha por cima/i }));
    await waitFor(() => expect(gravacoes).toHaveLength(2));
    // A segunda tentativa já parte da revisão que o servidor devolveu no 409 —
    // sem isso ficaria presa a repetir o mesmo conflito para sempre.
    expect(gravacoes[1]).toEqual({ id: "notas", value: "O que eu escrevi", baseRevision: 1 });
    expect(servidor.notas.value).toBe("O que eu escrevi");
  });

  it("'Ficar com a do servidor' descarta a minha e mostra a dele", async () => {
    servidor.notas = campo("notas", "", 0);
    desenhar();
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));

    servidor.notas = campo("notas", "A versão que fica", 1);
    proximaFalha = "conflito";
    fireEvent.change(screen.getByLabelText("Notas da equipa"), { target: { value: "a minha" } });
    await screen.findByRole("alert", {}, { timeout: 3000 });

    await userEvent.click(screen.getByRole("button", { name: /ficar com a do servidor/i }));
    expect(gravacoes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    // O rascunho dela é MESMO largado: ficar no ecrã um texto que já ninguém
    // vai gravar seria repetir a mentira original.
    expect(screen.getByLabelText("Notas da equipa")).toHaveValue("A versão que fica");
    expect(screen.queryByText("Por guardar…")).not.toBeInTheDocument();
  });
});

describe("uma leitura para os dois cartões", () => {
  it("a meta e as notas partilham o mesmo pedido ao servidor", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    const pedidos = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith(ROTA));
    expect(pedidos).toHaveLength(1);
  });

  /**
   * ── O MESMO ECRÃ PEDIA AS TAREFAS TRÊS VEZES ──────────────────────────
   *
   * O Reminders pedia `/api/tarefas` por sua conta, a Agenda pedia outra vez
   * (mais `/api/calendario`), e o aquecimento ocioso do AdminClient pedia as
   * duas uma terceira/segunda vez. Três respostas iguais para desenhar dois
   * cartões lado a lado.
   *
   * Não é o React em modo estrito a duplicar efeitos: são componentes
   * DIFERENTES, cada um com o seu `fetch`. A prova é este teste — corre sem
   * StrictMode e contava três.
   */
  it("o Reminders e a Agenda partilham a leitura das tarefas e do calendário", async () => {
    desenhar();
    await screen.findByText("Sem notas.");
    const contar = (rota: string) =>
      vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith(rota)).length;
    await waitFor(() => expect(contar("/api/tarefas")).toBe(1));
    expect(contar("/api/calendario")).toBe(1);
  });
});

/**
 * ── AS NOTAS DA EQUIPA NO GESTO ÚNICO DO BACK OFFICE ──────────────────────
 *
 * O botão «Guardar tudo» do cabeçalho só pode falar por quem está inscrito no
 * registo. Este cartão é o quinto sítio do back office com trabalho por gravar,
 * e é o que está na vista que abre o dia — deixá-lo de fora era o botão dizer
 * «tudo guardado» com as notas dela por gravar à frente dos olhos.
 */
describe("as notas da equipa e o «Guardar tudo»", () => {
  it("com texto por gravar, o botão do cabeçalho conta-o e grava-o", async () => {
    render(
      <RegistoDeGravacoesProvider>
        <BotaoGuardarTudo />
        <Overview
          quotes={quotes}
          userName="Rita"
          onOpen={() => {}}
          onGoStats={() => {}}
          onGo={() => {}}
          onNew={() => {}}
        />
      </RegistoDeGravacoesProvider>,
    );
    await screen.findByText("Sem notas.");
    await userEvent.click(within(cartaoNotas()).getByRole("button", { name: /adicionar nota/i }));
    fireEvent.change(screen.getByLabelText("Notas da equipa"), {
      target: { value: "Confirmar as cadeiras com o fornecedor" },
    });

    // Antes do atraso da gravação: o trabalho está por gravar, e o botão di-lo.
    const botao = await screen.findByRole("button", { name: /guardar tudo \(1\)/i });
    expect(botao.getAttribute("title") ?? "").toContain("Notas da equipa");

    await userEvent.click(botao);
    await waitFor(() => expect(gravacoes).toHaveLength(1), { timeout: 3000 });
    expect(gravacoes[0].value).toBe("Confirmar as cadeiras com o fornecedor");
    expect(await screen.findByText(/está tudo guardado no servidor/i)).toBeInTheDocument();
  });
});

/**
 * ── «EVENTOS HOJE» CONTA O DIA DE QUEM ESTÁ A OLHAR ───────────────────────
 *
 * O painel abre o dia com uma frase — "Tem 1 evento hoje." — e o "hoje" saía
 * de `toISOString()`, que é UTC. À 00:30 de um dia de Verão em Portugal
 * (UTC+1) a data UTC ainda é a de ontem: o casamento DESSE dia desaparecia da
 * contagem e passava a ser só mais um "esta semana". A janela dos próximos 7
 * dias abria e fechava um dia fora do sítio pela mesma razão.
 */
describe("o dia é o local, não o de UTC", () => {
  const TZ_ORIGINAL = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "Europe/Lisbon";
  });
  afterAll(() => {
    process.env.TZ = TZ_ORIGINAL;
  });

  beforeEach(() => {
    // 00:30 de 15 de Julho em Lisboa = 23:30 de 14 de Julho em UTC.
    vi.setSystemTime(new Date("2026-07-14T23:30:00.000Z"));
  });

  const comEvento = (date: string) => [{ ...quotes[0], id: "q-hoje", date }] as unknown as Quote[];

  it("um casamento marcado para hoje é contado como HOJE", async () => {
    render(
      <Overview
        quotes={comEvento("2026-07-15")}
        userName="Rita"
        onOpen={() => {}}
        onGoStats={() => {}}
        onGo={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText(/1 evento hoje/)).toBeInTheDocument();
  });
});

/**
 * ── A FRASE E O CARTÃO «HOJE» CONTAM COM A MESMA REGRA ────────────────────
 *
 * Auditoria visual de 13/11 (n.º 4): a frase de abertura dizia «Tem 1 evento
 * hoje» e o cartão «Hoje» logo por baixo dizia «Não há eventos». A frase
 * contava QUALQUER pedido com a data de hoje — um «Novo» também —, e o cartão
 * só os aceites ou com proposta enviada. Passaram a ler a mesma função,
 * `contaComoEvento`, em `lib/orcamento/hoje.ts`.
 */
describe("um pedido Novo com a data de hoje não é «1 evento hoje»", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-07-15T10:00:00.000Z"));
  });

  const com = (status: string) =>
    [{ ...quotes[0], id: `q-${status}`, status, date: "2026-07-15" }] as unknown as Quote[];

  it("um pedido Novo (pendente) não entra na frase", async () => {
    render(
      <Overview
        quotes={com("pendente")}
        userName="Rita"
        onOpen={() => {}}
        onGoStats={() => {}}
        onGo={() => {}}
        onNew={() => {}}
      />,
    );
    // A frase existe (há um pedido por responder), mas não fala de eventos.
    expect(await screen.findByText(/1 pedido por responder/)).toBeInTheDocument();
    expect(screen.queryByText(/evento hoje/)).not.toBeInTheDocument();
  });

  it("um aceite entra — na frase E no cartão «Hoje»", async () => {
    render(
      <Overview
        quotes={com("aceite")}
        userName="Rita"
        onOpen={() => {}}
        onGoStats={() => {}}
        onGo={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText(/1 evento hoje/)).toBeInTheDocument();
    expect(screen.getAllByText(/Evento hoje/).length).toBeGreaterThan(0);
  });
});
