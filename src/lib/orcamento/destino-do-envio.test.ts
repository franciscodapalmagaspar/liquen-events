import { describe, expect, it } from "vitest";
import { destinoDoEnvio } from "./destino-do-envio";

/** Auditoria de 14/11, n.º 3: com «WhatsApp», a pergunta falava do email. */
const frase = (p: ReturnType<typeof destinoDoEnvio>) => p.map((x) => x.texto).join("");

describe("a pergunta do envio diz o canal e o contacto certos", () => {
  it("email: o email", () => {
    const p = destinoDoEnvio("email", "ana@example.pt", "912345678");
    expect(frase(p)).toBe("Enviar por email para ana@example.pt");
    expect(p.filter((x) => x.contacto).map((x) => x.texto)).toEqual(["ana@example.pt"]);
  });

  it("WhatsApp: o telefone, e nunca o email", () => {
    const p = destinoDoEnvio("whatsapp", "ana@example.pt", "912345678");
    expect(frase(p)).toBe("Enviar por WhatsApp para 912345678");
    expect(frase(p)).not.toContain("ana@example.pt");
  });

  it("os dois: os dois contactos", () => {
    const p = destinoDoEnvio("ambos", "ana@example.pt", "912345678");
    expect(frase(p)).toBe("Enviar por email para ana@example.pt e por WhatsApp para 912345678");
  });

  it("sem telefone no pedido, di-lo em vez de inventar", () => {
    expect(frase(destinoDoEnvio("whatsapp", "ana@example.pt", ""))).toBe(
      "Enviar por WhatsApp para o cliente (o pedido não tem telefone)",
    );
  });
});
