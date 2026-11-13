import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("imapflow", () => ({ ImapFlow: class {} }));

import {
  esquecerVerificacoes,
  estadoDaEntrega,
  pesquisaDoGmail,
  ultimoEnvio,
} from "./email-devolvido";

const AGORA = Date.parse("2026-11-09T22:30:00Z");
const pedido = {
  id: "TESTE-1",
  email: "Vanessa.Rodrigues@addecco.com",
  activityLog: [] as { id: string; at: string; kind: "proposal_sent"; summary: string }[],
};
const envio = { enviadoEm: "2026-11-09T22:22:00Z", para: "Vanessa.Rodrigues@addecco.com" };

beforeEach(() => esquecerVerificacoes());

describe("ultimoEnvio", () => {
  it("o envio da proposta, com o endereço para onde foi de facto", () => {
    expect(ultimoEnvio(pedido, [envio], AGORA)).toEqual({ em: envio.enviadoEm, para: envio.para });
  });
  // Achado n.º 6 da auditoria 6: o mapa enviado à quinta, um lembrete por
  // WhatsApp ou uma mensagem que não saiu escondiam a devolução da proposta.
  it("só conta o que foi mesmo por email ao cliente", () => {
    const comRuido = {
      ...pedido,
      activityLog: [
        {
          id: "a1",
          at: "2026-11-09T22:25:00Z",
          kind: "message_sent" as const,
          summary: "Mapa de mesas enviado por email a quinta@exemplo.pt",
        },
      ],
      messages: [
        { at: "2026-11-09T22:26:00Z", body: "Não saiu", emailed: false },
        { at: "2026-11-09T22:27:00Z", body: "Antiga, sem o campo" },
      ],
    };
    expect(ultimoEnvio(comRuido, [envio], AGORA)).toEqual({
      em: envio.enviadoEm,
      para: envio.para,
    });
    // Uma mensagem que saiu conta, com o endereço para onde foi.
    const saiu = {
      ...comRuido,
      messages: [
        ...comRuido.messages,
        { at: "2026-11-09T22:28:00Z", body: "Saiu", emailed: true, para: "ana@x.pt" },
      ],
    };
    expect(ultimoEnvio(saiu, [envio], AGORA)).toEqual({
      em: "2026-11-09T22:28:00Z",
      para: "ana@x.pt",
    });
  });
  it("sem envio nos últimos 7 dias não há nada a verificar (não se lê a caixa)", () => {
    const antigo = { ...envio, enviadoEm: "2026-10-20T10:00:00Z" };
    expect(ultimoEnvio(pedido, [antigo], AGORA)).toBeNull();
  });
});

describe("estadoDaEntrega — o caso dela (9/11)", () => {
  it("o aviso de «Endereço não encontrado» na caixa → devolvido", async () => {
    const procurar = vi.fn(async () => [{ em: "2026-11-09T22:22:40Z" }]);
    const r = await estadoDaEntrega(pedido, [envio], procurar, AGORA);
    expect(r).toEqual({ estado: "devolvido", endereco: envio.para, em: "2026-11-09T22:22:40Z" });
    expect(procurar).toHaveBeenCalledWith(pesquisaDoGmail(envio.para, envio.enviadoEm));
  });

  it("sem aviso → sem devolução, e a segunda abertura não volta a ler a caixa", async () => {
    const procurar = vi.fn(async () => []);
    await estadoDaEntrega(pedido, [envio], procurar, AGORA);
    const r = await estadoDaEntrega(pedido, [envio], procurar, AGORA + 60_000);
    expect(r.estado).toBe("sem-devolucao");
    expect(procurar).toHaveBeenCalledTimes(1);
  });

  it("sem envio recente não toca na caixa", async () => {
    const procurar = vi.fn(async () => []);
    expect((await estadoDaEntrega(pedido, [], procurar, AGORA)).estado).toBe("sem-envio-recente");
    expect(procurar).not.toHaveBeenCalled();
  });

  it("sem acesso à caixa diz «não verificado» — nunca um falso «chegou»", async () => {
    const procurar = vi.fn(async () => {
      throw new Error("sem-credenciais");
    });
    const r = await estadoDaEntrega(pedido, [envio], procurar, AGORA);
    expect(r).toEqual({
      estado: "nao-verificado",
      porque: "O site ainda não tem acesso à caixa de correio.",
    });
  });
});

describe("pesquisaDoGmail", () => {
  it("procura os avisos de entrega falhada com o endereço, a partir do envio", () => {
    const q = pesquisaDoGmail("a@b.com", "2026-11-09T22:22:00Z");
    expect(q).toContain("from:(mailer-daemon OR postmaster)");
    expect(q).toContain('"a@b.com"');
    expect(q).toMatch(/after:\d+$/);
  });
});
