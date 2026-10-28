import { describe, it, expect } from "vitest";
import {
  quoteFormSchema,
  quotePayloadSchema,
  quoteUpdateSchema,
  priceBreakdownSchema,
  pushSubscriptionSchema,
  proposalCreateSchema,
  dataIso,
  firstError,
} from "./validation";

describe("priceBreakdownSchema / quotePayloadSchema", () => {
  const breakdown = {
    basePrice: 1000,
    guestCost: 500,
    packageMultiplier: 1.2,
    locationSurcharge: 0,
    weekendSurcharge: 100,
    seasonSurcharge: 0,
    urgencySurcharge: 0,
    addonsCost: 250,
    subtotal: 1850,
    iva: 425.5,
    total: 2275.5,
    rangeMin: 2000,
    rangeMax: 2500,
    isEstimate: true,
  };

  it("accepts a well-formed breakdown", () => {
    expect(priceBreakdownSchema.safeParse(breakdown).success).toBe(true);
  });

  it("rejects a poisoned breakdown (non-numeric total)", () => {
    expect(priceBreakdownSchema.safeParse({ ...breakdown, total: "9999" }).success).toBe(false);
  });

  it("rejects absurd values (Infinity / out of bounds)", () => {
    expect(priceBreakdownSchema.safeParse({ ...breakdown, subtotal: Infinity }).success).toBe(
      false,
    );
    expect(priceBreakdownSchema.safeParse({ ...breakdown, total: 99_000_000 }).success).toBe(false);
  });

  it("quotePayloadSchema works without a breakdown (simplified form)", () => {
    const r = quotePayloadSchema.safeParse({ form: { name: "Ana", email: "a@x.pt" } });
    expect(r.success).toBe(true);
  });
});

describe("quoteUpdateSchema — admin PATCH values", () => {
  it("accepts a typical partial update", () => {
    const r = quoteUpdateSchema.safeParse({
      status: "cotado",
      quotedPrice: 12500,
      tags: ["VIP"],
      archived: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(quoteUpdateSchema.safeParse({ status: "inventado" }).success).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    expect(quoteUpdateSchema.safeParse({ quotedPrice: "12500" }).success).toBe(false);
  });

  it("accepts null to clear a clearable field", () => {
    expect(quoteUpdateSchema.safeParse({ quotedPrice: null, followUpAt: null }).success).toBe(true);
  });

  it("rejects malformed payments (bad kind, missing amount)", () => {
    const bad = quoteUpdateSchema.safeParse({
      payments: [{ id: "p1", kind: "gorjeta", date: "2026-08-01", paid: true }],
    });
    expect(bad.success).toBe(false);
    const good = quoteUpdateSchema.safeParse({
      payments: [{ id: "p1", kind: "sinal", amount: 500, date: "2026-08-01", paid: true }],
    });
    expect(good.success).toBe(true);
  });

  it("rejects a malformed guest list entry", () => {
    const r = quoteUpdateSchema.safeParse({
      guestList: [{ id: "g1", name: "Rui", party: 0, rsvp: "confirmado" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts checklist and productionPlan as separate item arrays", () => {
    const r = quoteUpdateSchema.safeParse({
      checklist: [{ id: "c1", label: "Confirmar catering", done: false }],
      productionPlan: [{ id: "p1", label: "Sourcing · Encomendar flores", done: true }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a malformed productionPlan item", () => {
    const r = quoteUpdateSchema.safeParse({
      productionPlan: [{ id: "p1", label: "Sourcing", done: "sim" }],
    });
    expect(r.success).toBe(false);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A DURAÇÃO DE UM MOMENTO CHEGA MESMO À BASE DE DADOS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este esquema corre em `.strip()` — o modo por omissão do zod: uma chave que
   * não esteja DECLARADA no `timelineItemSchema` é apagada em silêncio, sem
   * erro e sem 400. Sem a linha `duracao` lá, o ecrã mandava a duração, o
   * servidor respondia 200, e ela voltava no dia seguinte com o guião outra vez
   * sem durações. É o pior defeito possível: parece que funcionou.
   */
  it("mantém a `duracao` de um momento do guião — e não a deita fora em silêncio", () => {
    const r = quoteUpdateSchema.safeParse({
      timeline: [{ id: "t1", time: "09:00", title: "Montagem", owner: "Rita", duracao: 180 }],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.timeline?.[0]).toEqual({
      id: "t1",
      time: "09:00",
      title: "Montagem",
      owner: "Rita",
      duracao: 180,
    });
  });

  it("um guião do modelo antigo — sem `duracao` — continua a passar como está", () => {
    const antigo = [{ id: "t1", time: "09:00", title: "Montagem" }];
    const r = quoteUpdateSchema.safeParse({ timeline: antigo });
    expect(r.success).toBe(true);
    // Nem uma chave `duracao` a nascer do nada: o guião que sobe é o que desceu.
    expect(r.success && r.data.timeline).toEqual(antigo);
  });

  it("recusa uma duração impossível — minutos com casas decimais, negativa, ou maior que um dia", () => {
    const com = (duracao: unknown) =>
      quoteUpdateSchema.safeParse({
        timeline: [{ id: "t1", time: "09:00", title: "Montagem", duracao }],
      }).success;
    expect(com(90)).toBe(true);
    expect(com(0)).toBe(true);
    expect(com(90.5)).toBe(false);
    expect(com(-30)).toBe(false);
    expect(com(24 * 60 + 1)).toBe(false);
    expect(com("90")).toBe(false);
  });
});

describe("quoteFormSchema", () => {
  it("coerces guests and defaults optionals", () => {
    const r = quoteFormSchema.safeParse({ name: "João", email: "j@x.pt", guests: "120" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guests).toBe(120);
      expect(r.data.notes).toBe("");
    }
  });

  it("rejects guests above the sane ceiling", () => {
    const r = quoteFormSchema.safeParse({ name: "João", email: "j@x.pt", guests: 999999 });
    expect(r.success).toBe(false);
  });

  // ── "email OU telefone" ─────────────────────────────────────────────────
  // O email deixou de ser obrigatório para o formulário das variantes sociais
  // poder ter UM campo de contacto em vez de dois — quem chega de um anúncio
  // do Instagram escreve o número, não o email. O que NÃO pode acontecer é
  // gravar-se um pedido sem forma nenhuma de responder: ficaria na lista a
  // parecer trabalho por fazer, para sempre.
  it("aceita um pedido só com telemóvel, sem email", () => {
    const r = quoteFormSchema.safeParse({ name: "João", phone: "919 259 820" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("");
  });

  it("aceita um pedido só com email, sem telefone", () => {
    const r = quoteFormSchema.safeParse({ name: "João", email: "j@x.pt" });
    expect(r.success).toBe(true);
  });

  it("RECUSA um pedido sem email e sem telefone", () => {
    const r = quoteFormSchema.safeParse({ name: "João" });
    expect(r.success).toBe(false);
  });

  it("RECUSA um telefone curto demais para ser um número", () => {
    // "12345" não é contacto nenhum; aceitá-lo seria gravar um pedido que
    // ninguém consegue atender e chamar-lhe sucesso.
    const r = quoteFormSchema.safeParse({ name: "João", phone: "12345" });
    expect(r.success).toBe(false);
  });

  it("continua a VALIDAR o email quando ele vem preenchido", () => {
    // O que caiu foi a obrigatoriedade, não a validação.
    const r = quoteFormSchema.safeParse({ name: "João", email: "isto-não-é-email" });
    expect(r.success).toBe(false);
  });

  it("aceita um número escrito com indicativo e separadores", () => {
    for (const phone of ["+351 919 259 820", "00351919259820", "919.259.820"]) {
      const r = quoteFormSchema.safeParse({ name: "João", phone });
      expect(r.success, `recusou "${phone}"`).toBe(true);
    }
  });

  it("guarda os identificadores da Meta em vez de os descartar em silêncio", () => {
    // O esquema faz `.strip()`: um campo não declarado passava na validação e
    // desaparecia antes da base de dados. A medição ficava vazia sem nada
    // rebentar, que é o pior modo de falhar.
    const r = quoteFormSchema.safeParse({
      name: "João",
      phone: "919259820",
      metaClick: "fbp=fb.1.1.aaa;fbc=fb.1.2.bbb",
      leadEventId: "7d2f1a90-0000-4000-8000-000000000000",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.metaClick).toBe("fbp=fb.1.1.aaa;fbc=fb.1.2.bbb");
      expect(r.data.leadEventId).toBe("7d2f1a90-0000-4000-8000-000000000000");
    }
  });
});

describe("pushSubscriptionSchema", () => {
  it("accepts a well-formed https subscription from a known push service", () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: "http://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(r.success).toBe(false);
  });

  it("rejects an endpoint on an unknown host (SSRF guard)", () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: "https://attacker.example.com/abc",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(r.success).toBe(false);
  });
});

/**
 * ── «VÁLIDA ATÉ INVALID DATE» ──────────────────────────────────────────────
 *
 * A `validUntil` era validada por um COMPRIMENTO (30 caracteres), não por um
 * formato. Um ano com cinco dígitos (o `<input type="date">` do Chrome aceita-o)
 * ou um rascunho restaurado com «31/12/2026» passavam, e a única coisa que os
 * lia depois era `new Date(validUntil + "T12:00:00")` — que dá `Invalid Date` e
 * é assim que sai impresso no email e no PDF do cliente.
 */
describe("dataIso — uma data de calendário, não um comprimento", () => {
  it("aceita uma data real e devolve-a tal e qual", () => {
    expect(dataIso("2026-12-31")).toBe("2026-12-31");
    expect(dataIso(" 2028-02-29 ")).toBe("2028-02-29");
  });

  it("recusa tudo o que dava «Invalid Date» ao cliente", () => {
    for (const mau of [
      "20266-12-31",
      "2026-2-3",
      "31/12/2026",
      "",
      "hoje",
      null,
      undefined,
      20260101,
    ]) {
      expect(dataIso(mau)).toBe("");
    }
  });

  it("recusa um dia que não existe no calendário, em vez de o deixar rodar", () => {
    // `new Date("2026-02-31T12:00:00")` não é inválida: é 3 de março. Uma
    // proposta «válida até 03/03» que ela escreveu como fevereiro é pior do que
    // um erro visível.
    expect(dataIso("2026-02-31")).toBe("");
    expect(dataIso("2026-02-29")).toBe("");
    expect(dataIso("2026-13-45")).toBe("");
  });
});

describe("proposalCreateSchema — a validade", () => {
  const lineItems = [{ description: "Decoração", qty: 1, unitPrice: 1000 }];

  it("aceita a proposta sem validade nenhuma", () => {
    expect(proposalCreateSchema.safeParse({ lineItems }).success).toBe(true);
    expect(proposalCreateSchema.safeParse({ lineItems, validUntil: "" }).success).toBe(true);
    expect(proposalCreateSchema.safeParse({ lineItems, validUntil: "2026-12-31" }).success).toBe(
      true,
    );
  });

  it("recusa uma validade que não é uma data — antes de ela chegar ao email", () => {
    for (const mau of ["20266-12-31", "2026-2-3", "31/12/2026", "2026-02-31"]) {
      const r = proposalCreateSchema.safeParse({ lineItems, validUntil: mau });
      expect(r.success).toBe(false);
      if (!r.success) expect(firstError(r.error)).toMatch(/aaaa-mm-dd/);
    }
  });
});

describe("firstError", () => {
  it("returns the first issue message", () => {
    const r = quoteFormSchema.safeParse({ name: "A", email: "not-an-email" });
    if (!r.success) expect(typeof firstError(r.error)).toBe("string");
  });
});

/** Achado n.º 12: o servidor aceitava datas que não existem e datas passadas. */
describe("quoteFormSchema — a data do evento", () => {
  const com = (date: string) => quoteFormSchema.safeParse({ name: "João", email: "j@x.pt", date });

  it("vazio é «Ainda a definir», e vale", () => {
    expect(com("").success).toBe(true);
  });

  it("um dia que existe, no futuro, vale", () => {
    const daqui = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    expect(com(daqui).success).toBe(true);
  });

  it.each(["2099-02-30", "2099-13-01", "20999-01-01", "amanhã!", "12/06/2099"])(
    "«%s» não é um dia do calendário",
    (v) => {
      const r = com(v);
      expect(r.success).toBe(false);
      expect(JSON.stringify(r.error?.issues)).toContain("Data inválida");
    },
  );

  it("uma data que já passou é recusada, com a razão", () => {
    const r = com("2020-06-10");
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain("já passou");
  });

  it("ontem ainda passa — quem preenche pode estar noutro fuso", () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(com(ontem).success).toBe(true);
  });
});

describe("quoteFormSchema — o formulário completo pede os dois contactos (28/10)", () => {
  const base = { name: "Ana Silva", origem: "completo" as const };
  it("aceita com email e um telemóvel completo", () => {
    expect(
      quoteFormSchema.safeParse({ ...base, email: "ana@exemplo.pt", phone: "+351 912 345 678" })
        .success,
    ).toBe(true);
  });
  it.each([
    [{ email: "", phone: "912345678" }, "email"],
    [{ email: "ana@exemplo.pt", phone: "" }, "phone"],
    [{ email: "ana@exemplo.pt", phone: "91234567" }, "phone"],
    [{ email: "ana@exemplo.pt", phone: "812345678" }, "phone"],
  ])("recusa %o no campo %s", (contacto, campo) => {
    const r = quoteFormSchema.safeParse({ ...base, ...contacto });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].path).toEqual([campo]);
  });
  it("a ficha rápida (sem origem) continua a aceitar só o telemóvel", () => {
    expect(quoteFormSchema.safeParse({ name: "Ana Silva", phone: "912345678" }).success).toBe(true);
  });
  it("uma origem desconhecida é recusada (não liga regras ao calhas)", () => {
    expect(
      quoteFormSchema.safeParse({ ...base, origem: "outra", email: "a@b.pt", phone: "912345678" })
        .success,
    ).toBe(false);
  });
});
