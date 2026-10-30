/**
 * Portuguese dictionary — the source-of-truth shape. `Dict = typeof pt`, so
 * the English dictionary (en.ts) is type-checked to mirror this exactly: a
 * missing or misspelled key fails `tsc`. Grow both files together.
 */
export const pt = {
  skipLink: "Saltar para o conteúdo",

  testimonials: [
    {
      name: "António Bettencourt",
      role: "Evento Corporativo",
      quote:
        "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
    },
    {
      name: "Alexandra Teixeira",
      role: "Evento Social",
      quote:
        "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
    },
    {
      name: "Stephanie & Mizio",
      role: "Evento Privado",
      quote:
        "Estava tudo exatamente como tínhamos imaginado, criaram um espaço lindíssimo para nós!",
    },
    {
      name: "Teresinha Malta",
      role: "Evento Social",
      quote:
        "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
    },
  ],

  langToggle: {
    label: "Idioma",
    pt: "PT",
    en: "EN",
    switchToPt: "Mudar para português",
    switchToEn: "Mudar para inglês",
  },

  nav: {
    inicio: "Início",
    menuLabel: "Menu",
    primaryLabel: "Principal",
    breadcrumb: "Percurso",
    closeMenu: "Fechar menu",
    sobre: "Sobre",
    servicos: "Serviços",
    galeria: "Galeria",
    clientes: "Clientes",
    contacto: "Contacto",
    orcamento: "Orçamento",
    pedirOrcamento: "Pedir orçamento",
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
    aAbrir: "A abrir a página…",
    pedirOrcamento: "Pedir orçamento",
    verGaleria: "Ver galeria",
    verServicos: "Ver serviços",
    entrarContacto: "Entrar em contacto",
    falarConnosco: "Falar connosco",
    voltarInicio: "Voltar ao início",
    abrirWhatsApp: "Abrir WhatsApp",
    newWindow: "abre em nova janela",
    enviarEmail: "Enviar e-mail",
    contactWhatsApp: "Contactar pelo WhatsApp",
    clientsSay: "O que dizem os clientes",
    reviewsLabel: "avaliações",
    testemunhoLabel: "Testemunho",
    pausar: "Pausar rotação dos testemunhos",
    retomar: "Retomar rotação dos testemunhos",
    pausarLogos: "Pausar desfile de logótipos",
    retomarLogos: "Retomar desfile de logótipos",
    whatsappPrefill:
      "Olá! Gostaria de saber mais sobre a decoração e organização de eventos da Líquen Events e como podem ajudar-me a planear o meu.",
    // Localized alt text for the shared marketing imagery (served on both
    // languages — a hardcoded PT alt would leave EN pages untranslated).
    imageAlt: {
      homeHero: "Líquen Events: vista aérea de um evento",
      homeWedding: "Casamento ao pôr do sol numa herdade",
      contactoHero: "Vista aérea de uma herdade preparada para um evento",
      sobrePortrait: "Momento de casamento decorado pela Líquen Events",
      sobreGolden: "Celebração de casamento à luz dourada",
      sobreOutdoor: "Casamento ao ar livre decorado pela Líquen Events",
      clientesAerial: "Vista aérea de evento Líquen Events",
      servicosCeremony: "Cerimónia ao ar livre organizada pela Líquen Events",
      servicosEvening: "Casamento celebrado ao anoitecer numa quinta",
      orcamentoPanel: "Jantar de festa com mesa posta e decoração à luz de velas",
      galeriaHeader: "Galeria de casamentos e eventos decorados pela Líquen Events",
      galeriaInstagram: "Eventos decorados pela Líquen Events no Instagram",
      sobreCelebration: "Celebração de casamento decorada pela Líquen Events",
      sobreFounder: "Catarina Gaspar, Fundadora & CEO da Líquen Events",
      clientesCorporate: "Evento corporativo decorado pela Líquen Events",
      clientesDinner: "Jantar de evento decorado pela Líquen Events",
      servicosEndOfDay: "Evento decorado pela Líquen Events ao final do dia",
      // Base reutilizada nas grelhas de portefólio das páginas de anúncios
      // (polo regional, destination, estilo): quem chama junta o contexto
      // (região, estilo) e o número da foto para cada legenda ficar distinta.
      portfolioExemplo: "Exemplo de decoração da Líquen Events",
      contactoBand: [
        "Cerimónia de casamento ao ar livre",
        "Casamento ao pôr do sol numa herdade",
        "Mesa posta de jantar de casamento com decoração floral",
      ],
    },
    // A saudação da página de entrada do back office (ver
    // EntradaComFotografia.tsx). Manhã até ao meio-dia, tarde até às 20h.
    entradaAdmin: {
      bomDia: "Bom dia",
      boaTarde: "Boa tarde",
      boaNoite: "Boa noite",
    },
    /**
     * O campo do telefone com a bandeira (`components/CampoTelefone.tsx`).
     *
     * Ela (30/10): bandeira e número, com Portugal já escolhido, e conferido
     * com as regras do país escolhido — no site e no back office. Vive em
     * `common` porque o campo está em sítios de todo o lado (o formulário, as
     * páginas dos anúncios, o back office) e este é o pedaço do dicionário que
     * chega a todos. Os nomes dos países não estão aqui: vêm do próprio
     * browser (`Intl.DisplayNames`), na língua de quem lê.
     *
     * `{pais}` e `{codigo}` enchem-se no campo («Portugal», «351»).
     */
    campoTelefone: {
      pais: "País do número",
      procurar: "Procurar país ou indicativo",
      semResultados: "Nenhum país com esse nome.",
      invalido: "Este número não é válido para {pais} (+{codigo}).",
    },
  },

  meta: {
    ogLocale: "pt_PT",
    homeTitle: "Decoração de Casamentos e Eventos | Líquen Events",
    homeDescription:
      "A Líquen Events decora e coordena casamentos, eventos de empresa e celebrações privadas, em todo o país.",
    sobreTitle: "Empresa de Decoração e Coordenação de Eventos",
    sobreDescription:
      "Líquen Events, empresa de decoração e coordenação de eventos: casamentos, eventos de empresa e celebrações privadas, em todo o país.",
    servicosTitle: "Serviços de Decoração e Produção de Eventos",
    servicosDescription:
      "Decoração e coordenação de casamentos e decoração de eventos corporativos, jantares de gala e festas privadas.",
    galeriaTitle: "Galeria de Casamentos e Eventos",
    galeriaDescription:
      "Galeria de fotografias de eventos decorados pela Líquen Events: casamentos, eventos corporativos, conferências e celebrações.",
    clientesTitle: "Empresas e Instituições que Confiam em Nós",
    clientesDescription:
      "Empresas e instituições que confiam na Líquen Events: universidades, câmaras municipais, José de Mello, Deloitte, Aernnova, Mainova e muitas mais.",
    contactoTitle: "Contacto: Peça o Seu Orçamento de Evento",
    contactoDescription:
      "Contacte a Líquen Events para decorar o seu evento, onde quer que aconteça. Receba uma proposta à medida.",
    orcamentoTitle: "Pedir Orçamento: Casamentos e Eventos",
    orcamentoDescription:
      "Peça o seu orçamento à Líquen Events. Diga-nos o tipo de evento, a data e o número de pessoas, e receba uma proposta à medida.",
  },

  // JSON-LD structured data (StructuredData.tsx) — kept in the dictionary so
  // the markup's language always matches the visible page's.
  jsonld: {
    hasOfferCatalogName: "Decoração de eventos e casamentos",
    services: [
      "Decoração e coordenação de casamentos",
      "Eventos corporativos e conferências",
      "Festas e celebrações privadas",
      "Jantares de gala e eventos sociais",
    ],
    servicosServiceName: "Decoração de eventos e coordenação de casamentos",
    servicosServiceDescription:
      "Decoração e coordenação de casamentos, e decoração de eventos corporativos, conferências e celebrações.",
  },

  home: {
    eyebrow: "Decoração de eventos",
    heroLines: [{ words: ["Eternizamos"] }, { words: ["memórias"], moss: true }] as {
      words: string[];
      moss?: boolean;
    }[],
    scroll: "Scroll",
    wallEyebrow: "O nosso trabalho",
    wallTitle: "O que fica para sempre",
    servicesEyebrow: "O que fazemos",
    services: [
      { tag: "Celebrações", title: "Casamentos" },
      { tag: "Empresas", title: "Corporativos" },
      { tag: "Celebrações", title: "Privados" },
    ],
    ctaEyebrow: "Próximo passo",
    ctaTitleLine1: "Tem um evento",
    ctaTitleLine2: "em mente?",
    ctaText: "Conte-nos a sua ideia. Ouvimos a sua visão e respondemos com uma proposta à medida.",
  },

  sobre: {
    heroEyebrow: "Quem somos",
    heroTitlePre: "Sobre a ",
    heroTitleMoss: "Líquen",
    scroll: "Scroll",
    manifestoEyebrow: "A nossa essência",
    manifestoTitleLine1: "Decoramos eventos.",
    manifestoTitleLine2: "Eternizamos memórias.",
    // Legenda de canto (idioma-capítulo) sobre a fotografia do manifesto.
    manifestoImageCaption: "Eventos · desde 2018",
    statementLead: "Não decoramos apenas espaços.",
    statementRest: " Desenhamos experiências que ficam para sempre.",
    founderEyebrow: "As pessoas",
    founderQuote: "Cada evento é uma oportunidade de criar algo extraordinário. É o que nos move.",
    founderName: "Catarina Gaspar",
    founderRole: "Fundadora & CEO",
    ctaEyebrow: "Vamos criar juntos",
    ctaTitleLine1: "Vamos trabalhar",
    ctaTitleMoss: "juntos?",
    ctaText: "Da primeira conversa ao último brinde, o evento fica connosco.",
    galleryAlt: [
      "Cerimónia de casamento ao ar livre numa herdade",
      "Festa de casamento sob luzes suspensas ao anoitecer",
      "Noivos abraçados durante a celebração do casamento",
      "Mesa posta de casamento com flores e velas",
      "Casamento ao entardecer ao ar livre",
      "Decoração floral de cerimónia de casamento",
    ],
  },

  galeria: {
    headerLabel: "Os nossos momentos",
    headerTitle: "Galeria",
    headerDesc: "Casamentos, eventos corporativos e celebrações, capturados ao pormenor.",
    instaEyebrow: "Redes sociais",
    instaTitle: "Siga-nos no Instagram",
    instaText: "Partilhamos os bastidores dos nossos eventos e inspirações diárias.",
    verMais: "Ver mais",
    de: "de",
    labels: {
      Todos: "Todos",
      Casamento: "Casamento",
      Corporativo: "Corporativo",
      Conferência: "Conferência",
      Aéreo: "Aéreo",
      Evento: "Evento",
    },
    alt: {
      Casamento: "Casamento decorado pela Líquen Events",
      Corporativo: "Evento corporativo organizado pela Líquen Events",
      Conferência: "Conferência organizada pela Líquen Events",
      Aéreo: "Vista aérea de evento da Líquen Events",
      Evento: "Evento organizado pela Líquen Events",
    },
    lbGallery: "Galeria",
    lbPhoto: "foto",
    lbOf: "de",
    lbErro: "Esta fotografia não carregou",
    lbTentar: "Tentar de novo",
    lbClose: "Fechar",
    lbPrev: "Foto anterior",
    lbNext: "Foto seguinte",
    viewWedding: "Ver este casamento",
    backToGallery: "Toda a galeria",
    photosLabel: "fotos",
    lbAtalhos: "Atalhos de teclado",
    keyboardHint: "← → navegar · f ecrã inteiro · esc fechar",
    backToTop: "Voltar ao topo",
    gridLabel: "Galeria de fotografias",
    gridHint: "Use as setas para percorrer as fotos e Enter para abrir.",
    photoUnavailable: "Foto indisponível",
  },

  clientes: {
    heroEyebrow: "Quem confia em nós",
    heroTitleLine1: "Os Nossos",
    heroTitleMoss: "Clientes",
    heroLead:
      "Empresas, instituições e famílias que nos escolheram para os seus momentos mais especiais, e que nos honram com a sua confiança.",
    scroll: "Scroll",
    leadPre:
      "De grandes empresas a celebrações de família, são inúmeros os que nos confiam os seus momentos mais importantes. A essa confiança respondemos com ",
    leadMoss: "rigor, criatividade e dedicação",
    leadPost: " em cada detalhe.",
    desde: "Desde",
    logosEyebrow: "Empresas & instituições",
    logosTitle: "Marcas que confiam em nós",
    featuredEyebrow: "Testemunhos",
    featuredQuote:
      "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
    featuredName: "Alexandra Teixeira",
    featuredRole: "Evento Social",
    gridTitle: "Palavras de quem confiou.",
    testimonials: [
      {
        name: "António Bettencourt",
        text: "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
        event: "Evento Corporativo",
      },
      {
        name: "Stephanie & Mizio",
        text: "Estava tudo exatamente como tínhamos imaginado, criaram um espaço lindíssimo para nós!",
        event: "Evento Privado",
      },
      {
        name: "Teresinha Malta",
        text: "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
        event: "Evento Social",
      },
      {
        name: "Ana Pinho",
        text: "Excelente, recomendo sem qualquer reserva. Uma equipa de confiança do início ao fim.",
        event: "Evento Privado",
      },
    ],
    mosaicEyebrow: "Momentos dos nossos eventos",
    mosaicLabels: [
      "Corporativo",
      "Casamento",
      "Gala",
      "Casamento",
      "Jantar",
      "Gala",
      "Institucional",
    ],
    ctaEyebrow: "Próximo evento",
    ctaTitleLine1: "Junte-se aos",
    ctaTitleLine2: "nossos clientes",
    ctaText: "Conte-nos a sua ideia.",
    galleryAlt: [
      "Receção de evento corporativo num pátio",
      "Casamento com decoração floral numa herdade",
      "Jantar de gala à luz de velas",
      "Casamento ao ar livre com mesa posta e arranjos florais",
      "Jantar de gala com mesa posta e velas",
      "Gala corporativa num salão decorado à noite",
      "Evento institucional com palco e plateia",
    ],
  },

  contacto: {
    direct: {
      ctaEyebrow: "Pronto para começar?",
      ctaTitleLine1: "Peça o seu",
      ctaTitleMoss: "orçamento.",
      ctaText:
        "Conte-nos sobre o seu evento e respondemos com uma proposta à medida. Para uma pergunta rápida, use um dos canais diretos.",
      ctaButton: "Pedir orçamento",
    },
    testimonialsEyebrow: "O que dizem os nossos clientes",
    nextEyebrow: "O que acontece a seguir",
    steps: [
      {
        title: "Recebemos o seu pedido",
        desc: "Analisamos o seu pedido e preparamos uma resposta à medida.",
      },
      { title: "Entramos em contacto", desc: "Marcamos uma conversa para conhecer a sua visão." },
      { title: "Proposta à medida", desc: "Proposta detalhada, com orçamento transparente." },
      { title: "Começamos a criar", desc: "Tratamos de cada detalhe para um evento inesquecível." },
    ],
    faqEyebrow: "Perguntas frequentes",
    faqTitleLine1: "Tem",
    faqTitleLine2: "dúvidas?",
    faqSub: "Se não encontrar a resposta que procura, contacte-nos diretamente.",
    whatsappEyebrow: "Resposta imediata",
    whatsappTitleLine1: "Prefere falar",
    whatsappTitleLine2: "agora?",
    whatsappText: "Fale connosco diretamente pelo WhatsApp.",
    form: {
      heroEyebrow: "Fale connosco",
      heroTitleLine1: "Vamos criar algo",
      heroTitleMoss: "extraordinário",
      infoEyebrow: "Encontre-nos",
      emailLabel: "E-mail",
      emailSub: "Respondemos a cada pedido com atenção",
      phoneLabel: "Telefone",
      phoneSub: "Ligue ou envie mensagem",
      locationLabel: "Localização",
      locationValue: "Onde o seu evento acontecer",
      locationSub: "Reuniões presenciais disponíveis",
      quoteLink: "Pedir orçamento para o seu evento",
      whatsappLink: "Falar pelo WhatsApp",
      googleLink: "Ver no Google · Deixar avaliação",
      promise: "Respondemos a todos os pedidos com uma proposta personalizada.",
      promiseSign: "Equipa Líquen Events",
      stepLabels: ["Evento", "Dados", "Detalhes", "Mensagem"],
      eventCards: [
        { value: "Corporativo", desc: "Conferências, teambuildings, jantares" },
        { value: "Casamento", desc: "O dia mais especial da vossa vida" },
        { value: "Aniversário", desc: "Festas e celebrações memoráveis" },
        { value: "Jantar de Gala", desc: "Eventos sociais de prestígio" },
        { value: "Outro", desc: "Evento personalizado à sua medida" },
      ],
      guestRanges: ["Até 30", "30–80", "80–150", "150–300", "300+"],
      step1Title1: "Que tipo de evento",
      step1Title2: "está a planear?",
      step1Sub: "Selecione a opção que melhor descreve o seu evento.",
      step2Title: "Diga-nos quem é.",
      step2Sub: "Os seus dados de contacto para falarmos consigo.",
      step3Title: "Detalhes do evento.",
      step3Sub: "Ajude-nos a perceber a dimensão e o timing.",
      step4Title: "A sua visão.",
      step4Sub: "Descreva o evento dos seus sonhos. Quanto mais detalhe, melhor.",
      labelNome: "Nome *",
      labelEmail: "E-mail *",
      labelTelefone: "Telefone",
      labelData: "Data Prevista",
      labelConvidados: "Nº de Convidados",
      labelOrcamento: "Orçamento (opcional)",
      labelMensagem: "Mensagem *",
      phName: "O seu nome completo",
      phEmail: "email@exemplo.com",
      phPhone: "+351 9XX XXX XXX",
      msgPrefix: "Tipo de evento: ",
      phMensagem: "Local preferido, temática, inspirações, detalhes especiais...",
      summaryEvento: "Evento",
      summaryConvidados: "Convidados",
      summaryOrcamento: "Orçamento",
      summaryData: "Data",
      continuar: "Continuar",
      voltar: "Voltar",
      enviar: "Enviar Pedido",
      enviando: "A enviar…",
      resposta24: "Proposta à medida",
      errNome: "Indique o seu nome",
      errEmail: "E-mail inválido",
      error: "Não foi possível enviar. Tente novamente ou contacte-nos pelo WhatsApp.",
      successEyebrow: "Enviado com sucesso",
      successTitle1: "Mensagem",
      successTitle2: "recebida.",
      successThanks: "Obrigado",
      successText: ". Em breve entraremos em contacto para avançarmos juntos no seu evento.",
      successSteps: [
        { n: "01", t: "Analisamos o seu pedido", d: "Com toda a atenção" },
        { n: "02", t: "Entramos em contacto", d: "Em breve" },
        { n: "03", t: "Enviamos proposta à medida", d: "Personalizada para si" },
      ],
      successWhatsApp: "Acompanhar pelo WhatsApp",
    },
    faqs: [
      {
        q: "Com quanto tempo de antecedência devo contactar?",
        a: "Para casamentos recomendamos pelo menos 12 meses de antecedência. Para eventos corporativos, 3 a 6 meses é o ideal. Para celebrações mais simples, 4 a 8 semanas é geralmente suficiente.",
      },
      {
        q: "Deslocam-se ao local do evento?",
        a: "Sim. Deslocamo-nos ao local do seu evento. Temos uma vasta rede de fornecedores e parceiros de confiança.",
      },
      {
        q: "Podem assumir apenas parte da organização?",
        a: "Absolutamente. O que fazemos é decoração e coordenação: podemos desenhar e executar toda a decoração do evento e coordenar o dia, ou entrar apenas numa parte, só o conceito, só a decoração floral, só a coordenação. Adaptamos o serviço ao que precisa.",
      },
      {
        q: "Como funciona o processo de orçamentação?",
        a: "Após o primeiro contacto e uma conversa inicial, elaboramos uma proposta personalizada e detalhada, acompanhada de um orçamento claro e transparente. Cada elemento é apresentado de forma rigorosa, para que saiba exatamente o que está incluído, sem surpresas nem custos ocultos.",
      },
      {
        q: "Trabalham com diferentes orçamentos?",
        a: "Sim. Temos soluções para diferentes dimensões e orçamentos. O nosso compromisso é sempre oferecer o melhor resultado possível dentro das suas possibilidades, sem comprometer a qualidade.",
      },
      {
        q: "Fazem eventos com convidados internacionais?",
        a: "Sim, temos experiência em eventos com logística e convidados internacionais, incluindo tradução simultânea, alojamento e transfers.",
      },
    ],
  },

  orcamento: {
    back: "Início",
    eyebrow: "Pedido de orçamento",
    titleLine1: "Conte-nos",
    titleMoss: "a sua ideia",
    lead: "Ouvimos a sua visão e respondemos com uma proposta à medida para o seu evento.",
    processHint: "Pedido → Proposta → Reunião",
    // Os dois passos do formulário (ela, 30/10: o pedir orçamento ao estilo
    // da ElevenLabs, em dois passos).
    passoEvento: "O evento",
    passoContacto: "O contacto",
    continuar: "Continuar",
    voltar: "Voltar",
    /** «Passo 1 de 2» — só para o leitor de ecrã; quem vê, vê os tracinhos. */
    passoDe: "Passo {n} de 2",
    /**
     * As três garantias do painel. Palavra por palavra o que o sítio JÁ afirma
     * noutros lados — nada novo: o «48 horas úteis» é o do formulário das
     * páginas do Google (`PedidoRapido`), e as outras duas são das páginas das
     * regiões (`lib/ads/polos.ts`).
     */
    garantias: [
      "Respondemos em 48 horas úteis.",
      "Equipa e material próprios.",
      "Visita técnica antes de qualquer encomenda.",
    ],
    eventTypeLabels: [
      "Casamento",
      "Corporativo",
      "Aniversário",
      "Batizado / Comunhão",
      "Jantar de Gala",
      "Outro",
    ],
    labelTipo: "Tipo de evento",
    // Só aparece no casamento. Perguntado como uma conversa, não como uma
    // lista de compras: o que se quer saber é ONDE querem decoração.
    labelDecor: "Onde quer decoração?",
    hintDecor: "Diga-nos onde quer a decoração do seu casamento.",
    // Só aparece no casamento. A pergunta é feita pelo que ela muda no trabalho
    // — uma cerimónia religiosa é um segundo sítio para decorar — e não como
    // uma curiosidade sobre a vida de quem preenche.
    labelCerimonia: "Que tipo de cerimónia?",
    hintCerimonia: "Se for na igreja, é mais um espaço para decorar além do da festa.",
    // Aparece em todos os tipos de evento.
    labelEspaco: "O espaço é interior ou exterior?",
    hintEspaco: "Diga-nos apenas se vai ser num espaço interior ou ao ar livre.",
    // 28/10: ela pediu a pergunta «mais elegante e de empresa».
    labelCoordenacao: "Deseja incluir a coordenação do dia do evento?",
    hintCoordenacao: "Tratamos dos horários, dos fornecedores e dos imprevistos no dia.",
    labelData: "Data do evento",
    // O calendário da data, no computador (28/10: «ao estilo da apple»).
    calendario: {
      escolher: "Escolher a data",
      calendario: "Calendário",
      mesAnterior: "Mês anterior",
      mesSeguinte: "Mês seguinte",
      anoAnterior: "Ano anterior",
      anoSeguinte: "Ano seguinte",
      escolherMes: "Escolher o mês",
      hoje: "hoje",
      passou: "já passou",
    },
    dateFlexibleLabel: "Data ainda a definir",
    guestsFlexibleLabel: "Ainda a definir",
    hintPessoasAprox:
      "Mais ou menos quantas? Uma estimativa chega, e ajuda-nos a preparar a proposta.",
    labelPessoas: "Nº de pessoas",
    labelLocal: "Local / região",
    // «O seu nome», e não «Nome»: é o de QUEM ESCREVE, que nem sempre é um dos
    // noivos (14/10 — um pedido com «Maria Silva» aqui e outro casal, e o email
    // pôs a Maria em grande). Ver `lib/orcamento/quem-pede.ts`.
    labelNome: "O seu nome",
    labelEmail: "E-mail",
    labelTelefone: "Telemóvel",
    // The one field that decides whether the proposal can be designed or only
    // priced. Asked as a question, not a form label.
    labelMensagem: "Como imagina o seu evento?",
    phPessoas: "Ex.: 120",
    /**
     * ── DOIS NOMES, SEM PRESUMIR QUEM SÃO ─────────────────────────────────
     *
     * Dizia "Nome do noivo" e "Nome da noiva". Para dois homens ou duas
     * mulheres, o formulário estava a dizer-lhes que não contava com eles —
     * logo no primeiro contacto, e num pedido de orçamento de casamento, que é
     * o momento em que menos se quer que isso aconteça.
     *
     * Os dois campos passam a ser IGUAIS, "Nome" e "Nome", debaixo de "Nomes do
     * casal". Não é uma solução tímida: é a única que não tem de escolher uma
     * ordem nem um género. Quem distingue os campos é o rótulo acessível
     * (`aria-label`), que diz "uma das pessoas" e "a outra pessoa" — para quem
     * ouve o formulário em vez de o ver não ficar com dois campos "Nome"
     * indistinguíveis.
     *
     * Os dados já estavam certos: o servidor guarda `partnerA`/`partnerB`
     * desde sempre. Era só o texto.     *
     * 14/10: chegou um pedido com «Maria Silva» no nome de quem escreve e
     * «Luana Silva & Afonso Duarte» no casal, e o email pôs a Maria em grande.
     * Com três campos a dizer «Nome», nada distinguia o de quem PEDE dos de
     * quem SE CASA. O primeiro passa a «O seu nome»; os dois do casal continuam
     * iguais entre si (sem ordem nem género), mas dizem de quem são.
     */
    labelNoivos: "Nomes do casal",
    phNoivo: "Nome de quem se casa",
    phNoiva: "Nome de quem se casa",
    ariaNoivoA: "Nome de uma das pessoas do casal",
    ariaNoivoB: "Nome da outra pessoa do casal",
    hintNoivos: "Aparecem na proposta.",
    phLocal: "Ex.: cidade ou espaço do evento…",
    phNome: "O seu nome",
    phEmail: "email@exemplo.com",
    /**
     * O email continua a ser PEDIDO, deixou é de ser exigido a quem dá o
     * telemóvel. A dica diz as duas coisas por ordem: qual preferimos, e o que
     * se perde ao não o deixar. Fica debaixo do campo, e não numa nota
     * genérica lá em cima, porque é ali que a decisão se toma.
     */
    /**
     * 28/10: o email passa a ser obrigatório (decisão dela, depois de um
     * pedido chegar com o email mal escrito e mais nenhum contacto; o
     * telemóvel continua opcional). A dica diz porque é que importa
     * escrevê-lo bem.
     */
    hintEmail: "É para aqui que enviamos a confirmação e a proposta. Confira se está bem escrito.",
    // Só o número: o indicativo está na bandeira ao lado (30/10).
    phTelefone: "912 345 678",
    phMensagem: "Estilo, cores, ambiente, inspirações que guardou…",
    // O texto é dela (17/10), palavra por palavra. O `\n\n` separa os dois
    // parágrafos; o formulário desenha-o com `whitespace-pre-line`.
    hintMensagem:
      "Quanto mais informação nos facultar sobre o estilo pretendido, a paleta de cores, o ambiente desejado e as referências que selecionou, melhor poderemos adaptar a proposta às suas expectativas.\n\nÉ a partir destes elementos que começamos a desenvolver a sua proposta personalizada.",
    errNome: "Indique o seu nome",
    errEmail: "E-mail inválido",
    /**
     * ── A FRASE DA REGRA «EMAIL OU TELEMÓVEL», NUM SÓ SÍTIO ────────────────
     *
     * A invariante é do SERVIDOR (`quoteFormSchema`, em src/lib/validation.ts):
     * tem de haver pelo menos uma forma de responder. A rota devolve esta frase
     * quando a recusa vem de lá (`mensagemDeValidacao`, em
     * src/app/api/orcamento/route.ts, que a lê daqui) e o formulário mostra-a
     * ao lado do campo antes de chegar a enviar. É de propósito que é a MESMA:
     * ler o mesmo erro escrito de duas maneiras faz duvidar de que seja o mesmo
     * erro.
     */
    errContacto: "Indique um email ou um telemóvel para lhe podermos responder.",
    errTipo: "Selecione o tipo de evento.",
    errData: "Indique a data, ou marque \u201cData ainda a definir\u201d.",
    errPessoas: "Indique quantas pessoas, ou marque \u201cAinda a definir\u201d.",
    errLocal: "Indique o local ou a região.",
    /**
     * A recusa do SERVIDOR, que não sabe que bandeira estava escolhida (o
     * campo diz o país no ecrã: `common.campoTelefone.invalido`). Desde 30/10
     * o número é conferido com as regras do país, e já não só pelos dígitos.
     */
    errTelefone:
      "Este número de telefone não é válido. Confira os dígitos e o país (de fora de Portugal, escolha a bandeira ou comece pelo indicativo, ex.: +44).",
    errEmailObrigatorio: "Indique o seu email.",
    /** O domínio (o que vem depois do @) não recebe correio — `dominioRecebeEmail`. */
    errDominioDoEmail:
      "Este email não parece existir: confira o que está depois do @ (por exemplo, gmail.com).",
    /** «Quis dizer ana@gmail.com?» — o domínio parecido com um conhecido. */
    sugestaoEmailPre: "Quis dizer ",
    sugestaoEmailPos: "?",
    sugestaoEmailUsar: "Usar este",
    /**
     * A confirmação dos contactos, ANTES de enviar. É o que apanha o engano
     * antes do @ («candmcasmento…»), que nenhuma máquina consegue apanhar:
     * mostrar-lhe o que escreveu, em grande, e perguntar se está certo.
     */
    confirmarTitulo: "Confirme os seus contactos",
    confirmarTexto:
      "É para aqui que enviamos a confirmação e a proposta. Um engano numa letra e não lhe chega nada.",
    confirmarEmail: "Email",
    confirmarTelefone: "Telemóvel",
    confirmarEnviar: "Está certo, enviar",
    confirmarCorrigir: "Corrigir",
    errMensagem: "Conte-nos como imagina o evento. É o que nos permite preparar a proposta.",
    enviar: "Enviar pedido",
    enviando: "A enviar…",
    ouWhatsApp: "ou pelo WhatsApp",
    error: "Não foi possível enviar. Tente novamente ou fale connosco pelo WhatsApp.",
    /**
     * 28/10: o email passou a obrigatório e o telemóvel continua opcional
     * (decisão dela). Uma chave que mente é pior do que não existir — por
     * isso muda junto com a regra.
     */
    requiredNote: "Todos os campos são obrigatórios, exceto o telemóvel.",
    submitReassure: "Uma proposta à medida, pensada ao detalhe.",
    privacyPre: "Ao enviar, aceita a nossa ",
    privacyLinkLabel: "Política de Privacidade",
    privacyPost: ". Não partilhamos os seus dados.",
  },

  servicos: {
    heroEyebrow: "O que oferecemos",
    heroTitle: ["Cada evento,", "uma história", "por contar"],
    heroLead:
      "Casamentos, eventos empresariais e celebrações privadas. Desenvolvemos cada projeto de decoração de forma personalizada, tendo em consideração a sua visão, as suas necessidades e o orçamento disponível.",
    nav: ["Celebrações", "Empresas"],
    verMais: "Ver mais",
    verDetalhes: "Ver detalhes",
    philoEyebrow: "A nossa assinatura",
    philoTitle: "Decoração que dá alma. Coordenação que dá descanso.",
    philoPillars: [
      {
        title: "Decoração",
        text: "Conceito, flores e cenografia à medida, cada evento com uma identidade própria.",
      },
      {
        title: "Coordenação",
        text: "No dia, orquestramos tempos, fornecedores e equipa. Sem falhas, sem preocupações.",
      },
      {
        title: "Produção",
        text: "Da montagem ao último detalhe, tratamos de tudo para só terem de viver o momento.",
      },
    ],
    categories: [
      {
        label: "Celebrações",
        subtitle: "Para particulares",
        desc: "Os momentos mais importantes da sua vida, pensados ao pormenor com cuidado e elegância.",
        services: [
          {
            title: "Casamentos",
            desc: "O vosso dia mais especial: conceito, decoração floral, cenografia e coordenação no dia. Tratamos de cada detalhe para só terem de o viver.",
          },
          {
            title: "Batizados & Comunhões",
            desc: "Celebrações familiares íntimas e repletas de significado, cuidadosamente planeadas e organizadas com todo o cuidado.",
          },
          {
            title: "Festas de Aniversário",
            desc: "Festas temáticas ou clássicas para todas as idades. Cada aniversário é uma história.",
          },
          {
            title: "Aluguer de Viaturas Clássicas",
            desc: "Carros clássicos com motorista para tornar cada chegada verdadeiramente especial, desde a entrada da noiva ao transporte dos convidados.",
          },
        ],
      },
      {
        label: "Empresas",
        subtitle: "Para empresas",
        desc: "Elevamos a imagem da sua marca através de eventos que transformam equipas e celebram conquistas.",
        services: [
          {
            title: "Eventos Corporativos",
            desc: "Decoração e cenografia à medida da sua marca, de conferências e lançamentos a jantares de empresa.",
          },
        ],
      },
    ],
    seoEyebrow: "Onde atuamos",
    seoTitle: "Vamos ter consigo",
    seoText:
      "Casamentos, eventos corporativos e celebrações, desde o conceito à concretização. Onde quer que tenha lugar o seu evento, levamos connosco a nossa equipa e uma rede de fornecedores de confiança, assegurando uma execução cuidada e personalizada.",
    ctaEyebrow: "Próximo passo",
    ctaTitleLine1: "Vamos dar vida",
    ctaTitleMoss: "à sua ideia?",
    ctaText: "Fale connosco. Ouvimos a sua ideia e apresentamos uma proposta à sua medida.",
    ctaGaleria: "Ver a galeria",
    galleryAlt: [
      "Casamento ao ar livre decorado pela Líquen Events",
      "Jantar de celebração com decoração elegante à luz de velas",
      "Vista aérea de um evento numa herdade",
      "Receção de evento ao final da tarde",
      "Receção de casamento ao ar livre ao pôr do sol",
      "Retrato dos noivos durante um casamento",
    ],
  },

  confirmacao: {
    loading: "A carregar…",
    statusLabels: {
      pendente: "Pedido Recebido",
      em_revisao: "Em Revisão",
      cotado: "Proposta Enviada",
      aceite: "Aceite",
      rejeitado: "Rejeitado",
    },
    successEyebrow: "Pedido enviado com sucesso",
    titleLine1: "Recebemos o",
    // Register follows the event: plural for a couple/family (casamentos,
    // batizados), singular formal otherwise — the same rule as the email.
    titleMoss: "seu pedido.",
    titleMossPlural: "vosso pedido.",
    lead: "Vamos ler tudo com atenção, confirmar a disponibilidade da data e pensar no que faz sentido para este evento, antes de responder. O que se segue não é um preço automático, é o princípio de uma proposta feita à medida.",
    countdown: "Faltam {days} dias para a data do evento.",
    highSeasonNote:
      "De maio a outubro as melhores quintas fecham agenda com muita antecedência. Vale a pena não deixar arrastar.",
    recapTitle: "O que nos contou",
    recapTitlePlural: "O que nos contaram",
    refLabel: "Referência do Pedido",
    categoria: "Categoria",
    tipo: "Tipo",
    pacote: "Pacote",
    convidados: "Convidados",
    data: "Data",
    local: "Local",
    cerimonia: "Cerimónia",
    espaco: "Espaço",
    coordenacao: "Coordenação do dia",
    decoracao: "Decoração",
    mensagem: "Mensagem",
    adicionais: "Serviços Adicionais",
    openDate: "Ainda a definir",
    openDateNote:
      "Sem data fechada temos margem para sugerir fins de semana com melhor disponibilidade e, muitas vezes, melhor preço.",
    noDataNote:
      "Guarde a referência acima. Enviámos os detalhes para a nossa equipa e entraremos em contacto consigo brevemente.",
    noDataNotePlural:
      "Guardem a referência acima. Enviámos os detalhes para a nossa equipa e entraremos em contacto convosco brevemente.",
    footerNote: "Proposta formal enviada após análise do pedido pela nossa equipa.",
    /**
     * ── QUEM ENVIOU SEM EMAIL TEM DE SABER O QUE NÃO VAI RECEBER ──────────
     *
     * O pedido pode chegar só com telemóvel (a regra do servidor é "email OU
     * telemóvel"). A confirmação automática vai por email, e sem email não vai
     * a lado nenhum. Sem esta nota, esta página diz "Recebemos o seu pedido" e
     * a lista de passos promete uma proposta "por email", e a pessoa fica a
     * vigiar uma caixa de correio onde nunca chega nada.
     */
    /** Para onde foi a confirmação (28/10): o endereço por extenso, para um engano se ver logo. */
    enviadoParaPre: "Enviámos a confirmação para ",
    enviadoParaPos:
      ". Não chegou dentro de alguns minutos? Veja na pasta de spam, ou fale connosco pelo WhatsApp: se o endereço tiver um engano, corrigimos.",
    semEmailNota:
      "Não nos deixou um email, por isso não recebe esta confirmação por escrito. Guarde a referência acima: respondemos-lhe pelo telemóvel que nos deixou.",
    semEmailNotaPlural:
      "Não nos deixaram um email, por isso não recebem esta confirmação por escrito. Guardem a referência acima: respondemos-vos pelo telemóvel que nos deixaram.",
    /** O passo 2 sem a promessa que não se pode cumprir. Escrito sem tratamento
     *  para servir os dois registos, como os restantes passos. */
    stepPropostaSemEmail:
      "Combinamos a melhor forma de a fazer chegar, por WhatsApp ou por email, se entretanto houver um.",
    proximosPassos: "Próximos passos",
    steps: [
      { label: "Análise do pedido", desc: "A nossa equipa analisa todos os detalhes." },
      { label: "Proposta personalizada", desc: "Enviamos uma proposta detalhada por email." },
      { label: "Reunião de briefing", desc: "Marcamos uma reunião para alinhar a visão." },
      { label: "Produção do evento", desc: "Tomamos conta de tudo, do início ao fim." },
    ],
    contactIntro: "Para qualquer questão, pode contactar-nos diretamente:",
    contactIntroPlural: "Para qualquer questão, podem contactar-nos diretamente:",
    contactWhatsapp: "Falar por WhatsApp",
    contactWhatsappSub: "O caminho mais rápido até nós.",
    notFoundTitle: "Esta ligação não abre nenhum pedido",
    // No quote here, so the register is unknown — singular formal is the safe
    // form for an anonymous visitor.
    notFoundBody:
      "A ligação pode estar incompleta ou já não ser válida. Se enviou um pedido e não recebeu a nossa confirmação por email, fale connosco e resolvemos no próprio dia.",
    voltarInicio: "Voltar ao Início",
    novoPedido: "Novo Pedido",
    dateLocale: "pt-PT",
    greetingWarm: "Estamos felizes por fazer parte deste momento.",
    signOff: "Com carinho,",
    signName: "Equipa Líquen",
    saveDate: "Guardar a data no calendário",
    whileTitle: "Enquanto preparamos a sua proposta",
    whileTitlePlural: "Enquanto preparamos a vossa proposta",
    whileLead: "Fique à vontade para conhecer um pouco do nosso mundo.",
    whileLeadPlural: "Fiquem à vontade para conhecer um pouco do nosso mundo.",
    exploreGaleria: "Ver a galeria",
    exploreGaleriaSub: "Casamentos e eventos que criámos",
    exploreInsta: "Seguir no Instagram",
    exploreInstaSub: "Bastidores, ideias e novidades",
    exploreClientes: "Histórias de clientes",
    exploreClientesSub: "O que dizem sobre nós",
  },

  servicoDetalhe: {
    includesTitle: "O que inclui",
    galleryEyebrow: "Portefólio",
    galleryTitle: "Momentos que criámos",
    galleryAlt: "Exemplo de decoração da Líquen Events",
    faqTitle: "Perguntas frequentes",
    relatedTitle: "Outros serviços",
    ctaTitle: "Vamos dar vida ao seu evento?",
    viaturasEyebrow: "Serviço exclusivo",
    viaturasTitle: "Aluguer de Viaturas Clássicas",
    viaturasText:
      "Para uma chegada de sonho, da entrada da noiva ao transporte dos noivos e convidados. Carros clássicos com motorista e todo o cuidado.",
  },

  proposta: {
    linkInvalidTitle: "Link inválido ou expirado",
    linkInvalidBody:
      "Este link de proposta já não é válido. Contacte-nos e enviamos-lhe um novo com todo o gosto.",
    notFoundTitle: "Proposta não encontrada",
    notFoundBody:
      "Esta ligação não abre nenhuma proposta. Se acha que é um engano, fale connosco e enviamos-lhe a certa.",
    greeting: "Olá",
    intro:
      "Preparámos esta proposta com todo o cuidado para o vosso dia. Vejam com calma: qualquer ajuste é bem-vindo, basta responderem ao email.",
    tableDescricao: "Descrição",
    tableQt: "Qt",
    tableValor: "Valor",
    subtotal: "Subtotal",
    iva: "IVA",
    total: "Total",
    validoAte: "Válida até",
    /**
     * A versão que o casal está a ver, e quando é que ela mudou.
     *
     * É sobre o DOCUMENTO, nunca sobre quem o lê: não se regista quando a
     * proposta foi aberta, nem por quem, nem quantas vezes — a regra dela, à
     * letra. Isto diz só «este papel foi mexido neste dia», que é o que
     * responde à pergunta que o casal faz ao voltar meses depois: «isto ainda
     * é o mesmo que eu vi?».
     */
    emitidaEm: "Emitida a",
    versaoNumero: "Versão",
    atualizadaEm: "Atualizada a",
    // A6-005: o casal aceitou, e depois houve uma revisão. O link continua a
    // mostrar a versão ACEITE (congelada) — e isso dizia-se a ninguém.
    revistaDepoisDeAceite:
      "Esta é a versão que aceitou. Entretanto preparámos uma versão mais recente, e nada muda sem falarmos consigo primeiro.",
    verPdf: "Ver a proposta completa (PDF)",
    footerNote: "Alguma questão ou ajuste? Responda a este e-mail ou contacte-nos:",
    respostaComo:
      "Diga-nos por e-mail ou por telefone se quer avançar com esta proposta. Respondemos a todas as mensagens.",
    respostaExpirada:
      "O prazo de validade desta proposta já passou. Fale connosco e preparamos-lhe uma proposta atualizada com todo o gosto.",
    dateLocale: "pt-PT",
  },

  errors: {
    notFoundEyebrow: "Página não encontrada",
    notFoundTitle: "Este caminho não existe.",
    notFoundText:
      "A página que procura pode ter sido movida ou já não está disponível. Mas o seu próximo evento ainda está à espera de ser criado.",
    errorEyebrow: "Página parada",
    errorTitle: "Esta página não chegou a carregar.",
    errorText:
      "Nada do que preencheu se perdeu. Tente carregar outra vez e, se voltar a acontecer, siga por um dos caminhos aqui em baixo.",
    retry: "Tentar novamente",
    loading: "A carregar",
  },

  footer: {
    sloganLine1: "Decoramos eventos,",
    sloganLine2: "eternizamos memórias.",
    disponivel: "Disponível para novos eventos",
    paginas: "Páginas",
    servicosTitulo: "Serviços",
    // Emparelhados por ÍNDICE com `serviceSlugs`, em Footer.tsx. A ordem é a do
    // catálogo (`SERVICES`), para que acrescentar um serviço seja acrescentar
    // uma linha no fim de cada uma das três listas.
    serviceLinks: [
      "Decoração de Casamentos",
      "Aluguer de Viaturas Clássicas",
      "Eventos Corporativos",
      "Festas e Aniversários",
      "Batizados e Comunhões",
    ],
    contacto: "Contacto",
    pedirOrcamento: "Pedir orçamento",
    rights: "Todos os direitos reservados",
    legal: "Legal",
    privacidade: "Privacidade",
    termos: "Termos",
    livroReclamacoes: "Livro de Reclamações Eletrónico",
  },
};

export type Dict = typeof pt;
