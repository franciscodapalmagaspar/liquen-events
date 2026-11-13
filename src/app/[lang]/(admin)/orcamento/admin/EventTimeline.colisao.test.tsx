// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventTimeline from "./EventTimeline";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { escreverHora } from "./escrever-hora";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS PESSOAS NO MESMO GUIÃO, E AS DUAS RECEBIAM 200
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O guião é copiado UMA vez, ao montar, e ao gravar vai INTEIRO: a gravação é
 * «substitui o guião por este», e não «acrescenta este momento».
 *
 * O CENÁRIO, sem corrida nenhuma: ela abre o guião no telemóvel na véspera;
 * ele, no portátil, acrescenta «19:30 Discurso do pai»; ela corrige a hora da
 * cerimónia à noite e manda o guião que copiou de manhã. O momento dele
 * desaparecia, as duas gravações respondiam 200, e ninguém dava pela falta até
 * ao dia — porque este é o papel que se imprime e se entrega à equipa.
 *
 * A correcção é o ecrã DIZER de onde copiou (`base`) e o servidor recusar com
 * 409 quando essa base já não é a que tem. E o 409 não pode ser um beco: o
 * guião do servidor entra no ecrã (é a verdade) e o gesto dela fica ali ao
 * lado, por aplicar, à distância de um clique.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const MOMENTOS: TimelineItem[] = [
  { id: "t1", time: "09:00", title: "Montagem" },
  { id: "t2", time: "17:00", title: "Cerimónia" },
];

/** O que ELE acrescentou no portátil enquanto o telemóvel dela estava aberto. */
const DELE: TimelineItem = { id: "t9", time: "19:30", title: "Discurso do pai" };

const quoteCom = (timeline: TimelineItem[]) => ({ id: "q1", timeline }) as Quote;

function montar(timeline: TimelineItem[], onChange: (i: TimelineItem[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <EventTimeline quote={quoteCom(timeline)} onChange={onChange} />
    </ToastProvider>,
  );
}

/** Os corpos dos PATCH, pela ordem por que saíram. */
function corpos(): { timeline: TimelineItem[]; base?: { timeline?: TimelineItem[] } }[] {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cronograma do dia — de onde a timeline foi copiada", () => {
  it("manda a versão de que partiu, e não a que está a gravar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await waitFor(() => expect(corpos()).toHaveLength(1));

    // A base é o guião de ANTES desta gravação — dois momentos, não um.
    expect(corpos()[0].base?.timeline).toEqual(MOMENTOS);
    expect(corpos()[0].timeline).toEqual([MOMENTOS[1]]);
  });

  it("e a gravação seguinte declara o que a anterior deixou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await waitFor(() => expect(corpos()).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));
    await waitFor(() => expect(corpos()).toHaveLength(2));

    // Sem isto, o segundo pedido declarava a versão de antes do primeiro e o
    // servidor recusava-o — uma colisão inventada, dela consigo própria.
    expect(corpos()[1].base?.timeline).toEqual([MOMENTOS[1]]);
  });
});

describe("Cronograma do dia — um 409 com trabalho por gravar no ecrã", () => {
  const seNaoForBase = () =>
    vi.fn(async () => reply(409, { error: "mudou", current: { timeline: [...MOMENTOS, DELE] } }));

  it("adopta a timeline do servidor sem apagar o que ela tem escrito por gravar", async () => {
    vi.stubGlobal("fetch", seNaoForBase());
    const user = userEvent.setup();
    montar(MOMENTOS);

    // Trabalho por gravar: o momento seguinte já escrito na linha de baixo.
    await user.type(screen.getByPlaceholderText("Momento…"), "Corte do bolo");
    await user.type(screen.getByPlaceholderText("Responsável"), "Rita");
    // E, no meio disso, um gesto que colide.
    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));

    // O guião do servidor entra no ecrã — incluindo o momento DELE.
    expect(await screen.findByText("Discurso do pai")).toBeTruthy();
    expect(screen.getByText("Montagem"), "a remoção recusada ficou aplicada no ecrã").toBeTruthy();
    // E nada do que ela tinha escrito se perdeu.
    expect((screen.getByPlaceholderText("Momento…") as HTMLInputElement).value).toBe(
      "Corte do bolo",
    );
    expect((screen.getByPlaceholderText("Responsável") as HTMLInputElement).value).toBe("Rita");
    // O aviso fica no ecrã (um toast desaparecia) e NOMEIA o gesto travado.
    expect(screen.getByText(/remover «09:00 Montagem» da timeline/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Voltar a aplicar" })).toBeTruthy();
  });

  it("«Voltar a aplicar» põe o gesto dela POR CIMA da dele, sem apagar nenhum", async () => {
    const fetchMock = seNaoForBase();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.type(screen.getByPlaceholderText("Momento…"), "Corte do bolo");
    await escreverHora(user, "21:00");
    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    await screen.findByRole("button", { name: "Voltar a aplicar" });

    // A partir daqui o servidor aceita: é o que acontece quando ela decide.
    fetchMock.mockImplementation(async () => reply(200));
    await user.click(screen.getByRole("button", { name: "Voltar a aplicar" }));
    await waitFor(() => expect(corpos()).toHaveLength(2));

    const gravado = corpos()[1].timeline;
    // O momento dele continua lá E o dela entrou. Reaplicar a lista velha
    // apagava-o — e era isso que o 409 existia para impedir.
    expect(gravado.some((i) => i.title === "Discurso do pai")).toBe(true);
    expect(gravado.some((i) => i.title === "Corte do bolo")).toBe(true);
    // E parte da versão adoptada, não da que colidiu.
    expect(corpos()[1].base?.timeline).toEqual([...MOMENTOS, DELE]);
    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
  });

  it("dois gestos travados pelo mesmo 409 recuperam-se os DOIS, e por ordem", async () => {
    // As respostas até vêm trocadas: a do primeiro gesto chega em último.
    let recusarPrimeira: () => void = () => {};
    const primeiraPendente = new Promise<Response>((resolve) => {
      recusarPrimeira = () =>
        resolve(reply(409, { error: "mudou", current: { timeline: [...MOMENTOS, DELE] } }));
    });
    let n = 0;
    const fetchMock = vi.fn(async () =>
      ++n === 1
        ? primeiraPendente
        : reply(409, { error: "mudou", current: { timeline: [...MOMENTOS, DELE] } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));
    await screen.findByRole("button", { name: "Voltar a aplicar" });
    recusarPrimeira();
    await new Promise((r) => setTimeout(r, 0));

    // Cada gesto é um DELTA: o segundo não contém o primeiro, portanto guardar
    // só o último era perder uma remoção sem ninguém dar por ela.
    expect(screen.getByText(/remover «09:00 Montagem» da timeline/)).toBeTruthy();
    expect(screen.getByText(/remover «17:00 Cerimónia» da timeline/)).toBeTruthy();

    fetchMock.mockImplementation(async () => reply(200));
    await user.click(screen.getByRole("button", { name: "Voltar a aplicar" }));
    await waitFor(() => expect(corpos()).toHaveLength(3));

    // As duas remoções em cima do guião do servidor — e o momento dele fica.
    expect(corpos()[2].timeline).toEqual([DELE]);
  });

  it("o caso feliz continua mudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
    expect(screen.queryByText(/mudou noutro sítio/i)).toBeNull();
  });
});
