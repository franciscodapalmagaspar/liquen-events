// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import Tarefas from "./Tarefas";
import { __resetListCache } from "./useCachedList";

const HOJE = new Date("2026-09-10T09:00:00");

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE A LINHA LÊ MOSTRA-SE ANTES DE ACONTECER — E NÃO PISA O QUE ELA ESCREVEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A extracção em si está provada em `lib/tarefas/linguagem-natural.test.ts`,
 * com 45 casos. O que se prova AQUI é a ponte, e são duas promessas:
 *
 *  1. o que vai ficar gravado aparece à frente dela ANTES do gesto que o grava
 *     — sem isto é uma extracção silenciosa que acerta quase sempre, e os erros
 *     ficam guardados como se fossem verdade;
 *  2. o que ela escreveu à mão nos campos GANHA à leitura — sem isto, escrever
 *     «amanhã» na linha apagava a data que ela tinha acabado de escolher.
 */

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

function montar() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/api/admin/equipa")) return resposta({ ok: true, nomes: [] });
      if ((init?.method ?? "GET") !== "GET") {
        const corpo = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        criadas.push(corpo);
        return resposta({ ...corpo, id: "nova", done: false, createdAt: HOJE.toISOString() });
      }
      return resposta([]);
    }),
  );
  return render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
}

/** O corpo de cada POST — é onde se vê o que a leitura pôs na tarefa. */
let criadas: Record<string, unknown>[] = [];

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  criadas = [];
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a linha de escrever lê o que ela escreve", () => {
  it("mostra o que vai ficar, antes de ela criar", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);
    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Confirmar florista amanhã às 10h #Ana !alta");

    /* A promessa está no ecrã e é legível — não é um ícone nem uma cor.

       E procura-se DENTRO do `role="status"`: «Prioridade» também é o rótulo
       do campo lá de baixo, e um `getByText` solto encontrava os dois e não
       provava nada sobre a pastilha. */
    const promessa = await screen.findByRole("status", { name: "O que a linha vai gravar" });
    expect(promessa.textContent).toContain("Vai ficar com");
    expect(within(promessa).getByText("Quem")).toBeTruthy();
    expect(within(promessa).getByText("Ana")).toBeTruthy();
    expect(within(promessa).getByText("Prioridade")).toBeTruthy();
    expect(within(promessa).getByText("alta")).toBeTruthy();
    // A data também, e por extenso — não «2026-09-11».
    expect(within(promessa).getByText("Quando")).toBeTruthy();
    expect(promessa.textContent).toMatch(/11 set.*10h00/);
  });

  it("«Tal como escrevi» desliga a leitura e o título fica inteiro", async () => {
    /* A saída de uma leitura errada não pode ser «apaga a palavra e reescreve a
       frase à volta dela». */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);
    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Ver a quinta-feira toda");

    await screen.findByRole("status", { name: "O que a linha vai gravar" });
    await user.click(screen.getByRole("button", { name: /Tal como escrevi/ }));
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "O que a linha vai gravar" })).toBeNull(),
    );
  });

  it("uma linha sem nada para ler não mostra pastilha nenhuma", async () => {
    /* O contrário do primeiro caso, e é preciso: um aviso que aparece sempre
       deixa de se ler. */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);
    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Ligar ao fotógrafo");
    expect(screen.queryByRole("status", { name: "O que a linha vai gravar" })).toBeNull();
  });

  it("o que se leu chega ao servidor, e o título vai limpo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);
    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Confirmar florista amanhã às 10h #Ana !alta{Enter}");

    await waitFor(() => expect(criadas).toHaveLength(1));
    const c = criadas[0];
    /* O título vai SEM as expressões: é o que fica na lista, e «Confirmar
       florista amanhã às 10h #Ana !alta» numa linha de lista é ruído.
       A HORA é a excepção (n.º 2 da auditoria de 13/11): o prazo grava-se como
       dia — a coluna é `date`, e um prazo com hora saía de «Hoje» —, e a hora
       fica no título, que é onde ela não se perde. */
    expect(c.title).toBe("Confirmar florista às 10h");
    expect(c.dueDate).toBe("2026-09-11");
    expect(c.assignee).toBe("Ana");
    expect(c.priority).toBe("alta");
  });

  it("o que ela escreveu à mão GANHA à leitura", async () => {
    /* A promessa mais importante das duas. Sem ela, escrever «amanhã» na linha
       apagava a data que ela tinha acabado de escolher no campo de baixo — e
       ela via o seu próprio gesto a ser desfeito por uma palavra. */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);

    const prazo = screen.getByLabelText(/Prazo/i);
    await user.clear(prazo);
    await user.type(prazo, "2026-12-24");

    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Confirmar florista amanhã{Enter}");

    await waitFor(() => expect(criadas).toHaveLength(1));
    expect(criadas[0].dueDate).toBe("2026-12-24");
    // E o título continua limpo: o que a leitura NÃO usa, tira à mesma.
    expect(criadas[0].title).toBe("Confirmar florista");
  });

  it("não promete o que não vai cumprir: prazo à mão esconde a pastilha da data", async () => {
    /* A pastilha e o `add` têm de dizer a MESMA coisa. Com o prazo preenchido à
       mão, a data lida deixa de ser usada — e portanto deixa de se anunciar.
       Mostrá-la era prometer uma coisa e gravar outra, e das duas seria a
       pastilha a parecer o erro, porque é a que está à frente dela. */
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    const abrir = await screen.findAllByRole("button", { name: /Nova tarefa/i });
    await user.click(abrir[abrir.length - 1]);

    const campo = await screen.findByRole("textbox", { name: /tarefa/i });
    await user.type(campo, "Confirmar florista amanhã !alta");
    const promessa = await screen.findByRole("status", { name: "O que a linha vai gravar" });
    expect(within(promessa).getByText("Quando")).toBeTruthy();

    const prazo = screen.getByLabelText(/Prazo/i);
    await user.clear(prazo);
    await user.type(prazo, "2026-12-24");

    /* A data cala-se; a prioridade, que ela não tocou, continua prometida. */
    await waitFor(() => expect(within(promessa).queryByText("Quando")).toBeNull());
    expect(within(promessa).getByText("Prioridade")).toBeTruthy();
  });
});
