import { NextRequest, NextResponse } from "next/server";
import type { Quote } from "@/lib/orcamento/types";
import { createQuote, generateQuoteId } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { log } from "@/lib/logger";
import { z } from "zod";
import { normalizarTelefone } from "@/lib/contacto-do-pedido";
import { dominioRecebeEmail } from "@/lib/dominio-do-email";
import { getDictionary } from "@/lib/i18n";
import { dataIso } from "@/lib/validation";
import { parseMoney } from "@/app/[lang]/(admin)/orcamento/admin/util";

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
      "a_preparar",
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
    const telefoneEscrito = strLine(b.phone, 40);
    const normalizado = telefoneEscrito ? normalizarTelefone(telefoneEscrito) : "";
    /**
     * ── «DUPLICAR PEDIDO» NÃO FALHA POR CAUSA DE UM TELEFONE ANTIGO ────────
     *
     * Os pedidos gravados antes de 30/10 têm telefones que as regras do país
     * não reconhecem. Duplicar um deles batia aqui e acabava num aviso
     * genérico, sem forma de duplicar sem antes corrigir o original (achado
     * n.º 21 da auditoria 6). Numa cópia (`duplicado: true`) o número fica
     * como estava, e a resposta diz que ficou, para ela o conferir.
     */
    const duplicado = b.duplicado === true;
    let aviso: string | undefined;
    let telefone = normalizado;
    if (normalizado === null && duplicado) {
      telefone = telefoneEscrito;
      aviso =
        "O telefone do pedido original não foi reconhecido e ficou como estava. Confira-o no pedido novo.";
    }
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

    /**
     * ── A DATA TEM DE SER UM DIA QUE EXISTE ───────────────────────────────
     *
     * Era a única porta de entrada de pedidos sem esta guarda: «2027-02-30»,
     * um ano de cinco algarismos (o `<input type="date">` do Chrome aceita-o)
     * ou texto livre ficavam gravados, e o Calendário e o PDF do guião
     * partiam-se depois (achado n.º 11 da auditoria 6). Vazio continua a ser
     * «ainda a definir»; o resto passa por `dataIso`, o sítio único.
     */
    const dataEscrita = strLine(b.date, 40);
    const date = dataEscrita ? dataIso(dataEscrita) : "";
    if (dataEscrita && !date) {
      return NextResponse.json(
        { error: "Data inválida — escolhe um dia do calendário.", campo: "data" },
        { status: 400 },
      );
    }

    /**
     * Os convidados escritos à portuguesa: «1.200» são mil e duzentos, não 1
     * (achado n.º 20 da auditoria 6). A mesma leitura do dinheiro
     * (`parseMoney`): pontos em grupos de três são milhares.
     */
    const convidadosLidos =
      typeof b.guests === "number" ? b.guests : (parseMoney(String(b.guests ?? "")) ?? 0);
    const guests = Math.min(Math.max(Math.floor(convidadosLidos) || 0, 0), 100000);

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
      date,
      endDate: "",
      location: str(b.location, 200),
      locationType: "lisboa",
      guests,
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
    return NextResponse.json(aviso ? { ok: true, quote, aviso } : { ok: true, quote });
  } catch (err) {
    log.error("orcamento manual POST falhou", err);
    return NextResponse.json({ error: "Erro ao criar o pedido" }, { status: 500 });
  }
}
