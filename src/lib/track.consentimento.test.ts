// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "./track";

/**
 * Auditoria legal (17/11), achado da revisão: sem «Aceitar», os eventos iam
 * para a fila do Google e, num «Aceitar» a meio da visita, a biblioteca
 * mandava-os todos — o que se passou ANTES da escolha seguia para a Google.
 */
describe("track() e o consentimento", () => {
  beforeEach(() => localStorage.clear());

  it("sem consentimento não põe nada na fila da Google", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    track("CTAClick", { origem: "teste" });
    localStorage.setItem("liquen-consent", "denied");
    track("QuoteStart");
    expect(gtag).not.toHaveBeenCalled();
  });

  it("com consentimento, segue", () => {
    localStorage.setItem("liquen-consent", "granted");
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    track("CTAClick", { origem: "teste" });
    expect(gtag).toHaveBeenCalledWith("event", "CTAClick", { origem: "teste" });
  });
});
