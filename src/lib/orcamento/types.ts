import type { RespostaDeEscolha } from "../proposta-escolhas";
import type { MapaDeMesas } from "./mapa-de-mesas";

export type EventCategory = "empresas" | "particulares";

export type EventType =
  | "conferencias"
  | "teambuilding"
  | "lancamentos"
  | "jantares_empresa"
  | "casamentos"
  | "batizados"
  | "aniversarios"
  | "jantares_gala";

export type LocationType =
  | "lisboa"
  | "porto"
  | "grande_cidade"
  | "pequena_cidade"
  | "internacional";

export type BudgetRange = "ate_5k" | "5k_15k" | "15k_30k" | "30k_60k" | "60k_plus";

export type Urgency = "standard" | "rush" | "urgente";

export type QuoteStatus = "pendente" | "em_revisao" | "cotado" | "aceite" | "rejeitado";

export type PackageTier = "essencial" | "completo" | "premium" | "personalizado";

export type AddonTier = "essencial" | "completo" | "premium";

export interface AddonCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  pricingType: "fixed" | "per_pax" | "per_unit";
  tiers: {
    essencial: { label: string; price: number };
    completo: { label: string; price: number };
    premium: { label: string; price: number };
  };
  eventTypes?: EventType[];
}

export interface SelectedAddon {
  id: string;
  name: string;
  tier: AddonTier;
  price: number;
  quantity: number;
  pricingType: "fixed" | "per_pax" | "per_unit";
}

export interface QuoteFormData {
  category: EventCategory | null;
  eventType: EventType | null;
  eventName: string;
  date: string;
  endDate: string;
  location: string;
  locationType: LocationType;
  guests: number;
  duration: number;
  isMultiDay: boolean;
  packageTier: PackageTier;
  addons: SelectedAddon[];
  /**
   * Pontos de decoração escolhidos pelo casal no pedido (ver
   * `src/lib/orcamento/decoracao.ts`). Só aparece nos casamentos; vazio em
   * todos os outros tipos de evento e em todos os pedidos anteriores a este
   * campo existir — por isso é opcional e nunca se pode assumir presente.
   */
  decorPoints?: string[];
  /**
   * Os nomes dos noivos, quando o pedido é um casamento e o casal os quis dar.
   * O `name` continua a ser o de QUEM ESCREVEU — pode ser a mãe da noiva, uma
   * wedding planner, um dos dois. São coisas diferentes e não se podem
   * sobrepor: é a este par que a proposta e o contrato se dirigem, e é aquele
   * que se trata por tu ao responder ao email.
   *
   * Opcionais em todos os sentidos: não existem fora dos casamentos, não
   * existem nos pedidos anteriores a este campo, e não existem quando o casal
   * preferiu não os escrever. Nunca assumir presentes.
   */
  partnerA?: string;
  partnerB?: string;
  /**
   * Ordem de grandeza dos convidados, quando o número exacto ainda não existe
   * (ver `GUEST_RANGES`). Vazio quando `guests` traz um número a sério — os
   * dois nunca convivem, e é o número que manda.
   */
  guestsRange?: string;
  /**
   * Civil, religiosa, as duas ou simbólica (ver `CEREMONY_TYPES`). Só existe
   * nos casamentos — noutro tipo de evento não há cerimónia nenhuma a
   * qualificar — e é sempre OPCIONAL: muitos casais pedem orçamento antes de
   * terem isso decidido. Vazio em todos os pedidos anteriores a este campo.
   *
   * Guardado como identificador livre (e não como um enum fechado) pela mesma
   * razão dos pontos de decoração: acrescentar uma opção ao catálogo não pode
   * exigir uma alteração coordenada no validador do servidor.
   */
  ceremonyType?: string;
  /**
   * Interior, exterior ou os dois (ver `SPACE_TYPES`). Ao contrário do tipo de
   * cerimónia, aplica-se a QUALQUER evento — e é o que diz se há uma montagem
   * alternativa a preparar para o caso de chover. Opcional e vazio nos pedidos
   * anteriores a este campo.
   */
  spaceType?: string;
  /**
   * Se pediram também a coordenação do dia (pedido dela, 25/10: «no pedido de
   * orçamento eu gostava de colocar lá a opção de coordenação do dia»). Aplica-se
   * a QUALQUER evento, é opcional, e não existe nos pedidos anteriores a este
   * campo — ausente quer dizer «não disse», nunca «não quer».
   */
  dayCoordination?: boolean;
  budgetRange: BudgetRange | null;
  urgency: Urgency;
  notes: string;
  referralSource: string;
  /**
   * Identificador do clique pago que trouxe esta pessoa, na forma compacta
   * "gclid:VALOR@2026-03-01T10:00:00.000Z" (ver src/lib/ads/click-id.ts).
   * Vazio quando o pedido não veio de um anúncio — que é o caso da maioria.
   *
   * É o que permite devolver ao Google Ads o valor REAL do casamento quando
   * ele fecha, em vez de deixar a Google a optimizar para formulários
   * preenchidos. Ver /ads-output/medicao.md e a rota de exportação de
   * conversões offline.
   */
  adClick?: string;
  /**
   * Identificadores da Meta, na forma compacta "fbp=…;fbc=…" (ver
   * src/lib/meta/click-id.ts). O equivalente do `adClick` para o Instagram e
   * o Facebook: é o que permite devolver à Meta o valor REAL do casamento
   * quando ele fecha. Vazio na maioria dos pedidos.
   */
  metaClick?: string;
  /**
   * O `event_id` do evento `Lead` que o browser já disparou para o pixel.
   * O servidor reenvia o MESMO identificador pela Conversions API, e é assim
   * que a Meta reconhece os dois como um só acontecimento em vez de contar a
   * conversão duas vezes. Ver src/lib/meta/eventos.ts.
   */
  leadEventId?: string;
  name: string;
  /**
   * PODE SER VAZIO desde que haja `phone` — a regra "email ou telefone" está
   * no `quoteFormSchema`. O formulário das variantes sociais tem um campo de
   * contacto só, e quem chega de um anúncio do Instagram escreve o número.
   * Todo o código que envia email para o cliente TEM de verificar isto.
   */
  email: string;
  phone: string;
  company: string;
  nif: string;
  acceptTerms: boolean;
  acceptMarketing: boolean;
}

export interface PriceBreakdown {
  basePrice: number;
  guestCost: number;
  packageMultiplier: number;
  locationSurcharge: number;
  weekendSurcharge: number;
  seasonSurcharge: number;
  urgencySurcharge: number;
  addonsCost: number;
  subtotal: number;
  iva: number;
  total: number;
  rangeMin: number;
  rangeMax: number;
  isEstimate: boolean;
}

export interface QuoteMessage {
  at: string;
  body: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CABEÇALHO DA FOLHA DA TIMELINE — QUANTA GENTE, DE CADA TIPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «E também para escrever staff e crianças etc que está no timeline.»
 *
 * A folha que a equipa dela leva para o evento abre com três contagens:
 *
 *     Adultos      Crianças                  Staff
 *     240          6 crianças (1 c/ 1 ano)   24
 *
 * ── PORQUE É QUE ISTO NÃO SÃO TRÊS NÚMEROS ──────────────────────────────
 *
 * Porque a coluna do meio da folha dela diz «6 crianças (1 c/ 1 ano)». Aquele
 * parêntesis é a informação que faz a diferença no dia: uma criança de um ano
 * não come do menu infantil nem se senta a uma mesa. Um `number` deitava-o
 * fora e obrigava-a a guardá-lo noutro sítio — que é como se perde.
 *
 * Texto livre, curto, e escrito por ela. O produto não tem opinião nenhuma
 * sobre o que lá está.
 *
 * ── E OS ADULTOS, QUE JÁ EXISTEM ─────────────────────────────────────────
 *
 * O `guests` do pedido é quantos convidados o casal disse que vinham, e é o
 * que a folha usa quando esta caixa está vazia. Escrever aqui SUBSTITUI-o —
 * porque o número do pedido é de quando o pedido foi feito, e o da folha é o
 * de véspera, depois das confirmações. São dois números com duas idades, e o
 * da folha é o que manda no dia.
 */
export interface CabecalhoDaFolha {
  adultos?: string;
  criancas?: string;
  staff?: string;
}

/** A single moment in the day-of run sheet (cronograma do evento). */
export interface TimelineItem {
  id: string;
  time: string; // "HH:MM"
  title: string;
  owner?: string; // responsável / fornecedor

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ONDE, E O QUE É PRECISO SABER — AS DUAS COLUNAS QUE FALTAVAM
   * ════════════════════════════════════════════════════════════════════════
   *
   * Ela mandou a timeline a sério de um casamento — a folha que a equipa dela
   * levou para a Adega Fita Preta a 28 de Junho — e disse «quero que faças
   * assim mesmo para o nosso timeline». Aquela folha tem quatro colunas:
   *
   *     HORA · LOCAL · DESCRIÇÃO · NOTAS
   *
   * Tínhamos duas: a hora e a descrição. Estas são as outras.
   *
   * ── `local`, E PORQUE É QUE NÃO CHEGA O LOCAL DO EVENTO ─────────────────
   *
   * Porque um dia de casamento acontece em mais do que um sítio. Na folha
   * dela, às 08h30 a equipa está na «Fitapreta» e às 14h30 os noivos estão no
   * «Governador» — duas moradas no mesmo dia, e é a coluna do LOCAL que diz a
   * quem lê onde tem de estar. O `location` do pedido é o sítio da FESTA, e
   * escrevê-lo em todas as linhas dizia a coisa errada em metade delas.
   *
   * Vazio quer dizer «no mesmo sítio da linha de cima» — que é como a folha
   * dela se lê, e é por isso que a coluna aparece tão pouco preenchida.
   *
   * ── `notas`, E PORQUE É QUE NÃO É PARTE DA DESCRIÇÃO ────────────────────
   *
   * Porque não é o que acontece: é o que é preciso GARANTIR para acontecer.
   * «Sergey chega» é a descrição; «enviar táxi» é a nota. «Mariana e Fábio
   * anunciam bolo» é a descrição; «garantir cadeira giratória em baixo + saco
   * Cartier + bolo c/ velas» é a nota. Enfiar as duas na mesma coluna faz uma
   * folha que se lê em voz alta e não se cumpre.
   */
  local?: string;
  notas?: string;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * QUANTO TEMPO DURA — E PORQUE É DURAÇÃO E NÃO HORA DE FIM
   * ════════════════════════════════════════════════════════════════════════
   *
   * Minutos. Ausente quer dizer «sem duração marcada»: o momento é um
   * INSTANTE, um marco no dia, e não um intervalo.
   *
   * ── A ESCOLHA: DURAÇÃO, NÃO `fim: "HH:MM"` ──────────────────────────────
   *
   * As duas guardam a mesma informação. Três coisas desempatam, e são todas
   * deste produto e não de gosto:
   *
   *  1. **O dia passa da meia-noite.** Este guião já tem uma regra escrita
   *     para isso: uma hora antes das 05:00 é o FIM do dia e vale +24h (ver
   *     `ordemNoDia`, em `guiao-do-dia.ts`). Uma hora de fim obrigaria a
   *     aplicar a mesma adivinhação uma segunda vez, e a segunda é pior: o
   *     encerramento das 02:00 já conta como dia seguinte, portanto um fim
   *     «03:00» tanto podia ser uma hora depois como vinte e cinco. Com
   *     duração há uma adivinhação só — a que já existe: o princípio ancora,
   *     o resto é aritmética. `23:00 + 180 min` não tem ambiguidade nenhuma.
   *
   *  2. **Mudar a hora não pode encolher o momento.** Ela arrasta a cerimónia
   *     das 17:00 para as 17:30 na véspera. Com hora de fim, a cerimónia
   *     passava de 45 min para 15 sem ninguém lhe tocar — uma perda
   *     silenciosa num papel que se imprime. Com duração, andam as duas.
   *
   *  3. **É assim que ela sabe a informação.** «A montagem leva três horas» é
   *     conhecimento do ofício e não muda de evento para evento; «a montagem
   *     acaba às 12:00» é uma consequência da hora a que se começou. O modelo
   *     guarda o que se sabe; o ecrã mostra o que se calcula — e mostra mesmo
   *     a hora de fim («08:00 → 11:00»), porque é assim que ela lê o dia.
   *
   * ── E O QUE ESTAVA GRAVADO ANTES DISTO ─────────────────────────────────
   *
   * Opcional, e a ausência tem significado próprio. Um guião gravado com o
   * modelo antigo abre com os momentos todos como instantes: ordena na mesma,
   * imprime na mesma, e NÃO inventa sobreposições — duas coisas sem duração
   * declarada nunca se sobrepõem, porque ninguém disse que se sobrepunham.
   * Nascer com 60 minutos por omissão era pôr o ecrã a acusar choques que ela
   * nunca escreveu, no guião que ela já tinha — a maneira mais rápida de a
   * ensinar a ignorar os avisos todos.
   */
  duracao?: number;
}

export type PaymentKind = "sinal" | "pagamento" | "saldo";

export interface Payment {
  id: string;
  kind: PaymentKind;
  amount: number; // com IVA, em €
  date: string; // data do pagamento / previsto
  paid: boolean;
  note?: string;
}

/** A supplier/vendor booked for a specific event, with budgeted vs actual cost.
    Powers the per-event cost tracking and profitability (revenue − custos). */
export type EventSupplierStatus = "contactado" | "confirmado" | "pago";

export interface EventSupplier {
  id: string;
  supplierId?: string; // optional link to a Supplier in the directory
  name: string; // denormalised so the booking survives even if the supplier is removed
  category: string;
  estimatedCost: number; // orçamentado, em € (com IVA)
  actualCost?: number; // custo real/confirmado, em €
  status: EventSupplierStatus;
  note?: string;
}

/** A guest (or party/family) on an event's RSVP list. `party` is how many
    people this entry represents, so confirmed headcount = sum of confirmed parties. */
export type RsvpStatus = "pendente" | "confirmado" | "recusado";

export interface Guest {
  id: string;
  name: string;
  party: number;
  rsvp: RsvpStatus;
  note?: string;
}

export type ActivityKind =
  | "created"
  | "status_change"
  | "price_set"
  | "note_added"
  | "message_sent"
  | "proposal_sent"
  /** Alguém viu o PDF final e confirmou que está tudo certo, antes de enviar. */
  | "proposal_reviewed"
  | "follow_up_set"
  | "tags_updated"
  | "payment_added"
  | "supplier_added"
  | "manual_note"
  | "call_logged"
  | "assigned";

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  actor?: string;
  summary: string;
}

export type TaskPriority = "baixa" | "normal" | "alta";

/**
 * Um passo de uma tarefa — o que o painel de detalhe chama «subtarefas»
 * (`docs/APPLE-TAREFAS.md`, fase 08).
 *
 * Deliberadamente RASO: título e feita, e mais nada. Uma subtarefa com prazo,
 * responsável e prioridade própria é uma tarefa, e essa já existe — dar-lhe os
 * mesmos campos era construir uma segunda árvore de tarefas dentro da primeira,
 * com duas listas a discordar sobre o que está por fazer.
 */
export interface Subtarefa {
  id: string;
  titulo: string;
  feita: boolean;
}

/**
 * Um anexo de uma tarefa. É uma LIGAÇÃO, e não um ficheiro carregado.
 *
 * Não há rota de upload nenhuma neste produto — as fotografias da biblioteca
 * entram por outro caminho, e inventar aqui um armazenamento novo era uma fase
 * inteira disfarçada de campo. O que esta casa tem, e usa todos os dias, são
 * ligações: a pasta do Drive do casamento, o orçamento do florista, a
 * inspiração no Pinterest. É isso que o painel guarda.
 */
export interface AnexoDaTarefa {
  id: string;
  nome: string;
  /** `http(s)` apenas — ver `anexoDaTarefaSchema` em `lib/validation.ts`. */
  url: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: TaskPriority;
  dueDate?: string;
  quoteId?: string;
  clientName?: string;
  assignee?: string; // quem é responsável (sócio/membro da equipa)
  area?: string; // ex.: Comercial, Produção, Decoração, Financeiro
  createdAt: string;
  /**
   * ── OS TRÊS CAMPOS DO PAINEL DE DETALHE (fase 08) ────────────────────────
   *
   * Texto longo — o que não cabe no título. É o «Detalhes (opcional)» que a
   * Parte 5 do documento manda renomear para «Notas» e reduzir a isto mesmo:
   * só para texto corrido.
   */
  notas?: string;
  subtarefas?: Subtarefa[];
  anexos?: AnexoDaTarefa[];
  /**
   * ── A ORDEM QUE ELA ARRUMOU À MÃO (fase 09) ──────────────────────────────
   *
   * Um número de ordenação, e não um índice: as posições nascem espaçadas
   * (1024, 2048, 3072…) e uma tarefa largada entre duas outras fica com a
   * MÉDIA das vizinhas. É o que faz um arrasto custar UMA gravação em vez de
   * uma por linha — ver `lib/tarefas/posicoes.ts`, onde isto está medido e
   * testado.
   *
   * Ausente quer dizer «nunca foi arrumada à mão», e não «primeira»: quem não
   * tem posição fica no topo, que é onde a linha de escrever a acabou de pôr.
   */
  posicao?: number;
}

export interface Quote extends QuoteFormData {
  id: string;
  submittedAt: string;
  status: QuoteStatus;
  priceBreakdown: PriceBreakdown;
  quotedPrice?: number;
  adminNotes?: string;
  lastUpdated?: string;
  messages?: QuoteMessage[];
  /** Event/logistics checklist (EventChecklist) — geral do evento, gerado a
      partir de `checklistTemplate`. NÃO confundir com `productionPlan`. */
  checklist?: ChecklistItem[];
  /** Plano de produção decor (ProductionPlan) — fases de atelier do sourcing ao
      strike, cada item prefixado com a fase. Campo próprio para não colidir com
      `checklist`: os dois painéis vivem lado a lado no separador Produção e
      partilhar o mesmo campo levava a perda de dados. */
  productionPlan?: ChecklistItem[];
  payments?: Payment[];
  timeline?: TimelineItem[];
  /** As três contagens do topo da folha da timeline. Ver `CabecalhoDaFolha`. */
  folhaDaTimeline?: CabecalhoDaFolha;
  eventSuppliers?: EventSupplier[];
  /** Free-form labels for organising/filtering (ex.: "VIP", "Outono", "Ar livre"). */
  tags?: string[];
  /** Date (yyyy-mm-dd) the team should next follow up this lead. Surfaced in
      Reminders/Agenda when due, to chase proposals and keep deals moving. */
  followUpAt?: string;
  /** RSVP / guest list for the event. */
  guestList?: Guest[];
  /** O mapa de mesas do evento: mesas, elementos da sala e quem se senta onde.
      As regras vivem em `mapa-de-mesas.ts`; as pessoas vêm da `guestList`. */
  mapaDeMesas?: MapaDeMesas;
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O QUE O CASAL ESCOLHEU NA PÁGINA DA PROPOSTA
   * ════════════════════════════════════════════════════════════════════════
   *
   * «A escolha volta ao back office e aparece na ficha do evento.»
   *
   * A PERGUNTA vive no documento da proposta (`ProposalDoc.escolhas`); a
   * resposta vive aqui, no PEDIDO, e não na proposta. A razão é a mesma que
   * faz o link do casal seguir o pedido e não a linha: uma revisão de preço
   * cria uma proposta NOVA, e a paleta que o casal escolheu na semana passada
   * não pode desaparecer porque ela mexeu no valor da deslocação.
   *
   * É a única coisa que o lado do CLIENTE escreve neste registo, e escreve-a
   * por acção deliberada — ver `proposta-escolhas.ts` para o que não se grava.
   */
  escolhasDoCasal?: RespostaDeEscolha[];
  /** Chronological log of significant actions taken on this quote. */
  activityLog?: ActivityEntry[];
  /** Internal contract/invoice reference number (e.g. "2026-042"). */
  contractRef?: string;
  /** When true, the quote is hidden from the default list view (soft-delete). */
  archived?: boolean;
  /** Team member responsible for this lead (prevents double-work). */
  assignedTo?: string;
  /** Reason the deal was lost — filled when status → rejeitado. */
  lostReason?: string;
  /**
   * O idioma em que a pessoa fez o pedido ("pt" ou "en"), lido do site no
   * momento em que o formulário foi submetido.
   *
   * Já se usava para escolher a língua do email de confirmação, mas era
   * deitado fora a seguir. Guardá-lo permite, meses depois, saber que aquele
   * casal escreveu em inglês — e a proposta do estúdio é escrita em português.
   * Ausente em todos os pedidos anteriores a este campo: nunca assumir "pt".
   */
  locale?: string;
}

/**
 * ── AS COLECÇÕES QUE SÓ O PEDIDO ABERTO LÊ ─────────────────────────────────
 *
 * O painel de administração recebe a tabela de pedidos INTEIRA no HTML da
 * página (ver `orcamento/admin/page.tsx`), e um pedido já trabalhado é um blob
 * grande: medido sobre um casamento com 150 convidados, a lista de convidados
 * sozinha é 47% dos bytes do pedido, e com a checklist, o plano de produção e
 * o cronograma passa dos 68%.
 *
 * Estes quatro campos — mais os pontos de decoração — têm uma coisa em comum
 * que os outros não têm: NENHUMA vista de conjunto os lê. Só aparecem dentro
 * de um pedido aberto (GuestList, EventChecklist, ProductionPlan,
 * EventTimeline, e as impressões do dossier), e esses painéis recebem o pedido
 * ABERTO, não a lista. Por isso podem viajar mais tarde, quando um pedido é
 * aberto, em vez de viajarem 300 vezes no primeiro byte da página.
 *
 * O QUE **NÃO** ESTÁ AQUI, e porquê — cada um destes é lido sobre a lista
 * inteira e tirá-lo mudaria números no ecrã sem ninguém dar por isso:
 *   · `payments`        — Overview, Reminders, Agenda, StatsDashboard e o CSV
 *                         da tesouraria somam-nos em todos os pedidos.
 *   · `messages`        — Reminders ("já respondemos?") e o tempo de resposta
 *                         das Estatísticas.
 *   · `activityLog`     — o painel de Propostas ACRESCENTA-LHE uma entrada ao
 *                         aceitar uma proposta; sem o histórico, gravava por
 *                         cima dele com uma linha só.
 *   · `eventSuppliers`  — a margem por evento nas Estatísticas.
 *   · `adminNotes`      — abrir um pedido copia-o para a caixa de notas e
 *                         gravar escreve a caixa de volta: se chegasse vazio,
 *                         gravar apagava as notas internas.
 */
export const CAMPOS_SO_DO_DETALHE = [
  "guestList",
  "mapaDeMesas",
  "checklist",
  "productionPlan",
  "timeline",
  "decorPoints",
] as const;

/**
 * Um pedido como a LISTA o precisa: tudo menos {@link CAMPOS_SO_DO_DETALHE}.
 *
 * Continua a ser um `Quote` válido para o TypeScript — os campos omitidos são
 * todos opcionais —, e é de propósito: as doze vistas que recebem a lista
 * continuam a escrever `Quote[]` sem uma única alteração. O que a distinção
 * serve é dizer a quem lê ONDE é que a diferença existe, e obrigar quem abrir
 * um pedido a ir buscar o resto (ver `openQuote` em AdminClient).
 */
export type QuoteSummary = Omit<Quote, (typeof CAMPOS_SO_DO_DETALHE)[number]>;

/** Standalone calendar entry (reunião, marcação, bloqueio…) not tied to a quote. */
export type CalendarEventKind = "reuniao" | "evento" | "bloqueio" | "nota";

export interface CalendarEvent {
  id: string;
  date: string; // yyyy-mm-dd
  title: string;
  kind: CalendarEventKind;
  time?: string; // "HH:MM" opcional
  note?: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  category: string;
  email?: string;
  phone?: string;
  location?: string;
  notes?: string;
  createdAt: string;
  /** 1–5 star quality rating. */
  rating?: number;
  /** Marks this supplier as a preferred/go-to partner. */
  preferred?: boolean;
}

// ── Propostas (criadas internamente, enviadas em PDF ao cliente) ──
/**
 * O estado interno de uma proposta, marcado por ela.
 *
 * "em_negociacao" é o estado que faltava e que descreve a maior parte do tempo
 * real: a proposta seguiu, houve resposta, e está a discutir-se. Sem ele, uma
 * proposta em terceira ronda de conversa era indistinguível de uma que ninguém
 * abriu — e é justamente essa distinção que decide quem se contacta amanhã.
 *
 * NÃO existe aqui um estado "expirada". A validade é uma data; um estado
 * gravado que diga "expirou" fica errado no minuto seguinte ao da gravação, e
 * corrigi-lo exigiria alguém (ou algo) a passar por todas as propostas todos os
 * dias. Deriva-se de `validUntil` — ver `estaExpirada` em proposta-estado.ts.
 */
export type ProposalStatus = "rascunho" | "enviada" | "em_negociacao" | "aceite" | "rejeitada";

/**
 * Porque é que se perdeu.
 *
 * Uma lista curta e fechada, porque o objetivo é poder CONTAR: "perdi seis por
 * preço este semestre" é uma frase que muda decisões, e não se chega lá com
 * texto livre. O `outro` existe para quem não cabe na lista não ser forçado a
 * mentir numa das quatro — e leva nota à parte.
 */
export type MotivoDeRecusa = "preco" | "data" | "escolheram-outro" | "sem-resposta" | "outro";

export interface ProposalLineItem {
  description: string;
  qty: number;
  unitPrice: number; // por unidade, sem IVA
}

export interface Proposal {
  id: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  currency: string;
  lineItems: ProposalLineItem[];
  vatRate: number; // ex.: 0.23
  subtotal: number;
  vat: number;
  total: number;
  validUntil?: string;
  notes?: string;
  status: ProposalStatus;
  createdAt: string;
  sentAt?: string;
  /** When the client accepted/declined via the public link. */
  respondedAt?: string;
  /**
   * Quando voltar a falar com esta pessoa (yyyy-mm-dd), escolhido por ela.
   *
   * Não dispara nada para o cliente — não há email automático, não há aviso do
   * lado de lá. É um lembrete do lado de cá, e é isso que o painel de
   * acompanhamento ordena.
   */
  followUpAt?: string;
  /** O que fica por dizer no próximo contacto ("mandar fotos do arco"). */
  followUpNote?: string;
  /** Porque é que se perdeu — preenchido ao marcar como recusada. */
  lostReason?: MotivoDeRecusa;
  /** O detalhe, quando o motivo sozinho não chega. */
  lostNote?: string;
  /**
   * Qual das duas versões o casal ficou — quando a proposta tinha extras.
   *
   * Preenchido POR ELA ao registar a resposta, não pelo cliente e não por
   * dedução: quem responde responde por email ou ao telefone, e adivinhar a
   * partir do valor facturado dava a versão errada em todas as propostas em que
   * se negociou um desconto depois.
   *
   * Serve para uma pergunta só, e é a que interessa: os extras vendem-se?
   */
  versaoEscolhida?: import("./versoes-da-proposta").VersaoEscolhida;
  /**
   * ── O SELO DO DOCUMENTO ───────────────────────────────────────────────────
   *
   * A impressão digital (SHA-256, em hexadecimal) do PDF EXACTO que seguiu para
   * o casal, e o tamanho dele em bytes. Calculados no envio, onde os bytes já
   * estão em memória — não custa um milissegundo a mais nem um pedido extra.
   *
   * O aceite já guarda o nome escrito, a hora, o IP e o texto congelado dos
   * termos. Faltava provar QUAL documento foi aceite: um PDF é reconstruído a
   * partir do `doc`, e uma mudança no código do desenho (uma fonte, uma
   * margem, uma fotografia que entretanto mudou) dá um ficheiro diferente do
   * que o casal viu. Com o selo, comparar é uma linha de comando; sem ele, é a
   * palavra de um contra a do outro.
   *
   * ── E O SELO DEPENDE DA LÍNGUA ────────────────────────────────────────────
   *
   * O mesmo `doc` tem dois desenhos possíveis (ver `idioma`, aqui em baixo), e
   * são ficheiros diferentes com resumos diferentes. Isto NÃO se remendou com
   * dois selos: continua a haver um só, o do PDF que seguiu — o que mudou é que
   * a proposta passou a dizer em que língua foi desenhado. É o que torna o selo
   * VERIFICÁVEL: enquanto a língua morria no fim do pedido, um PDF inglês
   * selado no envio não podia ser reproduzido por ninguém (quem o redesenhasse
   * obtinha o português, e outro resumo). Ver o comentário do selo na rota.
   */
  pdfSha256?: string;
  pdfBytes?: number;
  /** Rich multi-page proposal document (Proposal Studio). Stored so the studio
   *  can re-open and re-edit a sent proposal. Image fields hold Storage paths,
   *  not bytes. Optional — legacy line-item proposals don't set it. */
  doc?: import("@/lib/proposal-doc").ProposalDoc;
  /**
   * ── A LÍNGUA EM QUE ESTA PROPOSTA FOI FEITA ───────────────────────────────
   *
   * "pt" ou "en", escolhido no estúdio no momento em que a proposta é gerada e
   * gravado COM ela. Não pertence ao `doc`: o documento continua a ser um só,
   * escrito em português, e a língua é a forma como ele foi APRESENTADO ao
   * casal — o mesmo documento, desenhado noutra moldura.
   *
   * É gravado porque tudo o que vem DEPOIS do envio precisa de saber a
   * resposta: o email que transporta a proposta, a página onde o casal a
   * aceita, o portal do cliente e a segunda descarga do PDF (pelo link ou pelo
   * portal). Enquanto isto era só um parâmetro do pedido, uma proposta inglesa
   * chegava dentro de um email português e voltava a descarregar-se em
   * português.
   *
   * AUSENTE em todas as propostas anteriores a este campo — e ausente é
   * PORTUGUÊS, que é o que essas propostas sempre foram. Nunca se assume o
   * contrário, e ninguém escreve "pt" por cima delas: ver `idiomaDaProposta`
   * em `@/lib/proposta-idioma`, que é o único sítio onde essa leitura se faz.
   */
  idioma?: import("@/lib/proposal-doc-textos").IdiomaDaProposta;
  /**
   * ── A VERSÃO DESTE DOCUMENTO ──────────────────────────────────────────────
   *
   * O selo do CONTEÚDO VISÍVEL (sha256), o número que se diz em voz alta e o
   * momento em que o conteúdo mudou pela última vez.
   *
   * Não confundir com o {@link Proposal.pdfSha256}, que está aqui em cima e
   * serve outra coisa: aquele é a impressão digital dos BYTES do PDF enviado, e
   * é PROVA. Este é a identidade do conteúdo, e é o que responde a «isto mudou
   * desde que o casal viu?» — a pergunta de que dependem a ligação viva da
   * página e o congelamento no aceite. Os dois têm de existir, e são
   * diferentes: dois PDFs de conteúdo igual têm bytes diferentes (a pdf-lib
   * carimba a data lá dentro), medido em `proposta-versao.ts`.
   *
   * AUSENTES em todas as propostas anteriores a estes campos. Ausente lê-se
   * como «ainda não tem versão», e a primeira gravação a seguir dá-lhe a 1 —
   * ninguém escreve nada por cima das antigas.
   */
  versaoSelo?: string;
  versaoNumero?: number;
  /** ISO. Quando o CONTEÚDO mudou — não quando a linha foi tocada. */
  versaoEm?: string;
}
