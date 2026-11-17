// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PedidoRelampago, { RELAMPAGO_PT } from "./PedidoRelampago";

/**
 * O FORMULÁRIO DE QUATRO CAMPOS DOS ANÚNCIOS SOCIAIS.
 *
 * Corre no browser interno do Instagram, onde a rede é pior e a paciência
 * menor. Prende-se aqui o mesmo que no irmão do Google: o motivo real do 400
 * chega ao ecrã, a validação nativa continua ligada, o campo-armadilha manda os
 * gestores de senhas embora, e o envio leva um `submissionId` para o segundo
 * toque no botão não dar dois pedidos e dois emails.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/meta/enviar", () => ({
  meta: { comecouFormulario: vi.fn(), lead: vi.fn(() => "evt-1") },
}));

function montar() {
  return render(<PedidoRelampago locale="pt" textos={RELAMPAGO_PT} contexto="s/comporta" />);
}

function preencherESubmeter(container: HTMLElement, contacto = "ana@exemplo.pt") {
  fireEvent.change(screen.getByLabelText(/data do casamento/i), {
    target: { value: "2030-06-12" },
  });
  fireEvent.change(screen.getByLabelText(/^onde$/i), { target: { value: "Évora" } });
  fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: "Ana Dias" } });
  fireEvent.change(screen.getByLabelText(/^contacto$/i), { target: { value: contacto } });
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

describe("PedidoRelampago — o erro que se lê", () => {
  it("mostra o motivo que o servidor manda no 400, e não o texto genérico", async () => {
    respostas.push({ ok: false, corpo: { error: "Nome demasiado curto" } });
    const { container } = montar();
    preencherESubmeter(container);

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("Nome demasiado curto");
    expect(aviso).not.toHaveTextContent(RELAMPAGO_PT.erro);
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
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(RELAMPAGO_PT.erro);
    expect(aviso).not.toHaveTextContent(/failed to fetch/i);
  });

  it("um contacto que não é telemóvel nem email continua a ter o seu próprio aviso", async () => {
    const { container } = montar();
    preencherESubmeter(container, "12");
    expect(await screen.findByRole("alert")).toHaveTextContent(RELAMPAGO_PT.erroContacto);
    expect(pedidos).toHaveLength(0);
  });
});

describe("PedidoRelampago — a validação do browser", () => {
  it("o formulário NÃO desliga a validação nativa", () => {
    const { container } = montar();
    const form = container.querySelector("form")!;
    expect(form).not.toHaveAttribute("novalidate");
    expect(form.checkValidity()).toBe(false);
  });

  it("o campo do contacto continua a aceitar um telemóvel (não é type=email)", () => {
    montar();
    const contacto = screen.getByLabelText(/^contacto$/i) as HTMLInputElement;
    fireEvent.change(contacto, { target: { value: "919 259 820" } });
    expect(contacto.type).toBe("text");
    expect(contacto.checkValidity()).toBe(true);
  });
});

describe("PedidoRelampago — o campo-armadilha e a repetição", () => {
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
    expect(pedidos[1].submissionId).toBe(pedidos[0].submissionId);
  });

  it("depois de um envio entregue, o identificador sai de cena", async () => {
    const { container } = montar();
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(localStorage.getItem("liquen-orcamento-sid")).toBeNull();
  });
});

describe("PedidoRelampago — o Lead só segue para a Meta com consentimento", () => {
  /**
   * MEDIDO na passagem do site de 9 de outubro: em /s/comporta?fbclid=…, com
   * «Recusar» carregado, o pedido levava `leadEventId` e `metaClick`, e o
   * servidor reenviava o Lead à Conversions API com email, telefone e nome.
   */
  it("com os cookies recusados, não leva o identificador do Lead", async () => {
    localStorage.setItem("liquen-consent", "denied");
    const { container } = montar();
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((pedidos[0].form as Record<string, unknown>).leadEventId).toBe("");
  });

  it("sem escolha nenhuma feita, também não", async () => {
    const { container } = montar();
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((pedidos[0].form as Record<string, unknown>).leadEventId).toBe("");
  });

  it("com os cookies aceites, leva-o — e a deduplicação com o pixel continua a funcionar", async () => {
    localStorage.setItem("liquen-consent", "granted");
    const { container } = montar();
    preencherESubmeter(container);
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((pedidos[0].form as Record<string, unknown>).leadEventId).toBe("evt-1");
  });
});

/**
 * O CAMPO ÚNICO TAMBÉM CONFERE O TELEMÓVEL (pedido dela, 30/10). Sem bandeira
 * (é o desenho do anúncio): sem «+» é português, com «+» é do país do
 * indicativo.
 */
describe("PedidoRelampago — o telemóvel no campo único", () => {
  it("um número português que não existe é recusado aqui, sem pedido", async () => {
    const { container } = montar();
    preencherESubmeter(container, "812 345 678");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Este número não é válido para Portugal (+351).",
    );
    expect(pedidos).toHaveLength(0);
  });

  it("com «+44», é conferido no Reino Unido — e a frase diz qual", async () => {
    const { container } = montar();
    preencherESubmeter(container, "+44 7911 1234");
    expect(await screen.findByRole("alert")).toHaveTextContent(/não é válido para .+ \(\+44\)/);
    expect(pedidos).toHaveLength(0);
  });

  it("um número válido segue em E.164", async () => {
    const { container } = montar();
    preencherESubmeter(container, "912 345 678");
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect((pedidos[0].form as { phone: string }).phone).toBe("+351912345678");
  });
});
