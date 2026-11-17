import { describe, expect, it } from "vitest";
import { corpoLido, type CorpoDoPedido } from "@/lib/orcamento/envio/ler-o-corpo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «SÓ WHATSAPP» NÃO PODE VIRAR «NÃO ENVIAR» PARA QUEM NÃO PEDIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A rota do estúdio passou a aceitar `porEmail`. É o campo mais perigoso que
 * esta casa tem: se um dia a leitura dele mudar de sentido, o efeito não é um
 * ecrã torto — é uma proposta que ela julga ter enviado e que nunca saiu, e só
 * se descobre quando o casal telefona a perguntar.
 *
 * Por isso a regra é assimétrica e está guardada aqui: **só um `false`
 * explícito cala o email.** Ausente, `undefined`, `null`, `0`, `""`, `"false"`
 * — tudo isso continua a enviar. É o contrário do que um `Boolean(x)` faria, e
 * é de propósito: todos os pedidos anteriores a este campo existir não o
 * trazem, e nenhum deles pode deixar de enviar por causa disso.
 */

/** A leitura que a rota faz — a VERDADEIRA, e não uma cópia dela
 *  (`lib/orcamento/envio/ler-o-corpo.ts`, desde a fase 5). */
const querEmail = (corpo: { porEmail?: unknown } | null) =>
  corpoLido(corpo as CorpoDoPedido | null).porEmail;

describe("por onde a proposta segue", () => {
  it("sem o campo, envia — como sempre enviou", () => {
    expect(querEmail({})).toBe(true);
    expect(querEmail(null)).toBe(true);
  });

  it("só um `false` a sério cala o email", () => {
    expect(querEmail({ porEmail: false })).toBe(false);
  });

  it("nada do que PARECE falso cala o email", () => {
    /* Um `Boolean(x)` aqui deitava fora envios por causa de um `undefined` que
       veio de um cliente antigo, de um `0` de um corpo mal montado, ou de um
       `"false"` que atravessou um formulário. A pergunta é «pediram-me para
       NÃO enviar?», e a resposta a essa pergunta é `false` e mais nada. */
    for (const valor of [undefined, null, 0, "", "false", "no", NaN]) {
      expect(querEmail({ porEmail: valor }), `«${String(valor)}» não pode calar o email`).toBe(
        true,
      );
    }
  });

  it("`true` envia, obviamente", () => {
    expect(querEmail({ porEmail: true })).toBe(true);
  });
});
