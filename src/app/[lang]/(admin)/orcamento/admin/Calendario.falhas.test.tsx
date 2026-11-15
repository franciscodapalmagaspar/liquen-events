// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { CalendarEvent } from "@/lib/orcamento/types";
import { abrirAPerguntaPeloDetalhe } from "./calendario.testkit";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA REMOÇÃO RECUSADA NÃO PODE DESFAZER A QUE PASSOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `deleteEvent` guardava a LISTA INTEIRA antes de partir e, ao falhar,
 * repunha-a tal e qual. Enquanto um DELETE lento está a caminho ela não fica
 * parada — apaga a marcação seguinte, e essa grava bem. Quando o primeiro
 * volta com erro, o `setEvents(instantâneo)` põe as DUAS de volta: a segunda
 * reaparece no calendário apesar de já não existir na base de dados, e o
 * passo seguinte é ela ver uma reunião que ninguém tem, ou apagá-la outra vez.
 *
 * O segundo defeito é a frase. As duas escritas deste ecrã diziam «Não foi
 * possível guardar» e «Não foi possível remover. Tenta novamente.» — a mesma
 * frase para a rede em baixo, para a sessão expirada e para o servidor em
 * baixo, e sem dizer QUE marcação é que ficou por remover.
 */

const hoje = new Date();
/** Um dia do mês que a grelha está a mostrar (é o mês corrente que ela abre). */
const diaDesteMes = (d: number) =>
  `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const PROVA: CalendarEvent = {
  id: "e1",
  date: diaDesteMes(10),
  title: "Prova de bolo",
  kind: "reuniao",
  createdAt: "2026-08-01T09:00:00.000Z",
};
const ENSAIO: CalendarEvent = {
  id: "e2",
  date: diaDesteMes(11),
  title: "Ensaio geral",
  kind: "evento",
  createdAt: "2026-08-01T10:00:00.000Z",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

let recusarAProva: () => void;

beforeEach(() => {
  __resetListCache();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const deleteDaProva = new Promise<Response>((resolve) => {
    recusarAProva = () => resolve(resposta(500, { error: "Erro interno" }));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return Promise.resolve(resposta(200, [PROVA, ENSAIO]));
      }
      // O DELETE da prova fica pendente até o teste o recusar.
      if (String(url).endsWith("/e1")) return deleteDaProva;
      return Promise.resolve(resposta(200, {}));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function montar() {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  return screen.findByLabelText(/Abrir Reunião: Prova de bolo/);
}

/**
 * Remover uma marcação deixou de ser um clique: passa pela pergunta da casa,
 * em vez do `confirm()` do browser — que num alvo de 9 px é onde a pergunta
 * mais falta faz. O que estes testes medem não muda; muda o caminho até lá.
 */
async function removerMesmo(user: ReturnType<typeof userEvent.setup>, alvo: HTMLElement) {
  const caixa = await abrirAPerguntaPeloDetalhe(user, alvo);
  await user.click(within(caixa).getByRole("button", { name: /^Remover$/ }));
}

describe("Calendário — uma remoção que o servidor recusa", () => {
  it("a marcação que foi mesmo apagada não regressa ao calendário", async () => {
    const user = userEvent.setup();
    const prova = await montar();

    // A remoção lenta da prova parte primeiro…
    await removerMesmo(user, prova);
    // … e, à espera dela, o ensaio é removido com sucesso.
    await removerMesmo(user, screen.getByLabelText(/Abrir Evento: Ensaio geral/));
    await waitFor(() => expect(screen.queryByLabelText(/Ensaio geral/)).not.toBeInTheDocument());

    // Só agora o servidor recusa a primeira.
    recusarAProva();

    // A prova volta ao calendário — é a reposição a fazer o seu trabalho.
    expect(await screen.findByLabelText(/Abrir Reunião: Prova de bolo/)).toBeInTheDocument();
    // O ensaio, esse, já não existe na base de dados: ressuscitá-lo no ecrã é
    // mostrar-lhe uma marcação que ninguém tem.
    expect(screen.queryByLabelText(/Ensaio geral/)).not.toBeInTheDocument();
  });

  it("e a frase diz qual marcação, porquê e o que fazer", async () => {
    const user = userEvent.setup();
    const prova = await montar();

    await removerMesmo(user, prova);
    recusarAProva();

    const aviso = await screen.findByText(/não está a aceitar gravações/);
    // Nomeia a coisa…
    expect(aviso).toHaveTextContent("Prova de bolo");
    // …e acaba numa instrução, em vez de «Não foi possível remover.».
    expect(aviso).toHaveTextContent(/repete/i);
  });
});
