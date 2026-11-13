// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { escolher, valorVisivel } from "../../../../../../test/escolher";
import { ToastProvider } from "./Toast";
import GuestList from "./GuestList";
import type { Guest, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DE CONVIDADOS — DUAS CONFIRMAÇÕES SEGUIDAS, E UM RSVP DESCONHECIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── 1. A gravação que falha desfazia a que resultou ────────────────────────
 * O `persist()` guardava a lista INTEIRA antes do pedido e repunha-a no erro:
 *
 *     const snapshot = guests;      // ← a lista como estava neste desenho
 *     setGuests(next); onChange(next);
 *     fetch(…).catch(() => { setGuests(snapshot); onChange(snapshot); });
 *
 * Marcar duas famílias de seguida põe dois PATCH no ar. O segundo leva a lista
 * COMPLETA (já com a primeira alteração dentro), portanto quando o servidor o
 * aceita fica com as duas gravadas. Só que o primeiro, ao falhar, repunha o
 * mundo anterior às DUAS — e apagava do ecrã uma confirmação que o servidor
 * tinha aceite. A partir daí a edição seguinte grava esse ecrã por cima da
 * verdade: a família volta a "Pendente" no papel com que se encomenda o jantar.
 *
 * ── 2. Um `rsvp` fora do mapa levava o back office inteiro ─────────────────
 * `RSVP_META[g.rsvp].color` dá `undefined.color` assim que aparece um valor de
 * fora — uma linha antiga, uma migração, uma correcção feita à mão na base de
 * dados. Isto é um componente de cliente: a excepção não perde a linha, sobe ao
 * limite de erro e substitui o BACK OFFICE TODO pelo ecrã de erro. É a mesma
 * forma (e o mesmo remédio) do `metaFor` em `status-meta.ts`.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const A: Guest = { id: "g1", name: "Família Andrade", party: 4, rsvp: "pendente" };
const B: Guest = { id: "g2", name: "Família Bento", party: 2, rsvp: "pendente" };

const quoteCom = (guestList: Guest[]) => ({ id: "q1", guests: 40, guestList }) as Quote;

function montar(guestList: Guest[], onChange: (g: Guest[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <GuestList quote={quoteCom(guestList)} onChange={onChange} />
    </ToastProvider>,
  );
}

/**
 * O campo do RSVP deixou de ser um `<select>` — é o `ui/Escolha`, um
 * `role="combobox"` com uma lista nossa (ver o cabeçalho desse ficheiro). Por
 * isso já não há `.value` nem `selectOptions`: o que se lê é o RÓTULO que o
 * botão mostra, e o que se faz é abrir e carregar na opção. A tradução vive em
 * `test/escolher.ts`, num sítio só.
 */
const rsvpDe = (nome: string) => screen.getByLabelText(`Estado do RSVP de ${nome}`);
const rsvpVisivel = (nome: string) => valorVisivel(rsvpDe(nome));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Lista de convidados — duas gravações ao mesmo tempo", () => {
  it("a que falha não desfaz a que o servidor aceitou", async () => {
    // O PATCH da Família Andrade fica pendurado e só depois recusa; o da
    // Família Bento responde logo que sim. São dois cliques seguidos.
    let recusarPrimeiro: (() => void) | null = null;
    const primeiroPendente = new Promise<Response>((resolve) => {
      recusarPrimeiro = () => resolve(reply(500, { error: "não deu" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiroPendente : reply(200))),
    );

    const vistoPeloPai: Guest[][] = [];
    const user = userEvent.setup();
    montar([A, B], (g) => vistoPeloPai.push(g));

    await escolher(user, rsvpDe("Família Andrade"), "Confirmado");
    await escolher(user, rsvpDe("Família Bento"), "Recusado");
    await waitFor(() => expect(rsvpVisivel("Família Bento")).toBe("Recusado"));

    // Só agora o servidor recusa o primeiro pedido — que já foi substituído.
    recusarPrimeiro!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      rsvpVisivel("Família Bento"),
      "a recusa que o servidor aceitou desapareceu do ecrã",
    ).toBe("Recusado");
    expect(
      rsvpVisivel("Família Andrade"),
      "a confirmação que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBe("Confirmado");
    // E o pai — que é quem alimenta as métricas e o que se grava a seguir — não
    // pode ficar com a lista de antes das duas.
    expect(vistoPeloPai.at(-1)).toEqual([
      { ...A, rsvp: "confirmado" },
      { ...B, rsvp: "recusado" },
    ]);
  });

  it("uma gravação falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar([A, B]);

    await escolher(user, rsvpDe("Família Andrade"), "Confirmado");

    await waitFor(() => expect(rsvpVisivel("Família Andrade")).toBe("Pendente"));
    // E o aviso diz QUE família ficou por gravar, e que o servidor é que está
    // em baixo — não «Não foi possível guardar a lista de convidados», que era
    // a mesma frase para a rede, para a sessão expirada e para isto.
    const aviso = screen.getByText(/não está a aceitar gravações/);
    expect(aviso).toHaveTextContent("Família Andrade");
    expect(aviso).toHaveTextContent(/repete/i);
  });
});

describe("Lista de convidados — um estado de RSVP que o mapa não conhece", () => {
  it("desenha a linha em vez de deitar o back office abaixo", () => {
    const estranho = {
      id: "g3",
      name: "Família Costa",
      party: 3,
      rsvp: "confirmada",
    } as unknown as Guest;

    expect(() => montar([A, estranho])).not.toThrow();
    expect(screen.getByText("Família Costa")).toBeTruthy();
    // E a contagem de confirmados não pode inventar que este o é.
    expect(screen.getByLabelText("Estado do RSVP de Família Costa")).toBeTruthy();
  });
});
