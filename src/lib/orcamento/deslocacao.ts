import { BASE_OMISSAO, kmEntre, localizar } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DESLOCAÇÃO, CALCULADA A PARTIR DOS QUILÓMETROS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A casa parte de um sítio e os casamentos são no país inteiro. O valor da
 * deslocação não é uma tabela de preços: é o custo de lá chegar, e esse depende
 * do que a carrinha gasta e de quantos quilómetros faz.
 *
 *     quilómetros × preço por quilómetro
 *
 * ── DE ONDE VÊM OS QUILÓMETROS ─────────────────────────────────────────────
 * De duas fontes, e a ordem entre elas é a decisão central deste módulo:
 *
 *   1. DO QUE ELA ESCREVEU. Se houver um número de quilómetros escrito na
 *      proposta, é esse que vale — sem discussão, e mesmo que o sítio não
 *      esteja em tabela nenhuma. É assim que a conta passa a funcionar para
 *      QUALQUER sítio do país, e não só para as cem terras que conhecemos.
 *   2. DA TABELA (`@/lib/geo/portugal`), como SUGESTÃO, quando ela ainda não
 *      escreveu nada e o sítio é reconhecido.
 *
 * Uma distância que ela pode escrever e corrigir vale mais do que uma
 * adivinhada a partir do centro de uma vila: quem faz a estrada é ela. E a
 * ordem é a que permite ao ecrã oferecer um número já preenchido sem nunca lhe
 * passar por cima.
 *
 * Não se contratou serviço de mapas nenhum, pela razão escrita no cabeçalho da
 * geografia: uma chave de API a gerir, uma chamada de rede no meio de escrever
 * uma proposta, e a morada de cada cliente a sair para um terceiro — para
 * ganhar uma dezena de quilómetros de precisão num número que ela pode
 * simplesmente escrever.
 *
 * ── DE ONDE VEM O PREÇO POR QUILÓMETRO ─────────────────────────────────────
 * De três parcelas somadas, e é assim porque é assim que se explica ao cliente
 * quando ele pergunta:
 *
 *   • COMBUSTÍVEL — o consumo da carrinha vezes o preço do litro. É a parcela
 *     que muda sozinha: o gasóleo sobe e desce, e o número que aqui está tem
 *     de poder ser mudado num campo, não numa linha de código.
 *   • PORTAGENS — quase toda a viagem longa em Portugal é auto-estrada.
 *   • DESGASTE — pneus, revisões, o valor que a carrinha perde por andar. Não
 *     se sente no dia, paga-se na oficina.
 *
 * Deixá-las separadas é o que permite responder "porquê 92 €?" com a conta em
 * vez de com um encolher de ombros. Somadas dão um valor por quilómetro da
 * ordem do das tabelas de quilometragem, mas construído com os números dela.
 *
 * ── IDA E VOLTA ────────────────────────────────────────────────────────────
 * A carrinha vai e vem. Cobrar só a ida era pagar metade do gasóleo do bolso
 * da empresa em todos os casamentos fora de Évora — decisão dela, e é o que
 * `idaEVolta` diz.
 *
 * ── E QUANTAS CARRINHAS VÃO ────────────────────────────────────────────────
 * Palavras dela: «nós temos duas carrinhas para os eventos. ou seja se forem
 * duas ou se forem uma ou mais carrinhas».
 *
 * Esta conta assumia UMA. Num evento em que saem as duas, o gasóleo, as
 * portagens e o desgaste são a dobrar — e a proposta cobrava metade, com a
 * diferença a sair do bolso da empresa. É o mesmo defeito que o `idaEVolta`
 * fechou, noutro eixo.
 *
 * É um facto de CADA evento e não uma regra da casa: às vezes vai uma, às
 * vezes vão as duas, e um dia podem ser três com uma alugada. Por isso entra
 * pelas `opts` (ao lado dos quilómetros escritos) e não pelos parâmetros.
 *
 * A OMISSÃO É UMA, e é uma decisão: nenhuma proposta antiga muda de preço por
 * causa desta alteração. Quem quiser as duas di-lo em cada proposta, e vê-o
 * escrito na fórmula.
 *
 * A isenção à volta de casa não se multiplica por carrinhas: é uma promessa
 * sobre a DISTÂNCIA feita ao cliente local, e continua a valer com uma ou com
 * três.
 *
 * ── A ISENÇÃO À VOLTA DE CASA ──────────────────────────────────────────────
 * Continua a valer: é o que as condições gerais prometem por escrito, e mexer
 * nela muda o que um cliente local paga. Aqui traduz-se em quilómetros — a 40
 * km da sede ainda se está dentro do distrito em quase todas as direções. A
 * franquia é à volta da BASE, seja ela qual for: mudar a casa de terra muda
 * também quem é «cliente local».
 *
 * ── O QUE ISTO NÃO DECIDE ──────────────────────────────────────────────────
 * O alojamento. Dormir fora depende da hora a que acaba a festa e de quando é
 * a montagem, e nenhuma dessas coisas está nos quilómetros. As condições
 * cobrem-no em texto; aqui só se assinala que, a esta distância, é provável.
 */

export interface ParametrosDeslocacao {
  /**
   * O local da SEDE — de onde a carrinha parte.
   *
   * Texto, como o campo do local de qualquer pedido, e lido pelo mesmo
   * `localizar`: "Évora", "evora" e "  ÉVORA " são a mesma terra. Uma base que
   * a tabela de geografia não conheça é legítima — só quer dizer que não há
   * sugestão de quilómetros, e que eles se escrevem à mão em cada proposta.
   */
  base: string;
  /** Litros por 100 km da carrinha. */
  consumoLPor100Km: number;
  /** Euros por litro de combustível. */
  precoLitro: number;
  /** Euros de portagem por quilómetro. */
  portagensPorKm: number;
  /** Euros de desgaste por quilómetro (pneus, revisões, depreciação). */
  desgastePorKm: number;
  /** Até esta distância não se cobra deslocação (a isenção do distrito). */
  franquiaKm: number;
  /** A carrinha vai e volta? */
  idaEVolta: boolean;
}

/**
 * Os valores de partida. São UM PONTO DE PARTIDA, não uma verdade: o preço do
 * gasóleo muda todos os meses e o consumo é o da carrinha dela, que ninguém
 * mediu daqui. Ficam todos editáveis.
 */
export const PARAMETROS_OMISSAO: ParametrosDeslocacao = {
  base: BASE_OMISSAO,
  consumoLPor100Km: 9,
  precoLitro: 1.65,
  portagensPorKm: 0.09,
  desgastePorKm: 0.1,
  franquiaKm: 40,
  idaEVolta: true,
};

/** A partir de que distância é preciso contar com dormir fora. */
export const KM_PARA_DORMIR_FORA = 200;

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * Quanto custa cada quilómetro, parcela a parcela.
 *
 * Pede só as parcelas do custo, e não os parâmetros todos: a sede e a franquia
 * não entram nesta conta, e exigi-las obrigava quem só quer saber o preço do
 * quilómetro a inventar uma terra para lho poder perguntar.
 */
export function custoPorKm(
  p: Pick<
    ParametrosDeslocacao,
    "consumoLPor100Km" | "precoLitro" | "portagensPorKm" | "desgastePorKm"
  >,
): {
  combustivel: number;
  portagens: number;
  desgaste: number;
  total: number;
} {
  const combustivel = (Math.max(0, p.consumoLPor100Km) / 100) * Math.max(0, p.precoLitro);
  const portagens = Math.max(0, p.portagensPorKm);
  const desgaste = Math.max(0, p.desgastePorKm);
  return {
    combustivel: cent(combustivel),
    portagens: cent(portagens),
    desgaste: cent(desgaste),
    // O total NÃO é a soma dos três já arredondados: arredondar três vezes e
    // somar dava um cêntimo a mais ou a menos por quilómetro, que a 300 km são
    // três euros a sair do nada.
    total: cent(combustivel + portagens + desgaste),
  };
}

export interface SugestaoDeslocacao {
  /** Distância da base ao local, num sentido. */
  kmSoIda: number;
  /** Os quilómetros que se cobram (o dobro, com ida e volta). */
  kmCobrados: number;
  custoKm: ReturnType<typeof custoPorKm>;
  /** Quantas carrinhas fazem a viagem. Uma, salvo dito ao contrário. */
  carrinhas: number;
  /** O valor a cobrar, em euros, arredondado ao euro. */
  valor: number;
  /** Caiu dentro da isenção — o valor é zero por regra, não por engano. */
  isento: boolean;
  /** A esta distância, é de esperar que a equipa tenha de pernoitar. */
  provavelAlojamento: boolean;
  /** A distância veio de uma região inteira e não de uma morada. */
  aproximado: boolean;
  /**
   * Quem deu os quilómetros: ela (`escritos`) ou a tabela (`tabela`).
   *
   * O ecrã precisa de os distinguir para pôr o `≈` só onde ele é verdade. Um
   * número que ela mediu não leva «aproximadamente» à frente; um que saiu de
   * coordenadas do centro de uma vila leva sempre.
   */
  origemDosKm: "escritos" | "tabela";
  /** A conta escrita, para aparecer ao lado do número. */
  formula: string;
}

/**
 * Os quilómetros escritos, se o que veio for mesmo uma distância.
 *
 * Um campo a meio de ser escrito dá `NaN`, um sinal trocado dá negativo, e uma
 * divisão infeliz dá `Infinity`. Nenhum deles é um número de quilómetros, e
 * nenhum deles pode entrar numa multiplicação que acaba num preço. Quando não
 * serve devolve `null`, e quem chama volta ao que sabia — a tabela.
 */
function kmEscritos(km: number | null | undefined): number | null {
  if (typeof km !== "number" || !Number.isFinite(km) || km < 0) return null;
  return km;
}

/**
 * Quantas carrinhas fazem esta viagem — pelo menos uma, e sempre inteiras.
 *
 * Meia carrinha não existe, e um campo a meio de ser escrito dá `NaN`. Tudo o
 * que não seja um número de carrinhas conta como UMA: é a resposta que não
 * muda o preço de nada, e este número entra numa multiplicação que acaba na
 * proposta de um cliente.
 */
function quantasCarrinhas(n: number | null | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

/**
 * Os quilómetros que a tabela sugere para este destino, a partir desta base.
 *
 * `null` quando não sabe — e "não sabe" é a resposta certa para um destino que
 * não está na tabela, para uma base que também não está, e para uma viagem que
 * cruza mar. É esta função que enche o campo dos quilómetros na primeira vez;
 * a partir daí manda o que lá estiver escrito.
 */
export function kmSugerido(
  local: string | null | undefined,
  base: string = BASE_OMISSAO,
): number | null {
  return kmEntre(base, local);
}

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    useGrouping: "always",
    style: "currency",
    currency: "EUR",
  }).format(n);

/**
 * Quanto cobrar para ir a este sítio.
 *
 * `null` quando não há quilómetros — nem escritos por ela, nem sugeridos pela
 * tabela. Nesse caso NÃO se sugere zero: uma proposta com deslocação a zero
 * para um casamento no Gerês é dinheiro perdido com a assinatura dela em baixo.
 *
 * `opts.km` são os quilómetros ESCRITOS na proposta, e ganham sempre à tabela —
 * é o que faz esta conta valer para qualquer sítio do país. São também a
 * âncora que impede uma proposta antiga de mudar de preço sozinha: com o número
 * gravado no documento, mexer na base ou na tabela deixa de lhe tocar.
 */
export function sugerirDeslocacao(
  local: string | null | undefined,
  parametros: Partial<ParametrosDeslocacao> = {},
  opts: { aproximado?: boolean; km?: number | null; carrinhas?: number | null } = {},
): SugestaoDeslocacao | null {
  const p: ParametrosDeslocacao = { ...PARAMETROS_OMISSAO, ...parametros };

  const escritos = kmEscritos(opts.km);
  // `??` e não `||`: zero quilómetros é o evento na própria casa, uma resposta
  // legítima, e um `||` trocava-a silenciosamente pela sugestão da tabela.
  const kmSoIda = escritos ?? kmSugerido(local, p.base);
  if (kmSoIda === null) return null;
  const origemDosKm = escritos === null ? "tabela" : "escritos";

  const custoKm = custoPorKm(p);
  const carrinhas = quantasCarrinhas(opts.carrinhas);
  const isento = kmSoIda <= Math.max(0, p.franquiaKm);
  const kmCobrados = isento ? 0 : kmSoIda * (p.idaEVolta ? 2 : 1);
  /* Os quilómetros COBRADOS ficam os do percurso — é a distância ao sítio, e
     não muda por irem duas carrinhas. O que multiplica é o CUSTO: cada
     carrinha gasta o seu gasóleo, paga a sua portagem e desgasta-se. Manter os
     km como estão é o que deixa a fórmula legível: «300 km × 2 × 0,33 €/km ×
     2 carrinhas» lê-se; «600 km» com duas carrinhas seria um número que
     ninguém percorreu. */
  const exacto = kmCobrados * custoKm.total * carrinhas;
  const valor = Math.round(exacto);
  /* Achado n.º 22: «105 km × 2 × 0,34 €/km» dá 71,40 € e o ecrã dizia 71,00 €
     — o valor é arredondado ao euro de propósito, mas a fórmula não o dizia e
     lia-se como uma conta errada. Diz-se quando o arredondamento mexeu. */
  const arredondado = Math.abs(exacto - valor) >= 0.005;

  /**
   * «Aproximado» é o que o ecrã usa para pôr (ou não) o `≈`. Um número escrito
   * por ela nunca é aproximado; um que saiu da tabela é-o sempre que o texto
   * do local era uma REGIÃO inteira ("Alentejo") e não uma terra — aí o ponto
   * medido é o centro de um distrito, não o sítio do casamento.
   */
  const aproximado =
    opts.aproximado ?? (origemDosKm === "tabela" && localizar(local)?.aproximado === true);

  return {
    kmSoIda,
    kmCobrados,
    custoKm,
    carrinhas,
    valor,
    isento,
    provavelAlojamento: kmSoIda >= KM_PARA_DORMIR_FORA,
    aproximado: Boolean(aproximado),
    origemDosKm,
    /* A fórmula é o que responde a «porquê este valor?», portanto as
       carrinhas aparecem nela — mas só quando são mais do que uma. Escrever
       «× 1 carrinha» em todas as propostas era ruído numa linha que existe
       para ser lida de relance. */
    formula: isento
      ? `${kmSoIda} km — dentro dos ${p.franquiaKm} km sem deslocação a cobrar`
      : `${kmSoIda} km ${p.idaEVolta ? "× 2 (ida e volta) " : ""}× ${eur(custoKm.total)}/km` +
        (carrinhas > 1 ? ` × ${carrinhas} carrinhas` : "") +
        (arredondado ? ` = ${eur(cent(exacto))}, arredondado ao euro` : ""),
  };
}

/** A conta por extenso, parcela a parcela — para responder a "porquê este valor?". */
export function explicarCustoKm(p: ParametrosDeslocacao = PARAMETROS_OMISSAO): string {
  const c = custoPorKm(p);
  return [
    `combustível ${eur(c.combustivel)} (${p.consumoLPor100Km} l/100 km a ${eur(p.precoLitro)}/l)`,
    `portagens ${eur(c.portagens)}`,
    `desgaste ${eur(c.desgaste)}`,
  ].join(" + ");
}

/** O texto da linha, como entra nos valores adicionais da proposta. */
export function rotuloDeslocacao(s: SugestaoDeslocacao): { label: string; valueText: string } {
  return {
    label: "Deslocação",
    valueText: `${new Intl.NumberFormat("pt-PT", {
      useGrouping: "always",
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
    }).format(s.valor)} + IVA`,
  };
}
