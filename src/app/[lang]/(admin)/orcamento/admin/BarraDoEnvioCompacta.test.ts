import { describe, expect, it } from "vitest";
import type { Impedimento } from "@/lib/proposal-progress";
import { estadoDoEnvio } from "./BarraDoEnvioCompacta";

const falta = (id: string, trava = true) =>
  ({ id, trava, texto: id, seccao: "envio" }) as Impedimento;

describe("estadoDoEnvio — o que a pastilha da barra compacta diz", () => {
  it("conta o que trava, e só o que trava", () => {
    expect(estadoDoEnvio([falta("valor"), falta("email"), falta("x", false)], 0, "pt")).toEqual({
      texto: "Faltam 2",
      trava: true,
    });
    expect(estadoDoEnvio([falta("valor")], 0, "pt").texto).toBe("Falta 1");
  });

  it("quando só falta ver o PDF, conta-o como as outras — o nome «Ver o PDF» é do botão", () => {
    // Não «Ver o PDF»: era o nome do botão ao lado (auditoria de 14/11, n.º 13).
    expect(estadoDoEnvio([falta("visto")], 0, "pt").texto).toBe("Falta 1");
  });

  it("as fotos a entrar vêm primeiro — é uma espera, não um erro dela", () => {
    expect(estadoDoEnvio([falta("valor")], 2, "pt").texto).toBe("Fotos a entrar");
  });

  it("pronto, diz a língua", () => {
    expect(estadoDoEnvio([], 0, "en")).toEqual({ texto: "EN · pronto", trava: false });
  });
});
