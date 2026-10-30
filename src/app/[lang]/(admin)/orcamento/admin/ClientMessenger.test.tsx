// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientMessenger from "./ClientMessenger";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «E-MAIL NÃO CONFIGURADO» QUANDO O QUE FALTA É O E-MAIL DO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido que entrou por TELEFONEMA tem `email: ""` — o «Novo pedido» só exige
 * o nome. A rota trata disso como deve: grava a mensagem na mesma (é o registo
 * de que ela respondeu), devolve `emailed: false` e, com ela, a frase que diz o
 * que se passou e o que fazer — «Este pedido não tem email … Acrescenta o email
 * do cliente para lhe poderes escrever daqui.» O comentário da rota diz, à
 * letra, que «o ecrã já sabe mostrar essa frase».
 *
 * Só que não sabia: o painel deitava fora o `emailError` e escrevia sempre a
 * sua, «e-mail não configurado». São dois problemas diferentes com duas pessoas
 * diferentes a resolvê-los — «não configurado» manda-a procurar uma definição de
 * servidor de correio que ninguém lhe deu, quando o que falta é um campo do
 * pedido que ela preenche em dois cliques.
 *
 * E dizia-o em cinzento claro, ao lado de um campo já limpo, com o mesmo peso do
 * resto. O cliente não recebeu nada: isso é um ERRO, não uma nota de rodapé — é
 * a mesma decisão (e a mesma razão) do envio da proposta no ProposalStudio.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const QUOTE = { id: "q1", name: "Ana Silva", email: "" } as Quote;

const PORQUE =
  "Este pedido não tem email — a mensagem ficou registada, mas não foi enviada. " +
  "Acrescenta o email do cliente para lhe poderes escrever daqui.";

async function escreverEEnviar(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Mensagem ao cliente"), "Olá");
  await user.click(screen.getByRole("button", { name: /Enviar e-mail/ }));
  // Os dez segundos para cancelar (ver `envio-adiado.ts`): aqui não se espera.
  await user.click(screen.getByRole("button", { name: "Enviar já" }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Mensageiro do cliente — quando o e-mail não sai", () => {
  it("repete a razão que o servidor deu, em vez de inventar outra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, {
          ok: true,
          emailed: false,
          emailError: PORQUE,
          quote: { messages: [{ at: "2026-08-13T10:00:00.000Z", body: "Olá" }] },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<ClientMessenger quote={QUOTE} />);
    await escreverEEnviar(user);

    await waitFor(() => expect(screen.getByText(PORQUE)).toBeTruthy());
    expect(
      screen.queryByText(/e-mail não configurado/),
      "o painel mandou-a procurar uma definição de servidor que não é o problema",
    ).toBeNull();
  });

  it("sem razão do servidor, diz na mesma que o cliente não recebeu nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { ok: true, emailed: false, quote: { messages: [] } })),
    );

    const user = userEvent.setup();
    render(<ClientMessenger quote={QUOTE} />);
    await escreverEEnviar(user);

    await waitFor(() => expect(screen.getByText(/NÃO SAIU/)).toBeTruthy());
  });

  it("quando o e-mail sai, não diz nada — e a mensagem entra no histórico", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(200, {
          ok: true,
          emailed: true,
          quote: { messages: [{ at: "2026-08-13T10:00:00.000Z", body: "Olá" }] },
        }),
      ),
    );

    const user = userEvent.setup();
    render(<ClientMessenger quote={{ ...QUOTE, email: "ana@exemplo.pt" } as Quote} />);
    await escreverEEnviar(user);

    await waitFor(() => expect(screen.getByText("Olá")).toBeTruthy());
    expect(screen.queryByText(/NÃO SAIU/)).toBeNull();
    expect(screen.queryByText(/não foi enviada/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL FECHAVA DUAS VEZES — E O SEGUNDO FECHO DESMENTIA O PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A assinatura da casa (`email-assinatura`) entrou em TODOS os emails ao
 * cliente. Só que estes três modelos já traziam fecho próprio, e o cliente
 * passou a receber os dois colados:
 *
 *     Com os melhores cumprimentos,
 *     Equipa Líquen Events        ← fecho do modelo
 *     --
 *     Catarina Gaspar             ← assinatura da casa
 *     Manager
 *
 * Dois fechos, e o segundo a desmentir o primeiro sobre quem escreveu. Acontecia
 * em todos os envios pelos atalhos, que são os mais usados.
 *
 * A regra que estes testes prendem: a assinatura é a FONTE ÚNICA do fecho —
 * quem escreve o corpo não volta a assiná-lo.
 */
describe("Mensageiro do cliente — quem fecha o email é a assinatura da casa", () => {
  for (const modelo of ["Agradecer pedido", "Marcar reunião", "Seguimento proposta"]) {
    it(`o modelo «${modelo}» já não se despede por cima da assinatura`, async () => {
      const user = userEvent.setup();
      render(<ClientMessenger quote={{ ...QUOTE, email: "ana@exemplo.pt" } as Quote} />);
      await user.click(screen.getByRole("button", { name: modelo }));
      const caixa = screen.getByLabelText("Mensagem ao cliente") as HTMLTextAreaElement;
      expect(caixa.value).not.toMatch(/cumprimentos|Até breve|Equipa Líquen Events/i);
      // E o corpo do modelo continua lá — tirar o fecho não é esvaziar o atalho.
      expect(caixa.value).toMatch(/^Olá Ana,/);
      expect(caixa.value.trim().length).toBeGreaterThan(60);
    });
  }

  /** Tirar o fecho dos modelos não chega: a caixa está vazia à frente dela e o
   *  hábito de assinar é dela, não do atalho. Diz-se aqui, uma vez, ao lado do
   *  sítio onde se escreve. */
  it("diz ao lado da caixa que a assinatura vai sozinha", () => {
    render(<ClientMessenger quote={QUOTE} />);
    expect(screen.getByText(/assinatura da Líquen/i)).toBeTruthy();
  });
});

describe("Mensageiro do cliente — dez segundos para cancelar", () => {
  /**
   * «tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
   * atrás» — um email que saiu não volta, por isso espera antes de sair.
   */
  it("carregar em Enviar NÃO manda logo — mostra a contagem e «Cancelar»", async () => {
    const pedido = vi.fn(async () => reply(200, { ok: true, emailed: true }));
    vi.stubGlobal("fetch", pedido);
    const user = userEvent.setup();
    render(<ClientMessenger quote={QUOTE} />);
    await user.type(screen.getByLabelText("Mensagem ao cliente"), "Olá");
    await user.click(screen.getByRole("button", { name: /Enviar e-mail/ }));
    expect(screen.getByText(/A enviar em 10 s/)).toBeTruthy();
    expect(pedido).not.toHaveBeenCalled();
  });

  it("«Cancelar» não manda nada, e a mensagem fica escrita", async () => {
    const pedido = vi.fn(async () => reply(200, { ok: true, emailed: true }));
    vi.stubGlobal("fetch", pedido);
    const user = userEvent.setup();
    render(<ClientMessenger quote={QUOTE} />);
    await user.type(screen.getByLabelText("Mensagem ao cliente"), "Olá");
    await user.click(screen.getByRole("button", { name: /Enviar e-mail/ }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(pedido).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Mensagem ao cliente") as HTMLTextAreaElement).value).toBe("Olá");
  });

  it("passados os dez segundos, sai sozinha", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const pedido = vi.fn(async () => reply(200, { ok: true, emailed: true }));
      vi.stubGlobal("fetch", pedido);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ClientMessenger quote={QUOTE} />);
      await user.type(screen.getByLabelText("Mensagem ao cliente"), "Olá");
      await user.click(screen.getByRole("button", { name: /Enviar e-mail/ }));
      await vi.advanceTimersByTimeAsync(10_500);
      await waitFor(() => expect(pedido).toHaveBeenCalledTimes(1));
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * O DOMÍNIO DO EMAIL QUE NÃO RECEBE CORREIO (pedido dela, 30/10). A rota
 * recusa com 422 e não regista nada: a frase dela aparece, e o que ela
 * escreveu fica na caixa para seguir quando o email estiver corrigido.
 */
describe("Mensageiro do cliente — o domínio do email não existe", () => {
  it("mostra a frase do servidor e não apaga o que ela escreveu", async () => {
    const frase =
      "O email do cliente não parece existir (o domínio «gmial.con» não recebe email). Corrija-o no pedido antes de enviar.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(422, { error: frase, campo: "email" })),
    );
    const user = userEvent.setup();
    render(<ClientMessenger quote={{ ...QUOTE, email: "ana@gmial.con" } as Quote} />);
    await escreverEEnviar(user);
    await waitFor(() => expect(screen.getByText(frase)).toBeTruthy());
    expect(screen.getByLabelText("Mensagem ao cliente")).toHaveValue("Olá");
  });
});
