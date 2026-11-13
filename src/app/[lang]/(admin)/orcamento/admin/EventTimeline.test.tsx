// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventTimeline from "./EventTimeline";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR DOIS MOMENTOS DO GUIÃO NÃO PODE RESSUSCITAR OS DOIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `persist()` guardava o guião inteiro antes do pedido e repunha-o no erro.
 * Aqui não há confirmação nenhuma a separar dois cliques no × — e o guião
 * limpa-se assim, a correr a lista. Com dois PATCH no ar, o segundo leva o guião
 * COMPLETO (já sem o primeiro momento), portanto o servidor fica com os dois
 * apagados; mas o primeiro, ao falhar, repunha o instante anterior às DUAS
 * remoções e devolvia ao ecrã um momento que já não existe.
 *
 * E é um guião que se imprime e se entrega à equipa na manhã do evento.
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
  { id: "t3", time: "20:00", title: "Jantar" },
];

const quoteCom = (timeline: TimelineItem[]) => ({ id: "q1", timeline }) as Quote;

function montar(timeline: TimelineItem[], onChange: (i: TimelineItem[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <EventTimeline quote={quoteCom(timeline)} onChange={onChange} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cronograma do dia — duas remoções ao mesmo tempo", () => {
  it("a que falha não traz de volta o momento que o servidor apagou", async () => {
    let recusarPrimeira: (() => void) | null = null;
    const primeiraPendente = new Promise<Response>((resolve) => {
      recusarPrimeira = () => resolve(reply(401, { error: "Não autorizado" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiraPendente : reply(200))),
    );

    const vistoPeloPai: TimelineItem[][] = [];
    const user = userEvent.setup();
    montar(MOMENTOS, (i) => vistoPeloPai.push(i));

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));
    await waitFor(() => expect(screen.queryByText("Cerimónia")).toBeNull());

    recusarPrimeira!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      screen.queryByText("Cerimónia"),
      "o guião voltou a mostrar um momento que o servidor já apagou",
    ).toBeNull();
    expect(
      screen.queryByText("Montagem"),
      "a remoção que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBeNull();
    expect(vistoPeloPai.at(-1)).toEqual([MOMENTOS[2]]);
  });

  it("uma remoção falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));

    await waitFor(() => expect(screen.getByText("Cerimónia")).toBeTruthy());
    // A frase nomeia o momento que voltou ao ecrã e diz o que fazer a seguir.
    expect(screen.getByText(/não está a aceitar gravações/)).toBeTruthy();
    expect(screen.getByText(/remover «17:00 Cerimónia» da timeline/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ELA ESCREVE GRAVA-SE SOZINHO, SEM SAIR DO CAMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que eles alterem logo ao mesmo tempo que eu estou a escrever, como
 * está nos números do staff e crianças, e quero que guarde automaticamente.»
 *
 * Antes gravava-se em `blur` ou `Enter`. O texto só existia no ecrã até ela sair
 * do campo — e um separador fechado, um telemóvel que adormece ou um clique na
 * linha ao lado levavam-no, sem um único aviso.
 */
describe("os campos da timeline gravam enquanto se escreve", () => {
  it("escrever e parar grava, sem `blur` e sem `Enter`", async () => {
    const user = userEvent.setup();
    const pedidos: { timeline: TimelineItem[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        pedidos.push(JSON.parse(String(init?.body ?? "{}")));
        return reply(200);
      }),
    );

    montar(MOMENTOS);
    await user.click(screen.getByRole("button", { name: "Montagem" }));
    const campo = await screen.findByLabelText("Editar momento");
    await user.clear(campo);
    await user.type(campo, "Montagem da tenda");

    /* Sem tocar em mais nada: nem `Tab`, nem `Enter`, nem um clique fora. É
       exactamente o que acontece quando ela escreve e olha para a folha ao
       lado. */
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(0), { timeout: 5000 });
    const ultimo = pedidos[pedidos.length - 1].timeline;
    expect(ultimo.find((m) => m.id === "t1")?.title).toBe("Montagem da tenda");
  });

  it("uma frase inteira dá UMA gravação e não uma por tecla", async () => {
    /* O outro lado da mesma moeda: cada gravação leva o guião inteiro e declara
       a versão de que partiu, portanto uma por tecla era pôr dezassete PATCH no
       ar a colidirem uns com os outros — que é como a mensagem «a timeline
       mudou noutro sítio» aparecia sem ninguém lhe ter tocado. */
    const user = userEvent.setup();
    let contagem = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        contagem++;
        return reply(200);
      }),
    );

    montar(MOMENTOS);
    await user.click(screen.getByRole("button", { name: "Cerimónia" }));
    const campo = await screen.findByLabelText("Editar momento");
    await user.clear(campo);
    await user.type(campo, "Cerimónia no jardim de cima");

    await waitFor(() => expect(contagem).toBeGreaterThan(0), { timeout: 5000 });
    // Uma margem, não um número exacto: o que se guarda é que não são vinte.
    expect(contagem).toBeLessThanOrEqual(3);
  });

  it("desistir devolve o campo ao que era, e grava essa reposição", async () => {
    /* «Escape cancela» era verdade enquanto nada tinha sido gravado. Com
       gravação automática deixa de ser: aos 600 ms o que ela escreveu já lá
       está. O Escape passa a DESFAZER — e a gravação da reposição é o que faz
       disso verdade também no servidor, e não só no ecrã. */
    const user = userEvent.setup();
    const pedidos: { timeline: TimelineItem[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        pedidos.push(JSON.parse(String(init?.body ?? "{}")));
        return reply(200);
      }),
    );

    montar(MOMENTOS);
    await user.click(screen.getByRole("button", { name: "Jantar" }));
    const campo = await screen.findByLabelText("Editar momento");
    await user.clear(campo);
    await user.type(campo, "Jantar servido");
    await waitFor(() => expect(pedidos.length).toBeGreaterThan(0), { timeout: 5000 });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      const ultimo = pedidos[pedidos.length - 1].timeline;
      expect(ultimo.find((m) => m.id === "t3")?.title).toBe("Jantar");
    });
    expect(screen.getByRole("button", { name: "Jantar" })).toBeTruthy();
  });
});
