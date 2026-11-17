// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * O motor chega por `import()`. Numa rede que falha, ou depois de uma
 * publicação nova que apagou o pedaço antigo, esse `import()` é recusado
 * (ChunkLoadError) — e uma promessa recusada sem `.catch` sobe a
 * `unhandledrejection`, que o site manda para `/api/erro-do-site`. Sem motor
 * a superfície fica com a tinta: não é um erro, não se reporta.
 */
vi.mock("@/lib/liquid-glass", () => {
  throw new Error("ChunkLoadError: Loading chunk 43l6cwtg40uz- failed.");
});

import { Glass } from "./Glass";

afterEach(cleanup);

describe("o motor que não chega", () => {
  it("não deixa uma promessa recusada por apanhar, e a superfície fica sem vidro", async () => {
    const recusadas: unknown[] = [];
    const apanhar = (e: unknown) => recusadas.push(e);
    process.on("unhandledRejection", apanhar);
    try {
      const { container } = render(<Glass superficie="painel">olá</Glass>);
      await new Promise((r) => setTimeout(r, 50));
      const el = container.querySelector<HTMLElement>(".lg")!;
      expect(el.style.backdropFilter).toBe("");
      expect(recusadas).toEqual([]);
    } finally {
      process.off("unhandledRejection", apanhar);
    }
  });
});
