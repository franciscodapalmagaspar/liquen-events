import { describe, it, expect } from "vitest";
import { pareceEmail } from "./parece-email";

describe("pareceEmail", () => {
  it("aceita a forma algo@algo.algo", () => {
    for (const e of ["a@b.pt", "maria.ze+casamento@quinta-do-x.com", "x@y.co.uk"]) {
      expect(pareceEmail(e), e).toBe(true);
    }
  });

  it("recusa o que não tem essa forma — e o que nem é texto", () => {
    for (const e of ["", "a@b", "@b.pt", "a@.pt", "a b@c.pt", "a@b.pt ", "a@@b.pt", null, 7]) {
      expect(pareceEmail(e), String(e)).toBe(false);
    }
  });
});
