/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ESTRUTURA DE CAMPANHAS, EM CÓDIGO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deriva do catálogo de polos. É de propósito: assim é IMPOSSÍVEL um anúncio
 * apontar para uma página que não existe, e é impossível a campanha do Algarve
 * mandar tráfego para a página do Alentejo. Os dois defeitos mais caros e mais
 * banais de uma conta de Ads deixam de ser possíveis por construção em vez de
 * dependerem de alguém reparar.
 *
 * O que este módulo produz é lido por `scripts/gen-ads.mjs`, que escreve os
 * CSV de importação para o Google Ads Editor em /ads-output/.
 *
 * ── CONTEXTO DE 2026 QUE ESTA ESTRUTURA RESPEITA ───────────────────────────
 * • As campanhas de Display autónomas estão a ser migradas para Demand Gen.
 *   Não geramos nenhuma: neste negócio a procura já existe e é explícita
 *   ("decoração casamento Algarve"), portanto o dinheiro rende mais a apanhar
 *   quem já está a pesquisar do que a interromper quem não está.
 * • O AI Max é uma DEFINIÇÃO dentro de campanhas de Pesquisa, não um tipo de
 *   campanha. Fica desligado no arranque — expande a correspondência de forma
 *   parecida com a correspondência ampla, e com uma conta sem histórico de
 *   conversões isso gasta o orçamento a aprender o que já sabemos.
 * • O Performance Max entrega licitação, orçamento e colocações à IA da
 *   Google. Ver a recomendação em /ads-output/estrutura.md — em resumo: NÃO,
 *   e a razão é estrutural, não ideológica.
 *
 * ── PORQUÊ UMA CAMPANHA POR POLO ───────────────────────────────────────────
 * Porque o orçamento é a única alavanca que a Google não pode ignorar. Numa
 * campanha nacional única, o algoritmo leva o dinheiro para onde há mais
 * volume — Lisboa — e as regiões onde o clique é mais barato e a margem melhor
 * nunca chegam a ser testadas. Com uma campanha por polo, cada
 * região tem um tecto que ela decide, e a comparação entre regiões passa a ser
 * possível.
 */

import { POLOS, ESTILOS, caminhoPolo, type Polo } from "./polos";
import { SITE } from "@/lib/site";

/** Tipos de correspondência de keyword usados. Sem correspondência ampla. */
export type Correspondencia = "exata" | "frase";

export interface Keyword {
  texto: string;
  correspondencia: Correspondencia;
}

export interface GrupoAnuncios {
  nome: string;
  /** URL final, sem domínio. Derivado do catálogo — nunca escrito à mão. */
  caminho: string;
  keywords: Keyword[];
  titulos: string[];
  descricoes: string[];
  /** Negativas específicas deste grupo (além das listas partilhadas). */
  negativas?: string[];
}

export interface Campanha {
  nome: string;
  /** Orçamento diário em euros. */
  orcamento: number;
  /** Localizações a segmentar, pelos nomes canónicos da Google. */
  geo: string[];
  /**
   * "presenca" — só quem está fisicamente na zona.
   * "interesse" — também quem está noutro sítio mas pesquisa sobre a zona.
   *
   * Nas campanhas nacionais e regionais é PRESENÇA: quem está em Espanha a
   * pesquisar "decoração casamento Lisboa" é quase sempre um curioso, um
   * concorrente ou um agregador, e paga-se o clique na mesma.
   *
   * Nas campanhas internacionais é o CONTRÁRIO, e tem de ser: o casal que
   * queremos está em Londres a pesquisar sobre o Algarve. Segmentar por
   * presença ali seria segmentar exactamente as pessoas erradas.
   */
  modoLocalizacao: "presenca" | "interesse";
  idioma: "pt" | "en";
  grupos: GrupoAnuncios[];
  fase: 1 | 2 | 3;
  /**
   * ORDEM DE ABERTURA QUANDO O DINHEIRO É POUCO. Menor abre primeiro.
   *
   * NÃO é o mesmo que o peso do orçamento, e a diferença é o que este campo
   * existe para corrigir. O peso responde a "onde é que o dinheiro rende mais
   * quando há dinheiro" — e por essa medida o Reino Unido vem à frente, porque
   * o ticket de um destination wedding é várias vezes o de um casamento
   * português.
   *
   * A prioridade responde a outra pergunta: "se só houver dinheiro para UMA,
   * qual delas consegue APRENDER alguma coisa?". A resposta muda, porque um
   * clique britânico em "destination wedding portugal" custa muito mais do que
   * um clique alentejano em "decoração de casamento Évora". Com 50 €/mês, o
   * Reino Unido compra umas duas dezenas de cliques — que não chegam para
   * concluir nada — e o Alentejo compra perto de uma centena.
   *
   * Ordenar pelo peso dava, literalmente, a campanha errada. Ficou preso a um
   * teste.
   */
  prioridade: number;
}

/** URL absoluto de uma landing page. */
export function urlFinal(caminho: string, idioma: "pt" | "en"): string {
  return `${SITE.url}${idioma === "en" ? "/en" : ""}${caminho}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRIATIVOS
// ═══════════════════════════════════════════════════════════════════════════
//
// Tom da marca: contido, editorial, sem exclamações e sem clichés de
// casamento. Nada de "o dia mais feliz da sua vida", "sonho", "mágico",
// "inesquecível" — são o que TODOS os concorrentes escrevem, o que os torna
// invisíveis, e não dizem nada a ninguém.
//
// Limites do Google Ads, verificados em cada título e descrição pelo teste
// `campanhas.test.ts`: título ≤ 30 caracteres, descrição ≤ 90.

/**
 * Títulos comuns a todas as campanhas PT (a marca e as provas).
 *
 * São DEZASSEIS e não oito porque um grupo tem de chegar aos 15 títulos mesmo
 * quando só tem três específicos — foi um defeito real: os grupos nacionais
 * saíam com 11 e a Google aceitava o anúncio à mesma, com menos combinações
 * para testar e sem aviso nenhum.
 */
const TITULOS_BASE_PT = [
  "Líquen Events",
  "Decoração de Casamentos",
  "Design floral e cenografia",
  "Coordenação no dia",
  "Equipa e material próprios",
  "Conceito à medida",
  "Proposta em 48 horas",
  "Desde 2018",
  "Visita técnica ao espaço",
  "Produção em todo o país",
  "Montagem na véspera",
  "Do desenho à desmontagem",
  "Uma equipa, não uma agência",
  "Orçamento sem extras no fim",
  "Flores da época",
  "Pedido em quatro perguntas",
];

const TITULOS_BASE_EN = [
  "Líquen Events",
  "Wedding Design in Portugal",
  "Florals and set design",
  "Day-of coordination",
  "Our own team and stock",
  "Concept made for you",
  "Quote within two days",
  "Designing since 2018",
  "We walk the venue first",
  "Producing nationwide",
  "We set up the day before",
  "From drawing to strike",
  "A team, not an agency",
  "No extras at the end",
  "Flowers in season",
  "Four questions to a proposal",
];

const DESCRICOES_PT = [
  "Conceito, design floral, cenografia e coordenação do dia. Equipa e material próprios.",
  "Do primeiro desenho à última peça a sair. Orçamento claro, sem extras no fim.",
  "Herdades, quintas e espaços privados. Pedido de proposta em quatro perguntas.",
  "Decoração e produção de casamentos em todo o país, com equipa e material próprios.",
];

const DESCRICOES_EN = [
  "Concept, floral design, set design and day-of coordination. Our own team and stock.",
  "From the first drawing to the last piece coming down. Clear quote, no extras at the end.",
  "Estates, quintas and private venues. Request a proposal in four questions.",
  "Wedding design and production across all of Portugal, with our own team and stock.",
];

/**
 * Exactamente quinze títulos, sem repetições, cada um dentro dos 30 caracteres.
 *
 * Existe porque as três coisas falhavam à mão, e falhavam em silêncio: um
 * grupo saiu com 11 títulos, outro com um título repetido (o mesmo "Visita
 * técnica ao espaço" vinha da lista específica E da regional). Nenhuma das
 * duas dá erro na Google — dão menos combinações para ela testar, que é uma
 * perda de desempenho sem sintoma.
 *
 * Os específicos vêm primeiro, e a base preenche o resto. Se ainda assim não
 * chegar a 15, é um erro de programação e não uma escolha editorial — por isso
 * lança.
 */
function quinzeTitulos(especificos: string[], base: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const t of [...especificos, ...base]) {
    const limpo = t.trim();
    if (!limpo || limpo.length > 30 || vistos.has(limpo)) continue;
    vistos.add(limpo);
    out.push(limpo);
    if (out.length === 15) return out;
  }
  throw new Error(
    `só ${out.length} títulos únicos e dentro dos 30 caracteres; são precisos 15. ` +
      "Acrescenta variantes à lista base.",
  );
}

/**
 * Quinze títulos para um grupo regional. Os primeiros NOMEIAM A REGIÃO — é
 * requisito, e é também o que faz o anúncio parecer escrito para quem pesquisou
 * em vez de escrito para toda a gente.
 */
function titulosRegionais(polo: Polo, idioma: "pt" | "en"): string[] {
  const c = idioma === "en" ? polo.en : polo.pt;
  const regiao = c.regiao.replace(/^the /, "");
  const especificos =
    idioma === "en"
      ? [
          `Wedding Design in ${regiao}`.slice(0, 30),
          `${regiao} Wedding Stylist`.slice(0, 30),
          `Weddings across ${regiao}`.slice(0, 30),
          `Florals in ${regiao}`.slice(0, 30),
          `Producing in ${regiao}`.slice(0, 30),
          `Your ${regiao} wedding`.slice(0, 30),
          `English-speaking team`,
        ]
      : [
          `Casamentos ${regiao}`.slice(0, 30),
          `Decoração ${regiao}`.slice(0, 30),
          `Design floral ${regiao}`.slice(0, 30),
          `Produção ${regiao}`.slice(0, 30),
          `O seu casamento ${regiao}`.slice(0, 30),
          `Quintas e herdades`,
          `Visita técnica ao espaço`,
        ];
  const base = idioma === "en" ? TITULOS_BASE_EN : TITULOS_BASE_PT;
  return quinzeTitulos(especificos, base);
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYWORDS
// ═══════════════════════════════════════════════════════════════════════════
//
// Agrupadas por INTENÇÃO, não por tema. É a diferença entre uma conta que sabe
// a quem está a falar e uma que despeja tudo no mesmo grupo:
//
//  (a) Intenção alta e local — já tem data e zona. Converte.
//  (b) Espaços — procura o nome de uma quinta. Está A MONTANTE: ainda não
//      escolheu decoração, e muitas vezes nem sabe que precisa de alguém.
//  (c) Estilos — decide a estética. Ainda mais a montante.
//  (d) Wedding planners — PÚBLICO-ALVO, não concorrente. Um planner que goste
//      do trabalho traz vários casamentos por ano, e o custo de o conquistar é
//      pago uma vez.
//  (e) Internacional em inglês.
//
// Nenhuma keyword em correspondência ampla. Com uma conta sem histórico de
// conversões a ampla não tem sinal nenhum para se guiar e transforma-se numa
// torneira aberta — é exactamente onde as contas novas queimam o orçamento do
// primeiro mês.

/** (a) Intenção alta e local, por cidade do polo. */
function keywordsLocais(polo: Polo, idioma: "pt" | "en"): Keyword[] {
  const out: Keyword[] = [];
  const modelos =
    idioma === "en"
      ? ["wedding designer {c}", "wedding decor {c}", "wedding stylist {c}", "wedding flowers {c}"]
      : [
          "decoração de casamento {c}",
          "decoração casamentos {c}",
          "wedding designer {c}",
          "empresa decoração casamentos {c}",
        ];
  for (const cidade of polo.cidades) {
    for (const m of modelos) {
      out.push({ texto: m.replace("{c}", cidade), correspondencia: "frase" });
    }
  }
  const regiao = (idioma === "en" ? polo.en : polo.pt).regiao.replace(/^the /, "");
  out.push({
    texto: idioma === "en" ? `wedding design ${regiao}` : `decoração de casamento ${regiao}`,
    correspondencia: "exata",
  });
  return out;
}

/** (b) Espaços — o nome da quinta, que é como a pessoa procura nesta fase. */
function keywordsEspacos(polo: Polo): Keyword[] {
  return polo.espacos.flatMap((espaco) => [
    { texto: `casamento ${espaco}`, correspondencia: "frase" as const },
    { texto: `decoração ${espaco}`, correspondencia: "frase" as const },
  ]);
}

// ═══════════════════════════════════════════════════════════════════════════
// AS CAMPANHAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Orçamento diário de um polo, a partir do peso declarado no catálogo.
 *
 * ARREDONDADO PARA CIMA À UNIDADE, e nunca abaixo de um mínimo viável. Uma
 * campanha com 3 €/dia num mercado onde o clique custa 1 € não é uma campanha
 * pequena — é uma campanha que nunca junta dados suficientes para se saber se
 * funciona, e por isso é dinheiro integralmente desperdiçado. Mais vale menos
 * campanhas a sério (é o que a Fase 6 propõe) do que oito a fingir.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MÍNIMO VIÁVEL POR CAMPANHA — e porque é 40 €/mês e não um número redondo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma campanha não serve para gastar dinheiro: serve para RESPONDER a uma
 * pergunta ("esta região compra?"). Para responder é preciso um número mínimo
 * de cliques, e abaixo desse número a campanha não é pequena — é inútil, e o
 * dinheiro é integralmente desperdiçado em vez de parcialmente.
 *
 * A conta: para decidir seja o que for sobre um conjunto de keywords são
 * precisos da ordem de 40 a 80 cliques. Num mercado português de casamentos,
 * em correspondência de frase e exacta, um clique anda tipicamente entre 0,40 €
 * e 1,00 € — números que ELA vai confirmar com os dados reais dela ao fim do
 * primeiro mês, e que aqui servem só para dimensionar. A 0,60 € o clique,
 * 40 €/mês compram cerca de 65 cliques. É o suficiente para uma resposta
 * grosseira; metade disso não é suficiente para nada.
 *
 * ESTE NÚMERO É O QUE DECIDE QUANTAS CAMPANHAS CABEM. Não é uma preferência
 * estética: é a razão pela qual um orçamento de 50 €/mês compra UMA campanha e
 * não oito, por muito que oito pareça mais ambicioso.
 */
export const MINIMO_MENSAL_POR_CAMPANHA = 40;

/** Dias por mês que a Google usa para converter orçamento diário em mensal. */
export const DIAS_POR_MES = 30.4;

/**
 * Quantas campanhas é que um orçamento mensal sustenta de facto.
 *
 * Nunca menos de uma: se o orçamento não chegar sequer para uma campanha
 * viável, a resposta certa não é gerar zero campanhas (não ajuda ninguém) — é
 * gerar uma e dizer com todas as letras que está subfinanciada, que é o que
 * `PlanoDeOrcamento.abaixoDoViavel` faz.
 */
/**
 * Nível CONFORTÁVEL por campanha. Ver `campanhasQueCabem` para a razão.
 */
export const CONFORTAVEL_MENSAL_POR_CAMPANHA = 2 * MINIMO_MENSAL_POR_CAMPANHA;

export function campanhasQueCabem(mensal: number): number {
  // Abre-se uma campanha nova quando há dinheiro para a financiar ao nível
  // CONFORTÁVEL, não ao mínimo.
  //
  // A primeira versão usava o mínimo, e a consequência apareceu logo nos
  // números: com 500 €/mês abria DOZE campanhas, todas a 40 €/mês, ou seja
  // todas no limiar de não conseguirem concluir nada. Tecnicamente cada uma
  // "cabia"; na prática era o espalhar fino contra o qual todo este plano
  // avisa, produzido pelo próprio repartidor.
  //
  // O dobro do mínimo é o que permite a uma campanha fazer mais do que uma
  // resposta grosseira: chega para podar keywords, deixar a Google testar
  // combinações de títulos, e ainda assim manter volume. Com 500 €/mês passam
  // a ser seis campanhas com 83 €/mês cada — seis respostas fiáveis em vez de
  // doze dúvidas.
  return Math.max(1, Math.floor(mensal / CONFORTAVEL_MENSAL_POR_CAMPANHA));
}

/**
 * Mínimo diário equivalente. Mantido em dias porque é a unidade em que a
 * Google recebe o orçamento, mas a decisão faz-se ao mês — é assim que ela
 * pensa no dinheiro e é assim que a fatura chega.
 */
export const ORCAMENTO_MINIMO_DIARIO = MINIMO_MENSAL_POR_CAMPANHA / DIAS_POR_MES;

export function orcamentoDoPolo(polo: Polo, totalDiario: number): number {
  return Math.max(ORCAMENTO_MINIMO_DIARIO, Math.ceil((totalDiario * polo.peso) / 100));
}

/**
 * Ordem de abertura dos polos quando o dinheiro é escasso.
 *
 * Alentejo primeiro por três razões que se somam: é onde a equipa vive (custo
 * de deslocação zero, logo margem melhor), é o mercado com os cliques mais
 * baratos dos oito (menos concorrentes a licitar), e é onde a Líquen já tem
 * presença local reconhecida — Perfil de Empresa Google com avaliação real, o
 * que ajuda o Índice de Qualidade e a taxa de cliques.
 *
 * Lisboa a seguir por ser o maior mercado doméstico ainda ao alcance de uma
 * deslocação de carro no próprio dia.
 */
const PRIORIDADE_POLO: Record<string, number> = {
  // O Alentejo primeiro por duas razões que se somam: é dos mercados com os
  // cliques mais baratos dos treze (menos concorrentes dedicados a licitar) e
  // é onde a Líquen já tem presença local reconhecida, com Perfil de Empresa
  // Google e avaliação real, o que ajuda o Índice de Qualidade e a taxa de
  // cliques desde o primeiro dia.
  alentejo: 1,
  // Lisboa a seguir: maior mercado doméstico do país.
  lisboa: 2,
  // A Comporta salta à frente de mercados maiores porque o ticket médio é
  // muito superior e a concorrência dedicada é pequena. Poucos cliques bons
  // valem mais do que muitos cliques medianos.
  comporta: 4,
  algarve: 5,
  "porto-douro": 6,
  oeste: 8,
  minho: 9,
  centro: 10,
  ribatejo: 11,
  madeira: 12,
  "beira-interior": 16,
  "tras-os-montes": 17,
  acores: 18,
};

/** As campanhas regionais, uma por polo. */
export function campanhasRegionais(totalDiario: number): Campanha[] {
  return POLOS.map((polo) => {
    const c = polo.pt;
    const grupos: GrupoAnuncios[] = [
      {
        nome: `${polo.slug} · intenção local`,
        caminho: caminhoPolo(polo.slug),
        keywords: keywordsLocais(polo, "pt"),
        titulos: titulosRegionais(polo, "pt"),
        descricoes: DESCRICOES_PT,
      },
    ];
    if (polo.espacos.length > 0) {
      grupos.push({
        nome: `${polo.slug} · espaços`,
        caminho: caminhoPolo(polo.slug),
        keywords: keywordsEspacos(polo),
        // Quem procura o nome de uma quinta ainda não anda à procura de
        // decoração. O anúncio tem de falar do ESPAÇO primeiro, senão parece
        // que respondeu a outra pergunta.
        titulos: quinzeTitulos(
          [
            `Casar ${c.regiao}`.slice(0, 30),
            "Já tem o espaço escolhido?",
            "Decoração para o seu espaço",
            ...titulosRegionais(polo, "pt"),
          ],
          TITULOS_BASE_PT,
        ),
        descricoes: DESCRICOES_PT,
      });
    }
    return {
      nome: `PT · ${polo.slug}`,
      orcamento: orcamentoDoPolo(polo, totalDiario),
      geo: polo.geo,
      modoLocalizacao: "presenca" as const,
      idioma: "pt" as const,
      grupos,
      fase: polo.fase,
      prioridade: PRIORIDADE_POLO[polo.slug] ?? 12,
    };
  });
}

/**
 * (c) A campanha nacional dos termos genéricos SEM cidade.
 *
 * Categoria própria, e não misturada nos polos, porque são os termos de maior
 * volume e os mais caros do mercado: dentro de uma campanha regional comeriam
 * o orçamento dessa região em poucas horas, e o polo ficaria sem verba para as
 * pesquisas locais que são as que realmente convertem.
 */
export function campanhaNacional(totalDiario: number): Campanha {
  return {
    nome: "PT · nacional genérico",
    orcamento: Math.max(ORCAMENTO_MINIMO_DIARIO, Math.ceil(totalDiario * 0.15)),
    geo: ["Portugal"],
    modoLocalizacao: "presenca",
    idioma: "pt",
    fase: 1,
    // Depois das duas regionais: os termos nacionais genéricos são os mais
    // caros do mercado e os que menos convertem por clique, porque metade de
    // quem os pesquisa ainda não sabe o que quer.
    prioridade: 4,
    grupos: [
      {
        nome: "nacional · decoração",
        caminho: "/servicos/casamentos",
        keywords: [
          { texto: "decoração de casamento", correspondencia: "exata" },
          { texto: "decoração de casamentos", correspondencia: "exata" },
          { texto: "empresa de decoração de casamentos", correspondencia: "frase" },
          { texto: "decoradora de casamentos", correspondencia: "frase" },
          { texto: "design floral casamento", correspondencia: "frase" },
        ],
        titulos: quinzeTitulos(
          ["Decoração de Casamentos", "Conceito, flores, cenografia"],
          TITULOS_BASE_PT,
        ),
        descricoes: DESCRICOES_PT,
      },
      {
        nome: "nacional · produção",
        caminho: "/servicos/casamentos",
        keywords: [
          { texto: "produção de casamentos", correspondencia: "exata" },
          { texto: "wedding design portugal", correspondencia: "frase" },
          { texto: "wedding designer portugal", correspondencia: "frase" },
          { texto: "cenografia casamento", correspondencia: "frase" },
        ],
        titulos: quinzeTitulos(
          ["Produção de Casamentos", "Wedding design em Portugal"],
          TITULOS_BASE_PT,
        ),
        descricoes: DESCRICOES_PT,
      },
      {
        // (d) Wedding planners como PÚBLICO, não como concorrente.
        nome: "nacional · wedding planners",
        caminho: "/servicos/casamentos",
        keywords: [
          { texto: "decoração para wedding planners", correspondencia: "frase" },
          { texto: "parceiro decoração casamentos", correspondencia: "frase" },
          { texto: "fornecedor decoração casamentos", correspondencia: "frase" },
          { texto: "empresa cenografia eventos", correspondencia: "frase" },
        ],
        titulos: quinzeTitulos(
          [
            "Parceiro de decoração",
            "Para wedding planners",
            "Equipa que entrega a horas",
            "Material próprio em stock",
          ],
          TITULOS_BASE_PT,
        ),
        descricoes: [
          "Fornecedor de decoração e cenografia para planners. Equipa e stock próprios.",
          "Do conceito à desmontagem. Prazos cumpridos e uma pessoa responsável no dia.",
          ...DESCRICOES_PT.slice(0, 2),
        ],
      },
      {
        nome: "nacional · estilos",
        caminho: `/casamentos/estilo/${ESTILOS[0].slug}`,
        keywords: ESTILOS.flatMap((e) => [
          { texto: `casamento ${e.pt.nome.toLowerCase()}`, correspondencia: "frase" as const },
          {
            texto: `decoração casamento ${e.pt.nome.toLowerCase()}`,
            correspondencia: "frase" as const,
          },
        ]),
        titulos: quinzeTitulos(
          ["Casamentos minimalistas", "Casamentos boho", "Casamentos no campo"],
          TITULOS_BASE_PT,
        ),
        descricoes: DESCRICOES_PT,
      },
    ],
  };
}

/**
 * (e) As campanhas em inglês, uma POR PAÍS DE ORIGEM.
 *
 * Portugal inteiro como DESTINO, o país de origem como segmentação. É o
 * inverso das campanhas PT, e tem de ser: o casal que interessa está em
 * Londres, em Dublin ou em São Paulo a pesquisar sobre Portugal.
 *
 * Um país por campanha porque o custo por clique, a moeda mental do orçamento
 * e a sazonalidade são muito diferentes entre eles — juntar Reino Unido e
 * Brasil na mesma campanha faria o orçamento fugir para o mais barato dos dois
 * sem que isso significasse que é o melhor.
 *
 * PT e EN nunca na mesma campanha: idiomas diferentes, páginas de destino
 * diferentes, e relatórios que só são legíveis se estiverem separados.
 */
export const PAISES_INTERNACIONAIS = [
  // Reino Unido e Irlanda são a fase 1 do lado internacional: são, segundo o
  // Turismo de Portugal, os dois mercados que lideram os casamentos de
  // estrangeiros em Portugal, e são também aqueles onde a barreira de língua é
  // zero — o site inglês já existe e não precisa de mais nada.
  { nome: "Reino Unido", geo: "United Kingdom", peso: 30, fase: 1, prioridade: 3 },
  { nome: "Irlanda", geo: "Ireland", peso: 12, fase: 1, prioridade: 7 },
  // Estados Unidos e Brasil trazem ticket alto mas fuso horário e ciclo de
  // decisão diferentes; entram quando houver quem responda a horas.
  { nome: "Estados Unidos", geo: "United States", peso: 22, fase: 2, prioridade: 12 },
  { nome: "Brasil", geo: "Brazil", peso: 14, fase: 2, prioridade: 13 },
  // França e Alemanha pesquisam maioritariamente na própria língua. Entram por
  // último, e provavelmente vão exigir anúncios em francês e alemão para
  // renderem — o que é trabalho a mais do que traduzir o site.
  { nome: "França", geo: "France", peso: 11, fase: 3, prioridade: 14 },
  { nome: "Alemanha", geo: "Germany", peso: 11, fase: 3, prioridade: 15 },
] as const;

export function campanhasInternacionais(totalDiario: number): Campanha[] {
  return PAISES_INTERNACIONAIS.map((pais) => ({
    nome: `EN · ${pais.nome}`,
    orcamento: Math.max(ORCAMENTO_MINIMO_DIARIO, Math.ceil((totalDiario * pais.peso) / 100)),
    geo: [pais.geo],
    // O contrário das campanhas PT — ver a nota em `modoLocalizacao`.
    modoLocalizacao: "interesse" as const,
    idioma: "en" as const,
    fase: pais.fase,
    // O Reino Unido é o terceiro a abrir: maior ticket da conta, mas cliques
    // caros — precisa de orçamento a sério para dizer alguma coisa.
    prioridade: pais.prioridade,
    grupos: [
      {
        nome: `${pais.nome} · destination`,
        caminho: "/casamentos/destination",
        keywords: [
          { texto: "destination wedding portugal", correspondencia: "frase" },
          { texto: "wedding decor portugal", correspondencia: "frase" },
          { texto: "portugal wedding styling", correspondencia: "frase" },
          { texto: "wedding designer portugal", correspondencia: "frase" },
          { texto: "wedding florist portugal", correspondencia: "frase" },
          { texto: "getting married in portugal", correspondencia: "frase" },
        ],
        titulos: quinzeTitulos(
          [
            "Destination weddings",
            "Planned from where you live",
            "Everything in English",
            "One team on the ground",
            "Travel is in the quote",
          ],
          TITULOS_BASE_EN,
        ),
        descricoes: DESCRICOES_EN,
      },
      {
        nome: `${pais.nome} · regiões`,
        caminho: "/casamentos/destination",
        keywords: POLOS.filter((p) => p.fase <= 2).flatMap((p) => {
          const regiao = p.en.regiao.replace(/^the /, "").toLowerCase();
          return [
            { texto: `wedding ${regiao} portugal`, correspondencia: "frase" as const },
            { texto: `${regiao} wedding designer`, correspondencia: "frase" as const },
          ];
        }),
        titulos: quinzeTitulos(
          ["Algarve, Alentejo, Douro", "Weddings across Portugal", "We know the venues"],
          TITULOS_BASE_EN,
        ),
        descricoes: DESCRICOES_EN,
      },
    ],
  }));
}

/** Todas as campanhas, para um orçamento diário total em euros. */
export function todasAsCampanhas(totalDiario: number): Campanha[] {
  return [
    ...campanhasRegionais(totalDiario),
    campanhaNacional(totalDiario),
    ...campanhasInternacionais(totalDiario),
  ];
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PLANO DE UMA FASE — e a razão de esta função existir
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A primeira versão deste módulo gerava sempre as quinze campanhas e repartia
 * o orçamento pelos pesos. Ao correr o gerador com 60 €/dia, a soma dos
 * orçamentos deu 155 €. Não foi um erro de aritmética: é o piso de
 * ORCAMENTO_MINIMO_DIARIO multiplicado por quinze campanhas. O gerador estava
 * a produzir, em silêncio, um plano que gastava duas vezes e meia o que lhe
 * tinham pedido.
 *
 * A correcção não é baixar o piso — abaixo dele uma campanha não junta dados
 * suficientes para se saber se funciona, e passa a ser desperdício integral. A
 * correcção é a que a Fase 6 já dizia por palavras e o código contradizia:
 * NÃO SE ABREM QUINZE CAMPANHAS AO MESMO TEMPO.
 *
 * Esta função devolve só as campanhas até à fase pedida, reparte o orçamento
 * entre ELAS (e não entre as quinze), e devolve também o aviso quando o piso
 * obriga a soma a passar do pedido — em vez de o esconder.
 */
export interface PlanoDeOrcamento {
  campanhas: Campanha[];
  /** Orçamento mensal pedido, em euros. */
  mensalPedido: number;
  /** Soma dos orçamentos mensais efectivamente atribuídos. */
  mensalAtribuido: number;
  /** Quantas campanhas o orçamento sustenta a sério. */
  cabem: number;
  /** Quantas campanhas a fase pedida teria aberto se houvesse dinheiro. */
  pedidas: number;
  /**
   * Verdadeiro quando NEM UMA campanha atinge o mínimo viável. Não é um aviso
   * cosmético: significa que este orçamento não chega para responder a nenhuma
   * pergunta, e que a decisão honesta é juntar dois ou três meses de verba num
   * só mês de campanha em vez de a espalhar por todos.
   */
  abaixoDoViavel: boolean;
}

/**
 * Custo por clique de referência, em euros, para dimensionar o plano.
 *
 * NÃO é um dado medido — é uma referência de trabalho para o mercado português
 * de casamentos em correspondência de frase e exacta. O número real dela sai do
 * primeiro mês de dados e está no procedimento de /ads-output/rotina.md. Está
 * aqui, com nome e comentário, precisamente para não andar escondido dentro de
 * uma fórmula a fingir que é facto.
 */
export const CPC_REFERENCIA = 0.6;

/**
 * Corta o número de keywords ao que o orçamento consegue efectivamente testar.
 *
 * A CONTA: com 50 €/mês e um clique a 0,60 €, compram-se ~83 cliques. Espalhar
 * 83 cliques por 47 keywords dá uma média de menos de dois cliques cada — e com
 * menos de meia dúzia de cliques não se pode dizer NADA sobre uma keyword: nem
 * que é boa, nem que é má. O relatório fica cheio de linhas com "0 conversões"
 * que parecem um veredicto e são apenas ausência de dados.
 *
 * Mantém-se pelo menos seis cliques esperados por keyword. A ordem de origem é
 * significativa (a primeira cidade de cada polo é a mais importante — Évora no
 * Alentejo), por isso corta-se pelo fim e não ao acaso.
 *
 * Isto é o oposto do instinto: parece que mais keywords é mais alcance. Com
 * orçamento pequeno, mais keywords é menos conhecimento.
 */
const CLIQUES_MINIMOS_POR_KEYWORD = 6;

function podarKeywords(grupos: GrupoAnuncios[], mensalDaCampanha: number): GrupoAnuncios[] {
  const cliquesEsperados = mensalDaCampanha / CPC_REFERENCIA;
  const maximo = Math.max(1, Math.floor(cliquesEsperados / CLIQUES_MINIMOS_POR_KEYWORD));
  const total = grupos.reduce((s, g) => s + g.keywords.length, 0);
  if (total <= maximo) return grupos;

  // Repartir o tecto pelos grupos na proporção do que cada um traz, com pelo
  // menos uma keyword por grupo — um grupo sem keywords não serve anúncios e
  // ficaria como um grupo vazio na conta, que é confuso de ler.
  return grupos.map((g) => {
    const quota = Math.max(1, Math.round((maximo * g.keywords.length) / total));
    return { ...g, keywords: g.keywords.slice(0, quota) };
  });
}

/**
 * O plano que um orçamento MENSAL sustenta.
 *
 * Repare-se no que esta função NÃO faz: não reparte o orçamento por todas as
 * campanhas da fase. Corta a lista pelo número que cabe, e só depois reparte.
 * A diferença é tudo — repartir 50 € por cinco campanhas dá cinco campanhas
 * mortas, e o relatório ao fim do mês não distingue "esta região não compra"
 * de "esta região nunca foi testada".
 */
export function planoParaOrcamento(mensal: number, ateFase: 1 | 2 | 3): PlanoDeOrcamento {
  // Usa-se um total nominal só para obter os PESOS relativos; o dinheiro real
  // é atribuído abaixo.
  const todas = todasAsCampanhas(1000);
  const daFase = todas.filter((c) => c.fase <= ateFase);
  const cabem = campanhasQueCabem(mensal);

  // Ordenar por PRIORIDADE DE ARRANQUE e ficar com as que cabem. Ver a nota em
  // `Campanha.prioridade`: ordenar pelo peso do orçamento escolhia a campanha
  // errada quando só havia dinheiro para uma.
  const escolhidas = [...daFase].sort((a, b) => a.prioridade - b.prioridade).slice(0, cabem);

  // Repartição em duas passagens: primeiro o PISO a cada uma, e só o que sobra
  // é que se reparte pelo peso. A repartição puramente proporcional deixava a
  // campanha mais pequena abaixo do mínimo viável (medido: com 120 €/mês, a
  // terceira campanha ficava com 38 € quando o piso são 40) — ou seja, o
  // próprio repartidor produzia a campanha morta que o piso existe para
  // impedir.
  const piso = Math.min(MINIMO_MENSAL_POR_CAMPANHA, mensal / escolhidas.length);
  const sobra = Math.max(0, mensal - piso * escolhidas.length);
  const pesoTotal = escolhidas.reduce((s, c) => s + c.orcamento, 0);
  const campanhas = escolhidas.map((c) => {
    const mensalDesta = piso + (sobra * c.orcamento) / pesoTotal;
    return {
      ...c,
      orcamento: Math.round((mensalDesta / DIAS_POR_MES) * 100) / 100,
      grupos: podarKeywords(c.grupos, mensalDesta),
    };
  });

  const mensalAtribuido =
    Math.round(campanhas.reduce((s, c) => s + c.orcamento * DIAS_POR_MES, 0) * 100) / 100;

  return {
    campanhas,
    mensalPedido: mensal,
    mensalAtribuido,
    cabem,
    pedidas: daFase.length,
    abaixoDoViavel: mensal < MINIMO_MENSAL_POR_CAMPANHA,
  };
}
