// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";

const relatar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/relatar-erro", () => ({ relatarErroPara: relatar }));

import ErrosDoSite from "./ErrosDoSite";

const erro = (filename: string) =>
  new ErrorEvent("error", { message: "rebentou", filename, error: new Error("rebentou") });

beforeEach(() => relatar.mockClear());
afterEach(cleanup);

describe("ErrosDoSite", () => {
  it("conta os erros do nosso código à rota do site", () => {
    render(<ErrosDoSite />);
    window.dispatchEvent(erro(`${location.origin}/_next/static/chunks/a.js`));
    expect(relatar).toHaveBeenCalledTimes(1);
    expect(relatar.mock.calls[0]![0]).toBe("/api/erro-do-site");
  });

  it("ignora os de extensões e de scripts de fora", () => {
    render(<ErrosDoSite />);
    window.dispatchEvent(erro("chrome-extension://abc/content.js"));
    window.dispatchEvent(erro("https://www.googletagmanager.com/gtag/js"));
    window.dispatchEvent(erro(""));
    expect(relatar).not.toHaveBeenCalled();
  });

  it("no máximo cinco por página (um ecrã em ciclo repete o mesmo)", () => {
    render(<ErrosDoSite />);
    for (let i = 0; i < 20; i++) window.dispatchEvent(erro(`${location.origin}/a.js`));
    expect(relatar).toHaveBeenCalledTimes(5);
  });
});
