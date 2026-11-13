// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import TagsField from "./TagsField";
import type { Quote } from "@/lib/orcamento/types";

/**
 * DUAS ETIQUETAS SEGUIDAS, E A PRIMEIRA A FALHAR.
 *
 * A gravação é optimista com reversão: mostra já, e repõe se o servidor
 * recusar. O que fazia era repor o estado de ANTES da SUA gravação — e duas
 * etiquetas escritas a seguir uma à outra atropelam-se: a segunda já mandou ao
 * servidor a lista com as DUAS e foi aceite, mas a primeira, ao falhar, repunha
 * o ecrã (e a cópia do pedido no painel) como estava antes das duas. Ficavam
 * apagadas do ecrã etiquetas que o servidor tinha guardado, e a etiqueta
 * seguinte gravava por cima da lista já sem elas.
 */

const quote = { id: "q1", name: "Ana e Rui", tags: [] as string[] } as unknown as Quote;

/** A forma mínima de uma resposta: o `porqueFalhou` lê o estado e o corpo, e
 *  uma recusa sem estado nenhum não distingue a sessão expirada do servidor em
 *  baixo — que é exactamente a distinção que ele existe para fazer. */
type RespostaFalsa = { ok: boolean; status: number; json: () => Promise<unknown> };

/** Cada PATCH fica pendurado até o teste decidir se resultou. */
let porResponder: ((res: RespostaFalsa) => void)[] = [];
const fetchMock = vi.fn(() => new Promise<RespostaFalsa>((resolve) => porResponder.push(resolve)));

beforeEach(() => {
  porResponder = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Responde a um PATCH e deixa as promessas correrem até ao fim. */
async function responder(indice: number, ok: boolean) {
  await act(async () => {
    porResponder[indice]({ ok, status: ok ? 200 : 503, json: async () => null });
  });
}

describe("TagsField com duas gravações ao mesmo tempo", () => {
  it("uma gravação falhada não apaga a etiqueta seguinte, que resultou", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <TagsField quote={quote} suggestions={[]} onChange={onChange} />
      </ToastProvider>,
    );

    const campo = screen.getByLabelText("Etiquetas");
    await user.type(campo, "VIP{Enter}");
    await user.type(campo, "Urgente{Enter}");

    // A primeira morre numa ligação que caiu; a segunda parte a seguir com as
    // DUAS etiquetas e é aceite.
    await responder(0, false);
    await responder(1, true);

    expect(screen.getByText("VIP")).toBeTruthy();
    expect(screen.getByText("Urgente")).toBeTruthy();
    // E o pedido, no painel à volta, fica com o mesmo que o servidor tem.
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(["VIP", "Urgente"]);
  });

  it("falhando a última, repõe o que o servidor tem — e não o que nunca lá chegou", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <TagsField quote={quote} suggestions={[]} onChange={onChange} />
      </ToastProvider>,
    );

    const campo = screen.getByLabelText("Etiquetas");
    await user.type(campo, "VIP{Enter}");
    await user.type(campo, "Urgente{Enter}");

    // Nenhuma das duas chegou ao servidor: o ecrã tem de voltar ao que ele tem.
    await responder(0, false);
    await responder(1, false);

    expect(screen.queryByText("VIP")).toBeNull();
    expect(screen.queryByText("Urgente")).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([]);
    // E o aviso diz as três coisas: a etiqueta pelo nome, o porquê, e que a
    // lista RECUOU no ecrã — sem esta última, ela vê a etiqueta sumir-se e não
    // liga o aviso ao que acabou de ver.
    const aviso = screen.getByRole("alert").textContent ?? "";
    expect(aviso).toContain("Urgente");
    expect(aviso).toMatch(/não está a aceitar gravações/);
    expect(aviso).toMatch(/voltou à que está gravada/);
  });
});

/**
 * N.º 14 da auditoria de 13/11: as duas gravações partiam ao mesmo tempo e
 * podiam chegar ao servidor pela ordem errada — a lista só com «VIP» gravava
 * por cima da lista com as duas, e o servidor ficava sem «Urgente».
 */
describe("TagsField grava pela ordem em que ela escreveu", () => {
  it("n.º 14: a segunda gravação só parte depois de a primeira responder", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TagsField quote={quote} suggestions={[]} onChange={vi.fn()} />
      </ToastProvider>,
    );
    const campo = screen.getByLabelText("Etiquetas");
    await user.type(campo, "VIP{Enter}");
    await user.type(campo, "Urgente{Enter}");

    // Só UMA no ar: a segunda espera.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await responder(0, true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const corpos = (fetchMock.mock.calls as unknown as [string, RequestInit][]).map(
      ([, init]) => JSON.parse(String(init.body)).tags,
    );
    expect(corpos).toEqual([["VIP"], ["VIP", "Urgente"]]);
    await responder(1, true);
  });
});
