import { describe, expect, it } from "vitest";
import { desfechoDoEnvio } from "./desfecho-do-envio";

const base = { aviso: null, canal: "email" as const, abriuOWhatsApp: false };

describe("o desfecho do envio diz o que aconteceu, e por esta ordem", () => {
  it("sem resposta, não saiu — e diz que o email não saiu", () => {
    expect(desfechoDoEnvio({ ...base, resposta: null })).toEqual({
      saiu: false,
      mensagem: "A proposta foi gravada mas o EMAIL NÃO SAIU — o cliente não recebeu nada.",
      tipo: "error",
    });
  });

  it("o email que não saiu usa a razão do servidor, mesmo com uma foto em falta", () => {
    const r = desfechoDoEnvio({
      ...base,
      aviso: "falta 1 foto",
      resposta: { emailed: false, emailError: "O SMTP não respondeu." },
    });
    expect(r).toEqual({ saiu: false, mensagem: "O SMTP não respondeu.", tipo: "error" });
  });

  it("o WhatsApp escolhido e marcado como enviada conta como ter seguido", () => {
    const r = desfechoDoEnvio({
      ...base,
      canal: "whatsapp",
      abriuOWhatsApp: true,
      resposta: { semEmailPorEscolha: true, estado: "enviada" },
    });
    expect(r.saiu).toBe(true);
    expect(r.mensagem).toMatch(/^Proposta pronta — o WhatsApp abriu/);
  });

  it("sem a janela do WhatsApp, aponta para o botão que falta", () => {
    const r = desfechoDoEnvio({
      ...base,
      canal: "whatsapp",
      resposta: { semEmailPorEscolha: true, estado: "enviada" },
    });
    expect(r.mensagem).toBe("Proposta pronta — falta mandá-la: é o botão «Mandar por WhatsApp».");
  });

  it("um envio repetido diz o aviso do servidor", () => {
    expect(
      desfechoDoEnvio({ ...base, resposta: { emailed: true, repetidoAviso: "Já tinha seguido." } }),
    ).toEqual({ saiu: true, mensagem: "Já tinha seguido.", tipo: "success" });
  });

  it("os problemas depois de sair juntam-se, e o PDF incompleto vem no fim", () => {
    const r = desfechoDoEnvio({
      ...base,
      aviso: "falta 1 foto",
      resposta: {
        emailed: true,
        docError: "Não gravou.",
        docSaved: false,
        estadoError: "Estado por marcar.",
      },
    });
    expect(r).toEqual({
      saiu: true,
      mensagem: "Não gravou. Estado por marcar. No PDF que seguiu, falta 1 foto.",
      tipo: "error",
    });
  });

  it("o erro do documento só conta quando ele não ficou gravado", () => {
    const r = desfechoDoEnvio({
      ...base,
      resposta: { emailed: true, docError: "x", docSaved: true },
    });
    expect(r).toEqual({ saiu: true, mensagem: "Proposta enviada ao cliente", tipo: "success" });
  });
});
