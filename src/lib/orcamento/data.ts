import type { EventCategory, EventType, LocationType, AddonCatalogItem } from "./types";

export const CATEGORIES: {
  id: EventCategory;
  label: string;
  subtitle: string;
  description: string;
  icon: string;
}[] = [
  {
    id: "empresas",
    label: "Eventos Empresariais",
    subtitle: "Para Empresas",
    description:
      "Conferências, teambuilding, lançamentos de produto e jantares corporativos que elevam a sua marca.",
    icon: "🏢",
  },
  {
    id: "particulares",
    label: "Eventos Particulares",
    subtitle: "Para Particulares",
    description:
      "Casamentos, batizados, aniversários e celebrações privadas tornadas verdadeiramente inesquecíveis.",
    icon: "✨",
  },
];

/**
 * The six choices the public quote form offers, in display order.
 *
 * Shared with the confirmation page: the stored `eventType` is looked up here
 * to get an INDEX, and the index reads the visitor's own language out of
 * `orcamento.eventTypeLabels`. Without this an English visitor was shown the
 * Portuguese label from EVENT_TYPES_BY_CATEGORY.
 *
 * Keep in step with `orcamento.eventTypeLabels` in both dictionaries — same
 * length, same order.
 */
export const QUOTE_EVENT_OPTIONS: {
  label: string;
  category: EventCategory | null;
  eventType: EventType | null;
}[] = [
  { label: "Casamento", category: "particulares", eventType: "casamentos" },
  { label: "Corporativo", category: "empresas", eventType: "conferencias" },
  { label: "Aniversário", category: "particulares", eventType: "aniversarios" },
  { label: "Batizado / Comunhão", category: "particulares", eventType: "batizados" },
  { label: "Jantar de Gala", category: "particulares", eventType: "jantares_gala" },
  { label: "Outro", category: null, eventType: null },
];

/** Weddings and christenings are organised by a couple/a family → plural
 *  register ("o vosso pedido"). Everything else stays singular formal. */
export function isPluralRegister(eventType: string | null | undefined): boolean {
  return eventType === "casamentos" || eventType === "batizados";
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM RÓTULO DE LISTA NÃO É UM SUBSTANTIVO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os rótulos aqui em cima — e os de `EVENT_TYPES_BY_CATEGORY` — existem para
 * uma LISTA de opções. Vêm no plural («Casamentos»), com barras («Batizado /
 * Comunhão»), e um deles é a ausência de tipo («Outro»). Servem para quem
 * escolhe; não servem para «o vosso pedido para o ___».
 *
 * Postos dentro de uma frase saíram exactamente como se esperaria, e saíram
 * para clientes verdadeiros: «É um gosto receber o vosso pedido PARA O
 * CASAMENTOS de 25 de janeiro», «para o OUTRO de 15 de maio», «para o BATIZADO
 * / COMUNHÃO de 3 de maio» — a barra de uma lista pendente a meio de uma frase.
 *
 * A separação é feita AQUI, na origem, e não em cada sítio que escreve uma
 * frase, porque eram cinco a remendar e o sexto nascia com o defeito:
 *
 *   • `QUOTE_EVENT_OPTIONS[].label` e os `label` da taxonomia — rótulos de
 *     LISTA. Só para desenhar a lista.
 *   • {@link eventTypeName} — o NOME do tipo, singular, sem barras, na língua
 *     de quem lê. É uma ETIQUETA («Evento: Casamento», «Wedding · 12 June»),
 *     nunca o sujeito de uma frase que precise de artigo.
 *   • {@link isQuoteOptionLabel} — reconhece um rótulo de lista guardado onde
 *     devia estar um nome, que é o que a base de dados tem de trás.
 *
 * E NENHUMA frase para o cliente depende de um artigo colado ao tipo. Não há
 * pluralizador nem tabela de géneros (nem os haverá: «Conferência» é feminino,
 * «Casamento» masculino, e «Outro» não tem salvação nenhuma como substantivo).
 * As frases foram reescritas para não precisarem — a mesma decisão que o email
 * à equipa já tinha tomado, em `api/orcamento/route.ts`.
 */

/**
 * O NOME de cada tipo de evento, nas duas línguas.
 *
 * Guardado fica só o `eventType`: um identificador estável, que não muda com a
 * língua de quem preencheu nem com a redacção de um rótulo. A tradução é da
 * LEITURA — como já acontece com a cerimónia e o espaço, mais abaixo. Era o
 * contrário que punha «Event: Casamento» num email inglês: a língua tinha sido
 * decidida na ESCRITA, e ficou lá gravada.
 */
export const EVENT_TYPE_NAMES: Record<EventType, { pt: string; en: string }> = {
  casamentos: { pt: "Casamento", en: "Wedding" },
  batizados: { pt: "Batizado", en: "Christening" },
  aniversarios: { pt: "Aniversário", en: "Birthday" },
  jantares_gala: { pt: "Jantar de Gala", en: "Gala Dinner" },
  conferencias: { pt: "Conferência", en: "Conference" },
  teambuilding: { pt: "Teambuilding", en: "Team Building" },
  lancamentos: { pt: "Lançamento de Produto", en: "Product Launch" },
  jantares_empresa: { pt: "Jantar de Empresa", en: "Company Dinner" },
};

/** O nome do tipo de evento, na língua de quem lê. Vazio quando não há tipo
 *  (é o que o «Outro» do formulário grava) ou quando não o conhecemos — e uma
 *  etiqueta vazia é uma linha que não se escreve, não um espaço em branco. */
export function eventTypeName(eventType: unknown, locale = "pt"): string {
  const nome = typeof eventType === "string" ? EVENT_TYPE_NAMES[eventType as EventType] : undefined;
  if (!nome) return "";
  return locale.startsWith("en") ? nome.en : nome.pt;
}

/** Só para comparar rótulos: sem espaços a mais, sem caixa, sem acentos.
 *
 *  Exportada porque há um segundo leitor com o mesmo problema: o dicionário de
 *  idiomas da proposta, que precisa de reconhecer um rótulo NOSSO guardado num
 *  campo do documento («Casamento», «Civil», «100 a 150») para o poder escrever
 *  na língua do casal. Duas normalizações escritas em dois sítios divergiriam, e
 *  o sintoma seria um campo que se traduz aqui e não se traduz ali. */
export function chaveDeRotulo(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Isto que está guardado como «nome do evento» é, afinal, um rótulo de lista?
 *
 * O `eventName` devia ser o nome que o cliente deu ao evento dele («Casamento
 * da Ana e do João»), e é por isso que vale a pena preferi-lo ao tipo. Mas o
 * formulário público gravou lá durante muito tempo o rótulo da LISTA — sempre
 * em português, mesmo nos pedidos feitos em inglês —, e a base de dados está
 * cheia deles. Reconhecê-los é o que impede que voltem a passar por nome: no
 * portal apareciam ao lado do tipo, «Casamento · Casamento · 15 de maio», e
 * num pedido inglês «Wedding · Casamento».
 */
export function isQuoteOptionLabel(value: unknown): boolean {
  const chave = chaveDeRotulo(value);
  if (!chave) return false;
  const rotulos = [
    ...QUOTE_EVENT_OPTIONS.map((o) => o.label),
    ...Object.values(EVENT_TYPES_BY_CATEGORY).flatMap((tipos) => tipos.map((t) => t.label)),
  ];
  return rotulos.some((r) => chaveDeRotulo(r) === chave);
}

/**
 * A ETIQUETA do evento, na língua de quem lê: o nome que o cliente lhe deu, ou
 * o tipo que escolheu. Vazia quando não há nem um nem outro — e uma etiqueta
 * vazia não se escreve.
 *
 * Etiqueta é tudo o que isto é: entra depois de um «·» ou de um «Evento:»,
 * onde nunca há concordância para discordar. Não é para se lhe colar um artigo
 * à frente.
 */
export function eventTagLabel(
  quote: { eventName?: string | null; eventType?: string | null },
  locale = "pt",
): string {
  const proprio = String(quote.eventName ?? "").trim();
  if (proprio && !isQuoteOptionLabel(proprio)) return proprio;
  return eventTypeName(quote.eventType, locale);
}

export const EVENT_TYPES_BY_CATEGORY: Record<
  EventCategory,
  {
    id: EventType;
    label: string;
    description: string;
    icon: string;
    minGuests: number;
    maxGuests: number;
    basePrice: number;
    pricePerPax: number;
    suggestedDuration: number;
    features: string[];
  }[]
> = {
  empresas: [
    {
      id: "conferencias",
      label: "Conferências & Congressos",
      description:
        "Eventos profissionais de grande formato para networking e partilha de conhecimento.",
      icon: "🎤",
      minGuests: 50,
      maxGuests: 2000,
      basePrice: 2800,
      pricePerPax: 16,
      suggestedDuration: 8,
      features: [
        "Gestão de palestrantes",
        "Coordenação AV",
        "Credenciamento digital",
        "Coffee breaks",
        "Moderação profissional",
        "Relatório pós-evento",
      ],
    },
    {
      id: "teambuilding",
      label: "Teambuilding",
      description:
        "Atividades e dinâmicas criativas para fortalecer equipas e aumentar a motivação.",
      icon: "🤝",
      minGuests: 10,
      maxGuests: 500,
      basePrice: 2000,
      pricePerPax: 30,
      suggestedDuration: 6,
      features: [
        "Design de atividades",
        "Facilitadores certificados",
        "Material didático",
        "Espaço dedicado",
        "Avaliação de resultados",
      ],
    },
    {
      id: "lancamentos",
      label: "Lançamentos de Produto",
      description:
        "Apresentações de produto com impacto visual e experiências de marca memoráveis.",
      icon: "🚀",
      minGuests: 20,
      maxGuests: 500,
      basePrice: 3800,
      pricePerPax: 24,
      suggestedDuration: 4,
      features: [
        "Conceito criativo",
        "Cenografia personalizada",
        "Gestão de imprensa",
        "Produção AV completa",
        "Experiências interativas",
      ],
    },
    {
      id: "jantares_empresa",
      label: "Jantares de Empresa",
      description:
        "Celebrações corporativas elegantes para reconhecimento, convívio e fortalecimento da cultura.",
      icon: "🥂",
      minGuests: 20,
      maxGuests: 600,
      basePrice: 2200,
      pricePerPax: 38,
      suggestedDuration: 5,
      features: [
        "Seleção de espaço premium",
        "Coordenação de catering",
        "Decoração temática",
        "Entretenimento",
        "Logística completa",
      ],
    },
  ],
  particulares: [
    {
      id: "casamentos",
      label: "Casamentos",
      description:
        "O dia mais especial da vossa vida, com uma decoração à vossa medida e o dia coordenado ao pormenor, para o viverem sem preocupações.",
      icon: "💒",
      minGuests: 30,
      maxGuests: 500,
      basePrice: 4500,
      pricePerPax: 42,
      suggestedDuration: 10,
      features: [
        "Decoração floral e cenografia",
        "Conceito e design decorativo",
        "Coordenação do dia do casamento",
        "Gestão e articulação de fornecedores",
        "Montagem e styling do espaço",
        "Ponto de contacto único no dia",
      ],
    },
    {
      id: "batizados",
      label: "Batizados & Comunhões",
      description:
        "Celebrações familiares intimistas com a ternura e personalização que a ocasião merece.",
      icon: "👶",
      minGuests: 15,
      maxGuests: 200,
      basePrice: 1400,
      pricePerPax: 24,
      suggestedDuration: 5,
      features: [
        "Tema personalizado",
        "Decoração floral",
        "Coordenação do dia",
        "Lembrança para convidados",
        "Fotografia dirigida",
      ],
    },
    {
      id: "aniversarios",
      label: "Festas de Aniversário",
      description:
        "Celebrações únicas para marcos importantes da sua vida com criatividade ao detalhe.",
      icon: "🎂",
      minGuests: 15,
      maxGuests: 300,
      basePrice: 1000,
      pricePerPax: 20,
      suggestedDuration: 6,
      features: [
        "Conceito criativo",
        "Decoração personalizada",
        "Entretenimento",
        "Bolo personalizado",
        "Gestão de convidados",
      ],
    },
    {
      id: "jantares_gala",
      label: "Jantares de Gala",
      description:
        "Experiências gastronómicas de luxo para ocasiões verdadeiramente especiais e memoráveis.",
      icon: "✨",
      minGuests: 20,
      maxGuests: 300,
      basePrice: 3200,
      pricePerPax: 52,
      suggestedDuration: 5,
      features: [
        "Chef de renome",
        "Menu degustação",
        "Sommelier dedicado",
        "Decoração de mesa premium",
        "Serviço de protocolo",
      ],
    },
  ],
};

export const PACKAGES: {
  id: "essencial" | "completo" | "premium" | "personalizado";
  label: string;
  description: string;
  multiplier: number;
  highlight: boolean;
  badge: string | null;
  included: string[];
  notIncluded: string[];
}[] = [
  {
    id: "essencial",
    label: "Essencial",
    description:
      "O essencial para um evento de qualidade, gerido com competência e profissionalismo.",
    multiplier: 1.0,
    highlight: false,
    badge: null,
    included: [
      "Coordenação no dia do evento",
      "Plano de evento detalhado",
      "Gestão de fornecedores básica",
      "Reunião inicial de briefing",
      "Suporte por email e telefone",
      "Relatório pós-evento",
    ],
    notIncluded: [
      "Decoração incluída",
      "Fotografia profissional",
      "Assistente dedicado",
      "Reuniões de acompanhamento",
    ],
  },
  {
    id: "completo",
    label: "Completo",
    description:
      "A escolha mais popular — cobertura total e acompanhamento dedicado para um evento sem preocupações.",
    multiplier: 1.45,
    highlight: true,
    badge: "Mais popular",
    included: [
      "Tudo do Essencial",
      "Assistente dedicado no evento",
      "3 reuniões de acompanhamento",
      "Coordenação pré-evento (3 meses)",
      "Gestão de fornecedores premium",
      "Decoração base incluída",
      "Visita ao espaço incluída",
      "Checklist completo de fornecedores",
    ],
    notIncluded: ["Fotografia profissional", "Decoração floral premium", "Entretenimento ao vivo"],
  },
  {
    id: "premium",
    label: "Premium",
    description:
      "Experiência sem limites — cada detalhe tratado com perfeição absoluta e serviço de excelência.",
    multiplier: 2.1,
    highlight: false,
    badge: "Experiência total",
    included: [
      "Tudo do Completo",
      "Equipa dedicada de 3 elementos",
      "Acompanhamento personalizado 24/7",
      "Decoração floral premium incluída",
      "Fotografia profissional (8h)",
      "Vídeo cinematográfico incluído",
      "Rede de fornecedores exclusivos",
      "Gestão de convidados VIP",
      "Transporte coordenado",
      "Welcome kit personalizado",
    ],
    notIncluded: [],
  },
  {
    id: "personalizado",
    label: "Personalizado",
    description:
      "Monte o seu pacote à medida, selecionando exatamente os serviços de que necessita.",
    multiplier: 1.0,
    highlight: false,
    badge: null,
    included: [
      "Escolha os serviços que precisa",
      "Flexibilidade total de configuração",
      "Orçamento adaptado ao detalhe",
    ],
    notIncluded: [],
  },
];

export const ADDON_CATALOG: AddonCatalogItem[] = [
  // Fotografia & Vídeo
  {
    id: "fotografia",
    name: "Fotografia Profissional",
    description:
      "Cobertura fotográfica completa do evento com edição profissional e galeria digital.",
    category: "Fotografia & Vídeo",
    icon: "📷",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "4h · 100 fotos editadas · galeria digital", price: 450 },
      completo: { label: "8h · 300 fotos · álbum 30×30cm", price: 850 },
      premium: { label: "12h · galeria completa · álbum premium · prints", price: 1600 },
    },
  },
  {
    id: "video",
    name: "Vídeo Cinematográfico",
    description: "Produção de vídeo profissional com edição cinemática em alta resolução.",
    category: "Fotografia & Vídeo",
    icon: "🎬",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Teaser 2min + highlights redes sociais", price: 680 },
      completo: { label: "Filme 10min + teaser + highlights + making of", price: 1250 },
      premium: { label: "Filme completo + making of + drone + 4K", price: 2400 },
    },
  },
  {
    id: "drone",
    name: "Filmagem com Drone",
    description: "Imagens aéreas impressionantes do evento e espaço em 4K.",
    category: "Fotografia & Vídeo",
    icon: "🚁",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "30min · edição básica · entrega digital", price: 280 },
      completo: { label: "1h · edição completa · integração no vídeo", price: 480 },
      premium: { label: "Jornada completa · 4K · plano de voo dedicado", price: 850 },
    },
  },
  {
    id: "photobooth",
    name: "Photobooth & Experiências",
    description: "Cabine fotográfica interativa para entretenimento e memórias dos convidados.",
    category: "Fotografia & Vídeo",
    icon: "🤳",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Photobooth simples · impressão no local (4h)", price: 300 },
      completo: { label: "Photobooth premium · props · galeria digital (6h)", price: 520 },
      premium: { label: "360° Booth · GIFs · Boomerangs · branding (8h)", price: 900 },
    },
  },
  // Catering
  {
    id: "catering",
    name: "Catering & F&B",
    description: "Serviço completo de alimentação e bebidas gerido com rigor e elegância.",
    category: "Catering",
    icon: "🍽️",
    pricingType: "per_pax",
    tiers: {
      essencial: { label: "Cocktail de boas-vindas + coffee breaks", price: 22 },
      completo: { label: "Menu 3 pratos + vinho + open bar básico", price: 55 },
      premium: { label: "Menu degustação + sommelier + open bar premium", price: 98 },
    },
  },
  {
    id: "cocktail_bar",
    name: "Bar & Cocktails Personalizados",
    description: "Bartenders profissionais com cocktails signature para o seu evento.",
    category: "Catering",
    icon: "🍸",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 bartender · carta básica (4h)", price: 200 },
      completo: { label: "2 bartenders · carta premium · cocktail signature (6h)", price: 380 },
      premium: { label: "3 bartenders · masterclass · cocktails personalizados (8h)", price: 650 },
    },
  },
  {
    id: "bolo",
    name: "Bolo Artesanal Personalizado",
    description: "Bolo de confeitaria artesanal criado especialmente para a ocasião.",
    category: "Catering",
    icon: "🎂",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Bolo personalizado até 50 doses", price: 190 },
      completo: { label: "Bolo artesanal decorado até 100 doses", price: 380 },
      premium: { label: "Alta pastelaria + sobremesas buffet", price: 750 },
    },
    eventTypes: ["casamentos", "batizados", "aniversarios", "jantares_gala"],
  },
  // Decoração
  {
    id: "decoracao_floral",
    name: "Decoração Floral",
    description: "Arranjos florais profissionais criados pelo nosso floral designer.",
    category: "Decoração",
    icon: "💐",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Centros de mesa simples + entrada floral", price: 380 },
      completo: { label: "Decoração completa + arco floral + buquê", price: 950 },
      premium: { label: "Instalação floral statement + decoração total", price: 2200 },
    },
  },
  {
    id: "iluminacao",
    name: "Iluminação Profissional & Efeitos",
    description: "Iluminação técnica e artística para criar a atmosfera perfeita.",
    category: "Decoração",
    icon: "💡",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Iluminação ambiente + spots direccionais", price: 300 },
      completo: { label: "Iluminação dinâmica RGB + efeitos + instalação", price: 620 },
      premium: { label: "LED + laser + mapping + operador residente", price: 1300 },
    },
  },
  {
    id: "cenografia",
    name: "Cenografia & Design de Espaço",
    description: "Criação de cenários e elementos decorativos únicos e impactantes.",
    category: "Decoração",
    icon: "🏛️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Backdrop + elementos decorativos básicos", price: 420 },
      completo: { label: "Cenário personalizado + branding integrado", price: 980 },
      premium: { label: "Instalação imersiva exclusiva + produção completa", price: 2800 },
    },
  },
  // Entretenimento
  {
    id: "musica_ao_vivo",
    name: "Música ao Vivo",
    description: "Atuações musicais ao vivo selecionadas para criar a atmosfera ideal.",
    category: "Entretenimento",
    icon: "🎵",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Duo acústico (2h) + repertório personalizado", price: 380 },
      completo: { label: "Quarteto (4h) + repertório + cocktail boas-vindas", price: 800 },
      premium: { label: "Banda completa (6h) + solista especial + surpresa", price: 2000 },
    },
  },
  {
    id: "dj",
    name: "DJ Profissional",
    description: "DJ residente com setup premium de som e luz para animar o evento.",
    category: "Entretenimento",
    icon: "🎧",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "DJ + sistema de som básico (4h)", price: 300 },
      completo: { label: "DJ + sistema premium + iluminação (6h)", price: 580 },
      premium: { label: "DJ headliner + setup completo + cabine (8h+)", price: 1200 },
    },
  },
  {
    id: "apresentador",
    name: "Apresentador / Mestre de Cerimónias",
    description: "Profissional experiente para conduzir o programa com elegância.",
    category: "Entretenimento",
    icon: "🎙️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Apresentador profissional (até 3h)", price: 380 },
      completo: { label: "Apresentador premium (até 6h) + guião", price: 700 },
      premium: { label: "Apresentador TV/rádio + ensaio + guião completo", price: 1400 },
    },
  },
  {
    id: "animacao",
    name: "Animação & Atividades",
    description: "Atividades lúdicas e experiências de animação para os convidados.",
    category: "Entretenimento",
    icon: "🎪",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 atividade + animador (2h)", price: 220 },
      completo: { label: "3 atividades + equipa de 2 (4h)", price: 480 },
      premium: { label: "Programa completo + surpresa + experiências imersivas", price: 950 },
    },
  },
  // Produção Técnica
  {
    id: "som_profissional",
    name: "Sistema de Som Profissional",
    description: "Equipamento de áudio de alta qualidade com técnico de som certificado.",
    category: "Produção Técnica",
    icon: "🔊",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "PA básico + microfone sem fio + mixer", price: 200 },
      completo: { label: "PA profissional + microfones + técnico residente", price: 420 },
      premium: { label: "Sistema line array + técnico + teste técnico completo", price: 950 },
    },
  },
  {
    id: "projecao_led",
    name: "Vídeo, Projeção & LED",
    description: "Ecrãs, projectores e soluções de visualização de alto impacto.",
    category: "Produção Técnica",
    icon: "📽️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Projector + ecrã 3m + montagem técnica", price: 240 },
      completo: { label: "2 ecrãs LED + técnico AV + integração completa", price: 620 },
      premium: { label: "Video wall LED + técnico + integração total + backup", price: 1500 },
    },
  },
  {
    id: "streaming",
    name: "Streaming & Transmissão ao Vivo",
    description: "Transmissão profissional do evento para audiências remotas em todo o mundo.",
    category: "Produção Técnica",
    icon: "📡",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Stream básico 1 câmara + link privado + gravação", price: 320 },
      completo: { label: "Stream multi-câmara + moderação + gravação HD", price: 700 },
      premium: { label: "Produção broadcast + realização + servidor dedicado", price: 1500 },
    },
  },
  // Logística
  {
    id: "transporte",
    name: "Transporte & Transferes",
    description: "Gestão completa de transportes para convidados, staff e fornecedores.",
    category: "Logística",
    icon: "🚌",
    pricingType: "per_unit",
    tiers: {
      essencial: { label: "Minibus 9 lugares por viagem", price: 130 },
      completo: { label: "Autocarro 50 lugares por viagem", price: 300 },
      premium: { label: "Frota dedicada + coordenador de transportes (dia)", price: 900 },
    },
  },
  {
    id: "seguranca",
    name: "Segurança Privada",
    description: "Serviço de segurança profissional e discreto para o evento.",
    category: "Logística",
    icon: "🔒",
    pricingType: "per_unit",
    tiers: {
      essencial: { label: "1 segurança por turno de 8h", price: 200 },
      completo: { label: "3 seguranças + coordenador por turno de 8h", price: 520 },
      premium: { label: "Equipa completa + plano de segurança personalizado", price: 1050 },
    },
  },
  {
    id: "traducao",
    name: "Tradução & Interpretação Simultânea",
    description: "Serviços de interpretação profissional para eventos internacionais.",
    category: "Logística",
    icon: "🌐",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "1 intérprete + 1 idioma (por sessão)", price: 380 },
      completo: { label: "2 intérpretes + 2 idiomas + cabine", price: 820 },
      premium: { label: "Equipa multilingue + cabines + equipamento recetor", price: 1600 },
    },
    eventTypes: ["conferencias", "lancamentos"],
  },
  // Comunicação
  {
    id: "convites_papelaria",
    name: "Convites & Papelaria Premium",
    description: "Design exclusivo e produção de convites e materiais personalizados.",
    category: "Comunicação",
    icon: "✉️",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Convite digital + save the date (gestão envios)", price: 200 },
      completo: { label: "Convite impresso + digital + papelaria base (200 un)", price: 450 },
      premium: { label: "Kit completo premium + embalagem especial (500 un)", price: 1050 },
    },
  },
  {
    id: "pr_comunicacao",
    name: "Relações Públicas & Media",
    description: "Gestão de comunicação, cobertura mediática e presença digital do evento.",
    category: "Comunicação",
    icon: "📰",
    pricingType: "fixed",
    tiers: {
      essencial: { label: "Press release + 3 publicações redes sociais", price: 280 },
      completo: { label: "Gestão redes sociais + press + acreditação media", price: 600 },
      premium: { label: "Agência PR dedicada + media planning + influencers", price: 1600 },
    },
  },
];

export const LOCATION_SURCHARGES: Record<LocationType, number> = {
  lisboa: 0,
  porto: 0.08,
  grande_cidade: 0.15,
  pequena_cidade: 0.25,
  internacional: 0.5,
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  lisboa: "Lisboa e Área Metropolitana",
  porto: "Porto e Área Metropolitana",
  grande_cidade: "Outra Grande Cidade (Coimbra, Braga…)",
  pequena_cidade: "Cidade Pequena / Zona Rural",
  internacional: "Internacional / Destino",
};

/**
 * ORDENS DE GRANDEZA PARA QUEM AINDA NÃO SABE O NÚMERO EXACTO.
 *
 * Marcar «ainda a definir» dizia à equipa apenas que não havia número — e um
 * casamento de 40 pessoas e um de 300 não são o mesmo trabalho nem o mesmo
 * orçamento. Quase toda a gente que ainda não fechou a lista sabe a ordem de
 * grandeza, e é isso que estes intervalos pedem.
 *
 * Os cortes seguem os limites reais dos eventos dela (`minGuests`/`maxGuests`
 * em EVENT_TYPES_BY_CATEGORY): os casamentos vão de 30 a 500.
 */
export const GUEST_RANGES: { id: string; label: string; en: string }[] = [
  { id: "ate-50", label: "Até 50", en: "Up to 50" },
  { id: "50-100", label: "50 a 100", en: "50 to 100" },
  { id: "100-150", label: "100 a 150", en: "100 to 150" },
  { id: "150-200", label: "150 a 200", en: "150 to 200" },
  { id: "200-300", label: "200 a 300", en: "200 to 300" },
  { id: "mais-300", label: "Mais de 300", en: "More than 300" },
];

/** O rótulo de um intervalo, na língua do pedido. Vazio se não o conhecermos. */
export function guestRangeLabel(id: unknown, locale = "pt"): string {
  const r = GUEST_RANGES.find((x) => x.id === id);
  if (!r) return "";
  return locale.startsWith("en") ? r.en : r.label;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIPO DE CERIMÓNIA — civil, religiosa, ou as duas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Muda o trabalho antes de mudar o preço. Uma cerimónia religiosa acontece
 * numa igreja que não é o espaço do copo de água: é um segundo sítio para
 * decorar, com regras próprias (o que a paróquia deixa pôr, a que horas se
 * pode montar) e uma deslocação da equipa a meio do dia. Uma cerimónia civil
 * costuma acontecer no próprio espaço, e aí a decoração da cerimónia e a do
 * cocktail são a mesma montagem.
 *
 * Saber isto no PEDIDO evita a pergunta na primeira chamada — e evita orçamentar
 * uma montagem quando eram duas, que é a maneira mais cara de descobrir.
 *
 * ── PORQUE É QUE SÃO QUATRO E NÃO DUAS ───────────────────────────────────
 *
 * Ela pediu «civil ou religiosa». Em Portugal, muitos casais fazem as duas (o
 * registo civil antes, a igreja no dia), e há quem faça uma cerimónia simbólica
 * com celebrante — sem valor legal, mas com arco, cadeiras e passadeira, que
 * para quem decora é uma cerimónia a sério. Com duas opções só, esses casais
 * escolheriam a errada, e uma resposta errada é pior do que uma em branco.
 *
 * Não há opção «ainda não sei» de propósito: o campo é OPCIONAL e as opções
 * desmarcam-se, portanto não responder já é a resposta «ainda não sabemos».
 */
export const CEREMONY_TYPES: { id: string; label: string; en: string }[] = [
  { id: "civil", label: "Civil", en: "Civil" },
  { id: "religiosa", label: "Religiosa", en: "Religious" },
  { id: "simbolica", label: "Simbólica", en: "Symbolic" },
];

/**
 * ── A QUE SAIU, E QUE CONTINUA A SABER-SE LER ────────────────────────────────
 *
 * «Retira esta opção», sobre a «Civil e religiosa». Sai da lista que o
 * formulário oferece, e mais ninguém a pode escolher.
 *
 * Mas não pode sair DAQUI, e a razão não é sentimental. O `ceremonyType` fica
 * gravado no pedido pelo id, e o `ceremonyTypeLabel` devolve VAZIO para um id
 * que não conheça — é o que a nota do `validation.ts` diz por extenso. Apagá-la
 * da tabela punha em branco a linha «Cerimónia» de todos os pedidos que já a
 * escolheram, e um pedido é a resposta de um casal: o que eles disseram não
 * deixa de ser verdade por nós termos mudado o formulário.
 *
 * Fica portanto conhecida para LER e desconhecida para ESCOLHER — que é a
 * diferença entre encurtar um formulário e apagar arquivo.
 */
const CERIMONIAS_RETIRADAS: { id: string; label: string; en: string }[] = [
  { id: "civil-religiosa", label: "Civil e religiosa", en: "Civil and religious" },
];

/** O rótulo do tipo de cerimónia, na língua do pedido. Vazio se não o conhecermos. */
export function ceremonyTypeLabel(id: unknown, locale = "pt"): string {
  const c = [...CEREMONY_TYPES, ...CERIMONIAS_RETIRADAS].find((x) => x.id === id);
  if (!c) return "";
  return locale.startsWith("en") ? c.en : c.label;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * INTERIOR OU EXTERIOR — a pergunta que decide o plano B
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a diferença entre pôr um arranjo numa mesa e pôr o mesmo arranjo onde ele
 * tem de aguentar vento, sol de agosto e a hipótese de chover. Ao ar livre há
 * flores que não sobrevivem à tarde, velas que não ficam acesas, estruturas que
 * precisam de peso, e há sempre uma montagem alternativa a preparar para o caso
 * de o tempo virar — trabalho que existe ou não existe consoante esta resposta,
 * e que ninguém consegue orçamentar sem ela.
 *
 * Ao contrário do tipo de cerimónia, esta pergunta aparece em TODOS os eventos:
 * um aniversário no jardim e um jantar de empresa numa sala têm exactamente o
 * mesmo problema.
 */
export const SPACE_TYPES: { id: string; label: string; en: string }[] = [
  { id: "interior", label: "Interior", en: "Indoors" },
  { id: "exterior", label: "Exterior", en: "Outdoors" },
  { id: "interior-exterior", label: "Interior e exterior", en: "Indoors and outdoors" },
];

/** O rótulo do tipo de espaço, na língua do pedido. Vazio se não o conhecermos. */
export function spaceTypeLabel(id: unknown, locale = "pt"): string {
  const s = SPACE_TYPES.find((x) => x.id === id);
  if (!s) return "";
  return locale.startsWith("en") ? s.en : s.label;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COORDENAÇÃO DO DIA — pedido dela, 25/10
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «No pedido de orçamento eu gostava de colocar lá a opção de coordenação do
 * dia.» Uma pastilha só, em TODOS os eventos: quem a marca quer que a equipa
 * trate dos horários, dos fornecedores e dos imprevistos no dia. É uma escolha
 * de sim/nada — desmarcar é não ter dito.
 */
export const COORDENACAO_DO_DIA: { id: string; label: string; en: string }[] = [
  { id: "sim", label: "Coordenação do dia", en: "Day-of coordination" },
];

/** «Sim»/«Yes» quando a pediram, vazio quando não disseram nada. */
export function coordenacaoLabel(v: unknown, locale = "pt"): string {
  if (v !== true) return "";
  return locale.startsWith("en") ? "Yes" : "Sim";
}

export const BUDGET_RANGES: { id: string; label: string }[] = [
  { id: "ate_5k", label: "Até €5.000" },
  { id: "5k_15k", label: "€5.000 – €15.000" },
  { id: "15k_30k", label: "€15.000 – €30.000" },
  { id: "30k_60k", label: "€30.000 – €60.000" },
  { id: "60k_plus", label: "€60.000 ou mais" },
];

export const URGENCY_OPTIONS: {
  id: string;
  label: string;
  description: string;
  surchargeLabel: string;
  surcharge: number;
}[] = [
  {
    id: "standard",
    label: "Standard",
    description: "Mais de 30 dias de antecedência",
    surchargeLabel: "Sem acréscimo",
    surcharge: 0,
  },
  {
    id: "rush",
    label: "Urgente",
    description: "15 a 30 dias de antecedência",
    surchargeLabel: "+20%",
    surcharge: 0.2,
  },
  {
    id: "urgente",
    label: "Muito Urgente",
    description: "Menos de 15 dias de antecedência",
    surchargeLabel: "+40%",
    surcharge: 0.4,
  },
];

export const REFERRAL_SOURCES = [
  "Pesquisa no Google",
  "Instagram",
  "Facebook",
  "LinkedIn",
  "Recomendação de amigo ou familiar",
  "Recomendação profissional",
  "Evento anterior",
  "Imprensa / Media",
  "Outro",
];

export const ADDON_CATEGORIES = [
  "Fotografia & Vídeo",
  "Catering",
  "Decoração",
  "Entretenimento",
  "Produção Técnica",
  "Logística",
  "Comunicação",
];
