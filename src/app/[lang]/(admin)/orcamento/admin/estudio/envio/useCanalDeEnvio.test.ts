// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCanalDeEnvio } from "./canal-de-envio";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("useCanalDeEnvio", () => {
  it("a omissão é o email, como sempre foi", () => {
    const { result } = renderHook(() => useCanalDeEnvio());
    expect(result.current.canal).toBe("email");
  });

  it("lembra-se da última escolha dela", async () => {
    localStorage.setItem("liquen-canal-de-envio", "whatsapp");
    const { result } = renderHook(() => useCanalDeEnvio());
    await waitFor(() => expect(result.current.canal).toBe("whatsapp"));
  });

  it("um valor estranho guardado não é obedecido", () => {
    localStorage.setItem("liquen-canal-de-envio", "pombo-correio");
    const { result } = renderHook(() => useCanalDeEnvio());
    expect(result.current.canal).toBe("email");
  });

  it("escolher grava, e sem armazenamento obedece na mesma", () => {
    const { result } = renderHook(() => useCanalDeEnvio());
    act(() => result.current.escolherCanal("ambos"));
    expect(localStorage.getItem("liquen-canal-de-envio")).toBe("ambos");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cheio");
    });
    act(() => result.current.escolherCanal("whatsapp"));
    expect(result.current.canal).toBe("whatsapp");
  });
});
