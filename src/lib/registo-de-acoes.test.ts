import { describe, expect, it } from "vitest";
import { deveRegistar } from "./registo-de-acoes";

describe("o que entra no registo de «quem fez o quê» (13/11)", () => {
  it.each([
    ["DELETE", "/api/orcamento/LIQ-1"],
    ["PATCH", "/api/orcamento/LIQ-1"],
    ["POST", "/api/orcamento/LIQ-1/enviar-proposta"],
    ["POST", "/api/admin/equipa"],
    ["PUT", "/api/temas/abc"],
  ])("%s %s regista-se", (m, c) => expect(deveRegistar(m, c)).toBe(true));

  it.each([
    ["GET", "/api/orcamento/LIQ-1"], // ler não muda nada
    ["PUT", "/api/orcamento/LIQ-1/proposta-rascunho"], // grava sozinho a cada segundo
    ["POST", "/api/vitals"],
    ["POST", "/api/cron/backup"],
    ["POST", "/api/admin/login"],
    ["POST", "/api/proposta/abc/escolhas"], // o casal, não a equipa
    ["POST", "/en/qualquer"],
  ])("%s %s não", (m, c) => expect(deveRegistar(m, c)).toBe(false));
});
