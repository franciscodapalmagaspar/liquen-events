/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS POLOS DE CASAMENTOS — FONTE ÚNICA DE VERDADE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro é lido por TRÊS consumidores que têm de concordar entre si:
 *
 *   1. As landing pages  (src/app/[lang]/casamentos/[polo]/page.tsx)
 *   2. Os CSV de importação para o Google Ads Editor (scripts/gen-ads.mjs)
 *   3. O sitemap
 *
 * Está tudo no mesmo sítio de PROPÓSITO. A falha clássica de uma conta de Ads
 * é o anúncio apontar para um URL que já não existe, ou a campanha do Algarve
 * mandar tráfego para a página do Alentejo. Aqui isso é impossível por
 * construção: o URL final do anúncio é DERIVADO do `slug` que gera a página.
 * Se a página desaparecer, o CSV deixa de a nomear.
 *
 * ── COBERTURA ──────────────────────────────────────────────────────────────
 * TREZE polos, que cobrem os dezoito distritos do continente mais as duas
 * regiões autónomas. Não são treze recortes administrativos: são treze
 * MERCADOS de casamento com carácter próprio, e é por isso que a Comporta está
 * separada do Alentejo (ticket e público completamente diferentes) e
 * Trás-os-Montes está separado do Douro.
 *
 * ── UMA ADVERTÊNCIA SOBRE O NÚMERO DE PÁGINAS ──────────────────────────────
 * Treze páginas regionais só valem alguma coisa se cada uma disser coisas
 * DIFERENTES. Treze variações da mesma página com o topónimo trocado é o
 * padrão a que a Google chama "doorway pages", e é penalizado. Por isso cada
 * polo tem introdução própria, escrita sobre o que muda mesmo naquele terreno
 * (vento, chão, acessos, luz, logística), e não uma frase-modelo com um
 * espaço em branco.
 *
 * Se alguma vier a ser preenchida à pressa com texto genérico, o melhor é
 * apagá-la, não deixá-la lá.
 *
 * ── PARA ACRESCENTAR UM POLO NOVO ──────────────────────────────────────────
 * Acrescenta uma entrada a POLOS. Não é preciso tocar em mais nada: a página,
 * o sitemap e os CSV passam a incluí-la. Os testes verificam que a entrada
 * está completa (fotografias que existem mesmo e em paisagem, herói dentro do
 * orçamento de bytes, textos nos dois idiomas, peso declarado).
 *
 * ── O QUE ESTÁ MEDIDO E O QUE NÃO ESTÁ ─────────────────────────────────────
 * `peso` é uma decisão de repartição de orçamento, argumentada em
 * /ads-output/estrutura.md. NÃO é volume de pesquisa — esses números só saem
 * do Keyword Planner da conta dela, e não os inventamos aqui. Ver
 * /ads-output/keywords-seed.csv, que é feito para ser colado no Planner.
 *
 * `espacos` são espaços de casamento REAIS da zona, recolhidos em pesquisa
 * pública (casamentos.pt, zankyou.pt, sites dos próprios espaços). Servem
 * dois fins: são as keywords do grupo "Espaços" (quem procura o nome de uma
 * quinta está a montante, ainda não escolheu decoração) e dão à landing page
 * a prova local de que se conhece a zona. NÃO implicam parceria nem trabalho
 * feito lá — a página nunca o afirma. Onde não foi possível verificar nomes,
 * a lista fica VAZIA e a secção não é desenhada, em vez de se inventarem.
 *
 * ── SOBRE A ORIGEM DA EQUIPA ───────────────────────────────────────────────
 * Estas páginas NÃO dizem de onde é a equipa. Foi decisão da dona: a operação
 * é nacional e uma página que abre a dizer de que terra somos convida quem
 * está longe a concluir que fica longe. O que substitui esse argumento é o que
 * interessa ao cliente de qualquer forma — equipa e material próprios, sem
 * custo de deslocação acrescentado no fim, e visita técnica antes da montagem.
 */

import type { Locale } from "@/lib/i18n/config";

/** Conteúdo da landing page de um polo, num idioma. */
export interface PoloConteudo {
  /** Nome da região tal como aparece nos títulos dos anúncios e no H1. */
  regiao: string;
  /** H1 da página. Nomeia sempre a região — é o que separa esta página de uma genérica. */
  h1: string;
  /** <title>. Até ~60 caracteres para não ser cortado na SERP. */
  metaTitle: string;
  metaDescription: string;
  /** Sobrancelha acima do H1. */
  eyebrow: string;
  /** Dois a três parágrafos. Tom contido, sem exclamações. */
  intro: string[];
  /** Frase curta que introduz a lista de espaços. */
  espacosIntro: string;
  /** O que a página afirma sobre a forma de trabalhar naquela zona. */
  prova: string;
}

export interface Polo {
  /** Segmento de URL. Estável — faz parte dos URL finais dos anúncios. */
  slug: string;
  /**
   * Peso na repartição do orçamento (soma dos pesos = 100). Justificado em
   * /ads-output/estrutura.md a partir de: dimensão do mercado, quota de
   * destination weddings e densidade de concorrência.
   */
  peso: number;
  /**
   * Fase de arranque. NÃO abrir tudo ao mesmo tempo: orçamento diluído por
   * treze campanhas não junta sinal em nenhuma e passam-se três meses a pagar
   * sem aprender. Ver /ads-output/arranque.md.
   */
  fase: 1 | 2 | 3;
  /** Localizações a segmentar no Google Ads, pelo nome canónico da Google. */
  geo: string[];
  /** Cidades usadas para expandir keywords locais ("decoração casamento {cidade}"). */
  cidades: string[];
  /** Espaços de casamento reais da zona (keywords do grupo "Espaços" + página). */
  espacos: string[];
  /**
   * Fotografias do portefólio para esta página. TODAS em paisagem — a página
   * usa-as em faixas largas, e uma vertical seria cortada a um risco do meio
   * (foi o defeito corrigido no mosaico de /clientes).
   *
   * ⚠ Estão distribuídas pelo conjunto geral porque o repositório não guarda a
   * região de cada fotografia. Trocar estas listas pelas fotos REAIS de cada
   * zona é a alteração isolada que mais converte nesta entrega: um casal que
   * vai casar no Douro reconhece o Douro.
   */
  fotos: string[];
  /**
   * Fotografia principal, acima da dobra. Em paisagem e ABAIXO DE 100 KB na
   * versão de 1536 px (ver polos-peso.test.ts): é o candidato a LCP de uma
   * página que recebe tráfego pago, e cada 50 KB a mais valem cerca de um
   * segundo de espera num telemóvel em rede fraca.
   */
  hero: string;
  pt: PoloConteudo;
  en: PoloConteudo;
}

/**
 * Os treze polos, por ordem de peso de orçamento (não alfabética).
 *
 * A ordem reflecte onde o dinheiro rende mais primeiro. A ordem de ABERTURA é
 * outra coisa e vive em `campanhas.ts` (`PRIORIDADE_POLO`): com orçamento
 * pequeno, o que decide não é onde está o dinheiro grande mas qual campanha
 * consegue juntar cliques suficientes para se aprender alguma coisa.
 */
export const POLOS: Polo[] = [
  // ───────────────────────────────────────────────────────────────────────
  // 1. ALENTEJO — herdades, escala grande, concorrência dedicada mais fraca.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "alentejo",
    peso: 17,
    fase: 1,
    geo: ["Alentejo, Portugal"],
    cidades: ["Évora", "Estremoz", "Arraiolos", "Beja", "Elvas", "Portalegre", "Borba"],
    espacos: [
      "Herdade Vale Lameira",
      "Quinta do Louredo",
      "Herdade da Valeira",
      "Quinta do Cerrado",
      "Herdade do Sabroso",
      "Quinta da Pureza",
    ],
    hero: "/imagens/EW1_1392.jpg",
    fotos: [
      "/imagens/20_10_2025_0244.jpg",
      "/imagens/DJI_20250913190635_0120_D.jpg",
      "/imagens/DJI_20250913190640_0121_D.jpg",
      "/imagens/DaniGui_Adois_58.jpg",
      "/imagens/DaniGui_JantarFesta_11.jpg",
      "/imagens/DaniGui_JantarFesta_130.jpg",
    ],
    pt: {
      regiao: "Alentejo",
      h1: "Decoração de casamentos no Alentejo",
      metaTitle: "Casamentos em Herdades do Alentejo | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em herdades e quintas do Alentejo. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Alentejo",
      intro: [
        "Uma herdade alentejana dá espaço a mais e sombra a menos. As duas coisas decidem o desenho: as distâncias obrigam a pensar onde as pessoas se juntam, e a hora a que o sol deixa de castigar decide a que horas se pode estar ao ar livre sem ninguém se refugiar dentro de casa.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em herdades, quintas, montes e propriedades privadas, do casamento de sessenta pessoas ao de trezentas.",
      ],
      espacosIntro: "Espaços da região onde este tipo de produção se monta bem:",
      prova:
        "Equipa e material próprios, montagem na véspera sempre que o espaço permite, e visita técnica antes de qualquer encomenda.",
    },
    en: {
      regiao: "the Alentejo",
      h1: "Wedding design and production in the Alentejo",
      metaTitle: "Weddings in Alentejo Estates | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in Alentejo estates and quintas. Concept, floral design, set design and day-of coordination.",
      eyebrow: "Alentejo",
      intro: [
        "An Alentejo estate gives you too much space and too little shade. Both decide the design: the distances force you to think about where people gather, and the hour the sun stops punishing decides when guests can be outdoors without retreating inside.",
        "We handle concept, floral design, set design and day-of coordination, in estates, quintas and private properties, from sixty guests to three hundred.",
      ],
      espacosIntro: "Venues in the region where this kind of production works well:",
      prova:
        "Our own team and stock, setup the day before wherever the venue allows, and a technical visit before anything is ordered.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 2. LISBOA, CASCAIS E SINTRA — maior volume, maior concorrência.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "lisboa",
    peso: 16,
    fase: 1,
    geo: ["Lisbon District, Portugal"],
    cidades: ["Lisboa", "Cascais", "Sintra", "Oeiras", "Estoril", "Mafra"],
    espacos: [
      "Penha Longa Resort",
      "Quinta dos Lobos",
      "Quinta da Barreta",
      "Quinta de São Francisco",
      "Quinta dos Alfinetes",
      "Quinta Marquês da Serra",
    ],
    hero: "/imagens/J&A-243.jpg",
    fotos: [
      "/imagens/DaniGui_JantarFesta_26.jpg",
      "/imagens/DaniGui_JantarFesta_39.jpg",
      "/imagens/DaniGui_JantarFesta_48.jpg",
      "/imagens/DaniGui_JantarFesta_6.jpg",
      "/imagens/DaniGui_PreparacaoDani_33.jpg",
      "/imagens/DaniGui_Preview12.jpg",
    ],
    pt: {
      regiao: "Lisboa",
      h1: "Decoração de casamentos em Lisboa, Cascais e Sintra",
      metaTitle: "Casamentos em Quintas de Lisboa e Sintra | Líquen",
      metaDescription:
        "Decoração e produção de casamentos em Lisboa, Cascais e Sintra. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Lisboa, Cascais e Sintra",
      intro: [
        "Lisboa, Cascais e Sintra têm uma exigência que não se vê nas fotografias: janelas de montagem curtas, regras de acesso apertadas e fornecedores a trabalhar a horas contadas. Aqui a produção decide tanto como o desenho, e um plano que não caiba no horário do espaço não é um plano.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, palácios, hotéis e espaços privados da zona.",
      ],
      espacosIntro: "Espaços da zona onde montamos com regularidade:",
      prova:
        "Equipa e material próprios, com o horário de montagem acertado com o espaço antes de se fechar o desenho.",
    },
    en: {
      regiao: "Lisbon",
      h1: "Wedding design in Lisbon, Cascais and Sintra",
      metaTitle: "Weddings in Lisbon & Sintra Quintas | Líquen",
      metaDescription:
        "Wedding design, florals and production in Lisbon, Cascais and Sintra. Concept, floral design, set design and day-of coordination.",
      eyebrow: "Lisbon, Cascais and Sintra",
      intro: [
        "Lisbon, Cascais and Sintra make a demand that never shows in photographs: short setup windows, strict access rules and suppliers working to the minute. Production decides as much as design here, and a plan that does not fit the venue's schedule is not a plan.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, palaces, hotels and private venues across the area.",
      ],
      espacosIntro: "Venues in the area where we build regularly:",
      prova:
        "Our own team and stock, with the setup schedule agreed with the venue before the design is closed.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 3. ALGARVE — o polo internacional dentro de Portugal.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "algarve",
    peso: 13,
    fase: 2,
    geo: ["Algarve, Portugal"],
    cidades: ["Lagos", "Albufeira", "Loulé", "Vilamoura", "Tavira", "Portimão", "Faro"],
    espacos: [
      "Quinta dos Vales",
      "Quinta Bonita",
      "Quinta das Oliveiras",
      "Monte do Serrinho",
      "Vila Vita Parc",
    ],
    hero: "/imagens/teresinhaeze-1434.jpg",
    fotos: [
      "/imagens/teresinhaeze-923.jpg",
      "/imagens/EW1_0362.jpg",
      "/imagens/EW1_0576.jpg",
      "/imagens/EW1_0688.jpg",
      "/imagens/EW1_0689.jpg",
      "/imagens/EW1_0690.jpg",
    ],
    pt: {
      regiao: "Algarve",
      h1: "Decoração de casamentos no Algarve",
      metaTitle: "Casamentos no Algarve: quintas e hotéis | Líquen",
      metaDescription:
        "Decoração e produção de casamentos no Algarve, para casais portugueses e estrangeiros. Conceito, flores, cenografia e coordenação.",
      eyebrow: "Algarve",
      intro: [
        "O Algarve recebe casais de todo o lado, e boa parte do trabalho faz-se à distância, com um ou dois dias no terreno. Isso muda o método: o que noutra região se resolve numa visita, aqui resolve-se com desenho, plantas e decisões tomadas antes de alguém viajar.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, hotéis e casas privadas de todo o Algarve.",
      ],
      espacosIntro: "Espaços da região com produções deste tipo:",
      prova:
        "Trabalhamos em português e em inglês, com apresentação de conceito à distância e visita ao espaço antes da montagem.",
    },
    en: {
      regiao: "the Algarve",
      h1: "Wedding design and production in the Algarve",
      metaTitle: "Weddings in the Algarve: quintas & hotels | Líquen",
      metaDescription:
        "Wedding design, florals and production across the Algarve for Portuguese and international couples. Concept, styling and coordination.",
      eyebrow: "Algarve",
      intro: [
        "The Algarve draws couples from everywhere, and much of the work happens remotely, with a day or two on site. That changes the method: what another region settles in a visit, here is settled with drawings, floor plans and decisions made before anyone travels.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, hotels and private villas across the Algarve.",
      ],
      espacosIntro: "Venues in the region that host productions of this kind:",
      prova:
        "We work in Portuguese and English, presenting the concept remotely and walking the venue before setup.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 4. PORTO E DOURO — mercado grande, concorrência local enraizada.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "porto-douro",
    peso: 11,
    fase: 2,
    geo: ["Porto District, Portugal"],
    cidades: ["Porto", "Vila Nova de Gaia", "Peso da Régua", "Lamego", "Amarante", "Matosinhos"],
    espacos: [
      "Quinta da Torrebella",
      "Quinta dos Bambus",
      "Quinta da Morgadinha",
      "Quinta dos Românticos",
      "Quinta de Mosteirô",
    ],
    hero: "/imagens/DaniGui_Preview79.jpg",
    fotos: [
      "/imagens/EW1_0697.jpg",
      "/imagens/EW1_1100.jpg",
      "/imagens/EW1_1330.jpg",
      "/imagens/EW1_1332.jpg",
      "/imagens/EW1_1333.jpg",
      "/imagens/EW1_1337.jpg",
    ],
    pt: {
      regiao: "Porto e Douro",
      h1: "Decoração de casamentos no Porto e no Douro",
      metaTitle: "Casamentos em Quintas do Douro e Porto | Líquen",
      metaDescription:
        "Decoração e produção de casamentos no Porto e no Vale do Douro. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Porto e Vale do Douro",
      intro: [
        "No Douro a paisagem já é cenografia, e o erro mais comum é competir com ela. O trabalho é quase todo de subtracção: menos volume, materiais que aguentem o calor reflectido das encostas, e uma paleta que não discuta com as vinhas.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas do Douro e espaços do Grande Porto.",
      ],
      espacosIntro: "Espaços da região onde este tipo de produção assenta:",
      prova:
        "Equipa e material próprios, com montagem na véspera e plano alternativo desenhado para o caso de chuva.",
    },
    en: {
      regiao: "Porto and the Douro",
      h1: "Wedding design in Porto and the Douro Valley",
      metaTitle: "Weddings in Douro Valley Quintas | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in Porto and the Douro Valley. Concept, floral design, set design and coordination.",
      eyebrow: "Porto and the Douro Valley",
      intro: [
        "In the Douro the landscape is already set design, and the common mistake is competing with it. The work is mostly subtraction: less volume, materials that survive the heat thrown back by the terraces, and a palette that does not argue with the vines.",
        "We handle concept, floral design, set design and day-of coordination, in Douro quintas and venues around Porto.",
      ],
      espacosIntro: "Venues in the region where this kind of production sits well:",
      prova:
        "Our own team and stock, setting up the day before, with a wet-weather plan drawn from the start.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 5. COMPORTA E TRÓIA — separado do Alentejo de propósito: outro ticket,
  //    outro público, outra estética.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "comporta",
    peso: 8,
    fase: 2,
    geo: ["Setúbal District, Portugal"],
    cidades: ["Comporta", "Melides", "Grândola", "Troia", "Alcácer do Sal", "Setúbal"],
    espacos: ["Sublime Comporta", "Herdade da Comporta", "Quinta da Comporta"],
    hero: "/imagens/M&F0508.jpg",
    fotos: [
      "/imagens/EW1_1393.jpg",
      "/imagens/EW1_1394.jpg",
      "/imagens/EW1_1395.jpg",
      "/imagens/EW1_1398.jpg",
      "/imagens/EW1_1401.jpg",
      "/imagens/EW1_1404.jpg",
    ],
    pt: {
      regiao: "Comporta",
      h1: "Decoração de casamentos na Comporta e em Melides",
      metaTitle: "Casamentos na Comporta e em Melides | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos na Comporta, Melides e Troia. Areia, pinhal e vento tratados como matéria do desenho.",
      eyebrow: "Comporta, Melides e Troia",
      intro: [
        "Na Comporta há três coisas que mandam no desenho e não estão nas fotografias de inspiração: a areia, que não segura estrutura nenhuma sem base própria; o vento do fim da tarde, que decide a altura de tudo o que se levanta; e a luz, que aqui é o argumento principal e dispensa quase todo o resto.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em herdades, casas de praia e propriedades privadas da zona.",
      ],
      espacosIntro: "Espaços da zona:",
      prova:
        "Estruturas dimensionadas para areia e para vento, com material próprio e ensaio de montagem antes do dia.",
    },
    en: {
      regiao: "Comporta",
      h1: "Wedding design in Comporta and Melides",
      metaTitle: "Weddings in Comporta and Melides | Líquen Events",
      metaDescription:
        "Wedding design and production in Comporta, Melides and Troia. Sand, pine and wind treated as material, not obstacles.",
      eyebrow: "Comporta, Melides and Troia",
      intro: [
        "Three things rule the design in Comporta and none of them appear in inspiration photographs: the sand, which holds no structure without a base of its own; the late-afternoon wind, which decides the height of anything you raise; and the light, which here is the main argument and makes almost everything else optional.",
        "We handle concept, floral design, set design and day-of coordination, in estates, beach houses and private properties in the area.",
      ],
      espacosIntro: "Venues in the area:",
      prova: "Structures sized for sand and wind, with our own stock and a dry run before the day.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 6. MINHO — maior densidade de quintas do país, formato muito estabelecido.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "minho",
    peso: 7,
    fase: 3,
    geo: ["Braga District, Portugal", "Viana do Castelo District, Portugal"],
    cidades: ["Braga", "Guimarães", "Barcelos", "Ponte de Lima", "Viana do Castelo"],
    espacos: [
      "Quinta D'Ávila",
      "Solar das Bouças",
      "Quinta Vila Marita",
      "Quinta de Sabroso",
      "Quinta das Carpas",
      "Quinta do Retiro",
    ],
    hero: "/imagens/EW1_0580.jpg",
    fotos: [
      "/imagens/EW1_1405.jpg",
      "/imagens/EW1_1427.jpg",
      "/imagens/EW1_1428.jpg",
      "/imagens/EW1_1505.jpg",
      "/imagens/J&A-242.jpg",
      "/imagens/J&A-59.jpg",
    ],
    pt: {
      regiao: "Minho",
      h1: "Decoração de casamentos no Minho e em Braga",
      metaTitle: "Casamentos em Quintas do Minho e Braga | Líquen",
      metaDescription:
        "Decoração e produção de casamentos no Minho, Braga e Guimarães. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Minho, Braga e Guimarães",
      intro: [
        "O triângulo entre Braga, Guimarães e Barcelos tem a maior densidade de quintas de casamento do país, e com ela um formato muito estabelecido, que a maior parte das quintas já traz montado. Quem nos procura aqui costuma querer sair desse formato sem perder a escala nem o à-vontade.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas e solares da região.",
      ],
      espacosIntro: "Espaços da região com produções deste tipo:",
      prova: "Equipa e material próprios, orçamentados à partida, sem extras acrescentados no fim.",
    },
    en: {
      regiao: "the Minho",
      h1: "Wedding design in the Minho and Braga",
      metaTitle: "Weddings in Minho Quintas | Líquen Events",
      metaDescription:
        "Wedding design, florals and production in the Minho, Braga and Guimarães. Concept, floral design, set design and coordination.",
      eyebrow: "Minho, Braga and Guimarães",
      intro: [
        "The triangle between Braga, Guimarães and Barcelos holds the highest density of wedding quintas in the country, and with it a very settled format that most venues already have in place. Couples who come to us here usually want out of that format without losing the scale or the ease.",
        "We handle concept, floral design, set design and day-of coordination, in quintas and manor houses across the region.",
      ],
      espacosIntro: "Venues in the region hosting productions of this kind:",
      prova: "Our own team and stock, quoted up front, with no extras added at the end.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 7. CENTRO — Coimbra, Aveiro e Viseu. Mercado disperso.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "centro",
    peso: 6,
    fase: 3,
    geo: ["Coimbra District, Portugal", "Aveiro District, Portugal", "Viseu District, Portugal"],
    cidades: ["Coimbra", "Aveiro", "Viseu", "Figueira da Foz", "Águeda", "Mealhada"],
    espacos: [],
    hero: "/imagens/EW1_0365.jpg",
    fotos: [
      "/imagens/J&A-68.jpg",
      "/imagens/J&A-9.jpg",
      "/imagens/J&P-1Y1A2031.jpg",
      "/imagens/J&P-4B6A1405.jpg",
      "/imagens/J&P-DJI_20250628164714_0165_D.jpg",
      "/imagens/J&P-DJI_20250628174247_0187_D.jpg",
    ],
    pt: {
      regiao: "Centro",
      h1: "Decoração de casamentos em Coimbra e no Centro",
      metaTitle: "Casamentos em Coimbra, Aveiro e Viseu | Líquen",
      metaDescription:
        "Decoração e produção de casamentos em Coimbra, Aveiro e Viseu. Conceito, design floral, cenografia e coordenação do dia.",
      eyebrow: "Coimbra, Aveiro e Viseu",
      intro: [
        "O Centro não tem um polo único: os casamentos espalham-se por Coimbra, Aveiro e Viseu, muitas vezes em espaços que recebem poucos por ano. Isso é uma vantagem de desenho, porque quase nada está pré-formatado, e um custo de produção, porque há menos rotina instalada e mais coisas para acertar de raiz.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, solares e espaços privados da região.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Visita técnica ao espaço antes de fechar o desenho, com levantamento de electricidade, acessos e piso.",
    },
    en: {
      regiao: "central Portugal",
      h1: "Wedding design in Coimbra and central Portugal",
      metaTitle: "Weddings in Coimbra, Aveiro & Viseu | Líquen",
      metaDescription:
        "Wedding design, florals and production in Coimbra, Aveiro and Viseu. Concept, styling, set design and coordination.",
      eyebrow: "Coimbra, Aveiro and Viseu",
      intro: [
        "Central Portugal has no single hub: weddings spread across Coimbra, Aveiro and Viseu, often in venues that host only a handful each year. That is a design advantage, because almost nothing is pre-formatted, and a production cost, because there is less routine in place and more to settle from scratch.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, manor houses and private venues across the region.",
      ],
      espacosIntro: "Venues in the region:",
      prova: "A technical visit before the design is closed, surveying power, access and ground.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 8. OESTE — Óbidos, Nazaré, Caldas. Perto de Lisboa e muito mais barato.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "oeste",
    peso: 5,
    fase: 3,
    geo: ["Leiria District, Portugal"],
    cidades: ["Óbidos", "Caldas da Rainha", "Nazaré", "Peniche", "Leiria", "Alcobaça"],
    espacos: [],
    hero: "/imagens/EW1_0363.jpg",
    fotos: [
      "/imagens/J&P-DJI_20250628174304_0188_D.jpg",
      "/imagens/J&P-IMGL3188.jpg",
      "/imagens/J&P-IMGL4767.jpg",
      "/imagens/J&P-IMGL4769.jpg",
      "/imagens/J&P-IMGL4770.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A3176.jpg",
    ],
    pt: {
      regiao: "Oeste",
      h1: "Decoração de casamentos no Oeste e em Óbidos",
      metaTitle: "Casamentos em Óbidos e no Oeste | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos no Oeste, em Óbidos, Caldas da Rainha e Nazaré. Conceito, flores, cenografia e coordenação.",
      eyebrow: "Óbidos, Caldas e Nazaré",
      intro: [
        "O Oeste é o que Lisboa custaria se não fosse Lisboa: a uma hora da capital, com muros de pedra, muralhas e mar, e com preços de espaço que ainda deixam orçamento para o resto. Em troca pede atenção ao vento atlântico, que muda de tarde e que não perdoa uma estrutura leve.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, casas antigas e espaços privados da zona.",
      ],
      espacosIntro: "Espaços da zona:",
      prova:
        "Estruturas dimensionadas para vento de litoral, com plano alternativo desenhado à partida.",
    },
    en: {
      regiao: "the Oeste",
      h1: "Wedding design in the Oeste and Óbidos",
      metaTitle: "Weddings in Óbidos and the Oeste | Líquen Events",
      metaDescription:
        "Wedding design and production in the Oeste, Óbidos, Caldas da Rainha and Nazaré. Concept, florals, set design and coordination.",
      eyebrow: "Óbidos, Caldas and Nazaré",
      intro: [
        "The Oeste is what Lisbon would cost if it were not Lisbon: an hour from the capital, with stone walls, ramparts and the sea, and venue prices that still leave budget for everything else. In exchange it asks for attention to the Atlantic wind, which turns in the afternoon and forgives no light structure.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, old houses and private venues in the area.",
      ],
      espacosIntro: "Venues in the area:",
      prova: "Structures sized for coastal wind, with an alternative plan drawn from the start.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 9. RIBATEJO — Santarém, Tomar, Golegã. Cavalos, planície e rio.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "ribatejo",
    peso: 4,
    fase: 3,
    geo: ["Santarém District, Portugal"],
    cidades: ["Santarém", "Tomar", "Golegã", "Abrantes", "Almeirim", "Torres Novas"],
    espacos: [],
    hero: "/imagens/J&A-442.jpg",
    fotos: [
      "/imagens/JOAO_E_PEDRO_1Y1A3190.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A3453.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4467.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
      "/imagens/JOAO_E_PEDRO_1Y1A4738.jpg",
    ],
    pt: {
      regiao: "Ribatejo",
      h1: "Decoração de casamentos no Ribatejo",
      metaTitle: "Casamentos no Ribatejo e em Santarém | Líquen",
      metaDescription:
        "Decoração e produção de casamentos no Ribatejo, em Santarém, Tomar e Golegã. Conceito, flores, cenografia e coordenação.",
      eyebrow: "Santarém, Tomar e Golegã",
      intro: [
        "O Ribatejo tem uma tradição própria de festa, com cavalos, campo aberto e mesas longas, e quase sempre uma família com opinião formada sobre como se faz. O trabalho aqui é menos de impor um conceito e mais de dar forma limpa a uma coisa que já existe.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em herdades, coudelarias e quintas da região.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Desenho ajustado ao que a família já tem e quer manter, com equipa e material próprios.",
    },
    en: {
      regiao: "the Ribatejo",
      h1: "Wedding design in the Ribatejo",
      metaTitle: "Weddings in the Ribatejo | Líquen Events",
      metaDescription:
        "Wedding design and production in the Ribatejo, Santarém, Tomar and Golegã. Concept, florals, set design and coordination.",
      eyebrow: "Santarém, Tomar and Golegã",
      intro: [
        "The Ribatejo has a celebration tradition of its own, with horses, open country and long tables, and almost always a family with settled views on how it is done. The work here is less about imposing a concept and more about giving clean form to something that already exists.",
        "We handle concept, floral design, set design and day-of coordination, in estates, stud farms and quintas across the region.",
      ],
      espacosIntro: "Venues in the region:",
      prova:
        "A design shaped around what the family already has and wants to keep, with our own team and stock.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 10. MADEIRA — pequeno, ticket alto, estratégia oficial desde 2025.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "madeira",
    peso: 4,
    fase: 3,
    geo: ["Madeira, Portugal"],
    cidades: ["Funchal", "Câmara de Lobos", "Santa Cruz", "Ponta do Sol", "Porto Santo"],
    espacos: [],
    hero: "/imagens/matilde-e-tomas28.jpg",
    fotos: [
      "/imagens/M&F0678.jpg",
      "/imagens/PJ-3256.jpg",
      "/imagens/PJ-3666.jpg",
      "/imagens/PJ-5032.jpg",
      "/imagens/PJ-5396.jpg",
      "/imagens/Sophia&Artur_MAINOVA-585.jpg",
    ],
    pt: {
      regiao: "Madeira",
      h1: "Decoração de casamentos na Madeira",
      metaTitle: "Casamentos na Madeira: decoração | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos na Madeira. Conceito, design floral e coordenação, com logística de ilha resolvida à partida.",
      eyebrow: "Madeira",
      intro: [
        "Numa ilha, a logística decide o desenho. O que se leva tem de caber num voo ou num contentor com semanas de antecedência, e o que se compra no destino depende do que a ilha tem naquela época. Dizemos isto no primeiro dia, porque é o que separa um orçamento honesto de uma surpresa a meio.",
        "Fazemos o conceito, o design floral e a coordenação do dia, com fornecimento local sempre que faz sentido.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Logística de ilha planeada com semanas de antecedência e orçamentada à partida, transporte incluído.",
    },
    en: {
      regiao: "Madeira",
      h1: "Wedding design in Madeira",
      metaTitle: "Weddings in Madeira: design & florals | Líquen",
      metaDescription:
        "Wedding design, florals and coordination in Madeira, with island logistics planned and priced from the start.",
      eyebrow: "Madeira",
      intro: [
        "On an island, logistics decide the design. Whatever travels has to fit a flight or a container weeks ahead, and whatever is bought locally depends on what the island has that season. We say so on day one, because it is what separates an honest quote from a surprise halfway through.",
        "We handle concept, floral design and day-of coordination, sourcing locally wherever it makes sense.",
      ],
      espacosIntro: "Venues in the region:",
      prova: "Island logistics planned weeks ahead and priced up front, transport included.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 11. TRÁS-OS-MONTES — separado do Douro: outro terreno, outra escala.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "tras-os-montes",
    peso: 3,
    fase: 3,
    geo: ["Vila Real District, Portugal", "Bragança District, Portugal"],
    cidades: ["Vila Real", "Bragança", "Chaves", "Mirandela", "Macedo de Cavaleiros"],
    espacos: [],
    hero: "/imagens/EW1_1396.jpg",
    fotos: [
      "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
      "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL1561.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL2180.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL2823.jpg",
      "/imagens/JOAO_E_PEDRO_IMGL4226.jpg",
    ],
    pt: {
      regiao: "Trás-os-Montes",
      h1: "Decoração de casamentos em Trás-os-Montes",
      metaTitle: "Casamentos em Trás-os-Montes | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos em Vila Real, Bragança e Chaves. Conceito, design floral, cenografia e coordenação.",
      eyebrow: "Vila Real, Bragança e Chaves",
      intro: [
        "Em Trás-os-Montes a amplitude térmica é a variável esquecida: entre a montagem da manhã e o jantar podem ir quinze graus, e há flor que não sobrevive a isso. A escolha do material faz-se a pensar na noite, não na fotografia do meio da tarde.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, solares e casas de família da região.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Flores e materiais escolhidos para a amplitude térmica da região, com montagem na véspera.",
    },
    en: {
      regiao: "Trás-os-Montes",
      h1: "Wedding design in Trás-os-Montes",
      metaTitle: "Weddings in Trás-os-Montes | Líquen Events",
      metaDescription:
        "Wedding design and production in Vila Real, Bragança and Chaves. Concept, floral design, set design and coordination.",
      eyebrow: "Vila Real, Bragança and Chaves",
      intro: [
        "In Trás-os-Montes the forgotten variable is the temperature swing: fifteen degrees can separate the morning setup from dinner, and some flowers do not survive that. Material choices are made for the night, not for the mid-afternoon photograph.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, manor houses and family homes across the region.",
      ],
      espacosIntro: "Venues in the region:",
      prova:
        "Flowers and materials chosen for the region's temperature swing, with setup the day before.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 12. BEIRA INTERIOR — Guarda, Castelo Branco, Serra da Estrela.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "beira-interior",
    peso: 3,
    fase: 3,
    geo: ["Guarda District, Portugal", "Castelo Branco District, Portugal"],
    cidades: ["Guarda", "Castelo Branco", "Covilhã", "Fundão", "Belmonte", "Manteigas"],
    espacos: [],
    hero: "/imagens/stephanie-mizio-7.jpg",
    fotos: [
      "/imagens/M&F0498.jpg",
      "/imagens/M&F0511.jpg",
      "/imagens/M&F0512.jpg",
      "/imagens/M&F0514.jpg",
      "/imagens/M&F0516.jpg",
      "/imagens/M&F0658.jpg",
    ],
    pt: {
      regiao: "Beira Interior",
      h1: "Decoração de casamentos na Beira Interior",
      metaTitle: "Casamentos na Beira Interior e Guarda | Líquen",
      metaDescription:
        "Decoração e produção de casamentos na Guarda, Covilhã e Serra da Estrela. Conceito, flores, cenografia e coordenação.",
      eyebrow: "Guarda, Covilhã e Serra da Estrela",
      intro: [
        "A Beira Interior tem granito, altitude e uma estação boa mais curta do que no resto do país. Isso limita as datas e limita a flor disponível, e por isso o desenho parte quase sempre do que existe na região naquela semana, em vez de uma paleta escolhida com meses de antecedência.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação do dia, em quintas, solares e espaços de montanha.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Paleta escolhida sobre a flor disponível na semana do casamento, com alternativa de interior desenhada.",
    },
    en: {
      regiao: "the Beira Interior",
      h1: "Wedding design in the Beira Interior",
      metaTitle: "Weddings in the Beira Interior | Líquen Events",
      metaDescription:
        "Wedding design and production in Guarda, Covilhã and the Serra da Estrela. Concept, florals, set design and coordination.",
      eyebrow: "Guarda, Covilhã and Serra da Estrela",
      intro: [
        "The Beira Interior has granite, altitude and a good season shorter than the rest of the country. That limits the dates and limits the flowers available, so the design almost always starts from what the region has that week, rather than a palette chosen months ahead.",
        "We handle concept, floral design, set design and day-of coordination, in quintas, manor houses and mountain venues.",
      ],
      espacosIntro: "Venues in the region:",
      prova:
        "A palette built on the flowers available in the wedding week, with an indoor alternative drawn.",
    },
  },

  // ───────────────────────────────────────────────────────────────────────
  // 13. AÇORES — o ticket médio mais alto do país, o mercado mais pequeno.
  // ───────────────────────────────────────────────────────────────────────
  {
    slug: "acores",
    peso: 3,
    fase: 3,
    geo: ["Azores, Portugal"],
    cidades: ["Ponta Delgada", "Angra do Heroísmo", "Horta", "Ribeira Grande", "Praia da Vitória"],
    espacos: [],
    hero: "/imagens/M&F0502.jpg",
    fotos: [
      "/imagens/Sophia&Artur_MAINOVA-595.jpg",
      "/imagens/Sophia&Artur_MAINOVA-598.jpg",
      "/imagens/Sophia&Artur_MAINOVA-599.jpg",
      "/imagens/Sophia&Artur_MAINOVA-889.jpg",
      "/imagens/Sophia&Artur_MAINOVA_capa-305.jpg",
      "/imagens/Sophia&Artur_MAINOVA_capa-306.jpg",
    ],
    pt: {
      regiao: "Açores",
      h1: "Decoração de casamentos nos Açores",
      metaTitle: "Casamentos nos Açores: decoração | Líquen Events",
      metaDescription:
        "Decoração e produção de casamentos nos Açores. Conceito, design floral e coordenação, com logística inter-ilhas planeada.",
      eyebrow: "Açores",
      intro: [
        "Nos Açores conta-se com o tempo a mudar no próprio dia, e um plano sem alternativa coberta não é um plano. Desenhamos sempre as duas versões, e a segunda não é a primeira mais pobre: é outra montagem, pensada para ser tão boa quanto a primeira em vez de ser o recurso envergonhado.",
        "Fazemos o conceito, o design floral e a coordenação do dia, com logística inter-ilhas planeada com antecedência.",
      ],
      espacosIntro: "Espaços da região:",
      prova:
        "Duas versões de montagem desenhadas à partida, interior e exterior, sem custo adicional pela alternativa.",
    },
    en: {
      regiao: "the Azores",
      h1: "Wedding design in the Azores",
      metaTitle: "Weddings in the Azores: design | Líquen Events",
      metaDescription:
        "Wedding design, florals and coordination in the Azores, with inter-island logistics planned well ahead.",
      eyebrow: "Azores",
      intro: [
        "In the Azores the weather changes within the day, and a plan without a covered alternative is not a plan. We design both versions from the start, and the second is not a poorer copy of the first: it is a different build, meant to be as good as the other rather than an embarrassed fallback.",
        "We handle concept, floral design and day-of coordination, with inter-island logistics planned well ahead.",
      ],
      espacosIntro: "Venues in the region:",
      prova:
        "Two builds designed from the outset, indoor and outdoor, with no extra charge for the alternative.",
    },
  },
];

/** Procura um polo pelo segmento de URL. */
export function getPolo(slug: string): Polo | undefined {
  return POLOS.find((p) => p.slug === slug);
}

/** Conteúdo do polo no idioma pedido. */
export function conteudoPolo(polo: Polo, locale: Locale): PoloConteudo {
  return locale === "en" ? polo.en : polo.pt;
}

/** Caminho da landing page (sem prefixo de idioma). */
export function caminhoPolo(slug: string): string {
  return `/casamentos/${slug}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTILOS — o segundo eixo de landing pages.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quem procura "casamento boho" ou "casamento minimalista" está a decidir a
 * ESTÉTICA, não o fornecedor, e ainda não tem data marcada. Mandar essa pessoa
 * para uma página regional é mandá-la responder a uma pergunta que ela ainda
 * não se fez. Daí páginas próprias, com formulário na mesma, mas com o texto
 * calibrado para quem ainda está a namorar a ideia.
 */
export interface Estilo {
  slug: string;
  fotos: string[];
  hero: string;
  pt: { nome: string; h1: string; metaTitle: string; metaDescription: string; intro: string[] };
  en: { nome: string; h1: string; metaTitle: string; metaDescription: string; intro: string[] };
}

export const ESTILOS: Estilo[] = [
  {
    slug: "minimalista",
    hero: "/imagens/EW1_1342.jpg",
    fotos: [
      "/imagens/Sophia&Artur_MAINOVA_capa-307.jpg",
      "/imagens/Sophia&Artur_MAINOVA_capa-308.jpg",
      "/imagens/Sophia&Artur_MAINOVA_capa-482.jpg",
      "/imagens/hd-edited.jpg",
    ],
    pt: {
      nome: "Minimalista",
      h1: "Casamentos minimalistas",
      metaTitle: "Casamento Minimalista: Decoração | Líquen Events",
      metaDescription:
        "Decoração de casamentos minimalistas: paleta curta, materiais honestos e volume onde conta. Conceito, flores e produção.",
      intro: [
        "Um casamento minimalista não é um casamento com menos coisas. É um casamento onde cada coisa aguenta ser vista de perto: poucas peças, materiais honestos, e volume concentrado onde as pessoas efectivamente olham.",
        "É o estilo mais difícil de fazer bem e o mais fácil de fazer barato, porque não há onde esconder um acabamento mal resolvido.",
      ],
    },
    en: {
      nome: "Minimalist",
      h1: "Minimalist weddings",
      metaTitle: "Minimalist Wedding Design | Líquen Events",
      metaDescription:
        "Minimalist wedding design: a short palette, honest materials, and volume where it counts. Concept, florals and production.",
      intro: [
        "A minimalist wedding is not a wedding with fewer things. It is one where every thing survives being looked at closely: few pieces, honest materials, and volume concentrated where people actually look.",
        "It is the hardest style to do well and the easiest to do cheaply, because there is nowhere to hide a badly resolved finish.",
      ],
    },
  },
  {
    slug: "boho",
    hero: "/imagens/J&A-52.jpg",
    fotos: [
      "/imagens/image0.jpeg",
      "/imagens/image2.jpeg",
      "/imagens/image5-1.jpeg",
      "/imagens/image6.jpeg",
    ],
    pt: {
      nome: "Boho",
      h1: "Casamentos boho",
      metaTitle: "Casamento Boho: Decoração e Produção | Líquen Events",
      metaDescription:
        "Decoração de casamentos boho: têxteis, madeiras e flor solta, com a produção resolvida por trás do desenho descontraído.",
      intro: [
        "O boho vive de parecer que aconteceu sozinho. Não acontece: os têxteis têm de aguentar vento, as madeiras têm de assentar niveladas em chão de terra, e a flor solta tem de sobreviver a seis horas de calor sem murchar à vista de toda a gente.",
        "Fazemos o desenho e a produção que o sustenta, para que a leveza seja o efeito e não a preparação.",
      ],
    },
    en: {
      nome: "Boho",
      h1: "Boho weddings",
      metaTitle: "Boho Wedding Design & Production | Líquen Events",
      metaDescription:
        "Boho wedding design: textiles, timber and loose florals, with the production resolved behind the relaxed look.",
      intro: [
        "Boho lives on looking like it happened by itself. It does not: the textiles have to hold in wind, the timber has to sit level on bare ground, and loose florals have to survive six hours of heat without wilting in front of everyone.",
        "We do the design and the production that holds it up, so the lightness is the effect and not the preparation.",
      ],
    },
  },
  {
    slug: "campo",
    hero: "/imagens/M&F0515.jpg",
    fotos: [
      "/imagens/imagem-whatsapp-2025-08-18-as-23-01-39-4a836a89.jpg",
      "/imagens/ines-goncalo-253.jpg",
      "/imagens/ines-goncalo-282.jpg",
      "/imagens/ines-goncalo-421.jpg",
    ],
    pt: {
      nome: "No campo",
      h1: "Casamentos no campo",
      metaTitle: "Casamento no Campo: Decoração | Líquen Events",
      metaDescription:
        "Decoração de casamentos no campo, em herdades e quintas. Conceito, design floral, cenografia e coordenação do dia.",
      intro: [
        "Um casamento no campo tem duas contas que não aparecem nas fotografias: a electricidade e o chão. Resolvidas essas duas, quase tudo o resto passa a ser escolha em vez de constrangimento.",
        "Fazemos o conceito, o design floral, a cenografia e a coordenação, em herdades, quintas e propriedades privadas por todo o país.",
      ],
    },
    en: {
      nome: "Countryside",
      h1: "Countryside weddings",
      metaTitle: "Countryside Wedding Design | Líquen Events",
      metaDescription:
        "Wedding design for countryside estates and quintas. Concept, floral design, set design and day-of coordination.",
      intro: [
        "A countryside wedding has two costs that never show in the photographs: power and ground. Solve those two and almost everything else becomes a choice rather than a constraint.",
        "We handle concept, floral design, set design and coordination, in estates, quintas and private properties across the country.",
      ],
    },
  },
];

export function getEstilo(slug: string): Estilo | undefined {
  return ESTILOS.find((e) => e.slug === slug);
}
