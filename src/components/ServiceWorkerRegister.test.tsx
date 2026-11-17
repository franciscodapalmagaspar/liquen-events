// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

/**
 * Registos de produção, 14/11: «Cannot read properties of undefined (reading
 * 'catch')» em três páginas de `/servicos/…`, com o rasto na coluna do `.catch`
 * do `register`. Um Chrome 106 de um robô troca o `register` por uma função que
 * devolve `undefined`. O site não pode rebentar por isso.
 */
vi.mock("@/lib/onIdle", () => ({
  onIdle: (cb: () => void) => {
    cb();
    return () => undefined;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function comServiceWorker(register: () => unknown) {
  vi.stubEnv("NODE_ENV", "production");
  const sw = { register: vi.fn(register) };
  Object.defineProperty(window.navigator, "serviceWorker", { value: sw, configurable: true });
  return sw;
}

describe("ServiceWorkerRegister", () => {
  it("um `register` que devolve `undefined` não deita a página abaixo", async () => {
    const sw = comServiceWorker(() => undefined);
    const { default: ServiceWorkerRegister } = await import("./ServiceWorkerRegister");
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
    expect(sw.register).toHaveBeenCalledWith("/sw.js");
  });

  it("um `register` que lança também não", async () => {
    comServiceWorker(() => {
      throw new TypeError("bloqueado");
    });
    const { default: ServiceWorkerRegister } = await import("./ServiceWorkerRegister");
    expect(() => render(<ServiceWorkerRegister />)).not.toThrow();
  });

  it("uma recusa da promessa não fica por apanhar", async () => {
    const recusas: unknown[] = [];
    const aoRecusar = (e: PromiseRejectionEvent) => recusas.push(e.reason);
    window.addEventListener("unhandledrejection", aoRecusar);
    const sem = (e: unknown) => recusas.push(e);
    process.on("unhandledRejection", sem);
    try {
      comServiceWorker(() => Promise.reject(new Error("SecurityError")));
      const { default: ServiceWorkerRegister } = await import("./ServiceWorkerRegister");
      render(<ServiceWorkerRegister />);
      await new Promise((r) => setTimeout(r, 10));
      expect(recusas).toEqual([]);
    } finally {
      window.removeEventListener("unhandledrejection", aoRecusar);
      process.off("unhandledRejection", sem);
    }
  });
});
