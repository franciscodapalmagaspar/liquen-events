// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";
import type { QuoteStatus } from "@/lib/orcamento/types";
import { statusBadge } from "./PastilhaDoEstado";

afterEach(cleanup);

describe("statusBadge — a pastilha do estado, desenhada", () => {
  it("cada estado diz o rótulo da casa", () => {
    for (const estado of Object.keys(ROTULO_DO_ESTADO) as QuoteStatus[]) {
      render(<>{statusBadge(estado)}</>);
      expect(screen.getByText(ROTULO_DO_ESTADO[estado])).toBeTruthy();
      cleanup();
    }
  });

  it("um estado que a casa não conhece aparece tal e qual, em vez de desaparecer", () => {
    render(<>{statusBadge("inventado" as QuoteStatus)}</>);
    expect(screen.getByText("inventado")).toBeTruthy();
  });
});
