// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PedidoRapido, { TEXTOS_PT } from "./PedidoRapido";

/**
 * O FORMULÁRIO QUE RECEBE O TRÁFEGO PAGO.
 *
 * Três coisas se prendem aqui, e todas custavam pedidos verdadeiros:
 *
 *  1. o motivo que o servidor manda no 400 («Email inválido») chega ao ecrã,
 *     em vez do «Não foi possível enviar» que não diz o que corrigir;
 *  2. a validação nativa do browser fica LIGADA, para o campo errado ser
 *     marcado antes de a coisa chegar ao servidor;
 *  3. o campo-armadilha diz aos gestores de senhas para não lhe tocarem, e o
 *     envio leva um `submissionId` para uma repetição não dar dois pedidos.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function montar() {
  return render(<PedidoRapido locale="pt" textos={TEXTOS_PT} contexto="polo:alentejo" />);
}

/** Preenche o que a rota precisa e submete (o `submit` salta a validação do
 *  browser de propósito — o que se mede a seguir é a resposta do servidor). */
function preencherESubmeter(container: HTMLElement, email = "ana@exemplo.pt") {
  fireEvent.change(screen.getByLabelText(/data do casamento/i), {
    target: { value: "2030-06-12" },
  });
  fireEvent.change(screen.getByLabelText(/convidados/i), { target: { value: "120" } });
  fireEvent.change(screen.getByLabelText(/^local$/i), { target: { value: "Évora" } });
  fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: "Ana Dias" } });
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: email } });
  fireEvent.submit(container.querySelector("form")!);
}

const respostas: { ok: boolean; corpo: unknown }[] = [];
const pedidos: Record<string, unknown>[] = [];

beforeEach(() => {
  push.mockClear();
  respostas.length = 0;
  pedidos.length = 0;
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      pedidos.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const r = respostas.shift() ?? { ok: true, corpo: { id: "LIQ-AAA-1" } };
      return { ok: r.ok, status: r.ok ? 200 : 400, json: async () => r.corpo };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PedidoRapido — o erro que se lê", () => {
  it("mostra o motivo que o servidor manda no 400, e não o texto genérico", async () => {
    respostas.push({ ok: false, corpo: { error: "Email inválido" } });
    const { container } = montar();
    preencherESubmeter(container, "ana@exemplo");

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Email inválido");
    expect(aviso).not.toHaveTextContent(TEXTOS_PT.erro);
    // E o botão volta a estar operável para ela corrigir e reenviar.
    expect(screen.getByRole("button", { name: TEXTOS_PT.submeter })).toBeEnabled();
  });

  it("sem mensagem do servidor (rede em baixo) fica o texto genérico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Failed to fetch");
      }),
    );
    const { container } = montar();
    preencherESubmeter(container);
    expect(await screen.findByRole("alert")).toHaveTextContent(TEXTOS_PT.erro);
  });

  it("um abort (25s pendurados) não deita «AbortError» na cara de quem chega", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const e = new Error("The operation was aborted.");
        e.name = "AbortError";
        throw e;
      }),
    );
    const { container } = montar();
    preencherESubmeter(container);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(TEXTOS_PT.erro);
    expect(aviso).not.toHaveTextContent(/abort/i);
  });
});

describe("PedidoRapido — a validação do browser", () => {
  it("o formulário NÃO desliga a validação nativa", () => {
    const { container } = montar();
    const form = container.querySelector("form")!;
    expect(form).not.toHaveAttribute("novalidate");
    // Vazio, o browser recusa submeter — que é o que faltava.
    expect(form.checkValidity()).toBe(false);
  });

  it("um nome em branco é apanhado pelo próprio campo, antes de haver pedido", () => {
    const { container } = montar();
    fireEvent.change(screen.getByLabelText(/data do casamento/i), {
      target: { value: "2030-06-12" },
    });
    fireEvent.change(screen.getByLabelText(/convidados/i), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText(/^local$/i), { target: { value: "Évora" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ana@exemplo.pt" } });
    // Falta só o nome — e é o campo do nome que fica marcado.
    const nome = screen.getByLabelText(/^nome$/i) as HTMLInputElement;
    expect(nome.checkValidity()).toBe(false);
    expect(container.querySelector("form")!.checkValidity()).toBe(false);
  });
});

describe("PedidoRapido — o campo-armadilha e a repetição", () => {
  it("o campo-armadilha manda os gestores de senhas embora", () => {
    montar();
    const armadilha = screen.getByLabelText("Website");
    expect(armadilha).toHaveAttribute("data-1p-ignore");
    expect(armadilha).toHaveAttribute("data-lpignore");
    expect(armadilha).toHaveAttribute("data-form-type", "other");
    expect(armadilha).toHaveAttribute("autocomplete", "off");
  });

  it("envia um submissionId, e o MESMO quando o envio é repetido", async () => {
    respostas.push({ ok: false, corpo: { error: "Erro interno" } });
    const { container } = montar();
    preencherESubmeter(container);
    await screen.findByRole("alert");
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());

    expect(pedidos).toHaveLength(2);
    expect(pedidos[0].submissionId).toBeTruthy();
    // É isto que faz a rota deduplicar: dois envios, um só pedido e um só email.
    expect(pedidos[1].submissionId).toBe(pedidos[0].submissionId);
  });

  it("depois de um envio entregue, o identificador sai de cena", async () => {
    const { container } = montar();
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());
    // Um pedido NOVO mais tarde não pode ser deduplicado contra o que já foi.
    expect(localStorage.getItem("liquen-orcamento-sid")).toBeNull();
  });
});

/**
 * O TELEMÓVEL COM A BANDEIRA (pedido dela, 30/10: «números de telefone seja
 * qual país for»). Um número que não existe no país da bandeira não chega ao
 * servidor; um que existe segue em E.164.
 */
describe("PedidoRapido — o telemóvel", () => {
  const telefone = () => screen.getByLabelText(/^telemóvel/i);

  it("um número que não existe fica no campo, com o erro, e não há pedido", async () => {
    const { container } = montar();
    fireEvent.focus(telefone());
    fireEvent.change(telefone(), { target: { value: "91234" } });
    preencherESubmeter(container);
    expect(
      await screen.findByText("Este número não é válido para Portugal (+351)."),
    ).toBeInTheDocument();
    expect(telefone()).toHaveAttribute("aria-invalid", "true");
    expect(pedidos).toHaveLength(0);
  });

  it("um número estrangeiro colado com o indicativo segue em E.164", async () => {
    const { container } = montar();
    fireEvent.focus(telefone());
    fireEvent.change(telefone(), { target: { value: "+55 11 91234-5678" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /país do número/i })).toHaveAccessibleName(
        "+55, Brasil — País do número",
      ),
    );
    preencherESubmeter(container);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect((pedidos[0].form as { phone: string }).phone).toBe("+5511912345678");
  });
});
