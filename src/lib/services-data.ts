/**
 * Dedicated service pages content. Each entry powers /servicos/[slug] with
 * SEO-rich, location-aware copy and imagery. Keep the slugs stable — they
 * are part of the public URLs and the sitemap.
 */

export interface ServiceDetail {
  slug: string;
  title: string; // H1 on the page
  metaTitle: string; // <title>
  metaDescription: string;
  keywords: string[];
  hero: string; // hero image
  ogImage?: string; // landscape social-share image when `hero` is portrait
  intro: string[]; // intro paragraphs (keyword-rich)
  includes: string[]; // what's included
  gallery: string[]; // supporting images
  faqs: { q: string; a: string }[];
  related: string[]; // slugs of related services
}

export const SERVICES: ServiceDetail[] = [
  {
    slug: "casamentos",
    title: "Decoração de Casamentos",
    metaTitle: "Decoração de Casamentos",
    metaDescription:
      "Decoração de casamentos: design floral e cenografia à medida, com coordenação do dia em herdades, quintas e espaços únicos.",
    keywords: [
      "decoração de casamentos",
      "coordenação de casamentos",
      "aluguer de viaturas clássicas casamento",
      "decoração de casamentos herdade",
      "wedding decoration",
    ],
    hero: "/imagens/stephanie-mizio-715.jpg",
    intro: [
      "Transformamos o seu casamento num dia verdadeiramente inesquecível. Cuidamos de cada detalhe, da escolha do local perfeito à decoração elegante, até à organização completa da cerimónia e receção, garantindo que tudo reflete a sua personalidade e o seu estilo.",
      "Com uma equipa experiente e dedicada, proporcionamos um planeamento personalizado, assessoria e coordenação no dia, em herdades e quintas, para que possa viver plenamente o seu momento especial, sem preocupações.",
    ],
    includes: [
      "Conceito e design de decoração",
      "Decoração floral e cenografia",
      "Styling e mesa posta",
      "Ambiente e iluminação",
      "Articulação de fornecedores (catering, fotografia, vídeo)",
      "Coordenação no dia",
    ],
    gallery: [
      "/imagens/DaniGui_Preview20.jpg",
      "/imagens/matilde-tomas-27.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
      "/imagens/ines-goncalo-421.jpg",
      "/imagens/M&F0678.jpg",
      "/imagens/stephanie-mizio-760.jpg",
    ],
    faqs: [
      {
        q: "Com quanto tempo de antecedência devo contratar a decoração e coordenação?",
        a: "Idealmente alguns meses antes, para desenharmos a decoração e articularmos com os fornecedores. Mas conseguimos entrar mais perto da data, consoante a disponibilidade.",
      },
      {
        q: "Deslocam-se ao espaço onde vamos casar?",
        a: "Sim. Decoramos e coordenamos casamentos no espaço que escolherem, em articulação com os fornecedores de cada zona.",
      },
    ],
    related: ["festas-e-aniversarios"],
  },
  {
    slug: "aluguer-de-viaturas-classicas",
    title: "Aluguer de Viaturas Clássicas para Casamentos",
    metaTitle: "Aluguer de Viaturas Clássicas para Casamentos",
    metaDescription:
      "Aluguer de viaturas clássicas para casamentos: carros de época com motorista para a chegada da noiva e o transporte dos noivos e convidados.",
    keywords: [
      "aluguer de viaturas clássicas casamento",
      "carros clássicos casamento",
      "aluguer de carros de época",
      "viatura clássica casamento",
    ],
    hero: "/imagens/viaturas-classicas.jpg",
    intro: [
      "Alugamos carros clássicos com motorista para casamentos. A viatura vai decorada a condizer com o resto do casamento, e o percurso é combinado antes: onde para, a que horas sai, quanto tempo leva até à igreja num sábado de manhã.",
      "Serve para a chegada da noiva e, se quiserem, para levar os noivos e os convidados depois da cerimónia. O motorista é sempre experiente, para que ninguém do vosso lado tenha de conduzir naquele dia.",
    ],
    includes: [
      "Viatura clássica com motorista",
      "Decoração floral da viatura",
      "Chegada da noiva e transporte dos noivos",
      "Planeamento do percurso e logística",
      "Deslocação ao local do casamento",
    ],
    gallery: [
      "/imagens/M&F0512.jpg",
      "/imagens/stephanie-mizio-760.jpg",
      "/imagens/ines-goncalo-421.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
      "/imagens/matilde-tomas-27.jpg",
      "/imagens/DaniGui_Preview20.jpg",
    ],
    faqs: [
      {
        q: "As viaturas incluem motorista?",
        a: "Sim. Todas as viaturas clássicas são disponibilizadas com motorista experiente, para que só tenham de aproveitar a viagem.",
      },
      {
        q: "As viaturas deslocam-se até ao local do casamento?",
        a: "Sim. Levamos as viaturas ao local do casamento, mediante disponibilidade e planeamento da logística.",
      },
    ],
    related: ["casamentos"],
  },
  {
    slug: "eventos-corporativos",
    title: "Decoração de Eventos Corporativos",
    metaTitle: "Decoração de Eventos Corporativos",
    metaDescription:
      "Decoração e cenografia de eventos corporativos: conferências, congressos, teambuilding, lançamentos e jantares de empresa à medida.",
    keywords: [
      "decoração de eventos corporativos",
      "cenografia de conferências",
      "teambuilding empresas",
      "jantar de empresa",
    ],
    // Landscape twilight-courtyard frame (was EW1_1408, a portrait shot whose
    // wide-hero centre-crop landed on a pale, out-of-focus band — reading as a
    // broken/hazy hero and leaving the white nav links low-contrast).
    hero: "/imagens/EW1_1332.jpg",
    ogImage: "/imagens/EW1_1404.jpg",
    intro: [
      "Congressos, seminários, retiros empresariais, cerimónias de entrega de prémios e jantares corporativos. Criamos e produzimos eventos para empresas, universidades e instituições públicas, desde reuniões e encontros de equipa a grandes eventos com várias centenas de participantes.",
      "Da cenografia e decoração à logística e montagem no espaço, asseguramos uma gestão integrada de cada projeto. Coordenamos todos os parceiros envolvidos, do catering ao apoio técnico, e acompanhamos o evento no próprio dia para garantir que tudo decorre de forma fluida e profissional.",
      "Para eventos com convidados nacionais ou internacionais, podemos também apoiar na articulação da tradução simultânea, alojamento e transfers, proporcionando uma experiência completa e cuidadosamente coordenada.",
      "Um único parceiro para transformar o seu evento corporativo numa experiência profissional, diferenciadora e memorável.",
    ],
    includes: [
      "Congressos",
      "Seminários",
      "Retiros corporativos",
      "Cerimónias de premiação",
      "Convívios de empresa",
    ],
    gallery: [
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1404.jpg",
      "/imagens/hd-edited.jpg",
    ],
    faqs: [
      {
        q: "Deslocam-se ao espaço escolhido pela empresa?",
        a: "Sim. Produzimos eventos corporativos com equipa própria e uma rede de fornecedores de confiança.",
      },
      {
        q: "Tratam de eventos com convidados internacionais?",
        a: "Sim, temos experiência em eventos com logística internacional, incluindo tradução simultânea, alojamento e transfers.",
      },
    ],
    related: ["casamentos", "festas-e-aniversarios"],
  },
  {
    slug: "festas-e-aniversarios",
    title: "Decoração de Festas de Aniversário e Celebrações Privadas",
    metaTitle: "Decoração de Festas e Celebrações Privadas",
    metaDescription:
      "Decoração de festas de aniversário, batizados, comunhões e celebrações privadas. Conceito, cenografia, ambiente e coordenação à medida.",
    keywords: [
      "decoração de festas",
      "decoração de aniversários",
      "festa privada",
      "celebrações privadas",
    ],
    hero: "/imagens/DaniGui_JantarFesta_130.jpg",
    intro: [
      "Aniversários, festas temáticas e celebrações privadas, pensados ao detalhe para tornar cada ocasião verdadeiramente especial. Desde festas infantis a jantares e celebrações para adultos, criamos ambientes únicos a partir do tema, da personalidade e daquilo que idealiza, sem soluções pré-definidas.",
      "Da criação do conceito à decoração e coordenação no dia do evento, acompanhamos cada etapa para que tudo aconteça de forma harmoniosa e sem preocupações. Sempre que necessário, articulamos também com os restantes fornecedores, do catering à animação, garantindo que todos os elementos estão alinhados.",
      "Quanto mais cedo começarmos a planear, maior será a possibilidade de assegurar a data e cuidar de cada detalhe com tempo. Ainda assim, adaptamo-nos a diferentes necessidades e podemos assumir a organização mesmo numa fase mais próxima do evento, de acordo com a sua dimensão e complexidade.",
      "A sua ideia é o ponto de partida. Nós tratamos de a transformar numa celebração memorável.",
    ],
    includes: [
      "Conceito e tema da festa",
      "Decoração e cenografia do espaço",
      "Flores e styling de mesa",
      "Ambiente e iluminação",
      "Articulação de fornecedores (catering, animação)",
      "Coordenação no dia",
    ],
    gallery: [
      "/imagens/DaniGui_JantarFesta_1.jpg",
      "/imagens/DaniGui_JantarFesta_3.jpg",
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_14.jpg",
      "/imagens/DaniGui_JantarFesta_15.jpg",
      "/imagens/DaniGui_JantarFesta_18.jpg",
    ],
    faqs: [
      {
        q: "Fazem festas de aniversário temáticas?",
        a: "Sim. Desenhamos o conceito e a decoração à volta do tema que imaginar, de aniversários infantis a festas de adulto, sempre à medida.",
      },
      {
        q: "Com quanto tempo devo reservar a decoração da festa?",
        a: "Quanto mais cedo melhor para garantir a data, mas conseguimos entrar mais perto do dia, consoante a disponibilidade e a dimensão da festa.",
      },
    ],
    related: ["casamentos"],
  },
  {
    slug: "batizados-e-comunhoes",
    title: "Decoração de Batizados e Comunhões",
    metaTitle: "Decoração de Batizados e Comunhões",
    metaDescription:
      "Decoração de batizados e comunhões: celebrações familiares íntimas, com conceito, flores e mesa à medida, organizadas com carinho.",
    keywords: ["decoração de batizados", "decoração de comunhões", "celebração familiar"],
    hero: "/imagens/DaniGui_JantarFesta_26.jpg",
    intro: [
      "Os batizados e as comunhões são momentos especiais em família, que permanecem na memória ao longo da vida. A Líquen Events cria a decoração destas celebrações, sejam elas mais íntimas ou de maior dimensão, sempre com o mesmo cuidado e atenção ao detalhe.",
      "Cuidamos da decoração da cerimónia e, posteriormente, do almoço ou jantar, assegurando a continuidade do mesmo conceito em ambos os espaços, para que toda a celebração se desenvolva de forma harmoniosa e coerente.",
      "Assim, cabe à família simplesmente desfrutar do dia e de cada momento em conjunto.",
    ],
    includes: [
      "Conceito e cenografia da celebração",
      "Decoração floral e styling de mesa",
      "Mesa de doces e detalhes personalizados",
      "Ambiente e iluminação",
      "Articulação de fornecedores",
      "Coordenação no dia",
    ],
    gallery: [
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_JantarFesta_17.jpg",
      "/imagens/DaniGui_JantarFesta_24.jpg",
      "/imagens/DaniGui_JantarFesta_39.jpg",
      "/imagens/DaniGui_JantarFesta_41.jpg",
      "/imagens/DaniGui_JantarFesta_48.jpg",
    ],
    faqs: [
      {
        q: "Decoram o batizado na cerimónia e no almoço de família?",
        a: "Sim. Tratamos da decoração tanto no momento da cerimónia como no almoço ou jantar, com um conceito coerente entre os dois espaços.",
      },
      {
        q: "Deslocam-se ao espaço da celebração?",
        a: "Sim. Decoramos estas celebrações no espaço que escolherem, em articulação com os fornecedores de cada zona.",
      },
    ],
    related: ["festas-e-aniversarios", "casamentos"],
  },
];

/**
 * English overrides for the visible copy AND the page metadata (H1
 * title, intro, includes, FAQs, metaTitle, metaDescription). Only `keywords`
 * stays Portuguese — PT is the canonical, indexed language; getService() merges
 * the English copy for /en/servicos/*.
 */
type ServiceCopy = Pick<
  ServiceDetail,
  "title" | "intro" | "includes" | "faqs" | "metaTitle" | "metaDescription"
>;

const SERVICES_EN: Record<string, ServiceCopy> = {
  casamentos: {
    title: "Wedding Decoration",
    metaTitle: "Wedding Decoration",
    metaDescription:
      "Wedding decoration: bespoke floral design and scenography, with day-of coordination, at estates, quintas and unique venues.",
    intro: [
      "We turn your wedding into a truly unforgettable day. We take care of every detail, from choosing the perfect venue to elegant decoration and the complete organisation of the ceremony and reception, making sure everything reflects your personality and style.",
      "With an experienced, dedicated team, we provide bespoke planning, guidance and day-of coordination, at estates and quintas, so you can fully live your special moment, worry-free.",
    ],
    includes: [
      "Decoration concept and design",
      "Floral decoration and scenography",
      "Styling and table settings",
      "Atmosphere and lighting",
      "Supplier liaison (catering, photography, video)",
      "Day-of coordination",
    ],
    faqs: [
      {
        q: "How far in advance should I hire decoration and coordination?",
        a: "Ideally a few months before, so we can design the decoration and liaise with your suppliers. But we can come on board closer to the date, subject to availability.",
      },
      {
        q: "Do you travel to our venue?",
        a: "Yes. We decorate and coordinate weddings at the venue you choose, working with each area's suppliers.",
      },
    ],
  },
  "aluguer-de-viaturas-classicas": {
    title: "Classic Car Hire for Weddings",
    metaTitle: "Classic Car Hire for Weddings",
    metaDescription:
      "Classic car hire for weddings: vintage cars with a driver for the bride's arrival and transport for the couple and guests.",
    intro: [
      "We hire out classic cars with a driver for weddings. The car is decorated to match the rest of the wedding, and the route is agreed beforehand: where it waits, what time it leaves, how long it takes to reach the church on a Saturday morning.",
      "It covers the bride's arrival and, if you want, the couple and guests after the ceremony. The driver is always an experienced one, so nobody on your side has to drive that day.",
    ],
    includes: [
      "Classic car with driver",
      "Floral decoration of the car",
      "Bride's arrival and transport for the couple",
      "Route planning and logistics",
      "Travel to the wedding venue",
    ],
    faqs: [
      {
        q: "Do the cars come with a driver?",
        a: "Yes. Every classic car comes with an experienced driver, so all you have to do is enjoy the ride.",
      },
      {
        q: "Do the cars travel to the venue?",
        a: "Yes. We take the cars to the wedding venue, subject to availability and logistics planning.",
      },
    ],
  },
  "eventos-corporativos": {
    title: "Corporate Event Decoration",
    metaTitle: "Corporate Event Decoration",
    metaDescription:
      "Decoration and scenography for corporate events: conferences, congresses, team-building, product launches and company dinners.",
    intro: [
      "We produce congresses, seminars, company retreats, award ceremonies and corporate dinners. We work with companies, universities and public institutions, from team meetings to events of several hundred people.",
      "We handle the scenography, the decoration and the on-site build, liaise with your other suppliers, from catering to technical support, and take the coordination on the day. When guests come from abroad, we also help arrange simultaneous translation, accommodation and transfers.",
    ],
    includes: [
      "Congresses",
      "Seminars",
      "Corporate retreats",
      "Awards ceremonies",
      "Company socials",
    ],
    faqs: [
      {
        q: "Do you travel to our chosen venue?",
        a: "Yes. We produce corporate events with our own team and a trusted supplier network.",
      },
      {
        q: "Do you handle events with international guests?",
        a: "Yes, we have experience with international logistics, including simultaneous translation, accommodation and transfers.",
      },
    ],
  },
  "festas-e-aniversarios": {
    title: "Decoration for Birthday Parties and Private Celebrations",
    metaTitle: "Party & Private Celebration Decoration",
    metaDescription:
      "Decoration for birthday parties, christenings, communions and private celebrations. Concept, scenography, atmosphere and bespoke coordination.",
    intro: [
      "Birthdays, themed parties and private celebrations, from children's parties to grown-up dinners. The concept is designed around whatever theme you have in mind, rather than picked from a catalogue.",
      "We handle the concept, the decoration and the coordination on the day of the party, and liaise with whatever suppliers are still needed, from catering to entertainment. The earlier we talk, the easier it is to secure the date, though we can come on board close to the day depending on the size of the party.",
    ],
    includes: [
      "Party concept and theme",
      "Space decoration and scenography",
      "Flowers and table styling",
      "Atmosphere and lighting",
      "Supplier liaison (catering, entertainment)",
      "Day-of coordination",
    ],
    faqs: [
      {
        q: "Do you do themed birthday parties?",
        a: "Yes. We design the concept and decoration around whatever theme you imagine, from children's birthdays to grown-up parties, always bespoke.",
      },
      {
        q: "How far in advance should I book the party decoration?",
        a: "The earlier the better to secure the date, but we can come on board closer to the day, depending on availability and the size of the party.",
      },
    ],
  },
  "batizados-e-comunhoes": {
    title: "Christening & Communion Decoration",
    metaTitle: "Christening & Communion Decoration",
    metaDescription:
      "Decoration for christenings and communions: intimate family celebrations, with bespoke concept, flowers and table styling.",
    intro: [
      "Christenings and communions are family moments that last a lifetime. Líquen Events creates the decoration for these celebrations, intimate or larger in scale, always with the same care.",
      "From concept to the table, from flowers to the atmosphere, we handle every detail so all you have to do is be with the people who matter.",
    ],
    includes: [
      "Concept and scenography",
      "Floral décor and table styling",
      "Dessert table and personalised details",
      "Atmosphere and lighting",
      "Supplier liaison",
      "Coordination on the day",
    ],
    faqs: [
      {
        q: "Do you decorate both the ceremony and the family lunch?",
        a: "Yes. We handle the decoration both at the ceremony and at the lunch or dinner, with a concept that stays coherent across both spaces.",
      },
      {
        q: "Do you travel to the venue?",
        a: "Yes. We decorate these celebrations wherever they are held, working with each area's suppliers.",
      },
    ],
  },
};

export function getService(slug: string, locale: "pt" | "en" = "pt"): ServiceDetail | undefined {
  const svc = SERVICES.find((s) => s.slug === slug);
  if (!svc) return undefined;
  if (locale === "en" && SERVICES_EN[slug]) return { ...svc, ...SERVICES_EN[slug] };
  return svc;
}

// Maps a service slug to the quote form's event-type id (OrcamentoForm
// EVENT_TYPES), so a "Pedir orçamento" link from a service page can deep-link
// `?tipo=` and land with the type pre-selected — the visitor doesn't re-pick
// what they just came from. Unmapped slugs simply omit the param. Corporate
// sub-services all map to the single "Corporativo" option.
const SLUG_TO_QUOTE_TIPO: Record<string, string> = {
  casamentos: "casamentos",
  "aluguer-de-viaturas-classicas": "casamentos",
  "eventos-corporativos": "conferencias",
  "festas-e-aniversarios": "aniversarios",
  "batizados-e-comunhoes": "batizados",
};

/** Quote-form event-type id for a service slug, or undefined if none applies. */
export function quoteTipoForSlug(slug: string): string | undefined {
  return SLUG_TO_QUOTE_TIPO[slug];
}
