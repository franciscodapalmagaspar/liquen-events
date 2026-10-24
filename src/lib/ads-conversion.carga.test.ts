// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { GTAG_SRC } from "@/components/GoogleTag";
import { reportLeadConversion } from "./ads-conversion";

/**
 * A biblioteca do Google entra no primeiro gesto ou passado um prazo (24/10,
 * `agendarGtag`). Uma conversão não espera por isso: quem fecha a página de
 * confirmação sem lhe tocar não pode levar a conversão consigo.
 */
describe("uma conversão carrega o Google logo", () => {
  it("o generate_lead vai para a fila e a biblioteca entra no mesmo instante", () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: typeof gtag }).gtag = gtag;
    expect(document.querySelector(`script[src="${GTAG_SRC}"]`)).toBeNull();
    reportLeadConversion("pedido-teste");
    expect(gtag).toHaveBeenCalledWith("event", "generate_lead", { transaction_id: "pedido-teste" });
    expect(document.querySelector(`script[src="${GTAG_SRC}"]`)).not.toBeNull();
  });
});
