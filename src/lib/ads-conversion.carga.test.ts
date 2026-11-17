// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GTAG_SRC } from "@/components/GoogleTag";
import { reportLeadConversion } from "./ads-conversion";

const scriptDoGoogle = () => document.querySelector(`script[src="${GTAG_SRC}"]`);

beforeEach(() => {
  scriptDoGoogle()?.remove();
  sessionStorage.clear();
  localStorage.clear();
});

/**
 * A biblioteca do Google entra no primeiro gesto ou passado um prazo (24/10,
 * `agendarGtag`). Uma conversão não espera por isso: quem fecha a página de
 * confirmação sem lhe tocar não pode levar a conversão consigo.
 */
describe("uma conversão carrega o Google logo", () => {
  it("o generate_lead vai para a fila e a biblioteca entra no mesmo instante", () => {
    localStorage.setItem("liquen-consent", "granted");
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    expect(scriptDoGoogle()).toBeNull();
    reportLeadConversion("pedido-teste");
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", { transaction_id: "pedido-teste" });
    expect(scriptDoGoogle()).not.toBeNull();
  });
});

/**
 * Auditoria legal (17/11), achado da revisão: sem «Aceitar», a conversão
 * carregava a biblioteca à força e o `generate_lead` saía para a Google sem
 * cookies (`gcs=G100`), com o IP e a página. Agora não sai nada.
 */
describe("sem consentimento, a conversão não chama a Google", () => {
  it.each([
    ["antes da escolha", null],
    ["depois de «Recusar»", "denied"],
  ])("%s: nem evento, nem biblioteca, nem dados de contacto", (_n, escolha) => {
    if (escolha) localStorage.setItem("liquen-consent", escolha);
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    reportLeadConversion("pedido-sem-consentimento", { email: "ana@exemplo.pt" });
    expect(gtag).not.toHaveBeenCalled();
    expect(scriptDoGoogle()).toBeNull();
  });
});

describe("aceitar depois, na mesma página, ainda conta a conversão", () => {
  const leadsDe = (gtag: ReturnType<typeof vi.fn>, chave: string) =>
    gtag.mock.calls.filter(
      (c) =>
        c[1] === "generate_lead" && (c[2] as { transaction_id?: string })?.transaction_id === chave,
    );

  it("a conversão espera pelo «Aceitar» e segue nessa altura — uma vez", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    reportLeadConversion("pedido-aceite-depois");
    expect(leadsDe(gtag, "pedido-aceite-depois")).toHaveLength(0);
    localStorage.setItem("liquen-consent", "granted");
    window.dispatchEvent(new Event("liquen:consent-changed"));
    window.dispatchEvent(new Event("liquen:consent-changed"));
    expect(leadsDe(gtag, "pedido-aceite-depois")).toHaveLength(1);
    expect(scriptDoGoogle()).not.toBeNull();
  });

  it("e uma recusa desliga a espera", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    reportLeadConversion("pedido-recusado-depois");
    localStorage.setItem("liquen-consent", "denied");
    window.dispatchEvent(new Event("liquen:consent-changed"));
    localStorage.setItem("liquen-consent", "granted");
    window.dispatchEvent(new Event("liquen:consent-changed"));
    expect(leadsDe(gtag, "pedido-recusado-depois")).toHaveLength(0);
  });
});
