import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/orcamento/types";
import { createQuote, generateQuoteId } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { z } from "zod";
import { normalizarTelefone } from "@/lib/contacto-do-pedido";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";
import { getDictionary } from "@/lib/i18n";

export const runtime = "nodejs";

/**
 * Create a quote/event manually from the back-office (e.g. a client who
 * phoned or emailed). Admin-only. No client email is sent.
 */
export async function POST(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // Parse defensively: a malformed or non-object JSON body must yield a clean
  // 400, not an uncaught 500 (an unguarded request.json() throws on bad JSON,
  // and a null/scalar body then blows up the property reads below with a
  // TypeError). Mirrors the public POST and the [id] PATCH route.
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  try {
    // Bound every free-text field (defense-in-depth against storage abuse), the
    // same way the public quote schema does — admin-only, but still validated.
    const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
    // Same bound as `str` but also strips CR/LF — for values that end up in an
    // email header (the recipient address) or that were previously unbounded.
    const strLine = (v: unknown, max: number) =>
      str(v, max)
        .replace(/[\r\n]+/g, " ")
        .trim();
    const name = str(b.name, 120).trim();
    if (!name) {
      return NextResponse.json({ error: "O nome é obrigatório." }, { status: 400 });
    }

    // Price mirrors the bounds the public schema and admin PATCH enforce (finite,
    // 0..10M). A non-numeric entry ("abc" → NaN) or an out-of-range value must
    // never reach the store, or it corrupts revenue maths, exports and the
    // jsonb blob (NaN serialises to null silently). Absent/empty → undefined.
    const money = (v: unknown): number | undefined => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? Math.min(Math.max(n, 0), 10_000_000) : undefined;
    };
    // Only a real QuoteStatus may be persisted — an arbitrary string would break
    // the admin list's status filters and the pipeline stats.
    const STATUSES: readonly Quote["status"][] = [
      "pendente",
      "em_revisao",
      "cotado",
      "aceite",
      "rejeitado",
    ];
    const status: Quote["status"] = STATUSES.includes(b.status) ? b.status : "em_revisao";

    /**
     * ── OS CONTACTOS QUE ENTRAM À MÃO TAMBÉM TÊM DE EXISTIR ────────────────
     *
     * Ela (30/10): «quero que o sistema detete e não deixe enviar emails que
     * não existem ou números de telefone seja qual país for», e «em todo o
     * lado». Este era o sítio mais solto de todos: o email não era conferido
     * de forma nenhuma («ana@» gravava), e o telefone eram quarenta
     * caracteres quaisquer.
     *
     * As regras são as do formulário do site — a forma do email (a do zod), o
     * domínio a receber correio (`dominioRecebeEmail`, que na dúvida deixa
     * passar) e o telefone com as regras do país (`normalizarTelefone`,
     * Portugal quando vem sem «+»). Os dois continuam OPCIONAIS: um pedido de
     * um telefonema pode não ter email, e é legítimo. O `campo` diz ao diálogo
     * onde pôr a frase.
     */
    const email = strLine(b.email, 200);
    if (email && !z.email().safeParse(email).success) {
      return NextResponse.json(
        {
          error: "Este email não está bem escrito. Confira-o (por exemplo, nome@gmail.com).",
          campo: "email",
        },
        { status: 400 },
      );
    }
    if (email && !(await dominioRecebeEmail(email))) {
      return NextResponse.json(
        {
          // A mesma frase do formulário do site (o back office é em português).
          error: getDictionary("pt").orcamento.errDominioDoEmail,
          campo: "email",
        },
        { status: 400 },
      );
    }
    const telefoneEscrito = str(b.phone, 40).trim();
    const telefone = telefoneEscrito ? normalizarTelefone(telefoneEscrito) : "";
    if (telefone === null) {
      return NextResponse.json(
        {
          error:
            "Este número de telefone não é válido. Confira os dígitos e o país (de fora de Portugal, com o indicativo à frente, ex.: +44).",
          campo: "telefone",
        },
        { status: 400 },
      );
    }

    const id = generateQuoteId();
    const quote: Quote = {
      // QuoteFormData defaults
      //
      // Com o `?? null` sozinho, estes dois eram os ÚNICOS campos do objecto
      // sem `str(...)`: um objecto, um número ou uma string de 10 MB entravam
      // tal e qual no jsonb do pedido e daí para a cópia de segurança. Passam
      // agora pelo mesmo tratamento que os vizinhos; vazio continua a ser
      // `null`, que é o que "Outro" grava (ver `QUOTE_EVENT_OPTIONS`).
      category: (str(b.category, 40) || null) as Quote["category"],
      eventType: (str(b.eventType, 60) || null) as Quote["eventType"],
      eventName: str(b.eventName, 160),
      date: str(b.date, 40),
      endDate: "",
      location: str(b.location, 200),
      locationType: "lisboa",
      guests: Math.min(Math.max(Math.floor(Number(b.guests) || 0), 0), 100000),
      duration: 4,
      isMultiDay: false,
      packageTier: "completo",
      addons: [],
      budgetRange: null,
      urgency: "standard",
      notes: str(b.notes, 5000),
      referralSource: str(b.referralSource, 120) || "Contacto direto",
      name,
      email,
      // Em E.164 (+351912345678), como os do site.
      phone: telefone,
      company: str(b.company, 160),
      nif: "",
      acceptTerms: true,
      acceptMarketing: false,
      // Quote meta
      id,
      submittedAt: new Date().toISOString(),
      status,
      priceBreakdown: {
        basePrice: 0,
        guestCost: 0,
        packageMultiplier: 1,
        locationSurcharge: 0,
        weekendSurcharge: 0,
        seasonSurcharge: 0,
        urgencySurcharge: 0,
        addonsCost: 0,
        subtotal: 0,
        iva: 0,
        total: 0,
        rangeMin: 0,
        rangeMax: 0,
        isEstimate: true,
      },
      quotedPrice: money(b.quotedPrice),
    };

    await createQuote(quote);
    return NextResponse.json({ ok: true, quote });
  } catch (err) {
    log.error("orcamento manual POST falhou", err);
    return NextResponse.json({ error: "Erro ao criar o pedido" }, { status: 500 });
  }
}
