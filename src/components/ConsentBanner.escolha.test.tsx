// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O TOQUE EM «ACEITAR» E EM «RECUSAR» FAZ (auditoria legal, 17/11)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *   · «Aceitar» grava o clique da Meta que ficou em memória desde a entrada
 *     (antes da escolha ele não pode tocar no dispositivo);
 *   · «Recusar» apaga-o de todo o lado e cala a Google e o pixel que já
 *     tenham entrado nesta visita (`ga-disable-<id>`, `fbq('consent','revoke')`).
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/s/comporta" }));

import ConsentBanner from "./ConsentBanner";
import { capturarClique, esquecerClique, META_CLICK_KEY } from "@/lib/meta/click-id";
import { GA4_ID, GOOGLE_ADS_ID } from "./GoogleTag";

const FBCLID = "IwAR_teste_do_aviso_123";

beforeEach(() => {
  esquecerClique();
  localStorage.clear();
  const w = window as unknown as Record<string, unknown>;
  delete w.fbq;
  delete w[`ga-disable-${GA4_ID}`];
  delete w[`ga-disable-${GOOGLE_ADS_ID}`];
});
afterEach(cleanup);

describe("o aviso de cookies e o clique da Meta", () => {
  it("antes de escolher, o fbclid da entrada não está no dispositivo", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta");
    render(<ConsentBanner locale="pt" />);
    expect(JSON.stringify({ ...localStorage })).not.toContain(FBCLID);
  });

  it("«Aceitar» grava-o nessa altura", () => {
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta");
    render(<ConsentBanner locale="pt" />);
    fireEvent.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(localStorage.getItem(META_CLICK_KEY)).toContain(FBCLID);
  });

  it("«Recusar» não o grava, e cala a Google e o pixel desta visita", () => {
    const fbq = vi.fn();
    (window as unknown as { fbq: unknown }).fbq = fbq;
    capturarClique(`?fbclid=${FBCLID}`, "/s/comporta");
    render(<ConsentBanner locale="pt" />);
    fireEvent.click(screen.getByRole("button", { name: "Recusar" }));
    expect(JSON.stringify({ ...localStorage })).not.toContain(FBCLID);
    expect(localStorage.getItem("liquen-consent")).toBe("denied");
    const w = window as unknown as Record<string, unknown>;
    expect(w[`ga-disable-${GA4_ID}`]).toBe(true);
    expect(w[`ga-disable-${GOOGLE_ADS_ID}`]).toBe(true);
    expect(fbq).toHaveBeenCalledWith("consent", "revoke");
  });
});
