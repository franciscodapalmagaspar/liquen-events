import type { Dict } from "./pt";

/**
 * English dictionary — typed against the Portuguese shape (`Dict`), so any
 * missing/extra key is a compile error. Keep it in sync with pt.ts.
 */
export const en: Dict = {
  skipLink: "Skip to content",

  testimonials: [
    {
      name: "António Bettencourt",
      role: "Corporate Event",
      quote:
        "The atmosphere your team created elevated the image of our event. We were impressed by the sophistication of the décor.",
    },
    {
      name: "Alexandra Teixeira",
      role: "Social Event",
      quote:
        "The team's dedication to creating magical settings, with impeccable décor and flawless coordination, let us enjoy the event without a single worry.",
    },
    {
      name: "Stephanie & Mizio",
      role: "Private Event",
      quote: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
    },
    {
      name: "Teresinha Malta",
      role: "Social Event",
      quote:
        "Outstanding service, with great care and availability from the whole team. They exceeded every expectation.",
    },
  ],

  langToggle: {
    label: "Language",
    pt: "PT",
    en: "EN",
    switchToPt: "Switch to Portuguese",
    switchToEn: "Switch to English",
  },

  nav: {
    inicio: "Home",
    menuLabel: "Menu",
    primaryLabel: "Primary",
    breadcrumb: "Breadcrumb",
    closeMenu: "Close menu",
    sobre: "About",
    servicos: "Services",
    galeria: "Gallery",
    clientes: "Clients",
    contacto: "Contact",
    orcamento: "Quote",
    pedirOrcamento: "Request a quote",
  },

  common: {
    /**
     * O nome do estado de espera de uma navegação lenta.
     *
     * Não aparece aos olhos — quem vê recebe o logótipo a respirar, que é
     * o que ela pediu. Isto é para quem OUVE o ecrã, e existe porque a
     * regra da casa é «nunca um estado de espera sem nome»: um logótipo é
     * bonito e não é um nome.
     */
    aAbrir: "Opening the page…",
    pedirOrcamento: "Request a quote",
    verGaleria: "View gallery",
    verServicos: "View services",
    entrarContacto: "Get in touch",
    falarConnosco: "Talk to us",
    voltarInicio: "Back to home",
    abrirWhatsApp: "Open WhatsApp",
    newWindow: "opens in a new window",
    enviarEmail: "Send e-mail",
    contactWhatsApp: "Contact us on WhatsApp",
    clientsSay: "What our clients say",
    reviewsLabel: "reviews",
    testemunhoLabel: "Testimonial",
    pausar: "Pause testimonial rotation",
    retomar: "Resume testimonial rotation",
    pausarLogos: "Pause logo marquee",
    retomarLogos: "Resume logo marquee",
    whatsappPrefill:
      "Hi! I'd like to know more about Líquen Events' event decoration and planning, and how you could help with mine.",
    // Localized alt text for the shared marketing imagery (served on both
    // languages — a hardcoded PT alt would leave EN pages untranslated).
    imageAlt: {
      homeHero: "Líquen Events: aerial view of an event",
      homeWedding: "Wedding at sunset on a country estate",
      contactoHero: "Aerial view of an estate set up for an event",
      sobrePortrait: "A wedding moment decorated by Líquen Events",
      sobreGolden: "Wedding celebration in golden light",
      sobreOutdoor: "Outdoor wedding decorated by Líquen Events",
      clientesAerial: "Aerial view of a Líquen Events event",
      servicosCeremony: "Outdoor ceremony planned by Líquen Events",
      servicosEvening: "Wedding celebrated at dusk on a country estate",
      orcamentoPanel: "Celebration dinner with a set table and candlelit décor",
      galeriaHeader: "Gallery of weddings and events decorated by Líquen Events",
      galeriaInstagram: "Events decorated by Líquen Events on Instagram",
      sobreCelebration: "Wedding celebration decorated by Líquen Events",
      sobreFounder: "Catarina Gaspar, Founder & CEO of Líquen Events",
      clientesCorporate: "Corporate event decorated by Líquen Events",
      clientesDinner: "Event dinner decorated by Líquen Events",
      servicosEndOfDay: "Event decorated by Líquen Events at the end of the day",
      // Base reused across the ad-landing portfolio grids (regional hub,
      // destination, style): callers append the context (region, style) and
      // the photo number so each caption stays distinct.
      portfolioExemplo: "Example of Líquen Events decoration",
      contactoBand: [
        "Outdoor wedding ceremony",
        "Wedding at sunset on an estate",
        "Wedding dinner table setting with floral decoration",
      ],
    },
    // The back office entry screen greeting (see EntradaComFotografia.tsx).
    // Morning until noon, afternoon until 8pm.
    entradaAdmin: {
      bomDia: "Good morning",
      boaTarde: "Good afternoon",
      boaNoite: "Good evening",
    },
  },

  meta: {
    ogLocale: "en_GB",
    homeTitle: "Wedding & Event Decoration | Líquen Events",
    homeDescription:
      "Líquen Events decorates and coordinates weddings, company events and private celebrations, across Portugal.",
    sobreTitle: "Event Decoration & Coordination Company",
    sobreDescription:
      "Líquen Events, an event decoration and coordination company: weddings, company events and private celebrations, across Portugal.",
    servicosTitle: "Event Decoration & Production Services",
    servicosDescription:
      "Wedding decoration and coordination, plus decoration of corporate events, gala dinners and private parties.",
    galeriaTitle: "Wedding & Event Gallery",
    galeriaDescription:
      "Photo gallery of events decorated by Líquen Events: weddings, corporate events, conferences and celebrations.",
    clientesTitle: "Companies and Institutions That Trust Us",
    clientesDescription:
      "Companies and institutions that trust Líquen Events: universities, city councils, José de Mello, Deloitte, Aernnova, Mainova and many more.",
    contactoTitle: "Contact: Request Your Event Quote",
    contactoDescription:
      "Contact Líquen Events to decorate your event, wherever it takes place. Receive a tailored proposal.",
    orcamentoTitle: "Request a Quote: Weddings & Events",
    orcamentoDescription:
      "Request your quote from Líquen Events. Tell us the event type, date and number of guests, and receive a tailored proposal.",
  },

  // JSON-LD structured data (StructuredData.tsx) — kept in the dictionary so
  // the markup's language always matches the visible page's.
  jsonld: {
    hasOfferCatalogName: "Event & wedding decoration services",
    services: [
      "Wedding decoration and coordination",
      "Corporate events and conferences",
      "Private parties and celebrations",
      "Gala dinners and social events",
    ],
    servicosServiceName: "Event decoration and wedding coordination",
    servicosServiceDescription:
      "Wedding decoration and coordination, plus decoration of corporate events, conferences and celebrations.",
  },

  home: {
    eyebrow: "Event decoration",
    heroLines: [{ words: ["We", "make", "memories"] }, { words: ["last"], moss: true }],
    scroll: "Scroll",
    wallEyebrow: "Our work",
    wallTitle: "What stays with you",
    servicesEyebrow: "What we do",
    services: [
      { tag: "Celebrations", title: "Weddings" },
      { tag: "Companies", title: "Corporate" },
      { tag: "Celebrations", title: "Private" },
    ],
    ctaEyebrow: "Next step",
    ctaTitleLine1: "Have an event",
    ctaTitleLine2: "in mind?",
    ctaText: "Tell us your idea. We listen to your vision and reply with a tailored proposal.",
  },

  sobre: {
    heroEyebrow: "Who we are",
    heroTitlePre: "About ",
    heroTitleMoss: "Líquen",
    scroll: "Scroll",
    manifestoEyebrow: "Our essence",
    manifestoTitleLine1: "We decorate events.",
    manifestoTitleLine2: "We make memories last.",
    // Corner caption (chapter idiom) over the manifesto photograph.
    manifestoImageCaption: "Events · since 2018",
    statementLead: "We don't just decorate spaces.",
    statementRest: " We design experiences that last forever.",
    founderEyebrow: "The people",
    founderQuote:
      "Every event is a chance to create something extraordinary. That's what drives us.",
    founderName: "Catarina Gaspar",
    founderRole: "Founder & CEO",
    ctaEyebrow: "Let's create together",
    ctaTitleLine1: "Shall we work",
    ctaTitleMoss: "together?",
    ctaText: "From the first conversation to the last toast, the event is ours to run.",
    galleryAlt: [
      "Outdoor wedding ceremony on a country estate",
      "Wedding party under hanging lights at dusk",
      "Newlyweds embracing during the wedding celebration",
      "Wedding table setting with flowers and candles",
      "Wedding at dusk outdoors",
      "Floral decoration of a wedding ceremony",
    ],
  },

  galeria: {
    headerLabel: "Our moments",
    headerTitle: "Gallery",
    headerDesc: "Weddings, corporate events and celebrations, captured in detail.",
    instaEyebrow: "Social media",
    instaTitle: "Follow us on Instagram",
    instaText: "We share behind-the-scenes from our events and daily inspiration.",
    verMais: "View more",
    de: "of",
    labels: {
      Todos: "All",
      Casamento: "Wedding",
      Corporativo: "Corporate",
      Conferência: "Conference",
      Aéreo: "Aerial",
      Evento: "Event",
    },
    alt: {
      Casamento: "Wedding decorated by Líquen Events",
      Corporativo: "Corporate event organised by Líquen Events",
      Conferência: "Conference organised by Líquen Events",
      Aéreo: "Aerial view of a Líquen Events event",
      Evento: "Event organised by Líquen Events",
    },
    lbGallery: "Gallery",
    lbPhoto: "photo",
    lbOf: "of",
    lbErro: "This photo didn't load",
    lbTentar: "Try again",
    lbClose: "Close",
    lbPrev: "Previous photo",
    lbNext: "Next photo",
    viewWedding: "View this wedding",
    backToGallery: "All photos",
    photosLabel: "photos",
    lbAtalhos: "Keyboard shortcuts",
    keyboardHint: "← → navigate · f full screen · esc to close",
    backToTop: "Back to top",
    gridLabel: "Photo gallery",
    gridHint: "Use the arrow keys to move through the photos and Enter to open.",
    photoUnavailable: "Photo unavailable",
  },

  clientes: {
    heroEyebrow: "Who trusts us",
    heroTitleLine1: "Our",
    heroTitleMoss: "Clients",
    heroLead:
      "Companies, institutions and families who chose us for their most special moments, and who honour us with their trust.",
    scroll: "Scroll",
    leadPre:
      "From large companies to family celebrations, countless clients entrust us with their most important moments. We answer that trust with ",
    leadMoss: "rigour, creativity and dedication",
    leadPost: " in every detail.",
    desde: "Since",
    logosEyebrow: "Companies & institutions",
    logosTitle: "Brands that trust us",
    featuredEyebrow: "Testimonials",
    featuredQuote:
      "The team's dedication to creating magical settings, with impeccable décor and flawless coordination, let us enjoy the event without a single worry.",
    featuredName: "Alexandra Teixeira",
    featuredRole: "Social Event",
    gridTitle: "Words from those who trusted us.",
    testimonials: [
      {
        name: "António Bettencourt",
        text: "The atmosphere your team created elevated the image of our event. We were impressed by the sophistication of the décor.",
        event: "Corporate Event",
      },
      {
        name: "Stephanie & Mizio",
        text: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
        event: "Private Event",
      },
      {
        name: "Teresinha Malta",
        text: "Outstanding service, with great care and availability from the whole team. They exceeded every expectation.",
        event: "Social Event",
      },
      {
        name: "Ana Pinho",
        text: "Excellent. I recommend them without reservation. A team you can trust from start to finish.",
        event: "Private Event",
      },
    ],
    mosaicEyebrow: "Moments from our events",
    mosaicLabels: ["Corporate", "Wedding", "Gala", "Wedding", "Dinner", "Gala", "Institutional"],
    ctaEyebrow: "Next event",
    ctaTitleLine1: "Join our",
    ctaTitleLine2: "clients",
    ctaText: "Tell us your idea.",
    galleryAlt: [
      "Corporate event reception in a courtyard",
      "Wedding with floral decoration on a country estate",
      "Candlelit gala dinner at an event",
      "Outdoor wedding with table setting and floral arrangements",
      "Gala dinner with table setting and candles",
      "Corporate gala in a decorated hall at night",
      "Institutional event with stage and audience",
    ],
  },

  contacto: {
    direct: {
      ctaEyebrow: "Ready to begin?",
      ctaTitleLine1: "Request your",
      ctaTitleMoss: "quote.",
      ctaText:
        "Tell us about your event and we reply with a tailored proposal. For a quick question, use one of the direct channels.",
      ctaButton: "Request a quote",
    },
    testimonialsEyebrow: "What our clients say",
    nextEyebrow: "What happens next",
    steps: [
      {
        title: "We receive your request",
        desc: "We review your request and prepare a tailored response.",
      },
      { title: "We get in touch", desc: "We set up a conversation to understand your vision." },
      { title: "Tailored proposal", desc: "A detailed proposal with transparent pricing." },
      { title: "We start creating", desc: "We handle every detail for an unforgettable event." },
    ],
    faqEyebrow: "Frequently asked questions",
    faqTitleLine1: "Got",
    faqTitleLine2: "questions?",
    faqSub: "If you can't find the answer you're looking for, contact us directly.",
    whatsappEyebrow: "Instant reply",
    whatsappTitleLine1: "Prefer to talk",
    whatsappTitleLine2: "right now?",
    whatsappText: "Talk to us directly on WhatsApp.",
    form: {
      heroEyebrow: "Get in touch",
      heroTitleLine1: "Let's create something",
      heroTitleMoss: "extraordinary",
      infoEyebrow: "Find us",
      emailLabel: "E-mail",
      emailSub: "We reply to every request with care",
      phoneLabel: "Phone",
      phoneSub: "Call or message us",
      locationLabel: "Location",
      locationValue: "Events · since 2018",
      locationSub: "In-person meetings available",
      quoteLink: "Request a quote for your event",
      whatsappLink: "Chat on WhatsApp",
      googleLink: "See on Google · Leave a review",
      promise: "We reply to every request with a personalised proposal.",
      promiseSign: "The Líquen Events team",
      stepLabels: ["Event", "Details", "Specifics", "Message"],
      eventCards: [
        { value: "Corporate", desc: "Conferences, team-building, dinners" },
        { value: "Wedding", desc: "The most special day of your life" },
        { value: "Birthday", desc: "Memorable parties and celebrations" },
        { value: "Gala Dinner", desc: "Prestige social events" },
        { value: "Other", desc: "A custom event, tailored to you" },
      ],
      guestRanges: ["Up to 30", "30–80", "80–150", "150–300", "300+"],
      step1Title1: "What kind of event",
      step1Title2: "are you planning?",
      step1Sub: "Select the option that best describes your event.",
      step2Title: "Tell us who you are.",
      step2Sub: "Your contact details so we can reach you.",
      step3Title: "Event details.",
      step3Sub: "Help us understand the scale and the timing.",
      step4Title: "Your vision.",
      step4Sub: "Describe the event of your dreams. The more detail, the better.",
      labelNome: "Name *",
      labelEmail: "E-mail *",
      labelTelefone: "Phone",
      labelData: "Preferred Date",
      labelConvidados: "No. of Guests",
      labelOrcamento: "Budget (optional)",
      labelMensagem: "Message *",
      phName: "Your full name",
      phEmail: "email@example.com",
      phPhone: "+351 9XX XXX XXX",
      msgPrefix: "Event type: ",
      phMensagem: "Preferred venue, theme, inspirations, special details...",
      summaryEvento: "Event",
      summaryConvidados: "Guests",
      summaryOrcamento: "Budget",
      summaryData: "Date",
      continuar: "Continue",
      voltar: "Back",
      enviar: "Send Request",
      enviando: "Sending…",
      resposta24: "Tailored proposal",
      errNome: "Please enter your name",
      errEmail: "Invalid email",
      error: "Your message did not go through. Please try again or contact us on WhatsApp.",
      successEyebrow: "Sent successfully",
      successTitle1: "Message",
      successTitle2: "received.",
      successThanks: "Thank you",
      successText: ". We'll be in touch shortly to move forward with your event together.",
      successSteps: [
        { n: "01", t: "We review your request", d: "With full attention" },
        { n: "02", t: "We get in touch", d: "Soon" },
        { n: "03", t: "We send a tailored proposal", d: "Personalised for you" },
      ],
      successWhatsApp: "Follow up on WhatsApp",
    },
    faqs: [
      {
        q: "How far in advance should I get in touch?",
        a: "For weddings we recommend at least 12 months in advance. For corporate events, 3 to 6 months is ideal. For simpler celebrations, 4 to 8 weeks is usually enough.",
      },
      {
        q: "Do you travel to the event venue?",
        a: "Yes. We travel to wherever your event takes place. We have a wide network of trusted suppliers and partners.",
      },
      {
        q: "Can you handle only part of the organisation?",
        a: "Absolutely. What we do is decoration and coordination: we can design and deliver the whole décor and coordinate the day, or take on just one part, concept only, floral decoration only, coordination only. We tailor the service to what you need.",
      },
      {
        q: "How does the quoting process work?",
        a: "After the first contact and an initial conversation, we prepare a detailed proposal with transparent pricing. No surprises, no hidden costs.",
      },
      {
        q: "Do you work with different budgets?",
        a: "Yes. We have solutions for different sizes and budgets. Our commitment is always to deliver the best possible result within your means, without compromising on quality.",
      },
      {
        q: "Do you handle events with international guests?",
        a: "Yes, we have experience with events involving international logistics and guests, including simultaneous translation, accommodation and transfers.",
      },
    ],
  },

  orcamento: {
    back: "Home",
    eyebrow: "Quote request",
    titleLine1: "Tell us",
    titleMoss: "your idea",
    lead: "We listen to your vision and reply with a tailored proposal for your event.",
    processHint: "Request → Proposal → Meeting",
    eventTypeLabels: [
      "Wedding",
      "Corporate",
      "Birthday",
      "Christening / Communion",
      "Gala Dinner",
      "Other",
    ],
    labelTipo: "Event type",
    labelDecor: "Where would you like decoration?",
    hintDecor: "Tell us where you would like the decoration for your wedding.",
    // Ver `pt.ts` para o porquê de cada uma destas perguntas.
    labelCerimonia: "What kind of ceremony?",
    hintCerimonia: "A church ceremony means a second space to decorate, on top of the reception.",
    labelEspaco: "Is the space indoors or outdoors?",
    hintEspaco: "Just tell us whether it will be indoors or outdoors.",
    labelCoordenacao: "Would you also like day-of coordination?",
    hintCoordenacao: "We look after the timings, the suppliers and anything unexpected on the day.",
    labelData: "Event date",
    dateFlexibleLabel: "Date still to be decided",
    guestsFlexibleLabel: "Still to be decided",
    hintPessoasAprox:
      "Roughly how many? An estimate is enough, and it helps us prepare the proposal.",
    labelPessoas: "No. of people",
    labelLocal: "Location / region",
    labelNome: "Your name",
    labelEmail: "Email",
    labelTelefone: "Phone",
    labelMensagem: "How do you picture your event?",
    phPessoas: "e.g. 120",
    // Ver `pt.ts` para o porquê: dois campos iguais, sem presumir quem são.
    labelNoivos: "Names of the couple",
    phNoivo: "Name of one of the couple",
    phNoiva: "Name of one of the couple",
    ariaNoivoA: "Name of one of the partners",
    ariaNoivoB: "Name of the other partner",
    hintNoivos: "They appear on the proposal.",
    phLocal: "e.g. city or venue…",
    phNome: "Your name",
    phEmail: "email@example.com",
    hintEmail: "Email is our preferred channel: that is where the confirmation goes.",
    phTelefone: "+351 9XX XXX XXX",
    phMensagem: "Style, colours, atmosphere, inspiration you've saved…",
    hintMensagem:
      "The more you can tell us about the style you have in mind, the colour palette, the atmosphere you want and the references you've chosen, the better we can tailor the proposal to your expectations.\n\nThese are the elements we start from to develop your personalised proposal.",
    errNome: "Please enter your name",
    errEmail: "Invalid email",
    // Ver `pt.ts`: a frase da regra "email ou telemóvel", partilhada pela rota
    // e pelo formulário.
    errContacto: "Please leave us an email or a phone number so we can get back to you.",
    errTipo: "Please select the event type.",
    errData: "Add the date, or tick \u201cDate still to be decided\u201d.",
    errPessoas: "Add how many people, or tick \u201cStill to be decided\u201d.",
    errLocal: "Add the venue or the region.",
    errTelefone: "Please enter a 9-digit phone number.",
    errMensagem: "Tell us how you picture the event. It's what lets us prepare the proposal.",
    enviar: "Send request",
    enviando: "Sending…",
    ouWhatsApp: "or via WhatsApp",
    error: "Your request did not go through. Please try again or reach us on WhatsApp.",
    // Ver `pt.ts` para o porquê destas duas.
    requiredNote: "All fields are required, except the contact: either one will do.",
    avisoSemEmail:
      "Without an email you won't get a written confirmation. We'll reply on the phone number you leave us.",
    submitReassure: "A tailored proposal, crafted in detail.",
    privacyPre: "By submitting, you accept our ",
    privacyLinkLabel: "Privacy Policy",
    privacyPost: ". We never share your details.",
  },

  servicos: {
    heroEyebrow: "What we offer",
    heroTitle: ["Every event,", "a story", "to tell"],
    heroLead:
      "Weddings, company events and private celebrations. We design the decoration around what you have in mind and the budget you are working with.",
    nav: ["Celebrations", "Companies"],
    verMais: "View more",
    verDetalhes: "View details",
    philoEyebrow: "Our signature",
    philoTitle: "Decoration that gives soul. Coordination that gives peace of mind.",
    philoPillars: [
      {
        title: "Decoration",
        text: "Bespoke concept, flowers and scenography, every event with an identity of its own.",
      },
      {
        title: "Coordination",
        text: "On the day, we orchestrate timings, suppliers and team. No slip-ups, no worries.",
      },
      {
        title: "Production",
        text: "From setup to the last detail, we handle everything so all you do is live the moment.",
      },
    ],
    categories: [
      {
        label: "Celebrations",
        subtitle: "For individuals",
        desc: "The most important moments of your life, crafted in detail with care and elegance.",
        services: [
          {
            title: "Weddings",
            desc: "Your most special day: concept, floral decoration, scenography and day-of coordination. We handle every detail so you can simply live it.",
          },
          {
            title: "Christenings & Communions",
            desc: "Intimate, meaningful family celebrations, organised with care.",
          },
          {
            title: "Birthday Parties",
            desc: "Themed or classic parties for all ages. Every birthday is a story.",
          },
          {
            title: "Classic Car Rental",
            desc: "Classic cars with a driver for a dream arrival, from the bride's entrance to guest transport.",
          },
        ],
      },
      {
        label: "Companies",
        subtitle: "For companies",
        desc: "We elevate your brand's image through events that transform teams and celebrate achievements.",
        services: [
          {
            title: "Corporate Events",
            desc: "Decoration and scenography tailored to your brand, from conferences and launches to company dinners.",
          },
        ],
      },
    ],
    seoEyebrow: "Where we work",
    seoTitle: "We come to you",
    seoText:
      "Weddings, corporate events and celebrations, from concept to execution. Wherever the event is, we bring our team and our network of suppliers with us.",
    ctaEyebrow: "Next step",
    ctaTitleLine1: "Shall we bring",
    ctaTitleMoss: "your idea to life?",
    ctaText: "Talk to us. We listen to your idea and present a proposal tailored to you.",
    ctaGaleria: "View the gallery",
    galleryAlt: [
      "Outdoor wedding decorated by Líquen Events",
      "Celebration dinner with elegant candlelit decoration",
      "Aerial view of an event on a country estate",
      "Event reception in the late afternoon",
      "Outdoor wedding reception at sunset",
      "Portrait of the newlyweds during a wedding",
    ],
  },

  confirmacao: {
    loading: "Loading…",
    statusLabels: {
      pendente: "Request Received",
      em_revisao: "Under Review",
      cotado: "Proposal Sent",
      aceite: "Accepted",
      rejeitado: "Declined",
    },
    successEyebrow: "Request sent successfully",
    titleLine1: "We've received",
    // English has no T/V distinction, so the plural variants are identical —
    // kept for key parity with pt, where the register genuinely changes.
    titleMoss: "your request.",
    titleMossPlural: "your request.",
    lead: "We'll read everything carefully, check availability for the date and think about what makes sense for this event, before we reply. What follows isn't an automatic price, it's the beginning of a proposal built for you.",
    countdown: "{days} days to go until the event.",
    highSeasonNote:
      "May to October is the busy season and the best estates close their calendars far in advance. It's worth not leaving it too long.",
    recapTitle: "What you told us",
    recapTitlePlural: "What you told us",
    refLabel: "Request Reference",
    categoria: "Category",
    tipo: "Type",
    pacote: "Package",
    convidados: "Guests",
    data: "Date",
    local: "Location",
    cerimonia: "Ceremony",
    espaco: "Space",
    coordenacao: "Day-of coordination",
    decoracao: "Decoration",
    mensagem: "Message",
    adicionais: "Additional Services",
    openDate: "Still to be decided",
    openDateNote:
      "With no fixed date we have room to suggest weekends with better availability and often a better price.",
    noDataNote:
      "Save the reference above. We've sent the details to our team and will be in touch shortly.",
    noDataNotePlural:
      "Save the reference above. We've sent the details to our team and will be in touch shortly.",
    footerNote: "A formal proposal is sent after our team reviews your request.",
    // Ver `pt.ts`: sem email não há confirmação escrita, e quem enviou tem de o
    // saber aqui em vez de ficar à espera dela.
    semEmailNota:
      "You didn't leave us an email, so you won't get this confirmation in writing. Save the reference above: we'll reply on the phone number you left us.",
    semEmailNotaPlural:
      "You didn't leave us an email, so you won't get this confirmation in writing. Save the reference above: we'll reply on the phone number you left us.",
    stepPropostaSemEmail:
      "We'll agree the best way to get it to you, by WhatsApp or by email if there is one by then.",
    proximosPassos: "Next steps",
    steps: [
      { label: "Request review", desc: "Our team reviews every detail." },
      { label: "Personalised proposal", desc: "We send a detailed proposal by email." },
      { label: "Briefing meeting", desc: "We set up a meeting to align on the vision." },
      { label: "Event production", desc: "We take care of everything for you." },
    ],
    contactIntro: "For any questions, you can contact us directly:",
    contactIntroPlural: "For any questions, you can contact us directly:",
    contactWhatsapp: "Chat on WhatsApp",
    contactWhatsappSub: "The fastest way to reach us.",
    notFoundTitle: "This link does not open any request",
    notFoundBody:
      "The link may be incomplete or no longer valid. If you sent a request and didn't receive our confirmation email, get in touch and we'll sort it out the same day.",
    voltarInicio: "Back to Home",
    novoPedido: "New Request",
    dateLocale: "en-GB",
    greetingWarm: "We're so happy to be part of this moment.",
    signOff: "With love,",
    signName: "The Líquen team",
    saveDate: "Add the date to your calendar",
    whileTitle: "While we prepare your proposal",
    whileTitlePlural: "While we prepare your proposal",
    whileLead: "Feel free to get to know a little of our world.",
    whileLeadPlural: "Feel free to get to know a little of our world.",
    exploreGaleria: "View the gallery",
    exploreGaleriaSub: "Weddings and events we've created",
    exploreInsta: "Follow on Instagram",
    exploreInstaSub: "Behind the scenes, ideas and news",
    exploreClientes: "Client stories",
    exploreClientesSub: "What they say about us",
  },

  servicoDetalhe: {
    includesTitle: "What's included",
    galleryEyebrow: "Portfolio",
    galleryTitle: "Moments we've created",
    galleryAlt: "Example of Líquen Events decoration",
    faqTitle: "Frequently asked questions",
    relatedTitle: "Other services",
    ctaTitle: "Shall we bring your event to life?",
    viaturasEyebrow: "Exclusive service",
    viaturasTitle: "Classic Car Rental",
    viaturasText:
      "For a dream arrival, from the bride's entrance to transport for the newlyweds and guests. Classic cars with a driver and every care taken.",
  },

  proposta: {
    linkInvalidTitle: "Invalid or expired link",
    linkInvalidBody:
      "This proposal link is no longer valid. Get in touch and we'll gladly send you a new one.",
    notFoundTitle: "Proposal not found",
    notFoundBody:
      "This link does not open any proposal. If you think this is a mistake, get in touch and we'll send you the right one.",
    greeting: "Hello",
    intro:
      "We have prepared this proposal with great care for your day. Take your time: any adjustment is welcome, just reply to the email.",
    tableDescricao: "Description",
    tableQt: "Qty",
    tableValor: "Amount",
    subtotal: "Subtotal",
    iva: "VAT",
    total: "Total",
    validoAte: "Valid until",
    emitidaEm: "Issued on",
    versaoNumero: "Version",
    atualizadaEm: "Updated on",
    revistaDepoisDeAceite:
      "This is the version you accepted. We have since prepared a newer version, and nothing changes until we have spoken with you.",
    verPdf: "View the full proposal (PDF)",
    footerNote: "Any questions or changes? Reply to this email or contact us:",
    respostaComo:
      "Let us know by email or by phone whether you would like to go ahead with this proposal. We reply to every message.",
    respostaExpirada:
      "This proposal is past its validity date. Talk to us and we will gladly prepare an updated one.",
    dateLocale: "en-GB",
  },

  errors: {
    notFoundEyebrow: "Page not found",
    notFoundTitle: "This path doesn't exist.",
    notFoundText:
      "The page you're looking for may have been moved or is no longer available. But your next event is still waiting to be created.",
    errorEyebrow: "Page stopped",
    errorTitle: "This page did not load.",
    errorText:
      "Nothing you filled in was lost. Try loading it again and, if it happens again, take one of the routes below.",
    retry: "Try again",
    loading: "Loading",
  },

  footer: {
    sloganLine1: "We decorate events,",
    sloganLine2: "we make memories last.",
    disponivel: "Available for new events",
    paginas: "Pages",
    servicosTitulo: "Services",
    // Ver `pt.ts`: emparelhados por índice com `serviceSlugs`, em Footer.tsx.
    serviceLinks: [
      "Wedding Decoration",
      "Classic Car Rental",
      "Corporate Events",
      "Parties & Celebrations",
      "Christenings & Communions",
    ],
    contacto: "Contact",
    pedirOrcamento: "Request a quote",
    rights: "All rights reserved",
    legal: "Legal",
    privacidade: "Privacy",
    termos: "Terms",
    livroReclamacoes: "Complaints Book (Livro de Reclamações)",
  },
};
