import { z } from "zod";
import { normalizarTelefone } from "./contacto-do-pedido";

/**
 * Server-side validation schemas (zod). The public forms are the front door
 * to the business, so we validate defensively: required contact fields,
 * sane lengths, and a real email. Unknown extra fields on the quote form are
 * preserved (the client sends the full QuoteFormData blob), so we use
 * `.passthrough()` and only assert the parts we depend on.
 */

const trimmed = (max: number) => z.string().trim().max(max);

/**
 * ── A DATA DO EVENTO TEM DE SER UM DIA QUE EXISTE ──────────────────────────
 *
 * Achado n.º 12 da auditoria: o servidor aceitava «2027-02-30», anos de cinco
 * algarismos, «amanhã!» e datas passadas. O Calendário mostrava o 30 de
 * Fevereiro como 2 de Março, e a lista «30 fev 2027 · faltam 5 meses». O
 * formulário do site trava isto no browser; os dois dos anúncios não tinham
 * data mínima — e um pedido forjado não passa por browser nenhum.
 *
 * Vazio continua a valer: é o «Ainda a definir».
 */
export function ehDiaDeCalendario(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [a, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mes - 1, dia));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
}

/** Ontem, em UTC. A folga de um dia cobre quem preenche de um fuso em que já
 *  (ou ainda) é outro dia — o que se recusa é o que já passou de certeza. */
function ontem(): string {
  return new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
}

const dataDoEvento = trimmed(20)
  .refine((v) => v === "" || ehDiaDeCalendario(v), "Data inválida — escolha um dia do calendário.")
  .refine((v) => v === "" || !ehDiaDeCalendario(v) || v >= ontem(), "A data do evento já passou.");

// Quote request — the part of QuoteFormData we rely on; rest passes through.
const selectedAddonSchema = z.object({
  id: trimmed(100),
  name: trimmed(200),
  tier: trimmed(30),
  price: z.number().finite().min(0).max(10_000_000),
  quantity: z.number().finite().min(0).max(100_000),
  pricingType: trimmed(30),
});

export const quoteFormSchema = z
  .object({
    name: trimmed(120).min(2, "Nome demasiado curto"),
    // ── PORQUE É QUE O EMAIL DEIXOU DE SER OBRIGATÓRIO ────────────────────
    // Passou a OPCIONAL, com a regra "email OU telefone" imposta pelo
    // `.refine()` no fim do esquema. Não é um afrouxamento: continua a ser
    // impossível gravar um pedido sem forma de responder.
    //
    // O que mudou foi o formulário das variantes sociais
    // (src/components/meta/PedidoRelampago.tsx): tem UM campo de contacto em
    // vez de dois, e quem chega de um anúncio do Instagram escreve o número
    // de telemóvel, não o email. Com o email obrigatório, esse formulário
    // teria de ter os dois campos outra vez — ou de inventar um email, que
    // seria pior do que tudo.
    //
    // Continua a ser VALIDADO como email quando vem preenchido: o que caiu
    // foi a obrigatoriedade, não a validação. `z.union` com o literal vazio
    // porque `z.email()` recusa "" e o formulário envia sempre a chave.
    email: z
      .union([z.email("Email inválido").max(160), z.literal("")])
      .optional()
      .default(""),
    phone: trimmed(40).optional().default(""),
    company: trimmed(160).optional().default(""),
    nif: trimmed(20).optional().default(""),
    guests: z.coerce.number().int().min(0).max(100000).optional().default(0),
    date: dataDoEvento.optional().default(""),
    // ── ESTE 4000 TEM UM PAR DO OUTRO LADO ────────────────────────────────
    // `notes` é o campo «Como imagina o seu evento?» do formulário público,
    // com as marcas de «ainda a definir» agarradas à frente. O formulário
    // trava o campo neste mesmo número (`MAX_NOTAS`, em OrcamentoForm.tsx),
    // descontando o que as marcas ocupam — porque o zod não tem que vir parar
    // ao pacote da página que converte só para ela saber onde parar.
    //
    // Mexer aqui é mexer lá. Sem isso, quem escreve a página inteira que a
    // proposta pede carrega em Enviar e recebe um «Too big: expected string
    // to have <=4000 characters», em inglês, sem saber de que campo se fala.
    notes: trimmed(4000).optional().default(""),
    // Remaining QuoteFormData fields are free-form on the client (category
    // labels, location text, addon picks…) — bound their size/shape so a
    // crafted payload can't smuggle a multi-MB string into the confirmation
    // email/DB record, without hardcoding every UI enum value here (brittle
    // if the front-end adds an option this schema doesn't know about yet).
    category: trimmed(40).nullish(),
    eventType: trimmed(60).nullish(),
    eventName: trimmed(200).optional().default(""),
    endDate: trimmed(20).optional().default(""),
    location: trimmed(300).optional().default(""),
    locationType: trimmed(30).optional(),
    duration: z.coerce.number().finite().min(0).max(1000).optional(),
    isMultiDay: z.boolean().optional(),
    packageTier: trimmed(30).optional(),
    addons: z.array(selectedAddonSchema).max(100).optional().default([]),
    // Pontos de decoração escolhidos no formulário. TEM de estar declarado
    // aqui pela mesma razão do `adClick`: o esquema faz `.strip()`, portanto
    // um campo não declarado é descartado em silêncio — o casal escolhia, a
    // rota aceitava, e as escolhas nunca chegavam à proposta.
    //
    // Guardados como identificadores livres e limitados (e não como um enum
    // fechado) pela mesma razão que os outros campos de taxonomia: acrescentar
    // um ponto ao catálogo não pode exigir uma alteração coordenada aqui, ou
    // mais cedo ou mais tarde o formulário oferece algo que o servidor deita
    // fora. O que não conhecemos é ignorado na leitura, em `pontosConhecidos`.
    decorPoints: z.array(trimmed(40)).max(20).optional().default([]),
    // Nomes dos noivos: opcionais e curtos. Não são validados contra nada — um
    // nome é o que a pessoa disser que é.
    partnerA: trimmed(80).optional(),
    partnerB: trimmed(80).optional(),
    // A ordem de grandeza dos convidados. Declarado aqui pela mesma razão de
    // todos os outros: o esquema faz `.strip()`, e um campo não declarado é
    // descartado em silêncio.
    guestsRange: trimmed(20).optional().default(""),
    // O tipo de cerimónia (civil/religiosa/…) e o tipo de espaço
    // (interior/exterior). Declarados aqui pela mesma razão de todos os outros:
    // o esquema faz `.strip()`, e um campo não declarado é descartado em
    // silêncio — o casal escolhia, a rota aceitava o pedido, e a escolha nunca
    // chegava à base de dados.
    //
    // Identificadores livres e curtos, não enums fechados: o que o servidor não
    // conhecer é ignorado na LEITURA (`ceremonyTypeLabel`/`spaceTypeLabel`
    // devolvem vazio), que é o sítio certo para essa decisão. Assim acrescentar
    // uma opção ao catálogo do formulário nunca exige mexer neste ficheiro.
    ceremonyType: trimmed(30).optional().default(""),
    spaceType: trimmed(30).optional().default(""),
    // A coordenação do dia (pedido dela, 25/10). Declarada pela mesma razão
    // dos outros: o `.strip()` deitava-a fora em silêncio.
    dayCoordination: z.boolean().optional().default(false),
    budgetRange: trimmed(30).nullish(),
    urgency: trimmed(30).optional(),
    referralSource: trimmed(200).optional().default(""),
    // Identificador do clique pago (ver src/lib/ads/click-id.ts). TEM de estar
    // declarado aqui: o esquema faz `.strip()`, portanto um campo não
    // declarado é descartado em silêncio — o formulário enviaria o gclid, a
    // rota aceitaria o pedido, e o campo simplesmente não chegava à base de
    // dados. A medição de receita ficava vazia sem nada rebentar.
    adClick: trimmed(300).optional().default(""),
    // Os identificadores da Meta ("fbp=…;fbc=…") e o `event_id` do evento
    // `Lead` que o browser já disparou. TÊM de estar declarados aqui pela
    // mesma razão que o `adClick`: o esquema faz `.strip()`, portanto um campo
    // não declarado é descartado em silêncio — o formulário enviaria, a rota
    // aceitaria, e o campo simplesmente não chegava à base de dados. A medição
    // ficava vazia sem nada rebentar.
    metaClick: trimmed(900).optional().default(""),
    leadEventId: trimmed(64).optional().default(""),
    acceptTerms: z.boolean().optional(),
    acceptMarketing: z.boolean().optional(),
    // De onde vem o pedido. Só o formulário completo (`OrcamentoForm`) manda
    // «completo», e é isso que liga a regra dos dois contactos lá em baixo.
    // Não fica gravado no pedido: a rota tira-o antes de guardar.
    origem: z.literal("completo").optional(),
    // A língua em que a pessoa preencheu o formulário. Antes só se lia do
    // cookie, e uma navegação directa para /en podia não o pôr: o email de
    // confirmação saía em português a quem escreveu em inglês. Também não
    // fica gravado como está — é o `locale` do pedido.
    idioma: z.enum(["pt", "en"]).optional(),
  })
  // .strip() (the default) — every QuoteFormData field is declared and bounded
  // above, so unknown keys are dropped rather than persisted. Previously
  // .passthrough() let a crafted payload smuggle arbitrary unbounded keys into
  // the stored quote (data-integrity / storage abuse); a genuinely new field
  // should be added here explicitly instead.
  .strip()
  // Os contactos: as duas regras (o formulário completo e as fichas rápidas).
  .superRefine((f, ctx) => {
    // ── O FORMULÁRIO COMPLETO: O EMAIL É OBRIGATÓRIO ──────────────────────
    // Ela (28/10): um pedido chegou com o email mal escrito e não havia mais
    // por onde responder. No formulário completo (`origem: "completo"`) o
    // email passa a ser obrigatório; o telemóvel NÃO («o email é obrigatório
    // mas o telemóvel não é»), mas quando vem tem de parecer completo
    // (`normalizarTelefone`, a MESMA regra que o browser usa). As fichas
    // rápidas dos anúncios não mandam `origem` e continuam com a regra de
    // baixo — ela decidiu que ficam como estão.
    if (f.origem === "completo") {
      if (!f.email)
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: "Indique o seu email.",
          params: { regra: "email-obrigatorio" },
        });
      if (f.phone && !normalizarTelefone(f.phone))
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Indique um telemóvel completo.",
          params: { regra: "telefone" },
        });
      return;
    }
    // A invariante das fichas rápidas: tem de haver PELO MENOS UMA forma de
    // responder. Um pedido sem email e sem telefone é um pedido que ninguém
    // consegue atender, e gravá-lo seria pior do que recusá-lo — ficava na
    // lista a parecer trabalho por fazer, para sempre.
    //
    // Aqui o telefone é validado por comprimento e não por forma: o número
    // chega escrito de todas as maneiras (+351, 00351, com espaços, com
    // pontos) num campo único que também aceita email, e nove dígitos é o
    // mínimo de um número português.
    if (!f.email && f.phone.replace(/\D/g, "").length < 9)
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Indique um email ou um telemóvel para lhe podermos responder.",
        params: { regra: "contacto" },
      });
  });

// Price breakdown — computed client-side, so validate the shape before it is
// persisted and reused in emails, exports and admin revenue maths. Values are
// bounded but may be negative (discount-style adjustments).
const money = z.number().finite().min(-10_000_000).max(10_000_000);

export const priceBreakdownSchema = z.object({
  basePrice: money,
  guestCost: money,
  packageMultiplier: z.number().finite().min(0).max(100),
  locationSurcharge: money,
  weekendSurcharge: money,
  seasonSurcharge: money,
  urgencySurcharge: money,
  addonsCost: money,
  subtotal: money,
  iva: money,
  total: money,
  rangeMin: money,
  rangeMax: money,
  isEstimate: z.boolean(),
});

export const quotePayloadSchema = z.object({
  form: quoteFormSchema,
  breakdown: priceBreakdownSchema.optional(),
});

// ── Admin PATCH of a quote ──────────────────────────────────────────────────
// The route already allowlists WHICH fields may change; this validates the
// VALUES so a buggy client (or forged authenticated request) can't persist an
// invalid status, a non-numeric price or malformed arrays that later break
// exports and calculations. All fields optional (it's a partial update);
// nullish is accepted where the UI clears a value.
const entityId = z.string().min(1).max(64);
const shortDate = trimmed(30); // "yyyy-mm-dd" (loose — display-only)

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA DATA DE CALENDÁRIO — O SÍTIO ÚNICO ONDE ISSO SE DECIDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Devolve `yyyy-mm-dd` quando o que chegou É um dia do calendário, e `""` quando
 * não é. Nunca atira e nunca adivinha.
 *
 * ── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 * Estas datas acabam todas no mesmo sítio: `new Date(valor + "T12:00:00")`, para
 * serem escritas por extenso num documento que vai para o cliente. Um valor que
 * não seja uma data não rebenta nada — imprime **«Invalid Date»** na factura, no
 * email da proposta e no PDF, com toda a confiança e sem avisar ninguém.
 * Chegava-se lá por um ano com cinco dígitos (o `<input type="date">` do Chrome
 * aceita-o), por um rascunho restaurado com «31/12/2026», ou por um campo
 * validado só ao COMPRIMENTO — que é o que a `validUntil` tinha.
 *
 * ── PORQUE É QUE O MOLDE NÃO CHEGA ─────────────────────────────────────────
 * `2026-02-31` passa o `^\d{4}-\d{2}-\d{2}$` e não dá `Invalid Date` nenhuma:
 * dá 3 de março. Uma proposta «válida até 03/03» que ela escreveu como fevereiro
 * é pior do que um erro visível, porque ninguém repara. Por isso a data tem de
 * sobreviver à ida e à volta pelo calendário.
 *
 * Vive aqui, e não copiada em cada rota, porque já esteve escrita em três
 * (o recibo, o livro de faturas e a validade da proposta) e a quarta cópia era
 * sempre a que se esquecia de uma destas duas armadilhas.
 */
export function dataIso(valor: unknown): string {
  const s = String(valor ?? "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  // Meio-dia UTC: a hora não interessa, só não pode escorregar de dia.
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? "" : s;
}

/** Uma data de calendário (`yyyy-mm-dd`) ou o vazio de quem não a preencheu.
 *  A mensagem diz o formato: quem a lê é a Catarina, a meio de um envio. */
const isoDate = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || dataIso(v) !== "", "Data inválida — usa o formato aaaa-mm-dd.");

const checklistItemSchema = z.object({
  id: entityId,
  label: trimmed(300),
  done: z.boolean(),
});

const timelineItemSchema = z.object({
  id: entityId,
  time: trimmed(20),
  title: trimmed(300),
  owner: trimmed(120).optional(),
  /**
   * Quanto tempo dura o momento, em minutos. Ver `TimelineItem`, onde está
   * escrito porque é duração e não hora de fim.
   *
   * ── E PORQUE É QUE ESTA LINHA É LOAD-BEARING ────────────────────────────
   *
   * O `quoteUpdateSchema` corre em `.strip()` (o modo por omissão do zod): uma
   * chave que não esteja DECLARADA aqui é apagada em silêncio, sem erro e sem
   * 400. Sem esta linha, o ecrã mandava a duração, o servidor respondia 200, e
   * ela voltava no dia seguinte com o guião outra vez sem durações — o pior
   * defeito possível, porque parece que funcionou.
   *
   * `int`: minutos não têm casas decimais. O tecto é um dia — mais do que isso
   * é engano de dedo e não um momento. Zero é aceite e vale o mesmo que
   * ausente (um instante), para uma duração apagada poder ser gravada.
   */
  duracao: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .optional(),
  /**
   * ── ONDE E O QUE É PRECISO GARANTIR ────────────────────────────────────
   *
   * As duas colunas do meio da folha dela. Entraram no `TimelineItem` e no
   * ecrã, e NÃO entraram aqui — que é o defeito contra o qual o comentário da
   * `duracao`, três linhas acima, está escrito. O `.strip()` apagava-as em
   * silêncio, com 200, e fazia duas coisas ao mesmo tempo:
   *
   *  1. o local e a nota que ela escrevia desapareciam ao gravar;
   *  2. e a gravação SEGUINTE respondia 409 — porque o ecrã dizia ter partido
   *     de um guião COM local e notas e o servidor tinha um SEM, e a conferência
   *     da base (`api/orcamento/[id]`) via, correctamente, duas listas
   *     diferentes. A mensagem «a timeline mudou noutro sítio» era verdadeira à
   *     letra: tinha mudado, ao passar por aqui.
   *
   * Os tectos são os da folha: um local é um nome de sítio («Adega Fitapreta»),
   * uma nota é uma frase curta («enviar táxi»), e nenhuma das duas é um campo
   * onde se escreva um parágrafo.
   */
  local: trimmed(200).optional(),
  notas: trimmed(500).optional(),
});

const paymentSchema = z.object({
  id: entityId,
  kind: z.enum(["sinal", "pagamento", "saldo"]),
  amount: z.number().finite().min(0).max(10_000_000),
  date: shortDate,
  paid: z.boolean(),
  note: trimmed(500).optional(),
});

const eventSupplierSchema = z.object({
  id: entityId,
  supplierId: entityId.optional(),
  name: trimmed(200),
  category: trimmed(100),
  estimatedCost: z.number().finite().min(0).max(10_000_000),
  actualCost: z.number().finite().min(0).max(10_000_000).optional(),
  status: z.enum(["contactado", "confirmado", "pago"]),
  note: trimmed(500).optional(),
});

const guestSchema = z.object({
  id: entityId,
  name: trimmed(200),
  party: z.number().int().min(1).max(1000),
  rsvp: z.enum(["pendente", "confirmado", "recusado"]),
  note: trimmed(500).optional(),
});

const activityEntrySchema = z.object({
  id: entityId,
  at: trimmed(40),
  kind: z.enum([
    "created",
    "status_change",
    "price_set",
    "note_added",
    "message_sent",
    "proposal_sent",
    "proposal_reviewed",
    "follow_up_set",
    "tags_updated",
    "payment_added",
    "supplier_added",
    "manual_note",
    "call_logged",
    "assigned",
  ]),
  actor: trimmed(120).optional(),
  summary: trimmed(1000),
});

/**
 * O mapa de mesas (`lib/orcamento/mapa-de-mesas.ts`). Os tectos são os de lá; as
 * coordenadas são centímetros de sala e podem ser negativas (arrastar para
 * cima ou para a esquerda da primeira mesa é legítimo).
 */
const coordenada = z.number().finite().min(-20000).max(20000);
const mapaDeMesasSchema = z.object({
  versao: z.literal(1),
  mesas: z
    .array(
      z.object({
        id: entityId,
        nome: trimmed(60),
        forma: z.enum(["redonda", "comprida", "quadrada"]),
        x: coordenada,
        y: coordenada,
        rodada: z.boolean().optional(),
        lugares: z.number().int().min(1).max(40),
      }),
    )
    .max(150),
  elementos: z
    .array(
      z.object({
        id: entityId,
        tipo: z.enum(["noivos", "pista", "palco", "buffet", "bar", "outro"]),
        nome: trimmed(60),
        x: coordenada,
        y: coordenada,
        largura: z.number().finite().min(20).max(5000),
        altura: z.number().finite().min(20).max(5000),
      }),
    )
    .max(40),
  lugares: z
    .record(
      z.string().max(140),
      z.object({
        convidadoId: entityId,
        n: z.number().int().min(1).max(1000),
        nome: trimmed(120).optional(),
      }),
    )
    .refine((r) => Object.keys(r).length <= 150 * 40, "Demasiados lugares."),
});

export const quoteUpdateSchema = z
  .object({
    status: z.enum(["pendente", "em_revisao", "cotado", "aceite", "rejeitado"]),
    quotedPrice: z.number().finite().min(0).max(10_000_000).nullish(),
    adminNotes: trimmed(20000).nullish(),
    checklist: z.array(checklistItemSchema).max(500),
    productionPlan: z.array(checklistItemSchema).max(500),
    payments: z.array(paymentSchema).max(500),
    timeline: z.array(timelineItemSchema).max(500),
    /* As três contagens do topo da folha. Texto livre e curto — a folha dela
       diz «6 crianças (1 c/ 1 ano)», e aquele parêntesis é a informação que
       faz a diferença no dia. Ver `CabecalhoDaFolha`.

       DECLARADO AQUI ou não existe: este esquema corre em `.strip()`, e uma
       chave que não esteja escrita é apagada em SILÊNCIO, com um 200 por cima.
       É a mesma armadilha que a `duracao` do momento documenta. */
    folhaDaTimeline: z.object({
      adultos: trimmed(60).optional(),
      criancas: trimmed(60).optional(),
      staff: trimmed(60).optional(),
    }),
    eventSuppliers: z.array(eventSupplierSchema).max(500),
    tags: z.array(trimmed(60)).max(100),
    followUpAt: shortDate.nullish(),
    guestList: z.array(guestSchema).max(5000),
    mapaDeMesas: mapaDeMesasSchema,
    activityLog: z.array(activityEntrySchema).max(5000),
    // Append-only variant: the server merges these onto the STORED log, so two
    // tools writing at once can't overwrite each other's entries.
    activityLogAppend: z.array(activityEntrySchema).max(500),
    assignedTo: trimmed(120).nullish(),
    lostReason: trimmed(1000).nullish(),
    date: shortDate,
    guests: z.number().int().min(0).max(100000),
    location: trimmed(300),
    /**
     * ── OS DADOS DE CONTACTO, QUE ATÉ AQUI NÃO SE PODIAM CORRIGIR ──────────
     *
     * Um pedido nascido de um telefonema entra sem email — é o caso normal, e
     * a regra «email OU telefone» do formulário público diz que é legítimo. O
     * que não era legítimo era o que vinha a seguir: a rota do envio recusa-se
     * a enviar sem destinatário e responde «acrescenta o email e reenvia», e
     * não havia por onde o acrescentar. O pedido ficava para sempre sem
     * caminho até ao cliente.
     *
     * O email pode ser VAZIO de propósito (o telefone é que é o contacto), por
     * isso é `email` ou `""` — como nos fornecedores. O nome não: é por ele que
     * o pedido se reconhece em todas as listas, e um pedido sem nome é um
     * pedido perdido.
     */
    name: trimmed(120).min(1),
    email: z.union([z.email().max(160), z.literal("")]),
    phone: trimmed(40),
    contractRef: trimmed(100).nullish(),
    archived: z.boolean(),
  })
  .partial();

// Proposal creation (admin, from the quote's line-item builder). Bounds every
// value so a crafted admin request can't push megabyte descriptions or a
// huge line-item array into the PDF render / outbound email attachment.
export const proposalLineItemSchema = z.object({
  description: trimmed(500),
  qty: z.number().finite().min(0).max(100_000),
  unitPrice: z.number().finite().min(0).max(10_000_000),
});

export const proposalCreateSchema = z.object({
  lineItems: z.array(proposalLineItemSchema).max(200),
  vatRate: z.number().finite().min(0).max(1).optional(),
  // Uma DATA, não «até 30 caracteres»: ver `dataIso`. É o que sai impresso a
  // dizer «Válida até …» no email e no PDF que o casal recebe.
  validUntil: isoDate.optional(),
  notes: trimmed(5000).optional(),
});

const subtarefaSchema = z.object({
  id: entityId,
  titulo: trimmed(300),
  feita: z.boolean(),
});

/**
 * Um anexo de uma tarefa — uma LIGAÇÃO, não um ficheiro (ver `AnexoDaTarefa`).
 *
 * O URL é validado a sério e limitado a `http`/`https`. Não é zelo: este
 * endereço acaba num `<a href>` do back office, e um `javascript:` gravado por
 * quem tenha a sessão de outra pessoa passava a correr no ecrã de quem
 * carregasse. Um esquema fechado é a única defesa que não depende de o ecrã se
 * lembrar de a fazer.
 */
const anexoDaTarefaSchema = z.object({
  id: entityId,
  nome: trimmed(200),
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((v) => /^https?:\/\/\S+$/i.test(v), "A ligação tem de começar por http:// ou https://"),
});

export const taskUpdateSchema = z
  .object({
    title: trimmed(300).min(1),
    done: z.boolean(),
    priority: z.enum(["baixa", "normal", "alta"]),
    dueDate: shortDate.nullish(),
    quoteId: trimmed(100).nullish(),
    clientName: trimmed(200).nullish(),
    assignee: trimmed(120).nullish(),
    area: trimmed(80).nullish(),
    /**
     * ── OS QUATRO CAMPOS DAS FASES 08 E 09, E PORQUE É QUE ESTAS LINHAS SÃO
     *    LOAD-BEARING ───────────────────────────────────────────────────────
     *
     * Este esquema corre em `.strip()` (o modo por omissão do zod): uma chave
     * que NÃO esteja declarada aqui é apagada em silêncio, sem erro e com 200
     * por cima. É a mesma armadilha que a `duracao` e o `local` de um momento
     * da timeline documentam no `timelineItemSchema` — e que já custou a esta
     * casa duas rondas de diagnóstico, porque o defeito parece o contrário de
     * um defeito: o pedido responde «gravado».
     *
     * Sem estas quatro linhas: a nota que ela escreve no painel desaparece ao
     * gravar, e a gravação seguinte responde 409, porque o ecrã declara ter
     * partido de uma tarefa COM nota e o servidor tem uma SEM.
     *
     * O guarda que o prova é o `validation.tarefas.test.ts`, no formato do
     * `validation.timeline.test.ts`.
     *
     * Os tectos: uma nota é um parágrafo («o Miguel leva as jarras na
     * sexta»), não um documento; cem subtarefas é mais do que qualquer tarefa
     * real desta casa alguma vez teve, e a partir daí o que ela tem em mãos é
     * uma lista, não uma tarefa.
     */
    notas: trimmed(5000).nullish(),
    subtarefas: z.array(subtarefaSchema).max(100),
    anexos: z.array(anexoDaTarefaSchema).max(50),
    /**
     * A ordem manual. Finito e limitado de propósito: as posições nascem
     * espaçadas de 1024 e uma tarefa largada entre duas fica com a média das
     * vizinhas (`lib/tarefas/posicoes.ts`), portanto o valor cresce com o
     * número de linhas e nunca com o número de arrastos. O tecto é folgado o
     * suficiente para um milhão de tarefas e apertado o suficiente para um
     * `Infinity` ou um `1e308` não entrarem na coluna.
     */
    posicao: z.number().finite().min(0).max(1e12).nullish(),
  })
  .partial();

export const supplierUpdateSchema = z
  .object({
    name: trimmed(200).min(1),
    category: trimmed(100),
    email: z.union([z.email().max(160), z.literal("")]).nullish(),
    phone: trimmed(40).nullish(),
    location: trimmed(300).nullish(),
    notes: trimmed(5000).nullish(),
    rating: z.number().int().min(1).max(5).nullish(),
    preferred: z.boolean().nullish(),
  })
  .partial();

// Hosts of the real browser push services. The server later POSTs to the stored
// endpoint, so restricting it to these known services prevents a blind-SSRF
// where a crafted subscription points the server at an internal/arbitrary URL.
const PUSH_ENDPOINT_HOST =
  /(?:^|\.)(?:fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.services\.microsoft\.com)$/i;

function isKnownPushEndpoint(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && PUSH_ENDPOINT_HOST.test(u.host);
  } catch {
    return false;
  }
}

// Web Push subscription — sanitise this network-provided object into a strict,
// known-good shape before it is ever persisted.
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .string()
    .regex(/^https:\/\/[^\s]+$/i, "endpoint inválido")
    .max(1000)
    .refine(isKnownPushEndpoint, "endpoint de push não reconhecido"),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(300),
  }),
});

/** Returns the first human-readable error, for a clean 400 response. */
export function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Dados inválidos";
}
